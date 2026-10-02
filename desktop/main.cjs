const {app,BrowserWindow,ipcMain,dialog,Menu,shell,safeStorage,protocol,net}=require('electron');
const fs=require('node:fs'),path=require('node:path');
const {pathToFileURL}=require('node:url');
const {Workspace}=require('./workspace.cjs');
const {Connections,provider}=require('./connections.cjs');
const {ModelGateway}=require('./model-gateway.cjs');
const {assetPath}=require('./asset-path.cjs');
protocol.registerSchemesAsPrivileged([{scheme:'ruang',privileges:{standard:true,secure:true,supportFetchAPI:true,corsEnabled:true}}]);
const workspace=new Workspace();
const migrationTest=process.argv.includes('--smoke-test-migration');
const smoke=process.argv.includes('--smoke-test')||migrationTest;
app.disableHardwareAcceleration();
const appRoot=path.join(__dirname,'..');
const legacyData=path.join(path.dirname(process.execPath),'..','AI Office','data');
// Reuse the existing desktop profile rather than copying a potentially open database.
const dataRoot=app.isPackaged&&!smoke&&fs.existsSync(legacyData)?legacyData:path.join(app.isPackaged?path.dirname(process.execPath):appRoot,smoke?(migrationTest?'smoke-migration-data':'smoke-data'):'data');
fs.mkdirSync(dataRoot,{recursive:true});app.setPath('userData',dataRoot);
const record=message=>fs.appendFileSync(path.join(dataRoot,'startup.log'),`${new Date().toISOString()} ${message}\n`);
record('Starting '+app.getVersion());
app.setPath('sessionData',path.join(dataRoot,'session'));
const settingsFile=path.join(dataRoot,'folder.json');
const indexURL='ruang://app/index.html';
let win,starting=true;
if(!app.requestSingleInstanceLock()){app.quit()}else{
app.on('second-instance',()=>{if(win){if(win.isMinimized())win.restore();win.focus()}});
app.whenReady().then(async()=>{
  protocol.handle('ruang',request=>{try{return net.fetch(pathToFileURL(assetPath(path.join(appRoot,'dist'),request.url)).href)}catch{return new Response('Not found',{status:404})}});
  // Monaco workers need a standard local origin. Carry the old file-origin workspace over once.
  const migrationFile=path.join(dataRoot,'code-origin-migrated.json');
  if((!smoke||migrationTest)&&!fs.existsSync(migrationFile)){
    const migration=new BrowserWindow({show:false,webPreferences:{nodeIntegration:false,contextIsolation:true,sandbox:true,webSecurity:true}});
    migration.webContents.setWindowOpenHandler(()=>({action:'deny'}));
    try{
      await migration.loadURL(pathToFileURL(path.join(appRoot,'dist','index.html')).href);
      if(migrationTest)await migration.webContents.executeJavaScript("localStorage.setItem('ai-office-v1',JSON.stringify({...defaults(),migrationProbe:'preserved'}))");
      const legacy=await migration.webContents.executeJavaScript("localStorage.getItem('ai-office-v1')");
      await migration.loadURL(indexURL);
      if(legacy){JSON.parse(legacy);await migration.webContents.executeJavaScript(`if(!localStorage.getItem('ai-office-v1'))localStorage.setItem('ai-office-v1',${JSON.stringify(legacy)})`)}
      fs.writeFileSync(migrationFile,JSON.stringify({completedAt:new Date().toISOString(),hadLegacy:!!legacy}));
    }finally{migration.destroy()}
  }
  const connections=new Connections({root:path.join(dataRoot,'ai-connections'),safeStorage});
  try{workspace.select(JSON.parse(fs.readFileSync(settingsFile,'utf8')).path)}catch{}
  Menu.setApplicationMenu(null);
  win=new BrowserWindow({width:1500,height:1000,minWidth:850,minHeight:650,title:'Ruang',icon:path.join(appRoot,'dist','v2','app-icon.png'),backgroundColor:'#101d20',show:!smoke,webPreferences:{preload:path.join(__dirname,'preload.cjs'),nodeIntegration:false,contextIsolation:true,sandbox:true,webSecurity:true}});
  win.webContents.setWindowOpenHandler(()=>({action:'deny'}));
  win.webContents.on('render-process-gone',(_event,details)=>record('Renderer stopped: '+JSON.stringify(details)));
  win.webContents.on('did-fail-load',(_event,code,description)=>record(`Load failed: ${code} ${description}`));
  win.webContents.on('will-navigate',(event)=>event.preventDefault());
  win.webContents.on('will-prevent-unload',event=>{const answer=dialog.showMessageBoxSync(win,{type:'warning',title:'Unsaved code changes',message:'Close Ruang and discard unsaved code changes?',buttons:['Keep editing','Discard and close'],defaultId:0,cancelId:0,noLink:true});if(answer===1)event.preventDefault()});
  win.webContents.session.setPermissionRequestHandler((_wc,_permission,callback)=>callback(false));
  function handle(channel,fn){ipcMain.handle(channel,async(event,...args)=>{if(event.sender!==win.webContents||event.senderFrame!==win.webContents.mainFrame||event.senderFrame.url!==indexURL)throw Error('Untrusted request.');return fn(...args)})}
  handle('office:info',()=>({folder:workspace.info(),version:app.getVersion(),storage:dataRoot}));
  // Model gateway: renderer sends a validated conversation; keys stay in this process.
  const models=new ModelGateway({connections});
  handle('model:status',()=>models.status());
  handle('model:generate',request=>models.generate(request));
  // Streaming: events go back to this window only, tagged with the caller's stream id. The result (or a
  // {code, message} error) is returned as data so the reason survives the trip to the page.
  const streams=new Map();
  handle('model:stream',async(id,request)=>{
    if(typeof id!=='string'||!/^[\w-]{8,64}$/.test(id)||streams.has(id))throw Error('Invalid stream.');
    const controller=new AbortController();streams.set(id,controller);
    try{const result=await models.stream(request,{signal:controller.signal,onEvent:event=>{if(!win.isDestroyed())win.webContents.send('model:stream-event',id,event)}});return {ok:true,result}}
    catch(error){return {ok:false,error:{code:error.code||'PROVIDER',message:error.message}}}
    finally{streams.delete(id)}
  });
  handle('model:cancel',id=>{streams.get(id)?.abort();return true});
  handle('connections:list',()=>connections.list());
  handle('connections:login',id=>connections.login(id));
  handle('connections:install',id=>connections.install(id));
  handle('connections:check-cli',id=>connections.checkCLI(id));
  handle('connections:save-key',(id,key)=>connections.saveKey(id,key));
  handle('connections:check-api',id=>connections.checkAPI(id));
  handle('connections:disconnect',id=>connections.disconnect(id));
  handle('connections:docs',id=>shell.openExternal(provider(id).docs));
  handle('connections:choose-tool',async id=>{const p=provider(id);const result=await dialog.showOpenDialog(win,{title:'Select official '+p.name+' executable',properties:['openFile'],filters:[{name:p.command+'.exe / '+p.command+'.cmd',extensions:['exe','cmd']}]});return result.canceled?connections.list():connections.selectExecutable(id,result.filePaths[0])});
  handle('office:choose-folder',async()=>{const result=await dialog.showOpenDialog(win,{title:'Choose a Ruang project folder',properties:['openDirectory']});if(result.canceled)return null;const folder=workspace.select(result.filePaths[0]);fs.writeFileSync(settingsFile,JSON.stringify(folder));return folder});
  handle('office:list',relative=>workspace.list(relative));
  handle('office:read',relative=>workspace.read(relative));
  let saving=false;
  handle('office:save',async change=>{
    if(saving)throw Error('A save is already being reviewed.');
    if(!change||typeof change.path!=='string'||typeof change.content!=='string')throw Error('Invalid change.');
    const current=workspace.read(change.path);
    if(current.hash!==change.hash||current.version!==change.version)throw Error('File or folder changed. Reopen the file before saving.');
    if(current.content===change.content)return {...current,unchanged:true};
    saving=true;
    try{
      const result=await dialog.showMessageBox(win,{type:'question',title:'Save local file changes',message:`Save changes to ${change.path}?`,detail:`Folder: ${workspace.root}\n\nThe current file will be backed up in .ai-office-backups before replacement. This action changes a real local file.`,buttons:['Cancel','Save changes'],defaultId:0,cancelId:0,noLink:true});
      if(result.response!==1)return {canceled:true};
      return workspace.save(change);
    }finally{saving=false}
  });
  await win.loadURL(indexURL);
  starting=false;
  record('Interface loaded');
  if(smoke){
    try{
      const check=await win.webContents.executeJavaScript(`({title:document.title,office:!!document.querySelector('#office-canvas'),desktop:typeof window.desktop?.chooseFolder==='function',node:typeof require,files:document.body.innerText.includes('Files')})`);
      if(!check.office||!check.desktop||check.node!=='undefined'||!check.files)throw Error(JSON.stringify(check));
      const info=await win.webContents.executeJavaScript('window.desktop.info()');
      const connectionCheck=await win.webContents.executeJavaScript(`(async()=>{const rows=await window.desktop.connections.list();view='Settings';render();return {providers:rows.map(r=>r.id),settings:document.body.innerText.includes('AI Connections'),keysExposed:rows.some(r=>Object.hasOwn(r,'secret')),keyInputInPage:!!document.querySelector('#connection-secret')}})()`);
      if(connectionCheck.providers.length!==3||!connectionCheck.settings||connectionCheck.keysExposed||connectionCheck.keyInputInPage)throw Error('Connection smoke check failed.');
      const codeCheck=await win.webContents.executeJavaScript(`(async()=>{view='Code';render();const monaco=window.RuangMonaco;if(!monaco)throw Error('Monaco missing');const uri=monaco.Uri.parse('inmemory://smoke/check.ts');const model=monaco.editor.createModel('const answer: number = 42;','typescript',uri);const instance=monaco.editor.create(document.querySelector('#code-editor-host'),{model});const worker=await monaco.typescript.getTypeScriptWorker();const client=await worker(uri);const diagnostics=await client.getSyntacticDiagnostics(uri.toString());const result={explorer:document.body.innerText.includes('EXPLORER'),editor:!!document.querySelector('.monaco-editor'),worker:diagnostics.length===0};instance.dispose();model.dispose();return result})()`);
      if(!codeCheck.explorer||!codeCheck.editor||!codeCheck.worker)throw Error('Code workspace smoke check failed.');
      if(migrationTest){const preserved=await win.webContents.executeJavaScript("JSON.parse(localStorage.getItem('ai-office-v1')).migrationProbe==='preserved'");if(!preserved)throw Error('Legacy workspace migration failed.');codeCheck.migration=true}
      fs.writeFileSync(path.join(appRoot,'desktop-smoke-result.json'),JSON.stringify({passed:true,...check,connections:connectionCheck,code:codeCheck,version:info.version},null,2));
      app.exit(0);
    }catch(error){fs.writeFileSync(path.join(appRoot,'desktop-smoke-result.json'),JSON.stringify({passed:false,error:error.message}));app.exit(1)}
  }
}).catch(error=>{fs.writeFileSync(path.join(appRoot,'desktop-smoke-result.json'),JSON.stringify({passed:false,error:error.message}));if(!smoke)dialog.showErrorBox('AI Office could not start',error.message);app.exit(1)});
app.on('window-all-closed',()=>{if(!starting)app.quit()});
}
