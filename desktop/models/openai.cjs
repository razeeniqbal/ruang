// OpenAI adapter for the model gateway (Chat Completions over HTTPS). Runs only in the Electron main process.
async function generate({apiKey,model,system,messages,maxTokens=4096,fetchImpl=global.fetch}){
  if(!model)throw Error('Choose an OpenAI model name for this employee first.');
  let response;
  try{response=await fetchImpl('https://api.openai.com/v1/chat/completions',{method:'POST',redirect:'error',signal:AbortSignal.timeout(120000),
    headers:{Authorization:'Bearer '+apiKey,'Content-Type':'application/json'},
    body:JSON.stringify({model,max_completion_tokens:maxTokens,messages:[{role:'system',content:system},...messages]})})}
  catch{throw Error('Could not reach OpenAI. Check your internet connection.')}
  if(!response.ok){const code=response.status;throw Error(code===401||code===403?'OpenAI rejected the saved key. Replace it under Settings, AI Connections.':code===404?'OpenAI does not recognise that model name.':code===429?'OpenAI rate limit reached. Try again shortly.':`OpenAI returned an error (${code}).`)}
  const body=await response.json().catch(()=>null),choice=body?.choices?.[0];
  if(typeof choice?.message?.content!=='string')throw Error('OpenAI returned an unexpected response.');
  return {text:choice.message.content.trim(),model:body.model||model,stopReason:choice.finish_reason||null,usage:{inputTokens:body.usage?.prompt_tokens??0,outputTokens:body.usage?.completion_tokens??0}};
}
module.exports={generate};
