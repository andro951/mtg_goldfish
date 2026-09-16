import {ct,assert,game,fixture,registry,id,ids,ability,cast,choose,drain,roundTrip,Engine,ref,resolve,move,play,ready,count,phase,attack,manaAll,ch,equipped} from './gods-test-helpers.js';

ct('Esika, God of the Tree','both cast faces have their own cost, mana value and commander tax',()=>{
 const g=game({command:[{name:'Esika, God of the Tree',props:{commander:true}}]},{mana:manaAll(5)});
 cast(g,'Esika, God of the Tree',{permission:'command/back'},{zone:'command'});
 assert.equal(g.state.pending,null);assert.equal(g.state.stack[0].label,'The Prismatic Bridge');
 const source=g.object(g.state.stack[0].source);assert.deepEqual(g.characteristics(source).types,['Enchantment']);assert.equal(g.characteristics(source).manaValue,5);
 for(const c of ['W','U','B','R','G'])assert.equal(g.state.players[0].mana[c],4);
 resolve(g);assert.ok(id(g,'The Prismatic Bridge','battlefield'));assert.deepEqual(g.characteristics(id(g,'The Prismatic Bridge')).types,['Enchantment']);
 move(g,'The Prismatic Bridge','command');const before=g.state.players[0].mana.C;cast(g,'Esika, God of the Tree',{permission:'command'},{zone:'command'});assert.equal(g.state.players[0].mana.C,before-3,'one generic cost plus two commander tax');resolve(g);
 assert.ok(ch(g,'Esika, God of the Tree').keywords.includes('Vigilance'));assert.equal(g.state.commanderCasts[registry.get('Esika, God of the Tree').id],2);roundTrip(g);
});
ct('Esika, God of the Tree','Bridge puts a low-devotion God in as an enchantment and does not cast it',()=>{
 const g=game({battlefield:[{name:'Esika, God of the Tree',props:{face:1}},'God-Eternal Oketra'],libraryActive:['Ancient Den','Damn','Heliod, Sun-Crowned','Walking Atlas']});
 phase(g,'upkeep');drain(g);assert.ok(id(g,'Heliod, Sun-Crowned','battlefield'));assert.ok(!ch(g,'Heliod, Sun-Crowned').types.includes('Creature'));assert.equal(count(g,'Zombie Warrior'),0);assert.equal(g.definition(g.top()).name,'Walking Atlas');roundTrip(g);
 const empty=game({battlefield:[{name:'Esika, God of the Tree',props:{face:1}}],libraryActive:['Damn','Ancient Den']});phase(empty,'upkeep');drain(empty);assert.equal(empty.state.zones.libraryActive.length,2);roundTrip(empty);
});
ct('Esika, God of the Tree','legendary creatures gain vigilance and a real tap ability without affecting ordinary creatures',()=>{
 const g=game({battlefield:['Esika, God of the Tree','Faeburrow Elder','Daxos, Blessed by the Sun','Walking Atlas']});
 assert.ok(g.abilities(id(g,'Daxos, Blessed by the Sun')).some(a=>a.id==='gods-tap-any'));assert.ok(!g.abilities(id(g,'Walking Atlas')).some(a=>a.id==='gods-tap-any'));
 ability(g,'Daxos, Blessed by the Sun','gods-tap-any',{color:'R'});assert.equal(g.state.players[0].mana.R,1);assert.ok(g.object(id(g,'Daxos, Blessed by the Sun')).tapped);roundTrip(g);
});
for(const name of ['Cryptolith Rite','Enduring Vitality','Elven Chorus'])ct(name,'grants one real single-mana tap ability, respects summoning sickness and leaves noncreatures alone',()=>{
 const g=game({battlefield:[name,'Walking Atlas',{name:'Metalworker',sick:true},'Ancient Den']});
 assert.equal(g.abilities(id(g,'Walking Atlas')).filter(a=>a.id==='gods-tap-any').length,1);
 ability(g,'Walking Atlas','gods-tap-any',{color:'B'});assert.equal(g.state.players[0].mana.B,1);
 assert.equal(g.perform({type:'ACTIVATE_ABILITY',id:id(g,'Metalworker'),abilityId:'gods-tap-any',inputs:{color:'R'}}).ok,false);
 assert.ok(!g.abilities(id(g,'Ancient Den')).some(a=>a.id==='gods-tap-any'));roundTrip(g);
});
ct('Nyx Lotus','counts colored symbols including repeated hybrids, ignores colors granted by Guildpact and enters tapped',()=>{
 const g=game({battlefield:['Nyx Lotus','Divinity of Pride','Altar of the Pantheon','Leyline of the Guildpact']});
 // Five W/B symbols plus the one G/W symbol plus Altar's one bonus.
 assert.equal(g.devotion(0,'W'),7);assert.equal(g.devotion(0,['W','B']),8);
 ability(g,'Nyx Lotus','mana',{color:'W'});assert.equal(g.state.players[0].mana.W,7);roundTrip(g);
 const f=game({hand:['Nyx Lotus']},{mana:{C:4}});cast(f,'Nyx Lotus');drain(f);assert.ok(f.object(id(f,'Nyx Lotus')).tapped);roundTrip(f);
});
ct('Nykthos, Shrine to Nyx','colorless activation is separate from paying two for devotion',()=>{
 const g=game({battlefield:['Nykthos, Shrine to Nyx','Divinity of Pride']},{mana:{C:2}});
 ability(g,'Nykthos, Shrine to Nyx','devotion',{color:'B'});assert.equal(g.state.players[0].mana.C,0);assert.equal(g.state.players[0].mana.B,5);
 ready(g,'Nykthos, Shrine to Nyx');ability(g,'Nykthos, Shrine to Nyx','mana');assert.equal(g.state.players[0].mana.C,1);roundTrip(g);
});
ct('Sanctum Weaver','counts itself and a noncreature God as enchantments',()=>{
 const g=game({battlefield:['Sanctum Weaver','Heliod, Sun-Crowned','True Conviction']});ability(g,'Sanctum Weaver','mana',{color:'R'});assert.equal(g.state.players[0].mana.R,3);roundTrip(g);
});
for(const name of ['Bloom Tender','Faeburrow Elder'])ct(name,'adds one per represented color, not devotion; recomputes as permanents leave',()=>{
 const g=game({battlefield:[name,'Leyline of the Guildpact','Ancient Den']});ability(g,name,'mana');for(const c of ['W','U','B','R','G'])assert.equal(g.state.players[0].mana[c],1);
 if(name==='Faeburrow Elder'){assert.equal(ch(g,name).power,5);assert.equal(ch(g,name).toughness,5);}
 move(g,'Leyline of the Guildpact','graveyard');ready(g,name);ability(g,name,'mana');assert.equal(g.state.players[0].mana.G,2);assert.equal(g.state.players[0].mana.U,1);roundTrip(g);
});
ct("Karametra's Acolyte",'counts its own green symbol and symbols on hybrid permanents',()=>{
 const g=game({battlefield:["Karametra's Acolyte",'Overbeing of Myth']});ability(g,"Karametra's Acolyte",'mana');assert.equal(g.state.players[0].mana.G,6);roundTrip(g);
});
ct('Timeless Lotus','enters tapped and produces exactly WUBRG once',()=>{
 const g=game({hand:['Timeless Lotus']},{mana:{C:5}});cast(g,'Timeless Lotus');drain(g);assert.ok(g.object(id(g,'Timeless Lotus')).tapped);ready(g,'Timeless Lotus');ability(g,'Timeless Lotus','mana');for(const c of ['W','U','B','R','G'])assert.equal(g.state.players[0].mana[c],1);assert.equal(g.state.stack.length,0);roundTrip(g);
});
ct('Altar of the Pantheon','adds one to combined devotion, and life for a noncreature legendary God',()=>{
 const g=game({battlefield:['Altar of the Pantheon','Kruphix, God of Horizons']});assert.equal(g.devotion(0,['G','U']),3);assert.ok(!ch(g,'Kruphix, God of Horizons').types.includes('Creature'));ability(g,'Altar of the Pantheon','mana',{color:'W'});assert.equal(g.state.players[0].life,41);assert.equal(g.lifeGained(0),1);roundTrip(g);
 const f=game({battlefield:['Altar of the Pantheon']});ability(f,'Altar of the Pantheon','mana',{color:'G'});assert.equal(f.state.players[0].life,40);roundTrip(f);
});
ct('Nyxbloom Ancient','triples each color from a tapped permanent, stacks, but never triples a non-tap ability',()=>{
 const g=game({battlefield:['Nyxbloom Ancient','Nyxbloom Ancient','Timeless Lotus','Krark-Clan Ironworks','Ancient Den']});ability(g,'Timeless Lotus','mana');for(const c of ['W','U','B','R','G'])assert.equal(g.state.players[0].mana[c],9);
 ability(g,'Krark-Clan Ironworks','sacrifice',{sacrificed:[id(g,'Ancient Den')]});assert.equal(g.state.players[0].mana.C,2);roundTrip(g);
});
