const test=require('node:test'),assert=require('node:assert/strict');
const C=require('../dist/core.js');

const v1=()=>({agents:[{name:'Manager',role:'Project lead',provider:'OpenAI',initial:'M'},{name:'Gemini',role:'Researcher',provider:'Google',initial:'G'}],
  projects:[{id:'p1',name:'Sprint',goal:'Goal',status:'Waiting approval',step:5,tasks:[]},{id:'p2',name:'Done',goal:'Goal',status:'Completed',step:5,tasks:[],output:'# Report'}],
  events:[{text:'old event',time:'10:00'}],officeTasks:[{id:'t1',agent:1,title:'Find sources',kind:'research',status:'Running',remainingMs:5000},{id:'t2',agent:0,title:'Plan',kind:'planning',status:'Completed'}],
  officeChat:{'employee-1':[{who:'You',text:'hi'}]},agentAppearance:{'employee-0':{skinType:'custom'}},agentConnections:{0:'claude'}});

test('task state machine allows the normal path and rejects illegal moves',()=>{
  let t=C.createTask({title:'Analyse CSV',assignedAgent:'agent-1',activity:'analysis'});
  assert.equal(t.status,'QUEUED');
  t=C.transitionTask(t,'RUNNING',{at:10});assert.equal(t.startedAt,10);
  t=C.transitionTask(t,'NEEDS_APPROVAL');t=C.transitionTask(t,'RUNNING');t=C.transitionTask(t,'COMPLETED',{at:20});
  assert.equal(t.completedAt,20);
  assert.throws(()=>C.transitionTask(t,'RUNNING'),/cannot move from COMPLETED/);
  assert.throws(()=>C.transitionTask(C.createTask({}),'COMPLETED'),/cannot move from DRAFT/);
  const failed=C.transitionTask(C.transitionTask(C.createTask({assignedAgent:'a'}),'RUNNING'),'FAILED',{error:'Model timed out'});
  assert.equal(failed.error,'Model timed out');assert.equal(C.transitionTask(failed,'QUEUED').error,null);
});

test('approvals are decided once',()=>{
  const a=C.createApproval({requestingAgent:'agent-1',requestedAction:'Write file'});
  const approved=C.decideApproval(a,'approve',{at:5});
  assert.equal(approved.status,'APPROVED');assert.equal(approved.decisionAt,5);
  assert.throws(()=>C.decideApproval(approved,'reject'),/already been decided/);
  assert.throws(()=>C.decideApproval(a,'maybe'),/Unknown approval decision/);
});

test('agent status comes from approvals and task state, not from animation',()=>{
  const s=C.migrate({agents:[{name:'A'},{name:'B'}],projects:[]});
  const [a,b]=s.agents.map(x=>x.id);
  assert.equal(C.agentStatus(s,a),'IDLE');
  s.tasks.push(C.transitionTask(C.createTask({assignedAgent:a,activity:'research'}),'RUNNING'));
  assert.equal(C.agentStatus(s,a),'RESEARCHING');
  s.tasks[0]=C.transitionTask(s.tasks[0],'BLOCKED');assert.equal(C.agentStatus(s,a),'BLOCKED');
  s.approvals.push(C.createApproval({requestingAgent:a}));assert.equal(C.agentStatus(s,a),'NEEDS_APPROVAL');
  s.tasks.push({...C.createTask({assignedAgent:b}),status:'COMPLETED',completedAt:1000});
  assert.equal(C.agentStatus(s,b,{now:2000}),'COMPLETE');assert.equal(C.agentStatus(s,b,{now:99999}),'IDLE');
  assert.equal(C.agentStatus(s,'nobody'),'OFFLINE');
});

test('permissions: deny wins, autonomy never unlocks sensitive actions',()=>{
  const agent={autonomy:'AUTONOMOUS',permissions:{...C.DEFAULT_PERMISSIONS,deleteFiles:'ASK',writeFiles:'ASK'}};
  assert.equal(C.permissionDecision(agent,'writeFiles'),'ALLOW');
  assert.equal(C.permissionDecision(agent,'deleteFiles'),'ASK');
  assert.equal(C.permissionDecision({...agent,autonomy:'SUPERVISED'},'writeFiles'),'ASK');
  assert.equal(C.permissionDecision(agent,'gitPush'),'DENY');
  assert.equal(C.permissionDecision(agent,'launchRockets'),'DENY');
});

test('migration keeps V1 data, adds ids and moves keyed records',()=>{
  const s=C.migrate(v1());
  assert.equal(s.schemaVersion,2);assert.equal(s.migratedFrom,1);
  assert.deepEqual(s.agents.map(a=>a.id),['agent-1','agent-2']);
  assert.equal(s.agents[0].role,'Project lead');assert.equal(s.agents[0].model.provider,'openai');assert.equal(s.agents[1].appearance.preset,1);
  assert.deepEqual(s.officeChat['agent-2'],[{who:'You',text:'hi'}]);assert.equal(s.officeChat['employee-1'],undefined);
  assert.equal(s.agentAppearance['agent-1'].skinType,'custom');
  assert.equal(s.officeTasks,undefined);
  const t1=s.tasks.find(t=>t.id==='t1');assert.equal(t1.status,'RUNNING');assert.equal(t1.assignedAgent,'agent-2');assert.equal(t1.activity,'research');
  assert.equal(s.approvals.filter(a=>a.status==='PENDING'&&a.projectId==='p1').length,1);
  assert.equal(s.artifacts.filter(a=>a.projectId==='p2').length,1);
  assert.equal(s.events[0].text,'old event');assert.equal(s.projects.length,2);assert.equal(s.agentConnections[0],'claude');
});

test('migration is idempotent and project approvals follow the V1 runner',()=>{
  const s=C.migrate(C.migrate(v1()));
  assert.equal(s.approvals.length,1);assert.equal(s.tasks.length,2);assert.equal(s.artifacts.length,1);
  s.projects[0].status='Completed';C.syncProjectApprovals(s);assert.equal(s.approvals[0].status,'APPROVED');
  s.projects[0].status='Waiting approval';C.syncProjectApprovals(s);s.projects[0].status='Paused';C.syncProjectApprovals(s);
  assert.equal(s.approvals[1].status,'REJECTED');
});

test('inbox collects approvals, blocked, failed and work to review',()=>{
  const s=C.migrate(v1());const a=s.agents[0].id;
  s.tasks.push({...C.createTask({assignedAgent:a}),status:'BLOCKED'},{...C.createTask({assignedAgent:a}),status:'FAILED',completedAt:5},{...C.createTask({assignedAgent:a}),status:'COMPLETED',completedAt:6});
  const kinds=C.inboxItems(s).map(i=>i.kind).sort();
  assert.deepEqual(kinds,['approval','blocked','failed','review']);
});

test('recording activity also writes the V1 event list',()=>{
  const s=C.migrate({agents:[{name:'A'}],projects:[]});
  C.recordActivity(s,{type:'task.started',text:'A started work',agentId:s.agents[0].id});
  assert.equal(s.activity[0].type,'task.started');assert.equal(s.events[0].text,'A started work');
});
