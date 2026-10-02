(function(root){
  class OfficeEngine{
    constructor(layout){this.layout=layout;this.reservations=new Map();this.objects=new Map(layout.objects.map(o=>[o.id,o]));this.interactions=layout.objects.filter(o=>o.slots)}
    walkable(x,y){const l=this.layout;return Number.isInteger(x)&&Number.isInteger(y)&&x>=1&&x<l.width-1&&y>=3&&y<l.height-1&&!l.objects.some(o=>o.collision&&x>=o.x&&x<o.x+o.width&&y>=o.y&&y<o.y+o.height)}
    route(a,b){if(!this.walkable(a.x,a.y)||!this.walkable(b.x,b.y))return null;const key=p=>`${p.x},${p.y}`,queue=[a],prev=new Map([[key(a),null]]);let head=0;while(head<queue.length){const p=queue[head++];if(p.x===b.x&&p.y===b.y){const result=[];let q=p;while(prev.get(key(q))!==null){result.unshift(q);q=prev.get(key(q))}return result}for(const [dx,dy]of [[1,0],[-1,0],[0,1],[0,-1]]){const q={x:p.x+dx,y:p.y+dy};if(this.walkable(q.x,q.y)&&!prev.has(key(q))){prev.set(key(q),p);queue.push(q)}}}return null}
    release(agent){this.reservations.delete(agent)}
    reserve(agent,id,start){const target=this.objects.get(id);if(!target?.slots)return null;const occupied=[...this.reservations].filter(([a])=>a!==agent).map(([,r])=>r);if(occupied.filter(r=>r.objectId===id).length>=target.capacity)return null;
      for(const slot of target.slots){if(occupied.some(r=>r.x===slot.x&&r.y===slot.y))continue;const route=this.route(start,slot);if(route!==null){const reservation={objectId:id,...slot};this.reservations.set(agent,reservation);return {object:target,slot,route}}}return null}
    choose(agent,ids,start){for(const id of ids){const result=this.reserve(agent,id,start);if(result)return result}return null}
    occupancy(id){return [...this.reservations.values()].filter(r=>r.objectId===id).length}
  }
  if(typeof module!=='undefined'&&module.exports)module.exports=OfficeEngine;else root.OfficeEngine=OfficeEngine;
})(typeof window!=='undefined'?window:globalThis);
