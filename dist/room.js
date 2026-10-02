(() => {
  const W=1000,H=680,images={},frames={},homes=[{x:490,y:610},{x:190,y:330},{x:810,y:330},{x:190,y:590},{x:810,y:590}];
  const spriteNames=['manager','researcher','analyst','developer','qa'];
  const colors=['#f2c66d','#99d4a1','#8fcdf3','#c2b0fa','#f4b498'];
  let chosen=0,canvas,ctx,raf=0,last=0,ready=false,loadError='',roam=true,paused=matchMedia('(prefers-reduced-motion: reduce)').matches,saveTimer;
  const starts=[{x:490,y:390},{x:250,y:350},{x:750,y:350},{x:330,y:570},{x:670,y:570}];
  const actors=starts.map((p,i)=>{const stored=state.roomPositions?.[i];const valid=stored&&Number.isFinite(stored.x)&&Number.isFinite(stored.y)&&RoomNav.walkable(Math.floor(stored.x/20),Math.floor(stored.y/20));return {...(valid?stored:p),path:[],dir:'down',clock:0,nextRoam:performance.now()+3000+i*1900,lastStatus:'Idle',manualUntil:0}});
  function savePositions(){clearTimeout(saveTimer);saveTimer=setTimeout(()=>{state.roomPositions=actors.map(a=>({x:a.x,y:a.y}));persist()},300)}
  function say(text){const el=document.querySelector('#room-message');if(el)el.textContent=text}
  function send(i,destination,manual=false){const a=actors[i],path=RoomNav.route(a,destination);if(path===null){if(manual)say('Choose an open floor tile. Desks and plants are solid.');return false}a.path=path;if(manual){a.manualUntil=performance.now()+14000;say(`${state.agents[i].name} is heading there.`)}return true}
  function load(name,url){return new Promise((resolve,reject)=>{const img=new Image();img.onload=()=>{images[name]=img;resolve()};img.onerror=()=>reject(Error(`Could not load ${name}`));img.src=url})}
  // Source rectangles reference the supplied sheets. They remain untouched on disk.
  function spriteRects(name){
    if(name==='manager')return {idle:[0,1,2,3].map(i=>[25+i*120,55,115,214]),down:[0,1,2,3].map(i=>[532+i*122,55,115,214]),up:[0,1,2,3].map(i=>[1044+i*121,55,118,214]),left:[0,1,2,3].map(i=>[20+i*120,300,116,208]),right:[0,1,2,3].map(i=>[530+i*122,300,118,208])};
    return {idle:[0,1,2,3].map(i=>[8+i*121,52,121,207]),down:[0,1,2,3].map(i=>[530+i*122,52,121,207]),up:[0,1,2,3].map(i=>[1050+i*121,52,121,207]),left:[0,1,2,3].map(i=>[8+i*121,307,121,204]),right:[0,1,2,3].map(i=>[530+i*122,307,121,204])};
  }
  function crop(name,r,x,y,w,h){const im=images[name];ctx.drawImage(im,...r,x,y,w,h)}
  function plaque(text,x,y,width=160){ctx.fillStyle='#183b3c';ctx.fillRect(x-width/2,y-13,width,27);ctx.strokeStyle='#77908a';ctx.strokeRect(x-width/2+.5,y-12.5,width,27);ctx.font='bold 15px monospace';ctx.fillStyle='#f7dfab';ctx.textAlign='center';ctx.fillText(text,x,y+5)}
  let roomBackground;
  function background(){
    roomBackground=document.createElement('canvas');roomBackground.width=W;roomBackground.height=H;const target=ctx;ctx=roomBackground.getContext('2d');ctx.imageSmoothingEnabled=false;
    ctx.fillStyle='#152b2c';ctx.fillRect(0,0,W,H);
    ctx.fillStyle='#183e40';ctx.fillRect(23,19,954,114);
    for(let y=132;y<652;y+=75)for(let x=25;x<975;x+=75)crop('environment',[38,62,143,141],x,y,75,75);
    ctx.fillStyle='#203838';ctx.fillRect(0,650,W,30);ctx.fillRect(0,125,26,550);ctx.fillRect(974,125,26,550);
    ctx.strokeStyle='#a98b64';ctx.lineWidth=4;ctx.strokeRect(25,130,950,520);
    crop('environment',[1240,518,262,156],100,25,230,105);crop('environment',[1240,518,262,156],670,25,230,105);
    ctx.fillStyle='#102b2d';ctx.fillRect(382,31,236,86);ctx.strokeStyle='#d7b777';ctx.lineWidth=2;ctx.strokeRect(382,31,236,86);ctx.fillStyle='#f5d394';ctx.textAlign='center';ctx.font='bold 35px monospace';ctx.fillText('RUANG',500,72);ctx.fillStyle='#a8c7bd';ctx.font='11px monospace';ctx.fillText('IDEA BESAR. RUANG SENDIRI.',500,96);
    crop('decorations',[1000,680,503,215],355,320,290,118);
    ctx.font='bold 18px monospace';ctx.fillStyle='#b8c7c3';ctx.fillText('RUANG BERSAMA',500,380);
    plaque('RESEARCH',195,166);plaque('ANALYSIS',805,166);plaque('DEVELOPMENT',195,420);plaque('QA & REVIEW',805,420);plaque('MEETING',500,151,135);
    ctx.fillStyle='#193c3d';ctx.fillRect(420,630,160,32);ctx.fillStyle='#ebc783';ctx.font='bold 15px monospace';ctx.fillText('SELAMAT DATANG',500,652);
    ctx=target;
  }
  const furniture=[
    {r:[35,60,222,205],x:100,y:184,w:190,h:123,bottom:300},
    {r:[290,55,295,202],x:710,y:184,w:190,h:123,bottom:300},
    {r:[290,55,295,202],x:100,y:438,w:190,h:123,bottom:555},
    {r:[35,60,222,205],x:710,y:438,w:190,h:123,bottom:555},
    {r:[820,295,447,226],x:395,y:170,w:210,h:115,bottom:285},
    {r:[611,18,313,243],x:395,y:450,w:210,h:133,bottom:580}
  ];
  const plants=[{x:37,y:112,w:62,h:96},{x:901,y:112,w:62,h:96},{x:35,y:520,w:62,h:96},{x:905,y:520,w:62,h:96}];
  function drawActor(a,i){
    const isMoving=a.path.length>0&&!paused,frame=isMoving?Math.floor(a.clock/130)%4:0;
    ctx.fillStyle='#162c2d55';ctx.beginPath();ctx.ellipse(a.x,a.y-2,18,6,0,0,Math.PI*2);ctx.fill();
    if(i===chosen){ctx.strokeStyle=colors[i];ctx.lineWidth=2;ctx.beginPath();ctx.ellipse(a.x,a.y-2,24,10,0,0,Math.PI*2);ctx.stroke()}
    const name=spriteNames[i],rects=spriteRects(name),rect=(isMoving?rects[a.dir]:rects.idle)[frame];
    crop(name,rect,a.x-26,a.y-87,52,87);
    const label=state.agents[i].name,working=statusFor(i)==='Working';
    ctx.font='bold 12px system-ui';const width=Math.max(62,ctx.measureText(label).width+18);ctx.fillStyle=i===chosen?'#163b3f':'#14292dea';ctx.fillRect(a.x-width/2,a.y+9,width,23);ctx.strokeStyle=i===chosen?colors[i]:'#53716c';ctx.lineWidth=1;ctx.strokeRect(a.x-width/2+.5,a.y+9.5,width,23);ctx.fillStyle='#f4ebd8';ctx.textAlign='center';ctx.fillText(label,a.x,a.y+25);
    if(working){ctx.fillStyle='#e6bf75';ctx.fillRect(a.x-22,a.y-105,44,18);ctx.fillStyle='#1b3639';ctx.font='bold 10px monospace';ctx.fillText('WORK',a.x,a.y-92)}
  }
  function draw(time){
    if(!canvas?.isConnected){raf=0;return}const dt=Math.min(time-last||16,45);last=time;
    if(ready){ctx.clearRect(0,0,W,H);ctx.drawImage(roomBackground,0,0);
      for(let i=0;i<actors.length;i++){const a=actors[i],status=statusFor(i);if(status!==a.lastStatus){if(status==='Working')send(i,homes[i]);a.lastStatus=status}
        if(!paused){a.clock+=dt;if(a.path.length){const p=a.path[0],dx=p.x-a.x,dy=p.y-a.y,d=Math.hypot(dx,dy),step=dt*.11;a.dir=Math.abs(dx)>Math.abs(dy)?dx>0?'right':'left':dy>0?'down':'up';if(d<=step){a.x=p.x;a.y=p.y;a.path.shift();if(!a.path.length){savePositions();if(i===chosen)say(`${state.agents[i].name} arrived. Choose another spot to walk.`);a.nextRoam=time+6000+Math.random()*8000}}else{a.x+=dx/d*step;a.y+=dy/d*step}}else if(roam&&status==='Idle'&&time>a.nextRoam&&time>a.manualUntil){const points=[{x:350,y:350},{x:650,y:350},{x:330,y:610},{x:670,y:610},{x:350,y:150},{x:650,y:150},homes[i]];send(i,points[Math.floor(Math.random()*points.length)]);a.nextRoam=time+7000}}
      }
      const items=[...furniture.map(o=>({z:o.bottom,paint:()=>crop('furniture',o.r,o.x,o.y,o.w,o.h)})),...plants.map(p=>({z:p.y+p.h,paint:()=>crop('decorations',[295,26,165,228],p.x,p.y,p.w,p.h)})),...actors.map((a,i)=>({z:a.y,paint:()=>drawActor(a,i)}))];items.sort((a,b)=>a.z-b.z).forEach(o=>o.paint());
      const dest=actors[chosen].path.at(-1);if(dest){ctx.strokeStyle=colors[chosen];ctx.lineWidth=2;ctx.strokeRect(dest.x-6,dest.y-6,12,12)}
    }
    raf=requestAnimationFrame(draw);
  }
  function select(i){chosen=i;document.querySelectorAll('[data-room-agent]').forEach(b=>{const active=Number(b.dataset.roomAgent)===i;b.classList.toggle('selected',active);b.setAttribute('aria-pressed',String(active))});const name=document.querySelector('#selected-name');if(name)name.textContent=state.agents[i].name;say(`Selected ${state.agents[i].name}. Click the floor to walk, or use arrow keys.`)}
  function mount(){
    canvas=document.querySelector('#ruang-canvas');if(!canvas)return;ctx=canvas.getContext('2d');ctx.imageSmoothingEnabled=false;
    canvas.addEventListener('pointerdown',e=>{canvas.focus();const r=canvas.getBoundingClientRect(),p={x:(e.clientX-r.left)*W/r.width,y:(e.clientY-r.top)*H/r.height};const hit=actors.map((a,i)=>({a,i})).reverse().find(({a})=>Math.abs(a.x-p.x)<28&&p.y>a.y-88&&p.y<a.y+32);if(hit)select(hit.i);else if(paused)say('Resume motion first, then choose a destination.');else send(chosen,p,true)});
    canvas.addEventListener('keydown',e=>{const directions={ArrowUp:[0,-20],ArrowDown:[0,20],ArrowLeft:[-20,0],ArrowRight:[20,0]};if(directions[e.key]){e.preventDefault();if(paused)return;const a=actors[chosen],p=a.path.at(-1)||a,[dx,dy]=directions[e.key];send(chosen,{x:p.x+dx,y:p.y+dy},true)}if(e.key==='Enter')employee(chosen)});
    select(chosen);if(!raf){last=performance.now();raf=requestAnimationFrame(draw)}
  }
  const previousRender=render;
  render=function(){previousRender();document.title='Ruang — Your AI workspace';const brand=document.querySelector('.brand');if(brand)brand.innerHTML='<span class="ruang-mark">R</span> RUANG';const tagline=document.querySelector('.tagline');if(tagline)tagline.textContent='Idea besar. Ruang sendiri.';
    if(view!=='Office')return;
    const main=document.querySelector('.main'),p=project();main.innerHTML=`<header class="topbar"><div><div class="eyebrow">RUANG / YOUR AI WORKSPACE</div><h1>Selamat datang, Razeen.</h1><p class="welcome-sub">A space for your ideas. A team to bring them to life.</p></div><div class="top-actions">${badge(window.desktop?'Desktop · AI demo':'AI demo','demo')}<button class="primary" data-action="new-project">＋ New project</button></div></header><div class="room-workspace"><section class="panel room-panel"><div class="room-toolbar"><div><span class="live-indicator"></span><strong>Pejabat kita</strong><span class="small muted">Our office</span></div><div><button class="quiet" data-room="pause">${paused?'▶ Resume motion':'Ⅱ Pause motion'}</button><button class="quiet ${roam?'enabled':''}" data-room="roam" aria-pressed="${roam}">Wander ${roam?'on':'off'}</button></div></div><div class="room-stage"><canvas id="ruang-canvas" width="1000" height="680" tabindex="0" role="application" aria-label="Ruang office. Select a teammate below, then click the floor or use arrow keys to walk. Enter opens employee details."></canvas>${!ready?`<div class="room-loading">${loadError?esc(loadError):'Opening your ruang…'}</div>`:''}</div><div class="room-hint"><span id="room-message" role="status" aria-live="polite">Choose a teammate, then click the floor.</span><span class="keyboard-hint">↑ ↓ ← → to walk</span></div><div class="character-picker">${state.agents.slice(0,5).map((a,i)=>`<button data-room-agent="${i}" aria-pressed="${chosen===i}" class="character-choice ${chosen===i?'selected':''}"><span class="character-dot" style="background:${colors[i]}"></span><span><b>${esc(a.name)}</b><small>${esc(a.role)}</small></span></button>`).join('')}</div></section><aside class="room-sidebar"><section class="panel pad selected-panel"><div class="eyebrow">YOUR TEAMMATE</div><h2 id="selected-name">${esc(state.agents[chosen].name)}</h2><p class="muted small">Select a teammate and click an open floor tile to send them there.</p><div class="stack"><button data-room="desk">Go to desk</button><button data-room="details" class="quiet">Employee details ↗</button></div></section><section class="panel pad"><div class="row"><h2>Project board</h2>${p?badge(p.status,p.status==='Waiting approval'?'demo':''):''}</div>${p?projectSummary(p):'<h3>What are we building today?</h3><p class="small muted">Try a simulated project and watch your team move to work.</p><button class="primary" data-action="demo">Try a demo project</button>'}</section><section class="panel pad mini-stats"><div><strong>${state.agents.length}</strong><span>Teammates</span></div><div><strong>${state.projects.length}</strong><span>Projects</span></div><div><strong>$0</strong><span>API spend</span></div></section><p class="small muted room-note">Movement is interactive. AI task execution remains simulated.</p></aside></div><section class="panel activity"><div class="panel-head"><h2>In the ruang</h2><button class="quiet small" data-view="Activity">View activity</button></div>${eventsHTML(3)}</section>`;mount();
  };
  document.addEventListener('click',e=>{const b=e.target.closest('[data-room],[data-room-agent]');if(!b)return;if(b.dataset.roomAgent!==undefined)select(Number(b.dataset.roomAgent));const action=b.dataset.room;if(action==='pause'){paused=!paused;render()}if(action==='roam'){roam=!roam;if(!roam)actors.forEach(a=>{if(a.manualUntil<performance.now()&&statusFor(actors.indexOf(a))==='Idle')a.path=[]});render()}if(action==='desk'){if(paused)say('Resume motion to walk to a desk.');else send(chosen,homes[chosen],true)}if(action==='details')employee(chosen)});
  document.addEventListener('visibilitychange',()=>{last=performance.now()});
  Promise.all(['environment','furniture','decorations',...spriteNames].map(name=>load(name,`assets/${name}.png`))).then(()=>{ready=true;const temporary=document.createElement('canvas');ctx=temporary.getContext('2d');background();render()}).catch(e=>{loadError=e.message+'. Reopen the app to retry.';render()});
  render();
})();
