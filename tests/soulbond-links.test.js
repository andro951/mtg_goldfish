import test from 'node:test';
import assert from 'node:assert/strict';
import {fixture,id,choose,drain,roundTrip,registry} from './helpers.js';
import {Engine,ref} from '../src/core/index.js';
import {permanentLinks,followingParents} from '../src/tabletop/attachments.js';
// The requested catalog contains no native Soulbond cards. Grant the generic
// keyword in fixtures to test the rules plumbing without expanding that catalog.
const keyword={name:'Metalworker',props:{modifications:[{keywords:['Soulbond']}]}};
const base=()=>fixture({battlefield:[keyword,'Krark-Clan Ironworks'],hand:['Walking Atlas','Sakura-Tribe Scout']});
function enter(g,name='Walking Atlas'){g.act({type:'DEBUG_MOVE',id:id(g,name),zone:'battlefield'});}
const resolve=g=>g.act({type:'RESOLVE_TOP'});
function bond(g){enter(g);resolve(g);choose(g,[id(g,'Walking Atlas')]);}

test('soulbond: actual enter trigger asks at resolution and creates one reciprocal non-targeting link',()=>{
 const g=base();enter(g);assert.equal(g.state.stack.length,1);assert.deepEqual(g.state.stack[0].targets,[]);
 assert.equal(permanentLinks(g).length,0);resolve(g);assert.equal(g.state.pending.key,'soulbondPartner');assert.equal(g.state.pending.min,0);
 choose(g,[id(g,'Walking Atlas')]);assert.equal(permanentLinks(g).filter(l=>l.kind==='soulbond').length,1);
 assert.equal(followingParents(g).size,0);assert.equal(g.pairedPartner(id(g,'Metalworker')).id,id(g,'Walking Atlas'));roundTrip(g);
});
test('soulbond: declining pairing leaves both creatures available for a later creature entry',()=>{
 const g=base();enter(g);resolve(g);g.act({type:'CANCEL'});assert.equal(permanentLinks(g).length,0);
 enter(g,'Sakura-Tribe Scout');resolve(g);choose(g,[id(g,'Sakura-Tribe Scout')]);assert.equal(g.pairedPartner(id(g,'Metalworker')).id,id(g,'Sakura-Tribe Scout'));roundTrip(g);
});
test('soulbond: a paired creature is not offered again and cannot steal a partner',()=>{
 const g=base();bond(g);enter(g,'Sakura-Tribe Scout');assert.equal(g.state.stack.length,0);
 assert.equal(g.pairCreatures(ref(g.object(id(g,'Metalworker'))),ref(g.object(id(g,'Sakura-Tribe Scout'))),0),false);roundTrip(g);
});
test('soulbond: blink invalidates both ends and creates a new optional opportunity, not a stale link',()=>{
 const g=base();bond(g);const oid=g.object(id(g,'Walking Atlas')).oid;
 g.act({type:'DEBUG_MOVE',id:id(g,'Walking Atlas'),zone:'exile'});assert.equal(permanentLinks(g).length,0);assert.ok(!g.object(id(g,'Metalworker')).pairedWith);
 enter(g);assert.notEqual(g.object(id(g,'Walking Atlas')).oid,oid);assert.equal(permanentLinks(g).length,0);drain(g);roundTrip(g);
});
test('soulbond: removing a source or entrant in response does not create an invalid choice',()=>{
 for(const name of ['Metalworker','Walking Atlas']){const g=base();enter(g);g.act({type:'DEBUG_MOVE',id:id(g,name),zone:'exile'});resolve(g);assert.equal(g.state.pending,null);assert.equal(permanentLinks(g).length,0);roundTrip(g);}
});
test('soulbond: losing the keyword alone keeps a pair, losing creature type or changing control breaks it',()=>{
 for(const change of ['keyword','type','control','bothControl']){
  const g=base();bond(g);const a=g.object(id(g,'Metalworker')),b=g.object(id(g,'Walking Atlas'));
  if(change==='keyword')a.modifications=[];
  if(change==='type')a.modifications.push({removeTypes:['Creature']});
  if(change==='control')a.controller=1;
  if(change==='bothControl'){a.controller=1;b.controller=1;}
  g.touch();g.clearInvalidPairs();assert.equal(permanentLinks(g).length,change==='keyword'?1:0,change);
 }
});
test('soulbond: pending optional partner selection survives export and import',()=>{
 const g=base();enter(g);resolve(g);const copy=Engine.importSession(registry,g.exportSession());
 assert.equal(copy.state.pending.key,'soulbondPartner');choose(copy,[id(copy,'Walking Atlas')]);roundTrip(copy);
});
test('soulbond: shroud does not prevent a non-targeting pair',()=>{
 const g=fixture({battlefield:[keyword,{name:'Lightning Greaves',props:{attachedTo:null}}],hand:['Walking Atlas']});
 enter(g);g.object(id(g,'Lightning Greaves')).attachedTo=ref(g.object(id(g,'Walking Atlas')));g.touch();
 resolve(g);assert.ok(g.state.pending.candidates.includes(id(g,'Walking Atlas')));choose(g,[id(g,'Walking Atlas')]);assert.equal(g.pairedPartner(id(g,'Metalworker')).id,id(g,'Walking Atlas'));
});
