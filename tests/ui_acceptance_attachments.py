from ui_acceptance_support import *


def pos(p,id):
 return p.evaluate('(id)=>({...astra.ui.layouts.battlefield.find(c=>c.id===id)})',id)


def at_card(p,id):
 """Find a genuinely exposed point using the same canonical layers as picking.
 Never click through an elevated card image into the permanent underneath."""
 return p.evaluate('''id=>{
 const board=document.querySelector('[data-surface="battlefield"]').getBoundingClientRect(),cam=astra.prefs.cameras.battlefield||{x:0,y:0,zoom:1};
 const cards=astra.ui.layouts.battlefield.map(c=>({...c,w:c.tapped?110*88/63:110,h:c.tapped?110:110*88/63}));
 const c=cards.find(c=>c.id===id);
 for(let y=9;y<c.h-5;y+=10)for(let x=9;x<c.w-5;x+=10){
  const px=c.x+x,py=c.y-c.h+y;
  const hit=cards.filter(d=>px>=d.x&&px<=d.x+d.w&&py>=d.y-d.h&&py<=d.y).sort((a,b)=>b.z-a.z||b.index-a.index)[0];
  const sx=board.left+cam.x+px*cam.zoom,sy=board.top+cam.y+py*cam.zoom;
  if(hit?.id===id&&sx>board.left&&sx<board.right&&sy>board.top&&sy<board.bottom)return {x:sx,y:sy};
 }
 throw new Error('No exposed card point: '+id);
 }''',id)


def closed_inspector(p):
 if p.locator('.inspector-window').count():click(p,'close-inspector')


def inspect_exposed(p,id):
 closed_inspector(p);pt=at_card(p,id);p.mouse.click(pt['x'],pt['y'],button='right')
 p.wait_for_function('(id)=>astra.ui.inspected===id',arg=id)


def drag_id(p,id,dx,dy,mid=None):
 closed_inspector(p);pt=at_card(p,id);drag(p,pt['x'],pt['y'],pt['x']+dx,pt['y']+dy,mid)


def arrow(p,id):return p.locator('#permanent-links [data-link-source="'+id+'"]')


def check_tucked(p,child,host,label):
 c,h=pos(p,child),pos(p,host)
 ct=c['y']-(110 if c['tapped'] else 110*88/63);ht=h['y']-(110 if h['tapped'] else 110*88/63)
 check(label,c['x']<h['x'] and ct<ht and c['z']<h['z'],{'child':c,'host':h})


