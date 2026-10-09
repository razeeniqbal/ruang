// RUANG AI harness: the controlled runtime between an employee and the model, context, tools and outputs.
// One execute() call is one run of one task. The harness checks permissions, loads only the files the person
// approved, asks the model, runs allowed tools, stays within limits, records an observable trace and saves the
// output durably with its provenance. It records system events, never model reasoning.
//
//   TASK -> RUN -> STEPS -> RESULT        statuses: RUNNING, NEEDS_APPROVAL, then COMPLETED, FAILED, CANCELLED or BLOCKED
//
// Runs in the Electron main process. Every dependency is passed in, so tests use stand-ins with no network.
const crypto=require('node:crypto');
const {ToolRegistry}=require('./tool-registry.cjs');
const {readContextFile,keyOf}=require('./tools/read-context-file.cjs');
const {build,toolResult}=require('./context-builder.cjs');
const {resolveLimits}=require('./limits.cjs');
const {snapshotEmployee,decide}=require('./policy.cjs');
const {Trace}=require('./trace.cjs');
const {MemoryRunStore}=require('./run-store.cjs');
const {ApprovalController}=require('./approvals.cjs');
const {preview}=require('../../dist/artifact-client.js');

const PROVIDER_NAMES={anthropic:'Anthropic',openai:'OpenAI',google:'Google'};
// Provider outages may move to the employee's fallback model. Key, permission and configuration errors stop.
const TRANSIENT=new Set(['NETWORK','RATE_LIMIT','PROVIDER']);
const RUN_STATES=Object.freeze(['RUNNING','NEEDS_APPROVAL','COMPLETED','FAILED','CANCELLED','BLOCKED']);
const MAX_UNSAVED=20;

class HarnessError extends Error{constructor(code,message,status='FAILED'){super(message);this.name='HarnessError';this.code=code;this.status=status}}
const newId=prefix=>`${prefix}-${crypto.randomUUID()}`;
const text=(v,max)=>typeof v==='string'?v.slice(0,max):'';
const label=m=>m?.provider?`${PROVIDER_NAMES[m.provider]||m.provider}${m.model?` ${m.model}`:''}`:'no model';
const count=(n,word='file')=>`${n} ${word}${n===1?'':'s'}`;
const stable=v=>Array.isArray(v)?`[${v.map(stable).join(',')}]`:v&&typeof v==='object'?`{${Object.keys(v).sort().map(k=>JSON.stringify(k)+':'+stable(v[k])).join(',')}}`:JSON.stringify(v);
const target=input=>typeof input?.path==='string'?input.path.slice(0,200):'';
const span=ms=>ms>=60000?count(Math.round(ms/60000),'minute'):count(Math.max(1,Math.round(ms/1000)),'second');
function untilAborted(promise,signal){return new Promise((resolve,reject)=>{
  const abort=()=>reject(new HarnessError('CANCELLED','You cancelled this task.','CANCELLED'));if(signal.aborted)return abort();
  signal.addEventListener('abort',abort,{once:true});promise.then(v=>{signal.removeEventListener('abort',abort);resolve(v)},e=>{signal.removeEventListener('abort',abort);reject(e)})})}

