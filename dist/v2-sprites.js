/* V2 employee sprites and status icons cut from design/v2 by tools/build-v2-assets.py. */
(function(root){
  const meta=root.V2SpriteMeta,sheets=[],icons=new Image();
  if(!meta)return;
  for(let i=0;i<meta.variants;i++){const img=new Image();img.src=`v2/employee-${i}.png`;sheets.push(img)}
  icons.src='v2/icons.png';
  const ready=img=>img.complete&&img.naturalWidth>0;
  const aspect=meta.frameWidth/meta.frameHeight;
  // Draw employee i with feet at (cx, footY) and the given on-screen height.
  function draw(ctx,i,action,direction,frame,cx,footY,height){
    const img=sheets[i%sheets.length];if(!ready(img))return false;
    const row=meta.rows.indexOf((action==='walk'?'walk_':'idle_')+direction),col=action==='walk'?frame%4:0;
    const w=Math.round(height*aspect),smooth=ctx.imageSmoothingEnabled;
    ctx.imageSmoothingEnabled=true;ctx.imageSmoothingQuality='high';
    ctx.drawImage(img,col*meta.frameWidth,Math.max(row,0)*meta.frameHeight,meta.frameWidth,meta.frameHeight,Math.round(cx-w/2),Math.round(footY-height),w,height);
    ctx.imageSmoothingEnabled=smooth;return true;
  }
  // Status glyph centred at (cx, cy) on a small dark backing (not a speech bubble).
  function icon(ctx,name,cx,cy,size){
    const k=meta.icons.indexOf(name);if(k<0||!ready(icons))return;
    const [iw,ih]=meta.iconSize,pad=3,b=size+pad*2,smooth=ctx.imageSmoothingEnabled;
    ctx.fillStyle='rgba(16,26,38,.82)';ctx.beginPath();ctx.roundRect?ctx.roundRect(cx-b/2,cy-b/2,b,b,5):ctx.rect(cx-b/2,cy-b/2,b,b);ctx.fill();
    ctx.imageSmoothingEnabled=true;ctx.imageSmoothingQuality='high';
    ctx.drawImage(icons,k*iw,0,iw,ih,Math.round(cx-size/2),Math.round(cy-size/2),size,size);
    ctx.imageSmoothingEnabled=smooth;
  }
  root.V2Sprites={draw,icon,ready:i=>ready(sheets[i%sheets.length]),meta};
})(window);
