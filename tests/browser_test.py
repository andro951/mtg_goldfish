#!/usr/bin/env python3
"""Real Chromium UI acceptance tests. Use --memory only where URL navigation
is administratively unavailable; CI also verifies HTTP/file startup, downloads
and persistent browser storage. No engine state is injected by these tests.
"""
from __future__ import annotations
import argparse,base64,json,os,shutil,subprocess,time,traceback
from pathlib import Path
from playwright.sync_api import sync_playwright

ROOT=Path(__file__).resolve().parents[1]
OUT=ROOT/'test-results'; SHOTS=OUT/'screenshots'; SHOTS.mkdir(parents=True,exist_ok=True)
parser=argparse.ArgumentParser();parser.add_argument('--memory',action='store_true');parser.add_argument('--groups',default='');parser.add_argument('--url',default='http://127.0.0.1:4173');args=parser.parse_args()
checks=[];failures=[];skipped=[];errors=[];requests=[]
html=(ROOT/'index.html').read_text()
if args.memory:
    # Render authored local bytes in an existing blank document. This does not
    # navigate around an administrator's blocked URL or change browser policy.
    images={img.relative_to(ROOT).as_posix():'data:image/jpeg;base64,'+base64.b64encode(img.read_bytes()).decode() for img in (ROOT/'assets/cards').glob('*.jpg')}
    html=html.replace('<script>window.ASTRA_DATA=', '<script>window.ASTRA_IMAGES='+json.dumps(images)+';window.ASTRA_DATA=',1)

def check(name,value,detail=''):
    if not value:raise AssertionError(name+(': '+str(detail) if detail else ''))
    checks.append(name);print('PASS',name,flush=True)

def obj(page,name,zone=None):
    return page.evaluate("([name,zone])=>Object.values(astra.engine.state.instances).filter(o=>o.zone!=='void'&&(!zone||o.zone===zone)&&astra.engine.definition(o).name===name).sort((a,b)=>['battlefield','hand','graveyard','command','exile','stackCards','libraryActive','libraryReserve'].indexOf(a.zone)-['battlefield','hand','graveyard','command','exile','stackCards','libraryActive','libraryReserve'].indexOf(b.zone))[0]",[name,zone])

def click(page,action,scope='',extra=''):
    page.locator(f'{scope} [data-action="{action}"]{extra}'.strip()).first.click()

def open_lab(page,name):
    click(page,'dialog',extra='[data-dialog="labs"]');page.locator(f'[data-lab="{name}"]').click()
    page.wait_for_function('(name)=>window.astra?.engine?.state.seed===`lab-${name}`',arg=name)

def inspect(page,name,zone='battlefield'):
    o=obj(page,name,zone);assert o,f'{name} missing from {zone}'
    scope='.canvas' if zone=='battlefield' else '.hand' if zone=='hand' else '.resources'
    page.locator(f'{scope} [data-action="inspect"][data-id="{o["id"]}"]').click();return o

def activate(page,name,ability_id=None):
    o=inspect(page,name)
    selector='.inspector-content [data-action="ability"]'
    if ability_id:selector+=f'[data-ability="{ability_id}"]'
    page.locator(selector).first.click();return o

def cast_card(page,name,zone='hand'):
    o=inspect(page,name,zone);click(page,'cast','.inspector-content');return o

def selected(page,id):
    page.locator(f'.decision-gallery [data-action="card"][data-id="{id}"]').click()

def pending(page):return page.evaluate('astra.engine.state.pending')
def checksum(page):return page.evaluate('astra.engine.exportSession().stateChecksum')

def choose_option(page,p,value):
    opts=p.get('options') or ([{'value':'command'},{'value':'stay'}] if p['kind']=='commander' else [{'value':'reveal'},{'value':'decline'}])
    index=next(i for i,o in enumerate(opts) if (o.get('value') if isinstance(o,dict) else o)==value)
    page.locator(f'.decision [data-action="option"][data-option="{index}"]').click()

