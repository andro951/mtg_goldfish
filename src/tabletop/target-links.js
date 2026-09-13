import { arrowGeometry } from './link-geometry.js';
export { arrowGeometry } from './link-geometry.js';
import { installPermanentLinks } from './permanent-links.js';
/** Declared targets only. Costs, choices and non-targeting effects never become
 * misleading arrows. References include incarnation, so a blink is not retargeted. */
const NS='http://www.w3.org/2000/svg';
export function declaredLinks(g){
  const entries=[...g.state.stack,...(g.state.resolving?[g.state.resolving.object]:[])],links=[];
  for(const entry of entries)for(const [index,target] of (entry.targets||[]).entries()){
    const base={stackId:entry.id,index,label:entry.label,kind:entry.kind};
    if(target.player!=null){if(!g.state.players[target.player]?.lost)links.push({...base,player:target.player,name:g.state.players[target.player].name});}
    else if(target.stackId){const other=entries.find(s=>s.id===target.stackId);if(other)links.push({...base,targetStackId:other.id,name:other.label});}
    else if(target.ref){const o=g.object(target.ref);if(o)links.push({...base,cardId:o.id,zone:o.zone,name:g.definition(o).name});}
  }
  return links;
}
const center=r=>({x:r.left+r.width/2,y:r.top+r.height/2});
export function installTargetLinks(api){
  const permanent=installPermanentLinks(api);
  const svg=document.createElementNS(NS,'svg');svg.id='target-links';svg.setAttribute('aria-hidden','true');svg.setAttribute('focusable','false');document.body.append(svg);
  let frame=0,hovered=null,focused=null,signature='',lastLinks=[];
  const escape=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  function highlight(){permanent.highlight();const active=hovered||focused||api.ui.stackSelection;for(const group of svg.querySelectorAll('[data-link-stack]'))group.classList.toggle('emphasized',group.dataset.linkStack===active);for(const card of document.querySelectorAll('.stack-card'))card.classList.toggle('target-selected',card.dataset.stackId===api.ui.stackSelection);}
  function paint(){
    frame=0;const g=api.g;if(!g)return;
    svg.style.display=api.ui.modal?'none':'';
    const links=declaredLinks(g);lastLinks=links;
    if(!links.length){if(signature){svg.replaceChildren();signature='';}return;}
    const cards=new Map(),stacks=new Map(),players=new Map(),zones=new Map();
    for(const el of document.querySelectorAll('.surface [data-card],.hand [data-card],.rail [data-card]'))cards.set(el.dataset.card,el);
    for(const el of document.querySelectorAll('.stack-card'))stacks.set(el.dataset.stackId,el);
    for(const el of document.querySelectorAll('[data-player-target]'))players.set(Number(el.dataset.playerTarget),el);
    for(const el of document.querySelectorAll('.toolbar [data-action=zone]'))zones.set(el.dataset.zone,el);
    const cache=new Map(),rect=el=>{if(!el)return null;if(!cache.has(el))cache.set(el,el.getBoundingClientRect());const r=cache.get(el);return r.width&&r.height?r:null;};
    const viewport={left:0,top:0,right:innerWidth,bottom:innerHeight,width:innerWidth,height:innerHeight};
    const inset=(r,clip)=>{const c=center(r),x=Math.max(clip.left+9,Math.min(clip.right-9,c.x)),y=Math.max(clip.top+9,Math.min(clip.bottom-9,c.y));return {left:x-4,top:y-4,width:8,height:8};};
    // Read every geometry before writing the SVG; no read/write layout loops.
    const paths=[];
    for(const link of links){
      const from=rect(stacks.get(link.stackId));if(!from)continue;
      let el=link.player!=null?players.get(link.player):link.targetStackId?stacks.get(link.targetStackId):cards.get(link.cardId),to=rect(el),offscreen=false;
      if(link.cardId){
        const ghost=document.querySelector(`.drag-ghost[data-ghost="${CSS.escape(link.cardId)}"] .playing-card`);if(ghost){el=ghost;to=rect(ghost);}
        const clip=el?.closest('.surface,.hand,.rail'),area=clip?rect(clip):viewport;
        if(to&&area&&(to.right<area.left||to.left>area.right||to.bottom<area.top||to.top>area.bottom)){to=inset(to,area);offscreen=true;}
        if(!to){el=zones.get(link.zone)||(link.zone==='command'?document.querySelector('.command-slot'):['libraryActive','libraryReserve'].includes(link.zone)?document.querySelector('.library-deck'):null);to=rect(el);offscreen=true;}
      }
      if(!to)continue;
      const geometry=arrowGeometry(from,to);paths.push({...link,...geometry,offscreen});
    }
    const next=JSON.stringify(paths);
    if(next!==signature){signature=next;svg.setAttribute('viewBox',`0 0 ${innerWidth} ${innerHeight}`);
      svg.innerHTML=`<defs><marker id="target-arrow" markerWidth="8" markerHeight="8" refX="6" refY="3" orient="auto" markerUnits="strokeWidth"><path d="M0 0 L6 3 L0 6 Z" fill="context-stroke"/></marker></defs>`+paths.map(p=>`<g data-link-stack="${escape(p.stackId)}" data-link-target="${escape(p.cardId||p.targetStackId||'player:'+p.player)}" class="target-link ${p.kind==='spell'?'spell':'effect'} ${p.offscreen?'offscreen':''}"><title>${escape(p.label+' → '+p.name+(p.offscreen?' (in '+p.zone+')':''))}</title><path d="${p.d}" marker-end="url(#target-arrow)"/><circle cx="${p.end.x}" cy="${p.end.y}" r="3"/></g>`).join('');
    }
    highlight();
  }
  function schedule(){permanent.schedule();svg.style.display=api.ui.modal?'none':'';if(!frame)frame=requestAnimationFrame(paint);}
  document.addEventListener('pointerover',e=>{const stack=e.target.closest?.('.stack-card');if(stack){hovered=stack.dataset.stackId;highlight();}});
  document.addEventListener('pointerout',e=>{if(e.target.closest?.('.stack-card')&&!e.relatedTarget?.closest?.('.stack-card')){hovered=null;highlight();}});
  document.addEventListener('focusin',e=>{focused=e.target.closest?.('.stack-card')?.dataset.stackId||null;highlight();});
  document.addEventListener('focusout',()=>{focused=null;highlight();});
  document.addEventListener('pointermove',()=>{if(api.ui.gestureActive&&lastLinks.length)schedule();},{passive:true});
  document.addEventListener('pointerup',schedule,{passive:true});
  document.addEventListener('scroll',schedule,{passive:true,capture:true});window.addEventListener('resize',schedule,{passive:true});
  return {schedule,highlight,clear(){permanent.clear();hovered=null;focused=null;api.ui.stackSelection=null;schedule();}};
}
