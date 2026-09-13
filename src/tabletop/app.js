import { installTargetLinks } from './target-links.js';
import { createProgramController } from './program-controller.js';
import { futurePrograms,programId } from './programs.js';
import { gridLayout, cleanGrids } from './grid.js';
import { Engine, RuleError, parseDeck, COLORS, suggestPayment } from '../core/index.js';
import { createRegistry } from '../rules/index.js';
import { SessionStore } from '../ui/storage.js';
import { createLab } from '../ui/labs.js';
import { h, saveDownload } from '../ui/components.js';
import { choiceOptions } from '../ui/views.js';
import { toolbar, programControls, tabletop, stackPopup, inspectorPopup, decisionPopup, openingPopup } from './views.js';
import { dialogs } from './dialogs.js';
import { CARD_W,CARD_H,cardLayout,fitCamera,clamp,popupPosition,avoidPopupOverlap,bounds,overlaps } from './geometry.js';
import { defaultPreferences,cleanPreferences,loadPreferences,savePreferences as persistPreferences } from './preferences.js';
import { installInteractions } from './interactions.js';
import { editDeck } from './deck-editor.js';

const data=window.ASTRA_DATA,registry=createRegistry(data.cards),store=new SessionStore();
const root=document.getElementById('app'),overlay=document.getElementById('overlay');
const floats=document.createElement('div');floats.id='floating-layer';document.body.append(floats);
const newSeed=()=>`astra-${new Date().toISOString().slice(0,10)}-${crypto.getRandomValues(new Uint32Array(1))[0].toString(36)}`;
let prefs=loadPreferences(),g,unsubscribe,saveTimer,preferenceTimer,autoTimer,modeTimer,saveSequence=0,rendering=false,interactions;
const popupObserver=new ResizeObserver(()=>{if(!rendering&&!ui.gestureActive)positionPopups();});
const ui={modal:null,previousModal:null,inspected:null,inspectDefinition:null,inspectOrigin:null,inspectorActivation:null,modeBypass:null,stackLabel:null,selected:new Set(),selectMode:false,
 grids:{},playerBypass:null,askOnce:{},lastPoint:{x:innerWidth*.48,y:innerHeight*.38},layouts:{},memo:{},popupPositions:{},seed:newSeed(),deckText:prefs.deckText||data.deckText,deckReport:null,
 cardFilter:'',cardType:'',showDerived:false,zoomCard:null,backFace:false,pendingKey:null,choice:[],choiceFilter:'',number:0,payment:null,paymentEdited:false,
 noteText:'',attacks:{},gestureActive:false,activeZone:'battlefield',lastWorkspace:null,deckSearch:'',deckType:'',deckColor:'',deckSort:'name',deckTab:'main',deckDrag:null,ruleDraft:null,sequenceName:'',sequenceFuture:false,resolveRequested:false};
