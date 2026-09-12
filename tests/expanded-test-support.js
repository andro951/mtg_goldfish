import assert from 'node:assert/strict';
import test from 'node:test';
import { Engine, stateHash, ref, clone } from '../src/core/index.js';
import { registry,fixture,id,ids,ability,cast,choose,drain,roundTrip } from './helpers.js';
export { assert, test, Engine, stateHash, ref, clone, registry, id, ids, ability, cast, choose, drain, roundTrip };
export const mana={W:50,U:50,B:50,R:50,G:50,C:100};
export function board(zones={},opts={}){
 const f=fixture(zones,opts);f.state.settings.debug=false;
 for(const o of f.objects('command'))o.commander=true;
 return new Engine(registry,f.state);
}
export const play=(g,name)=>g.act({type:'PLAY_LAND',id:id(g,name,'hand')});
export const resolve=g=>g.act({type:'RESOLVE_TOP'});
export const moveTurn=(g,step='main1')=>g.act({type:'ADVANCE_PHASE',player:0,step,nextTurn:true});
export const events=g=>g.history.slice(0,g.cursor).flatMap(e=>e.events).concat(g.transaction?.events||[]);
export const count=(g,name,zone='battlefield')=>ids(g,name,zone).length;
export const fresh=g=>new Engine(registry,g.state);
export function cardTest(name,description,body){test(`expanded rules: ${name} | ${description}`,body);}
export function settleWith(g,choices){drain(g,choices);assert.equal(g.state.pending,null);assert.equal(g.state.resolving,null);assert.equal(g.state.actionDraft,null);}
