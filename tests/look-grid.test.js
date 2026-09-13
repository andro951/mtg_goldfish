import test from 'node:test';
import assert from 'node:assert/strict';
import { fixture, id, choose, registry } from './helpers.js';
import { Engine } from '../src/core/index.js';
import { responsiveGrid, bestGridShape, gridMembership, gridLayout } from '../src/tabletop/grid.js';
import { workspaceSnapshot, workspaceTransition, fitWorkspace } from '../src/tabletop/look-window.js';
import { workspacePopup } from '../src/tabletop/views.js';
import { defaultPreferences, cleanPreferences } from '../src/tabletop/preferences.js';
import { CARD_W, CARD_H, screenBounds } from '../src/tabletop/geometry.js';
const objects=(n,zone='graveyard')=>Array.from({length:n},(_,i)=>({id:`card${i}`,oid:1,zone,flags:{},location:null}));

for(const zone of ['graveyard','exile','outside'])test(`automatic grids: ${zone} grows responsively from empty without pressing Grid`,()=>{
 let previous=null,slots=[];
 for(let n=0;n<=70;n++){
  const rows=objects(n,zone),r=responsiveGrid(rows,slots,470,600,previous);
  assert.ok(r.changed);assert.equal(r.shape.columns,bestGridShape(n,470,600).columns);
  assert.equal(r.cards.length,n);assert.ok(r.cards.every(c=>c.gridSlot!==null));
  if(n>10)assert.ok(r.shape.columns>1,'never retain the empty/one-card column count');
  previous=r.view;slots=r.slots;
 }
});
test('automatic grids: old locked one-column metadata is refitted once',()=>{
 const rows=objects(30),old={width:290,height:600,columns:1};
 const r=responsiveGrid(rows,[],290,600,old);assert.ok(r.changed);assert.ok(r.shape.columns>1);
 const again=responsiveGrid(rows,r.slots,290,600,r.view);assert.ok(!again.changed);assert.deepEqual(again.cards,r.cards);
});
test('automatic grids: inspection and completed manual drags preserve existing grid shape',()=>{
 const rows=objects(27),first=responsiveGrid(rows,[],470,600);
 const unchanged=responsiveGrid(rows,first.slots,470,600,first.view);assert.ok(!unchanged.changed);
 rows.at(-1).location={x:820,y:340,anchor:'corner-v2'};
 const dragged=responsiveGrid(rows,first.slots,470,600,first.view);assert.ok(!dragged.changed);
 assert.deepEqual([dragged.cards.at(-1).x,dragged.cards.at(-1).y,dragged.cards.at(-1).gridSlot],[820,340,null]);
 assert.deepEqual(dragged.cards.slice(0,-1),first.cards.slice(0,-1));
});
test('automatic grids: same-size replacements and new incarnations are membership changes',()=>{
 const rows=objects(20),first=responsiveGrid(rows,[],470,600);rows[2].oid++;
 const next=responsiveGrid(rows,first.slots,470,600,first.view);assert.ok(next.changed);assert.notEqual(next.view.members,first.view.members);
 assert.equal(next.cards[2].gridSlot,2);assert.equal(gridMembership([...rows].reverse()),next.view.members);
});
test('automatic grids: growth preserves a manual card and fills its released cell',()=>{
 const rows=objects(4),first=responsiveGrid(rows,[],400,500);rows[1].location={x:10,y:400,anchor:'corner-v2'};
 const detached=responsiveGrid(rows,first.slots,400,500,first.view);
 rows.push({...rows[0],id:'new'});const next=responsiveGrid(rows,detached.slots,400,500,detached.view);
 assert.ok(next.changed);assert.equal(next.cards.at(-1).gridSlot,1);assert.equal(next.cards[1].gridSlot,null);
 assert.equal(next.cards[1].y,400);
});
test('automatic grids: shrinking a zone and resizing it recompute columns',()=>{
 const rows=objects(50),first=responsiveGrid(rows,[],470,600);
 const small=responsiveGrid(rows.slice(0,6),first.slots,470,600,first.view);assert.ok(small.changed);assert.equal(small.shape.columns,bestGridShape(6,470,600).columns);
 const wide=responsiveGrid(rows,first.slots,900,350,first.view);assert.ok(wide.changed);assert.equal(wide.shape.columns,bestGridShape(50,900,350).columns);
});