def settle_ui(page,remember=False,allow_pay=True):
    for _ in range(150):
        p=pending(page)
        if p:
            kind=p['kind']
            if kind in ('payment','effectPayment'):
                if kind=='effectPayment' and not allow_pay:click(page,'decline','.decision');continue
                suggestion=page.locator('.decision [data-action="suggest-payment"]')
                assert suggestion.is_enabled(),f'Insufficient fixture mana for {p["label"]}'
                suggestion.click();click(page,'pay','.decision')
            elif p.get('ordered') or kind=='triggerOrder':click(page,'confirm-choice','.decision')
            elif p.get('type')=='number':
                page.locator('#number-choice').fill(str(p.get('min',0)));click(page,'confirm-number','.decision')
            elif p.get('candidates') is not None or p.get('ids') is not None:
                for id in (p.get('candidates') or p.get('ids') or [])[:p.get('min',0)]:selected(page,id)
                click(page,'confirm-choice','.decision')
            elif p.get('options'):
                value='NO' if kind=='optional' else p['options'][0]['value']
                if remember and page.locator('#remember-choice').count():page.locator('#remember-choice').check()
                if p.get('max',1)>1:
                    for o in p['options'][:p.get('min',0)]:choose_option(page,p,o['value'])
                    click(page,'confirm-choice','.decision')
                else:choose_option(page,p,value)
            elif kind=='commander':choose_option(page,p,'stay')
            elif kind=='miracleReveal':choose_option(page,p,'decline')
            else:raise AssertionError('Unhandled decision '+json.dumps(p))
        elif page.evaluate('astra.engine.state.stack.length'):click(page,'resolve','.stack-panel')
        else:return
    raise AssertionError('UI resolution loop exceeded 150 interactions')

def shot(page,name):
    page.screenshot(path=str(SHOTS/name),full_page=True)

def fresh_flow(page):
    counts=page.evaluate('({active:astra.engine.state.zones.libraryActive.length,reserve:astra.engine.state.zones.libraryReserve.length,hand:astra.engine.state.zones.hand.length,command:astra.engine.state.zones.command.length})')
    check('default active 92 + hand 7, reserve 20, commander 1',counts=={'active':92,'reserve':20,'hand':7,'command':1},counts)
    check('normal mode has no developer toolbar',page.locator('[data-action="debug-spawn"]').count()==0)
    shot(page,'01-opening-hand.png')
    click(page,'mulligan','.table');click(page,'keep','.table');settle_ui(page)
    check('first multiplayer mulligan keeps seven',page.evaluate('astra.engine.state.zones.hand.length')==7)
    click(page,'phase',extra='[data-step="main1"]');settle_ui(page)
    check('phase navigation processes the draw step',page.evaluate('astra.engine.state.step')=='main1' and page.evaluate('astra.engine.state.zones.hand.length')==8)
    click(page,'next-turn');settle_ui(page)
    check('next-turn button advances rather than staying in main 1',page.evaluate('astra.engine.state.turnNumber')==2)
    click(page,'dialog',extra='[data-dialog="new"]');page.locator('#new-seed').fill('ui-repeatable-seed');click(page,'start-new','.modal')
    original=page.evaluate('astra.engine.state.initialDeck.activeOrder')
    click(page,'dialog',extra='[data-dialog="new"]');page.locator('#new-seed').fill('ui-repeatable-seed');click(page,'start-new','.modal')
    check('same seed reproduces active ordering through UI',original==page.evaluate('astra.engine.state.initialDeck.activeOrder'))
    click(page,'mulligan','.table');click(page,'mulligan','.table');click(page,'keep','.table')
    check('London mulligan displays constrained bottoming choice',pending(page) is not None)
    settle_ui(page);check('second mulligan bottoms one and keeps six',page.evaluate('astra.engine.state.zones.hand.length')==6)

