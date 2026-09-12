import { assert,test,cardTest,board,registry,mana,id,ids,ability,cast,choose,drain,roundTrip,play,resolve,moveTurn,events,count,fresh,stateHash } from './expanded-test-support.js';
const inputMana=(g,name,colors)=>ability(g,name,'mana',colors);
for(const [name,cost,want,inputs={}]of [
 ['Sol Ring',{}, {C:2}],['Thran Dynamo',{}, {C:3}],['Gilded Lotus',{}, {G:3},{color:'G'}],
 ['Azorius Signet',{C:1},{W:1,U:1}],['Boros Signet',{C:1},{W:1,R:1}],['Selesnya Signet',{C:1},{W:1,G:1}],
 ['Arcane Signet',{}, {B:1},{color:'B'}],['Command Tower',{}, {R:1},{color:'R'}],
 ['Tundra',{}, {U:1},{color:'U'}],['Tropical Island',{}, {G:1},{color:'G'}],['Volcanic Island',{}, {R:1},{color:'R'}],
 ['Lotus Petal',{}, {W:1},{color:'W'}],['Chromatic Star',{C:1},{U:1},{color:'U'}],
 ['Vessel of Volatility',{C:1,R:1},{R:4}],['Mox Jasper',{}, {B:1},{color:'B'}],
 ['Mox Tantalite',{}, {R:1},{color:'R'}],['Lotus Bloom',{}, {U:3},{color:'U'}],['Sol Talisman',{}, {C:2}],
 ['Omni-Cheese Pizza',{C:1},{G:1},{color:'G'}],
 ])cardTest(name,'mana ability uses the printed costs and produces exact mana without the stack',()=>{
 const g=board({battlefield:[name,...(name==='Mox Jasper'?['Amareth, the Lustrous']:[])],command:['The Wandering Minstrel']},{mana:cost});
 inputMana(g,name,inputs);
 const pool=g.state.players[0].mana;for(const [c,n]of Object.entries(pool))assert.equal(n,want[c]||0,c);
 assert.equal(g.state.stack.some(s=>s.kind==='ability'),false);
 const sacrificed=['Lotus Petal','Lotus Bloom','Chromatic Star','Vessel of Volatility','Omni-Cheese Pizza'].includes(name);
 assert.equal(!!id(g,name,'graveyard'),sacrificed);
 if(!sacrificed)assert.equal(g.object(id(g,name)).tapped,true);
 drain(g);if(name==='Chromatic Star')assert.equal(g.state.zones.hand.length,1);
 roundTrip(g);
});
cardTest('Terrarion','two different colors, ETB tapped, and separate graveyard draw',()=>{
 const g=board({hand:['Terrarion']},{mana:{C:3}});cast(g,'Terrarion');drain(g);assert.equal(g.object(id(g,'Terrarion')).tapped,true);
 moveTurn(g);drain(g);g.act({type:'ADJUST_MANA',color:'C',delta:2});
 ability(g,'Terrarion','mana',{firstColor:'W',secondColor:'U'});assert.equal(g.state.players[0].mana.W,1);assert.equal(g.state.players[0].mana.U,1);assert.equal(g.state.stack.length,1);
 resolve(g);assert.equal(g.state.zones.hand.length,2);roundTrip(g);
});
for(const [name,colors]of [['Boros Garrison',['R','W']],['Orzhov Basilica',['W','B']]])cardTest(name,'enters tapped, returns another land, then produces its two printed colors',()=>{
 const g=board({hand:[name],battlefield:['Ancient Den']});play(g,name);assert.equal(g.object(id(g,name)).tapped,true);resolve(g);choose(g,[id(g,'Ancient Den')]);assert.ok(id(g,'Ancient Den','hand'));
 moveTurn(g);drain(g);ability(g,name,'mana');for(const c of colors)assert.equal(g.state.players[0].mana[c],1);roundTrip(g);
});
for(const name of ['Temple of Mystery','Temple of Enlightenment','Temple of Epiphany'])cardTest(name,'scry does not draw and land enters tapped',()=>{
 const g=board({hand:[name],libraryActive:['Sol Ring','Ancient Den','Tree of Tales']});const first=g.top().id;play(g,name);assert.equal(g.object(id(g,name)).tapped,true);resolve(g);assert.deepEqual(g.state.pending.candidates,[first]);choose(g,[first]);drain(g);assert.notEqual(g.top().id,first);assert.equal(g.state.zones.hand.length,0);roundTrip(g);
});
for(const [name,land]of [['Misty Rainforest','Tropical Island'],['Scalding Tarn','Volcanic Island']])cardTest(name,'pays life and sacrifice before fetching only the specified land types',()=>{
 const g=board({battlefield:[name],libraryActive:[land,'Ancient Den','Mox Opal']});ability(g,name,'fetch');assert.equal(g.state.players[0].life,39);assert.ok(id(g,name,'graveyard'));resolve(g);
 const p=g.state.pending;assert.ok(p.candidates.includes(id(g,land)));assert.ok(!p.candidates.includes(id(g,'Ancient Den')));choose(g,[id(g,land)]);assert.ok(id(g,land,'battlefield'));roundTrip(g);
});
cardTest('Glimmervoid','sacrifices at end only if no artifacts remain; intervening condition rechecks',()=>{
 const g=board({battlefield:['Glimmervoid']});g.act({type:'ADVANCE_PHASE',step:'end'});drain(g);assert.ok(id(g,'Glimmervoid','graveyard'));
 const h=board({battlefield:['Glimmervoid','Ancient Den']});h.act({type:'ADVANCE_PHASE',step:'end'});drain(h);assert.ok(id(h,'Glimmervoid','battlefield'));roundTrip(g);roundTrip(h);
});
cardTest("Lion's Eye Diamond",'discards entire hand, adds three mana, and cannot activate while paying a spell',()=>{
 const g=board({battlefield:["Lion's Eye Diamond"],hand:['Ancient Den','Walking Atlas']});ability(g,"Lion's Eye Diamond",'mana',{color:'G',discardHand:[...g.state.zones.hand]});assert.equal(g.state.players[0].mana.G,3);assert.equal(g.state.zones.hand.length,0);assert.equal(g.state.zones.graveyard.length,3);roundTrip(g);
 const h=board({battlefield:["Lion's Eye Diamond"],hand:['Walking Atlas']});h.act({type:'CAST_SPELL',id:id(h,'Walking Atlas')});const before=stateHash(h.state);
 assert.equal(h.perform({type:'ACTIVATE_ABILITY',id:id(h,"Lion's Eye Diamond"),abilityId:'mana',inputs:{color:'U',discardHand:[...h.state.zones.hand]}}).ok,false);assert.equal(stateHash(h.state),before);h.act({type:'CANCEL'});roundTrip(h);
});
for(const [name,source,cost,gain]of [['Zuran Orb','Ancient Den',{},2],['Claws of Gix','Manabond',{C:1},1]])cardTest(name,'sacrifice cost produces life automatically without a tap cost',()=>{
 const g=board({battlefield:[name,source]},{mana:cost});const a=registry.module(name).activated[0];ability(g,name,a.id,{sacrificed:[id(g,source)]});assert.ok(id(g,source,'graveyard'));assert.equal(g.state.players[0].life,40);resolve(g);assert.equal(g.state.players[0].life,40+gain);assert.equal(g.object(id(g,name)).tapped,false);roundTrip(g);
});
cardTest('Karn, Legacy Reforged','CDA includes itself; upkeep mana survives phases but cannot cast a nonartifact',()=>{
 const g=board({battlefield:['Karn, Legacy Reforged','Sol Ring','Ancient Den'],hand:['Exploration','Walking Atlas']},{step:'untap'});
 assert.equal(g.characteristics(id(g,'Karn, Legacy Reforged')).power,5);g.act({type:'ADVANCE_PHASE',next:true});drain(g);assert.equal(g.state.players[0].restrictedMana.reduce((n,x)=>n+x.amount,0),3);
 g.act({type:'ADVANCE_PHASE',step:'main1'});drain(g);assert.equal(g.state.players[0].restrictedMana.reduce((n,x)=>n+x.amount,0),3);
 cast(g,'Walking Atlas');drain(g);assert.equal(g.state.players[0].restrictedMana[0].amount,1);g.act({type:'ADVANCE_PHASE',step:'main2'});assert.equal(g.state.players[0].restrictedMana[0].amount,1);
 assert.equal(g.perform({type:'CAST_SPELL',id:id(g,'Exploration'),payment:'auto'}).ok,false);g.act({type:'ADVANCE_PHASE',step:'end'});g.act({type:'ADVANCE_PHASE',next:true});g.act({type:'ADVANCE_PHASE',next:true});assert.equal(g.state.players[0].restrictedMana.length,0);roundTrip(g);
});
cardTest('Blinkmoth Urn','only first main phase of each player and only if untapped',()=>{
 const g=board({battlefield:['Blinkmoth Urn','Ancient Den'],libraryActive:[]},{step:'upkeep'});
 // A nonempty fixture library avoids unrelated draw-loss; this test enters main directly.
 const h=board({battlefield:['Blinkmoth Urn','Ancient Den']},{step:'draw'});h.act({type:'ADVANCE_PHASE',next:true});drain(h);assert.equal(h.state.players[0].mana.C,2);
 h.act({type:'ADVANCE_PHASE',step:'main2'});assert.equal(h.state.players[0].mana.C,0);assert.equal(h.state.stack.length,0);roundTrip(h);
 const t=board({battlefield:[{name:'Blinkmoth Urn',tapped:true},'Ancient Den']},{step:'draw'});t.act({type:'ADVANCE_PHASE',next:true});assert.equal(t.state.stack.length,0);roundTrip(t);
});
cardTest("Gonti's Aether Heart",'ETB energy and another artifact energy, then exile for an actual extra turn',()=>{
 const g=board({hand:["Gonti's Aether Heart",'Mox Opal']},{mana:{C:6}});cast(g,"Gonti's Aether Heart");drain(g);assert.equal(g.state.players[0].energy,2);cast(g,'Mox Opal');drain(g);assert.equal(g.state.players[0].energy,4);
 const h=board({battlefield:["Gonti's Aether Heart"]});h.state.players[0].energy=8;const q=fresh(h);ability(q,"Gonti's Aether Heart",'extra-turn');assert.equal(q.state.players[0].energy,0);assert.ok(id(q,"Gonti's Aether Heart",'exile'));resolve(q);
 q.act({type:'ADVANCE_PHASE',step:'cleanup'});q.act({type:'ADVANCE_PHASE',next:true});assert.equal(q.state.activePlayer,0);assert.equal(q.state.turnNumber,2);
 q.act({type:'ADVANCE_PHASE',step:'cleanup'});q.act({type:'ADVANCE_PHASE',next:true});assert.equal(q.state.activePlayer,1);roundTrip(q);roundTrip(g);
});
for(const [name,gain]of [['Nutrient Block',3],['Omni-Cheese Pizza',3]])cardTest(name,'food ability pays two, taps and sacrifices, then gains life; printed death draw remains separate',()=>{
 const g=board({battlefield:[name]},{mana:{C:2}});ability(g,name,'food');assert.ok(id(g,name,'graveyard'));assert.equal(g.state.players[0].mana.C,0);drain(g);assert.equal(g.state.players[0].life,43);assert.equal(g.state.zones.hand.length,name==='Nutrient Block'?1:0);roundTrip(g);
});
cardTest('Ichor Wellspring','draws once on entry and once when sacrificed',()=>{
 const g=board({battlefield:['Krark-Clan Ironworks'],hand:['Ichor Wellspring']},{mana:{C:2}});cast(g,'Ichor Wellspring');drain(g);assert.equal(g.state.zones.hand.length,1);
 ability(g,'Krark-Clan Ironworks','sacrifice',{sacrificed:[id(g,'Ichor Wellspring')]});drain(g);assert.equal(g.state.zones.hand.length,2);roundTrip(g);
});
cardTest('Origin Spellbomb','sacrifice creates a Myr, with optional W draw paid on the separate death trigger',()=>{
 const g=board({battlefield:['Origin Spellbomb']},{mana:{C:1,W:1}});ability(g,'Origin Spellbomb','myr');assert.equal(g.state.stack.length,2);resolve(g);assert.equal(g.state.pending.kind,'effectPayment');choose(g,'pay');resolve(g);assert.equal(count(g,'Myr'),1);assert.equal(g.state.zones.hand.length,1);roundTrip(g);
});
cardTest("Conjurer's Bauble",'zero-target activation can draw itself after it is put on the bottom through a distinct target',()=>{
 const g=board({battlefield:["Conjurer's Bauble"],graveyard:['Sol Ring'],libraryActive:[]});const ring=id(g,'Sol Ring');ability(g,"Conjurer's Bauble",'recycle',{target:[ring]});resolve(g);assert.ok(id(g,'Sol Ring','hand'));assert.ok(!g.state.players[0].failedDraw);roundTrip(g);
 const h=board({battlefield:["Conjurer's Bauble"]});ability(h,"Conjurer's Bauble",'recycle',{target:[]});resolve(h);assert.equal(h.state.zones.hand.length,1);roundTrip(h);
});
for(const name of ['Lotus Bloom','Mox Tantalite','Sol Talisman'])cardTest(name,'suspend three produces three upkeep removals and offers a legal free cast',()=>{
 const g=board({hand:[name]},{mana:{C:1}});assert.equal(g.perform({type:'CAST_SPELL',id:id(g,name),payment:'auto'}).ok,false);
 g.act({type:'SPECIAL_ACTION',id:id(g,name),special:'suspend',payment:'auto'});assert.equal(g.object(id(g,name)).counters.time,3);assert.equal(g.state.stack.length,0);
 for(let n=2;n>=0;n--){moveTurn(g,'upkeep');resolve(g);assert.equal(g.object(id(g,name)).counters.time,n);if(n){assert.equal(g.state.stack.length,0);}else {resolve(g);assert.equal(g.state.pending.kind,'castWindow');choose(g,[id(g,name)]);assert.ok(id(g,name,'stackCards'));resolve(g);assert.ok(id(g,name,'battlefield'));}}
 roundTrip(g);
});
