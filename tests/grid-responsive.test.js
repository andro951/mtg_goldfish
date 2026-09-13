import test from 'node:test';
import assert from 'node:assert/strict';
import {gridLayout,bestGridShape} from '../src/tabletop/grid.js';
import {fitCamera,CARD_W,CARD_H} from '../src/tabletop/geometry.js';
import {cleanPreferences} from '../src/tabletop/preferences.js';
const objects=n=>Array.from({length:n},(_,i)=>({id:'c'+i,oid:1,zone:'graveyard',flags:{},location:null,tapped:false}));
for(const [w,h] of [[250,676],[470,676],[780,676],[320,420],[840,470],[700,700]])test(`responsive grid fits all 27 cards and uses both axes at ${w}x${h}`,()=>{
 const g=gridLayout(objects(27),[],w,h),c=fitCamera(g.cards,w,h,8);
 const width=(Math.max(...g.cards.map(o=>o.x+CARD_W))-8)*c.zoom;
 const height=(Math.max(...g.cards.map(o=>o.y))-8)*c.zoom;
 assert.ok(width/w>.75,`width occupancy ${width/w}`);assert.ok(height/h>.75,`height occupancy ${height/h}`);
 assert.ok(width<=w-15&&height<=h-15);assert.equal(g.slots.length,27);
});
test('widening side panel chooses more columns and larger cards',()=>{
 const sizes=[250,470,780].map(w=>bestGridShape(27,w,676));
 assert.ok(sizes[0].columns<sizes[1].columns&&sizes[1].columns<sizes[2].columns);
 assert.ok(sizes[0].zoom<sizes[2].zoom);
});
test('detached holes remain in the grid extent and keep stable slot identities',()=>{
 const list=objects(27),first=gridLayout(list,[],470,676);
 for(let i=0;i<20;i++)list[i].location={x:710+i,y:421,anchor:'corner-v2'};
 const next=gridLayout(list,first.slots,780,450);
 assert.equal(next.slots.length,27);assert.deepEqual(next.slots.slice(0,20),Array(20).fill(null));
 assert.equal(next.shape.columns,bestGridShape(27,780,450).columns);
 for(let i=0;i<20;i++)assert.deepEqual([next.cards[i].x,next.cards[i].y,next.cards[i].gridSlot],[710+i,421,null]);
});
test('a detached tail or a new arrival does not change the locked column count',()=>{
 const list=objects(27),first=gridLayout(list,[],780,676);list[26].location={x:800,y:600,anchor:'corner-v2'};
 const second=gridLayout(list,first.slots,780,676,first.shape.columns);
 for(let i=0;i<26;i++)assert.deepEqual([second.cards[i].x,second.cards[i].y],[first.cards[i].x,first.cards[i].y]);
 list.push({...list[0],id:'new',location:null});const third=gridLayout(list,second.slots,780,676,first.shape.columns);
 assert.equal(third.cards.at(-1).gridSlot,26);
});
test('saved responsive geometry retains a wide dock and the exact manual camera',()=>{
 const camera={x:105,y:-47,zoom:.43},view={width:1100,height:675,columns:9};
 const p=cleanPreferences({dockWidth:1100,cameras:{graveyard:camera},gridViews:{graveyard:view},deckText:''});
 assert.deepEqual(p.gridViews.graveyard,view);assert.deepEqual(p.cameras.graveyard,camera);assert.equal(p.dockWidth,1100);assert.equal(p.deckText,'');
});
test('invalid imported grid metadata is ignored without affecting legacy camera',()=>{
 const p=cleanPreferences({gridViews:{graveyard:{width:500,height:600,columns:NaN},exile:{width:Infinity,height:400,columns:3}}});
 assert.deepEqual(p.gridViews,{});assert.deepEqual(gridLayout([]).cards,[]);
});
