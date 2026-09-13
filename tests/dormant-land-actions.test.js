import test from 'node:test';
import assert from 'node:assert/strict';
import {fixture,id,roundTrip} from './helpers.js';
import {cardActions} from '../src/tabletop/card-actions.js';
import {inspectorPopup} from '../src/tabletop/views.js';
import {defaultPreferences} from '../src/tabletop/preferences.js';
for(const [name,ability] of [["Inventors' Fair",'tutor'],['Shifting Woodland','copy-graveyard']])test(`land click: ${name} retains its disabled conditional utility action`,()=>{
 const g=fixture({battlefield:[name,'Chromatic Lantern']});const o=g.object(id(g,name)),access=cardActions(g,o);
 assert.equal(access.quickMana,null);assert.equal(access.showAbilities,true);
 assert.equal(g.abilities(o).some(a=>a.id===ability),false);
 assert.ok(access.displayAbilities.find(a=>a.id===ability)?.unavailable);
 const html=inspectorPopup({g,ui:{inspected:o.id,askOnce:{}},registry:g.registry,prefs:defaultPreferences()});
 assert.ok(html.includes(`data-ability="${ability}" disabled`));
 assert.equal(g.perform({type:'ACTIVATE_ABILITY',id:o.id,abilityId:ability}).ok,false);roundTrip(g);
});
test('land click: an ungranted Saga chapter is not displayed as an existing utility action',()=>{
 const g=fixture({battlefield:[{name:"Urza's Saga",props:{flags:{sagaMana:true}}}]});
 assert.equal(cardActions(g,id(g,"Urza's Saga")).quickMana.id,'mana');
 assert.equal(cardActions(g,id(g,"Urza's Saga")).displayAbilities.some(a=>a.id==='construct'),false);
});
