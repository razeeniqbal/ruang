(function(root){
  const SIZE=20,COLS=50,ROWS=34;
  const obstacles=[
    [100,185,190,115],[710,185,190,115],
    [100,440,190,112],[710,440,190,112],
    [395,170,210,115],[395,465,210,105],
    [40,125,55,72],[905,125,55,72],
    [35,530,60,80],[910,530,60,80]
  ];
  const cell=p=>({x:Math.floor(p.x/SIZE),y:Math.floor(p.y/SIZE)});
  function walkable(x,y){const px=x*SIZE+10,py=y*SIZE+10;return x>=2&&x<48&&y>=7&&y<32&&!obstacles.some(([ox,oy,w,h])=>px>ox-9&&px<ox+w+9&&py>oy-7&&py<oy+h+7)}
  function route(start,end){const a=cell(start),b=cell(end);if(!walkable(b.x,b.y)||!walkable(a.x,a.y))return null;const key=(x,y)=>y*COLS+x;const queue=[a],seen=new Map([[key(a.x,a.y),null]]);let head=0;
    while(head<queue.length){const p=queue[head++];if(p.x===b.x&&p.y===b.y){const result=[];let k=key(p.x,p.y);while(seen.get(k)!==null){result.unshift({x:k%COLS*SIZE+10,y:Math.floor(k/COLS)*SIZE+10});k=seen.get(k)}return result}
      for(const [dx,dy] of [[1,0],[-1,0],[0,1],[0,-1]]){const x=p.x+dx,y=p.y+dy,k=key(x,y);if(walkable(x,y)&&!seen.has(k)){seen.set(k,key(p.x,p.y));queue.push({x,y})}}
    }return null;
  }
  const api={SIZE,COLS,ROWS,obstacles,walkable,route};if(typeof module!=='undefined'&&module.exports)module.exports=api;else root.RoomNav=api;
})(typeof window!=='undefined'?window:globalThis);
