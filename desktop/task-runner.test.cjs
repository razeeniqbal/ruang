const test=require('node:test'),assert=require('node:assert/strict');
const Core=require('../dist/core.js');
const {createTaskRunner,INTERRUPTED}=require('../dist/task-runner.js');
const {createArtifactClient}=require('../dist/artifact-client.js');

const QUESTION='Write a short comparison of PostgreSQL JSON and JSONB. Include when I should use each.';
const REPLY='## JSON vs JSONB\nJSONB is stored in a decomposed binary form.';
// A stand-in for the desktop artifact store: files kept in a Map, optionally failing.
function fakeStore({fail=false}={}){const files=new Map();return {files,bridge:{save:async({id,content})=>{if(fail)throw Error('disk is full');files.set(id,content);return {file:`${id}.md`,size:content.length,sha256:'x'}},read:async id=>{if(!files.has(id))throw Error('missing');return files.get(id)}}}}

function setup({reply=REPLY,fail=null,provider='anthropic',delay=0,store=fakeStore(),pieces=null}={}){
  const state=Core.migrate({agents:[{name:'Aisha',role:'Data analyst',provider:'Anthropic'},{name:'Rakan',role:'Engineer',provider:'Unconfigured'}],projects:[{id:'p1',name:'Data Pipeline',goal:'Move reporting to Postgres',status:'Draft',step:0,tasks:[]}]});
  state.agents[0].model={provider,model:null};
  let clock=1000;const calls=[],seen=[],phases=[];
  const gateway={clean:e=>String(e.message||e),stream:async(request,{onDelta,signal}={})=>{calls.push({request,signal});seen.push({status:state.tasks[0].status,agent:Core.agentStatus(state,'agent-1',{now:clock})});
    if(delay)await new Promise((resolve,reject)=>{const t=setTimeout(resolve,delay);signal?.addEventListener('abort',()=>{clearTimeout(t);reject(Object.assign(Error('You stopped this request.'),{code:'CANCELLED'}))},{once:true})});
    if(fail)throw Object.assign(Error(fail),{code:'AUTH'});
    for(const p of pieces||[reply])onDelta?.(p);
    return {text:reply,model:'claude-opus-5-5',provider:'anthropic',usage:{inputTokens:120,outputTokens:340},durationMs:2100}}};
  const artifacts=createArtifactClient({bridge:()=>store.bridge});
  const runner=createTaskRunner({getState:()=>state,gateway,artifacts,Core,now:()=>clock,onChange:()=>{const t=state.tasks[0];if(t)phases.push(`${t.status}/${t.metadata?.phase||''}`)}});
  const add=(fields={})=>{const t=Core.createTask({title:QUESTION,assignedAgent:'agent-1',activity:'writing',createdAt:clock,...fields});state.tasks.push(t);return t};
  return {state,runner,calls,seen,phases,add,gateway,store,artifacts,tick:ms=>{clock+=ms}};
}
const settle=()=>new Promise(r=>setTimeout(r,0));

test('a task streams through the gateway, saves its output to the store, then completes and appears for review',async()=>{
  const {state,runner,calls,seen,phases,add,store,artifacts}=setup({pieces:['## JSON vs JSONB\n','JSONB is stored in a decomposed binary form.']});
  const t=add({projectId:'p1',description:'Audience: backend engineers.'});
  const result=await runner.execute(t.id);
  assert.equal(result.ok,true);
  const done=state.tasks[0];assert.equal(done.status,'COMPLETED');assert.ok(done.startedAt&&done.completedAt);
  assert.deepEqual(seen[0],{status:'RUNNING',agent:'THINKING'},'running but not yet writing shows as thinking');
  assert.deepEqual([...new Set(phases)].filter(p=>!p.startsWith('QUEUED')),['PLANNING/thinking','RUNNING/thinking','RUNNING/writing','RUNNING/saving','COMPLETED/']);
  // Request: task policy, the employee's identity, the task, its details and the project; nothing else.
  const req=calls[0].request;assert.equal(req.policy,'task');assert.equal(req.provider,'anthropic');assert.match(req.system,/You are Aisha, the Data analyst/);
  assert.match(req.messages[0].content,/JSONB/);assert.match(req.messages[0].content,/backend engineers/);assert.match(req.messages[0].content,/Project: Data Pipeline/);
  // The full output lives in the store; state keeps light metadata and a short preview.
  const art=state.artifacts.find(a=>a.taskId===t.id);
  assert.equal(art.storage,'file');assert.equal(art.content,undefined);assert.equal(art.file,`${art.id}.md`);assert.ok(art.preview.length<=240);
  assert.equal(store.files.get(art.id),REPLY);assert.equal(await artifacts.read(art),REPLY);
  assert.deepEqual(done.artifacts,[art.id]);assert.equal(art.metadata.model,'claude-opus-5-5');
  const uses=state.usage.filter(u=>u.taskId===t.id);assert.equal(uses.length,1);
  assert.deepEqual([uses[0].kind,uses[0].attempt,uses[0].agentId,uses[0].totalTokens,uses[0].durationMs],['task',1,'agent-1',460,2100]);
  assert.deepEqual(state.activity.filter(e=>e.taskId===t.id).map(e=>e.type).reverse(),['task.assigned','task.planning','task.running','task.output','task.completed']);
  assert.deepEqual(Core.inboxItems(state).filter(i=>i.taskId===t.id).map(i=>i.kind),['review']);
  assert.equal(done.metadata.attempts[0].outcome,'completed');assert.equal(done.metadata.phase,null);
});

