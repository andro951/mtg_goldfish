from ui_acceptance_support import *
from ui_acceptance_grid_text import grid_metrics,resize_dock

def await_look(p):
 for _ in range(20):
  if state(p,'state.lookWorkspace?.ids?.length'):return
  q=pending(p)
  if q and q['kind']=='payment':pay(p)
  elif q and q.get('ordered'):click(p,'confirm-choice','[data-floating=decision]')
  elif state(p,'state.stack.length'):click(p,'resolve','.stack-window')
  else:raise AssertionError('Expected a real look effect, got '+str(q))
 raise AssertionError('Look did not appear')

def look_metrics(p):
 return p.locator('[data-surface=workspace]').evaluate('''s=>{
 const r=s.getBoundingClientRect(),cards=[...s.querySelectorAll('.face')].map(e=>e.getBoundingClientRect());
 return {width:r.width,height:r.height,count:cards.length,inside:cards.every(c=>c.left>=r.left-.6&&c.top>=r.top-.6&&c.right<=r.right+.6&&c.bottom<=r.bottom+.6),cardHeight:cards[0]?.height};
 }''')

def look_popup(p):
 fixture(p,'look-seeker');hold(p,True);click(p,'zone',extra='[data-zone=graveyard]')
 initial=p.locator('[data-surface=battlefield]').bounding_box()
 cast(p,'Ancient Den');await_look(p);top=state(p,'top().id');before=checksum(p)
 check('Steelseeker automatically opens its own one-card floating Look window',p.locator('.workspace-window .face').count()==1 and p.locator('.workspace-caption').inner_text().startswith('Sarinth Steelseeker'))
 check('Look does not close the graveyard or shrink the battlefield',p.evaluate('astra.prefs.dock')=='graveyard' and p.locator('[data-surface=graveyard]').count()==1 and p.locator('[data-surface=battlefield]').bounding_box()==initial)
 m=look_metrics(p);check('single-card Look automatically fits a readable large image',m['inside'] and m['cardHeight']>240,m)
 r=p.locator('.workspace-window').bounding_box();gy=p.locator('[data-surface=graveyard]').bounding_box()
 check('initial Look position overlays the graveyard side of the table',r['x']<gy['x']+gy['width'] and r['x']+r['width']>gy['x'])
 click(p,'close-workspace');check('hiding Look does not cancel Steelseeker or change gameplay',p.locator('.workspace-window').count()==0 and pending(p)['key']=='steelseekerMode' and checksum(p)==before)
 # An ordinary rerender must not immediately undo a manual Hide.
 menu(p,'notes');close(p);check('Look remains hidden during unrelated rerenders',p.locator('.workspace-window').count()==0)
 click(p,'zone',extra='[data-zone=workspace]');check('toolbar toggle reopens the same current card',p.locator('.workspace-window .face').get_attribute('data-id')==top)
 # Header drag is independent of the table camera and engine history.
 r=p.locator('.workspace-window').bounding_box();camera=p.evaluate('JSON.stringify(astra.prefs.cameras.battlefield)')
 drag(p,r['x']+45,r['y']+12,initial['x']+150,initial['y']+120)
 moved=p.locator('.workspace-window').bounding_box();check('Look window can be moved without moving battlefield or changing the effect',moved['x']<r['x']-100 and p.evaluate('JSON.stringify(astra.prefs.cameras.battlefield)')==camera and checksum(p)==before)
 # Mouse resize and keyboard resize both use real controls.
 handle=p.locator('[data-resize-popup=workspace]').bounding_box();drag(p,handle['x']+6,handle['y']+6,handle['x']+116,handle['y']+66)
 resized=p.locator('.workspace-window').bounding_box();check('Look is freely resizable and refits cards while resizing',resized['width']>moved['width']+80 and resized['height']>moved['height']+40 and look_metrics(p)['inside'])
 p.locator('[data-resize-popup=workspace]').focus();p.keyboard.press('ArrowRight');check('Look resize handle supports keyboard adjustment',p.locator('.workspace-window').bounding_box()['width']>resized['width'])
 # Zoom controls and wheel zoom act on the floating surface, never the table.
 zoom=p.evaluate('astra.prefs.cameras.workspace.zoom');click(p,'zoom-view','.workspace-window','[data-scale="0.8333333333"]')
 check('Look minus control zooms only the card preview',p.evaluate('astra.prefs.cameras.workspace.zoom')<zoom and p.evaluate('JSON.stringify(astra.prefs.cameras.battlefield)')==camera)
 s=p.locator('[data-surface=workspace]').bounding_box();p.mouse.move(s['x']+s['width']/2,s['y']+s['height']/2);z=p.evaluate('astra.prefs.cameras.workspace.zoom');p.mouse.wheel(0,180);p.wait_for_timeout(130)
 check('mouse wheel zoom works inside the floating Look window',p.evaluate('astra.prefs.cameras.workspace.zoom')<z)
 prior=p.evaluate('({...astra.prefs.cameras.workspace})');p.keyboard.down('Space');drag(p,s['x']+70,s['y']+65,s['x']+100,s['y']+85);p.keyboard.up('Space')
 after=p.evaluate('astra.prefs.cameras.workspace');check('Look can be panned independently',abs(after['x']-prior['x']-30)<1 and abs(after['y']-prior['y']-20)<1)
 # Close/reopen and card inspection retain that manual camera.
 click(p,'close-workspace');click(p,'zone',extra='[data-zone=workspace]');check('hiding and reopening Look preserves its zoom and pan',p.evaluate('astra.prefs.cameras.workspace')==after)
 click(p,'fit','.workspace-window');saved=p.evaluate('JSON.stringify(astra.prefs.cameras.workspace)');card(p,top,'workspace').click(button='right')
 check('right-clicking a Look preview inspects the actual card without submitting the choice',p.locator('.inspector-window .float-header').inner_text().startswith('Great Furnace') and pending(p)['key']=='steelseekerMode' and checksum(p)==before)
 click(p,'close-inspector');check('inspection preserves the Look camera',p.evaluate('JSON.stringify(astra.prefs.cameras.workspace)')==saved)
 # Preview dragging is not permission to move a hidden-zone object.
 b=card(p,top,'workspace').bounding_box();drag(p,b['x']+20,b['y']+20,b['x']+65,b['y']+50)
 check('dragging a preview never moves the real library card or changes state',state(p,f'object("{top}").zone')=='libraryActive' and checksum(p)==before)
 expected=p.evaluate('({camera:astra.prefs.cameras.workspace,size:astra.prefs.popupSizes.workspace,pos:astra.prefs.popups.workspace})')
 doc=p.evaluate('astra.exported()');menu(p,'save');p.locator('#session-file').set_input_files({'name':'pending-look.json','mimeType':'application/json','buffer':json.dumps(doc).encode()});p.wait_for_function('()=>astra.engine.state.pending?.key==="steelseekerMode"')
 check('pending Look import preserves window geometry and manual camera',p.evaluate('({camera:astra.prefs.cameras.workspace,size:astra.prefs.popupSizes.workspace,pos:astra.prefs.popups.workspace})')==expected and p.locator('.workspace-window').is_visible())
 if not args.memory:
  p.evaluate('astra.flushSave()');p.reload();p.wait_for_function('()=>astra?.engine?.state.pending?.key==="steelseekerMode"')
  check('real autosave reload restores the pending Look and its saved geometry',p.evaluate('({camera:astra.prefs.cameras.workspace,size:astra.prefs.popupSizes.workspace,pos:astra.prefs.popups.workspace})')==expected and p.locator('.workspace-window').is_visible())
 else:skipped.append('floating Look real persistence reload')
 shot(p,'34-steelseeker-floating-look.png')
 choose_option(p,'leave');check('finishing a look hides the popup without changing the library',p.locator('.workspace-window').count()==0 and state(p,'top().id')==top)
 cast(p,'Seat of the Synod');await_look(p);check('a new trigger showing the same top card automatically reopens Look',p.locator('.workspace-window .face').get_attribute('data-id')==top)
 choose_option(p,'hand');check('Steelseeker still puts the selected land into hand',state(p,f'object("{top}").zone')=='hand')
 cast(p,'Tree of Tales');await_look(p);check('Steelseeker nonland choices remain graveyard or leave only',[o['value'] for o in pending(p)['options']]==['graveyard','leave'])
 choose_option(p,'graveyard');check('Steelseeker still puts the nonland into graveyard',obj(p,'Walking Atlas','graveyard') is not None)
 # Scry uses the same popup, alongside its existing ordering controls.
 fixture(p,'look-scry');hold(p,True);cast(p,'Simulacrum Synthesizer');await_look(p)
 check('Scry automatically uses the same floating Look surface',p.locator('.workspace-window .float-header strong').inner_text()=='Scry' and p.locator('.workspace-window .face').count()==2)
 before_order=state(p,'state.zones.libraryActive.slice(0,2)');choose_cards(p,[])
 check('Scry retaining both cards still asks for their order',pending(p).get('ordered') and p.locator('.ordering-window .order-card-preview').count()==2)
 click(p,'order','.ordering-window','[data-index="0"][data-direction="1"]')
 check('Look mirrors the proposed top-first order without changing actual library early',p.evaluate('astra.ui.layouts.workspace.map(c=>c.id)')==list(reversed(before_order)) and state(p,'state.zones.libraryActive.slice(0,2)')==before_order)
 click(p,'confirm-choice','[data-floating=decision]');settle(p);check('confirmed scry order changes the library and closes Look',state(p,'state.zones.libraryActive.slice(0,2)')==list(reversed(before_order)) and p.locator('.workspace-window').count()==0)
 fixture(p,'look-surveil');hold(p,True);cast(p,'Ancient Den');await_look(p);top=state(p,'top().id');old=checksum(p)
 check('Surveil automatically displays its card in the floating Look surface',p.locator('.workspace-window .float-header strong').inner_text()=='Surveil')
 card(p,top,'workspace').click();check('a preview click selects the surveil card without clicking through to battlefield',p.evaluate('astra.ui.choice')==[top] and checksum(p)==old)
 shot(p,'35-surveil-floating-look.png');click(p,'confirm-choice','[data-floating=decision]');settle(p)
 check('surveil selection reaches the graveyard through the existing rules engine',state(p,f'object("{top}").zone')=='graveyard' and p.locator('.workspace-window').count()==0)
 # Toggle empty workspace, shrink browser: popup stays reachable and harmless.
 click(p,'zone',extra='[data-zone=workspace]');check('Look toggle remains available even when no cards are being looked at',p.locator('.workspace-window .empty-table').count()==1)
 p.set_viewport_size({'width':800,'height':600});p.wait_for_timeout(150);r=p.locator('.workspace-window').bounding_box()
 check('saved Look window stays reachable after a smaller browser resize',r['x']>=0 and r['y']>=0 and r['x']+r['width']<=801 and r['y']+r['height']<=601,r)

