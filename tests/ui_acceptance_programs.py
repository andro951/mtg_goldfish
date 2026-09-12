from ui_acceptance_support import *

def cid(p,name):return p.evaluate('(n)=>astra.registry.get(n).id',name)
def open_programs(p):
 close(p);click(p,'dialog',extra='[data-dialog="sequences"]')
def open_rules(p):
 close(p);click(p,'dialog',extra='[data-dialog="automation"]')
def wait_clean(p):p.wait_for_function('()=>!astra.engine.state.pending&&!astra.engine.state.stack.length&&!astra.engine.state.actionDraft')
def record_urza(p,target="Grinding Station"):
 open_programs(p);click(p,'sequence-record');activate(p,'Urza, Lord High Artificer','artifact-mana');choose_cards(p,[obj(p,target)['id']]);
 open_programs(p);p.locator('#sequence-name').fill('Tap Station with Urza');click(p,'sequence-save');
 return p.evaluate('astra.programs.model.sequences.at(-1).id')
def set_rule(p,**values):
 for key,value in values.items():
  if key=='name':p.locator('#rule-name').fill(value)
  else:
   p.locator('#rule-'+key).select_option(value)
   if key=='card':p.wait_for_timeout(80)

def grid_organization(p):
 fixture(p,'grid-entries');hold(p,True);click(p,'zone',extra='[data-zone="graveyard"]')
 before=p.evaluate('astra.ui.layouts.graveyard.map(c=>({id:c.id,x:c.x,y:c.y,slot:c.gridSlot}))');moved=obj(p,'Ancient Den','graveyard')['id'];old=next(c for c in before if c['id']==moved)
 b=card(p,moved,'graveyard').bounding_box();p.mouse.move(b['x']+20,b['y']+20);p.mouse.down();p.mouse.move(b['x']+55,b['y']+200,steps=8);p.mouse.up()
 check('moving a graveyard card detaches it from its grid slot',p.evaluate('(id)=>astra.ui.layouts.graveyard.find(c=>c.id===id).gridSlot',moved) is None)
 check('detached grid slot becomes an empty reusable array entry',p.evaluate('(i)=>astra.ui.grids.graveyard[i]',old['slot']) is None)
 detached=state(p,f'object("{moved}").location');activate(p,'Krark-Clan Ironworks','sacrifice');choose_cards(p,[obj(p,'Mana Vault')['id']]);
 new=p.evaluate('(id)=>astra.ui.layouts.graveyard.find(c=>c.id===id)',obj(p,'Mana Vault','graveyard')['id'])
 check('new graveyard arrival reuses the freed slot exactly',new['gridSlot']==old['slot'] and new['x']==old['x'] and new['y']==old['y'])
 check('slot reuse does not snap the manually moved card back',state(p,f'object("{moved}").location')==detached)
 if p.locator('.inspector-window').count():click(p,'close-inspector')
 click(p,'arrange','.dock-header');check('zone grid button reattaches all cards and moves them into grid',p.evaluate('astra.ui.layouts.graveyard.every(c=>c.gridSlot!==null)'))
 check('grid reset changes the detached card actual saved position',state(p,f'object("{moved}").location')!=detached)
 p.keyboard.press('Backspace');check('undo grid reset restores detached position',state(p,f'object("{moved}").location')==detached)
 p.keyboard.press('Control+Shift+z');check('redo restores grid ownership',p.evaluate('astra.ui.layouts.graveyard.every(c=>c.gridSlot!==null)'))
 click(p,'zone',extra='[data-zone="exile"]');o=obj(p,'Tree of Tales','exile');b=card(p,o['id'],'exile').bounding_box();drag(p,b['x']+15,b['y']+15,b['x']+60,b['y']+150)
 check('exile uses the same detach-and-free grid model',p.evaluate('(id)=>astra.ui.layouts.exile.find(c=>c.id===id).gridSlot',o['id']) is None)
 click(p,'arrange','.dock-header');check('exile reset also restores actual grid positions',p.evaluate('astra.ui.layouts.exile.every(c=>c.gridSlot!==null)'))
 shot(p,'13-reusable-zone-grid.png')

