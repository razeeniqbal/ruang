if(window.desktop){
  let folder=null,listing=null,file=null,draft='',busy=false,error='',message='';
  const originalBody=bodyView,originalRender=render;
  const folderPanel=()=>`<section class="panel pad local-files"><div class="row"><div><h2>Project folder</h2><p class="small muted folder-path">${folder?esc(folder.path):'Choose a folder to work with real local files.'}</p></div><button class="primary" data-local="choose">${folder?'Change folder':'Choose folder'}</button></div>${error?`<p class="notice danger" role="alert">${esc(error)}</p>`:''}${message?`<p class="notice" role="status">${esc(message)}</p>`:''}${folder?`<div class="row"><span class="small muted">${esc(listing?.relative||folder.name)}</span><div>${listing?.relative?'<button data-local="up">↑ Up</button> ':''}<button data-local="refresh">Refresh</button></div></div><p class="small muted">Open UTF-8 text or code files up to 1 MB. Changes require confirmation and keep a backup.</p>${busy?'<p>Loading files…</p>':listing?`<div class="file-list">${listing.entries.map(e=>`<button class="file-entry" data-local="${e.directory?'folder':'open'}" data-path="${esc(e.path)}" ${!e.directory&&!e.editable?'disabled':''}><span>${e.directory?'▣':'▤'}</span><span>${esc(e.name)}</span><span class="small muted">${e.directory?'Folder':e.editable?'Open':'Preview unavailable'}</span></button>`).join('')||'<p class="muted">This folder is empty.</p>'}</div>${listing.truncated?'<p class="muted small">Showing the first 500 entries. Open a subfolder to see more.</p>':''}`:''}`:''}</section>`;
  bodyView=function(p){
    if(view==='Files')return `${folderPanel()}<h2 style="margin-top:26px">Demo reports</h2><div class="stack">${state.projects.filter(x=>x.output).map(p=>`<section class="panel pad row"><div><h3>${esc(p.name)}: report.md</h3><span class="small muted">Simulated output · stored in this app</span></div><button data-output="${p.id}">Open report</button></section>`).join('')||'<div class="panel empty">Completed demo reports will appear here.</div>'}</div>`;
    if(view==='Settings')return `<section class="panel pad"><h2>Ruang Desktop</h2><p>The office now runs in its own Windows application. Your projects and employee preferences are saved in this app’s local data folder.</p><h3>Local file access</h3><p class="muted">Choose a folder under Files. You can read and edit supported text files inside that folder. Every saved edit keeps the original in .ai-office-backups. Symbolic links, secret environment files and Git internals are excluded.</p><h3>AI providers</h3><p class="muted">Chat and tasks use each employee's chosen model with the provider key saved under AI Connections, which stays encrypted on this computer. Your project files are not sent to a model. Model use is billed by the provider.</p><button data-action="export">Export workspace</button></section>`;
    return originalBody(p);
  };
  render=function(){originalRender();const tag=document.querySelector('.top-actions .badge');if(tag)tag.textContent='Desktop app';const owner=document.querySelector('.owner .small');if(owner)owner.textContent=folder?folder.name:'Desktop workspace';};
  async function refresh(relative=''){
    busy=true;error='';render();
    try{listing=await window.desktop.listFiles(relative);folder=listing.folder}catch(e){error=e.message.replace(/^Error invoking remote method '[^']+': Error: /,'')}
    finally{busy=false;render()}
  }
  function editor(){show(`<h2>${esc(file.path)}</h2><p class="small muted">Editing a real local file. Review your changes before saving.</p><label for="local-editor">File contents</label><textarea id="local-editor" class="code-editor" spellcheck="false">${esc(draft)}</textarea><div class="dialog-actions"><button data-close>Close</button><button class="primary" data-local="review">Review changes</button></div>`);$('#dialog').classList.add('file-dialog');}
  function review(){draft=$('#local-editor').value;if(draft===file.content){message='No changes to save.';$('#dialog').close();render();return}show(`<h2>Review file changes</h2><p class="small muted">${esc(file.path)}</p><div class="change-preview"><section><h3>Current file</h3><pre>${esc(file.content)}</pre></section><section><h3>Your changes</h3><pre>${esc(draft)}</pre></section></div><p class="small muted">A native confirmation will appear before the file is changed. The original will be backed up.</p><div class="dialog-actions"><button data-local="edit">Back to editor</button><button class="primary" data-local="save">Save to disk</button></div>`)}
  document.addEventListener('click',async e=>{
    const b=e.target.closest('[data-local]');if(!b)return;const action=b.dataset.local;
    try{
      if(action==='choose'){const result=await window.desktop.chooseFolder();if(result){folder=result;file=null;listing=null;message='';window.dispatchEvent(new CustomEvent('ruang-folder-changed',{detail:{folder,source:'files'}}));await refresh()}}
      if(action==='refresh')await refresh(listing?.relative||'');
      if(action==='folder')await refresh(b.dataset.path);
      if(action==='up'){const parts=listing.relative.split(/[\\/]/);parts.pop();await refresh(parts.join('/'))}
      if(action==='open'){file=await window.desktop.readFile(b.dataset.path);draft=file.content;editor()}
      if(action==='review')review();
      if(action==='edit')editor();
      if(action==='save'){
        b.disabled=true;b.textContent='Waiting for confirmation…';
        try{const result=await window.desktop.saveFile({...file,content:draft});if(result.canceled){b.disabled=false;b.textContent='Save to disk';return}file=result;message=result.unchanged?'No changes to save.':`Saved ${result.path}. Original backed up to ${result.backup}.`;log(`Saved local file “${result.path}” after confirmation.`);persist();$('#dialog').close();await refresh(listing?.relative||'')}
        finally{b.disabled=false;b.textContent='Save to disk'}
      }
    }catch(err){const text=err.message.replace(/^Error invoking remote method '[^']+': Error: /,'');if($('#dialog').open){let el=$('#local-error');if(!el){el=document.createElement('p');el.id='local-error';el.className='notice danger';el.setAttribute('role','alert');$('#dialog').append(el)}el.textContent=text}else{error=text;render()}}
  });
  $('#dialog').addEventListener('close',()=>$('#dialog').classList.remove('file-dialog'));
  document.addEventListener('click',e=>{if(e.target.closest('[data-view="Files"]')&&folder&&!listing)refresh()});
  window.desktop.info().then(info=>{folder=info.folder;render()}).catch(e=>{error=e.message;render()});
  window.addEventListener('ruang-folder-changed',e=>{if(e.detail.source==='code'){folder=e.detail.folder;listing=null;file=null;message='';if(view==='Files')refresh()}});
  render();
}