def arrival_grids(p):
 fixture(p,'growing-graveyard');hold(p,True);click(p,'zone',extra='[data-zone=graveyard]');resize_dock(p,470)
 check('empty graveyard starts as an automatic grid',p.locator('[data-surface=graveyard] .face').count()==0)
 source_ids=state(p,'state.zones.battlefield.slice()')
 for i,source in enumerate(source_ids[:8]):
  card(p,source,'battlefield').click(button='right');click(p,'ability','.inspector-window','[data-ability=mill]');choose_option(p,0);choose_cards(p,[source]);click(p,'resolve','.stack-window');settle(p)
  m=grid_metrics(p);check(f'graveyard arrival batch {i+1} is visible without pressing Grid',m['count']==(i+1)*4 and m['inside'],m)
 m=grid_metrics(p);check('growing graveyard expands into multiple columns rather than a vertical strip',m['columns']>=3,m);shot(p,'36-growing-graveyard-grid.png')
 # A manual location stays detached; new arrivals still join the automatic grid.
 last=state(p,'state.zones.graveyard.at(-1)');b=card(p,last,'graveyard').bounding_box();drag(p,b['x']+8,b['y']+8,b['x']+28,b['y']+24)
 location=state(p,f'object("{last}").location');check('graveyard still supports manual arrangements',p.evaluate('(id)=>astra.ui.layouts.graveyard.find(c=>c.id===id).gridSlot',last) is None)
 source=source_ids[8];card(p,source,'battlefield').click(button='right');click(p,'ability','.inspector-window','[data-ability=mill]');choose_option(p,0);choose_cards(p,[source]);click(p,'resolve','.stack-window');settle(p)
 check('new arrivals do not reset a manually placed graveyard card',state(p,f'object("{last}").location')==location)
 click(p,'arrange','.dock-header');check('Grid button restores all graveyard cards to the current responsive grid',grid_metrics(p)['inside'] and p.evaluate('astra.ui.layouts.graveyard.every(c=>c.gridSlot!==null)'))
 fixture(p,'growing-exile');hold(p,True)
 if p.evaluate('astra.prefs.dock')!='exile':click(p,'zone',extra='[data-zone=exile]')
 resize_dock(p,470);source_ids=state(p,'state.zones.battlefield.slice()')
 for source in source_ids[:10]:
  if p.locator('.inspector-window').count():click(p,'close-inspector')
  card(p,source,'battlefield').click(button='right');click(p,'ability','.inspector-window','[data-ability=exile-choice]');choose_option(p,0);click(p,'resolve','.stack-window');choose_cards(p,[pending(p)['candidates'][0]]);settle(p)
  check('exile arrival '+str(state(p,'state.zones.exile.length'))+' automatically fits its grid',grid_metrics(p,'exile')['inside'])
 check('growing exile also expands to multiple columns automatically',grid_metrics(p,'exile')['columns']>1)
 if p.locator('.inspector-window').count():click(p,'close-inspector')
 fixture(p,'grid-resize');click(p,'zone',extra='[data-zone=outside]');resize_dock(p,470)
 check('outside-the-game zone opens directly into the same responsive grid',grid_metrics(p,'outside')['inside'] and grid_metrics(p,'outside')['columns']>1)