function cleanTask(t){
  if(!t||typeof t!=='object'||typeof t.id!=='string'||!t.id)throw new HarnessError('INVALID','This task could not be read.');
  return Object.freeze({id:text(t.id,100),title:text(t.title,160)||'Untitled task',description:text(t.description,4000),activity:text(t.activity,40)||'writing'});
}
const cleanProject=p=>p&&typeof p==='object'&&typeof p.name==='string'?Object.freeze({id:text(p.id,100)||null,name:text(p.name,80),goal:text(p.goal,500)}):null;
function cleanContext(c,limits){
  const files=[],seen=new Set();
  for(const f of Array.isArray(c?.files)?c.files:[]){if(typeof f!=='string'||!f||f.length>500)throw new HarnessError('CONTEXT','A context file path is not valid.');if(!seen.has(keyOf(f))){seen.add(keyOf(f));files.push(f)}}
  if(files.length>limits.maxContextFiles)throw new HarnessError('LIMIT',`A task can use at most ${count(limits.maxContextFiles,'context file')}.`);
  return Object.freeze({root:typeof c?.root==='string'?c.root:null,files:Object.freeze(files)});
}
const summary=run=>({id:run.id,status:run.status,provider:run.provider,model:run.model,attempt:run.attempt,startedAt:run.startedAt,completedAt:run.completedAt,durationMs:run.durationMs,
  modelCalls:run.modelCalls,toolCalls:run.toolCalls.length,contextFiles:run.contextFiles.map(({path,bytes,included})=>({path,bytes,included})),usage:{...run.usage},
  fallback:run.fallback?{from:label(run.fallback.from),to:label(run.fallback.to)}:null,approvals:run.approvals.length,reusedFrom:run.reusedFrom});

class Harness{
  // confirmDisclosure({employee, provider, model, task, root, files}) -> true when the person agrees to send the
  // files to the provider. The desktop app shows a native dialog; without one, files are never sent.
  constructor({gateway,artifacts,runs=new MemoryRunStore(),workspace=null,confirmDisclosure=async()=>false,registry=null,limits={},approvals=new ApprovalController(),now=()=>Date.now()}){
    Object.assign(this,{gateway,artifacts,runs,workspace,confirmDisclosure,approvals,now});
    this.limits=resolveLimits(limits);
    this.registry=registry||new ToolRegistry().register(readContextFile());
    this.unsaved=new Map();// task id -> an answer whose output could not be saved; Try again saves it without a new model call
  }
  decide(approvalId,decision){return this.approvals.decide(approvalId,decision)}
  runRecord(id){return this.runs.read(id)}

