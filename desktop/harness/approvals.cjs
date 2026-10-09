// Approval controller: a run that needs a person pauses here until the Inbox decision arrives, the run is
// cancelled, or the wait limit passes. Approval is part of execution, not a UI modal.
class ApprovalController{
  constructor(){this.pending=new Map()}
  // Resolves 'approve', 'reject' or 'timeout'; rejects if the run is cancelled while waiting.
  wait(id,{signal,timeoutMs}){
    return new Promise((resolve,reject)=>{
      const done=(fn,value)=>{clearTimeout(timer);signal?.removeEventListener('abort',abort);this.pending.delete(id);fn(value)};
      const abort=()=>done(reject,Object.assign(Error('The run was stopped.'),{code:'CANCELLED'}));
      const timer=setTimeout(()=>done(resolve,'timeout'),timeoutMs);
      this.pending.set(id,decision=>done(resolve,decision));
      if(signal?.aborted)abort();else signal?.addEventListener('abort',abort,{once:true});
    });
  }
  // Returns false when nothing is waiting on this id (already decided, cancelled, or from an earlier session).
  decide(id,decision){
    if(decision!=='approve'&&decision!=='reject')throw Error('Unknown approval decision.');
    const resolve=this.pending.get(id);if(!resolve)return false;resolve(decision);return true;
  }
  isPending(id){return this.pending.has(id)}
}
module.exports={ApprovalController};
