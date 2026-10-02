/* The renderer's single way to reach a model. Chat and task execution both call this; it forwards to the
   desktop model gateway (keys stay in the main process). The web version will point the same calls at the
   Ruang server once that exists. `onEvent` is where streamed progress will arrive later. */
(function(root){
  const bridge=()=>root.desktop?.model;
  const clean=e=>String(e?.message||e||'The request failed.').replace(/^Error invoking remote method '[^']+': Error: /,'');
  async function status(){try{return bridge()?await bridge().status():{}}catch{return {}}}
  async function generate(request,{onEvent}={}){
    if(!bridge())throw Error('Real work runs in the Ruang desktop app for now. The web version needs the Ruang server, which is not set up yet.');
    onEvent?.({type:'request.sent'});
    try{const result=await bridge().generate(request);onEvent?.({type:'response.completed'});return result}
    catch(error){onEvent?.({type:'response.failed'});throw Error(clean(error))}
  }
  root.RuangGateway={status,generate,clean,available:()=>!!bridge()};
})(window);
