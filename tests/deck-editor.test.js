import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createRegistry } from '../src/rules/index.js';
import { deckCounts, deckRecords, editDeck, supportedCards } from '../src/tabletop/deck-editor.js';

const cards=JSON.parse(fs.readFileSync(new URL('../data/cards.json',import.meta.url),'utf8'));
const registry=createRegistry(cards);
const supplied=fs.readFileSync(new URL('../data/candidate-pool.txt',import.meta.url),'utf8');

test('visual deck model preserves supplied quantities and sections',()=>{
  const counts=deckCounts(supplied,registry);
  assert.equal(counts.main,119);assert.equal(counts.lands,34);assert.equal(counts.nonlands,85);assert.equal(counts.reserve,20);
  assert.equal(counts.command,1);assert.equal(counts.outside,41);
  assert.equal(counts.membership['scroll rack'].main,2);
});

test('database search is candidate-only and filters text, type, color and sort',()=>{
  assert.equal(supportedCards(registry).length,445);
  assert.deepEqual(supportedCards(registry,{query:'mox opal'}).map(c=>c.name),['Mox Opal']);
  assert(supportedCards(registry,{type:'Land'}).every(c=>c.types.includes('Land')));
  assert(supportedCards(registry,{color:'U'}).every(c=>c.colorIdentity.includes('U')));
  assert(supportedCards(registry,{color:'C'}).every(c=>c.colorIdentity.length===0));
  assert(supportedCards(registry,{color:'M'}).every(c=>c.colorIdentity.length>1));
  const byMv=supportedCards(registry,{sort:'mv'});assert(byMv.every((c,i)=>!i||byMv[i-1].manaValue<=c.manaValue));
});

test('adding, setting and removing quantities round-trips through deck text',()=>{
  let text=editDeck(supplied,{type:'adjust',pool:'outside',name:'Mox Opal',delta:1});
  assert.equal(deckCounts(text,registry).membership['mox opal'].outside,1);
  text=editDeck(text,{type:'set',pool:'outside',name:'Mox Opal',quantity:3});
  assert.equal(deckCounts(text,registry).membership['mox opal'].outside,3);
  text=editDeck(text,{type:'adjust',pool:'outside',name:'Mox Opal',delta:-1});
  assert.equal(deckCounts(text,registry).membership['mox opal'].outside,2);
  text=editDeck(text,{type:'remove',pool:'outside',name:'Mox Opal'});
  assert.equal(deckCounts(text,registry).membership['mox opal'].outside,0);
});

test('moving a deck entry transfers all copies without duplicating them',()=>{
  let text=editDeck(supplied,{type:'move',from:'main',to:'outside',name:'Scroll Rack'}),counts=deckCounts(text,registry);
  assert.equal(counts.membership['scroll rack'].main,0);assert.equal(counts.membership['scroll rack'].outside,2);
  text=editDeck(text,{type:'move',from:'outside',to:'main',name:'Scroll Rack'});counts=deckCounts(text,registry);
  assert.equal(counts.membership['scroll rack'].main,2);assert.equal(counts.membership['scroll rack'].outside,0);
});

test('reordering keeps quantities and only changes source order',()=>{
  const before=deckRecords(supplied).records.filter(r=>r.pool==='main'),target=before[4].name;
  const text=editDeck(supplied,{type:'reorder',pool:'main',name:target,before:before[0].name});
  const after=deckRecords(text).records.filter(r=>r.pool==='main');
  assert.equal(after[0].name,target);assert.equal(after.reduce((n,r)=>n+r.quantity,0),119);
});

test('unsupported pasted names remain visible in the model so the editor can remove them',()=>{
  const text='1 Future Unsupported Card\n// Commander\n1 The Wandering Minstrel\n// Outside the Game\n';
  const counts=deckCounts(text,registry);assert.equal(counts.unsupported,1);assert.equal(counts.records[0].name,'Future Unsupported Card');
  const cleaned=editDeck(text,{type:'remove',pool:'main',name:'Future Unsupported Card'});assert.equal(deckCounts(cleaned,registry).unsupported,0);
});
