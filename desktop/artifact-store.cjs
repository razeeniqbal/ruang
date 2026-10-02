// Durable storage for task outputs, inside Ruang's own data folder (data/artifacts). Runs in the main process.
// The page can only save, read or check an output by its id; it never supplies a path.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const ID=/^artifact-[A-Za-z0-9-]{1,100}$/;
const EXTENSIONS=Object.freeze({markdown:'md',text:'txt'});
const MAX_BYTES=5*1024*1024;

// The file name comes only from a validated id and a known format, never from a title the model wrote.
function fileName(id,format='markdown'){
  if(typeof id!=='string'||!ID.test(id))throw Error('Invalid output id.');
  const ext=EXTENSIONS[format];if(!ext)throw Error('Unsupported output format.');
  return `${id}.${ext}`;
}

class ArtifactStore{
  constructor({root,fsImpl=fs}){this.fs=fsImpl;this.root=path.resolve(root);fs.mkdirSync(this.root,{recursive:true})}
  resolve(name){const file=path.resolve(this.root,name);if(path.dirname(file)!==this.root||path.basename(file)!==name)throw Error('Invalid output path.');return file}
  locate(id){for(const format of Object.keys(EXTENSIONS)){const file=this.resolve(fileName(id,format));if(this.fs.existsSync(file))return file}return null}

  // Write to a temporary file, flush it to disk, then rename into place, so a crash never leaves half an output.
  save({id,format='markdown',content}){
    const name=fileName(id,format);
    if(typeof content!=='string'||!content.trim())throw Error('There is no output to save.');
    const bytes=Buffer.byteLength(content,'utf8');if(bytes>MAX_BYTES)throw Error('This output is too large to save (over 5 MB).');
    const file=this.resolve(name);if(this.locate(id))throw Error('This output has already been saved.');
    const tmp=this.resolve(`${name}.${crypto.randomBytes(6).toString('hex')}.tmp`);
    let fd=null;
    try{
      fd=this.fs.openSync(tmp,'wx',0o600);this.fs.writeSync(fd,content,null,'utf8');this.fs.fsyncSync(fd);this.fs.closeSync(fd);fd=null;
      this.fs.renameSync(tmp,file);
      if(this.fs.statSync(file).size!==bytes)throw Error('The saved output did not match what was written.');
    }catch(error){
      if(fd!==null)try{this.fs.closeSync(fd)}catch{}
      try{this.fs.unlinkSync(tmp)}catch{}
      throw Error(`Could not save the output: ${error.message}`);
    }
    return {file:name,size:bytes,sha256:crypto.createHash('sha256').update(content,'utf8').digest('hex')};
  }
  read(id){const file=this.locate(id);if(!file)throw Error('This output file is missing from the Ruang data folder.');return this.fs.readFileSync(file,'utf8')}
  exists(id){return !!this.locate(id)}
}
module.exports={ArtifactStore,fileName,MAX_BYTES};
