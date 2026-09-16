import test from 'node:test';
import assert from 'node:assert/strict';
import {fixture,id,registry,roundTrip} from './helpers.js';
import {Engine} from '../src/core/index.js';
import {dialogs} from '../src/tabletop/dialogs.js';
import {defaultPreferences} from '../src/tabletop/preferences.js';

const orchardColors=g=>g.couldProduceColors(id(g,'Exotic Orchard'));

test('Exotic Orchard convenience setting defaults on and exposes all five colors',()=>{
 const g=fixture({battlefield:['Exotic Orchard',{name:'Tree of Tales',owner:1,controller:1}]});
 assert.equal(g.state.settings.exoticOrchardAllColors,true);
 assert.deepEqual(orchardColors(g),['W','U','B','R','G']);
 g.act({type:'ACTIVATE_ABILITY',id:id(g,'Exotic Orchard'),abilityId:'mana',inputs:{color:'B'}});
 assert.equal(g.state.players[0].mana.B,1);roundTrip(g);
});

test('Exotic Orchard convenience setting can be disabled and then uses actual modeled opponent lands',()=>{
 const g=fixture({battlefield:['Exotic Orchard',{name:'Tree of Tales',owner:1,controller:1}]});
 g.act({type:'SET_SETTING',key:'exoticOrchardAllColors',value:false});
 assert.deepEqual(orchardColors(g),['G']);
 roundTrip(g);
 const copy=Engine.importSession(registry,g.exportSession());
 assert.equal(copy.state.settings.exoticOrchardAllColors,false);
 assert.deepEqual(orchardColors(copy),['G']);
 copy.act({type:'SET_SETTING',key:'exoticOrchardAllColors',value:true});
 assert.deepEqual(orchardColors(copy),['W','U','B','R','G']);roundTrip(copy);
});

test('pre-setting sessions treat missing Exotic Orchard setting as enabled without mutating historical state',()=>{
 const g=fixture({battlefield:['Exotic Orchard']});delete g.state.settings.exoticOrchardAllColors;
 const legacy=new Engine(registry,g.state);
 assert.equal(Object.hasOwn(legacy.state.settings,'exoticOrchardAllColors'),false);
 assert.deepEqual(orchardColors(legacy),['W','U','B','R','G']);
 const html=dialogs({g:legacy,ui:{modal:'settings'},prefs:defaultPreferences(),registry,saveStatus:{text:'',error:false}});
 assert.match(html,/data-setting="exoticOrchardAllColors"[^>]*checked/);
});
