import test from 'node:test';
import assert from 'node:assert/strict';
import { CARD_W,CARD_H,bounds,canonicalHit,anchorFromGrab,zoomAt,worldPoint,dropOrder } from '../src/tabletop/geometry.js';
import { cleanPreferences,loadPreferences,savePreferences } from '../src/tabletop/preferences.js';
import { isManaColorChoice,manaChoiceHTML } from '../src/tabletop/mana-choice.js';
import { fixture,id,registry,choose,roundTrip } from './helpers.js';
import { Engine } from '../src/core/index.js';
const close=(a,b)=>assert.ok(Math.abs(a-b)<.001,`${a} != ${b}`);
test('upright and tapped footprints share one corner anchor',()=>{
 const u=bounds({x:400,y:300,tapped:false}),t=bounds({x:400,y:300,tapped:true});
 assert.equal(u.left,t.right);assert.equal(u.bottom,t.bottom);close(t.width,u.height);close(t.height,u.width);
});
for(const tapped of [false,true])test(`normalized grab point survives drag at arbitrary scale (tapped=${tapped})`,()=>{
 const grab={x:.23,y:.67},point={x:-70.5,y:214.1},a=anchorFromGrab(point,grab,tapped),b=bounds({...a,tapped});
 close(b.left+b.width*grab.x,point.x);close(b.top+b.height*grab.y,point.y);
});
test('wheel zoom keeps the world point under cursor fixed',()=>{
 const camera={x:-20,y:100,zoom:.8},viewport={left:100,top:30},pointer={x:700,y:400};
 const before=worldPoint(pointer,viewport,camera),after=worldPoint(pointer,viewport,zoomAt(camera,pointer,viewport,190));
 close(before.x,after.x);close(before.y,after.y);
});
test('hover picker uses canonical layers, independent of paint elevation',()=>{
 const cards=[{id:'lower',x:0,y:200,z:0,index:0},{id:'upper',x:40,y:170,z:1,index:1}];
 assert.equal(canonicalHit(cards,{x:5,y:150}).id,'lower');assert.equal(canonicalHit(cards,{x:60,y:150}).id,'upper');
});
test('pointer-based drop can sandwich a third card between two old cards',()=>{
 const old=[{id:'A',x:0,y:200,z:0,index:0},{id:'B',x:40,y:170,z:1,index:1},{id:'C',x:400,y:170,z:2,index:2}];
 const moved=[{...old[2],x:17,y:244}];
 assert.deepEqual(dropOrder(old,['C'],moved,{x:21,y:96}),['A','C','B']);
});
test('drop without cursor over overlapping objects goes underneath them',()=>{
 const old=[{id:'A',x:40,y:200,z:0,index:0},{id:'C',x:400,y:170,z:1,index:1}];
 assert.deepEqual(dropOrder(old,['C'],[{...old[1],x:0,y:170}],{x:2,y:20}),['C','A']);
});
test('mana palettes admit only color-option decisions and no verbose text',()=>{
 const p={kind:'draft',key:'color',options:[{value:'G',label:'Green'},{value:'U',label:'Blue'}]};
 assert.equal(isManaColorChoice(p),true);assert.match(manaChoiceHTML(p),/Add green mana/);assert.match(manaChoiceHTML(p),/<svg/);
 assert.doesNotMatch(manaChoiceHTML(p),/float-header|<h[1-6]|<input/);
 assert.equal(isManaColorChoice({...p,options:[{value:'YES'}]}),false);
});
test('new tabletop defaults do not hold priority and enable reserve access',()=>{
 const p=cleanPreferences();assert.equal(p.holdPriority,false);assert.equal(p.reserveAccess,true);assert.equal(p.sidebarWidth,100);
});
test('layout preferences validate geometry and survive round-trip storage',()=>{
 let text='';const storage={getItem:()=>text,setItem:(k,v)=>{text=v;}};
 const p=cleanPreferences({handHeight:230,sidebarWidth:115,dock:'graveyard',cameras:{battlefield:{zoom:.7,x:-100,y:50}},popups:{inspector:{x:60,y:70}}});
 assert.equal(savePreferences(p,storage),true);assert.deepEqual(loadPreferences(storage),p);
 const hostile=cleanPreferences({handHeight:1e12,cameras:{battlefield:{x:Infinity,y:0,zoom:0}},dock:'invalid'});assert.equal(hostile.handHeight,400);assert.equal(hostile.dock,null);assert.equal(hostile.cameras.battlefield,undefined);
});
test('blocked persistent storage degrades safely rather than throwing at module load',()=>{
 const blocked={getItem(){throw Error('blocked');},setItem(){throw Error('blocked');}};
 assert.equal(loadPreferences(blocked).version,2);assert.equal(savePreferences({},blocked),false);
});
test('already tapped multicolor lands are rejected before any color choice',()=>{
 const g=fixture({battlefield:[{name:'Razortide Bridge',tapped:true}]});
 const a=g.abilities(id(g,'Razortide Bridge')).find(a=>a.mana);
 const before=g.exportSession().stateChecksum,r=g.perform({type:'ACTIVATE_ABILITY',id:id(g,'Razortide Bridge'),abilityId:a.id});
 assert.equal(r.ok,false);assert.equal(g.state.pending,null);assert.equal(g.exportSession().stateChecksum,before);
});
test('cancel nested mana palette resumes casting payment, preserving previous mana',()=>{
 const g=fixture({battlefield:['The Wandering Minstrel','Mox Amber','Ancient Den'],hand:['Walking Atlas']});
 g.act({type:'CAST_SPELL',id:id(g,'Walking Atlas','hand')});
 g.act({type:'ACTIVATE_ABILITY',id:id(g,'Ancient Den'),abilityId:g.abilities(id(g,'Ancient Den'))[0].id});
 g.act({type:'ACTIVATE_ABILITY',id:id(g,'Mox Amber'),abilityId:'mana'});assert.equal(g.state.pending.key,'color');
 g.act({type:'CANCEL'});assert.equal(g.state.pending.kind,'payment');assert.equal(g.state.players[0].mana.W,1);assert.equal(g.object(id(g,'Mox Amber')).tapped,false);
 const h=Engine.importSession(registry,g.exportSession());assert.equal(h.state.pending.kind,'payment');
 g.act({type:'ADJUST_MANA',color:'C',delta:1});choose(g,'auto');g.act({type:'RESOLVE_ALL'});roundTrip(g);
});
test('drop placement travels through casting payment and resolution, with layer order',()=>{
 const g=fixture({battlefield:['Ancient Den'],hand:['Walking Atlas']},{mana:{C:2}}),card=id(g,'Walking Atlas','hand');
 const placement={x:234.5,y:431.25,order:[id(g,'Ancient Den'),card]};g.act({type:'DROP_CARD',id:card,zone:'battlefield',placement});choose(g,'auto');g.act({type:'RESOLVE_ALL'});
 assert.deepEqual(g.object(card).location,{x:234.5,y:431.25,anchor:'corner-v2'});assert.equal(g.object(card).flags.tableZ,1);roundTrip(g);
});
test('cancelling a dragged spell removes its uncommitted placement',()=>{
 const g=fixture({hand:['Walking Atlas']}),card=id(g,'Walking Atlas','hand');const before=g.exportSession().stateChecksum;
 g.act({type:'DROP_CARD',id:card,zone:'battlefield',placement:{x:12,y:120,order:[card]}});g.act({type:'CANCEL'});assert.equal(g.exportSession().stateChecksum,before);
});
