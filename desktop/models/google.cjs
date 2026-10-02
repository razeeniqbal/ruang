// Google Gemini adapter for the model gateway (generateContent over HTTPS). Runs only in the Electron main process.
const {ModelError,fromStatus}=require('./errors.cjs');
const {sseData}=require('./sse.cjs');
const BASE='https://generativelanguage.googleapis.com/v1beta/models/';

function check(model){
  if(!model)throw new ModelError('INVALID_MODEL','Choose a Gemini model name for this employee first.');
  if(!/^[\w.-]+$/.test(model))throw new ModelError('INVALID_MODEL','That Gemini model name is not valid.');
}
const body=({system,messages,maxTokens})=>JSON.stringify({systemInstruction:{parts:[{text:system}]},generationConfig:{maxOutputTokens:maxTokens},contents:messages.map(m=>({role:m.role==='assistant'?'model':'user',parts:[{text:m.content}]}))});
async function post({url,apiKey,payload,signal,fetchImpl}){
  let response;
  try{response=await fetchImpl(url,{method:'POST',redirect:'error',signal,headers:{'x-goog-api-key':apiKey,'Content-Type':'application/json'},body:payload})}
  catch(error){if(signal?.aborted)throw new ModelError('CANCELLED','The request was stopped.');throw new ModelError('NETWORK','Could not reach Google. Check your internet connection.')}
  if(!response.ok)throw fromStatus('Google',response.status);
  return response;
}
const textOf=candidate=>(candidate?.content?.parts||[]).map(p=>p.text||'').join('');

async function generate({apiKey,model,system,messages,maxTokens=4096,signal,fetchImpl=global.fetch}){
  check(model);
  const response=await post({url:`${BASE}${model}:generateContent`,apiKey,payload:body({system,messages,maxTokens}),signal,fetchImpl});
  const json=await response.json().catch(()=>null),candidate=json?.candidates?.[0];
  if(!candidate)throw new ModelError('PROVIDER','Google returned an unexpected response.');
  return {text:textOf(candidate).trim(),model,stopReason:candidate.finishReason||null,usage:{inputTokens:json.usageMetadata?.promptTokenCount??0,outputTokens:json.usageMetadata?.candidatesTokenCount??0}};
}

async function stream({apiKey,model,system,messages,maxTokens=4096,signal,onDelta=()=>{},onActivity=()=>{},fetchImpl=global.fetch}){
  check(model);
  const response=await post({url:`${BASE}${model}:streamGenerateContent?alt=sse`,apiKey,payload:body({system,messages,maxTokens}),signal,fetchImpl});
  let text='',usage={inputTokens:0,outputTokens:0},stopReason=null;
  try{
    for await(const data of sseData(response)){onActivity();let chunk;try{chunk=JSON.parse(data)}catch{continue}
      const candidate=chunk.candidates?.[0],delta=textOf(candidate);if(delta){text+=delta;onDelta(delta)}
      if(candidate?.finishReason)stopReason=candidate.finishReason;
      if(chunk.usageMetadata)usage={inputTokens:chunk.usageMetadata.promptTokenCount??0,outputTokens:chunk.usageMetadata.candidatesTokenCount??0}}
  }catch(error){if(signal?.aborted)throw new ModelError('CANCELLED','The request was stopped.');throw new ModelError('NETWORK','The connection to Google dropped while it was answering.')}
  return {text:text.trim(),model,stopReason,usage};
}
module.exports={generate,stream};
