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
