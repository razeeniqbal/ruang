/* Native pixel assets: each drawing coordinate is one source pixel.
   No source illustration, downsampling, filters, gradients or antialiasing. */
(function(root){
  const P={ink:'#192432',wood:'#b87945',woodLight:'#d49a59',woodDark:'#805038',cream:'#e3d5b1',paper:'#f5ecd0',teal:'#487f83',tealLight:'#7bad9d',blue:'#3e617b',blueLight:'#7797a2',navy:'#2c3e55',gray:'#718080',grayLight:'#a6afa4',green:'#537a45',greenLight:'#87a353',greenDark:'#345b3c',skin:'#d9a06b',skinLight:'#f0be85',hair:'#493a35',gold:'#d5ae56',red:'#a05d50'};
  const cache=new Map();
  function surface(w,h){const canvas=document.createElement('canvas');canvas.width=w;canvas.height=h;const c=canvas.getContext('2d');c.imageSmoothingEnabled=false;return {canvas,c,r:(x,y,w,h,color)=>{c.fillStyle=P[color]||color;c.fillRect(x,y,w,h)},p:(x,y,color)=>{c.fillStyle=P[color]||color;c.fillRect(x,y,1,1)}}}
  function asset(name){if(cache.has(name))return cache.get(name);const sizes={floor:[16,16],wall:[16,32],window:[32,32],desk:[32,16],meeting:[32,32],discussion:[32,24],sofa:[32,16],shelf:[16,32],cabinet:[16,32],server:[16,32],whiteboard:[32,32],projectboard:[32,32],coffee:[16,24],water:[16,24],printer:[16,16],chair:[16,16],armchair:[16,16],plant:[16,16],cat:[16,16],monitor:[16,16],codeMonitor:[16,16],chartMonitor:[16,16],researchMonitor:[16,16],checkMonitor:[16,16],aiMonitor:[16,16],papers:[8,8],books:[8,8],mug:[8,8],rug:[32,32]};
    const [w,h]=sizes[name]||[16,16],s=surface(w,h),{r,p,c}=s;
    if(name==='floor'){r(0,0,16,16,'wood');r(0,0,16,1,'woodLight');r(0,7,16,1,'woodDark');r(0,15,16,1,'woodDark');r(7,0,1,7,'woodDark');r(13,8,1,7,'woodDark');r(1,2,4,1,'woodLight');r(2,10,8,1,'woodLight')}
    else if(name==='wall'){r(0,0,16,32,'ink');r(0,2,16,4,'navy');r(0,7,16,19,'cream');r(0,26,16,3,'woodDark');r(0,29,16,2,'wood');p(15,8,'paper')}
    else if(name==='window'){r(0,0,32,30,'ink');r(2,2,28,24,'blueLight');r(3,3,26,8,'tealLight');r(3,19,5,7,'blue');r(9,14,5,12,'navy');r(18,17,4,9,'blue');r(24,12,5,14,'navy');for(let x=4;x<29;x+=5)for(let y=19;y<24;y+=3)p(x,y,'gold');r(15,2,2,25,'cream');r(2,14,28,2,'cream');r(0,28,32,3,'woodDark');r(1,28,30,1,'woodLight')}
    else if(name==='desk'){r(0,0,32,10,'ink');r(1,1,30,5,'woodLight');r(1,6,30,3,'wood');r(2,10,3,6,'ink');r(3,10,1,5,'gray');r(27,10,3,6,'ink');r(23,10,4,5,'woodDark');r(24,11,2,1,'cream')}
    else if(name.endsWith('Monitor')||name==='monitor'){r(1,0,14,11,'ink');r(2,1,12,8,'navy');r(7,11,2,2,'gray');r(4,13,8,1,'ink');r(3,15,10,1,'gray');if(name==='chartMonitor'){r(4,5,2,3,'tealLight');r(7,3,2,5,'gold');r(10,2,2,6,'blueLight')}else if(name==='checkMonitor'){p(5,4,'greenLight');p(6,5,'greenLight');r(7,3,1,2,'greenLight');r(8,2,1,2,'greenLight');r(4,7,7,1,'gray')}else if(name==='aiMonitor'){r(5,3,6,4,'teal');r(6,4,4,2,'tealLight')}else{r(3,2,6,1,'tealLight');r(4,4,8,1,name==='researchMonitor'?'cream':'blueLight');r(3,6,4,1,'tealLight');r(9,6,3,1,'gold')}}
    else if(name==='chair'||name==='armchair'){r(3,0,10,9,'ink');r(4,1,8,6,'blue');r(2,8,12,5,'ink');r(3,9,10,3,name==='armchair'?'teal':'blue');r(4,13,2,3,'ink');r(10,13,2,3,'ink');r(0,8,2,5,'gray');r(14,8,2,5,'gray')}
    else if(name==='sofa'){r(1,0,30,14,'ink');r(2,1,28,7,'teal');r(3,2,12,5,'blue');r(17,2,12,5,'blue');r(2,9,28,4,'blueLight');r(0,6,3,8,'teal');r(29,6,3,8,'teal');r(3,14,3,2,'ink');r(26,14,3,2,'ink');r(4,3,5,5,'cream')}
    else if(name==='meeting'||name==='discussion'){const bottom=h-6;r(2,2,28,bottom-1,'ink');r(3,3,26,bottom-3,'wood');r(4,3,24,2,'woodLight');r(5,bottom+1,3,5,'ink');r(24,bottom+1,3,5,'ink');r(9,8,14,7,'navy');r(10,9,12,5,'blue');r(14,5,3,2,'green')}
    else if(name==='shelf'){r(0,0,16,31,'ink');r(1,1,14,28,'woodDark');for(const y of [3,11,19]){r(2,y+6,12,2,'wood');for(let x=2;x<13;x+=3){r(x,y,2,6,['teal','cream','red','blueLight'][Math.floor(x/3)%4]);p(x,y+1,'paper')}}r(2,29,3,3,'ink');r(11,29,3,3,'ink')}
    else if(name==='cabinet'){r(0,0,16,31,'ink');r(1,1,14,28,'gray');for(const y of [3,12,21]){r(2,y,12,7,'blue');r(6,y+2,4,1,'cream')}r(2,30,2,2,'ink');r(12,30,2,2,'ink')}
    else if(name==='server'){r(0,0,16,32,'ink');r(1,1,14,29,'navy');for(const y of [3,9,15,21]){r(2,y,12,5,'gray');r(3,y+1,7,1,'ink');r(3,y+3,7,1,'ink');p(12,y+1,'greenLight')}r(2,30,2,2,'gray');r(12,30,2,2,'gray')}
    else if(name==='whiteboard'||name==='projectboard'){r(0,0,32,24,'ink');r(1,1,30,21,name==='whiteboard'?'paper':'wood');r(2,22,28,2,'gray');r(3,24,2,8,'ink');r(27,24,2,8,'ink');if(name==='whiteboard'){r(5,4,8,3,'blue');r(20,4,7,3,'teal');r(8,7,1,7,'ink');r(8,13,16,1,'ink');r(20,14,7,3,'gold')}else{for(let x=4;x<29;x+=9){r(x,3,6,2,'cream');r(x,7,5,4,'gold');r(x,13,5,5,x===13?'red':'tealLight')}}}
    else if(name==='coffee'){r(1,2,14,21,'ink');r(2,3,12,17,'navy');r(3,4,10,4,'gray');r(5,9,6,2,'ink');r(4,12,8,7,'ink');r(6,14,4,4,'paper');r(10,15,2,2,'cream');r(3,20,10,2,'gray');p(12,10,'gold')}
    else if(name==='water'){r(4,0,8,8,'blue');r(5,1,6,5,'blueLight');r(3,8,10,16,'ink');r(4,9,8,14,'cream');r(5,13,6,5,'navy');p(6,12,'red');p(9,12,'blue');r(6,19,4,2,'gray')}
    else if(name==='printer'){r(3,0,10,5,'paper');r(1,4,14,10,'ink');r(2,5,12,7,'gray');r(4,9,8,3,'navy');r(5,11,6,5,'cream');p(12,6,'greenLight')}
    else if(name==='plant'){r(5,10,7,6,'ink');r(6,11,5,4,'cream');r(7,4,2,7,'greenDark');r(2,5,5,4,'greenDark');r(9,4,5,4,'green');r(5,1,5,5,'green');r(3,4,3,2,'greenLight');r(7,1,2,3,'greenLight');r(10,4,3,2,'greenLight')}
    else if(name==='cat'){r(3,6,10,7,'ink');r(4,7,8,5,'gold');r(3,4,7,5,'ink');r(4,4,5,5,'woodLight');p(3,3,'ink');p(9,3,'ink');p(5,6,'ink');p(8,6,'ink');r(11,5,3,3,'wood');r(13,3,2,4,'wood');r(4,12,3,1,'woodDark')}
    else if(name==='books'){r(0,1,7,6,'ink');r(1,1,2,5,'red');r(3,1,2,5,'teal');r(5,0,2,6,'blueLight')}
    else if(name==='papers'){r(0,0,7,8,'cream');r(1,0,6,6,'paper');r(2,1,4,1,'gray');r(2,3,3,1,'gray')}
    else if(name==='mug'){r(1,2,5,5,'ink');r(2,2,3,4,'cream');r(6,3,1,2,'cream')}
    else if(name==='rug'){r(0,0,32,32,'teal');r(2,2,28,28,'tealLight');r(3,3,26,26,'teal');for(let x=7;x<29;x+=8)for(let y=7;y<29;y+=8)r(x,y,2,2,'blue')}
    cache.set(name,s.canvas);return s.canvas;
  }
  const uniforms=[['navy','blue','hair'],['green','tealLight','hair'],['blue','blueLight','ink'],['ink','navy','hair'],['cream','paper','ink']];
  function character(index,direction='down',frame=0,action='idle'){
    const key=`person-${index}-${direction}-${frame}-${action}`;if(cache.has(key))return cache.get(key);
    const s=surface(16,24),{r,p}=s,[coat,highlight,hair]=uniforms[index%5],walk=action==='walk',step=walk?[0,1,0,-1][frame%4]:0,side=direction==='left'||direction==='right',up=direction==='up';
    r(4,12,8,8,'ink');r(5,13,6,6,coat);r(5,13,2,4,highlight);r(5,19,3,4,'ink');r(9,19,3,4,'ink');r(4+(step<0?1:0),22-(step>0?1:0),4,1,'gray');r(9-(step>0?1:0),22-(step<0?1:0),4,1,'gray');
    r(3,2,10,10,'ink');r(2,4,12,6,'ink');r(4,4,8,7,up?hair:'skin');r(4,2,8,4,hair);r(3,3,2,4,hair);r(10,3,3,4,hair);r(5,2,5,1,'woodDark');p(4,1,hair);p(8,1,hair);
    if(index===1){r(7,0,5,3,hair);r(8,0,3,1,'woodDark')}
    if(!up&&!side){p(5,8,'ink');p(10,8,'ink');r(6,10,3,1,'skinLight');if(index===0||index===2||index===4){r(4,7,3,1,'ink');r(9,7,3,1,'ink');p(7,8,'ink');p(8,8,'ink')}}
    if(side){const x=direction==='left'?3:9;r(x,6,4,5,'skin');p(x+(direction==='left'?0:3),8,'ink');r(direction==='left'?9:3,4,3,7,hair);r(6,13,4,6,coat)}
    r(side?6:3,14+(step>0?1:0),2,5,coat);r(side?6:3,18+(step>0?1:0),2,2,'skin');if(!side){r(11,14+(step<0?1:0),2,5,coat);r(11,18+(step<0?1:0),2,2,'skin')}
    if(!up&&index!==3){r(7,13,1,4,'cream');p(7,17,'gold')}
    if(action==='reading'||action==='working'){r(4,17,8,4,'ink');r(5,17,6,3,action==='reading'?'cream':'blue');p(5,18,'paper')}
    if(action==='coffee'){r(10,14,3,4,'paper');p(13,15,'cream')}
    cache.set(key,s.canvas);return s.canvas;
  }
  const rows=['idle_down','idle_up','idle_left','idle_right','walk_down','walk_up','walk_left','walk_right'];
  function skinSheet(index=0,height=24){const s=surface(64,height*8);rows.forEach((key,y)=>{const [action,direction]=key.split('_');for(let x=0;x<4;x++)s.c.drawImage(character(index,direction,x,action),x*16,y*height+height-24)});return s.canvas}
  root.PixelAssets={asset,character,skinSheet,rows,palette:P};
})(window);
