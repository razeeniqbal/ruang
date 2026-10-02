const test=require('node:test'),assert=require('node:assert/strict');
const Core=require('../dist/core.js');
const {createTaskRunner,INTERRUPTED}=require('../dist/task-runner.js');

const QUESTION='Explain the difference between PostgreSQL JSON and JSONB in a concise technical summary.';
function setup({reply='## JSON vs JSONB\nJSONB is stored in a decomposed binary form.',fail=null,provider='anthropic',delay=0}={}){
  const state=Core.migrate({agents:[{name:'Aisha',role:'Data analyst',provider:'Anthropic'},{name:'Rakan',role:'Engineer',provider:'Unconfigured'}],projects:[{id:'p1',name:'Data Pipeline',goal:'Move reporting to Postgres',status:'Draft',step:0,tasks:[]}]});
  state.agents[0].model={provider,model:null};
  let clock=1000;const calls=[],seen=[];
  const gateway={clean:e=>String(e.message||e),generate:async(request,{onEvent}={})=>{calls.push(request);seen.push({status:state.tasks[0].status,agent:Core.agentStatus(state,'agent-1',{now:clock})});onEvent?.({type:'request.sent'});
    if(delay)await new Promise(r=>setTimeout(r,delay));if(fail)throw Error(fail);return {text:reply,model:'claude-opus-5-5',provider:'anthropic',usage:{inputTokens:120,outputTokens:340},durationMs:2100}}};
  const statuses=[];
  const runner=createTaskRunner({getState:()=>state,gateway,Core,now:()=>clock,onChange:()=>statuses.push(state.tasks[0]?.status)});
  const add=(fields={})=>{const t=Core.createTask({title:QUESTION,assignedAgent:'agent-1',activity:'writing',createdAt:clock,...fields});state.tasks.push(t);return t};
  return {state,runner,calls,seen,statuses,add,gateway,tick:ms=>{clock+=ms}};
}

test('a task runs through the real gateway path and produces a durable, reviewable output',async()=>{
  const {state,runner,calls,seen,statuses,add}=setup();const t=add({projectId:'p1',description:'Audience: backend engineers.'});
  const result=await runner.execute(t.id);
  assert.equal(result.ok,true);
  const done=state.tasks[0];assert.equal(done.status,'COMPLETED');assert.ok(done.startedAt&&done.completedAt);
  assert.ok(statuses.includes('PLANNING')&&statuses.includes('RUNNING'));
  assert.deepEqual(seen[0],{status:'RUNNING',agent:'WORKING'});
  // The request carries the employee's identity, the task, its details and the project; nothing else.
  const req=calls[0];assert.equal(req.provider,'anthropic');assert.match(req.system,/You are Aisha, the Data analyst/);
  assert.match(req.messages[0].content,/JSONB/);assert.match(req.messages[0].content,/backend engineers/);assert.match(req.messages[0].content,/Project: Data Pipeline/);
  const art=state.artifacts.find(a=>a.taskId===t.id);assert.match(art.content,/decomposed binary/);assert.equal(art.creator,'agent-1');assert.equal(art.projectId,'p1');
  assert.equal(art.metadata.model,'claude-opus-5-5');assert.deepEqual(done.artifacts,[art.id]);
  const use=state.usage.find(u=>u.taskId===t.id);assert.deepEqual([use.kind,use.agentId,use.inputTokens,use.outputTokens,use.totalTokens,use.durationMs],['task','agent-1',120,340,460,2100]);
  assert.deepEqual(state.activity.filter(e=>e.taskId===t.id).map(e=>e.type).reverse(),['task.assigned','task.planning','task.running','task.output','task.completed']);
  assert.deepEqual(Core.inboxItems(state).filter(i=>i.taskId===t.id).map(i=>i.kind),['review']);
  assert.equal(done.metadata.attempts[0].outcome,'completed');
});

test('planning shows as thinking, completion is brief and then the employee is idle again',()=>{
  const {state}=setup();state.tasks.push({...Core.createTask({assignedAgent:'agent-1'}),status:'PLANNING'});
  assert.equal(Core.agentStatus(state,'agent-1'),'THINKING');
  state.tasks[0]={...state.tasks[0],status:'COMPLETED',completedAt:5000};
  assert.equal(Core.agentStatus(state,'agent-1',{now:6000}),'COMPLETE');assert.equal(Core.agentStatus(state,'agent-1',{now:20000}),'IDLE');
});

