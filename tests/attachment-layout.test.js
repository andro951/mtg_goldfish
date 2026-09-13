import test from 'node:test';
import assert from 'node:assert/strict';
import {fixture,id,ability,drain,roundTrip,registry} from './helpers.js';
import {ref,Engine} from '../src/core/index.js';
import {permanentLinks,attachmentLayout,attachmentDrag,attachmentBasis,followingParents,followsAttachment} from '../src/tabletop/attachments.js';
import {cardLayout,bounds,canonicalHit} from '../src/tabletop/geometry.js';
import {relationshipGeometry} from '../src/tabletop/permanent-links.js';
const at=(x,y)=>({location:{x,y,anchor:'corner-v2'}});
function table(extra=[]){
 const g=fixture({battlefield:[{name:'Metalworker',props:at(350,330)},'Lightning Greaves','Flayer Husk','The Reality Chip',...extra]});
 for(const name of ['Lightning Greaves','Flayer Husk','The Reality Chip',...(id(g,'Smoke Blessing')?['Smoke Blessing']:[])])g.object(id(g,name)).attachedTo=ref(g.object(id(g,'Metalworker')));
 return new Engine(registry,g.state);
}
const layout=g=>attachmentLayout(g,cardLayout(g.objects('battlefield')));
const lookup=(cards,id)=>cards.find(c=>c.id===id);

