from ui_acceptance_support import *

def expansion_controls(p):
 check('new game resource controls default to read-only',not state(p,'state.settings.manualControls') and p.locator('.rail [data-action=mana],.rail [data-action=resource],.rail [data-action=clear-mana]').count()==0)
 check('read-only player totals remain usable arrow endpoints',p.locator('[data-player-target]').count()==4)
 fixture(p,'expanded-automatic');hold(p,True)
 check('imported expansion fixture does not enable manual controls',not state(p,'state.settings.manualControls'))
 activate(p,'Ancient Den','mana');check('legal land activation updates read-only mana automatically',state(p,'state.players[0].mana.W')==1)
 activate(p,'Krark-Clan Ironworks','sacrifice');choose_cards(p,[obj(p,'Ancient Den')['id']]);settle(p)
 check('sacrifice updates colorless mana and Marvel energy without manual controls',state(p,'state.players[0].mana.C')==2 and state(p,'state.players[0].energy')==1)
 cast(p,'Tree of Tales');settle(p);check('artifact land entry automatically adds Gonti energy',state(p,'state.players[0].energy')==3)
 activate(p,'Zuran Orb','sac-land');choose_cards(p,[obj(p,'Tree of Tales')['id']]);settle(p)
 check('land sacrifice updates life through its ability, not manual adjustments',state(p,'state.players[0].life')==42)
 manual_controls(p,True);check('manual controls opt-in reveals adjustment buttons',p.locator('.rail [data-action=mana]').count()==12)
 p.locator('[data-action=mana][data-color=U][data-delta="1"]').click();check('opted-in resource adjustment works',state(p,'state.players[0].mana.U')==1)
 manual_controls(p,False);check('turning manual controls off removes all adjustment affordances again',p.locator('.rail [data-action=mana],.rail [data-action=resource]').count()==0)
 snapshot=p.evaluate('astra.exported()');check('manual control setting is retained in portable session and preferences',not snapshot['currentState']['settings']['manualControls'] and not snapshot['uiLayout']['manualControls'])
 shot(p,'19-read-only-resources.png')

def expansion_payments(p):
 fixture(p,'expanded-payment');hold(p,True);cast(p,'Walking Atlas')
 check('generic payment automatically selects the largest remaining color pool',p.locator('#pay-U').input_value()=='2' and p.locator('#pay-G').input_value()=='0' and p.locator('#pay-R').input_value()=='0')
 click(p,'pay','[data-floating=decision]');click(p,'resolve','.stack-window');check('payment consumes only the suggested largest pool',state(p,'state.players[0].mana.U')==6 and state(p,'state.players[0].mana.G')==3)
 cast(p,'Growth Spiral');check('required colored symbols remain reserved, not replaced by generic preference',p.locator('#pay-U').input_value()=='1' and p.locator('#pay-G').input_value()=='1')
 p.keyboard.press('Escape');check('cancelling the quote leaves its mana unchanged',state(p,'state.players[0].mana.U')==6 and state(p,'state.players[0].mana.G')==3)
 check('largest-pool payment flow needs no manual controls',not state(p,'state.settings.manualControls'))