test('a provider failure becomes a real failed task, an error status and an Inbox item, with no output',async()=>{
  const {state,runner,add}=setup({fail:'Anthropic rejected the saved key. Replace it under Settings, AI Connections.'});const t=add();
  const result=await runner.execute(t.id);
  assert.equal(result.ok,false);const failed=state.tasks[0];
  assert.equal(failed.status,'FAILED');assert.match(failed.error,/rejected the saved key/);
  assert.equal(Core.agentStatus(state,'agent-1',{now:1e9}),'ERROR');
  assert.deepEqual(Core.inboxItems(state).map(i=>i.kind),['failed']);
  assert.equal(state.artifacts.filter(a=>a.taskId===t.id).length,0);
  assert.equal(state.activity[0].type,'task.failed');assert.equal(failed.metadata.attempts[0].outcome,'failed');
});

test('an employee with no model fails clearly without calling any provider',async()=>{
  const {state,runner,calls,add}=setup({provider:null});const t=add();
  await runner.execute(t.id);
  assert.equal(calls.length,0);assert.equal(state.tasks[0].status,'FAILED');assert.match(state.tasks[0].error,/has no model yet/);
});

test('Try again reuses the same task, keeps its history and can complete it',async()=>{
  const env=setup({fail:'Anthropic rate limit reached. Try again shortly.'});const t=env.add();
  await env.runner.execute(t.id);assert.equal(env.state.tasks[0].status,'FAILED');
  env.gateway.generate=async()=>({text:'Fixed answer',model:'claude-opus-5-5',provider:'anthropic',usage:{inputTokens:1,outputTokens:2}});
  const queued=env.runner.retry(t.id);assert.equal(queued.status,'QUEUED');
  assert.equal(env.runner.retry(t.id),null,'a second click does nothing');
  await new Promise(r=>setTimeout(r,0));await new Promise(r=>setTimeout(r,0));
  assert.equal(env.state.tasks.length,1,'no duplicate task');
  const task=env.state.tasks[0];assert.equal(task.id,t.id);assert.equal(task.status,'COMPLETED');
  assert.deepEqual(task.metadata.attempts.map(a=>a.outcome),['failed','completed']);
  assert.ok(env.state.activity.some(e=>e.type==='task.retry'));
  assert.deepEqual(Core.inboxItems(env.state).map(i=>i.kind),['review'],'the failure item is replaced by the review item');
});

test('the same task can never run twice at once, and an employee works on one task at a time',async()=>{
  const {state,runner,calls,add}=setup({delay:20});const a=add(),b=add({title:'Second task',createdAt:2000});
  const first=runner.execute(a.id),second=runner.execute(a.id);runner.pump();runner.execute(b.id);
  assert.deepEqual(await second,{skipped:'RUNNING'},'the second start is refused because the first already moved the task on');
  await first;assert.equal(calls.length,1);assert.equal(state.tasks.find(t=>t.id===b.id).status,'QUEUED');
  runner.pump();await new Promise(r=>setTimeout(r,40));
  assert.equal(calls.length,2);assert.equal(state.tasks.find(t=>t.id===b.id).status,'COMPLETED');
});

test('after a reload, unfinished work is reported as interrupted, never as completed',()=>{
  const {state,runner}=setup();
  state.tasks.push({...Core.createTask({assignedAgent:'agent-1',title:'Was running'}),status:'RUNNING',metadata:{execution:{attempt:1},attempts:[{n:1}]}});
  state.tasks.push({...Core.createTask({assignedAgent:'agent-2',title:'Was starting'}),status:'ASSIGNED',metadata:{execution:{attempt:1}}});
  assert.equal(runner.recoverInterrupted(),true);
  assert.equal(state.tasks[0].status,'FAILED');assert.equal(state.tasks[0].error,INTERRUPTED);assert.equal(state.tasks[0].metadata.attempts[0].outcome,'interrupted');
  assert.equal(state.tasks[1].status,'QUEUED');
  assert.equal(state.artifacts.length,0);
});

test('an answer that arrives after the task was cancelled is not saved',async()=>{
  const {state,runner,add}=setup({delay:15});const t=add();
  const running=runner.execute(t.id);await new Promise(r=>setTimeout(r,5));
  state.tasks[0]=Core.transitionTask(state.tasks[0],'CANCELLED');
  assert.deepEqual(await running,{skipped:'stopped'});assert.equal(state.artifacts.length,0);assert.equal(state.tasks[0].status,'CANCELLED');
});
