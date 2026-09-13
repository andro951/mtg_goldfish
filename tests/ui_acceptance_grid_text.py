from ui_acceptance_support import *

def resize_dock(p,width):
 handle=p.locator('.dock-resize').bounding_box();current=p.locator('.zone-dock').bounding_box()['width']
 drag(p,handle['x']+2,handle['y']+70,handle['x']+2+current-width,handle['y']+70)
 p.wait_for_timeout(150)

def grid_metrics(p,zone='graveyard'):
 return p.evaluate('''z=>{
 const s=document.querySelector('[data-surface="'+z+'"]').getBoundingClientRect();
 const rs=[...document.querySelectorAll('[data-surface="'+z+'"] [data-position]')].filter(e=>astra.ui.layouts[z].find(c=>c.id===e.dataset.position)?.gridSlot!==null).map(e=>e.getBoundingClientRect());
 const w=Math.max(...rs.map(r=>r.right))-Math.min(...rs.map(r=>r.left)),h=Math.max(...rs.map(r=>r.bottom))-Math.min(...rs.map(r=>r.top));
 return {width:s.width,height:s.height,occupancyW:w/s.width,occupancyH:h/s.height,count:rs.length,columns:astra.prefs.gridViews[z].columns,zoom:astra.prefs.cameras[z].zoom,inside:rs.every(r=>r.left>=s.left-1&&r.right<=s.right+1&&r.top>=s.top-1&&r.bottom<=s.bottom+1)};
 }''',zone)

def grid_resize_visual(p):
 fixture(p,'grid-resize');click(p,'zone',extra='[data-zone=graveyard]');results=[]
 for width,name in [(250,'22-grid-narrow.png'),(470,'23-grid-medium.png'),(780,'24-grid-wide.png')]:
  resize_dock(p,width);m=grid_metrics(p);results.append(m)
  check(f'27-card graveyard fits and fills both axes at {width}px',m['count']==27 and m['inside'] and min(m['occupancyW'],m['occupancyH'])>.75,m);shot(p,name)
 check('real divider resizing increases columns rather than retaining old narrow shape',results[0]['columns']<results[1]['columns']<results[2]['columns'],results)
 # Window height and the hand divider also change the real available surface.
 p.set_viewport_size({'width':1280,'height':720});p.wait_for_timeout(180);resize_dock(p,640)
 m=grid_metrics(p);check('graveyard responds to smaller browser width and height',m['inside'] and min(m['occupancyW'],m['occupancyH'])>.70,m);shot(p,'26-grid-small-window.png')
 hand=p.locator('.hand-resize').bounding_box();drag(p,hand['x']+200,hand['y']+1,hand['x']+200,hand['y']-95)
 m=grid_metrics(p);check('changing hand height also refits graveyard to actual remaining height',m['inside'] and min(m['occupancyW'],m['occupancyH'])>.70,m)
 p.set_viewport_size({'width':1720,'height':900});p.wait_for_timeout(180);resize_dock(p,780)
 # Zoom must NOT be cancelled by ordinary inspection or completed panning.
 s=p.locator('[data-surface=graveyard]').bounding_box();p.mouse.move(s['x']+200,s['y']+200);p.mouse.wheel(0,350);p.wait_for_timeout(150)
 camera=p.evaluate('structuredClone(astra.prefs.cameras.graveyard)');first=p.evaluate('astra.engine.state.zones.graveyard[0]')
 card(p,first,'graveyard').click();check('inspecting a graveyard card preserves manual zoom and pan',p.evaluate('astra.prefs.cameras.graveyard')==camera);click(p,'close-inspector')
 p.keyboard.down('Space');drag(p,s['x']+250,s['y']+250,s['x']+280,s['y']+270);p.keyboard.up('Space')
 camera2=p.evaluate('astra.prefs.cameras.graveyard');check('finishing a pan does not snap back to automatic fit',abs(camera2['x']-camera['x']-30)<1 and abs(camera2['y']-camera['y']-20)<1)
 # A card detached at the end of the slot array must remain at the exact drop.
 last=p.evaluate('astra.engine.state.zones.graveyard.at(-1)');b=card(p,last,'graveyard').bounding_box();drag(p,b['x']+10,b['y']+10,b['x']+95,b['y']+30)
 a=card(p,last,'graveyard').bounding_box();check('detaching last grid card preserves its exact on-screen drop point',abs(a['x']-b['x']-85)<1 and abs(a['y']-b['y']-20)<1)
 location=state(p,f'object("{last}").location');resize_dock(p,600)
 check('resizing leaves detached card world coordinates unchanged',state(p,f'object("{last}").location')==location)
 click(p,'arrange','.dock-header');check('grid reset reattaches every card at the new size',all(c['gridSlot'] is not None for c in p.evaluate('astra.ui.layouts.graveyard')))
 # Exile and outside share the same sizing implementation, not only graveyard.
 for zone in ['exile','outside']:
  click(p,'zone',extra=f'[data-zone={zone}]');resize_dock(p,470);m=grid_metrics(p,zone)
  check(zone+' also fills both dimensions after resize',m['inside'] and m['count']==27 and min(m['occupancyW'],m['occupancyH'])>.70,m)
 click(p,'zone',extra='[data-zone=graveyard]');resize_dock(p,1050)
 s=p.locator('[data-surface=graveyard]').bounding_box();p.mouse.move(s['x']+250,s['y']+150);p.mouse.wheel(0,150);p.wait_for_timeout(120)
 expected=p.evaluate('({camera:astra.prefs.cameras.graveyard,view:astra.prefs.gridViews.graveyard,width:astra.prefs.dockWidth})')
 snapshot=p.evaluate('astra.exported()');menu(p,'save');p.locator('#session-file').set_input_files({'name':'grid.json','mimeType':'application/json','buffer':json.dumps(snapshot).encode()});p.wait_for_timeout(200)
 check('session import retains manual camera and a dock wider than 900px',p.evaluate('({camera:astra.prefs.cameras.graveyard,view:astra.prefs.gridViews.graveyard,width:astra.prefs.dockWidth})')==expected)
 if not args.memory:
  p.evaluate('astra.flushSave()');p.reload();p.wait_for_function('()=>window.astra?.engine');p.wait_for_timeout(180)
  check('reload preserves saved grid shape and manual camera',p.evaluate('({camera:astra.prefs.cameras.graveyard,view:astra.prefs.gridViews.graveyard,width:astra.prefs.dockWidth})')==expected)
 else:skipped.append('responsive grid HTTP reload')
 (OUT/'grid-resize-metrics.json').write_text(json.dumps(results,indent=2)+'\n')

