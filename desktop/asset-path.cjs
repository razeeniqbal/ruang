const path=require('node:path');
function assetPath(root,url){const u=new URL(url);if(u.protocol!=='ruang:'||u.hostname!=='app')throw Error('Invalid asset origin');const parts=decodeURIComponent(u.pathname).split('/').filter(Boolean);if(parts.some(p=>p==='..'||p==='.'||/[\\:\0]/.test(p)))throw Error('Invalid asset path');const file=path.resolve(root,...(parts.length?parts:['index.html']));const relative=path.relative(root,file);if(relative.startsWith('..')||path.isAbsolute(relative))throw Error('Invalid asset path');return file}
module.exports={assetPath};
