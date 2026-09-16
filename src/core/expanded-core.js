import { clone,ref,sameRef,asArray,unique,requireRule,integer,COLORS,emptyMana } from './util.js';
import { parseManaCost,validatePayment,suggestPayment,spendPayment } from './mana.js';

const permanentTypes=['Artifact','Creature','Enchantment','Land','Planeswalker','Battle'];
const basicTypes={Plains:'W',Island:'U',Swamp:'B',Mountain:'R',Forest:'G'};
const arr=(value,g,source,context)=>typeof value==='function'?value(g,source,context):value||[];
const costKey=(cost,i)=>cost.key||`cost-${i}`;
const spellCount=(g,p)=>g.state.turnCounts[`spells:${p}`]||0;
const modeModule=(g,cardId,snapshot)=>{
 const root=g.registry.module(cardId),face=snapshot?.copy?.rulesFace??snapshot?.face??0;
 return face&&root.back?root.back:root;
};

/** Additional typed mechanics for the expanded pool. Every suspension remains
 * in serializable game state, never a closure or hidden DOM-only game action. */
export function installExpandedEngine(Engine){
 const proto=Engine.prototype;
 if(proto.expansionInstalled)return;proto.expansionInstalled=true;
 const old=Object.fromEntries(['definition','module','abilities','landAllowance','castingPermissions','beginSpecial','draftDefinition','draftCosts','inputSpecs','materializeInput','validateInput','validateDraft','quoteDraft','payDraftCosts','finishDraft','triggerDefinition','executeEffect','acceptChoice','handleAction','addCounters','addMana','drawCards','moveBatch','checkStateActions','processStep','advanceOneStep','startNextTurn','declareAttackers','copiableValues','emit','effectChoose','dealDamage','baseCharacteristics'].map(k=>[k,proto[k]]));
 Object.assign(proto,{
  definition(value){
   const o=typeof value==='string'?this.object(value):value;requireRule(o,'That game object no longer exists.');
   if(o.copy)return o.copy;
   const def=this.registry.get(o.cardId),mod=this.registry.module(o.cardId);
   if(!mod.back||!def.faces?.length)return def;
   this.registry.faceDefinitions||=new Map();const k=`${def.id}/${o.face?1:0}`;
   if(!this.registry.faceDefinitions.has(k)){
    const f=def.faces[o.face?1:0],parts=f.type_line.split(' — '),words=parts[0].split(' '),types=words.filter(t=>permanentTypes.includes(t)||['Instant','Sorcery','Tribal','Kindred'].includes(t));
    const keywords=o.face?(mod.back.keywords||[]):def.keywords;
    this.registry.faceDefinitions.set(k,{...def,name:f.name,typeLine:f.type_line,types,subtypes:parts[1]?.split(' ')||[],supertypes:words.filter(t=>['Basic','Legendary','Snow','World'].includes(t)),
     manaCost:o.face&&def.layout!=='flip'?f.mana_cost:def.manaCost,colors:f.colors||def.colors,oracleText:f.oracle_text,power:f.power||null,toughness:f.toughness||null,loyalty:f.loyalty||null,keywords:[...keywords],image:o.face&&def.backImage?def.backImage:def.image,rulesFace:o.face?1:0});
   }
   return this.registry.faceDefinitions.get(k);
  },
  module(value){
   const o=typeof value==='string'?this.object(value):value;if(!o)return {};
   return modeModule(this,o.copy?.rulesId||o.cardId,o);
  },
  abilities(value){
   const o=typeof value==='string'?this.object(value):value;if(!o)return [];
   const abilities=[...(this.module(o).activated||[])];
   if(o.zone==='battlefield'){
    for(const s of this.objects('battlefield'))for(const grant of this.module(s).grants||[])if(grant.match(this,s,o)){
      const template=this.registry.grantedAbilities?.get(grant.ability);if(template&&!abilities.some(a=>a.id===template.id))abilities.push(template);
    }
    const c=this.characteristics(o),inherent=c.types.includes('Land')?Object.entries(basicTypes).filter(([type])=>c.subtypes.includes(type)).map(([,color])=>color):[];
    const printed=this.registry.get(o.cardId).subtypes||[];
    if(inherent.length&&c.subtypes.some(t=>basicTypes[t]&&!printed.includes(t)))abilities.push(this.registry.grantedAbilities.get('intrinsic-basic-mana'));
   }
   return abilities.filter(a=>a&&(a.zone||'battlefield')===o.zone&&(!a.available||a.available(this,o)));
  },
  abilityDefinition(cardId,id,snapshot){return this.registry.grantedAbilities?.get(id)||(modeModule(this,cardId,snapshot).activated||[]).find(a=>a.id===id);},
  landAllowance(player=0){let n=old.landAllowance.call(this,player);for(const s of this.objects('battlefield'))n+=Number(this.module(s).globalExtraLands)||0;return n;},
  castingPermissions(o,land=false){
   let result=old.castingPermissions.call(this,o,land);const m=this.module(o),c=this.characteristics(o);
   if(land)return result;
   if(m.noManaCost)result=result.filter(p=>p.method!=='normal');
   if(m.escape&&o.zone==='graveyard'&&o.owner===0)result.push({id:'escape',method:'alternate',label:`Escape ${m.escape.cost}`,cost:m.escape.cost,escape:true,additionalCosts:[{kind:'exile',key:'escapeCards',selector:{zones:['graveyard'],owner:0,another:true},count:m.escape.count}]});
   const normals=result.filter(p=>p.method==='normal');
   if(m.warp&&o.zone==='hand')for(const p of normals)result.push({...p,id:p.id+'/warp',method:'alternate',cost:m.warp,label:`Warp ${m.warp}`,warp:true});
   if(m.offering)for(const p of normals)result.push({...p,id:p.id+'/offering',method:'alternate',cost:this.definition(o).manaCost,offering:true,instant:true,label:`${m.offering} offering`,additionalCosts:[...(p.additionalCosts||[]),{kind:'sacrifice',key:'offering',selector:{zones:['battlefield'],controller:0,subtype:m.offering},count:1}]});
   for(const s of this.controlled(0))for(const rule of this.module(s).alternateSpellCosts||[])if(rule.test(this,s,o))for(const p of normals)result.push({...p,id:p.id+':'+s.id+':'+rule.id,method:'alternate',cost:rule.cost||'',label:rule.label,additionalCosts:[...(p.additionalCosts||[]),...clone(arr(rule.costs,this,s,this.context(o)))]});
   // Granting flash changes timing, not the available zone or alternative cost.
   if(this.controlled(o.owner).some(s=>this.module(s).flashPermission?.(this,s,o)))result=result.map(p=>({...p,instant:true}));
   if(this.state.effects.some(e=>e.kind==='noMoreSpells'&&e.controller===o.owner))result=[];
   return result;
  },
  beginSpecial(action){
   if(action.special!=='suspend')return old.beginSpecial.call(this,action);
   const source=this.object(action.id),m=source&&this.module(source);requireRule(source?.zone==='hand'&&source.owner===0&&m.suspend,'Suspend is not available for this card.');
   requireRule(this.isSorceryTime()||this.characteristics(source).keywords.includes('Flash')||this.controlled(0).some(s=>this.module(s).flashPermission?.(this,s,source)),'Suspend this artifact only when you could cast it.','TIMING');
   requireRule(!this.state.effects.some(e=>e.kind==='noMoreSpells'&&e.controller===0),'You cannot suspend a card while prohibited from casting it.');
   this.state.actionDraft={kind:'suspend',source:ref(source),sourceCardId:source.cardId,context:this.context(source,{inputs:clone(action.inputs||{})}),targets:[],autoPayment:action.payment==='auto',payment:action.payment&&action.payment!=='auto'?clone(action.payment):null};this.advanceDraft();
  },
  draftDefinition(draft=this.state.actionDraft){
   if(draft?.kind==='suspend')return {id:'suspend',cost:this.registry.module(draft.sourceCardId).suspend.cost};
   if(draft?.kind==='ability')return this.abilityDefinition(draft.sourceCardId,draft.abilityId,draft.context?.sourceSnapshot);
   return old.draftDefinition.call(this,draft);
  },
  triggerDefinition(o){
   if(o.program)return old.triggerDefinition.call(this,o);
   return (modeModule(this,o.sourceCardId,o.context?.sourceSnapshot).triggers||[]).find(t=>t.id===o.abilityId);
  },
  draftCosts(draft){
   const result=old.draftCosts.call(this,draft),def=this.draftDefinition(draft),source=this.object(draft.source);
   if(typeof def.energy==='function')for(const cost of result)if(cost.kind==='energy')cost.amount=def.energy(this,source,draft.context);
   if(draft.kind==='spell'&&this.module(source).improvise)result.push({kind:'tap',key:'improvise',label:'Improvise — optionally tap artifacts for generic mana',selector:{zones:['battlefield'],controller:0,artifact:true,tapped:false},min:0,max:100000,improvise:true});
   return result;
  },
  inputSpecs(draft){
   const specs=old.inputSpecs.call(this,draft);
   if(draft.kind==='spell'&&draft.permission?.method==='alternate'&&draft.permission.cost===''){
    draft.context.inputs.x=0;return specs.filter(s=>s.key!=='x');
   }
   return specs;
  },
  materializeInput(spec,context){
   if(!['anyTarget','stackTarget'].includes(spec.type))return old.materializeInput.call(this,spec,context);
   let options=[];
   if(spec.type==='anyTarget'){
    if(!spec.noPlayers)options.push(...this.state.players.filter(p=>!p.lost&&!this.playerProtected(p.id,context.controller)).map(p=>({value:`player:${p.id}`,label:p.name})));
    const types=spec.types||['Creature','Planeswalker','Battle'];
    options.push(...this.select({zones:['battlefield'],type:types,target:true,...(spec.selector||{})},context).map(id=>({value:id,label:this.definition(id).name})));
   }else options=this.state.stack.filter(s=>(spec.spellOnly?s.kind==='spell':true)&&(!spec.opponent||s.controller!==context.controller)).map(s=>({value:`stack:${s.id}`,label:s.label}));
   return {...clone(spec),min:spec.min??1,max:spec.max??1,options};
  },
  validateInput(spec,value,context){
   const result=old.validateInput.call(this,spec,value,context);
   if(spec.allowedCounts)requireRule(spec.allowedCounts.includes(asArray(result).length),'Choose none or the complete required group.','INVALID_SELECTION');
   if(spec.differentNames)requireRule(unique(asArray(result).map(id=>this.characteristics(id).name)).length===asArray(result).length,'Choose cards with different names.','INVALID_SELECTION');
   return result;
  },
  targetRecords(spec,value,context){
   if(spec.type==='player')return asArray(value).map(player=>({key:spec.key,player}));
   return asArray(value).map(v=>{
    if(typeof v==='string'&&v.startsWith('player:'))return {key:spec.key,player:Number(v.slice(7)),encoded:true};
    if(typeof v==='string'&&v.startsWith('stack:'))return {key:spec.key,stackId:v.slice(6),spellOnly:!!spec.spellOnly,opponent:!!spec.opponent};
    return {key:spec.key,ref:ref(this.object(v)),selector:clone(spec.selector||{zones:['battlefield'],type:spec.types||['Creature','Planeswalker','Battle'],target:true}),encoded:spec.type==='anyTarget'};
   });
  },
  validateDraft(draft){
   old.validateDraft.call(this,draft);const source=this.object(draft.source),def=this.draftDefinition(draft);
   if(draft.kind==='ability'){
    if(def.instantOnly)requireRule(!this.state.resolving&&!this.state.paymentParent&&!this.state.effectPaymentParent,'This ability can only be activated with priority, not while paying for a spell.','TIMING');
    if(def.oncePerTurn)requireRule(source.flags[`activated:${def.id}`]!==this.state.turnSerial,'This ability has already been activated this turn.','ONCE_PER_TURN');
   }
   if(draft.kind==='spell'){
    requireRule(!this.module(source).noManaCost||draft.permission?.method!=='normal','This card has no payable mana cost. Suspend it or use a suitable alternative cost.','NO_MANA_COST');
    requireRule(!this.state.effects.some(e=>e.kind==='noMoreSpells'&&e.controller===0),'You cannot cast more spells this turn.','CAST_LIMIT');
    for(const s of this.objects('battlefield'))if(this.module(s).canCast)requireRule(this.module(s).canCast(this,s,source),'A permanent prevents you from casting spells now.','CAST_RESTRICTION');
    if(draft.permission?.onceKey)requireRule(!this.state.turnCounts[draft.permission.onceKey],'This play permission has already been used this turn.','CAST_LIMIT');
    if(this.module(source).improvise)requireRule(asArray(draft.context.inputs.improvise).length<=this.quoteDraft(draft).improviseLimit,'Only tap enough artifacts to pay generic mana.','IMPROVISE');
   }
  },
  quoteDraft(draft){
   const source=this.object(draft.source),definition=this.draftDefinition(draft),c=this.characteristics(source),input=draft.context.inputs,permission=draft.permission;
   let text=typeof definition.cost==='function'?definition.cost(this,source,draft.context):definition.cost||'';
   if(draft.kind==='spell')text=this.definition(source).manaCost;
   if(draft.kind==='spell'&&['free','life','alternate'].includes(permission?.method))text=permission.cost||'';
   const cost=parseManaCost(text,{x:input.x||0,hybrid:input.hybrid,phyrexianLife:input.phyrexian==='life'});
   if(permission?.method==='life')cost.life+=c.manaValue;
   if(permission?.commander)cost.generic+=2*(this.state.commanderCasts[source.cardId]||0);
   if(draft.kind==='spell'){
    for(const provider of this.objects('battlefield')){const tax=this.module(provider).spellTax;if(tax)cost.generic+=tax(this,provider,source,draft.context)||0;}
    if(permission?.offering){const offered=this.object(asArray(input.offering)[0]);if(offered){const sub=parseManaCost(this.characteristics(offered).manaCost);let reduction=sub.generic;for(const color of COLORS){const exact=Math.min(cost.colored[color],sub.colored[color]);cost.colored[color]-=exact;reduction+=sub.colored[color]-exact;}cost.generic-=reduction;}}
    let reduction=typeof this.module(source).costReduction==='function'?this.module(source).costReduction(this,source,draft.context):this.module(source).costReduction||0;
    for(const provider of this.controlled(0))for(const modifier of this.module(provider).costModifiers||[])if(!modifier.test||modifier.test(this,provider,source))reduction+=modifier.amount(this,provider,source,draft.context);
    for(const effect of this.state.effects.filter(e=>e.kind==='costReduction'&&e.controller===0))if(!effect.types||effect.types.some(t=>c.types.includes(t)))reduction+=effect.amount;
    cost.generic=Math.max(0,cost.generic-reduction);
   }
   const improviseLimit=cost.generic;
   if(draft.kind==='spell'&&this.module(source).improvise)cost.generic=Math.max(0,cost.generic-asArray(input.improvise).length);
   return {cost,improviseLimit,context:{kind:draft.kind==='spell'?'spell':'ability',types:c.types,...(!this._legacyGodsRules?{legendary:c.supertypes.includes('Legendary')}:{}),spendAsAny:this.hasStatic('spendAsAny',0)}};
  },
  payDraftCosts(draft,payment){
   const tagged=clone(this.state.players[0].restrictedMana);const paid=old.payDraftCosts.call(this,draft,payment);
   draft.context.spentManaSources=unique(paid.tagged.filter(t=>t.amount>0).map(t=>tagged.find(m=>m.id===t.id)?.source).filter(Boolean).map(r=>JSON.stringify(r))).map(s=>JSON.parse(s));
   const d=this.draftDefinition(draft),o=this.object(draft.source)||draft.context.sourceSnapshot;
   if(draft.kind==='ability'&&d.tap&&d.mana&&this.characteristics(o).types.includes('Land'))this.emit('LAND_TAPPED_FOR_MANA',{object:ref(o),controller:o.controller,abilityId:d.id});
   if(draft.kind==='ability'&&d.saddle&&this.object(draft.source)){const mount=this.object(draft.source);mount.flags.saddledBy||=[];mount.flags.saddledBy.push(...(draft.context.costs.saddlers||[]).map(s=>({ref:ref(s),turn:this.state.turnSerial})));}
   if(draft.kind==='ability'&&d.oncePerTurn&&this.object(draft.source))this.object(draft.source).flags[`activated:${d.id}`]=this.state.turnSerial;
   return paid;
  },
  finishDraft(draft,payment=null){
   if(draft.kind==='suspend'){
    this.payDraftCosts(draft,payment);const m=this.registry.module(draft.sourceCardId);this.state.pending=null;this.state.actionDraft=null;
    const changes=this.moveBatch([{id:draft.source,to:'exile',cause:'suspend'}]);const o=changes?.length&&this.object(changes[0].afterRef);
    if(o){o.flags.suspended=true;o.counters.time=m.suspend.time;this.record('SUSPENDED',{object:ref(o),time:m.suspend.time});}return;
   }
   return old.finishDraft.call(this,draft,payment);
  },
  addCounters(value,type,n,cause='effect'){
   const o=this.object(value);if(o?.zone==='exile'&&type==='time'){
    const from=o.counters.time||0,to=Math.max(0,from+n);if(from===to)return;o.counters.time=to;this.touch();this.emit('COUNTER_CHANGED',{object:ref(o),type,from,to,cause});
    if(from>0&&to===0&&this.module(o).suspend)this.emit('SUSPEND_LAST_REMOVED',{object:ref(o),player:o.owner});return;
   }
   return old.addCounters.call(this,value,type,n,cause);
  },
  addMana(player,production,source=null,restriction=null,details={}){
   if(!details.retain&&!details.track)return old.addMana.call(this,player,production,source,restriction);
   const p=this.manaPlayer(player);for(const [color,value]of Object.entries(production)){
    requireRule(COLORS.includes(color),'Invalid mana color.');const amount=integer(value,0,1000000);if(amount)p.restrictedMana.push({id:`m${this.state.nextId++}`,color,amount,restriction,source:clone(source),...(details.retain?{retain:details.retain}:{}),...(details.track?{tracked:true}:{})});
   }
   this.emit('MANA_ADDED',{player,production,source:clone(source),restriction});
  },
  transform(value){
   const o=this.object(value);if(o?.zone!=='battlefield')return;
   const m=this.registry.module(o.copy?.rulesId||o.cardId);if(!m.back)return;
   if(o.copy){if(!o.copy.faces?.length)return;const face=o.copy.rulesFace?0:1;const temp={...o,copy:null,cardId:o.copy.rulesId,face};o.copy={...clone(this.definition(temp)),rulesId:o.copy.rulesId,rulesFace:face};}
   else o.face=o.face?0:1;
   this.touch();this.emit('TRANSFORMED',{object:ref(o),face:o.copy?.rulesFace??o.face});
  },
  copiableValues(value,exceptions={}){
   const o=typeof value==='string'?this.object(value):value;
   const copy=old.copiableValues.call(this,{...o,definition:o.definition||this.definition(o)},exceptions);
   if(o.copy?.rulesFace||o.face){copy.rulesFace=1;if(this.registry.get(o.cardId).layout!=='flip')copy.manaValue=0;}
   if(exceptions.keywords)copy.keywords=unique([...copy.keywords,...exceptions.keywords]);
   return copy;
  },
  executeEffect(command,context){
   const cmd=this.value(command,context),p=cmd.player??context.controller??0;
   if(command.op==='mana')return this.addMana(p,cmd.production||{[cmd.color||'C']:cmd.amount??1},context.source,cmd.restriction||null,{retain:cmd.retain,track:cmd.track});
   if(command.op==='extraTurn'){this.state.extraTurns||=[];this.state.extraTurns.push(p);this.record('EXTRA_TURN_SCHEDULED',{player:p});return;}
   if(command.op==='transform')return this.transform(cmd.ids||context.source);
   if(command.op==='temporaryCopy'){
    const source=cmd.snapshot||this.object(asArray(cmd.target||cmd.source)[0]);if(!source)return;
    for(const id of this.effectIds(command.ids||'$source',context)){
     const target=this.object(id);if(target?.zone!=='battlefield')continue;
     this.state.effects.push({id:`copy-${this.state.nextId++}`,kind:'temporaryCopy',target:ref(target),before:clone(target.copy),expires:cmd.expires||'endOfTurn'});
     target.copy=this.copiableValues(source,cmd.exceptions||{});this.touch();this.emit('COPIED',{object:ref(target),copied:source.id?ref(source):null});
    }return;
   }
   if(command.op==='gainControl'){
    const o=this.object(asArray(cmd.ids)[0]);if(!o||o.zone!=='battlefield')return;
    this.state.effects.push({id:`control-${this.state.nextId++}`,kind:'control',target:ref(o),provider:clone(context.source),controller:p,previousController:o.controller,expires:cmd.expires||'whileSourceControlled'});
    o.controller=p;o.controlledSince=this.state.turnSerial;this.touch();this.emit('CONTROL_CHANGED',{object:ref(o),controller:p});return;
   }
   if(command.op==='unearth'){
    const o=this.object(cmd.source||context.source);if(!o||o.zone!=='graveyard')return;
    const changes=this.moveBatch([{id:ref(o),to:'battlefield',cause:'unearth',flags:{unearthed:true},modifications:[{keywords:['Haste']}]}],context);
    if(changes?.length)this.state.delayed.push({id:`delayed-${this.state.nextId++}`,when:'nextEnd',controller:p,label:'Unearth — exile this permanent',context:clone(context),program:[{op:'move',ids:changes[0].afterRef,to:'exile',cause:'unearth-end'}]});return;
   }
   if(command.op==='suspendCast'){
    const o=this.object(context.source);if(!o||o.zone!=='exile'||!this.module(o).suspend||(o.counters.time||0)>0)return;
    this.insertEffects([{op:'castChoice',ids:[ref(o)],method:'free',label:'You may cast the suspended card without its mana cost'}]);return;
   }
   if(command.op==='opponentPayment'){
    requireRule(p!==0,'Use the normal payment chooser for your own costs.');
    this.state.pending={kind:'opponentPayment',label:`${this.state.players[p].name}: pay ${cmd.mana}?`,player:p,mana:cmd.mana,min:1,max:1,
      options:[{value:'decline',label:'Does not pay'},{value:'pay',label:'Pays (abstract opponent decision)'}],then:clone(command.then||[]),else:clone(command.else||[])};return;
   }
   if(command.op==='emblem'){
    this.state.emblems.push({controller:p,sourceCardId:context.sourceCardId,...clone(cmd.emblem)});this.record('EMBLEM_CREATED',{controller:p,emblem:cmd.emblem});return;
   }
   if(command.op==='explore'){
    const creature=this.object(cmd.source||context.source);if(!creature||creature.zone!=='battlefield')return;
    const top=this.top(creature.controller);if(top)this.record('REVEALED',{ids:[top.id],reason:'explore'});
    if(top&&this.characteristics(top).types.includes('Land'))this.moveBatch([{id:ref(top),to:'hand',cause:'explore-land'}]);
    else {this.addCounters(ref(creature),'+1/+1',1);if(top)this.insertEffects([{op:'choose',key:'exploreGraveyard',label:'Explore — put this card in your graveyard?',options:[{value:'keep',label:'Keep on top'},{value:'graveyard',label:'Put in graveyard'}]},{op:'if',test:{eq:['$var.exploreGraveyard','graveyard']},then:[{op:'move',ids:[ref(top)],to:'graveyard',cause:'explore'}]}]);}
    this.emit('EXPLORED',{object:ref(creature),card:ref(top)});return;
   }
   if(command.op==='counterPlayer'){
    for(const player of asArray(cmd.players)){const v=this.manaPlayer(player);for(const key of ['energy','poison'])if(v[key]>0)v[key]++;this.emit('PLAYER_COUNTERS_PROLIFERATED',{player});}return;
   }
   if(command.op==='battlefieldBatchSelect')return this.effectChoose(command,context);
   return old.executeEffect.call(this,command,context);
  },
  effectChoose(command,context){
   const result=old.effectChoose.call(this,command,context);if(this.state.pending?.kind==='effect'){if(command.differentNames)this.state.pending.differentNames=true;if(command.allowedCounts)this.state.pending.allowedCounts=command.allowedCounts;}return result;
  },
  dredgeChoices(player=0){
   const size=this.activeLibrary(player).length;
   return this.objects('graveyard',player).flatMap(o=>{
    const options=[];if(this.module(o).dredge)options.push(this.module(o).dredge);
    for(const s of this.controlled(player))if(this.module(s).grantDredge?.(this,s,o))options.push(this.module(s).grantDredge(this,s,o));
    return unique(options).filter(n=>size>=n).map(n=>({id:o.id,ref:ref(o),count:n}));
   });
  },
  drawCards(count=1,player=0,cause='draw',settings={}){
   const result=[];
   for(let i=0;i<count;i++){
    const dredge=player===0&&!(i===0&&settings.skipFirstDredge)?this.dredgeChoices(player):[];
    if(dredge.length){
     this.state.drawContinuation={remaining:count-i,player,cause,accumulated:result};
     this.state.pending={kind:'dredge',label:'Draw a card or replace the draw with dredge',min:1,max:1,choices:dredge,options:[{value:'draw',label:'Draw normally'},...dredge.map(d=>({value:d.id+':dredge:'+d.count,label:`Dredge ${d.count} — ${this.definition(d.id).name}`}))]};return result;
    }
    const one=old.drawCards.call(this,1,player,cause);result.push(...one);
    if(this.state.pending){if(this.state.drawContinuation){this.state.drawContinuation.remaining+=count-i-1;this.state.drawContinuation.accumulated=[...result];}return result;}
   }
   return result;
  },
  acceptChoice(value,action={}){
   const pending=this.state.pending;
   if(pending?.kind==='opponentPayment'){
    requireRule(['pay','decline'].includes(value),'Choose the opponent response.');
    if(value==='pay'){
     const cost=parseManaCost(pending.mana),pool=this.state.players[pending.player],payment=suggestPayment(cost,pool,{kind:'effect'});
     if(payment)spendPayment(cost,pool,{kind:'effect'},payment);
     this.record('ABSTRACT_OPPONENT_PAYMENT',{player:pending.player,mana:pending.mana,paidFromModeledPool:!!payment});
    }else this.record('OPPONENT_DECLINED_PAYMENT',{player:pending.player});
    this.state.pending=null;this.insertEffects(value==='pay'?pending.then:pending.else);this.runEffects();return;
   }
   if(pending?.kind==='dredge'){
    requireRule(pending.options.some(o=>o.value===value),'Choose a listed draw replacement.');
    const continuation=this.state.drawContinuation;this.record('CHOICE_MADE',{kind:'dredge',value});this.state.pending=null;this.state.drawContinuation=null;
    let drawn=[];
    if(value==='draw')drawn=this.drawCards(1,continuation.player,continuation.cause,{skipFirstDredge:true});
    else {
     const choice=pending.choices.find(d=>d.id+':dredge:'+d.count===value);requireRule(this.object(choice.ref)?.zone==='graveyard'&&this.activeLibrary(continuation.player).length>=choice.count,'That dredge replacement is no longer possible.');
     this.millCards(choice.count,continuation.player);this.moveBatch([{id:choice.ref,to:'hand',cause:'dredge'}]);this.record('DREDGED',{card:choice.ref,count:choice.count,player:continuation.player});
    }
    const before=[...continuation.accumulated,...drawn];
    if(this.state.pending&&this.state.drawContinuation){this.state.drawContinuation.remaining+=continuation.remaining-1;this.state.drawContinuation.accumulated=before;this.state.drawContinuation.resultKey=continuation.resultKey;}
    else {
     const rest=this.drawCards(continuation.remaining-1,continuation.player,continuation.cause);
     if(this.state.drawContinuation){this.state.drawContinuation.accumulated=[...before,...this.state.drawContinuation.accumulated];this.state.drawContinuation.resultKey=continuation.resultKey;}
     if(continuation.resultKey&&this.state.resolving)this.state.resolving.context.vars[continuation.resultKey]=[...before,...rest];
    }
    if(this.state.resolving&&!this.state.pending)this.runEffects();return;
   }
   return old.acceptChoice.call(this,value,action);
  },
  checkStateActions(){
   for(const e of [...this.state.effects].reverse())if(e.kind==='control'&&e.expires==='whileSourceControlled'){
    const provider=this.object(e.provider),target=this.object(e.target);
    if(!target||!provider||provider.zone!=='battlefield'||provider.controller!==e.controller){
     if(target?.zone==='battlefield'&&target.controller===e.controller){target.controller=e.previousController;target.controlledSince=this.state.turnSerial;this.touch();}
     this.state.effects=this.state.effects.filter(x=>x!==e);
    }
   }
   for(const player of this.state.players)if(!player.cityBlessing&&this.controlled(player.id).length>=10&&this.controlled(player.id).some(o=>this.module(o).ascend)){player.cityBlessing=true;this.record('CITY_BLESSING',{player:player.id});this.touch();}
   const dead=this.objects('battlefield').filter(o=>o.flags.deathtouchDamage&&this.characteristics(o).types.includes('Creature')&&!this.characteristics(o).keywords.includes('Indestructible'));if(dead.length){this.moveBatch(dead.map(o=>({id:ref(o),to:'graveyard',cause:'destroy'})));return true;}
   return old.checkStateActions.call(this);
  },
  advanceOneStep(){
   const retained=this.state.players.map(p=>clone(p.restrictedMana.filter(m=>m.retain==='endOfTurn'&&this.state.step!=='cleanup')));
   const result=old.advanceOneStep.call(this);for(const p of this.state.players)p.restrictedMana.push(...retained[p.id]);return result;
  },
  processStep(step){
   if(step==='beginCombat')this.state.combatDamageStage=0;
   if(step==='cleanup'){
    for(const o of this.objects('battlefield'))delete o.flags.deathtouchDamage;
    for(const e of [...this.state.effects].reverse())if(e.kind==='temporaryCopy'&&e.expires==='endOfTurn'){const o=this.object(e.target);if(o)o.copy=clone(e.before);}
   }
   old.processStep.call(this,step);
   const player=this.state.activePlayer;
   if(step==='upkeep'){
    const due=this.state.delayed.filter(d=>d.when==='nextUpkeep');this.state.delayed=this.state.delayed.filter(d=>!due.includes(d));
    for(const d of due)this.queueTrigger({controller:d.controller,source:d.context.source,sourceCardId:d.context.sourceCardId,abilityId:d.id,label:d.label,program:d.program,context:clone(d.context)});
   }
   if(step==='cleanup'&&this.state.emblems.some(e=>e.noMaximumHandSize&&e.controller===player)&&this.state.pending?.kind==='cleanupDiscard')this.state.pending=null;
  },
  startNextTurn(){
   let next=null;
   while(this.state.extraTurns?.length&&next==null){const p=this.state.extraTurns.pop();if(!this.state.players[p].lost)next=p;}
   if(next==null){
    if(this.state.extraTurnReturn!=null){this.state.activePlayer=this.state.extraTurnReturn;delete this.state.extraTurnReturn;}
    return old.startNextTurn.call(this);
   }
   // Last-created extra turn is taken first. Ordinary rotation resumes from the
   // player whose normal turn ended, not from the last extra turn's controller.
   if(this.state.extraTurnReturn==null)this.state.extraTurnReturn=this.state.activePlayer;
   this.state.activePlayer=(next+3)%4;old.startNextTurn.call(this);
   this.record('EXTRA_TURN_BEGAN',{player:next});
  },
  moveBatch(requests,context={}){
   const changes=old.moveBatch.call(this,requests,context);
   for(const change of changes||[])if(change.to==='battlefield'&&change.object.flags.warped){
    const c=this.context(this.object(change.afterRef));
    this.state.delayed.push({id:`warp-${this.state.nextId++}`,when:'nextEnd',controller:change.object.controller,label:'Warp — exile this permanent until a later turn',context:c,program:[{op:'call',handler:'expanded.warp-exile',card:change.afterRef}]});
   }
   return changes;
  },
  dealDamage(target,amount,context={}){
   const start=this.state.eventSerial;old.dealDamage.call(this,target,amount,context);
   const dealt=(this.transaction?.events||[]).filter(e=>e.sequence>start&&e.type==='DAMAGE_DEALT').reduce((n,e)=>n+e.amount,0);
   const source=this.object(context.source)||context.sourceSnapshot;
   if(dealt>0&&source){const c=this.characteristics(source);if(c.keywords.includes('Lifelink'))this.changeLife(source.controller,dealt,'lifelink');
    if(c.keywords.includes('Deathtouch')&&typeof target!=='number'){const o=this.object(target);if(o&&this.characteristics(o).types.includes('Creature')){o.flags.deathtouchDamage=true;this.touch();}}}
  },
  counterSpell(stackId,context={}){
   const spell=this.state.stack.find(s=>s.id===stackId);if(!spell||spell.kind!=='spell')return false;
   const card=this.object(spell.source);
   if(card&&(this.module(card).uncounterable||this.hasStatic('spellsUncounterable',spell.controller))){this.record('COUNTER_PREVENTED',{stackId});return false;}
   this.state.stack=this.state.stack.filter(s=>s!==spell);if(card)this.moveBatch([{id:ref(card),to:'graveyard',cause:'counter'}],context);this.record('SPELL_COUNTERED',{stackId});return true;
  },
  handleAction(action){
   if(action.type==='CANCEL'&&this.state.pending?.kind==='dredge')return this.acceptChoice('draw');
   if(action.type==='CANCEL'&&this.state.pending?.kind==='opponentPayment')return this.acceptChoice('decline');
   if(action.type==='GOLDFISH_COMBAT_DAMAGE'){
    requireRule(!this.state.pending&&!this.state.resolving&&!this.state.actionDraft&&!this.state.stack.length,'Resolve choices and the stack first.');
    requireRule(this.state.activePlayer===0&&this.state.step==='damage','Apply combat damage during your combat damage step.');
    const attackers=this.controlled(0).filter(o=>o.flags.attacking&&this.characteristics(o).types.includes('Creature'));
    const stage=this.state.combatDamageStage||0;requireRule(stage<2,'Combat damage has already been assigned.');
    const first=attackers.some(o=>this.characteristics(o).keywords.some(k=>['First strike','Double strike'].includes(k)));
    const firstStage=stage===0&&first;this.state.combatDamageStage=firstStage?1:2;
    const packet=attackers.filter(o=>{const k=this.characteristics(o).keywords;return firstStage?k.includes('First strike')||k.includes('Double strike'):stage===0||!k.includes('First strike')||k.includes('Double strike');}).map(o=>({source:this.lastKnown(o),player:o.flags.attacking.player,amount:Math.max(0,this.characteristics(o).power)}));
    this.record('GOLDFISH_COMBAT_ASSIGNMENT',{unblocked:true,stage:firstStage?'firstStrike':'normal',packet:packet.map(p=>({source:ref(p.source),player:p.player,amount:p.amount}))});
    for(const hit of packet){if(!hit.amount||this.state.players[hit.player].lost)continue;const before=this.state.eventSerial;this.dealDamage(hit.player,hit.amount,{controller:0,source:ref(hit.source),sourceSnapshot:hit.source});
     if((this.transaction?.events||[]).some(e=>e.sequence>before&&e.type==='DAMAGE_DEALT')){
      if(hit.source.commander)this.state.players[hit.player].commanderDamage[hit.source.cardId]=(this.state.players[hit.player].commanderDamage[hit.source.cardId]||0)+hit.amount;
      this.emit('COMBAT_DAMAGE_DEALT',{source:ref(hit.source),sourceSnapshot:hit.source,player:hit.player,controller:0,amount:hit.amount});
     }
    }return;
   }
   return old.handleAction.call(this,action);
  },
  declareAttackers(action){
   for(const entry of action.attackers||[]){const o=this.object(typeof entry==='string'?entry:entry.id);if(!o)continue;
    requireRule(!this.module(o).canAttack||this.module(o).canAttack(this,o),'This creature cannot attack in the current state.','ATTACK_RESTRICTION');
    for(const provider of this.objects('battlefield'))if(this.module(provider).attackAllowed)requireRule(this.module(provider).attackAllowed(this,provider,o,entry.player??action.player??1),'A permanent prevents this attack.','ATTACK_RESTRICTION');
   }
   return old.declareAttackers.call(this,action);
  },
 });
}