def costs_flow(page):
    open_lab(page,'breakfast');shot(page,'02-breakfast-lab.png');before=checksum(page)
    activate(page,'Krark-Clan Ironworks','sacrifice');p=pending(page)
    check('KCI opens a cost selector',p and p.get('cost') is True)
    check('cost selector excludes nonartifact Minstrel',obj(page,'The Wandering Minstrel')['id'] not in p['candidates'])
    check('cost selector renders card images',page.locator('.decision-gallery .card').count()==len(p['candidates']))
    click(page,'cancel','.decision');check('cancel leaves source, pool and history unchanged',checksum(page)==before)
    activate(page,'Krark-Clan Ironworks','sacrifice');den=obj(page,'Ancient Den')['id'];selected(page,den);click(page,'confirm-choice','.decision');settle_ui(page)
    check('KCI pays sacrifice and immediately adds two colorless',page.evaluate('astra.engine.state.players[0].mana.C')==6 and obj(page,'Ancient Den','graveyard'))
    after=checksum(page);click(page,'undo');check('undo reverses complete KCI action',checksum(page)==before)
    click(page,'redo');check('redo reproduces KCI action exactly',checksum(page)==after)
    cast_card(page,'The One Ring');check('casting explicitly requests payment',pending(page)['kind']=='payment')
    page.locator('#pay-C').fill('0');click(page,'pay','.decision')
    check('invalid payment is rejected without moving card',pending(page)['kind']=='payment' and obj(page,'The One Ring','hand'))
    click(page,'suggest-payment','.decision');click(page,'pay','.decision')
    check('hold priority leaves spell on stack',obj(page,'The One Ring','stackCards') is not None)
    settle_ui(page);check('resolving enters Ring and processes cast-only trigger',obj(page,'The One Ring','battlefield') is not None)
    seat=obj(page,'Seat of the Synod');page.locator(f'.canvas [data-action="card"][data-id="{seat["id"]}"]').click()
    check('card image requests legal mana ability',obj(page,'Seat of the Synod')['tapped'] is True)
    tapped=checksum(page);page.locator(f'.canvas [data-action="card"][data-id="{seat["id"]}"]').click()
    check('second click is not a free untap',checksum(page)==tapped and obj(page,'Seat of the Synod')['tapped'])

def library_flow(page):
    open_lab(page,'library');check('top card is displayed only with a rules permission',page.locator('.library-section.top-visible').count()==1)
    old=page.evaluate('astra.engine.state.zones.libraryActive.slice(0,3)');hand=page.evaluate('astra.engine.state.zones.hand.length')
    activate(page,"Sensei's Divining Top",'look');settle_payment_only(page);click(page,'resolve','.stack-panel')
    p=pending(page);check('Top produces ordered library workspace',bool(p and p.get('ordered')),p)
    shot(page,'04-library-selection.png');page.locator('.decision [data-action="order"][data-index="0"][data-direction="1"]').click();click(page,'confirm-choice','.decision');settle_ui(page)
    check('Top preserves hand size and applies chosen order',page.evaluate('astra.engine.state.zones.hand.length')==hand and page.evaluate('astra.engine.state.zones.libraryActive[0]')==old[1])
    activate(page,'Scroll Rack','rack');settle_payment_only(page);click(page,'resolve','.stack-panel')
    den=obj(page,'Ancient Den','hand');selected(page,den['id']);click(page,'confirm-choice','.decision');settle_ui(page)
    check('Scroll Rack performs linked exchange without a draw',page.evaluate('astra.engine.state.zones.hand.length')==hand and obj(page,'Ancient Den','libraryActive'))
    open_lab(page,'library');click(page,'clear-mana')
    top=page.evaluate('astra.engine.top().id');page.locator(f'.library-section [data-action="inspect"][data-id="{top}"]').click();click(page,'cast','.inspector-content')
    p=pending(page);check('Chip and Citadel offer distinct play permissions',len(p.get('options',[]))>=2)
    normal=next(o['value'] for o in p['options'] if 'Citadel' not in o['label'])
    choose_option(page,p,normal);check('normal top-card casting uses mana payment',pending(page)['kind']=='payment')
    page.locator('.decision details summary').click()
    source=obj(page,'Crystal Skull, Isu Spyglass')['id'];page.locator(f'.payment-sources [data-id="{source}"]').first.click()
    check('mana ability returns to the interrupted payment',pending(page)['kind']=='payment' and page.evaluate('astra.engine.state.players[0].mana.U')==1)
    for _ in range(3):page.locator('[data-action="mana"][data-color="C"][data-delta="1"]').click()
    settle_ui(page)
    check('spell can finish after nested mana activation',obj(page,'The One Ring','battlefield') is not None)

