import { bounds, overlaps, round } from './geometry.js';
import { sameRef } from '../core/util.js';

/** Relationships come from rules state, never from proximity or chosen targets.
 * Incarnation references prevent a blinked card from inheriting an old link. */
export function permanentLinks(g) {
  const links=[], seen=new Set();
  for(const source of g.objects('battlefield')) {
    const target=source.attachedTo&&g.object(source.attachedTo);
    if(target?.zone==='battlefield'&&target.id!==source.id) {
      const subtypes=g.characteristics(source).subtypes;
      links.push({kind:subtypes.includes('Equipment')?'equipment':'aura',source:source.id,target:target.id,
        sourceRef:{id:source.id,oid:source.oid},targetRef:{id:target.id,oid:target.oid},
        name:g.definition(source).name,targetName:g.definition(target).name});
    }
    const partner=source.pairedWith&&g.object(source.pairedWith);
    if(partner?.zone!=='battlefield'||partner.id===source.id||!sameRef(partner.pairedWith,source)||
      source.controller!==partner.controller||(source.pairedController!=null&&source.pairedController!==source.controller)||(partner.pairedController!=null&&partner.pairedController!==partner.controller)||!g.characteristics(source).types.includes('Creature')||
      !g.characteristics(partner).types.includes('Creature'))continue;
    const key=[source.id,partner.id].sort().join('/');if(seen.has(key))continue;seen.add(key);
    links.push({kind:'soulbond',source:source.id,target:partner.id,
      sourceRef:{id:source.id,oid:source.oid},targetRef:{id:partner.id,oid:partner.oid},
      name:g.definition(source).name,targetName:g.definition(partner).name});
  }
  return links;
}
export const followsAttachment=o=>o?.flags?.followAttached!==false;
export function canFollow(g,o) {
  return o?.zone==='battlefield'&&(!!o.attachedTo||g.characteristics(o).subtypes.some(t=>t==='Equipment'||t==='Aura'));
}
/** A memo is valid only while the underlying saved layout is unchanged. This
 * preserves the last visible position after detachment, without overriding a
 * later manual drop, a restored location, or a different incarnation. */
export function attachmentBasis(o) {
  const p=o.location;
  return JSON.stringify([p?.x??null,p?.y??null,p?.anchor??null,o.flags?.tableZ??null,followsAttachment(o)]);
}
export function followingParents(g, links=permanentLinks(g)) {
  const parents=new Map(links.filter(l=>l.kind!=='soulbond'&&followsAttachment(g.object(l.source))).map(l=>[l.source,l.target]));
  // Ignore corrupt/cyclic imported relationships rather than hanging rendering.
  // Real rules cannot create an attachment cycle, but presentation is defensive.
  const done=new Set();
  for(const id of parents.keys()) {
    const path=[],seen=new Set();let at=id;
    while(parents.has(at)&&!done.has(at)){
      if(seen.has(at)){for(const member of path.slice(path.indexOf(at)))parents.delete(member);break;}
      seen.add(at);path.push(at);at=parents.get(at);
    }
    path.forEach(p=>done.add(p));
  }
  return parents;
}
/** Compute the fan in world coordinates; do not move the host or change the
 * camera. Siblings expose separate top/name strips and left edges. The child
 * stays independently tapped/untapped, including reconfigured equipment. */
export function attachmentLayout(g,cards,parents=followingParents(g),viewport=null) {
  const byId=new Map(cards.map(c=>[c.id,{...c}])),children=new Map();
  for(const [id,host] of parents)if(byId.has(id)&&byId.has(host)){
    if(!children.has(host))children.set(host,[]);children.get(host).push(id);
  }
  for(const ids of children.values())ids.sort((a,b)=>byId.get(a).index-byId.get(b).index||a.localeCompare(b));
  const order=[],visited=new Set();
  function group(id){
    if(visited.has(id))return;visited.add(id);const host=byId.get(id),r=bounds(host),ids=children.get(id)||[];
    let dx=-24,dy=-24;
    if(viewport&&overlaps(r,viewport)&&ids.length){
      const left=Math.max(0,r.left-viewport.left),right=Math.max(0,viewport.right-r.right);
      const up=Math.max(0,r.top-viewport.top),down=Math.max(0,viewport.bottom-r.bottom);
      const sx=left>=24*ids.length||left>=right?-1:1,sy=up>=24*ids.length||up>=down?-1:1;
      dx=sx*Math.min(24,Math.max(1,(sx<0?left:right)/ids.length));
      dy=sy*Math.min(24,Math.max(1,(sy<0?up:down)/ids.length));
    }
    ids.forEach((childId,i)=>{const child=byId.get(childId),b=bounds(child);
      let x=r.left+dx*(i+1),top=r.top+dy*(i+1);
      if(viewport&&overlaps(r,viewport)){
        x=Math.max(viewport.left,Math.min(viewport.right-b.width,x));
        top=Math.max(viewport.top,Math.min(viewport.bottom-b.height,top));
      }
      child.x=round(x);child.y=round(top+b.height);delete child.autoArrival;
    });
    for(const childId of [...ids].reverse())group(childId);
    order.push(host);
  }
  // Group roots keep their previous bottom-to-top order. Every following child
  // is below its own host; a manual follower remains an independent root.
  const roots=cards.filter(c=>!parents.has(c.id)||!byId.has(parents.get(c.id))).sort((a,b)=>a.z-b.z||a.index-b.index);
  roots.forEach(c=>group(c.id));cards.forEach(c=>group(c.id));
  order.forEach((c,i)=>{c.z=i;});
  return cards.map(c=>byId.get(c.id));
}
/** Add descendants to a host drag once, but dragging a selected attachment
 * explicitly breaks only that card's following relationship on a valid drop. */
export function attachmentDrag(g,cards,ids,primary,parents=followingParents(g)) {
  const explicit=new Set(ids), moving=new Set(ids), children=new Map();
  for(const [child,host] of parents){if(!children.has(host))children.set(host,[]);children.get(host).push(child);}
  const queue=[...ids];for(let i=0;i<queue.length;i++)for(const child of children.get(queue[i])||[])
    if(!moving.has(child)){moving.add(child);queue.push(child);}
  const manualIds=[...explicit].filter(id=>id===primary||!moving.has(parents.get(id)));
  return {ids:cards.filter(c=>moving.has(c.id)).sort((a,b)=>a.z-b.z||a.index-b.index).map(c=>c.id),manualIds};
}
