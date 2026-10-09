/* The renderer's way to run a task: forwards to the RUANG AI harness in the desktop main process, where
   permissions, approved context, model calls, limits and outputs are controlled. The page cannot run tools,
   read files or skip a permission check itself; it only sends the task and receives observable events. */
(function(root){
  const bridge=()=>root.desktop?.harness;
  const WEB='Real work runs in the Ruang desktop app for now. The web version needs the Ruang server, which is not set up yet.';
  const clean=e=>String(e?.message||e||'The run failed.').replace(/^Error invoking remote method '[^']+': Error: /,'');
  let seq=0;const callId=()=>`h${Date.now().toString(36)}-${++seq}-${Math.random().toString(36).slice(2,8)}`;

  // Resolves {status, run, usage, artifact?, error?}; onEvent receives harness events (run.started, model.delta, ...).
  async function execute(input,{signal,onEvent}={}){
    const b=bridge();if(!b)return {status:'FAILED',error:{code:'NOT_CONNECTED',message:WEB}};
    if(signal?.aborted)return {status:'CANCELLED',error:{code:'CANCELLED',message:'You cancelled this task.'}};
    const id=callId(),cancel=()=>{b.cancel(id).catch(()=>{})};
    signal?.addEventListener('abort',cancel,{once:true});
    try{return await b.execute(id,input,event=>onEvent?.(event))}
    catch(error){return {status:'FAILED',error:{code:'PROVIDER',message:clean(error)}}}
    finally{signal?.removeEventListener('abort',cancel)}
  }
  const decide=async(approvalId,decision)=>{const b=bridge();return b?b.decide(approvalId,decision):false};
  const run=async runId=>{const b=bridge();if(!b)throw Error('Runs are recorded by the Ruang desktop app.');return b.run(runId)};
  // Native picker limited to the open project folder. Resolves {root, files} or null if nothing was chosen.
  const chooseContext=async()=>{const b=bridge();if(!b)throw Error(WEB);return b.chooseContext()};
  root.RuangHarness={execute,decide,run,chooseContext,clean,available:()=>!!bridge()};
})(window);
