from ui_acceptance_support import *


def ask_loyalty(p):
 fixture(p,'ask-loyalty');hold(p,True)
 for name in ['Tireless Provisioner','Manabond','Kodama of the East Tree']:
  inspect(p,name);p.locator('.policies summary').click()
  check(name+' optional selector defaults to ASK',p.locator('.policies select').evaluate_all('(els)=>els.length>0&&els.every(e=>e.value==="ASK")'))
 click(p,'close-inspector');cast(p,'Ancient Den');settle_count=0
 # Stop at the actual Provisioner choice, not a saved/forced preference.
 for _ in range(15):
  q=pending(p)
  if q and q.get('key')=='tokenKind':break
  if q and q['kind']=='optional':choose_option(p,'NO')
  elif q and q['kind']=='triggerOrder':click(p,'confirm-choice','[data-floating=decision]')
  elif state(p,'state.stack.length'):click(p,'resolve','.stack-window')
  else:raise AssertionError('Expected Provisioner choice')
 check('fresh Provisioner landfall stops for Treasure or Food without configuration',pending(p)['key']=='tokenKind' and obj(p,'Treasure') is None)
 choose_option(p,'Food');settle(p);check('ordinary Food selection does not save a permanent preference',not state(p,'state.optionalPreferences'))
 cast(p,'Tree of Tales')
 for _ in range(15):
  q=pending(p)
  if q and q.get('key')=='tokenKind':break
  if q and q['kind']=='optional':choose_option(p,'NO')
  elif q and q['kind']=='triggerOrder':click(p,'confirm-choice','[data-floating=decision]')
  else:click(p,'resolve','.stack-window')
 check('second Provisioner landfall asks again by default',pending(p)['key']=='tokenKind')
 p.locator('#remember-choice').check();choose_option(p,'Treasure');settle(p)
 key=p.evaluate("astra.registry.get('Tireless Provisioner').id+'/token-kind'")
 check('Remember choice is the only source of an automatic token preference',p.evaluate('(k)=>astra.engine.state.optionalPreferences[k]',key)=='Treasure')
 inspect(p,'Tireless Provisioner');p.locator('.policies summary').click();p.locator('[data-policy]').select_option('ASK');click(p,'close-inspector')
 check('resetting the token preference returns it to ASK',p.evaluate('(k)=>astra.engine.state.optionalPreferences[k]',key)=='ASK')
 # Loyalty is a live number over the printed bottom-right shield.
 walker=obj(p,'Tezzeret the Seeker');selector='[data-surface=battlefield] [data-position="'+walker['id']+'"]'
 check('planeswalker starts with a number-only loyalty overlay',p.locator(selector+' .loyalty-badge').inner_text()=='4')
 check('planeswalker no longer duplicates loyalty among top-left counters',p.locator(selector+' .card-marks').count()==0 or 'loyalty' not in p.locator(selector+' .card-marks').inner_text())
 activate(p,'Tezzeret the Seeker','untap');choose_cards(p,[])
 check('paying positive loyalty updates the badge before resolution',p.locator(selector+' .loyalty-badge').inner_text()=='5')
 p.keyboard.press('Backspace');check('undo restores the old displayed loyalty',p.locator(selector+' .loyalty-badge').inner_text()=='4')
 p.keyboard.press('Control+Shift+z');check('redo restores the new displayed loyalty',p.locator(selector+' .loyalty-badge').inner_text()=='5');settle(p)
 fixture(p,'loyalty-double')
 for walker in ['Tezzeret the Seeker','Tezzeret, Cruel Captain']:
  card_id=obj(p,walker)['id'];selector='[data-surface=battlefield] [data-position="'+card_id+'"]'
  geometry=p.locator(selector).evaluate('''e=>{const card=e.querySelector('.playing-card').getBoundingClientRect(),l=e.querySelector('.loyalty-badge').getBoundingClientRect();return {right:(l.right-card.left)/card.width,bottom:(l.bottom-card.top)/card.height,left:(l.left-card.left)/card.width,top:(l.top-card.top)/card.height,pointer:getComputedStyle(e.querySelector('.loyalty-badge')).pointerEvents};}''')
  check(walker+' loyalty sits over the bottom-right printed badge',geometry['left']>.65 and geometry['top']>.8 and geometry['right']<=1 and geometry['bottom']<=1,geometry)
  check(walker+' loyalty never intercepts card clicks',geometry['pointer']=='none')
 check('other counters remain visible above the card',p.locator('.card-marks').filter(has_text='2 charge').count()==1)
 both=obj(p,'Tezzeret, Cruel Captain');selector='[data-position="'+both['id']+'"]'
 check('animated planeswalker shows both loyalty and nonoverlapping creature P/T',p.locator(selector+' .power-badge').inner_text()=='3/4' and p.locator(selector+' .loyalty-badge').inner_text()=='8' and p.locator(selector+' .power-badge').bounding_box()['y']+p.locator(selector+' .power-badge').bounding_box()['height']<=p.locator(selector+' .loyalty-badge').bounding_box()['y'])
 shot(p,'30-loyalty-overlays.png')