const saveStatus={text:'Opening browser storage…',error:false};
let programRender=0,modalRendering=false;
const programs=createProgramController({get g(){return g;},toast,changed(configuration=true){
 if(configuration){prefs.savedPrograms=futurePrograms(programs.model);savePreferences();}else scheduleSave();
 if(!programRender)programRender=requestAnimationFrame(()=>{programRender=0;if(!g)return;
  const controls=document.querySelector('.program-tools');if(controls)controls.innerHTML=programControls(ctx());
  if(['sequences','automation'].includes(ui.modal)&&!document.activeElement?.closest('input,select,textarea'))renderModal();
 });
}});
const ctx=()=>({g,ui,prefs,registry,saveStatus,programs}),byId=id=>document.getElementById(id);
const targetLinks=installTargetLinks({get g(){return g;},ui});
function toast(message,error=false){byId('toast')?.remove();const el=document.createElement('div');el.id='toast';el.className=`toast ${error?'error':''}`;el.setAttribute('role',error?'alert':'status');el.textContent=message;document.body.append(el);setTimeout(()=>el.remove(),error?6500:3200);}
function updateSaveLabel(){const el=byId('save-status');if(el){el.textContent=saveStatus.text;el.classList.toggle('error',saveStatus.error);}}
function cleanMemo(value){const result={};if(!value||typeof value!=='object')return result;for(const [key,p] of Object.entries(value).slice(0,5000))if(/^(battlefield|graveyard|exile|outside|workspace)\/[a-zA-Z0-9_-]+:\d+$/.test(key)&&Number.isFinite(p?.x)&&Number.isFinite(p?.y)&&Math.abs(p.x)<100000&&Math.abs(p.y)<100000)result[key]={x:p.x,y:p.y};return result;}
function exported(){return {...g.exportSession(),uiLayout:cleanPreferences(prefs),tableView:cleanMemo(ui.memo),tableGrids:cleanGrids(ui.grids),playerPrograms:programs.snapshot()};}
async function saveNow(){if(!g)return;clearTimeout(saveTimer);if(ui.gestureActive){saveTimer=setTimeout(()=>saveNow().catch(()=>{}),400);return;}const seq=saveSequence,doc=exported();try{const at=await store.save(doc);if(seq===saveSequence){saveStatus.text=`Autosaved ${new Date(at).toLocaleTimeString()}`;saveStatus.error=false;updateSaveLabel();}}catch(error){if(seq===saveSequence){saveStatus.text=error.message;saveStatus.error=true;updateSaveLabel();}throw error;}}
function scheduleSave(){clearTimeout(saveTimer);saveStatus.text=store.mode==='memory'?'Autosave unavailable — export your session.':'Saving…';saveStatus.error=store.mode==='memory';updateSaveLabel();saveTimer=setTimeout(()=>saveNow().catch(()=>{}),500);}
function savePreferences(){clearTimeout(preferenceTimer);preferenceTimer=setTimeout(()=>{if(!persistPreferences(prefs)){saveStatus.text='Layout storage unavailable — export your session to preserve it.';saveStatus.error=true;updateSaveLabel();}scheduleSave();},150);}
function newEngine(engine){const state=structuredClone(engine.state);state.settings.holdPriority=prefs.holdPriority;state.settings.orderTriggers=prefs.orderTriggers;state.reserveAccess=prefs.reserveAccess;state.settings.manualControls=prefs.manualControls;return new Engine(registry,state);}
function useEngine(engine,{save=true,memo={},grids={},playerPrograms=null}={}){unsubscribe?.();clearTimeout(autoTimer);clearTimeout(modeTimer);clearTimeout(saveTimer);g=engine;targetLinks.clear();programs.reset(playerPrograms,prefs.savedPrograms);ui.ruleDraft=null;ui.resolveRequested=false;saveSequence++;Object.assign(ui,{pendingKey:null,inspected:null,inspectDefinition:null,inspectOrigin:null,inspectorActivation:null,modeBypass:null,playerBypass:null,askOnce:{},lastDraftIdentity:null,stackLabel:null,modal:null,noteText:'',layouts:{},memo:cleanMemo(memo),grids:cleanGrids(grids),popupPositions:{},lastWorkspace:null});ui.selected.clear();unsubscribe=g.subscribe(()=>{try{render();}catch(error){rendering=false;toast(`View error: ${error.message}`,true);console.error(error);}scheduleSave();});render();if(save)scheduleSave();}
function focusSnapshot(){const el=document.activeElement;if(!el?.id)return null;let start=null,end=null;try{start=el.selectionStart;end=el.selectionEnd;}catch{}return{id:el.id,start,end};}
function restoreFocus(value){const el=value&&byId(value.id);if(!el)return;el.focus({preventScroll:true});if(typeof value.start==='number')try{el.setSelectionRange(value.start,value.end);}catch{}}
function prepareChoice(){const identity=draftIdentity();if(identity!==ui.lastDraftIdentity){ui.modeBypass=null;ui.playerBypass=null;ui.lastDraftIdentity=identity;}const p=g.state.pending;const key=p?JSON.stringify([p.kind,p.key,p.label,p.source,p.candidates,p.options,g.state.resolving?.pc,g.state.actionDraft?.context?.inputs]):null;
 if(key!==ui.pendingKey){ui.pendingKey=key;ui.choiceFilter='';ui.choice=p?.ordered?[...(p.candidates||choiceOptions(p).map(o=>o.value))]:[];ui.number=p?.min||0;ui.paymentEdited=false;}
 if(['payment','effectPayment'].includes(p?.kind)&&!ui.paymentEdited)ui.payment=suggestPayment(p.cost,g.state.players[p.player||0],p.context)||{normal:{},tagged:[]};
}
function clearInspectorState(){ui.stackSelection=null;ui.inspected=null;ui.inspectDefinition=null;ui.inspectOrigin=null;ui.inspectorActivation=null;ui.stackLabel=null;}
function inspectorOrigin(id){const o=g.object(id);return o?{id:o.id,oid:o.oid,zone:o.zone}:null;}
function sameOrigin(origin){const o=origin&&g.object(origin.id);return !!(o&&o.oid===origin.oid&&o.zone===origin.zone);}
function abilitySingleUse(source,ability){
  if(!source||!ability)return false;
  if(ability.tap||ability.loyalty!=null)return true;
  let costs=[];try{costs=typeof ability.costs==='function'?ability.costs(g,source,g.context(source)):ability.costs||[];}catch{}
  return costs.some(cost=>cost?.self&&['sacrifice','exile','return'].includes(cost.kind));
}
function syncInspectorState(){
  if(ui.inspected&&ui.inspectOrigin&&!sameOrigin(ui.inspectOrigin))clearInspectorState();
  const activation=ui.inspectorActivation;if(!activation)return;
  if(!sameOrigin(activation.origin)){clearInspectorState();return;}
  if(activation.singleUse&&(g.lastActionEvents||[]).some(e=>['MANA_ABILITY_RESOLVED','STACK_OBJECT_CREATED'].includes(e.type)&&e.source?.id===activation.origin.id&&e.source?.oid===activation.origin.oid&&e.abilityId===activation.abilityId)){clearInspectorState();return;}
  const stillDraft=g.state.actionDraft?.kind==='ability'&&g.state.actionDraft?.source?.id===activation.origin.id;
  if(!g.transaction&&!stillDraft){
    const committed=g.cursor>activation.cursor;
    if(committed&&activation.singleUse)clearInspectorState();
    else ui.inspectorActivation=null;
  }
}
function draftIdentity(draft=g.state.actionDraft){
  if(!draft)return null;
  if(draft.kind==='trigger')return `trigger/${draft.stackObject?.id||''}/${draft.source?.id||''}:${draft.source?.oid||''}/${draft.abilityId||draft.stackObject?.abilityId||''}`;
  return `${draft.kind}/${draft.source?.id||''}:${draft.source?.oid||''}/${draft.abilityId||''}`;
}
function modePreferenceForDraft(draft=g.state.actionDraft,pending=g.state.pending){
  if(!draft||pending?.kind!=='draft')return null;
  const definition=g.draftDefinition(draft),meta=definition?.modePreference;
  const player=pending.type==='player';
  if(!player&&(!meta||pending.key!==meta.key))return null;
  const sourceCardId=draft.sourceCardId||draft.stackObject?.sourceCardId||draft.context?.sourceCardId||g.object(draft.source)?.cardId;
  if(!sourceCardId)return null;
  const field=player?pending.key:meta.key,key=`${sourceCardId}/${definition.id||'spell'}/${field}`;
  return {key,meta:player?{key:field}:meta,player,identity:draftIdentity(draft)};
}
function scheduleModeDefault(){
  clearTimeout(modeTimer);const pending=g.state.pending,draft=g.state.actionDraft,info=modePreferenceForDraft(draft,pending);if(!info)return;
  const value=(info.player?prefs.playerDefaults:prefs.modeDefaults)?.[info.key];if(value==null||value==='ASK'||ui.modeBypass===info.identity||ui.playerBypass===info.identity||ui.askOnce[info.key]){if(ui.askOnce[info.key]){delete ui.askOnce[info.key];ui.playerBypass=info.identity;}return;}
  const legal=(pending.options||[]).some(option=>(typeof option==='object'?option.value:option)===value);if(!legal)return;
  const signature=JSON.stringify([info.identity,pending.key,pending.options]);
  modeTimer=setTimeout(()=>{const now=modePreferenceForDraft();if(!now||now.identity!==info.identity||ui.modeBypass===info.identity)return;
    if(JSON.stringify([now.identity,g.state.pending?.key,g.state.pending?.options])!==signature)return;
    run({type:'CHOOSE',value},false);
  },45);
}
function makeLayouts(){
 const visibleWidth=Math.max(220,innerWidth-prefs.sidebarWidth-(prefs.dock?prefs.dockWidth:0));
 for(const zone of ['battlefield','graveyard','exile','outside','workspace']){
  const ids=zone==='workspace'?(g.state.lookWorkspace?.ids||[]):g.state.zones[zone];
  const objects=ids.map(id=>g.object(id)).filter(Boolean);
  if(['graveyard','exile','outside'].includes(zone)){
    const grid=gridLayout(objects,ui.grids[zone],prefs.dockWidth);ui.grids[zone]=grid.slots;ui.layouts[zone]=grid.cards;continue;
  }
  const list=cardLayout(objects,zone==='battlefield'?visibleWidth:prefs.dockWidth);
  const existing=list.filter(c=>{const o=g.object(c.id);return o.location||ui.memo[`${zone}/${o.id}:${o.oid}`];});
  for(const c of list){const o=g.object(c.id),key=`${zone}/${o.id}:${o.oid}`;
   if(o.location)continue; // Preserve the original implicit position for visual undo.
   if(ui.memo[key]){Object.assign(c,ui.memo[key]);continue;}
   // Preserve existing card positions when another object enters/leaves.
   let trial={...c};for(let step=0;step<300&&existing.some(other=>{
     const pos=g.object(other.id)?.location?other:({...other,...ui.memo[`${zone}/${other.id}:${g.object(other.id)?.oid}`]});
     return overlaps(bounds(trial),bounds(pos));});step++){
      const column=step%Math.max(1,Math.floor((visibleWidth-CARD_H-20)/(CARD_W+12)));
      trial.x=CARD_H+10+column*(CARD_W+12);trial.y=CARD_H+14+Math.floor(step/Math.max(1,Math.floor((visibleWidth-CARD_H-20)/(CARD_W+12))))*(CARD_H+16);
   }
   c.x=trial.x;c.y=trial.y;ui.memo[key]={x:c.x,y:c.y};existing.push(c);
  }
  ui.layouts[zone]=list;
 }
}
function applyCamera(zone){const surface=document.querySelector(`[data-surface="${zone}"]`),c=prefs.cameras[zone]||{x:0,y:0,zoom:1};if(surface){surface.querySelector('.world').style.transform=`translate(${c.x}px,${c.y}px) scale(${c.zoom})`;surface.querySelector('[data-zoom-label]').textContent=Math.round(c.zoom*100)+'%';}targetLinks.schedule();}
function size(){
 const shell=document.querySelector('.table-shell');if(!shell)return;
 const height=shell.clientHeight,side=clamp(prefs.sidebarWidth,92,Math.max(92,Math.min(260,innerWidth*.45)));
 const hand=clamp(prefs.handHeight,80,Math.max(80,Math.min(400,height*.65)));
 const dock=clamp(prefs.dockWidth,150,Math.max(150,innerWidth-side-140));
 const style=document.documentElement.style;style.setProperty('--sidebar',side+'px');style.setProperty('--hand-height',hand+'px');style.setProperty('--dock-width',dock+'px');
 const rows=innerHeight<650?18:21,extra=rows*12+73+(g.state.players[0].restrictedMana.length?24:0);
 const commandCount=Math.max(1,g.state.zones.command.length),maxCard=(height-extra)/(88/63*(1+commandCount));
 style.setProperty('--rail-card',clamp(Math.min(side-16,maxCard),32,110)+'px');
 const handEl=document.querySelector('.hand');if(handEl){const n=handEl.children.length,w=(hand-8)*63/88;
  const step=n>1?Math.max(0,Math.min(w+4,(handEl.clientWidth-8-w)/(n-1))):0;
  for(const [i,el]of [...handEl.children].entries()){el.style.width=w+'px';el.style.height=(hand-8)+'px';el.style.left=(4+i*step)+'px';}
 }
 positionPopups();
}
function positionPopups(){
 const occupied=[],viewport={width:innerWidth,height:innerHeight};
 targetLinks.schedule();
 for(const el of floats.querySelectorAll('[data-floating]')){
  const name=el.dataset.floating,mini=el.classList.contains('mana-window'),key=mini?'mana':name;
  const measurement=el.getBoundingClientRect(),explicit=mini?null:prefs.popups[name];let anchor=ui.lastPoint;
  const cached=mini?null:ui.popupPositions[key],saved=explicit||cached;
  if(name==='stack'&&!saved)anchor={x:innerWidth-measurement.width-20,y:document.querySelector('.toolbar').getBoundingClientRect().bottom};
  let pos=popupPosition(anchor,measurement.width,measurement.height,viewport,saved);
  if(!explicit&&!mini)pos=avoidPopupOverlap(pos,measurement.width,measurement.height,viewport,occupied);
  ui.popupPositions[key]=pos;el.style.left=pos.x+'px';el.style.top=pos.y+'px';
  occupied.push({left:pos.x,top:pos.y,right:pos.x+measurement.width,bottom:pos.y+measurement.height});
 }
}
function renderModal(preserve=true){if(modalRendering)return;modalRendering=true;try{const focus=preserve?focusSnapshot():null,scroll=overlay.querySelector('.modal-body')?.scrollTop||0,nested=new Map(preserve?[...overlay.querySelectorAll('[data-modal-scroll]')].map(el=>[el.dataset.modalScroll,[el.scrollLeft,el.scrollTop]]):[]);overlay.innerHTML=dialogs(ctx());root.inert=!!ui.modal;floats.inert=!!ui.modal;targetLinks.schedule();if(preserve){const body=overlay.querySelector('.modal-body');if(body)body.scrollTop=scroll;for(const el of overlay.querySelectorAll('[data-modal-scroll]')){const pos=nested.get(el.dataset.modalScroll);if(pos){el.scrollLeft=pos[0];el.scrollTop=pos[1];}}restoreFocus(focus);}}finally{modalRendering=false;}}
function render(){if(!g||rendering)return;rendering=true;try{
 syncInspectorState();
 const focus=focusSnapshot(),scroll=new Map([...document.querySelectorAll('[data-scroll]')].map(el=>[el.dataset.scroll,el.scrollTop]));
 const expanded=[...floats.querySelectorAll('details[open]')].map(el=>el.className||el.querySelector('summary')?.textContent);
 if(prefs.dock==='workspace'&&!g.state.lookWorkspace?.ids?.length)prefs.dock=null;
 prepareChoice();makeLayouts();root.innerHTML=toolbar(ctx())+tabletop(ctx());
 popupObserver.disconnect();
 floats.innerHTML=openingPopup(ctx())+stackPopup(ctx())+inspectorPopup(ctx())+decisionPopup(ctx());
 for(const el of floats.querySelectorAll('[data-resizable]')){const v=prefs.popupSizes?.[el.dataset.floating];if(v){el.style.width=Math.min(v.width,innerWidth-8)+'px';el.style.height=Math.min(v.height,innerHeight-40)+'px';}}
 for(const el of floats.querySelectorAll('details'))if(expanded.includes(el.className||el.querySelector('summary')?.textContent))el.open=true;
 renderModal(false);size();for(const el of document.querySelectorAll('[data-scroll]'))if(scroll.has(el.dataset.scroll))el.scrollTop=scroll.get(el.dataset.scroll);
 for(const el of floats.querySelectorAll('[data-floating]'))popupObserver.observe(el);
 restoreFocus(focus);interactions?.refreshHover();
 }finally{rendering=false;}scheduleModeDefault();}
