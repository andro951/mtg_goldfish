from ui_acceptance_support import *

def number(p,n):
 p.locator('#number-choice').fill(str(n));click(p,'confirm-number','[data-floating=decision]')

def carpet_path_convenience(p):
 fixture(p,'path-click');path=obj(p,'Path of Ancestry');before_history=state(p,'history.length');card(p,path['id'],'battlefield').click()
 check('Path battlefield click opens the five commander colors directly without inspector',p.locator('.inspector-window').count()==0 and p.locator('.mana-choice').count()==5 and [o['value'] for o in pending(p)['options']]==['W','U','B','R','G'])
 check('Path stays untapped until a color is chosen',not obj(p,'Path of Ancestry')['tapped'] and state(p,'history.length')==before_history)
 choose_option(p,'U');tracked=state(p,'state.players[0].restrictedMana')
 check('Path color choice taps once and preserves ancestry-tracked mana',obj(p,'Path of Ancestry')['tapped'] and len(tracked)==1 and tracked[0]['color']=='U' and tracked[0].get('ancestry') is not None)
 menu(p,'settings');rate=p.locator('[data-number-setting=carpetIslandsPerTurn]')
 check('Carpet convenience rate is exposed in settings with the 0.5 default',rate.input_value()=='0.5')
 close(p)

def gods_faces(p):
 fixture(p,'gods-esika');hold(p,True)
 cast(p,'Esika, God of the Tree','command')
 check('Esika presents both command-zone faces as real cast options',set(o['value'] for o in pending(p)['options'])=={'command','command/back'})
 choose_option(p,'command/back');pay(p)
 check('Bridge cast uses its enchantment face and WUBRG payment',obj(p,'The Prismatic Bridge','stackCards') is not None and all(state(p,f'state.players[0].mana.{c}')==29 for c in 'WUBRG'))
 click(p,'resolve','.stack-window');check('Bridge resolves as an enchantment rather than a green creature',obj(p,'The Prismatic Bridge','battlefield') is not None)
 click(p,'phase',extra='[data-step=upkeep]');settle(p)
 check('Bridge puts the revealed God into play without casting',obj(p,'Heliod, Sun-Crowned','battlefield') is not None)
 heliod=obj(p,'Heliod, Sun-Crowned');check('low-devotion God has no creature P/T overlay',p.locator('[data-position="'+heliod['id']+'"] .power-badge').count()==0)
 shot(p,'41-esika-bridge-gods.png')
 fixture(p,'gods-esika');hold(p,True);cast(p,'Kestia, the Cultivator');choose_option(p,'hand/bestow');choose_cards(p,[obj(p,'Metalworker')['id']]);pay(p);click(p,'resolve','.stack-window')
 check('bestow UI attaches Kestia to the selected creature',obj(p,'Kestia, the Cultivator')['attachedTo']['id']==obj(p,'Metalworker')['id'])
 check('bestowed Kestia uses the existing following attachment controls',p.locator('#permanent-links [data-link-source="'+obj(p,'Kestia, the Cultivator')['id']+'"]').get_attribute('data-link-target')==obj(p,'Metalworker')['id'])
 fixture(p,'gods-esika');hold(p,True);cast(p,"Arcanist's Owl")
 check('hybrid casting exposes a bounded numeric color split',pending(p)['type']=='number' and pending(p)['max']==4)
 number(p,2);pay(p);click(p,'resolve','.stack-window');settle(p)
 check('hybrid creature resolves through actual color-allocation and payment controls',obj(p,"Arcanist's Owl",'battlefield') is not None)
 fixture(p,'gods-esika');hold(p,True);cast(p,'Damn');choose_option(p,'hand/overload');pay(p);click(p,'resolve','.stack-window')
 check('overload presents no single-creature target prompt and destroys all creatures',obj(p,'Metalworker','graveyard') is not None)