def journal_persistence(p):
 if args.memory:
  skipped.append('Real IndexedDB journal transactions, migration and fault injection');return
 check('current browser uses the real IndexedDB journal',p.evaluate('astra.storage.mode')=='indexeddb')
 report=p.evaluate('''async()=>{
  const Store=astra.storage.constructor,store=new Store();
  store.database=await new Promise((resolve,reject)=>{const r=indexedDB.open('astra-journal-acceptance',2);r.onupgradeneeded=()=>{r.result.createObjectStore('sessions');r.result.createObjectStore('journal');};r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error);});store.mode='indexeddb';
  const db=store.database,initialState={seed:'journal-test'},history=[];
  const doc=n=>({initialState,history:history.slice(),currentState:{n},cursor:n,transaction:null});
  const rawHeads=()=>new Promise((resolve,reject)=>{const t=db.transaction('sessions'),s=t.objectStore('sessions'),a=s.get('current'),b=s.get('previous');t.oncomplete=()=>resolve({current:a.result,previous:b.result});t.onerror=()=>reject(t.error);});
  await store.save(doc(0));for(let i=1;i<=20;i++){history.push({index:i,events:[{type:'TEST'}],patches:[{n:i}]});await store.save(doc(i));}
  const result={historyWritten:store.stats.historyChunksWritten,chunksWritten:store.stats.chunksWritten,current:(await store.get()).session.cursor,previous:(await store.get('previous')).session.cursor};
  const before=JSON.stringify(await rawHeads());await store.save(doc(20));result.duplicatePreserved=before===JSON.stringify(await rawHeads());
  // Inject an abort after a chunk request was queued. Both heads and all chunks
  // must roll back together. Failure must not poison the next save attempt.
  const put=IDBObjectStore.prototype.put;let injected=false;
  IDBObjectStore.prototype.put=function(...args){const r=put.apply(this,args);if(this.name==='journal'&&!injected){injected=true;this.transaction.abort();}return r;};
  let rejected=false;history.push({index:21,events:[],patches:[]});try{await store.save(doc(21));}catch{rejected=true;}finally{IDBObjectStore.prototype.put=put;}
  result.abortRejected=rejected;result.abortPreserved=before===JSON.stringify(await rawHeads());await store.save(doc(21));result.retry=(await store.get()).session.cursor===21;
  // Switch between undo/redo cursors without changing immutable history.
  const written=store.stats.historyChunksWritten;await store.save(doc(19));await store.save(doc(21));result.cursorOnlyReuse=store.stats.historyChunksWritten===written;
  const all=await new Promise((resolve,reject)=>{const tx=db.transaction(['sessions','journal']),s=tx.objectStore('sessions'),a=s.get('current'),b=s.get('previous'),k=tx.objectStore('journal').getAllKeys();tx.oncomplete=()=>resolve({a:a.result,b:b.result,keys:k.result});tx.onerror=()=>reject(tx.error);});
  const needed=new Set([all.a,all.b].flatMap(h=>[h.initialKey,h.bodyKey,...h.historyKeys]));result.noOrphans=needed.size===all.keys.length&&all.keys.every(k=>needed.has(k));
  db.close();return result;
 }''')
 check('IndexedDB writes each of twenty historical actions once',report['historyWritten']==20,report)
 check('IndexedDB incremental append writes only action and current-body chunks',report['chunksWritten']==42,report)
 check('IndexedDB keeps two distinct recovery points',report['current']==20 and report['previous']==19,report)
 check('duplicate IndexedDB saves do not erase previous recovery',report['duplicatePreserved'],report)
 check('aborted IndexedDB transaction rejects the save and preserves both heads',report['abortRejected'] and report['abortPreserved'],report)
 check('a rejected IndexedDB transaction can be retried safely',report['retry'],report)
 check('undo/redo cursor saves reuse immutable history chunks',report['cursorOnlyReuse'],report)
 check('journal collects unreachable chunks without deleting current or previous data',report['noOrphans'],report)
 fixture(p,'layers');p.evaluate('astra.flushSave()')
 p.evaluate("""()=>{window.saveCalls=0;window.gate=new Promise(r=>window.releaseSave=r);window.realSave=astra.storage.save.bind(astra.storage);astra.storage.save=async doc=>{saveCalls++;if(saveCalls===1)await gate;return realSave(doc);};}""")
 card(p,obj(p,'Ancient Den')['id'],'battlefield').click()
 p.evaluate('()=>{window.saving=astra.flushSave();return null;}')
 p.wait_for_function('saveCalls===1')
 handle=p.locator('[data-resize=hand]');handle.focus()
 for _ in range(6):p.keyboard.press('ArrowUp');p.evaluate('()=>{astra.flushSave();return null;}')
 check('busy autosave keeps only one captured write in flight',p.evaluate('saveCalls')==1)
 p.evaluate('async()=>{releaseSave();await saving;astra.storage.save=realSave;}')
 check('changes during a busy save coalesce into one newest snapshot',p.evaluate('saveCalls')==2)
 check('coalesced snapshot includes the latest resized layout',p.evaluate('(async()=> (await astra.storage.get()).session.uiLayout.handHeight===astra.prefs.handHeight)()'))
 fixture(p,'long-journal');menu(p);p.evaluate('astra.flushSave()')
 stats=p.evaluate('({...astra.storage.stats})');first=checksum(p)
 # Repeated flushes must not export/clone history again. Instrument the actual
 # Engine export path, preserving the implementation and all behavior.
 p.evaluate('''()=>{window.exportCalls=[];window.originalExport=astra.engine.exportSession;astra.engine.exportSession=function(options){exportCalls.push(options);return originalExport.call(this,options);};}''')
 p.evaluate('async()=>{for(let i=0;i<10;i++)await astra.flushSave();}')
 check('unchanged flushes capture no new session snapshots',p.evaluate('exportCalls.length')==0)
 close(p);handle=p.locator('[data-resize=hand]');handle.focus();p.keyboard.press('ArrowUp');p.evaluate('astra.flushSave()')
 check('layout-only autosave never copies full historical entries',p.evaluate('exportCalls.length>0&&exportCalls.every(o=>o?.copyHistory===false)'))
 check('layout-only autosave does not rewrite any historical chunks',p.evaluate('astra.storage.stats.historyChunksWritten')==stats['historyChunksWritten'])
 p.reload();p.wait_for_function('()=>astra?.engine');check('long journal reload retains its complete game checksum',checksum(p)==first)
 check('long journal reload retains all 160 undoable actions',state(p,'cursor')==160)
 before=p.evaluate('astra.storage.stats.historyChunksWritten');p.evaluate('astra.flushSave()')
 check('validated journal reload adopts existing chunk identities',p.evaluate('astra.storage.stats.historyChunksWritten')==before)
 p.keyboard.press('Backspace');p.evaluate('astra.flushSave()');check('undo after journal reload restores the previous zone',obj(p,'Mana Vault','graveyard') is not None)
 p.keyboard.press('Control+Shift+z');p.evaluate('astra.flushSave()');check('redo after journal reload restores the original checksum',checksum(p)==first)
 # Save an interrupted action, proving the journal is not just a history tail.
 fixture(p,'payments');cast(p,'The One Ring');p.evaluate('astra.flushSave()');expected=checksum(p);p.reload();p.wait_for_function('()=>astra?.engine')
 check('pending payment and its transaction survive real journal reload',pending(p)['kind']=='payment' and checksum(p)==expected)
 p.keyboard.press('Escape');check('a restored pending payment still cancels atomically',obj(p,'The One Ring','hand') is not None and pending(p) is None)
