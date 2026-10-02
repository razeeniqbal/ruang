/* The renderer's single way to reach a model. Chat and task execution both call this; it forwards to the
   desktop model gateway (keys stay in the main process). The web version will point the same calls at the
   Ruang server once that exists. Errors carry a `code` (CANCELLED, TIMEOUT, AUTH, RATE_LIMIT, ...). */
(function(root){
  const bridge=()=>root.desktop?.model;
  const WEB='Real work runs in the Ruang desktop app for now. The web version needs the Ruang server, which is not set up yet.';
  const clean=e=>String(e?.message||e||'The request failed.').replace(/^Error invoking remote method '[^']+': Error: /,'');
  const coded=(code,message)=>Object.assign(Error(message),{code});
  let seq=0;const streamId=()=>`s${Date.now().toString(36)}-${++seq}-${Math.random().toString(36).slice(2,8)}`;
  async function status(){try{return bridge()?await bridge().status():{}}catch{return {}}}

  // Complete answer in one piece.
  async function generate(request,{onEvent}={}){
    if(!bridge())throw coded('NOT_CONNECTED',WEB);
    try{const result=await bridge().generate(request);onEvent?.({type:'complete'});return result}
    catch(error){throw coded(error.code||'PROVIDER',clean(error))}
  }
  // Streamed answer: onDelta gets text pieces, onEvent every gateway event. Pass an AbortSignal to cancel.
  async function stream(request,{onEvent,onDelta,signal}={}){
    const b=bridge();if(!b)throw coded('NOT_CONNECTED',WEB);
    if(!b.stream){const result=await generate(request,{onEvent});onDelta?.(result.text);return result}
    if(signal?.aborted)throw coded('CANCELLED','You stopped this request.');
    const id=streamId();let cancelled=false;
    const cancel=()=>{cancelled=true;b.cancel(id).catch(()=>{})};
    signal?.addEventListener('abort',cancel,{once:true});
    try{
      const out=await b.stream(id,request,event=>{onEvent?.(event);if(event.type==='delta')onDelta?.(event.text)});
      if(cancelled)throw coded('CANCELLED','You stopped this request.');
      if(!out.ok)throw coded(out.error.code,out.error.message);
      return out.result;
    }finally{signal?.removeEventListener('abort',cancel)}
  }
  root.RuangGateway={status,generate,stream,clean,available:()=>!!bridge()};
})(window);