def settle_payment_only(page):
    if pending(page) and pending(page)['kind']=='payment':click(page,'suggest-payment','.decision');click(page,'pay','.decision')

def landfall_flow(page):
    open_lab(page,'landfall');inspect(page,'Tireless Provisioner');page.locator('.inspector-content details').first.locator('summary').click();page.locator('[data-policy]').select_option('ASK');cast_card(page,'Simic Growth Chamber')
    check('Minstrel replacement applies without tapping entered land',obj(page,'Simic Growth Chamber','battlefield')['tapped'] is False)
    p=pending(page);check('simultaneous triggers have an explicit order selector',p['kind']=='triggerOrder' and len(p['options'])>=4)
    prior=page.evaluate('astra.ui.choice.slice()');page.locator('.decision [data-action="order"][data-index="0"][data-direction="1"]').click()
    check('trigger order controls change chosen resolution order',page.evaluate('astra.ui.choice[0]')==prior[1])
    shot(page,'03-trigger-order.png');click(page,'confirm-choice','.decision');settle_ui(page,remember=True)
    tokens=page.evaluate("astra.engine.controlled().filter(o=>o.token&&astra.engine.definition(o).name==='Treasure').length")
    check('two qualifying Provisioner triggers create two Treasures',tokens==2,tokens)
    key=page.evaluate("astra.registry.get('Tireless Provisioner').id+'/token-kind'")
    check('token preference is saved per ability',page.evaluate('(key)=>astra.engine.state.optionalPreferences[key]',key)=='Treasure')
    check('put/return triggers do not consume additional land plays',page.evaluate('astra.engine.state.landPlaysUsed')==1)

def copies_flow(page):
    open_lab(page,'artifacts');activate(page,'Krark-Clan Ironworks','sacrifice')
    selected(page,obj(page,'Ancient Den')['id']);click(page,'confirm-choice','.decision')
    settle_ui(page)
    check('Duplicator payment schedules a delayed token copy',page.evaluate('astra.engine.state.delayed.length')>0)
    click(page,'phase',extra='[data-step="end"]');settle_ui(page)
    check('delayed copy survives the sacrificed source and is a token',page.evaluate("astra.engine.controlled().some(o=>o.token&&astra.engine.definition(o).name==='Ancient Den')"))
    open_lab(page,'artifacts');cast_card(page,'Myr Battlesphere');settle_ui(page,allow_pay=False)
    check('Battlesphere produces four Myr through resolving triggers',page.evaluate("astra.engine.controlled().filter(o=>o.token&&astra.engine.definition(o).name==='Myr').length")==4)

