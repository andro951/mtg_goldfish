from ui_acceptance_support import *

def geometry(p):
 fixture(p,'layers');a=obj(p,'Ancient Den')['id'];face=card(p,a,'battlefield');r=face.bounding_box();tx,ty=580,430;fx,fy=.3,.2;old=(r['x']+r['width']*fx,r['y']+r['height']*fy)
 def middle():
  ghost=p.locator('.drag-ghost .face').bounding_box()
  check('dragged card visibly follows the original grabbed point under mouse',abs(ghost['x']+ghost['width']*fx-tx)<.2 and abs(ghost['y']+ghost['height']*fy-ty)<.2,ghost)
 drag(p,*old,tx,ty,middle);after=face.bounding_box()
 check('same grabbed point lands exactly at released pointer',abs(after['x']+after['width']*fx-tx)<.2 and abs(after['y']+after['height']*fy-ty)<.2)
 p.keyboard.press('Backspace');restored=face.bounding_box();check('undo restores the original implicit card position visually',abs(restored['x']-r['x'])<.2 and abs(restored['y']-r['y'])<.2)
 p.keyboard.press('Control+Shift+z');redone=face.bounding_box();check('redo restores exact visual drop position',abs(redone['x']-after['x'])<.2 and abs(redone['y']-after['y'])<.2)
 check('dropping removes preview and does not change card zone',p.locator('.drag-ghost').count()==0 and obj(p,'Ancient Den')['zone']=='battlefield')
 place(p,'Ancient Den',500,260);b=place(p,'Tree of Tales',540,220);c=place(p,'Great Furnace',517,304,fx=.04,fy=.04)
 za,zb,zc=[obj(p,n)['flags']['tableZ'] for n in ['Ancient Den','Tree of Tales','Great Furnace']]
 check('drop between cards sandwiches new card above cursor-covered lower card but below uncovered upper card',za<zc<zb,[za,zc,zb])
 p.mouse.move(509,280);check('exposed lower card lifts on hover',p.locator(f'[data-position="{a}"].hover-lift').count()==1)
 p.mouse.move(565,270,steps=10);check('crossing onto original upper footprint switches hover to upper card',p.locator(f'[data-position="{b}"].hover-lift').count()==1 and p.locator(f'[data-position="{a}"].hover-lift').count()==0)
 check('hover never changes persistent layer ordering',[obj(p,n)['flags']['tableZ'] for n in ['Ancient Den','Tree of Tales','Great Furnace']]==[za,zb,zc])
 shot(p,'08-hover-and-layering.png')
 prev=obj(p,'Ancient Den')['location'];p.mouse.move(505,280);p.mouse.down();p.mouse.move(700,440,steps=5);p.keyboard.press('Escape');p.mouse.up();check('Escape aborts a drag without moving the original',obj(p,'Ancient Den')['location']==prev and p.locator('.drag-ghost').count()==0)
 # Zoom around the pointer, then test exact grab offsets at a non-1 scale.
 surface=p.locator('[data-surface=battlefield]');r=surface.bounding_box();p.mouse.move(r['x']+r['width']*.75,r['y']+r['height']*.6);p.mouse.wheel(0,240);p.wait_for_timeout(80)
 check('battlefield wheel zoom changes camera scale',p.evaluate('astra.prefs.cameras.battlefield.zoom')<1)
 b0=card(p,c,'battlefield').bounding_box();fx,fy=.2,.5;to=(b0['x']+b0['width']*.2+65,b0['y']+b0['height']*.5+40)
 drag(p,b0['x']+b0['width']*fx,b0['y']+b0['height']*fy,*to);b1=card(p,c,'battlefield').bounding_box()
 check('dragging stays cursor-exact while zoomed',abs(b1['x']+b1['width']*fx-to[0])<.2 and abs(b1['y']+b1['height']*fy-to[1])<.2)
 click(p,'fit',extra='[data-zone=battlefield]');click(p,'arrange')
 # Select two nonoverlapping cards without triggering mana.
 click(p,'select-mode');ids=[obj(p,n)['id'] for n in ['Ancient Den','Tree of Tales']]
 for id in ids:card(p,id,'battlefield').click()
 check('Select mode picks multiple cards without using mana',p.evaluate('astra.ui.selected.size')==2 and state(p,'state.players[0].mana.W')==0)
 before=[obj(p,n)['location'] for n in ['Ancient Den','Tree of Tales']];b0=card(p,ids[0],'battlefield').bounding_box();drag(p,b0['x']+30,b0['y']+30,b0['x']+75,b0['y']+90)
 after=[obj(p,n)['location'] for n in ['Ancient Den','Tree of Tales']];check('group drag preserves offsets and moves both selected cards',abs(after[0]['x']-before[0]['x']-(after[1]['x']-before[1]['x']))<.001 and after[1]['y']!=before[1]['y'])
 click(p,'select-mode');check('Select toggle returns to gameplay',not p.evaluate('astra.ui.selectMode'))
 # Drag a card from hand through real payment and stack resolution.
 hand=obj(p,'Walking Atlas','hand');r=card(p,hand['id'],'hand').bounding_box();fx,fy=.25,.2;dest=(820,390);z=p.evaluate('astra.prefs.cameras.battlefield.zoom')
 drag(p,r['x']+r['width']*fx,r['y']+r['height']*fy,*dest);check('hand drop requests a legal cast instead of a force move',pending(p)['kind']=='payment' and obj(p,'Walking Atlas','hand'))
 pay(p);p.wait_for_function("()=>Object.values(astra.engine.state.instances).some(o=>o.zone==='battlefield'&&astra.engine.definition(o).name==='Walking Atlas')")
 after=card(p,hand['id'],'battlefield').bounding_box();check('hand-drop location survives payment and resolution exactly',abs(after['x']+after['width']*fx-dest[0])<.3 and abs(after['y']+after['height']*fy-dest[1])<.3)


