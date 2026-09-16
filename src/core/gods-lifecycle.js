import {clone,ref,sameRef,asArray,unique,requireRule} from './util.js';
const colors=['W','U','B','R','G'];

/** Shared, serializable mechanics for the Gods/enchantments pack. */
export function installGodsLifecycle(Engine){
 const p=Engine.prototype,old=Object.fromEntries(['changeLife', 'emit', 'addMana', 'dealDamage', 'processStep', 'advanceOneStep'].map(k=>[k,p[k]]));
 Object.assign(p,{
  changeLife(player,amount,reason='effect'){
   if(this._suppressPacketLifelink&&reason==='lifelink'){this._packetLife=(this._packetLife||0)+amount;return;}
   if(amount>0){
    if(this.objects('battlefield').some(o=>this.module(o).opponentsCantGainLife&&o.controller!==player)){this.record('LIFE_GAIN_PREVENTED',{player,amount});return;}
    amount+=this.controlled(player).reduce((n,o)=>n+(this.module(o).lifeGainBonus||0),0);
    if(!this._legacyGodsRules)this.state.turnCounts['lifeGained:'+player]=this.lifeGained(player)+amount;
   }
   return old.changeLife.call(this,player,amount,reason);
  },
  emit(type,detail={},previous=[]){
   if(type==='SPELL_CAST'&&!this._legacyGodsRules){
    if(detail.characteristics.types.includes('Enchantment')){const k='enchantmentSpells:'+detail.controller;this.state.turnCounts[k]=(this.state.turnCounts[k]||0)+1;detail.firstEnchantment=this.state.turnCounts[k]===1;}
    if(detail.characteristics.types.includes('Sorcery'))this.state.effects=this.state.effects.filter(e=>e.kind!=='quicken'||e.controller!==detail.controller);
   }
   const event=old.emit.call(this,type,detail,previous);
   if(type==='SPELL_CAST'&&detail.characteristics.types.includes('Creature')){
    const stack=this.state.stack.find(s=>s.id===detail.stackId),commanders=Object.values(this.state.instances).filter(o=>o.commander&&o.owner===detail.controller);
    if(commanders.some(o=>this.characteristics(o).subtypes.some(t=>detail.characteristics.subtypes.includes(t))))
     for(const {amount,snapshot}of stack?.context.ancestrySpent||[])for(let n=0;n<amount;n++)this.queueTrigger({source:ref(snapshot),sourceCardId:snapshot.copy?.rulesId||snapshot.cardId,controller:detail.controller,abilityId:'ancestry-scry',label:'Path of Ancestry — scry 1',context:this.context(snapshot,{event,controller:detail.controller}),program:[{op:'scry',count:1}]});
   }
   if(type==='COMBAT_DAMAGE_DEALT'){
    const source=detail.sourceSnapshot||this.lastKnown(this.object(detail.source));
    for(let i=0;i<(source.characteristics?.grantedDraw||0);i++)this.queueTrigger({source:detail.source,sourceCardId:source.copy?.rulesId||source.cardId,controller:source.controller,abilityId:'granted-combat-draw',label:source.definition.name+' — draw a card',context:this.context(source,{event}),program:[{op:'draw',count:1}]});
   }
   return event;
  },
  addMana(player,production,source=null,restriction=null,details={}){
   const frame=this.state.resolving;
   const ability=frame?.manaAbility&&this.abilityDefinition(frame.object.sourceCardId,frame.object.abilityId,frame.context.sourceSnapshot);
   if(ability?.tap&&sameRef(frame.context.source,source)&&!this._manaBonus){
    const snapshot=frame.context.sourceSnapshot;
    const factor=this.controlled(player).reduce((n,o)=>n*(this.module(o).manaMultiplier||1),1);
    // The sacrificed source's replacement effect still applies to its own mana ability.
    const own=this.module(snapshot).manaMultiplier;if(own&&!this.object(source))production=Object.fromEntries(Object.entries(production).map(([c,n])=>[c,n*own]));
    production=Object.fromEntries(Object.entries(production).map(([c,n])=>[c,n*factor]));
   }
   const existing=new Set(this.state.players[player].restrictedMana.map(t=>t.id));
   const result=old.addMana.call(this,player,production,source,restriction,details);
   if(ability?.ancestry&&sameRef(frame.context.source,source))for(const tag of this.state.players[player].restrictedMana)if(!existing.has(tag.id))tag.ancestry=clone(frame.context.sourceSnapshot);
   return result;
  },
  dealDamage(target,amount,context={}){
   if(!(amount>0))return;
   const source=this.object(context.source)||context.sourceSnapshot,c=source&&(source.characteristics||this.characteristics(source)),o=typeof target==='number'?null:this.object(target),tc=o&&this.characteristics(o);
   if(tc?.preventAllDamage||tc&&Object.entries({W:'white',U:'blue',B:'black',R:'red',G:'green'}).some(([v,n])=>c?.colors.includes(v)&&tc.keywords.includes('Protection from '+n))){this.record('DAMAGE_PREVENTED',{source:context.source,target,amount});return;}
   const shield=this.state.effects.find(e=>e.kind==='penance'&&sameRef(e.source,context.source));
   if(shield){this.record('DAMAGE_PREVENTED',{source:context.source,target,amount});if(!this._damagePacket)this.state.effects=this.state.effects.filter(e=>e!==shield);else this._usedPenance.add(shield.id);return;}
   return old.dealDamage.call(this,target,amount,context);
  },
  damagePacket(packet,context){
   this._damagePacket=true;this._usedPenance=new Set();this._suppressPacketLifelink=true;this._packetLife=0;
   try{for(const hit of packet)this.dealDamage(hit.target,Math.max(0,hit.amount),context);}
   finally{this._suppressPacketLifelink=false;this._damagePacket=false;this.state.effects=this.state.effects.filter(e=>!this._usedPenance.has(e.id));}
   if(this._packetLife>0)this.changeLife(context.controller,this._packetLife,'lifelink');this._packetLife=0;
  },
  processStep(step){
   const result=old.processStep.call(this,step);
   if(step==='cleanup'&&this.hasStatic('noMaximumHandSize',this.state.activePlayer)&&this.state.pending?.kind==='cleanupDiscard')this.state.pending=null;
   return result;
  },
  advanceOneStep(){
   const retained=this.state.players.map(player=>this.hasStatic('retainMana',player.id)?{mana:clone(player.mana),restricted:clone(player.restrictedMana.filter(m=>!(m.retain==='endOfTurn'&&this.state.step!=='cleanup')))}:null);
   const result=old.advanceOneStep.call(this);
   for(const player of this.state.players){const saved=retained[player.id];if(!saved)continue;player.mana.C+=Object.values(saved.mana).reduce((a,b)=>a+b,0);for(const tag of saved.restricted)player.restrictedMana.push({...tag,color:'C'});}
   return result;
  },
 });
}