function openDialog(name){clearTimeout(autoTimer);ui.modal=name;if(name==='new')ui.seed=newSeed();if(name==='deck')auditDeck();renderModal();requestAnimationFrame(()=>overlay.querySelector(name==='deck'?'#deck-search':'input:not([type=checkbox]),textarea,button')?.focus({preventScroll:true}));}
function autoResolve(){
 clearTimeout(autoTimer);
 if(!g||programs.recording||programs.running||programs.model.paused||(g.state.settings.holdPriority&&!ui.resolveRequested)||!g.state.stack.length)return;
 if(g.state.pending||g.state.actionDraft||g.state.resolving){ui.resolveRequested=false;return;}
 autoTimer=setTimeout(()=>{if(ui.gestureActive||ui.modal){autoResolve();return;}run({type:'RESOLVE_TOP'},false);},160);
}
function run(action,user=true){
 if(user&&['ADJUST_MANA','ADJUST_PLAYER','MANUAL_DAMAGE'].includes(action.type)&&!g.state.settings.manualControls){toast('Enable Manual controls in Settings to adjust resources.',true);return {ok:false,error:{code:'MANUAL_CONTROLS_OFF',message:'Manual controls are disabled.'}};}
 clearTimeout(autoTimer);if(user)programs.userAction();
 if(programs.running&&user&&!['UNDO','CANCEL'].includes(action.type)){toast('Stop the running sequence before taking another action.',true);return {ok:false};}
 if(programs.running&&user)programs.stop();
 if(action.type==='RESOLVE_ALL'){if(g.state.pending)return {ok:false};programs.resume();ui.resolveRequested=true;return run({type:'RESOLVE_TOP'},false);}
 if(action.type==='PASS_PRIORITY'&&g.state.stack.length)action={type:'RESOLVE_TOP'};
 if(action.type==='RESOLVE_TOP'){
   if(user&&programs.model.paused)programs.resume();
   if(!programs.recording&&!programs.beforeResolve()){autoResolve();return {ok:true,deferred:true};}
 }
 let step;try{step=programs.prepare(action);if(programs.recording&&['ADJUST_MANA','ADJUST_PLAYER'].includes(action.type))toast('Manual adjustments are not recorded. Only legal card actions and their choices are saved.');}catch(error){toast(error.message,true);return {ok:false};}
 const result=g.perform(action);if(!result.ok)toast(result.error.message,true);
 else {programs.completed(action,result,step);if(byId('toast')?.classList.contains('error'))byId('toast').remove();if(!['UNDO','REDO'].includes(action.type))autoResolve();else ui.resolveRequested=false;}
 return result;
}
function atPoint(point){if(point&&Number.isFinite(point.x)&&Number.isFinite(point.y)){ui.lastPoint=point;if(!prefs.popups.decision&&!g?.state.pending)delete ui.popupPositions.decision;}}
function inspect(id,point){atPoint(point);const same=ui.inspected===id&&!ui.inspectDefinition;if(same)clearInspectorState();else{ui.stackSelection=null;ui.inspected=id;ui.inspectDefinition=null;ui.inspectOrigin=inspectorOrigin(id);ui.inspectorActivation=null;ui.stackLabel=null;}if(!prefs.popups.inspector)delete ui.popupPositions.inspector;render();}
function refreshSelection(){
 const p=g.state.pending;
 for(const el of document.querySelectorAll('.decision-gallery [data-card]'))el.classList.toggle('is-selected',ui.choice.includes(el.dataset.card));
 for(const el of document.querySelectorAll('.surface [data-card],.hand [data-card]'))el.classList.toggle('selected',ui.choice.includes(el.dataset.card)||ui.selected.has(el.dataset.card));
 const count=floats.querySelector('.selected-count');if(count)count.textContent=`${ui.choice.length} selected`;
 const done=floats.querySelector('[data-action="confirm-choice"]');if(done&&!p?.ordered){done.disabled=ui.choice.length<(p.min||0)||ui.choice.length>(p.max||1);done.textContent=`Confirm${ui.choice.length?' ('+ui.choice.length+')':p.min===0?' / choose none':''}`;}
}
function selectChoice(id){const p=g.state.pending,ids=p?.candidates||p?.ids||[];if(!ids.includes(id)||p.ordered)return false;
 let added=false;
 if(ui.choice.includes(id))ui.choice=ui.choice.filter(x=>x!==id);else if((p.max||1)===1){ui.choice=[id];added=true;}else if(ui.choice.length<(p.max||1)){ui.choice.push(id);added=true;}else toast(`Choose at most ${p.max} cards.`,true);
 refreshSelection();
 if(added&&prefs.autoAccept&&(ui.choice.length===(p.max||1)||p.minTotalPower!=null)){
   try{
     if(p.kind==='draft'||p.kind==='effectChoice')g.validateInput(p,ui.choice,g.state.actionDraft?.context||g.state.resolving?.context||{});
     choose([...ui.choice]);
   }catch{}
 }
 return true;
}
function clickCard(id,point,shift=false){atPoint(point);if(g.state.pending&&selectChoice(id))return;
 if(ui.inspected===id){clearInspectorState();render();return;}
 if(ui.selectMode||shift){ui.selected.has(id)?ui.selected.delete(id):ui.selected.add(id);render();return;}
 const o=g.object(id);if(!o)return;const p=g.state.pending;
 if(o.zone==='battlefield'&&!o.tapped&&!g.isSick(o)&&(!p||['payment','effectPayment'].includes(p.kind))){
  const abilities=g.abilities(o).filter(a=>a.mana&&a.tap);if(abilities.length===1){run({type:'ACTIVATE_ABILITY',id,abilityId:abilities[0].id});return;}
 }
 inspect(id,point);
}
function choose(value){const identity=draftIdentity();const result=run({type:'CHOOSE',value,remember:!!byId('remember-choice')?.checked});if(result.ok&&identity&&ui.modeBypass===identity&&!g.state.actionDraft)ui.modeBypass=null;return result;}
function auditDeck(){const parsed=parseDeck(ui.deckText),report=registry.report(parsed.records),errors=parsed.errors.map(e=>`Line ${e.line}: ${e.message}`);let construction=null;if(!errors.length&&!report.missing.length)try{construction=Engine.create(registry,parsed.records,'deck-audit').state.initialDeck;}catch(e){errors.push(e.message);}
 const accepted=report.accepted&&!errors.length,lines=[...errors,...report.missing.map(r=>`MISSING: ${r.quantity} ${r.name}`),...report.partial.map(r=>`PARTIAL: ${r.name} — ${r.notes}`),...report.duplicates.map(r=>`DUPLICATE (preserved): ${r.quantity} ${r.name}`)];
 return ui.deckReport={...report,accepted,errors,records:parsed.records,construction,summary:accepted?`Ready: ${construction.fixedLands} lands + ${construction.selectedNonlands} selected nonlands; ${construction.reserveOrder.length} reserve cards.`:'Resolve the deck issues below.',details:lines.join('\n')||'Every card has registered rules.'};}
