import { CARD_W,CARD_H,bounds,contains,overlaps,canonicalHit,worldPoint,screenBounds,anchorFromGrab,zoomAt,dropOrder,clamp } from './geometry.js';
import { picture } from './views.js';
/** Real geometry, rather than elevated DOM paint order, owns all picking. */
export function installInteractions(api){
  let gesture=null,space=false,lastPointer=null;
  const pointer=e=>({x:e.clientX,y:e.clientY});
  const rect=el=>el.getBoundingClientRect();
  const camera=zone=>api.prefs.cameras[zone]||{x:0,y:0,zoom:1};
  const getSurface=p=>[...document.querySelectorAll('[data-surface]')].find(el=>contains(rect(el),p));
  const hit=(el,p)=>canonicalHit(api.ui.layouts[el.dataset.surface]||[],worldPoint(p,rect(el),camera(el.dataset.surface)));
  function handHit(p){return [...document.querySelectorAll('[data-hand-position]')].reverse().find(el=>contains(rect(el),p))?.dataset.handPosition||null;}
  function clearHover(){for(const el of document.querySelectorAll('.hover-lift'))el.classList.remove('hover-lift');}
  function hover(p){
    clearHover();if(gesture||api.ui.modal)return;
    const top=document.elementFromPoint(p.x,p.y);if(top?.closest('.floating,.opening-prompt,.view-control'))return;
    const surface=getSurface(p);let el;
    if(surface){const card=hit(surface,p);if(card)el=surface.querySelector(`[data-position="${card.id}"]`);}
    else if(top?.closest('.hand')){const id=handHit(p);if(id)el=document.querySelector(`[data-hand-position="${id}"]`);}
    el?.classList.add('hover-lift');
  }
  function endGhosts(){document.querySelectorAll('.drag-ghost,.marquee').forEach(el=>el.remove());document.querySelectorAll('.being-dragged,.drop-target').forEach(el=>el.classList.remove('being-dragged','drop-target'));}
  function ghosts(p){
    const d=gesture,dest=getSurface(p),zone=dest?.dataset.surface;
    const scale=dest?camera(zone).zoom:d.scale;
    const ref=anchorFromGrab({x:0,y:0},d.grab,d.tapped);
    for(const item of d.items){
      let ghost=document.querySelector(`.drag-ghost[data-ghost="${item.id}"]`);
      if(!ghost){ghost=document.createElement('div');ghost.className='drag-ghost';ghost.dataset.ghost=item.id;ghost.innerHTML=`<div class="card-position ${item.tapped?'tapped':''}" style="left:0;top:${-CARD_H}px">${picture(api.g,item.id)}</div>`;document.body.append(ghost);}
      ghost.style.left=`${p.x+(ref.x+item.dx)*scale}px`;ghost.style.top=`${p.y+(ref.y+item.dy)*scale}px`;ghost.style.transform=`scale(${scale})`;
      item.el?.classList.add('being-dragged');
    }
    for(const el of document.querySelectorAll('[data-surface]'))el.classList.toggle('drop-target',el===dest);
  }
  document.addEventListener('pointerdown',e=>{
    if(e.button!==0||api.ui.modal)return;const target=e.target,p=pointer(e);lastPointer=p;
    const resize=target.closest('[data-resize]');
    const panel=target.closest('[data-drag-panel]');
    if(resize){e.preventDefault();gesture={kind:'resize',id:e.pointerId,key:resize.dataset.resize,start:p,old:{...api.prefs}};}
    else if(panel&&!target.closest('button,input,select')){e.preventDefault();const f=panel.closest('.floating'),r=rect(f);gesture={kind:'panel',id:e.pointerId,key:panel.dataset.dragPanel,start:p,x:r.left,y:r.top,width:r.width,height:r.height,el:f};}
    else if(target.closest('.floating,.opening-prompt,.modal-backdrop,.view-control,.toolbar,.resize-line'))return;
    else{
      const surface=getSurface(p),hand=target.closest('.hand'),rail=target.closest('.rail');
      let picked=surface?hit(surface,p)?.id:hand?handHit(p):rail?target.closest('[data-card]')?.dataset.card:null;
      if(surface&&(space||!picked)){
        const zone=surface.dataset.surface;
        gesture={kind:!space&&(api.ui.selectMode||e.shiftKey)?'box':'pan',id:e.pointerId,start:p,zone,el:surface,cam:{...camera(zone)},original:new Set(e.shiftKey?api.ui.selected:[])};
      }else if(picked){
        const object=api.g.object(picked);if(!object)return;
        const el=surface?surface.querySelector(`[data-position="${picked}"]`):hand?document.querySelector(`[data-hand-position="${picked}"]`):target.closest('[data-card]');
        const r=rect(el),sourceZone=surface?.dataset.surface||object.zone,tapped=surface?object.tapped:false;
        const base=(api.ui.layouts[sourceZone]||[]).find(c=>c.id===picked)||{x:0,y:0};
        const ids=surface&&api.ui.selected.has(picked)?[...api.ui.selected].filter(id=>api.g.object(id)?.zone===object.zone):[picked];
        gesture={kind:'card',id:e.pointerId,start:p,primary:picked,zone:sourceZone,tapped,active:false,
          scale:r.width/(tapped?CARD_H:CARD_W),grab:{x:(p.x-r.left)/r.width,y:(p.y-r.top)/r.height},shift:e.shiftKey,
          items:ids.map(id=>{const c=api.ui.layouts[sourceZone]?.find(c=>c.id===id)||base;return {id,tapped:surface?!!api.g.object(id)?.tapped:false,dx:c.x-base.x,dy:c.y-base.y,el:surface?surface.querySelector(`[data-position="${id}"]`):el};})};
      }else return;
      e.preventDefault();
    }
    if(gesture){api.ui.gestureActive=true;clearHover();try{document.body.setPointerCapture(e.pointerId);}catch{}}
  });
  document.addEventListener('pointermove',e=>{
    const p=pointer(e);lastPointer=p;
    if(!gesture){hover(p);return;}if(gesture.id!==e.pointerId)return;
    const d=gesture,dx=p.x-d.start.x,dy=p.y-d.start.y;
    if(d.kind==='resize'){
      if(d.key==='sidebar')api.prefs.sidebarWidth=clamp(d.old.sidebarWidth+dx,92,Math.min(260,innerWidth*.45));
      if(d.key==='hand')api.prefs.handHeight=clamp(d.old.handHeight-dy,80,Math.min(400,innerHeight*.6));
      if(d.key==='dock')api.prefs.dockWidth=clamp(d.old.dockWidth-dx,170,Math.max(170,innerWidth-api.prefs.sidebarWidth-150));
      api.size();return;
    }
    if(d.kind==='panel'){
      const pos={x:clamp(d.x+dx,0,innerWidth-d.width),y:clamp(d.y+dy,0,innerHeight-d.height)};
      d.el.style.left=pos.x+'px';d.el.style.top=pos.y+'px';api.ui.popupPositions[d.key]=pos;api.prefs.popups[d.key]=pos;return;
    }
    if(d.kind==='pan'){
      api.prefs.cameras[d.zone]={...d.cam,x:d.cam.x+dx,y:d.cam.y+dy};api.applyCamera(d.zone);return;
    }
    if(d.kind==='box'){
      const r=rect(d.el),c=camera(d.zone),a=worldPoint(d.start,r,c),b=worldPoint(p,r,c);
      const box={left:Math.min(a.x,b.x),right:Math.max(a.x,b.x),top:Math.min(a.y,b.y),bottom:Math.max(a.y,b.y)};
      api.ui.selected=new Set(d.original);for(const card of api.ui.layouts[d.zone]||[])if(overlaps(bounds(card),box))api.ui.selected.add(card.id);
      d.el.querySelectorAll('[data-card]').forEach(el=>el.classList.toggle('selected',api.ui.selected.has(el.dataset.card)));
      let m=d.el.querySelector('.marquee');if(!m){m=document.createElement('div');m.className='marquee';d.el.append(m);}
      Object.assign(m.style,{left:`${Math.min(p.x,d.start.x)-r.left}px`,top:`${Math.min(p.y,d.start.y)-r.top}px`,width:`${Math.abs(dx)}px`,height:`${Math.abs(dy)}px`});return;
    }
    if(d.kind==='card'){
      if(!d.active&&Math.hypot(dx,dy)>5){
        if(api.g.state.pending||!['battlefield','graveyard','exile','outside','hand','command'].includes(d.zone)){d.blocked=true;return;}
        d.active=true;
      }
      if(d.active)ghosts(p);
    }
  },{passive:false});
  function finish(e,cancelled=false){
    if(!gesture||gesture.id!==e.pointerId)return;const d=gesture,p=pointer(e);gesture=null;api.ui.gestureActive=false;
    try{document.body.releasePointerCapture(e.pointerId);}catch{}endGhosts();
    if(cancelled){api.render();return;}
    if(['resize','panel','pan'].includes(d.kind)){api.savePreferences();api.size();return;}
    if(d.kind==='box'){api.render();return;}
    if(!d.active){if(!d.blocked)api.clickCard(d.primary,p,d.shift);return;}
    const dest=getSurface(p),zone=dest?.dataset.surface;if(!dest){api.render();return;}
    const world=worldPoint(p,rect(dest),camera(zone)),position=anchorFromGrab(world,d.grab,d.tapped);
    const moved=d.items.map(item=>({id:item.id,tapped:item.tapped,x:position.x+item.dx,y:position.y+item.dy}));
    const order=dropOrder(api.ui.layouts[zone]||[],d.items.map(i=>i.id),moved,world);
    api.ui.lastPoint=p;
    if(d.zone===zone&&['battlefield','graveyard','exile','outside'].includes(zone))api.run({type:'LAYOUT',updates:moved.map(({id,x,y})=>({id,x,y})),order,anchor:'corner-v2'});
    else if(zone==='battlefield'){
      // A cast/land play records placement as part of its own transaction.
      api.run({type:'DROP_CARD',id:d.primary,zone,placement:{...position,order}});
    }else{api.toast('Move cards between zones with the appropriate spell or ability.',true);api.render();}
    hover(p);
  }
  document.addEventListener('pointerup',e=>finish(e));document.addEventListener('pointercancel',e=>finish(e,true));
  document.addEventListener('wheel',e=>{
    if(api.ui.modal||gesture)return;const target=e.target;if(target.closest('.floating,.view-control'))return;
    const surface=target.closest('[data-surface]');if(!surface)return;e.preventDefault();
    const zone=surface.dataset.surface;api.prefs.cameras[zone]=zoomAt(camera(zone),pointer(e),rect(surface),e.deltaY*(e.deltaMode===1?16:1));
    api.applyCamera(zone);api.savePreferences();hover(pointer(e));
  },{passive:false});
  document.addEventListener('contextmenu',e=>{
    if(api.ui.modal)return;const surface=e.target.closest('[data-surface]'),p=pointer(e);
    const id=surface?hit(surface,p)?.id:e.target.closest('.hand')?handHit(p):e.target.closest('[data-card]')?.dataset.card;
    if(id){e.preventDefault();api.inspect(id,p);}
  });
  document.addEventListener('keydown',e=>{
    if(/INPUT|TEXTAREA|SELECT/.test(e.target.tagName)||e.target.isContentEditable)return;
    if(e.code==='Space'&&!api.ui.modal){space=true;e.preventDefault();}
    if(e.key==='Escape'&&gesture){e.preventDefault();e.stopImmediatePropagation();const id=gesture.id;finish({pointerId:id,clientX:lastPointer?.x||0,clientY:lastPointer?.y||0},true);}
    const divider=e.target.closest('[data-resize]');
    if(divider&&['ArrowLeft','ArrowRight','ArrowUp','ArrowDown'].includes(e.key)){
      e.preventDefault();const key=divider.dataset.resize,amount=e.shiftKey?30:10;
      if(key==='sidebar')api.prefs.sidebarWidth=clamp(api.prefs.sidebarWidth+(e.key==='ArrowRight'?amount:-amount),92,260);
      if(key==='hand')api.prefs.handHeight=clamp(api.prefs.handHeight+(e.key==='ArrowUp'?amount:-amount),80,400);
      if(key==='dock')api.prefs.dockWidth=clamp(api.prefs.dockWidth+(e.key==='ArrowLeft'?amount:-amount),170,900);
      api.size();api.savePreferences();
    }
  },true);
  document.addEventListener('keyup',e=>{if(e.code==='Space')space=false;});
  window.addEventListener('blur',()=>{space=false;if(gesture)finish({pointerId:gesture.id,clientX:0,clientY:0},true);});
  return {refreshHover:()=>lastPointer&&hover(lastPointer),cancel:()=>gesture&&finish({pointerId:gesture.id,clientX:0,clientY:0},true)};
}
