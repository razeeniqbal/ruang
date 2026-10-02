/* Ruang core domain: schema, migration, task and approval state machines, agent status and permissions.
   Pure functions over the saved `state` object, loadable in the browser (window.RuangCore) and in Node for tests.
   V1 fields are kept so existing views continue to work while V2 views move onto the new records. */
(function(root){
  const SCHEMA_VERSION=2;

  // ---- Tasks ---------------------------------------------------------------------------------
  const TASK_STATES=['DRAFT','QUEUED','ASSIGNED','PLANNING','RUNNING','WAITING','NEEDS_APPROVAL','BLOCKED','FAILED','COMPLETED','CANCELLED'];
  const TASK_TRANSITIONS={
    DRAFT:['QUEUED','ASSIGNED','CANCELLED'],
    QUEUED:['ASSIGNED','PLANNING','RUNNING','CANCELLED'],
    ASSIGNED:['QUEUED','PLANNING','RUNNING','CANCELLED'],
    PLANNING:['RUNNING','WAITING','NEEDS_APPROVAL','BLOCKED','FAILED','CANCELLED'],
    RUNNING:['WAITING','NEEDS_APPROVAL','BLOCKED','FAILED','COMPLETED','CANCELLED'],
    WAITING:['RUNNING','BLOCKED','FAILED','CANCELLED'],
    NEEDS_APPROVAL:['RUNNING','COMPLETED','BLOCKED','FAILED','CANCELLED'],
    BLOCKED:['QUEUED','RUNNING','FAILED','CANCELLED'],
    FAILED:['QUEUED','CANCELLED'],
    COMPLETED:[],
    CANCELLED:[]
  };
  const ACTIVE_TASK_STATES=new Set(['ASSIGNED','PLANNING','RUNNING','WAITING','NEEDS_APPROVAL','BLOCKED']);
  const OPEN_TASK_STATES=new Set(['DRAFT','QUEUED',...ACTIVE_TASK_STATES]);
  // Activity kinds describe what the work is; the office maps them to places and the status vocabulary.
  const ACTIVITIES=['planning','research','analysis','coding','writing','review','collaboration','tool'];

  const newId=prefix=>`${prefix}-${(root.crypto?.randomUUID?.()||Math.random().toString(36).slice(2)+Date.now().toString(36))}`;

  function createTask(fields={}){
    const now=fields.createdAt??Date.now();
    return {id:fields.id||newId('task'),title:String(fields.title||'Untitled task'),description:fields.description||'',projectId:fields.projectId??null,
      assignedAgent:fields.assignedAgent??null,createdBy:fields.createdBy||'user',priority:fields.priority||'normal',status:fields.status||(fields.assignedAgent?'QUEUED':'DRAFT'),
      activity:ACTIVITIES.includes(fields.activity)?fields.activity:'coding',createdAt:now,startedAt:fields.startedAt??null,completedAt:fields.completedAt??null,
      artifacts:fields.artifacts||[],dependencies:fields.dependencies||[],approvalRequirements:fields.approvalRequirements||[],error:fields.error??null,metadata:fields.metadata||{}};
  }
  function canTransition(from,to){return (TASK_TRANSITIONS[from]||[]).includes(to)}
  // Returns a new task; throws on an illegal move so callers cannot silently corrupt state.
  function transitionTask(task,to,{at=Date.now(),error=null}={}){
    if(!TASK_STATES.includes(to))throw Error(`Unknown task state ${to}.`);
    if(task.status===to)return task;
    if(!canTransition(task.status,to))throw Error(`A task cannot move from ${task.status} to ${to}.`);
    const next={...task,status:to};
    if((to==='RUNNING'||to==='PLANNING')&&!next.startedAt)next.startedAt=at;
    if(to==='COMPLETED'||to==='CANCELLED'||to==='FAILED')next.completedAt=at;
    if(to==='FAILED')next.error=error||next.error||'The task failed.';
    if(to==='QUEUED'||to==='RUNNING')next.error=null;
    return next;
  }

  // ---- Approvals -----------------------------------------------------------------------------
  const APPROVAL_STATES=['PENDING','APPROVED','REJECTED','CANCELLED'];
  function createApproval(fields={}){
    return {id:fields.id||newId('approval'),requestingAgent:fields.requestingAgent??null,taskId:fields.taskId??null,projectId:fields.projectId??null,
      requestedAction:String(fields.requestedAction||'Continue'),reason:fields.reason||'',risk:fields.risk||'',createdAt:fields.createdAt??Date.now(),
      status:'PENDING',decision:null,decisionAt:null};
  }
  function decideApproval(approval,decision,{at=Date.now()}={}){
    const to={approve:'APPROVED',reject:'REJECTED',cancel:'CANCELLED'}[decision];
    if(!to)throw Error(`Unknown approval decision ${decision}.`);
    if(approval.status!=='PENDING')throw Error('This approval has already been decided.');
    return {...approval,status:to,decision,decisionAt:at};
  }

  // ---- Agents --------------------------------------------------------------------------------
  const AUTONOMY=['SUPERVISED','BALANCED','AUTONOMOUS'];
  const PERMISSIONS=['readFiles','writeFiles','createFiles','runCode','useBrowser','useTerminal','useApis','gitCommit','gitPush','deleteFiles','externalActions'];
  // Actions that always need a person unless the permission is explicitly ALLOW, whatever the autonomy.
  const SENSITIVE=new Set(['deleteFiles','gitPush','externalActions','useTerminal','runCode']);
  const DEFAULT_PERMISSIONS=Object.freeze({readFiles:'ALLOW',writeFiles:'ASK',createFiles:'ASK',runCode:'ASK',useBrowser:'ASK',useTerminal:'DENY',useApis:'ASK',gitCommit:'ASK',gitPush:'DENY',deleteFiles:'DENY',externalActions:'DENY'});
  const PROVIDERS={OpenAI:'openai',Anthropic:'anthropic',Google:'google',Ollama:'local'};

  // ALLOW, ASK or DENY. Autonomy only removes the question for ordinary actions set to ASK;
  // sensitive actions keep asking unless the permission itself says ALLOW.
  function permissionDecision(agent,permission){
    if(!PERMISSIONS.includes(permission))return 'DENY';
    const setting=agent?.permissions?.[permission]||DEFAULT_PERMISSIONS[permission];
    if(setting!=='ASK')return setting;
    if(agent?.autonomy==='AUTONOMOUS'&&!SENSITIVE.has(permission))return 'ALLOW';
    return 'ASK';
  }

  // Status vocabulary shown in the office and panels, with how loudly each should be shown.
  const STATUS_PROMINENCE=Object.freeze({IDLE:'none',WORKING:'subtle',THINKING:'subtle',RESEARCHING:'subtle',TOOL_RUNNING:'subtle',COLLABORATING:'subtle',
    WAITING:'visible',NEEDS_APPROVAL:'prominent',BLOCKED:'prominent',ERROR:'prominent',COMPLETE:'temporary',OFFLINE:'visible'});
  const STATUS_LABELS=Object.freeze({IDLE:'Idle',WORKING:'Working',THINKING:'Thinking',RESEARCHING:'Researching',TOOL_RUNNING:'Using a tool',COLLABORATING:'Collaborating',
    WAITING:'Waiting',NEEDS_APPROVAL:'Needs approval',BLOCKED:'Blocked',ERROR:'Error',COMPLETE:'Complete',OFFLINE:'Offline'});
  const ACTIVITY_STATUS={planning:'THINKING',research:'RESEARCHING',analysis:'WORKING',coding:'WORKING',writing:'WORKING',review:'WORKING',collaboration:'COLLABORATING',tool:'TOOL_RUNNING'};

  function currentTask(state,agentId){
    const mine=(state.tasks||[]).filter(t=>t.assignedAgent===agentId&&ACTIVE_TASK_STATES.has(t.status));
    const rank={NEEDS_APPROVAL:0,BLOCKED:1,RUNNING:2,PLANNING:2,WAITING:3,ASSIGNED:4};
    return mine.sort((a,b)=>(rank[a.status]??9)-(rank[b.status]??9)||a.createdAt-b.createdAt)[0]||null;
  }
  function nextQueuedTask(state,agentId){return (state.tasks||[]).filter(t=>t.assignedAgent===agentId&&t.status==='QUEUED').sort((a,b)=>a.createdAt-b.createdAt)[0]||null}
  // Derived from records, never from animation: approvals first, then the current task's state and activity.
  function agentStatus(state,agentId,{now=Date.now(),completeFor=3000}={}){
    const agent=(state.agents||[]).find(a=>a.id===agentId);
    if(!agent)return 'OFFLINE';
    if((state.approvals||[]).some(a=>a.status==='PENDING'&&a.requestingAgent===agentId))return 'NEEDS_APPROVAL';
    const task=currentTask(state,agentId);
    if(task){
      if(task.status==='NEEDS_APPROVAL')return 'NEEDS_APPROVAL';
      if(task.status==='BLOCKED')return 'BLOCKED';
      if(task.status==='WAITING')return 'WAITING';
      if(task.status==='PLANNING'||(task.status==='RUNNING'&&task.metadata?.phase==='thinking'))return 'THINKING';
      return ACTIVITY_STATUS[task.activity]||'WORKING';// ASSIGNED means on the way to start this work
    }
    const recent=(state.tasks||[]).filter(t=>t.assignedAgent===agentId&&t.completedAt&&now-t.completedAt<completeFor).sort((a,b)=>b.completedAt-a.completedAt)[0];
    if(recent?.status==='FAILED')return 'ERROR';
    if(recent?.status==='COMPLETED')return 'COMPLETE';
    if((state.tasks||[]).some(t=>t.assignedAgent===agentId&&t.status==='FAILED'&&!t.metadata?.acknowledged))return 'ERROR';
    return 'IDLE';
  }

  // ---- Activity and artifacts ------------------------------------------------------------------
  // Structured activity; also mirrored as text into V1 `events` so the existing activity views stay current.
  function recordActivity(state,{type,text,agentId=null,taskId=null,projectId=null,at=Date.now()}){
    state.activity ||= [];
    state.activity.unshift({id:newId('activity'),type,text,agentId,taskId,projectId,at});
    state.activity=state.activity.slice(0,500);
    state.events ||= [];
    state.events.unshift({text,time:new Date(at).toLocaleTimeString([],{hour:'2-digit',minute:'2-digit'}),projectId});
    state.events=state.events.slice(0,100);
  }
  function createArtifact(fields={}){
    return {id:fields.id||newId('artifact'),title:String(fields.title||'Untitled output'),type:fields.type||'document',format:fields.format||'markdown',
      taskId:fields.taskId??null,projectId:fields.projectId??null,creator:fields.creator??null,createdAt:fields.createdAt??Date.now(),version:fields.version||1,
      status:fields.status||'DRAFT',content:fields.content??'',file:fields.file??null};
  }

  // ---- Inbox ---------------------------------------------------------------------------------
  // Everything that needs a person, newest first. Kinds: approval, question, blocked, failed, review.
  function inboxItems(state){
    const items=[];
    for(const a of state.approvals||[])if(a.status==='PENDING')items.push({kind:'approval',id:a.id,at:a.createdAt,agentId:a.requestingAgent,taskId:a.taskId,projectId:a.projectId,record:a});
    for(const t of state.tasks||[]){
      if(t.status==='BLOCKED')items.push({kind:'blocked',id:t.id,at:t.startedAt||t.createdAt,agentId:t.assignedAgent,taskId:t.id,projectId:t.projectId,record:t});
      else if(t.status==='FAILED'&&!t.metadata?.acknowledged)items.push({kind:'failed',id:t.id,at:t.completedAt||t.createdAt,agentId:t.assignedAgent,taskId:t.id,projectId:t.projectId,record:t});
      else if(t.status==='COMPLETED'&&!t.metadata?.reviewed)items.push({kind:'review',id:t.id,at:t.completedAt||t.createdAt,agentId:t.assignedAgent,taskId:t.id,projectId:t.projectId,record:t});
    }
    for(const q of state.questions||[])if(q.status==='OPEN')items.push({kind:'question',id:q.id,at:q.createdAt,agentId:q.agentId,taskId:q.taskId,projectId:q.projectId,record:q});
    return items.sort((a,b)=>b.at-a.at);
  }

  // ---- Migration -------------------------------------------------------------------------------
  const V1_STATUS={Queued:'QUEUED',Running:'RUNNING',Completed:'COMPLETED',Paused:'BLOCKED'};
  function migrateAgent(a,i){
    const agent={...a};
    agent.id ||= `agent-${i+1}`;
    agent.role ||= 'Teammate';
    agent.description ??= '';
    agent.responsibilities ||= [];
    agent.instructions ??= '';
    agent.skills ||= [];
    agent.tools ||= [];
    agent.model ||= {provider:PROVIDERS[a.provider]||null,model:null};
    agent.fallbackModel ??= null;
    agent.autonomy=AUTONOMY.includes(agent.autonomy)?agent.autonomy:'BALANCED';
    agent.permissions={...DEFAULT_PERMISSIONS,...(agent.permissions||{})};
    agent.appearance ||= {preset:i};// the look stays what it was; it is no longer tied to the role
    agent.workspaceAccess ||= 'workspace';
    agent.projectAccess ||= 'all';
    agent.initial ||= String(agent.name||'?')[0].toUpperCase();
    return agent;
  }
  function moveKey(map,from,to){if(map&&from!==to&&map[from]!==undefined&&map[to]===undefined){map[to]=map[from];delete map[from]}}

  // Safe to run on every load: missing records get defaults, older shapes are converted, nothing is dropped.
  function migrate(raw,defaults){
    let state=raw&&typeof raw==='object'&&Array.isArray(raw.agents)&&Array.isArray(raw.projects)?raw:(defaults?defaults():{agents:[],projects:[],events:[]});
    state.events ||= [];
    const before=state.schemaVersion||1;
    state.agents=state.agents.map((a,i)=>{const hadId=!!a.id,agent=migrateAgent(a,i);if(!hadId){moveKey(state.agentAppearance,`employee-${i}`,agent.id);moveKey(state.officeChat,`employee-${i}`,agent.id)}return agent});
    state.workspace ||= {id:'local',name:'Local workspace',kind:'local'};
    state.tasks ||= [];
    state.approvals ||= [];
    state.artifacts ||= [];
    state.activity ||= [];
    state.questions ||= [];
    if(Array.isArray(state.officeTasks)&&state.officeTasks.length){
      for(const t of state.officeTasks){
        if(state.tasks.some(x=>x.id===t.id))continue;
        const status=V1_STATUS[t.status]||'QUEUED';
        state.tasks.push(createTask({id:t.id,title:t.title,assignedAgent:state.agents[t.agent]?.id??null,activity:t.kind==='analysis'?'analysis':t.kind,status,
          completedAt:status==='COMPLETED'?Date.now():null,metadata:{demo:true,remainingMs:t.remainingMs??14000,reviewed:status==='COMPLETED',output:t.output||null}}));
      }
    }
    delete state.officeTasks;
    syncProjectApprovals(state);
    state.schemaVersion=SCHEMA_VERSION;
    if(before<SCHEMA_VERSION)state.migratedFrom=before;
    return state;
  }

  // The V1 demo runner tracks approval as a project status; keep a real approval record in step with it.
  function syncProjectApprovals(state){
    let changed=false;
    for(const p of state.projects||[]){
      const pending=(state.approvals||[]).find(a=>a.projectId===p.id&&a.status==='PENDING');
      if(p.status==='Waiting approval'&&!pending){
        state.approvals.push(createApproval({requestingAgent:state.agents[0]?.id??null,projectId:p.id,requestedAction:'Save the final report',
          reason:`The plan for "${p.name}" is finished and the report is ready to save.`,risk:'Creates a report under Files. No external files change and nothing is sent.'}));
        changed=true;
      }else if(pending&&p.status!=='Waiting approval'){
        Object.assign(pending,decideApproval(pending,p.status==='Completed'?'approve':'reject'));changed=true;
      }
      // An approved report becomes a durable output, not just text on the project.
      if(p.output&&!(state.artifacts||[]).some(a=>a.projectId===p.id&&a.type==='report')){
        (state.artifacts ||= []).push(createArtifact({title:`${p.name} report`,type:'report',projectId:p.id,creator:state.agents[0]?.id??null,status:'APPROVED',content:p.output}));changed=true;
      }
    }
    return changed;
  }

  const api={SCHEMA_VERSION,TASK_STATES,TASK_TRANSITIONS,ACTIVE_TASK_STATES,OPEN_TASK_STATES,ACTIVITIES,APPROVAL_STATES,AUTONOMY,PERMISSIONS,DEFAULT_PERMISSIONS,SENSITIVE,
    STATUS_PROMINENCE,STATUS_LABELS,newId,createTask,canTransition,transitionTask,createApproval,decideApproval,permissionDecision,currentTask,nextQueuedTask,agentStatus,
    recordActivity,createArtifact,inboxItems,migrate,syncProjectApprovals};
  if(typeof module!=='undefined'&&module.exports)module.exports=api;else root.RuangCore=api;
})(typeof window!=='undefined'?window:globalThis);
