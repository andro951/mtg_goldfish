import test from 'node:test';
import assert from 'node:assert/strict';
import { visiblePlacement } from '../src/tabletop/placement.js';
import { screenBounds, overlaps } from '../src/tabletop/geometry.js';
const viewport={left:0,top:0,width:1150,height:640};
function place(existing=[],camera={x:0,y:0,zoom:1},land=false,tapped=false,view=viewport){
 const c={id:'c'+existing.length,tapped,...visiblePlacement({tapped},existing,view,camera,{land})};
 const r=screenBounds(c,{...view,left:0,top:0},camera);
 assert.ok(r.left>=-.001&&r.top>=-.001,JSON.stringify(r));
 assert.ok(r.right<=view.width+.001&&r.bottom<=view.height+.001,JSON.stringify(r));
 return c;
}
for(const zoom of [.18,.5,1,1.6,3])for(const land of [false,true])test(`visible placement: ${land?'land':'nonland'} at zoom ${zoom} after pan`,()=>{
 const cam={x:-2687,y:1375,zoom},c=place([],cam,land),r=screenBounds(c,viewport,cam);
 if(land)assert.ok(r.bottom>viewport.height*2/3);else assert.ok(r.top<viewport.height/3);
});
test('visible placement: crowded batches stay visible, stagger and arrive above old layers',()=>{
 const cards=[],cam={x:847,y:-1943,zoom:1};
 for(let i=0;i<80;i++){
  const old=JSON.stringify(cards),c=place(cards,cam,i%2===0,i%3===0);
  assert.equal(JSON.stringify(cards),old,'existing cards must not move');
  assert.ok(!cards.some(o=>Math.abs(o.x-c.x)<.01&&Math.abs(o.y-c.y)<.01),'no exact stack');
  assert.ok(cards.every(o=>c.z>o.z));cards.push(c);
 }
});
test('visible placement: free space is preferred without moving manually placed cards',()=>{
 const cam={x:0,y:0,zoom:1},a=place([],cam),b=place([a],cam);
 assert.ok(!overlaps(screenBounds(a,viewport,cam),screenBounds(b,viewport,cam)));
});
test('visible placement: tapped artifacts that are lands use the lower lane',()=>{
 const cam={x:700,y:-450,zoom:1},c=place([],cam,true,true),r=screenBounds(c,viewport,cam);
 assert.ok(r.top>viewport.height*2/3);
});
test('visible placement: very small lane borrows room but not offscreen space',()=>{
 place([],{x:100,y:-800,zoom:1},true,false,{width:175,height:210});
});
test('visible placement: oversized card keeps its name and maximum available area visible',()=>{
 const cam={x:1700,y:-980,zoom:3},view={left:0,top:0,width:140,height:150};
 const c={tapped:false,...visiblePlacement({},[],view,cam,{land:true})};
 const r=screenBounds(c,view,cam);assert.ok(Math.abs(r.left)<.001);assert.ok(Math.abs(r.top)<.001);
});
test('visible placement: popup obstacles are avoided when a free spot exists',()=>{
 const cam={x:0,y:0,zoom:1},obstacle={left:0,top:0,right:350,bottom:300};
 const c={...visiblePlacement({},[],viewport,cam,{obstacles:[obstacle]})};
 assert.ok(!overlaps(screenBounds(c,viewport,cam),obstacle));
});
