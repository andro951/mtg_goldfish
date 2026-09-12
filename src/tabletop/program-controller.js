import { RuleError } from '../core/index.js';
import { captureStep, cleanPrograms, restorePrograms, preflightSequence, ruleMatches, eventSignals, PROGRAM_LIMIT, programId } from './programs.js';

/** Runs only validated game intents at ordinary priority boundaries. Configuration
 * is data, never executable code; automatic chains and repetitions are bounded. */
export function createProgramController(api) {
  let model=cleanPrograms(), recording=null, running=null, busy=false, chain=0;
  const changed=(configuration=true)=>api.changed?.(configuration);
  const cleanBoundary=()=>!api.g.state.pending&&!api.g.state.actionDraft&&!api.g.state.resolving&&!api.g.transaction;
  const pause=reason=>{model.paused=true;model.pauseReason=reason;changed(false);};
  const remember=key=>{model.seen.push(key);if(model.seen.length>5000)model.seen.splice(0,model.seen.length-5000);};
  const ruleKey=(r,e)=>`${r.id}/${e.event}/${e.stackId||e.serial}`;
  function observe(events) {
    if(recording||!model.rules.some(r=>r.enabled&&r.event!=='beforeResolve'))return;
    // Conditions are evaluated at priority, but unrelated events need no queue,
    // preference serialization, or second full-table render.
    const relevant=e=>model.rules.some(r=>r.enabled&&r.event===e.event&&(!r.cardId||r.cardId===e.cardId)&&(!r.abilityId||r.abilityId===e.abilityId)&&(r.scope!=='stack'||r.stackIds.includes(e.stackId)));
    model.queue.push(...eventSignals(api.g,events).filter(relevant));
    if(model.queue.length>200){model.queue.length=200;pause('Automation queue limit reached. Review rules, then resume.');}
  }
  function preflight(sequence){return preflightSequence(api.g,sequence,{beforeResolve(trial,top){
    if(!top)return;
    const e={event:'beforeResolve',cardId:top.sourceCardId,abilityId:top.abilityId||'',stackId:top.id};
    if(model.rules.some(r=>ruleMatches(trial,r,e)&&!model.seen.includes(ruleKey(r,e))))throw new RuleError('A configured before-resolution shortcut would interrupt this recorded line. Resolve that object separately or temporarily disable that rule.');
  },afterBoundary(trial,events){
    const signals=eventSignals(trial,events);
    if(model.rules.some(r=>signals.some(e=>ruleMatches(trial,r,e)&&!model.seen.includes(ruleKey(r,e))&&(r.action!=='hold'||trial.state.stack.length))))
      throw new RuleError('A configured player rule would run before the next recorded step. Split the line at this priority boundary or temporarily disable that rule.');
  }});}
  function execute(sequence) {
    const check=preflight(sequence);
    if(!check.ok)return check;
    const result=api.g.perform({type:'RUN_SEQUENCE',name:sequence.name,commands:check.commands});
    if(!result.ok)return {ok:false,error:result.error.message};
    observe(api.g.lastActionEvents||[]);
    return {ok:true};
  }
  function applyRule(rule,event) {
    const key=ruleKey(rule,event);if(model.seen.includes(key))return;
    remember(key);
    if(++chain>100){pause('Automatic chain stopped after 100 rules. This protects against a self-triggering loop.');return;}
    if(rule.action!=='hold') {
      const sequence=model.sequences.find(s=>s.id===rule.sequenceId);
      const result=execute(sequence);
      if(!result.ok){pause(`${rule.name}: ${result.error}`);return;}
    }
    if((rule.action==='hold'||rule.action==='sequenceHold')&&api.g.state.stack.length)pause(rule.name+' — priority is yours.');
  }
  function pump() {
    if(busy||recording||running||model.paused||!model.queue.length||!cleanBoundary())return;
    busy=true;
    try {
      while(model.queue.length&&!model.paused&&cleanBoundary()) {
        const event=model.queue.shift();
        for(const rule of model.rules)if(ruleMatches(api.g,rule,event)) {
          applyRule(rule,event);
          if(model.paused){model.queue.unshift(event);break;}
        }
      }
    } finally {busy=false;}
  }
  function beforeResolve() {
    pump();if(model.paused||!cleanBoundary())return false;
    const top=api.g.state.stack.at(-1);if(!top)return false;
    const event={event:'beforeResolve',cardId:top.sourceCardId,abilityId:top.abilityId||'',stackId:top.id,source:top.source};
    for(const rule of model.rules)if(ruleMatches(api.g,rule,event)) {
      if(api.g.state.stack.at(-1)?.id!==top.id)return false;
      applyRule(rule,event);
      if(model.paused||!cleanBoundary())return false;
    }
    pump();
    return !model.paused&&api.g.state.stack.at(-1)?.id===top.id;
  }
  return {
    get model(){return model;},get recording(){return recording;},get running(){return running;},get busy(){return busy;},
    reset(session,future){running&&(running.stop=true);running=null;recording=null;busy=false;chain=0;model=restorePrograms(session,future);},
    snapshot(){return cleanPrograms(model);},
    userAction(){chain=0;},
    prepare(action){return recording?captureStep(api.g,action):null;},
    completed(action,result,step) {
      if(!result.ok)return;
      if(['UNDO','REDO','CANCEL'].includes(action.type)) {
        if(recording){recording=null;api.toast('Recording stopped because the action was undone or cancelled. Re-record the intended line.');}
        model.queue=[];model.seen=[];model.paused=false;model.pauseReason='';changed(false);return;
      }
      if(recording&&step) {
        recording.steps.push(step);
        changed(false);
        if(recording.steps.length>=PROGRAM_LIMIT)api.toast('Recording reached 256 steps. Finish or cancel the current decision, then save.');
      }
      observe(api.g.lastActionEvents||[]);pump();
    },
    pump,beforeResolve,
    resume(){chain=0;model.paused=false;model.pauseReason='';pump();changed(false);},
    stop(){if(running){if(running.stop)return;running.stop=true;changed(false);}else if(!model.paused)pause('Paused by you.');},
    startRecording(name) {
      if(!cleanBoundary()||running)throw new RuleError('Finish the current choice or sequence before recording.');
      recording={name:name||'New sequence',steps:[]};model.queue=[];model.paused=false;model.pauseReason='';changed(false);
    },
    finishRecording(name,saved=false) {
      if(!recording)throw new RuleError('No sequence is being recorded.');
      if(!cleanBoundary())throw new RuleError('Finish the pending choice before saving the recording.');
      if(!recording.steps.length)throw new RuleError('Perform at least one game action before saving.');
      if(recording.steps.length>PROGRAM_LIMIT)throw new RuleError('The recording exceeds 256 steps.');
      const sequence={id:programId('seq'),name:(name||recording.name).slice(0,120),steps:recording.steps,saved:!!saved};
      model.sequences.push(sequence);recording=null;changed();return sequence;
    },
    cancelRecording(){recording=null;model.queue=[];changed(false);},
    async repeat(id,count=1) {
      if(running||recording)throw new RuleError('Stop the current run or recording first.');
      const sequence=model.sequences.find(s=>s.id===id);
      if(!sequence)throw new RuleError('Sequence not found.');
      if(!Number.isInteger(count)||count<1||count>1000)throw new RuleError('Choose 1–1000 iterations. Each iteration is checked separately.');
      const job=running={id,completed:0,count,stop:false};model.paused=false;model.pauseReason='';chain=0;changed(false);
      try {
        for(let i=0;i<count&&!job.stop;i++) {
          const result=execute(sequence);
          if(!result.ok){pause(`Stopped before iteration ${i+1}: ${result.error}`);break;}
          job.completed++;changed(false);
          // Process configured holds between iterations, never during a payment.
          running=null;pump();running=job;
          if(model.paused)break;
          await new Promise(resolve=>setTimeout(resolve,0));
        }
        return {completed:job.completed,requested:count,reason:model.pauseReason||(job.stop?'Stopped by you.':'')};
      } finally {if(running===job)running=null;changed(false);}
    },
    preflight(id){return preflight(model.sequences.find(s=>s.id===id));},
    saveRule(rule){const clean=cleanPrograms({rules:[rule]}).rules[0];if(!clean)throw new RuleError('Invalid rule.');
      if(clean.action!=='hold'&&!model.sequences.some(s=>s.id===clean.sequenceId))throw new RuleError('Choose a recorded sequence first.');
      const old=model.rules.findIndex(r=>r.id===clean.id);if(old<0)model.rules.push(clean);else model.rules[old]=clean;changed();},
    toggleRule(id,enabled){const rule=model.rules.find(r=>r.id===id);if(rule){rule.enabled=enabled;changed();}},
    removeRule(id){model.rules=model.rules.filter(r=>r.id!==id);changed();},
    saveSequence(id,saved){const s=model.sequences.find(s=>s.id===id);if(s){s.saved=saved;changed();}},
    renameSequence(id,name){const s=model.sequences.find(s=>s.id===id);if(s&&name.trim()){s.name=name.trim().slice(0,120);changed();}},
    removeSequence(id){if(model.rules.some(r=>r.sequenceId===id))throw new RuleError('Remove rules that use this sequence first.');model.sequences=model.sequences.filter(s=>s.id!==id);changed();},
    editStep(id,index,direction){const s=model.sequences.find(s=>s.id===id);if(!s)return;
      if(direction==='remove')s.steps.splice(index,1);else {const to=index+Number(direction);if(to>=0&&to<s.steps.length)[s.steps[index],s.steps[to]]=[s.steps[to],s.steps[index]];}changed();},
  };
}
