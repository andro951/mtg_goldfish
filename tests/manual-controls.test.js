import test from 'node:test';
import assert from 'node:assert/strict';
import { Engine } from '../src/core/index.js';
import { registry, pool, roundTrip, fixture, id } from './helpers.js';
import { defaultPreferences, cleanPreferences } from '../src/tabletop/preferences.js';
import { sidebar } from '../src/tabletop/views.js';

test('new sessions and new browser preferences disable manual resource controls',()=>{
 const g=Engine.create(registry,pool,'manual-default');
 assert.equal(g.state.settings.manualControls,false);
 assert.equal(defaultPreferences().manualControls,false);
 assert.equal(cleanPreferences({}).manualControls,false);
});
test('manual resource override is explicit, persisted, logged and reversible',()=>{
 const g=fixture();g.act({type:'SET_SETTING',key:'manualControls',value:true});
 assert.equal(Engine.importSession(registry,g.exportSession()).state.settings.manualControls,true);
 assert.equal(cleanPreferences({manualControls:true}).manualControls,true);
 g.act({type:'SET_SETTING',key:'manualControls',value:false});roundTrip(g);
});
test('read-only rail keeps resource totals but contains no manual adjustment buttons',()=>{
 const g=fixture({battlefield:['Ancient Den']});
 let html=sidebar({g,ui:{},prefs:defaultPreferences()});
 assert.ok(!/data-action="(?:mana|resource|clear-mana)"/.test(html));
 assert.match(html,/Mana pool/);assert.match(html,/Life/);assert.match(html,/Energy/);assert.match(html,/Poison/);
 g.act({type:'SET_SETTING',key:'manualControls',value:true});html=sidebar({g,ui:{},prefs:defaultPreferences()});
 assert.match(html,/data-action="mana"/);assert.match(html,/data-action="resource"/);
});
test('automatic mana and energy production does not require manual controls',()=>{
 const g=fixture({battlefield:['Ancient Den','Aetherworks Marvel','Krark-Clan Ironworks']});
 g.act({type:'ACTIVATE_ABILITY',id:id(g,'Ancient Den'),abilityId:'mana'});
 assert.equal(g.state.players[0].mana.W,1);
 g.act({type:'ACTIVATE_ABILITY',id:id(g,'Krark-Clan Ironworks'),abilityId:'sacrifice',inputs:{sacrificed:[id(g,'Ancient Den')]}});
 g.act({type:'RESOLVE_TOP'});
 assert.equal(g.state.players[0].energy,1);assert.equal(g.state.settings.manualControls,false);roundTrip(g);
});
