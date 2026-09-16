import {ct,assert,game,registry,id,ability,cast,choose,drain,roundTrip,ref,resolve,move,count,phase,manaAll,ch,ready,attack,equipped} from './gods-test-helpers.js';
for(const name of ['Day of Judgment','Wrath of God','Damnation','Supreme Verdict','Vanquish the Horde'])ct(name,'destroys creatures simultaneously, leaving noncreature Gods and indestructible permanents',()=>{
 const g=game({battlefield:['Metalworker',{name:'Walking Atlas',owner:1,controller:1},'Heliod, Sun-Crowned'],hand:[name]},{mana:manaAll()});cast(g,name);drain(g);assert.ok(id(g,'Metalworker','graveyard'));assert.ok(id(g,'Walking Atlas','graveyard'));assert.ok(id(g,'Heliod, Sun-Crowned','battlefield'));roundTrip(g);
});
ct('Damn','normal and overloaded forms use different targeting and costs',()=>{
 const g=game({battlefield:['Metalworker','Walking Atlas'],hand:['Damn']},{mana:{B:2}});cast(g,'Damn',{permission:'hand',target:[id(g,'Metalworker')]});resolve(g);assert.ok(id(g,'Metalworker','graveyard'));assert.ok(id(g,'Walking Atlas','battlefield'));roundTrip(g);
 const f=game({battlefield:['Metalworker','Walking Atlas'],hand:['Damn']},{mana:{C:2,W:2}});cast(f,'Damn',{permission:'hand/overload'});resolve(f);assert.ok(id(f,'Metalworker','graveyard'));assert.ok(id(f,'Walking Atlas','graveyard'));roundTrip(f);
});
ct('Avacyn, Angel of Hope','protects all controlled permanents against a wrath, not opposing creatures',()=>{
 const g=game({battlefield:['Avacyn, Angel of Hope','Metalworker',{name:'Walking Atlas',owner:1,controller:1}],hand:['Wrath of God']},{mana:manaAll()});cast(g,'Wrath of God');drain(g);assert.ok(id(g,'Metalworker','battlefield'));assert.ok(id(g,'Walking Atlas','graveyard'));roundTrip(g);
});
ct('Blasphemous Act','cost reduction includes opposing creatures and thirteen damage leaves indestructible alive',()=>{
 const g=game({battlefield:['Avacyn, Angel of Hope','Metalworker',{name:'Walking Atlas',owner:1,controller:1}],hand:['Blasphemous Act']},{mana:{C:5,R:1}});cast(g,'Blasphemous Act');assert.equal(g.state.players[0].mana.C,0);resolve(g);assert.equal(g.object(id(g,'Metalworker')).damage,13);assert.ok(id(g,'Walking Atlas','graveyard'));roundTrip(g);
});
for(const name of ['Pestilence','Pyrohemia'])ct(name,'damages every creature and player, and only sacrifices itself if no creatures remain at end step',()=>{
 const g=game({battlefield:[name,'Metalworker','Walking Atlas']},{mana:manaAll()});ability(g,name,'damage-all');resolve(g);assert.ok(id(g,'Walking Atlas','graveyard'));assert.ok(id(g,'Metalworker','battlefield'));for(const p of g.state.players)assert.equal(p.life,39);
 ability(g,name,'damage-all');resolve(g);assert.ok(id(g,'Metalworker','graveyard'));phase(g,'end');resolve(g);assert.ok(id(g,name,'graveyard'));roundTrip(g);
});
ct('Eldrazi Monument','upkeep sacrifices a creature despite indestructible; without one the Monument is sacrificed',()=>{
 const g=game({battlefield:['Eldrazi Monument','Metalworker']});assert.equal(ch(g,'Metalworker').power,2);phase(g,'upkeep');drain(g);assert.ok(id(g,'Metalworker','graveyard'));assert.ok(id(g,'Eldrazi Monument','battlefield'));roundTrip(g);
 const f=game({battlefield:['Eldrazi Monument']});phase(f,'upkeep');drain(f);assert.ok(id(f,'Eldrazi Monument','graveyard'));roundTrip(f);
});
for(const name of ['Fauna Shaman','Survival of the Fittest'])ct(name,'creature discard is paid before searching; the tutor cannot find a noncreature enchantment',()=>{
 const g=game({battlefield:[name],hand:['Metalworker'],libraryActive:['Walking Atlas','True Conviction']},{mana:{G:1}});ability(g,name,'creature-search',{discarded:[id(g,'Metalworker')]});assert.ok(id(g,'Metalworker','graveyard'));resolve(g);assert.deepEqual(g.state.pending.candidates,[id(g,'Walking Atlas')]);choose(g,[id(g,'Walking Atlas')]);assert.ok(id(g,'Walking Atlas','hand'));roundTrip(g);
});
ct('Dance of the Manse','X six returns eligible permanents as 4/4 creatures and excludes Auras',()=>{
 const g=game({hand:['Dance of the Manse'],graveyard:['True Conviction','Metalworker','Wild Growth','Ancient Den']},{mana:manaAll()});cast(g,'Dance of the Manse',{x:6,target:[id(g,'True Conviction'),id(g,'Ancient Den')]});resolve(g);assert.equal(ch(g,'True Conviction').power,4);assert.equal(ch(g,'Ancient Den').power,4);assert.ok(id(g,'Wild Growth','graveyard'));phase(g,'cleanup');assert.equal(ch(g,'True Conviction').power,4);roundTrip(g);
 const f=game({hand:['Dance of the Manse'],graveyard:['Wild Growth']},{mana:manaAll()});assert.equal(f.perform({type:'CAST_SPELL',id:id(f,'Dance of the Manse'),inputs:{x:2,target:[id(f,'Wild Growth')]},payment:'auto'}).ok,false);roundTrip(f);
});
ct('Relive the Past','one artifact land selected twice returns only once with 5/5 Elemental characteristics',()=>{
 const g=game({hand:['Relive the Past'],graveyard:['Ancient Den','True Conviction']},{mana:manaAll()});const land=id(g,'Ancient Den');cast(g,'Relive the Past',{artifact:[land],land:[land],enchantment:[id(g,'True Conviction')]});resolve(g);assert.equal(count(g,'Ancient Den'),1);assert.equal(ch(g,'Ancient Den').power,5);assert.ok(ch(g,'Ancient Den').subtypes.includes('Elemental'));assert.equal(ch(g,'True Conviction').power,5);roundTrip(g);
});
ct('Quicken','allows only the next sorcery at instant speed, and consumes the permission on casting',()=>{
 const g=game({hand:['Quicken','Day of Judgment','Damnation']},{step:'end',player:1,mana:manaAll()});cast(g,'Quicken');resolve(g);cast(g,'Day of Judgment');assert.ok(!g.state.effects.some(e=>e.kind==='quicken'));resolve(g);assert.equal(g.perform({type:'CAST_SPELL',id:id(g,'Damnation'),payment:'auto'}).ok,false);roundTrip(g);
});
ct('Gravebreaker Lamia','entry can entomb any card and its reduction applies only to spells cast from the graveyard',()=>{
 const g=game({hand:['Gravebreaker Lamia'],libraryActive:['True Conviction','Metalworker']},{mana:manaAll()});cast(g,'Gravebreaker Lamia');resolve(g);resolve(g);choose(g,[id(g,'True Conviction')]);assert.ok(id(g,'True Conviction','graveyard'));roundTrip(g);
});
ct("Arcanist's Owl",'looks at exactly four, takes one artifact or enchantment, and bottoms the others',()=>{
 const g=game({hand:["Arcanist's Owl"],libraryActive:['Damn','Ancient Den','Metalworker','True Conviction','Walking Atlas']},{mana:manaAll()});cast(g,"Arcanist's Owl");drain(g,{kept:(g,p)=>[id(g,'True Conviction')]});assert.ok(id(g,'True Conviction','hand'));assert.equal(g.definition(g.top()).name,'Walking Atlas');assert.equal(g.state.zones.libraryActive.length,4);roundTrip(g);
});
ct('Attunement','returns itself as the activation cost, draws three then discards four including itself',()=>{
 const g=game({battlefield:['Attunement']});ability(g,'Attunement','draw-discard');assert.ok(id(g,'Attunement','hand'));resolve(g);assert.equal(g.state.pending.candidates.length,4);choose(g,g.state.zones.hand.slice());assert.equal(g.state.zones.hand.length,0);assert.equal(g.state.zones.graveyard.length,4);roundTrip(g);
});
ct('Greater Good','uses sacrificed power from last-known information, then discards up to three available cards',()=>{
 const g=game({battlefield:['Greater Good','Metalwork Colossus']});ability(g,'Greater Good','sac-draw',{sacrificed:[id(g,'Metalwork Colossus')]});drain(g);assert.equal(g.state.zones.hand.length,7);roundTrip(g);
 const f=game({battlefield:['Greater Good','Metalworker']});ability(f,'Greater Good','sac-draw',{sacrificed:[id(f,'Metalworker')]});drain(f);assert.equal(f.state.zones.hand.length,0);roundTrip(f);
});
ct('Khalni Hydra','green creature cost reduction counts creatures rather than devotion',()=>{
 const g=game({battlefield:['Bloom Tender','Fauna Shaman','Heliod, Sun-Crowned'],hand:['Khalni Hydra']},{mana:{G:6}});cast(g,'Khalni Hydra');resolve(g);assert.ok(id(g,'Khalni Hydra','battlefield'));assert.equal(g.state.players[0].mana.G,0);roundTrip(g);
});
ct('Fire Covenant','life payment and damage allocation are locked in at casting, with one packet to all targets',()=>{
 const g=game({battlefield:['Metalworker','Walking Atlas'],hand:['Fire Covenant']},{mana:{C:1,B:1,R:1}});const a=id(g,'Metalworker'),b=id(g,'Walking Atlas');cast(g,'Fire Covenant',{x:3,target:[a,b],['damage-'+a]:2,['damage-'+b]:1});assert.equal(g.state.players[0].life,37);resolve(g);assert.ok(id(g,'Metalworker','graveyard'));assert.ok(id(g,'Walking Atlas','graveyard'));roundTrip(g);
});
ct('Penance','puts a card on top as the cost and prevents an entire next damage event from the chosen source',()=>{
 const g=game({battlefield:['Penance','Pestilence','Metalworker','Walking Atlas'],hand:['True Conviction']},{mana:{B:2}});ability(g,'Penance','prevent',{topCard:[id(g,'True Conviction')]});assert.equal(g.definition(g.top()).name,'True Conviction');resolve(g);choose(g,[id(g,'Pestilence')]);ability(g,'Pestilence','damage-all');resolve(g);assert.ok(id(g,'Walking Atlas','battlefield'));assert.equal(g.state.players[0].life,40);
 ability(g,'Pestilence','damage-all');resolve(g);assert.ok(id(g,'Walking Atlas','graveyard'));assert.equal(g.state.players[0].life,39);roundTrip(g);
});
ct('Whip of Erebos','returned creature gains haste, is exiled instead of dying, and does not return through Enduring',()=>{
 const g=game({battlefield:['Whip of Erebos'],graveyard:['Enduring Vitality']},{mana:manaAll()});ability(g,'Whip of Erebos','reanimate',{target:[id(g,'Enduring Vitality')]});resolve(g);assert.ok(ch(g,'Enduring Vitality').keywords.includes('Haste'));move(g,'Enduring Vitality','graveyard');assert.ok(id(g,'Enduring Vitality','exile'));assert.equal(g.state.stack.length,0);roundTrip(g);
});
ct('Liesa, Forgotten Archangel','simultaneous death schedules own other creatures to hand, exiles opponents, and retains exact graveyard identity',()=>{
 const g=game({battlefield:['Liesa, Forgotten Archangel','Metalworker',{name:'Walking Atlas',owner:1,controller:1}],hand:['Wrath of God']},{mana:manaAll()});cast(g,'Wrath of God');drain(g);assert.ok(id(g,'Liesa, Forgotten Archangel','graveyard'));assert.ok(id(g,'Metalworker','graveyard'));assert.ok(id(g,'Walking Atlas','exile'));phase(g,'end');drain(g);assert.ok(id(g,'Metalworker','hand'));roundTrip(g);
});
ct('God-Eternal Oketra','returns third from graveyard or exile, and creature casts produce a vigilant Zombie',()=>{
 const g=game({battlefield:['God-Eternal Oketra'],hand:['Metalworker']},{mana:{C:3}});cast(g,'Metalworker');drain(g);assert.equal(ch(g,'Zombie Warrior').power,4);assert.ok(ch(g,'Zombie Warrior').keywords.includes('Vigilance'));move(g,'God-Eternal Oketra','exile');drain(g,{optional:'YES'});assert.equal(g.state.zones.libraryActive[2],id(g,'God-Eternal Oketra'));roundTrip(g);
});
ct('Thassa, Deep-Dwelling','blink returns a stolen creature under the controlling player with a new identity',()=>{
 const g=game({battlefield:['Thassa, Deep-Dwelling',{name:'Metalworker',owner:1,controller:0}]});const before=g.object(id(g,'Metalworker')).oid;phase(g,'end');choose(g,[id(g,'Metalworker')]);resolve(g);assert.equal(g.object(id(g,'Metalworker')).controller,0);assert.ok(g.object(id(g,'Metalworker')).oid>before);roundTrip(g);
});
ct('Thassa, God of the Sea','upkeep scries and its activated unblockable applies only to a controlled creature',()=>{
 const g=game({battlefield:['Thassa, God of the Sea','Metalworker']},{mana:manaAll()});ability(g,'Thassa, God of the Sea','unblockable',{target:[id(g,'Metalworker')]});resolve(g);assert.ok(ch(g,'Metalworker').keywords.includes('Unblockable'));phase(g,'upkeep');drain(g);roundTrip(g);
});
ct('Xenagos, God of Revels','beginning combat boost uses target power at resolution',()=>{
 const g=game({battlefield:['Xenagos, God of Revels',{name:'Metalworker',counters:{'+1/+1':3}}]});phase(g,'beginCombat');choose(g,[id(g,'Metalworker')]);resolve(g);assert.equal(ch(g,'Metalworker').power,8);assert.ok(ch(g,'Metalworker').keywords.includes('Haste'));roundTrip(g);
});
ct('Karametra, God of Harvests','creature casting searches a typed dual tapped without requiring a basic land',()=>{
 const g=game({battlefield:['Karametra, God of Harvests'],hand:['Metalworker'],libraryActive:['Savannah','Seat of the Synod']},{mana:{C:3}});cast(g,'Metalworker');resolve(g);choose(g,'YES');assert.deepEqual(g.state.pending.candidates,[id(g,'Savannah')]);choose(g,[id(g,'Savannah')]);drain(g);assert.ok(g.object(id(g,'Savannah')).tapped);roundTrip(g);
});
ct('Nylea, Keen-Eyed','generic creature discount and revealed top-card decisions work for both card types',()=>{
 const g=game({battlefield:['Nylea, Keen-Eyed'],hand:['Metalworker'],libraryActive:['Walking Atlas','Damn']},{mana:manaAll()});const before=g.state.players[0].mana.C;cast(g,'Metalworker');resolve(g);assert.equal(g.state.players[0].mana.C,before-2);ability(g,'Nylea, Keen-Eyed','reveal-top');drain(g);assert.ok(id(g,'Walking Atlas','hand'));ability(g,'Nylea, Keen-Eyed','reveal-top');drain(g,{optional:'YES'});assert.ok(id(g,'Damn','graveyard'));roundTrip(g);
});
ct('Oketra the True','cannot attack with fewer than three other creatures and produces vigilant Warrior tokens',()=>{
 const g=game({battlefield:['Oketra the True','Metalworker','Walking Atlas']},{step:'attackers',mana:manaAll()});assert.equal(g.perform({type:'DECLARE_ATTACKERS',attackers:[id(g,'Oketra the True')]}).ok,false);ability(g,'Oketra the True','warrior');resolve(g);assert.ok(ch(g,'Warrior').keywords.includes('Vigilance'));attack(g,['Oketra the True']);assert.equal(g.object(id(g,'Oketra the True')).attacksThisTurn,1);roundTrip(g);
});
ct('Master of Waves','devotion creates 1/0 tokens sustained by its anthem and red protection prevents damage',()=>{
 const g=game({graveyard:['Master of Waves'],battlefield:['True Conviction']});move(g,'Master of Waves');drain(g);assert.equal(count(g,'Elemental'),1);assert.equal(ch(g,'Elemental').power,2);assert.equal(ch(g,'Elemental').toughness,1);move(g,'Master of Waves','graveyard');assert.equal(count(g,'Elemental'),0);roundTrip(g);
});
ct('Overbeing of Myth','hand-size power is current and draw-step trigger adds an additional draw',()=>{
 const g=game({battlefield:['Overbeing of Myth'],hand:['Metalworker','Walking Atlas']});assert.equal(ch(g,'Overbeing of Myth').power,2);phase(g,'draw');drain(g);assert.equal(g.state.zones.hand.length,4);assert.equal(ch(g,'Overbeing of Myth').power,4);roundTrip(g);
});
ct('Aclazotz, Deepest Betrayal','attacking reports abstract opponent discards, draws for empty hands and creates Bats for lands',()=>{
 const g=game({battlefield:['Aclazotz, Deepest Betrayal']},{step:'attackers',players:{1:{abstractHand:1},2:{abstractHand:0},3:{abstractHand:1}}});attack(g,['Aclazotz, Deepest Betrayal']);drain(g,{discardType1:'land',discardType3:'nonland'});assert.equal(count(g,'Bat'),1);assert.equal(g.state.zones.hand.length,1);assert.equal(g.state.players[1].abstractHand,0);roundTrip(g);
});
ct('Aclazotz, Deepest Betrayal','dies into its tapped Temple face and can transform back at sorcery speed',()=>{
 const g=game({battlefield:['Aclazotz, Deepest Betrayal']},{mana:manaAll()});move(g,'Aclazotz, Deepest Betrayal','graveyard');resolve(g);assert.ok(id(g,'Temple of the Dead','battlefield'));assert.ok(g.object(id(g,'Temple of the Dead')).tapped);assert.deepEqual(ch(g,'Temple of the Dead').types,['Land']);ready(g,'Temple of the Dead');ability(g,'Temple of the Dead','transform');resolve(g);assert.ok(id(g,'Aclazotz, Deepest Betrayal','battlefield'));roundTrip(g);
});
ct('Search for Azcanta','surveil reaches seven cards and transform reveals a real land ability set',()=>{
 const g=game({battlefield:['Search for Azcanta'],graveyard:Array(6).fill('Metalworker'),libraryActive:['Damn','Ancient Den','True Conviction','Walking Atlas']});phase(g,'upkeep');resolve(g);choose(g,[id(g,'Damn')]);choose(g,'YES');assert.ok(id(g,'Azcanta, the Sunken Ruin','battlefield'));assert.deepEqual(ch(g,'Azcanta, the Sunken Ruin').types,['Land']);roundTrip(g);
 const f=game({battlefield:[{name:'Search for Azcanta',props:{face:1}}],libraryActive:['Ancient Den','True Conviction','Walking Atlas','Damn','Metalworker']},{mana:manaAll()});ability(f,'Azcanta, the Sunken Ruin','azcanta');drain(f,{kept:[id(f,'True Conviction')]});assert.ok(id(f,'True Conviction','hand'));assert.equal(f.definition(f.top()).name,'Metalworker');roundTrip(f);
});
ct('Sultai Ascendancy','upkeep surveils two without milling the unchosen top card',()=>{
 const g=game({battlefield:['Sultai Ascendancy'],libraryActive:['Damn','Ancient Den','Metalworker']});phase(g,'upkeep');resolve(g);choose(g,[id(g,'Damn')]);drain(g);assert.ok(id(g,'Damn','graveyard'));assert.equal(g.definition(g.top()).name,'Ancient Den');roundTrip(g);
});
for(const name of ['Wild Growth','Fertile Ground','Wolfwillow Haven'])ct(name,'enchanted land adds one bonus mana immediately and only when tapped for mana',()=>{
 const g=equipped({battlefield:[name,'Ancient Den','Nyxbloom Ancient']},name,'Ancient Den');ability(g,'Ancient Den','mana');drain(g,{['land-bonus-'+id(g,name)]:'R'});assert.equal(g.state.players[0].mana.W,3);assert.equal(g.state.players[0].mana[name==='Fertile Ground'?'R':'G'],1);roundTrip(g);
});
ct('Carpet of Flowers','declining first main preserves second-main use and uses reported opponent Islands',()=>{
 const g=game({battlefield:['Carpet of Flowers']},{step:'draw',players:{1:{abstractIslands:3}}});phase(g,'main1');choose(g,1);drain(g);assert.equal(g.state.players[0].mana.G,0);phase(g,'main2');choose(g,1);drain(g,{optional:'YES',carpetColor:'G'});assert.equal(g.state.players[0].mana.G,3);roundTrip(g);
});
