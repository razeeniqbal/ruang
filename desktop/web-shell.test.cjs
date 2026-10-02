const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const dist=path.join(__dirname,'..','dist');
const sw=fs.readFileSync(path.join(dist,'sw.js'),'utf8');
const shell=JSON.parse(sw.match(/const SHELL=(\[[\s\S]*?\]);/)[1].replace(/'/g,'"'));
const html=fs.readFileSync(path.join(dist,'index.html'),'utf8');

test('every file in the offline shell exists, so installing the web app cannot fail on a missing file',()=>{
  for(const file of shell)if(file!=='./')assert.ok(fs.existsSync(path.join(dist,file)),`missing ${file}`);
});
test('the offline shell covers every script and stylesheet the page loads (the editor bundle loads on demand)',()=>{
  const refs=[...html.matchAll(/(?:src|href)="([^"]+\.(?:js|css|webmanifest))"/g)].map(m=>m[1]).filter(f=>!f.startsWith('editor/'));
  for(const ref of refs)assert.ok(shell.includes(ref),`not cached offline: ${ref}`);
});
test('the manifest points at icons that exist and opens standalone',()=>{
  const m=JSON.parse(fs.readFileSync(path.join(dist,'manifest.webmanifest'),'utf8'));
  assert.equal(m.display,'standalone');assert.ok(m.icons.some(i=>i.sizes==='512x512'&&i.purpose==='maskable'));
  for(const icon of m.icons)assert.ok(fs.existsSync(path.join(dist,icon.src)),icon.src);
});
