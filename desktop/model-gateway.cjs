// Model gateway: the one place product code asks a model for text. Provider keys are unlocked here, in the
// Electron main process, and never reach the renderer. Each provider lives in its own adapter under ./models.
const adapters={anthropic:()=>require('./models/anthropic.cjs'),openai:()=>require('./models/openai.cjs'),google:()=>require('./models/google.cjs')};
// Product providers map onto the existing connection records (which hold the encrypted keys).
const CONNECTION={anthropic:'claude',openai:'codex',google:'gemini'};
const LIMITS={messages:40,chars:20000,system:8000};

function validate(request){
  if(!request||typeof request!=='object')throw Error('Invalid model request.');
  const {provider,model=null,system='',messages}=request;
  if(!Object.hasOwn(adapters,provider))throw Error('Choose Anthropic, OpenAI or Google for this employee first.');
  if(model!==null&&(typeof model!=='string'||model.length>100||!/^[\w.:-]+$/.test(model)))throw Error('That model name is not valid.');
  if(typeof system!=='string'||system.length>LIMITS.system)throw Error('The employee instructions are too long.');
  if(!Array.isArray(messages)||!messages.length||messages.length>LIMITS.messages)throw Error('Invalid conversation.');
  let total=0;
  const clean=messages.map(m=>{if(!m||!['user','assistant'].includes(m.role)||typeof m.content!=='string'||!m.content.trim())throw Error('Invalid conversation message.');total+=m.content.length;return {role:m.role,content:m.content}});
  if(total>LIMITS.chars)throw Error('This conversation is too long to send.');
  if(clean[0].role!=='user'||clean.at(-1).role!=='user')throw Error('The conversation must start and end with your message.');
  return {provider,model,system,messages:clean};
}

class ModelGateway{
  constructor({connections,load=name=>adapters[name]()}){this.connections=connections;this.load=load}
  // Which providers can generate right now (an API key is saved and enabled). No secrets are returned.
  status(){const out={};for(const [provider,id] of Object.entries(CONNECTION)){const c=this.connections.config[id];out[provider]={ready:!!(c?.enabled&&c.mode==='api'&&c.secret)}}return out}
  async generate(request){
    const {provider,model,system,messages}=validate(request);
    const apiKey=this.connections.secretFor(CONNECTION[provider]);
    const started=Date.now();
    const result=await this.load(provider).generate({apiKey,model,system,messages});
    return {...result,provider,durationMs:Date.now()-started};
  }
}
module.exports={ModelGateway,validate,CONNECTION};
