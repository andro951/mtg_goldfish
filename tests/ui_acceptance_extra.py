from ui_acceptance_support import *

def extra_controls(p):
 fixture(p,'layers');cam=p.evaluate('JSON.stringify(astra.prefs.cameras.battlefield)');g=checksum(p)
 drag(p,1200,500,1260,535);moved=p.evaluate('astra.prefs.cameras.battlefield');base=json.loads(cam)
 check('dragging empty battlefield pans without a game action',moved['x']==base['x']+60 and moved['y']==base['y']+35 and checksum(p)==g)
 p.mouse.move(1200,500);p.mouse.down();p.mouse.move(1300,520);p.keyboard.press('Escape');p.mouse.up()
 check('Escape restores a cancelled pan',p.evaluate('astra.prefs.cameras.battlefield')==moved)
 click(p,'fit',extra='[data-zone=battlefield]');a=obj(p,'Ancient Den')['id'];b=obj(p,'Tree of Tales')['id'];ra=card(p,a,'battlefield').bounding_box();rb=card(p,b,'battlefield').bounding_box()
 click(p,'select-mode');drag(p,ra['x']-5,ra['y']-5,rb['x']+rb['width']-2,rb['y']+rb['height']+4)
 check('marquee selects the intended two cards',set(p.evaluate('[...astra.ui.selected]'))=={a,b})
 click(p,'select-mode');check('leaving Select clears selection',p.evaluate('astra.ui.selected.size')==0)
 # A tapped card is picked in its rotated footprint and retains that grab point.
 card(p,a,'battlefield').click();p.mouse.move(900,500);p.mouse.wheel(0,140);p.wait_for_timeout(80);r=card(p,a,'battlefield').bounding_box();fx,fy=.7,.25;tx,ty=680,410
 drag(p,r['x']+r['width']*fx,r['y']+r['height']*fy,tx,ty)
 r=card(p,a,'battlefield').bounding_box();check('sideways card drag is exact after zoom',abs(r['x']+r['width']*fx-tx)<.2 and abs(r['y']+r['height']*fy-ty)<.2)
 # Divider cancellation must undo presentation changes, too.
 for key in ['sidebar','hand']:
  before=p.evaluate('JSON.stringify(astra.prefs)');r=p.locator(f'[data-resize={key}]').bounding_box();x,y=r['x']+r['width']/2,r['y']+r['height']/2
  p.mouse.move(x,y);p.mouse.down();p.mouse.move(x+35,y-35,steps=4);p.keyboard.press('Escape');p.mouse.up()
  check(f'Escape restores cancelled {key} resize',p.evaluate('JSON.stringify(astra.prefs)')==before)
 fixture(p,'payments');cast(p,'Walking Atlas');click(p,'close-inspector');decision=p.locator('.decision-window');r=decision.locator('.float-header').bounding_box();drag(p,r['x']+40,r['y']+12,1110,340)
 pos=decision.bounding_box();saved=p.evaluate('astra.prefs.popups.decision');check('decision popup is movable and remembers its position',saved and abs(pos['x']-saved['x'])<.2)
 # Mana colors stay beside their source even with a saved ordinary popup location.
 amber=obj(p,'Mox Amber')['id'];r=card(p,amber,'battlefield').bounding_box();x,y=r['x']+r['width']/2,r['y']+r['height']/2;p.mouse.click(x,y)
 pop=p.locator('.mana-window').bounding_box();check('saved payment position does not move mana palette away from clicked source',abs(pop['x']-x)<100 and abs(pop['y']-y)<80)
 choose_option(p,'G');r=decision.bounding_box();check('payment resumes at saved position after mana choice',abs(r['x']-pos['x'])<.2 and abs(r['y']-pos['y'])<.2)
 p.keyboard.press('Escape');hold(p,True);cast(p,'Walking Atlas');click(p,'close-inspector');card(p,obj(p,'Mana Vault')['id'],'battlefield').click();pay(p)
 stack=p.locator('.stack-window');r=stack.locator('.float-header').bounding_box();drag(p,r['x']+35,r['y']+12,1050,160);s=stack.bounding_box();check('stack popup moves independently and remembers its position',abs(s['x']-p.evaluate('astra.prefs.popups.stack.x'))<.2)
 click(p,'pass','.stack-window');check('Pass resolves the waiting spell normally',obj(p,'Walking Atlas','battlefield') is not None)
 # Two simultaneous triggers exercise Resolve all, not just Resolve top.
 lab(p,'landfall');cast(p,'Simic Growth Chamber');click(p,'confirm-choice','[data-floating=decision]');click(p,'resolve-all','.stack-window');settle(p)
 check('Resolve all handles a multi-trigger line and stops for necessary choices',state(p,'state.stack.length')==0 and pending(p) is None)
 click(p,'next');settle(p);check('Step button advances to the next phase',state(p,'state.step')!='main1')
 # Canonical front/back image viewer controls are not left untested.
 menu(p,'cards');p.locator('#card-search').fill('The Reality Chip');p.locator('.registry-card button').click();click(p,'zoom-back','.modal');close(p)
 menu(p,'cards');p.locator('#card-search').fill("Urza's Saga");p.locator('.registry-card button').click();check('card detail opens from filtered registry',p.locator('#modal-title').inner_text()=="Urza's Saga");close(p)