  // Returns {status, run, usage, artifact?, error?}. Never throws: every outcome is a recorded run.
  async execute(input,{signal,onEvent=()=>{}}={}){
    const limits=this.limits;
    const run={id:newId('run'),taskId:null,employeeId:null,employeeName:null,projectId:null,provider:null,model:null,status:'RUNNING',
      attempt:Number.isInteger(input?.attempt)&&input.attempt>0?input.attempt:1,startedAt:this.now(),completedAt:null,durationMs:null,
      contextFiles:[],toolCalls:[],modelCalls:0,usage:{inputTokens:0,outputTokens:0},error:null,artifactIds:[],approvals:[],fallback:null,reusedFrom:null,limits,trace:[]};
    const trace=new Trace(run.trace,this.now);let closed=false;
    const emit=(type,data={})=>{if(closed)return;try{onEvent({type,runId:run.id,taskId:run.taskId,at:this.now(),...data})}catch{}};
    const step=(type,summaryText,data)=>{trace.add(type,summaryText,data);emit(type,{summary:summaryText,...data})};
    // Cancellation and the runtime limit both abort one controller, which reaches the model request and tools.
    const controller=new AbortController();let why=null;
    const stop=reason=>{if(!why){why=reason;controller.abort()}};
    const onAbort=()=>stop('cancelled');
    if(signal){if(signal.aborted)stop('cancelled');else signal.addEventListener('abort',onAbort,{once:true})}
    let budget=limits.maxRuntimeMs,since=0,timer=null;// time waiting for a person does not count
    const clock={start(){clearTimeout(timer);since=Date.now();timer=setTimeout(()=>stop('timeout'),Math.max(0,budget))},pause(){if(timer){clearTimeout(timer);timer=null;budget-=Date.now()-since}}};
    const cancelled=()=>new HarnessError('CANCELLED','You cancelled this task.','CANCELLED');
    const timedOut=()=>new HarnessError('LIMIT',`Ruang stopped this run because it ran longer than ${span(limits.maxRuntimeMs)}.`);
    const alive=()=>{if(why==='cancelled')throw cancelled();if(why==='timeout')throw timedOut()};
    const finish=status=>{run.status=status;run.completedAt=this.now();run.durationMs=run.completedAt-run.startedAt};
    const r={run,trace,emit,step,alive,controller,clock,limits,seen:new Map(),completedCalls:0,modelMs:0};
    const usage=()=>r.completedCalls?{...run.usage,durationMs:r.modelMs}:null;
    clock.start();
    try{
      Object.assign(r,{employee:snapshotEmployee(input?.employee),task:cleanTask(input?.task),project:cleanProject(input?.project),context:cleanContext(input?.context,limits)});
      const {employee,task,project}=r;
      Object.assign(run,{taskId:task.id,employeeId:employee.id,employeeName:employee.name,projectId:project?.id||null,provider:employee.model.provider,model:employee.model.model});
      this.runs.save(run);
      step('run.started',`Task started: ${task.title}`,{employee:employee.name,provider:run.provider,model:run.model,attempt:run.attempt});
      trace.add('run.employee',`Employee: ${employee.name}`);trace.add('run.model',`Model: ${label(employee.model)}`);
      let output=this.unsaved.get(task.id)||null;
      if(output){run.reusedFrom=output.runId;step('output.reused','Kept the answer already written in an earlier run and is saving it again',{fromRun:output.runId})}
      else{
        if(!employee.model.provider)throw new HarnessError('NOT_CONNECTED',`${employee.name} has no model yet. Choose a provider under Employee details, then try again.`);
        // No await before the first model call when there are no files, so the run is visibly started at once.
        const loaded=r.context.files.length?await this.loadContext(r):{included:[],omitted:[],approved:new Map()};
        output=await this.loop(r,loaded);
      }
      Object.assign(run,{provider:output.provider,model:output.model});
      alive();
      // Artifact collection: the run only completes once its output is durably stored.
      step('artifact.saving','Saving the result');
      const id=newId('artifact');let saved;
      try{saved=await this.artifacts.save({id,format:'markdown',content:output.text})}
      catch(error){this.keepUnsaved(task.id,{...output,runId:run.id});throw new HarnessError('SAVE_FAILED',`The answer was written, but saving it failed: ${error.message} Try again to save it.`)}
      alive();// a run stopped while saving does not claim the output
      this.unsaved.delete(task.id);run.artifactIds.push(id);
      const provenance={createdBy:employee.id,employeeName:employee.name,taskId:task.id,runId:run.id,provider:output.provider,model:output.model,
        contextFiles:run.contextFiles.map(f=>f.path),modelCalls:run.modelCalls,toolCalls:run.toolCalls.length,approvals:run.approvals.length,createdAt:this.now()};
      step('artifact.saved',`Output saved (${saved.size} bytes)`,{artifactId:id,bytes:saved.size});
      finish('COMPLETED');step('run.completed','Task completed',{durationMs:run.durationMs});
      return {status:'COMPLETED',run:summary(run),usage:usage(),artifact:{id,format:'markdown',file:saved.file,size:saved.size,sha256:saved.sha256,preview:preview(output.text),provenance}};
    }catch(error){
      const e=why==='cancelled'?cancelled():why==='timeout'?timedOut():error instanceof HarnessError?error
        :error?.code==='CANCELLED'?cancelled():new HarnessError(error?.code||'PROVIDER',String(error?.message||'The run failed.').slice(0,500));
      run.error={code:e.code,message:e.message};finish(e.status);
      step(e.status==='CANCELLED'?'run.cancelled':e.status==='BLOCKED'?'run.blocked':'run.failed',e.message,{code:e.code});
      return {status:e.status,error:{code:e.code,message:e.message},run:summary(run),usage:usage()};
    }finally{clock.pause();signal?.removeEventListener('abort',onAbort);closed=true;try{this.runs.save(run)}catch{}}
  }