const seeker=()=>fixture({battlefield:['Sarinth Steelseeker'],graveyard:['Ancient Den','Seat of the Synod'],libraryActive:['Tree of Tales','Walking Atlas']});
const look=g=>{g.act({type:'DEBUG_MOVE',id:id(g,'Ancient Den'),zone:'battlefield'});g.act({type:'RESOLVE_TOP'});};
test('Look: a real Steelseeker resolution is a read-only preview, not a zone change',()=>{
 const g=seeker();look(g);const before=JSON.stringify(g.exportSession()),s=workspaceSnapshot(g);
 assert.equal(s.source,'Sarinth Steelseeker');assert.deepEqual(s.ids,[id(g,'Tree of Tales')]);
 assert.equal(g.object(s.ids[0]).zone,'libraryActive');assert.ok(workspaceTransition(null,s).open);
 assert.equal(JSON.stringify(g.exportSession()),before);assert.ok(!workspaceTransition(s,workspaceSnapshot(g)).open);
});
test('Look: closing stays closed for the same effect, and the next same-card look reopens',()=>{
 const g=seeker();look(g);const first=workspaceSnapshot(g);assert.ok(!workspaceTransition(first,workspaceSnapshot(g)).open);
 choose(g,'leave');const empty=workspaceSnapshot(g);assert.ok(workspaceTransition(first,empty).close);
 g.act({type:'DEBUG_MOVE',id:id(g,'Seat of the Synod'),zone:'battlefield'});g.act({type:'RESOLVE_TOP'});
 const next=workspaceSnapshot(g);assert.deepEqual(next.ids,first.ids);assert.notEqual(next.episode,first.episode);
 assert.ok(workspaceTransition(first,next).open);
});
test('Look: scry/surveil remaining-order view excludes cards already chosen away',()=>{
 const g=seeker();look(g);const ids=g.state.zones.libraryActive;
 g.state.lookWorkspace={ids:ids.slice(),label:'Surveil',visibility:'private'};
 g.state.pending={kind:'effectChoice',ordered:true,candidates:[ids[1]],min:1,max:1};
 assert.deepEqual(workspaceSnapshot(g,[ids[1]]).ids,[ids[1]]);
 assert.deepEqual(workspaceSnapshot(g,['invalid']).ids,[ids[1]]);
});
test('Look: imported pending effects reopen with the same valid cards',()=>{
 const g=seeker();look(g);const copy=Engine.importSession(registry,g.exportSession());
 const s=workspaceSnapshot(copy);assert.deepEqual(s,workspaceSnapshot(g));assert.ok(workspaceTransition(null,s).open);
 choose(copy,'hand');assert.ok(id(copy,'Tree of Tales','hand'));assert.deepEqual(workspaceSnapshot(copy).ids,[]);assert.ok(copy.verifyReplay().ok);
});
for(const n of [1,3,20])test(`Look: fitting ${n} previews fills the floating surface and stays inside it`,()=>{
 const cards=gridLayout(objects(n),[],340,310).cards,cam=fitWorkspace(cards,340,310),v={left:0,top:0};
 for(const card of cards){const r=screenBounds(card,v,cam);assert.ok(r.left>=0&&r.top>=0&&r.right<=340.01&&r.bottom<=310.01);}
 if(n===1){assert.ok(cam.zoom>1.5);assert.ok(CARD_H*cam.zoom>270);}
});
test('Look: popup toggle, window geometry and independent camera round-trip in preferences',()=>{
 const p={...cleanPreferences(),dock:'graveyard',workspaceOpen:true,popups:{workspace:{x:300,y:130}},popupSizes:{workspace:{width:450,height:380}},cameras:{workspace:{x:7,y:13,zoom:1.4}},gridViews:{workspace:{width:448,height:312,columns:3,members:'a:1|b:2'}}};
 assert.deepEqual(cleanPreferences(p),p);
 const legacy=cleanPreferences({dock:'workspace'});assert.equal(legacy.dock,null);assert.equal(legacy.workspaceOpen,true);
});
test('Look: popup markup is a separate movable/resizable surface and never a side dock',()=>{
 const g=seeker();look(g);const snapshot=workspaceSnapshot(g),prefs=defaultPreferences();
 const ui={choice:[],selected:new Set(),lastWorkspace:snapshot,layouts:{workspace:gridLayout(snapshot.ids.map(id=>g.object(id))).cards}};
 assert.equal(workspacePopup({g,ui,prefs}),'');prefs.workspaceOpen=true;
 const html=workspacePopup({g,ui,prefs});
 for(const marker of ['data-floating="workspace"','data-surface="workspace"','data-drag-panel="workspace"','data-resize-popup="workspace"','data-action="close-workspace"','data-action="zoom-view"','Tree of Tales'])assert.ok(html.includes(marker),marker);
 assert.ok(!html.includes('zone-dock'));assert.ok(!html.includes('data-action="cast"'));
});
