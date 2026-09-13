from ui_acceptance_support import *
import math


def pan_away(p, zoom=True):
 """Use real table pan/zoom controls, never mutate game or layout state."""
 if p.locator('.inspector-window').count():click(p,'close-inspector')
 r=p.locator('[data-surface=battlefield]').bounding_box()
 for _ in range(3):
  p.keyboard.down('Space')
  drag(p,r['x']+r['width']*.8,r['y']+r['height']*.25,r['x']+r['width']*.2,r['y']+r['height']*.8)
  p.keyboard.up('Space')
 if zoom:
  p.mouse.move(r['x']+r['width']*.5,r['y']+r['height']*.5)
  current=p.evaluate('astra.prefs.cameras.battlefield.zoom');p.mouse.wheel(0,-math.log(1.2/current)/.0015);p.wait_for_timeout(120)
 return p.evaluate('JSON.stringify(astra.prefs.cameras.battlefield)')


def rectangles(p, ids):
 return p.evaluate('''ids=>{
  const surface=document.querySelector('[data-surface="battlefield"]'),s=surface.getBoundingClientRect();
  return ids.map(id=>{
   const el=surface.querySelector('[data-position="'+id+'"] .face'),r=el?.getBoundingClientRect(),o=astra.engine.object(id);
   return {id,name:astra.engine.definition(o).name,land:astra.engine.characteristics(o).types.includes('Land'),
    left:r?.left-s.left,top:r?.top-s.top,right:r?.right-s.left,bottom:r?.bottom-s.top,width:r?.width,height:r?.height,
    surfaceWidth:s.width,surfaceHeight:s.height,layer:Number(el?.closest('[data-position]').style.zIndex)};
  });
 }''',ids)


def visible_check(p,ids,label,lanes=True):
 rows=rectangles(p,ids)
 check(label+' — every new card is inside the current battlefield viewport',all(
  r['left']>=-.6 and r['top']>=-.6 and r['right']<=r['surfaceWidth']+.6 and r['bottom']<=r['surfaceHeight']+.6 for r in rows),rows)
 if lanes:
  check(label+' — lands use the lower lane, other permanents the upper lane',all(
   (r['bottom']>r['surfaceHeight']*2/3 if r['land'] else r['top']<r['surfaceHeight']*2/3) for r in rows),rows)
 check(label+' — arrivals do not occupy exactly identical visible positions',len({(round(r['left'],2),round(r['top'],2)) for r in rows})==len(rows),rows)


def arrivals(p):
 fixture(p,'arrival-batch');hold(p,True)
 # Open a side zone and enlarge the hand before moving away: dimensions must
 # come from the real surface, not from assumed window or toolbar heights.
 click(p,'zone',extra='[data-zone=graveyard]')
 handle=p.locator('[data-resize=hand]');handle.focus();p.keyboard.press('ArrowUp');p.keyboard.press('ArrowUp');p.locator('[data-action=menu]').focus()
 camera=pan_away(p)
 old=p.evaluate('JSON.stringify(astra.ui.layouts.battlefield.map(o=>[o.id,o.x,o.y]))')
 ids=state(p,'state.zones.graveyard.slice()')
 cast(p,'Open the Vaults');pay(p);click(p,'resolve','.stack-window');settle(p)
 visible_check(p,ids,'Crowded graveyard return with pan, zoom and a side zone')
 check('automatic return does not pan or zoom the player’s table',p.evaluate('JSON.stringify(astra.prefs.cameras.battlefield)')==camera)
 check('automatic return leaves existing card coordinates unchanged',p.evaluate('(old)=>JSON.stringify(astra.ui.layouts.battlefield.filter(o=>JSON.parse(old).some(a=>a[0]===o.id)).map(o=>[o.id,o.x,o.y]))',old)==old)
 rows=rectangles(p,ids);check('crowded return uses visible overlap instead of offscreen rows',any(a['left']<b['right'] and a['right']>b['left'] and a['top']<b['bottom'] and a['bottom']>b['top'] for i,a in enumerate(rows) for b in rows[i+1:]))
 shot(p,'28-visible-crowded-arrivals.png')
 before=p.evaluate('JSON.stringify(astra.ui.layouts.battlefield.map(o=>[o.id,o.x,o.y,o.z]))')
 menu(p,'notes');close(p)
 check('ordinary rerender does not shuffle automatic arrivals',p.evaluate('JSON.stringify(astra.ui.layouts.battlefield.map(o=>[o.id,o.x,o.y,o.z]))')==before)
 # A narrow, resized viewport uses the same visibility invariant.
 p.set_viewport_size({'width':850,'height':650});fixture(p,'arrival-batch');hold(p,True)
 if p.locator('[data-surface=graveyard]').count():click(p,'close-zone')
 pan_away(p);ids=state(p,'state.zones.graveyard.slice()');cast(p,'Open the Vaults');pay(p);click(p,'resolve','.stack-window');settle(p)
 visible_check(p,ids,'Crowded return after viewport resize')
 shot(p,'29-visible-arrivals-resized.png')


