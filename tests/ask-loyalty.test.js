import test from 'node:test';
import assert from 'node:assert/strict';
import {fixture,id,choose,drain,ability,registry,cards,roundTrip} from './helpers.js';
import {picture} from '../src/tabletop/views.js';
import {defaultPreferences} from '../src/tabletop/preferences.js';
const fire=g=>{g.act({type:'DEBUG_MOVE',id:id(g,'Ancient Den'),zone:'battlefield'});g.act({type:'RESOLVE_TOP'});};

test('Ask defaults: Provisioner asks on first landfall and does not remember an ordinary choice',()=>{
 const g=fixture({battlefield:['Tireless Provisioner'],graveyard:['Ancient Den']});
 fire(g);assert.equal(g.state.pending.key,'tokenKind');assert.equal(g.state.pending.policyKey,registry.get('Tireless Provisioner').id+'/token-kind');
 choose(g,'Food');assert.equal(g.controlled().filter(o=>g.definition(o).name==='Food').length,1);assert.deepEqual(g.state.optionalPreferences,{});
 g.act({type:'DEBUG_MOVE',id:id(g,'Ancient Den'),zone:'graveyard'});fire(g);assert.equal(g.state.pending.key,'tokenKind');choose(g,'Treasure');roundTrip(g);
});
test('Ask defaults: explicit remembered token preferences are respected and reset to Ask',()=>{
 for(const kind of ['Treasure','Food']){
  const g=fixture({battlefield:['Tireless Provisioner'],graveyard:['Ancient Den']});fire(g);choose(g,kind,{remember:true});
  const key=registry.get('Tireless Provisioner').id+'/token-kind';assert.equal(g.state.optionalPreferences[key],kind);
  g.act({type:'DEBUG_MOVE',id:id(g,'Ancient Den'),zone:'graveyard'});fire(g);assert.equal(g.state.pending,null);
  assert.equal(g.controlled().filter(o=>g.definition(o).name===kind).length,2);
  g.act({type:'SET_OPTIONAL',key,value:'ASK'});g.act({type:'DEBUG_MOVE',id:id(g,'Ancient Den'),zone:'graveyard'});fire(g);assert.equal(g.state.pending.key,'tokenKind');choose(g,kind);roundTrip(g);
 }
});
test('Ask defaults: new sessions start with no optional, mode or target preferences',()=>{
 const g=fixture({battlefield:['Tireless Provisioner','Tatyova, Benthic Druid']});assert.deepEqual(g.state.optionalPreferences,{});
 const prefs=defaultPreferences();assert.deepEqual(prefs.modeDefaults,{});assert.deepEqual(prefs.playerDefaults,{});
});
test('Ask defaults: module-level defaults never silently resolve a new optional choice',()=>{
 const g=fixture({battlefield:['Tireless Provisioner']}),context=g.context(id(g,'Tireless Provisioner'));
 g.executeEffect({op:'optional',key:'test',defaultPolicy:'YES',then:[]},context);
 assert.equal(g.state.pending.kind,'optional');g.state.pending=null;
 g.effectChoose({op:'choose',key:'test',policyKey:'test',defaultValue:'A',options:[{value:'A',label:'A'},{value:'B',label:'B'}]},context);
 assert.equal(g.state.pending.key,'test');
});
test('loyalty: battlefield overlays show only current number and retain other counters',()=>{
 const g=fixture({battlefield:[{name:'Tezzeret the Seeker',counters:{loyalty:12,charge:2}},'Walking Atlas'],hand:['Tezzeret, Cruel Captain']});
 const html=picture(g,id(g,'Tezzeret the Seeker'));
 assert.match(html,/class="loyalty-badge"[^>]*>12<\/span>/);assert.doesNotMatch(html,/<span>12 loyalty/);assert.match(html,/<span>2 charge/);
 assert.doesNotMatch(picture(g,id(g,'Tezzeret, Cruel Captain')),/loyalty-badge/);
 assert.match(picture(g,id(g,'Walking Atlas')),/power-badge/);
});
test('loyalty: activation, undo and redo update the actual counter, with creature P/T remaining separate',()=>{
 const g=fixture({battlefield:['Tezzeret the Seeker','Mana Vault']});
 ability(g,'Tezzeret the Seeker','untap',{target:[]});assert.match(picture(g,id(g,'Tezzeret the Seeker')),/>5<\/span>/);
 g.act({type:'UNDO'});assert.equal(g.object(id(g,'Tezzeret the Seeker')).counters.loyalty,4);g.act({type:'REDO'});drain(g);roundTrip(g);
 const both=fixture({battlefield:[{name:'Tezzeret the Seeker',props:{modifications:[{addTypes:['Creature'],basePower:3,baseToughness:4}]}}]});
 const html=picture(both,id(both,'Tezzeret the Seeker'));assert.match(html,/power-badge with-loyalty/);assert.match(html,/>3\/4<\/span>/);assert.match(html,/loyalty-badge/);
});

test('Ask defaults: every optional inspector in the supported catalog starts at ASK',async()=>{
 const {inspectorPopup}=await import('../src/tabletop/views.js');let count=0;
 for(const definition of cards.filter(c=>c.candidate)){
  const g=fixture({battlefield:[definition.name]}),html=inspectorPopup({g,ui:{inspected:id(g,definition.name),askOnce:{}},registry,prefs:defaultPreferences()});
  for(const select of html.matchAll(/<select data-policy="[^"]*">([\s\S]*?)<\/select>/g)){
   assert.match(select[1],/<option selected>ASK<\/option>/,definition.name);count++;
  }
 }
 assert.ok(count>15,'audit must inspect the whole optional-card catalog');
});
test('Ask defaults: historical implicit Provisioner choices replay, but new live triggers still ask',async()=>{
 const {Engine}=await import('../src/core/index.js');
 const g=fixture({battlefield:['Tireless Provisioner'],graveyard:['Ancient Den']});
 g._legacyReplayDefaults=true;fire(g);assert.equal(g.state.pending,null);
 const old=g.exportSession();for(const entry of old.history)delete entry.choiceDefaults;
 const current=Engine.importSession(registry,old);assert.ok(current.verifyReplay().ok);
 current.act({type:'DEBUG_MOVE',id:id(current,'Ancient Den'),zone:'graveyard'});fire(current);
 assert.equal(current.state.pending.key,'tokenKind');choose(current,'Food');roundTrip(current);
});

test('Ask defaults: imported pre-update pending transaction retains its legacy prefix only',async()=>{
 const {Engine}=await import('../src/core/index.js');
 const g=fixture({battlefield:['Tireless Provisioner','Fateful Discovery','Quicksmith Genius'],graveyard:['Ancient Den']},{orderTriggers:true});
 g._legacyReplayDefaults=true;g.act({type:'DEBUG_MOVE',id:id(g,'Ancient Den'),zone:'battlefield'});
 const options=g.state.pending.options,first=options.find(o=>o.label.includes('Treasure'));choose(g,[first.value,...options.filter(o=>o!==first).map(o=>o.value)]);
 g.act({type:'RESOLVE_TOP'});assert.equal(g.state.pending.kind,'triggerOrder');
 const old=g.exportSession();for(const entry of old.history)delete entry.choiceDefaults;delete old.transaction.choiceDefaults;
 const current=Engine.importSession(registry,old);assert.equal(current.transaction.legacyIntentCount,1);
 const reloaded=Engine.importSession(registry,current.exportSession());drain(reloaded);roundTrip(reloaded);
});
