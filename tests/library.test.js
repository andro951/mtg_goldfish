import test from 'node:test';
import assert from 'node:assert/strict';
import { fixture, id, ids, ability, cast, choose, drain, roundTrip, registry } from './helpers.js';
import { ref } from '../src/core/index.js';
const debugMove = (g, name, zone, from = null) => g.act({ type: 'DEBUG_MOVE', id: id(g, name, from), zone });

test('Citadel casts the actual top card for life, not mana, and land plays still consume allowance', () => {
  const g = fixture({ battlefield: ["Bolas's Citadel"], libraryActive: ['The One Ring','Ancient Den'] });
  g.act({ type:'CAST_SPELL', id: id(g,'The One Ring','libraryActive'), payment:'auto' });
  assert.equal(g.state.players[0].life,36); assert.equal(g.state.stack.length,1); drain(g);
  g.act({ type:'PLAY_LAND', id: id(g,'Ancient Den','libraryActive') }); assert.equal(g.state.landPlaysUsed,1);
  assert(g.state.effects.some(e=>e.kind==='protection')); roundTrip(g);
});
test('Chip plus Citadel offers normal mana or life independently', () => {
  const g=fixture({battlefield:['The Reality Chip',"Bolas's Citadel",'Walking Atlas'],libraryActive:['The One Ring']},{mana:{C:4}});
  g.object(id(g,'The Reality Chip')).attachedTo=ref(g.object(id(g,'Walking Atlas')));g.touch();g.initialState=structuredClone(g.state);
  const card=g.top(),permissions=g.castingPermissions(card);assert.equal(permissions.length,2);
  g.act({type:'CAST_SPELL',id:card.id,permission:permissions.find(p=>p.method==='normal').id,payment:'auto'});
  assert.equal(g.state.players[0].life,40);assert.equal(g.state.players[0].mana.C,0);drain(g);roundTrip(g);
});
test('Crystal Skull allows only historic top cards and provides blue mana',()=>{
  const g=fixture({battlefield:['Crystal Skull, Isu Spyglass'],libraryActive:['Cultivator Colossus','Ancient Den']});
  assert.equal(g.castingPermissions(g.top()).length,0);ability(g,'Crystal Skull, Isu Spyglass','mana');assert.equal(g.state.players[0].mana.U,1);
  g.act({type:'DEBUG_MILL',count:1});assert.equal(g.castingPermissions(g.top(),true).length,1);assert(g.canSeeTop());roundTrip(g);
});
test('Reality Chip reconfigure removes creature type while attached and restores it on detachment',()=>{
  const g=fixture({battlefield:['The Reality Chip','Walking Atlas'],libraryActive:['The One Ring']},{mana:{C:4,U:2}});
  assert.equal(g.castingPermissions(g.top()).length,0);
  ability(g,'The Reality Chip','reconfigure',{mode:'attach',target:[id(g,'Walking Atlas')]});drain(g);
  assert(!g.characteristics(id(g,'The Reality Chip')).types.includes('Creature'));assert.equal(g.castingPermissions(g.top()).length,1);
  ability(g,'The Reality Chip','reconfigure',{mode:'detach'});drain(g);
  assert(g.characteristics(id(g,'The Reality Chip')).types.includes('Creature'));assert.equal(g.castingPermissions(g.top()).length,0);roundTrip(g);
});
test('Top look uses an ordered selector without drawing or changing card incarnations',()=>{
  const g=fixture({battlefield:["Sensei's Divining Top"],libraryActive:['Ancient Den','The One Ring','Walking Atlas']},{mana:{C:1}}),before=g.activeLibrary();
  ability(g,"Sensei's Divining Top",'look');g.act({type:'RESOLVE_TOP'});assert.equal(g.state.pending.key,'topOrder');
  choose(g,[...before].reverse());assert.deepEqual(g.activeLibrary(),[...before].reverse());assert.equal(g.state.zones.hand.length,0);roundTrip(g);
});
test('Top draw draws exactly one before returning the artifact to the library',()=>{
  const g=fixture({battlefield:["Sensei's Divining Top"],libraryActive:['Walking Atlas','Ancient Den']});
  ability(g,"Sensei's Divining Top",'draw');drain(g);assert.equal(g.definition(g.top()).name,"Sensei's Divining Top");assert(id(g,'Walking Atlas','hand'));
  assert.equal(g.history.flatMap(h=>h.events).filter(e=>e.type==='DRAW').length,1);roundTrip(g);
});
test('Scroll Rack exchange is not a draw and restores its linked exiled cards in chosen order',()=>{
  const g=fixture({battlefield:['Scroll Rack'],hand:['The One Ring','Walking Atlas'],libraryActive:['Ancient Den','Seat of the Synod','Mox Opal']},{mana:{C:1}});
  const original=[...g.state.zones.hand],tops=g.activeLibrary().slice(0,2);
  ability(g,'Scroll Rack','rack');g.act({type:'RESOLVE_TOP'});choose(g,original);
  assert.deepEqual(g.state.zones.hand,tops);assert.equal(g.state.pending.key,'rackOrder');choose(g,[...original].reverse());
  assert.deepEqual(g.activeLibrary().slice(0,2),[...original].reverse());assert.equal(g.state.zones.exile.length,0);
  assert.equal(g.history.flatMap(h=>h.events).filter(e=>e.type==='DRAW').length,0);roundTrip(g);
});
test('Marvel pays energy first, casts during resolution, and random-bottoms before the spell resolves',()=>{
  const g=fixture({battlefield:['Aetherworks Marvel'],libraryActive:['The One Ring','Ancient Den','Seat of the Synod','Mox Opal','Walking Atlas','Mox Amber','Buried Ruin']});
  g.state.players[0].energy=6;g.initialState=structuredClone(g.state);
  ability(g,'Aetherworks Marvel','marvel');assert.equal(g.state.players[0].energy,0);
  g.act({type:'RESOLVE_TOP'});assert.equal(g.state.pending.kind,'castWindow');choose(g,[id(g,'The One Ring','libraryActive')]);
  assert.equal(g.state.stack.at(-1).kind,'spell');assert.equal(g.definition(g.top()).name,'Buried Ruin');assert.equal(g.state.zones.libraryActive.length,6);
  assert.equal(g.state.players[0].mana.C,0);drain(g);roundTrip(g);
});
test('Marvel sees each permanent in a simultaneous graveyard batch, including itself',()=>{
  const g=fixture({battlefield:['Aetherworks Marvel','Ancient Den','Walking Atlas']});
  g.act({type:'DEBUG_MOVE',ids:[...g.state.zones.battlefield],zone:'graveyard',cause:'sacrifice'});assert.equal(g.state.stack.length,3);drain(g);assert.equal(g.state.players[0].energy,3);roundTrip(g);
});
test('Ring counters increase draw size and reset on a new battlefield incarnation',()=>{
  const g=fixture({battlefield:['The One Ring']});ability(g,'The One Ring','draw');drain(g);assert.equal(g.state.zones.hand.length,1);
  g.act({type:'DEBUG_TAP',id:id(g,'The One Ring'),tapped:false});ability(g,'The One Ring','draw');drain(g);assert.equal(g.state.zones.hand.length,3);
  debugMove(g,'The One Ring','exile');debugMove(g,'The One Ring','battlefield','exile');assert.equal(g.object(id(g,'The One Ring')).counters.burden,undefined);assert(!g.state.effects.some(e=>e.kind==='protection'));roundTrip(g);
});
test('Emry reduction and ETB work, and permission is casting only rather than artifact-land playing',()=>{
  const g=fixture({battlefield:['Ancient Den','Seat of the Synod'],hand:['Emry, Lurker of the Loch'],graveyard:['The One Ring','Darksteel Citadel']},{mana:{U:1,C:4}});
  cast(g,'Emry, Lurker of the Loch');drain(g);assert.equal(g.state.zones.graveyard.length,6);
  g.object(id(g,'Emry, Lurker of the Loch')).controlledSince=-1;g.initialState=structuredClone(g.state);g.history=[];g.cursor=0;
  ability(g,'Emry, Lurker of the Loch','cast-artifact',{target:[id(g,'Darksteel Citadel','graveyard')]});drain(g);
  assert.equal(g.castingPermissions(g.object(id(g,'Darksteel Citadel','graveyard')),true).length,0);
  g.act({type:'DEBUG_TAP',id:id(g,'Emry, Lurker of the Loch'),tapped:false});ability(g,'Emry, Lurker of the Loch','cast-artifact',{target:[id(g,'The One Ring','graveyard')]});drain(g);
  cast(g,'The One Ring',{}, {zone:'graveyard'});drain(g);assert(id(g,'The One Ring','battlefield'));roundTrip(g);
});
test('Six retrace consumes a land discard before the permanent spell is put on the stack',()=>{
  const g=fixture({battlefield:['Six'],hand:['Ancient Den'],graveyard:['Walking Atlas']},{mana:{C:2}});
  cast(g,'Walking Atlas',{retraceLand:[id(g,'Ancient Den','hand')]},{zone:'graveyard'});assert(id(g,'Ancient Den','graveyard'));assert.equal(g.state.stack.length,1);drain(g);roundTrip(g);
});
test('Six attack mills one batch then offers only lands from that batch',()=>{
  const g=fixture({battlefield:['Six'],graveyard:['Buried Ruin'],libraryActive:['Ancient Den','Walking Atlas','Seat of the Synod']},{step:'attackers'});
  g.act({type:'DECLARE_ATTACKERS',attackers:[id(g,'Six')]});g.act({type:'RESOLVE_TOP'});assert.equal(g.state.pending.key,'sixLand');assert.equal(g.state.pending.candidates.length,2);
  choose(g,[id(g,'Seat of the Synod','graveyard')]);assert(id(g,'Seat of the Synod','hand'));assert(id(g,'Buried Ruin','graveyard'));roundTrip(g);
});
test('Jhoira triggers on historic spells, not historic land plays',()=>{
  const g=fixture({battlefield:['Jhoira, Weatherlight Captain'],hand:['Ancient Den','Walking Atlas']},{mana:{C:2}});
  g.act({type:'PLAY_LAND',id:id(g,'Ancient Den','hand')});assert.equal(g.state.stack.length,0);cast(g,'Walking Atlas');assert.equal(g.state.stack.length,2);drain(g);assert.equal(g.state.zones.hand.length,1);roundTrip(g);
});
test('Rook excludes its own entry; Theorist includes its own entry and can decline',()=>{
  const g=fixture({hand:['Rook Turret','Transplant Theorist']},{mana:{C:6,U:2}});
  cast(g,'Rook Turret');drain(g);assert.equal(g.state.zones.hand.length,1);
  cast(g,'Transplant Theorist');g.act({type:'RESOLVE_TOP'});assert.equal(g.state.stack.length,2);drain(g);assert.equal(g.state.zones.hand.length,0);roundTrip(g);
});
test('Sarinth offers land-to-hand and nonland mill choices without counting as draw',()=>{
  const g=fixture({battlefield:['Sarinth Steelseeker'],hand:['Ancient Den'],libraryActive:['Walking Atlas','Seat of the Synod']});
  g.act({type:'PLAY_LAND',id:id(g,'Ancient Den','hand')});g.act({type:'RESOLVE_TOP'});assert.deepEqual(g.state.pending.options.map(o=>o.value),['graveyard','leave']);choose(g,'graveyard');
  g.act({type:'DEBUG_SPAWN',name:'Mox Opal'});g.act({type:'RESOLVE_TOP'});choose(g,'hand');assert(id(g,'Seat of the Synod','hand'));roundTrip(g);
});
test('Codex Shredder recovery uses a target and sacrifices itself as cost',()=>{
  const g=fixture({battlefield:['Codex Shredder'],graveyard:['Open the Vaults']},{mana:{C:5}});ability(g,'Codex Shredder','recover',{target:[id(g,'Open the Vaults','graveyard')]});assert(id(g,'Codex Shredder','graveyard'));drain(g);assert(id(g,'Open the Vaults','hand'));roundTrip(g);
});
test('Claws player-targeted ability chooses rather than targets a graveyard card',()=>{
  const g=fixture({battlefield:['Scrabbling Claws'],graveyard:['Walking Atlas','Ancient Den']});ability(g,'Scrabbling Claws','exile-choice',{player:0});g.act({type:'RESOLVE_TOP'});assert.equal(g.state.pending.key,'clawsCard');choose(g,[id(g,'Walking Atlas','graveyard')]);assert(id(g,'Walking Atlas','exile'));roundTrip(g);
});
test('Valakut links each incarnation, grants enduring permission, and moves unused exiles at end step',()=>{
  const g=fixture({battlefield:['Valakut Exploration'],hand:['Ancient Den'],libraryActive:['Walking Atlas','Seat of the Synod']});
  g.act({type:'PLAY_LAND',id:id(g,'Ancient Den','hand')});drain(g);const card=g.object(id(g,'Walking Atlas','exile'));assert.equal(g.castingPermissions(card).length,1);
  g.act({type:'ADVANCE_PHASE',step:'end'});drain(g);assert(id(g,'Walking Atlas','graveyard'));assert.equal(g.state.players[1].life,39);roundTrip(g);
});
test('Memory Jar keeps linked original hands separate from seven new cards and restores at next end',()=>{
  const g=fixture({battlefield:['Memory Jar'],hand:['The One Ring','Walking Atlas']});const originals=[...g.state.zones.hand];
  ability(g,'Memory Jar','jar');drain(g);assert.equal(g.state.zones.hand.length,7);assert.equal(g.state.zones.exile.length,2);
  g.act({type:'ADVANCE_PHASE',step:'end'});drain(g);assert.deepEqual(g.state.zones.hand,originals);assert.equal(g.state.zones.exile.length,0);assert.equal(g.state.zones.graveyard.length,8);roundTrip(g);
});
test('Combustible Gearhulk mill uses total printed mana values, not costs paid',()=>{
  const g=fixture({hand:['Combustible Gearhulk'],libraryActive:['Metalwork Colossus','The Cauldron of Eternity','Ancient Den']},{mana:{C:4,R:2}});
  cast(g,'Combustible Gearhulk');g.act({type:'RESOLVE_TOP'});choose(g,1);g.act({type:'RESOLVE_TOP'});choose(g,'mill');assert.equal(g.state.players[1].life,17);roundTrip(g);
});
test('Smelting Vat enforces combined mana value and excludes artifact creatures',()=>{
  const g=fixture({battlefield:['Smelting Vat','The One Ring'],libraryActive:['Grim Monolith','Codex Shredder','Walking Atlas','Mox Opal','Ancient Den']},{mana:{C:1}});
  ability(g,'Smelting Vat','smelt',{sacrificed:[id(g,'The One Ring')]});g.act({type:'RESOLVE_TOP'});assert.equal(g.state.pending.key,'vatKeep');assert(!g.state.pending.candidates.includes(id(g,'Walking Atlas','libraryActive')));
  choose(g,[id(g,'Grim Monolith','libraryActive'),id(g,'Codex Shredder','libraryActive')]);drain(g);assert(id(g,'Grim Monolith','battlefield'));assert(id(g,'Codex Shredder','battlefield'));roundTrip(g);
});
test('Miracle reveal interrupts the first draw, then the remainder draws before the casting trigger resolves',()=>{
  const g=fixture({battlefield:['The One Ring'],libraryActive:['Redress Fate','Walking Atlas','Ancient Den']},{mana:{W:1,C:3}});
  g.object(id(g,'The One Ring')).counters.burden=1;g.initialState=structuredClone(g.state);
  ability(g,'The One Ring','draw');g.act({type:'RESOLVE_TOP'});assert.equal(g.state.pending.kind,'miracleReveal');assert.equal(g.state.zones.hand.length,1);
  choose(g,'reveal');assert.equal(g.state.zones.hand.length,2);assert.equal(g.state.stack.length,1);
  g.act({type:'RESOLVE_TOP'});assert.equal(g.state.pending.kind,'castWindow');choose(g,[id(g,'Redress Fate','hand')]);assert.equal(g.state.players[0].mana.C,0);assert.equal(g.state.players[0].mana.W,0);drain(g);roundTrip(g);
});
test('Second card drawn in a turn cannot use miracle',()=>{
  const g=fixture({libraryActive:['Ancient Den','Redress Fate']});g.act({type:'DEBUG_DRAW',count:2});assert.equal(g.state.pending,null);assert.equal(g.state.stack.length,0);roundTrip(g);
});
test('Base-setting effects preserve characteristic definitions, buffs, and counters in the correct sublayers',()=>{
  const g=fixture({battlefield:['Cultivator Colossus','Lumra, Bellow of the Woods','Construct','Ancient Den','Seat of the Synod']});
  const c=g.object(id(g,'Cultivator Colossus')),construct=g.object(id(g,'Construct'));
  c.modifications.push({basePower:5,baseToughness:5,power:2,toughness:2});c.counters['+1/+1']=1;
  construct.modifications.push({basePower:5,baseToughness:5});g.touch();
  assert.equal(g.characteristics(c).power,8);assert.equal(g.characteristics(construct).power,8);assert.equal(g.characteristics(id(g,'Lumra, Bellow of the Woods')).power,2);
});
