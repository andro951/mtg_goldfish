import {ref} from '../core/util.js';
import {mana,colorInput,search,selfSacrifice,draw,anyColor} from './helpers.js';
import {registerG as reg} from './gods-shared.js';

/** Explicit rules for the revised Esika mana base. Ability metadata describes
 * potential output without activating a card (for Reflecting Pool / Cactus). */
export function installGodsLands(r){
 const one=(colors,extra={})=>mana({}, {singleMana:{colors,key:'color'},inputs:[colorInput('color',colors)],label:'Add '+colors.join(' or '),effect:(g,c)=>[{op:'mana',color:c.inputs.color}],...extra});
 reg(r,'Savannah',{entersTapped:false,possibleMana:['G','W'],replaceActivated:[one(['G','W'])]});
 for(const [name,colors] of [['Temple Garden',['G','W']],['Breeding Pool',['G','U']]])reg(r,name,{entersTapped:false,shockLand:true,possibleMana:colors,replaceActivated:[one(colors)]});
 for(const [name,types] of [['Flooded Strand',['Plains','Island']],['Windswept Heath',['Forest','Plains']]])reg(r,name,{entersTapped:false,possibleMana:[],replaceActivated:[{id:'fetch',label:'Pay 1 life: search for a '+types.join(' or '),tap:true,life:1,costs:[selfSacrifice],effect:()=>[search({subtype:types,land:true},'battlefield')]}]});
 reg(r,"Spara's Headquarters",{entersTapped:true,possibleMana:['G','W','U'],replaceActivated:[one(['G','W','U']),{id:'cycling',zone:'hand',cost:'{3}',costs:[{kind:'discard',self:true}],label:'Cycling — discard this card and draw',effect:()=>[draw()]}]});
 reg(r,'Great Hall of the Citadel',{possibleMana:['C',...anyColor],replaceActivated:[mana({C:1}),{id:'legend-filter',label:'Pay 1: add two mana in any combination for legendary spells',mana:true,tap:true,cost:'{1}',manaColors:anyColor,effectInputs:[colorInput('first'),colorInput('second')],effect:(g,c)=>[{op:'mana',production:{[c.inputs.first]:c.inputs.first===c.inputs.second?2:1,...(c.inputs.first===c.inputs.second?{}:{[c.inputs.second]:1})},restriction:'legendarySpell'}]}]});
 const output=(g,s)=>g.controlled(s.controller).flatMap(o=>g.couldProduceColors(o,new Set([s.id]))).filter((v,i,a)=>a.indexOf(v)===i);
 const pool=()=>mana({}, {pool:true,singleMana:{colors:output,key:'color'},effectInputs:(g,s)=>[colorInput('color',output(g,s))],label:'Add one mana of a type a land you control could produce',effect:(g,c)=>[{op:'mana',color:c.inputs.color}]});
 reg(r,'Reflecting Pool',{entersTapped:false,possibleMana:[],replaceActivated:[pool()]});
 reg(r,'Cactus Preserve',{entersTapped:true,possibleMana:[],replaceActivated:[pool(),{id:'animate',cost:'{3}',label:'Become an X/X Plant with reach until end of turn',effect:(g,c)=>{
  const x=Math.max(0,...Object.values(g.state.instances).filter(o=>o.commander&&o.owner===c.controller).map(o=>g.characteristics(o).manaValue));
  return [{op:'modify',ids:ref(g.object(c.source)),modification:{addTypes:['Creature'],addSubtypes:['Plant'],colors:['G'],basePower:x,baseToughness:x,keywords:['Reach']}}];
 }}]});
}
