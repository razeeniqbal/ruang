/* Inbox: everything that needs a person, from the same records the office and employee windows read.
   Approvals, questions, blocked work, failures and finished work to review. */
(() => {
  const Core=RuangCore;
  const KIND={approval:['Needs approval','prominent'],question:['Question','prominent'],blocked:['Blocked','prominent'],failed:['Failed','prominent'],review:['Ready for review','']};
  const agentName=id=>state.agents.find(a=>a.id===id)?.name||'Someone';
  const time=at=>new Date(at).toLocaleString([],{day:'numeric',month:'short',hour:'2-digit',minute:'2-digit'});
  const taskById=id=>state.tasks.find(t=>t.id===id);
  function setTask(id,to,extra){const k=state.tasks.findIndex(t=>t.id===id);if(k<0)return null;state.tasks[k]=Core.transitionTask(state.tasks[k],to,extra);return state.tasks[k]}
  function count(){return Core.inboxItems(state).length}

  function item(it){const [label,tone]=KIND[it.kind],r=it.record,task=it.taskId?taskById(it.taskId):null,project=it.projectId?state.projects.find(p=>p.id===it.projectId):null;
    let title='',detail='',actions='';
    if(it.kind==='approval'){title=r.requestedAction;detail=[r.reason,r.risk].filter(Boolean).join(' ');
      actions=r.projectId?`<button class="primary" data-approve="${r.projectId}">Review approval</button>`:`<button data-inbox-reject="${r.id}">Reject</button><button class="primary" data-inbox-approve="${r.id}">Approve</button>`}
    else if(it.kind==='question'){title=r.text;actions=`<button data-inbox-answered="${r.id}">Mark answered</button>`}
    else if(it.kind==='blocked'){title=r.title;detail=r.error||'This task cannot continue without you.';actions=`<button data-inbox-cancel="${r.id}">Cancel task</button><button class="primary" data-inbox-resume="${r.id}">Resume</button>`}
    else if(it.kind==='failed'){title=r.title;detail=r.error||'The task failed.';actions=`<button data-inbox-dismiss="${r.id}">Dismiss</button><button class="primary" data-inbox-retry="${r.id}">Try again</button>`}
    else{title=r.title;const art=state.artifacts.find(a=>a.taskId===r.id);detail=art?`Output: ${art.title}`:'Completed without a saved output.';
      actions=`${art?`<button data-inbox-open="${art.id}">Open output</button>`:''}<button class="primary" data-inbox-reviewed="${r.id}">Mark reviewed</button>`}
    return `<li class="inbox-item ${tone}"><div class="inbox-meta">${badge(label,tone==='prominent'?'demo':'')}<span class="small muted">${esc(agentName(it.agentId))}${project?`, ${esc(project.name)}`:''}${task&&it.kind==='approval'?`, ${esc(task.title)}`:''}</span><time class="small muted">${time(it.at)}</time></div><h3>${esc(title)}</h3>${detail?`<p class="muted small">${esc(detail)}</p>`:''}<div class="inbox-actions">${actions}</div></li>`}

  function inboxView(){Core.syncProjectApprovals(state);const items=Core.inboxItems(state);
    return `<p class="muted inbox-lead">Everything that needs you, in one place. The office shows the same states as icons above your team.</p>${items.length?`<ul class="inbox-list">${items.map(item).join('')}</ul>`:'<section class="panel empty inbox-empty"><img src="v2/logo-symbol.png" alt="" width="40"><h2>All clear.</h2><p class="muted">Nothing needs you right now. Approvals, questions, blocked work and finished outputs will land here.</p></section>'}`}

  const baseBody=bodyView;bodyView=function(p){return view==='Inbox'?inboxView():baseBody(p)};
  const baseRender=render;render=function(){baseRender();const b=document.querySelector('.nav [data-view="Inbox"]'),n=count();if(b&&n){b.insertAdjacentHTML('beforeend',`<span class="nav-count" aria-label="${n} items">${n}</span>`)}};

  function done(text,ids={}){if(text)Core.recordActivity(state,{type:'inbox.decision',text,...ids});persist();render()}
  document.addEventListener('click',e=>{const b=e.target.closest('[data-inbox-approve],[data-inbox-reject],[data-inbox-resume],[data-inbox-cancel],[data-inbox-retry],[data-inbox-dismiss],[data-inbox-reviewed],[data-inbox-open],[data-inbox-answered]');if(!b)return;const d=b.dataset;
    try{
      if(d.inboxApprove||d.inboxReject){const k=state.approvals.findIndex(a=>a.id===(d.inboxApprove||d.inboxReject)),approve=!!d.inboxApprove;if(k<0)return;
        state.approvals[k]=Core.decideApproval(state.approvals[k],approve?'approve':'reject');const ap=state.approvals[k],t=ap.taskId&&taskById(ap.taskId);
        if(t?.status==='NEEDS_APPROVAL')setTask(t.id,approve?'RUNNING':'BLOCKED',{error:approve?null:'You rejected the requested action.'});
        done(`You ${approve?'approved':'rejected'}: ${ap.requestedAction}.`,{agentId:ap.requestingAgent,taskId:ap.taskId})}
      if(d.inboxResume){const t=setTask(d.inboxResume,'QUEUED');done(`You resumed “${t.title}”.`,{agentId:t.assignedAgent,taskId:t.id})}
      if(d.inboxCancel){const t=setTask(d.inboxCancel,'CANCELLED');done(`You cancelled “${t.title}”.`,{agentId:t.assignedAgent,taskId:t.id})}
      if(d.inboxRetry){const t=setTask(d.inboxRetry,'QUEUED');done(`You asked for another try at “${t.title}”.`,{agentId:t.assignedAgent,taskId:t.id})}
      if(d.inboxDismiss){const t=taskById(d.inboxDismiss);t.metadata={...t.metadata,acknowledged:true};done('',{})}
      if(d.inboxReviewed){const t=taskById(d.inboxReviewed);t.metadata={...t.metadata,reviewed:true};for(const a of state.artifacts)if(a.taskId===t.id&&a.status==='DRAFT')a.status='REVIEWED';if($('#dialog').open)$('#dialog').close();done(`You reviewed “${t.title}”.`,{agentId:t.assignedAgent,taskId:t.id})}
      if(d.inboxAnswered){const q=state.questions.find(q=>q.id===d.inboxAnswered);q.status='ANSWERED';done('',{})}
      if(d.inboxOpen){const a=state.artifacts.find(x=>x.id===d.inboxOpen);show(`<h2>${esc(a.title)}</h2><p class="small muted">From ${esc(agentName(a.creator))}, ${time(a.createdAt)}, version ${a.version}</p><pre>${esc(a.content)}</pre><div class="dialog-actions"><button data-close>Close</button>${a.taskId&&!taskById(a.taskId)?.metadata?.reviewed?`<button class="primary" data-inbox-reviewed="${a.taskId}">Mark reviewed</button>`:''}</div>`)}
    }catch(error){alert(error.message)}});
  window.RuangInbox={count};
})();
