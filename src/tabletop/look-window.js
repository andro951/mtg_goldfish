import { CARD_W, CARD_H, clamp, bounds } from './geometry.js';

/** Read-only projection: looking at a card never moves it out of its real zone.
 * While ordering, show only the remaining candidates, in the proposed order.
 * No card metadata/engine state is changed by opening, moving or zooming Look.
 */
export function workspaceSnapshot(g,order=[]){
  const w=g.state.lookWorkspace,p=g.state.pending,r=g.state.resolving;
  const all=(w?.ids||[]).filter(id=>{const o=g.object(id);return o&&o.zone!=='void';});
  const candidates=p?.candidates||p?.ids||[];
  const ordering=!!p?.ordered&&p.kind!=='triggerOrder'&&candidates.length>0&&candidates.every(id=>all.includes(id));
  const ids=ordering?(order.length===candidates.length&&new Set(order).size===order.length&&order.every(id=>candidates.includes(id))?order:candidates):all;
  // Each resolving stack object identifies an independent look, including two
  // successive Steelseeker triggers that reveal exactly the same top card.
  // The program marker also distinguishes repeated looks within one resolution.
  let marker=-1;
  for(let i=0;i<Math.min(r?.pc||0,r?.program?.length||0);i++)
    if(['look','scry','surveil'].includes(r.program[i]?.op))marker=i;
  return {ids,label:w?.label||'Look',visibility:w?.visibility||'private',
    episode:all.length?`${r?.object?.id||'workspace'}/${marker}/${w?.label||''}`:null,
    keys:ids.map(id=>`${id}:${g.object(id).oid}`),
    source:r?.object?.sourceCardId?g.registry.get(r.object.sourceCardId)?.name||'':''};
}
export function workspaceTransition(previous,next){
  const prior=new Set(previous?.keys||[]);
  return {open:next.keys.length>0&&(!previous?.keys?.length||next.episode!==previous.episode||next.keys.some(k=>!prior.has(k))),
    close:!!previous?.keys?.length&&!next.keys.length};
}
/** Unlike table Fit, a one-card look can enlarge to readable popup size. */
export function fitWorkspace(cards,width,height,padding=14){
  if(!cards.length)return {x:0,y:0,zoom:1};
  const boxes=cards.map(c=>bounds(c));
  const left=Math.min(...boxes.map(b=>b.left)),top=Math.min(...boxes.map(b=>b.top));
  const w=Math.max(CARD_W,Math.max(...boxes.map(b=>b.right))-left);
  const h=Math.max(CARD_H,Math.max(...boxes.map(b=>b.bottom))-top);
  const zoom=clamp(Math.min((width-padding*2)/w,(height-padding*2)/h),.18,3);
  return {zoom,x:(width-w*zoom)/2-left*zoom,y:(height-h*zoom)/2-top*zoom};
}