def panels(p):
 fixture(p,'layers');bf=p.locator('[data-surface=battlefield]');width=bf.bounding_box()['width'];click(p,'zone',extra='[data-zone=graveyard]')
 check('graveyard is a simultaneous side window, not battlefield replacement',p.locator('[data-surface=graveyard]').count()==1 and bf.bounding_box()['width']<width)
 check('battlefield has no scrollbars or independent scrolling surface',bf.evaluate('(e)=>getComputedStyle(e).overflow')=='hidden')
 dock=p.locator('[data-surface=graveyard]');r=dock.bounding_box();p.mouse.move(r['x']+r['width']/2,r['y']+r['height']/2);before=p.evaluate('JSON.stringify(astra.prefs.cameras.battlefield)');p.mouse.wheel(0,-160);p.wait_for_timeout(80)
 check('side-zone wheel zoom is independent from battlefield',p.evaluate('JSON.stringify(astra.prefs.cameras.battlefield)')==before and p.evaluate('astra.prefs.cameras.graveyard.zoom')>0)
 for kind,dx,dy,field in [('sidebar',35,0,'sidebarWidth'),('hand',0,-65,'handHeight'),('dock',-45,0,'dockWidth')]:
  start=p.evaluate(f'astra.prefs.{field}');handle=p.locator(f'[data-resize={kind}]');r=handle.bounding_box();drag(p,r['x']+r['width']/2,r['y']+r['height']/2,r['x']+r['width']/2+dx,r['y']+r['height']/2+dy)
  check(f'{kind} divider resizes only its intended dimension',p.evaluate(f'astra.prefs.{field}')==start+abs(dx or dy))
 hand=p.locator('.hand-position').first.bounding_box();check('hand cards grow with row and end four pixels above screen bottom',abs(p.viewport_size['height']-hand['y']-hand['height']-4)<.1 and hand['height']>155)
 inspect(p,'Ancient Den');header=p.locator('.inspector-window .float-header');r=header.bounding_box();old=p.locator('.inspector-window').bounding_box();drag(p,r['x']+40,r['y']+12,900,160);new=p.locator('.inspector-window').bounding_box();check('inspector title bar moves popup without resizing play area',abs(new['x']-old['x'])>50 and p.locator('.table-shell').bounding_box()['width']==p.viewport_size['width'])
 stored=p.evaluate('astra.prefs.popups.inspector');click(p,'close-inspector');inspect(p,'Tree of Tales');new=p.locator('.inspector-window').bounding_box();check('inspector reopens at remembered position',abs(new['x']-stored['x'])<1 and abs(new['y']-stored['y'])<1)
 click(p,'close-inspector');click(p,'zone',extra='[data-zone=exile]');check('exile replaces only side zone',p.locator('[data-surface=exile]').count()==1 and bf.count()==1)
 click(p,'zone',extra='[data-zone=outside]');check('outside-the-game area remains separate',p.locator('[data-surface=outside]').count()==1 and bf.count()==1)
 click(p,'close-zone');check('closing side zone returns its width to battlefield',bf.bounding_box()['width']>width-40)
 menu(p,'settings');click(p,'reset-layout','.modal');close(p);check('Reset layout restores compact sizes',p.evaluate('[astra.prefs.sidebarWidth,astra.prefs.handHeight,astra.prefs.dockWidth]')==[100,155,290])
 # Keyboard accessible dividers.
 handle=p.locator('[data-resize=hand]');handle.focus();p.keyboard.press('ArrowUp');check('panel divider can be resized with keyboard',p.evaluate('astra.prefs.handHeight')==165)


