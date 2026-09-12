import test from 'node:test';
import assert from 'node:assert/strict';
import { Engine, stateHash, clone } from '../src/core/index.js';
import { fixture,id,ability,choose,drain,roundTrip,registry } from './helpers.js';
import { captureStep,preflightSequence,cleanPrograms,futurePrograms,restorePrograms,ruleMatches,eventSignals } from '../src/tabletop/programs.js';
import { createProgramController } from '../src/tabletop/program-controller.js';
import { gridLayout,cleanGrids } from '../src/tabletop/grid.js';
import { cleanPreferences } from '../src/tabletop/preferences.js';

const cid=name=>registry.get(name).id;
const source=g=>({type:'ACTIVATE_ABILITY',id:id(g,'Urza, Lord High Artificer'),abilityId:'artifact-mana'});
function record(g,commands,name='Test line'){
 const steps=[];
 for(const command of commands){steps.push(captureStep(g,command));g.act(command);}
 return {id:'sequence',name,steps,saved:false};
}
function urzaLine(g){const copy=new Engine(registry,g.state);return record(copy,[source(copy),{type:'CHOOSE',value:[id(copy,'Grinding Station')]}],'Tap Station using Urza');}
function controller(g,sequences=[]){let notices=0;const p=createProgramController({g,toast(){},changed(){notices++;}});p.reset({sequences,rules:[]});return {p,get notices(){return notices;}};}
function send(g,p,a){const step=p.prepare(a);const result=g.perform(a);assert.ok(result.ok,result.error?.message);p.completed(a,result,step);return result;}
function rule(extra={}){return {id:'rule',name:'Station shortcut',enabled:true,event:'afterResolve',cardId:cid('Grinding Station'),abilityId:'untap',action:'sequence',sequenceId:'sequence',scope:'game',conditions:[],conditionMatch:'all',...extra};}
function readyStation(){const g=fixture({battlefield:['Urza, Lord High Artificer',{name:'Grinding Station',tapped:true}],hand:['Mox Amber']},{mana:{C:1}});g.act({type:'CAST_SPELL',id:id(g,'Mox Amber'),payment:'auto'});g.act({type:'RESOLVE_TOP'});return g;}

