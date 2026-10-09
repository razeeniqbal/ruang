// Execution limits for one run. Every run is bounded. Callers may only tighten these values; nothing the
// model, a project file, a tool result or the page sends can raise them.
const DEFAULT_LIMITS=Object.freeze({
  maxTurns:6,                    // model calls in one run (a tool round trip uses one)
  maxToolCalls:12,               // tool requests in one run
  maxRepeats:2,                  // the same tool with the same input, before Ruang stops the run
  maxRuntimeMs:25*60*1000,       // the whole run, not counting time spent waiting for a person
  maxApprovalWaitMs:30*60*1000,  // how long a paused run waits for a decision
  maxContextFiles:10,            // files approved for one task
  maxContextBytes:200*1000,      // approved file content placed directly in the request
  maxToolResultBytes:100*1000,   // one tool result returned to the model
  maxOutputBytes:5*1024*1024,    // one saved output (matches the artifact store)
  maxFallbacks:1                 // switches to the employee's fallback model after a provider outage
});

function resolveLimits(overrides={}){
  const out={...DEFAULT_LIMITS};
  for(const [key,value] of Object.entries(overrides||{}))if(Object.hasOwn(DEFAULT_LIMITS,key)&&Number.isFinite(value)&&value>=0)out[key]=Math.min(value,DEFAULT_LIMITS[key]);
  return Object.freeze(out);
}
module.exports={DEFAULT_LIMITS,resolveLimits};
