/** Explicit implementations added for the user's 13 September 2026 pool.
 * Oracle identities, texts, rulings and images are pinned in data/cards.json.
 */
import { ref, sameRef } from '../core/util.js';
import { BF, GY, target, landfall, search, optional } from './helpers.js';

export const LATEST_CARDS=['Academy Ruins','Planar Bridge','Mycosynth Golem','Cauldron of Souls','Chocobo Racetrack','Doors of Durin','Cosmic Cube'];
const call=(handler,extra={})=>({op:'call',handler:'latest.'+handler,...extra});
const attacking=(g,p)=>g.controlled(p).filter(o=>o.flags.attacking&&g.characteristics(o).types.includes('Creature'));
const attackTrigger=(id,label,effect)=>({id,label,event:'ATTACKERS_DECLARED',test:(g,s,e)=>e.controller===s.controller&&e.attackers.length>0,effect});

export function installLatest(registry){
 const register=(name,module)=>registry.register(name,{status:'full',notes:'Explicit rules and interaction regressions in latest-cards.test.js.',...module});
 register('Academy Ruins',{possibleMana:['C'],activated:[{id:'recover',label:'Put an artifact from your graveyard on top of your library',cost:'{1}{U}',tap:true,inputs:[target({...GY,artifact:true})],effect:()=>[{op:'library',ids:'$input.target',position:'top'}]}]});
 register('Planar Bridge',{activated:[{id:'search',label:'Search for a permanent and put it onto the battlefield',cost:'{8}',tap:true,effect:()=>[search({permanent:true},'battlefield')]}]});
 register('Mycosynth Golem',{
  costReduction:(g,o)=>g.count({...BF,controller:o.owner,artifact:true}),
  costModifiers:[{test:(g,s,o)=>g.characteristics(o).types.includes('Artifact')&&g.characteristics(o).types.includes('Creature'),amount:(g,s)=>g.count({...BF,controller:s.controller,artifact:true})}],
  statics:[{layer:6,match:(g,s,o,c)=>o.zone==='stackCards'&&o.controller===s.controller&&c.types.includes('Artifact')&&c.types.includes('Creature'),apply:(g,s,o,c)=>c.keywords.push('Affinity')}],
 });
 register('Cauldron of Souls',{activated:[{id:'persist',label:'Any number of target creatures gain persist until end of turn',tap:true,inputs:[target({zones:['battlefield'],creature:true},'target',0,100000)],effect:()=>[{op:'modify',ids:'$input.target',modification:{keywords:['Persist'],persistInstances:1}}]}]});
 register('Chocobo Racetrack',{triggers:[landfall('bird','Create a 2/2 green Bird with landfall',()=>[{op:'token',card:'Bird'}])]});
 register('Bird',{triggers:[landfall('landfall-power','This Bird gets +1/+0 until end of turn',()=>[{op:'modify',ids:'$source',modification:{power:1}}])]});
 register('Doors of Durin',{triggers:[attackTrigger('doors','Scry 2; you may reveal the top card and put a creature in tapped and attacking',()=>[
  {op:'scry',count:2},optional('reveal','Reveal the top card for Doors of Durin?',[call('doors-reveal')]),
 ])]});
 registry.registerHandler('latest.doors-reveal',(g,c)=>{
  const top=g.top(c.controller);if(!top)return [];
  g.record('REVEALED',{ids:[top.id],player:c.controller,reason:'Doors of Durin'});
  if(!g.characteristics(top).types.includes('Creature'))return [];
  const opponents=g.state.players.filter(p=>p.id!==c.controller&&!p.lost);
  if(!opponents.length)return [];
  c.vars.doorsCard=ref(top);
  return [{op:'choose',key:'doorsDefender',label:'Choose the opponent this creature enters attacking',options:opponents.map(p=>({value:String(p.id),label:p.name}))},
   {op:'move',ids:'$var.doorsCard',from:top.zone,to:'battlefield',tapped:true,controller:c.controller,key:'doorsEntered',flags:{attacking:{player:'$var.doorsDefender',combatId:g.state.currentExtraCombat?.id||`normal-${g.state.turnSerial}`}}},call('doors-grant')];
 });
 registry.registerHandler('latest.doors-grant',(g,c)=>{
  const o=g.object(c.vars.doorsEntered?.[0]?.afterRef);if(!o||o.zone!=='battlefield')return [];
  // Entering attacking is not declaring an attack: no attack triggers/counts.
  if(o.flags.attacking)o.flags.attacking.player=Number(o.flags.attacking.player);
  const subtypes=g.controlled(c.controller).flatMap(p=>g.characteristics(p).subtypes),keywords=[];
  if(subtypes.includes('Dwarf'))keywords.push('Trample');if(subtypes.includes('Elf'))keywords.push('Hexproof');
  return keywords.length?[{op:'effect',effect:{kind:'modify',targets:[ref(o)],modification:{keywords},expires:'nextTurn',expiryPlayer:c.controller}}]:[];
 });
 register('Cosmic Cube',{triggers:[
  attackTrigger('cube','Look at six; you may cast a spell within your attacking creatures’ greatest power',()=>[{op:'look',count:6,key:'cubeLook'},call('cube-cast'),call('cube-bottom')]),
  {id:'ward',label:'Ward {2}',event:'BECOMES_TARGET',test:(g,s,e)=>sameRef(s,e.target)&&e.controller!==s.controller,effect:(g,c)=>[call('ward',{stackId:c.event.stackId})]},
 ]});
 registry.registerHandler('latest.cube-cast',(g,c)=>{
  const powers=attacking(g,c.controller).map(o=>g.characteristics(o).power),max=powers.length?Math.max(...powers):0;
  const ids=(c.vars.cubeLook||[]).filter(id=>{const o=g.object(id);return o&&['libraryActive','libraryReserve'].includes(o.zone)&&!g.characteristics(o).types.includes('Land')&&g.characteristics(o).manaValue<=max;});
  return [{op:'castChoice',ids,method:'free',label:`Cosmic Cube — cast a spell with mana value at most ${max} without paying its mana cost`}];
 });
 registry.registerHandler('latest.cube-bottom',(g,c)=>[{op:'library',ids:(c.vars.cubeLook||[]).filter(id=>{const o=g.object(id);return o&&['libraryActive','libraryReserve'].includes(o.zone);}),position:'bottom',random:true}]);
 registry.registerHandler('latest.ward',(g,c,cmd)=>{
  const s=g.state.stack.find(s=>s.id===cmd.stackId);if(!s)return [];
  return [{op:s.controller===0?'pay':'opponentPayment',player:s.controller,mana:'{2}',label:'Pay {2} for ward or your spell/ability will be countered',else:[call('ward-counter',{stackId:s.id})]}];
 });
 registry.registerHandler('latest.ward-counter',(g,c,cmd)=>{
  const s=g.state.stack.find(s=>s.id===cmd.stackId);if(!s)return [];
  if(s.kind==='spell')g.counterSpell(s.id,c);
  else {g.state.stack=g.state.stack.filter(o=>o.id!==s.id);g.record('ABILITY_COUNTERED',{stackId:s.id,reason:'ward'});}
  return [];
 });
}