def arrival_sources(p):
 # Library search creates a new visible permanent despite the camera being far
 # from the source's original position.
 fixture(p,'arrival-search');hold(p,True);activate(p,'Planar Bridge','search');pay(p)
 camera=pan_away(p);click(p,'resolve','.stack-window');chosen=obj(p,'Razortide Bridge','libraryActive')['id'];choose_cards(p,[chosen]);settle(p)
 visible_check(p,[chosen],'Library search for a tapped artifact land')
 check('library-search arrival preserves the camera and tapped entry',p.evaluate('JSON.stringify(astra.prefs.cameras.battlefield)')==camera and obj(p,'Razortide Bridge')['tapped'])
 # Landfall tokens must appear in the visible nonland lane too.
 fixture(p,'arrival-birds');hold(p,True);pan_away(p);cast(p,'Ancient Den');settle(p)
 bird=obj(p,'Bird','battlefield');visible_check(p,[bird['id']],'Landfall token creation')
 check('new Bird is a real 2/2 token rather than a placeholder',bird['token'] and state(p,f'characteristics("{bird["id"]}").power')==2)
 # A blink changes object identity and must not reuse the old offscreen memo.
 fixture(p,'arrival-blink');hold(p,True);target=obj(p,'Mana Vault')['id'];old_oid=obj(p,'Mana Vault')['oid'];cast(p,'Mox Amber')
 if pending(p) and pending(p)['kind']=='payment':pay(p)
 choose_cards(p,[target]);camera=pan_away(p);click(p,'resolve','.stack-window')
 visible_check(p,[target],'Blink return with a new object identity')
 check('blink return receives a new identity without moving the camera',obj(p,'Mana Vault')['oid']!=old_oid and p.evaluate('JSON.stringify(astra.prefs.cameras.battlefield)')==camera)
 settle(p)


