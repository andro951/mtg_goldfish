import test from 'node:test';
import assert from 'node:assert/strict';
import { ref } from '../src/core/index.js';
import { fixture, id, ids, ability, cast, choose, drain, roundTrip } from './helpers.js';
const mana = { W: 100, U: 100, B: 100, R: 100, G: 100, C: 100 };

test('Oswald pays sacrifice before stack; exact MV+1 excludes both lower and higher artifacts', () => {
  const g = fixture({ battlefield: ['Oswald Fiddlebender','Grim Monolith'], libraryActive: ['Codex Shredder','Crucible of Worlds','Clock of Omens'] }, {mana});
  const victim = id(g,'Grim Monolith'); ability(g,'Oswald Fiddlebender','ladder',{sacrificed:[victim]});
  assert.equal(g.object(victim).zone,'graveyard'); assert.equal(g.state.stack.length,1);
  g.act({type:'RESOLVE_TOP'}); assert.deepEqual(g.state.pending.candidates.map(x=>g.definition(x).name),['Crucible of Worlds']);
  choose(g,[id(g,'Crucible of Worlds')]); assert.equal(g.object(id(g,'Crucible of Worlds')).zone,'battlefield'); roundTrip(g);
});
test('Birthing Pod activated Phyrexian cost may use two life; sacrificed creature MV is unchanged', () => {
  const g = fixture({battlefield:['Birthing Pod','Thought Monitor'],libraryActive:['Krang, Master Mind','Portal to Phyrexia']},{mana:{C:1}});
  ability(g,'Birthing Pod','ladder',{phyrexian:'life',sacrificed:[id(g,'Thought Monitor')]});
  assert.equal(g.state.players[0].life,38); assert.equal(g.state.players[0].mana.C,0); g.act({type:'RESOLVE_TOP'});
  assert.ok(g.state.pending.candidates.every(x=>g.characteristics(x).manaValue===8)); drain(g); roundTrip(g);
});
test('Repurposing Bay must sacrifice another artifact, never itself', () => {
  const g=fixture({battlefield:['Repurposing Bay']},{mana});
  assert.equal(g.perform({type:'ACTIVATE_ABILITY',id:id(g,'Repurposing Bay'),abilityId:'ladder',inputs:{sacrificed:[id(g,'Repurposing Bay')]},payment:'auto'}).ok,false);
});
test('Forgemaster sacrifices exactly three artifacts, may include itself, and puts a searched artifact into play', () => {
  const g=fixture({battlefield:['Kuldotha Forgemaster','Ancient Den','Seat of the Synod'],libraryActive:['Myr Battlesphere']},{mana});
  ability(g,'Kuldotha Forgemaster','forge',{sacrificed:[...g.state.zones.battlefield]}); assert.equal(g.state.zones.battlefield.length,0);
  drain(g,{forgeSearch:(g,p)=>p.candidates}); assert.equal(g.object(id(g,'Myr Battlesphere')).zone,'battlefield'); roundTrip(g);
});
test('Eldritch Evolution sacrifices on cast and exiles after its search resolves', () => {
  const g=fixture({battlefield:['Walking Atlas'],hand:['Eldritch Evolution'],libraryActive:['Azusa, Lost but Seeking']},{mana});
  cast(g,'Eldritch Evolution',{sacrificed:[id(g,'Walking Atlas')]}); assert.equal(g.object(id(g,'Walking Atlas')).zone,'graveyard');
  drain(g,{evolutionSearch:(g,p)=>p.candidates}); assert.equal(g.object(id(g,'Eldritch Evolution')).zone,'exile'); assert.equal(g.landAllowance(),3); roundTrip(g);
});
test('Neoform exact mana ladder adds the counter as the creature enters', () => {
  const g=fixture({battlefield:['Walking Atlas'],hand:['Neoform'],libraryActive:['Azusa, Lost but Seeking']},{mana});
  cast(g,'Neoform',{sacrificed:[id(g,'Walking Atlas')]}); drain(g,{neoformSearch:(g,p)=>p.candidates});
  assert.equal(g.object(id(g,'Azusa, Lost but Seeking')).counters['+1/+1'],1); roundTrip(g);
});
test('Expedition Map and Moonsilver Key use filtered library searches, not unfiltered force moves', () => {
  for (const [name,key,choice] of [['Expedition Map','map','mapSearch'],['Moonsilver Key','key','keySearch']]) {
    const g=fixture({battlefield:[name],libraryActive:['Ancient Den','Grim Monolith','Clock of Omens']},{mana});
    ability(g,name,key); g.act({type:'RESOLVE_TOP'});
    const candidates=g.state.pending.candidates.map(x=>g.definition(x).name);
    assert.deepEqual(candidates,name==='Expedition Map'?['Ancient Den']:['Ancient Den','Grim Monolith']);
    choose(g,[g.state.pending.candidates[0]]); assert.equal(g.state.zones.hand.length,1); roundTrip(g);
  }
});
test('Elvish Reclaimer grows from graveyard lands and returns a searched land tapped',()=>{
  const g=fixture({battlefield:['Elvish Reclaimer','Ancient Den'],graveyard:['Seat of the Synod','Tree of Tales'],libraryActive:['Great Furnace']},{mana});
  ability(g,'Elvish Reclaimer','reclaim',{sacrificed:[id(g,'Ancient Den')]}); assert.equal(g.characteristics(id(g,'Elvish Reclaimer')).power,3);
  drain(g,{reclaimerSearch:(g,p)=>p.candidates}); assert.equal(g.object(id(g,'Great Furnace')).tapped,true);roundTrip(g);
});
test('Goblin Engineer captures a legal MV≤3 target before sacrificing and returns it',()=>{
  const g=fixture({battlefield:['Goblin Engineer','Ancient Den'],graveyard:['Grim Monolith','Myr Battlesphere']},{mana});
  ability(g,'Goblin Engineer','exchange',{target:[id(g,'Grim Monolith')],sacrificed:[id(g,'Ancient Den')]});drain(g);
  assert.equal(g.object(id(g,'Grim Monolith')).zone,'battlefield');assert.equal(g.object(id(g,'Ancient Den','graveyard')).zone,'graveyard');roundTrip(g);
});
test('Goblin Welder exchanges simultaneously, generating one zone batch and correct landfall',()=>{
  const g=fixture({battlefield:['Goblin Welder','The Gitrog Monster','Ancient Den'],graveyard:['Seat of the Synod']},{mana});
  ability(g,'Goblin Welder','exchange',{battlefieldTarget:[id(g,'Ancient Den')],graveTarget:[id(g,'Seat of the Synod')]});g.act({type:'RESOLVE_TOP'});
  assert.equal(g.object(id(g,'Seat of the Synod')).zone,'battlefield');assert.equal(g.state.stack.length,1);
  const batches=g.history.at(-1).events.filter(e=>e.type==='ZONE_BATCH');assert.equal(batches.length,1);assert.equal(batches[0].changes.length,2);drain(g);roundTrip(g);
});
test('Welder cannot exchange cards belonging to different players or perform only half an exchange',()=>{
  const g=fixture({battlefield:['Goblin Welder','Ancient Den'],graveyard:[{name:'Seat of the Synod',owner:1}]},{mana});
  assert.equal(g.perform({type:'ACTIVATE_ABILITY',id:id(g,'Goblin Welder'),abilityId:'exchange',inputs:{battlefieldTarget:[id(g,'Ancient Den')],graveTarget:[id(g,'Seat of the Synod')]},payment:'auto'}).ok,false);
  const h=fixture({battlefield:['Goblin Welder','Ancient Den'],graveyard:['Seat of the Synod']});
  ability(h,'Goblin Welder','exchange',{battlefieldTarget:[id(h,'Ancient Den')],graveTarget:[id(h,'Seat of the Synod')]});h.act({type:'DEBUG_MOVE',id:id(h,'Seat of the Synod'),zone:'exile'});drain(h);
  assert.equal(h.object(id(h,'Ancient Den')).zone,'battlefield');roundTrip(h);
});
test('Master Transmuter may return itself as a cost and put itself back as a new object',()=>{
  const g=fixture({battlefield:['Master Transmuter']},{mana}); const old=ref(g.object(id(g,'Master Transmuter')));
  ability(g,'Master Transmuter','transmute',{returned:[old.id]});assert.equal(g.object(old),null);
  drain(g,{replacement:(g,p)=>p.candidates});assert.equal(g.object(old.id).zone,'battlefield');assert.ok(g.object(old.id).oid>old.oid);assert.equal(g.isSick(g.object(old.id)),true);roundTrip(g);
});
test('Metalwork Colossus may be activated twice holding priority but only returns once',()=>{
  const g=fixture({battlefield:['Ancient Den','Seat of the Synod','Tree of Tales','Great Furnace'],graveyard:['Metalwork Colossus']});
  ability(g,'Metalwork Colossus','recover',{sacrificed:g.state.zones.battlefield.slice(0,2)});ability(g,'Metalwork Colossus','recover',{sacrificed:[...g.state.zones.battlefield]});
  assert.equal(g.state.stack.length,2);drain(g);assert.equal(g.object(id(g,'Metalwork Colossus')).zone,'hand');assert.equal(g.state.zones.battlefield.length,0);roundTrip(g);
});
test('Salvage Titan alternative cost sacrifices three artifacts and does not change its mana value',()=>{
  const g=fixture({battlefield:['Ancient Den','Seat of the Synod','Tree of Tales'],hand:['Salvage Titan']});
  cast(g,'Salvage Titan',{permission:'hand/three-artifacts',sacrificed:[...g.state.zones.battlefield]});assert.equal(g.characteristics(id(g,'Salvage Titan')).manaValue,6);drain(g);roundTrip(g);
});
test('Cauldron death trigger survives the Cauldron leaving after trigger creation',()=>{
  const g=fixture({battlefield:['The Cauldron of Eternity','Walking Atlas']});
  g.act({type:'DEBUG_MOVE',id:id(g,'Walking Atlas'),zone:'graveyard'});assert.equal(g.state.stack.length,1);
  g.act({type:'DEBUG_MOVE',id:id(g,'The Cauldron of Eternity'),zone:'graveyard'});drain(g);assert.equal(g.state.zones.libraryActive.at(-1),id(g,'Walking Atlas'));roundTrip(g);
});
test('Cauldron gone before death creates no trigger; reanimation charges tap, mana and life',()=>{
  const g=fixture({battlefield:['The Cauldron of Eternity'],graveyard:['Walking Atlas']},{mana});
  ability(g,'The Cauldron of Eternity','reanimate',{target:[id(g,'Walking Atlas')]});assert.equal(g.state.players[0].life,38);drain(g);
  g.act({type:'DEBUG_MOVE',id:id(g,'The Cauldron of Eternity'),zone:'graveyard'});g.act({type:'DEBUG_MOVE',id:id(g,'Walking Atlas'),zone:'graveyard'});assert.equal(g.state.stack.length,0);roundTrip(g);
});
test('Portal forces three sacrifices from each configured abstract opponent',()=>{
  const g=fixture({hand:['Portal to Phyrexia']},{mana});for(const p of g.state.players.slice(1))p.abstractCreatures=5;g.initialState=structuredClone(g.state);
  cast(g,'Portal to Phyrexia');drain(g);assert.deepEqual(g.state.players.slice(1).map(p=>p.abstractCreatures),[2,2,2]);roundTrip(g);
});
test('Portal upkeep can reanimate an opposing graveyard creature under your control as Phyrexian',()=>{
  const g=fixture({battlefield:['Portal to Phyrexia'],graveyard:[{name:'Krang, Master Mind',owner:1}]},{step:'untap'});
  g.act({type:'ADVANCE_PHASE',step:'upkeep'});choose(g,[id(g,'Krang, Master Mind')]);drain(g);
  const card=g.object(id(g,'Krang, Master Mind'));assert.equal(card.controller,0);assert.equal(card.owner,1);assert.ok(g.characteristics(card).subtypes.includes('Phyrexian'));roundTrip(g);
});
test('Faith’s Reward returns only your battlefield-origin cards from this turn',()=>{
  const g=fixture({battlefield:['Ancient Den',{name:'Seat of the Synod',owner:1}],graveyard:['Grim Monolith'],hand:["Faith's Reward"]},{mana});
  const own=id(g,'Ancient Den'),other=id(g,'Seat of the Synod');g.act({type:'DEBUG_MOVE',ids:[own,other],zone:'graveyard'});cast(g,"Faith's Reward");drain(g);
  assert.equal(g.object(own).zone,'battlefield');assert.equal(g.object(other).zone,'graveyard');assert.equal(g.object(id(g,'Grim Monolith')).zone,'graveyard');roundTrip(g);
});
test('Second Sunrise includes opponents but never returns an old graveyard card',()=>{
  const g=fixture({battlefield:['Ancient Den',{name:'Seat of the Synod',owner:1}],graveyard:['Grim Monolith'],hand:['Second Sunrise']},{mana});
  const targets=[...g.state.zones.battlefield];g.act({type:'DEBUG_MOVE',ids:targets,zone:'graveyard'});cast(g,'Second Sunrise');drain(g);for(const card of targets)assert.equal(g.object(card).zone,'battlefield');assert.equal(g.object(id(g,'Grim Monolith')).zone,'graveyard');roundTrip(g);
});
test('Sunrise uses current graveyard incarnation, not an earlier grave visit by the same physical card',()=>{
  const g=fixture({battlefield:['Ancient Den'],hand:['Second Sunrise']},{mana});const land=id(g,'Ancient Den');
  g.act({type:'DEBUG_MOVE',id:land,zone:'graveyard'});g.act({type:'DEBUG_MOVE',id:land,zone:'hand'});g.act({type:'DEBUG_MOVE',id:land,zone:'graveyard'});cast(g,'Second Sunrise');drain(g);assert.equal(g.object(land).zone,'graveyard');roundTrip(g);
});
test('Pendant exiles as a cost and returns eligible cards tapped',()=>{
  const g=fixture({battlefield:["Gerrard's Hourglass Pendant",'Ancient Den']},{mana});const land=id(g,'Ancient Den');g.act({type:'DEBUG_MOVE',id:land,zone:'graveyard'});
  ability(g,"Gerrard's Hourglass Pendant",'return-this-turn');assert.equal(g.object(id(g,"Gerrard's Hourglass Pendant")).zone,'exile');drain(g);assert.equal(g.object(land).tapped,true);roundTrip(g);
});
test('Open the Vaults returns artifacts/enchantments from all graveyards, not other creatures or ordinary lands',()=>{
  const g=fixture({graveyard:['Ancient Den','Walking Atlas','Lotus Cobra','Oboro, Palace in the Clouds',{name:'Manabond',owner:1}],hand:['Open the Vaults']},{mana});
  cast(g,'Open the Vaults');drain(g);assert.equal(g.object(id(g,'Ancient Den','battlefield')).zone,'battlefield');assert.equal(g.object(id(g,'Lotus Cobra')).zone,'graveyard');assert.equal(g.object(id(g,'Manabond')).controller,1);roundTrip(g);
});
test('Aftermath Analyst puts lands without consuming land plays; Minstrel replaces tapped entry',()=>{
  const g=fixture({battlefield:['Aftermath Analyst','The Wandering Minstrel'],graveyard:['Ancient Den','Razortide Bridge']},{mana});
  ability(g,'Aftermath Analyst','return-lands');drain(g);assert.equal(g.state.landPlaysUsed,0);assert.equal(g.object(id(g,'Razortide Bridge')).tapped,false);roundTrip(g);
});
test('Scapeshift sacrifices seven lands as one batch, producing exactly one Gitrog draw',()=>{
  const lands=['Ancient Den','Seat of the Synod','Tree of Tales','Great Furnace','Vault of Whispers','Darksteel Citadel','Razortide Bridge'];
  const g=fixture({battlefield:['The Gitrog Monster',...lands],hand:['Scapeshift']},{mana});cast(g,'Scapeshift');g.act({type:'RESOLVE_TOP'});choose(g,lands.map(n=>id(g,n,'battlefield')));
  assert.equal(g.state.stack.length,0);assert.equal(g.state.pendingTriggers.length,1);choose(g,[]);assert.equal(g.state.stack.length,1);drain(g);roundTrip(g);
});
test('Pitiless Carnage plot is a special action, disallows same-turn casting, then grants free sorcery casting',()=>{
  const g=fixture({hand:['Pitiless Carnage']},{mana});const card=id(g,'Pitiless Carnage');g.act({type:'SPECIAL_ACTION',id:card,special:'plot',payment:'auto'});
  assert.equal(g.state.stack.length,0);assert.equal(g.castingPermissions(g.object(card)).length,0);
  g.act({type:'ADVANCE_PHASE',player:1,step:'main1'});assert.equal(g.castingPermissions(g.object(card)).length,1);
  assert.equal(g.perform({type:'CAST_SPELL',id:card,payment:'auto'}).ok,false);roundTrip(g);
});
