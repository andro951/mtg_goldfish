import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const read=p=>fs.readFileSync(path.join(root,p),'utf8');
const modules=new Map();
function bundle(id){
  if(modules.has(id))return;modules.set(id,'');
  let source=read(id),names=new Set();
  const resolve=relative=>{const dep=path.posix.normalize(path.posix.join(path.posix.dirname(id),relative));if(!dep.startsWith('src/'))throw new Error(`Invalid dependency ${relative}`);bundle(dep);return dep;};
  source=source.replace(/^export\s*\{([^}]+)\}\s*from\s*['"]([^'"]+)['"];?\s*$/gm,(_,bindings,dep)=>`Object.assign(exports,require(${JSON.stringify(resolve(dep))}));`);
  source=source.replace(/^import\s*\{([^}]+)\}\s*from\s*['"]([^'"]+)['"];?\s*$/gm,(_,bindings,dep)=>`const {${bindings.replace(/\bas\b/g,':')}}=require(${JSON.stringify(resolve(dep))});`);
  source=source.replace(/^export\s+(async\s+)?(function|class|const|let)\s+(\w+)/gm,(_,async,type,name)=>{names.add(name);return `${async||''}${type} ${name}`;});
  source=source.replace(/^export\s*\{([^}]+)\};?\s*$/gm,(_,bindings)=>{for(const name of bindings.split(',')){const n=name.trim();if(n)names.add(n);}return '';});
  if(/^\s*(?:import|export)\b/m.test(source))throw new Error(`Unrecognized module syntax in ${id}`);
  modules.set(id,`${source}\nObject.assign(exports,{${[...names].join(',')}});`);
}
bundle('src/ui/app.js');
const cards=JSON.parse(read('data/cards.json')),pool=JSON.parse(read('data/pool.json'));
for(const card of cards){if(!fs.existsSync(path.join(root,card.image)))throw new Error(`Missing image: ${card.name}`);if(card.backImage&&!fs.existsSync(path.join(root,card.backImage)))throw new Error(`Missing back image: ${card.name}`);}
const payload=JSON.stringify({cards,pool,deckText:read('data/candidate-pool.txt')}).replace(/</g,'\\u003c');
const runtime=`(()=>{'use strict';const factories={${[...modules].map(([id,s])=>`${JSON.stringify(id)}:(module,exports,require)=>{\n${s}\n}`).join(',\n')}};const cache={};function require(id){if(cache[id])return cache[id].exports;if(!factories[id])throw new Error('Missing module '+id);const module=cache[id]={exports:{}};factories[id](module,module.exports,require);return module.exports;}require('src/ui/app.js');})();`;
const html=`<!doctype html>\n<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="dark"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; img-src 'self' data: blob: file:; connect-src 'none'; base-uri 'none'; form-action 'none'"><meta name="description" content="An offline, rules-aware Magic goldfish laboratory for the supplied 160-card candidate pool."><title>Astra · The Goldfish Lab</title><link rel="icon" href="data:,"><style>${read('src/ui/styles.css')}</style></head><body><div id="app"><div class="starting">Opening your laboratory…</div></div><div id="overlay"></div><noscript>JavaScript is required. No network connection is needed.</noscript><script>window.ASTRA_DATA=${payload};</script><script>${runtime.replace(/<\/script/gi,'<\\/script')}</script></body></html>\n`;
fs.writeFileSync(path.join(root,'index.html'),html);
fs.mkdirSync(path.join(root,'test-results'),{recursive:true});
const report={build:'standalone-offline',modules:modules.size,candidateCards:cards.filter(c=>c.candidate).length,definitions:cards.length,htmlBytes:Buffer.byteLength(html),sha256:createHash('sha256').update(html).digest('hex'),runtimeDependencies:[],networkRequired:false};
fs.writeFileSync(path.join(root,'test-results/build.json'),JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify(report,null,2));
