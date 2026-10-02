const fs=require('node:fs');
const path=require('node:path');
const crypto=require('node:crypto');
const MAX=1024*1024;
const extensions=new Set(['.txt','.md','.json','.csv','.tsv','.js','.cjs','.mjs','.ts','.tsx','.jsx','.html','.css','.py','.yaml','.yml','.toml','.xml','.sql','.log','.ini']);
const ignored=new Set(['.git','node_modules','.env','.ssh','.aws','.azure','.ai-office-backups']);
const digest=buffer=>crypto.createHash('sha256').update(buffer).digest('hex');
class Workspace{
  constructor(){this.root=null;this.version=0}
  select(folder){const stat=fs.lstatSync(folder);if(!stat.isDirectory()||stat.isSymbolicLink())throw Error('Choose a regular folder, not a link.');this.root=fs.realpathSync(folder);this.version++;return this.info()}
  info(){return this.root?{path:this.root,name:path.basename(this.root),version:this.version}:null}
  resolve(relative='',directory=false){
    if(!this.root)throw Error('Choose a project folder first.');
    if(typeof relative!=='string'||relative.includes('\0')||path.isAbsolute(relative)||relative.includes(':'))throw Error('Invalid project path.');
    const parts=relative.split(/[\\/]/).filter(Boolean);
    if(parts.some(p=>p==='..'||p==='.'||ignored.has(p.toLowerCase())||p.toLowerCase().startsWith('.env')||/[. ]$/.test(p)))throw Error('This path is outside the allowed workspace.');
    let file=this.root;
    for(const part of parts){file=path.join(file,part);if(fs.lstatSync(file).isSymbolicLink())throw Error('Links are not supported in the project browser.');}
    const real=fs.realpathSync(file),rel=path.relative(this.root,real);
    if(rel==='..'||rel.startsWith('..'+path.sep)||path.isAbsolute(rel))throw Error('Path escapes the selected folder.');
    const stat=fs.statSync(real);
    if(directory?!stat.isDirectory():!stat.isFile())throw Error(directory?'Not a folder.':'Not a regular file.');
    if(!directory&&(!extensions.has(path.extname(real).toLowerCase())||stat.size>MAX||stat.nlink>1))throw Error('Open a supported text file under 1 MB. Hard-linked files are excluded.');
    return real;
  }
  list(relative=''){
    const dir=this.resolve(relative,true);
    const entries=fs.readdirSync(dir,{withFileTypes:true}).filter(e=>!e.isSymbolicLink()&&!ignored.has(e.name.toLowerCase())&&!e.name.toLowerCase().startsWith('.env')).sort((a,b)=>Number(b.isDirectory())-Number(a.isDirectory())||a.name.localeCompare(b.name));
    return {folder:this.info(),relative,entries:entries.slice(0,500).map(e=>({name:e.name,path:path.join(relative,e.name),directory:e.isDirectory(),editable:e.isFile()&&extensions.has(path.extname(e.name).toLowerCase())})),truncated:entries.length>500};
  }
  read(relative){const file=this.resolve(relative),buffer=fs.readFileSync(file);if(buffer.length>MAX||buffer.includes(0))throw Error('This file is not a supported UTF-8 text file.');let content;try{content=new TextDecoder('utf-8',{fatal:true,ignoreBOM:true}).decode(buffer)}catch{throw Error('Only UTF-8 text files are supported.')}return {path:relative,content,hash:digest(buffer),version:this.version}}
  save({path:relative,content,hash,version}){
    if(version!==this.version)throw Error('The selected folder changed. Reopen the file.');
    if(typeof content!=='string'||Buffer.byteLength(content)>MAX)throw Error('File content must be text under 1 MB.');
    const file=this.resolve(relative),before=fs.readFileSync(file);
    if(digest(before)!==hash)throw Error('This file changed on disk. Reopen it before saving to avoid overwriting newer work.');
    const backupDir=path.join(this.root,'.ai-office-backups');
    if(fs.existsSync(backupDir)){if(fs.lstatSync(backupDir).isSymbolicLink()||!fs.statSync(backupDir).isDirectory())throw Error('Backup directory is not a regular folder.')}else fs.mkdirSync(backupDir);
    const backup=path.join(backupDir,`${Date.now()}-${crypto.randomUUID()}-${path.basename(file)}`);
    fs.writeFileSync(backup,before,{flag:'wx'});
    // Recheck immediately before replacement; never overwrite an observed newer version.
    if(digest(fs.readFileSync(this.resolve(relative)))!==hash)throw Error('The file changed while saving. Reopen it.');
    const temp=path.join(path.dirname(file),`.ai-office-${crypto.randomUUID()}.tmp`);
    try{fs.writeFileSync(temp,content,{flag:'wx',mode:fs.statSync(file).mode});fs.renameSync(temp,file)}finally{if(fs.existsSync(temp))fs.unlinkSync(temp)}
    return {...this.read(relative),backup:path.relative(this.root,backup)};
  }
}
module.exports={Workspace};
