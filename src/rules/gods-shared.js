import {clone,ref,sameRef,asArray,unique,requireRule} from '../core/util.js';
import {BF,GY,HAND,LIB,target,colorInput,options,optional,draw,choose,move} from './helpers.js';
export const call=(handler,extra={})=>({op:'call',handler:'gods.'+handler,...extra});
export const creatures=(g,p)=>g.objects('battlefield').filter(o=>(p==null||o.controller===p)&&g.characteristics(o).types.includes('Creature'));
export const enchants=(g,p)=>g.objects('battlefield').filter(o=>(p==null||o.controller===p)&&g.characteristics(o).types.includes('Enchantment'));
export const ownPermanent=(g,s,o)=>o.zone==='battlefield'&&o.controller===s.controller;
export const ownCreature=(g,s,o,c)=>ownPermanent(g,s,o)&&c.types.includes('Creature');
export const entry=(id,label,type,effect,extra={})=>({id,label,event:'ENTER',test:(g,s,e)=>e.change.object.controller===s.controller&&e.change.object.characteristics.types.includes(type),effect,...extra});
export const gain=(id,label,effect,extra={})=>({id,label,event:'LIFE_CHANGED',test:(g,s,e)=>e.player===s.controller&&e.amount>0,effect,...extra});
export const dies=(id,label,effect,extra={})=>({id,label,event:'LEAVE',test:(g,s,e)=>e.change.to==='graveyard'&&sameRef(s,e.change.beforeRef),effect,...extra});
export const combatHit=(id,label,effect,extra={})=>({id,label,event:'COMBAT_DAMAGE_DEALT',test:(g,s,e)=>e.controller===s.controller,effect,...extra});
export const eachEnd=(id,label,effect,extra={})=>({id,label,event:'END_STEP',effect,...extra});
export const equipment=(cost)=>({id:'equip',label:'Equip '+cost,cost,sorcery:true,inputs:[target({...BF,creature:true})],effect:()=>[{op:'attach',target:'$input.target'}]});
export const attached=(g,s,o)=>sameRef(s.attachedTo,o)&&o.zone==='battlefield';
export const keywords=(match,keys)=>({layer:6,match,apply:(g,s,o,c)=>c.keywords.push(...keys)});
export const power=(match,n)=>({layer:7.3,match,apply:(g,s,o,c)=>{const value=typeof n==='function'?n(g,s,o,c):n;c.power+=value;c.toughness+=value;}});
export const god=(colorSet,threshold)=>({continuous:[{layers:[4],match:(g,s,o)=>sameRef(s,o)&&g.devotion(s.controller,colorSet)<threshold,apply:(g,s,o,c)=>{c.types=c.types.filter(t=>t!=='Creature');c.subtypes=c.subtypes.filter(t=>!['God','Demigod'].includes(t));}}]});
export const endure={id:'enduring-return',label:'Return as a noncreature enchantment',event:'LEAVE',test:(g,s,e)=>e.change.to==='graveyard'&&sameRef(s,e.change.beforeRef)&&e.change.lki.characteristics.types.includes('Creature'),effect:(g,c)=>[{op:'godsReturnEnchantment',card:c.event.change.afterRef}]};
export const token=(card,extra={})=>call('token',{card,...extra});
export const animate=(match,{pt='mv',subtype=null,keys=[],drawOnCombat=false}={})=>({layers:[4,6,7.2],match,apply:(g,s,o,c,layer)=>{
 if(layer===4){c.types.push('Creature');if(subtype)c.subtypes.push(subtype);}
 if(layer===6){c.keywords.push(...keys);if(drawOnCombat)c.grantedDraw=(c.grantedDraw||0)+1;}
 if(layer===7.2)c.power=c.toughness=pt==='mv'?c.manaValue:pt;
}});
export function registerG(registry,name,capability){
 registry.register(name,{status:'implemented',notes:'Esika pack implementation; focused acceptance tests required.',...capability});
 if(capability.replaceActivated)registry.module(name).activated=capability.replaceActivated;
}
export function installGodsShared(registry){
 registry.registerHandler('gods.token',(g,c,cmd)=>{
  const base=g.registry.get(cmd.card),copy={...clone(base),rulesId:base.id,keywords:cmd.keywords??base.keywords,colors:cmd.colors??base.colors,...(cmd.power!=null?{power:String(cmd.power)}:{}),...(cmd.toughness!=null?{toughness:String(cmd.toughness)}:{}),...(cmd.types?{types:cmd.types}:{}),...(cmd.subtypes?{subtypes:cmd.subtypes}:{}),cdaOverride:'fixed'};
  return [{op:'token',card:base.id,count:cmd.count??1,player:cmd.player??c.controller,options:{copy,tapped:cmd.tapped||false},...(cmd.key?{key:cmd.key}:{})}];
 });
 registry.registerHandler('gods.land-bonus',(g,c,cmd)=>[{op:'godsManaBonus',player:cmd.player,source:ref(cmd.provider),snapshot:cmd.provider,production:{[cmd.color]:1}}]);
 registry.registerHandler('gods.returned-ref',(g,c,cmd)=>{c.vars[cmd.key||'returned']=(c.vars[cmd.changes||'returns']||[]).filter(x=>x.to==='battlefield').map(x=>x.afterRef);return [];});
 registry.registerHandler('gods.animate-returned',(g,c,cmd)=>{
  const changes=c.vars[cmd.key||'returns']||[],ids=changes.filter(x=>x.to==='battlefield').map(x=>x.afterRef);
  return [{op:'modify',ids,permanent:true,modification:{addTypes:['Creature'],...(cmd.elemental?{addSubtypes:['Elemental']}:{}),basePower:cmd.power,baseToughness:cmd.power}}];
 });
 registry.registerHandler('gods.bottom-rest',(g,c,cmd)=>{
  const ids=asArray(c.vars[cmd.look||'looked']).filter(id=>{const o=g.object(id);return o&&['libraryActive','libraryReserve','exile'].includes(o.zone)&&!asArray(c.vars[cmd.keep||'kept']).includes(id);});
  if(cmd.ordered&&ids.length>1)return [{op:'choose',key:'bottomOrder',label:'Order the remaining cards (topmost first)',ids,min:ids.length,max:ids.length,ordered:true},{op:'library',ids:'$var.bottomOrder',position:'bottom'}];
  return [{op:'library',ids,position:'bottom',random:!cmd.ordered}];
 });
 registry.registerHandler('gods.look-select',(g,c,cmd)=>{
  const ids=(c.vars[cmd.look||'looked']||[]).filter(id=>g.matches(id,cmd.selector||{},c));
  return [{op:'choose',key:cmd.key||'kept',label:cmd.label||'You may put one of these cards into your hand',ids,min:0,max:1},move('$var.'+(cmd.key||'kept'),'hand')];
 });
 registry.registerHandler('gods.once',(g,c,cmd)=>g.useOnce(c.source,cmd.key)?cmd.then||[]:[]);
 registry.registerHandler('gods.if-unused',(g,c,cmd)=>!g.usedOnce(c.source,cmd.key)?cmd.then||[]:[]);
 registry.registerHandler('gods.life-gate',(g,c,cmd)=>g.lifeGained(c.controller)>=(cmd.amount||1)?cmd.then||[]:[]);
 registry.registerHandler('gods.mark',(g,c,cmd)=>{const s=g.object(c.source);if(s){s.flags[cmd.key]=cmd.value;g.touch();g.emit('GODS_MARK_CHANGED',{object:ref(s),key:cmd.key,value:cmd.value});}return [];});
 registry.registerHandler('gods.counter-ability',(g,c,cmd)=>{
  const target=g.state.stack.find(x=>x.id===cmd.stackId);if(!target)return [];
  if(target.kind==='spell')g.counterSpell(target.id,c);else{g.state.stack=g.state.stack.filter(x=>x!==target);g.record('ABILITY_COUNTERED',{stackId:target.id,reason:cmd.reason||'ward'});}return [];
 });
 registry.registerHandler('gods.optional-sacrifice',(g,c,cmd)=>{
  const ids=g.select(cmd.selector,c);return ids.length?[choose('sacrifice',cmd.label||'Sacrifice a creature',cmd.selector,1),{op:'sacrifice',ids:'$var.sacrifice'}]:[{op:'sacrifice',ids:c.source}];
 });
 registry.registerHandler('gods.ward-life',(g,c)=>{
  const stack=g.state.stack.find(x=>x.id===c.event.stackId);if(!stack)return [];
  return [{op:'choose',key:'wardLife',label:'Pay 3 life for ward?',options:g.state.players[stack.controller].life>=3?[{value:'pay',label:'Pay 3 life'},{value:'decline',label:'Decline'}]:[{value:'decline',label:'Cannot pay 3 life'}]},
   {op:'if',test:{eq:['$var.wardLife','pay']},then:[{op:'life',player:stack.controller,amount:-3}],else:[call('counter-ability',{stackId:stack.id})]}];
 });
}