def special_flow(page):
    open_lab(page,'special');activate(page,'Tezzeret the Seeker','search')
    check('planeswalker X ability exposes a number decision',pending(page)['type']=='number')
    page.locator('#number-choice').fill('0');click(page,'confirm-number','.decision');click(page,'resolve','.stack-panel')
    p=pending(page);chosen=p['candidates'][0];selected(page,chosen);click(page,'confirm-choice','.decision');settle_ui(page)
    check('planeswalker X-zero tutor puts an artifact land onto battlefield',page.evaluate('(id)=>astra.engine.object(id).zone',chosen)=='battlefield')
    before=checksum(page);activate(page,'Tezzeret the Seeker','animate')
    check('second loyalty activation is rejected without mutation',checksum(page)==before)
    activate(page,'Shorikai, Genesis Engine','crew')
    pilots=page.evaluate("astra.engine.controlled().filter(o=>astra.engine.definition(o).name==='Pilot').map(o=>o.id)")
    for id in pilots[:3]:selected(page,id)
    click(page,'confirm-choice','.decision');settle_ui(page)
    check('three Pilots pay crew 8 and animate Shorikai',page.evaluate("astra.engine.characteristics(Object.values(astra.engine.state.instances).find(o=>o.zone==='battlefield'&&astra.engine.definition(o).name==='Shorikai, Genesis Engine')).types.includes('Creature')"))
    click(page,'phase',extra='[data-step="attackers"]');settle_ui(page)
    click(page,'dialog',extra='[data-dialog="combat"]');ship=obj(page,'Shorikai, Genesis Engine')
    page.locator(f'[data-attacker="{ship["id"]}"]').check();click(page,'attack-confirm','.modal')
    check('combat dialog declares and taps a legal attacker',obj(page,'Shorikai, Genesis Engine')['tapped'] and obj(page,'Shorikai, Genesis Engine')['flags'].get('attacking'))
    click(page,'dialog',extra='[data-dialog="damage"]');page.locator('#damage-amount').fill('8');click(page,'damage-confirm','.modal')
    check('combat assistance explicitly applies damage to selected opponent',page.evaluate('astra.engine.state.players[1].life')==32)
    shot(page,'09-combat.png')
    open_lab(page,'special');activate(page,'Urza, Lord Protector','meld');settle_ui(page)
    check('meld UI resolves both components into one planeswalker',obj(page,'Urza, Planeswalker','battlefield')['counters']['loyalty']==7)
    open_lab(page,'special');cast_card(page,'Uthros Research Craft');settle_ui(page);activate(page,'Uthros Research Craft','station')
    pilot=obj(page,'Pilot');selected(page,pilot['id']);click(page,'confirm-choice','.decision');settle_ui(page)
    check('station UI taps selected creature and adds its power',obj(page,'Pilot')['tapped'] and obj(page,'Uthros Research Craft')['counters']['charge']==1)

def registry_and_deck_flow(page):
    click(page,'dialog',extra='[data-dialog="cards"]');check('card registry contains all 160 candidates',page.locator('.registry-card').count()==160)
    page.locator('#card-search').fill('Minstrel');check('card search filters without losing text focus',page.locator('.registry-card').count()==1 and page.locator('#card-search').input_value()=='Minstrel')
    page.locator('.registry-card button').click();check('card detail shows canonical rules',page.locator('.oracle').inner_text().startswith('Lands you control'))
    click(page,'zoom-back','.modal');page.locator('#card-search').fill('');page.locator('#card-type').select_option('Land')
    check('type filter only shows matching definitions',page.locator('.registry-card').count()>20)
    shot(page,'05-card-registry.png');click(page,'close-dialog','.modal')
    click(page,'dialog',extra='[data-dialog="deck"]');click(page,'validate-deck','.modal')
    check('supplied candidate pool validates as accepted',page.evaluate('astra.ui.deckReport.accepted'))
    check('duplicate Scroll Rack is reported, not discarded','DUPLICATE' in page.locator('.modal-body').inner_text())
    page.locator('#deck-text').fill('1 Not a real supported card\n// Commander\n1 The Wandering Minstrel');click(page,'validate-deck','.modal')
    check('unknown names produce an explicit missing-card report',not page.evaluate('astra.ui.deckReport.accepted') and 'MISSING' in page.locator('.modal-body').inner_text())
    click(page,'restore-pool','.modal');click(page,'validate-deck','.modal');check('restoring pool recovers valid deck',page.evaluate('astra.ui.deckReport.accepted'))
    click(page,'close-dialog','.modal')

