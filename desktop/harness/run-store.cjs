// Run records: one small JSON file per run in Ruang's data folder (data/runs). A run is the history of one
// attempt at a task; retries create new runs, and a finished run is never rewritten.
// Outputs are not stored here; the record only lists the ids of outputs saved in the artifact store.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const ID=/^run-[A-Za-z0-9-]{1,100}$/;
const TERMINAL=new Set(['COMPLETED','FAILED','CANCELLED','BLOCKED']);
const INTERRUPTED='Ruang closed while this run was in progress.';
const copy=value=>JSON.parse(JSON.stringify(value));
function checkId(id){if(typeof id!=='string'||!ID.test(id))throw Error('Invalid run id.');return id}

function interrupt(run,at){return {...run,status:'FAILED',completedAt:at,error:{code:'INTERRUPTED',message:INTERRUPTED},trace:[...(run.trace||[]),{at,type:'run.failed',text:INTERRUPTED}]}}

// Shared rule: once a run has finished, its record is final.
class BaseRunStore{
  constructor(){this.finished=new Set()}
  guard(run){checkId(run?.id);if(this.finished.has(run.id))throw Error('A finished run cannot be changed.')}
  mark(run){if(TERMINAL.has(run.status))this.finished.add(run.id)}
}

class RunStore extends BaseRunStore{
  constructor({root}){super();this.root=path.resolve(root);fs.mkdirSync(this.root,{recursive:true})}
  file(id){return path.join(this.root,`${checkId(id)}.json`)}
  save(run){
    this.guard(run);const file=this.file(run.id),tmp=`${file}.${crypto.randomBytes(6).toString('hex')}.tmp`;
    try{fs.writeFileSync(tmp,JSON.stringify(run),{flag:'wx',mode:0o600});fs.renameSync(tmp,file)}finally{try{fs.unlinkSync(tmp)}catch{}}
    this.mark(run);
  }
  read(id){const file=this.file(id);if(!fs.existsSync(file))throw Error('This run was not found in the Ruang data folder.');return JSON.parse(fs.readFileSync(file,'utf8'))}
  // Called at start-up: nothing can still be running, so unfinished runs are recorded as interrupted.
  recoverInterrupted(at=Date.now()){let count=0;
    for(const name of fs.readdirSync(this.root)){if(!/^run-.*\.json$/.test(name))continue;
      try{const run=JSON.parse(fs.readFileSync(path.join(this.root,name),'utf8'));if(!TERMINAL.has(run.status)){this.save(interrupt(run,at));count++}else this.finished.add(run.id)}catch{}}
    return count}
}

// In-memory store for tests and for runs without a data folder.
class MemoryRunStore extends BaseRunStore{
  constructor(){super();this.runs=new Map()}
  save(run){this.guard(run);this.runs.set(run.id,copy(run));this.mark(run)}
  read(id){const run=this.runs.get(checkId(id));if(!run)throw Error('This run was not found.');return copy(run)}
  recoverInterrupted(at=Date.now()){let count=0;for(const run of [...this.runs.values()])if(!TERMINAL.has(run.status)){this.save(interrupt(run,at));count++}return count}
}
module.exports={RunStore,MemoryRunStore,TERMINAL,INTERRUPTED};
