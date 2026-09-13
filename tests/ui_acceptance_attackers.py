from ui_acceptance_support import *


def picked(p,name):
 o=obj(p,name,'battlefield')
 return p.locator('[data-surface=battlefield] [data-card="'+o['id']+'"] .face').get_attribute('aria-pressed')=='true'


def attacker_clicks(p):
 fixture(p,'click-attack');hold(p,True)
 initial=checksum(p);cursor=state(p,'cursor');iron=obj(p,'Iron Man, Titan of Innovation');metal=obj(p,'Metalworker');atlas=obj(p,'Walking Atlas')
 card(p,iron['id'],'battlefield').click()
 check('plain creature click selects an attacker without opening an inspector',picked(p,'Iron Man, Titan of Innovation') and not p.locator('.inspector-window').count())
 card(p,metal['id'],'battlefield').click()
 check('mana creature click selects for combat instead of activating mana',picked(p,'Metalworker') and not obj(p,'Metalworker')['tapped'] and not pending(p))
 check('two attacker picks preserve the exact game state and history',checksum(p)==initial and state(p,'cursor')==cursor and state(p,'state.stack.length')==0)
 check('attacker selection does not populate the group-drag selection',p.evaluate('astra.ui.selected.size')==0)
 colors=p.locator('.toolbar [data-action=attack-confirm]').evaluate('(e)=>({background:getComputedStyle(e).backgroundColor,color:getComputedStyle(e).color})')
 check('declaration button has a filled high-contrast background',colors['background']!='rgba(0, 0, 0, 0)' and colors['background']!=colors['color'],colors)
 check('toolbar offers direct simultaneous declaration with selected count','(2)' in p.locator('.toolbar [data-action=attack-confirm]').inner_text())
 border=p.locator('[data-card="'+metal['id']+'"] .face').evaluate('(e)=>({width:getComputedStyle(e).outlineWidth,style:getComputedStyle(e).outlineStyle})')
 check('picked attacker has an actual visible outline',border['style']=='solid' and float(border['width'].replace('px',''))>=3,border)
 card(p,metal['id'],'battlefield').click();check('second creature click deselects the attacker',not picked(p,'Metalworker') and '(1)' in p.locator('.toolbar [data-action=attack-confirm]').inner_text())
 # Keyboard uses the same button route and keeps focus between toggles.
 card(p,metal['id'],'battlefield').focus();p.keyboard.press('Enter');check('Enter selects the focused creature as an attacker',picked(p,'Metalworker'))
 p.keyboard.press('Enter');check('second Enter deselects without losing keyboard focus',not picked(p,'Metalworker') and card(p,metal['id'],'battlefield').evaluate('(e)=>document.activeElement===e'))
 card(p,atlas['id'],'battlefield').click(button='right');check('right-click still opens the creature inspector',p.locator('.inspector-window').count()==1 and not picked(p,'Walking Atlas'))
 click(p,'close-inspector');card(p,atlas['id'],'battlefield').click();check('normal click returns to attack selection after inspection',picked(p,'Walking Atlas') and not p.locator('.inspector-window').count())
 # Dragging a picked card is movement, not another toggle. Other picks do not
 # become an accidental movement group.
 before=p.evaluate('(ids)=>Object.fromEntries(astra.ui.layouts.battlefield.filter(c=>ids.includes(c.id)).map(c=>[c.id,{x:c.x,y:c.y}]))',[atlas['id'],iron['id']])
 r=card(p,atlas['id'],'battlefield').bounding_box();drag(p,r['x']+r['width']*.5,r['y']+r['height']*.5,r['x']+r['width']*.5+35,r['y']+r['height']*.5+35)
 after=p.evaluate('(ids)=>Object.fromEntries(astra.ui.layouts.battlefield.filter(c=>ids.includes(c.id)).map(c=>[c.id,{x:c.x,y:c.y}]))',[atlas['id'],iron['id']])
 check('drag keeps the attacker pick and does not drag other selected attackers',picked(p,'Walking Atlas') and before[iron['id']]==after[iron['id']] and before[atlas['id']]!=after[atlas['id']])
 click(p,'dialog',extra='[data-dialog=combat]')
 check('Attack options opens with battlefield attacker picks checked',p.locator('[data-attacker="'+iron['id']+'"]').is_checked() and p.locator('[data-attacker="'+atlas['id']+'"]').is_checked())
 p.locator('[data-destination="'+iron['id']+'"]').select_option('2');close(p)
 check('closing Attack options preserves highlighted picks',picked(p,'Iron Man, Titan of Innovation') and picked(p,'Walking Atlas'))
 shot(p,'40-click-to-select-attackers.png')
 click(p,'next');check('Step does not silently discard selected attackers',p.locator('[data-attacker]').count()>0 and state(p,'state.step')=='attackers' and not state(p,'state.attackersDeclared'))
 close(p);click(p,'attack-confirm','.toolbar')
 check('direct declaration attacks the chosen opponents and taps the attackers',obj(p,'Iron Man, Titan of Innovation')['flags']['attacking']['player']==2 and obj(p,'Walking Atlas')['tapped'])
 check('Iron Man triggers exactly once when the chosen attackers are declared',state(p,'state.stack.length')==1 and state(p,'state.stack.at(-1).abilityId')=='upgrade')
 check('declaration removes draft controls and selection borders',not p.locator('.attack-selected').count() and not p.locator('.toolbar [data-action=attack-confirm]').count())
 p.keyboard.press('Backspace')
 check('undoing declaration restores untapped creatures without stale picks',not obj(p,'Walking Atlas')['tapped'] and not state(p,'state.attackersDeclared') and not picked(p,'Walking Atlas'))
 p.keyboard.press('Control+Shift+z');check('redo reproduces the one attack trigger',state(p,'state.stack.length')==1 and state(p,'state.attackersDeclared'))