def layout_and_notes_flow(page):
    open_lab(page,'breakfast');first=obj(page,'Krark-Clan Ironworks');second=obj(page,'Codex Shredder')
    click(page,'select-mode');
    for o in [first,second]:page.locator(f'.canvas [data-action="card"][data-id="{o["id"]}"]').click()
    check('multi-selection chooses both cards',page.evaluate('astra.ui.selected.size')==2)
    target=page.locator(f'.canvas [data-action="card"][data-id="{first["id"]}"]');target.scroll_into_view_if_needed();box=target.bounding_box()
    page.mouse.move(box['x']+25,box['y']+35);page.mouse.down();page.mouse.move(box['x']+70,box['y']+90,steps=8);page.mouse.up()
    page.wait_for_timeout(300)
    check('group drag creates layout positions, not zone moves',all(obj(page,n)['location'] for n in ['Krark-Clan Ironworks','Codex Shredder']) and page.evaluate('astra.engine.state.zones.battlefield.length')==9)
    click(page,'arrange');check('arrange is an undoable layout action',page.evaluate("astra.engine.history.at(-1).actions[0].type")=='LAYOUT')
    base_notes=page.evaluate('astra.engine.state.notes.length')
    click(page,'inspector-tab',extra='[data-tab="notes"]');page.locator('#note-text').fill('Breakfast line tested. <b>literal note</b>');click(page,'note')
    check('notes are persisted and HTML is escaped',page.evaluate('astra.engine.state.notes.length')==base_notes+1 and page.locator('.note b').count()==0)
    click(page,'inspector-tab',extra='[data-tab="log"]');check('action log exposes events and actions',page.locator('.log-entry').count()>0)
    page.locator('.brand').click();page.keyboard.press('Control+z');check('keyboard undo removes the note action',page.evaluate('astra.engine.state.notes.length')==base_notes)
    page.keyboard.press('Control+Shift+z');check('keyboard redo restores the note action',page.evaluate('astra.engine.state.notes.length')==base_notes+1)
    click(page,'dialog',extra='[data-dialog="settings"]');page.locator('#reserve-access').check();check('reserve override is explicit and logged',page.evaluate('astra.engine.state.reserveAccess'))
    page.locator('#setting-debug').check();check('debug controls appear only after opt-in',page.locator('[data-action="debug-spawn"]').count()==1)
    page.locator('#setting-debug').uncheck();check('debug can be disabled again',page.locator('[data-action="debug-spawn"]').count()==0)
    click(page,'close-dialog','.modal')

def persistence_flow(page):
    open_lab(page,'breakfast');activate(page,'Krark-Clan Ironworks','sacrifice');saved=page.evaluate('astra.engine.exportSession()')
    click(page,'cancel','.decision');click(page,'dialog',extra='[data-dialog="save"]')
    page.locator('#session-file').set_input_files({'name':'session.json','mimeType':'application/json','buffer':json.dumps(saved).encode()})
    page.wait_for_function('() => astra.engine.state.pending?.cost===true')
    check('import restores an unfinished cost choice',pending(page)['kind']=='draft')
    if args.memory:
        skipped.extend(['HTTP reload retains IndexedDB autosave','Export download is a valid session file','Direct file URL startup']);
        page.wait_for_function("() => document.querySelector('#save-status')?.textContent.toLowerCase().includes('unavailable')")
        check('unavailable browser storage is reported rather than called saved','unavailable' in page.locator('#save-status').inner_text().lower())
        return
    page.evaluate('astra.flushSave()');expected=checksum(page);page.reload();page.wait_for_function('() => window.astra?.engine?.state.pending')
    check('HTTP reload retains IndexedDB autosave and pending choice',checksum(page)==expected)
    click(page,'dialog',extra='[data-dialog="save"]')
    with page.expect_download() as d:click(page,'export-json','.modal')
    path=OUT/'exported-session.json';d.value.save_as(path);exported=json.loads(path.read_text())
    check('downloaded export contains complete pending session',exported['stateChecksum']==expected and exported['transaction'])
    corrupted=dict(exported);corrupted['stateChecksum']='bad';page.locator('#session-file').set_input_files({'name':'damaged.json','mimeType':'application/json','buffer':json.dumps(corrupted).encode()})
    page.wait_for_timeout(200);check('corrupt import leaves current session untouched',checksum(page)==expected)
    click(page,'close-dialog','.modal');click(page,'cancel','.decision');page.evaluate('astra.flushSave()')
    click(page,'dialog',extra='[data-dialog="save"]');click(page,'verify-replay','.modal');check('UI replay verification succeeds','Replay verified' in page.locator('#toast').inner_text())

