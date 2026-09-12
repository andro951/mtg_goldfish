from ui_acceptance_support import *

def recursion(p):
 lab(p,'breakfast');base=checksum(p);activate(p,'Krark-Clan Ironworks','sacrifice');q=pending(p)
 check('KCI sacrifice presents legal image-only cost selection',q.get('cost') is True and p.locator('.decision-gallery .card').count()==len(q['candidates']))
 check('cost selector excludes nonartifact Minstrel',obj(p,'The Wandering Minstrel')['id'] not in q['candidates'])
 p.keyboard.press('Escape');check('Escape cancels a pending cost atomically',checksum(p)==base)
 activate(p,'Krark-Clan Ironworks','sacrifice');choose_cards(p,[obj(p,'Ancient Den')['id']]);settle(p)
 check('KCI sacrifice adds two colorless and sends selected land to graveyard',state(p,'state.players[0].mana.C')==6 and obj(p,'Ancient Den','graveyard'))
 after=checksum(p);p.keyboard.press('Backspace');check('undo reverses whole sacrifice including its choice',checksum(p)==base);p.keyboard.press('Control+Shift+z');check('redo repeats sacrifice exactly',checksum(p)==after)
 # Play an actual sacrifice / mass-return line, not only isolated buttons.
 activate(p,'Krark-Clan Ironworks','sacrifice');choose_cards(p,[obj(p,'Great Furnace')['id']]);settle(p)
 cast(p,'Open the Vaults');pay(p);check('mass recursion spell remains on stack with hold on',obj(p,'Open the Vaults','stackCards'))
 click(p,'resolve','.stack-window');settle(p)
 check('Open the Vaults returns lands and the original graveyard artifacts',all(obj(p,n,'battlefield') for n in ['Ancient Den','Great Furnace','Clock of Omens','Mox Amber','Razortide Bridge']))
 check('Minstrel replacement keeps returned dual land untapped',not obj(p,'Razortide Bridge')['tapped'])
 card(p,obj(p,'Mox Amber')['id'],'battlefield').click();choose_option(p,'G');check('reanimated Amber is immediately usable as a noncreature mana artifact',state(p,'state.players[0].mana.G')>=1)
 shot(p,'05-breakfast-played.png')

def libraries(p):
 lab(p,'library');check('legal top-card permission replaces deck back automatically',p.locator('.library-deck .playing-card').count()==1 and p.locator('.deck-back').count()==0)
 old=state(p,'state.zones.libraryActive.slice(0,3)');hand=state(p,'state.zones.hand.length');activate(p,"Sensei's Divining Top",'look');pay(p);click(p,'resolve','.stack-window');q=pending(p)
 check('Top creates an ordered workspace for multiple cards',q.get('ordered') and len(q.get('candidates',[]))==3)
 check('Look icon exists only while multi-card workspace is present',p.locator('[data-action=zone][data-zone=workspace]').count()==1)
 p.locator('[data-action=zone][data-zone=workspace]').click();check('Look workspace opens beside rather than instead of battlefield',p.locator('[data-surface=battlefield]').count()==1 and p.locator('[data-surface=workspace]').count()==1)
 p.locator('[data-action=order][data-index="0"][data-direction="1"]').click();click(p,'confirm-choice','[data-floating=decision]');settle(p)
 check('Top keeps hand size and applies top-first order',state(p,'state.zones.hand.length')==hand and state(p,'state.zones.libraryActive[0]')==old[1])
 activate(p,'Scroll Rack','rack');pay(p);click(p,'resolve','.stack-window');choose_cards(p,[obj(p,'Ancient Den','hand')['id']]);settle(p)
 check('Scroll Rack makes linked exchange without extra hand-size change',state(p,'state.zones.hand.length')==hand and obj(p,'Ancient Den','libraryActive'))
 lab(p,'library');click(p,'clear-mana');top=state(p,'top().id');p.locator(f'.library-deck [data-card="{top}"] .face').click();click(p,'cast','.inspector-window');q=pending(p)
 check('top card offers separate mana and Citadel life permissions',len(q.get('options',[]))>=2)
 value=next(o['value'] for o in q['options'] if 'Citadel' in o['label']);life=state(p,'state.players[0].life');choose_option(p,value);settle(p)
 check('Citadel alternative actually pays life without requiring mana',state(p,'state.players[0].life')==life-4 and obj(p,'The One Ring','battlefield'))