# Every interaction uses the actual UI; fixtures arrive through session import.
def expansion_arrows(p):
 fixture(p,'expanded-arrows');hold(p,True);activate(p,'Tideforce Elemental','tideforce');choose_cards(p,[obj(p,'Walking Atlas')['id']]);pay(p)
 p.wait_for_selector('#target-links [data-link-stack]');p.mouse.move(1710,870);p.wait_for_timeout(140)
 target=obj(p,'Walking Atlas')['id'];arrow=p.locator('#target-links [data-link-target="'+target+'"]')
 check('activated effect has a declared-target arrow to the selected creature',arrow.count()==1)
 check('target arrows are mostly transparent at rest',float(arrow.evaluate('(e)=>getComputedStyle(e).opacity'))<.2)
 stack=p.locator('.stack-card').first;stack.hover();p.wait_for_timeout(150);check('hovering the corresponding stack effect emphasizes its arrow',float(arrow.evaluate('(e)=>getComputedStyle(e).opacity'))>.8)
 stack.click();p.mouse.move(1710,870);p.wait_for_timeout(150);check('selecting a stack effect keeps its arrow emphasized',arrow.evaluate('(e)=>e.classList.contains("emphasized")'))
 click(p,'close-inspector');before=arrow.locator('path').get_attribute('d');b=card(p,target,'battlefield').bounding_box();drag(p,b['x']+30,b['y']+30,b['x']+90,b['y']+100);p.wait_for_timeout(100)
 check('target arrow follows actual card drag placement',arrow.locator('path').get_attribute('d')!=before)
 before=arrow.locator('path').get_attribute('d');surface=p.locator('[data-surface=battlefield]').bounding_box();p.mouse.move(surface['x']+200,surface['y']+200);p.mouse.wheel(0,-100);p.wait_for_timeout(150)
 check('target arrows update with battlefield zoom',arrow.locator('path').get_attribute('d')!=before)
 before=arrow.locator('path').get_attribute('d');header=p.locator('.stack-window .float-header').bounding_box();drag(p,header['x']+30,header['y']+10,header['x']+80,header['y']+50);p.wait_for_timeout(150)
 check('target arrows follow movable stack window',arrow.locator('path').get_attribute('d')!=before)
 check('arrows cannot intercept pointer input',p.locator('#target-links').evaluate('(e)=>getComputedStyle(e).pointerEvents')=='none')
 menu(p);check('target overlay hides behind application menus',not p.locator('#target-links').is_visible());close(p)
 shot(p,'20-stack-target-arrows.png')
 click(p,'resolve','.stack-window');check('target arrows remain visible while effect waits on a resolution choice',arrow.count()==1)
 choose_option(p,'untap');check('finished effect removes its target arrow',p.locator('#target-links [data-link-stack]').count()==0)
 activate(p,'Codex Shredder','mill');choose_option(p,2);p.wait_for_selector('#target-links [data-link-target="player:2"]')
 check('player targets point at the correct opponent total',p.locator('#target-links [data-link-target="player:2"]').count()==1);click(p,'resolve','.stack-window')
 activate(p,'Buried Ruin','recover');choose_cards(p,[obj(p,'Sol Ring','graveyard')['id']]);pay(p);p.wait_for_timeout(100)
 check('hidden graveyard target uses a dashed zone endpoint',p.locator('#target-links .target-link.offscreen').count()==1)
 click(p,'zone',extra='[data-zone="graveyard"]');p.wait_for_timeout(100);check('opening graveyard moves target arrow to actual card',p.locator('#target-links .target-link.offscreen').count()==0)
 click(p,'resolve','.stack-window');check('resolved graveyard target clears arrow and returns the card',obj(p,'Sol Ring','hand') is not None)


def expansion_lists(p):
 menu(p,'deck');check('visual editor includes the complete 310-card union',p.locator('.deck-browser-card').count()==310)
 for name in ['Thrasios, Triton Hero','Captain Kathryn Janeway','Omni-Cheese Pizza','Transmute Artifact','Gifts Ungiven','Mox Jasper','Perennial Behemoth']:
  p.locator('#deck-search').fill(name);check('supported database finds '+name,p.locator('.deck-browser-card').count()==1)
 p.locator('#deck-search').fill('');p.locator('.deck-preset-picker summary').click();click(p,'deck-preset',extra='[data-preset=expanded]')
 check('first supplied list loads all 292 physical copies without dropping the duplicate',p.evaluate('astra.ui.deckReport.accepted') and p.evaluate('astra.ui.deckText.includes("2 Arcbound Ravager")'))
 check('first list validates its 104-card reserve',p.evaluate('astra.ui.deckReport.construction.reserveOrder.length')==104)
 close(p);menu(p,'new');click(p,'start-new');check('first supplied pool starts with its 88 outside cards and 99 active cards',state(p,'state.zones.outside.length')==88 and p.evaluate('astra.engine.state.zones.hand.length+astra.engine.state.zones.libraryActive.length')==99)
 menu(p,'deck');p.locator('.deck-preset-picker summary').click();click(p,'deck-preset',extra='[data-preset=refined]');check('second supplied list validates without removing any name',p.evaluate('astra.ui.deckReport.accepted') and p.evaluate('astra.ui.deckReport.construction.reserveOrder.length')==27)
 close(p);menu(p,'new');click(p,'start-new');check('second supplied pool starts with correct 27 reserve and 41 outside copies',state(p,'state.zones.libraryReserve.length')==27 and state(p,'state.zones.outside.length')==41)


