import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {fixture,registry,id,ids,ability,cast,choose,drain,roundTrip} from './helpers.js';
import {ref,Engine,parseDeck} from '../src/core/index.js';
import {LATEST_CARDS} from '../src/rules/latest.js';
const resolve=g=>g.act({type:'RESOLVE_TOP'});
const play=(g,name)=>g.act({type:'PLAY_LAND',id:id(g,name,'hand')});
const move=(g,name,zone='graveyard',from)=>g.act({type:'DEBUG_MOVE',id:id(g,name,from),zone});
const persist=(g,names)=>{ability(g,'Cauldron of Souls','persist',{target:names.map(n=>id(g,n))});resolve(g);};
const attack=(g,names,player=1)=>g.act({type:'DECLARE_ATTACKERS',attackers:names.map(n=>({id:id(g,n),player}))});
const count=(g,n)=>ids(g,n,'battlefield').length;
const ct=(n,description,fn)=>test('latest rules: '+n+' | '+description,fn);
const landNames=['Ancient Den','Seat of the Synod','Great Furnace','Tree of Tales'];

ct('Academy Ruins','separate colorless mana and targeted top-of-library recovery',()=>{
 const g=fixture({battlefield:['Academy Ruins'],graveyard:['Mox Opal','Sakura-Tribe Scout'],libraryActive:['Walking Atlas']},{mana:{U:1,C:1}});
 ability(g,'Academy Ruins','recover',{target:[id(g,'Mox Opal')]});assert.equal(g.state.stack.length,1);assert.equal(g.object(id(g,'Academy Ruins')).tapped,true);assert.equal(g.top().cardId,registry.get('Walking Atlas').id);
 resolve(g);assert.equal(g.top().cardId,registry.get('Mox Opal').id);assert.equal(g.state.zones.hand.length,0);roundTrip(g);
 const f=fixture({battlefield:['Academy Ruins']});ability(f,'Academy Ruins','mana');assert.equal(f.state.players[0].mana.C,1);assert.equal(f.state.stack.length,0);roundTrip(f);
});
ct('Academy Ruins','illegal nonartifact targets and removed graveyard identities are rejected',()=>{
 const g=fixture({battlefield:['Academy Ruins'],graveyard:['Walking Atlas','Sakura-Tribe Scout']},{mana:{U:1,C:1}});
 assert.equal(g.perform({type:'ACTIVATE_ABILITY',id:id(g,'Academy Ruins'),abilityId:'recover',inputs:{target:[id(g,'Sakura-Tribe Scout')]},payment:'auto'}).ok,false);
 ability(g,'Academy Ruins','recover',{target:[id(g,'Walking Atlas')]});move(g,'Walking Atlas','exile');move(g,'Walking Atlas','graveyard');resolve(g);assert.ok(id(g,'Walking Atlas','graveyard'));roundTrip(g);
});
ct('Planar Bridge','searches any permanent including artifact lands and shuffles',()=>{
 for(const name of ['Razortide Bridge','Walking Atlas','Retreat to Coralhelm','Tezzeret the Seeker']){
  const g=fixture({battlefield:['Planar Bridge'],libraryActive:[name,'Faith\'s Reward','Open the Vaults']},{mana:{C:8}});
  ability(g,'Planar Bridge','search');assert.equal(g.state.players[0].mana.C,0);assert.equal(g.state.stack.length,1);resolve(g);
  assert.deepEqual(g.state.pending.candidates,[id(g,name)]);choose(g,[id(g,name)]);drain(g);assert.ok(id(g,name,'battlefield'));assert.ok(g.history.flatMap(h=>h.events).some(e=>e.type==='RANDOM_RESULT'));
  if(name==='Razortide Bridge')assert.ok(g.object(id(g,name)).tapped);roundTrip(g);
 }
});
ct('Planar Bridge','may fail to find and is not a mana ability',()=>{
 const g=fixture({battlefield:['Planar Bridge'],libraryActive:['Walking Atlas']},{mana:{C:8}});assert.equal(g.abilities(id(g,'Planar Bridge'))[0].mana,undefined);ability(g,'Planar Bridge','search');resolve(g);choose(g,[]);assert.ok(id(g,'Walking Atlas','libraryActive'));roundTrip(g);
});
ct('Mycosynth Golem','own affinity reduces only generic mana and counts artifact lands',()=>{
 const g=fixture({battlefield:landNames,hand:['Mycosynth Golem']},{mana:{C:7}});cast(g,'Mycosynth Golem');assert.equal(g.state.players[0].mana.C,0);resolve(g);assert.ok(id(g,'Mycosynth Golem','battlefield'));roundTrip(g);
});
ct('Mycosynth Golem','multiple granted affinities stack with native affinity',()=>{
 const g=fixture({battlefield:['Mycosynth Golem','Mycosynth Golem','Ancient Den'],hand:['Thought Monitor','Walking Atlas']},{mana:{U:1}});
 cast(g,'Thought Monitor');assert.equal(g.state.players[0].mana.U,0);drain(g);cast(g,'Walking Atlas');resolve(g);assert.ok(id(g,'Walking Atlas','battlefield'));roundTrip(g);
});
ct('Mycosynth Golem','noncreature artifacts and nonartifact creatures receive no reduction',()=>{
 const g=fixture({battlefield:['Mycosynth Golem',...landNames],hand:['Cosmic Cube','Sakura-Tribe Scout']});
 for(const n of ['Cosmic Cube','Sakura-Tribe Scout']){cast(g,n,{}, {payment:null});assert.equal(g.state.pending.kind,'payment');assert.ok(g.state.pending.cost.generic>0||g.state.pending.cost.colored.G>0);g.act({type:'CANCEL'});}
 roundTrip(g);
});
ct('Cauldron of Souls','grants independent persistent death triggers even if the Cauldron leaves',()=>{
 const g=fixture({battlefield:['Cauldron of Souls','Walking Atlas','Metalworker']});persist(g,['Walking Atlas','Metalworker']);move(g,'Cauldron of Souls');
 g.act({type:'DEBUG_MOVE',ids:[id(g,'Walking Atlas'),id(g,'Metalworker')],zone:'graveyard'});assert.equal(g.state.stack.length,2);assert.ok(!id(g,'Walking Atlas','battlefield'));
 drain(g);assert.ok(!id(g,'Walking Atlas','battlefield'),'1/1 returns with -1/-1 and dies');assert.ok(id(g,'Metalworker','battlefield'));assert.equal(g.object(id(g,'Metalworker')).counters['-1/-1'],1);assert.ok(!g.characteristics(id(g,'Metalworker')).keywords.includes('Persist'));roundTrip(g);
});
ct('Cauldron of Souls','multiple instances trigger separately, but return only once',()=>{
 const g=fixture({battlefield:['Cauldron of Souls','Metalwork Colossus']});persist(g,['Metalwork Colossus']);g.act({type:'DEBUG_TAP',id:id(g,'Cauldron of Souls'),tapped:false});persist(g,['Metalwork Colossus']);move(g,'Metalwork Colossus');assert.equal(g.state.stack.length,2);resolve(g);const oid=g.object(id(g,'Metalwork Colossus')).oid;resolve(g);assert.equal(g.object(id(g,'Metalwork Colossus')).oid,oid);assert.equal(g.object(id(g,'Metalwork Colossus')).counters['-1/-1'],1);roundTrip(g);
});
ct('Cauldron of Souls','does not bring back cards that changed graveyard identity',()=>{
 const g=fixture({battlefield:['Cauldron of Souls','Metalwork Colossus']});persist(g,['Metalwork Colossus']);move(g,'Metalwork Colossus');move(g,'Metalwork Colossus','exile');move(g,'Metalwork Colossus','graveyard');resolve(g);assert.ok(id(g,'Metalwork Colossus','graveyard'));roundTrip(g);
});
ct('Cauldron of Souls','targets any number including zero; shroud remains illegal',()=>{
 const g=fixture({battlefield:['Cauldron of Souls',{name:'Metalworker',props:{modifications:[{keywords:['Shroud']}]}}]});assert.equal(g.perform({type:'ACTIVATE_ABILITY',id:id(g,'Cauldron of Souls'),abilityId:'persist',inputs:{target:[id(g,'Metalworker')]}}).ok,false);persist(g,[]);assert.equal(g.object(id(g,'Cauldron of Souls')).tapped,true);roundTrip(g);
});
ct('Cauldron of Souls','returns stolen creatures to their owner, not the granting player',()=>{
 const g=fixture({battlefield:['Cauldron of Souls',{name:'Metalwork Colossus',owner:1,controller:0}]});persist(g,['Metalwork Colossus']);move(g,'Metalwork Colossus');resolve(g);assert.equal(g.object(id(g,'Metalwork Colossus')).controller,1);roundTrip(g);
});
ct('Cauldron of Souls','tokens trigger persist but cannot return',()=>{
 const g=fixture({battlefield:['Cauldron of Souls',{name:'Myr',props:{token:true,flags:{hasBeenOnBattlefield:true}}}]});persist(g,['Myr']);move(g,'Myr');assert.equal(g.state.stack.length,1);resolve(g);assert.equal(count(g,'Myr'),0);roundTrip(g);
});
ct('Cauldron of Souls','a permanent retaining persist after ceasing to be a creature still returns',()=>{
 const g=fixture({battlefield:[{name:'Mox Opal',props:{modifications:[{keywords:['Persist'],persistInstances:1}]}}]});move(g,'Mox Opal');assert.equal(g.state.stack.length,1);resolve(g);assert.ok(id(g,'Mox Opal','battlefield'));assert.equal(g.object(id(g,'Mox Opal')).counters['-1/-1'],1);roundTrip(g);
});
ct('Cauldron of Souls','uses pre-SBA counters on lethal simultaneous counter cancellation',()=>{
 const g=fixture({battlefield:[{name:'Walking Atlas',counters:{'+1/+1':1,'-1/-1':1},props:{damage:1,modifications:[{keywords:['Persist'],persistInstances:1}]}}]});g.act({type:'DEBUG_TAP',id:id(g,'Walking Atlas'),tapped:true});assert.ok(id(g,'Walking Atlas','graveyard'));assert.equal(g.state.stack.length,0,'minus counter existed in LKI, so no persist');roundTrip(g);
});
ct('Cauldron of Souls','ordinary -1/-1 counters block persist and the grant expires at cleanup',()=>{
 const g=fixture({battlefield:['Cauldron of Souls',{name:'Metalwork Colossus',counters:{'-1/-1':1}}]});persist(g,['Metalwork Colossus']);move(g,'Metalwork Colossus');assert.equal(g.state.stack.length,0);roundTrip(g);
 const f=fixture({battlefield:['Cauldron of Souls','Metalwork Colossus']});persist(f,['Metalwork Colossus']);f.act({type:'ADVANCE_PHASE',step:'cleanup'});move(f,'Metalwork Colossus');assert.equal(f.state.stack.length,0);roundTrip(f);
});
ct('Chocobo Racetrack','new Birds do not retroactively see the land that created them',()=>{
 const g=fixture({battlefield:['Chocobo Racetrack'],hand:['Ancient Den'],graveyard:['Seat of the Synod']});play(g,'Ancient Den');drain(g);const first=id(g,'Bird');assert.equal(g.characteristics(first).power,2);move(g,'Seat of the Synod','battlefield');drain(g);assert.equal(count(g,'Bird'),2);assert.equal(g.characteristics(first).power,3);const next=ids(g,'Bird','battlefield').find(v=>v!==first);assert.equal(g.characteristics(next).power,2);g.act({type:'ADVANCE_PHASE',step:'cleanup'});assert.equal(g.characteristics(first).power,2);roundTrip(g);
});
ct('Chocobo Racetrack','simultaneous returning lands and doubled landfall work on artifact lands',()=>{
 const g=fixture({battlefield:['Chocobo Racetrack','Ancient Greenwarden'],graveyard:landNames});g.act({type:'DEBUG_MOVE',ids:landNames.map(n=>id(g,n)),zone:'battlefield'});assert.equal(g.state.stack.length,8);drain(g);assert.equal(count(g,'Bird'),8);assert.ok(ids(g,'Bird','battlefield').every(id=>g.characteristics(id).power===2));roundTrip(g);
});
ct('Doors of Durin','one trigger for several attackers; entering Elf grants itself hexproof until next turn',()=>{
 const g=fixture({battlefield:['Doors of Durin','Metalworker','Walking Atlas'],libraryActive:['Skyshroud Ranger','Ancient Den','Mox Opal']},{step:'attackers'});attack(g,['Metalworker','Walking Atlas']);assert.equal(g.state.stack.length,1);drain(g,{optional:'YES',doorsDefender:'2'});const o=g.object(id(g,'Skyshroud Ranger'));assert.equal(o.zone,'battlefield');assert.equal(o.flags.attacking.player,2);assert.equal(o.attacksThisTurn,0);assert.equal(o.tapped,true);assert.ok(g.characteristics(o).keywords.includes('Hexproof'));assert.ok(!g.characteristics(o).keywords.includes('Trample'));g.act({type:'ADVANCE_PHASE',player:1,step:'main1'});assert.ok(g.characteristics(o).keywords.includes('Hexproof'));g.act({type:'ADVANCE_PHASE',player:0,step:'upkeep',nextTurn:true});drain(g);assert.ok(!g.characteristics(o).keywords.includes('Hexproof'));roundTrip(g);
});
ct('Doors of Durin','scry can change the revealed card and revealing is optional',()=>{
 const g=fixture({battlefield:['Doors of Durin','Walking Atlas'],libraryActive:['Ancient Den','Metalwork Colossus','Mox Opal']},{step:'attackers'});attack(g,['Walking Atlas']);resolve(g);choose(g,[id(g,'Ancient Den')]);choose(g,'YES');choose(g,'3');assert.ok(id(g,'Metalwork Colossus','battlefield'));assert.equal(g.object(id(g,'Metalwork Colossus')).flags.attacking.player,3);roundTrip(g);
 const f=fixture({battlefield:['Doors of Durin','Walking Atlas'],libraryActive:['Metalwork Colossus']},{step:'attackers'});attack(f,['Walking Atlas']);drain(f);assert.ok(id(f,'Metalwork Colossus','libraryActive'));roundTrip(f);
});
ct('Doors of Durin','Dwarf condition uses current types and the trigger survives source removal',()=>{
 const g=fixture({battlefield:['Doors of Durin',{name:'Metalworker',props:{modifications:[{addSubtypes:['Dwarf']}]}}],libraryActive:['Walking Atlas']},{step:'attackers'});attack(g,['Metalworker']);move(g,'Doors of Durin');drain(g,{optional:'YES',doorsDefender:'1'});assert.ok(g.characteristics(id(g,'Walking Atlas')).keywords.includes('Trample'));roundTrip(g);
});
ct('Doors of Durin','noncreatures are revealed but remain on top',()=>{
 const g=fixture({battlefield:['Doors of Durin','Walking Atlas'],libraryActive:['Mox Amber']},{step:'attackers'});attack(g,['Walking Atlas']);drain(g,{optional:'YES'});assert.ok(id(g,'Mox Amber','libraryActive'));assert.ok(g.history.flatMap(h=>h.events).some(e=>e.type==='REVEALED'));roundTrip(g);
});
ct('Cosmic Cube','greatest attacking power gates a free cast; rest goes randomly to bottom',()=>{
 const g=fixture({battlefield:['Cosmic Cube','Walking Atlas',{name:'Metalworker',counters:{'+1/+1':1}}],libraryActive:['Mox Opal','Walking Atlas','Krark-Clan Ironworks','Ancient Den','Seat of the Synod','Planar Bridge','Great Furnace']},{step:'attackers'});attack(g,['Walking Atlas','Metalworker']);assert.equal(g.state.stack.length,1);resolve(g);assert.equal(g.state.pending.kind,'castWindow');assert.deepEqual(g.state.pending.candidates,[id(g,'Mox Opal'),id(g,'Walking Atlas','libraryActive')]);choose(g,id(g,'Walking Atlas','libraryActive'));drain(g);assert.equal(count(g,'Walking Atlas'),2);assert.equal(g.top().cardId,registry.get('Great Furnace').id);assert.equal(g.state.zones.libraryActive.length,6);assert.ok(g.history.flatMap(h=>h.events).some(e=>e.type==='RANDOM_RESULT'));roundTrip(g);
});
ct('Cosmic Cube','uses surviving attackers and power at resolution, not trigger creation',()=>{
 const g=fixture({battlefield:['Cosmic Cube','Metalwork Colossus','Walking Atlas'],libraryActive:['Mox Opal','Walking Atlas','Planar Bridge']},{step:'attackers'});attack(g,['Metalwork Colossus','Walking Atlas']);move(g,'Metalwork Colossus');resolve(g);assert.deepEqual(g.state.pending.candidates,[id(g,'Mox Opal')]);choose(g,[]);assert.equal(count(g,'Mox Opal'),0);roundTrip(g);
});
ct('Cosmic Cube','empty library and a library with only lands complete without phantom casts',()=>{
 for(const libraryActive of [[],['Ancient Den','Seat of the Synod']]){const g=fixture({battlefield:['Cosmic Cube','Walking Atlas'],libraryActive},{step:'attackers'});attack(g,['Walking Atlas']);drain(g);assert.equal(g.state.stack.length,0);assert.equal(g.state.pending,null);roundTrip(g);}
});
ct('Cosmic Cube','ward counters a targeting ability when payment is declined',()=>{
 const g=fixture({battlefield:['Clock of Omens','Ancient Den','Seat of the Synod',{name:'Cosmic Cube',owner:1,controller:1,tapped:true}]});ability(g,'Clock of Omens','untap',{target:[id(g,'Cosmic Cube')],tapped:[id(g,'Ancient Den'),id(g,'Seat of the Synod')]});assert.equal(g.state.stack.length,2);resolve(g);assert.equal(g.state.pending.kind,'effectPayment');choose(g,'decline');assert.equal(g.state.stack.length,0);assert.equal(g.object(id(g,'Cosmic Cube')).tapped,true);roundTrip(g);
});
ct('Cosmic Cube','ward payment allows resolution and own effects do not trigger ward',()=>{
 const g=fixture({battlefield:['Clock of Omens','Ancient Den','Seat of the Synod',{name:'Cosmic Cube',owner:1,controller:1,tapped:true}]},{mana:{C:2}});ability(g,'Clock of Omens','untap',{target:[id(g,'Cosmic Cube')],tapped:[id(g,'Ancient Den'),id(g,'Seat of the Synod')]});resolve(g);choose(g,'pay');resolve(g);assert.equal(g.state.players[0].mana.C,0);assert.equal(g.object(id(g,'Cosmic Cube')).tapped,false);roundTrip(g);
 const f=fixture({battlefield:['Clock of Omens','Ancient Den','Seat of the Synod','Cosmic Cube']});ability(f,'Clock of Omens','untap',{target:[id(f,'Cosmic Cube')],tapped:[id(f,'Ancient Den'),id(f,'Seat of the Synod')]});assert.equal(f.state.stack.length,1);drain(f);roundTrip(f);
});
ct('Cosmic Cube','ward persists after its permanent leaves and can counter spells',()=>{
 const g=fixture({battlefield:[{name:'Cosmic Cube',owner:1,controller:1,props:{modifications:[{addTypes:['Creature'],basePower:3,baseToughness:3}]}}],hand:["Worldsoul's Rage"]},{mana:{C:1,G:1,R:1}});cast(g,"Worldsoul's Rage",{x:1,target:id(g,'Cosmic Cube')});assert.equal(g.state.stack.length,2);move(g,'Cosmic Cube','exile');resolve(g);choose(g,'decline');assert.ok(id(g,"Worldsoul's Rage",'graveyard'));assert.equal(g.state.stack.length,0);roundTrip(g);
});

test('requested September pool: every one of 177 exact names has rules, canonical metadata and local art',()=>{
 const {records,errors}=parseDeck(fs.readFileSync(new URL('../data/decks/2026-09-13-pool.txt',import.meta.url),'utf8'));assert.equal(errors.length,0);assert.equal(records.length,177);assert.equal(new Set(records.map(r=>r.name)).size,177);const report=registry.report(records);assert.deepEqual(report.missing,[]);assert.deepEqual(report.partial,[]);assert.equal(report.supported.length,177);
 for(const row of records){const c=registry.get(row.name);assert.equal(c.metadataStatus,'canonical');assert.ok(fs.existsSync(new URL('../'+c.image,import.meta.url)));}
 for(const n of LATEST_CARDS)assert.ok(records.some(r=>r.name===n));
 const g=Engine.create(registry,records,'requested-sept-pool',{openingHand:0});assert.equal(g.state.zones.command.length,1);assert.equal(g.state.zones.outside.length,72);assert.equal(g.state.zones.libraryActive.length,99);
});