function updateDeckText(next,{message}={}){ui.deckText=next;prefs.deckText=next;ui.deckReport=null;auditDeck();savePreferences();renderModal();if(message)toast(message);}
function deckEdit(operation,message){updateDeckText(editDeck(ui.deckText,operation),{message});}

function exportJSON(){saveDownload(`astra-session-${g.state.seed.replace(/[^a-zA-Z0-9_-]/g,'-')}.json`,exported());toast('Session and table layout exported.');}
async function importFile(file){if(!file)return;if(file.size>50*1024*1024)throw new Error('Session exceeds the 50 MB import limit.');const doc=JSON.parse(await file.text()),engine=Engine.importSession(registry,doc);
 if(doc.uiLayout){prefs=cleanPreferences(doc.uiLayout);persistPreferences(prefs);ui.deckText=prefs.deckText||data.deckText;}
 useEngine(engine,{memo:doc.tableView,grids:doc.tableGrids,playerPrograms:doc.playerPrograms});toast('Session restored, including unfinished choices.');}
function fit(zone){const el=document.querySelector(`[data-surface="${zone}"]`);if(el){prefs.cameras[zone]=fitCamera(ui.layouts[zone]||[],el.clientWidth,el.clientHeight);applyCamera(zone);savePreferences();}}
function arrange(requested){const zone=requested||(prefs.dock&&ui.activeZone===prefs.dock?prefs.dock:'battlefield'),el=document.querySelector(`[data-surface="${zone}"]`);const ids=ui.layouts[zone].map(c=>c.id),columns=Math.max(1,Math.floor((el.clientWidth-CARD_H-18)/(CARD_W+12)));
 let updates;
 if(['graveyard','exile','outside'].includes(zone)){
   ui.grids[zone]=[];updates=gridLayout(ids.map(id=>({...g.object(id),location:null})),[],prefs.dockWidth).cards.map(({id,x,y})=>({id,x,y}));
 }else updates=ids.map((id,i)=>({id,x:CARD_H+10+(i%columns)*(CARD_W+12),y:CARD_H+14+Math.floor(i/columns)*(CARD_H+16)}));
 const result=run({type:'LAYOUT',anchor:'corner-v2',grid:zone!=='battlefield',order:ids,updates});if(result.ok)fit(zone);}
