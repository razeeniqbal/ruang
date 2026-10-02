const fs=require('node:fs'),path=require('node:path'),{execFileSync}=require('node:child_process');
const root=path.join(__dirname,'..');
const pkg=JSON.parse(fs.readFileSync(path.join(root,'package.json'),'utf8'));
const target=path.join(root,'release','Ruang-'+pkg.version);
if(fs.existsSync(target))throw Error('Release already exists. Choose a new release folder before packaging again.');
fs.mkdirSync(target,{recursive:true});
fs.cpSync(path.join(root,'node_modules','electron','dist'),target,{recursive:true});
fs.renameSync(path.join(target,'electron.exe'),path.join(target,'Ruang.exe'));
const dest=path.join(target,'resources','app');fs.mkdirSync(dest,{recursive:true});
// Ship the app folders without tests or local preview helpers.
const skip=file=>/\.test\.cjs$/.test(file)||/[\\/]_test\.html$|[\\/]_raf-shim\.js$/.test(file);
for(const dir of ['dist','desktop'])fs.cpSync(path.join(root,dir),path.join(dest,dir),{recursive:true,filter:src=>!skip(src)});
// Production dependencies only (for example the Anthropic SDK used by the model gateway), as npm resolves them.
const listed=execFileSync(process.platform==='win32'?'npm.cmd':'npm',['ls','--omit=dev','--all','--parseable'],{cwd:root,encoding:'utf8',shell:process.platform==='win32'}).split(/\r?\n/).filter(Boolean);
for(const dir of listed){const rel=path.relative(root,dir);if(!rel||rel.startsWith('..')||!rel.startsWith('node_modules'))continue;fs.cpSync(dir,path.join(dest,rel),{recursive:true})}
delete pkg.devDependencies;
fs.writeFileSync(path.join(dest,'package.json'),JSON.stringify(pkg,null,2));
fs.copyFileSync(path.join(root,'README.md'),path.join(target,'README.md'));
console.log(`Packaged Windows app: ${path.join(target,'Ruang.exe')} (${listed.length-1} production packages)`);
