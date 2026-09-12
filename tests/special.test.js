import test from 'node:test';
import assert from 'node:assert/strict';
import { fixture, id, ids, ability, cast, choose, drain, roundTrip, registry } from './helpers.js';
import { ref } from '../src/core/index.js';
const move=(g,name,zone,from=null)=>g.act({type:'DEBUG_MOVE',id:id(g,name,from),zone});
const saveInitial=g=>{g.initialState=structuredClone(g.state);g.history=[];g.cursor=0;};

test('Shorikai draws two, discards one, creates a Pilot, and can crew using sick Pilots',()=>{
  const g=fixture({battlefield:['Shorikai, Genesis Engine',...Array(3).fill({name:'Pilot',sick:true})]},{mana:{C:1}});
  ability(g,'Shorikai, Genesis Engine','draw');drain(g);assert.equal(g.state.zones.hand.length,1);assert.equal(ids(g,'Pilot','battlefield').length,4);
  const pilots=ids(g,'Pilot');assert.throws(()=>ability(g,'Shorikai, Genesis Engine','crew',{crewed:pilots.slice(0,2)}),/power/i);
  ability(g,'Shorikai, Genesis Engine','crew',{crewed:pilots.slice(0,3)});drain(g);assert(g.characteristics(id(g,'Shorikai, Genesis Engine')).types.includes('Creature'));assert.equal(g.characteristics(id(g,'Shorikai, Genesis Engine')).power,8);roundTrip(g);
});
test('Crew does not permit a newly-entered Vehicle to use its tap symbol as a creature',()=>{
  const g=fixture({battlefield:[{name:'Shorikai, Genesis Engine',sick:true},'Summon: Bahamut']},{mana:{C:1}});
  ability(g,'Shorikai, Genesis Engine','crew',{crewed:[id(g,'Summon: Bahamut')]});drain(g);
  assert.throws(()=>ability(g,'Shorikai, Genesis Engine','draw'),/summoning sickness/);roundTrip(g);
});
test('Station uses current creature power on resolution and works with summoning sickness',()=>{
  const g=fixture({battlefield:['Uthros Research Craft',{name:'Summon: Bahamut',sick:true}]});
  ability(g,'Uthros Research Craft','station',{stationed:[id(g,'Summon: Bahamut')]});
  g.act({type:'DEBUG_COUNTER',id:id(g,'Summon: Bahamut'),counter:'+1/+1',delta:2});drain(g);
  assert.equal(g.object(id(g,'Uthros Research Craft')).counters.charge,11);roundTrip(g);
});
test('Station uses last-known power if its tapped creature leaves before resolution',()=>{
  const g=fixture({battlefield:['The Seriema','Summon: Bahamut']});ability(g,'The Seriema','station',{stationed:[id(g,'Summon: Bahamut')]});move(g,'Summon: Bahamut','graveyard');drain(g);
  assert.equal(g.object(id(g,'The Seriema')).counters.charge,9);assert(g.characteristics(id(g,'The Seriema')).types.includes('Creature'));assert(g.characteristics(id(g,'The Seriema')).keywords.includes('Flying'));roundTrip(g);
});
test('Seriema threshold protects only other tapped legendary creatures',()=>{
  const g=fixture({battlefield:[{name:'The Seriema',counters:{charge:7}},{name:'Urza, Lord Protector',tapped:true},{name:'Walking Atlas',tapped:true},'Rydia, Summoner of Mist']});
  assert(g.characteristics(id(g,'Urza, Lord Protector')).keywords.includes('Indestructible'));
  assert(!g.characteristics(id(g,'The Seriema')).keywords.includes('Indestructible'));assert(!g.characteristics(id(g,'Walking Atlas')).keywords.includes('Indestructible'));assert(!g.characteristics(id(g,'Rydia, Summoner of Mist')).keywords.includes('Indestructible'));
});
test('Seriema ETB searches only for a legendary creature',()=>{
  const g=fixture({hand:['The Seriema'],libraryActive:['Urza, Lord Protector','Walking Atlas']},{mana:{C:1,W:2}});cast(g,'The Seriema');g.act({type:'RESOLVE_TOP'});g.act({type:'RESOLVE_TOP'});assert.equal(g.state.pending.candidates.length,1);choose(g,[id(g,'Urza, Lord Protector','libraryActive')]);assert(id(g,'Urza, Lord Protector','hand'));roundTrip(g);
});
test('Uthros research triggers only after three charge counters and creature threshold is twelve',()=>{
  const g=fixture({battlefield:[{name:'Uthros Research Craft',counters:{charge:11}}],hand:['Mox Opal']});cast(g,'Mox Opal');assert.equal(g.state.stack.length,2);g.act({type:'RESOLVE_TOP'});assert.equal(g.object(id(g,'Uthros Research Craft')).counters.charge,12);assert.equal(g.characteristics(id(g,'Uthros Research Craft')).power,1);drain(g);assert.equal(g.characteristics(id(g,'Uthros Research Craft')).power,2);roundTrip(g);
});
test('Rydia returns exactly-X Saga with haste and finality; final chapter sacrifices to exile',()=>{
  const g=fixture({battlefield:['Rydia, Summoner of Mist'],graveyard:['Summon: Bahamut'],libraryActive:Array(12).fill('Ancient Den')},{mana:{C:9}});
  ability(g,'Rydia, Summoner of Mist','summon',{x:9,target:[id(g,'Summon: Bahamut','graveyard')]});drain(g);const b=g.object(id(g,'Summon: Bahamut','battlefield'));assert.equal(b.counters.finality,1);assert(g.characteristics(b).keywords.includes('Haste'));assert.equal(b.counters.lore,1);
  g.act({type:'DEBUG_COUNTER',id:b.id,counter:'lore',delta:3});drain(g);assert(id(g,'Summon: Bahamut','exile'));roundTrip(g);
});
test('Bahamut final chapter damages each opponent for other permanent mana values',()=>{
  const g=fixture({battlefield:[{name:'Summon: Bahamut',lore:3},'The One Ring','Walking Atlas']});g.act({type:'DEBUG_COUNTER',id:id(g,'Summon: Bahamut'),counter:'lore',delta:1});drain(g);assert.equal(g.state.players[1].life,34);assert.equal(g.state.players[2].life,34);assert(id(g,'Summon: Bahamut','graveyard'));roundTrip(g);
});
test('Tezzeret Seeker loyalty is paid first and only one loyalty activation is allowed per turn',()=>{
  const g=fixture({battlefield:['Tezzeret the Seeker',{name:'Ancient Den',tapped:true}]});ability(g,'Tezzeret the Seeker','untap',{target:[id(g,'Ancient Den')]});assert.equal(g.object(id(g,'Tezzeret the Seeker')).counters.loyalty,5);drain(g);assert(!g.object(id(g,'Ancient Den')).tapped);assert.throws(()=>ability(g,'Tezzeret the Seeker','untap',{target:[]}),/loyalty/i);roundTrip(g);
});
test('Tezzeret Seeker X tutor permits mana-value-zero artifact lands',()=>{
  const g=fixture({battlefield:['Tezzeret the Seeker'],libraryActive:['Ancient Den','Walking Atlas']});ability(g,'Tezzeret the Seeker','search',{x:0});g.act({type:'RESOLVE_TOP'});assert.equal(g.state.pending.candidates.length,1);choose(g,[id(g,'Ancient Den','libraryActive')]);assert(id(g,'Ancient Den','battlefield'));roundTrip(g);
});
test('Tezzeret Seeker animation sets bases without erasing counters and expires in cleanup',()=>{
  const g=fixture({battlefield:[{name:'Tezzeret the Seeker',counters:{loyalty:6}},{name:'Ancient Den',counters:{'+1/+1':2}}]});ability(g,'Tezzeret the Seeker','animate');drain(g);assert.equal(g.characteristics(id(g,'Ancient Den')).power,7);g.act({type:'ADVANCE_PHASE',step:'cleanup'});drain(g);assert(!g.characteristics(id(g,'Ancient Den')).types.includes('Creature'));roundTrip(g);
});
test('Cruel Captain adds loyalty for artifacts and 0 adds a counter only to artifact creatures',()=>{
  const g=fixture({battlefield:['Tezzeret, Cruel Captain','Walking Atlas'],hand:['Ancient Den']});const before=g.object(id(g,'Tezzeret, Cruel Captain')).counters.loyalty;
  g.act({type:'PLAY_LAND',id:id(g,'Ancient Den','hand')});drain(g);assert.equal(g.object(id(g,'Tezzeret, Cruel Captain')).counters.loyalty,before+1);
  ability(g,'Tezzeret, Cruel Captain','untap',{target:[id(g,'Walking Atlas')]});drain(g);assert.equal(g.object(id(g,'Walking Atlas')).counters['+1/+1'],1);roundTrip(g);
});
test('Cruel Captain emblem survives its source and uses normal targeting at each combat',()=>{
  const g=fixture({battlefield:[{name:'Tezzeret, Cruel Captain',counters:{loyalty:7}},'Ancient Den']});ability(g,'Tezzeret, Cruel Captain','emblem');assert(id(g,'Tezzeret, Cruel Captain','graveyard'));drain(g);assert.equal(g.state.emblems.length,1);
  g.act({type:'ADVANCE_PHASE',step:'beginCombat'});assert.equal(g.state.pending.key,'target');choose(g,[id(g,'Ancient Den')]);drain(g);
  assert.equal(g.characteristics(id(g,'Ancient Den')).power,3);assert(g.characteristics(id(g,'Ancient Den')).types.includes('Creature'));roundTrip(g);
});
test('Blinking a planeswalker resets loyalty and allows another loyalty action in the same turn',()=>{
  const g=fixture({battlefield:['Tezzeret the Seeker','Displacer Kitten'],hand:['Mox Opal']});ability(g,'Tezzeret the Seeker','untap',{target:[]});drain(g);cast(g,'Mox Opal');choose(g,[id(g,'Tezzeret the Seeker')]);drain(g);assert.equal(g.object(id(g,'Tezzeret the Seeker')).counters.loyalty,4);ability(g,'Tezzeret the Seeker','untap',{target:[]});drain(g);roundTrip(g);
});
test('Mightstone draw mode and restricted colorless mana allow artifacts but not nonartifact spells',()=>{
  const g=fixture({hand:['The Mightstone and Weakstone','Walking Atlas','Open the Vaults']},{mana:{C:5}});cast(g,'The Mightstone and Weakstone');g.act({type:'RESOLVE_TOP'});choose(g,'draw');drain(g);assert.equal(g.state.zones.hand.length,4);
  ability(g,'The Mightstone and Weakstone','mana');assert.equal(g.state.players[0].restrictedMana[0].restriction,'notNonartifactSpell');cast(g,'Walking Atlas');drain(g);assert.equal(g.state.players[0].restrictedMana.length,0);roundTrip(g);
});
test('Mightstone weaken mode uses target and can kill through indestructible by reducing toughness',()=>{
  const g=fixture({battlefield:['Walking Atlas'],hand:['The Mightstone and Weakstone']},{mana:{C:5}});cast(g,'The Mightstone and Weakstone');g.act({type:'RESOLVE_TOP'});choose(g,'weaken');choose(g,[id(g,'Walking Atlas')]);drain(g);assert(id(g,'Walking Atlas','graveyard'));roundTrip(g);
});
test('Urza Protector reduces artifact/instant/sorcery generic costs, never their mana values',()=>{
  const g=fixture({battlefield:['Urza, Lord Protector'],hand:['Walking Atlas']},{mana:{C:1}});cast(g,'Walking Atlas');assert.equal(g.state.players[0].mana.C,0);drain(g);assert.equal(g.characteristics(id(g,'Walking Atlas')).manaValue,2);roundTrip(g);
});
test('Meld creates one planeswalker permanent with two physical components and seven loyalty',()=>{
  const g=fixture({battlefield:['Urza, Lord Protector','The Mightstone and Weakstone']},{mana:{C:7}});const stone=id(g,'The Mightstone and Weakstone');ability(g,'Urza, Lord Protector','meld');drain(g);const u=g.object(id(g,'Urza, Planeswalker'));assert(u);assert.equal(u.counters.loyalty,7);assert.equal(g.state.zones.battlefield.length,1);assert.equal(g.state.instances[stone].zone,'workspace');assert.equal(g.characteristics(u).manaValue,8);roundTrip(g);
});
test('Melded permanent leaving separates the cards but counts as one leaving permanent',()=>{
  const g=fixture({battlefield:['Urza, Lord Protector','The Mightstone and Weakstone','Aetherworks Marvel']},{mana:{C:7}});ability(g,'Urza, Lord Protector','meld');drain(g);move(g,'Urza, Planeswalker','graveyard');assert.equal(g.state.stack.length,1);drain(g);assert.equal(g.state.players[0].energy,1);assert(id(g,'Urza, Lord Protector','graveyard'));assert(id(g,'The Mightstone and Weakstone','graveyard'));assert.equal(g.state.zones.workspace.length,0);roundTrip(g);
});
test('Meld activation without the other piece may be paid but does nothing on resolution',()=>{
  const g=fixture({battlefield:['Urza, Lord Protector']},{mana:{C:7}});ability(g,'Urza, Lord Protector','meld');drain(g);assert.equal(g.state.players[0].mana.C,0);assert(id(g,'Urza, Lord Protector','battlefield'));roundTrip(g);
});
test('Urza planeswalker may activate twice per turn, including the same ability, but not a third time',()=>{
  const g=fixture({battlefield:['Urza, Planeswalker']});ability(g,'Urza, Planeswalker','soldiers');drain(g);ability(g,'Urza, Planeswalker','soldiers');drain(g);assert.equal(ids(g,'Soldier','battlefield').length,4);assert.throws(()=>ability(g,'Urza, Planeswalker','soldiers'),/loyalty/i);roundTrip(g);
});
test('Urza planeswalker plus-two reduction applies to later artifact spells and gains life',()=>{
  const g=fixture({battlefield:['Urza, Planeswalker'],hand:['Walking Atlas']});ability(g,'Urza, Planeswalker','reduce');drain(g);assert.equal(g.state.players[0].life,42);cast(g,'Walking Atlas');drain(g);roundTrip(g);
});
test('Urza planeswalker ultimate protects your artifacts and planeswalkers, destroys other nonlands',()=>{
  const g=fixture({battlefield:[{name:'Urza, Planeswalker',counters:{loyalty:11}},'Walking Atlas','Urza, Lord Protector',{name:'Walking Atlas',owner:1,controller:1},'Ancient Den']});ability(g,'Urza, Planeswalker','ultimate');drain(g);
  assert(g.controlled().some(o=>g.definition(o).name==='Walking Atlas'));assert.equal(g.controlled(1).length,0);assert(id(g,'Urza, Lord Protector','graveyard'));assert(id(g,'Ancient Den','battlefield'));roundTrip(g);
});
