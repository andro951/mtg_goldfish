import test from 'node:test';
import assert from 'node:assert/strict';
import { fixture, id, ids, cast, ability, choose, drain, roundTrip, registry } from './helpers.js';
const policy=(g,name,ability,value)=>g.act({type:'SET_OPTIONAL',key:`${registry.get(name).id}/${ability}`,value});
const play=(g,name)=>g.act({type:'PLAY_LAND',id:id(g,name,'hand')});

for(const name of ['Rydia, Summoner of Mist','Quicksmith Genius']){
  test(`${name}: NO policy skips discard/draw and YES permits declining the selector`,()=>{
    const g=fixture({battlefield:[name,'Azusa, Lost but Seeking'],hand:['Ancient Den','Tree of Tales','Walking Atlas']});
    policy(g,name,'rummage','NO');play(g,'Ancient Den');drain(g);
    assert.equal(g.state.zones.hand.length,2);assert.equal(g.state.zones.libraryActive.length,24);
    policy(g,name,'rummage','YES');play(g,'Tree of Tales');g.act({type:'RESOLVE_TOP'});
    assert.equal(g.state.pending.key,'discard');assert.equal(g.state.pending.min,0);
    g.act({type:'CANCEL'});drain(g);assert(id(g,'Walking Atlas','hand'));assert.equal(g.state.zones.libraryActive.length,24);roundTrip(g);
  });
  test(`${name}: ASK remembers YES and discards before drawing`,()=>{
    const g=fixture({battlefield:[name],hand:['Ancient Den','Walking Atlas']});play(g,'Ancient Den');g.act({type:'RESOLVE_TOP'});
    assert.equal(g.state.pending.kind,'optional');choose(g,'YES',{remember:true});
    choose(g,[id(g,'Walking Atlas','hand')]);drain(g);
    assert(id(g,'Walking Atlas','graveyard'));assert.equal(g.state.zones.hand.length,1);
    assert.equal(g.state.optionalPreferences[`${registry.get(name).id}/rummage`],'YES');roundTrip(g);
  });
}
test('Manabond YES moves hand lands together, applies Minstrel, then discards remaining cards',()=>{
  const g=fixture({battlefield:['Manabond','The Wandering Minstrel'],hand:['Razortide Bridge','Silverbluff Bridge','Walking Atlas']});
  policy(g,'Manabond','manabond','YES');g.act({type:'ADVANCE_PHASE',step:'end'});drain(g);
  for(const n of ['Razortide Bridge','Silverbluff Bridge'])assert.equal(g.object(id(g,n,'battlefield')).tapped,false);
  assert(id(g,'Walking Atlas','graveyard'));assert.equal(g.state.landPlaysUsed,0);assert.equal(g.state.zones.hand.length,0);
  const changes=g.state.provenance.filter(c=>c.from==='hand'&&c.to==='battlefield');assert.equal(changes.length,2);assert.equal(changes[0].batchId,changes[1].batchId);roundTrip(g);
});
test('Manabond NO leaves every card in hand',()=>{
  const g=fixture({battlefield:['Manabond'],hand:['Ancient Den','Walking Atlas']});policy(g,'Manabond','manabond','NO');
  g.act({type:'ADVANCE_PHASE',step:'end'});drain(g);assert.equal(g.state.zones.hand.length,2);assert.equal(g.state.zones.graveyard.length,0);roundTrip(g);
});
test('Cultivator repeats inside one resolution; landfall and bounce triggers wait outside it',()=>{
  const g=fixture({battlefield:['The Wandering Minstrel','Tireless Provisioner','Ancient Den'],hand:['Cultivator Colossus','Simic Growth Chamber','Tree of Tales'],libraryActive:['Mox Amber','Walking Atlas','Great Furnace']},{mana:{C:4,G:3}});
  policy(g,'Cultivator Colossus','colossus','YES');cast(g,'Cultivator Colossus');g.act({type:'RESOLVE_TOP'});g.act({type:'RESOLVE_TOP'});
  assert.equal(g.state.pending.key,'colossusLand');choose(g,[id(g,'Simic Growth Chamber','hand')]);
  assert.equal(g.state.pending.key,'colossusLand');assert.equal(g.state.stack.length,0);assert(g.state.pendingTriggers.length>=2);
  assert.equal(g.object(id(g,'Simic Growth Chamber','battlefield')).tapped,false);assert(id(g,'Mox Amber','hand'));
  choose(g,[id(g,'Tree of Tales','hand')]);assert.equal(g.state.resolving,null);assert.equal(g.state.zones.hand.length,2);
  assert.equal(g.state.landPlaysUsed,0);drain(g);assert.equal(ids(g,'Treasure','battlefield').length,2);roundTrip(g);
});
test('Cultivator selector may be declined despite a saved YES preference',()=>{
  const g=fixture({battlefield:['Ancient Den'],hand:['Cultivator Colossus','Tree of Tales']},{mana:{C:4,G:3}});
  policy(g,'Cultivator Colossus','colossus','YES');cast(g,'Cultivator Colossus');g.act({type:'RESOLVE_TOP'});g.act({type:'RESOLVE_TOP'});
  assert.equal(g.state.pending.min,0);g.act({type:'CANCEL'});drain(g);assert(id(g,'Tree of Tales','hand'));assert.equal(g.state.zones.libraryActive.length,24);roundTrip(g);
});
test('Cultivator NO skips the repeated optional effect',()=>{
  const g=fixture({battlefield:['Ancient Den'],hand:['Cultivator Colossus','Tree of Tales']},{mana:{C:4,G:3}});
  policy(g,'Cultivator Colossus','colossus','NO');cast(g,'Cultivator Colossus');drain(g);
  assert(id(g,'Tree of Tales','hand'));assert.equal(g.state.zones.libraryActive.length,24);roundTrip(g);
});
test('Moraug main-one extra combat creates an untap trigger on the stack before attackers',()=>{
  const g=fixture({battlefield:['Moraug, Fury of Akoum',{name:'Walking Atlas',tapped:true}],hand:['Ancient Den']});
  play(g,'Ancient Den');drain(g);assert.equal(g.state.extraCombats.length,1);
  g.act({type:'ADVANCE_PHASE',step:'attackers'});
  assert.equal(g.state.step,'beginCombat');assert.equal(g.state.extraCombatActive,true);assert.equal(g.object(id(g,'Walking Atlas')).tapped,true);
  assert.equal(g.state.stack.length,1);assert.equal(g.state.stack.at(-1).kind,'trigger');assert.match(g.state.stack.at(-1).label,/untap all creatures/i);
  assert.equal(g.state.stack.at(-1).sourceCardId,registry.get('Moraug, Fury of Akoum').id);
  g.act({type:'RESOLVE_TOP'});assert.equal(g.object(id(g,'Walking Atlas')).tapped,false);assert.equal(g.state.step,'attackers');
  g.act({type:'DECLARE_ATTACKERS',attackers:[{id:id(g,'Moraug, Fury of Akoum'),player:1},{id:id(g,'Walking Atlas'),player:2}]});
  assert.equal(g.characteristics(id(g,'Moraug, Fury of Akoum')).power,7);assert.equal(g.characteristics(id(g,'Walking Atlas')).power,2);
  g.act({type:'ADVANCE_PHASE',step:'endCombat'});g.act({type:'ADVANCE_PHASE',next:true});
  assert.equal(g.state.step,'beginCombat');assert.equal(g.state.extraCombatActive,false);assert.equal(g.object(id(g,'Walking Atlas')).tapped,true);roundTrip(g);
});

