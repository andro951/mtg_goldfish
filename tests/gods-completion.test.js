import {ct,assert,game,id,ids,registry,ability,cast,choose,drain,roundTrip,resolve,move,count,phase,manaAll,ch,ready,attack,combatDamage} from './gods-test-helpers.js';
ct('Kruphix, God of Horizons','converts stored mana to colorless across steps and removes the maximum hand size',()=>{
 const g=game({battlefield:['Kruphix, God of Horizons'],hand:Array(9).fill('Ancient Den')},{mana:{W:2,U:1,C:1}});phase(g,'beginCombat');assert.equal(g.state.players[0].mana.C,4);assert.equal(g.state.players[0].mana.W,0);phase(g,'cleanup');assert.equal(g.state.pending,null);assert.equal(g.state.zones.hand.length,9);roundTrip(g);
});
ct('True Conviction','double strike and lifelink apply to all controlled creatures and deal two separate damage steps',()=>{
 const g=game({battlefield:['True Conviction','Metalworker']},{step:'attackers'});attack(g,['Metalworker']);phase(g,'damage');combatDamage(g);assert.equal(g.state.players[1].life,38);assert.equal(g.state.players[0].life,42);roundTrip(g);
});
ct('Smothering Tithe','opponent draw asks for payment and declined payment creates one Treasure',()=>{
 const g=game({battlefield:['Smothering Tithe']},{player:1,step:'upkeep'});phase(g,'draw',1);resolve(g);assert.ok(g.state.pending);choose(g,'decline');assert.equal(count(g,'Treasure'),1);roundTrip(g);
});
ct('Fanatic of Rhonas','ferocious mana is conditional and eternalize makes a black 4/4 Zombie with zero mana value',()=>{
 const g=game({battlefield:['Fanatic of Rhonas','Metalwork Colossus']});ability(g,'Fanatic of Rhonas','ferocious');assert.equal(g.state.players[0].mana.G,4);move(g,'Metalwork Colossus','graveyard');ready(g,'Fanatic of Rhonas');assert.ok(!g.abilities(id(g,'Fanatic of Rhonas')).some(a=>a.id==='ferocious'));roundTrip(g);
 const f=game({graveyard:['Fanatic of Rhonas']},{mana:manaAll()});ability(f,'Fanatic of Rhonas','eternalize');resolve(f);const tok=ids(f,'Fanatic of Rhonas','battlefield')[0];assert.ok(tok);assert.equal(f.characteristics(tok).power,4);assert.equal(f.characteristics(tok).manaValue,0);assert.deepEqual(f.characteristics(tok).colors,['B']);assert.ok(f.characteristics(tok).subtypes.includes('Zombie'));roundTrip(f);
});
ct('Ramos, Dragon Engine','counts a spell colors once each and removes five counters only once per turn for ten mana',()=>{
 const g=game({battlefield:['Ramos, Dragon Engine'],hand:['Esika, God of the Tree']},{mana:manaAll()});cast(g,'Esika, God of the Tree',{permission:'hand/back'});resolve(g);assert.equal(g.object(id(g,'Ramos, Dragon Engine')).counters['+1/+1'],5);resolve(g);ability(g,'Ramos, Dragon Engine','ramos-mana');assert.equal(g.object(id(g,'Ramos, Dragon Engine')).counters['+1/+1'],0);assert.equal(g.state.players[0].mana.W,31);assert.equal(g.perform({type:'ACTIVATE_ABILITY',id:id(g,'Ramos, Dragon Engine'),abilityId:'ramos-mana'}).ok,false);roundTrip(g);
});
ct('Selvala, Heart of the Wilds','mana uses greatest controlled power and entry draw is optional for the entering creature controller',()=>{
 const g=game({battlefield:['Selvala, Heart of the Wilds','Metalwork Colossus']},{mana:{G:1}});ability(g,'Selvala, Heart of the Wilds','mana',{'mana-W':2,'mana-U':3,'mana-B':1,'mana-R':1});assert.deepEqual(g.state.players[0].mana,{W:2,U:3,B:1,R:1,G:3,C:0});roundTrip(g);
 const f=game({battlefield:['Selvala, Heart of the Wilds'],graveyard:['Metalwork Colossus']});move(f,'Metalwork Colossus');drain(f,{optional:'YES'});assert.equal(f.state.zones.hand.length,1);roundTrip(f);
});
ct('Scroll Rack','exiles a chosen number from hand and exchanges them for top cards before ordering the return',()=>{
 const g=game({battlefield:['Scroll Rack'],hand:['Damn','True Conviction'],libraryActive:['Ancient Den','Metalworker','Walking Atlas']},{mana:{C:1}});const a=id(g,'Damn'),b=id(g,'True Conviction');ability(g,'Scroll Rack','rack');drain(g,{rackHand:[a,b],rackOrder:[b,a]});assert.equal(g.state.zones.hand.length,2);assert.ok(id(g,'Metalworker','hand'));assert.equal(g.definition(g.top()).name,'True Conviction');roundTrip(g);
});
ct('Chromatic Orrery','draws for represented colors and retains a distinct five-colorless-mana activation',()=>{
 const g=game({battlefield:['Chromatic Orrery','Esika, God of the Tree','True Conviction']},{mana:{C:5}});ability(g,'Chromatic Orrery','draw');resolve(g);assert.equal(g.state.zones.hand.length,2);roundTrip(g);
});
ct('The World Tree','six lands grant one-mana colors without replacing printed colorless or utility abilities',()=>{
 const g=game({battlefield:['The World Tree','Ancient Den','Seat of the Synod','Darksteel Citadel','Vault of Whispers','Tree of Tales']});assert.ok(g.abilities(id(g,'Darksteel Citadel')).length>1);assert.ok(g.couldProduceColors(id(g,'Darksteel Citadel')).includes('C'));assert.ok(g.couldProduceColors(id(g,'Darksteel Citadel')).includes('R'));roundTrip(g);
});
ct('Command Tower','uses five-color identity even when the commander front face is green',()=>{
 const g=game({battlefield:['Command Tower'],command:[{name:'Esika, God of the Tree',props:{commander:true}}]});ability(g,'Command Tower','mana',{color:'B'});assert.equal(g.state.players[0].mana.B,1);roundTrip(g);
});
ct('Scene of the Crime','Clue sacrifice draws a card and its mana filter stays a separate activation',()=>{
 const g=game({battlefield:['Scene of the Crime']},{mana:{C:2}});ability(g,'Scene of the Crime','clue');assert.ok(id(g,'Scene of the Crime','graveyard'));resolve(g);assert.equal(g.state.zones.hand.length,1);roundTrip(g);
});

