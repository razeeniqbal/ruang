(() => {
  const layout=OfficeLayout,engine=new OfficeEngine(layout),T=layout.tile,W=layout.width*T,H=layout.height*T;
  state.officeChat ||= {};const taskKinds=['planning','research','analysis','coding','review'];const Core=RuangCore;
  // Task activity decides where the employee goes; the office never invents work that has no task behind it.
  const kindFor=activity=>({writing:'coding',tool:'coding'})[activity]||activity;
  const locations={planning:['manager','whiteboard','projectboard','meeting'],research:['research','bookshelf','booth-1'],analysis:['analysis','projectboard','discussion'],coding:['developer','pair','ai','booth-2','hotdesk'],review:['qa','meeting','discussion'],collaboration:['meeting','discussion','pair']};
  const labels={work:'Working',discuss:'Discussing',plan:'Planning',present:'Presenting',read:'Reading',research:'Researching',review:'Reviewing',analyse:'Analysing',print:'Printing',get_coffee:'Getting coffee',get_water:'Getting water',inspect:'Inspecting',organise:'Organising',sit:'Taking a break',take_break:'Taking a break',look_outside:'Looking outside',pet_cat:'Petting the cat',water_plant:'Tending a plant'};
  let chosen=0,hovered=null,canvas,ctx,background,raf=0,last=performance.now(),lastPanel=0,panelHTML='',paused=matchMedia('(prefers-reduced-motion: reduce)').matches,roam=true,zoom=0,message='Click a teammate to open their window.',saveTimer;
  const actors=state.agents.map((_,i)=>{const saved=state.officePositionsV4?.[i],fallback=layout.spawns[i%layout.spawns.length],p=saved&&engine.walkable(saved.x,saved.y)?saved:fallback;return {x:(p.x+.5)*T,y:(p.y+.75)*T,slot:null,path:[],direction:'down',clock:0,location:'Office floor',objectId:null,mode:'Idle',taskId:null,reason:null,holdUntil:0,nextAmbient:performance.now()+3500+i*1700}});
  function tile(a){return {x:Math.floor(a.x/T),y:Math.floor(a.y/T)}}
  function savePositions(){clearTimeout(saveTimer);saveTimer=setTimeout(()=>{state.officePositionsV4=actors.map(tile);persist()},400)}
  function say(text){message=text;const el=$('#office-message');if(el)el.textContent=text}
  function taskFor(i){const p=state.projects.find(p=>p.status==='Running'&&p.tasks[p.step]?.agent===i);if(p)return {id:p.id+':'+p.step,title:p.tasks[p.step].title,kind:taskKinds[i%5],project:p};const id=state.agents[i].id,t=Core.currentTask(state,id)||Core.nextQueuedTask(state,id);return t?{id:t.id,title:t.title,kind:kindFor(t.activity),record:t}:null}
  // The office never changes task state: the task runner (task-runner.js) does. Here the character only
  // shows what the record says: what they are doing at the desk follows the task's current state.
  const TASK_ACTION={QUEUED:'Getting ready',ASSIGNED:'Getting ready',PLANNING:'Thinking',RUNNING:'Typing',WAITING:'Waiting',NEEDS_APPROVAL:'Waiting for you',BLOCKED:'Stuck, waiting for you'};
  function taskAction(rec){const p=rec.metadata?.phase;if(p)return RuangTaskRunner.PHASE_LABELS[p]||'Working';return TASK_ACTION[rec.status]||'Working'}
  function finished(i,id,now){const a=actors[i],agent=state.agents[i],rec=state.tasks.find(t=>t.id===id);a.doneUntil=now+3000;
    if(rec?.status==='COMPLETED')say(`${agent.name} finished “${rec.title}”. The output is waiting in your Inbox.`);
    else if(rec?.status==='FAILED')say(`${agent.name} could not finish “${rec.title}”. It is in your Inbox with a Try again button.`)}
  function clearInteraction(i){engine.release(i);const a=actors[i];a.objectId=null;a.slot=null;a.reason=null;a.holdUntil=0}
  function goLocation(i,ids,reason='manual',now=performance.now()){
    const a=actors[i];if(reason!=='task'&&taskFor(i)){say(`${state.agents[i].name} has an assigned task. Task activity takes priority.`);return false}
    const found=engine.choose(i,ids,tile(a));if(!found){if(reason==='task'){a.mode='Waiting for a free station';a.path=[]}else say('Those locations are occupied or unreachable. Try another location.');return false}
    a.path=found.route;a.objectId=found.object.id;a.slot=found.slot;a.reason=reason;a.mode=a.path.length?'Walking':labels[found.object.actions?.[0]]||'Using location';a.location=a.path.length?'On the way to '+found.object.name:found.object.name;a.holdUntil=now+9000+Math.random()*4000;
    if(!a.path.length)arrive(i,now);if(reason==='manual')say(`${state.agents[i].name} → ${found.object.name}${found.object.id!==ids[0]?' (alternative free location)':''}.`);updatePanel();return true;
  }
  function move(i,p){if(taskFor(i)){say('An assigned task takes priority. Choose an idle teammate to move manually.');return}const a=actors[i],route=engine.route(tile(a),p);if(route===null){say('Choose an open floor tile. Furniture and walls block walking.');return}clearInteraction(i);a.path=route;a.mode=route.length?'Walking':'Idle';a.location='Office floor';a.nextAmbient=performance.now()+14000;say(`${state.agents[i].name} is ${route.length?'walking there':'already there'}.`)}
  function arrive(i,now){const a=actors[i];if(a.slot?.face)a.direction=a.slot.face;if(a.objectId){const o=engine.objects.get(a.objectId);a.location=o.name;a.mode=labels[o.actions?.[0]]||'Using location';a.holdUntil=now+8000;if(a.reason==='task'){const t=taskFor(i)?.record;a.mode=t?taskAction(t):'Working'}}else a.mode='Idle';a.nextAmbient=now+6000+Math.random()*7000;savePositions();if(i===chosen)say(`${state.agents[i].name} arrived at ${a.location.toLowerCase()}.`)}
  function update(dt,now){if(Core.syncProjectApprovals(state))persist();actors.forEach((a,i)=>{
    const task=taskFor(i);
    if((task?.id||null)!==a.taskId){if(a.taskId&&!task)finished(i,a.taskId,now);clearInteraction(i);a.taskId=task?.id||null;a.path=[];a.mode='Idle';if(task)goLocation(i,locations[task.kind]||locations[taskKinds[i%5]],'task',now);else a.nextAmbient=now+4000}
    // The model call starts as soon as the task does; walking to the desk overlaps it rather than delaying it.
    if(task?.record&&!a.path.length&&a.objectId&&a.reason==='task')a.mode=taskAction(task.record);
    if(task&&!a.objectId&&now>a.nextAmbient){goLocation(i,locations[task.kind]||locations.planning,'task',now);a.nextAmbient=now+1500}
    if(!paused){a.clock+=dt;if(a.path.length){const p=a.path[0],x=(p.x+.5)*T,y=(p.y+.75)*T,dx=x-a.x,dy=y-a.y,d=Math.hypot(dx,dy),step=dt*.055*T/16;a.direction=Math.abs(dx)>Math.abs(dy)?dx>0?'right':'left':dy>0?'down':'up';if(d<=step){a.x=x;a.y=y;a.path.shift();if(!a.path.length)arrive(i,now)}else{a.x+=dx/d*step;a.y+=dy/d*step}}
      else if(!task&&a.objectId&&now>a.holdUntil){clearInteraction(i);a.mode='Idle';a.nextAmbient=now+2500}
      else if(!task&&roam&&!a.path.length&&!a.objectId&&now>a.nextAmbient){const candidates=engine.interactions.filter(o=>['break','fun','research'].includes(o.kind)).map(o=>o.id);const start=Math.floor(Math.random()*candidates.length);goLocation(i,[...candidates.slice(start),...candidates.slice(0,start)],'ambient',now);a.nextAmbient=now+9000}
    }
  })}
  // The office is the V2 backdrop image; furniture is painted into it, so only people and status are drawn live.
  function makeBackground(){const img=new Image();img.src=layout.background;background=img}
  const CH=74,iconSize=22;// on-screen employee height and status glyph size, in backdrop pixels
  function seatOffset(a){return !a.path.length&&a.slot?{x:(a.slot.dx||0)*T,y:(a.slot.dy||0)*T}:{x:0,y:0}}
  // Seated at a desk: only the upper body shows, lowered onto the seat, and the pictured chair back is redrawn in front.
  const SIT_DROP=2,SEAT_GAP=6;
  function figure(a){const off=seatOffset(a),x=a.x+off.x,foot=a.y+off.y,seated=!a.path.length&&!!a.slot?.sit;return {x,foot,seated,top:seated?foot+SIT_DROP-CH:foot-CH}}
  function drawHover(){const o=hovered?.object&&engine.objects.get(hovered.object);if(!o)return;ctx.strokeStyle='rgba(229,199,123,.9)';ctx.lineWidth=2;ctx.setLineDash([6,4]);ctx.strokeRect(o.x*T+1,o.y*T+1,o.width*T-2,o.height*T-2);ctx.setLineDash([])}
  function actionFor(a){return a.path.length&&!paused?'walk':'idle'}
  function drawAgent(a,i){const f=figure(a),cx=Math.round(f.x),y=Math.round(f.foot),frame=Math.floor(a.clock/150)%4;if(i===chosen){ctx.fillStyle='rgba(229,199,123,.55)';ctx.beginPath();ctx.ellipse(cx,y-2,19,6,0,0,Math.PI*2);ctx.fill()}
    if(!f.seated){AgentSkins.draw(ctx,i,actionFor(a),a.direction,frame,cx-8*CH/24,y,CH/24);return}
    ctx.save();ctx.beginPath();ctx.rect(cx-40,y-CH-40,80,CH+40-SEAT_GAP);ctx.clip();AgentSkins.draw(ctx,i,'idle',a.direction,frame,cx-8*CH/24,y+SIT_DROP,CH/24);ctx.restore();
    if(background?.complete)ctx.drawImage(background,cx-18,y-28,36,28-SEAT_GAP,cx-18,y-28,36,28-SEAT_GAP)}
  // Status icons are secondary: only meaningful states get one, at most MAX_ICONS on screen, highest priority first.
  // Walking, idle and ambient breaks (coffee, sofa, window) never show an icon.
  // The icon comes from the employee's derived status (approvals and task records), not from the animation.
  // Prominent states always show; subtle ones only once the employee is at the work, never while walking.
  const MAX_ICONS=5,iconPriority={approval:0,blocked:0,error:0,thinking:1,waiting:1,done:2,team:3,research:3,working:4};
  const STATUS_ICON={NEEDS_APPROVAL:'approval',BLOCKED:'blocked',ERROR:'error',WAITING:'waiting',COMPLETE:'done',THINKING:'thinking',RESEARCHING:'research',COLLABORATING:'team',TOOL_RUNNING:'working',WORKING:'working'};
  const chatting=i=>RuangChat.isBusy(state.agents[i]);
  function statusOf(i){if(chatting(i))return 'THINKING';let s=Core.agentStatus(state,state.agents[i].id);const t=taskFor(i);if(s==='IDLE'&&t?.project)s=t.kind==='research'?'RESEARCHING':'WORKING';if(actors[i].mode==='Waiting for a free station')s='WAITING';return s}
  function iconFor(a,i,now){const s=a.doneUntil>now?'COMPLETE':statusOf(i);if(Core.STATUS_PROMINENCE[s]==='subtle'&&!chatting(i)&&(a.path.length||!a.objectId))return null;return STATUS_ICON[s]||null}
  function drawIcons(now){actors.map((a,i)=>({a,icon:iconFor(a,i,now)})).filter(s=>s.icon).sort((s,t)=>iconPriority[s.icon]-iconPriority[t.icon]).slice(0,MAX_ICONS).forEach(({a,icon})=>{const f=figure(a),bob=icon==='approval'&&!paused&&Math.floor(now/400)%2?2:0;V2Sprites.icon(ctx,icon,f.x,f.top-18-bob,iconSize)})}
  function draw(now){if(!canvas?.isConnected){raf=0;return}const dt=Math.min(now-last,50);last=now;update(dt,now);ctx.clearRect(0,0,W,H);if(background?.complete)ctx.drawImage(background,0,0,W,H);else{ctx.fillStyle='#101a24';ctx.fillRect(0,0,W,H)}drawHover();actors.map((a,i)=>({a,i})).sort((p,q)=>p.a.y-q.a.y).forEach(({a,i})=>drawAgent(a,i));drawIcons(now);drawLinks();positionWins();const dest=actors[chosen].path.at(-1);if(dest){ctx.strokeStyle='#e5c77b';ctx.lineWidth=2;const x=(dest.x+.5)*T,y=(dest.y+.75)*T;ctx.beginPath();ctx.ellipse(x,y-2,10,4,0,0,Math.PI*2);ctx.stroke()}if(now-lastPanel>500){updatePanel();lastPanel=now}raf=requestAnimationFrame(draw)}
  function point(e){const r=canvas.getBoundingClientRect();return {x:(e.clientX-r.left)*W/r.width,y:(e.clientY-r.top)*H/r.height}}
  function pick(p){const agent=actors.map((a,i)=>({a,i})).reverse().find(({a})=>{const f=figure(a);return Math.abs(f.x-p.x)<20&&p.y>=f.top-30&&p.y<=f.foot+4});/* hit area includes the status icon, so clicking an approval icon opens that teammate */if(agent)return {agent:agent.i};const object=[...engine.interactions].reverse().find(o=>p.x>=o.x*T&&p.x<(o.x+o.width)*T&&p.y>=o.y*T&&p.y<(o.y+o.height)*T);return object?{object:object.id}:null}
  // ---- Full-screen office with floating windows ----------------------------------------------
  // The office fills the screen. Everything else floats above it: teammate windows (anchored above the
  // teammate until dragged away, then linked by a dashed line) and the project board and activity panels.
  // Minimised teammate windows live in the dock. Window keys are a teammate index or a panel name.
  const wins=new Map();let zTop=10,moveArmed=null;const narrow=matchMedia('(max-width:700px)');
  const PANELS={project:'Project board',activity:'Recent activity'};
  const isAgent=k=>typeof k==='number',keyOf=s=>/^\d+$/.test(String(s))?Number(s):s;
  const agentKey=i=>state.agents[i].id||`employee-${i}`;
  const approvalFor=i=>state.approvals.find(a=>a.status==='PENDING'&&a.requestingAgent===state.agents[i].id)||null;
  const TOP_GAP=60,BOTTOM_GAP=84;// keep windows clear of the top bar and the dock
  function saveWins(){state.officeWindows=[...wins].map(([key,w])=>({key,mode:w.mode,detached:w.detached,x:w.x,y:w.y,min:w.min}));persist()}
  function box(){const l=$('#office-windows').getBoundingClientRect(),c=canvas.getBoundingClientRect();return {x:c.left-l.left,y:c.top-l.top,s:c.width/W,w:l.width,h:l.height}}
  function portrait(c,i,h){const g=c.getContext('2d');g.clearRect(0,0,c.width,c.height);AgentSkins.draw(g,i,'idle','down',0,c.width/2-8*h/24,h,h/24)}
  function selected(i){chosen=i;hovered=null;openWin(i)}
  function openWin(k,mode){let w=wins.get(k);if(!w){w={mode:mode||'card',detached:!isAgent(k),x:null,y:null,min:false};wins.set(k,w)}if(mode)w.mode=mode;w.min=false;w.unread=false;if(isAgent(k))chosen=k;buildWin(k);focusWin(k);refreshChrome();saveWins()}
  function closeWin(k){wins.get(k)?.el?.remove();wins.delete(k);if(moveArmed===k)disarm();refreshChrome();saveWins()}
  function minimiseWin(k){const w=wins.get(k);if(!w)return;w.min=true;w.el?.remove();w.el=null;refreshChrome();saveWins()}
  function togglePanel(k){const w=wins.get(k);w&&!w.min&&w.el?minimiseWin(k):openWin(k)}
  function focusWin(k){const w=wins.get(k);if(!w?.el)return;w.z=++zTop;w.el.style.zIndex=w.z;document.querySelectorAll('.ow.top').forEach(e=>e.classList.remove('top'));w.el.classList.add('top')}
  function topWin(){return [...wins].filter(([,w])=>w.el).sort((a,b)=>(b[1].z||0)-(a[1].z||0))[0]?.[0]}
  // Status (from records) and action (what the character is physically doing) are shown separately on purpose.
  const PROVIDER_NAMES={openai:'OpenAI',anthropic:'Anthropic',google:'Google',local:'Local model'},AUTONOMY_LABELS={SUPERVISED:'Supervised',BALANCED:'Balanced',AUTONOMOUS:'Autonomous'};
  function approvalHTML(ap){return `<div class="ow-approval"><b>Approval needed</b><span>${esc(ap.requestedAction)}</span>${ap.reason?`<small>${esc(ap.reason)}</small>`:''}${ap.projectId?`<button class="primary" data-approve="${ap.projectId}">Review approval</button>`:`<div class="ow-approval-actions"><button data-inbox-reject="${ap.id}">Reject</button><button class="primary" data-inbox-approve="${ap.id}">Approve</button></div>`}</div>`}
  function infoHTML(i){const a=actors[i],agent=state.agents[i],task=taskFor(i),s=statusOf(i),ap=state.approvals.find(x=>x.status==='PENDING'&&x.requestingAgent===agent.id),m=agent.model||{};
    return `${ap?approvalHTML(ap):''}<dl><dt>Status</dt><dd>${Core.STATUS_LABELS[s]}</dd><dt>Doing</dt><dd>${esc(a.mode)}</dd><dt>Task</dt><dd>${task?esc(task.title):'No assigned task'}</dd>${progressHTML(task)}<dt>Where</dt><dd>${esc(a.location)}</dd><dt>Model</dt><dd>${m.provider?esc(PROVIDER_NAMES[m.provider]||m.provider)+(m.model?', '+esc(m.model):''):'Not chosen yet'}</dd><dt>Autonomy</dt><dd>${AUTONOMY_LABELS[agent.autonomy]||'Balanced'}</dd></dl>${task?.record&&['QUEUED','ASSIGNED','PLANNING','RUNNING'].includes(task.record.status)?`<button class="ow-cancel" data-task-cancel="${task.id}">Cancel task</button>`:''}`}
  // Readable progress for a running task (phase and how much has been written), never raw tokens.
  function progressHTML(task){const p=task?.record&&RuangTasks.progress(task.id);if(!p)return '';return `<dt>Progress</dt><dd>${esc(p.label)}${p.chars?`, ${p.chars.toLocaleString()} characters so far`:''}</dd>`}
  function activityHTML(i){const id=state.agents[i].id,items=state.activity.filter(e=>e.agentId===id).slice(0,12);
    return items.length?`<ol class="ow-log">${items.map(e=>`<li><time>${new Date(e.at).toLocaleTimeString([],{hour:'2-digit',minute:'2-digit'})}</time><span>${esc(e.text)}</span></li>`).join('')}</ol>`:`<p class="ow-empty">Nothing yet. Assign ${esc(state.agents[i].name)} a task and each step will be listed here.</p>`}
  function panelBody(k){if(k==='activity')return `${eventsHTML(6)}<button class="quiet small ow-link" data-view="Activity">View all activity</button>`;const p=project();return p?`<div class="ow-panel-status">${badge(p.status)}</div>${projectSummary(p)}<p class="ow-note">This sample project is a simulated walkthrough. Tasks you assign and chat with a connected model are real.</p>`:'<p class="muted small">Start a project to watch the team at work.</p><button class="primary" data-action="demo">Try a demo project</button>'}
  // Chat lives in office-chat.js; this only draws it. A reply being written shows its text so far.
  function chatHTML(i){const agent=state.agents[i],log=RuangChat.history(agent),p=RuangChat.pendingFor(agent);
    return (log.slice(-30).map(m=>`<p class="${m.who==='You'?'me':'them'}${m.error?' error':''}${m.demo?' demo':''}">${esc(m.text)}</p>`).join('')||`<p class="ow-empty">Say hello to ${esc(agent.name)}.</p>`)
      +(p?(p.text?`<p class="them streaming">${esc(p.text)}</p>`:'<p class="them typing" aria-label="Thinking"><span></span><span></span><span></span></p>'):'')}
  function buildWin(k){const w=wins.get(k),layer=$('#office-windows');if(!layer)return;w.el?.remove();const el=document.createElement('section');el.className='ow';el.dataset.win=k;el.setAttribute('role','dialog');
    const controls='<button class="ow-icon" data-win-action="min" aria-label="Minimise">–</button><button class="ow-icon" data-win-action="close" aria-label="Close">✕</button>';
    if(!isAgent(k)){el.classList.add('ow-panel');el.setAttribute('aria-label',PANELS[k]);el.innerHTML=`<header class="ow-head"><img class="ow-glyph" src="v2/logo-symbol.png" alt=""><div class="ow-title"><b>${PANELS[k]}</b></div>${controls}</header><div class="ow-body"></div>`}
    else{const agent=state.agents[k];el.setAttribute('aria-label',`${agent.name} window`);
      el.innerHTML=`<span class="ow-tail" aria-hidden="true"></span><header class="ow-head" title="Drag to move"><canvas width="32" height="48" aria-hidden="true"></canvas><div class="ow-title"><b>${esc(agent.name)}</b><small>${esc(agent.role)}</small><span class="ow-status"></span></div>${controls}</header>
      <nav class="ow-tabs"><button data-win-action="card" aria-pressed="${w.mode==='card'}">Overview</button><button data-win-action="activity" aria-pressed="${w.mode==='activity'}">Activity</button><button data-win-action="chat" aria-pressed="${w.mode==='chat'}">Chat</button></nav>
      ${w.mode==='activity'?'<div class="ow-activity" aria-live="polite"></div>':w.mode==='card'?`<div class="ow-info"></div><div class="ow-actions"><button class="primary" data-win-action="assign">Assign task</button><button data-win-action="desk">Go to desk</button><button data-win-action="move">Move</button><details class="ow-more"><summary>More</summary><div><button data-win-action="details">Employee details</button><button data-win-action="appearance">Appearance</button></div></details></div>`
      :`<div class="ow-msgs" aria-live="polite"></div><form class="ow-form"><input maxlength="500" placeholder="Message ${esc(agent.name)}" aria-label="Message ${esc(agent.name)}" required><button class="primary">Send</button></form><p class="ow-note">${RuangChat.canGenerate(agent)?`Replies come from ${esc(PROVIDER_NAMES[agent.model.provider])}${agent.model.model?', '+esc(agent.model.model):''}.`:'No model connected: replies are labelled demo replies. Choose a provider under Employee details and save a key in Settings.'}</p>`}`}
    layer.append(el);w.el=el;w.html='';w.status='';if(isAgent(k))portrait(el.querySelector('canvas'),k,48);refreshWin(k,true);
    const msgs=el.querySelector('.ow-msgs');if(msgs){msgs.innerHTML=chatHTML(k);msgs.scrollTop=msgs.scrollHeight;el.querySelector('input').focus()}
    el.addEventListener('pointerdown',()=>{focusWin(k);if(isAgent(k))chosen=k});
    el.querySelector('.ow-form')?.addEventListener('submit',e=>{e.preventDefault();const input=e.target.querySelector('input'),text=input.value.trim();if(!text||RuangChat.isBusy(state.agents[k]))return;input.value='';
      RuangChat.send(state.agents[k],text,{onUpdate:()=>refreshChat(k),onDone:()=>{const cur=wins.get(k);if(cur&&!cur.el)cur.unread=true;refreshChat(k);refreshChrome()}})});
    dragHandle(el.querySelector('.ow-head'),k);positionWins()}
  function refreshWin(k,force){const w=wins.get(k);if(!w?.el)return;
    if(!isAgent(k)){const html=panelBody(k);if(force||html!==w.html){w.html=html;w.el.querySelector('.ow-body').innerHTML=html}return}
    const s=statusOf(k),status=badge(Core.STATUS_LABELS[s],Core.STATUS_PROMINENCE[s]==='prominent'?'demo':'');if(force||w.status!==status){w.status=status;w.el.querySelector('.ow-status').innerHTML=status}
    const body=w.el.querySelector('.ow-info,.ow-activity');if(body){const html=body.classList.contains('ow-info')?infoHTML(k):activityHTML(k);if(force||html!==w.html){w.html=html;body.innerHTML=html}}}
  function refreshChat(i){const msgs=wins.get(i)?.el?.querySelector('.ow-msgs');if(msgs){msgs.innerHTML=chatHTML(i);msgs.scrollTop=msgs.scrollHeight}}
  function dragHandle(head,k){let start=null;head.addEventListener('pointerdown',e=>{if(e.target.closest('button')||narrow.matches)return;const w=wins.get(k),r=w.el.getBoundingClientRect(),l=$('#office-windows').getBoundingClientRect();start={px:e.clientX,py:e.clientY,x:r.left-l.left,y:r.top-l.top,moved:false};head.setPointerCapture(e.pointerId)});
    head.addEventListener('pointermove',e=>{if(!start)return;const w=wins.get(k),dx=e.clientX-start.px,dy=e.clientY-start.py;if(!start.moved&&Math.hypot(dx,dy)<4)return;start.moved=true;w.detached=true;w.x=start.x+dx;w.y=start.y+dy;positionWins()});
    head.addEventListener('pointerup',()=>{if(start?.moved)saveWins();start=null})}
  function positionWins(){if(!$('#office-windows')||!canvas)return;const b=box();
    for(const [k,w] of wins){const el=w.el;if(!el)continue;el.classList.toggle('sheet',narrow.matches);if(narrow.matches)continue;const ww=el.offsetWidth,wh=el.offsetHeight;let left,top,below=false;
      if(w.detached){if(w.x===null){w.x=k==='project'?b.w-ww-16:16;w.y=k==='project'?TOP_GAP:b.h-wh-BOTTOM_GAP}left=w.x;top=w.y}
      else{const f=figure(actors[k]),sx=b.x+f.x*b.s;left=sx-ww/2;top=b.y+(f.top-14)*b.s-wh-10;if(top<TOP_GAP){top=b.y+f.foot*b.s+12;below=true}
        const clamped=Math.max(8,Math.min(left,b.w-ww-8));el.style.setProperty('--tail',Math.round(Math.min(Math.max(sx-clamped,14),ww-14))+'px')}
      left=Math.max(8,Math.min(left,b.w-ww-8));top=Math.max(TOP_GAP,Math.min(top,b.h-wh-BOTTOM_GAP));if(w.detached){w.x=left;w.y=top}
      el.style.transform=`translate(${Math.round(left)}px,${Math.round(top)}px)`;el.classList.toggle('detached',w.detached);el.classList.toggle('below',below)}}
  function drawLinks(){if(!$('#office-windows'))return;const b=box();ctx.save();ctx.strokeStyle='rgba(229,199,123,.7)';ctx.lineWidth=2/b.s;ctx.setLineDash([6/b.s,5/b.s]);
    for(const [k,w] of wins){if(!isAgent(k)||!w.el||!w.detached||narrow.matches)continue;const f=figure(actors[k]);ctx.beginPath();ctx.moveTo(f.x,f.top);ctx.lineTo((w.x+w.el.offsetWidth/2-b.x)/b.s,(w.y+w.el.offsetHeight/2-b.y)/b.s);ctx.stroke()}ctx.restore()}
  function refreshChrome(){document.querySelectorAll('.dock-item').forEach(el=>{const i=Number(el.dataset.officeAgent),w=wins.get(i),alert=!!approvalFor(i)||!!w?.unread;el.classList.toggle('open',!!w&&!w.min);el.classList.toggle('minimised',!!w?.min);el.classList.toggle('alert',alert);el.setAttribute('aria-label',`${state.agents[i].name}${w?.min?', minimised':''}${alert?', needs attention':''}`)});
    for(const k of Object.keys(PANELS)){const b=document.querySelector(`[data-office="panel-${k}"]`),w=wins.get(k);b?.setAttribute('aria-pressed',String(!!w&&!w.min))}
    const n=Core.inboxItems(state).length,c=document.querySelector('.hud-count');if(c){c.hidden=!n;c.textContent=n;c.closest('button').setAttribute('aria-label',n?`Inbox, ${n} items need you`:'Inbox')}}
  function updatePanel(force=false){for(const k of wins.keys())refreshWin(k,force);refreshChrome()}
  function winAction(k,action){if(isAgent(k))chosen=k;const w=wins.get(k);
    if(action==='close')closeWin(k);else if(action==='min')minimiseWin(k);else if(action==='card'||action==='chat'||action==='activity'){w.mode=action;buildWin(k);focusWin(k);saveWins()}
    else if(action==='assign')assign(k);else if(action==='desk')goLocation(k,[layout.homeByAgent[k%5]]);else if(action==='details')employee(k);else if(action==='appearance')AgentSkins.appearance(k);
    else if(action==='move'){if(taskFor(k)){say('An assigned task comes first, so this teammate cannot be moved right now.');return}moveArmed=k;canvas.classList.add('armed');say(`Click a spot or a place in the office to send ${state.agents[k].name} there. Press Escape to cancel.`)}}
  function disarm(){moveArmed=null;canvas?.classList.remove('armed')}
  function fitCanvas(){if(!canvas)return;if(zoom){canvas.style.width=W+'px';canvas.style.height=H+'px';return}const v=$('.office-viewport'),s=Math.min(v.clientWidth/W,v.clientHeight/H);canvas.style.width=Math.floor(W*s)+'px';canvas.style.height=Math.floor(H*s)+'px'}
  function mount(){canvas=$('#office-canvas');ctx=canvas.getContext('2d');ctx.imageSmoothingEnabled=false;fitCanvas();
    canvas.addEventListener('pointerdown',e=>{canvas.focus();const p=point(e),hit=pick(p);
      if(hit?.agent!==undefined){disarm();selected(hit.agent);return}
      if(moveArmed!==null){const i=moveArmed;disarm();if(paused){say('Resume motion to send a teammate somewhere.');return}if(hit?.object){const o=engine.objects.get(hit.object);goLocation(i,[o.id,...engine.interactions.filter(x=>x.kind===o.kind&&x.id!==o.id).map(x=>x.id)])}else{chosen=i;move(i,{x:Math.floor(p.x/T),y:Math.floor(p.y/T)})}return}
      if(!hit)for(const [k,w] of [...wins])if(isAgent(k)&&!w.detached&&w.mode==='card'&&w.el)closeWin(k)});
    canvas.addEventListener('pointermove',e=>{const p=point(e);hovered=pick(p);const tip=$('#office-tooltip');if(!hovered){tip.hidden=true;return}tip.textContent=hovered.agent!==undefined?state.agents[hovered.agent].name:(()=>{const o=engine.objects.get(hovered.object);return `${o.name}: ${engine.occupancy(o.id)} of ${o.capacity} in use`})();tip.hidden=false;tip.style.left=Math.min(e.offsetX+12,canvas.clientWidth-190)+'px';tip.style.top=Math.max(0,e.offsetY-32)+'px'});canvas.addEventListener('pointerleave',()=>{hovered=null;$('#office-tooltip').hidden=true});
    canvas.addEventListener('keydown',e=>{const dirs={ArrowUp:[0,-1],ArrowDown:[0,1],ArrowLeft:[-1,0],ArrowRight:[1,0]};if(dirs[e.key]){e.preventDefault();if(paused)return;const a=actors[chosen],p=a.path.at(-1)||tile(a),[dx,dy]=dirs[e.key];move(chosen,{x:p.x+dx,y:p.y+dy})}if(e.key==='Enter')openWin(chosen)});
    document.querySelectorAll('.dock-item canvas').forEach(c=>portrait(c,Number(c.closest('.dock-item').dataset.officeAgent),36));
    for(const [k,w] of wins){w.el=null;if(!w.min)buildWin(k)}refreshChrome();RuangChat.refreshStatus().then(()=>{for(const [k,w] of wins)if(isAgent(k)&&w.mode==='chat'&&w.el&&!w.el.querySelector('input')?.value)buildWin(k)});if(!raf){last=performance.now();raf=requestAnimationFrame(draw)}}
  function assign(i=chosen){const agent=state.agents[i],m=agent.model||{};
    const note=RuangChat.canGenerate(agent)?`${esc(agent.name)} will work on this with ${esc(PROVIDER_NAMES[m.provider])}${m.model?', '+esc(m.model):''}. The result is saved and lands in your Inbox.`:`${esc(agent.name)} has no connected model yet, so this task will stop with a clear message. Choose a provider under Employee details and save a key in Settings, then use Try again.`;
    show(`<h2>Assign a task to ${esc(agent.name)}</h2><p class="notice">${note}</p><form id="office-task-form"><label for="office-task-title">Task</label><input id="office-task-title" name="title" required maxlength="160" placeholder="For example: Explain the difference between JSON and JSONB in PostgreSQL"><label for="office-task-detail">Details (optional)</label><textarea id="office-task-detail" name="description" maxlength="4000" placeholder="Anything that helps: audience, length, format, constraints"></textarea><label for="office-task-kind">Kind of work</label><select name="kind" id="office-task-kind">${Core.ACTIVITIES.map(k=>`<option value="${k}" ${taskKinds[i%5]===k?'selected':''}>${k[0].toUpperCase()+k.slice(1)}</option>`).join('')}</select><div class="dialog-actions"><button type="button" data-close>Cancel</button><button class="primary">Assign task</button></div></form>`);
    $('#office-task-form').onsubmit=e=>{e.preventDefault();e.stopPropagation();const f=new FormData(e.target),title=String(f.get('title')).trim();if(!title)return;
      const task=Core.createTask({title,description:String(f.get('description')||'').trim(),assignedAgent:agent.id,activity:f.get('kind')});state.tasks.push(task);
      Core.recordActivity(state,{type:'task.created',text:`You assigned “${title}” to ${agent.name}.`,agentId:agent.id,taskId:task.id});persist();$('#dialog').close();updatePanel(true);RuangTasks.pump()}}
  const baseBody=bodyView;bodyView=function(p){let html=baseBody(p);if(view==='Tasks'&&state.tasks.length)html=`<section class="panel office-task-list"><div class="panel-head"><h2>Employee tasks</h2></div>${state.tasks.slice().sort((a,b)=>b.createdAt-a.createdAt).map(t=>`<div class="task"><div class="task-main"><h3>${esc(t.title)}</h3><p class="muted">${esc(state.agents.find(a=>a.id===t.assignedAgent)?.name||'Unassigned')}, ${esc(t.activity)}${t.metadata?.demo?', earlier demo task':''}${RuangTasks.progress(t.id)?`, ${esc(RuangTasks.progress(t.id).label.toLowerCase())}`:''}${t.status==='FAILED'&&t.error?`. ${esc(t.error)}`:''}</p></div>${badge(t.status.replace('_',' ').toLowerCase().replace(/^./,c=>c.toUpperCase()),['NEEDS_APPROVAL','BLOCKED','FAILED'].includes(t.status)?'demo':'')}${['QUEUED','ASSIGNED','PLANNING','RUNNING'].includes(t.status)?`<button class="small" data-task-cancel="${t.id}">Cancel</button>`:''}</div>`).join('')}</section>`+html;return html};
  const baseRender=render;render=function(){baseRender();document.title='Ruang';const brand=$('.brand');if(brand)brand.innerHTML='<img class="brand-symbol" src="v2/logo-symbol.png" alt=""><img class="brand-wordmark" src="v2/logo-wordmark.png" alt="Ruang">';if($('.tagline'))$('.tagline').textContent='Idea besar. Ruang sendiri.';document.querySelectorAll('.nav button').forEach(b=>b.title=b.textContent.trim());$('.shell')?.classList.toggle('office-mode',view==='Office');if(view!=='Office')return;
    $('.main').innerHTML=`<section class="office-full" aria-label="Office">
      <div class="office-viewport ${zoom?'actual':'fit'}"><div class="office-pixel-stage"><canvas id="office-canvas" width="${W}" height="${H}" tabindex="0" role="application" aria-label="Pixel office. Click a teammate to open their window. Arrow keys walk the selected teammate. Enter opens their window."></canvas><div id="office-tooltip" hidden></div></div></div>
      <div id="office-windows"></div>
      <div class="hud hud-top"><div class="hud-title"><b>Our office</b><span>${state.agents.length} teammates</span></div><div class="hud-actions"><button data-office="palette" aria-keyshortcuts="Control+K Meta+K">Search<kbd>Ctrl K</kbd></button><button data-view="Inbox" class="hud-inbox">Inbox<span class="hud-count" hidden></span></button><button data-office="panel-project" aria-pressed="false">Project board</button><button data-office="panel-activity" aria-pressed="false">Activity</button><span class="hud-sep" aria-hidden="true"></span><button data-office="pause">${paused?'▶ Resume':'Ⅱ Pause'}</button><button data-office="roam" aria-pressed="${roam}">Wander ${roam?'on':'off'}</button><button data-office="zoom" aria-label="Change office zoom">${zoom?'Fit to screen':'Actual size'}</button><button class="primary" data-action="new-project">＋ New project</button></div></div>
      <p class="hud hud-message" id="office-message" role="status">${esc(message)}</p>
      <div class="hud office-dock" role="toolbar" aria-label="Teammates">${state.agents.map((a,i)=>`<button class="dock-item" data-office-agent="${i}"><canvas width="24" height="36" aria-hidden="true"></canvas><span><b>${esc(a.name)}</b><small>${esc(a.role)}</small></span><i class="dock-dot" aria-hidden="true"></i></button>`).join('')}</div>
    </section>`;mount()};
  document.addEventListener('click',e=>{const wa=e.target.closest('[data-win-action]');if(wa){winAction(keyOf(wa.closest('.ow').dataset.win),wa.dataset.winAction);return}
    const b=e.target.closest('[data-office],[data-office-agent]');if(!b)return;if(b.dataset.officeAgent!==undefined){const i=Number(b.dataset.officeAgent),w=wins.get(i);w&&!w.min&&w.el?closeWin(i):selected(i);return}const action=b.dataset.office;
    if(action.startsWith('panel-')){togglePanel(action.slice(6));return}
    if(action==='palette'){window.RuangPalette?.show();return}
    if(action==='pause'){paused=!paused;render()}if(action==='roam'){roam=!roam;if(!roam)actors.forEach((a,i)=>{if(a.reason==='ambient'){clearInteraction(i);a.path=[];a.mode='Idle'}});render()}if(action==='zoom'){zoom=zoom?0:1;render()}});
  document.addEventListener('keydown',e=>{if(e.key!=='Escape'||view!=='Office'||$('#dialog')?.open)return;if(moveArmed!==null){disarm();say('Move cancelled.');return}const k=topWin();if(k!==undefined){e.preventDefault();closeWin(k)}});
  addEventListener('resize',()=>{fitCanvas();positionWins()});narrow.addEventListener?.('change',positionWins);
  // Entry points for the command palette and other views.
  window.RuangOffice={openEmployee(i,mode){if(view!=='Office'){view='Office';render()}openWin(i,mode)},assign(i){assign(i)}};
  // Restore open windows; older saves used `agent` instead of `key`. First run opens the project board.
  for(const s of state.officeWindows||[]){const k=keyOf(s.key??s.agent);if(isAgent(k)?state.agents[k]:PANELS[k])wins.set(k,{mode:['chat','activity'].includes(s.mode)?s.mode:'card',detached:isAgent(k)?!!s.detached:true,x:s.x??null,y:s.y??null,min:!!s.min})}
  if(!state.officeWindows)wins.set('project',{mode:'card',detached:true,x:null,y:null,min:false});
  makeBackground();render();
})();
