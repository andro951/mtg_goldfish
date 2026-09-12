from ui_acceptance_support import *

def interaction_performance(p):
 fixture(p,'target-many');activate(p,'Krark-Clan Ironworks','sacrifice')
 p.evaluate('window.savedTable=document.querySelector(".surface");window.savedGallery=document.querySelector(".decision-gallery")')
 # Invoke real UI buttons repeatedly; do not call engine actions directly.
 report=p.evaluate('''() => {
   const ids=astra.engine.state.pending.candidates.slice(0,20),times=[];
   for(const id of ids){const start=performance.now();document.querySelector('.decision-gallery [data-action="card"][data-id="'+id+'"]').click();times.push(performance.now()-start);}
   return {max:Math.max(...times),sameTable:savedTable===document.querySelector('.surface'),sameGallery:savedGallery===document.querySelector('.decision-gallery')};
 }''')
 check('49-permanent targeting reuses table and gallery across 20 selections',report['sameTable'] and report['sameGallery'])
 check('repeated target selections avoid long synchronous stalls',report['max']<200,report)
 p.keyboard.press('Escape');fixture(p,'layers');o=obj(p,'Ancient Den');b=card(p,o['id'],'battlefield').bounding_box()
 p.mouse.move(b['x']+25,b['y']+35);p.mouse.down();p.mouse.move(b['x']+80,b['y']+90,steps=4);p.wait_for_function('()=>document.querySelector(".drag-ghost")')
 p.evaluate('window.keptGhost=document.querySelector(".drag-ghost");window.keptSurface=document.querySelector(".surface");window.keptWorld=document.querySelector(".world")')
 p.mouse.move(b['x']+140,b['y']+160,steps=20);p.wait_for_timeout(550)
 check('drag frames reuse a single preview without rebuilding the battlefield',p.evaluate('keptGhost===document.querySelector(".drag-ghost")&&keptSurface===document.querySelector(".surface")&&keptWorld===document.querySelector(".world")'))
 check('drag preview uses a composited transform rather than left/top layout writes',p.locator('.drag-ghost').evaluate('(e)=>e.style.transform.startsWith("translate3d")&&e.style.left==="0px"&&e.style.top==="0px"'))
 p.mouse.up();check('drag completion removes the temporary preview',p.locator('.drag-ghost').count()==0)
 # Inspect the actual rotation, not just its bounding box (which also fit the old wrong rotation).
 card(p,o['id'],'battlefield').click()
 matrix=p.locator('[data-position="'+o['id']+'"]').evaluate('(e)=>{const m=new DOMMatrix(getComputedStyle(e).transform);return {a:m.a,b:m.b,c:m.c,d:m.d,origin:getComputedStyle(e).transformOrigin};}')
 check('tapping uses a clockwise +90-degree matrix, not a counterclockwise lookalike',abs(matrix['a'])<.001 and abs(matrix['b']-1)<.001 and abs(matrix['c']+1)<.001 and abs(matrix['d'])<.001)
 check('clockwise transform origin is the card physical bottom-right',matrix['origin'].startswith('110px'))
