import {ct,assert,game,fixture,registry,id,ids,ability,cast,choose,drain,roundTrip,Engine,ref,resolve,move,play,ready,count,phase,attack,manaAll,ch,equipped} from './gods-test-helpers.js';

ct('Starfield of Nyx','animates only other non-Auras at five enchantments and keeps counters above base P/T',()=>{
 const g=game({battlefield:['Starfield of Nyx','True Conviction','Erebos, God of the Dead','Leyline of Anticipation','Kruphix, God of Horizons']});
 assert.ok(!ch(g,'Starfield of Nyx').types.includes('Creature'));assert.equal(ch(g,'True Conviction').power,6);
 move(g,'Leyline of Anticipation','graveyard');assert.ok(!ch(g,'True Conviction').types.includes('Creature'));
 phase(g,'upkeep');drain(g,{optional:'YES',target:[id(g,'Leyline of Anticipation')]});assert.ok(id(g,'Leyline of Anticipation','battlefield'));assert.equal(ch(g,'True Conviction').power,6);roundTrip(g);
});
ct('Opalescence','animates enchantments on both sides, excludes itself and Auras, and retains counters',()=>{
 const g=game({battlefield:['Opalescence',{name:'True Conviction',counters:{'+1/+1':2}},{name:'Leyline of Anticipation',owner:1,controller:1}]});
 assert.ok(!ch(g,'Opalescence').types.includes('Creature'));assert.equal(ch(g,'True Conviction').power,8);assert.equal(ch(g,'Leyline of Anticipation').power,4);
 move(g,'Opalescence','graveyard');assert.ok(!ch(g,'True Conviction').types.includes('Creature'));roundTrip(g);
});
ct('Opalescence','God type-changing and base-setting effects follow timestamp order',()=>{
 for(const godFirst of [true,false]){
  const g=game({graveyard:['Erebos, God of the Dead','Opalescence']});
  move(g,godFirst?'Erebos, God of the Dead':'Opalescence');move(g,godFirst?'Opalescence':'Erebos, God of the Dead');
  assert.equal(ch(g,'Erebos, God of the Dead').types.includes('Creature'),godFirst);assert.equal(ch(g,'Erebos, God of the Dead').power,4);roundTrip(g);
 }
});
ct('Bello, Bard of the Brambles','animates the right permanents only during its controller turn, granting real damage triggers',()=>{
 const g=game({battlefield:['Bello, Bard of the Brambles','True Conviction','Planar Bridge','Caduceus, Staff of Hermes','Scroll Rack']},{step:'attackers'});
 for(const name of ['True Conviction','Planar Bridge']){assert.equal(ch(g,name).power,4);assert.ok(ch(g,name).keywords.includes('Haste'));}
 assert.ok(!ch(g,'Caduceus, Staff of Hermes').types.includes('Creature'));assert.ok(!ch(g,'Scroll Rack').types.includes('Creature'));
 attack(g,['Planar Bridge']);phase(g,'damage');g.act({type:'GOLDFISH_COMBAT_DAMAGE'});drain(g);assert.equal(g.state.zones.hand.length,1);
 phase(g,'main1',1);assert.ok(!ch(g,'Planar Bridge').types.includes('Creature'));roundTrip(g);
});
ct('Zur, Eternal Schemer','animation persists after Zur leaves, and its live keyword grant does not',()=>{
 const g=game({battlefield:['Zur, Eternal Schemer','True Conviction']},{mana:manaAll()});ability(g,'Zur, Eternal Schemer','animate',{target:[id(g,'True Conviction')]});drain(g);
 assert.equal(ch(g,'True Conviction').power,6);for(const k of ['Deathtouch','Lifelink','Hexproof'])assert.ok(ch(g,'True Conviction').keywords.includes(k));
 move(g,'Zur, Eternal Schemer','graveyard');assert.equal(ch(g,'True Conviction').power,6);assert.ok(!ch(g,'True Conviction').keywords.includes('Hexproof'));roundTrip(g);
});
for(const name of ['Setessan Champion','Eidolon of Blossoms'])ct(name,'constellation responds to enchantment entries rather than casting and retains the resulting cards',()=>{
 const g=game({battlefield:[name],hand:['True Conviction']},{mana:manaAll()});cast(g,'True Conviction');assert.equal(g.state.stack.length,1);resolve(g);assert.equal(g.state.stack.length,1);drain(g);assert.equal(g.state.zones.hand.length,1);
 if(name==='Setessan Champion')assert.equal(g.object(id(g,name)).counters['+1/+1'],1);roundTrip(g);
});
ct("Sythis, Harvest's Hand",'cast trigger gains life and draws even before the enchantment resolves',()=>{
 const g=game({battlefield:["Sythis, Harvest's Hand"],hand:['True Conviction']},{mana:manaAll()});cast(g,'True Conviction');assert.equal(g.state.stack.length,2);resolve(g);assert.equal(g.lifeGained(0),1);assert.equal(g.state.zones.hand.length,1);assert.ok(id(g,'True Conviction','stackCards'));drain(g);roundTrip(g);
});
ct('Herald of the Pantheon','reduces generic enchantment costs and gains life on casting only',()=>{
 const g=game({battlefield:['Herald of the Pantheon'],hand:['True Conviction']},{mana:{W:3,C:2}});cast(g,'True Conviction');assert.equal(g.state.players[0].mana.C,0);resolve(g);assert.equal(g.lifeGained(0),1);drain(g);roundTrip(g);
});
ct('Tuvasa the Sunlit','counts enchantments and draws only for the first enchantment spell each turn',()=>{
 const g=game({battlefield:['Tuvasa the Sunlit'],hand:['True Conviction','Leyline of Anticipation']},{mana:manaAll()});assert.equal(ch(g,'Tuvasa the Sunlit').power,1);
 cast(g,'True Conviction');drain(g);assert.equal(ch(g,'Tuvasa the Sunlit').power,2);assert.equal(g.state.zones.hand.length,2);
 cast(g,'Leyline of Anticipation');drain(g);assert.equal(g.state.zones.hand.length,1);assert.equal(ch(g,'Tuvasa the Sunlit').power,3);roundTrip(g);
});
ct('Kestia, the Cultivator','bestow is an Aura cast, buffs the host, draws on attacks and becomes a creature when detached',()=>{
 const g=game({battlefield:['Metalworker','God-Eternal Oketra'],hand:['Kestia, the Cultivator']},{mana:manaAll()});
 cast(g,'Kestia, the Cultivator',{permission:'hand/bestow',target:[id(g,'Metalworker')]});assert.equal(g.state.stack.length,1);assert.ok(!ch(g,'Kestia, the Cultivator').types.includes('Creature'));resolve(g);
 assert.equal(ch(g,'Metalworker').power,5);assert.ok(g.object(id(g,'Kestia, the Cultivator')).attachedTo);phase(g,'attackers');attack(g,['Metalworker']);drain(g);assert.equal(g.state.zones.hand.length,1);
 move(g,'Metalworker','graveyard');assert.ok(ch(g,'Kestia, the Cultivator').types.includes('Creature'));assert.ok(!g.object(id(g,'Kestia, the Cultivator')).attachedTo);roundTrip(g);
});
ct('Kestia, the Cultivator','a bestow spell whose target disappears still resolves as a creature',()=>{
 const g=game({battlefield:['Metalworker'],hand:['Kestia, the Cultivator']},{mana:manaAll()});cast(g,'Kestia, the Cultivator',{permission:'hand/bestow',target:[id(g,'Metalworker')]});move(g,'Metalworker','graveyard');resolve(g);assert.ok(id(g,'Kestia, the Cultivator','battlefield'));assert.ok(ch(g,'Kestia, the Cultivator').types.includes('Creature'));roundTrip(g);
});
ct('Zur the Enchanter','an Aura searched into play chooses a legal attachment without casting or targeting',()=>{
 const g=game({battlefield:['Zur the Enchanter',{name:'Ancient Den',props:{modifications:[{keywords:['Shroud']}]}}],libraryActive:['Wild Growth','True Conviction']},{step:'attackers'});
 attack(g,['Zur the Enchanter']);resolve(g);choose(g,'YES');assert.deepEqual(g.state.pending.candidates,[id(g,'Wild Growth')]);choose(g,[id(g,'Wild Growth')]);assert.equal(g.state.pending.kind,'godsEntry');choose(g,[id(g,'Ancient Den')]);drain(g);
 assert.equal(g.object(id(g,'Wild Growth')).attachedTo.id,id(g,'Ancient Den'));roundTrip(g);
});
ct('Calix, Guided by Fate','constellation triggers on itself; combat copying is optional and usable only once per turn',()=>{
 const g=game({battlefield:['True Conviction'],graveyard:['Calix, Guided by Fate']});move(g,'Calix, Guided by Fate');drain(g,{target:[id(g,'Calix, Guided by Fate')]});assert.equal(g.object(id(g,'Calix, Guided by Fate')).counters['+1/+1'],1);
 phase(g,'beginCombat');phase(g,'attackers');g.act({type:'DEBUG_TAP',id:id(g,'Calix, Guided by Fate'),tapped:false});
 // Entered this turn: granting haste here is not needed by the copy, but the fixture must model a legally attacking creature.
 const h=game({battlefield:['Calix, Guided by Fate','True Conviction']},{step:'attackers'});attack(h,['Calix, Guided by Fate']);phase(h,'damage');h.act({type:'GOLDFISH_COMBAT_DAMAGE'});drain(h,{optional:'YES',calixEnchantment:[id(h,'True Conviction')],target:[id(h,'Calix, Guided by Fate')]});assert.equal(count(h,'True Conviction'),2);
 h.act({type:'GOLDFISH_COMBAT_DAMAGE'});drain(h,{optional:'YES'});assert.equal(count(h,'True Conviction'),2);roundTrip(h);roundTrip(g);
});
for(const name of ['Enduring Vitality','Enduring Curiosity','Enduring Courage','Enduring Innocence','Enduring Tenacity'])ct(name,'dies as a creature, returns as a noncreature enchantment, and does not return a second time unless animated',()=>{
 const g=game({battlefield:[name]});const old=g.object(id(g,name)).oid;move(g,name,'graveyard');assert.equal(g.state.stack.length,1);resolve(g);assert.ok(id(g,name,'battlefield'));assert.deepEqual(ch(g,name).types,['Enchantment']);assert.ok(g.object(id(g,name)).oid>old);
 move(g,name,'graveyard');assert.equal(g.state.stack.length,0);roundTrip(g);
});
ct('Enduring Courage','haste and +2 power apply to other entering creatures, not to itself',()=>{
 const g=game({battlefield:['Enduring Courage'],graveyard:['Metalworker']});move(g,'Metalworker');drain(g);assert.equal(ch(g,'Metalworker').power,3);assert.ok(ch(g,'Metalworker').keywords.includes('Haste'));assert.equal(ch(g,'Enduring Courage').power,3);roundTrip(g);
});
ct('Enduring Innocence','small-creature entry draws once each turn even for a simultaneous batch',()=>{
 const g=game({battlefield:['Enduring Innocence'],graveyard:['Metalworker','Walking Atlas']});g.act({type:'DEBUG_MOVE',ids:g.state.zones.graveyard.slice(),zone:'battlefield'});assert.equal(g.state.stack.length,1);drain(g);assert.equal(g.state.zones.hand.length,1);roundTrip(g);
});
ct('Enduring Curiosity','draws once for each creature that hits a player',()=>{
 const g=game({battlefield:['Enduring Curiosity','Metalworker','Walking Atlas']},{step:'attackers'});attack(g,['Metalworker','Walking Atlas']);phase(g,'damage');g.act({type:'GOLDFISH_COMBAT_DAMAGE'});drain(g);assert.equal(g.state.zones.hand.length,2);roundTrip(g);
});
ct('Odric, Lunarch Marshal','shares all present supported combat keywords at the beginning of each player combat',()=>{
 const g=game({battlefield:['Odric, Lunarch Marshal','Avacyn, Angel of Hope','Metalworker','True Conviction']});phase(g,'beginCombat',1);drain(g);for(const k of ['Flying','Vigilance','Indestructible','Double strike','Lifelink'])assert.ok(ch(g,'Metalworker').keywords.includes(k));
 move(g,'Avacyn, Angel of Hope','exile');assert.ok(ch(g,'Metalworker').keywords.includes('Flying'));phase(g,'cleanup',1);assert.ok(!ch(g,'Metalworker').keywords.includes('Flying'));roundTrip(g);
});
ct('Blade Historian','only attacking creatures receive double strike',()=>{
 const g=game({battlefield:['Blade Historian','Metalworker','Walking Atlas']},{step:'attackers'});attack(g,['Metalworker']);assert.ok(ch(g,'Metalworker').keywords.includes('Double strike'));assert.ok(!ch(g,'Walking Atlas').keywords.includes('Double strike'));roundTrip(g);
});
ct('Jodah, the Unifier','legendary count buffs and lesser legendary cast window work without recursing on library casts',()=>{
 const g=game({battlefield:['Jodah, the Unifier'],hand:['Esika, God of the Tree'],libraryActive:['True Conviction','Mox Amber','Ancient Den']},{mana:manaAll()});assert.equal(ch(g,'Jodah, the Unifier').power,6);
 cast(g,'Esika, God of the Tree',{permission:'hand'});resolve(g);assert.equal(g.state.pending.kind,'castWindow');choose(g,id(g,'Mox Amber'));drain(g);assert.ok(id(g,'Mox Amber','battlefield'));assert.equal(ch(g,'Jodah, the Unifier').power,7);assert.equal(g.definition(g.top()).name,'Ancient Den');roundTrip(g);
});
ct('Leyline of the Guildpact','adds colors but not devotion and grants five basic land mana choices',()=>{
 const g=game({battlefield:['Leyline of the Guildpact','Ancient Den','Metalworker']});assert.deepEqual(ch(g,'Metalworker').colors,['W','U','B','R','G']);assert.equal(g.devotion(0,'B'),1);for(const type of ['Plains','Island','Swamp','Mountain','Forest'])assert.ok(ch(g,'Ancient Den').subtypes.includes(type));
 assert.ok(g.abilities(id(g,'Ancient Den')).some(a=>a.mana));roundTrip(g);
});
ct('Leyline of Anticipation','allows noninstant spells on an opponent turn without changing card types',()=>{
 const g=game({battlefield:['Leyline of Anticipation'],hand:['Day of Judgment','Metalworker']},{player:1,step:'main1',mana:manaAll()});cast(g,'Metalworker');drain(g);cast(g,'Day of Judgment');drain(g);assert.ok(id(g,'Metalworker','graveyard'));roundTrip(g);
});
ct('Elven Chorus','allows creature casts from the top, not enchantment-only cards',()=>{
 const g=game({battlefield:['Elven Chorus'],libraryActive:['Metalworker','True Conviction']},{mana:manaAll()});g.act({type:'CAST_SPELL',id:id(g,'Metalworker'),payment:'auto'});drain(g);assert.ok(id(g,'Metalworker','battlefield'));assert.equal(g.perform({type:'CAST_SPELL',id:id(g,'True Conviction'),payment:'auto'}).ok,false);roundTrip(g);
});
ct('Bident of Thassa','damage draw is optional and activated attack requirement affects only opponents',()=>{
 const g=game({battlefield:['Bident of Thassa','Metalworker','Seat of the Synod','Ancient Den',{name:'Walking Atlas',controller:1,owner:1}]},{step:'attackers',mana:manaAll()});attack(g,['Metalworker']);phase(g,'damage');g.act({type:'GOLDFISH_COMBAT_DAMAGE'});drain(g,{optional:'YES'});assert.equal(g.state.zones.hand.length,1);ability(g,'Seat of the Synod','mana');ability(g,'Ancient Den','mana');ability(g,'Bident of Thassa','force-attacks');drain(g);assert.ok(ch(g,'Walking Atlas').keywords.includes('Attacks each combat if able'));assert.ok(!ch(g,'Metalworker').keywords.includes('Attacks each combat if able'));roundTrip(g);
});
ct('Hammer of Purphoros','sacrifices a land and creates a hasty 3/3 enchantment artifact Golem',()=>{
 const g=game({battlefield:['Hammer of Purphoros','Ancient Den']},{mana:manaAll()});ability(g,'Hammer of Purphoros','golem',{sacrificed:[id(g,'Ancient Den')]});drain(g);const c=ch(g,'Golem');assert.equal(c.power,3);for(const type of ['Artifact','Enchantment','Creature'])assert.ok(c.types.includes(type));assert.ok(c.keywords.includes('Haste'));roundTrip(g);
});
ct('Black Market Connections','executes any nonempty set of modes in printed order and pays all chosen life losses',()=>{
 const g=game({battlefield:['Black Market Connections']},{step:'draw'});phase(g,'main1');resolve(g);assert.equal(g.state.pending.min,1);choose(g,['treasure','draw','shapeshifter']);drain(g);assert.equal(g.state.players[0].life,34);assert.equal(g.state.zones.hand.length,1);assert.equal(count(g,'Treasure'),1);assert.equal(ch(g,'Shapeshifter').power,3);assert.ok(ch(g,'Shapeshifter').subtypes.includes('God'));roundTrip(g);
});