for(const zone of ['graveyard','exile','outside'])test(`${zone}: dragging frees slot for new arrival without moving detached card`,()=>{
 const g=fixture({[zone]:['Scroll Rack','Ancient Den','Mox Amber'],hand:['Mana Vault']});
 const objects=()=>g.objects(zone);let grid=gridLayout(objects());const moved=objects()[1],last=grid.cards[2];
 g.act({type:'LAYOUT',anchor:'corner-v2',updates:[{id:moved.id,x:510,y:440}]});
 grid=gridLayout(objects(),grid.slots);assert.equal(grid.slots[1],null);assert.equal(grid.cards.find(c=>c.id===moved.id).gridSlot,null);
 g.act({type:'DEBUG_MOVE',id:id(g,'Mana Vault'),zone});grid=gridLayout(objects(),grid.slots);
 assert.equal(grid.slots[1],`${id(g,'Mana Vault')}:${g.object(id(g,'Mana Vault')).oid}`);
 assert.deepEqual({x:grid.cards[2].x,y:grid.cards[2].y},{x:last.x,y:last.y});
 assert.equal(grid.cards.find(c=>c.id===moved.id).x,510);roundTrip(g);
});
test('grid removes departed incarnations and keeps distinct duplicate physical copies',()=>{
 const objects=[1,2,3].map(n=>({id:'c'+n,oid:1,zone:'graveyard',flags:{},location:null}));
 let a=gridLayout(objects);objects[1].oid=2;a=gridLayout(objects,a.slots);assert.equal(a.slots[1],'c2:2');
 a=gridLayout(objects.filter(o=>o.id!=='c1'),a.slots);assert.equal(a.slots[0],null);
 const saved=cleanGrids({graveyard:a.slots,exile:['bad',null,'c3:2']});assert.deepEqual(saved.graveyard,a.slots);assert.deepEqual(saved.exile,[null,null,'c3:2']);
});
test('grid reset is a real undoable layout with preserved slot ownership across reload',()=>{
 const g=fixture({graveyard:['Scroll Rack','Ancient Den','Mox Amber']});const moved=id(g,'Scroll Rack');
 g.act({type:'LAYOUT',anchor:'corner-v2',updates:[{id:moved,x:600,y:400}]});const before=stateHash(g.state);
 const grid=gridLayout(g.objects('graveyard').map(o=>({...o,location:null})),[],300);
 g.act({type:'LAYOUT',anchor:'corner-v2',grid:true,updates:grid.cards.map(({id,x,y})=>({id,x,y}))});
 const h=Engine.importSession(registry,g.exportSession());const result=gridLayout(h.objects('graveyard'),[],600);
 assert.ok(result.cards.every(c=>c.gridSlot!==null));assert.equal(h.object(moved).location.slot,0);
 g.act({type:'UNDO'});assert.equal(stateHash(g.state),before);roundTrip(g);
});
test('preflight builds an entire legal line without changing game, mana, RNG or history',()=>{
 const g=fixture({battlefield:['Urza, Lord High Artificer','Grinding Station']});const seq=urzaLine(g),before=JSON.stringify(g.exportSession());
 const result=preflightSequence(g,seq);assert.equal(result.ok,true,result.error);assert.equal(JSON.stringify(g.exportSession()),before);
 g.act({type:'RUN_SEQUENCE',name:seq.name,commands:result.commands});assert.equal(g.object(id(g,'Grinding Station')).tapped,true);assert.equal(g.state.players[0].mana.U,1);assert.equal(g.cursor,1);roundTrip(g);
});
test('failed late command rolls back every earlier command and its costs in the iteration',()=>{
 const g=fixture({battlefield:['Urza, Lord High Artificer','Grinding Station']});const result=preflightSequence(g,urzaLine(g));
 const before=JSON.stringify(g.exportSession());const bad=g.perform({type:'RUN_SEQUENCE',commands:[...result.commands,...result.commands]});
 assert.equal(bad.ok,false);assert.equal(JSON.stringify(g.exportSession()),before);assert.equal(g.state.players[0].mana.U,0);
});
test('recordings ending inside a cost selection are rejected before execution',()=>{
 const g=fixture({battlefield:['Krark-Clan Ironworks','Ancient Den']});const command={type:'ACTIVATE_ABILITY',id:id(g,'Krark-Clan Ironworks'),abilityId:'sacrifice'};
 const seq={steps:[captureStep(g,command)]},before=stateHash(g.state);assert.equal(preflightSequence(g,seq).ok,false);assert.equal(stateHash(g.state),before);
});
test('recorded payment consumes eligible existing mana only; shortage stops before costs',()=>{
 const g=fixture({hand:['Walking Atlas']},{mana:{C:2}}),copy=new Engine(registry,g.state);
 const seq=record(copy,[{type:'CAST_SPELL',id:id(copy,'Walking Atlas')},{type:'CHOOSE',value:'auto'},{type:'RESOLVE_TOP'}]);
 assert.equal(preflightSequence(g,seq).ok,true);g.act({type:'ADJUST_MANA',color:'C',delta:-2});const before=stateHash(g.state);
 assert.equal(preflightSequence(g,seq).ok,false);assert.equal(stateHash(g.state),before);assert.ok(id(g,'Walking Atlas','hand'));
});
test('cross-game bindings resolve a unique source and target, not old physical IDs',()=>{
 const a=fixture({battlefield:['Urza, Lord High Artificer','Grinding Station']},{seed:'first'}),seq=urzaLine(a);
 const b=fixture({battlefield:['Ancient Den','Urza, Lord High Artificer','Grinding Station']},{seed:'second'});
 const result=preflightSequence(b,seq);assert.equal(result.ok,true,result.error);b.act({type:'RUN_SEQUENCE',commands:result.commands});assert.equal(b.object(id(b,'Grinding Station')).tapped,true);roundTrip(b);
});
test('ambiguous cross-game copies fail safely rather than sacrificing or tapping an arbitrary card',()=>{
 const a=fixture({battlefield:['Urza, Lord High Artificer','Grinding Station']},{seed:'a'}),b=fixture({battlefield:['Urza, Lord High Artificer','Grinding Station','Grinding Station']},{seed:'b'});
 const before=stateHash(b.state),r=preflightSequence(b,urzaLine(a));assert.equal(r.ok,false);assert.match(r.error,/Ambiguous/);assert.equal(stateHash(b.state),before);
});
test('recorded top-of-stack resolution cannot resolve a different effect',()=>{
 const a=fixture({hand:['Walking Atlas']},{mana:{C:2}});a.act({type:'CAST_SPELL',id:id(a,'Walking Atlas'),payment:'auto'});
 const step=captureStep(a,{type:'RESOLVE_TOP'}),b=fixture({hand:['Mox Amber']});b.act({type:'CAST_SPELL',id:id(b,'Mox Amber'),payment:'auto'});
 assert.match(preflightSequence(b,{steps:[step]}).error,/top of the stack/);
});
test('manual and recursive sequence commands are not permitted in a recording',()=>{
 const g=fixture();for(const type of ['DEBUG_MOVE','ADJUST_MANA','SET_SETTING','RUN_SEQUENCE']){assert.equal(captureStep(g,{type}),null);assert.equal(preflightSequence(g,{steps:[{action:{type}}]}).ok,false);}
 assert.deepEqual(cleanPrograms({sequences:[{id:'bad',name:'bad',steps:[{action:{type:'DEBUG_DRAW'}}]}]}).sequences,[]);
});
test('player condition groups correctly implement any/all and untapped or absent checks',()=>{
 const g=fixture({battlefield:['Urza, Lord High Artificer',{name:'Grinding Station',tapped:true}]}),event={event:'untapped',cardId:cid('Grinding Station')};
 const r=rule({event:'untapped',abilityId:'',conditions:[{cardId:cid('Urza, Lord High Artificer'),test:'present'},{cardId:cid('Clock of Omens'),test:'present'}],conditionMatch:'any'});
 assert.equal(ruleMatches(g,r,event),true);r.conditionMatch='all';assert.equal(ruleMatches(g,r,event),false);
 r.conditions=[{cardId:cid('Grinding Station'),test:'untapped'}];assert.equal(ruleMatches(g,r,event),false);r.conditions=[{cardId:cid('Clock of Omens'),test:'absent'}];assert.equal(ruleMatches(g,r,event),true);
});
test('no player action or priority rule is implicitly enabled',()=>{
 const g=fixture(),c=controller(g);assert.equal(c.p.model.rules.length,0);send(g,c.p,{type:'NOTE',text:'test'});assert.equal(c.notices,0);assert.equal(c.p.model.queue.length,0);
});
test('record/finish retains a game-only sequence by default and skips unrelated layout intents',()=>{
 const g=fixture({battlefield:['Urza, Lord High Artificer','Grinding Station']}),{p}=controller(g);
 p.startRecording();send(g,p,source(g));send(g,p,{type:'CHOOSE',value:[id(g,'Grinding Station')]});const seq=p.finishRecording('Tap Station');
 assert.equal(seq.saved,false);assert.equal(seq.steps.length,2);assert.equal(p.recording,null);assert.equal(futurePrograms(p.model).sequences.length,0);
});
test('bounded repeat stops before the first illegal iteration; a completed iteration is one undo',async()=>{
 const g=fixture({battlefield:['Urza, Lord High Artificer','Grinding Station']}),{p}=controller(g,[urzaLine(g)]),before=stateHash(g.state);
 const result=await p.repeat('sequence',10);assert.equal(result.completed,1);assert.equal(g.cursor,1);assert.equal(g.state.players[0].mana.U,1);assert.equal(p.model.paused,true);
 g.act({type:'UNDO'});assert.equal(stateHash(g.state),before);g.act({type:'REDO'});roundTrip(g);
});
test('successful repeat supports a true resettable sequence and can be stopped between iterations',async()=>{
 const g=fixture({battlefield:['Grim Monolith']},{mana:{C:10}}),copy=new Engine(registry,g.state);
 const seq=record(copy,[{type:'ACTIVATE_ABILITY',id:id(copy,'Grim Monolith'),abilityId:'mana'},{type:'ACTIVATE_ABILITY',id:id(copy,'Grim Monolith'),abilityId:'untap',payment:'auto'},{type:'RESOLVE_TOP'}]);
 const {p}=controller(g,[seq]);const result=await p.repeat(seq.id,3);assert.equal(result.completed,3);assert.equal(g.cursor,3);assert.equal(g.state.players[0].mana.C,7);roundTrip(g);
});
test('rule after Station untap effect taps Station through Urza without hardcoded card automation',()=>{
 const g=readyStation(),seq=urzaLine(fixture({battlefield:['Urza, Lord High Artificer','Grinding Station']})),{p}=controller(g,[seq]);
 p.saveRule(rule({conditions:[{cardId:cid('Urza, Lord High Artificer'),test:'present'}]}));
 send(g,p,{type:'RESOLVE_TOP'});if(g.state.pending)send(g,p,{type:'CHOOSE',value:'YES'});
 assert.equal(g.object(id(g,'Grinding Station')).tapped,true);assert.equal(g.state.players[0].mana.U,1);assert.equal(p.model.paused,false);roundTrip(g);
});
test('priority hold triggers only when the stack is nonempty after the chosen event',()=>{
 for(const extra of [false,true]){
  const g=readyStation();if(extra){const cloneEntry=clone(g.state.stack[0]);cloneEntry.id='extra';g.state.stack.unshift(cloneEntry);g.initialState=clone(g.state);g.history=[];g.cursor=0;}
  const {p}=controller(g);p.saveRule(rule({event:'untapped',abilityId:'',action:'hold'}));
  send(g,p,{type:'RESOLVE_TOP'});if(g.state.pending)send(g,p,{type:'CHOOSE',value:'YES'});
  assert.equal(p.model.paused,extra);assert.equal(g.object(id(g,'Grinding Station')).tapped,false);
 }
});
test('disabled conditional rule remains saved but performs no action',()=>{
 const g=readyStation(),{p}=controller(g,[urzaLine(fixture({battlefield:['Urza, Lord High Artificer','Grinding Station']}))]);
 p.saveRule(rule({scope:'future'}));p.toggleRule('rule',false);send(g,p,{type:'RESOLVE_TOP'});if(g.state.pending)send(g,p,{type:'CHOOSE',value:'YES'});
 assert.equal(g.object(id(g,'Grinding Station')).tapped,false);assert.equal(futurePrograms(p.model).rules[0].enabled,false);
});
test('single-stack shortcut matches only its selected item, not later copies',()=>{
 const g=readyStation(),entry=g.state.stack.at(-1),{p}=controller(g);
 p.saveRule(rule({event:'beforeResolve',action:'hold',scope:'stack',stackIds:[entry.id]}));
 assert.equal(p.beforeResolve(),false);assert.equal(p.model.paused,true);p.resume();assert.equal(p.beforeResolve(),true);
 assert.equal(ruleMatches(g,p.model.rules[0],{event:'beforeResolve',cardId:entry.sourceCardId,abilityId:entry.abilityId,stackId:'other'}),false);
});
test('before-resolution sequence runs once and leaves original top available to resolve',()=>{
 const g=fixture({battlefield:['Urza, Lord High Artificer','Grinding Station'],hand:['Mox Amber']}),seq=urzaLine(g);g.act({type:'CAST_SPELL',id:id(g,'Mox Amber'),payment:'auto'});
 const top=g.state.stack.at(-1),{p}=controller(g,[seq]);p.saveRule(rule({event:'beforeResolve',cardId:cid('Mox Amber'),abilityId:'',scope:'stack',stackIds:[top.id]}));
 assert.equal(p.beforeResolve(),true);assert.equal(g.object(id(g,'Grinding Station')).tapped,true);assert.equal(g.state.players[0].mana.U,1);assert.equal(p.beforeResolve(),true);assert.equal(g.state.players[0].mana.U,1);roundTrip(g);
});
test('future rules carry referenced sequences; unsaved unrelated game sequences do not leak',()=>{
 const seq=urzaLine(fixture({battlefield:['Urza, Lord High Artificer','Grinding Station']}));
 const model=cleanPrograms({sequences:[seq,{...seq,id:'temp'},{...seq,id:'saved',saved:true}],rules:[rule({scope:'future',enabled:false}),rule({id:'game',scope:'game'})]});
 const future=futurePrograms(model);assert.deepEqual(future.sequences.map(s=>s.id),['sequence','saved']);assert.equal(future.rules.length,1);
 const resumed=restorePrograms(model,future);assert.equal(resumed.rules[0].enabled,false);assert.equal(resumed.sequences.length,3);
 const prefs=cleanPreferences({savedPrograms:model,autoAccept:true,playerDefaults:{'key/player':0},popupSizes:{decision:{width:700,height:600}}});
 assert.equal(prefs.autoAccept,true);assert.equal(prefs.playerDefaults['key/player'],0);assert.equal(prefs.popupSizes.decision.height,600);assert.equal(prefs.savedPrograms.rules.length,1);
});
test('session snapshot retains temporary sequences and pause/seen state for reload',()=>{
 const g=fixture({battlefield:['Urza, Lord High Artificer','Grinding Station']}),{p}=controller(g,[urzaLine(g)]);p.stop();p.model.seen.push('test/afterResolve/s10');
 const restored=controller(g).p;restored.reset(JSON.parse(JSON.stringify(p.snapshot())),{});assert.equal(restored.model.sequences.length,1);assert.equal(restored.model.paused,true);assert.deepEqual(restored.model.seen,['test/afterResolve/s10']);
});