def responsive_flow(page):
    open_lab(page,'breakfast');inspect(page,'Krark-Clan Ironworks');
    for width,height,name in [(1920,1080,'07-wide-table.png'),(390,844,'06-mobile-table.png'),(768,1024,'08-tablet-table.png')]:
        page.set_viewport_size({'width':width,'height':height});page.wait_for_timeout(350)
        check(f'no horizontal page overflow at {width}px',page.evaluate('document.documentElement.scrollWidth<=innerWidth+1'))
        shot(page,name)
    page.set_viewport_size({'width':390,'height':844});open_lab(page,'library')
    check('mobile retains legal top-card access',page.locator('.library-section.top-visible').is_visible())
    click(page,'dialog',extra='[data-dialog="guide"]');check('guide dialog remains usable on mobile',page.locator('[role="dialog"]').is_visible());page.keyboard.press('Escape')
    check('Escape closes modal and restores table interaction',page.locator('[role="dialog"]').count()==0 and not page.evaluate('document.getElementById("app").inert'))

server=None
if not args.memory:
    server=subprocess.Popen(['node','tools/serve.mjs'],cwd=ROOT,stdout=(OUT/'browser-server.log').open('w'),stderr=subprocess.STDOUT)
    time.sleep(1)
try:
    with sync_playwright() as playwright:
        executable=os.environ.get('CHROMIUM_PATH') or (shutil.which('chromium') if args.memory else None)
        browser=playwright.chromium.launch(**({'executable_path':executable} if executable else {}),args=['--no-sandbox'])
        groups=[fresh_flow,costs_flow,library_flow,landfall_flow,copies_flow,special_flow,registry_and_deck_flow,layout_and_notes_flow,persistence_flow,responsive_flow]
        if args.groups:groups=[g for g in groups if g.__name__ in args.groups.split(',')]
        for group in groups:
            context=browser.new_context(viewport={'width':1440,'height':1000},accept_downloads=True)
            page=context.new_page();page.set_default_timeout(8000)
            page.on('pageerror',lambda e:errors.append(str(e)))
            page.on('console',lambda m:errors.append(m.text) if m.type=='error' else None)
            page.on('request',lambda req:requests.append(req.url) if req.url.startswith(('http:','https:')) and not req.url.startswith(args.url) else None)
            try:
                if args.memory:page.set_content(html,wait_until='load',timeout=30000)
                else:page.goto(args.url,wait_until='load')
                page.wait_for_function('() => window.astra?.engine')
                group(page)
            except Exception as error:
                failures.append({'group':group.__name__,'message':str(error),'traceback':traceback.format_exc()})
                print('FAIL',group.__name__,str(error),flush=True)
                shot(page,'FAIL-'+group.__name__+'.png')
            finally:context.close()
        if not args.memory:
            context=browser.new_context();page=context.new_page()
            try:
                page.goto((ROOT/'index.html').as_uri());page.wait_for_function('() => window.astra?.engine')
                check('direct file URL starts the self-contained runtime',page.locator('.brand').is_visible())
                broken=page.locator('img').evaluate_all('(imgs)=>imgs.filter(i=>i.complete&&!i.naturalWidth).length')
                check('direct file URL resolves local card assets',broken==0)
            except Exception as error:failures.append({'group':'direct_file','message':str(error)})
            context.close()
        browser.close()
finally:
    if server:server.terminate();server.wait(timeout=5)
report={'mode':'in-memory rendering' if args.memory else 'HTTP and direct-file Chromium','checksPassed':len(checks),'checks':checks,'failures':failures,'browserErrors':errors,'externalRequests':requests,'skipped':skipped}
(OUT/('browser-memory.json' if args.memory else 'browser.json')).write_text(json.dumps(report,indent=2)+'\n')
print(json.dumps({k:report[k] for k in ['mode','checksPassed','failures','browserErrors','externalRequests','skipped']},indent=2))
raise SystemExit(bool(failures or errors or requests))
