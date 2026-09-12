from ui_acceptance_support import *

def phase_controls(p):
 fixture(p,'layers')
 for step in ['untap','upkeep','draw','main1','beginCombat','attackers','damage','endCombat','main2','end','cleanup']:
  click(p,'phase',extra=f'[data-step="{step}"]');settle(p)
  check(f'direct {step} phase button reaches its requested step',state(p,'state.step')==step)
 inspect(p,'Ancient Den');p.locator('.rules-text summary').click();check('inspector rules text expands without engine identifiers','{T}' in p.locator('.rules-text .oracle').inner_text() and 'Object ' not in p.locator('.inspector-window').inner_text())
 details=p.locator('.inspector-window details').nth(1);details.locator('summary').click();check('collapsed canonical rulings section opens',details.get_attribute('open') is not None)
 click(p,'zoom','.inspector-window');check('inspector art enlarges to full card detail',p.locator('#modal-title').inner_text()=='Ancient Den');click(p,'zoom-back','.modal');click(p,'close-inspector')
 # Explicit developer tools are exercised only inside a disposable fixture.
 menu(p,'settings');p.locator('#setting-debug').check();card_id=p.evaluate("astra.registry.get('Walking Atlas').id");p.locator('#debug-card').select_option(card_id);p.locator('#debug-zone').select_option('graveyard');click(p,'debug-spawn','.modal')
 check('developer Spawn uses selected card and zone',obj(p,'Walking Atlas','graveyard') is not None)
 before=state(p,'state.zones.hand.length');menu(p,'settings');p.locator('#debug-count').fill('2');click(p,'debug-draw','.modal');check('developer Draw respects chosen count',state(p,'state.zones.hand.length')==before+2)
 before=state(p,'state.zones.graveyard.length');menu(p,'settings');p.locator('#debug-count').fill('2');click(p,'debug-mill','.modal');check('developer Mill respects chosen count',state(p,'state.zones.graveyard.length')==before+2)
 menu(p,'settings');before=state(p,'state.zones.libraryActive.slice()');click(p,'debug-shuffle','.modal');check('developer Shuffle preserves cards and randomizes order',sorted(state(p,'state.zones.libraryActive'))==sorted(before) and state(p,'state.zones.libraryActive')!=before)
 p.locator('#setting-debug').uncheck();close(p);check('all developer operations are explicitly identified in log',p.evaluate("astra.engine.history.filter(h=>h.actions.some(a=>a.type.startsWith('DEBUG_'))).every(h=>h.events.some(e=>e.type==='DEBUG_OVERRIDE'))"))
 # Default automatic resolution pauses for a rare menu, then resumes on close.
 fixture(p,'layers');cast(p,'Walking Atlas');pay(p);menu(p);p.wait_for_timeout(350);check('opening Menu pauses pending automatic stack resolution',state(p,'state.stack.length')==1)
 close(p);p.wait_for_function("()=>Object.values(astra.engine.state.instances).some(o=>o.zone==='battlefield'&&astra.engine.definition(o).name==='Walking Atlas')")
 check('closing Menu resumes automatic resolution without another game action',state(p,'state.stack.length')==0)
 fixture(p,'plot');inspect(p,'Pitiless Carnage','hand');click(p,'plot','.inspector-window');pay(p)
 check('Plot pays its cost and exiles the card without using the stack',obj(p,'Pitiless Carnage','exile') is not None and state(p,'state.stack.length')==0)
 click(p,'close-inspector');click(p,'zone',extra='[data-zone=exile]');inspect(p,'Pitiless Carnage','exile');check('plotted spell cannot be cast on the same turn',p.locator('.inspector-window [data-action=cast]').count()==0)
 click(p,'close-inspector');click(p,'next-turn');settle(p);inspect(p,'Pitiless Carnage','exile');click(p,'cast','.inspector-window');p.wait_for_function('()=>astra.engine.state.pending||!astra.engine.state.stack.length');settle(p)
 check('plotted spell casts on a later turn without mana and resolves choices',obj(p,'Pitiless Carnage','graveyard') is not None)