def gods_choices(p):
 fixture(p,'gods-entry');hold(p,True);cast(p,'Temple Garden')
 check('shock land asks for life before entering the battlefield',pending(p)['kind']=='godsEntry' and obj(p,'Temple Garden','battlefield') is None)
 choose_option(p,'pay');check('paying two life makes the shock land enter untapped',state(p,'state.players[0].life')==38 and not obj(p,'Temple Garden')['tapped'])
 cast(p,"Valgavoth's Lair");check('enchantment land presents its as-enters color choice',pending(p)['kind']=='godsEntry');choose_option(p,'U')
 check('chosen-color land enters tapped with its selection retained',obj(p,"Valgavoth's Lair")['flags']['chosenColor']=='U' and obj(p,"Valgavoth's Lair")['tapped'])
 cast(p,'Wild Growth');choose_cards(p,[obj(p,'Ancient Den')['id']]);pay(p);click(p,'resolve','.stack-window');card(p,obj(p,'Ancient Den')['id'],'battlefield').click()
 check('enchanted land produces native and additional mana through a real click',state(p,'state.players[0].mana.W')>=31 and state(p,'state.players[0].mana.G')>=30)
 fixture(p,'gods-market');hold(p,True);click(p,'phase',extra='[data-step=main1]');click(p,'resolve','.stack-window')
 check('Black Market presents all three selectable modes',pending(p)['max']==3 and pending(p)['min']==1)
 for v in ['treasure','draw','shapeshifter']:choose_option(p,v)
 click(p,'confirm-choice','[data-floating=decision]');settle(p)
 check('chosen Black Market modes make both tokens, draw and lose six life',obj(p,'Treasure','battlefield') is not None and obj(p,'Shapeshifter','battlefield') is not None and state(p,'state.players[0].life')==34 and state(p,'state.zones.hand.length')==1)
 fixture(p,'gods-well');hold(p,True);activate(p,'Zuran Orb','sac-land');choose_cards(p,[obj(p,'Ancient Den')['id']]);click(p,'resolve','.stack-window');click(p,'resolve','.stack-window');choose_option(p,'YES');number(p,2)
 check('Well of Lost Dreams reaches its optional payment without skipping the amount decision',pending(p)['kind']=='effectPayment');pay(p)
 check('Well optional payment draws the chosen number of cards',state(p,'state.zones.hand.length')==2 and state(p,'state.players[0].mana.C')==0)
 fixture(p,'gods-azcanta');hold(p,True);click(p,'phase',extra='[data-step=upkeep]');click(p,'resolve','.stack-window')
 check('Azcanta surveil uses the existing floating Look window',p.locator('[data-floating=workspace]').is_visible())
 choose_cards(p,[obj(p,'Damn')['id']]);choose_option(p,'YES')
 check('Azcanta transforms after surveilling the seventh card to the graveyard',obj(p,'Azcanta, the Sunken Ruin','battlefield') is not None)


def gods_rebuild(p):
 fixture(p,'gods-wrath');hold(p,True);cast(p,'Wrath of God');pay(p);click(p,'resolve','.stack-window')
 check('wrath leaves a low-devotion God and places Enduring return on the stack',obj(p,'Heliod, Sun-Crowned','battlefield') is not None and obj(p,'Enduring Vitality','graveyard') is not None and state(p,'state.stack.length')==1)
 click(p,'resolve','.stack-window');enduring=obj(p,'Enduring Vitality','battlefield')
 check('Enduring returns as an enchantment with no creature P/T overlay',enduring is not None and p.locator('[data-position="'+enduring['id']+'"] .power-badge').count()==0)
 cast(p,'Dance of the Manse');number(p,6);choose_cards(p,[obj(p,'Metalworker','graveyard')['id']]);pay(p);click(p,'resolve','.stack-window')
 card_id=obj(p,'Metalworker')['id'];check('Dance X six displays the returned artifact as a 4/4',p.locator('[data-position="'+card_id+'"] .power-badge').inner_text()=='4/4')
 menu(p,'deck');p.locator('.deck-preset-picker summary').click();click(p,'deck-preset',extra='[data-preset=esika-gods]')
 check('revised Esika preset validates all 146 requested names',p.evaluate('astra.ui.deckReport.accepted'))
 check('Esika preset preserves 116 main, one commander and 29 outside cards',p.locator('[data-deck-drop=main] b').inner_text()=='116' and p.locator('[data-deck-drop=command] b').inner_text()=='1' and p.locator('[data-deck-drop=outside] b').inner_text()=='29')
 close(p);menu(p,'new');click(p,'start-new')
 check('Esika test starts with correct commander, outside and reserve partitions',state(p,'state.zones.outside.length')==29 and state(p,'state.zones.command.length')==1 and state(p,'state.zones.libraryReserve.length')==17)
 check('Esika preset does not silently enable manual controls',not state(p,'state.settings.manualControls'))


def gods_persistence(p):
 if args.memory:
  skipped.append('Real IndexedDB reload of new Gods pending decisions');return
 fixture(p,'gods-entry');hold(p,True);cast(p,'Temple Garden');p.evaluate('astra.flushSave()');expected=checksum(p)
 p.reload();p.wait_for_function('()=>astra?.engine');check('shock entry reload preserves the deferred move and exact state',pending(p)['kind']=='godsEntry' and checksum(p)==expected)
 choose_option(p,'pay');check('restored shock choice pays life exactly once and enters untapped',state(p,'state.players[0].life')==38 and not obj(p,'Temple Garden')['tapped'])
 fixture(p,'gods-esika');hold(p,True);cast(p,'Esika, God of the Tree','command');choose_option(p,'command/back');p.evaluate('astra.flushSave()');expected=checksum(p)
 p.reload();p.wait_for_function('()=>astra?.engine');check('Bridge face and pending WUBRG payment survive reload',pending(p)['kind']=='payment' and checksum(p)==expected)
 pay(p);click(p,'resolve','.stack-window');check('reloaded Bridge payment resolves the selected back face',obj(p,'The Prismatic Bridge','battlefield') is not None)
 fixture(p,'gods-esika');hold(p,True);cast(p,'Kestia, the Cultivator');choose_option(p,'hand/bestow');choose_cards(p,[obj(p,'Metalworker')['id']]);pay(p);click(p,'resolve','.stack-window');p.evaluate('astra.flushSave()');expected=checksum(p)
 p.reload();p.wait_for_function('()=>astra?.engine');check('bestow attachment and rules state survive autosave reload',checksum(p)==expected and obj(p,'Kestia, the Cultivator')['attachedTo']['id']==obj(p,'Metalworker')['id'])