def expansion_suspend(p):
 fixture(p,'expanded-suspend');hold(p,True)
 for name in ['Lotus Bloom','Mox Tantalite','Sol Talisman']:
  inspect(p,name,'hand');check(name+' has a Suspend action instead of an illegal normal Cast',p.locator('.inspector-window [data-action=suspend]').count()==1 and p.locator('.inspector-window [data-action=cast]').count()==0)
  click(p,'suspend','.inspector-window')
  if pending(p) and pending(p)['kind']=='payment':pay(p)
  check(name+' starts suspended with three time counters',obj(p,name,'exile')['counters']['time']==3)
 for turn in range(3):
  click(p,'next-turn')
  for _ in range(100):
   q=pending(p)
   if q:
    if q['kind']=='castWindow':choose_cards(p,[q['candidates'][0]])
    elif q['kind']=='triggerOrder' or q.get('ordered'):click(p,'confirm-choice','[data-floating=decision]')
    else:raise AssertionError('Unexpected suspend prompt '+json.dumps(q))
   elif state(p,'state.stack.length'):click(p,'resolve','.stack-window')
   else:break
 for name in ['Lotus Bloom','Mox Tantalite','Sol Talisman']:check(name+' is legally cast after three upkeep removals',obj(p,name,'battlefield') is not None)
 check('Suspend line completes without manual resource mode',not state(p,'state.settings.manualControls'))


def expansion_mechanics(p):
 fixture(p,'expanded-improvise');hold(p,True);cast(p,'Whir of Invention');p.locator('#number-choice').fill('3');click(p,'confirm-number','[data-floating=decision]')
 check('improvise is a visible additional artifact-tap choice',pending(p)['key']=='improvise')
 choose_cards(p,[obj(p,n)['id'] for n in ['Ancient Den','Tree of Tales','Mox Amber']]);pay(p);click(p,'resolve','.stack-window')
 check('improvise preserves blue requirements and opens artifact tutor',state(p,'state.players[0].mana.U')==0 and pending(p)['kind']=='effectChoice')
 choose_cards(p,[obj(p,'Scrap Trawler','libraryActive')['id']]);check('Whir finds the chosen artifact and puts it onto battlefield',obj(p,'Scrap Trawler','battlefield') is not None)
 fixture(p,'expanded-dredge');hold(p,True);click(p,'next-turn');q=pending(p)
 check('draw step offers an actual dredge replacement',q['kind']=='dredge');choose_option(p,q['options'][1]['value']);settle(p)
 check('Life from the Loam returns and mills three instead of drawing',obj(p,'Life from the Loam','hand') is not None and state(p,'state.zones.graveyard.length')==3)
 fixture(p,'expanded-choices');hold(p,True);cast(p,'Intuition');choose_option(p,1);pay(p);click(p,'resolve','.stack-window')
 picks=[obj(p,n,'libraryActive')['id'] for n in ['Ancient Den','Walking Atlas','Krark-Clan Ironworks']];choose_cards(p,picks)
 check('Intuition asks the chosen opponent to select from all three cards',pending(p)['label'].startswith('Opponent 1'))
 choose_cards(p,[picks[2]]);check('Intuition puts exactly the opponent-chosen card in hand and the other two in graveyard',obj(p,'Krark-Clan Ironworks','hand') is not None and obj(p,'Walking Atlas','graveyard') is not None and obj(p,'Ancient Den','graveyard') is not None)
 fixture(p,'expanded-discover');hold(p,True);click(p,'phase',extra='[data-step=end]');click(p,'resolve','.stack-window');q=pending(p);choose_cards(p,[q['candidates'][0]]);settle(p)
 check('discover can cast its revealed eligible spell through the real UI',obj(p,'Sol Ring','battlefield') is not None)
 fixture(p,'expanded-warp');hold(p,True);cast(p,'Eusocial Engineering');q=pending(p);choose_option(p,next(o['value'] for o in q['options'] if 'Warp' in o['label']));pay(p);settle(p);cast(p,'Ancient Den');settle(p)
 check('warp-cast permanent generates its landfall artifact token',obj(p,'Robot','battlefield') is not None)
 click(p,'phase',extra='[data-step=end]');settle(p);check('warped permanent exiles itself at end step',obj(p,'Eusocial Engineering','exile') is not None)


def expansion_combat(p):
 fixture(p,'expanded-combat');hold(p,True);click(p,'phase',extra='[data-step=attackers]');click(p,'dialog',extra='[data-dialog=combat]');akiri=obj(p,'Akiri, Line-Slinger')['id'];p.locator('[data-attacker="'+akiri+'"]').check();click(p,'attack-confirm')
 click(p,'phase',extra='[data-step=damage]');check('normal mode provides calculated unblocked combat damage instead of resource edits',p.locator('[data-action=combat-auto]').count()==1 and p.locator('[data-dialog=damage]').count()==0)
 click(p,'combat-auto');check('first strike damage uses actual Akiri power',state(p,'state.players[1].life')==38)
 click(p,'combat-auto');check('normal damage step does not double-count a first-strike-only attacker',state(p,'state.players[1].life')==38 and p.locator('[data-action=combat-auto]').is_disabled())
 check('vigilance preserves untapped attacker without a manual untap',not obj(p,'Akiri, Line-Slinger')['tapped'])
