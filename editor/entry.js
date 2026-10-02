import * as monaco from 'monaco-editor';
self.MonacoEnvironment={getWorker:(_id,label)=>new Worker(new URL('./editor/'+({typescript:'ts',javascript:'ts',json:'json',css:'css',scss:'css',less:'css',html:'html',handlebars:'html'}[label]||'editor')+'.worker.js',document.baseURI))};
// Keep code intelligence local. No dependency downloads or remote schema requests.
monaco.typescript?.typescriptDefaults.setEagerModelSync(false);
monaco.typescript?.typescriptDefaults.setDiagnosticsOptions({noSemanticValidation:true,noSyntaxValidation:false});
monaco.typescript?.javascriptDefaults.setDiagnosticsOptions({noSemanticValidation:true,noSyntaxValidation:false});
monaco.json?.jsonDefaults.setDiagnosticsOptions({validate:true,enableSchemaRequest:false});
monaco.editor.defineTheme('ruang-code',{base:'vs-dark',inherit:true,rules:[],colors:{'editor.background':'#111923','editorLineNumber.foreground':'#627487','editorCursor.foreground':'#edc17d','editor.selectionBackground':'#364b61','editor.lineHighlightBackground':'#182432'}});
window.RuangMonaco=monaco;