def latest_controls(p):
 fixture(p,'latest-recover');hold(p,True)
 land=obj(p,'Academy Ruins');badge=p.locator('[data-action=card-abilities][data-id="'+land['id']+'"]');badge.click()
 check('Academy Ruins exposes mana and recovery as separate clickable actions',p.locator('.inspector-window [data-ability=mana]').is_enabled() and p.locator('.inspector-window [data-ability=recover]').is_enabled())
 click(p,'ability','.inspector-window','[data-ability=recover]');choose_cards(p,[obj(p,'Mox Opal','graveyard')['id']]);pay(p);click(p,'resolve','.stack-window')
 check('Academy Ruins UI recovery puts the artifact on top, not into hand',state(p,'definition(astra.engine.top()).name')=='Mox Opal' and obj(p,'Mox Opal','hand') is None)
 fixture(p,'latest-affinity');hold(p,True);cast(p,'Walking Atlas')
 if pending(p) and pending(p)['kind']=='payment':pay(p)
 check('Mycosynth Golem makes the artifact-creature cast free in the actual payment UI',state(p,'state.players[0].mana.C')==0 and obj(p,'Walking Atlas','stackCards') is not None)
 settle(p);check('affinity cast resolves into a real creature',obj(p,'Walking Atlas','battlefield') is not None)
 fixture(p,'latest-persist');hold(p,True);activate(p,'Cauldron of Souls','persist');metal=obj(p,'Metalworker')['id'];choose_cards(p,[metal]);click(p,'resolve','.stack-window')
 check('Cauldron UI grants persist to selected creatures',state(p,f'characteristics("{metal}").keywords.includes("Persist")'))
 activate(p,'Krark-Clan Ironworks','sacrifice');choose_cards(p,[metal]);camera=pan_away(p)
 check('persist waits on the stack after a real sacrifice',obj(p,'Metalworker','graveyard') is not None and state(p,'state.stack.at(-1).abilityId')=='persist')
 click(p,'resolve','.stack-window');visible_check(p,[metal],'Persist reanimation')
 check('persist return has a minus counter and no inherited grant',obj(p,'Metalworker')['counters']['-1/-1']==1 and not state(p,f'characteristics("{metal}").keywords.includes("Persist")'))
 for name,fixture_name in [('Doors of Durin','latest-doors'),('Cosmic Cube','latest-cube')]:
  fixture(p,fixture_name);hold(p,True);click(p,'dialog',extra='[data-dialog=combat]');attacker=obj(p,'Metalworker');p.locator('[data-attacker="'+attacker['id']+'"]').check();click(p,'attack-confirm','.modal')
  check(name+' triggers once from the real attack declaration',state(p,'state.stack.length')==1)
  click(p,'resolve','.stack-window')
  if name=='Doors of Durin':
   choose_cards(p,[])
   if pending(p).get('ordered'):click(p,'confirm-choice','[data-floating=decision]')
   choose_option(p,'YES');choose_option(p,'2');settle(p)
   entered=obj(p,'Skyshroud Ranger','battlefield')
   check('Doors UI completes scry, reveal and tapped-attacking placement',entered is not None and entered['tapped'] and entered['flags']['attacking']['player']==2 and state(p,f'characteristics("{entered["id"]}").keywords.includes("Hexproof")'))
  else:
   check('Cosmic Cube presents a free-cast selection for eligible looked-at cards',pending(p)['kind']=='castWindow' and obj(p,'Walking Atlas','libraryActive')['id'] in pending(p)['candidates'])
   choose_cards(p,[obj(p,'Walking Atlas','libraryActive')['id']]);settle(p)
   check('Cosmic Cube UI casts the selection without mana and bottoms the rest',obj(p,'Walking Atlas','battlefield') is not None and state(p,'state.players[0].mana.C')==0 and state(p,'definition(astra.engine.top()).name')=='Great Furnace')
 check('new card controls keep manual gameplay overrides disabled',not state(p,'state.settings.manualControls'))
 menu(p,'deck');p.locator('.deck-preset-picker summary').click();click(p,'deck-preset',extra='[data-preset=september-13]')
 check('exact requested preset validates with no omitted names',p.evaluate('astra.ui.deckReport.accepted'))
 check('requested preset preserves all three sections',p.locator('[data-deck-drop=main] b').inner_text()=='104' and p.locator('[data-deck-drop=command] b').inner_text()=='1' and p.locator('[data-deck-drop=outside] b').inner_text()=='72')
 close(p);menu(p,'new');click(p,'start-new')
 check('requested preset starts with all outside cards and the correct active/reserve split',state(p,'state.zones.outside.length')==72 and state(p,'state.zones.command.length')==1 and state(p,'state.zones.libraryReserve.length')==5 and state(p,'state.zones.libraryActive.length+astra.engine.state.zones.hand.length')==99)


def notes_focus_race(p):
 fixture(p,'layers');land=obj(p,'Ancient Den');card(p,land['id'],'battlefield').click();cursor=state(p,'cursor');mana=state(p,'state.players[0].mana.W')
 check('Notes focus regression has actual undoable game history',cursor>0 and mana==1)
 # Deliberately delay animation callbacks to reproduce the original focus race.
 p.evaluate('''()=>{window.__realRAF=window.requestAnimationFrame;window.__queuedRAF=[];window.requestAnimationFrame=fn=>(__queuedRAF.push(fn),__queuedRAF.length);}''')
 menu(p,'notes');p.locator('#note-text').fill('Keep focus >');p.locator('#note-text').press('Control+End')
 p.evaluate('''()=>{window.requestAnimationFrame=__realRAF;const queue=__queuedRAF.splice(0);for(const fn of queue)fn(performance.now());}''')
 check('delayed modal callbacks cannot steal Notes focus',p.evaluate('document.activeElement.id')=='note-text')
 p.keyboard.press('Backspace')
 check('Backspace edits Notes after delayed callbacks',p.locator('#note-text').input_value()=='Keep focus ')
 check('Backspace in Notes cannot undo a real prior mana action',state(p,'cursor')==cursor and state(p,'state.players[0].mana.W')==mana and obj(p,'Ancient Den')['tapped'])
