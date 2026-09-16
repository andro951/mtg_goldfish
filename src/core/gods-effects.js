import {clone,ref,sameRef,asArray,unique,requireRule} from './util.js';
const colors=['W','U','B','R','G'];

/** Shared, serializable mechanics for the Gods/enchantments pack. */
export function installGodsEffects(Engine){
 const p=Engine.prototype,old=Object.fromEntries(['moveBatch', 'executeEffect', 'acceptChoice', 'startAfterKeep', 'checkStateActions'].map(k=>[k,p[k]]));
 Object.assign(p,{
  attachmentLegal(source,target){
   if(sameRef(source,target))return false;
   const type=this.module(source).enchantType||'Creature',c=this.characteristics(target);
   if(!c.types.includes(type)||(this.baseCharacteristics(source).types.includes('Creature')&&!this.module(source).reconfigure))return false;
   const sc=source.zone==='battlefield'&&sameRef(this.object(source.id),source)?this.characteristics(source):this.baseCharacteristics(source);
   if(c.keywords.includes('Protection from everything'))return false;
   return !Object.entries({W:'white',U:'blue',B:'black',R:'red',G:'green'}).some(([color,name])=>sc.colors.includes(color)&&c.keywords.includes('Protection from '+name));
  },
  moveBatch(requests,context={}){
   const moves=clone(requests),auraChoices=context.godsEntryChoices||{};
   for(const m of moves){const o=this.object(m.id);if(!o)continue;
    if(o.zone==='battlefield'&&m.to==='graveyard'&&this.characteristics(o).types.includes('Creature')&&this.objects('battlefield').some(s=>this.module(s).exileOpponentDeaths&&s.controller!==o.controller))m.to='exile';
    if(o.zone==='battlefield'&&o.flags.whipReturn&&m.to!=='battlefield'&&m.to!=='exile')m.to='exile';
    if(m.to!=='battlefield'||o.zone==='battlefield')continue;
    const copy=o.token&&o.copy?o.copy:m.copy||null,entrant={...o,zone:'battlefield',copy,face:m.face??(o.zone==='stackCards'?o.face:0),flags:{...(m.flags||{}),...(o.flags.bestowed?{bestowed:true}:{})}};
    const mod=this.module(entrant),c=this.baseCharacteristics(entrant);
    if(o.zone==='stackCards'){m.face=o.face;if(o.flags.bestowed)m.flags={...m.flags,bestowed:true};}
    if(auraChoices[o.id]?.color)m.flags={...m.flags,chosenColor:auraChoices[o.id].color};
    if(mod.chooseEntryColor&&!m.flags?.chosenColor){
     if(this._legacyGodsRules)continue;
     this.state.godsEntry={moves,context:clone(context),id:o.id,kind:'color'};
     this.state.pending={kind:'godsEntry',type:'option',label:`${c.name} — choose a color as it enters`,min:1,max:1,options:colors.map(value=>({value,label:value}))};return null;
    }
    if(c.subtypes.includes('Aura')||entrant.flags.bestowed){
     const target=auraChoices[o.id]?.target||m.attachedTo||(o.zone==='stackCards'&&asArray(context.inputs.target)[0]);
     if(target){const t=this.object(target);if(t&&this.attachmentLegal({...entrant,attachedTo:ref(t)},t)){m.attachedTo=ref(t);continue;}if(entrant.flags.bestowed){delete m.flags.bestowed;continue;}}
     if(o.zone==='stackCards'&&!entrant.flags.bestowed){m.to='graveyard';continue;}
     const candidates=this.objects('battlefield').filter(t=>this.attachmentLegal({...entrant,attachedTo:ref(t)},t)).map(t=>t.id);
     if(!candidates.length){m.to=o.zone==='stackCards'?'graveyard':o.zone;continue;}
     this.state.godsEntry={moves,context:clone(context),id:o.id,kind:'target'};
     this.state.pending={kind:'godsEntry',type:'select',label:`${c.name} — choose what to enchant`,candidates,min:1,max:1};return null;
    }
   }
   return old.moveBatch.call(this,moves,context);
  },
  executeEffect(command,context){
   let cmd=this.value(command,context),player=cmd.player??context.controller;
   if(command.op==='godsNumber'){
    const min=Math.max(0,Math.floor(cmd.min||0)),max=Math.max(min,Math.floor(cmd.max??10000));
    this.state.pending={kind:'effect',type:'number',key:cmd.key,label:cmd.label||'Choose a number',min,max,source:context.source};return;
   }
   if(command.op==='godsDamage'){this.damagePacket(cmd.packet,context);return;}
   if(command.op==='godsTrigger'){
    this.queueTrigger({source:context.source,sourceCardId:context.sourceCardId,controller:player,abilityId:cmd.id||'reflexive',label:cmd.label,context:clone(context),inputSpecs:clone(cmd.inputs||[]),program:clone(command.program)});return;
   }
   if(command.op==='godsReturnEnchantment'){
    const card=this.object(cmd.card);if(!card||card.zone!=='graveyard')return;
    const copy=clone(this.definition(card));copy.types=['Enchantment'];copy.subtypes=copy.subtypes.filter(t=>['Aura','Saga','Class','Shrine','Room','Background','Cartouche','Case','Curse','Role'].includes(t));copy.rulesId=card.cardId;
    return this.executeEffect({op:'move',ids:[ref(card)],to:'battlefield',controller:card.owner,copy},context);
   }
   if(command.op==='godsThird'){
    const card=this.object(cmd.card);if(!card||!['graveyard','exile'].includes(card.zone))return;
    this.putInLibrary([card.id],'top');const zone=this.state.zones.libraryActive;zone.splice(zone.indexOf(card.id),1);const ownerIndices=zone.map((id,i)=>this.object(id).owner===card.owner?i:-1).filter(i=>i>=0);zone.splice(ownerIndices.length>=2?ownerIndices[1]+1:zone.length,0,card.id);this.record('LIBRARY_THIRD',{card:ref(this.object(card.id))});return;
   }
   if(command.op==='godsManaBonus'){
    const s=this.object(cmd.source)||cmd.snapshot;this._manaBonus=true;try{this.addMana(player,cmd.production,ref(s));}finally{this._manaBonus=false;}return;
   }
   if(command.op==='enterSpell'){
    const card=this.object(this.state.resolving.object.source);if(card?.zone==='stackCards'&&card.flags.bestowed){
     const target=this.object(asArray(context.inputs.target)[0]);
     if(!target||target.zone!=='battlefield'||!this.characteristics(target).types.includes('Creature')){delete card.flags.bestowed;this.touch();}
    }
   }
   if(!this._legacyGodsRules){
    if(command.op==='modify')command={...command,modification:{...command.modification,timestamp:this.state.eventSerial+1}};
    if(command.op==='effect'&&command.effect.kind==='modify')command={...command,effect:{...command.effect,modification:{...command.effect.modification,timestamp:this.state.eventSerial+1}}};
   }
   const result=old.executeEffect.call(this,command,context);
   if(this.state.pending?.kind==='godsEntry')this.state.godsEntry.result={key:command.key||null,permanent:command.op==='enterSpell'};
   // Mana-enchantment abilities trigger on tapping a land; unlike ordinary
   // triggers they resolve immediately, after the land's own mana ability.
   if(command.op==='mana'&&this.state.resolving?.manaAbility&&!this._manaBonus){
    const frame=this.state.resolving,ability=this.abilityDefinition(frame.object.sourceCardId,frame.object.abilityId,frame.context.sourceSnapshot),land=frame.context.sourceSnapshot;
    if(ability?.tap&&land?.characteristics.types.includes('Land')&&!context.vars.godsLandBonus){
     const bonuses=this.objects('battlefield').filter(a=>a.attachedTo&&sameRef(a.attachedTo,land)&&this.module(a).landManaBonus);
     if(bonuses.length)context.vars.godsLandBonus=true;
     const program=[];
     for(const a of bonuses){const bonus=this.module(a).landManaBonus,key='land-bonus-'+a.id;
      if(bonus==='any')program.push({op:'choose',key,label:this.definition(a).name+' — additional mana color',options:colors.map(value=>({value,label:value}))});
      program.push({op:'call',handler:'gods.land-bonus',provider:this.lastKnown(a),color:bonus==='any'?'$var.'+key:bonus,player:land.controller});
     }
     this.insertEffects(program);
    }
   }
   return result;
  },
  acceptChoice(value,action={}){
   if(this.state.pending?.kind==='godsEntry'){
    const pending=this.state.pending,entry=this.state.godsEntry;
    let chosen;if(entry.kind==='color'){chosen=asArray(value)[0];requireRule(colors.includes(chosen),'Choose a color.');}
    else {chosen=asArray(value)[0];requireRule(asArray(value).length===1&&pending.candidates.includes(chosen),'Choose a listed permanent.');chosen=ref(this.object(chosen));}
    this.state.pending=null;delete this.state.godsEntry;
    const context=entry.context;context.godsEntryChoices||={};context.godsEntryChoices[entry.id]={...(context.godsEntryChoices[entry.id]||{}),[entry.kind]:chosen};
    this.record('ENTRY_CHOICE',{object:entry.id,kind:entry.kind,value:chosen});const changes=this.moveBatch(entry.moves,context);
    if(this.state.godsEntry)this.state.godsEntry.result=entry.result;
    if(changes&&this.state.resolving){const c=this.state.resolving.context;if(entry.result?.key)c.vars[entry.result.key]=clone(changes);if(entry.result?.permanent)c.permanentRef=changes[0]?.afterRef||null;}
    if(!this.state.pending)this.runEffects();return;
   }
   if(this.state.pending?.kind==='godsOpening'){
    const pending=this.state.pending,ids=asArray(value);requireRule(unique(ids).length===ids.length&&ids.every(id=>pending.candidates.includes(id)),'Choose opening-hand Leylines.');
    this.state.pending=null;this.moveBatch(ids.map(id=>({id,to:'battlefield',cause:'opening-leyline'})));this.record('OPENING_LEYLINES',{ids});old.startAfterKeep.call(this);return;
   }
   return old.acceptChoice.call(this,value,action);
  },
  startAfterKeep(){
   const ids=this.objects('hand',0).filter(o=>this.module(o).openingLeyline).map(o=>o.id);
   if(ids.length&&!this._legacyGodsRules){this.state.pending={kind:'godsOpening',label:'Begin with any of these Leylines on the battlefield?',candidates:ids,min:0,max:ids.length};return;}
   return old.startAfterKeep.call(this);
  },
  checkStateActions(){
   for(const o of this.objects('battlefield'))if(o.flags.bestowed){const target=this.object(o.attachedTo);if(!target||target.zone!=='battlefield'||!this.characteristics(target).types.includes('Creature')){o.attachedTo=null;delete o.flags.bestowed;this.touch();}}
   return old.checkStateActions.call(this);
  },
 });
}