test('a recorded line cannot silently cross an active before-resolution priority shortcut',()=>{
 const g=fixture({hand:['Walking Atlas']},{mana:{C:2}}),copy=new Engine(registry,g.state);
 const seq=record(copy,[{type:'CAST_SPELL',id:id(copy,'Walking Atlas'),payment:'auto'},{type:'RESOLVE_TOP'}]);
 const {p}=controller(g,[seq]);p.saveRule(rule({event:'beforeResolve',cardId:cid('Walking Atlas'),abilityId:'',action:'hold'}));
 const before=stateHash(g.state),result=p.preflight(seq.id);assert.equal(result.ok,false);assert.match(result.error,/before-resolution/);assert.equal(stateHash(g.state),before);
});
test('recorded line cannot defer a matching after-resolution rule past a subsequent action',()=>{
 const g=fixture({battlefield:['Ancient Den'],hand:['Mox Amber']}),copy=new Engine(registry,g.state);
 const seq=record(copy,[{type:'CAST_SPELL',id:id(copy,'Mox Amber'),payment:'auto'},{type:'RESOLVE_TOP'},{type:'ACTIVATE_ABILITY',id:id(copy,'Ancient Den'),abilityId:'mana'}]);
 const {p}=controller(g,[seq]);p.saveRule(rule({cardId:cid('Mox Amber'),abilityId:'',action:'sequence',sequenceId:seq.id}));
 const before=stateHash(g.state),result=p.preflight(seq.id);assert.equal(result.ok,false);assert.match(result.error,/priority boundary/);assert.equal(stateHash(g.state),before);
 p.toggleRule('rule',false);assert.equal(p.preflight(seq.id).ok,true);
});
test('loop bound rejects zero, negative, noninteger and excessive requests without mutation',async()=>{
 const g=fixture({battlefield:['Urza, Lord High Artificer','Grinding Station']}),{p}=controller(g,[urzaLine(g)]),before=stateHash(g.state);
 for(const n of [0,-1,2.3,1001,Infinity])await assert.rejects(()=>p.repeat('sequence',n),/1–1000/);
 assert.equal(stateHash(g.state),before);assert.equal(p.running,null);
});
test('an explicit Stop interrupts bounded repeat between complete atomic iterations',async()=>{
 const g=fixture({battlefield:['Grim Monolith']},{mana:{C:100}}),copy=new Engine(registry,g.state);
 const seq=record(copy,[{type:'ACTIVATE_ABILITY',id:id(copy,'Grim Monolith'),abilityId:'mana'},{type:'ACTIVATE_ABILITY',id:id(copy,'Grim Monolith'),abilityId:'untap',payment:'auto'},{type:'RESOLVE_TOP'}]);
 let p; p=createProgramController({g,toast(){},changed(){if(p?.running?.completed===2)p.stop();}});p.reset({sequences:[seq]});
 const result=await p.repeat(seq.id,100);assert.equal(result.completed,2);assert.equal(g.cursor,2);assert.equal(g.object(id(g,'Grim Monolith')).tapped,false);roundTrip(g);
});

