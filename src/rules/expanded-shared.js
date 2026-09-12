/** Shared, typed operations used by the explicitly implemented expansion cards. */
import { ref, sameRef, clone, asArray, unique } from '../core/util.js';
import { BF,GY,HAND,LIB,choose,move,draw,target,options,PERMANENT_TYPES } from './helpers.js';
export const call=(handler,extra={})=>({op:'call',handler:'expanded.'+handler,...extra});
export const isPermanent=c=>c.types.some(t=>PERMANENT_TYPES.includes(t));
export const lands=(g,p=0)=>g.count({...BF,controller:p,land:true});
export const artifacts=(g,p=0)=>g.count({...BF,controller:p,artifact:true});
export const unionPermanents=(g,p=0)=>g.count({...BF,controller:p,type:['Artifact','Creature']});
export const graveTypes=(g,p=0)=>new Set(g.objects('graveyard',p).flatMap(o=>g.characteristics(o).types)).size;
export const gravePermanentCount=(g,p=0)=>g.count({...GY,owner:p,permanent:true});
export const differentLandNames=(g,p=0)=>new Set(g.controlled(p).filter(o=>g.characteristics(o).types.includes('Land')).map(o=>g.characteristics(o).name)).size;
export const putLands=(max=1,{tapped=false,graveyard=false,key='handLands',optional=true}={})=>[
 choose(key,`Put up to ${max} land${max===1?'':'s'} from ${graveyard?'hand or graveyard':'hand'} onto the battlefield`,{zones:graveyard?['hand','graveyard']:['hand'],owner:'you',land:true},optional?0:max,max),
 move('$var.'+key,'battlefield',{tapped}),
];
export const ownSpell=(g,s,e)=>e.controller===s.controller;
export const castType=type=>(g,s,e)=>ownSpell(g,s,e)&&e.characteristics.types.includes(type);
export const ownEntry=(g,s,e)=>e.change?.object.controller===s.controller;
export const entersType=type=>(g,s,e)=>ownEntry(g,s,e)&&e.change.object.characteristics.types.includes(type);
export const selfLeaves=(g,s,e)=>sameRef(s,e.change.beforeRef);
export const artifactDeath=(g,s,e)=>e.change.to==='graveyard'&&e.change.lki.characteristics.types.includes('Artifact')&&e.change.lki.controller===s.controller;
export const deathDraw=(label='Draw a card')=>({id:'death-draw',label,event:'LEAVE',lookBack:true,test:(g,s,e)=>selfLeaves(g,s,e)&&e.change.to==='graveyard',effect:()=>[draw()]});
export const attack=(id,label,effect,extra={})=>({id,label,event:'ATTACK_DECLARED',test:(g,s,e)=>sameRef(s,e.object),effect,...extra});
export const gyPermission={id:'lands-from-graveyard',label:'Play a land from your graveyard',zone:'graveyard',land:true,spell:false,test:(g,s,o)=>o.owner===s.controller&&g.characteristics(o).types.includes('Land')};
export const addLandPlays=(n=1)=>({op:'effect',effect:{kind:'extraLands',amount:n,expires:'endOfTurn'}});
export const anyTarget=(key='target',max=1,min=1,extra={})=>({key,type:'anyTarget',label:'Choose target',target:true,min,max,...extra});
export const damageTo=(amount,key='target')=>call('damage-target',{targets:'$input.'+key,amount});
export const mode=(label,values,key='mode')=>({key,type:'option',label,options:values.map(([value,label])=>({value,label}))});
export const maximalMV=(g,p=0)=>Math.max(0,...g.controlled(p).filter(o=>g.characteristics(o).types.includes('Artifact')).map(o=>g.characteristics(o).manaValue));
export const tokenCopy=(g,name,overrides={})=>({...clone(g.registry.get(name)),rulesId:g.registry.get(name).id,...overrides});
export const matchingNames=(g,selector,names,ctx={})=>g.select(selector,ctx).filter(id=>names.includes(g.definition(id).name));
export function installExpandedShared(registry){
 registry.registerHandler('expanded.damage-target',(g,ctx,cmd)=>{for(const value of asArray(cmd.targets)){if(typeof value==='string'&&value.startsWith('player:'))g.dealDamage(Number(value.slice(7)),cmd.amount,ctx);else g.dealDamage(value,cmd.amount,ctx);}return [];});
 registry.registerHandler('expanded.reveal-top',(g,ctx,cmd)=>{const top=g.top(ctx.controller);if(!top)return [];ctx.vars[cmd.key||'revealed']=[top.id];g.record('REVEALED',{ids:[top.id],player:ctx.controller});return [];});
 registry.registerHandler('expanded.look-rest-bottom',(g,ctx,cmd)=>{
   const ids=(ctx.vars[cmd.look||'looked']||[]).filter(id=>!(ctx.vars[cmd.selected||'kept']||[]).includes(id)&&g.object(id)&&['libraryActive','libraryReserve','exile'].includes(g.object(id).zone));
   if(!ids.length)return [];
   if(cmd.random)return [{op:'library',ids,position:'bottom',random:true}];
   return [{op:'choose',key:'remainingOrder',label:'Order the remaining cards (topmost first)',ids,min:ids.length,max:ids.length,ordered:true},{op:'library',ids:'$var.remainingOrder',position:'bottom'}];
 });
 registry.registerHandler('expanded.cda-token',(g,ctx,cmd)=>{
   const def=g.registry.get(cmd.base);const copy={...clone(def),rulesId:def.id,...cmd.copy};
   return [{op:'token',card:def.id,options:{...cmd.options,copy}}];
 });
 registry.registerHandler('expanded.sacrifice-count',(g,ctx,cmd)=>{
   const ids=asArray(ctx.vars[cmd.key||'sacrificed']);const changes=g.moveBatch(ids.map(id=>({id,to:'graveyard',cause:'sacrifice'})),ctx)||[];
   ctx.vars[cmd.output||'sacCount']=changes.filter(c=>c.from==='battlefield'&&c.cause==='sacrifice').length;ctx.vars[cmd.snapshots||'sacSnapshots']=changes.map(c=>c.lki);return [];
 });
 registry.registerHandler('expanded.after-sac-draw',(g,ctx,cmd)=>[draw(ctx.vars[cmd.key||'sacCount']||0)]);
 registry.registerHandler('expanded.hand-empty',(g,ctx)=>g.objects('hand',ctx.controller).length?[{op:'choose',key:'discard',label:'Discard a card',selector:{...HAND,owner:ctx.controller},min:1,max:1},{op:'discard',ids:'$var.discard'}]:[draw()]);
 registry.registerHandler('expanded.source-untapped',(g,ctx,cmd)=>{const o=g.object(ctx.source);return o&&!o.tapped?cmd.then||[]:[];});
 registry.registerHandler('expanded.land-count-gate',(g,ctx,cmd)=>lands(g,ctx.controller)>=cmd.count?cmd.then||[]:cmd.else||[]);
}
