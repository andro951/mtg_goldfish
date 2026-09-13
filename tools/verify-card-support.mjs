import fs from 'node:fs';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
import assert from 'node:assert/strict';
import {createRegistry} from '../src/rules/index.js';
import {Engine,parseDeck} from '../src/core/index.js';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const read=p=>fs.readFileSync(path.join(root,p),'utf8');
const cards=JSON.parse(read('data/cards.json')),registry=createRegistry(cards),names=new Set(),reports=[];
for(const [name,file] of [['List 1','expanded-pool.txt'],['List 2','refined-pool.txt']]){
 const {records,errors}=parseDeck(read('data/decks/'+file));assert.equal(errors.length,0);
 const report=registry.report(records);assert.equal(report.accepted,true,JSON.stringify(report.missing.concat(report.partial)));
 records.forEach(r=>names.add(r.name));const g=Engine.create(registry,records,'support-verification',{openingHand:0});
 const copies=pool=>records.filter(r=>r.pool===pool).reduce((s,r)=>s+r.quantity,0);
 reports.push({name,file,uniqueNames:new Set(records.map(r=>r.name)).size,copies:records.reduce((s,r)=>s+r.quantity,0),mainCopies:copies('main'),commanderCopies:copies('command'),outsideCopies:copies('outside'),fixedLands:g.state.initialDeck.fixedLands,activeLibrary:g.state.zones.libraryActive.length,reserve:g.state.zones.libraryReserve.length,duplicates:report.duplicates,missing:[],partial:[]});
}
assert.equal(names.size,310);assert.equal(cards.filter(c=>c.candidate).length,310);
for(const n of names){const c=registry.get(n);assert.equal(c.candidate,true);assert.equal(registry.module(c.id).status,'full');assert.ok(fs.existsSync(path.join(root,c.image)));}
const tap=read('test-results/engine.tap');const newCards=read('data/expanded-card-names.txt').trim().split('\n');
for(const n of newCards){assert.ok(tap.includes('# Subtest: expanded rules: '+n+' |'),'Missing focused test: '+n);assert.ok(tap.includes('card acceptance: '+n+' — metadata and legal entry'));}
assert.ok(!/^not ok /m.test(tap));
const out={version:'1.4.0',supportedNames:310,newlySupportedNames:newCards.length,allRequestedNamesSupported:true,allNewNamesHaveFocusedTests:true,localDefinitions:cards.length,localImages:Object.keys(JSON.parse(read('data/assets-manifest.json'))).length,lists:reports};
fs.writeFileSync(path.join(root,'test-results/card-support.json'),JSON.stringify(out,null,2)+'\n');console.log(JSON.stringify(out,null,2));