def order_large(p):
 fixture(p,'order-many');check('29 simultaneous triggers open a dedicated resizable ordering window',p.locator('.ordering-window [data-order-id]').count()==29)
 original=p.evaluate('astra.ui.choice.slice()');last=original[-1]
 p.locator('[data-order-id="'+last+'"] [data-edge="top"]').click();check('double up arrow moves last trigger directly to top',p.evaluate('astra.ui.choice[0]')==last)
 p.locator('[data-order-id="'+last+'"] [data-edge="bottom"]').click();check('double down arrow moves first trigger directly to bottom',p.evaluate('astra.ui.choice.at(-1)')==last)
 first=p.locator('[data-order-id="'+original[0]+'"]');target=p.locator('[data-order-id="'+original[3]+'"]');first.drag_to(target)
 check('trigger rows support actual pointer drag-and-drop reordering',p.evaluate('astra.ui.choice.slice()')!=original)
 size=p.locator('.ordering-window').bounding_box();grip=p.locator('[data-resize-popup="decision"]').bounding_box();drag(p,grip['x']+7,grip['y']+7,grip['x']+105,grip['y']-80)
 resized=p.locator('.ordering-window').bounding_box();check('ordering grip changes popup width and height',abs(resized['width']-size['width'])>40 and abs(resized['height']-size['height'])>30)
 p.locator('[data-resize-popup="decision"]').focus();p.keyboard.press('ArrowRight');check('ordering resize is also keyboard accessible',p.locator('.ordering-window').bounding_box()['width']>resized['width'])
 saved=p.evaluate('astra.prefs.popupSizes.decision');check('ordering size is retained in portable preferences',p.evaluate('astra.exported().uiLayout.popupSizes.decision')==saved)
 shot(p,'14-order-29-triggers.png');chosen=p.evaluate('astra.ui.choice.slice()');click(p,'confirm-choice','[data-floating="decision"]')
 check('confirm preserves the chosen first-resolves-first stack order',state(p,'state.stack.slice().reverse().map(s=>s.id)')==chosen)
 check('order editor closes without resolving the stack',p.locator('.ordering-window').count()==0 and state(p,'state.stack.length')==29)

def player_defaults(p):
 fixture(p,'player-defaults');hold(p,True);inspect(p,'Codex Shredder');key=cid(p,'Codex Shredder')+'/mill/player'
 p.locator('[data-player-key="'+key+'"][data-player-value="0"]').click();check('Codex inspector exposes persistent target-player preference',p.evaluate('(k)=>astra.prefs.playerDefaults[k]',key)==0)
 click(p,'ability','.inspector-window','[data-ability="mill"]');p.wait_for_function('()=>!astra.engine.state.pending&&astra.engine.state.stack.length===1')
 check('Codex saved You choice skips player prompt and targets the actual player',state(p,'state.stack.at(-1).context.inputs.player')==0)
 click(p,'resolve','.stack-window');check('Codex default mills your actual library',state(p,'state.zones.graveyard.length')==1)
 click(p,'next-turn');settle(p);inspect(p,'Codex Shredder');p.locator('[data-player-key="'+key+'"][data-player-value="ONCE"]').click();click(p,'ability','.inspector-window','[data-ability="mill"]');p.wait_for_timeout(120)
 check('Choose once suppresses the saved default for just this activation',pending(p)['type']=='player')
 choose_option(p,1);check('one-use player choice does not replace saved default',state(p,'state.stack.at(-1).context.inputs.player')==1 and p.evaluate('(k)=>astra.prefs.playerDefaults[k]',key)==0)
 click(p,'resolve','.stack-window');click(p,'next-turn');settle(p);activate(p,'Codex Shredder','mill');p.wait_for_function('()=>!astra.engine.state.pending&&astra.engine.state.stack.length===1')
 check('next Codex activation returns to saved default instead of remaining in ask mode',state(p,'state.stack.at(-1).context.inputs.player')==0);click(p,'resolve','.stack-window')
 inspect(p,'Grinding Station');gskey=cid(p,'Grinding Station')+'/mill/player';p.locator('[data-player-key="'+gskey+'"][data-player-value="0"]').click();click(p,'ability','.inspector-window','[data-ability="mill"]')
 p.wait_for_function('()=>astra.engine.state.pending?.cost===true');check('target-player default works for another ability with an additional sacrifice cost',pending(p)['cost'])
 click(p,'revise-choice','[data-floating="decision"]');choose_option(p,2);choose_cards(p,[obj(p,'Ancient Den')['id']]);check('Player button revises only this activation before paying sacrifice',state(p,'state.stack.at(-1).context.inputs.player')==2 and p.evaluate('(k)=>astra.prefs.playerDefaults[k]',gskey)==0)
 check('player defaults are included in session export',p.evaluate('(k)=>astra.exported().uiLayout.playerDefaults[k]',key)==0)
 shot(p,'15-player-defaults.png')