def deck_text_editor(p):
 menu(p);check('menu has separate visual and text deck-editor entries',p.locator('[data-dialog=deck]').count()==1 and p.locator('[data-dialog=decktext]').count()==1)
 click(p,'dialog',extra='[data-dialog=decktext]');check('legacy editor is a separate tall text workspace',p.locator('.deck-text-modal #deck-text').is_visible() and p.locator('.deck-editor-shell').count()==0)
 original=p.locator('#deck-text').input_value();game=checksum(p);edited=original.replace('1 Mox Amber','2 Mox Amber',1)
 p.locator('#deck-text').fill(edited);check('typing invalidates old validation result without changing current game',p.locator('.deck-live-status strong').inner_text()=='Not validated' and checksum(p)==game)
 click(p,'deck-apply-text');check('raw quantity change validates without removing copies',p.evaluate('astra.ui.deckReport.accepted') and p.locator('#deck-text').input_value()==edited)
 click(p,'dialog',extra='[data-dialog=deck]');p.locator('#deck-search').fill('Mox Amber');check('visual builder immediately sees text changes', 'M2' in p.locator('.deck-membership').inner_text())
 click(p,'deck-add');click(p,'dialog',extra='[data-dialog=decktext]');check('text editor sees visual edits in the same saved deck', '3 Mox Amber' in p.locator('#deck-text').input_value())
 p.locator('#deck-text').fill('1 Unsupported future card\n// Commander\n1 The Wandering Minstrel');click(p,'deck-apply-text')
 check('validation displays actual unsupported name and keeps raw source intact','Unsupported future card' in p.locator('.deck-text-issues').inner_text() and not p.evaluate('astra.ui.deckReport.accepted'))
 p.locator('#deck-text').fill(original);click(p,'deck-apply-text');shot(p,'25-deck-text-editor.png')
 for viewport in [{'width':1000,'height':650},{'width':390,'height':640}]:
  p.set_viewport_size(viewport);p.wait_for_timeout(130)
  check(f'text editor and footer stay inside {viewport["width"]}x{viewport["height"]} window',p.locator('#deck-text').bounding_box()['height']>=80 and p.locator('.modal-footer').bounding_box()['y']+p.locator('.modal-footer').bounding_box()['height']<=viewport['height'] and p.evaluate('document.documentElement.scrollWidth<=innerWidth'))
 p.set_viewport_size({'width':1720,'height':900});p.wait_for_timeout(120)
 for preset in ['expanded','refined']:
  click(p,'deck-preset',extra=f'[data-preset={preset}]');check('text editor loads '+preset+' preset and validates it',p.evaluate('astra.ui.deckReport.accepted'))
 click(p,'restore-pool');check('restoring original list updates shared text source',p.locator('#deck-text').input_value()==original)
 p.locator('#deck-text').fill('');close(p);menu(p,'decktext');check('empty in-progress text is not replaced with default deck',p.locator('#deck-text').input_value()=='')
 if not args.memory:
  p.evaluate('astra.flushSave()');p.reload();p.wait_for_function('()=>window.astra?.engine');menu(p,'decktext')
  check('empty draft survives a real browser reload',p.locator('#deck-text').input_value()=='')
 else:skipped.append('text editor HTTP reload')
 p.locator('#deck-text').fill(original);click(p,'deck-apply-text');close(p);menu(p,'new');click(p,'start-new');check('valid text list starts a new seeded game',state(p,'state.zones.hand.length')==7)
