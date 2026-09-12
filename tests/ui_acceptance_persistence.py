from ui_acceptance_support import *

def persistence(p):
 fixture(p,'payments');cast(p,'The One Ring');click(p,'close-inspector');card(p,obj(p,'Mox Amber')['id'],'battlefield').click();saved=p.evaluate('astra.exported()');check('session export includes layout and unfinished mana choice',saved.get('uiLayout') and saved.get('transaction') and saved['currentState']['pending']['key']=='color')
 p.keyboard.press('Escape');menu(p,'save');p.locator('#session-file').set_input_files({'name':'session.json','mimeType':'application/json','buffer':json.dumps(saved).encode()});p.wait_for_function('()=>astra.engine.state.pending?.key==="color"')
 check('import through UI restores tiny palette and nested casting action',p.locator('.mana-window').is_visible())
 if args.memory:
  menu(p);p.wait_for_timeout(500);check('unavailable storage is reported honestly',p.locator('#save-status').evaluate('(e)=>e.classList.contains("error")'));close(p)
  skipped.extend(['HTTP reload preserves game and panel preferences','Actual JSON/text download and corrupted import checks','Previous autosave recovery','Direct file startup'])
  return
 choose_option(p,'U');click(p,'cancel','[data-floating=decision]')
 fixture(p,'layers');handle=p.locator('[data-resize=hand]');handle.focus();p.keyboard.press('ArrowUp');p.keyboard.press('ArrowUp');click(p,'zone',extra='[data-zone=graveyard]')
 inspect(p,'Ancient Den');head=p.locator('.inspector-window .float-header').bounding_box();drag(p,head['x']+30,head['y']+12,1020,150);click(p,'close-inspector')
 p.evaluate('astra.flushSave()');prefs=p.evaluate('JSON.stringify(astra.prefs)');expected=checksum(p);p.reload();p.wait_for_function('()=>window.astra?.engine')
 check('reload preserves game and hand/rail/dock/popup preferences',checksum(p)==expected and p.evaluate('JSON.stringify(astra.prefs)')==prefs)
 menu(p,'save')
 with p.expect_download() as d:click(p,'export-json','.modal')
 path=OUT/'exported-session.json';d.value.save_as(path);doc=json.loads(path.read_text());check('downloaded session contains game and complete table preferences',doc['stateChecksum']==expected and doc.get('uiLayout'))
 with p.expect_download() as d:click(p,'export-text','.modal')
 path=OUT/'exported-log.txt';d.value.save_as(path);check('readable action log actually downloads',path.stat().st_size>30)
 doc['stateChecksum']='corrupt';p.locator('#session-file').set_input_files({'name':'bad.json','mimeType':'application/json','buffer':json.dumps(doc).encode()});p.wait_for_timeout(150);check('corrupted import leaves current game untouched',checksum(p)==expected)
 click(p,'verify-replay','.modal');check('replay verification succeeds from UI','Replay verified' in p.locator('#toast').inner_text());close(p)
 # Separate saves have genuinely different game states.
 before=state(p,'state.players[0].life');p.locator('[data-action=resource][data-player="0"][data-field=life][data-delta="-1"]').click();p.evaluate('astra.flushSave()');menu(p,'save');click(p,'restore-previous','.modal')
 check('previous autosave recovery restores a real previous state',state(p,'state.players[0].life')==before)


def responsive(p):
 lab(p,'breakfast',manual=False)
 for w,h,name in [(1720,900,'09-desktop-table.png'),(1366,768,'10-laptop-table.png'),(768,1024,'11-tablet-table.png'),(390,844,'12-mobile-table.png')]:
  p.set_viewport_size({'width':w,'height':h});p.wait_for_timeout(100)
  check(f'full page fits {w}x{h} without scrollbars',p.evaluate('document.documentElement.scrollWidth<=innerWidth&&document.documentElement.scrollHeight<=innerHeight'))
  rail=p.locator('.rail');check(f'resource rail fits vertically at {w}x{h}',rail.evaluate('(e)=>e.scrollHeight<=e.clientHeight+1'))
  hand=p.locator('.hand-position').first.bounding_box();check(f'hand stays four pixels from bottom at {w}x{h}',abs(h-hand['y']-hand['height']-4)<.2)
  shot(p,name)
 lab(p,'library',manual=False);check('mobile legal top card remains accessible',p.locator('.library-deck .playing-card').is_visible());menu(p,'guide');check('mobile menu stays within viewport',p.locator('.modal').bounding_box()['width']<=390);close(p)

