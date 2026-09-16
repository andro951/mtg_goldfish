import fs from 'node:fs';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
import assert from 'node:assert/strict';
import {createRegistry} from '../src/rules/index.js';
import {Engine,parseDeck} from '../src/core/index.js';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const read=p=>fs.readFileSync(path.join(root,p),'utf8');
const cards=JSON.parse(read('data/cards.json')),registry=createRegistry(cards),names=new Set(),reports=[];
for(const [name,file] of [['List 1','expanded-pool.txt'],['List 2','refined-pool.txt'],['13 September request','2026-09-13-pool.txt'],['Revised Esika Gods pool','esika-gods-pool.txt']]){
 const {records,errors}=parseDeck(read('data/decks/'+file));assert.equal(errors.length,0);
 const report=registry.report(records);assert.equal(report.accepted,true,JSON.stringify(report.missing.concat(report.partial)));
 records.forEach(r=>names.add(r.name));const g=Engine.create(registry,records,'support-verification',{openingHand:0});
 const copies=pool=>records.filter(r=>r.pool===pool).reduce((s,r)=>s+r.quantity,0);
 reports.push({name,file,uniqueNames:new Set(records.map(r=>r.name)).size,copies:records.reduce((s,r)=>s+r.quantity,0),mainCopies:copies('main'),commanderCopies:copies('command'),outsideCopies:copies('outside'),fixedLands:g.state.initialDeck.fixedLands,activeLibrary:g.state.zones.libraryActive.length,reserve:g.state.zones.libraryReserve.length,duplicates:report.duplicates,missing:[],partial:[]});
}
assert.equal(names.size,454);assert.equal(cards.filter(c=>c.candidate).length,454);
for(const n of names){const c=registry.get(n);assert.equal(c.candidate,true);assert.equal(registry.module(c.id).status,'full');assert.ok(fs.existsSync(path.join(root,c.image)));}
const tap=read('test-results/engine.tap');const newCards=read('data/expanded-card-names.txt').trim().split('\n');
for(const n of newCards){assert.ok(tap.includes('# Subtest: expanded rules: '+n+' |'),'Missing focused test: '+n);assert.ok(tap.includes('card acceptance: '+registry.get(n).name+' — metadata and legal entry'));}
assert.ok(!/^not ok /m.test(tap));
for(const n of ['Academy Ruins','Planar Bridge','Mycosynth Golem','Cauldron of Souls','Chocobo Racetrack','Doors of Durin','Cosmic Cube']){assert.ok(tap.includes('# Subtest: latest rules: '+n+' |'),'Missing requested-card rules regression: '+n);assert.ok(tap.includes('card acceptance: '+n+' — metadata and legal entry'));}
const latest=parseDeck(read('data/decks/2026-09-13-pool.txt')).records,latestReport=registry.report(latest);
assert.equal(latest.length,177);assert.equal(latestReport.supported.length,177);
const audit=latest.map(row=>{const c=registry.get(row.name);return {name:row.name,pool:row.pool,rulesStatus:registry.module(c.id).status,metadataStatus:c.metadataStatus,localImage:c.image};});
fs.writeFileSync(path.join(root,'test-results/requested-card-audit.json'),JSON.stringify(audit,null,2)+'\n');
const esika=parseDeck(read('data/decks/esika-gods-pool.txt')).records,esikaReport=registry.report(esika);
assert.equal(esika.length,146);assert.equal(esikaReport.supported.length,146);
const esikaAudit=esika.map(row=>{
 const c=registry.get(row.name),prefix='gods rules: '+row.name+' |';
 const focused=tap.split('\n').filter(line=>/^ok \d+ - /.test(line)&&line.includes(prefix)).map(line=>line.slice(line.indexOf(prefix)+prefix.length).trim());
 assert.ok(focused.length,'Missing passing focused test: '+row.name);assert.equal(c.metadataStatus,'canonical');
 assert.ok(tap.split('\n').some(line=>/^ok \d+ - /.test(line)&&line.endsWith('card acceptance: '+c.name+' — metadata and legal entry')),'Missing passing legal-entry test: '+row.name);
 return {name:row.name,pool:row.pool,quantity:row.quantity,rulesStatus:registry.module(c.id).status,metadataStatus:c.metadataStatus,localImage:c.image,focusedTestsPassed:focused.length,focusedTests:focused};
});
fs.writeFileSync(path.join(root,'test-results/esika-card-audit.json'),JSON.stringify(esikaAudit,null,2)+'\n');
const out={version:JSON.parse(read('package.json')).version,esikaRequestNames:esika.length,esikaRequestSupported:esikaReport.supported.length,newEsikaNames:137,latestRequestNames:latest.length,latestRequestSupported:latestReport.supported.length,supportedNames:454,newlySupportedNames:newCards.length,allRequestedNamesSupported:true,allNewNamesHaveFocusedTests:true,localDefinitions:cards.length,localImages:Object.keys(JSON.parse(read('data/assets-manifest.json'))).length,lists:reports};
fs.writeFileSync(path.join(root,'test-results/card-support.json'),JSON.stringify(out,null,2)+'\n');console.log(JSON.stringify(out,null,2));