  // Approved context: permission check, provider disclosure, then reading exactly the approved files.
  async loadContext(r){
    const {employee,task,context,run,step,trace,alive,limits}=r;
    const permission=decide(employee,'readFiles');
    step('permission.checked',`Permission to read approved files: ${permission}`,{permission:'readFiles',decision:permission});
    if(permission==='DENY')throw new HarnessError('PERMISSION',`${employee.name} is not allowed to read files. Allow it under Employee details, or assign the task without files.`);
    if(!this.workspace?.root)throw new HarnessError('NO_WORKSPACE','Context files need a project folder open in the Ruang desktop app.');
    if(context.root&&context.root!==this.workspace.root)throw new HarnessError('CONTEXT_CHANGED','The project folder changed after these files were chosen. Assign the task again with files from the open folder.');
    const files=context.files.map(f=>{try{return this.workspace.describe(f)}catch(error){throw new HarnessError('CONTEXT',`“${f}” cannot be used as context: ${error.message}`)}});
    // The person approves sending exactly these files to this provider before any of them is read.
    step('context.disclosure',`Asked you to approve sending ${count(files.length)} to ${label(employee.model)}`,{files:files.length});
    r.clock.pause();let ok;
    try{ok=await untilAborted(Promise.resolve(this.confirmDisclosure({employee:employee.name,provider:employee.model.provider,providerName:PROVIDER_NAMES[employee.model.provider]||employee.model.provider,model:employee.model.model,task:task.title,root:this.workspace.root,files})),r.controller.signal)}
    finally{r.clock.start()}
    alive();
    if(ok!==true)throw new HarnessError('DECLINED','You did not approve sending these files to the model, so the task was cancelled.','CANCELLED');
    step('context.approved',`Context approved: ${count(files.length)}`,{files:files.length});
    step('context.loading','Reading selected files',{files:files.length});
    const approved=new Map(files.map(f=>[keyOf(f.path),f.path])),included=[],omitted=[];let used=0;
    for(const f of files){
      let out;
      // approvedCall: the disclosure above was the person's approval for these reads.
      try{out=await this.registry.execute('read_context_file',{path:f.path},{employee,approvedFiles:approved,workspace:this.workspace,signal:r.controller.signal,approvedCall:true})}
      catch(error){alive();throw new HarnessError('CONTEXT',`Could not read “${f.path}”: ${error.message}`)}
      alive();
      const fits=used+out.bytes<=limits.maxContextBytes;if(fits){used+=out.bytes;included.push(out)}else omitted.push({path:out.path,bytes:out.bytes});
      run.contextFiles.push({path:out.path,bytes:out.bytes,sha256:out.sha256,included:fits});
      trace.add('tool.executed',`Read ${out.path}`,{tool:'read_context_file',path:out.path,bytes:out.bytes});
    }
    step('context.loaded',`Loaded ${count(files.length)}${omitted.length?`; ${omitted.length} too large to include directly`:''}`,{files:files.length,included:included.length,omitted:omitted.length,bytes:used});
    return {included,omitted,approved};
  }

