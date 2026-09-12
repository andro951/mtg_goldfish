import { ref,sameRef,clone,asArray,unique } from '../core/util.js';
import { register,BF,GY,HAND,LIB,anyColor,colorInput,target,playerTarget,selfSacrifice,selfExile,sacrifice,tapOthers,discardCost,draw,choose,move,search,etb,upkeep,endStep,landfall,spellCast,mana,optional } from './helpers.js';
import { call,lands,artifacts,unionPermanents,graveTypes,gravePermanentCount,putLands,gyPermission,addLandPlays,attack,anyTarget,damageTo,deathDraw,artifactDeath,selfLeaves,entersType } from './expanded-shared.js';

export function installExpandedArtifacts(registry){
 const equipment=(cost)=>({id:'equip',label:`Equip ${cost}`,cost,sorcery:true,inputs:[target({...BF,creature:true})],effect:()=>[{op:'attach',target:'$input.target'}]});
 registry.grantedAbilities=new Map();
 const grant=(id,ability)=>registry.grantedAbilities.set(id,{...ability,id});
 grant('intrinsic-basic-mana',mana({}, {label:'Add mana from a basic land type',effectInputs:(g,s)=>[colorInput('color',Object.entries({Plains:'W',Island:'U',Swamp:'B',Mountain:'R',Forest:'G'}).filter(([t])=>g.characteristics(s).subtypes.includes(t)).map(([,c])=>c))],effect:(g,c)=>[{op:'mana',color:c.inputs.color}]}));
 grant('lantern-mana',mana({}, {label:'Chromatic Lantern — add any color',effectInputs:[colorInput()],effect:(g,c)=>[{op:'mana',color:c.inputs.color}]}));
 grant('worldtree-mana',mana({}, {label:'The World Tree — add any color',effectInputs:[colorInput()],effect:(g,c)=>[{op:'mana',color:c.inputs.color}]}));
 grant('stash-treasure',{label:'Bootleggers’ Stash — create a Treasure',tap:true,effect:()=>[{op:'token',card:'Treasure'}]});
 grant('thranduil-mana',mana({}, {label:'Thranduil — add green or blue',effectInputs:[colorInput('color',['G','U'])],effect:(g,c)=>[{op:'mana',color:c.inputs.color}]}));
 grant('rock-throw',{label:'Sacrifice attached Rock: deal 2 damage',cost:'{1}',tap:true,inputs:[anyTarget()],costs:(g,s)=>[{kind:'sacrifice',key:'rock',count:1,selector:{...BF,ids:g.controlled(s.controller).filter(o=>g.definition(o).name==='Rock'&&sameRef(o.attachedTo,s)).map(o=>o.id)}}],effect:()=>[damageTo(2)]});
 register(registry,'Chromatic Lantern',{possibleMana:anyColor,activated:[mana({}, {effectInputs:[colorInput()],effect:(g,c)=>[{op:'mana',color:c.inputs.color}]})],grants:[{ability:'lantern-mana',match:(g,s,o)=>s.controller===o.controller&&g.characteristics(o).types.includes('Land')}]});
 register(registry,'Bootleggers\' Stash',{grants:[{ability:'stash-treasure',match:(g,s,o)=>s.controller===o.controller&&g.characteristics(o).types.includes('Land')}]});
 register(registry,'The World Tree',{entersTapped:true,grants:[{ability:'worldtree-mana',match:(g,s,o)=>s.controller===o.controller&&lands(g,s.controller)>=6&&g.characteristics(o).types.includes('Land')}],activated:[{id:'gods',label:'Sacrifice The World Tree: search for any number of Gods',cost:'{W}{W}{U}{U}{B}{B}{R}{R}{G}{G}',tap:true,costs:[selfSacrifice],effect:()=>[search({subtype:'God'},'battlefield',{max:100000})]}]});
 register(registry,'Thranduil the Strategist',{grants:[{ability:'thranduil-mana',match:(g,s,o)=>!sameRef(s,o)&&s.controller===o.controller&&g.characteristics(o).subtypes.includes('Elf')}],triggers:[landfall('elf','Create a green Elf',()=>[{op:'token',card:'Elf'}])]});
 register(registry,'Rock',{activated:[equipment('{1}')],grants:[{ability:'rock-throw',match:(g,s,o)=>sameRef(s.attachedTo,o)}]});
 register(registry,'Clue',{activated:[{id:'clue',label:'Sacrifice Clue: draw a card',cost:'{2}',costs:[selfSacrifice],effect:()=>[draw()]}]});
 register(registry,'Gnome Soldier',{cda:(g,o,c)=>{c.power=c.toughness=unionPermanents(g,o.controller);}});
 register(registry,'Treefolk',{cda:(g,o,c)=>{c.power=c.toughness=lands(g,o.controller);}});
 register(registry,'Munitions',{triggers:[{id:'damage',label:'Munitions deals 2 damage to any target',event:'LEAVE',lookBack:true,test:selfLeaves,inputs:[anyTarget()],effect:()=>[damageTo(2)]}]});
 register(registry,'Amulet of Vigor',{triggers:[{id:'untap-entered',label:'Untap the permanent that entered tapped',event:'ENTER',test:(g,s,e)=>e.change.object.controller===s.controller&&e.change.object.tapped,effect:()=>[{op:'untap',ids:'$event.change.afterRef'}]}]});
 register(registry,'Arcbound Ravager',{entersCounters:{'+1/+1':1},activated:[{id:'sacrifice',label:'Sacrifice an artifact: put a +1/+1 counter on Ravager',costs:[sacrifice({...BF,artifact:true})],effect:()=>[{op:'counter',type:'+1/+1',amount:1}]}],triggers:[{id:'modular',label:'You may put these +1/+1 counters on target artifact creature',event:'LEAVE',lookBack:true,test:(g,s,e)=>selfLeaves(g,s,e)&&e.change.to==='graveyard',optional:true,inputs:[target({zones:['battlefield'],allTypes:['Artifact','Creature']})],effect:(g,c)=>[{op:'counter',ids:'$input.target',type:'+1/+1',amount:c.event.change.lki.counters['+1/+1']||0}]}]});
 register(registry,'Defense Grid',{spellTax:(g,s,o)=>g.state.activePlayer!==o.owner?3:0});
 register(registry,'Ensnaring Bridge',{attackAllowed:(g,s,o)=>g.characteristics(o).power<=(s.controller===0?g.state.zones.hand.length:g.state.players[s.controller].abstractHand)});
 register(registry,'Flayer Husk',{activated:[equipment('{2}')],statics:[{layer:7,match:(g,s,o)=>sameRef(s.attachedTo,o),apply:(g,s,o,c)=>{c.power++;c.toughness++;}}],triggers:[etb('living-weapon','Create a Germ, then attach Flayer Husk to it',()=>[{op:'token',card:'Phyrexian Germ',key:'germ'},{op:'attach',target:'$var.germ'}])]});
 register(registry,'Ghirapur Aether Grid',{activated:[{id:'damage',label:'Tap two untapped artifacts: deal 1 damage',costs:[tapOthers({...BF,artifact:true},2)],inputs:[anyTarget()],effect:()=>[damageTo(1)]}]});
 register(registry,'Implement of Combustion',{activated:[{id:'damage',label:'Sacrifice: deal 1 damage to target player or planeswalker',cost:'{R}',costs:[selfSacrifice],inputs:[anyTarget('target',1,1,{types:['Planeswalker']})],effect:()=>[damageTo(1)]}],triggers:[deathDraw()]});
 register(registry,'Need for Speed',{activated:[{id:'haste',label:'Sacrifice a land: target creature gains haste',costs:[sacrifice({...BF,land:true})],inputs:[target({zones:['battlefield'],creature:true})],effect:()=>[{op:'modify',ids:'$input.target',modification:{keywords:['Haste']}}]}]});
 const drawCast=(id,label,types,optionalEffect=false)=>spellCast(id,label,(g,s,e)=>types.some(t=>e.characteristics.types.includes(t)),()=>[draw(),...(optionalEffect?[{op:'call',handler:'common.loot'}]:[])],{optional:optionalEffect});
 register(registry,'Vedalken Archmage',{triggers:[drawCast('artifact-draw','Draw a card for the artifact spell',['Artifact'])]});
 register(registry,'Riddlesmith',{triggers:[drawCast('loot','You may draw a card, then discard a card',['Artifact'],true)]});
 register(registry,'Contraband Kingpin',{triggers:[{id:'scry',label:'Scry 1',event:'ENTER',test:entersType('Artifact'),effect:()=>[{op:'scry',count:1}]}]});
 register(registry,'Skyswimmer Koi',{triggers:[{id:'loot',label:'You may draw a card, then discard a card',event:'ENTER',test:entersType('Artifact'),optional:true,effect:()=>[draw(),{op:'call',handler:'common.loot'}]}]});
 register(registry,'Steelfin Whale',{costReduction:(g,o)=>artifacts(g,o.owner),triggers:[{id:'untap',label:'Untap Steelfin Whale',event:'ENTER',test:entersType('Artifact'),effect:()=>[{op:'untap',ids:'$source'}]}]});
 register(registry,'Simulacrum Synthesizer',{triggers:[etb('scry','Scry 2',()=>[{op:'scry',count:2}]),{id:'construct',label:'Create a Construct for another artifact with mana value at least 3',event:'ENTER',test:(g,s,e)=>entersType('Artifact')(g,s,e)&&!sameRef(s,e.change.afterRef)&&e.change.object.characteristics.manaValue>=3,effect:()=>[{op:'token',card:'Construct'}]}]});
 register(registry,'Weapons Manufacturing',{triggers:[{id:'munitions',label:'Create a Munitions token',event:'ENTER',test:(g,s,e)=>entersType('Artifact')(g,s,e)&&!e.change.object.token,effect:()=>[{op:'token',card:'Munitions'}]}]});
 register(registry,'Slagstone Refinery',{triggers:[{id:'powerstone',label:'Create a tapped Powerstone',event:'LEAVE',lookBack:true,test:(g,s,e)=>e.change.lki.controller===s.controller&&!e.change.lki.token&&e.change.lki.characteristics.types.includes('Artifact')&&['graveyard','exile'].includes(e.change.to),effect:()=>[{op:'token',card:'Powerstone',options:{tapped:true}}]}]});
 register(registry,'Mesmeric Orb',{triggers:[{id:'mill',label:'Untapped permanent’s controller mills one',event:'BECAME_UNTAPPED',effect:(g,c)=>[{op:'mill',count:1,player:c.event.controller??g.object(c.event.object)?.controller??c.controller}]}]});
 register(registry,'Up the Beanstalk',{triggers:[etb('draw','Draw a card',()=>[draw()]),spellCast('large-spell','Draw a card for a spell with mana value at least 5',(g,s,e)=>e.characteristics.manaValue>=5,()=>[draw()])]});
 register(registry,'Amareth, the Lustrous',{triggers:[{id:'look-top',label:'Look at top; you may take it if it shares a card type',event:'ENTER',test:(g,s,e)=>e.change.object.controller===s.controller&&!sameRef(s,e.change.afterRef),effect:()=>[{op:'look',count:1,key:'amareth'},call('amareth-take')]}]});
 registry.registerHandler('expanded.amareth-take',(g,c)=>{
  const id=c.vars.amareth[0];if(!id)return [];const match=g.characteristics(id).types.some(t=>c.event.change.object.characteristics.types.includes(t));
  return match?[{op:'choose',key:'amarethKeep',label:'You may reveal this card and put it into your hand',ids:[id],min:0,max:1,reveal:true},move('$var.amarethKeep','hand')]:[{op:'choose',key:'amarethSeen',label:'This card shares no card type; leave it on top',options:[{value:'done',label:'Done'}]}];
 });
 register(registry,'Akiri, Line-Slinger',{characteristics:(g,o,c)=>{if(o.zone==='battlefield')c.power+=artifacts(g,o.controller);}});
 register(registry,'Future Sight',{lookTop:true,revealTop:true,permissions:[{id:'top-all',label:'Future Sight — play the top card',zone:'libraryActive',land:true,spell:true,test:(g,s,o)=>sameRef(g.top(s.controller),o)}]});
 register(registry,'Mystic Forge',{lookTop:true,permissions:[{id:'top-artifact-colorless',label:'Mystic Forge — cast an artifact or colorless spell from the top',zone:'libraryActive',land:false,spell:true,test:(g,s,o)=>sameRef(g.top(s.controller),o)&&(g.characteristics(o).types.includes('Artifact')||!g.characteristics(o).colors.length)}],activated:[{id:'exile-top',label:'Pay 1 life: exile the top card',tap:true,life:1,effect:(g,c)=>g.top(c.controller)?[move(ref(g.top(c.controller)),'exile')]:[]}]});
 register(registry,'Saheeli, the Sun\'s Brilliance',{activated:[{id:'copy',label:'Create a hasty artifact copy; sacrifice it at next end step',cost:'{U}{R}',tap:true,inputs:[target({...BF,type:['Artifact','Creature'],another:true})],effect:()=>[call('saheeli-copy')]}]});
 registry.registerHandler('expanded.saheeli-copy',(g,c)=>{
  const o=g.object(c.inputs.target[0]);if(!o)return [];const ids=g.copyToken(o,c.controller,{addTypes:['Artifact']});
  const refs=ids.map(id=>ref(g.object(id)));for(const id of ids)g.object(id).modifications.push({keywords:['Haste']});
  g.state.delayed.push({id:`delayed-${g.state.nextId++}`,when:'nextEnd',controller:c.controller,label:'Sacrifice the temporary Saheeli copy',context:clone(c),program:[{op:'sacrifice',ids:refs}]});g.touch();return [];
 });
 register(registry,'Trading Post',{activated:[
  {id:'life',label:'Discard a card: gain 4 life',cost:'{1}',tap:true,costs:[discardCost()],effect:()=>[{op:'life',amount:4}]},
  {id:'goat',label:'Pay 1 life: create a Goat',cost:'{1}',tap:true,life:1,effect:()=>[{op:'token',card:'Goat'}]},
  {id:'recover',label:'Sacrifice a creature: return target artifact card to hand',cost:'{1}',tap:true,costs:[sacrifice({...BF,creature:true})],inputs:[target({...GY,artifact:true})],effect:()=>[move('$input.target','hand')]},
  {id:'draw',label:'Sacrifice an artifact: draw a card',cost:'{1}',tap:true,costs:[sacrifice({...BF,artifact:true})],effect:()=>[draw()]},
 ]});
 for(const [name,kind]of [["Mishra's Bauble",'library'],["Urza's Bauble",'hand']])register(registry,name,{activated:[{id:'look',label:`Sacrifice: look at ${kind==='library'?'the top library card':'a random hand card'}; draw next upkeep`,tap:true,costs:[selfSacrifice],inputs:[playerTarget()],effect:()=>[call('bauble-look',{kind}),{op:'delayed',when:'nextUpkeep',label:'Bauble — draw a card',program:[draw()]}]}]});
 registry.registerHandler('expanded.bauble-look',(g,c,cmd)=>{
  const p=c.inputs.player;let ids=[];
  if(cmd.kind==='library'){const o=g.top(p);if(o)ids=[o.id];}
  else {const hand=g.objects('hand',p);if(hand.length){ids=[g.randomShuffle(hand.map(o=>o.id),'Urza’s Bauble random card')[0]];}}
  g.record('LOOKED',{ids,player:p,zone:cmd.kind,abstract:!ids.length&&p!==0});
  if(!ids.length)return [];
  g.state.lookWorkspace={ids,label:cmd.kind==='library'?'Bauble — top card':'Bauble — random hand card',visibility:'private'};
  return [{op:'choose',key:'baubleSeen',label:'Viewed card (it stays in its current zone)',options:[{value:'done',label:'Done'}]}];
 });
 register(registry,'Surge Conductor',{triggers:[{id:'proliferate',label:'Proliferate',event:'ENTER',test:(g,s,e)=>entersType('Artifact')(g,s,e)&&!e.change.object.token&&!sameRef(s,e.change.afterRef),effect:()=>[call('proliferate')]}]});
 registry.registerHandler('expanded.proliferate',(g,c)=>{
  const options=[...g.objects('battlefield').filter(o=>Object.values(o.counters).some(n=>n>0)).map(o=>({value:o.id,label:g.definition(o).name})),...g.state.players.filter(p=>!p.lost&&(p.energy>0||p.poison>0||p.experience>0)).map(p=>({value:'player:'+p.id,label:p.name}))];
  return [{op:'choose',key:'proliferate',label:'Choose any permanents and/or players with counters to proliferate',options,min:0,max:options.length},call('proliferate-apply')];
 });
 registry.registerHandler('expanded.proliferate-apply',(g,c)=>{
  for(const value of asArray(c.vars.proliferate)){
   if(value.startsWith('player:')){const p=g.state.players[Number(value.slice(7))];for(const key of ['energy','poison','experience'])if(p[key]>0){p[key]++;g.record('PLAYER_COUNTER_CHANGED',{player:p.id,counter:key,amount:1});}}
   else {const o=g.object(value);if(o?.zone==='battlefield')for(const [type,count]of Object.entries(o.counters))if(count>0)g.addCounters(ref(o),type,1);}
  }
  return [];
 });
}
