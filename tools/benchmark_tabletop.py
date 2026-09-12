#!/usr/bin/env python3
"""Measure target-selection handler time with the same 49-permanent fixture.

Authored standalone HTML is rendered in memory. This does not substitute for
HTTP/file/persistence acceptance; those run in the separate full browser suite.
Pass --baseline /path/to/older/Astra-standalone.html for a same-machine comparison.
"""
import argparse,json,os,shutil,statistics,subprocess
from pathlib import Path
from playwright.sync_api import sync_playwright
ROOT=Path(__file__).resolve().parents[1]
parser=argparse.ArgumentParser();parser.add_argument('--baseline');args=parser.parse_args()
subprocess.run(['node','tests/make_ui_fixtures.mjs'],cwd=ROOT,check=True)
results=[]
with sync_playwright() as p:
    executable=os.environ.get('CHROMIUM_PATH') or shutil.which('chromium')
    browser=p.chromium.launch(**({'executable_path':executable} if executable else {}),args=['--no-sandbox'])
    for label,path in ([('baseline',Path(args.baseline))] if args.baseline else [])+[('current',ROOT/'Astra-standalone.html')]:
        context=browser.new_context(viewport={'width':1720,'height':900});page=context.new_page();errors=[]
        page.on('pageerror',lambda e:errors.append(str(e)))
        page.set_content(path.read_text(),wait_until='load');page.wait_for_function('()=>window.astra?.engine')
        page.locator('[data-action=menu]').click();page.locator('[data-dialog=save]').click()
        page.locator('#session-file').set_input_files(str(ROOT/'test-results/fixtures/target-many.json'))
        page.wait_for_function('()=>astra.engine.state.initialDeck.scenario==="UI acceptance: target-many"')
        source=page.evaluate("Object.values(astra.engine.state.instances).find(o=>o.zone==='battlefield'&&astra.engine.definition(o).name==='Krark-Clan Ironworks').id")
        page.locator('[data-surface=battlefield] [data-card="'+source+'"] .face').click(button='right')
        page.locator('.inspector-window [data-ability=sacrifice]').click()
        samples=page.evaluate('''async () => {
            const ids=astra.engine.state.pending.candidates.slice(0,20),times=[];
            for(let repeat=0;repeat<3;repeat++)for(const id of ids){
                const button=document.querySelector('.decision-gallery [data-action="card"][data-id="'+id+'"]');
                await new Promise(requestAnimationFrame);
                const start=performance.now();button.click();times.push(performance.now()-start);
            }
            return times;
        }''')
        data=sorted(samples[10:])
        results.append({'edition':label,'version':page.evaluate('astra.version'),'fixturePermanents':49,'samples':len(data),'medianSelectionHandlerMs':round(statistics.median(data),3),'p95SelectionHandlerMs':round(data[int((len(data)-1)*.95)],3),'maxSelectionHandlerMs':round(max(data),3),'browserErrors':errors})
        context.close()
    browser.close()
report={'method':'same-machine Chromium; 49-permanent target selector; synchronous DOM button handler duration after an animation frame; 10 warm-up samples discarded','results':results}
if len(results)==2:report['medianSpeedup']=round(results[0]['medianSelectionHandlerMs']/max(.001,results[1]['medianSelectionHandlerMs']),2)
path=ROOT/'test-results/performance.json';path.write_text(json.dumps(report,indent=2)+'\n');print(json.dumps(report,indent=2))
raise SystemExit(any(r['browserErrors'] for r in results))