test('Moraug delayed untap trigger still resolves if Moraug leaves after landfall resolves',()=>{
  const g=fixture({battlefield:['Moraug, Fury of Akoum',{name:'Walking Atlas',tapped:true}],hand:['Ancient Den']});
  play(g,'Ancient Den');drain(g);g.act({type:'DEBUG_MOVE',id:id(g,'Moraug, Fury of Akoum'),zone:'exile'});
  g.act({type:'ADVANCE_PHASE',step:'attackers'});assert.equal(g.state.stack.length,1);assert.equal(g.object(id(g,'Walking Atlas')).tapped,true);
  g.act({type:'RESOLVE_TOP'});assert.equal(g.object(id(g,'Walking Atlas')).tapped,false);assert.equal(g.state.step,'attackers');roundTrip(g);
});
test('Moraug second-main landfalls queue separate combats and a separate untap trigger for each',()=>{
  const g=fixture({battlefield:['Moraug, Fury of Akoum','Azusa, Lost but Seeking',{name:'Walking Atlas',tapped:true}],hand:['Ancient Den','Tree of Tales']},{step:'main2'});
  play(g,'Ancient Den');drain(g);play(g,'Tree of Tales');drain(g);assert.equal(g.state.extraCombats.length,2);
  for(let n=1;n<=2;n++){
    if(n===1)g.act({type:'ADVANCE_PHASE',step:'attackers'});
    assert.equal(g.state.step,'beginCombat');assert.equal(g.state.extraCombatActive,true);assert.equal(g.state.stack.length,1);assert.equal(g.object(id(g,'Walking Atlas')).tapped,true);
    g.act({type:'RESOLVE_TOP'});assert.equal(g.object(id(g,'Walking Atlas')).tapped,false);if(g.state.step==='beginCombat')g.act({type:'ADVANCE_PHASE',next:true});assert.equal(g.state.step,'attackers');
    g.act({type:'DECLARE_ATTACKERS',attackers:[{id:id(g,'Walking Atlas'),player:1}]});assert.equal(g.characteristics(id(g,'Walking Atlas')).power,1+n);
    g.act({type:'ADVANCE_PHASE',step:'endCombat'});if(n===1)g.act({type:'ADVANCE_PHASE',next:true});
  }
  g.act({type:'ADVANCE_PHASE',next:true});assert.equal(g.state.step,'end');assert.equal(g.state.extraCombats.length,0);roundTrip(g);
});
test('Moraug legacy pending combat upgrades immediate untap into a delayed stack trigger',()=>{
  const g=fixture({battlefield:[{name:'Walking Atlas',tapped:true}]},{step:'main2'});
  const moraug=registry.get('Moraug, Fury of Akoum');
  g.state.extraCombats=[{id:'legacy-moraug',after:'main2',controller:0,untapCreatures:true}];g.initialState=structuredClone(g.state);g.history=[];g.cursor=0;
  g.act({type:'ADVANCE_PHASE',step:'attackers'});
  assert.equal(g.state.step,'beginCombat');assert.equal(g.object(id(g,'Walking Atlas')).tapped,true);
  assert.equal(g.state.stack.length,1);assert.equal(g.state.stack.at(-1).sourceCardId,moraug.id);assert.match(g.state.stack.at(-1).label,/untap all creatures/i);
  g.act({type:'RESOLVE_TOP'});assert.equal(g.object(id(g,'Walking Atlas')).tapped,false);assert.equal(g.state.step,'attackers');roundTrip(g);
});
test('Moraug does not create extra combat for an opponent-turn land entry',()=>{
  const g=fixture({battlefield:['Moraug, Fury of Akoum','Walking Atlas'],hand:['Ancient Den']},{player:1});
  ability(g,'Walking Atlas','put-land');g.act({type:'RESOLVE_TOP'});choose(g,[id(g,'Ancient Den','hand')]);drain(g);
  assert.equal(g.state.extraCombats.length,0);assert.equal(g.state.landPlaysUsed,0);roundTrip(g);
});
test('multiple additional-land effects combine and recalculate when one leaves',()=>{
  const g=fixture({battlefield:['Azusa, Lost but Seeking','Aesi, Tyrant of Gyre Strait','The Gitrog Monster','Icetill Explorer'],hand:['Ancient Den','Tree of Tales']});
  assert.equal(g.landAllowance(),6);play(g,'Ancient Den');drain(g);play(g,'Tree of Tales');drain(g);
  for(const name of ['Azusa, Lost but Seeking','Aesi, Tyrant of Gyre Strait','The Gitrog Monster','Icetill Explorer'])g.act({type:'DEBUG_MOVE',id:id(g,name),zone:'exile'});
  assert.equal(g.landAllowance(),1);assert.equal(g.state.landPlaysUsed,2);roundTrip(g);
});
