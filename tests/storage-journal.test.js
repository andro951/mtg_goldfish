import test from 'node:test';
import assert from 'node:assert/strict';
import {SessionStore} from '../src/ui/storage.js';
import {fixture,id,registry} from './helpers.js';
import {Engine} from '../src/core/index.js';
class LocalStorage {
 constructor(){this.data=new Map();this.failAfter=Infinity;this.writes=0;}
 getItem(k){return this.data.get(k)??null;}
 setItem(k,v){if(this.writes++>=this.failAfter)throw new Error('QuotaExceededError');this.data.set(k,String(v));}
 removeItem(k){this.data.delete(k);}
}
const prepare=()=>{globalThis.localStorage=new LocalStorage();const store=new SessionStore();store.mode='localstorage';return {store,g:fixture({battlefield:['Mana Vault'],libraryActive:[]})};};
const save=(store,g)=>store.save(g.exportSession({copyHistory:false}));
const move=(g,zone)=>g.act({type:'DEBUG_MOVE',id:id(g,'Mana Vault'),zone});
const heads=()=>JSON.parse(localStorage.getItem('astra-journal-heads-v1'));
function assertJournal(){const live=new Set();for(const head of Object.values(heads()||{}))if(head?.storageFormat)for(const k of [head.initialKey,head.bodyKey,...head.historyKeys]){live.add('astra-journal-'+k);assert.notEqual(localStorage.getItem('astra-journal-'+k),null);}for(const k of localStorage.data.keys())if(k.startsWith('astra-journal-')&&k!=='astra-journal-heads-v1')assert.ok(live.has(k),'orphan: '+k);}

test('journal: append-only saves write each committed history chunk once',async()=>{
 const {store,g}=prepare();await save(store,g);const initial=store.stats.chunksWritten;
 for(let i=0;i<30;i++){move(g,i%2?'battlefield':'graveyard');await save(store,g);assertJournal();}
 assert.equal(store.stats.historyChunksWritten,30);assert.equal(store.stats.chunksWritten,initial+60);
 const saved=await store.get();assert.deepEqual(saved.session,g.exportSession());assert.equal(Engine.importSession(registry,saved.session).verifyReplay().ok,true);
});
test('journal: duplicate save and reading previous never erase the previous distinct snapshot',async()=>{
 const {store,g}=prepare();await save(store,g);move(g,'graveyard');await save(store,g);
 const before=JSON.stringify(heads());await store.get('previous');await save(store,g);await save(store,g);
 assert.equal(JSON.stringify(heads()),before);assert.equal(store.stats.duplicateSkips,2);
 assert.equal((await store.get('previous')).session.cursor,0);assertJournal();
});
test('journal: undo, redo and branching share records and collect only truly unused chunks',async()=>{
 const {store,g}=prepare();move(g,'graveyard');move(g,'battlefield');await save(store,g);
 g.act({type:'UNDO'});await save(store,g);assert.equal((await store.get()).session.cursor,1);assert.equal(store.stats.historyChunksWritten,2);
 g.act({type:'REDO'});await save(store,g);assert.equal(store.stats.historyChunksWritten,2);
 g.act({type:'UNDO'});g.act({type:'DEBUG_MOVE',id:id(g,'Mana Vault'),zone:'hand'});await save(store,g);assert.equal(store.stats.historyChunksWritten,3);
 assert.equal(Engine.importSession(registry,(await store.get('previous')).session).verifyReplay().ok,true);
 move(g,'graveyard');await save(store,g);assertJournal();
});
test('journal: layout-only saves and adopted reloads do not rewrite historical records',async()=>{
 const {store,g}=prepare();move(g,'graveyard');await save(store,g);
 const reloaded=new SessionStore();reloaded.mode='localstorage';const doc=(await reloaded.get()).session,loaded=Engine.importSession(registry,doc);reloaded.adopt(loaded,doc);
 await reloaded.save({...loaded.exportSession({copyHistory:false}),uiLayout:{x:1}});
 assert.equal(reloaded.stats.historyChunksWritten,0);assert.equal(reloaded.stats.chunksWritten,1);
 assert.deepEqual((await reloaded.get()).session.uiLayout,{x:1});assertJournal();
});
test('journal: quota failure keeps both recovery points and allows a later retry',async()=>{
 const {store,g}=prepare();await save(store,g);move(g,'graveyard');await save(store,g);
 const before=JSON.stringify(heads());move(g,'battlefield');localStorage.failAfter=localStorage.writes+1;
 await assert.rejects(save(store,g),/Quota/);assert.equal(JSON.stringify(heads()),before);assertJournal();
 localStorage.failAfter=Infinity;await save(store,g);assert.equal((await store.get()).session.cursor,2);assertJournal();
});
test('journal: interrupted metadata publication leaves the old current and previous intact',async()=>{
 const {store,g}=prepare();await save(store,g);move(g,'graveyard');await save(store,g);const before=JSON.stringify(heads());
 move(g,'battlefield');localStorage.failAfter=localStorage.writes+2;
 await assert.rejects(save(store,g),/Quota/);assert.equal(JSON.stringify(heads()),before);assertJournal();
});
test('journal: legacy envelopes migrate and remain recoverable until legitimately rotated out',async()=>{
 const {store,g}=prepare(),old={savedAt:'2026-09-13T10:00:00Z',session:g.exportSession()};
 localStorage.setItem('astra-session-current',JSON.stringify(old));assert.deepEqual(await store.get(),old);
 move(g,'graveyard');await save(store,g);assert.deepEqual(await store.get('previous'),old);
 move(g,'battlefield');await save(store,g);assert.equal(localStorage.getItem('astra-session-current'),null);assertJournal();
 assert.equal((await store.get('previous')).session.cursor,1);
});
test('journal: independent tabs repair garbage-collected keys rather than publishing missing references',async()=>{
 const {store:a,g}=prepare();await save(a,g);const b=new SessionStore();b.mode='localstorage';const doc=(await b.get()).session,other=Engine.importSession(registry,doc);b.adopt(other,doc);
 move(g,'graveyard');await save(a,g);move(g,'battlefield');await save(a,g);
 // The original body no longer has a live head, but B remembers its old key.
 await save(b,other);assert.equal((await b.get()).session.cursor,0);assertJournal();
 assert.equal(Engine.importSession(registry,(await a.get('previous')).session).verifyReplay().ok,true);
});
test('journal: completely unavailable persistence fails explicitly, never pretends to autosave',async()=>{
 const store=new SessionStore();await assert.rejects(store.save({}),/storage is unavailable/);assert.equal(await store.get(),null);
});

test('journal: an older tab blocking migration is reported instead of silently starting a second save store',async()=>{
 const original=globalThis.indexedDB;globalThis.localStorage=new LocalStorage();
 globalThis.indexedDB={open(){const request={};queueMicrotask(()=>request.onblocked());return request;}};
 try{const store=await new SessionStore().open();assert.equal(store.mode,'memory');assert.match(store.problem,/Close older Astra tabs/);assert.equal(localStorage.data.size,0);}
 finally{if(original===undefined)delete globalThis.indexedDB;else globalThis.indexedDB=original;}
});
