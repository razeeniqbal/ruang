// Render the authored pixel grid into exact-resolution PNGs without resampling.
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),zlib=require('node:zlib');
class Raster{
  constructor(){this.w=0;this.h=0;this.data=new Uint8Array();this.ctx={fillStyle:'#000000',imageSmoothingEnabled:false,fillRect:(x,y,w,h)=>this.rect(x,y,w,h),drawImage:(source,x,y)=>this.blit(source,x,y)}}
  set width(v){this.w=v;this.data=new Uint8Array(this.w*this.h*4)}get width(){return this.w}
  set height(v){this.h=v;this.data=new Uint8Array(this.w*this.h*4)}get height(){return this.h}
  getContext(){return this.ctx}
  rect(x,y,w,h){for(const v of [x,y,w,h])if(!Number.isInteger(v))throw Error('Non-integer source pixel');const hex=this.ctx.fillStyle.slice(1);const color=[parseInt(hex.slice(0,2),16),parseInt(hex.slice(2,4),16),parseInt(hex.slice(4,6),16),255];for(let yy=y;yy<y+h;yy++)for(let xx=x;xx<x+w;xx++)if(xx>=0&&xx<this.w&&yy>=0&&yy<this.h)this.data.set(color,(yy*this.w+xx)*4)}
  blit(source,x,y){for(let yy=0;yy<source.h;yy++)for(let xx=0;xx<source.w;xx++){const p=(yy*source.w+xx)*4;if(source.data[p+3]&&xx+x>=0&&xx+x<this.w&&yy+y>=0&&yy+y<this.h)this.data.set(source.data.subarray(p,p+4),((yy+y)*this.w+xx+x)*4)}}
}
function crc(buffer){let c=0xffffffff;for(const byte of buffer){c^=byte;for(let j=0;j<8;j++)c=(c>>>1)^((c&1)?0xedb88320:0)}return (c^0xffffffff)>>>0}
function chunk(type,data){const t=Buffer.from(type),size=Buffer.alloc(4),sum=Buffer.alloc(4);size.writeUInt32BE(data.length);sum.writeUInt32BE(crc(Buffer.concat([t,data])));return Buffer.concat([size,t,data,sum])}
function png(image){const header=Buffer.alloc(13);header.writeUInt32BE(image.w,0);header.writeUInt32BE(image.h,4);header[8]=8;header[9]=6;const rows=[];for(let y=0;y<image.h;y++)rows.push(Buffer.from([0]),Buffer.from(image.data.subarray(y*image.w*4,(y+1)*image.w*4)));return Buffer.concat([Buffer.from([137,80,78,71,13,10,26,10]),chunk('IHDR',header),chunk('IDAT',zlib.deflateSync(Buffer.concat(rows))),chunk('IEND',Buffer.alloc(0))])}
const root=path.join(__dirname,'..'),context={window:{},document:{createElement:()=>new Raster()}};vm.runInNewContext(fs.readFileSync(path.join(root,'dist','pixel-assets.js'),'utf8'),context);
const assets=context.window.PixelAssets,target=path.join(root,'dist','native-assets');fs.mkdirSync(target,{recursive:true});
const names=['floor','wall','window','desk','meeting','discussion','sofa','shelf','cabinet','server','whiteboard','projectboard','coffee','water','printer','chair','armchair','plant','cat','monitor','codeMonitor','chartMonitor','researchMonitor','checkMonitor','aiMonitor','papers','books','mug','rug'];
const manifest={tile:16,frameWidth:16,frameHeight:24,columns:4,rows:assets.rows,assets:{}};
for(const name of names){const image=assets.asset(name);fs.writeFileSync(path.join(target,name+'.png'),png(image));manifest.assets[name]={width:image.w,height:image.h}}
for(let i=0;i<5;i++){const image=assets.skinSheet(i);fs.writeFileSync(path.join(target,`employee-${i}-16x24.png`),png(image));manifest.assets[`employee-${i}-16x24`]={width:64,height:192}}
fs.writeFileSync(path.join(target,'manifest.json'),JSON.stringify(manifest,null,2));console.log(`Exported ${names.length+5} native PNG assets to ${target}`);
