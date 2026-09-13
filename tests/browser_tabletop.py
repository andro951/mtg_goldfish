#!/usr/bin/env python3
"""Execute real tabletop acceptance. See ui_acceptance_support for environment modes."""
from ui_acceptance_support import *
import hashlib
from ui_acceptance_game import opening, mana, payments
from ui_acceptance_effects import recursion, libraries, triggers, special
from ui_acceptance_menus import menus
from ui_acceptance_geometry import geometry, panels
from ui_acceptance_persistence import persistence, responsive

from ui_acceptance_extra import extra_controls
from ui_acceptance_misc import phase_controls
from ui_acceptance_inspector import inspector_choices
from ui_acceptance_programs import grid_organization,order_large,player_defaults,auto_selection,sequence_editor,player_automation,stack_shortcuts,multi_auto_selection,raft_resolution_sequences,sequence_controls,new_controls_persistence,rule_edit_validation

from ui_acceptance_performance import interaction_performance

from ui_acceptance_expansion import expansion_controls,expansion_payments,expansion_arrows,expansion_lists,expansion_suspend,expansion_mechanics,expansion_combat

from ui_acceptance_ability_access import vault_ability_access,special_lands_access,granted_ability_access,ability_button_geometry

from ui_acceptance_grid_text import grid_resize_visual,deck_text_editor

from ui_acceptance_arrivals import arrivals, arrival_sources, latest_controls, notes_focus_race

from ui_acceptance_146 import ask_loyalty, journal_persistence

server=None
if not args.memory:
 server=subprocess.Popen(['node','tools/serve.mjs'],cwd=ROOT,stdout=(OUT/'browser-server.log').open('w'),stderr=subprocess.STDOUT);time.sleep(1)
try:
 with sync_playwright() as pw:
  path=os.environ.get('CHROMIUM_PATH') or (shutil.which('chromium') if args.memory else None)
  b=pw.chromium.launch(**({'executable_path':path} if path else {}),args=['--no-sandbox'])
  groups=[ask_loyalty,journal_persistence,arrivals,arrival_sources,latest_controls,notes_focus_race,opening,mana,payments,recursion,libraries,triggers,special,inspector_choices,menus,geometry,panels,persistence,responsive,extra_controls,phase_controls,grid_organization,order_large,player_defaults,auto_selection,sequence_editor,player_automation,stack_shortcuts,multi_auto_selection,raft_resolution_sequences,sequence_controls,new_controls_persistence,rule_edit_validation,interaction_performance,expansion_controls,expansion_payments,expansion_arrows,expansion_lists,expansion_suspend,expansion_mechanics,expansion_combat,vault_ability_access,special_lands_access,granted_ability_access,ability_button_geometry,grid_resize_visual,deck_text_editor]
  if args.groups:groups=[g for g in groups if g.__name__ in args.groups.split(',')]
  for group in groups:
   context=b.new_context(viewport={'width':1720,'height':900},accept_downloads=True);p=context.new_page();p.set_default_timeout(4500)
   p.on('pageerror',lambda e:errors.append(str(e)))
   p.on('console',lambda m:errors.append(m.text) if m.type=='error' else None)
   p.on('request',lambda r:requests.append(r.url) if r.url.startswith(('http:','https:')) and not r.url.startswith(args.url) else None)
   try:
    if args.memory:p.set_content(html,wait_until='load',timeout=30000)
    else:p.goto(args.url,wait_until='load')
    p.wait_for_function('()=>window.astra?.engine');group(p)
   except Exception as e:
    failures.append({'group':group.__name__,'message':str(e),'traceback':traceback.format_exc()});print('FAIL',group.__name__,str(e),flush=True);shot(p,'FAIL-'+group.__name__+'.png')
   finally:context.close()
  if not args.memory and not args.groups:
   context=b.new_context();p=context.new_page()
   try:
    p.goto((ROOT/'index.html').as_uri());p.wait_for_function('()=>window.astra?.engine');check('direct file starts the compact controller',p.evaluate('astra.version')=='1.4.6');check('direct file loads real local card back',p.locator('.deck-back img').evaluate('(e)=>e.complete&&e.naturalWidth>0'))
   except Exception as e:failures.append({'group':'direct-file','message':str(e)})
   context.close()
  b.close()
finally:
 if server:server.terminate();server.wait(timeout=5)
report={'testedBuildSHA256':hashlib.sha256((ROOT/('Astra-standalone.html' if args.memory else 'index.html')).read_bytes()).hexdigest(),'mode':'in-memory rendering' if args.memory else 'HTTP and direct-file Chromium','uiVersion':'1.4.6','checksPassed':len(checks),'checks':checks,'failures':failures,'browserErrors':errors,'externalRequests':requests,'skipped':skipped}
(OUT/('tabletop-memory.json' if args.memory else 'browser.json')).write_text(json.dumps(report,indent=2)+'\n')
print(json.dumps({k:report[k] for k in ['mode','checksPassed','failures','browserErrors','externalRequests','skipped']},indent=2))
raise SystemExit(bool(failures or errors or requests))
