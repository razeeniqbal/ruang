/* Employee chat: conversation history, streamed replies and the clearly labelled demo fallback.
   Extracted from room-v4.js; the office window code only renders what this module holds.
   Replies stream through RuangGateway (the same gateway tasks use). Text pieces are batched before the
   window repaints, and the conversation is saved once per message, never per piece. */
(function(root){
  const pending=new Map();// agent id -> {text}, while a reply is being written
  let status={};
  const PAINT_MS=60;

  async function refreshStatus(){status=await RuangGateway.status();return status}
  const canGenerate=agent=>!!(agent.model?.provider&&status[agent.model.provider]?.ready);
  function systemPrompt(agent){return [RuangTaskRunner.identityPrompt(agent),'Reply as a helpful teammate: clear, concise and practical. In this chat you cannot run tools, read files or take actions yet. For work you want done and saved, the person can assign you a task.'].join('\n\n')}
  const history=agent=>state.officeChat[agent.id] ||= [];

  // Returns false if a reply is already being written (prevents duplicate sends).
  async function send(agent,text,{onUpdate=()=>{},onDone=()=>{}}={}){
    if(pending.has(agent.id))return false;
    const log=history(agent);log.push({who:'You',text,at:Date.now()});
    pending.set(agent.id,{text:''});persist();onUpdate();
    let reply;await refreshStatus();
    if(canGenerate(agent)){
      const messages=log.filter(m=>!m.error&&!m.demo).slice(-20).map(m=>({role:m.who==='You'?'user':'assistant',content:m.text}));
      while(messages.length&&messages[0].role!=='user')messages.shift();
      let buffer='',timer=null;
      const paint=()=>{timer=null;const p=pending.get(agent.id);if(p&&buffer){p.text+=buffer;buffer='';onUpdate()}};
      try{
        const r=await RuangGateway.stream({provider:agent.model.provider,model:agent.model.model||null,system:systemPrompt(agent),messages,policy:'chat'},
          {onDelta:piece=>{buffer+=piece;if(!timer)timer=setTimeout(paint,PAINT_MS)}});
        clearTimeout(timer);
        reply={who:agent.name,text:r.text,at:Date.now(),model:r.model};
        (state.usage ||= []).push({kind:'chat',agentId:agent.id,provider:r.provider,model:r.model,inputTokens:r.usage.inputTokens,outputTokens:r.usage.outputTokens,totalTokens:r.usage.inputTokens+r.usage.outputTokens,durationMs:r.durationMs,at:Date.now()});
        state.usage=state.usage.slice(-1000);
      }catch(error){clearTimeout(timer);
        reply={who:agent.name,text:RuangGateway.clean(error),at:Date.now(),error:true};
        RuangCore.recordActivity(state,{type:'chat.error',text:`${agent.name} could not reply: ${RuangGateway.clean(error)}`,agentId:agent.id})}
    }else{
      await new Promise(r=>setTimeout(r,900));
      reply={who:agent.name,text:`Demo reply: I am the ${agent.role.toLowerCase()} on the team, but no model is connected for me yet, so this message is not from a model. Choose a provider under Employee details and save a key in Settings for real replies.`,at:Date.now(),demo:true};
    }
    log.push(reply);state.officeChat[agent.id]=log.slice(-40);pending.delete(agent.id);persist();onDone();return true;
  }
  root.RuangChat={send,refreshStatus,canGenerate,systemPrompt,history,isBusy:agent=>pending.has(agent.id),pendingFor:agent=>pending.get(agent.id)||null};
})(window);
