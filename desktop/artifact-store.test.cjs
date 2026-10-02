const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {ArtifactStore,fileName}=require('./artifact-store.cjs');
const tempRoot=()=>fs.mkdtempSync(path.join(os.tmpdir(),'ruang-artifacts-'));

test('file names come only from a valid id and format',()=>{
  assert.equal(fileName('artifact-1a2b-3c'),'artifact-1a2b-3c.md');
  assert.equal(fileName('artifact-x','text'),'artifact-x.txt');
  for(const bad of ['../../secret','artifact-../x','artifact-a/b','artifact-a\\b','C:\\artifact-x','/etc/passwd','artifact-a:b','artifact-','report','artifact-a.b',''])
    assert.throws(()=>fileName(bad),/Invalid output id/,bad);
  assert.throws(()=>fileName('artifact-x','exe'),/Unsupported output format/);
});

test('path escapes are rejected even for names that slip past a check',()=>{
  const store=new ArtifactStore({root:tempRoot()});
  for(const name of ['../escape.md','..\\escape.md','sub/x.md',path.resolve('/x.md'),'C:\\x.md'])assert.throws(()=>store.resolve(name),/Invalid output path/,name);
  assert.throws(()=>store.save({id:'../../evil',content:'x'}),/Invalid output id/);
  assert.throws(()=>store.read('..\\..\\evil'),/Invalid output id/);
});

test('saving writes the whole output into the store, and it reads back exactly',()=>{
  const root=tempRoot(),store=new ArtifactStore({root});const content='# JSON vs JSONB\n\nUnicode is kept: café, 数据.\n';
  const saved=store.save({id:'artifact-abc-123',content});
  assert.equal(saved.file,'artifact-abc-123.md');assert.equal(saved.size,Buffer.byteLength(content));assert.equal(saved.sha256.length,64);
  assert.equal(fs.readFileSync(path.join(root,saved.file),'utf8'),content);
  assert.equal(store.read('artifact-abc-123'),content);assert.equal(store.exists('artifact-abc-123'),true);assert.equal(store.exists('artifact-nope'),false);
  assert.deepEqual(fs.readdirSync(root),['artifact-abc-123.md'],'no temporary files are left behind');
  assert.throws(()=>store.save({id:'artifact-abc-123',content:'again'}),/already been saved/);
  assert.throws(()=>store.read('artifact-missing'),/missing/);
});

test('a failed write leaves no partial output and reports the failure',()=>{
  const root=tempRoot();const failing={...fs,writeSync:()=>{throw Error('disk is full')}};
  const store=new ArtifactStore({root,fsImpl:failing});
  assert.throws(()=>store.save({id:'artifact-fail',content:'Hello'}),/Could not save the output: disk is full/);
  assert.deepEqual(fs.readdirSync(root),[],'neither the final file nor the temporary file remains');
  assert.equal(store.exists('artifact-fail'),false);
});

test('empty and oversized outputs are refused',()=>{
  const store=new ArtifactStore({root:tempRoot()});
  assert.throws(()=>store.save({id:'artifact-empty',content:'   '}),/no output/);
  assert.throws(()=>store.save({id:'artifact-big',content:'x'.repeat(5*1024*1024+1)}),/too large/);
});
