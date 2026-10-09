// Tool registry: the only tools a model can reach. A tool is {name, description, inputSchema, permission, risk,
// execute}. execute() always re-checks the permission, so no caller (page, model or harness step) can skip it.
const Core=require('../../dist/core.js');
const {TOOL_PERMISSIONS,decide}=require('./policy.cjs');
const NAME=/^[a-z][a-z0-9_]{0,63}$/;
const RISKS=Object.freeze(['low','medium','high']);

class ToolError extends Error{constructor(code,message){super(message);this.name='ToolError';this.code=code}}

// A small subset of JSON Schema: an object with typed properties, required keys and no extras.
const TYPES={string:v=>typeof v==='string',number:v=>typeof v==='number'&&Number.isFinite(v),integer:v=>Number.isInteger(v),boolean:v=>typeof v==='boolean'};
function checkInput(schema,input){
  if(!input||typeof input!=='object'||Array.isArray(input))throw new ToolError('INVALID_INPUT','The tool input must be an object.');
  const props=schema.properties||{};
  for(const key of schema.required||[])if(!Object.hasOwn(input,key))throw new ToolError('INVALID_INPUT',`Missing "${key}".`);
  for(const [key,value] of Object.entries(input)){
    const spec=props[key];if(!spec){if(schema.additionalProperties===false)throw new ToolError('INVALID_INPUT',`Unknown input "${key}".`);continue}
    if(!TYPES[spec.type]?.(value))throw new ToolError('INVALID_INPUT',`"${key}" must be a ${spec.type}.`);
    if(spec.type==='string'&&spec.maxLength&&value.length>spec.maxLength)throw new ToolError('INVALID_INPUT',`"${key}" is too long.`);
  }
}

class ToolRegistry{
  constructor(){this.tools=new Map()}
  register(tool){
    if(!tool||!NAME.test(tool.name))throw Error('A tool needs a lower-case name.');
    if(this.tools.has(tool.name))throw Error(`The tool ${tool.name} is already registered.`);
    if(typeof tool.description!=='string'||!tool.description||tool.inputSchema?.type!=='object'||typeof tool.execute!=='function')throw Error(`The tool ${tool.name} is incomplete.`);
    if(!Core.PERMISSIONS.includes(tool.permission))throw Error(`The tool ${tool.name} needs a known permission.`);
    if(TOOL_PERMISSIONS[tool.name]&&TOOL_PERMISSIONS[tool.name]!==tool.permission)throw Error(`The tool ${tool.name} must use the ${TOOL_PERMISSIONS[tool.name]} permission.`);
    if(!RISKS.includes(tool.risk))throw Error(`The tool ${tool.name} needs a risk level.`);
    this.tools.set(tool.name,Object.freeze({...tool}));return this;
  }
  get(name){return this.tools.get(name)||null}
  // Tools this employee may use for this run (ALLOW or ASK). Denied tools are never offered to the model.
  listAllowed(employee,context={}){return [...this.tools.values()].filter(t=>decide(employee,t.permission)!=='DENY'&&(!t.available||t.available(context)))}
  definitions(employee,context){return this.listAllowed(employee,context).map(({name,description,inputSchema})=>({name,description,inputSchema}))}
  validate(name,input){const tool=this.get(name);if(!tool)throw new ToolError('UNKNOWN_TOOL',`There is no tool named "${String(name).slice(0,64)}".`);checkInput(tool.inputSchema,input);return tool}
  // ctx: {employee, approvedCall, signal, ...}. ASK runs only once a person approved this exact call.
  async execute(name,input,ctx){
    const tool=this.validate(name,input),decision=decide(ctx.employee,tool.permission);
    if(decision==='DENY')throw new ToolError('DENIED',`${tool.name} is not available to ${ctx.employee.name}.`);
    if(decision==='ASK'&&ctx.approvedCall!==true)throw new ToolError('NEEDS_APPROVAL',`${tool.name} needs your approval first.`);
    if(ctx.signal?.aborted)throw new ToolError('CANCELLED','The run was stopped.');
    return tool.execute(input,ctx);
  }
}
module.exports={ToolRegistry,ToolError,checkInput};
