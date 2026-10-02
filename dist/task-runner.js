/* Task execution service: runs a task through the model gateway and records everything in application state.
   The office only follows the task state this service writes; it never decides when work is done.
   Usable in the browser (window.RuangTasks) and in Node for tests (createTaskRunner). */
(function(root){
  const ACTIVE=new Set(['ASSIGNED','PLANNING','RUNNING','WAITING','NEEDS_APPROVAL','BLOCKED']);
  const INTERRUPTED='Ruang closed while this task was running, so it did not finish. Try again to run it.';

  function identityPrompt(agent){
    return [`You are ${agent.name}, the ${agent.role} on a small team working inside Ruang, a shared digital workspace where a person works with a team of AI employees.`,
      agent.description,(agent.responsibilities||[]).length?'Your responsibilities:\n'+agent.responsibilities.map(r=>'- '+r).join('\n'):'',agent.instructions].filter(Boolean).join('\n\n');
  }
  function taskRequest(task,agent,project){
    const system=[identityPrompt(agent),'You are completing a task your teammate assigned to you. Deliver the finished work itself, not a plan for doing it. Use clear Markdown, with headings or lists where they help. You cannot browse, run code or open files, so work from what you are given and say plainly if something essential is missing.'].join('\n\n');
    const content=[`Task: ${task.title}`,task.description&&`Details:\n${task.description}`,project&&`Project: ${project.name}${project.goal?`\nProject goal: ${project.goal}`:''}`,`Kind of work: ${task.activity}`].filter(Boolean).join('\n\n');
    return {provider:agent.model?.provider||null,model:agent.model?.model||null,system,messages:[{role:'user',content}]};
  }

  function createTaskRunner({getState,persist=()=>{},gateway,Core,now=()=>Date.now(),onChange=()=>{},onEvent=()=>{},log=()=>{}}){
    const inflight=new Set();// guards against double execution inside this session
    const S=getState;
    const find=id=>S().tasks.find(t=>t.id===id);
    const agentOf=t=>S().agents.find(a=>a.id===t.assignedAgent);
    function replace(id,fn){const s=S(),k=s.tasks.findIndex(t=>t.id===id);s.tasks[k]=fn(s.tasks[k]);return s.tasks[k]}
    const move=(id,to,extra={})=>replace(id,t=>Core.transitionTask(t,to,{at:now(),...extra}));
    const meta=(id,fn)=>replace(id,t=>({...t,metadata:fn(t.metadata||{})}));
    const act=(type,text,t)=>Core.recordActivity(S(),{type,text,agentId:t.assignedAgent,taskId:t.id,projectId:t.projectId,at:now()});
    const save=()=>{persist();onChange()};
    const endAttempt=(m,fields)=>({...m,execution:null,attempts:(m.attempts||[]).map((a,k,all)=>k===all.length-1?{...a,endedAt:now(),...fields}:a)});

    async function execute(id){
      const task=find(id);
      if(!task||task.status!=='QUEUED'||inflight.has(id))return {skipped:task?task.status:'missing'};
      const agent=agentOf(task);if(!agent)return {skipped:'unassigned'};
      if(Core.currentTask(S(),agent.id))return {skipped:'agent-busy'};// one task at a time per employee
      inflight.add(id);
      const n=(task.metadata?.attempts?.length||0)+1;
      try{
        // Synchronous before the first await, so a second call cannot start the same task.
        move(id,'ASSIGNED');
        meta(id,m=>({...m,acknowledged:false,reviewed:false,execution:{attempt:n,startedAt:now()},attempts:[...(m.attempts||[]),{n,startedAt:now(),provider:agent.model?.provider||null,model:agent.model?.model||null}]}));
        act('task.assigned',`${agent.name} received “${task.title}”${n>1?` (attempt ${n})`:''}.`,task);
        move(id,'PLANNING');act('task.planning',`${agent.name} started planning “${task.title}”.`,task);save();
        if(!agent.model?.provider)throw Error(`${agent.name} has no model yet. Choose a provider under Employee details, then try again.`);
        const project=task.projectId?S().projects.find(p=>p.id===task.projectId):null;
        const request=taskRequest(find(id),agent,project);
        move(id,'RUNNING');act('task.running',`${agent.name} started working on “${task.title}”.`,task);save();
        const result=await gateway.generate(request,{onEvent:e=>onEvent(id,e)});
        const text=String(result?.text||'').trim();
        if(!text)throw Error('The model returned an empty answer.');
        if(find(id)?.status!=='RUNNING'){act('task.discarded',`An answer for “${task.title}” arrived after the task stopped, so it was not saved.`,task);return {skipped:'stopped'}}
        const usage={inputTokens:result.usage?.inputTokens??0,outputTokens:result.usage?.outputTokens??0};usage.totalTokens=usage.inputTokens+usage.outputTokens;
        const artifact=Core.createArtifact({title:task.title,type:'document',format:'markdown',taskId:id,projectId:task.projectId,creator:agent.id,status:'DRAFT',content:text,createdAt:now()});
        artifact.metadata={provider:result.provider||request.provider,model:result.model||request.model,usage,durationMs:result.durationMs??null,attempt:n};
        S().artifacts.push(artifact);
        (S().usage ||= []).push({kind:'task',taskId:id,agentId:agent.id,projectId:task.projectId,provider:artifact.metadata.provider,model:artifact.metadata.model,...usage,durationMs:artifact.metadata.durationMs,at:now()});
        S().usage=S().usage.slice(-1000);
        act('task.output',`${agent.name} generated an output for “${task.title}”.`,task);
        move(id,'COMPLETED');replace(id,t=>({...t,artifacts:[...t.artifacts,artifact.id]}));meta(id,m=>endAttempt(m,{outcome:'completed'}));
        act('task.completed',`“${task.title}” is complete and ready for your review.`,task);
        return {ok:true,artifact};
      }catch(error){
        const message=gateway.clean?gateway.clean(error):String(error?.message||error);
        log(error);// technical detail for developers; the person sees the short message
        const current=find(id);
        if(current&&['PLANNING','RUNNING'].includes(current.status)){
          move(id,'FAILED',{error:message});meta(id,m=>endAttempt(m,{outcome:'failed',error:message}));
          act('task.failed',`${agent.name} could not finish “${task.title}”: ${message}`,task);
        }
        return {ok:false,error:message};
      }finally{inflight.delete(id);save()}
    }

    // Retry reuses the same task: history and earlier attempts stay; only failed tasks can be retried.
    function retry(id){const t=find(id);if(!t||t.status!=='FAILED'||inflight.has(id))return null;
      const next=move(id,'QUEUED');meta(id,m=>({...m,acknowledged:false}));act('task.retry',`You asked ${agentOf(t)?.name||'the team'} to try “${t.title}” again.`,t);save();pump();return next}

    // After a reload nothing is running in this session, so unfinished work is reported honestly, never completed.
    function recoverInterrupted(){let changed=false;
      for(const t of [...S().tasks]){if(inflight.has(t.id))continue;
        if(t.status==='PLANNING'||t.status==='RUNNING'){move(t.id,'FAILED',{error:INTERRUPTED});meta(t.id,m=>endAttempt(m,{outcome:'interrupted',error:INTERRUPTED}));act('task.interrupted',`“${t.title}” stopped because Ruang closed while it was running.`,t);changed=true}
        else if(t.status==='ASSIGNED'&&t.metadata?.execution){move(t.id,'QUEUED');meta(t.id,m=>({...m,execution:null}));changed=true}}
      if(changed)save();return changed}

    // Start the oldest queued task for every employee who is free.
    function pump(){for(const agent of S().agents){if(Core.currentTask(S(),agent.id))continue;const next=Core.nextQueuedTask(S(),agent.id);if(next)execute(next.id)}}

    return {execute,retry,recoverInterrupted,pump,isRunning:id=>inflight.has(id),taskRequest,identityPrompt};
  }

  const api={createTaskRunner,identityPrompt,taskRequest,INTERRUPTED,ACTIVE};
  if(typeof module!=='undefined'&&module.exports){module.exports=api;return}
  root.RuangTaskRunner=api;
  // Browser: one runner over the app's state, started once the page has loaded.
  const runner=createTaskRunner({getState:()=>state,persist:()=>persist(),gateway:root.RuangGateway,Core:root.RuangCore,
    onChange:()=>{if(view==='Inbox'||view==='Tasks')render()},log:e=>console.warn('[Ruang task]',e)});
  root.RuangTasks=runner;
  runner.recoverInterrupted();
  setInterval(()=>runner.pump(),1000);
})(typeof window!=='undefined'?window:globalThis);
