import test from 'node:test';
import assert from 'node:assert/strict';
import {parseManaCost,suggestPayment,validatePayment} from '../src/core/mana.js';
import {COLORS} from '../src/core/util.js';
const player=(mana={},restrictedMana=[])=>({life:40,mana:Object.fromEntries(COLORS.map(c=>[c,mana[c]||0])),restrictedMana});
function alloc(cost,mana,tags=[],context={}){const p=player(mana,tags),c=parseManaCost(cost),a=suggestPayment(c,p,context);if(a)validatePayment(c,p,context,a);return a;}
test('generic costs use the largest colored pool rather than WUBRG order',()=>{assert.deepEqual(alloc('{4}',{W:1,U:6,G:2}).normal,{W:0,U:4,B:0,R:0,G:0,C:0});});
test('actual colorless is used before plentiful colors for generic costs',()=>{const a=alloc('{4}',{C:2,W:100,U:3}).normal;assert.equal(a.C,2);assert.equal(a.W,2);});
test('colored requirements are reserved before ranking the remaining color pools',()=>{const a=alloc('{5}{U}{U}{G}',{U:6,G:5,R:3}).normal;assert.equal(a.U,6);assert.equal(a.G,2);assert.equal(a.R,0);});
test('a largest color is drained before the next largest without auto-tapping sources',()=>{const a=alloc('{9}',{W:2,U:5,G:7}).normal;assert.equal(a.G,7);assert.equal(a.U,2);assert.equal(a.W,0);});
test('restricted mana contributes only when legal for this payment',()=>{const tags=[{id:'tag',color:'R',amount:50,restriction:'artifactSpell'}];assert.equal(alloc('{3}',{U:5,G:2},tags,{kind:'spell',types:['Instant']}).normal.U,3);const a=alloc('{3}',{U:5},tags,{kind:'spell',types:['Artifact']});assert.deepEqual(a.tagged,[{id:'tag',amount:3}]);});
test('explicit colorless symbols cannot be paid with colored mana',()=>{assert.equal(alloc('{2}{C}',{U:10}),null);});
test('suggestions leave pool and restricted entries unchanged',()=>{const p=player({U:6,W:2},[{id:'tag',color:'C',amount:2,restriction:'artifactSpell'}]),before=structuredClone(p);suggestPayment(parseManaCost('{3}'),p,{kind:'spell',types:['Artifact']});assert.deepEqual(p,before);});
test('equal-sized pools have deterministic allocations',()=>{const a=alloc('{3}',{W:3,U:3,B:3});assert.equal(a.normal.W,3);});

test('spend-as-any never consumes the only colorless mana needed for an explicit C symbol',()=>{const a=alloc('{W}{C}',{U:1,C:1},[],{spendAsAny:true});assert.ok(a);assert.equal(a.normal.C,1);assert.equal(a.normal.U,1);});