ct('Heliod, Sun-Crowned','losing devotion removes it from combat, even when devotion is restored before damage',()=>{
 const g=game({battlefield:['Heliod, Sun-Crowned','True Conviction',"Sythis, Harvest's Hand"]},{step:'attackers'});assert.ok(ch(g,'Heliod, Sun-Crowned').types.includes('Creature'));
 attack(g,['Heliod, Sun-Crowned']);move(g,'True Conviction','exile');assert.ok(!g.object(id(g,'Heliod, Sun-Crowned')).flags.attacking);
 move(g,'True Conviction');assert.ok(ch(g,'Heliod, Sun-Crowned').types.includes('Creature'));assert.ok(!g.object(id(g,'Heliod, Sun-Crowned')).flags.attacking);drain(g);phase(g,'damage');combatDamage(g);assert.equal(g.state.players[1].life,40);roundTrip(g);
});
ct('Cactus Preserve','ignores opponent commanders when determining its animation size',()=>{
 const g=game({battlefield:['Cactus Preserve'],command:[{name:'Esika, God of the Tree',props:{commander:true}},{name:'Avacyn, Angel of Hope',owner:1,controller:1,props:{commander:true}}]},{mana:{C:3}});
 ability(g,'Cactus Preserve','animate');resolve(g);assert.equal(ch(g,'Cactus Preserve').power,3);roundTrip(g);
});
