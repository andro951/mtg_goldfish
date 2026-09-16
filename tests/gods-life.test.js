import {ct,assert,game,registry,id,ability,cast,choose,drain,roundTrip,ref,resolve,move,count,phase,manaAll,ch,equipped,gainLife} from './gods-test-helpers.js';

ct('Heliod, Sun-Crowned','lifegain can place counters on a noncreature enchantment; activated lifelink requires another creature',()=>{
 const g=game({battlefield:['Heliod, Sun-Crowned','True Conviction','Metalworker']},{mana:manaAll()});
 gainLife(g);drain(g,{target:[id(g,'True Conviction')]});assert.equal(g.object(id(g,'True Conviction')).counters['+1/+1'],1);
 assert.ok(!ch(g,'Heliod, Sun-Crowned').types.includes('Creature'));
 ability(g,'Heliod, Sun-Crowned','lifelink',{target:[id(g,'Metalworker')]});drain(g);assert.ok(ch(g,'Metalworker').keywords.includes('Lifelink'));roundTrip(g);
});
ct('Daxos, Blessed by the Sun','entry and simultaneous deaths use the right object identities and last-known creatures',()=>{
 const g=game({battlefield:['Daxos, Blessed by the Sun','Metalworker'],graveyard:['Walking Atlas']});
 assert.equal(ch(g,'Daxos, Blessed by the Sun').toughness,2);move(g,'Walking Atlas');drain(g);assert.equal(g.lifeGained(0),1);
 g.act({type:'DEBUG_MOVE',ids:g.state.zones.battlefield.slice(),zone:'graveyard'});assert.equal(g.state.stack.length,2);drain(g);assert.equal(g.lifeGained(0),3);roundTrip(g);
});
ct('Archangel of Thune','one life-gain event counters all current creatures but not noncreature Gods',()=>{
 const g=game({battlefield:['Archangel of Thune','Metalworker','Kruphix, God of Horizons']});gainLife(g);drain(g);
 assert.equal(g.object(id(g,'Metalworker')).counters['+1/+1'],1);assert.equal(g.object(id(g,'Archangel of Thune')).counters['+1/+1'],1);assert.equal(g.object(id(g,'Kruphix, God of Horizons')).counters['+1/+1']||0,0);roundTrip(g);
});
ct('Drogskol Reaver','draws once per lifegain event rather than once per point',()=>{
 const g=game({battlefield:['Drogskol Reaver']});gainLife(g);drain(g);assert.equal(g.state.zones.hand.length,1);assert.equal(g.lifeGained(0),2);roundTrip(g);
});
ct('Nykthos Paragon','declining does not consume its once-per-turn allowance; accepting uses the event amount',()=>{
 const g=game({battlefield:['Nykthos Paragon','Metalworker']});gainLife(g);drain(g);assert.equal(g.object(id(g,'Metalworker')).counters['+1/+1']||0,0);
 gainLife(g);drain(g,{optional:'YES'});assert.equal(g.object(id(g,'Metalworker')).counters['+1/+1'],2);
 gainLife(g);drain(g,{optional:'YES'});assert.equal(g.object(id(g,'Metalworker')).counters['+1/+1'],2);roundTrip(g);
});
ct('Rodolf Duskbringer','lifegain grants temporary indestructible and paying at end step creates a separate targeted trigger',()=>{
 const g=game({battlefield:['Rodolf Duskbringer','Vault of Whispers','Great Furnace'],graveyard:['Metalworker','Avacyn, Angel of Hope']},{mana:manaAll(),lifeGained:4});
 gainLife(g);drain(g);assert.ok(ch(g,'Rodolf Duskbringer').keywords.includes('Indestructible'));phase(g,'end');resolve(g);choose(g,'YES');choose(g,'B');ability(g,'Vault of Whispers','mana');ability(g,'Great Furnace','mana');choose(g,'pay');
 assert.ok(g.state.pending?.candidates.includes(id(g,'Metalworker')));assert.ok(!g.state.pending.candidates.includes(id(g,'Avacyn, Angel of Hope')));choose(g,[id(g,'Metalworker')]);
 assert.equal(g.state.stack.at(-1).abilityId,'rodolf-reflexive');assert.ok(id(g,'Metalworker','graveyard'));resolve(g);assert.ok(id(g,'Metalworker','battlefield'));
 phase(g,'cleanup');assert.ok(!ch(g,'Rodolf Duskbringer').keywords.includes('Indestructible'));roundTrip(g);
});
ct('Celestine, the Living Saint','uses life gained rather than net life and returns a legal target at own end step',()=>{
 const g=game({battlefield:['Celestine, the Living Saint'],graveyard:['Metalworker','Avacyn, Angel of Hope']},{life:10,lifeGained:3});
 const f=game({battlefield:['Celestine, the Living Saint'],graveyard:['Metalworker']},{player:1,step:'main2',lifeGained:3});phase(f,'end',1);assert.equal(f.state.stack.length,0);roundTrip(f);phase(g,'end',0);assert.ok(g.state.pending.candidates.includes(id(g,'Metalworker')));assert.ok(!g.state.pending.candidates.includes(id(g,'Avacyn, Angel of Hope')));
 choose(g,[id(g,'Metalworker')]);resolve(g);assert.ok(id(g,'Metalworker','battlefield'));roundTrip(g);
});
ct('Enduring Tenacity','targets one opponent for the full life-gain amount and its effect survives its death',()=>{
 const g=game({battlefield:['Enduring Tenacity']});gainLife(g);choose(g,2);move(g,'Enduring Tenacity','graveyard');drain(g);assert.equal(g.state.players[2].life,38);assert.equal(g.state.players[1].life,40);assert.deepEqual(ch(g,'Enduring Tenacity').types,['Enchantment']);roundTrip(g);
});
ct('Erebos, God of the Dead','prevents opposing life gain but not costs or its controller life gain',()=>{
 const g=game({battlefield:[{name:'Erebos, God of the Dead',owner:1,controller:1}]});gainLife(g);drain(g);assert.equal(g.state.players[0].life,40);assert.equal(g.lifeGained(0),0);roundTrip(g);
 const f=game({battlefield:['Erebos, God of the Dead']},{mana:manaAll()});gainLife(f);drain(f);ability(f,'Erebos, God of the Dead','draw');resolve(f);assert.equal(f.state.players[0].life,40);assert.equal(f.state.zones.hand.length,1);roundTrip(f);
});
for(const [name,threshold,tokenName,vigilance] of [['Crested Sunmare',1,'Horse',false],['Angelic Accord',4,'Angel',false],['Valkyrie Harbinger',4,'Angel',true],['Resplendent Angel',5,'Angel',true]]){
 ct(name,'checks the life-gain threshold at each player end step and creates its printed token',()=>{
  const g=game({battlefield:[name]},{lifeGained:threshold});phase(g,'end',1);drain(g);assert.equal(count(g,tokenName),1);const c=ch(g,tokenName);assert.equal(c.power,tokenName==='Horse'?5:4);assert.equal(c.keywords.includes('Vigilance'),vigilance);
  if(tokenName==='Horse')assert.ok(c.keywords.includes('Indestructible'));
  const f=game({battlefield:[name]},{lifeGained:threshold-1});phase(f,'end');assert.equal(f.state.stack.length,0);roundTrip(g);roundTrip(f);
 });
}
ct('Resplendent Angel','activated bonus is +2/+2 and lifelink until cleanup',()=>{
 const g=game({battlefield:['Resplendent Angel']},{mana:manaAll()});ability(g,'Resplendent Angel','pump');drain(g);assert.equal(ch(g,'Resplendent Angel').power,5);assert.ok(ch(g,'Resplendent Angel').keywords.includes('Lifelink'));phase(g,'cleanup');assert.equal(ch(g,'Resplendent Angel').power,3);roundTrip(g);
});
ct("Archon of Sun's Grace",'enchantment entry creates a 2/2 flying Pegasus whose granted lifelink ends when Archon leaves',()=>{
 const g=game({battlefield:["Archon of Sun's Grace"],graveyard:['True Conviction']});move(g,'True Conviction');drain(g);assert.equal(count(g,'Pegasus'),1);assert.equal(ch(g,'Pegasus').power,2);assert.ok(ch(g,'Pegasus').keywords.includes('Flying'));assert.ok(ch(g,'Pegasus').keywords.includes('Lifelink'));
 move(g,'True Conviction','graveyard');move(g,"Archon of Sun's Grace",'graveyard');assert.ok(!ch(g,'Pegasus').keywords.includes('Lifelink'));roundTrip(g);
});
for(const [name,threshold,bonus] of [['Serra Ascendant',30,5],['Divinity of Pride',25,4]])ct(name,'recomputes power at the life threshold without counters',()=>{
 const g=game({battlefield:[name]},{life:threshold-1});const before=ch(g,name).power;gainLife(g);drain(g);assert.equal(ch(g,name).power,before+bonus);assert.ok(ch(g,name).keywords.includes('Flying'));roundTrip(g);
});
ct('Shadowspear','equipped bonus works and stripping indestructible permits a subsequent destroy effect',()=>{
 const g=equipped({battlefield:['Shadowspear','Metalworker',{name:'Avacyn, Angel of Hope',owner:1,controller:1},{name:'Walking Atlas',owner:1,controller:1}],hand:['Damn']},'Shadowspear','Metalworker',{mana:manaAll()});
 assert.equal(ch(g,'Metalworker').power,2);assert.ok(ch(g,'Metalworker').keywords.includes('Lifelink'));assert.ok(ch(g,'Walking Atlas').keywords.includes('Indestructible'));
 ability(g,'Shadowspear','strip-protection');drain(g);assert.ok(!ch(g,'Walking Atlas').keywords.includes('Indestructible'));cast(g,'Damn',{target:[id(g,'Walking Atlas')]});drain(g);assert.ok(id(g,'Walking Atlas','graveyard'));roundTrip(g);
});
ct('Caduceus, Staff of Hermes','prevents damage and grants threshold bonuses only to its attached creature',()=>{
 const g=equipped({battlefield:['Caduceus, Staff of Hermes','Metalworker','Pyrohemia','Walking Atlas']},'Caduceus, Staff of Hermes','Metalworker',{mana:manaAll(),life:30});
 assert.equal(ch(g,'Metalworker').power,6);assert.ok(ch(g,'Metalworker').keywords.includes('Indestructible'));ability(g,'Pyrohemia','damage-all');resolve(g);assert.equal(g.object(id(g,'Metalworker')).damage,0);assert.ok(id(g,'Walking Atlas','graveyard'));
 assert.equal(g.state.players[0].life,29);assert.equal(ch(g,'Metalworker').power,1);assert.ok(ch(g,'Metalworker').keywords.includes('Lifelink'));assert.ok(!ch(g,'Metalworker').keywords.includes('Indestructible'));roundTrip(g);
});
ct('Amalia Benavides Aguirre','explores and wipes other creatures only at exactly twenty power',()=>{
 for(const counters of [17,18,19]){
  const g=game({battlefield:[{name:'Amalia Benavides Aguirre',counters:{'+1/+1':counters}},'Metalworker'],libraryActive:['Damn']});gainLife(g);drain(g);
  assert.equal(ch(g,'Amalia Benavides Aguirre').power,3+counters);assert.equal(!!id(g,'Metalworker','graveyard'),counters===17);roundTrip(g);
 }
});
ct('Amalia Benavides Aguirre','ward is a life payment and does not silently pay for the opponent',()=>{
 const g=game({battlefield:['Thassa, Deep-Dwelling',{name:'Amalia Benavides Aguirre',owner:1,controller:1}]},{mana:manaAll()});ability(g,'Thassa, Deep-Dwelling','tap',{target:[id(g,'Amalia Benavides Aguirre')]});assert.equal(g.state.stack.length,2);resolve(g);assert.ok(g.state.pending);choose(g,'decline');drain(g);assert.ok(!g.object(id(g,'Amalia Benavides Aguirre')).tapped);assert.equal(g.state.players[0].life,40);roundTrip(g);
});
ct('Well of Lost Dreams','bounds X by life gained and spends the chosen generic mana before drawing',()=>{
 const g=game({battlefield:['Well of Lost Dreams']},{mana:{C:2}});gainLife(g);resolve(g);assert.equal(g.state.pending.max,2);assert.equal(g.perform({type:'CHOOSE',value:3}).ok,false);choose(g,2);choose(g,'pay');assert.equal(g.state.zones.hand.length,2);assert.equal(g.state.players[0].mana.C,0);roundTrip(g);
});
ct('Veinwitch Coven','optional black payment returns a targeted creature to hand, not the battlefield',()=>{
 const g=game({battlefield:['Veinwitch Coven'],graveyard:['Metalworker']},{mana:{B:1}});gainLife(g);choose(g,[id(g,'Metalworker')]);resolve(g);choose(g,'pay');assert.ok(id(g,'Metalworker','hand'));assert.equal(g.state.players[0].mana.B,0);roundTrip(g);
});
ct('Cleric Class','level one adds one life, level two counters a creature, and level three returns and gains toughness',()=>{
 const g=game({battlefield:['Cleric Class','Metalworker'],graveyard:['Walking Atlas']},{mana:manaAll()});gainLife(g);drain(g);assert.equal(g.lifeGained(0),3);
 ability(g,'Cleric Class','level-2');resolve(g);gainLife(g);drain(g,{target:[id(g,'Metalworker')]});assert.equal(g.object(id(g,'Metalworker')).counters['+1/+1'],1);
 ability(g,'Cleric Class','level-3');resolve(g);choose(g,[id(g,'Walking Atlas')]);resolve(g);drain(g,{target:[id(g,'Metalworker')]});assert.ok(id(g,'Walking Atlas','battlefield'));assert.equal(g.lifeGained(0),8);roundTrip(g);
});
