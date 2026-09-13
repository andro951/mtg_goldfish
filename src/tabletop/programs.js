import { Engine, clone, stateHash } from '../core/index.js';
import { requireRule } from '../core/util.js';

export const PROGRAM_LIMIT = 256;
export const programId=prefix=>prefix+'-'+Array.from(crypto.getRandomValues(new Uint32Array(4)),x=>x.toString(16).padStart(8,'0')).join('');
export const ACTION_TYPES = ['ACTIVATE_SINGLE_MANA','ACTIVATE_ABILITY','CAST_SPELL','PLAY_LAND','SPECIAL_ACTION','CHOOSE','REVISE_DRAFT_INPUT','RESOLVE_TOP'];
export const EVENTS = [
  ['afterResolve','After an effect resolves'],['beforeResolve','Before an effect resolves'],
  ['untapped','When a permanent untaps'],['tapped','When a permanent taps'],
  ['entered','When a permanent enters'],['left','When a permanent leaves'],
];
export function cleanPrograms(value={}) {
  const result={sequences:[],rules:[],paused:false,pauseReason:'',seen:[],queue:[]};
  if(!value||typeof value!=='object')return result;
  // Import is data only: no source code or executable expressions are accepted.
  for(const s of (Array.isArray(value.sequences)?value.sequences:[]).slice(0,100)) {
    if(typeof s?.id!=='string'||typeof s.name!=='string'||!Array.isArray(s.steps)||s.steps.length>PROGRAM_LIMIT)continue;
    if(s.steps.some(t=>!ACTION_TYPES.includes(t?.action?.type)))continue;
    result.sequences.push({id:s.id.slice(0,100),name:s.name.slice(0,120),steps:clone(s.steps),saved:!!s.saved});
  }
  for(const r of (Array.isArray(value.rules)?value.rules:[]).slice(0,100)) {
    if(typeof r?.id!=='string'||!EVENTS.some(([v])=>v===r.event)||!['hold','sequence','sequenceHold'].includes(r.action))continue;
    result.rules.push({id:r.id.slice(0,100),name:String(r.name||'Rule').slice(0,120),enabled:!!r.enabled,event:r.event,cardId:String(r.cardId||''),abilityId:String(r.abilityId||''),
      action:r.action,sequenceId:String(r.sequenceId||''),scope:['game','future','stack'].includes(r.scope)?r.scope:'game',stackIds:Array.isArray(r.stackIds)?r.stackIds.filter(x=>typeof x==='string').slice(0,5000):[],
      conditionMatch:r.conditionMatch==='any'?'any':'all',conditions:(Array.isArray(r.conditions)?r.conditions:[]).slice(0,12).filter(c=>c&&typeof c.cardId==='string').map(c=>({cardId:c.cardId,test:['present','absent','untapped'].includes(c.test)?c.test:'present'}))});
  }
  result.paused=!!value.paused;result.pauseReason=String(value.pauseReason||'').slice(0,200);
  result.seen=(Array.isArray(value.seen)?value.seen:[]).filter(s=>typeof s==='string').slice(-5000);
  result.queue=(Array.isArray(value.queue)?value.queue:[]).filter(e=>EVENTS.some(([v])=>v===e?.event)).slice(-200).map(e=>clone(e));
  return result;
}
export function futurePrograms(value){const programs=cleanPrograms(value);return cleanPrograms({sequences:programs.sequences.filter(s=>s.saved||programs.rules.some(r=>r.scope==='future'&&r.sequenceId===s.id)),rules:programs.rules.filter(r=>r.scope==='future')});}
export function restorePrograms(session,future){
  const stored=cleanPrograms(future);if(!session)return stored;
  const current=cleanPrograms(session);
  // The imported session is authoritative for its own toggles and bindings.
  for(const s of stored.sequences)if(!current.sequences.some(t=>s.id===t.id))current.sequences.push(s);
  for(const r of stored.rules)if(!current.rules.some(t=>r.id===t.id))current.rules.push(r);
  return current;
}
const descriptor=(g,o)=>({cardId:o.copy?.rulesId||o.cardId,name:g.definition(o).name,zone:o.zone,controller:o.controller,owner:o.owner,id:o.id,oid:o.oid});
function encodeValue(g,v){
  if(typeof v==='string'){
    const permission=/^([\w-]+):(\d+):(.+)$/.exec(v);
    if(permission){const provider=g.object({id:permission[1],oid:Number(permission[2])});if(provider)return {$permission:{provider:descriptor(g,provider),ruleId:permission[3]}};}
  }
  if(typeof v==='string'&&g.object(v))return {$card:descriptor(g,g.object(v))};
  if(v&&typeof v==='object'&&typeof v.id==='string'&&Number.isInteger(v.oid)&&Object.keys(v).every(k=>['id','oid'].includes(k))&&g.object(v))return {$card:descriptor(g,g.object(v)),$ref:true};
  if(Array.isArray(v))return v.map(x=>encodeValue(g,x));
  if(v&&typeof v==='object')return Object.fromEntries(Object.entries(v).map(([k,x])=>[k,encodeValue(g,x)]));
  return v;
}
function decodeValue(g,v,context={}){
  if(v?.$permission){const ref=decodeValue(g,{$card:v.$permission.provider,$ref:true},context);return `${ref.id}:${ref.oid}:${v.$permission.ruleId}`;}
  if(v?.$card){
    const d=v.$card,match=o=>o&&(o.copy?.rulesId||o.cardId)===d.cardId&&o.zone===d.zone&&o.controller===d.controller&&o.owner===d.owner;
    let o=context.sameGame?g.object(d.id):null;
    if(!match(o)){
      const choices=Object.values(g.state.instances).filter(match);
      requireRule(choices.length===1,choices.length?`Ambiguous copy of ${d.name}; record with a unique source or re-record this sequence.`:`${d.name} is not in ${d.zone}.`,'SEQUENCE_BINDING');o=choices[0];
    }
    return v.$ref?{id:o.id,oid:o.oid}:o.id;
  }
  if(Array.isArray(v))return v.map(x=>decodeValue(g,x,context));
  if(v&&typeof v==='object')return Object.fromEntries(Object.entries(v).map(([k,x])=>[k,decodeValue(g,x,context)]));
  return v;
}
export function captureStep(g,action){
  if(action.type==='DROP_CARD'&&action.zone==='battlefield'&&g.object(action.id)?.zone!=='battlefield')action={...action,type:g.characteristics(action.id).types.includes('Land')?'PLAY_LAND':'CAST_SPELL'};
  if(!ACTION_TYPES.includes(action.type))return null;
  const a=clone(action);delete a.placement;
  if(a.type==='CHOOSE'&&['payment','effectPayment'].includes(g.state.pending?.kind)&&a.value!=='decline')a.value='auto';
  const source=g.object(a.id),frame=g.state.resolving,top=g.state.stack.at(-1),draft=g.state.actionDraft,p=g.state.pending;
  const label=source?`${a.type==='ACTIVATE_SINGLE_MANA'?'Choose one mana':a.type==='ACTIVATE_ABILITY'?(g.abilities(source).find(x=>x.id===a.abilityId)?.label||a.abilityId):a.type==='PLAY_LAND'?'Play':'Cast'} — ${g.definition(source).name}`:
    a.type==='RESOLVE_TOP'?`Resolve — ${top?.label||'top of stack'}`:p?`${p.label}: ${Array.isArray(a.value)?a.value.map(id=>g.object(id)?g.definition(id).name:String(id)).join(', '):String(a.value)}`:a.type;
  const guard=p?{kind:p.kind,key:p.key||null,cardId:draft?.context?.sourceCardId||frame?.context?.sourceCardId||null,abilityId:draft?.abilityId||frame?.object?.abilityId||null}:
    a.type==='RESOLVE_TOP'?{stackCardId:top?.sourceCardId,stackAbilityId:top?.abilityId||null,stackKind:top?.kind}:null;
  // Ordered trigger IDs must map to their exact source/effect, not stale sN IDs.
  let stackChoice=null;
  if(p?.kind==='triggerOrder'&&Array.isArray(a.value)){
    stackChoice=a.value.map(id=>{const t=p.triggers.find(t=>t.id===id);return t?{cardId:t.sourceCardId,abilityId:t.abilityId,sourceId:t.source.id}:null;});
    requireRule(stackChoice.every(Boolean),'Cannot record an incomplete trigger order.');
  }
  return {action:encodeValue(g,a),guard,label,stackChoice,seed:g.state.seed};
}
export function concreteStep(g,step){
  const a=decodeValue(g,step.action,{sameGame:step.seed===g.state.seed}),guard=step.guard;
  if(guard?.kind){
    const p=g.state.pending,d=g.state.actionDraft,f=g.state.resolving;
    requireRule(p&&p.kind===guard.kind&&(p.key||null)===guard.key,'The next decision does not match the recorded sequence.','SEQUENCE_DECISION');
    if(guard.cardId)requireRule((d?.context?.sourceCardId||f?.context?.sourceCardId)===guard.cardId,'The pending decision belongs to a different card.','SEQUENCE_DECISION');
    if(guard.abilityId)requireRule((d?.abilityId||f?.object?.abilityId)===guard.abilityId,'The pending decision belongs to a different ability.','SEQUENCE_DECISION');
  }
  if(guard?.stackCardId){const top=g.state.stack.at(-1);requireRule(top&&top.sourceCardId===guard.stackCardId&&(top.abilityId||null)===guard.stackAbilityId&&top.kind===guard.stackKind,'The top of the stack is different from the recording.','SEQUENCE_STACK');}
  if(step.stackChoice){
    const available=[...(g.state.pending?.triggers||[])];a.value=step.stackChoice.map(t=>{
      let i=available.findIndex(x=>x.sourceCardId===t.cardId&&x.abilityId===t.abilityId&&x.source.id===t.sourceId);
      if(i<0)i=available.findIndex(x=>x.sourceCardId===t.cardId&&x.abilityId===t.abilityId);
      requireRule(i>=0,'The simultaneous trigger group changed.','SEQUENCE_STACK');return available.splice(i,1)[0].id;
    });requireRule(!available.length,'The simultaneous trigger group has extra triggers.','SEQUENCE_STACK');
  }
  return a;
}
export function preflightSequence(g,sequence,options={}){
  try{
    requireRule(!g.state.pending&&!g.state.actionDraft&&!g.state.resolving&&!g.transaction,'Finish the current decision before running a sequence.','SEQUENCE_BUSY');
    requireRule(sequence?.steps?.length>0&&sequence.steps.length<=PROGRAM_LIMIT,'Record at least one action; maximum 256 steps.','SEQUENCE_EMPTY');
    const trial=new Engine(g.registry,g.state),commands=[];
    // One prospective transaction: no intermediate history serialization.
    trial.transaction={before:clone(trial.state),intents:[],events:[],label:'PREFLIGHT'};
    let boundarySerial=trial.state.eventSerial;
    for(const [i,step]of sequence.steps.entries()){
      requireRule(ACTION_TYPES.includes(step.action?.type),'Sequence contains a non-gameplay command.','SEQUENCE_ACTION');
      const command=concreteStep(trial,step);if(command.type==='RESOLVE_TOP'&&options.beforeResolve)options.beforeResolve(trial,trial.state.stack.at(-1));commands.push(command);
      try{
        trial.touch();trial.handleAction(command);trial.settle();
        if(!trial.state.pending&&!trial.state.actionDraft&&!trial.state.resolving){
          const events=trial.transaction.events.filter(e=>e.sequence>boundarySerial);boundarySerial=trial.state.eventSerial;
          if(i<sequence.steps.length-1&&options.afterBoundary)options.afterBoundary(trial,events);
        }
      }catch(error){throw new Error(`Step ${i+1}: ${error.message}`);}
    }
    requireRule(!trial.state.pending&&!trial.state.actionDraft&&!trial.state.resolving,'The recording ends with an unanswered decision. Record the remaining choices.','SEQUENCE_INCOMPLETE');
    return {ok:true,commands,before:stateHash(g.state),after:stateHash(trial.state)};
  }catch(error){return {ok:false,error:error.message};}
}
export function ruleMatches(g,rule,event){
  if(!rule.enabled||rule.event!==event.event)return false;
  if(rule.cardId&&event.cardId!==rule.cardId)return false;
  if(rule.abilityId&&event.abilityId!==rule.abilityId)return false;
  if(rule.scope==='stack'&&!rule.stackIds.includes(event.stackId))return false;
  const conditions=rule.conditions||[];
  const present=c=>{const found=g.controlled(0).filter(o=>(o.copy?.rulesId||o.cardId)===c.cardId);return c.test==='absent'?!found.length:c.test==='untapped'?found.some(o=>!o.tapped):!!found.length;};
  return !conditions.length||(rule.conditionMatch==='any'?conditions.some(present):conditions.every(present));
}
export function eventSignals(g,events){
  const signals=[];
  for(const e of events){
    if(e.type==='RESOLUTION_FINISHED'&&e.cardId)signals.push({event:'afterResolve',cardId:e.cardId,abilityId:e.abilityId||'',stackId:e.stackId,source:e.source,serial:e.sequence});
    if(['BECAME_UNTAPPED','BECAME_TAPPED'].includes(e.type))signals.push({event:e.type==='BECAME_UNTAPPED'?'untapped':'tapped',cardId:e.cardId||(g.object(e.object)||g.lastKnownFor(e.object))?.cardId,source:e.object,serial:e.sequence});
    if(e.type==='ENTER'||e.type==='LEAVE')signals.push({event:e.type==='ENTER'?'entered':'left',cardId:e.change?.lki?.cardId||e.change?.object?.cardId,source:e.change?.afterRef,serial:e.sequence});
  }
  return signals;
}
