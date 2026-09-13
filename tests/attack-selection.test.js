import test from 'node:test';
import assert from 'node:assert/strict';
import {fixture,id,registry,roundTrip} from './helpers.js';
import {Engine} from '../src/core/index.js';
import {attackCombatKey,attackSelectionReady,attackerProblem,cleanAttackDraft,selectedAttackers,setAttackPick,toggleAttackPick} from '../src/tabletop/attack-selection.js';
import {picture,toolbar,tabletop} from '../src/tabletop/views.js';
import {dialogs} from '../src/tabletop/dialogs.js';
import {defaultPreferences} from '../src/tabletop/preferences.js';
const scenario=()=>fixture({battlefield:['Iron Man, Titan of Innovation','Metalworker','Walking Atlas','Ancient Den']},{step:'attackers'});

test('attacker picks: repeated clicks toggle without tapping, producing mana, firing triggers or changing history',()=>{
 const g=scenario(),before=JSON.stringify(g.exportSession()),card=id(g,'Metalworker');let d=null;
 d=toggleAttackPick(g,d,card).draft;assert.deepEqual(selectedAttackers(g,d),[{id:card,player:1}]);
 d=toggleAttackPick(g,d,card).draft;assert.deepEqual(selectedAttackers(g,d),[]);
 assert.equal(JSON.stringify(g.exportSession()),before);
});
test('attacker picks: declaration commits one simultaneous engine action and the real Iron Man trigger',()=>{
 const g=scenario();let d=toggleAttackPick(g,null,id(g,'Iron Man, Titan of Innovation')).draft;
 d=toggleAttackPick(g,d,id(g,'Metalworker')).draft;
 assert.equal(g.state.stack.length,0);g.act({type:'DECLARE_ATTACKERS',attackers:selectedAttackers(g,d)});
 assert.equal(g.state.attackersDeclared,true);assert.equal(g.state.stack.length,1);assert.equal(g.object(id(g,'Metalworker')).tapped,true);
 assert.equal(g.object(id(g,'Iron Man, Titan of Innovation')).attacksThisTurn,1);
 assert.equal(g.history.at(-1).events.filter(e=>e.type==='ATTACKERS_DECLARED').length,1);
 assert.equal(attackCombatKey(g),null);assert.deepEqual(selectedAttackers(g,d),[]);roundTrip(g);
});
test('attacker picks: illegal tapped, sick, defender, noncreature and opponent choices are rejected',()=>{
 for(const spec of [{name:'Walking Atlas',tapped:true},{name:'Walking Atlas',sick:true},{name:'Walking Atlas',props:{modifications:[{keywords:['Defender']}]}},{name:'Walking Atlas',controller:1,owner:1},{name:'Ancient Den'}]){
  const g=fixture({battlefield:[spec]},{step:'attackers'}),r=toggleAttackPick(g,null,g.state.zones.battlefield[0]);
  assert.ok(r.error);assert.deepEqual(selectedAttackers(g,r.draft),[]);
 }
});
test('attacker picks: haste, vigilance, and creatures with mana abilities retain engine combat behavior',()=>{
 const g=fixture({battlefield:[{name:'Metalworker',sick:true,props:{modifications:[{keywords:['Haste','Vigilance']}]}}]},{step:'attackers'});
 const card=id(g,'Metalworker'),r=toggleAttackPick(g,null,card);assert.equal(r.error,null);
 g.act({type:'DECLARE_ATTACKERS',attackers:selectedAttackers(g,r.draft)});
 assert.equal(g.object(card).tapped,false);assert.ok(g.object(card).flags.attacking);assert.equal(g.state.players[0].mana.C,0);roundTrip(g);
});
test('attacker picks: clicking must yield to pending targets, payments and unresolved stack objects',()=>{
 for(const field of ['pending','resolving','actionDraft','stack','pendingTriggers']){
  const g=scenario();g.state[field]=['stack','pendingTriggers'].includes(field)?[{}]:{kind:'payment'};
  assert.equal(attackSelectionReady(g),false);assert.ok(toggleAttackPick(g,null,id(g,'Metalworker')).error);
 }
 for(const options of [{step:'main1'},{step:'attackers',player:1}]){
  const g=fixture({battlefield:['Walking Atlas']},options);assert.equal(attackSelectionReady(g),false);
 }
});
test('attacker picks: destination changes and deselection preserve the individual opponent choice',()=>{
 const g=scenario(),card=id(g,'Walking Atlas');let d=setAttackPick(g,null,card,{player:3}).draft;
 assert.equal(selectedAttackers(g,d).length,0);d=toggleAttackPick(g,d,card).draft;
 assert.deepEqual(selectedAttackers(g,d),[{id:card,player:3}]);d=toggleAttackPick(g,d,card).draft;d=toggleAttackPick(g,d,card).draft;
 assert.equal(selectedAttackers(g,d)[0].player,3);assert.ok(setAttackPick(g,d,card,{player:0}).error);
});
test('attacker picks: default destination is the first remaining opponent; lost targets invalidate picks',()=>{
 const g=scenario();g.state.players[1].lost=true;const card=id(g,'Walking Atlas');
 const d=toggleAttackPick(g,null,card).draft;assert.equal(selectedAttackers(g,d)[0].player,2);
 g.state.players[2].lost=true;assert.deepEqual(selectedAttackers(g,d),[]);
 g.state.players[3].lost=true;assert.ok(attackerProblem(g,card));
});
test('attacker picks: a creature changing zones, control, types or attack eligibility is removed from the draft',()=>{
 const mutations=[(g,o)=>{o.tapped=true;},(g,o)=>{o.controller=1;},(g,o)=>{o.controlledSince=g.state.turnSerial;},(g,o)=>{o.modifications.push({keywords:['Defender']});},(g,o)=>{o.modifications.push({removeTypes:['Creature']});}];
 for(const mutate of mutations){const g=scenario(),card=id(g,'Metalworker'),d=toggleAttackPick(g,null,card).draft;mutate(g,g.object(card));g.touch();assert.deepEqual(selectedAttackers(g,d),[]);}
 const g=scenario(),card=id(g,'Metalworker'),d=toggleAttackPick(g,null,card).draft;
 g.act({type:'DEBUG_MOVE',id:card,zone:'graveyard'});g.act({type:'DEBUG_MOVE',id:card,zone:'battlefield'});
 assert.deepEqual(cleanAttackDraft(g,d).cards,{},'old ID must not select a new incarnation');
});
test('attacker picks: leaving the step, changing turns and entering another extra combat discard old selections',()=>{
 for(const change of [g=>{g.state.step='damage';},g=>{g.state.turnSerial++;},g=>{g.state.currentExtraCombat={id:'extra-1'};},g=>{g.state.activePlayer=1;}]){
  const g=scenario(),d=toggleAttackPick(g,null,id(g,'Metalworker')).draft;change(g);assert.deepEqual(selectedAttackers(g,d),[]);
 }
});
test('attacker picks: old, malformed or untrusted saved draft fields cannot select illegal objects',()=>{
 const g=scenario(),card=id(g,'Metalworker'),d=toggleAttackPick(g,null,card).draft;
 for(const value of [null,{},[],{combat:d.combat,cards:[]},{combat:d.combat,cards:{x:{selected:true}}},{...d,cards:{[card]:{oid:g.object(card).oid,selected:true,player:'1'}}}])assert.deepEqual(cleanAttackDraft(g,value).cards,{});
});
test('attacker picks: export/import restores the UI draft separately from verified game history',()=>{
 const g=scenario(),card=id(g,'Metalworker'),draft=toggleAttackPick(g,null,card).draft;
 const doc={...g.exportSession(),attackDraft:draft},copy=Engine.importSession(registry,JSON.parse(JSON.stringify(doc)));
 assert.deepEqual(selectedAttackers(copy,doc.attackDraft),[{id:card,player:1}]);assert.equal(copy.cursor,0);
 copy.act({type:'DECLARE_ATTACKERS',attackers:selectedAttackers(copy,doc.attackDraft)});copy.act({type:'UNDO'});
 const empty=cleanAttackDraft(copy,null);assert.deepEqual(selectedAttackers(copy,empty),[]);roundTrip(copy);
});
test('attacker picks: dedicated border, accessible pressed state and controls do not depend on drag selection',()=>{
 const g=scenario(),card=id(g,'Metalworker'),draft=toggleAttackPick(g,null,card).draft;
 const prefs=defaultPreferences(),ui={attackDraft:draft,selected:new Set([id(g,'Walking Atlas')]),layouts:{battlefield:g.controlled().map((o,i)=>({id:o.id,x:i*140,y:200,z:i}))},choice:[]};
 assert.match(picture(g,card,{attackMode:true,attackSelected:true}),/attack-selected/);
 assert.match(picture(g,card,{attackMode:true,attackSelected:true}),/aria-pressed="true"/);
 const html=toolbar({g,ui,prefs});assert.match(html,/Declare attackers \(1\)/);assert.match(html,/Attack options/);
 ui.modal='combat';const dialog=dialogs({g,ui,prefs,registry});assert.match(dialog,new RegExp(`data-attacker="${card}" checked`));
 assert.doesNotMatch(dialog,new RegExp(`data-attacker="${id(g,'Walking Atlas')}" checked`));
 assert.deepEqual([...ui.selected],[id(g,'Walking Atlas')]);
});