def auto_selection(p):
 fixture(p,'inspector-actions');hold(p,True);menu(p,'settings');p.locator('[data-auto-accept]').check();close(p)
 activate(p,'Scene of the Crime','filter');check('Scene still asks additional creature cost before color',pending(p).get('cost') is True)
 p.locator('.decision-gallery [data-action=card][data-id="'+obj(p,'Walking Atlas')['id']+'"]').click();check('auto-accept advances from one cost selection directly to mana symbols',p.locator('.mana-window').count()==1)
 choose_option(p,'U');check('auto-accepted cost and mana choice are applied atomically',obj(p,'Scene of the Crime')['tapped'] and obj(p,'Walking Atlas')['tapped'] and state(p,'state.players[0].mana.U')==1)
 p.keyboard.press('Backspace');check('undo reverses auto-accepted activation in one action',not obj(p,'Scene of the Crime')['tapped'] and not obj(p,'Walking Atlas')['tapped'])
 activate(p,'Krark-Clan Ironworks','sacrifice');p.locator('.decision-gallery [data-action=card][data-id="'+obj(p,'Ancient Den')['id']+'"]').click();check('auto-accept works for sacrifice costs without confirmation',obj(p,'Ancient Den','graveyard') is not None and pending(p) is None)
 menu(p,'settings');p.locator('[data-auto-accept]').uncheck();close(p);activate(p,'Krark-Clan Ironworks','sacrifice')
 p.locator('.decision-gallery [data-action=card][data-id="'+obj(p,'Scene of the Crime')['id']+'"]').click();check('turning auto-accept off restores explicit confirmation',pending(p) is not None and obj(p,'Scene of the Crime','battlefield') is not None)
 # Target selection must not rebuild the table or lose pointer/layout state.
 p.evaluate('window.retainedTable=document.querySelector(".surface");window.retainedGallery=document.querySelector(".decision-gallery")');p.locator('.decision-gallery [data-action=card][data-id="'+obj(p,'Walking Atlas')['id']+'"]').click()
 check('changing selections reuses the existing table and gallery DOM',p.evaluate('retainedTable===document.querySelector(".surface")&&retainedGallery===document.querySelector(".decision-gallery")'))
 p.keyboard.press('Escape')

