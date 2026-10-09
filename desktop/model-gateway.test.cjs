const test=require('node:test'),assert=require('node:assert/strict');
const {ModelGateway,validate}=require('./model-gateway.cjs');
const anthropic=require('./models/anthropic.cjs'),openai=require('./models/openai.cjs'),google=require('./models/google.cjs');
const SDK=require('@anthropic-ai/sdk'),Anthropic=SDK.default||SDK;

const convo=[{role:'user',content:'Summarise the plan.'}];
const fakeConnections=(config={claude:{enabled:true,mode:'api',secret:'enc'}})=>({config,secretFor:id=>{if(!config[id]?.secret)throw Error('Connect first.');return 'sk-test-'+id}});

test('validation rejects malformed or oversized requests before any key is unlocked',()=>{
  assert.throws(()=>validate({provider:'nope',messages:convo}),/Choose Anthropic/);
  assert.throws(()=>validate({provider:'anthropic',messages:[]}),/Invalid conversation/);
  assert.throws(()=>validate({provider:'anthropic',messages:[{role:'system',content:'x'}]}),/Invalid conversation message/);
  assert.throws(()=>validate({provider:'anthropic',messages:[{role:'assistant',content:'hi'}]}),/start and end with your message/);
  assert.throws(()=>validate({provider:'anthropic',model:'bad model; rm',messages:convo}),/model name is not valid/);
  assert.throws(()=>validate({provider:'anthropic',messages:[{role:'user',content:'x'.repeat(60001)}]}),/too long/);
  assert.deepEqual(validate({provider:'anthropic',messages:convo}).messages,convo);
});

test('status reports readiness without secrets, and generate uses the unlocked key',async()=>{
  let seen;const gw=new ModelGateway({connections:fakeConnections(),load:()=>({generate:async args=>{seen=args;return {text:'ok',model:'m',usage:{inputTokens:1,outputTokens:2}}}})});
  assert.deepEqual(gw.status(),{anthropic:{ready:true},openai:{ready:false},google:{ready:false}});
  assert.ok(!JSON.stringify(gw.status()).includes('enc'));
  const result=await gw.generate({provider:'anthropic',system:'You are Aisha.',messages:convo});
  assert.equal(seen.apiKey,'sk-test-claude');assert.equal(result.provider,'anthropic');assert.equal(result.text,'ok');assert.ok(result.durationMs>=0);
  await assert.rejects(gw.generate({provider:'openai',model:'x',messages:convo}),/Connect first/);
});

test('Anthropic request: default model, explicit effort, server-side fallback, text only',async()=>{
  let sent;class Fake{constructor(opts){this.opts=opts;this.messages={create:async()=>{throw Error('should use beta')}};this.beta={messages:{create:async r=>{sent=r;return {model:r.model,stop_reason:'end_turn',usage:{input_tokens:5,output_tokens:7},content:[{type:'thinking',thinking:''},{type:'text',text:' Hello '}]}}}}}}
  const out=await anthropic.generate({apiKey:'k',system:'S',messages:convo,Client:Fake});
  assert.equal(sent.model,'claude-opus-5-5');assert.deepEqual(sent.output_config,{effort:'medium'});
  assert.deepEqual(sent.betas,['server-side-fallback-2026-07-01']);assert.equal(sent.fallbacks,'default');assert.equal(sent.system,'S');
  assert.equal(out.text,'Hello');assert.deepEqual(out.usage,{inputTokens:5,outputTokens:7});
});

test('Anthropic: Haiku gets no effort or fallback; refusals and API errors become clear messages',async()=>{
  let sent;class Plain{constructor(){this.messages={create:async r=>{sent=r;return {model:r.model,stop_reason:'end_turn',usage:{},content:[{type:'text',text:'hi'}]}}}}}
  await anthropic.generate({apiKey:'k',model:'claude-haiku-4-5',system:'S',messages:convo,Client:Plain});
  assert.equal(sent.output_config,undefined);assert.equal(sent.fallbacks,undefined);
  class Refuses{constructor(){this.beta={messages:{create:async()=>({stop_reason:'refusal',content:[],usage:{}})}}}}
  await assert.rejects(anthropic.generate({apiKey:'k',system:'S',messages:convo,Client:Refuses}),/declined/);
  const auth=Object.create(Anthropic.AuthenticationError.prototype);
  assert.match(anthropic.friendly(auth).message,/rejected the saved key/);
  assert.doesNotMatch(anthropic.friendly(auth).message,/sk-/);
});

test('OpenAI and Google adapters need a model name and map replies',async()=>{
  await assert.rejects(openai.generate({apiKey:'k',system:'S',messages:convo}),/Choose an OpenAI model/);
  const ok=body=>async()=>({ok:true,status:200,json:async()=>body});
  const o=await openai.generate({apiKey:'k',model:'m1',system:'S',messages:convo,fetchImpl:ok({model:'m1',choices:[{message:{content:'Hi'},finish_reason:'stop'}],usage:{prompt_tokens:3,completion_tokens:4}})});
  assert.equal(o.text,'Hi');assert.equal(o.usage.outputTokens,4);
  await assert.rejects(openai.generate({apiKey:'k',model:'m1',system:'S',messages:convo,fetchImpl:async()=>({ok:false,status:401})}),/rejected the saved key/);
  let url;const g=await google.generate({apiKey:'k',model:'g1',system:'S',messages:convo,fetchImpl:async(u)=>{url=u;return {ok:true,status:200,json:async()=>({candidates:[{content:{parts:[{text:'Yo'}]},finishReason:'STOP'}],usageMetadata:{promptTokenCount:1,candidatesTokenCount:2}})}}});
  assert.equal(g.text,'Yo');assert.match(url,/models\/g1:generateContent$/);
  await assert.rejects(google.generate({apiKey:'k',model:'g1/../x',system:'S',messages:convo}),/not valid/);
});

