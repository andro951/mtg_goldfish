/** Incremental, transactional browser persistence.
 * Head records reference immutable JSON chunks. Saving a new action never reads,
 * clones, compares, or rewrites the entire previous history. Current + previous
 * are advanced atomically; shared chunks survive undo/redo and branch changes.
 */
const FORMAT='astra-journal-v1', LOCAL_HEADS='astra-journal-heads-v1', PREFIX='astra-journal-';
const refs=head=>head?.storageFormat===FORMAT?[head.initialKey,head.bodyKey,...head.historyKeys]:[];
const sameHead=(a,b)=>a?.storageFormat===FORMAT&&a.initialKey===b.initialKey&&a.bodyKey===b.bodyKey&&
  a.historyKeys.length===b.historyKeys.length&&a.historyKeys.every((key,i)=>key===b.historyKeys[i]);
export class SessionStore {
  constructor() {
    this.database=null;this.mode='memory';this.chain=Promise.resolve();
    this.keys=new WeakMap();this.known=new Set();this.serial=0;
    this.prefix=Array.from(globalThis.crypto.getRandomValues(new Uint32Array(4)),n=>n.toString(16)).join('-');
    this.bodyText=null;this.bodyKey=null;this.stats={writes:0,chunksWritten:0,historyChunksWritten:0,duplicateSkips:0};
  }
  nextKey(){return this.prefix+'/'+(++this.serial);}
  async open() {
    try {
      this.database=await new Promise((resolve,reject)=>{
        const request=indexedDB.open('astra-goldfish-v1',2);let blocked=false;
        request.onupgradeneeded=()=>{for(const name of ['sessions','journal'])if(!request.result.objectStoreNames.contains(name))request.result.createObjectStore(name);};
        request.onsuccess=()=>{if(blocked){request.result.close();return;}resolve(request.result);};
        request.onerror=()=>reject(request.error);
        request.onblocked=()=>{blocked=true;reject(new Error('Close another old Astra tab to enable autosave.'));};
      });
      this.database.onversionchange=()=>{this.database.close();this.mode='memory';};
      this.mode='indexeddb';
    } catch {
      try{localStorage.setItem('astra-storage-test','1');localStorage.removeItem('astra-storage-test');this.mode='localstorage';}catch{this.mode='memory';}
    }
    return this;
  }
  /** Rebind a validated imported document's immutable records after Engine
   * defensively clones it. Unknown/untrusted documents have no stored keys. */
  adopt(engine,document){
    const bind=(copy,original)=>{const key=original&&this.keys.get(original);if(key&&copy)this.keys.set(copy,key);};
    bind(engine.initialState,document.initialState);
    engine.history.forEach((entry,i)=>{if(!engine._rewrittenHistory?.has(entry))bind(entry,document.history?.[i]);});
  }
  async get(key='current') {
    if(this.mode==='memory')return null;
    if(this.mode==='localstorage'){
      const heads=JSON.parse(localStorage.getItem(LOCAL_HEADS)||'null'),head=heads?.[key];
      if(heads&&!head)return null;
      if(!head||head.legacy){const text=localStorage.getItem('astra-session-'+(head?.legacy||key));return text?JSON.parse(text):null;}
      const values=[];
      for(const [i,k] of refs(head).entries()){
        const text=localStorage.getItem(PREFIX+k);if(text===null)throw new Error('Autosave chunk is missing. Try the previous autosave.');
        values.push(JSON.parse(text));if(i%16===15)await new Promise(r=>setTimeout(r,0));
      }
      return this.assemble(head,values,key==='current');
    }
    return new Promise((resolve,reject)=>{
      const tx=this.database.transaction(['sessions','journal']),request=tx.objectStore('sessions').get(key);let result=null,failure=null;
      tx.oncomplete=()=>failure?reject(failure):resolve(result);
      tx.onerror=()=>reject(tx.error);tx.onabort=()=>reject(failure||tx.error||new Error('Reading autosave was interrupted.'));
      request.onsuccess=()=>{
        const head=request.result;if(!head||head.storageFormat!==FORMAT){result=head||null;return;}
        const keys=refs(head),values=new Array(keys.length);let remaining=keys.length;
        for(const [i,k] of keys.entries()){
          const chunk=tx.objectStore('journal').get(k);
          chunk.onsuccess=()=>{try{
            if(typeof chunk.result!=='string')throw new Error('Autosave chunk is missing. Try the previous autosave.');
            values[i]=JSON.parse(chunk.result);if(!--remaining)result=this.assemble(head,values,key==='current');
          }catch(error){failure=error;tx.abort();}};
        }
      };
    });
  }
  assemble(head,values,rememberBody=true){
    const [initialState,body,...history]=values,session={...body,initialState,history};
    this.keys.set(initialState,head.initialKey);history.forEach((entry,i)=>this.keys.set(entry,head.historyKeys[i]));
    refs(head).forEach(k=>this.known.add(k));
    if(rememberBody&&head.bodyKey){this.bodyKey=head.bodyKey;this.bodyText=JSON.stringify(body);}
    return {savedAt:head.savedAt,session};
  }
  save(session){
    this.chain=this.chain.catch(()=>{}).then(()=>this.write(session));return this.chain;
  }
  prepare(session){
    const records=[];
    const immutable=(value,kind)=>{
      let key=this.keys.get(value);if(!key){key=this.nextKey();this.keys.set(value,key);}
      records.push({key,value,kind});return key;
    };
    const {initialState,history,...body}=session;
    const initialKey=immutable(initialState,'initial'),historyKeys=history.map(entry=>immutable(entry,'history'));
    const text=JSON.stringify(body);
    if(text!==this.bodyText){this.bodyKey=this.nextKey();this.bodyText=text;}
    records.push({key:this.bodyKey,text,kind:'body'});
    return {head:{storageFormat:FORMAT,savedAt:new Date().toISOString(),initialKey,historyKeys,bodyKey:this.bodyKey},records};
  }
  async write(session){
    if(this.mode==='memory')throw new Error('Browser storage is unavailable. Export your session to preserve it.');
    const plan=this.prepare(session);
    if(this.mode==='localstorage')return this.writeLocal(plan);
    return new Promise((resolve,reject)=>{
      const tx=this.database.transaction(['sessions','journal'],'readwrite'),heads=tx.objectStore('sessions'),chunks=tx.objectStore('journal');
      const current=heads.get('current'),previous=heads.get('previous');let removed=[],failure=null,duplicate=false;
      previous.onsuccess=()=>{
        try{
          if(sameHead(current.result,plan.head)){duplicate=true;plan.head.savedAt=current.result.savedAt;return;}
          // One chunk per IDB success task: large migrations yield to input
          // between records while keeping the whole transaction atomic.
          const live=new Set([...refs(current.result),...refs(previous.result)]);
          plan.records=plan.records.filter(r=>!live.has(r.key));
          let index=0;
          const next=()=>{try{
            if(index<plan.records.length){const r=plan.records[index++];const put=chunks.put(r.text??JSON.stringify(r.value),r.key);put.onsuccess=next;return;}
            const keep=new Set([...refs(current.result),...refs(plan.head)]);
            removed=refs(previous.result).filter(k=>!keep.has(k));for(const key of removed)chunks.delete(key);
            if(current.result)heads.put(current.result,'previous');heads.put(plan.head,'current');
          }catch(error){failure=error;tx.abort();}};
          next();
        }catch(error){failure=error;tx.abort();}
      };
      tx.oncomplete=()=>{
        if(duplicate)this.stats.duplicateSkips++;
        else this.committed(plan,removed);
        resolve(plan.head.savedAt);
      };
      tx.onerror=()=>reject(failure||tx.error);tx.onabort=()=>reject(failure||tx.error||new Error('Autosave transaction was interrupted.'));
    });
  }
  committed(plan,removed){
    for(const key of removed)this.known.delete(key);for(const r of plan.records)this.known.add(r.key);
    this.stats.writes++;this.stats.chunksWritten+=plan.records.length;this.stats.historyChunksWritten+=plan.records.filter(r=>r.kind==='history').length;
  }
  async writeLocal(plan){
    const heads=JSON.parse(localStorage.getItem(LOCAL_HEADS)||'null');
    if(sameHead(heads?.current,plan.head)){this.stats.duplicateSkips++;return heads.current.savedAt;}
    const current=heads?.current||(localStorage.getItem('astra-session-current')?{legacy:'current'}:null);
    const live=new Set([...refs(current),...refs(heads?.previous)]);
    plan.records=plan.records.filter(r=>!live.has(r.key));
    const added=[];
    try{
      for(const [i,r] of plan.records.entries()){
        localStorage.setItem(PREFIX+r.key,r.text??JSON.stringify(r.value));added.push(r.key);
        if(i%8===7)await new Promise(resolve=>setTimeout(resolve,0));
      }
      // Single atomic metadata write publishes both recovery points. A quota
      // failure before here leaves the last good current + previous untouched.
      localStorage.setItem(LOCAL_HEADS,JSON.stringify({current:plan.head,previous:current}));
    }catch(error){for(const key of added)try{localStorage.removeItem(PREFIX+key);}catch{}throw error;}
    const keep=new Set([...refs(current),...refs(plan.head)]),removed=refs(heads?.previous).filter(k=>!keep.has(k));
    for(const key of removed)try{localStorage.removeItem(PREFIX+key);}catch{}
    // Retire legacy envelopes only after neither published recovery point needs them.
    for(const name of ['current','previous'])if(current?.legacy!==name)try{localStorage.removeItem('astra-session-'+name);}catch{}
    this.committed(plan,removed);return plan.head.savedAt;
  }
}
