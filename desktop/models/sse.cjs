// Minimal server-sent events reader for providers streamed over plain HTTPS (OpenAI, Google).
// Yields each event's data string; stops at "[DONE]".
async function* sseData(response){
  const reader=response.body.getReader(),decoder=new TextDecoder();let buffer='';
  try{
    for(;;){const {value,done}=await reader.read();if(done)break;buffer+=decoder.decode(value,{stream:true});
      let cut;while((cut=buffer.search(/\r?\n\r?\n/))>=0){const block=buffer.slice(0,cut);buffer=buffer.slice(cut).replace(/^\r?\n\r?\n/,'');
        const data=block.split(/\r?\n/).filter(l=>l.startsWith('data:')).map(l=>l.slice(5).replace(/^ /,'')).join('\n');
        if(!data)continue;if(data==='[DONE]')return;yield data}}
    const tail=buffer.split(/\r?\n/).filter(l=>l.startsWith('data:')).map(l=>l.slice(5).trim()).join('\n');if(tail&&tail!=='[DONE]')yield tail;
  }finally{reader.releaseLock?.()}
}
module.exports={sseData};
