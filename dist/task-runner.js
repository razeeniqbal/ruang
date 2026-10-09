/* Task service: hands each task to the RUANG AI harness and records what the harness reports in application
   state. The harness (desktop/harness, in the main process) does the work: permissions, approved context,
   model calls, tools, limits, trace and saving the output. This file only maps its events onto tasks,
   approvals, activity and usage, so the office, Inbox and windows all follow the same records.
   Usable in the browser (window.RuangTasks) and in Node for tests (createTaskRunner).

   Canonical state (core.js) stays authoritative: QUEUED, ASSIGNED, PLANNING, RUNNING (NEEDS_APPROVAL while a
   run waits for you), then COMPLETED, FAILED, BLOCKED or CANCELLED. A lighter `metadata.phase` (starting,
   reading, thinking, writing, tool, waiting, saving) says what is happening inside those states. */
(function(root){
  const INTERRUPTED='Ruang closed while this task was running, so it did not finish. Try again to run it.';
  // Observable execution stages, not model thoughts.
  const PHASE_LABELS=Object.freeze({starting:'Getting ready',reading:'Reading selected files',thinking:'Thinking',writing:'Writing',tool:'Using a tool',waiting:'Waiting for your approval',saving:'Saving the result'});
  const identityPrompt=agent=>(root.RuangCore||require('./core.js')).identityPrompt(agent);
  const ACTIVE=['ASSIGNED','PLANNING','RUNNING','NEEDS_APPROVAL'];

  function createTaskRunner({getState,persist=()=>{},harness,Core,now=()=>Date.now(),onChange=()=>{},log=()=>{}}){
    const running=new Map();// task id -> {controller, chars, runId}: guards double execution and allows cancelling
    const S=getState;
    const find=id=>S().tasks.find(t=>t.id===id);
    const agentOf=t=>S().agents.find(a=>a.id===t.assignedAgent);
    function replace(id,fn){const s=S(),k=s.tasks.findIndex(t=>t.id===id);s.tasks[k]=fn(s.tasks[k]);return s.tasks[k]}
    const move=(id,to,extra={})=>replace(id,t=>Core.transitionTask(t,to,{at:now(),...extra}));
    const meta=(id,fn)=>replace(id,t=>({...t,metadata:fn(t.metadata||{})}));
    const phase=(id,p)=>meta(id,m=>({...m,phase:p}));
    const act=(type,text,t)=>Core.recordActivity(S(),{type,text,agentId:t.assignedAgent,taskId:t.id,projectId:t.projectId,at:now()});
    const save=()=>{persist();onChange()};
    const lastAttempt=(id,fields)=>meta(id,m=>({...m,attempts:(m.attempts||[]).map((a,k,all)=>k===all.length-1?{...a,...fields}:a)}));
    const endAttempt=(m,fields)=>({...m,execution:null,phase:null,attempts:(m.attempts||[]).map((a,k,all)=>k===all.length-1?{...a,endedAt:now(),...fields}:a)});
    const stopped=id=>['CANCELLED','FAILED','COMPLETED','BLOCKED'].includes(find(id)?.status);
    const cancelApprovals=(id,decision='cancel')=>{for(const [k,a] of (S().approvals||[]).entries())if(a.taskId===id&&a.status==='PENDING'&&a.runId)S().approvals[k]=Core.decideApproval(a,decision,{at:now()})};

    // Harness events -> task state. The office and windows read only the state written here.
    function onEvent(id,run,agent,task,e){
      if(stopped(id)){run.controller.abort();return}// stopped elsewhere: tell the harness at its next step
      const startRunning=()=>{if(find(id).status==='PLANNING'){move(id,'RUNNING');act('task.running',`${agent.name} started working on “${task.title}”.`,task)}};
      switch(e.type){
        case 'run.started':run.runId=e.runId;lastAttempt(id,{runId:e.runId});break;
        case 'context.loading':startRunning();phase(id,'reading');save();break;
        case 'context.loaded':act('task.context',`${agent.name} read ${e.files===1?'1 approved file':`${e.files} approved files`}.`,task);save();break;
        case 'model.started':startRunning();phase(id,'thinking');run.writing=false;save();break;
        case 'model.delta':run.chars+=e.chars||0;if(!run.writing&&find(id).status==='RUNNING'){run.writing=true;phase(id,'writing');save()}break;// first words: thinking becomes writing
        case 'model.fallback':act('task.fallback',`${e.summary}`,task);save();break;
        case 'tool.started':phase(id,'tool');save();break;
        case 'tool.approval_required':{const a=e.approval;
          (S().approvals ||= []).push({...Core.createApproval({id:a.id,requestingAgent:agent.id,taskId:id,projectId:task.projectId,requestedAction:a.requestedAction,reason:a.reason,risk:a.risk,createdAt:now()}),runId:a.runId});
          if(find(id).status==='RUNNING')move(id,'NEEDS_APPROVAL');phase(id,'waiting');act('task.approval',`${agent.name} is waiting for your approval: ${a.requestedAction}.`,task);save();break}
        case 'tool.approval_decided':{const k=(S().approvals||[]).findIndex(a=>a.id===e.approvalId);
          if(k>=0&&S().approvals[k].status==='PENDING')S().approvals[k]=Core.decideApproval(S().approvals[k],e.decision==='approve'?'approve':e.decision==='reject'?'reject':'cancel',{at:now()});
          if(find(id).status==='NEEDS_APPROVAL'&&e.decision!=='timeout')move(id,'RUNNING');phase(id,'thinking');save();break}
        case 'artifact.saving':phase(id,'saving');save();break;
      }
    }

    async function execute(id){
      const task=find(id);
      if(!task||task.status!=='QUEUED'||running.has(id))return {skipped:task?task.status:'missing'};
      const agent=agentOf(task);if(!agent)return {skipped:'unassigned'};
      if(Core.currentTask(S(),agent.id))return {skipped:'agent-busy'};// one task at a time per employee
      const controller=new AbortController(),run={controller,chars:0,runId:null,writing:false};running.set(id,run);
      const n=(task.metadata?.attempts?.length||0)+1;
      try{
        // Synchronous up to the harness's first wait, so a second call cannot start the same task.
        move(id,'ASSIGNED');
        meta(id,m=>({...m,acknowledged:false,reviewed:false,phase:'starting',execution:{attempt:n,startedAt:now()},attempts:[...(m.attempts||[]),{n,startedAt:now(),provider:agent.model?.provider||null,model:agent.model?.model||null}]}));
        act('task.assigned',`${agent.name} received “${task.title}”${n>1?` (attempt ${n})`:''}.`,task);
        move(id,'PLANNING');phase(id,'thinking');act('task.planning',`${agent.name} started planning “${task.title}”.`,task);save();
        const project=task.projectId?S().projects.find(p=>p.id===task.projectId):null;
        const t=find(id);
        const result=await harness.execute({task:{id,title:t.title,description:t.description,activity:t.activity},employee:agent,project:project&&{id:project.id,name:project.name,goal:project.goal},context:t.context,attempt:n},
          {signal:controller.signal,onEvent:e=>{try{onEvent(id,run,agent,task,e)}catch(error){log(error)}}});
        return finish(id,run,agent,task,n,result);
      }catch(error){
        log(error);
        return finish(id,run,agent,task,n,{status:'FAILED',error:{code:error?.code||null,message:String(error?.message||error)}});
      }finally{running.delete(id);save()}
    }

    function recordUsage(id,agent,task,n,result){
      const u=result.usage;if(!u)return null;// none when no model call finished, or when an earlier answer was reused
      const usage={inputTokens:u.inputTokens??0,outputTokens:u.outputTokens??0};usage.totalTokens=usage.inputTokens+usage.outputTokens;
      (S().usage ||= []).push({kind:'task',taskId:id,attempt:n,runId:result.run?.id||null,agentId:agent.id,projectId:task.projectId,provider:result.run?.provider||null,model:result.run?.model||null,...usage,durationMs:u.durationMs??null,at:now()});
      S().usage=S().usage.slice(-1000);return usage;
    }

    function finish(id,run,agent,task,n,result){
      const usage=recordUsage(id,agent,task,n,result),summary=result.run||{};
      const attempt={runId:summary.id||run.runId,provider:summary.provider||null,model:summary.model||null,modelCalls:summary.modelCalls??0,toolCalls:summary.toolCalls??0,contextFiles:summary.contextFiles?.length??0};
      const current=find(id);
      if(result.status==='COMPLETED'){
        // The output is already durably saved; it is only recorded if the task is still meant to finish.
        if(stopped(id)){act('task.discarded',`An output for “${task.title}” arrived after the task stopped, so it was not kept.`,task);return {skipped:'stopped'}}
        if(current.status==='PLANNING')move(id,'RUNNING');
        if(current.status==='NEEDS_APPROVAL')move(id,'RUNNING');
        const a=result.artifact,p=a.provenance||{};
        const {content:_none,...base}=Core.createArtifact({id:a.id,title:task.title,type:'document',format:a.format||'markdown',taskId:id,projectId:task.projectId,creator:agent.id,status:'DRAFT',createdAt:now()});
        const artifact={...base,storage:'file',file:a.file,size:a.size,sha256:a.sha256,preview:a.preview,
          metadata:{provider:p.provider||summary.provider,model:p.model||summary.model,usage,durationMs:usage?result.usage.durationMs??null:null,attempt:n,runId:p.runId||summary.id,contextFiles:p.contextFiles||[],modelCalls:p.modelCalls??0,toolCalls:p.toolCalls??0,approvals:p.approvals??0,runDurationMs:summary.durationMs??null}};
        S().artifacts.push(artifact);
        act('task.output',`${agent.name} generated an output for “${task.title}”.`,task);
        move(id,'COMPLETED');replace(id,t=>({...t,artifacts:[...t.artifacts,artifact.id]}));meta(id,m=>endAttempt(m,{...attempt,outcome:'completed'}));
        act('task.completed',`“${task.title}” is complete and ready for your review.`,task);
        return {ok:true,artifact};
      }
      const message=result.error?.message||'The task failed.',code=result.error?.code||null;
      cancelApprovals(id);
      if(current?.status==='CANCELLED'){if(current.metadata?.execution)meta(id,m=>endAttempt(m,{...attempt,outcome:'cancelled'}));return {skipped:'cancelled'}}
      if(current&&ACTIVE.includes(current.status)){
        if(current.status==='ASSIGNED')move(id,'PLANNING');
        if(result.status==='CANCELLED'){move(id,'CANCELLED');meta(id,m=>endAttempt(m,{...attempt,outcome:'cancelled',error:message}));act('task.cancelled',message,task);return {skipped:'cancelled'}}
        if(result.status==='BLOCKED'){if(find(id).status==='PLANNING')move(id,'RUNNING');move(id,'BLOCKED');replace(id,t=>({...t,error:message}));meta(id,m=>endAttempt(m,{...attempt,outcome:'blocked',error:message}));act('task.blocked',`“${task.title}” is waiting for you: ${message}`,task);return {ok:false,error:message,code}}
        move(id,'FAILED',{error:message});meta(id,m=>endAttempt(m,{...attempt,outcome:code==='TIMEOUT'?'timed out':'failed',error:message}));
        act('task.failed',`${agent.name} could not finish “${task.title}”: ${message}`,task);
      }
      return {ok:false,error:message,code};
    }

    // Stops a running task: the harness run is aborted (model request included) and the task ends as CANCELLED.
    function cancel(id){const t=find(id);if(!t||!['QUEUED',...ACTIVE].includes(t.status))return null;
      running.get(id)?.controller.abort();cancelApprovals(id);
      move(id,'CANCELLED');meta(id,m=>m.attempts?.length&&m.execution?endAttempt(m,{outcome:'cancelled'}):{...m,phase:null,execution:null});
      act('task.cancelled',`You cancelled “${t.title}”.`,t);save();return find(id)}

    // An Inbox decision on a run's approval. The harness resumes the run; its events update the task.
    // If no run is waiting (for example after a restart), the approval is closed instead.
    async function decide(approvalId,approve){
      const k=(S().approvals||[]).findIndex(a=>a.id===approvalId);if(k<0||S().approvals[k].status!=='PENDING')return false;
      const waiting=await harness.decide(approvalId,approve?'approve':'reject');
      if(!waiting&&S().approvals[k].status==='PENDING'){S().approvals[k]=Core.decideApproval(S().approvals[k],'cancel',{at:now()});save()}
      return !!waiting;
    }

    // Retry reuses the same task as a new attempt and a new run; history and earlier runs stay.
    function retry(id){const t=find(id);if(!t||!['FAILED','BLOCKED'].includes(t.status)||running.has(id))return null;
      const next=move(id,'QUEUED');meta(id,m=>({...m,acknowledged:false}));act('task.retry',`You asked ${agentOf(t)?.name||'the team'} to try “${t.title}” again.`,t);save();pump();return next}

    // After a reload nothing is running in this session, so unfinished work is reported honestly, never completed.
    function recoverInterrupted(){let changed=false;
      for(const t of [...S().tasks]){if(running.has(t.id))continue;
        if(['PLANNING','RUNNING','NEEDS_APPROVAL'].includes(t.status)&&(t.status!=='NEEDS_APPROVAL'||t.metadata?.execution)){cancelApprovals(t.id);move(t.id,'FAILED',{error:INTERRUPTED});meta(t.id,m=>endAttempt(m,{outcome:'interrupted',error:INTERRUPTED}));act('task.interrupted',`“${t.title}” stopped because Ruang closed while it was running.`,t);changed=true}
        else if(t.status==='ASSIGNED'&&t.metadata?.execution){move(t.id,'QUEUED');meta(t.id,m=>({...m,execution:null,phase:null}));changed=true}}
      if(changed)save();return changed}

    // Start the oldest queued task for every employee who is free.
    function pump(){for(const agent of S().agents){if(Core.currentTask(S(),agent.id))continue;const next=Core.nextQueuedTask(S(),agent.id);if(next)execute(next.id)}}
    function progress(id){const t=find(id),r=running.get(id);if(!t?.metadata?.phase)return null;return {phase:t.metadata.phase,label:PHASE_LABELS[t.metadata.phase]||'Working',chars:r?.chars||0}}

    return {execute,cancel,retry,decide,recoverInterrupted,pump,progress,isRunning:id=>running.has(id),identityPrompt};
  }

  const api={createTaskRunner,identityPrompt,INTERRUPTED,PHASE_LABELS};
  if(typeof module!=='undefined'&&module.exports){module.exports=api;return}
  root.RuangTaskRunner=api;
  // Browser: one runner over the app's state, started once the page has loaded.
  const runner=createTaskRunner({getState:()=>state,persist:()=>persist(),harness:root.RuangHarness,Core:root.RuangCore,
    onChange:()=>{if(view==='Inbox'||view==='Tasks')render()},log:e=>console.warn('[Ruang task]',e)});
  root.RuangTasks=runner;
  runner.recoverInterrupted();
  setInterval(()=>runner.pump(),1000);
  document.addEventListener('click',e=>{const b=e.target.closest('[data-task-cancel]');if(b){b.disabled=true;runner.cancel(b.dataset.taskCancel)}});
})(typeof window!=='undefined'?window:globalThis);