  // The bounded execution loop: ask the model; finish on an answer; otherwise run the requested tools and ask again.
  async loop(r,{included,omitted,approved}){
    const {employee,task,project,run,step,trace,emit,alive,limits}=r;
    const toolCtx={approvedFiles:approved};
    const canUseTools=provider=>!!this.gateway.capabilities?.(provider)?.tools;
    let current=employee.model,fallbacks=0;
    const offered=canUseTools(current.provider)?this.registry.definitions(employee,toolCtx):[];
    const request=build({employee,task,project,context:included,omitted,tools:offered,limits});
    trace.add('request.built',`Request prepared: ${request.sections.join(', ').replace(/_/g,' ')}`,{tools:offered.length});
    const messages=[...request.messages];
    for(let turn=1;;turn++){
      if(turn>limits.maxTurns)throw new HarnessError('LIMIT',`Ruang stopped this run after ${count(limits.maxTurns,'model turn')} without a finished answer.`);
      alive();run.modelCalls++;
      step('model.started',`Model request started: ${label(current)}`,{turn,provider:current.provider,model:current.model});
      let chars=0,streaming=false;
      const delta=piece=>{if(typeof piece!=='string'||!piece)return;chars+=piece.length;if(!streaming){streaming=true;trace.add('model.streaming','Response streaming',{turn})}emit('model.delta',{chars:piece.length})};
      let result;
      try{result=await this.gateway.stream({provider:current.provider,model:current.model,system:request.system,messages,...(offered.length?{tools:offered}:{}),policy:'task'},
        {signal:r.controller.signal,onEvent:e=>{if(e?.type==='delta')delta(e.text)},onDelta:delta})}
      catch(error){
        alive();
        const fb=employee.fallbackModel;
        if(TRANSIENT.has(error?.code)&&fb&&fallbacks<limits.maxFallbacks&&(fb.provider!==current.provider||fb.model!==current.model)&&(!offered.length||canUseTools(fb.provider))){
          fallbacks++;run.fallback={from:{...current},to:{...fb},code:error.code};
          step('model.fallback',`${label(current)} was unavailable. Run continued with the configured fallback: ${label(fb)}.`,{from:label(current),to:label(fb),code:error.code});
          current=fb;Object.assign(run,{provider:fb.provider,model:fb.model});turn--;continue;
        }
        throw error;
      }
      alive();
      r.completedCalls++;r.modelMs+=result?.durationMs||0;
      run.usage.inputTokens+=result?.usage?.inputTokens??0;run.usage.outputTokens+=result?.usage?.outputTokens??0;
      const calls=Array.isArray(result?.toolCalls)?result.toolCalls:[];
      step('model.completed',`Model response received${calls.length?` with ${count(calls.length,'tool request')}`:''}`,{turn,chars,inputTokens:result?.usage?.inputTokens??0,outputTokens:result?.usage?.outputTokens??0,toolCalls:calls.length});
      if(!calls.length){
        const answer=String(result?.text||'').trim();
        if(!answer)throw new HarnessError('EMPTY','The model returned an empty answer.');
        if(Buffer.byteLength(answer,'utf8')>limits.maxOutputBytes)throw new HarnessError('LIMIT','The answer is larger than Ruang allows for one output.');
        return {text:answer,provider:result.provider||current.provider,model:result.model||current.model};
      }
      // Structured tool calls only: the harness never reads intent from prose.
      const assistant={role:'assistant',content:String(result.text||''),toolCalls:calls.map((c,k)=>({id:text(c?.id,128)||`call-${turn}-${k}`,name:text(c?.name,64)||'unknown',input:c?.input&&typeof c.input==='object'&&!Array.isArray(c.input)?c.input:{}}))};
      messages.push(assistant);
      for(const call of assistant.toolCalls){const out=await this.runTool(r,call,toolCtx);messages.push({role:'tool',toolCallId:call.id,name:call.name,content:out.content,...(out.isError?{isError:true}:{})})}
    }
  }

