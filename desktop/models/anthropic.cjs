// Anthropic adapter for the model gateway, using the official SDK. Runs only in the Electron main process.
const AnthropicSDK=require('@anthropic-ai/sdk');
const Anthropic=AnthropicSDK.default||AnthropicSDK;
const {ModelError}=require('./errors.cjs');

const DEFAULT_MODEL='claude-opus-5-5';
// Models that accept the server-side refusal fallback in its "default" form and the effort setting.
const FALLBACK_MODELS=new Set(['claude-opus-5-5','claude-opus-5','claude-fable-5-1','claude-sonnet-5-5']);
const NO_EFFORT=/haiku/;

function friendly(error){
  if(error instanceof ModelError)return error;
  if(error instanceof Anthropic.APIUserAbortError)return new ModelError('CANCELLED','The request was stopped.');
  if(error instanceof Anthropic.APIConnectionTimeoutError)return new ModelError('TIMEOUT','Anthropic took too long to respond.');
  if(error instanceof Anthropic.AuthenticationError)return new ModelError('AUTH','Anthropic rejected the saved key. Replace it under Settings, AI Connections.');
  if(error instanceof Anthropic.PermissionDeniedError)return new ModelError('AUTH','This Anthropic key is not allowed to use that model.');
  if(error instanceof Anthropic.NotFoundError)return new ModelError('INVALID_MODEL','Anthropic does not recognise that model name.');
  if(error instanceof Anthropic.RateLimitError)return new ModelError('RATE_LIMIT','Anthropic rate limit reached. Try again shortly.');
  if(error instanceof Anthropic.BadRequestError)return new ModelError('INVALID_REQUEST','Anthropic did not accept the request: '+String(error.message||'').slice(0,300));
  if(error instanceof Anthropic.APIConnectionError)return new ModelError('NETWORK','Could not reach Anthropic. Check your internet connection.');
  if(error instanceof Anthropic.APIError)return new ModelError('PROVIDER',`Anthropic returned an error (${error.status||'unknown'}).`);
  return new ModelError('PROVIDER','The Anthropic request failed.');
}

function buildRequest({model,system,messages,maxTokens,effort}){
  const chosen=model||DEFAULT_MODEL;
  const request={model:chosen,max_tokens:maxTokens,system,messages};
  if(!NO_EFFORT.test(chosen))request.output_config={effort};
  // On a policy decline the API re-runs the request on Anthropic's recommended fallback model.
  if(FALLBACK_MODELS.has(chosen)){request.betas=['server-side-fallback-2026-07-01'];request.fallbacks='default'}
  return request;
}
function finish(message){
  if(message.stop_reason==='refusal')throw new ModelError('REFUSAL','The model declined this request.');
  const text=message.content.filter(block=>block.type==='text').map(block=>block.text).join('').trim();
  return {text,model:message.model,stopReason:message.stop_reason,usage:{inputTokens:message.usage?.input_tokens??0,outputTokens:message.usage?.output_tokens??0}};
}
// The gateway owns time limits through `signal`, so the SDK's own timeout is set out of the way.
const client=(Client,apiKey)=>new Client({apiKey,maxRetries:2,timeout:60*60*1000});

// Complete response in one piece (kept as the fallback path).
async function generate({apiKey,model,system,messages,maxTokens=16000,effort='medium',signal,Client=Anthropic}){
  const request=buildRequest({model,system,messages,maxTokens,effort}),c=client(Client,apiKey);
  let response;
  try{response=request.betas?await c.beta.messages.create(request,{signal}):await c.messages.create(request,{signal})}catch(error){throw friendly(error)}
  return finish(response);
}

// Streamed response: text pieces go to onDelta as they arrive; any stream event counts as activity.
async function stream({apiKey,model,system,messages,maxTokens=16000,effort='medium',signal,onDelta=()=>{},onActivity=()=>{},Client=Anthropic}){
  const request=buildRequest({model,system,messages,maxTokens,effort}),c=client(Client,apiKey);
  let message;
  try{
    const s=(request.betas?c.beta.messages:c.messages).stream(request,{signal});
    s.on('streamEvent',()=>onActivity());
    s.on('text',delta=>onDelta(delta));
    message=await s.finalMessage();
  }catch(error){throw friendly(error)}
  return finish(message);
}

module.exports={generate,stream,DEFAULT_MODEL,friendly};