def attachment_controls(p):
 fixture(p,'attachment-resolve');hold(p,True)
 host=obj(p,'Metalworker')['id'];second=obj(p,'Walking Atlas')['id'];gear=obj(p,'Lightning Greaves')['id']
 activate(p,'Lightning Greaves','equip');choose_cards(p,[host])
 # Target overlays batch geometry until the next animation frame. Wait for
 # that public DOM result, without resolving Equip or relaxing either invariant.
 p.wait_for_function('(host)=>{const a=document.querySelectorAll("#target-links .target-link");return a.length===1&&a[0].dataset.linkTarget===host&&document.querySelectorAll("#permanent-links .permanent-link").length===0;}',arg=host)
 check('unresolved Equip shows a target arrow, not a confirmed attachment',p.locator('#target-links .target-link').count()==1 and p.locator('#target-links .target-link').get_attribute('data-link-target')==host and p.locator('#permanent-links .permanent-link').count()==0 and obj(p,'Lightning Greaves').get('attachedTo') is None and state(p,'state.stack.length')==1)
 settle(p);closed_inspector(p);p.wait_for_selector('#permanent-links .equipment')
 check_tucked(p,gear,host,'resolved Equipment tucks up-left beneath the actual equipped creature')
 check('attachment arrow points to the real host',arrow(p,gear).get_attribute('data-link-target')==host)
 inspect_exposed(p,gear)
 check('Follow attached permanent starts enabled on this Equipment',p.locator('[data-action=attachment-follow]').get_attribute('aria-pressed')=='true')
 closed_inspector(p)
 initial=pos(p,gear);old_host=pos(p,host);cursor=state(p,'cursor');before=arrow(p,gear).locator('path').get_attribute('d')
 def midway():
  p.wait_for_timeout(45)
  check('host drag previews both the host and its following Equipment',p.locator('.drag-ghost').count()==2)
  check('connection follows live drag previews',arrow(p,gear).locator('path').get_attribute('d')!=before)
 drag_id(p,host,160,25,midway)
 moved=pos(p,gear)
 check('moving a host translates its Equipment by the same amount',abs(moved['x']-initial['x']-160)<1 and abs(moved['y']-initial['y']-25)<1)
 check('host and follower move in one undoable action',state(p,'cursor')==cursor+1)
 p.keyboard.press('Backspace');check('one Undo restores the whole attachment group',abs(pos(p,host)['x']-old_host['x'])<.01 and abs(pos(p,gear)['x']-initial['x'])<.01)
 p.keyboard.press('Control+Shift+z')
 current_host=pos(p,host);drag_id(p,gear,-220,70)
 manual=pos(p,gear)
 check('dragging Equipment itself automatically disables following',obj(p,'Lightning Greaves')['flags'].get('followAttached') is False)
 check('manually moved Equipment is still equipped and keeps its arrow',obj(p,'Lightning Greaves')['attachedTo']['id']==host and arrow(p,gear).count()==1)
 check('dragging Equipment does not move its host',pos(p,host)['x']==current_host['x'] and pos(p,host)['y']==current_host['y'])
 p.keyboard.press('Backspace');check_tucked(p,gear,host,'Undo of an independent attachment drag restores following and its tucked position')
 p.keyboard.press('Control+Shift+z');drag_id(p,host,30,-20)
 check('a manually placed attachment stays put when its host moves',pos(p,gear)['x']==manual['x'] and pos(p,gear)['y']==manual['y'])
 inspect_exposed(p,gear);click(p,'attachment-follow','.inspector-window')
 check('enabling Follow attached permanent switches it back on',p.locator('[data-action=attachment-follow]').get_attribute('aria-pressed')=='true')
 check_tucked(p,gear,host,'enabling Follow immediately moves Equipment back underneath its host')
 click(p,'attachment-follow','.inspector-window');frozen=pos(p,gear);closed_inspector(p)
 inspect_exposed(p,gear);click(p,'ability','.inspector-window','[data-ability=equip]');choose_cards(p,[second]);settle(p);closed_inspector(p)
 p.wait_for_function('([g,h])=>document.querySelector(`#permanent-links [data-link-source="${g}"]`)?.dataset.linkTarget===h',arg=[gear,second])
 check('reequipping redirects the arrow without resetting a manual per-card preference',obj(p,'Lightning Greaves')['flags'].get('followAttached') is False and pos(p,gear)['x']==frozen['x'])
 inspect_exposed(p,gear);click(p,'attachment-follow','.inspector-window');closed_inspector(p)
 check_tucked(p,gear,second,'re-enabling follow snaps to the new host, not the previous creature')
 check('automatic resources and prior Ask defaults remain enabled',not state(p,'state.settings.manualControls') and state(p,'state.optionalPreferences')=={})
 shot(p,'31-attachment-follow-controls.png')


