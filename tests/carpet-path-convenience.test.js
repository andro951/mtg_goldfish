import test from 'node:test';
import assert from 'node:assert/strict';
import {fixture,id,registry,roundTrip} from './helpers.js';
import {ref} from '../src/core/index.js';
import {cardActions} from '../src/tabletop/card-actions.js';
import {dialogs} from '../src/tabletop/dialogs.js';
import {defaultPreferences} from '../src/tabletop/preferences.js';

const carpetAmount=(turns,rate=0.5,actual=0)=>{
 const g=fixture({battlefield:['Carpet of Flowers']});
 g.state.controllerTurns=[turns,0,0,0];
 g.state.settings.carpetIslandsPerTurn=rate;
 g.state.players[1].abstractIslands=actual;
 const source=g.object(id(g,'Carpet of Flowers'));
 const program=registry.handlers.get('gods.carpet')(g,{controller:0,source:ref(source),inputs:{player:1},vars:{carpetColor:'G'}});
 return program[0]?.amount??0;
};

test('Carpet of Flowers defaults to 0.5 cumulative Islands per player turn and floors the assumption',()=>{
 const g=fixture({battlefield:['Carpet of Flowers']});
 assert.equal(g.state.settings.carpetIslandsPerTurn,0.5);
 assert.deepEqual([2,3,4,5].map(turn=>carpetAmount(turn)),[0,1,1,2]);
 assert.deepEqual([2,3,4,5].map(turn=>carpetAmount(turn,0.5,2)),[2,3,3,4]);
});

test('Carpet of Flowers accepts fractional rates, persists them, and uses the cumulative total',()=>{
 const g=fixture({battlefield:['Carpet of Flowers']});
 g.act({type:'SET_SETTING',key:'carpetIslandsPerTurn',value:'0.75'});
 assert.equal(g.state.settings.carpetIslandsPerTurn,0.75);
 roundTrip(g);
 assert.deepEqual([2,3,4,5].map(turn=>carpetAmount(turn,0.75)),[0,1,2,3]);
 assert.equal(g.perform({type:'SET_SETTING',key:'carpetIslandsPerTurn',value:-0.1}).ok,false);
});

test('pre-setting sessions use the Carpet 0.5 default without mutating historical state',()=>{
 const g=fixture({battlefield:['Carpet of Flowers']});
 delete g.state.settings.carpetIslandsPerTurn;
 g.state.controllerTurns=[5,0,0,0];
 g.state.players[1].abstractIslands=1;
 const source=g.object(id(g,'Carpet of Flowers'));
 const program=registry.handlers.get('gods.carpet')(g,{controller:0,source:ref(source),inputs:{player:1},vars:{carpetColor:'U'}});
 assert.equal(program[0].amount,3);
 const html=dialogs({g,ui:{modal:'settings'},prefs:defaultPreferences(),registry,saveStatus:{text:'',error:false}});
 assert.match(html,/data-number-setting="carpetIslandsPerTurn"[^>]*value="0\.5"/);
});

test('Path of Ancestry is a direct mana click and opens its commander-color picker',()=>{
 const g=fixture({battlefield:['Path of Ancestry'],command:['The Wandering Minstrel']});
 const path=id(g,'Path of Ancestry'),access=cardActions(g,path);
 assert.equal(access.displayAbilities.length,1);
 assert.equal(access.showAbilities,false);
 assert.ok(access.quickMana);
 assert.equal(access.quickMana.id,'mana');
 g.act({type:'ACTIVATE_ABILITY',id:path,abilityId:access.quickMana.id});
 assert.equal(g.state.pending.key,'color');
 assert.deepEqual(g.state.pending.options.map(option=>option.value),['W','U','B','R','G']);
 assert.equal(g.object(path).tapped,false);
 g.act({type:'CHOOSE',value:'U'});
 assert.equal(g.object(path).tapped,true);
 assert.equal(g.state.players[0].mana.U,1);
 roundTrip(g);
});
