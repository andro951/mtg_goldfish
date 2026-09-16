import test from 'node:test';
import fs from 'node:fs';
import assert from 'node:assert/strict';
import {Engine,parseDeck} from '../src/core/index.js';
import {registry,cards,fixture,id,choose,roundTrip} from './helpers.js';
import {GODS_POOL} from '../src/rules/gods.js';
test('Gods pool: revised 146 names exactly match canonical supported registry and all sections',()=>{
 const {records,errors}=parseDeck(fs.readFileSync(new URL('../data/decks/esika-gods-pool.txt',import.meta.url),'utf8'));
 assert.deepEqual(errors,[]);assert.equal(records.length,146);assert.deepEqual(records.map(r=>r.name),GODS_POOL);
 assert.deepEqual(['main','command','outside'].map(p=>records.filter(r=>r.pool===p).length),[116,1,29]);
 assert.equal(records.find(r=>r.pool==='command').name,'Esika, God of the Tree');
 assert.equal(registry.report(records).supported.length,146);assert.equal(cards.filter(c=>c.candidate).length,454);
 for(const row of records){const d=registry.get(row.name);assert.equal(d.metadataStatus,'canonical',row.name);assert.equal(registry.module(d.id).status,'full',row.name);for(const key of ['image','backImage'])if(d[key])assert.ok(fs.existsSync(new URL('../'+d[key],import.meta.url)),row.name);}
 const g=Engine.create(registry,records,'revised-esika',{openingHand:0});assert.equal(g.state.zones.libraryActive.length,99);assert.equal(g.state.zones.libraryReserve.length,17);assert.equal(g.state.zones.command.length,1);assert.equal(g.state.zones.outside.length,29);
});
for(const selected of [[],['Leyline of Anticipation'],['Leyline of Anticipation','Leyline of the Guildpact']])test('Gods opening: optional Leylines preserve kept hand and can be imported mid-choice '+selected.length,()=>{
 const base=fixture({hand:['Leyline of Anticipation','Leyline of the Guildpact','Ancient Den']});base.state.started=false;base.state.step='setup';
 const g=new Engine(registry,base.state);g.act({type:'KEEP_HAND'});assert.equal(g.state.pending.kind,'godsOpening');assert.equal(g.state.pending.min,0);roundTrip(g);
 choose(g,selected.map(n=>id(g,n)));assert.equal(g.state.started,true);for(const n of selected)assert.ok(id(g,n,'battlefield'));assert.ok(id(g,'Ancient Den','hand'));roundTrip(g);
});
