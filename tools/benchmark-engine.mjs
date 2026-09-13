/** Deterministic, same-machine long-session benchmark; no timing assertions. */
import {pathToFileURL} from 'node:url';
import path from 'node:path';
const root=path.resolve(process.argv[2]||'.');
const {fixture,id}=await import(pathToFileURL(path.join(root,'tests/helpers.js')));
const g=fixture({battlefield:['Mana Vault'],libraryActive:[]}),card=id(g,'Mana Vault'),times=[];
for(let i=0;i<160;i++){const start=performance.now();g.act({type:'DEBUG_MOVE',id:card,zone:i%2?'battlefield':'graveyard'});times.push(performance.now()-start);}
const start=performance.now(),doc=g.exportSession(),exportMs=performance.now()-start;
console.log(JSON.stringify({actions:160,meanActionMs:times.reduce((a,b)=>a+b)/times.length,maxActionMs:Math.max(...times),last20MeanMs:times.slice(-20).reduce((a,b)=>a+b)/20,exportMs,sessionBytes:Buffer.byteLength(JSON.stringify(doc)),stateBytes:Buffer.byteLength(JSON.stringify(doc.currentState))},null,2));
