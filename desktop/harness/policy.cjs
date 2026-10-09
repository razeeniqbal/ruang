// Permissions for the harness. Decisions use the same ALLOW / ASK / DENY rules as the rest of Ruang (core.js).
// The employee is copied and frozen when a run starts, so nothing produced during the run can change it.
const Core=require('../../dist/core.js');
const DECISIONS=Object.freeze(['ALLOW','ASK','DENY']);
// Each tool maps to one permission. Only read_context_file exists in 0.14; the rest reserve their mapping.
const TOOL_PERMISSIONS=Object.freeze({read_context_file:'readFiles',write_file:'writeFiles',run_python:'runCode',web_search:'useBrowser',git_diff:'readFiles',git_commit:'gitCommit',git_push:'gitPush',delete_file:'deleteFiles'});

const text=(value,max)=>typeof value==='string'?value.slice(0,max):'';
const MODEL_NAME=/^[\w.:-]{1,100}$/;
function modelChoice(m){
  if(!m||typeof m!=='object'||typeof m.provider!=='string'||!/^[a-z]{1,20}$/.test(m.provider))return null;
  return {provider:m.provider,model:typeof m.model==='string'&&MODEL_NAME.test(m.model)?m.model:null};
}
function deepFreeze(value){if(value&&typeof value==='object'){Object.freeze(value);for(const v of Object.values(value))deepFreeze(v)}return value}

function snapshotEmployee(raw){
  const r=raw&&typeof raw==='object'?raw:{},permissions={};
  for(const p of Core.PERMISSIONS){const v=r.permissions?.[p];permissions[p]=DECISIONS.includes(v)?v:Core.DEFAULT_PERMISSIONS[p]}
  return deepFreeze({id:text(r.id,100),name:text(r.name,40)||'Employee',role:text(r.role,80)||'Teammate',description:text(r.description,2000),
    responsibilities:(Array.isArray(r.responsibilities)?r.responsibilities:[]).slice(0,20).map(x=>text(x,300)).filter(Boolean),instructions:text(r.instructions,4000),
    model:modelChoice(r.model)||{provider:null,model:null},fallbackModel:modelChoice(r.fallbackModel),autonomy:Core.AUTONOMY.includes(r.autonomy)?r.autonomy:'BALANCED',permissions});
}
const decide=(employee,permission)=>Core.permissionDecision(employee,permission);
module.exports={TOOL_PERMISSIONS,DECISIONS,snapshotEmployee,decide,deepFreeze};
