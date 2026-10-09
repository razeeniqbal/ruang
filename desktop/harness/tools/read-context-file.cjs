// The first harness capability: read one file the person approved for this task. Naming any other file fails,
// and the workspace's own checks (inside the project folder, text only, no secrets or links) still apply.
const {ToolError}=require('../tool-registry.cjs');
const normalizePath=p=>String(p||'').replace(/\\/g,'/').replace(/^(\.\/)+/,'').replace(/\/+/g,'/');
const keyOf=p=>normalizePath(p).toLowerCase();

function readContextFile(){
  return {
    name:'read_context_file',
    description:'Read one of the files the user approved for this task. Only the approved paths listed in the request can be read.',
    inputSchema:{type:'object',properties:{path:{type:'string',maxLength:500,description:'The file path exactly as listed under approved context.'}},required:['path'],additionalProperties:false},
    permission:'readFiles',risk:'low',
    available:ctx=>!!ctx.approvedFiles?.size,
    async execute({path},ctx){
      const approved=ctx.approvedFiles?.get(keyOf(path));
      if(!approved)throw new ToolError('NOT_APPROVED',`"${String(path).slice(0,200)}" is not one of the files approved for this task.`);
      const file=await ctx.workspace.read(approved);
      return {path:approved,content:file.content,bytes:Buffer.byteLength(file.content,'utf8'),sha256:file.hash||null};
    }
  };
}
module.exports={readContextFile,normalizePath,keyOf};
