#!/usr/bin/env python3
"""Summarize main-thread stalls without exporting browsing paths or screenshot data."""
import argparse,collections,gzip,hashlib,json
from pathlib import Path
p=argparse.ArgumentParser();p.add_argument('trace',type=Path);p.add_argument('--output',type=Path,required=True);args=p.parse_args()
opener=gzip.open if args.trace.suffix=='.gz' else open
with opener(args.trace,'rt',encoding='utf-8') as f:document=json.load(f)
events=document['traceEvents'];threads=collections.Counter()
for e in events:
 if e.get('name')=='RunTask' and e.get('ph')=='X':threads[(e.get('pid'),e.get('tid'))]+=e.get('dur',0)
main=threads.most_common(1)[0][0];rows=[e for e in events if (e.get('pid'),e.get('tid'))==main]
complete=[e for e in rows if e.get('ph')=='X'];metrics={}
for name in ['RunTask','FunctionCall','EventDispatch','TimerFire','FireAnimationFrame','UpdateLayoutTree','Layout','Paint','MajorGC','MinorGC']:
 ds=[e.get('dur',0)/1000 for e in complete if e.get('name')==name]
 metrics[name]={'count':len(ds),'totalMs':round(sum(ds),3),'maxMs':round(max(ds,default=0),3),'over50Ms':sum(d>50 for d in ds)}
functions=collections.defaultdict(list)
for e in complete:
 if e.get('name')=='FunctionCall':functions[e.get('args',{}).get('data',{}).get('functionName') or '(anonymous)'].append(e.get('dur',0)/1000)
callbacks=sorted([{'function':k,'count':len(v),'totalMs':round(sum(v),3),'maxMs':round(max(v),3)} for k,v in functions.items()],key=lambda r:r['totalMs'],reverse=True)[:15]
window=document.get('metadata',{}).get('modifications',{}).get('initialBreadcrumb',{}).get('window',{})
heaps=[e.get('args',{}).get('data',{}).get('jsHeapSizeUsed',0) for e in rows if e.get('name')=='UpdateCounters']
report={'sourceFilename':args.trace.name,'sourceSHA256':hashlib.sha256(args.trace.read_bytes()).hexdigest(),'durationMs':window.get('range',0)/1000,'mainThread':{'pid':main[0],'tid':main[1]},'events':len(events),'metrics':metrics,'topCallbacks':callbacks,'peakSampledHeapBytes':max(heaps,default=0),'notes':['Complete-event category durations overlap and must not be added together.','Heap values are samples, not a guaranteed absolute peak.','Paths, URLs, screenshots and detailed browsing contents are intentionally omitted.']}
args.output.parent.mkdir(parents=True,exist_ok=True);args.output.write_text(json.dumps(report,indent=2)+'\n');print(json.dumps(report,indent=2))
