// Google Gemini adapter for the model gateway (generateContent over HTTPS). Runs only in the Electron main process.
async function generate({apiKey,model,system,messages,maxTokens=4096,fetchImpl=global.fetch}){
  if(!model)throw Error('Choose a Gemini model name for this employee first.');
  if(!/^[\w.-]+$/.test(model))throw Error('That Gemini model name is not valid.');
  let response;
  try{response=await fetchImpl(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`,{method:'POST',redirect:'error',signal:AbortSignal.timeout(120000),
    headers:{'x-goog-api-key':apiKey,'Content-Type':'application/json'},
    body:JSON.stringify({systemInstruction:{parts:[{text:system}]},generationConfig:{maxOutputTokens:maxTokens},
      contents:messages.map(m=>({role:m.role==='assistant'?'model':'user',parts:[{text:m.content}]}))})})}
  catch{throw Error('Could not reach Google. Check your internet connection.')}
  if(!response.ok){const code=response.status;throw Error(code===401||code===403?'Google rejected the saved key. Replace it under Settings, AI Connections.':code===404?'Google does not recognise that model name.':code===429?'Google rate limit reached. Try again shortly.':`Google returned an error (${code}).`)}
  const body=await response.json().catch(()=>null),candidate=body?.candidates?.[0];
  const text=(candidate?.content?.parts||[]).map(p=>p.text||'').join('').trim();
  if(!candidate)throw Error('Google returned an unexpected response.');
  return {text,model,stopReason:candidate.finishReason||null,usage:{inputTokens:body.usageMetadata?.promptTokenCount??0,outputTokens:body.usageMetadata?.candidatesTokenCount??0}};
}
module.exports={generate};