def sequence_editor(p):
 fixture(p,'programs');seq=record_urza(p)
 check('recording captures actual activation and legal cost choice',p.evaluate('(s)=>astra.programs.model.sequences.find(x=>x.id===s).steps.length',seq)==2)
 check('sequence defaults to current-game-only storage',not p.evaluate('(s)=>astra.programs.model.sequences.find(x=>x.id===s).saved',seq) and p.evaluate('astra.prefs.savedPrograms.sequences.length')==0)
 before=checksum(p);click(p,'sequence-check');check('preflight detects already tapped target without changing game',checksum(p)==before and p.locator('#toast.error').count()==1)
 close(p);p.keyboard.press('Backspace');open_programs(p);click(p,'sequence-check');check('preflight confirms the complete line after legal undo', 'entire sequence is legal' in p.locator('#toast').inner_text())
 click(p,'sequence-run');check('one-click execution performs the full recorded line',obj(p,'Grinding Station')['tapped'] and state(p,'state.players[0].mana.U')==1)
 close(p);p.keyboard.press('Backspace');check('recorded line is undone as one transaction',not obj(p,'Grinding Station')['tapped'] and state(p,'state.players[0].mana.U')==0)
 open_programs(p);p.locator('[data-repeat="'+seq+'"]').fill('5');click(p,'sequence-repeat');p.wait_for_function('()=>!astra.programs.running')
 check('repeat stops before illegal iteration without partially applying it',state(p,'state.players[0].mana.U')==1 and p.evaluate('astra.programs.model.paused'))
 open_programs(p);p.locator('[data-sequence-saved="'+seq+'"]').check();check('save-for-future toggle preserves the same sequence',p.evaluate('(id)=>astra.prefs.savedPrograms.sequences.some(s=>s.id===id)',seq))
 shot(p,'16-sequence-recorder.png')

# Configure the actual user-requested Grinding Station / Urza shortcut.
def player_automation(p):
 fixture(p,'programs');seq=record_urza(p);close(p)
 open_rules(p);click(p,'rule-new');set_rule(p,name='Station to blue mana',event='afterResolve',card=cid(p,'Grinding Station'),ability='untap',action='sequence',sequence=seq,scope='future')
 click(p,'rule-condition-add');p.locator('#condition-card-0').select_option(cid(p,'Urza, Lord High Artificer'));click(p,'rule-save')
 check('rule builder saves an enabled conditional after-resolution sequence',p.evaluate('astra.programs.model.rules.length')==1 and p.evaluate('astra.programs.model.rules[0].conditions[0].cardId')==cid(p,'Urza, Lord High Artificer'))
 close(p);inspect(p,'Grinding Station');p.locator('.policies summary').click();p.locator('[data-policy]').select_option('YES');click(p,'close-inspector')
 cast(p,'Mox Amber');wait_clean(p)
 check('configured Station untap shortcut legally uses Urza to retap Station',obj(p,'Grinding Station')['tapped'] and state(p,'state.players[0].mana.U')==2)
 open_rules(p);r=p.evaluate('astra.programs.model.rules[0].id');p.locator('[data-rule-toggle="'+r+'"]').uncheck();close(p)
 cast(p,'Walking Atlas');pay(p);wait_clean(p)
 check('toggle disables shortcut without deleting or recreating it',not obj(p,'Grinding Station')['tapped'] and state(p,'state.players[0].mana.U')==2)
 open_rules(p);p.locator('[data-rule-toggle="'+r+'"]').check();check('same rule can be re-enabled and persists for future games',p.evaluate('astra.prefs.savedPrograms.rules[0].enabled') and p.evaluate('astra.prefs.savedPrograms.sequences.length')==1)
 shot(p,'17-conditional-player-rules.png')
 snapshot=p.evaluate('astra.exported()');menu(p,'save');p.locator('#session-file').set_input_files({'name':'programs.json','mimeType':'application/json','buffer':json.dumps(snapshot).encode()});p.wait_for_function('(id)=>astra.programs.model.rules.some(r=>r.id===id)',arg=r)
 check('session import restores saved shortcuts and sequence bindings',p.evaluate('astra.programs.model.rules[0].enabled') and p.evaluate('astra.programs.model.sequences.length')==1)
 if not args.memory:
  p.evaluate('astra.flushSave()');p.reload();p.wait_for_function('()=>window.astra?.engine');check('HTTP reload retains automation toggles and recorded sequence data',p.evaluate('astra.programs.model.rules[0].id')==r and p.evaluate('astra.programs.model.rules[0].enabled') and p.evaluate('astra.programs.model.sequences[0].id')==seq)
 menu(p,'new');click(p,'start-new');check('new games inherit opted-in rules and their referenced sequences',p.evaluate('astra.programs.model.rules[0].id')==r and p.evaluate('astra.programs.model.sequences.length')==1)

