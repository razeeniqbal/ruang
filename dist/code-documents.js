(function(root){
  const key=path=>path.replace(/\\/g,'/').toLowerCase();
  class CodeDocuments{
    constructor(){this.documents=new Map();this.active=null;this.folder=null}
    setFolder(folder){if(this.folder?.path!==folder?.path||this.folder?.version!==folder?.version){if(this.dirty().length)throw Error('Close or save your unsaved files before changing folders.');this.documents.clear();this.active=null;}this.folder=folder}
    open(file){const id=key(file.path);let doc=this.documents.get(id);if(!doc){doc={...file,original:file.content,draft:file.content};this.documents.set(id,doc)}this.active=id;return doc}
    current(){return this.documents.get(this.active)}
    dirty(){return [...this.documents.values()].filter(d=>d.original!==d.draft)}
    close(id,discard=false){const doc=this.documents.get(id);if(doc&&doc.original!==doc.draft&&!discard)throw Error('Unsaved changes');this.documents.delete(id);if(this.active===id)this.active=[...this.documents.keys()].at(-1)||null}
    saved(id,result,submitted){const doc=this.documents.get(id);if(!doc||result.canceled)return;doc.original=result.content;doc.content=result.content;doc.hash=result.hash;doc.version=result.version;if(doc.draft===submitted)doc.draft=result.content;doc.backup=result.backup}
  }
  if(typeof module==='object'&&module.exports)module.exports={CodeDocuments,key};else root.CodeDocuments=CodeDocuments;
})(globalThis);
