import test from 'node:test';
import assert from 'node:assert/strict';
import {fixture,registry,id,ids,ability,cast,choose,drain,roundTrip} from './helpers.js';
import {Engine,ref} from '../src/core/index.js';
export {assert,fixture,registry,id,ids,ability,cast,choose,drain,roundTrip,Engine,ref};
export const ct=(name,description,fn)=>test('gods rules: '+name+' | '+description,fn);
export function game(zones={},options={}){
 const g=fixture(zones,options);
 if(options.life!=null)g.state.players[0].life=options.life;
 for(const [p,fields] of Object.entries(options.players||{}))Object.assign(g.state.players[p],fields);
 if(options.turns!=null){g.state.controllerTurns||=[1,0,0,0];g.state.controllerTurns[0]=options.turns;}
 if(options.lifeGained!=null)g.state.turnCounts['lifeGained:0']=options.lifeGained;
 return new Engine(registry,g.state);
}
export const resolve=g=>g.act({type:'RESOLVE_TOP'});
export const move=(g,name,zone='battlefield',from=null)=>g.act({type:'DEBUG_MOVE',id:id(g,name,from),zone});
export const play=(g,name)=>g.act({type:'PLAY_LAND',id:id(g,name,'hand')});
export const ready=(g,name)=>g.act({type:'DEBUG_TAP',id:id(g,name),tapped:false});
export const count=(g,name,zone='battlefield')=>ids(g,name,zone).length;
export const phase=(g,step,player=0)=>g.act({type:'ADVANCE_PHASE',step,player});
export const attack=(g,names,player=1)=>g.act({type:'DECLARE_ATTACKERS',attackers:names.map(n=>({id:id(g,n),player}))});
export const manaAll=(n=30)=>({W:n,U:n,B:n,R:n,G:n,C:n});
export const ch=(g,name)=>g.characteristics(id(g,name));
export function equipped(zones,equipment,host,options={}){
 const g=game(zones,options);g.object(id(g,equipment)).attachedTo=ref(g.object(id(g,host)));return new Engine(registry,g.state);
}
export function gainLife(g){
 if(!id(g,'Zuran Orb','battlefield'))g.act({type:'DEBUG_SPAWN',name:'Zuran Orb',zone:'battlefield'});
 g.act({type:'DEBUG_SPAWN',name:'Ancient Den',zone:'battlefield'});
 ability(g,'Zuran Orb','sac-land',{sacrificed:[id(g,'Ancient Den','battlefield')]});resolve(g);
}
export function combatDamage(g,choices={}){
 while((g.state.combatDamageStage||0)<2){g.act({type:'GOLDFISH_COMBAT_DAMAGE'});drain(g,choices);}
}