def attacker_guards(p):
 fixture(p,'click-attack-illegal');hold(p,True)
 for name in ['Walking Atlas','Sakura-Tribe Scout','Metalworker','Elvish Reclaimer']:
  before=checksum(p);card(p,obj(p,name)['id'],'battlefield').click()
  check(name+' cannot be picked when ineligible, and clicking never taps or inspects it',not picked(p,name) and checksum(p)==before and not p.locator('.inspector-window').count())
 card(p,obj(p,'Urza, Lord High Artificer')['id'],'battlefield').click();click(p,'attack-confirm','.toolbar')
 check('haste allows attacking and vigilance keeps the creature untapped',obj(p,'Urza, Lord High Artificer')['flags']['attacking'] and not obj(p,'Urza, Lord High Artificer')['tapped'])
 # Main phase retains the previous click behavior.
 fixture(p,'click-attack-main');card(p,obj(p,'Walking Atlas')['id'],'battlefield').click()
 check('outside attackers step a creature click still inspects normally',p.locator('.inspector-window').count()==1 and not p.locator('.attack-selected').count())
 click(p,'close-inspector');card(p,obj(p,'Ancient Den')['id'],'battlefield').click()
 check('normal land mana shortcut remains unchanged outside combat',obj(p,'Ancient Den')['tapped'] and state(p,'state.players[0].mana.W')==1)
 fixture(p,'click-attack-payment');hold(p,True)
 # Clock's target picker owns creature clicks while it is asking for a target.
 activate(p,'Clock of Omens','untap');metal=obj(p,'Metalworker');card(p,metal['id'],'battlefield').click()
 check('pending target selection takes precedence over attacker picking',not picked(p,'Metalworker') and (metal['id'] in p.evaluate('astra.ui.choice') or (pending(p) and pending(p).get('key')!='target')))
 p.keyboard.press('Escape');p.keyboard.press('Escape')
 # Mana activation can still be explicitly reached in combat via the inspector.
 activate(p,'Metalworker','reveal-mana')
 check('right-click inspector still lets a mana creature activate during combat',pending(p) is not None and not p.locator('.attack-selected').count())
 p.keyboard.press('Escape')
 # During payment, an ordinary creature-mana click must still pay, not attack.
 cast(p,"Faith's Reward");check('instant payment remains available during the attackers step',pending(p)['kind']=='payment')
 card(p,obj(p,'Metalworker')['id'],'battlefield').click()
 choose_cards(p,[obj(p,'Mox Opal','hand')['id']])
 check('a mana creature click during payment adds mana without an attacker pick',pending(p)['kind']=='payment' and state(p,'state.players[0].mana.C')==2 and not picked(p,'Metalworker'))
 p.keyboard.press('Escape')
 check('cancelling the payment rolls back its mana activation',not obj(p,'Metalworker')['tapped'] and obj(p,"Faith's Reward",'hand') is not None)
 fixture(p,'click-attack');hold(p,True)
 card(p,obj(p,'Walking Atlas')['id'],'battlefield').click();click(p,'attack-clear')
 check('Clear deselects all attacker borders without changing the engine',not p.locator('.attack-selected').count() and not state(p,'state.attackersDeclared'))
 click(p,'attack-confirm','.toolbar');check('declaring no attackers is a valid single action',state(p,'state.attackersDeclared') and state(p,'state.stack.length')==0)


def attacker_saved_draft(p):
 fixture(p,'click-attack');hold(p,True);iron=obj(p,'Iron Man, Titan of Innovation');card(p,iron['id'],'battlefield').click()
 click(p,'dialog',extra='[data-dialog=combat]');p.locator('[data-destination="'+iron['id']+'"]').select_option('3');close(p)
 p.set_viewport_size({'width':1120,'height':800});p.wait_for_timeout(150)
 check('resize retains the attacker border',picked(p,'Iron Man, Titan of Innovation'))
 if args.memory:
  skipped.append('Attacker draft persists across actual IndexedDB reload');return
 p.evaluate('astra.flushSave()')
 before=checksum(p);p.reload();p.wait_for_function('()=>astra?.engine')
 check('autosave reload restores the uncommitted attacker pick without changing game state',picked(p,'Iron Man, Titan of Innovation') and checksum(p)==before)
 click(p,'dialog',extra='[data-dialog=combat]');check('autosave reload restores the chosen attack opponent',p.locator('[data-destination="'+iron['id']+'"]').input_value()=='3');close(p)
 # Export through the real download button and import through the real file UI.
 menu(p,'save')
 with p.expect_download() as download:click(p,'export-json','.modal')
 file=OUT/'attacker-draft-export.json';download.value.save_as(file)
 close(p);click(p,'attack-clear');menu(p,'save');p.locator('#session-file').set_input_files(str(file));p.wait_for_function('(id)=>astra.ui.attackDraft?.cards[id]?.selected',arg=iron['id'])
 check('session export/import restores the highlighted attacker',picked(p,'Iron Man, Titan of Innovation'))
 click(p,'attack-confirm','.toolbar');check('restored draft declares at its preserved opponent',obj(p,'Iron Man, Titan of Innovation')['flags']['attacking']['player']==3)
