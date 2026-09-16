import {clone,ref,sameRef,asArray,unique,requireRule} from './util.js';
import {installGodsEffects} from './gods-effects.js';
import {installGodsLifecycle} from './gods-lifecycle.js';
const groupTime=(o,i=0)=>o.flags?.continuousTimestamp??(-100000+i);
const colors=['W','U','B','R','G'];

/** Shared, serializable mechanics for the Gods/enchantments pack. */
export function installGodsEngine(Engine){
 const p=Engine.prototype,old=Object.fromEntries(['baseCharacteristics', 'draftDefinition', 'castingPermissions', 'inputSpecs', 'quoteDraft', 'validateDraft', 'payDraftCosts'].map(k=>[k,p[k]]));
 Object.assign(p,{
  devotion(player,colorSet){
   const allowed=Array.isArray(colorSet)?colorSet:[colorSet];let total=0;
   for(const o of this.controlled(player)){
    const cost=this.definition(o).manaCost;
    for(const [,symbol] of cost.matchAll(/\{([^}]+)\}/g))if(symbol.split('/').some(c=>allowed.includes(c)))total++;
    total+=this.module(o).devotionBonus||0;
   }
   return total;
  },
  permanentColors(player){return colors.filter(c=>this.controlled(player).some(o=>this.characteristics(o).colors.includes(c)));},
  couldProduceColors(value,visited=new Set()){
   const source=this.object(value);if(!source||source.zone!=='battlefield'||!this.characteristics(source).types.includes('Land')||visited.has(source.id))return [];
   const seen=new Set(visited).add(source.id),module=this.module(source);
   const outputs=[];
   for(const ability of this.abilities(source).filter(a=>a.mana)){
    if(ability.orchard){outputs.push(...this.opposingLandColors(source,seen));continue;}
    const exact=ability.singleMana?.colors,declared=exact??ability.manaColors;
    if(declared){outputs.push(...(typeof declared==='function'?declared(this,source):declared));continue;}
    if(ability.manaOutput){outputs.push(...Object.entries(ability.manaOutput).filter(([,n])=>n>0).map(([c])=>c));continue;}
    // Legacy land modules have static output metadata; no effect is executed.
    outputs.push(...(module.possibleMana||[]));
   }
   return unique(outputs.filter(c=>colors.includes(c)));
  },
  opposingLandColors(source,visited=new Set()){
   return unique(this.state.players.filter(p=>p.id!==source.controller&&!p.lost).flatMap(p=>[
    ...(p.abstractLandColors||[]),...this.objects('battlefield').filter(o=>o.controller===p.id&&this.characteristics(o).types.includes('Land')).flatMap(o=>this.couldProduceColors(o,visited))
   ]));
  },
  islandCount(player){return this.count({zones:['battlefield'],controller:player,land:true,subtype:'Island'})+(this.state.players[player].abstractIslands||0);},
  lifeGained(player){return this.state.turnCounts['lifeGained:'+player]||0;},
  useOnce(source,key){const k=`gods:${source.id}:${source.oid}:${key}`;if(this.state.turnCounts[k])return false;this.state.turnCounts[k]=1;return true;},
  usedOnce(source,key){return !!this.state.turnCounts[`gods:${source.id}:${source.oid}:${key}`];},
  continuousRules(all,sources){return sources.flatMap((source,i)=>(this.module(source).continuous||[]).map(rule=>({source,rule,time:groupTime(source,i),targets:null})));},
  applyContinuousLayer({all,sources,view,statics,modifications,continuous,layer}){
   const entries=[];
   for(const {source,rule} of statics)if((rule.layer===7||!rule.layer?7.3:rule.layer)===layer)entries.push({time:groupTime(source,sources.indexOf(source)),apply:()=>{
    for(const o of all)if(!rule.match||rule.match(this,source,o,view[o.id]))rule.apply(this,source,o,view[o.id]);
   }});
   for(const e of continuous)if(e.rule.layers.includes(layer))entries.push({time:e.time,apply:()=>{
    if(e.targets===null)e.targets=all.filter(o=>e.rule.match(this,e.source,o,view[o.id]));
    for(const o of e.targets)e.rule.apply(this,e.source,o,view[o.id],layer);
   }});
   for(const {target,modification} of modifications)entries.push({time:modification.timestamp??Number.MAX_SAFE_INTEGER,apply:()=>this.applyCharacteristicModification(view[target.id],modification,layer)});
   entries.sort((a,b)=>a.time-b.time);for(const e of entries)e.apply();
  },
  baseCharacteristics(o){
   const c=old.baseCharacteristics.call(this,o);
   // Changeling applies in every zone, including when a token is an enchantment.
   if(c.keywords.includes('Changeling')){
    this.registry.godsCreatureTypes ||= unique(this.registry.list().filter(d=>d.types.includes('Creature')).flatMap(d=>d.subtypes).concat(['God','Demigod','Pegasus','Horse','Dwarf','Elf','Angel','Elemental','Zombie','Warrior']));
    c.subtypes=unique([...c.subtypes,...this.registry.godsCreatureTypes]);
   }
   if(this.module(o).protectionColors)c.keywords.push(...this.module(o).protectionColors.map(n=>'Protection from '+n));
   if(o.flags.bestowed&&(this._announcedForm===o.id||o.zone==='stackCards'||o.zone==='battlefield'&&o.attachedTo)){
    c.types=c.types.filter(t=>'Creature'!==t);c.subtypes=['Aura'];
   }
   // A modal face has its own mana value; a transforming back retains front MV.
   if(o.face&&this.registry.get(o.cardId).layout==='modal_dfc')c.manaValue=(c.manaCost.match(/\{[^}]+\}/g)||[]).reduce((v,t)=>v+( /^\{\d+\}$/.test(t)?Number(t.slice(1,-1)):t==='{X}'?0:1),0);
   return c;
  },
  spellDefinition(cardId,permission={},context={}){
   const root=this.registry.module(cardId),mod=permission?.face?root.back:root;
   if(permission?.bestow)return mod.bestowSpell||{};
   if(permission?.alternateId&&mod.spellModes?.[permission.alternateId])return mod.spellModes[permission.alternateId];
   return mod.spell||{};
  },
  draftDefinition(draft=this.state.actionDraft){
   if(draft?.kind==='spell'){
    const perm=draft.permission||draft.permissions?.find(p=>p.id===draft.context.inputs.permission);
    return this.spellDefinition(draft.sourceCardId,perm,draft.context);
   }
   return old.draftDefinition.call(this,draft);
  },
  castingPermissions(o,land=false){
   let list=old.castingPermissions.call(this,o,land);if(land)return list;
   const mod=this.registry.module(o.cardId);
   if(mod.modalBack)for(const permission of [...list].filter(x=>x.method==='normal'||x.id==='resolution-window'))list.push({...permission,id:permission.id+'/back',face:1,label:'Cast '+this.definition({...o,face:1}).name,...(permission.method==='normal'?{method:'alternate',cost:this.definition({...o,face:1}).manaCost}:{})});
   if(mod.bestow)for(const permission of [...list].filter(x=>x.method==='normal'))list.push({...permission,id:permission.id+'/bestow',method:'alternate',cost:mod.bestow,bestow:true,label:'Bestow — cast as an Aura'});
   if(this.state.effects.some(e=>e.kind==='quicken'&&e.controller===o.owner)&&this.characteristics(o).types.includes('Sorcery'))list=list.map(e=>({...e,instant:true}));
   return list;
  },
  inputSpecs(draft){
   const result=old.inputSpecs.call(this,draft);if(!['spell','ability'].includes(draft.kind))return result;
   const source=this.object(draft.source),definition=this.draftDefinition(draft),perm=draft.permission;
   let cost=draft.kind==='spell'?this.definition(source).manaCost:typeof definition.cost==='function'?definition.cost(this,source,draft.context):definition.cost||'';
   if(draft.kind==='spell'&&['alternate','free','life'].includes(perm?.method))cost=perm.cost||'';
   const symbols=[...cost.matchAll(/\{([WUBRG]\/([WUBRG]))\}/g)].map(m=>m[1]);
   if(!this._legacyGodsRules)for(const symbol of unique(symbols)){
    const n=symbols.filter(s=>s===symbol).length,key='hybrid-'+symbol;
    if(!draft.context.inputs.hybrid?.[symbol]||Object.hasOwn(draft.context.inputs,key)){
     result.push({key,type:'number',label:`${symbol}: how many of the ${n} symbols to pay with ${symbol[2]}?`,min:0,max:n});
     if(draft.context.inputs[key]!=null){requireRule(Number.isInteger(draft.context.inputs[key])&&draft.context.inputs[key]>=0&&draft.context.inputs[key]<=n,'Invalid hybrid mana allocation.');draft.context.inputs.hybrid||={};draft.context.inputs.hybrid[symbol]=Array(n-draft.context.inputs[key]).fill(symbol[0]).concat(Array(draft.context.inputs[key]).fill(symbol[2]));}
    }
   }
   return result;
  },
  withSpellForm(draft,fn){
   const o=draft?.kind==='spell'&&this.object(draft.source),permission=draft?.permission||draft?.permissions?.find(p=>p.id===draft.context.inputs.permission);
   if(!o||!(permission?.face||permission?.bestow))return fn();
   const face=o.face,bestowed=o.flags.bestowed,previous=this._announcedForm,identity=ref(o);
   o.face=permission.face||0;if(permission.bestow)o.flags.bestowed=true;this._announcedForm=o.id;this.touch();
   try{return fn();}finally{
    if(this.object(identity)){o.face=face;if(bestowed===undefined)delete o.flags.bestowed;else o.flags.bestowed=bestowed;}
    this._announcedForm=previous;this.touch();
   }
  },
  quoteDraft(draft){return this.withSpellForm(draft,()=>{
   const result=old.quoteDraft.call(this,draft),o=this.object(draft.source);
   if(draft.kind==='spell'&&this.module(o).coloredReduction){const reduction=this.module(o).coloredReduction(this,o,draft.context);for(const [c,n]of Object.entries(reduction))result.cost.colored[c]=Math.max(0,result.cost.colored[c]-n);}
   return result;
  });},
  validateDraft(draft){return this.withSpellForm(draft,()=>{
   old.validateDraft.call(this,draft);
   if(draft.kind==='spell')this.draftDefinition(draft).validate?.(this,this.object(draft.source),draft.context);
  });},
  payDraftCosts(draft,payment){return this.withSpellForm(draft,()=>{
   const tagged=this.state.players[0].restrictedMana.filter(t=>t.ancestry).map(clone),paid=old.payDraftCosts.call(this,draft,payment);
   const spent=paid.tagged.filter(t=>t.amount>0).flatMap(t=>{const tag=tagged.find(x=>x.id===t.id);return tag?[{amount:t.amount,snapshot:tag.ancestry}]:[];});
   if(draft.kind==='spell'&&spent.length)draft.context.ancestrySpent=spent;
   return paid;
  });},
 });
 installGodsEffects(Engine);installGodsLifecycle(Engine);
}