def stack_shortcuts(p):
 fixture(p,'priority-stack');check('prepared priority test has two real triggered abilities',state(p,'state.stack.length')==2)
 ids=state(p,'state.stack.slice().reverse().map(s=>s.id)');click(p,'stack-hook','.stack-window',f'[data-stack-id="{ids[0]}"]')
 set_rule(p,name='Pause before this Station trigger',event='beforeResolve',action='hold',scope='one');click(p,'rule-save');close(p)
 click(p,'resolve','.stack-window');check('one-object before hook stops resolution with that object still on stack',p.evaluate('astra.programs.model.paused') and state(p,'state.stack.at(-1).id')==ids[0])
 click(p,'program-resume');click(p,'resolve','.stack-window');choose_option(p,'YES');check('resuming processes the chosen object once without repeated hold',state(p,'state.stack.length')==1 and not obj(p,'Grinding Station')['tapped'])
 click(p,'stack-hook','.stack-window');set_rule(p,name='This stack batch',event='afterResolve',scope='current');click(p,'rule-save');check('current-stack scope captures exact IDs rather than future copies',p.evaluate('astra.programs.model.rules.at(-1).scope')=='stack' and p.evaluate('astra.programs.model.rules.at(-1).stackIds.length')==1)
 close(p);click(p,'resolve','.stack-window');check('after-resolution hold is suppressed on empty stack',not p.evaluate('astra.programs.model.paused') and state(p,'state.stack.length')==0)
 fixture(p,'priority-stack');open_rules(p);click(p,'rule-new');set_rule(p,name='Untap pause with Urza or Clock',event='untapped',card=cid(p,'Grinding Station'),action='hold',scope='game',match='any')
 click(p,'rule-condition-add');p.locator('#condition-card-0').select_option(cid(p,'Urza, Lord High Artificer'));click(p,'rule-condition-add');p.locator('#condition-card-1').select_option(cid(p,'Clock of Omens'));click(p,'rule-save');close(p)
 click(p,'resolve','.stack-window');choose_option(p,'YES');check('untap priority rule honors OR conditions and leaves remaining stack paused',p.evaluate('astra.programs.model.paused') and state(p,'state.stack.length')==1)
 check('temporary rule remains in session but is not saved for future games',p.evaluate('astra.exported().playerPrograms.rules.length')==1 and p.evaluate('astra.prefs.savedPrograms.rules.length')==0)
 open_rules(p);p.locator('[data-rule-toggle]').uncheck();close(p);click(p,'program-resume');click(p,'resolve','.stack-window')
 check('disabled temporary hook stays editable and does not prevent completion',state(p,'state.stack.length')==0)

def multi_auto_selection(p):
 fixture(p,'multi-cost');hold(p,True);menu(p,'settings');p.locator('[data-auto-accept]').check();close(p)
 activate(p,'Kuldotha Forgemaster','forge')
 targets=[obj(p,n)['id'] for n in ['Ancient Den','Tree of Tales','Great Furnace']]
 for target in targets[:2]:p.locator('.decision-gallery [data-action=card][data-id="'+target+'"]').click()
 check('fixed multi-cost selection waits until the whole required count is chosen',pending(p).get('cost') is True and state(p,'state.zones.battlefield.length')==4)
 p.locator('.decision-gallery [data-action=card][data-id="'+targets[2]+'"]').click()
 check('third selection auto-confirms and sacrifices the three selected artifacts together',pending(p) is None and state(p,'state.zones.graveyard.length')==3 and state(p,'state.stack.length')==1)
 p.keyboard.press('Backspace');check('auto-confirmed multi-cost action is fully undoable',state(p,'state.zones.graveyard.length')==0 and not obj(p,'Kuldotha Forgemaster')['tapped'])

