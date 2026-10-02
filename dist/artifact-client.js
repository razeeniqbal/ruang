/* Outputs in the page: lightweight metadata in app state, full content in the desktop artifact store.
   Older outputs saved inline (content inside app state) keep working. The web version has no store yet,
   so it keeps content inline. Usable in Node for tests (createArtifactClient). */
(function(root){
  const preview=text=>String(text||'').replace(/[#*_`>|-]+/g,' ').replace(/\s+/g,' ').trim().slice(0,240);
  function createArtifactClient({bridge}){
    // Returns the metadata record to keep in state. Throws if the content could not be stored.
    async function save(artifact,content){
      const meta={...artifact,preview:preview(content),size:new TextEncoder().encode(content).length};
      const b=bridge();
      if(!b){return {...meta,storage:'inline',content}}
      const saved=await b.save({id:artifact.id,format:artifact.format||'markdown',content});
      const {content:_drop,...rest}=meta;
      return {...rest,storage:'file',file:saved.file,size:saved.size,sha256:saved.sha256};
    }
    async function read(artifact){
      if(artifact.storage!=='file')return artifact.content??'';
      const b=bridge();if(!b)throw Error('This output is stored by the Ruang desktop app. Open it there.');
      return b.read(artifact.id);
    }
    const previewOf=artifact=>artifact.preview??preview(artifact.content);
    return {save,read,previewOf,preview};
  }
  if(typeof module!=='undefined'&&module.exports){module.exports={createArtifactClient,preview};return}
  root.RuangArtifacts=createArtifactClient({bridge:()=>root.desktop?.artifacts||null});
})(typeof window!=='undefined'?window:globalThis);