test('if the output cannot be saved the task fails, never completes, and Try again saves the same answer',async()=>{
  const store=fakeStore({fail:true});const env=setup({store});const t=env.add();
  const first=await env.runner.execute(t.id);
  assert.equal(first.ok,false);assert.equal(env.state.tasks[0].status,'FAILED');
  assert.match(env.state.tasks[0].error,/answer was written, but saving it failed/);
  assert.equal(env.state.artifacts.length,0);assert.deepEqual(Core.inboxItems(env.state).map(i=>i.kind),['failed']);
  store.bridge.save=async({id,content})=>{store.files.set(id,content);return {file:`${id}.md`,size:content.length,sha256:'x'}};
  env.runner.retry(t.id);await settle();await settle();
  const task=env.state.tasks[0];assert.equal(task.status,'COMPLETED');
  assert.equal(env.calls.length,1,'the model was not asked again');
  assert.equal(env.state.usage.filter(u=>u.taskId===t.id).length,1,'usage recorded once');
  assert.deepEqual(task.metadata.attempts.map(a=>a.outcome),['failed','completed']);
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
  assert.equal(result.ok,false);assert.equal(result.code,'AUTH');const failed=state.tasks[0];
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
  env.gateway.stream=async(_r,{onDelta})=>{onDelta('Fixed answer');return {text:'Fixed answer',model:'claude-opus-5-5',provider:'anthropic',usage:{inputTokens:1,outputTokens:2}}};
  const queued=env.runner.retry(t.id);assert.equal(queued.status,'QUEUED');
  assert.equal(env.runner.retry(t.id),null,'a second click does nothing');
  await settle();await settle();
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

test('cancelling stops the provider request and the task ends cancelled, with no output',async()=>{
  const {state,runner,calls,add}=setup({delay:200});const t=add();
  const running=runner.execute(t.id);await new Promise(r=>setTimeout(r,10));
  assert.equal(runner.cancel(t.id).status,'CANCELLED');
  assert.equal(calls[0].signal.aborted,true,'the provider request was aborted');
  assert.deepEqual(await running,{skipped:'cancelled'});
  assert.equal(state.tasks[0].status,'CANCELLED');assert.equal(state.artifacts.length,0);
  assert.equal(state.tasks[0].metadata.attempts[0].outcome,'cancelled');assert.equal(runner.cancel(t.id),null);
  assert.deepEqual(Core.inboxItems(state),[]);
});

test('after a reload, unfinished work is reported as interrupted, never as completed',()=>{
  const {state,runner}=setup();
  state.tasks.push({...Core.createTask({assignedAgent:'agent-1',title:'Was running'}),status:'RUNNING',metadata:{execution:{attempt:1},attempts:[{n:1}],phase:'writing'}});
  state.tasks.push({...Core.createTask({assignedAgent:'agent-2',title:'Was starting'}),status:'ASSIGNED',metadata:{execution:{attempt:1}}});
  assert.equal(runner.recoverInterrupted(),true);
  assert.equal(state.tasks[0].status,'FAILED');assert.equal(state.tasks[0].error,INTERRUPTED);assert.equal(state.tasks[0].metadata.attempts[0].outcome,'interrupted');assert.equal(state.tasks[0].metadata.phase,null);
  assert.equal(state.tasks[1].status,'QUEUED');
  assert.equal(state.artifacts.length,0);
});

test('an answer that arrives after the task was stopped is not saved',async()=>{
  const {state,runner,add,store}=setup({delay:15});const t=add();
  const running=runner.execute(t.id);await new Promise(r=>setTimeout(r,5));
  state.tasks[0]=Core.transitionTask(state.tasks[0],'CANCELLED');
  const out=await running;assert.ok(out.skipped);assert.equal(state.artifacts.length,0);assert.equal(store.files.size,0);assert.equal(state.tasks[0].status,'CANCELLED');
});

test('older outputs kept inline in app state still open and preview',async()=>{
  const {artifacts}=setup();const old=Core.createArtifact({title:'Old report',content:'# Old\nStill here.'});
  assert.equal(await artifacts.read(old),'# Old\nStill here.');assert.match(artifacts.previewOf(old),/Old Still here/);
  // Without a desktop store (web), new outputs stay inline rather than failing.
  const web=createArtifactClient({bridge:()=>null});const saved=await web.save(Core.createArtifact({title:'W'}),'Body text');
  assert.equal(saved.storage,'inline');assert.equal(await web.read(saved),'Body text');
});
