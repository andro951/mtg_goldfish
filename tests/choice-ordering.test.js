import test from 'node:test';
import assert from 'node:assert/strict';
import { fixture, id, choose, drain, roundTrip } from './helpers.js';

test('Scene of the Crime asks for the additional tap cost before the produced mana color',()=>{
  const g=fixture({battlefield:['Scene of the Crime','Walking Atlas']});
  g.act({type:'ACTIVATE_ABILITY',id:id(g,'Scene of the Crime'),abilityId:'filter'});
  assert.equal(g.state.pending.kind,'draft');
  assert.equal(g.state.pending.key,'tapped');
  assert.equal(g.state.pending.cost,true);
  assert.deepEqual(g.state.pending.candidates,[id(g,'Walking Atlas')]);
  choose(g,[id(g,'Walking Atlas')]);
  assert.equal(g.state.pending.key,'color');
  assert.equal(g.object(id(g,'Scene of the Crime')).tapped,false);
  assert.equal(g.object(id(g,'Walking Atlas')).tapped,false);
  choose(g,'G');
  assert.equal(g.object(id(g,'Scene of the Crime')).tapped,true);
  assert.equal(g.object(id(g,'Walking Atlas')).tapped,true);
  assert.equal(g.state.players[0].mana.G,1);
  roundTrip(g);
});

test('Radiant Lotus announces its target, then sacrifice cost, then effect color',()=>{
  const g=fixture({battlefield:['Radiant Lotus','Ancient Den','Mox Amber']});
  g.act({type:'ACTIVATE_ABILITY',id:id(g,'Radiant Lotus'),abilityId:'lotus'});
  assert.equal(g.state.pending.key,'player');
  choose(g,0);
  assert.equal(g.state.pending.key,'sacrificed');
  assert.equal(g.state.pending.cost,true);
  choose(g,[id(g,'Ancient Den')]);
  assert.equal(g.state.pending.key,'color');
  choose(g,'U');
  assert.equal(g.object(id(g,'Radiant Lotus')).tapped,true);
  assert.equal(g.object(id(g,'Ancient Den')).zone,'graveyard');
  assert.equal(g.state.players[0].mana.U,0);
  assert.equal(g.state.stack.length,1);
  g.act({type:'RESOLVE_TOP'});
  assert.equal(g.state.players[0].mana.U,3);
  roundTrip(g);
});

test('Squandered Resources asks which land pays the cost before asking its mana type',()=>{
  const g=fixture({battlefield:['Squandered Resources','Razortide Bridge']});
  g.act({type:'ACTIVATE_ABILITY',id:id(g,'Squandered Resources'),abilityId:'land-mana'});
  assert.equal(g.state.pending.key,'sacrificed');
  choose(g,[id(g,'Razortide Bridge')]);
  assert.equal(g.state.pending.key,'color');
  const colors=g.state.pending.options.map(o=>o.value);
  assert.deepEqual(colors,['W','U']);
  choose(g,'W');
  assert.equal(g.object(id(g,'Razortide Bridge')).zone,'graveyard');
  assert.equal(g.state.players[0].mana.W,1);
  roundTrip(g);
});

test('Raft-Steerer mode choice can be revised for one trigger before targets are locked',()=>{
  const g=fixture({battlefield:['Elven Raft-Steerer',{name:'Walking Atlas',tapped:true},{name:'Walking Atlas',owner:1,controller:1}],hand:['Ancient Den']});
  g.act({type:'PLAY_LAND',id:id(g,'Ancient Den','hand')});
  assert.equal(g.state.pending.key,'mode');
  choose(g,'tap');
  assert.equal(g.state.pending.key,'target');
  const opponent=Object.values(g.state.instances).find(o=>o.zone==='battlefield'&&g.definition(o).name==='Walking Atlas'&&o.controller===1).id;
  assert.deepEqual(g.state.pending.candidates,[opponent]);
  g.act({type:'REVISE_DRAFT_INPUT',key:'mode'});
  assert.equal(g.state.pending.key,'mode');
  choose(g,'untap');
  assert.equal(g.state.pending.key,'target');
  const own=g.state.pending.candidates.find(x=>g.object(x)?.controller===0);
  assert.ok(own);
  choose(g,[own]);
  drain(g);
  assert.equal(g.object(own).tapped,false);
  assert.ok(g.history.flatMap(h=>h.events).some(e=>e.type==='DRAFT_CHOICE_REVISED'));
  roundTrip(g);
});

test('Raft-Steerer omits an impossible tap mode when no opposing creature exists',()=>{
  const g=fixture({battlefield:['Elven Raft-Steerer','Walking Atlas'],hand:['Ancient Den']});
  g.act({type:'PLAY_LAND',id:id(g,'Ancient Den','hand')});
  assert.equal(g.state.pending.key,'mode');
  assert.deepEqual(g.state.pending.options.map(o=>o.value),['untap']);
});
