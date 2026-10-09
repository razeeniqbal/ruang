// Execution trace: observable system events only (run started, file read, model called, output saved).
// It never stores model text or reasoning. Extra data is limited to short plain values.
const MAX_ENTRIES=300;
function plainData(data){
  if(!data||typeof data!=='object')return undefined;const out={};
  for(const [key,value] of Object.entries(data)){
    if(typeof value==='string')out[key]=value.slice(0,200);
    else if(typeof value==='number'&&Number.isFinite(value)||typeof value==='boolean'||value===null)out[key]=value;
  }
  return Object.keys(out).length?out:undefined;
}
class Trace{
  constructor(entries,now=()=>Date.now()){this.entries=entries;this.now=now}
  add(type,text,data){
    const entry={at:this.now(),type,text:String(text).slice(0,300)},clean=plainData(data);if(clean)entry.data=clean;
    if(this.entries.length<MAX_ENTRIES)this.entries.push(entry);
    return entry;
  }
}
module.exports={Trace,plainData,MAX_ENTRIES};
