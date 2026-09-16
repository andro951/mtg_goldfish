import test from 'node:test';
import assert from 'node:assert/strict';
import { Engine, stateHash } from '../src/core/index.js';
import { fixture, id, ability, choose, drain, roundTrip, registry, pool, cards } from './helpers.js';

const signature = g => stateHash(g.state);

test('observer failure cannot roll back a committed action or block another observer', () => {
  const g=fixture(); let notified=0;
  g.subscribe(()=>{throw new Error('renderer failed');}); g.subscribe(()=>notified++);
  g.act({type:'ADJUST_MANA',color:'W',delta:2});
  assert.equal(g.state.players[0].mana.W,2);assert.equal(g.cursor,1);assert.equal(notified,1);
  assert.equal(g.lastObserverError.message,'renderer failed');g.act({type:'UNDO'});assert.equal(g.state.players[0].mana.W,0);
  g.act({type:'REDO'});roundTrip(g);
});
test('malformed actions leave the state and history untouched',()=>{
  const g=fixture(),before=signature(g);
  for(const action of [null,undefined,{},'CAST_SPELL',{type:8}])assert.equal(g.perform(action).ok,false);
  assert.equal(signature(g),before);assert.equal(g.cursor,0);assert.equal(g.transaction,null);
});
test('pending sacrifice choice exports, imports, cancels, and replays without debug assistance',()=>{
  const g=fixture({battlefield:['Krark-Clan Ironworks','Ancient Den','The Wandering Minstrel']});
  g.act({type:'SET_SETTING',key:'debug',value:false});const before=signature(g);
  g.act({type:'ACTIVATE_ABILITY',id:id(g,'Krark-Clan Ironworks'),abilityId:'sacrifice'});
  const restored=Engine.importSession(registry,g.exportSession());assert.equal(signature(restored),signature(g));
  assert.equal(restored.state.pending.cost,true);restored.act({type:'CANCEL'});assert.equal(signature(restored),before);
  const again=Engine.importSession(registry,g.exportSession());choose(again,[id(again,'Ancient Den')]);
  assert.equal(again.state.players[0].mana.C,2);assert(id(again,'Ancient Den','graveyard'));roundTrip(again);
});
test('payment suspended after a mana activation remains a portable pending transaction',()=>{
  const g=fixture({battlefield:['Ancient Den'],hand:['Walking Atlas']});
  g.act({type:'CAST_SPELL',id:id(g,'Walking Atlas','hand')});assert.equal(g.state.pending.kind,'payment');
  const mana=g.abilities(id(g,'Ancient Den'))[0].id;
  g.act({type:'ACTIVATE_ABILITY',id:id(g,'Ancient Den'),abilityId:mana});
  assert.equal(g.state.pending.kind,'payment');
  const h=Engine.importSession(registry,g.exportSession());assert.equal(signature(h),signature(g));
  h.act({type:'ADJUST_MANA',color:'C',delta:1});choose(h,'auto');drain(h);roundTrip(h);
});
test('all redo entries are validated even when exported at undo cursor zero',()=>{
  const g=fixture();g.act({type:'NOTE',text:'one'});g.act({type:'NOTE',text:'two'});
  const final=signature(g);g.act({type:'UNDO'});g.act({type:'UNDO'});
  const document=g.exportSession(),h=Engine.importSession(registry,document);
  assert.equal(h.cursor,0);h.act({type:'REDO'});h.act({type:'REDO'});assert.equal(signature(h),final);
  document.history[1].afterHash='corrupt-redo-tail';assert.throws(()=>Engine.importSession(registry,document),/History result/);
});
test('a forged pending transaction baseline is rejected rather than accepted by current-state hash',()=>{
  const g=fixture({battlefield:['Krark-Clan Ironworks','Ancient Den']});
  g.act({type:'ACTIVATE_ABILITY',id:id(g,'Krark-Clan Ironworks'),abilityId:'sacrifice'});
  const doc=g.exportSession();doc.transaction.before.players[0].life++;
  assert.throws(()=>Engine.importSession(registry,doc),/Pending transaction does not match/);
});
test('pending intents must actually reproduce pending state',()=>{
  const g=fixture({battlefield:['Krark-Clan Ironworks','Ancient Den']});
  g.act({type:'ACTIVATE_ABILITY',id:id(g,'Krark-Clan Ironworks'),abilityId:'sacrifice'});
  const doc=g.exportSession();doc.transaction.intents=[];
  assert.throws(()=>Engine.importSession(registry,doc),/Pending choices do not reproduce/);
});
test('session schema mismatch and unsafe prototype keys are rejected',()=>{
  const doc=fixture().exportSession();doc.schemaVersion=999;
  assert.throws(()=>Engine.importSession(registry,doc),/compatible/);
  assert.throws(()=>Engine.importSession(registry,JSON.parse('{"__proto__":{"polluted":true}}')),/Unsafe session key/);
  assert.equal({}.polluted,undefined);
});
test('history patch paths cannot mutate object prototypes',()=>{
  const g=fixture();g.act({type:'NOTE',text:'test'});const doc=g.exportSession();
  doc.history[0].patches[0].path=['__proto__','polluted'];
  assert.throws(()=>Engine.importSession(registry,doc),/Unsafe session patch/);assert.equal({}.polluted,undefined);
});
test('next-turn navigation advances a full round, performs untap and resets land use',()=>{
  const g=fixture({battlefield:[{name:'Ancient Den',tapped:true}]},{landPlaysUsed:1});
  g.act({type:'ADVANCE_PHASE',player:0,step:'main1',nextTurn:true});drain(g);
  assert.equal(g.state.turnNumber,2);assert.equal(g.state.turnSerial,5);assert.equal(g.state.landPlaysUsed,0);
  assert.equal(g.state.zones.hand.length,1);assert.equal(g.object(id(g,'Ancient Den')).tapped,false);roundTrip(g);
});
test('navigation to an eliminated opponent is rejected atomically',()=>{
  const g=fixture();g.act({type:'ADJUST_PLAYER',player:1,field:'life',delta:-40});const before=signature(g);
  assert.equal(g.state.players[1].lost,true);
  assert.equal(g.perform({type:'ADVANCE_PHASE',player:1,step:'main1'}).ok,false);assert.equal(signature(g),before);
});
test('candidate construction keeps source copies and fixed lands in the active partition',()=>{
  const g=Engine.create(registry,pool,'acceptance-partitions',{openingHand:0});
  assert.equal(cards.filter(c=>c.candidate).length,445);assert.equal(g.state.zones.libraryActive.length,99);
  assert.equal(g.state.zones.libraryReserve.length,20);assert.equal(g.state.zones.outside.length,41);
  assert.equal(g.state.zones.command.length,1);
  assert.equal(g.objects('libraryActive').filter(o=>g.characteristics(o).types.includes('Land')).length,34);
  assert.equal(g.objects('libraryReserve').filter(o=>g.characteristics(o).types.includes('Land')).length,0);
  assert.equal(Object.values(g.state.instances).filter(o=>g.definition(o).name==='Scroll Rack').length,2);
});
test('every candidate has an explicit acceptance entry, not just a generic module fallback',()=>{
  for(const c of cards.filter(c=>c.candidate))assert.equal(registry.module(c.id).status,'full',c.name);
  assert.throws(()=>registry.get('A future unsupported name'));assert.equal(registry.has('A future unsupported name'),false);
});
