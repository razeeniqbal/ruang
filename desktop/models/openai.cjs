// OpenAI adapter for the model gateway (Chat Completions over HTTPS). Runs only in the Electron main process.
const {ModelError,fromStatus}=require('./errors.cjs');
const {sseData}=require('./sse.cjs');
const URL_='https://api.openai.com/v1/chat/completions';

function body({model,system,messages,maxTokens,stream}){
  return JSON.stringify({model,max_completion_tokens:maxTokens,messages:[{role:'system',content:system},...messages],...(stream?{stream:true,stream_options:{include_usage:true}}:{})});
}
async function post({apiKey,payload,signal,fetchImpl}){
  let response;
  try{response=await fetchImpl(URL_,{method:'POST',redirect:'error',signal,headers:{Authorization:'Bearer '+apiKey,'Content-Type':'application/json'},body:payload})}
  catch(error){if(signal?.aborted)throw new ModelError('CANCELLED','The request was stopped.');throw new ModelError('NETWORK','Could not reach OpenAI. Check your internet connection.')}
  if(!response.ok)throw fromStatus('OpenAI',response.status);
  return response;
}

async function generate({apiKey,model,system,messages,maxTokens=4096,signal,fetchImpl=global.fetch}){
  if(!model)throw new ModelError('INVALID_MODEL','Choose an OpenAI model name for this employee first.');
  const response=await post({apiKey,payload:body({model,system,messages,maxTokens}),signal,fetchImpl});
  const json=await response.json().catch(()=>null),choice=json?.choices?.[0];
  if(typeof choice?.message?.content!=='string')throw new ModelError('PROVIDER','OpenAI returned an unexpected response.');
  return {text:choice.message.content.trim(),model:json.model||model,stopReason:choice.finish_reason||null,usage:{inputTokens:json.usage?.prompt_tokens??0,outputTokens:json.usage?.completion_tokens??0}};
}

async function stream({apiKey,model,system,messages,maxTokens=4096,signal,onDelta=()=>{},onActivity=()=>{},fetchImpl=global.fetch}){
  if(!model)throw new ModelError('INVALID_MODEL','Choose an OpenAI model name for this employee first.');
  const response=await post({apiKey,payload:body({model,system,messages,maxTokens,stream:true}),signal,fetchImpl});
  let text='',usage={inputTokens:0,outputTokens:0},stopReason=null,served=model;
  try{
    for await(const data of sseData(response)){onActivity();let chunk;try{chunk=JSON.parse(data)}catch{continue}
      served=chunk.model||served;const choice=chunk.choices?.[0];const delta=choice?.delta?.content;
      if(delta){text+=delta;onDelta(delta)}if(choice?.finish_reason)stopReason=choice.finish_reason;
      if(chunk.usage)usage={inputTokens:chunk.usage.prompt_tokens??0,outputTokens:chunk.usage.completion_tokens??0}}
  }catch(error){if(signal?.aborted)throw new ModelError('CANCELLED','The request was stopped.');throw new ModelError('NETWORK','The connection to OpenAI dropped while it was answering.')}
  return {text:text.trim(),model:served,stopReason,usage};
}
module.exports={generate,stream};