def attachment_groups(p):
 fixture(p,'attachment-fan');hold(p,True)
 host=obj(p,'Metalworker')['id'];gear=obj(p,'Lightning Greaves')['id'];aura=obj(p,'Smoke Blessing')['id'];chip=obj(p,'The Reality Chip')['id']
 p.wait_for_function('document.querySelectorAll("#permanent-links .permanent-link").length===4')
 children=[obj(p,n)['id'] for n in ['Lightning Greaves','Flayer Husk','Smoke Blessing','The Reality Chip']]
 check('Equipment, Aura and reconfigured Equipment receive real connection lines',p.locator('#permanent-links .equipment').count()==3 and p.locator('#permanent-links .aura').count()==1)
 for c in children:check_tucked(p,c,host,'each attached card has its own visible strip: '+c)
 check('multiple attachments have unique staggered positions',len({(pos(p,c)['x'],pos(p,c)['y']) for c in children})==4)
 inspect_exposed(p,host)
 check('host inspector lists all attachments, including partly covered cards',p.locator('.attached-list [data-action=inspect-link]').count()==4)
 click(p,'inspect-link','.inspector-window','[data-id="'+aura+'"]')
 check('host attachment list opens that individual card’s follow setting',state(p,'definition(astra.engine.object(astra.ui.inspected)).name')=='Smoke Blessing' and p.locator('[data-action=attachment-follow]').count()==1)
 closed_inspector(p);before={c:pos(p,c) for c in children};cursor=state(p,'cursor')
 drag_id(p,host,90,15,lambda:check('multi-attachment drag creates exactly one preview for each card',p.locator('.drag-ghost').count()==5))
 check('host moves all four following attachments once',all(abs(pos(p,c)['x']-before[c]['x']-90)<1 for c in children))
 check('one group drop creates only one history entry',state(p,'cursor')==cursor+1)
 # Aura-specific manual positioning follows the same logic as Equipment.
 drag_id(p,aura,230,180);before_aura=pos(p,aura)
 check('dragging an Aura disables only that Aura’s follow setting',obj(p,'Smoke Blessing')['flags'].get('followAttached') is False and obj(p,'Lightning Greaves')['flags'].get('followAttached') is not False,{'aura':obj(p,'Smoke Blessing'),'gear':obj(p,'Lightning Greaves'),'last':state(p,'history.at(-1).actions')})
 check('manually positioned Aura retains its enchantment connection',arrow(p,aura).count()==1 and obj(p,'Smoke Blessing')['attachedTo']['id']==host)
 # Pointer cancel and an out-of-table drop must not toggle following or move cards.
 before_doc=checksum(p);pt=at_card(p,gear);p.mouse.move(pt['x'],pt['y']);p.mouse.down();p.mouse.move(pt['x']-70,pt['y']+90,steps=6);p.keyboard.press('Escape');p.mouse.up()
 check('Escape cancels attachment dragging without changing state or follow settings',checksum(p)==before_doc and obj(p,'Lightning Greaves')['flags'].get('followAttached') is not False)
 pt=at_card(p,gear);drag(p,pt['x'],pt['y'],10,10)
 check('invalid outside drop leaves the Equipment’s following setting unchanged',checksum(p)==before_doc and obj(p,'Lightning Greaves')['flags'].get('followAttached') is not False)
 # Tap the host through its real mana ability, without changing equipment taps.
 inspect_exposed(p,host);click(p,'ability','.inspector-window','[data-ability=reveal-mana]');choose_cards(p,[]);settle(p);closed_inspector(p)
 check('host tap does not tap its equipment',obj(p,'Metalworker')['tapped'] and not obj(p,'Lightning Greaves')['tapped'])
 check_tucked(p,gear,host,'following fan aligns to the tapped host’s actual top edge')
 check('tapping the host leaves a manually positioned Aura in place',pos(p,aura)['x']==before_aura['x'] and pos(p,aura)['y']==before_aura['y'])
 # Stable arrows use canonical coordinates, not animated hover-elevation geometry.
 old=arrow(p,gear).locator('path').get_attribute('d');pt=at_card(p,gear);p.mouse.move(pt['x'],pt['y']);p.wait_for_timeout(60)
 check('hover emphasizes the attachment’s relationship', 'emphasized' in arrow(p,gear).get_attribute('class'))
 check('hover lift does not jerk the connection endpoints',arrow(p,gear).locator('path').get_attribute('d')==old)
 p.mouse.move(12,12);p.wait_for_timeout(150)
 p.evaluate('''()=>{window.connectionMutations=0;window.connectionObserver=new MutationObserver(rs=>connectionMutations+=rs.length);connectionObserver.observe(document.querySelector('#permanent-links'),{childList:true,subtree:true,attributes:true});}''')
 p.wait_for_timeout(250);check('idle connections cause no SVG churn or animation loop',p.evaluate('connectionMutations')==0);p.evaluate('connectionObserver.disconnect()')
 shot(p,'32-multiple-equipment-aura-connections.png')
 # Reconfigure's genuine detach removes only that persistent line and keeps its last position.
 old_chip=pos(p,chip);inspect_exposed(p,chip);click(p,'ability','.inspector-window','[data-ability=reconfigure]');choose_option(p,'detach');pay(p);settle(p);closed_inspector(p)
 p.wait_for_function('(id)=>!document.querySelector(`#permanent-links [data-link-source="${id}"]`)',arg=chip)
 check('real detachment removes its arrow without moving the other attachments',obj(p,'The Reality Chip')['attachedTo'] is None and arrow(p,gear).count()==1 and arrow(p,aura).count()==1)
 check('detached Equipment remains at its last visible table position',abs(pos(p,chip)['x']-old_chip['x'])<.01 and abs(pos(p,chip)['y']-old_chip['y'])<.01)
 # Zoom/pan repaint lines without persisting separate gameplay actions.
 before_doc=checksum(p);r=p.locator('[data-surface=battlefield]').bounding_box();p.mouse.move(r['x']+r['width']*.8,r['y']+r['height']*.7);p.mouse.wheel(0,100);p.wait_for_timeout(100)
 check('zoom updates persistent arrows without changing gameplay state',checksum(p)==before_doc and arrow(p,gear).count()==1)


