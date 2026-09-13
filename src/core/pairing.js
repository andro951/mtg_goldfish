import { ref, sameRef, asArray } from './util.js';
/** Soulbond has two optional, non-targeting ETB triggers. The actual pair is
 * reciprocal and incarnation-bound. It is not an Aura or an attachment.
 * Rules source: Wizards, Modern Masters 2017 release notes, Soulbond section. */
export const pairingMethods={
 pairedPartner(object){
  const a=typeof object==='object'?object:this.object(object),b=a?.pairedWith&&this.object(a.pairedWith);
  return a?.zone==='battlefield'&&b?.zone==='battlefield'&&a.id!==b.id&&sameRef(b.pairedWith,a)&&
   a.controller===b.controller&&(a.pairedController==null||a.pairedController===a.controller)&&
   (b.pairedController==null||b.pairedController===b.controller)&&
   this.characteristics(a).types.includes('Creature')&&this.characteristics(b).types.includes('Creature')?b:null;
 },
 unpairedCreature(object,controller){
  return object?.zone==='battlefield'&&object.controller===controller&&this.characteristics(object).types.includes('Creature')&&!this.pairedPartner(object);
 },
 breakPair(object){
  if(!object?.pairedWith)return;
  const other=this.object(object.pairedWith),source=ref(object),partner=object.pairedWith;
  delete object.pairedWith;delete object.pairedController;
  if(other&&sameRef(other.pairedWith,source)){delete other.pairedWith;delete other.pairedController;}
  this.touch();this.record('UNPAIRED',{source,partner});
 },
 clearInvalidPairs(){
  for(const o of this.objects('battlefield'))if(o.pairedWith&&!this.pairedPartner(o))this.breakPair(o);
 },
 pairCreatures(sourceRef,partnerRef,controller){
  this.clearInvalidPairs();const source=this.object(sourceRef),partner=this.object(partnerRef);
  if(source?.id===partner?.id||!this.unpairedCreature(source,controller)||!this.unpairedCreature(partner,controller))return false;
  source.pairedWith=ref(partner);partner.pairedWith=ref(source);
  source.pairedController=partner.pairedController=controller;this.touch();
  this.emit('PAIRED',{source:ref(source),partner:ref(partner),controller});return true;
 },
 soulbondTriggers(event){
  const entrant=this.object(event.change?.afterRef);
  if(!entrant||!this.characteristics(entrant).types.includes('Creature'))return;
  for(const source of this.controlled(entrant.controller)){
   if(!this.characteristics(source).keywords.includes('Soulbond')||!this.unpairedCreature(source,entrant.controller))continue;
   const own=source.id===entrant.id;
   if(own?!this.controlled(source.controller).some(o=>o.id!==source.id&&this.unpairedCreature(o,source.controller)):!this.unpairedCreature(entrant,source.controller))continue;
   let multiplier=1;for(const doubler of this.objects('battlefield')){
    const rule=this.module(doubler).triggerMultiplier;if(rule&&rule(this,doubler,event,source))multiplier++;
   }
   for(let i=0;i<multiplier;i++)this.queueTrigger({source:ref(source),sourceCardId:source.copy?.rulesId||source.cardId,
    controller:source.controller,abilityId:'soulbond',label:`${this.definition(source).name} — Soulbond`,
    context:this.context(source,{event,triggerId:'soulbond'}),
    program:[{op:'soulbond',entrant:own?null:ref(entrant)}]});
  }
 },
 soulbondChoice(command,context){
  const source=this.object(context.source);if(!this.unpairedCreature(source,context.controller))return;
  const possible=command.entrant?[this.object(command.entrant)]:this.controlled(context.controller);
  const choices=possible.filter(o=>o?.id!==source.id&&this.unpairedCreature(o,context.controller));if(!choices.length)return;
  // Preserve offered incarnations through the choice. Pairing never targets, so
  // shroud/hexproof do not remove otherwise eligible partners.
  context.vars.soulbondCandidates=choices.map(ref);
  this.insertEffects([{op:'choose',key:'soulbondPartner',label:'Soulbond — pair with one creature, or choose none',
    selector:{zones:['battlefield'],ids:choices.map(o=>o.id),controller:context.controller,creature:true},min:0,max:1},
    {op:'pair',partner:'$var.soulbondPartner'}]);
 },
 finishPair(command,context){
  const id=asArray(command.partner)[0],reference=(context.vars.soulbondCandidates||[]).find(r=>r.id===(id?.id||id));
  if(reference)this.pairCreatures(context.source,reference,context.controller);
 },
};