test('audit: Retreat does not offer a creature mode when no creature can be targeted',()=>{
 const g=fixture({battlefield:['Retreat to Coralhelm'],hand:['Ancient Den']});g.act({type:'PLAY_LAND',id:id(g,'Ancient Den')});
 assert.deepEqual(g.state.pending.options.map(o=>o.value),['scry']);choose(g,'scry');drain(g);roundTrip(g);
});
test('audit: Scaretiller preserves its optional hand mode when no graveyard land exists',()=>{
 const g=fixture({battlefield:['Scaretiller','Urza, Lord High Artificer']});ability(g,'Urza, Lord High Artificer','artifact-mana',{tapped:[id(g,'Scaretiller')]});
 assert.deepEqual(g.state.pending.options.map(o=>o.value),['hand']);choose(g,'hand');drain(g);roundTrip(g);
});
test('audit: Raft modes count legal targets, not just creatures behind shroud',()=>{
 const g=fixture({battlefield:['Elven Raft-Steerer',{name:'Walking Atlas',owner:1,controller:1,props:{modifications:[{keywords:['Shroud']}]}}],hand:['Ancient Den']});
 g.act({type:'PLAY_LAND',id:id(g,'Ancient Den')});assert.deepEqual(g.state.pending.options.map(o=>o.value),['untap']);choose(g,'untap');choose(g,[id(g,'Elven Raft-Steerer')]);drain(g);roundTrip(g);
});
