const fs=require('node:fs'),path=require('node:path'),os=require('node:os');
const {spawn}=require('node:child_process');
const PROVIDERS=Object.freeze({
  codex:{name:'Codex',company:'OpenAI',command:'codex',package:'@openai/codex',login:['login'],status:['login','status'],docs:'https://developers.openai.com/codex/cli',endpoint:'https://api.openai.com/v1/models'},
  claude:{name:'Claude Code',company:'Anthropic',command:'claude',package:'@anthropic-ai/claude-code',login:['auth','login'],status:['auth','status'],docs:'https://code.claude.com/docs/en/setup',endpoint:'https://api.anthropic.com/v1/models'},
  gemini:{name:'Gemini CLI',company:'Google',command:'gemini',package:'@google/gemini-cli',login:[],docs:'https://geminicli.com/docs/get-started/installation/',endpoint:'https://generativelanguage.googleapis.com/v1beta/models'}
});
function provider(id){if(!Object.hasOwn(PROVIDERS,id))throw Error('Unknown provider.');return PROVIDERS[id]}
function quotePS(value){return "'"+String(value).replace(/'/g,"''")+"'"}
function psCommand(file,args){return '& '+[file,...args].map(quotePS).join(' ')}
function powershell(){return path.join(process.env.SystemRoot||'C:\\Windows','System32','WindowsPowerShell','v1.0','powershell.exe')}
function commandSpec(file,args){if(/\.cmd$/i.test(file))return {file:powershell(),args:['-NoProfile','-NonInteractive','-EncodedCommand',Buffer.from(psCommand(file,args),'utf16le').toString('base64')]};return {file,args}}
function capture(file,args,{cwd,env=process.env,timeout=15000}={}){return new Promise(resolve=>{
  const spec=commandSpec(file,args);let child,output='',settled=false,timer;
  const done=(code,error)=>{if(settled)return;settled=true;clearTimeout(timer);resolve({code,output,error})};
  try{child=spawn(spec.file,spec.args,{cwd,env,windowsHide:true,shell:false,stdio:['ignore','pipe','pipe']})}catch{return done(-1,'Could not start the tool.')}
  for(const stream of [child.stdout,child.stderr])stream.on('data',chunk=>{if(output.length<32768)output+=chunk.toString().slice(0,32768-output.length)});
  child.on('error',()=>done(-1,'Could not start the tool.'));child.on('close',code=>done(code,null));
  timer=setTimeout(()=>{child.kill();done(-1,'The tool did not respond in time.')},timeout);
})}
function terminal(script,cwd){return new Promise((resolve,reject)=>{
  // Fixed script and individually quoted arguments; no renderer-provided shell text.
  const child=spawn(powershell(),['-NoProfile','-NoExit','-EncodedCommand',Buffer.from(script,'utf16le').toString('base64')],{cwd,windowsHide:false,detached:true,shell:false,stdio:'ignore'});
  child.once('error',()=>reject(Error('Could not open the sign-in window.')));child.once('spawn',()=>{child.unref();resolve()});
})}
class Connections{
  constructor({root,safeStorage,fetchImpl=global.fetch,run=capture,launch=terminal,env=process.env}){
    this.root=root;this.safeStorage=safeStorage;this.fetch=fetchImpl;this.run=run;this.launch=launch;this.env=env;this.busy=new Set();this.checked={};
    fs.mkdirSync(root,{recursive:true});this.file=path.join(root,'connections.json');this.config={};
    if(fs.existsSync(this.file)){try{this.config=JSON.parse(fs.readFileSync(this.file,'utf8'))}catch{throw Error('Connection settings could not be read. Restore connections.json from a backup before changing connections.')}}
  }
  save(){const tmp=this.file+'.tmp';fs.writeFileSync(tmp,JSON.stringify(this.config,null,2),{mode:0o600});fs.renameSync(tmp,this.file)}
  async exclusive(id,fn){provider(id);if(this.busy.has(id))throw Error('This connection is busy. Please wait.');this.busy.add(id);try{return await fn()}finally{this.busy.delete(id)}}
  find(id){const p=provider(id),saved=this.config[id]?.executable;const candidates=[saved,path.join(this.root,'tools','node_modules','.bin',p.command+'.cmd')];
    for(const dir of (this.env.PATH||this.env.Path||'').split(path.delimiter).filter(Boolean))for(const ext of ['.exe','.cmd'])candidates.push(path.join(dir.replace(/^"|"$/g,''),p.command+ext));
    for(const dir of [path.join(os.homedir(),'.local','bin'),path.join(this.env.APPDATA||os.homedir(),'npm')])for(const ext of ['.exe','.cmd'])candidates.push(path.join(dir,p.command+ext));
    if(id==='codex'&&this.env.LOCALAPPDATA){const base=path.join(this.env.LOCALAPPDATA,'OpenAI','Codex','bin');try{for(const dir of fs.readdirSync(base))candidates.push(path.join(base,dir,'codex.exe'))}catch{}}
    return candidates.find(file=>{try{return file&&path.isAbsolute(file)&&fs.statSync(file).isFile()}catch{return false}})||null;
  }
  list(){return Object.entries(PROVIDERS).map(([id,p])=>{const c=this.config[id]||{},exe=this.find(id);return {id,name:p.name,company:p.company,installed:!!exe,executable:exe,mode:c.mode||null,enabled:!!c.enabled,hasKey:!!c.secret,checkedAt:this.checked[id]?.at||null,status:!c.enabled?'Disconnected':this.checked[id]?.status||(c.mode==='api'?'Saved · not checked':'Sign-in needs checking'),detail:this.checked[id]?.detail||'',busy:this.busy.has(id)}})}
  selectExecutable(id,file){const p=provider(id);if(typeof file!=='string'||!path.isAbsolute(file)||![p.command+'.exe',p.command+'.cmd'].includes(path.basename(file).toLowerCase())||!fs.statSync(file).isFile())throw Error('Select the official '+p.command+'.exe or '+p.command+'.cmd.');this.config[id]={...this.config[id],executable:file};delete this.checked[id];this.save();return this.list()}
  async login(id){return this.exclusive(id,async()=>{const p=provider(id),exe=this.find(id);if(!exe)throw Error('Install '+p.name+' first, then refresh.');
    const cwd=path.join(this.root,'sign-in',id);fs.mkdirSync(cwd,{recursive:true});
    const note=id==='gemini'?'Choose Sign in with Google in Gemini. Use /auth to change accounts. After signing in, exit Gemini and return to Ruang.':'Complete sign-in in the official browser page, then return to Ruang and choose Check sign-in.';
    await this.launch('Write-Host '+quotePS(note)+'\n'+psCommand(exe,p.login),cwd);
    this.config[id]={...this.config[id],enabled:true,mode:'cli'};this.checked[id]={status:'Sign-in opened',detail:note,at:null};this.save();return this.list();})}
  async install(id){return this.exclusive(id,async()=>{const p=provider(id);const dirs=(this.env.PATH||this.env.Path||'').split(path.delimiter).filter(Boolean);const npm=dirs.map(d=>path.join(d,'npm.cmd')).find(f=>fs.existsSync(f));if(!npm)throw Error('Node.js with npm is required. Install Node.js LTS, restart Ruang, then try again.');
    const target=path.join(this.root,'tools');fs.mkdirSync(target,{recursive:true});
    await this.launch('Write-Host '+quotePS('Installing the official '+p.name+' package for Ruang. Return to Ruang and refresh when finished.')+'\n'+psCommand(npm,['install','--prefix',target,'--registry=https://registry.npmjs.org',p.package]),this.root);
    return {message:'Installation opened. Refresh after it finishes.'};})}
  async checkCLI(id){return this.exclusive(id,async()=>{const p=provider(id),exe=this.find(id);if(!exe)throw Error('Tool not installed.');
    if(this.config[id]?.mode!=='cli'||!this.config[id]?.enabled)throw Error('Choose Sign in first.');
    if(id==='gemini'){this.checked[id]={status:'Official sign-in required',detail:'Gemini has no supported standalone login-status command. Open Gemini and use /auth to confirm your account. For a connection Ruang can verify without generating text, use a Gemini API key.',at:new Date().toISOString()};return this.list()}
    const result=await this.run(exe,p.status,{cwd:this.root,env:this.env});let valid=result.code===0;
    if(id==='claude'&&valid){try{valid=JSON.parse(result.output).loggedIn===true}catch{valid=false}}
    if(id==='codex'&&valid)valid=/logged in/i.test(result.output);
    // Raw stdout may contain account details or key fragments; it never leaves this process.
    this.checked[id]={status:valid?'Signed in':'Sign-in not verified',detail:valid?'Official CLI reports an authenticated session. Model access and quota are checked when you run the official tool.':result.error||'Sign in using the official tool, or update it if this command is unsupported.',at:new Date().toISOString()};return this.list();})}
  async verifyKey(id,key){const p=provider(id);if(typeof key!=='string'||key.length<12||key.length>4096||/[\s\x00-\x1f]/.test(key))throw Error('Enter a valid API key without spaces.');
    const headers=id==='codex'?{Authorization:'Bearer '+key}:id==='claude'?{'x-api-key':key,'anthropic-version':'2023-06-01'}:{'x-goog-api-key':key};
    let response;try{response=await this.fetch(p.endpoint,{headers,redirect:'error',signal:AbortSignal.timeout(15000)})}catch{throw Error('Could not reach '+p.company+'. Check your internet connection and try again.')}
    if(!response.ok){const code=response.status;throw Error(code===401||code===403?'The provider rejected this key or its permissions.':code===429?'Provider rate limit reached. Try again later.':'Provider check failed (HTTP '+code+').')}
    let body;try{body=await response.json()}catch{throw Error('The provider returned an unexpected response.')}
    if(!Array.isArray(id==='gemini'?body.models:body.data))throw Error('The provider returned an unexpected response.');
  }
  async saveKey(id,key){return this.exclusive(id,async()=>{if(!this.safeStorage.isEncryptionAvailable())throw Error('Windows credential protection is unavailable. The key was not saved.');key=typeof key==='string'?key.trim():key;await this.verifyKey(id,key);const secret=this.safeStorage.encryptString(key).toString('base64');this.config[id]={...this.config[id],enabled:true,mode:'api',secret};this.save();this.checked[id]={status:'API verified',detail:'The provider accepted your key for its model list. This does not verify model-generation quota or billing.',at:new Date().toISOString()};return this.list()})}
  async checkAPI(id){return this.exclusive(id,async()=>{const c=this.config[id];if(!c?.enabled||c.mode!=='api'||!c.secret)throw Error('Save an API key first.');delete this.checked[id];let key;try{key=this.safeStorage.decryptString(Buffer.from(c.secret,'base64'))}catch{throw Error('This key cannot be unlocked on this Windows account. Replace it.')}try{await this.verifyKey(id,key)}catch(error){this.checked[id]={status:'Check failed',detail:error.message,at:new Date().toISOString()};throw error}this.checked[id]={status:'API verified',detail:'Key accepted for the model list; no prompt or project files were sent.',at:new Date().toISOString()};return this.list()})}
  disconnect(id){provider(id);if(this.busy.has(id))throw Error('Wait for the connection check to finish.');const executable=this.config[id]?.executable;this.config[id]={enabled:false,...(executable?{executable}:{})};delete this.checked[id];this.save();return this.list()}
}
module.exports={Connections,PROVIDERS,provider,quotePS,psCommand,commandSpec};