def raft_resolution_sequences(p):
 fixture(p,'raft-hooks');hold(p,True);seq=record_urza(p,'Walking Atlas');close(p);p.keyboard.press('Backspace')
 def prepare_land(name):
  cast(p,name)
  if pending(p).get('kind')=='triggerOrder':click(p,'confirm-choice','[data-floating="decision"]')
  for _ in range(2):
   choose_option(p,'untap');choose_cards(p,[obj(p,'Walking Atlas')['id']])
 prepare_land('Ancient Den')
 check('two Raft-Steerer triggers keep their independently selected creature targets',state(p,'state.stack.length')==2)
 click(p,'stack-hook','.stack-window');set_rule(p,name='Tap Atlas before each current Raft',event='beforeResolve',action='sequence',sequence=seq,scope='current');click(p,'rule-save');close(p)
 check('apply-to-current copies snapshots both Raft trigger IDs',p.evaluate('astra.programs.model.rules[0].stackIds.length')==2)
 for index in range(2):
  click(p,'resolve','.stack-window')
  check('Raft before-hook sequence executes exactly once for copy '+str(index+1),state(p,'state.players[0].mana.U')==index+1 and not obj(p,'Walking Atlas')['tapped'])
 prepare_land('Tree of Tales');click(p,'stack-hook','.stack-window');set_rule(p,name='Tap Atlas after all future Raft triggers',event='afterResolve',action='sequence',sequence=seq,scope='game');click(p,'rule-save');close(p)
 for index in range(2):
  click(p,'resolve','.stack-window')
  check('Raft after-hook sequence runs after each resolving copy '+str(index+1),state(p,'state.players[0].mana.U')==index+3 and obj(p,'Walking Atlas')['tapped'])
 open_rules(p);p.locator('[data-rule-toggle]').last.uncheck()
 check('rest-of-game resolution shortcut can be toggled without deletion',p.evaluate('astra.programs.model.rules.length')==2 and not p.evaluate('astra.programs.model.rules.at(-1).enabled'))
 shot(p,'18-raft-stack-shortcuts.png')

def sequence_controls(p):
 fixture(p,'program-repeat');open_programs(p);click(p,'sequence-record');activate(p,'Grim Monolith','mana');activate(p,'Grim Monolith','untap');pay(p);click(p,'resolve','.stack-window')
 open_programs(p);p.locator('#sequence-name').fill('Monolith cycle');click(p,'sequence-save');seq=p.evaluate('astra.programs.model.sequences[0].id')
 p.locator('[data-repeat="'+seq+'"]').fill('3');click(p,'sequence-repeat');p.wait_for_function('()=>!astra.programs.running')
 check('UI repeat completes three fully checked resettable iterations',state(p,'state.players[0].mana.C')==6 and not obj(p,'Grim Monolith')['tapped'])
 p.keyboard.press('Backspace');check('one undo reverses exactly one complete loop iteration',state(p,'state.players[0].mana.C')==7)
 open_programs(p);p.locator('[data-sequence-name]').fill('Renamed loop');p.locator('[data-sequence-name]').press('Tab');check('sequence name edits persist',p.evaluate('astra.programs.model.sequences[0].name')=='Renamed loop')
 p.locator('.sequence-card details summary').click();before=p.evaluate('astra.programs.model.sequences[0].steps.map(s=>s.label)');p.locator('[data-action="sequence-step"][data-index="0"][data-direction="1"]').click()
 check('recorded step down arrow reorders the saved sequence',p.evaluate('astra.programs.model.sequences[0].steps[1].label')==before[0])
 p.locator('.sequence-card details summary').click();p.locator('[data-action="sequence-step"][data-index="1"][data-direction="-1"]').click();check('recorded step up arrow can restore the original order',p.evaluate('astra.programs.model.sequences[0].steps.map(s=>s.label)')==before)
 p.locator('.sequence-card details summary').click();p.locator('[data-action="sequence-step"][data-index="0"][data-direction="remove"]').click();check('step removal is explicit and leaves other steps intact',p.evaluate('astra.programs.model.sequences[0].steps.length')==len(before)-1)
 click(p,'sequence-delete');check('unused sequence can be deleted',p.evaluate('astra.programs.model.sequences.length')==0)
 click(p,'sequence-record');open_programs(p);click(p,'sequence-save');check('empty recording is rejected without losing the recorder',p.locator('#toast.error').count()==1 and p.evaluate('astra.programs.recording') is not None);click(p,'sequence-discard');check('recording can be discarded without altering game state',p.evaluate('astra.programs.recording') is None)
 close(p);fixture(p,'program-stop');open_programs(p);click(p,'sequence-record');activate(p,'Grim Monolith','mana');activate(p,'Grim Monolith','untap');pay(p);click(p,'resolve','.stack-window');open_programs(p);click(p,'sequence-save')
 seq=p.evaluate('astra.programs.model.sequences[0].id');p.locator('[data-repeat="'+seq+'"]').fill('500');click(p,'sequence-repeat');p.keyboard.press('Escape');p.wait_for_function('()=>!astra.programs.running')
 check('Escape stops a long repetition between intact iterations',state(p,'state.players[0].mana.C')>499 and not obj(p,'Grim Monolith')['tapped'])

