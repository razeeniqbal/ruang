/* Command palette and unified search (Ctrl or Command with K). One list built from every source, so commands,
   employees, projects, tasks, outputs and activity are all reachable without walking the office. */
(() => {
  let open=false,query='',active=0,results=[],returnFocus=null;
  const norm=s=>String(s||'').toLowerCase();
  const go=v=>{view=v;render()};
  const agentName=id=>state.agents.find(a=>a.id===id)?.name||'Unassigned';

  function sources(){
    const items=[
      {group:'Commands',label:'Create a task',hint:'Give work to an employee',run:newTask},
      {group:'Commands',label:'Open Inbox',hint:`${RuangInbox.count()} need you`,run:()=>go('Inbox')},
      {group:'Commands',label:'Review approvals',hint:'Inbox',run:()=>go('Inbox')},
      {group:'Commands',label:'New project',hint:'Start a project',run:()=>document.querySelector('[data-action="new-project"]')?.click()},
      {group:'Commands',label:'Go to the office',run:()=>go('Office')},
      {group:'Commands',label:'Open settings',hint:'AI connections and data',run:()=>go('Settings')},
    ];
    state.agents.forEach((a,i)=>{
      items.push({group:'Employees',label:`Go to ${a.name}`,hint:a.role,run:()=>RuangOffice.openEmployee(i)});
      items.push({group:'Employees',label:`Ask ${a.name}`,hint:'Open chat',run:()=>RuangOffice.openEmployee(i,'chat')});
    });
    for(const p of state.projects)items.push({group:'Projects',label:p.name,hint:p.status,run:()=>{selected=p.id;go('Tasks')}});
    for(const t of state.tasks)items.push({group:'Tasks',label:t.title,hint:`${agentName(t.assignedAgent)}, ${t.status.replace('_',' ').toLowerCase()}`,run:()=>go('Tasks')});
    for(const a of state.artifacts)items.push({group:'Outputs',label:a.title,hint:agentName(a.creator),run:()=>RuangInbox.openArtifact(a.id)});
    for(const e of state.activity.slice(0,60))items.push({group:'Activity',label:e.text,hint:new Date(e.at).toLocaleString([],{day:'numeric',month:'short',hour:'2-digit',minute:'2-digit'}),run:()=>go('Activity'),searchOnly:true});
    return items;
  }
  function filter(){const q=norm(query).split(/\s+/).filter(Boolean);
    results=sources().filter(it=>q.length?q.every(w=>norm(it.label+' '+it.hint+' '+it.group).includes(w)):!it.searchOnly&&it.group!=='Tasks'&&it.group!=='Outputs').slice(0,40);
    active=Math.min(active,Math.max(0,results.length-1))}

  function draw(){const list=document.getElementById('palette-list');if(!list)return;let group='';
    list.innerHTML=results.length?results.map((it,k)=>{const head=it.group!==group?`<li class="palette-group" role="presentation">${esc(group=it.group)}</li>`:'';
      return `${head}<li id="palette-${k}" role="option" aria-selected="${k===active}" class="palette-item${k===active?' active':''}" data-palette="${k}"><span>${esc(it.label)}</span>${it.hint?`<small>${esc(it.hint)}</small>`:''}</li>`}).join(''):'<li class="palette-empty" role="presentation">Nothing matches. Try another word.</li>';
    document.getElementById('palette-input').setAttribute('aria-activedescendant',results.length?`palette-${active}`:'');
    document.getElementById(`palette-${active}`)?.scrollIntoView({block:'nearest'})}

  function show(){if(open)return;open=true;query='';active=0;returnFocus=document.activeElement;filter();
    const el=document.createElement('div');el.id='palette';el.innerHTML=`<div class="palette-backdrop" data-palette-close></div><div class="palette-box" role="dialog" aria-modal="true" aria-label="Command palette"><input id="palette-input" role="combobox" aria-expanded="true" aria-controls="palette-list" aria-autocomplete="list" placeholder="Type a command, or search employees, projects, tasks and outputs" autocomplete="off"><ul id="palette-list" role="listbox"></ul><p class="palette-hint">Arrow keys to move, Enter to choose, Escape to close.</p></div>`;
    document.body.append(el);const input=document.getElementById('palette-input');input.focus();draw();
    input.addEventListener('input',()=>{query=input.value;active=0;filter();draw()})}
  function hide(){if(!open)return;open=false;document.getElementById('palette')?.remove();returnFocus?.focus?.()}
  function choose(k){const it=results[k];if(!it)return;hide();it.run()}

  function newTask(){const kinds=RuangCore.ACTIVITIES;
    show_(`<h2>Create a task</h2><form id="palette-task"><label for="pt-title">Task</label><input id="pt-title" name="title" required maxlength="120" placeholder="For example: Analyse this CSV and write a summary"><label for="pt-agent">Employee</label><select id="pt-agent" name="agent">${state.agents.map(a=>`<option value="${a.id}">${esc(a.name)}, ${esc(a.role)}</option>`).join('')}</select><label for="pt-kind">Kind of work</label><select id="pt-kind" name="kind">${kinds.map(k=>`<option value="${k}">${k[0].toUpperCase()+k.slice(1)}</option>`).join('')}</select><label for="pt-project">Project</label><select id="pt-project" name="project"><option value="">No project</option>${state.projects.map(p=>`<option value="${p.id}">${esc(p.name)}</option>`).join('')}</select><p class="small muted">The task appears in the office straight away. Work is still simulated until execution is connected.</p><div class="dialog-actions"><button type="button" data-close>Cancel</button><button class="primary">Create task</button></div></form>`);
    document.getElementById('palette-task').onsubmit=e=>{e.preventDefault();e.stopPropagation();const f=new FormData(e.target),title=String(f.get('title')).trim();if(!title)return;
      const t=RuangCore.createTask({title,assignedAgent:f.get('agent'),activity:f.get('kind'),projectId:f.get('project')||null,metadata:{demo:true,remainingMs:14000}});state.tasks.push(t);
      RuangCore.recordActivity(state,{type:'task.created',text:`You assigned “${title}” to ${agentName(t.assignedAgent)}.`,agentId:t.assignedAgent,taskId:t.id,projectId:t.projectId});persist();$('#dialog').close();go('Office')}}
  const show_=html=>{$('#dialog').innerHTML=html;$('#dialog').showModal()};

  document.addEventListener('keydown',e=>{
    if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==='k'){e.preventDefault();open?hide():show();return}
    if(!open)return;
    if(e.key==='Escape'){e.preventDefault();e.stopImmediatePropagation();hide()}
    else if(e.key==='ArrowDown'){e.preventDefault();active=Math.min(results.length-1,active+1);draw()}
    else if(e.key==='ArrowUp'){e.preventDefault();active=Math.max(0,active-1);draw()}
    else if(e.key==='Enter'){e.preventDefault();choose(active)}
  },true);
  document.addEventListener('click',e=>{if(!open)return;if(e.target.closest('[data-palette-close]'))hide();const item=e.target.closest('[data-palette]');if(item)choose(Number(item.dataset.palette))});
  window.RuangPalette={show,hide};
})();
