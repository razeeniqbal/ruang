const test=require('node:test'),assert=require('node:assert/strict');
const {ModelGateway}=require('./model-gateway.cjs');
const {ModelError}=require('./models/errors.cjs');
const anthropic=require('./models/anthropic.cjs'),openai=require('./models/openai.cjs'),google=require('./models/google.cjs');

const SECRET='sk-ant-secret-1234567890abcdef';
const convo=[{role:'user',content:'Explain JSONB in PostgreSQL in three short bullet points.'}];
const connections={config:{claude:{enabled:true,mode:'api',secret:'enc'}},secretFor:id=>{if(id!=='claude')throw Error('Connect first.');return SECRET}};
const gw=(adapter,policies)=>new ModelGateway({connections,load:()=>adapter,...(policies?{policies}:{})});
const collect=()=>{const events=[];return {events,onEvent:e=>events.push(e)}};
const waitForAbort=signal=>new Promise((_,reject)=>signal.addEventListener('abort',()=>reject(Error('aborted')),{once:true}));

test('streamed pieces arrive in order and the stream completes exactly once with usage',async()=>{
  const {events,onEvent}=collect();
  const adapter={stream:async({onDelta,apiKey})=>{assert.equal(apiKey,SECRET);for(const t of ['- JSONB ','stores ','binary.'])onDelta(t);return {model:'claude-opus-5-5',stopReason:'end_turn',usage:{inputTokens:12,outputTokens:9}}}};
  const result=await gw(adapter).stream({provider:'anthropic',messages:convo},{onEvent});
  assert.equal(result.text,'- JSONB stores binary.');assert.deepEqual(result.usage,{inputTokens:12,outputTokens:9});
  assert.deepEqual(events.map(e=>e.type),['start','delta','delta','delta','usage','complete']);
  assert.deepEqual(events.filter(e=>e.type==='delta').map(e=>e.text),['- JSONB ','stores ','binary.']);
});

test('an error ends the stream: no completion, nothing after the error, and the key is never shown',async()=>{
  const {events,onEvent}=collect();let late;
  const adapter={stream:async({onDelta})=>{onDelta('partial');late=onDelta;throw Error(`upstream said bad key ${SECRET}`)}};
  await assert.rejects(gw(adapter).stream({provider:'anthropic',messages:convo},{onEvent}),e=>{assert.ok(!e.message.includes(SECRET));assert.match(e.message,/\[hidden\]/);return true});
  late('after the end');
  assert.deepEqual(events.map(e=>e.type),['start','delta','error']);
  assert.ok(!JSON.stringify(events).includes(SECRET));
});

test('a typed provider error keeps its reason code',async()=>{
  const adapter={stream:async()=>{throw new ModelError('RATE_LIMIT','Anthropic rate limit reached. Try again shortly.')}};
  await assert.rejects(gw(adapter).stream({provider:'anthropic',messages:convo}),{code:'RATE_LIMIT'});
});

test('cancelling stops the provider request and reports CANCELLED',async()=>{
  const controller=new AbortController();let providerSignal;
  const adapter={stream:async({signal})=>{providerSignal=signal;return waitForAbort(signal)}};
  const pending=gw(adapter).stream({provider:'anthropic',messages:convo,policy:'task'},{signal:controller.signal});
  setTimeout(()=>controller.abort(),5);
  await assert.rejects(pending,{code:'CANCELLED'});assert.equal(providerSignal.aborted,true);
});

test('total and idle time limits produce TIMEOUT, and chat and task policies differ',async()=>{
  const slow={stream:async({signal})=>waitForAbort(signal)};
  await assert.rejects(gw(slow,{chat:{totalMs:20,idleMs:5000,maxTokens:10}}).stream({provider:'anthropic',messages:convo}),{code:'TIMEOUT'});
  await assert.rejects(gw(slow,{chat:{totalMs:5000,idleMs:20,maxTokens:10}}).stream({provider:'anthropic',messages:convo}),{code:'TIMEOUT'});
  // A request that keeps sending activity is not cut off by the idle limit.
  const busy={stream:async({onDelta})=>{for(let k=0;k<5;k++){await new Promise(r=>setTimeout(r,10));onDelta('x')}return {usage:{}}}};
  assert.equal((await gw(busy,{chat:{totalMs:5000,idleMs:25,maxTokens:10}}).stream({provider:'anthropic',messages:convo})).text,'xxxxx');
  const {POLICIES}=require('./model-gateway.cjs');assert.ok(POLICIES.task.totalMs>POLICIES.chat.totalMs&&POLICIES.task.idleMs>POLICIES.chat.idleMs);
});

