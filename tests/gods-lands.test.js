import {ct,assert,game,registry,id,ability,cast,choose,drain,roundTrip,ref,resolve,move,count,phase,manaAll,ch,ready,play} from './gods-test-helpers.js';
import {cardActions} from '../src/tabletop/card-actions.js';
const cmd={name:'Esika, God of the Tree',props:{commander:true}};
for(const name of ['Temple Garden','Breeding Pool'])ct(name,'entry life payment is optional, occurs before entry, and survives pending-session import',()=>{
 for(const pay of [false,true]){
  const g=game({hand:[name]});play(g,name);assert.equal(g.state.pending.kind,'godsEntry');assert.ok(id(g,name,'hand'));assert.equal(g.state.players[0].life,40);
  roundTrip(g);choose(g,pay?'pay':'tapped');assert.equal(g.object(id(g,name)).tapped,!pay);assert.equal(g.state.players[0].life,pay?38:40);assert.equal(g.state.landPlaysUsed,1);roundTrip(g);
 }
 const f=game({graveyard:[name]});f.act({type:'DEBUG_MOVE',id:id(f,name),zone:'battlefield',tapped:true});choose(f,'pay');assert.equal(f.state.players[0].life,38);roundTrip(f);
});
ct('Temple Garden','a forced tapped search stays tapped even after paying two life',()=>{
 const g=game({battlefield:['Karametra, God of Harvests'],hand:['Metalworker'],libraryActive:['Temple Garden']},{mana:manaAll()});cast(g,'Metalworker');resolve(g);choose(g,'YES');choose(g,[id(g,'Temple Garden')]);choose(g,'pay');drain(g);assert.ok(g.object(id(g,'Temple Garden')).tapped);assert.equal(g.state.players[0].life,38);roundTrip(g);
});
for(const [name,hit,miss] of [['Flooded Strand','Tundra','Tree of Tales'],['Windswept Heath','Savannah','Seat of the Synod'],['Misty Rainforest','Tropical Island','Ancient Den']])ct(name,'sacrifices and pays life before searching for a correctly typed dual land',()=>{
 const g=game({battlefield:[name],libraryActive:[hit,miss]});ability(g,name,'fetch');assert.ok(id(g,name,'graveyard'));assert.equal(g.state.players[0].life,39);resolve(g);assert.ok(g.state.pending.candidates.includes(id(g,hit)));assert.ok(!g.state.pending.candidates.includes(id(g,miss)));choose(g,[id(g,hit)]);drain(g);assert.ok(id(g,hit,'battlefield'));assert.ok(!g.object(id(g,hit)).tapped);roundTrip(g);
});
for(const [name,colors] of [['Savannah',['G','W']],['Tundra',['W','U']],['Tropical Island',['G','U']]])ct(name,'typed dual has the correct one-mana color choices without utility actions',()=>{
 const g=game({battlefield:[name]});for(const color of colors){ready(g,name);ability(g,name,'mana',{color});assert.equal(g.state.players[0].mana[color],1);}assert.ok(ch(g,name).subtypes.length===2);roundTrip(g);
});
ct("Spara's Headquarters",'has three basic land types, enters tapped, and cycling discards before drawing',()=>{
 const g=game({hand:["Spara's Headquarters"]},{mana:{C:3}});ability(g,"Spara's Headquarters",'cycling');assert.ok(id(g,"Spara's Headquarters",'graveyard'));assert.equal(g.state.players[0].mana.C,0);resolve(g);assert.equal(g.state.zones.hand.length,1);roundTrip(g);
 const f=game({hand:["Spara's Headquarters"]});play(f,"Spara's Headquarters");assert.ok(f.object(id(f,"Spara's Headquarters")).tapped);for(const type of ['Forest','Plains','Island'])assert.ok(ch(f,"Spara's Headquarters").subtypes.includes(type));roundTrip(f);
});
ct('Great Hall of the Citadel','two-mana filtering preserves spending restrictions and does not merge into a one-mana selector',()=>{
 const g=game({battlefield:['Great Hall of the Citadel'],hand:['Daxos, Blessed by the Sun','Metalworker']},{mana:{C:1}});ability(g,'Great Hall of the Citadel','legend-filter',{first:'W',second:'W'});assert.equal(g.state.players[0].mana.C,0);assert.equal(g.state.players[0].restrictedMana.reduce((n,e)=>n+e.amount,0),2);
 assert.equal(g.perform({type:'CAST_SPELL',id:id(g,'Metalworker'),payment:'auto'}).ok,false);cast(g,'Daxos, Blessed by the Sun');resolve(g);assert.ok(id(g,'Daxos, Blessed by the Sun','battlefield'));roundTrip(g);
});
for(const name of ['Reflecting Pool','Cactus Preserve'])ct(name,'derives real mana types including colorless and grants, but avoids mutually recursive pool loops',()=>{
 const g=game({battlefield:[name,'Darksteel Citadel','Chromatic Lantern']});assert.deepEqual(new Set(g.couldProduceColors(id(g,name))),new Set(['W','U','B','R','G','C']));ability(g,name,'mana',{color:'C'});assert.equal(g.state.players[0].mana.C,1);roundTrip(g);
 const f=game({battlefield:['Reflecting Pool','Cactus Preserve']});assert.deepEqual(f.couldProduceColors(id(f,name)),[]);roundTrip(f);
 const h=game({battlefield:[name,"Mirrodin's Core"]});assert.equal(h.object(id(h,"Mirrodin's Core")).counters.charge||0,0);assert.ok(h.couldProduceColors(id(h,name)).includes('R'));ability(h,name,'mana',{color:'R'});assert.equal(h.state.players[0].mana.R,1);roundTrip(h);
});
ct('Cactus Preserve','animation checks commander mana value at resolution, remains a land and expires',()=>{
 const g=game({battlefield:['Cactus Preserve'],command:[cmd]},{mana:{C:3}});ability(g,'Cactus Preserve','animate');resolve(g);assert.equal(ch(g,'Cactus Preserve').power,3);assert.ok(ch(g,'Cactus Preserve').types.includes('Land'));assert.ok(ch(g,'Cactus Preserve').keywords.includes('Reach'));phase(g,'cleanup');assert.ok(!ch(g,'Cactus Preserve').types.includes('Creature'));roundTrip(g);
 const f=game({battlefield:['Cactus Preserve',{...cmd,props:{...cmd.props,face:1}}]},{mana:{C:3}});ability(f,'Cactus Preserve','animate');resolve(f);assert.equal(ch(f,'Cactus Preserve').power,5);roundTrip(f);
});
ct('Exotic Orchard','reads opponent lands including mana grants, not merely static printed metadata',()=>{
 const g=game({battlefield:['Exotic Orchard',{name:'Darksteel Citadel',owner:1,controller:1},{name:'Chromatic Lantern',owner:1,controller:1}]});g.act({type:'SET_SETTING',key:'exoticOrchardAllColors',value:false});assert.equal(g.couldProduceColors(id(g,'Exotic Orchard')).length,5);ability(g,'Exotic Orchard','mana',{color:'R'});assert.equal(g.state.players[0].mana.R,1);roundTrip(g);
 const f=game({battlefield:['Exotic Orchard',{name:'Exotic Orchard',owner:1,controller:1}]});f.act({type:'SET_SETTING',key:'exoticOrchardAllColors',value:false});assert.deepEqual(f.couldProduceColors(id(f,'Exotic Orchard')),[]);roundTrip(f);
});
for(const name of ['Archway Commons','Transguild Promenade','Rupture Spire','Gateway Plaza'])ct(name,'enters tapped and is sacrificed unless the entry payment is paid',()=>{
 const g=game({hand:[name]});play(g,name);drain(g);assert.ok(id(g,name,'graveyard'));roundTrip(g);
 const f=game({hand:[name]},{mana:{C:1}});play(f,name);resolve(f);choose(f,'pay');assert.ok(id(f,name,'battlefield'));assert.ok(f.object(id(f,name)).tapped);assert.equal(f.state.players[0].mana.C,0);roundTrip(f);
});
for(const name of ['Public Thoroughfare','Command Bridge'])ct(name,'taps an eligible other permanent or sacrifices itself on entry',()=>{
 const g=game({hand:[name],battlefield:['Ancient Den','True Conviction']});play(g,name);resolve(g);assert.ok(g.state.pending.candidates.includes(id(g,'Ancient Den')));assert.equal(g.state.pending.candidates.includes(id(g,'True Conviction')),name==='Command Bridge');choose(g,[id(g,'Ancient Den')]);drain(g);assert.ok(id(g,name,'battlefield'));assert.ok(g.object(id(g,'Ancient Den')).tapped);roundTrip(g);
});
ct('City of Brass','any tap triggers damage, unlike the life cost of Mana Confluence',()=>{
 const g=game({battlefield:['City of Brass']});g.act({type:'DEBUG_TAP',id:id(g,'City of Brass'),tapped:true});assert.equal(g.state.stack.length,1);resolve(g);assert.equal(g.state.players[0].life,39);roundTrip(g);
});
ct('Mana Confluence','pays one life as a cost and produces one chosen color immediately',()=>{
 const g=game({battlefield:['Mana Confluence']});ability(g,'Mana Confluence','mana',{color:'B'});assert.equal(g.state.players[0].life,39);assert.equal(g.state.players[0].mana.B,1);assert.equal(g.state.stack.length,0);roundTrip(g);
});
for(const [name,n] of [['Tarnished Citadel',3],['Grand Coliseum',1]])ct(name,'colorless output avoids damage; colored output deals its printed damage',()=>{
 const g=game({battlefield:[name]});ability(g,name,'mana');assert.equal(g.state.players[0].life,40);ready(g,name);ability(g,name,'pain-mana',{color:'U'});assert.equal(g.state.players[0].life,40-n);assert.equal(g.state.players[0].mana.U,1);roundTrip(g);
});
ct('Starting Town','entry uses the controller turn count and colored production costs life',()=>{
 for(const turns of [1,3,4]){const g=game({hand:['Starting Town']},{turns});play(g,'Starting Town');assert.equal(g.object(id(g,'Starting Town')).tapped,turns>3);ready(g,'Starting Town');ability(g,'Starting Town','life-mana',{color:'G'});assert.equal(g.state.players[0].life,39);roundTrip(g);}
});
for(const name of ['Holdout Settlement',"Survivors' Encampment"])ct(name,'colored activation taps an untapped creature as a cost, even one with summoning sickness',()=>{
 const g=game({battlefield:[name,{name:'Metalworker',sick:true}]});ability(g,name,'crew-mana',{tapped:[id(g,'Metalworker')],color:'W'});assert.ok(g.object(id(g,'Metalworker')).tapped);assert.equal(g.state.players[0].mana.W,1);roundTrip(g);
});
ct("Mirrodin's Core",'charge uses the stack, while spending a counter produces immediate mana',()=>{
 const g=game({battlefield:["Mirrodin's Core"]});ability(g,"Mirrodin's Core",'charge');assert.equal(g.state.stack.length,1);resolve(g);ready(g,"Mirrodin's Core");ability(g,"Mirrodin's Core",'charge-mana',{color:'B'});assert.equal(g.object(id(g,"Mirrodin's Core")).counters.charge,0);assert.equal(g.state.players[0].mana.B,1);roundTrip(g);
});
ct("Serra's Sanctum",'counts enchantments including noncreature Gods, not devotion or creatures',()=>{
 const g=game({battlefield:["Serra's Sanctum",'Heliod, Sun-Crowned','Wild Growth','True Conviction']});ability(g,"Serra's Sanctum",'mana');assert.equal(g.state.players[0].mana.W,3);roundTrip(g);
});
ct('Abundant Countryside','restricted mana cannot pay noncreature spells and the six-mana action creates changeling',()=>{
 const g=game({battlefield:['Abundant Countryside']},{mana:{C:6}});ability(g,'Abundant Countryside','shapeshifter');drain(g);assert.equal(ch(g,'Shapeshifter').power,1);assert.ok(ch(g,'Shapeshifter').keywords.includes('Changeling'));roundTrip(g);
});
ct('Plaza of Heroes','exiles itself as a cost and grants both protections to the target legendary creature',()=>{
 const g=game({battlefield:['Plaza of Heroes','Esika, God of the Tree']},{mana:{C:3}});ability(g,'Plaza of Heroes','protect',{target:[id(g,'Esika, God of the Tree')]});assert.ok(id(g,'Plaza of Heroes','exile'));resolve(g);for(const k of ['Hexproof','Indestructible'])assert.ok(ch(g,'Esika, God of the Tree').keywords.includes(k));roundTrip(g);
});
ct('Hidden Hideout','uses commander identity and targets only a creature with a counter for lifelink',()=>{
 const g=game({battlefield:['Hidden Hideout',{name:'Metalworker',counters:{charge:1}},'Walking Atlas'],command:[cmd]},{mana:{C:2}});ability(g,'Hidden Hideout','lifelink',{target:[id(g,'Metalworker')]});resolve(g);assert.ok(ch(g,'Metalworker').keywords.includes('Lifelink'));ready(g,'Hidden Hideout');ability(g,'Hidden Hideout','mana',{color:'R'});assert.equal(g.state.players[0].mana.R,1);roundTrip(g);
});
ct("Valgavoth's Lair",'chooses a color before entering tapped, and keeps its enchantment type',()=>{
 const g=game({hand:["Valgavoth's Lair"]});play(g,"Valgavoth's Lair");assert.equal(g.state.pending.kind,'godsEntry');choose(g,'U');assert.ok(g.object(id(g,"Valgavoth's Lair")).tapped);assert.ok(ch(g,"Valgavoth's Lair").types.includes('Enchantment'));ready(g,"Valgavoth's Lair");ability(g,"Valgavoth's Lair",'mana',{color:'U'});assert.equal(g.state.players[0].mana.U,1);roundTrip(g);
});
ct('Forbidden Orchard','produces mana first and puts an opponent-targeted Spirit trigger on the stack',()=>{
 const g=game({battlefield:['Forbidden Orchard']});ability(g,'Forbidden Orchard','mana',{color:'B'});choose(g,2);assert.equal(g.state.players[0].mana.B,1);assert.equal(g.state.stack.length,1);resolve(g);assert.equal(g.object(id(g,'Spirit')).controller,2);assert.equal(ch(g,'Spirit').power,1);assert.deepEqual(ch(g,'Spirit').colors,[]);roundTrip(g);
});
ct('Path of Ancestry','spent tracked mana triggers scry for a shared commander creature type only',()=>{
 const g=game({battlefield:['Path of Ancestry'],command:[cmd],hand:['Heliod, Sun-Crowned']},{mana:{C:2}});ability(g,'Path of Ancestry','mana',{color:'W'});cast(g,'Heliod, Sun-Crowned');assert.equal(g.state.stack.length,2);assert.match(g.state.stack.at(-1).label,/Ancestry/);drain(g);roundTrip(g);
});
ct('Crystal Quarry','five-mana filtering produces all five colors and remains separate from colorless',()=>{
 const g=game({battlefield:['Crystal Quarry']},{mana:{C:5}});ability(g,'Crystal Quarry','filter');for(const color of ['W','U','B','R','G'])assert.equal(g.state.players[0].mana[color],1);assert.equal(g.state.players[0].mana.C,0);roundTrip(g);
});
ct('Cascading Cataracts','distributes all five filtered mana according to chosen numbers',()=>{
 const g=game({battlefield:['Cascading Cataracts']},{mana:{C:5}});ability(g,'Cascading Cataracts','filter',{'mana-W':2,'mana-U':1,'mana-B':0,'mana-R':1});assert.deepEqual(g.state.players[0].mana,{W:2,U:1,B:0,R:1,G:1,C:0});roundTrip(g);
});