test('attachments: confirmed equipment and Aura links never include stack targets or ordinary enchantments',()=>{
 const g=table(['Retreat to Coralhelm',{name:'Smoke Blessing',props:{attachedTo:{id:'f1',oid:1}}}]);
 assert.equal(permanentLinks(g).length,4);assert.equal(permanentLinks(g).filter(l=>l.kind==='equipment').length,3);
 assert.equal(permanentLinks(g).filter(l=>l.kind==='aura').length,1);
 assert.ok(!permanentLinks(g).some(l=>l.source===id(g,'Retreat to Coralhelm')));
});
test('attachments: each following card exposes a different top-left strip below its host',()=>{
 const g=table(),cards=layout(g),host=lookup(cards,id(g,'Metalworker')),r=bounds(host);
 const children=cards.filter(c=>c.id!==host.id);
 assert.equal(new Set(children.map(c=>c.x+':'+c.y)).size,3);
 for(const c of children){const b=bounds(c);assert.ok(b.left<r.left&&b.top<r.top);assert.ok(c.z<host.z);assert.ok(b.right>r.left&&b.bottom>r.top);}
 assert.equal(host.x,350);assert.equal(host.y,330);
 assert.equal(canonicalHit(cards,{x:r.left+50,y:r.top+40}).id,host.id);
 for(const c of children){const b=bounds(c);assert.equal(canonicalHit(cards,{x:b.left+10,y:b.top+10}).id,c.id);}
});
test('attachments: fan is pure, stable, and translates with the host without cumulative drift',()=>{
 const g=table(),before=JSON.stringify(g.state),input=cardLayout(g.objects('battlefield')),snapshot=JSON.stringify(input),a=attachmentLayout(g,input),b=attachmentLayout(g,a);
 assert.equal(JSON.stringify(input),snapshot);assert.equal(JSON.stringify(g.state),before);assert.deepEqual(a,b);
 g.object(id(g,'Metalworker')).location.x+=103;g.object(id(g,'Metalworker')).location.y-=31;
 const c=layout(g);for(const old of a){const next=lookup(c,old.id);assert.equal(next.x-old.x,103);assert.equal(next.y-old.y,-31);}
});
test('attachments: tapped host uses its actual top edge without tapping its attachments',()=>{
 const g=table();g.object(id(g,'Metalworker')).tapped=true;
 const cards=layout(g),host=bounds(lookup(cards,id(g,'Metalworker')));
 for(const c of cards.filter(c=>c.id!==id(g,'Metalworker'))){assert.equal(c.tapped,false);assert.ok(bounds(c).top<host.top);}
 g.object(id(g,'Flayer Husk')).tapped=true;assert.ok(bounds(lookup(layout(g),id(g,'Flayer Husk'))).top<host.top);
});
test('attachments: manually positioned source keeps a link and becomes an independent drag root',()=>{
 const g=table();const c=g.object(id(g,'Lightning Greaves'));c.flags.followAttached=false;c.location={x:720,y:230,anchor:'corner-v2'};
 const cards=layout(g);assert.equal(permanentLinks(g).length,3);assert.equal(lookup(cards,c.id).x,720);
 const drag=attachmentDrag(g,cards,[id(g,'Metalworker')],id(g,'Metalworker'));
 assert.equal(drag.ids.length,3);assert.ok(!drag.ids.includes(c.id));
});
test('attachments: selecting host and following child moves each once and does not disable the child',()=>{
 const g=table(),host=id(g,'Metalworker'),child=id(g,'Lightning Greaves'),cards=layout(g);
 const drag=attachmentDrag(g,cards,[host,child],host);assert.equal(drag.ids.length,4);assert.deepEqual(drag.manualIds,[host]);
 const own=attachmentDrag(g,cards,[child],child);assert.deepEqual(own.ids,[child]);assert.deepEqual(own.manualIds,[child]);
 const grabbedChild=attachmentDrag(g,cards,[host,child],child);assert.ok(grabbedChild.manualIds.includes(child));
});
test('attachments: drag turns following off atomically; undo, redo and import preserve the setting',()=>{
 const g=table(),child=id(g,'Lightning Greaves'),old=ref(g.object(id(g,'Metalworker')));
 g.act({type:'LAYOUT',manualIds:[child],updates:[{id:child,x:630,y:220}],anchor:'corner-v2'});
 assert.equal(followsAttachment(g.object(child)),false);assert.deepEqual(g.object(child).attachedTo,old);
 assert.equal(lookup(layout(g),child).x,630);g.act({type:'UNDO'});assert.equal(followsAttachment(g.object(child)),true);
 g.act({type:'REDO'});assert.equal(followsAttachment(g.object(child)),false);
 const copy=Engine.importSession(registry,g.exportSession());assert.equal(followsAttachment(copy.object(child)),false);roundTrip(g);
});
test('attachments: toggle restores following without reequipping or touching tapped state',()=>{
 const g=table(),child=id(g,'Lightning Greaves');g.act({type:'SET_ATTACHMENT_FOLLOW',id:child,enabled:false,position:{x:630,y:220}});
 const old=JSON.stringify(g.object(child).attachedTo);g.act({type:'SET_ATTACHMENT_FOLLOW',id:child,enabled:true,position:{x:630,y:220}});
 assert.equal(lookup(layout(g),child).x,326);assert.equal(JSON.stringify(g.object(child).attachedTo),old);assert.equal(g.object(child).tapped,false);
 g.act({type:'UNDO'});assert.equal(lookup(layout(g),child).x,630);g.act({type:'REDO'});roundTrip(g);
});
test('attachments: invalid toggle and drag metadata roll back the whole action',()=>{
 const g=table();for(const a of [
  {type:'SET_ATTACHMENT_FOLLOW',id:id(g,'Metalworker'),enabled:true},
  {type:'SET_ATTACHMENT_FOLLOW',id:id(g,'Lightning Greaves'),enabled:'true'},
  {type:'SET_ATTACHMENT_FOLLOW',id:id(g,'Lightning Greaves'),enabled:false,position:{x:Infinity,y:0}},
  {type:'LAYOUT',manualIds:[id(g,'Flayer Husk')],updates:[{id:id(g,'Lightning Greaves'),x:5,y:6}]},
 ]){const before=JSON.stringify(g.exportSession());assert.equal(g.perform(a).ok,false);assert.equal(JSON.stringify(g.exportSession()),before);}
});
test('attachments: Arrange-style layout does not disable following',()=>{
 const g=table(),child=id(g,'Lightning Greaves');g.act({type:'LAYOUT',updates:[{id:child,x:700,y:400}],anchor:'corner-v2'});
 assert.equal(followsAttachment(g.object(child)),true);assert.equal(lookup(layout(g),child).x,326);roundTrip(g);
});
test('attachments: unrelated rerenders retain detached pose only while its saved layout basis is unchanged',()=>{
 const g=table(),child=g.object(id(g,'Lightning Greaves')),basis=attachmentBasis(child);
 child.attachedTo=null;assert.equal(attachmentBasis(child),basis);
 child.location={x:200,y:300,anchor:'corner-v2'};assert.notEqual(attachmentBasis(child),basis);
 const next=attachmentBasis(child);child.flags.followAttached=false;assert.notEqual(attachmentBasis(child),next);
});
test('attachments: invalidated host identity removes the line and zone changes reset per-card following',()=>{
 const g=table(),child=id(g,'Lightning Greaves'),host=id(g,'Metalworker');
 g.act({type:'SET_ATTACHMENT_FOLLOW',id:child,enabled:false});g.act({type:'DEBUG_MOVE',id:host,zone:'exile'});
 assert.equal(permanentLinks(g).length,0);assert.equal(g.object(child).attachedTo,null);
 g.act({type:'DEBUG_MOVE',id:host,zone:'battlefield'});assert.equal(permanentLinks(g).length,0);
 g.act({type:'DEBUG_MOVE',id:child,zone:'graveyard'});g.act({type:'DEBUG_MOVE',id:child,zone:'battlefield'});
 assert.equal(followsAttachment(g.object(child)),true);roundTrip(g);
});
test('attachments: nested equipment and Auras form a finite host-first layout and drag together',()=>{
 const g=table(),a=id(g,'Lightning Greaves'),b=id(g,'Flayer Husk');g.object(b).attachedTo=ref(g.object(a));
 const cards=layout(g),h=lookup(cards,a),c=lookup(cards,b);assert.ok(c.x<h.x&&c.z<h.z);
 assert.deepEqual(new Set(attachmentDrag(g,cards,[a],a).ids),new Set([a,b]));
});
test('attachments: defensive cycle handling never hangs the table',()=>{
 const g=table(),a=g.object(id(g,'Lightning Greaves')),b=g.object(id(g,'Flayer Husk'));a.attachedTo=ref(b);b.attachedTo=ref(a);
 const parents=followingParents(g);assert.ok(!parents.has(a.id)&&!parents.has(b.id));assert.equal(layout(g).length,4);
});
test('attachments: stale references and soulbond pairs are never treated as following equipment',()=>{
 const g=table(),a=g.object(id(g,'Metalworker')),b=g.object(id(g,'The Reality Chip'));
 a.pairedWith=ref(b);b.pairedWith=ref(a);b.attachedTo=null;
 assert.equal(permanentLinks(g).filter(l=>l.kind==='soulbond').length,1);assert.ok(!followingParents(g).has(b.id));
 b.oid++;assert.equal(permanentLinks(g).filter(l=>l.kind==='soulbond').length,0);
});
test('attachments: overlap line geometry is finite and points between visible top strips',()=>{
 for(const kind of ['equipment','aura','soulbond'])for(const offset of [0,24,100,500]){
  const a={left:0,top:0,width:110,height:154},b={left:offset,top:offset,width:110,height:154};
  const geometry=relationshipGeometry(a,b,kind);assert.ok(!/NaN|Infinity/.test(geometry.d));
  if(offset===24&&kind!=='soulbond'){assert.ok(geometry.start.y<24);assert.ok(geometry.end.y<50);}
 }
});

test('attachments: edge-safe fan preserves visible cards without moving the host',()=>{
 const g=table();g.object(id(g,'Metalworker')).location={x:10,y:164,anchor:'corner-v2'};
 const v={left:0,top:0,right:800,bottom:500},cards=attachmentLayout(g,cardLayout(g.objects('battlefield')),followingParents(g),v);
 assert.equal(lookup(cards,id(g,'Metalworker')).x,10);
 for(const c of cards){const r=bounds(c);assert.ok(r.left>=0&&r.top>=0&&r.right<=800&&r.bottom<=500);}
 assert.equal(new Set(cards.map(c=>c.x+':'+c.y)).size,4);
});