// ---- Structured tool calls (used by the AI harness) ----------------------------------------------------
const TOOLS=[{name:'read_context_file',description:'Read an approved file.',inputSchema:{type:'object',properties:{path:{type:'string'}},required:['path']}}];
const toolTurn=[{role:'user',content:'Analyse the files.'},{role:'assistant',content:'',toolCalls:[{id:'tu_1',name:'read_context_file',input:{path:'a.csv'}}]},{role:'tool',toolCallId:'tu_1',name:'read_context_file',content:'x,y'}];

test('tool requests: only tasks may define tools, and tool turns must match the defined tools',()=>{
  assert.throws(()=>validate({provider:'anthropic',messages:convo,tools:TOOLS}),/only available to tasks/);
  assert.throws(()=>validate({provider:'anthropic',policy:'task',messages:toolTurn}),/Invalid conversation message/,'tool turns need tool definitions');
  assert.throws(()=>validate({provider:'anthropic',policy:'task',messages:convo,tools:[{name:'Bad Name',description:'d',inputSchema:{}}]}),/Invalid tool definition/);
  const ok=validate({provider:'anthropic',policy:'task',messages:toolTurn,tools:TOOLS});
  assert.equal(ok.messages.at(-1).role,'tool');assert.deepEqual(ok.messages[1].toolCalls,[{id:'tu_1',name:'read_context_file',input:{path:'a.csv'}}]);
  assert.throws(()=>validate({provider:'anthropic',policy:'task',messages:toolTurn.slice(0,2),tools:TOOLS}),/start and end with your message/);
  // Tasks have room for approved file context; chat keeps its smaller limit.
  assert.equal(validate({provider:'anthropic',policy:'task',messages:[{role:'user',content:'x'.repeat(100000)}]}).messages.length,1);
});

test('a reply with tool calls is normalised, and providers without tool support are never sent tools',async()=>{
  const gw=new ModelGateway({connections:fakeConnections(),load:name=>name==='anthropic'?{supportsTools:true,generate:async args=>{if(!args.tools)return {text:'Done',usage:{}};assert.deepEqual(args.tools,TOOLS);return {text:'',toolCalls:[{id:'tu_2',name:'read_context_file',input:{path:'b.csv'}}],usage:{}}}}:{generate:async()=>({text:'x'})}});
  const out=await gw.generate({provider:'anthropic',policy:'task',messages:convo,tools:TOOLS});
  assert.equal(out.type,'tool_calls');assert.equal(out.text,'');assert.deepEqual(out.toolCalls,[{id:'tu_2',name:'read_context_file',input:{path:'b.csv'}}]);
  assert.deepEqual(gw.capabilities('anthropic'),{tools:true});assert.deepEqual(gw.capabilities('openai'),{tools:false});assert.deepEqual(gw.capabilities('nope'),{tools:false});
  const plain=await gw.generate({provider:'anthropic',policy:'task',messages:convo});assert.equal(plain.type,'final');
  const noTools=new ModelGateway({connections:fakeConnections({codex:{enabled:true,mode:'api',secret:'e'}}),load:()=>({generate:async()=>({text:'x'})})});
  await assert.rejects(noTools.generate({provider:'openai',model:'m',policy:'task',messages:convo,tools:TOOLS}),/cannot use Ruang tools/);
});

test('Anthropic adapter: tool definitions, tool_use and tool_result blocks, and tool calls in the reply',async()=>{
  let sent;class Fake{constructor(){this.beta={messages:{create:async r=>{sent=r;return {model:r.model,stop_reason:'tool_use',usage:{input_tokens:1,output_tokens:1},
    content:[{type:'thinking',thinking:'private'},{type:'text',text:'Reading it.'},{type:'tool_use',id:'tu_3',name:'read_context_file',input:{path:'c.csv'}}]}}}}}}
  const out=await anthropic.generate({apiKey:'k',system:'S',messages:[...toolTurn,{role:'tool',toolCallId:'tu_9',name:'read_context_file',content:'denied',isError:true}],tools:TOOLS,Client:Fake});
  assert.deepEqual(sent.tools,[{name:'read_context_file',description:'Read an approved file.',input_schema:TOOLS[0].inputSchema}]);
  assert.deepEqual(sent.messages[1],{role:'assistant',content:[{type:'tool_use',id:'tu_1',name:'read_context_file',input:{path:'a.csv'}}]});
  assert.deepEqual(sent.messages[2],{role:'user',content:[{type:'tool_result',tool_use_id:'tu_1',content:'x,y'},{type:'tool_result',tool_use_id:'tu_9',content:'denied',is_error:true}]},'consecutive results share one turn');
  assert.equal(out.text,'Reading it.');assert.deepEqual(out.toolCalls,[{id:'tu_3',name:'read_context_file',input:{path:'c.csv'}}]);
  assert.ok(!JSON.stringify(out).includes('private'),'reasoning blocks are dropped');
});
