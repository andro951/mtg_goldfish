import { permanentLinks } from './attachments.js';
import { screenBounds, overlaps } from './geometry.js';
import { arrowGeometry } from './link-geometry.js';
const NS='http://www.w3.org/2000/svg';
const escape=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const full=r=>({...r,right:r.right??r.left+r.width,bottom:r.bottom??r.top+r.height});
const midpoint=r=>({x:r.left+r.width/2,y:r.top+r.height/2});
/** For tucked cards connect their visible top/name strips, rather than drawing
 * an inverted edge-to-edge arrow through two overlapping rectangle centers. */
export function relationshipGeometry(from,to,kind){
 if(kind==='soulbond'||!overlaps(full(from),full(to)))return arrowGeometry(from,to);
 const a={x:from.left+from.width*.14,y:from.top+from.height*.055},b={x:to.left+to.width*.30,y:to.top+to.height*.065};
 const n=v=>Math.round(v*10)/10,bow=Math.min(30,Math.hypot(b.x-a.x,b.y-a.y)*.45);
 return {d:`M${n(a.x)},${n(a.y)} Q${n(a.x)},${n(Math.min(a.y,b.y)-bow)} ${n(b.x)},${n(b.y)}`,end:b,start:a};
}
export function installPermanentLinks(api){
 const svg=document.createElementNS(NS,'svg');svg.id='permanent-links';svg.setAttribute('aria-hidden','true');svg.setAttribute('focusable','false');document.body.append(svg);
 let frame=0,signature='',focused=null;
 function highlight(){
  const active=new Set([api.ui.hoveredCard,api.ui.inspected,focused,...api.ui.selected].filter(Boolean));
  for(const el of svg.querySelectorAll('[data-link-source]'))el.classList.toggle('emphasized',active.has(el.dataset.linkSource)||active.has(el.dataset.linkTarget));
 }
 function paint(){
  frame=0;const g=api.g,area=document.querySelector('[data-surface="battlefield"]');
  svg.style.display=api.ui.modal?'none':'';
  const links=g?permanentLinks(g):[];
  if(!area||!links.length){if(signature){svg.replaceChildren();signature='';}return;}
  // One board read, plus one read per dragging endpoint. Stationary coordinates
  // use canonical layout, ignoring hover lift. No alternating reads/writes.
  const clip=area.getBoundingClientRect(),camera=api.prefs.cameras.battlefield||{x:0,y:0,zoom:1};
  const layouts=new Map((api.ui.layouts.battlefield||[]).map(c=>[c.id,c])),ghosts=new Map();
  for(const el of document.querySelectorAll('.drag-ghost')){const face=el.querySelector('.playing-card');if(face)ghosts.set(el.dataset.ghost,face);}
  const cache=new Map();
  const rect=id=>{if(!cache.has(id)){const ghost=ghosts.get(id),card=layouts.get(id);cache.set(id,ghost?ghost.getBoundingClientRect():card?screenBounds(card,clip,camera):null);}return cache.get(id);};
  const inset=r=>{const c=midpoint(r),x=Math.max(clip.left+8,Math.min(clip.right-8,c.x)),y=Math.max(clip.top+8,Math.min(clip.bottom-8,c.y));return {left:x-3,top:y-3,width:6,height:6,right:x+3,bottom:y+3};};
  const paths=[];
  for(const link of links){
   let from=rect(link.source),to=rect(link.target);if(!from||!to)continue;
   const fromOutside=!overlaps(from,clip),toOutside=!overlaps(to,clip);if(fromOutside&&toOutside)continue;
   if(fromOutside)from=inset(from);if(toOutside)to=inset(to);
   paths.push({...link,...relationshipGeometry(from,to,link.kind),offscreen:fromOutside||toOutside});
  }
  const signatureNext=JSON.stringify([innerWidth,innerHeight,clip.left,clip.top,clip.width,clip.height,paths]);
  if(signatureNext!==signature){signature=signatureNext;svg.setAttribute('viewBox',`0 0 ${innerWidth} ${innerHeight}`);
   svg.innerHTML=`<defs><clipPath id="permanent-clip"><rect x="${clip.left}" y="${clip.top}" width="${clip.width}" height="${clip.height}"/></clipPath><marker id="attachment-arrow" markerWidth="7" markerHeight="7" refX="6" refY="3" orient="auto" markerUnits="strokeWidth"><path d="M0 0 L6 3 L0 6 Z" fill="context-stroke"/></marker></defs><g clip-path="url(#permanent-clip)">`+paths.map(p=>`<g class="permanent-link ${p.kind}${p.offscreen?' offscreen':''}" data-link-source="${escape(p.source)}" data-link-target="${escape(p.target)}" data-relationship="${p.kind}"><title>${escape(p.name+(p.kind==='soulbond'?' ↔ paired with ':' → attached to ')+p.targetName+(p.offscreen?' (offscreen)':''))}</title><path d="${p.d}"${p.kind==='soulbond'?'':' marker-end="url(#attachment-arrow)"'}/><circle cx="${p.end.x}" cy="${p.end.y}" r="2.5"/></g>`).join('')+'</g>';
  }
  highlight();
 }
 function schedule(){svg.style.display=api.ui.modal?'none':'';if(!frame)frame=requestAnimationFrame(paint);}
 document.addEventListener('focusin',e=>{focused=e.target.closest?.('[data-card]')?.dataset.card||null;highlight();});
 document.addEventListener('focusout',()=>{focused=null;highlight();});
 return {schedule,highlight,clear(){focused=null;api.ui.hoveredCard=null;schedule();}};
}