def attachment_persistence(p):
 fixture(p,'attachment-fan');hold(p,True);host=obj(p,'Metalworker')['id'];aura=obj(p,'Smoke Blessing')['id'];gear=obj(p,'Lightning Greaves')['id']
 drag_id(p,aura,230,180);saved_aura=pos(p,aura);saved_gear=pos(p,gear);expected=checksum(p);p.evaluate('astra.flushSave()') if not args.memory else None
 # Export/import works in both direct and in-memory test modes.
 doc=p.evaluate('astra.exported()');menu(p,'save');p.locator('#session-file').set_input_files({'name':'connections.json','mimeType':'application/json','buffer':json.dumps(doc).encode()});p.wait_for_function('(s)=>astra.engine.exportSession().stateChecksum===s',arg=expected);closed_inspector(p)
 check('export/import preserves a manually placed Aura and its disabled-follow setting',obj(p,'Smoke Blessing')['flags'].get('followAttached') is False and pos(p,aura)['x']==saved_aura['x'])
 check('export/import preserves following attachment geometry',pos(p,gear)['x']==saved_gear['x'] and pos(p,gear)['y']==saved_gear['y'])
 if not args.memory:
  p.evaluate('astra.flushSave()');p.reload();p.wait_for_function('()=>window.astra?.engine');p.wait_for_selector('#permanent-links .aura')
  check('actual autosave reload preserves per-instance follow settings and links',checksum(p)==expected and obj(p,'Smoke Blessing')['flags'].get('followAttached') is False and arrow(p,aura).count()==1)
  check('actual autosave reload preserves manually separated attachment coordinates',pos(p,aura)['x']==saved_aura['x'] and pos(p,aura)['y']==saved_aura['y'])
 # Edge placement does not recreate offscreen automatic-arrival mistakes.
 fixture(p,'attachment-edge');p.wait_for_selector('#permanent-links .aura')
 boxes=p.locator('[data-surface=battlefield] [data-position]').evaluate_all('''els=>{const s=els[0].closest('.surface').getBoundingClientRect();return els.map(e=>{const r=e.querySelector('.playing-card').getBoundingClientRect();return {left:r.left-s.left,top:r.top-s.top,right:r.right-s.left,bottom:r.bottom-s.top,w:s.width,h:s.height};});}''')
 check('top-left edge fan points inward so attachments stay visible',all(b['left']>=-.1 and b['top']>=-.1 and b['right']<=b['w']+.1 and b['bottom']<=b['h']+.1 for b in boxes),boxes)
 shot(p,'33-edge-safe-attachment-fan.png')


def soulbond_connections(p):
 fixture(p,'soulbond-display');hold(p,True);host=obj(p,'Metalworker')['id']
 cast(p,'Walking Atlas');pay(p);click(p,'resolve','.stack-window');closed_inspector(p)
 check('soulbond uses an optional trigger and does not draw a targeting arrow',state(p,'state.stack.length')==1 and p.locator('#target-links .target-link').count()==0 and p.locator('#permanent-links .soulbond').count()==0)
 click(p,'resolve','.stack-window');check('soulbond stops for a real optional partner choice',pending(p)['key']=='soulbondPartner' and pending(p)['min']==0)
 partner=obj(p,'Walking Atlas')['id'];choose_cards(p,[partner]);p.wait_for_selector('#permanent-links .soulbond')
 check('paired creatures show one persistent soulbond line, not two duplicate arrows',p.locator('#permanent-links .soulbond').count()==1)
 check('soulbond is visually distinct from an equipment arrow',p.locator('#permanent-links .soulbond path').get_attribute('marker-end') is None)
 before_host=pos(p,host);drag_id(p,partner,130,60)
 check('soulbond partners move independently rather than following like Equipment',pos(p,host)['x']==before_host['x'] and pos(p,host)['y']==before_host['y'])
 inspect_exposed(p,partner);check('soulbond inspector names the partner without an attachment-follow toggle','Metalworker' in p.locator('.bond-status').inner_text() and p.locator('[data-action=attachment-follow]').count()==0);closed_inspector(p)
 shot(p,'34-soulbond-connection.png')
 activate(p,'Krark-Clan Ironworks','sacrifice');choose_cards(p,[partner]);settle(p);closed_inspector(p)
 p.wait_for_function('document.querySelectorAll("#permanent-links .soulbond").length===0')
 check('sacrificing a soulbond partner clears both pairing references and the visual link',obj(p,'Walking Atlas','graveyard') is not None and not obj(p,'Metalworker').get('pairedWith'))
