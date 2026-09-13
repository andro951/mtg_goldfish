import test from 'node:test';
import assert from 'node:assert/strict';
import {fixture,id,roundTrip,registry} from './helpers.js';
import {Engine} from '../src/core/index.js';
import {clone,diffState,applyPatches,stableJSON,hashText,stateHash,freezeDeep} from '../src/core/util.js';

function rng(){let n=123456789;return()=>((n=Math.imul(n,1664525)+1013904223>>>0)/2**32);}
const rand=rng();
function value(depth=0){
 const n=Math.floor(rand()*(depth>3?4:6));
 if(n===0)return null;if(n===1)return rand()<.5;if(n===2)return Math.round(rand()*200)-100;
 if(n===3)return ['','x\n\"\\','𝄞 🐙','é\u0000'][Math.floor(rand()*4)];
 if(n===4)return Array.from({length:Math.floor(rand()*7)},()=>value(depth+1));
 return Object.fromEntries(Array.from({length:Math.floor(rand()*6)},(_,i)=>['key'+i,value(depth+1)]));
}

test('performance: streaming hash remains byte-compatible with existing canonical hashes',()=>{
 for(let i=0;i<400;i++){const v=value();assert.equal(stateHash(v),hashText(stableJSON(v)));freezeDeep(v);assert.equal(stateHash(v),hashText(stableJSON(v)));}
 const shallow=Object.freeze({child:{n:1}}),before=stateHash(shallow);shallow.child.n=2;
 assert.notEqual(stateHash(shallow),before,'a shallow-frozen parent must not cache a mutable descendant');
 freezeDeep(shallow);assert.ok(Object.isFrozen(shallow.child));assert.equal(stateHash(shallow),hashText(stableJSON(shallow)));
});
test('performance: compact array patches round-trip randomized nested states',()=>{
 for(let i=0;i<400;i++){
  const a={rows:Array.from({length:Math.floor(rand()*10)},()=>value()),other:value()},b=clone(a);
  b.rows.splice(Math.floor(rand()*(b.rows.length+1)),Math.floor(rand()*8),...Array.from({length:Math.floor(rand()*5)},()=>value()));
  if(i%3===0)b.other=value();const patches=diffState(a,b);
  assert.deepEqual(applyPatches(clone(a),patches),b);assert.deepEqual(applyPatches(clone(b),patches,true),a);
  const exported=clone(patches);applyPatches(clone(a),patches);assert.deepEqual(patches,exported,'patches stay immutable across replay');
 }
});
test('performance: appending to 20,000 provenance records stores only the new record',()=>{
 const a={provenance:Array.from({length:20000},(_,i)=>({id:i,details:'historical data '.repeat(3)}))};
 const b={provenance:[...a.provenance,{id:20000,details:'new'}]},p=diffState(a,b);
 assert.equal(p.length,1);assert.equal(p[0].op,'splice');assert.equal(p[0].index,20000);assert.deepEqual(p[0].before,[]);
 assert.equal(p[0].after.length,1);assert.ok(JSON.stringify(p).length<300);
 assert.deepEqual(applyPatches(clone(a),p),b);assert.deepEqual(applyPatches(clone(b),p,true),a);
});
test('performance: legacy replacement patches and new splices can coexist in one history',()=>{
 const legacy={path:['rows'],before:[1,2],after:[2,1],hadBefore:true,hadAfter:true};
 const next=diffState({rows:[2,1]},{rows:[2,1,3]});
 assert.deepEqual(applyPatches({rows:[1,2]},[legacy,...next]),{rows:[2,1,3]});
 assert.deepEqual(applyPatches({rows:[2,1,3]},[legacy,...next],true),{rows:[1,2]});
});
test('performance: malformed splice indexes, lengths and unsafe paths are rejected',()=>{
 const good=diffState({rows:[1,2]},{rows:[1,3,2]})[0];
 for(const change of [{index:-1},{index:.5},{index:100},{beforeLength:9},{afterLength:9},{before:null},{after:{}},{op:'other'},{path:['__proto__','rows']},{path:['absent']}]){
  assert.throws(()=>applyPatches({rows:[1,2]},[{...good,...change}]));
 }
});
test('performance: immutable snapshots preserve order and isolate live state and append-only arrays',()=>{
 const g=fixture({battlefield:['Mana Vault'],libraryActive:[]}),card=id(g,'Mana Vault');
 g.act({type:'DEBUG_MOVE',id:card,zone:'graveyard'});const snapshot=g.snapshotState();
 assert.equal(JSON.stringify(snapshot),JSON.stringify(g.state));assert.notEqual(snapshot.provenance,g.state.provenance);
 assert.equal(snapshot.provenance[0],g.state.provenance[0]);assert.ok(Object.isFrozen(snapshot.provenance[0].lki));
 assert.notEqual(snapshot.instances,g.state.instances);assert.notEqual(snapshot.players,g.state.players);
 const before=JSON.stringify(snapshot);g.act({type:'DEBUG_MOVE',id:card,zone:'battlefield'});assert.equal(JSON.stringify(snapshot),before);
 const failed=JSON.stringify(g.exportSession());assert.equal(g.perform({type:'ACTIVATE_ABILITY',id:card,abilityId:'missing'}).ok,false);assert.equal(JSON.stringify(g.exportSession()),failed);
 roundTrip(g);
});
test('performance: autosave snapshot reuses committed history without sharing mutable state',()=>{
 const g=fixture({battlefield:['Mana Vault'],libraryActive:[]}),card=id(g,'Mana Vault');
 g.act({type:'DEBUG_MOVE',id:card,zone:'graveyard'});
 const doc=g.exportSession({copyHistory:false});assert.equal(doc.initialState,g.initialState);assert.notEqual(doc.history,g.history);
 assert.equal(doc.history[0],g.history[0]);assert.notEqual(doc.currentState,g.state);
 const before=JSON.stringify(doc);g.act({type:'DEBUG_MOVE',id:card,zone:'battlefield'});assert.equal(JSON.stringify(doc),before);
 const publicDoc=g.exportSession();publicDoc.history[0].label='external edit';assert.notEqual(g.history[0].label,'external edit');
 g.act({type:'UNDO'});assert.equal(g.manualActionCount(),1);g.act({type:'REDO'});assert.equal(g.manualActionCount(),2);
 roundTrip(g);
});
test('performance: long zone history stays linear and retains import, undo, redo and replay',()=>{
 const g=fixture({battlefield:['Mana Vault'],libraryActive:[]}),card=id(g,'Mana Vault');let half;
 for(let i=0;i<160;i++){g.act({type:'DEBUG_MOVE',id:card,zone:i%2?'battlefield':'graveyard'});if(i===79)half=JSON.stringify(g.history).length;}
 assert.ok(JSON.stringify(g.history).length<half*2.15,'history must not grow quadratically');
 assert.ok(JSON.stringify(g.exportSession()).length<4_000_000,'160 moves must not produce a 68 MB save');
 const full=stateHash(g.state);for(let i=0;i<20;i++)g.act({type:'UNDO'});
 const copy=Engine.importSession(registry,g.exportSession());for(let i=0;i<20;i++)copy.act({type:'REDO'});assert.equal(stateHash(copy.state),full);
 roundTrip(copy);
});

test('performance: importing old whole-array history compacts it without discarding actions or integrity',()=>{
 const g=fixture({battlefield:['Mana Vault'],libraryActive:[]}),card=id(g,'Mana Vault');
 for(let i=0;i<20;i++)g.act({type:'DEBUG_MOVE',id:card,zone:i%2?'battlefield':'graveyard'});
 const legacy=g.exportSession();let state=clone(legacy.initialState);
 for(const entry of legacy.history){
  entry.patches=entry.patches.map(patch=>{
   if(patch.op!=='splice'){state=applyPatches(state,[patch]);return patch;}
   const get=()=>patch.path.reduce((v,k)=>v[k],state);const before=clone(get());state=applyPatches(state,[patch]);
   return {path:patch.path,before,after:clone(get()),hadBefore:true,hadAfter:true};
  });
 }
 const migrated=Engine.importSession(registry,legacy);
 assert.equal(migrated.history.length,20);assert.equal(stateHash(migrated.state),legacy.stateChecksum);
 assert.ok(JSON.stringify(migrated.history).length<JSON.stringify(legacy.history).length/3);
 assert.ok(migrated._rewrittenHistory.has(migrated.history[0]));roundTrip(migrated);
});