  // One tool request: registered? valid input? permission ALLOW / ASK / DENY? Results go back as untrusted data.
  async runTool(r,call,toolCtx){
    const {employee,run,step,alive,limits}=r;
    if(run.toolCalls.length>=limits.maxToolCalls)throw new HarnessError('LIMIT',`Ruang stopped this run after ${count(limits.maxToolCalls,'tool request')}.`);
    const key=`${call.name} ${stable(call.input)}`,repeats=(r.seen.get(key)||0)+1;r.seen.set(key,repeats);
    if(repeats>limits.maxRepeats)throw new HarnessError('LOOP','Ruang stopped this run after repeated identical tool requests.');
    const record={tool:call.name,target:target(call.input),decision:null,outcome:null,at:this.now()};run.toolCalls.push(record);
    step('tool.requested',`Requested ${record.tool}${record.target?`: ${record.target}`:''}`,{tool:record.tool,target:record.target});
    const refuse=(outcome,message)=>{record.outcome=outcome;step(`tool.${outcome}`,message,{tool:record.tool});return {content:toolResult(record.tool,message),isError:true}};
    let tool;
    try{tool=this.registry.validate(call.name,call.input)}catch(error){return refuse('rejected',`${error.message}${error.code==='UNKNOWN_TOOL'?' Only the tools defined in this request exist.':''}`)}
    const decision=decide(employee,tool.permission);record.decision=decision;
    step('permission.checked',`Permission for ${tool.name}: ${decision}`,{tool:tool.name,permission:tool.permission,decision});
    if(decision==='DENY')return refuse('denied',`${tool.name} is not available to ${employee.name}. Continue without it.`);
    const approvedCall=decision==='ASK'?await this.askApproval(r,tool,record):false;
    if(decision==='ASK'&&!approvedCall)return refuse('denied','The user declined this request. Continue without it.');
    step('tool.started',`Running ${tool.name}${record.target?`: ${record.target}`:''}`,{tool:tool.name});
    try{
      const out=await this.registry.execute(tool.name,call.input,{employee,...toolCtx,workspace:this.workspace,signal:r.controller.signal,approvedCall});
      alive();
      let body=typeof out?.content==='string'?(out.path?`File: ${out.path}\n\n`:'')+out.content:JSON.stringify(out??null);
      if(Buffer.byteLength(body,'utf8')>limits.maxToolResultBytes)body=Buffer.from(body,'utf8').subarray(0,limits.maxToolResultBytes).toString('utf8')+'\n[Ruang cut this result at its size limit.]';
      record.outcome='completed';
      step('tool.completed',`${tool.name} finished${record.target?`: ${record.target}`:''}`,{tool:tool.name,bytes:Buffer.byteLength(body,'utf8')});
      return {content:toolResult(tool.name,body)};
    }catch(error){alive();return refuse('failed',`The tool failed: ${error.message}`)}
  }

  // ASK: the run pauses, an approval reaches the Inbox, and the run resumes or continues without the action.
  async askApproval(r,tool,record){
    const {employee,task,run,trace,emit,alive,limits}=r;
    const approval={id:newId('approval'),runId:run.id,taskId:task.id,tool:tool.name,permission:tool.permission,
      requestedAction:`Let ${employee.name} use ${tool.name}${record.target?` on ${record.target}`:''}`,reason:`${employee.name} asked for this while working on “${task.title}”.`,risk:`Risk: ${tool.risk}.`};
    run.status='NEEDS_APPROVAL';run.approvals.push({id:approval.id,tool:tool.name,target:record.target,status:'PENDING',requestedAt:this.now()});this.runs.save(run);
    trace.add('tool.approval_required',`Waiting for your approval: ${approval.requestedAction}`,{approvalId:approval.id,tool:tool.name});
    emit('tool.approval_required',{summary:'Waiting for your approval',approval});
    r.clock.pause();let decision;
    try{decision=await this.approvals.wait(approval.id,{signal:r.controller.signal,timeoutMs:limits.maxApprovalWaitMs})}catch(error){alive();throw error}finally{r.clock.start()}
    alive();
    const entry=run.approvals.at(-1);entry.status={approve:'APPROVED',reject:'REJECTED'}[decision]||'EXPIRED';entry.decidedAt=this.now();
    trace.add('tool.approval_decided',decision==='approve'?`You approved ${tool.name}`:decision==='reject'?`You declined ${tool.name}`:'No decision arrived in time',{approvalId:approval.id,decision});
    emit('tool.approval_decided',{approvalId:approval.id,decision});
    if(decision==='timeout')throw new HarnessError('APPROVAL_TIMEOUT','No one answered the approval request in time, so the run stopped. Resume it from the Inbox.','BLOCKED');
    run.status='RUNNING';
    return decision==='approve';
  }

  keepUnsaved(taskId,output){this.unsaved.delete(taskId);this.unsaved.set(taskId,output);while(this.unsaved.size>MAX_UNSAVED)this.unsaved.delete(this.unsaved.keys().next().value)}
}
module.exports={Harness,HarnessError,RUN_STATES,TRANSIENT};