def new_controls_persistence(p):
 fixture(p,'grid-entries');click(p,'zone',extra='[data-zone="graveyard"]');o=obj(p,'Ancient Den','graveyard');b=card(p,o['id'],'graveyard').bounding_box();drag(p,b['x']+20,b['y']+20,b['x']+50,b['y']+200)
 menu(p,'settings');p.locator('[data-auto-accept]').check();close(p)
 snapshot=p.evaluate('astra.exported()');expected=p.evaluate('({grids:astra.ui.grids,location:astra.engine.object("'+o['id']+'").location})')
 menu(p,'save');p.locator('#session-file').set_input_files({'name':'grid-prefs.json','mimeType':'application/json','buffer':json.dumps(snapshot).encode()});p.wait_for_function('(id)=>astra.engine.object(id)?.location?.x!==undefined',arg=o['id'])
 check('detached grids and auto-accept setting survive a real session import',p.evaluate('({grids:astra.ui.grids,location:astra.engine.object("'+o['id']+'").location})')==expected and p.evaluate('astra.prefs.autoAccept'))
 if args.memory:
  skipped.append('new grid/automation preferences survive HTTP reload');return
 p.evaluate('astra.flushSave()');p.reload();p.wait_for_function('()=>window.astra?.engine')
 check('HTTP reload restores detached grid slots, coordinates and auto-accept preference',p.evaluate('({grids:astra.ui.grids,location:astra.engine.object("'+o['id']+'").location})')==expected and p.evaluate('astra.prefs.autoAccept'))

def rule_edit_validation(p):
 fixture(p,'priority-stack');open_rules(p);click(p,'rule-new');set_rule(p,name='Needs a sequence',action='sequence');before=checksum(p);click(p,'rule-save')
 check('rule editor rejects missing sequence without changing the game',p.locator('#toast.error').count()==1 and p.locator('#rule-form').count()==1 and checksum(p)==before)
 set_rule(p,action='hold',event='untapped',card=cid(p,'Grinding Station'),scope='game');click(p,'rule-condition-add');p.locator('#condition-card-0').select_option(cid(p,'Urza, Lord High Artificer'));click(p,'rule-save')
 rid=p.evaluate('astra.programs.model.rules[0].id');click(p,'rule-edit');set_rule(p,name='Edited priority rule',match='any');click(p,'rule-condition-add');p.locator('#condition-card-1').select_option(cid(p,'Clock of Omens'));click(p,'rule-save')
 check('Edit updates the same rule and adds conditions without duplicates',p.evaluate('astra.programs.model.rules.length')==1 and p.evaluate('astra.programs.model.rules[0].id')==rid and p.evaluate('astra.programs.model.rules[0].conditions.length')==2 and p.evaluate('astra.programs.model.rules[0].name')=='Edited priority rule')
 click(p,'rule-edit');click(p,'rule-condition-remove');click(p,'rule-save');check('condition removal updates only the chosen condition',p.evaluate('astra.programs.model.rules[0].conditions.length')==1)
 click(p,'rule-delete');check('explicit rule deletion removes its saved configuration',p.evaluate('astra.programs.model.rules.length')==0)
