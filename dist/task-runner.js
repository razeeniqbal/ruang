/* Task execution service: runs a task through the model gateway and records everything in application state.
   The office only follows the task state this service writes; it never decides when work is done.
   Usable in the browser (window.RuangTasks) and in Node for tests (createTaskRunner).

   Canonical state (core.js) stays authoritative: QUEUED, ASSIGNED, PLANNING, RUNNING, then COMPLETED,
   FAILED or CANCELLED. A lighter `metadata.phase` (starting, thinking, writing, saving) says what is
   happening inside those states, for people and for the office animation. */
(function(root){
  const INTERRUPTED='Ruang closed while this task was running, so it did not finish. Try again to run it.';
  const PHASE_LABELS=Object.freeze({starting:'Getting ready',thinking:'Thinking',writing:'Writing',saving:'Saving the result'});

  function identityPrompt(agent){
    return [`You are ${agent.name}, the ${agent.role} on a small team working inside Ruang, a shared digital workspace where a person works with a team of AI employees.`,
      agent.description,(agent.responsibilities||[]).length?'Your responsibilities:\n'+agent.responsibilities.map(r=>'- '+r).join('\n'):'',agent.instructions].filter(Boolean).join('\n\n');
  }
  function taskRequest(task,agent,project){
    const system=[identityPrompt(agent),'You are completing a task your teammate assigned to you. Deliver the finished work itself, not a plan for doing it. Use clear Markdown, with headings or lists where they help. You cannot browse, run code or open files, so work from what you are given and say plainly if something essential is missing.'].join('\n\n');
    const content=[`Task: ${task.title}`,task.description&&`Details:\n${task.description}`,project&&`Project: ${project.name}${project.goal?`\nProject goal: ${project.goal}`:''}`,`Kind of work: ${task.activity}`].filter(Boolean).join('\n\n');
    return {provider:agent.model?.provider||null,model:agent.model?.model||null,system,messages:[{role:'user',content}],policy:'task'};
  }

  function createTaskRunner({getState,persist=()=>{},gateway,artifacts,Core,now=()=>Date.now(),onChange=()=>{},log=()=>{}}){
    const running=new Map();// task id -> {controller, chars}: guards double execution and allows cancelling
    const generated=new Map();// task id -> model result whose output could not be saved; reused on retry
    const S=getState;
    const find=id=>S().tasks.find(t=>t.id===id);
    const agentOf=t=>S().agents.find(a=>a.id===t.assignedAgent);
    function replace(id,fn){const s=S(),k=s.tasks.findIndex(t=>t.id===id);s.tasks[k]=fn(s.tasks[k]);return s.tasks[k]}
    const move=(id,to,extra={})=>replace(id,t=>Core.transitionTask(t,to,{at:now(),...extra}));
    const meta=(id,fn)=>replace(id,t=>({...t,metadata:fn(t.metadata||{})}));
    const phase=(id,p)=>meta(id,m=>({...m,phase:p}));
    const act=(type,text,t)=>Core.recordActivity(S(),{type,text,agentId:t.assignedAgent,taskId:t.id,projectId:t.projectId,at:now()});
    const save=()=>{persist();onChange()};
    const endAttempt=(m,fields)=>({...m,execution:null,phase:null,attempts:(m.attempts||[]).map((a,k,all)=>k===all.length-1?{...a,endedAt:now(),...fields}:a)});
    const stopped=id=>['CANCELLED','FAILED','COMPLETED'].includes(find(id)?.status);

    async function execute(id){
      const task=find(id);
      if(!task||task.status!=='QUEUED'||running.has(id))return {skipped:task?task.status:'missing'};
      const agent=agentOf(task);if(!agent)return {skipped:'unassigned'};
      if(Core.currentTask(S(),agent.id))return {skipped:'agent-busy'};// one task at a time per employee
      const controller=new AbortController(),run={controller,chars:0};running.set(id,run);
      const n=(task.metadata?.attempts?.length||0)+1;
      try{
        // Synchronous up to the first await, so a second call cannot start the same task.
        move(id,'ASSIGNED');
        meta(id,m=>({...m,acknowledged:false,reviewed:false,phase:'starting',execution:{attempt:n,startedAt:now()},attempts:[...(m.attempts||[]),{n,startedAt:now(),provider:agent.model?.provider||null,model:agent.model?.model||null}]}));
        act('task.assigned',`${agent.name} received “${task.title}”${n>1?` (attempt ${n})`:''}.`,task);
        move(id,'PLANNING');phase(id,'thinking');act('task.planning',`${agent.name} started planning “${task.title}”.`,task);save();
        let result=generated.get(id);
        if(result){act('task.reuse',`${agent.name} kept the answer already written and is saving it again.`,task)}
        else{
          if(!agent.model?.provider)throw Error(`${agent.name} has no model yet. Choose a provider under Employee details, then try again.`);
          const project=task.projectId?S().projects.find(p=>p.id===task.projectId):null;
          const request=taskRequest(find(id),agent,project);
          move(id,'RUNNING');act('task.running',`${agent.name} started working on “${task.title}”.`,task);save();
          result=await gateway.stream(request,{signal:controller.signal,onDelta:piece=>{
            if(!run.chars&&find(id)?.status==='RUNNING'){phase(id,'writing');save()}// first words: thinking becomes writing
            run.chars+=piece.length}});
          const text=String(result?.text||'').trim();
          if(!text)throw Object.assign(Error('The model returned an empty answer.'),{code:'EMPTY'});
          result={...result,text,provider:result.provider||request.provider,model:result.model||request.model};
        }
        if(stopped(id)){act('task.discarded',`An answer for “${task.title}” arrived after the task stopped, so it was not saved.`,task);return {skipped:'stopped'}}
        if(find(id).status==='PLANNING')move(id,'RUNNING');
        // The task is only complete once its output is safely stored.
        phase(id,'saving');save();
        const usage={inputTokens:result.usage?.inputTokens??0,outputTokens:result.usage?.outputTokens??0};usage.totalTokens=usage.inputTokens+usage.outputTokens;
        const draft=Core.createArtifact({title:task.title,type:'document',format:'markdown',taskId:id,projectId:task.projectId,creator:agent.id,status:'DRAFT',content:'',createdAt:now()});
        draft.metadata={provider:result.provider,model:result.model,usage,durationMs:result.durationMs??null,attempt:n};
        let artifact;
        try{artifact=await artifacts.save(draft,result.text)}
        catch(error){generated.set(id,result);throw Object.assign(Error(`The answer was written, but saving it failed: ${error.message} Try again to save it.`),{code:'SAVE_FAILED'})}
        generated.delete(id);
        if(stopped(id)){act('task.discarded',`“${task.title}” stopped before its output was recorded.`,task);return {skipped:'stopped'}}
        S().artifacts.push(artifact);
        if(!result.reused&&!result.usageRecorded){
          (S().usage ||= []).push({kind:'task',taskId:id,attempt:n,agentId:agent.id,projectId:task.projectId,provider:result.provider,model:result.model,...usage,durationMs:result.durationMs??null,at:now()});
          S().usage=S().usage.slice(-1000);
        }
        act('task.output',`${agent.name} generated an output for “${task.title}”.`,task);
        move(id,'COMPLETED');replace(id,t=>({...t,artifacts:[...t.artifacts,artifact.id]}));meta(id,m=>endAttempt(m,{outcome:'completed'}));
        act('task.completed',`“${task.title}” is complete and ready for your review.`,task);
        return {ok:true,artifact};
      }catch(error){
        const message=gateway.clean?gateway.clean(error):String(error?.message||error);
        if(error?.code==='SAVE_FAILED'){const kept=generated.get(id);if(kept)generated.set(id,{...kept,usageRecorded:true});
          (S().usage ||= []).push({kind:'task',taskId:id,attempt:n,agentId:agent.id,projectId:task.projectId,provider:kept?.provider,model:kept?.model,inputTokens:kept?.usage?.inputTokens??0,outputTokens:kept?.usage?.outputTokens??0,totalTokens:(kept?.usage?.inputTokens??0)+(kept?.usage?.outputTokens??0),durationMs:kept?.durationMs??null,at:now()})}
        log(error);// technical detail for developers; the person sees the short message
        const current=find(id);
        if(current?.status==='CANCELLED')return {skipped:'cancelled'};
        if(current&&['ASSIGNED','PLANNING','RUNNING'].includes(current.status)){
          if(current.status==='ASSIGNED')move(id,'PLANNING');
          move(id,'FAILED',{error:message});meta(id,m=>endAttempt(m,{outcome:error?.code==='TIMEOUT'?'timed out':'failed',error:message}));
          act('task.failed',`${agent.name} could not finish “${task.title}”: ${message}`,task);
        }
        return {ok:false,error:message,code:error?.code||null};
      }finally{running.delete(id);save()}
    }

    // Stops a running task: the provider request is aborted and the task ends as CANCELLED.
    function cancel(id){const t=find(id);if(!t||!['QUEUED','ASSIGNED','PLANNING','RUNNING'].includes(t.status))return null;
      running.get(id)?.controller.abort();
      move(id,'CANCELLED');meta(id,m=>m.attempts?.length&&m.execution?endAttempt(m,{outcome:'cancelled'}):{...m,phase:null,execution:null});
      act('task.cancelled',`You cancelled “${t.title}”.`,t);save();return find(id)}

    // Retry reuses the same task as a new attempt; history and earlier attempts stay. Only failed tasks retry.
    function retry(id){const t=find(id);if(!t||t.status!=='FAILED'||running.has(id))return null;
      const next=move(id,'QUEUED');meta(id,m=>({...m,acknowledged:false}));act('task.retry',`You asked ${agentOf(t)?.name||'the team'} to try “${t.title}” again.`,t);save();pump();return next}

    // After a reload nothing is running in this session, so unfinished work is reported honestly, never completed.
    function recoverInterrupted(){let changed=false;
      for(const t of [...S().tasks]){if(running.has(t.id))continue;
        if(t.status==='PLANNING'||t.status==='RUNNING'){move(t.id,'FAILED',{error:INTERRUPTED});meta(t.id,m=>endAttempt(m,{outcome:'interrupted',error:INTERRUPTED}));act('task.interrupted',`“${t.title}” stopped because Ruang closed while it was running.`,t);changed=true}
        else if(t.status==='ASSIGNED'&&t.metadata?.execution){move(t.id,'QUEUED');meta(t.id,m=>({...m,execution:null,phase:null}));changed=true}}
      if(changed)save();return changed}

    // Start the oldest queued task for every employee who is free.
    function pump(){for(const agent of S().agents){if(Core.currentTask(S(),agent.id))continue;const next=Core.nextQueuedTask(S(),agent.id);if(next)execute(next.id)}}
    function progress(id){const t=find(id),r=running.get(id);if(!t?.metadata?.phase)return null;return {phase:t.metadata.phase,label:PHASE_LABELS[t.metadata.phase]||'Working',chars:r?.chars||0}}

    return {execute,cancel,retry,recoverInterrupted,pump,progress,isRunning:id=>running.has(id),taskRequest,identityPrompt};
  }

  const api={createTaskRunner,identityPrompt,taskRequest,INTERRUPTED,PHASE_LABELS};
  if(typeof module!=='undefined'&&module.exports){module.exports=api;return}
  root.RuangTaskRunner=api;
  // Browser: one runner over the app's state, started once the page has loaded.
  const runner=createTaskRunner({getState:()=>state,persist:()=>persist(),gateway:root.RuangGateway,artifacts:root.RuangArtifacts,Core:root.RuangCore,
    onChange:()=>{if(view==='Inbox'||view==='Tasks')render()},log:e=>console.warn('[Ruang task]',e)});
  root.RuangTasks=runner;
  runner.recoverInterrupted();
  setInterval(()=>runner.pump(),1000);
  document.addEventListener('click',e=>{const b=e.target.closest('[data-task-cancel]');if(b){b.disabled=true;runner.cancel(b.dataset.taskCancel)}});
})(typeof window!=='undefined'?window:globalThis);
