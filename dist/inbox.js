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
    else if(it.kind==='failed'){title=r.title;const tries=r.metadata?.attempts?.length||0,runId=r.metadata?.attempts?.at(-1)?.runId;detail=(r.error||'The task failed.')+(tries>1?` Attempts so far: ${tries}.`:'');actions=`${runId?`<button class="quiet" data-run-view="${esc(runId)}">View run</button>`:''}<button data-inbox-dismiss="${r.id}">Dismiss</button><button class="primary" data-inbox-retry="${r.id}">Try again</button>`}
    else{title=`${agentName(r.assignedAgent)} completed: ${r.title}`;const art=[...state.artifacts].reverse().find(a=>a.taskId===r.id);const pv=art?RuangArtifacts.previewOf(art):'';detail=art?pv.slice(0,180)+(pv.length>180?'…':''):'Completed without a saved output.';
      actions=`${art?`<button class="primary" data-inbox-open="${art.id}">Review output</button>`:''}<button data-inbox-reviewed="${r.id}">Mark reviewed</button>`}
    return `<li class="inbox-item ${tone}"><div class="inbox-meta">${badge(label,tone==='prominent'?'demo':'')}<span class="small muted">${esc(agentName(it.agentId))}${project?`, ${esc(project.name)}`:''}${task&&it.kind==='approval'?`, ${esc(task.title)}`:''}</span><time class="small muted">${time(it.at)}</time></div><h3>${esc(title)}</h3>${detail?`<p class="muted small">${esc(detail)}</p>`:''}<div class="inbox-actions">${actions}</div></li>`}

  function inboxView(){Core.syncProjectApprovals(state);const items=Core.inboxItems(state);
    return `<p class="muted inbox-lead">Everything that needs you, in one place. The office shows the same states as icons above your team.</p>${items.length?`<ul class="inbox-list">${items.map(item).join('')}</ul>`:'<section class="panel empty inbox-empty"><img src="v2/logo-symbol.png" alt="" width="40"><h2>All clear.</h2><p class="muted">Nothing needs you right now. Approvals, questions, blocked work and finished outputs will land here.</p></section>'}`}

  const baseBody=bodyView;bodyView=function(p){return view==='Inbox'?inboxView():baseBody(p)};
  const baseRender=render;render=function(){baseRender();const b=document.querySelector('.nav [data-view="Inbox"]'),n=count();if(b&&n){b.insertAdjacentHTML('beforeend',`<span class="nav-count" aria-label="${n} items">${n}</span>`)}};

  function done(text,ids={}){if(text)Core.recordActivity(state,{type:'inbox.decision',text,...ids});persist();render()}
  document.addEventListener('click',e=>{const b=e.target.closest('[data-inbox-approve],[data-inbox-reject],[data-inbox-resume],[data-inbox-cancel],[data-inbox-retry],[data-inbox-dismiss],[data-inbox-reviewed],[data-inbox-open],[data-inbox-answered]');if(!b)return;const d=b.dataset;
    try{
      if(d.inboxApprove||d.inboxReject){const k=state.approvals.findIndex(a=>a.id===(d.inboxApprove||d.inboxReject)),approve=!!d.inboxApprove;if(k<0)return;
        // A paused harness run: the decision goes to the run, which resumes and updates the task itself.
        if(state.approvals[k].runId){b.disabled=true;RuangTasks.decide(state.approvals[k].id,approve).then(waiting=>{if(!waiting)Core.recordActivity(state,{type:'inbox.decision',text:'That run was no longer waiting, so the approval was closed.'});persist();render()});return}
        state.approvals[k]=Core.decideApproval(state.approvals[k],approve?'approve':'reject');const ap=state.approvals[k],t=ap.taskId&&taskById(ap.taskId);
        if(t?.status==='NEEDS_APPROVAL')setTask(t.id,approve?'RUNNING':'BLOCKED',{error:approve?null:'You rejected the requested action.'});
        done(`You ${approve?'approved':'rejected'}: ${ap.requestedAction}.`,{agentId:ap.requestingAgent,taskId:ap.taskId})}
      if(d.inboxResume){const t=setTask(d.inboxResume,'QUEUED');done(`You resumed “${t.title}”.`,{agentId:t.assignedAgent,taskId:t.id})}
      if(d.inboxCancel){const t=setTask(d.inboxCancel,'CANCELLED');done(`You cancelled “${t.title}”.`,{agentId:t.assignedAgent,taskId:t.id})}
      // Same task, new attempt; the runner refuses anything that is not failed, so repeated clicks do nothing.
      if(d.inboxRetry){b.disabled=true;RuangTasks.retry(d.inboxRetry);render()}
      if(d.inboxDismiss){const t=taskById(d.inboxDismiss);t.metadata={...t.metadata,acknowledged:true};done('',{})}
      if(d.inboxReviewed){const t=taskById(d.inboxReviewed);t.metadata={...t.metadata,reviewed:true};for(const a of state.artifacts)if(a.taskId===t.id&&a.status==='DRAFT')a.status='REVIEWED';if($('#dialog').open)$('#dialog').close();done(`You reviewed “${t.title}”.`,{agentId:t.assignedAgent,taskId:t.id})}
      if(d.inboxAnswered){const q=state.questions.find(q=>q.id===d.inboxAnswered);q.status='ANSWERED';done('',{})}
      if(d.inboxOpen){const a=state.artifacts.find(x=>x.id===d.inboxOpen),t=a.taskId&&taskById(a.taskId),m=a.metadata||{},u=m.usage;
        // Provenance: who, which model, which files and how much work, with the full record behind View run.
        const n=(k,word)=>`${k} ${word}${k===1?'':'s'}`,secs=m.runDurationMs??m.durationMs;
        const facts=[t&&`Task: ${t.title}`,`Created by ${agentName(a.creator)}`,t?.completedAt?`Completed ${time(t.completedAt)}`:`Created ${time(a.createdAt)}`,m.model&&`Model: ${m.model}`,m.runId&&n(m.contextFiles?.length||0,'context file'),m.runId&&n(m.modelCalls||1,'model call'),m.toolCalls&&n(m.toolCalls,'tool use'),m.approvals&&n(m.approvals,'approval'),u&&`${u.totalTokens??(u.inputTokens+u.outputTokens)} tokens`,secs&&`${Math.round(secs/100)/10} seconds`].filter(Boolean);
        const steps=t?state.activity.filter(e=>e.taskId===t.id).slice(0,8).reverse():[];
        // Only the opened output is loaded; the list above uses the short stored preview.
        RuangArtifacts.read(a).then(text=>{const body=document.getElementById('artifact-body');if(body){body.textContent=text;body.removeAttribute('aria-busy')}},error=>{const body=document.getElementById('artifact-body');if(body){body.textContent=`This output could not be opened: ${RuangGateway.clean(error)}`;body.classList.add('error');body.removeAttribute('aria-busy')}});
        show(`<h2>${esc(a.title)}</h2><p class="small muted">${facts.map(esc).join(' · ')}</p><pre class="artifact-body" id="artifact-body" aria-busy="true">Opening…</pre>${steps.length?`<details class="artifact-steps"><summary>What happened</summary><ol class="ow-log">${steps.map(e=>`<li><time>${new Date(e.at).toLocaleTimeString([],{hour:'2-digit',minute:'2-digit'})}</time><span>${esc(e.text)}</span></li>`).join('')}</ol></details>`:''}${m.contextFiles?.length?`<p class="small muted">Files used: ${m.contextFiles.map(esc).join(', ')}</p>`:''}<div class="dialog-actions">${m.runId?`<button class="quiet" data-run-view="${esc(m.runId)}">View run</button>`:''}<button data-close>Close</button>${t&&!t.metadata?.reviewed?`<button class="primary" data-inbox-reviewed="${t.id}">Mark reviewed</button>`:''}</div>`)}
    }catch(error){alert(error.message)}});
  // Run inspector: the observable record of one run, read from the desktop run store. No model reasoning.
  const PROVIDERS={anthropic:'Anthropic',openai:'OpenAI',google:'Google'};
  const modelLabel=m=>m?.provider?`${PROVIDERS[m.provider]||m.provider}${m.model?` ${m.model}`:''}`:'Not chosen';
  const clockTime=at=>new Date(at).toLocaleTimeString([],{hour:'2-digit',minute:'2-digit',second:'2-digit'});
  const kb=b=>b<1024?`${b} bytes`:`${Math.round(b/102.4)/10} KB`;
  function runHTML(r){
    const dur=r.durationMs==null?'Still running':r.durationMs<1000?`${r.durationMs} ms`:`${Math.round(r.durationMs/100)/10} seconds`,u=r.usage||{};
    const rows=[['Status',r.status.replace('_',' ').toLowerCase().replace(/^./,c=>c.toUpperCase())],['Employee',r.employeeName||'Unknown'],['Model',modelLabel(r)+(r.fallback?` (fallback after ${modelLabel(r.fallback.from)} was unavailable)`:'')],
      ['Duration',dur],['Attempt',r.attempt],['Model calls',r.modelCalls],['Usage',`${(u.inputTokens||0)+(u.outputTokens||0)} tokens (${u.inputTokens||0} in, ${u.outputTokens||0} out)`]];
    const list=(items,empty)=>items.length?`<ul class="run-list">${items.join('')}</ul>`:`<p class="small muted">${empty}</p>`;
    const outputs=r.artifactIds.map(id=>state.artifacts.find(a=>a.id===id)).filter(Boolean);
    return `<h2>Run</h2>${r.error?`<p class="notice run-error">${esc(r.error.message)}</p>`:''}<dl class="run-facts">${rows.map(([k,v])=>`<dt>${k}</dt><dd>${esc(String(v))}</dd>`).join('')}</dl>
      <h3>Context</h3>${list(r.contextFiles.map(f=>`<li>${esc(f.path)} <span class="muted">${kb(f.bytes)}${f.included?'':', listed only (too large to include)'}</span></li>`),'No files were used.')}
      <h3>Tools used</h3>${list(r.toolCalls.map(c=>`<li>${esc(c.tool)}${c.target?` <span class="muted">${esc(c.target)}</span>`:''} — ${esc(c.outcome||'not finished')}${c.decision&&c.decision!=='ALLOW'?` (${esc(c.decision.toLowerCase())})`:''}</li>`),'No tools were requested.')}
      ${r.approvals.length?`<h3>Approvals</h3>${list(r.approvals.map(a=>`<li>${esc(a.tool)}${a.target?` ${esc(a.target)}`:''} — ${esc(a.status.toLowerCase())}</li>`),'')}`:''}
      <h3>Outputs</h3>${list(outputs.map(a=>`<li><button class="quiet small" data-inbox-open="${a.id}">${esc(a.title)}</button></li>`),r.artifactIds.length?'Saved, but not in this workspace.':'No output was saved.')}
      <h3>Timeline</h3><ol class="ow-log run-timeline">${r.trace.map(e=>`<li><time>${clockTime(e.at)}</time><span>${esc(e.text)}</span></li>`).join('')}</ol>
      <p class="small muted">This is the record of what Ruang did during the run. It does not contain the model's private reasoning.</p><div class="dialog-actions"><button data-close>Close</button></div>`;
  }
  function viewRun(runId){show('<h2>Run</h2><p class="muted">Opening…</p>');
    RuangHarness.run(runId).then(r=>show(runHTML(r)),error=>show(`<h2>Run</h2><p class="notice">This run could not be opened: ${esc(RuangHarness.clean(error))}</p><div class="dialog-actions"><button data-close>Close</button></div>`))}
  document.addEventListener('click',e=>{const b=e.target.closest('[data-run-view]');if(b)viewRun(b.dataset.runView)});
  function openArtifact(id){const b=document.createElement('button');b.dataset.inboxOpen=id;b.hidden=true;document.body.append(b);b.click();b.remove()}
  window.RuangInbox={count,openArtifact,viewRun};
})();