function closeInspector(){clearInspectorState();render();}
function readRuleForm(){
 const r=ui.ruleDraft;if(!r||!byId('rule-form'))return;
 const keys={name:'name',event:'event',card:'cardId',ability:'abilityId',action:'action',sequence:'sequenceId',scope:'scope',match:'conditionMatch'};
 for(const [id,key]of Object.entries(keys))r[key]=byId('rule-'+id).value;
 r.enabled=byId('rule-enabled').checked;
 r.conditions=r.conditions.map((c,i)=>({cardId:byId('condition-card-'+i).value,test:byId('condition-test-'+i).value}));
}
function newRule(entry=null){
 ui.ruleDraft={id:programId('rule'),name:entry?entry.label+' shortcut':'My priority rule',enabled:true,event:entry&&g.state.resolving?.object.id!==entry.id?'beforeResolve':'afterResolve',cardId:entry?.sourceCardId||'',abilityId:entry?.abilityId||'',action:'hold',sequenceId:'',scope:entry?'one':'future',stackIds:[],conditions:[],conditionMatch:'all',stackContext:entry?{id:entry.id,cardId:entry.sourceCardId,abilityId:entry.abilityId||''}:null};
 openDialog('automation');
}
async function handleClick(event){const el=event.target.closest('[data-action]');if(!el)return;const action=el.dataset.action,id=el.dataset.id;
 const sid=el.dataset.sequenceId,rid=el.dataset.ruleId;
 if(action==='sequence-record'){programs.startRecording();ui.sequenceName='New sequence';ui.sequenceFuture=false;ui.modal=null;render();return;}
 if(action==='sequence-save'){programs.finishRecording(byId('sequence-name').value,byId('sequence-future').checked);renderModal();return;}
 if(action==='sequence-discard'){programs.cancelRecording();renderModal();autoResolve();return;}
 if(action==='sequence-delete'){programs.removeSequence(sid);renderModal();return;}
 if(action==='sequence-step'){programs.editStep(sid,Number(el.dataset.index),el.dataset.direction);renderModal();return;}
 if(action==='sequence-check'){const r=programs.preflight(sid);toast(r.ok?'The entire sequence is legal from this position.':r.error,!r.ok);return;}
 if(action==='sequence-run'||action==='sequence-repeat'){const count=action==='sequence-run'?1:Number(document.querySelector(`[data-repeat="${sid}"]`).value);ui.modal=null;render();const r=await programs.repeat(sid,count);toast(`${r.completed} / ${r.requested} iterations completed.${r.reason?' '+r.reason:''}`,!!r.reason);autoResolve();return;}
 if(action==='program-stop'){clearTimeout(autoTimer);programs.stop();return;}
 if(action==='program-resume'){programs.resume();ui.modal=null;render();autoResolve();return;}
 if(action==='rule-new'){newRule();return;}
 if(action==='stack-hook'){const entry=[...g.state.stack,...(g.state.resolving?[g.state.resolving.object]:[])].find(s=>s.id===el.dataset.stackId);if(entry)newRule(entry);return;}
 if(action==='rule-edit'){const r=programs.model.rules.find(r=>r.id===rid);ui.ruleDraft={...structuredClone(r),editing:true};renderModal();return;}
 if(action==='rule-delete'){programs.removeRule(rid);renderModal();return;}
 if(action==='rule-cancel'){ui.ruleDraft=null;renderModal();return;}
 if(action==='rule-condition-add'){readRuleForm();if(ui.ruleDraft.conditions.length<12)ui.ruleDraft.conditions.push({cardId:registry.list().find(c=>c.candidate).id,test:'present'});renderModal();return;}
 if(action==='rule-condition-remove'){readRuleForm();ui.ruleDraft.conditions.splice(Number(el.dataset.index),1);renderModal();return;}
 if(action==='rule-save'){readRuleForm();const r=structuredClone(ui.ruleDraft);if(['one','current'].includes(r.scope)){const c=r.stackContext;r.stackIds=r.scope==='one'?[c.id]:[...g.state.stack,...(g.state.resolving?[g.state.resolving.object]:[])].filter(s=>s.sourceCardId===c.cardId&&(s.abilityId||'')===c.abilityId).map(s=>s.id);r.scope='stack';}programs.saveRule(r);ui.ruleDraft=null;renderModal();return;}
 // Table pointer gestures own mouse picking. Keyboard activation and decision
 // galleries still use native button clicks.
 if(action==='card'&&el.closest('.surface,.hand,.rail')&&event.detail!==0)return;
 if((event.clientX||event.clientY)&&!el.closest('[data-floating=decision]'))atPoint({x:event.clientX,y:event.clientY});
 if(action==='backdrop'){if(event.target===el){ui.modal=null;renderModal();autoResolve();}return;}
 if(action==='menu')return openDialog('menu');if(action==='dialog')return openDialog(el.dataset.dialog);
 if(action==='close-dialog'){ui.modal=null;renderModal();autoResolve();return;}
 if(action==='undo')return run({type:'UNDO'});if(action==='redo')return run({type:'REDO'});
 if(action==='card')return clickCard(id,{x:event.clientX,y:event.clientY},event.shiftKey);
 if(action==='inspect')return inspect(id,{x:event.clientX,y:event.clientY});if(action==='close-inspector')return closeInspector();
 if(action==='deck'){toast(`${g.state.zones.libraryActive.length} active · ${g.state.zones.libraryReserve.length} reserve cards`);return;}
 if(action==='mana')return run({type:'ADJUST_MANA',color:el.dataset.color,delta:Number(el.dataset.delta)});
 if(action==='clear-mana'){for(const c of COLORS)if(g.state.players[0].mana[c])run({type:'ADJUST_MANA',color:c,delta:-g.state.players[0].mana[c]});return;}
 if(action==='resource')return run({type:'ADJUST_PLAYER',player:Number(el.dataset.player),field:el.dataset.field,delta:Number(el.dataset.delta)});
 if(action==='keep')return run({type:'KEEP_HAND'});if(action==='mulligan')return run({type:'MULLIGAN'});
 if(action==='phase')return run({type:'ADVANCE_PHASE',step:el.dataset.step});if(action==='next')return run({type:'ADVANCE_PHASE',next:true});
 if(action==='next-turn')return run({type:'ADVANCE_PHASE',player:0,step:'main1',nextTurn:true});
 if(action==='next-player'){let p=g.state.activePlayer;for(let n=0;n<4;n++){p=(p+1)%4;if(!g.state.players[p].lost)break;}return run({type:'ADVANCE_PHASE',player:p,step:'main1',nextTurn:true});}
 if(action==='opponent')return run({type:'ADVANCE_PHASE',player:Number(el.dataset.player),step:'main1'});
 if(action==='resolve')return run({type:'RESOLVE_TOP'});if(action==='resolve-all')return run({type:'RESOLVE_ALL'});if(action==='pass')return run({type:'PASS_PRIORITY'});
 if(action==='zone'){prefs.dock=prefs.dock===el.dataset.zone?null:el.dataset.zone;ui.activeZone=prefs.dock||'battlefield';render();if(prefs.dock&&!prefs.cameras[prefs.dock])fit(prefs.dock);savePreferences();return;}
 if(action==='close-zone'){prefs.dock=null;ui.activeZone='battlefield';render();savePreferences();return;}
 if(action==='fit')return fit(el.dataset.zone);if(action==='arrange')return arrange(el.dataset.zone);
 if(action==='select-mode'){ui.selectMode=!ui.selectMode;if(!ui.selectMode)ui.selected.clear();render();return;}
 if(action==='suspend')return run({type:'SPECIAL_ACTION',id,special:'suspend'});
 if(action==='combat-auto')return run({type:'GOLDFISH_COMBAT_DAMAGE'});
 if(action==='cast')return run({type:g.characteristics(id).types.includes('Land')?'PLAY_LAND':'CAST_SPELL',id});
 if(action==='ability'){
  const source=g.object(id),ability=source&&g.abilities(source).find(a=>a.id===el.dataset.ability);
  const marker=ui.inspected===id&&source&&ability?{origin:inspectorOrigin(id),abilityId:ability.id,singleUse:abilitySingleUse(source,ability),cursor:g.cursor}:null;
  if(marker)ui.inspectorActivation=marker;
  const result=run({type:'ACTIVATE_ABILITY',id,abilityId:el.dataset.ability});
  if(marker&&!result.ok)ui.inspectorActivation=null;
  return result;
 }
 if(action==='revise-choice'){ui.modeBypass=draftIdentity();ui.playerBypass=draftIdentity();return run({type:'REVISE_DRAFT_INPUT',key:el.dataset.key});}
 if(action==='player-default'){
  const key=el.dataset.playerKey,value=el.dataset.playerValue;prefs.playerDefaults||={};
  if(value==='ASK')delete prefs.playerDefaults[key];else if(value==='ONCE')ui.askOnce[key]=true;else prefs.playerDefaults[key]=Number(value);
  savePreferences();render();return;
 }
 if(action==='order-edge'){const from=Number(el.dataset.index),item=ui.choice.splice(from,1)[0];if(el.dataset.edge==='top')ui.choice.unshift(item);else ui.choice.push(item);render();return;}
 if(action==='mode-default'){
  const key=el.dataset.modeKey,value=el.dataset.modeValue;prefs.modeDefaults||={};
  if(value==='ASK')delete prefs.modeDefaults[key];else prefs.modeDefaults[key]=value;
  savePreferences();render();return;
 }
 if(action==='plot')return run({type:'SPECIAL_ACTION',id,special:'plot'});
 if(action==='cancel')return run({type:'CANCEL'});
 if(action==='confirm-choice')return choose([...ui.choice]);if(action==='confirm-number')return choose(Number(byId('number-choice').value));
 if(action==='suggest-payment'){ui.paymentEdited=false;ui.payment=suggestPayment(g.state.pending.cost,g.state.players[g.state.pending.player||0],g.state.pending.context)||{normal:{},tagged:[]};render();return;}
 if(action==='pay')return choose(ui.payment);
 if(action==='decline'){const p=g.state.pending;return choose(p.kind==='optional'?'NO':p.kind==='effectPayment'||p.kind==='miracleReveal'?'decline':[]);}
 if(action==='option'){const p=g.state.pending,value=choiceOptions(p)[Number(el.dataset.option)].value;if((p.max||1)>1){ui.choice=ui.choice.includes(value)?ui.choice.filter(v=>v!==value):[...ui.choice,value];render();return;}return choose(value);}
 if(action==='order'){const from=Number(el.dataset.index),to=from+Number(el.dataset.direction);if(to>=0&&to<ui.choice.length)[ui.choice[from],ui.choice[to]]=[ui.choice[to],ui.choice[from]];render();return;}
 if(action==='stack-inspect'){const entries=[...g.state.stack,...(g.state.resolving?[g.state.resolving.object]:[])],entry=entries.find(v=>v.id===el.dataset.stackId);if(!entry)return;
 if(ui.stackSelection===entry.id){clearInspectorState();render();return;}ui.stackSelection=entry.id;const source=g.object(entry.source);ui.inspected=source?.id||null;ui.inspectDefinition=source?null:entry.sourceCardId;ui.inspectOrigin=source?inspectorOrigin(source.id):null;ui.inspectorActivation=null;ui.stackLabel=entry.label;if(!prefs.popups.inspector)delete ui.popupPositions.inspector;render();return;}
 if(action==='note'){const text=ui.noteText;ui.noteText='';const result=run({type:'NOTE',text});if(!result.ok)ui.noteText=text;renderModal();return;}
 if(action==='start-new'){ui.seed=byId('new-seed').value.trim()||newSeed();const report=auditDeck();if(!report.accepted){ui.modal='deck';renderModal();return toast('The deck needs attention before starting.',true);}useEngine(newEngine(Engine.create(registry,report.records,ui.seed)));toast('New seeded test.');return;}
 if(action==='start-lab'){useEngine(newEngine(createLab(registry,data.pool,el.dataset.lab)));fit('battlefield');return;}
 if(action==='deck-tab'){ui.deckTab=el.dataset.pool;renderModal();return;}
 if(action==='deck-add'){deckEdit({type:'adjust',pool:el.dataset.pool||ui.deckTab,name:el.dataset.cardName,delta:1});return;}
 if(action==='deck-adjust'){deckEdit({type:'adjust',pool:el.dataset.pool,name:el.dataset.cardName,delta:Number(el.dataset.delta)});return;}
 if(action==='deck-remove'){deckEdit({type:'remove',pool:el.dataset.pool,name:el.dataset.cardName});return;}
 if(action==='deck-apply-text'){auditDeck();prefs.deckText=ui.deckText;savePreferences();renderModal();return;}
 if(action==='validate-deck'){auditDeck();renderModal();return;}
 if(action==='deck-preset'){const preset=data.deckPresets?.find(p=>p.id===el.dataset.preset);if(!preset)return;ui.deckText=preset.text;prefs.deckText=ui.deckText;savePreferences();auditDeck();renderModal();return;}
 if(action==='restore-pool'){ui.deckText=data.deckText;prefs.deckText=null;ui.deckReport=null;auditDeck();renderModal();savePreferences();return;}
 if(action==='export-report'){saveDownload('missing-cards-report.json',auditDeck());renderModal();return;}
 if(action==='export-json')return exportJSON();if(action==='export-text'){saveDownload('astra-action-log.txt',g.exportText(),'text/plain');return;}
 if(action==='verify-replay'){if(g.transaction)return toast('Finish or undo the current action before replay verification.',true);const r=g.verifyReplay();toast(`Replay verified: ${r.actions} actions · ${r.checksum}`);return;}
 if(action==='restore-previous'){const prior=await store.get('previous');if(!prior)throw new Error('No previous autosave is available.');const engine=Engine.importSession(registry,prior.session);if(prior.session.uiLayout)prefs=cleanPreferences(prior.session.uiLayout);useEngine(engine,{memo:prior.session.tableView,grids:prior.session.tableGrids,playerPrograms:prior.session.playerPrograms});toast('Previous autosave recovered.');return;}
 if(action==='zoom'){ui.previousModal=ui.modal;ui.zoomCard=el.dataset.cardId;ui.backFace=false;ui.modal='card';renderModal();return;}
 if(action==='zoom-back'){ui.modal=ui.previousModal;renderModal();return;}if(action==='flip'){ui.backFace=!ui.backFace;renderModal();return;}
 if(action==='attack-confirm'){const attackers=g.controlled().filter(o=>ui.selected.has(o.id)&&g.characteristics(o).types.includes('Creature')).map(o=>({id:o.id,player:ui.attacks[o.id]||1}));const result=run({type:'DECLARE_ATTACKERS',attackers});if(result.ok){ui.modal=null;ui.selected.clear();render();autoResolve();}return;}
 if(action==='damage-confirm'){const result=run({type:'MANUAL_DAMAGE',player:Number(byId('damage-player').value),amount:Number(byId('damage-amount').value)});if(result.ok){ui.modal=null;render();}return;}
 if(action==='reset-layout'){const defaults=defaultPreferences();Object.assign(prefs,{sidebarWidth:defaults.sidebarWidth,handHeight:defaults.handHeight,dockWidth:defaults.dockWidth,cameras:{},popups:{}});ui.popupPositions={};render();savePreferences();return;}
 if(action==='debug-spawn'){const r=run({type:'DEBUG_SPAWN',cardId:byId('debug-card').value,zone:byId('debug-zone').value});if(r.ok){ui.modal=null;render();}return;}
 if(action==='debug-draw'||action==='debug-mill'){const r=run({type:action==='debug-draw'?'DEBUG_DRAW':'DEBUG_MILL',count:Number(byId('debug-count').value)});if(r.ok){ui.modal=null;render();}return;}
 if(action==='debug-shuffle')return run({type:'DEBUG_SHUFFLE'});
}
interactions=installInteractions({get g(){return g;},get prefs(){return prefs;},ui,size,render,savePreferences,applyCamera,clickCard,inspect,run,toast});
document.addEventListener('pointerdown',e=>{const zone=e.target.closest('[data-surface]')?.dataset.surface;if(zone)ui.activeZone=zone;});
document.addEventListener('click',e=>{handleClick(e).catch(error=>{toast(error.message,true);if(!(error instanceof RuleError))console.error(error);});});
document.addEventListener('dragstart',e=>{
 const row=e.target.closest?.('[data-order-id]');if(row){ui.orderDrag=row.dataset.orderId;e.dataTransfer.effectAllowed='move';e.dataTransfer.setData('text/plain',ui.orderDrag);return;}
 const el=e.target.closest?.('[data-deck-drag]');if(!el||ui.modal!=='deck')return;
 ui.deckDrag={origin:el.dataset.deckDrag,pool:el.dataset.pool||null,name:el.dataset.cardName,quantity:Number(el.dataset.quantity||1)};
 e.dataTransfer.effectAllowed=ui.deckDrag.origin==='database'?'copy':'move';
 try{e.dataTransfer.setData('text/plain',JSON.stringify(ui.deckDrag));}catch{}
 el.classList.add('deck-drag-source');overlay.classList.add('deck-drag-active');
});
function clearDeckDragVisuals(){overlay.classList.remove('deck-drag-active');for(const el of overlay.querySelectorAll('.deck-drag-over,.deck-drag-source'))el.classList.remove('deck-drag-over','deck-drag-source');}
document.addEventListener('dragover',e=>{
 const row=e.target.closest?.('[data-order-id]');if(ui.orderDrag&&row){e.preventDefault();e.dataTransfer.dropEffect='move';return;}
 if(ui.modal!=='deck'||!ui.deckDrag)return;const target=e.target.closest?.('[data-deck-drop-before],[data-deck-drop]');if(!target)return;
 e.preventDefault();e.dataTransfer.dropEffect=ui.deckDrag.origin==='database'?'copy':'move';
 for(const el of overlay.querySelectorAll('.deck-drag-over'))if(el!==target)el.classList.remove('deck-drag-over');target.classList.add('deck-drag-over');
});
document.addEventListener('dragleave',e=>{const target=e.target.closest?.('.deck-drag-over');if(target&&!target.contains(e.relatedTarget))target.classList.remove('deck-drag-over');});
document.addEventListener('drop',e=>{
 const row=e.target.closest?.('[data-order-id]');if(ui.orderDrag&&row){e.preventDefault();const id=ui.orderDrag,target=row.dataset.orderId;ui.orderDrag=null;if(id!==target){const next=ui.choice.filter(v=>v!==id),at=next.indexOf(target),box=row.getBoundingClientRect();next.splice(at+(e.clientY>box.top+box.height/2?1:0),0,id);ui.choice=next;render();}return;}
 if(ui.modal!=='deck'||!ui.deckDrag)return;const before=e.target.closest?.('[data-deck-drop-before]'),target=before||e.target.closest?.('[data-deck-drop]');if(!target)return;
 e.preventDefault();const drag=ui.deckDrag;let pool=before?.dataset.pool||target.dataset.deckDrop,beforeName=before?.dataset.deckDropBefore||null,next=ui.deckText;
 if(pool==='remove'){
  if(drag.origin==='deck')next=editDeck(next,{type:'remove',pool:drag.pool,name:drag.name});
 }else if(['main','command','outside'].includes(pool)){
  if(drag.origin==='database')next=editDeck(next,{type:'adjust',pool,name:drag.name,delta:1});
  else if(drag.pool!==pool)next=editDeck(next,{type:'move',from:drag.pool,to:pool,name:drag.name});
  if(beforeName&&beforeName.toLowerCase()!==drag.name.toLowerCase())next=editDeck(next,{type:'reorder',pool,name:drag.name,before:beforeName});
  ui.deckTab=pool;
 }
 ui.deckDrag=null;clearDeckDragVisuals();if(next!==ui.deckText)updateDeckText(next);else renderModal();
});
document.addEventListener('dragend',()=>{ui.orderDrag=null;if(!ui.deckDrag)return;ui.deckDrag=null;clearDeckDragVisuals();});
document.addEventListener('input',e=>{const el=e.target;
 if(el.id==='sequence-name')ui.sequenceName=el.value;
 if(el.id==='deck-text'){ui.deckText=el.value;prefs.deckText=el.value;savePreferences();}if(el.id==='deck-search'){ui.deckSearch=el.value;renderModal();}if(el.id==='new-seed')ui.seed=el.value;if(el.id==='note-text')ui.noteText=el.value;if(el.id==='number-choice')ui.number=Number(el.value);
 if(el.id==='card-search'){ui.cardFilter=el.value;renderModal();}if(el.id==='choice-filter'){ui.choiceFilter=el.value;const q=el.value.toLowerCase();for(const card of floats.querySelectorAll('.decision-gallery [data-card]')){const d=g.definition(card.dataset.card);card.hidden=!`${d.name} ${d.typeLine}`.toLowerCase().includes(q);}}
 if(el.dataset.payment){ui.payment||={normal:{},tagged:[]};ui.payment.normal[el.dataset.payment]=Number(el.value);ui.paymentEdited=true;}
 if(el.dataset.tagged){ui.payment||={normal:{},tagged:[]};const item=ui.payment.tagged.find(v=>v.id===el.dataset.tagged);if(item)item.amount=Number(el.value);else ui.payment.tagged.push({id:el.dataset.tagged,amount:Number(el.value)});ui.paymentEdited=true;}
});
document.addEventListener('change',e=>{const el=e.target;try{
 if(el.closest('#rule-form')){const cardChange=el.id==='rule-card';readRuleForm();if(cardChange&&ui.ruleDraft){ui.ruleDraft.abilityId='';requestAnimationFrame(()=>{if(ui.ruleDraft)renderModal();});}return;}
 if(el.dataset.ruleToggle){programs.toggleRule(el.dataset.ruleToggle,el.checked);return;}
 if(el.dataset.sequenceSaved){programs.saveSequence(el.dataset.sequenceSaved,el.checked);return;}
 if(el.dataset.sequenceName){programs.renameSequence(el.dataset.sequenceName,el.value);return;}
 if(el.id==='sequence-future'){ui.sequenceFuture=el.checked;return;}
 if(el.dataset.setting){const r=run({type:'SET_SETTING',key:el.dataset.setting,value:el.checked});if(r.ok&&['holdPriority','orderTriggers','manualControls'].includes(el.dataset.setting)){prefs[el.dataset.setting]=el.checked;savePreferences();}}
 if(el.dataset.autoAccept!==undefined){prefs.autoAccept=el.checked;savePreferences();}
 if(el.dataset.policy)run({type:'SET_OPTIONAL',key:el.dataset.policy,value:el.value});
 if(el.id==='reserve-access'){run({type:'RESERVE_ACCESS',enabled:el.checked});prefs.reserveAccess=el.checked;savePreferences();}
 if(el.id==='card-type'){ui.cardType=el.value;renderModal();}if(el.id==='show-derived'){ui.showDerived=el.checked;renderModal();}
 if(el.id==='deck-type'){ui.deckType=el.value;renderModal();}if(el.id==='deck-color'){ui.deckColor=el.value;renderModal();}if(el.id==='deck-sort'){ui.deckSort=el.value;renderModal();}
 if(el.dataset.deckQty!==undefined){deckEdit({type:'set',pool:el.dataset.pool,name:el.dataset.cardName,quantity:Number(el.value)});}
 if(el.dataset.playerField){const p=Number(el.dataset.player),field=el.dataset.playerField;run({type:'ADJUST_PLAYER',player:p,field,delta:Number(el.value)-g.state.players[p][field]});}
 if(el.dataset.attacker){el.checked?ui.selected.add(el.dataset.attacker):ui.selected.delete(el.dataset.attacker);}if(el.dataset.destination)ui.attacks[el.dataset.destination]=Number(el.value);
 if(el.id==='session-file')importFile(el.files[0]).catch(error=>toast(error.message,true));
 }catch(error){toast(error.message,true);}});
