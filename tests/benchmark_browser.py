#!/usr/bin/env python3
"""Compare the same long-session workload in the verified 1.4.5 and current build.
CI supplies --baseline HTML extracted from the pinned pre-change commit. All
navigation, IndexedDB writes and long-task observations use real Chromium.
"""
import argparse,hashlib,json,os,subprocess
from pathlib import Path
from playwright.sync_api import sync_playwright
ROOT=Path(__file__).resolve().parents[1]
p=argparse.ArgumentParser();p.add_argument('--baseline',required=True);args=p.parse_args()
subprocess.run(['node','tests/make_ui_fixtures.mjs'],cwd=ROOT,check=True)
# An initial-only document is compatible with both history encodings.
long=json.loads((ROOT/'test-results/fixtures/long-journal.json').read_text())
initial=long['initialState'];long.update(currentState=initial,history=[],cursor=0,transaction=None,manualActions=0,stateChecksum=long['history'][0]['beforeHash'])
server=subprocess.Popen(['node','tools/serve.mjs'],cwd=ROOT,stdout=subprocess.DEVNULL,stderr=subprocess.STDOUT)
url='http://127.0.0.1:4173';reports={};errors=[]
try:
 import time;time.sleep(.8)
 with sync_playwright() as pw:
  browser=pw.chromium.launch(args=['--no-sandbox'])
  for label,file in [('before_1_4_5',Path(args.baseline)),('after_1_4_9',ROOT/'index.html')]:
   context=browser.new_context(viewport={'width':1366,'height':768});page=context.new_page();page.set_default_timeout(15000)
   page.on('pageerror',lambda e:errors.append(str(e)))
   text=file.read_text();page.route(url+'/',lambda route:route.fulfill(status=200,content_type='text/html',body=text))
   page.goto(url);page.wait_for_function('()=>window.astra?.engine')
   page.locator('[data-action=menu]').click();page.locator('[data-dialog=save]').click()
   page.locator('#session-file').set_input_files({'name':'benchmark.json','mimeType':'application/json','buffer':json.dumps(long).encode()})
   page.wait_for_function('()=>astra.engine.state.initialDeck.scenario==="UI acceptance: long-journal"')
   page.evaluate('astra.flushSave()')
   result=page.evaluate('''async()=>{
    const g=astra.engine,id=g.state.zones.battlefield[0],actions=[],saves=[],longTasks=[],putTimes=[];
    const observer=new PerformanceObserver(list=>longTasks.push(...list.getEntries().map(e=>({start:e.startTime,ms:e.duration}))));observer.observe({entryTypes:['longtask']});
    const originalPut=IDBObjectStore.prototype.put;IDBObjectStore.prototype.put=function(...args){const t=performance.now();const result=originalPut.apply(this,args);putTimes.push(performance.now()-t);return result;};
    let heartbeat=performance.now(),maxGap=0;const interval=setInterval(()=>{const now=performance.now();maxGap=Math.max(maxGap,now-heartbeat);heartbeat=now;},10);
    const start=performance.now();
    for(let i=0;i<160;i++){
      const t=performance.now();astra.run({type:'DEBUG_MOVE',id,zone:i%2?'battlefield':'graveyard'});actions.push(performance.now()-t);
      if(i%20===19){const t=performance.now();await astra.flushSave();saves.push(performance.now()-t);}
      await new Promise(r=>setTimeout(r,0));
    }
    const elapsedMs=performance.now()-start;await new Promise(r=>setTimeout(r,60));clearInterval(interval);observer.disconnect();IDBObjectStore.prototype.put=originalPut;
    const summarize=a=>({meanMs:a.reduce((x,y)=>x+y,0)/(a.length||1),maxMs:Math.max(0,...a),samples:a.length});
    return {elapsedMs,actions:summarize(actions),saves:summarize(saves),put:summarize(putTimes),longTasks:longTasks.filter(e=>e.start>=start),maxHeartbeatGapMs:maxGap,sessionBytes:new TextEncoder().encode(JSON.stringify(g.exportSession())).length,historyActions:g.cursor,storageMode:astra.storage.mode,storageStats:astra.storage.stats||null};
   }''')
   result['buildSHA256']=hashlib.sha256(text.encode()).hexdigest();reports[label]=result
   print(label,json.dumps({k:v for k,v in result.items() if k!='longTasks'}),flush=True);context.close()
  browser.close()
finally:server.terminate();server.wait(timeout=5)
a,b=reports['before_1_4_5'],reports['after_1_4_9']
checks={'both_used_real_indexeddb':a['storageMode']==b['storageMode']=='indexeddb',
 'same_number_of_actions':a['historyActions']==b['historyActions']==160,
 'new_save_at_least_ten_times_smaller':b['sessionBytes']<a['sessionBytes']/10,
 'new_mean_save_at_least_twice_as_fast':b['saves']['meanMs']<a['saves']['meanMs']/2,
 'history_written_once':b['storageStats']['historyChunksWritten']==160,
 'no_browser_errors':not errors}
report={'baselineCommit':'26b7e2c70835451b6554e08b3d2e6cd9e3cd7142','testedBuildSHA256':b['buildSHA256'],'method':'Same Chromium process, independent browser contexts, 160 identical moves, eight awaited real autosaves per build. This is a synthetic comparison, not a replay of the user trace.','checks':checks,'errors':errors,'measurements':reports}
(ROOT/'test-results/performance.json').write_text(json.dumps(report,indent=2)+'\n')
print(json.dumps(checks,indent=2));raise SystemExit(not all(checks.values()))
