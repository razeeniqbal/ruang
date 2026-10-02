// Model gateway: the one place product code asks a model for text. Provider keys are unlocked here, in the
// Electron main process, and never reach the renderer. Each provider lives in its own adapter under ./models.
// Two ways in, sharing validation, key handling, limits, error codes and usage:
//   generate(): the complete answer in one piece
//   stream():   the same request, with events {start, delta, usage, complete, error} as the answer arrives
const {ModelError,redact}=require('./models/errors.cjs');
const adapters={anthropic:()=>require('./models/anthropic.cjs'),openai:()=>require('./models/openai.cjs'),google:()=>require('./models/google.cjs')};
// Product providers map onto the existing connection records (which hold the encrypted keys).
const CONNECTION={anthropic:'claude',openai:'codex',google:'gemini'};
const LIMITS={messages:40,chars:60000,system:8000};
// Execution policies. totalMs caps the whole request; idleMs fails a request that stops sending anything.
// Tasks may think and write for a long time, so they get far more room than chat.
const POLICIES=Object.freeze({
  chat:{totalMs:3*60*1000,idleMs:90*1000,maxTokens:8000},
  task:{totalMs:20*60*1000,idleMs:4*60*1000,maxTokens:32000}
});

function validate(request){
  if(!request||typeof request!=='object')throw new ModelError('INVALID_REQUEST','Invalid model request.');
  const {provider,model=null,system='',messages,policy='chat'}=request;
  if(!Object.hasOwn(adapters,provider))throw new ModelError('NOT_CONNECTED','Choose Anthropic, OpenAI or Google for this employee first.');
  if(model!==null&&(typeof model!=='string'||model.length>100||!/^[\w.:-]+$/.test(model)))throw new ModelError('INVALID_MODEL','That model name is not valid.');
  if(!Object.hasOwn(POLICIES,policy))throw new ModelError('INVALID_REQUEST','Unknown request type.');
  if(typeof system!=='string'||system.length>LIMITS.system)throw new ModelError('INVALID_REQUEST','The employee instructions are too long.');
  if(!Array.isArray(messages)||!messages.length||messages.length>LIMITS.messages)throw new ModelError('INVALID_REQUEST','Invalid conversation.');
  let total=0;
  const clean=messages.map(m=>{if(!m||!['user','assistant'].includes(m.role)||typeof m.content!=='string'||!m.content.trim())throw new ModelError('INVALID_REQUEST','Invalid conversation message.');total+=m.content.length;return {role:m.role,content:m.content}});
  if(total>LIMITS.chars)throw new ModelError('INVALID_REQUEST','This conversation is too long to send.');
  if(clean[0].role!=='user'||clean.at(-1).role!=='user')throw new ModelError('INVALID_REQUEST','The conversation must start and end with your message.');
  return {provider,model,system,messages:clean,policy};
}
const plain=error=>({code:error.code||'PROVIDER',message:error.message});

class ModelGateway{
  constructor({connections,load=name=>adapters[name](),policies=POLICIES}){this.connections=connections;this.load=load;this.policies=policies}
  // Which providers can generate right now (an API key is saved and enabled). No secrets are returned.
  status(){const out={};for(const [provider,id] of Object.entries(CONNECTION)){const c=this.connections.config[id];out[provider]={ready:!!(c?.enabled&&c.mode==='api'&&c.secret)}}return out}
  generate(request,options={}){return this.run(request,{...options,streaming:false})}
  stream(request,options={}){return this.run(request,{...options,streaming:true})}

  async run(request,{signal,onEvent=()=>{},streaming}){
    let ended=false;const emit=e=>{if(!ended)onEvent(e)};
    let apiKey=null,valid;
    try{valid=validate(request);try{apiKey=this.connections.secretFor(CONNECTION[valid.provider])}catch(error){throw new ModelError('NOT_CONNECTED',error.message)}}
    catch(error){const e=error instanceof ModelError?error:new ModelError('INVALID_REQUEST',error.message);emit({type:'error',...plain(e)});ended=true;throw e}
    const {provider,model,system,messages,policy}=valid,limits=this.policies[policy],adapter=this.load(provider);
    const controller=new AbortController();let why=null;
    const stop=reason=>{if(!why){why=reason;controller.abort()}};
    if(signal){if(signal.aborted)stop('cancelled');else signal.addEventListener('abort',()=>stop('cancelled'),{once:true})}
    const total=setTimeout(()=>stop('timeout'),limits.totalMs);let idle=null;
    const alive=()=>{clearTimeout(idle);idle=setTimeout(()=>stop('timeout'),limits.idleMs)};alive();
    const started=Date.now();let streamed='';
    emit({type:'start',provider,model});
    try{
      const args={apiKey,model,system,messages,maxTokens:limits.maxTokens,signal:controller.signal,onActivity:alive,onDelta:text=>{alive();streamed+=text;emit({type:'delta',text})}};
      // Streaming falls back to the complete answer when an adapter cannot stream.
      const result=streaming&&adapter.stream?await adapter.stream(args):await adapter.generate(args);
      if(why)throw new ModelError('CANCELLED','stopped');
      const text=String(result.text??streamed).trim();
      if(!text)throw new ModelError('EMPTY','The model returned an empty answer.');
      if(streaming&&!adapter.stream)emit({type:'delta',text});
      const usage={inputTokens:result.usage?.inputTokens??0,outputTokens:result.usage?.outputTokens??0};
      const final={text,model:result.model||model,provider,stopReason:result.stopReason??null,usage,durationMs:Date.now()-started};
      emit({type:'usage',...usage});emit({type:'complete',model:final.model,stopReason:final.stopReason,durationMs:final.durationMs});ended=true;
      return final;
    }catch(error){
      const e=why==='cancelled'?new ModelError('CANCELLED','You stopped this request.')
        :why==='timeout'?new ModelError('TIMEOUT',policy==='task'?'The model stopped responding or ran past the time limit for a task. Try again, or split the task into smaller parts.':'The model took too long to reply. Try again.')
        :error instanceof ModelError?new ModelError(error.code,redact(error.message,apiKey)):new ModelError('PROVIDER',redact(error?.message||'The request failed.',apiKey));
      emit({type:'error',...plain(e)});ended=true;throw e;
    }finally{clearTimeout(total);clearTimeout(idle)}
  }
}
module.exports={ModelGateway,validate,CONNECTION,POLICIES};
