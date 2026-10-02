const test=require('node:test'),assert=require('node:assert/strict');
const nav=require('../dist/navigation.js');
test('route avoids furniture and reaches a destination across the room',()=>{const p=nav.route({x:190,y:330},{x:810,y:590});assert.ok(p?.length);assert.deepEqual(p.at(-1),{x:810,y:590});for(const step of p)assert.ok(nav.walkable(Math.floor(step.x/20),Math.floor(step.y/20)));for(let i=1;i<p.length;i++)assert.equal(Math.abs(p[i].x-p[i-1].x)+Math.abs(p[i].y-p[i-1].y),20)});
test('rejects furniture and outside-room destinations',()=>{assert.equal(nav.route({x:490,y:390},{x:150,y:220}),null);assert.equal(nav.route({x:490,y:390},{x:-20,y:390}),null)});
test('all teammate home locations are reachable',()=>{for(const end of [{x:490,y:610},{x:190,y:330},{x:810,y:330},{x:190,y:590},{x:810,y:590}])assert.ok(nav.route({x:490,y:390},end))});
