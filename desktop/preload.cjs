const {contextBridge,ipcRenderer}=require('electron');
// Streamed model events are routed to the matching caller by id; the page never sees other streams.
const listeners=new Map();
ipcRenderer.on('model:stream-event',(_event,id,payload)=>{const fn=listeners.get(id);if(fn)try{fn(payload)}catch{}});
contextBridge.exposeInMainWorld('desktop',Object.freeze({
  info:()=>ipcRenderer.invoke('office:info'),
  chooseFolder:()=>ipcRenderer.invoke('office:choose-folder'),
  listFiles:relative=>ipcRenderer.invoke('office:list',relative),
  readFile:relative=>ipcRenderer.invoke('office:read',relative),
  saveFile:change=>ipcRenderer.invoke('office:save',change),
  model:Object.freeze({
    status:()=>ipcRenderer.invoke('model:status'),
    generate:request=>ipcRenderer.invoke('model:generate',request),
    // Returns {ok, result} or {ok:false, error:{code, message}}; onEvent receives start, delta, usage, complete, error.
    stream:async(id,request,onEvent)=>{listeners.set(String(id),onEvent);try{return await ipcRenderer.invoke('model:stream',String(id),request)}finally{listeners.delete(String(id))}},
    cancel:id=>ipcRenderer.invoke('model:cancel',String(id))
  }),
  artifacts:Object.freeze({
    save:record=>ipcRenderer.invoke('artifact:save',record),
    read:id=>ipcRenderer.invoke('artifact:read',id),
    exists:id=>ipcRenderer.invoke('artifact:exists',id)
  }),
  connections:Object.freeze({
    list:()=>ipcRenderer.invoke('connections:list'),
    login:id=>ipcRenderer.invoke('connections:login',id),
    install:id=>ipcRenderer.invoke('connections:install',id),
    checkCLI:id=>ipcRenderer.invoke('connections:check-cli',id),
    saveKey:(id,key)=>ipcRenderer.invoke('connections:save-key',id,key),
    checkAPI:id=>ipcRenderer.invoke('connections:check-api',id),
    disconnect:id=>ipcRenderer.invoke('connections:disconnect',id),
    docs:id=>ipcRenderer.invoke('connections:docs',id),
    chooseTool:id=>ipcRenderer.invoke('connections:choose-tool',id)
  })
}));