def triggers(p):
 lab(p,'landfall');inspect(p,'Tireless Provisioner');p.locator('.policies summary').click();p.locator('[data-policy]').select_option('ASK');cast(p,'Simic Growth Chamber')
 q=pending(p);check('simultaneous landfall triggers ask for resolution order',q['kind']=='triggerOrder' and len(q['options'])>=4)
 order=p.evaluate('astra.ui.choice.slice()');p.locator('[data-action=order][data-index="0"][data-direction="1"]').click();check('order arrows update actual chosen trigger order',p.evaluate('astra.ui.choice[0]')==order[1])
 shot(p,'06-trigger-popup.png');click(p,'confirm-choice','[data-floating=decision]')
 check('trigger stack uses source art and different effect border',p.locator('.stack-card.effect img').count()>=4)
 settle(p,remember=True)
 check('doubled Provisioner landfall makes two Treasures',state(p,"controlled().filter(o=>o.token&&astra.engine.definition(o).name==='Treasure').length")==2)
 key=p.evaluate("astra.registry.get('Tireless Provisioner').id+'/token-kind'");check('token preference is remembered per ability',p.evaluate('(k)=>astra.engine.state.optionalPreferences[k]',key)=='Treasure')
 menu(p,'settings');p.locator(f'[data-policy="{key}"]').select_option('ASK');check('remembered decision can be reset in Settings',p.evaluate('(k)=>astra.engine.state.optionalPreferences[k]',key)=='ASK');close(p)
 lab(p,'artifacts');activate(p,'Krark-Clan Ironworks','sacrifice');choose_cards(p,[obj(p,'Ancient Den')['id']]);settle(p,pay_optional=True)
 check('Duplicator payment schedules delayed copy',state(p,'state.delayed.length')>0)
 click(p,'phase',extra='[data-step=end]');settle(p,pay_optional=True)
 check('delayed copy survives source sacrifice',state(p,"controlled().some(o=>o.token&&astra.engine.definition(o).name==='Ancient Den')"))
 lab(p,'artifacts');cast(p,'Myr Battlesphere');settle(p);check('Battlesphere entry makes four Myr through actual trigger UI',state(p,"controlled().filter(o=>o.token&&astra.engine.definition(o).name==='Myr').length")==4)

def special(p):
 lab(p,'special');activate(p,'Tezzeret the Seeker','search');check('loyalty X ability shows number input',pending(p)['type']=='number')
 p.locator('#number-choice').fill('0');click(p,'confirm-number','[data-floating=decision]');click(p,'resolve','.stack-window');q=pending(p);choice=q['candidates'][0];choose_cards(p,[choice]);settle(p)
 check('X-zero artifact tutor enters selected artifact land',state(p,f'object("{choice}").zone')=='battlefield')
 before=checksum(p);activate(p,'Tezzeret the Seeker','animate');check('illegal second loyalty activation changes no state',checksum(p)==before)
 activate(p,'Shorikai, Genesis Engine','crew');ids=p.evaluate("astra.engine.controlled().filter(o=>astra.engine.definition(o).name==='Pilot').map(o=>o.id)");choose_cards(p,ids[:3]);settle(p)
 check('three Pilots pay crew eight',p.evaluate("astra.engine.characteristics(Object.values(astra.engine.state.instances).find(o=>o.zone==='battlefield'&&astra.engine.definition(o).name==='Shorikai, Genesis Engine')).types.includes('Creature')"))
 click(p,'phase',extra='[data-step=attackers]');settle(p);click(p,'dialog',extra='[data-dialog=combat]');ship=obj(p,'Shorikai, Genesis Engine');p.locator(f'[data-attacker="{ship["id"]}"]').check();p.locator(f'[data-destination="{ship["id"]}"]').select_option('2');click(p,'attack-confirm','.modal')
 check('combat declaration taps selected creature and records opponent',obj(p,'Shorikai, Genesis Engine')['tapped'] and obj(p,'Shorikai, Genesis Engine')['flags'].get('attacking'))
 click(p,'dialog',extra='[data-dialog=damage]');p.locator('#damage-player').select_option('2');p.locator('#damage-amount').fill('8');click(p,'damage-confirm','.modal');check('manual combat damage applies to chosen opponent',state(p,'state.players[2].life')==32)
 lab(p,'special');activate(p,'Urza, Lord Protector','meld');settle(p);check('meld combines components into seven-loyalty planeswalker',obj(p,'Urza, Planeswalker','battlefield')['counters']['loyalty']==7)
 lab(p,'special');cast(p,'Uthros Research Craft');settle(p);activate(p,'Uthros Research Craft','station');choose_cards(p,[obj(p,'Pilot')['id']]);settle(p);check('station taps selected creature and adds power',obj(p,'Pilot')['tapped'] and obj(p,'Uthros Research Craft')['counters']['charge']==1)

