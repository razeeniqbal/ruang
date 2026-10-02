// Anthropic adapter for the model gateway, using the official SDK. Runs only in the Electron main process.
const AnthropicSDK=require('@anthropic-ai/sdk');
const Anthropic=AnthropicSDK.default||AnthropicSDK;

const DEFAULT_MODEL='claude-opus-5-5';
// Models that accept the server-side refusal fallback in its "default" form and the effort setting.
const FALLBACK_MODELS=new Set(['claude-opus-5-5','claude-opus-5','claude-fable-5-1','claude-sonnet-5-5']);
const NO_EFFORT=/haiku/;

function friendly(error){
  if(error instanceof Anthropic.AuthenticationError)return Error('Anthropic rejected the saved key. Replace it under Settings, AI Connections.');
  if(error instanceof Anthropic.PermissionDeniedError)return Error('This Anthropic key is not allowed to use that model.');
  if(error instanceof Anthropic.NotFoundError)return Error('Anthropic does not recognise that model name.');
  if(error instanceof Anthropic.RateLimitError)return Error('Anthropic rate limit reached. Try again shortly.');
  if(error instanceof Anthropic.BadRequestError)return Error('Anthropic did not accept the request: '+String(error.message||'').slice(0,300));
  if(error instanceof Anthropic.APIConnectionError)return Error('Could not reach Anthropic. Check your internet connection.');
  if(error instanceof Anthropic.APIError)return Error(`Anthropic returned an error (${error.status||'unknown'}).`);
  return Error('The Anthropic request failed.');
}

async function generate({apiKey,model,system,messages,maxTokens=16000,effort='medium',Client=Anthropic}){
  const chosen=model||DEFAULT_MODEL;
  const client=new Client({apiKey,maxRetries:2,timeout:120000});
  const request={model:chosen,max_tokens:maxTokens,system,messages};
  if(!NO_EFFORT.test(chosen))request.output_config={effort};
  // On a policy decline the API re-runs the request on Anthropic's recommended fallback model.
  if(FALLBACK_MODELS.has(chosen)){request.betas=['server-side-fallback-2026-07-01'];request.fallbacks='default'}
  let response;
  try{response=request.betas?await client.beta.messages.create(request):await client.messages.create(request)}catch(error){throw friendly(error)}
  if(response.stop_reason==='refusal')throw Error('The model declined this request.');
  const text=response.content.filter(block=>block.type==='text').map(block=>block.text).join('').trim();
  return {text,model:response.model,stopReason:response.stop_reason,usage:{inputTokens:response.usage?.input_tokens??0,outputTokens:response.usage?.output_tokens??0}};
}

module.exports={generate,DEFAULT_MODEL,friendly};