test('providers without streaming fall back to a complete answer delivered as one piece',async()=>{
  const {events,onEvent}=collect();
  const result=await gw({generate:async()=>({text:'Whole answer',usage:{inputTokens:1,outputTokens:2}})}).stream({provider:'anthropic',messages:convo},{onEvent});
  assert.equal(result.text,'Whole answer');assert.deepEqual(events.map(e=>e.type),['start','delta','usage','complete']);
});

test('requests are validated before any key is used, including the request type',async()=>{
  const {events,onEvent}=collect();
  await assert.rejects(gw({}).stream({provider:'anthropic',messages:convo,policy:'forever'},{onEvent}),{code:'INVALID_REQUEST'});
  await assert.rejects(gw({}).stream({provider:'openai',model:'m',messages:convo}),{code:'NOT_CONNECTED'});
  assert.deepEqual(events.map(e=>e.type),['error']);
  await assert.rejects(gw({stream:async()=>({text:'  ',usage:{}})}).stream({provider:'anthropic',messages:convo}),{code:'EMPTY'});
});

test('Anthropic adapter streams through the SDK and still applies the fallback and effort settings',async()=>{
  let sent,options;const deltas=[];
  class Fake{constructor(){this.beta={messages:{stream:(r,o)=>{sent=r;options=o;const handlers={};return {on:(n,f)=>{handlers[n]=f},finalMessage:async()=>{handlers.streamEvent?.();handlers.text('Hello ');handlers.text('there');return {model:r.model,stop_reason:'end_turn',usage:{input_tokens:3,output_tokens:2},content:[{type:'text',text:'Hello there'}]}}}}}}}}
  const signal=new AbortController().signal;
  const out=await anthropic.stream({apiKey:'k',system:'S',messages:convo,maxTokens:100,signal,onDelta:d=>deltas.push(d),Client:Fake});
  assert.deepEqual(deltas,['Hello ','there']);assert.equal(out.text,'Hello there');assert.equal(options.signal,signal);
  assert.equal(sent.fallbacks,'default');assert.deepEqual(sent.output_config,{effort:'medium'});assert.equal(sent.max_tokens,100);
});

// A response body that delivers the given chunks, to exercise event boundaries split across reads.
const sseResponse=chunks=>({ok:true,status:200,body:new ReadableStream({start(c){for(const k of chunks)c.enqueue(new TextEncoder().encode(k));c.close()}})});

test('OpenAI streaming reads split events in order and takes usage from the final chunk',async()=>{
  const deltas=[];let body;
  const fetchImpl=async(_u,init)=>{body=JSON.parse(init.body);return sseResponse(['data: {"model":"m1","choices":[{"delta":{"content":"JS"}}]}\n\nda','ta: {"choices":[{"delta":{"content":"ONB"},"finish_reason":"stop"}]}\n\n','data: {"choices":[],"usage":{"prompt_tokens":4,"completion_tokens":2}}\n\ndata: [DONE]\n\n'])};
  const out=await openai.stream({apiKey:'k',model:'m1',system:'S',messages:convo,onDelta:d=>deltas.push(d),fetchImpl});
  assert.equal(body.stream,true);assert.deepEqual(body.stream_options,{include_usage:true});
  assert.deepEqual(deltas,['JS','ONB']);assert.equal(out.text,'JSONB');assert.deepEqual(out.usage,{inputTokens:4,outputTokens:2});assert.equal(out.stopReason,'stop');
  await assert.rejects(openai.stream({apiKey:'k',model:'m1',system:'S',messages:convo,fetchImpl:async()=>({ok:false,status:401})}),{code:'AUTH'});
});

test('Gemini streaming uses the streaming endpoint and maps statuses to codes',async()=>{
  const deltas=[];let url;
  const out=await google.stream({apiKey:'k',model:'g1',system:'S',messages:convo,onDelta:d=>deltas.push(d),fetchImpl:async u=>{url=u;return sseResponse(['data: {"candidates":[{"content":{"parts":[{"text":"Bin"}]}}]}\r\n\r\n','data: {"candidates":[{"content":{"parts":[{"text":"ary"}]},"finishReason":"STOP"}],"usageMetadata":{"promptTokenCount":5,"candidatesTokenCount":3}}\r\n\r\n'])}});
  assert.match(url,/g1:streamGenerateContent\?alt=sse$/);assert.deepEqual(deltas,['Bin','ary']);assert.deepEqual(out.usage,{inputTokens:5,outputTokens:3});
  await assert.rejects(google.stream({apiKey:'k',model:'g1',system:'S',messages:convo,fetchImpl:async()=>({ok:false,status:404})}),{code:'INVALID_MODEL'});
});