document.addEventListener('error',e=>{if(e.target instanceof HTMLImageElement)e.target.parentElement.classList.add('image-failed');},true);
document.addEventListener('submit',e=>{if(e.target.id==='rule-form'){e.preventDefault();e.target.querySelector('[data-action=rule-save]')?.click();}});
document.addEventListener('keydown',e=>{
 const editing=/INPUT|TEXTAREA|SELECT/.test(e.target.tagName)||e.target.isContentEditable;
 if(e.key==='Escape'){e.preventDefault();clearTimeout(autoTimer);if(programs.running){programs.stop();return;}if(ui.modal){ui.modal=null;renderModal();autoResolve();}else if(g.state.pending)run({type:'CANCEL'});else closeInspector();return;}
 if(e.key==='Tab'&&ui.modal){const list=[...overlay.querySelectorAll('button:not(:disabled),input:not(:disabled),select,textarea,[tabindex="0"]')].filter(el=>el.offsetParent!==null),first=list[0],last=list.at(-1);if(e.shiftKey&&document.activeElement===first){e.preventDefault();last?.focus();}else if(!e.shiftKey&&document.activeElement===last){e.preventDefault();first?.focus();}}
 if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==='s'){e.preventDefault();exportJSON();return;}if(editing)return;
 if(e.key==='Backspace'){e.preventDefault();run({type:'UNDO'});return;}
 if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==='z'){e.preventDefault();run({type:e.shiftKey?'REDO':'UNDO'});}
 if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==='y'){e.preventDefault();run({type:'REDO'});}
});
let resizeTimer;window.addEventListener('resize',()=>{clearTimeout(resizeTimer);resizeTimer=setTimeout(()=>{if(!ui.gestureActive)size();},80);});
window.addEventListener('pagehide',()=>{persistPreferences(prefs);saveNow().catch(()=>{});});
window.astra={programs,get engine(){return g;},registry,ui,get prefs(){return prefs;},run,flushSave:saveNow,get storage(){return store;},exported,version:'1.4.0'};
async function boot(){await store.open();saveStatus.text=store.mode==='memory'?'Autosave unavailable — export to preserve your session.':'Browser storage ready.';saveStatus.error=store.mode==='memory';
 let doc=null,engine=null;try{const latest=await store.get();if(latest){engine=Engine.importSession(registry,latest.session);doc=latest.session;saveStatus.text=`Restored ${new Date(latest.savedAt).toLocaleString()}`;}}catch(error){try{const previous=await store.get('previous');if(!previous)throw error;engine=Engine.importSession(registry,previous.session);doc=previous.session;saveStatus.text='Recovered the previous autosave.';}catch{saveStatus.text=`Could not recover autosave: ${error.message}`;saveStatus.error=true;}}
 if(doc?.uiLayout){prefs=cleanPreferences(doc.uiLayout);ui.deckText=prefs.deckText||data.deckText;}
 useEngine(engine||newEngine(Engine.create(registry,data.pool,ui.seed)),{save:false,memo:doc?.tableView,grids:doc?.tableGrids,playerPrograms:doc?.playerPrograms});
}
boot().catch(error=>{root.innerHTML=`<div class="fatal"><h1>Unable to start Astra</h1><p>${h(error.message)}</p><p>Open the standalone edition, or keep index.html together with the assets folder.</p></div>`;console.error(error);});
