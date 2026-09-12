import test from 'node:test';
import assert from 'node:assert/strict';
import { fixture, id, ids, ability, cast, choose, drain, roundTrip } from './helpers.js';
import { ref } from '../src/core/index.js';
const move=(g,name,zone,from=null,cause='effect')=>g.act({type:'DEBUG_MOVE',id:id(g,name,from),zone,cause});

test('Clock taps exactly two artifacts as cost, allows sick artifacts, and untaps its legal target',()=>{
  const g=fixture({battlefield:['Clock of Omens',{name:'Walking Atlas',sick:true},'Ancient Den']});
  ability(g,'Clock of Omens','untap',{target:[id(g,'Ancient Den')],tapped:[id(g,'Walking Atlas'),id(g,'Ancient Den')]});
  assert(g.object(id(g,'Ancient Den')).tapped);assert(g.object(id(g,'Walking Atlas')).tapped);drain(g);assert(!g.object(id(g,'Ancient Den')).tapped);roundTrip(g);
});
test('Scaretiller becomes tapped by Clock and puts a land without using a play',()=>{
  const g=fixture({battlefield:['Clock of Omens','Scaretiller','Ancient Den'],hand:['Seat of the Synod']});
  ability(g,'Clock of Omens','untap',{target:[id(g,'Scaretiller')],tapped:[id(g,'Scaretiller'),id(g,'Ancient Den')]});
  assert.equal(g.state.pending.key,'mode');choose(g,'hand');assert.equal(g.state.stack.length,2);drain(g,{land:()=>[id(g,'Seat of the Synod','hand')]});
  assert.equal(g.state.landPlaysUsed,0);assert(!g.object(id(g,'Scaretiller')).tapped);roundTrip(g);
});
test('Kitten only triggers on noncreature spells, and excludes all lands from its target selector',()=>{
  const g=fixture({battlefield:['Displacer Kitten','Ancient Den','Walking Atlas'],hand:['Mox Opal']});
  cast(g,'Mox Opal');assert.equal(g.state.pending.kind,'draft');assert(!g.state.pending.candidates.includes(id(g,'Ancient Den')));choose(g,[id(g,'Walking Atlas')]);
  const old=g.object(id(g,'Walking Atlas')).oid;g.act({type:'RESOLVE_TOP'});assert.equal(g.object(id(g,'Walking Atlas')).oid,old+2);assert(g.isSick(g.object(id(g,'Walking Atlas'))));drain(g);roundTrip(g);
});
test('Kitten blink of Ring resets burden but does not grant cast-only protection',()=>{
  const g=fixture({battlefield:['Displacer Kitten',{name:'The One Ring',counters:{burden:3}}],hand:['Mox Amber']});
  cast(g,'Mox Amber');choose(g,[id(g,'The One Ring')]);g.act({type:'RESOLVE_TOP'});assert.equal(g.object(id(g,'The One Ring')).counters.burden,undefined);drain(g);assert(!g.state.effects.some(e=>e.kind==='protection'));roundTrip(g);
});
test('Kitten Top Skull loop executes through normal stack and casting permissions',()=>{
  const g=fixture({battlefield:['Displacer Kitten','Crystal Skull, Isu Spyglass',"Sensei's Divining Top"],libraryActive:['Walking Atlas','Ancient Den']});
  ability(g,'Crystal Skull, Isu Spyglass','mana');ability(g,"Sensei's Divining Top",'draw');drain(g);
  g.act({type:'CAST_SPELL',id:id(g,"Sensei's Divining Top",'libraryActive'),payment:'auto'});choose(g,[id(g,'Crystal Skull, Isu Spyglass')]);g.act({type:'RESOLVE_TOP'});assert(!g.object(id(g,'Crystal Skull, Isu Spyglass')).tapped);drain(g);
  ability(g,'Crystal Skull, Isu Spyglass','mana');ability(g,"Sensei's Divining Top",'draw');drain(g);assert.equal(g.state.zones.hand.length,2);assert.equal(g.state.players[0].mana.U,1);roundTrip(g);
});
test('Duplicator uses captured copiable values after a sacrificed source has left and waits for end step',()=>{
  const g=fixture({battlefield:['Esoteric Duplicator','Krark-Clan Ironworks','Walking Atlas']});
  ability(g,'Krark-Clan Ironworks','sacrifice',{sacrificed:[id(g,'Walking Atlas')]});g.act({type:'RESOLVE_TOP'});choose(g,'pay');assert.equal(g.state.delayed.length,1);assert.equal(ids(g,'Walking Atlas','battlefield').length,0);
  g.act({type:'ADVANCE_PHASE',step:'end'});drain(g);const token=g.object(id(g,'Walking Atlas','battlefield'));assert(token.token);assert.notEqual(token.id,id(g,'Walking Atlas','graveyard'));roundTrip(g);
});
test('Duplicator triggers for its own sacrifice and the new copy is a distinct object',()=>{
  const g=fixture({battlefield:['Esoteric Duplicator']},{mana:{C:4}});ability(g,'Esoteric Duplicator','draw');assert.equal(g.state.stack.length,2);g.act({type:'RESOLVE_TOP'});choose(g,'pay');drain(g);assert.equal(g.state.zones.hand.length,1);
  g.act({type:'ADVANCE_PHASE',step:'end'});drain(g);assert(g.object(id(g,'Esoteric Duplicator','battlefield')).token);roundTrip(g);
});
test('Ultron copies artifact lands as 2/2 Robot Villains but the animation is not itself copiable',()=>{
  const g=fixture({battlefield:['Ultron, Artificial Malevolence'],hand:['Ancient Den']},{mana:{C:2}});
  g.act({type:'PLAY_LAND',id:id(g,'Ancient Den','hand')});g.act({type:'RESOLVE_TOP'});choose(g,'pay');const token=g.objects('battlefield').find(o=>o.token);
  assert.deepEqual(g.characteristics(token).types,['Artifact','Land','Creature']);assert.equal(g.characteristics(token).power,2);assert(!g.copiableValues(token).types.includes('Creature'));assert.equal(g.state.landPlaysUsed,1);roundTrip(g);
});
test('Ultron copies an artifact creature without replacing its base power/toughness',()=>{
  const g=fixture({battlefield:['Ultron, Artificial Malevolence'],hand:['Walking Atlas']},{mana:{C:4}});cast(g,'Walking Atlas');g.act({type:'RESOLVE_TOP'});g.act({type:'RESOLVE_TOP'});choose(g,'pay');const token=g.objects('battlefield').find(o=>o.token);assert.equal(g.characteristics(token).power,1);assert.equal(g.characteristics(token).toughness,1);roundTrip(g);
});
test('Urza Prince copy has copiable 1/1 Soldier exception and receives the separate anthem',()=>{
  const g=fixture({battlefield:['Urza, Prince of Kroog','Ancient Den']},{mana:{C:6}});ability(g,'Urza, Prince of Kroog','copy',{target:[id(g,'Ancient Den')]});drain(g);const token=g.objects('battlefield').find(o=>o.token);
  assert.equal(g.characteristics(token).power,3);assert.equal(g.copiableValues(token).power,'1');assert(g.copiableValues(token).subtypes.includes('Soldier'));roundTrip(g);
});
test('Battlesphere creates four Myr and taps them on attack-trigger resolution for power and damage',()=>{
  const g=fixture({hand:['Myr Battlesphere']},{mana:{C:7}});cast(g,'Myr Battlesphere');drain(g);assert.equal(ids(g,'Myr','battlefield').length,4);
  g.object(id(g,'Myr Battlesphere')).controlledSince=-1;g.initialState=structuredClone(g.state);g.history=[];g.cursor=0;
  g.act({type:'ADVANCE_PHASE',step:'attackers'});g.act({type:'DECLARE_ATTACKERS',attackers:[{id:id(g,'Myr Battlesphere'),player:2}]});g.act({type:'RESOLVE_TOP'});choose(g,ids(g,'Myr','battlefield'));
  assert.equal(g.state.players[2].life,36);assert.equal(g.characteristics(id(g,'Myr Battlesphere')).power,8);assert(g.objects('battlefield').filter(o=>g.definition(o).name==='Myr').every(o=>o.tapped));roundTrip(g);
});
test('Turbine can tap five newly-created Myr as cost and search a Myr creature',()=>{
  const g=fixture({battlefield:['Myr Turbine',...Array(5).fill({name:'Myr',sick:true})],libraryActive:['Myr Battlesphere','Walking Atlas']});
  ability(g,'Myr Turbine','search',{tapped:ids(g,'Myr')});assert(g.objects('battlefield').every(o=>o.tapped));g.act({type:'RESOLVE_TOP'});choose(g,[id(g,'Myr Battlesphere','libraryActive')]);drain(g);assert.equal(ids(g,'Myr','battlefield').length,9);roundTrip(g);
});
test('Tap-symbol plus tap-creatures costs cannot tap the same object twice',()=>{
  const g=fixture({battlefield:['Myr Turbine',...Array(4).fill('Myr')]});const t=g.object(id(g,'Myr Turbine'));t.modifications.push({addTypes:['Creature'],addSubtypes:['Myr'],baseToughness:1});g.touch();g.initialState=structuredClone(g.state);
  assert.throws(()=>ability(g,'Myr Turbine','search',{tapped:[t.id,...ids(g,'Myr')]}),/two tap costs/);assert(!t.tapped);
});
test('Zealot sacrifices another creature or artifact before surveil and cannot sacrifice itself',()=>{
  const g=fixture({battlefield:['Umbral Collar Zealot','Walking Atlas'],libraryActive:['The One Ring','Ancient Den']});
  assert.throws(()=>ability(g,'Umbral Collar Zealot','surveil',{sacrificed:[id(g,'Umbral Collar Zealot')]}),/legal choice/);
  ability(g,'Umbral Collar Zealot','surveil',{sacrificed:[id(g,'Walking Atlas')]});assert(id(g,'Walking Atlas','graveyard'));g.act({type:'RESOLVE_TOP'});choose(g,[id(g,'The One Ring','libraryActive')]);assert(id(g,'The One Ring','graveyard'));roundTrip(g);
});
test('Phantom Train animates through end of turn but keeps its added counter afterward',()=>{
  const g=fixture({battlefield:['Phantom Train','Ancient Den']});ability(g,'Phantom Train','animate',{sacrificed:[id(g,'Ancient Den')]});drain(g);assert.equal(g.characteristics(id(g,'Phantom Train')).power,5);assert(g.characteristics(id(g,'Phantom Train')).types.includes('Creature'));
  g.act({type:'ADVANCE_PHASE',step:'cleanup'});drain(g);assert(!g.characteristics(id(g,'Phantom Train')).types.includes('Creature'));assert.equal(g.object(id(g,'Phantom Train')).counters['+1/+1'],1);roundTrip(g);
});
test('Grinding Station sacrifices before mill and its own entrance can untap it',()=>{
  const g=fixture({battlefield:['Grinding Station','Ancient Den'],hand:['Mox Opal'],libraryActive:['Walking Atlas','The One Ring','Seat of the Synod']});
  ability(g,'Grinding Station','mill',{player:0,sacrificed:[id(g,'Ancient Den')]});assert(id(g,'Ancient Den','graveyard'));drain(g);assert.equal(g.state.zones.graveyard.length,4);
  cast(g,'Mox Opal');drain(g,{optional:'YES'});assert(!g.object(id(g,'Grinding Station')).tapped);roundTrip(g);
});
test('Salvaging Station returns artifact lands but not artifact creatures, then untaps for a death',()=>{
  const g=fixture({battlefield:['Salvaging Station','Krark-Clan Ironworks','Walking Atlas'],graveyard:['Ancient Den','Myr']});
  assert.throws(()=>ability(g,'Salvaging Station','return',{target:[id(g,'Myr','graveyard')]}),/legal choice/);
  ability(g,'Salvaging Station','return',{target:[id(g,'Ancient Den','graveyard')]});drain(g);assert(id(g,'Ancient Den','battlefield'));
  ability(g,'Krark-Clan Ironworks','sacrifice',{sacrificed:[id(g,'Walking Atlas')]});drain(g,{optional:'YES'});assert(!g.object(id(g,'Salvaging Station')).tapped);roundTrip(g);
});
test('Scourglass can activate only in your upkeep and preserves artifacts and lands',()=>{
  const g=fixture({battlefield:['Scourglass','Walking Atlas','The Wandering Minstrel','Ancient Den','Trade Routes']},{step:'upkeep'});
  ability(g,'Scourglass','destroy');drain(g);assert(id(g,'Walking Atlas','battlefield'));assert(id(g,'Ancient Den','battlefield'));assert(id(g,'Trade Routes','graveyard'));assert(id(g,'The Wandering Minstrel','graveyard'));roundTrip(g);
  const h=fixture({battlefield:['Scourglass']});assert.throws(()=>ability(h,'Scourglass','destroy'),/not available/);
});
test('Spine destroys a target permanent then returns itself after a battlefield-to-graveyard move',()=>{
  const g=fixture({hand:['Spine of Ish Sah'],battlefield:['Walking Atlas','Krark-Clan Ironworks']},{mana:{C:7}});
  cast(g,'Spine of Ish Sah');g.act({type:'RESOLVE_TOP'});choose(g,[id(g,'Walking Atlas')]);drain(g);assert(id(g,'Walking Atlas','graveyard'));
  ability(g,'Krark-Clan Ironworks','sacrifice',{sacrificed:[id(g,'Spine of Ish Sah')]});drain(g);assert(id(g,'Spine of Ish Sah','hand'));roundTrip(g);
});
test('Trade Routes return and discard are distinct operations and can cycle the returned land',()=>{
  const g=fixture({battlefield:['Trade Routes','Ancient Den'],libraryActive:['Walking Atlas']},{mana:{C:2}});ability(g,'Trade Routes','return',{target:[id(g,'Ancient Den')]});drain(g);assert(id(g,'Ancient Den','hand'));
  ability(g,'Trade Routes','draw',{discarded:[id(g,'Ancient Den','hand')]});assert(id(g,'Ancient Den','graveyard'));drain(g);assert(id(g,'Walking Atlas','hand'));roundTrip(g);
});
test('Greaves grants haste and shroud; moving it removes both from the old creature',()=>{
  const g=fixture({battlefield:['Lightning Greaves',{name:'Walking Atlas',sick:true},'Displacer Kitten']});
  ability(g,'Lightning Greaves','equip',{target:[id(g,'Walking Atlas')]});drain(g);assert(!g.isSick(g.object(id(g,'Walking Atlas'))));assert(!g.matches(g.object(id(g,'Walking Atlas')),{target:true}));
  ability(g,'Lightning Greaves','equip',{target:[id(g,'Displacer Kitten')]});drain(g);assert(g.isSick(g.object(id(g,'Walking Atlas'))));roundTrip(g);
});
for(const [name,token,count]of [['Boar','Food',1],['Smaug','Treasure',14]])test(`${name} death produces ${count} ${token} tokens before the dead token ceases to exist`,()=>{
  const g=fixture({battlefield:[{name,props:{token:true}},'Umbral Collar Zealot']});const source=id(g,name);ability(g,'Umbral Collar Zealot','surveil',{sacrificed:[source]});assert.equal(g.state.instances[source].zone,'void');drain(g);assert.equal(ids(g,token,'battlefield').length,count);roundTrip(g);
});
test('Goblin Shaman attack creates Treasure',()=>{
  const g=fixture({battlefield:['Goblin Shaman']},{step:'attackers'});g.act({type:'DECLARE_ATTACKERS',attackers:[id(g,'Goblin Shaman')]});drain(g);assert.equal(ids(g,'Treasure','battlefield').length,1);roundTrip(g);
});
test('Smoke Blessing sees its enchanted creature die and then goes to graveyard itself',()=>{
  const g=fixture({battlefield:['Smoke Blessing','Walking Atlas','Umbral Collar Zealot']});g.object(id(g,'Smoke Blessing')).attachedTo=ref(g.object(id(g,'Walking Atlas')));g.initialState=structuredClone(g.state);
  ability(g,'Umbral Collar Zealot','surveil',{sacrificed:[id(g,'Walking Atlas')]});drain(g);assert.equal(g.state.players[0].life,39);assert.equal(ids(g,'Treasure','battlefield').length,1);assert(id(g,'Smoke Blessing','graveyard'));roundTrip(g);
});
