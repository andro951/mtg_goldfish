import { CARD_W,CARD_H } from './geometry.js';
const key=o=>`${o.id}:${o.oid}`;
const GAP=8,PAD=8;
/** Pick the responsive grid shape that permits the largest card scale inside
 * the current side-zone surface. The camera itself still caps at 100%, so for
 * a few cards we prefer a compact shape rather than gratuitous whitespace. */
export function bestGridShape(count,width=290,height=420){
  if(count<=0)return {columns:1,rows:0,zoom:1,width:0,height:0};
  const usableW=Math.max(CARD_W,width-PAD*2),usableH=Math.max(CARD_H,height-PAD*2);
  let best=null;
  for(let columns=1;columns<=count;columns++){
    const rows=Math.ceil(count/columns),gridW=columns*CARD_W+(columns-1)*GAP,gridH=rows*CARD_H+(rows-1)*GAP;
    const zoom=Math.min(1,usableW/gridW,usableH/gridH);
    const occupied=Math.min(1,gridW*zoom/usableW)*Math.min(1,gridH*zoom/usableH);
    const candidate={columns,rows,zoom,width:gridW,height:gridH,occupied};
    if(!best||candidate.zoom>best.zoom+.0001||(Math.abs(candidate.zoom-best.zoom)<.0001&&candidate.occupied>best.occupied+.0001)||(Math.abs(candidate.zoom-best.zoom)<.0001&&Math.abs(candidate.occupied-best.occupied)<.0001&&candidate.columns<best.columns))best=candidate;
  }
  return best;
}
/** A slot is owned by an object incarnation, not by its last painted rectangle.
 * Manually positioned cards immediately release their slots. New arrivals use
 * the first hole, even when a detached card still visually covers that slot.
 * Grid-owned cards reflow responsively; detached coordinates never do. */
export function gridLayout(objects, previous=[], width=290,height=420,fixedColumns=null) {
  const live=new Map(objects.filter(o=>!o.location||o.location.grid===o.zone).map(o=>[key(o),o]));
  const used=new Set(),slots=Array.from(previous,k=>{if(!live.has(k)||used.has(k))return null;used.add(k);return k;});
  for(const o of objects)if(live.has(key(o))&&!used.has(key(o))){
    const desired=o.location?.grid===o.zone?o.location.slot:null;
    let index=Number.isInteger(desired)&&desired>=0&&desired<5000&&!slots[desired]?desired:slots.indexOf(null);
    if(index<0)index=slots.length;while(slots.length<=index)slots.push(null);slots[index]=key(o);used.add(key(o));
  }
  while(slots.length&&slots.at(-1)==null)slots.pop();
  // Holes still occupy cells. Map.size collapses repeated nulls and can choose
  // too few rows after several cards have been detached.
  const indices=new Map(slots.map((k,i)=>[k,i]).filter(([k])=>k!==null));
  const shape=bestGridShape(slots.length,width,height);
  if(Number.isInteger(fixedColumns)&&fixedColumns>0){shape.columns=fixedColumns;shape.rows=Math.ceil(slots.length/fixedColumns);}
  const cards=objects.map((o,index)=>{
    const slot=indices.get(key(o)),manual=slot==null,pos=o.location;
    return {id:o.id,index,tapped:!!o.tapped,z:Number.isFinite(o.flags?.tableZ)?o.flags.tableZ:index,gridSlot:manual?null:slot,
      x:manual?(pos?.x||0):PAD+(slot%shape.columns)*(CARD_W+GAP),
      y:manual?(pos?.y||0)+(pos?.anchor==='corner-v2'?0:CARD_H):CARD_H+PAD+Math.floor(slot/shape.columns)*(CARD_H+GAP)};
  });
  return {slots,cards,shape};
}
export function cleanGrids(value){
  const result={};for(const zone of ['graveyard','exile','outside'])if(Array.isArray(value?.[zone]))
    result[zone]=value[zone].slice(0,5000).map(k=>typeof k==='string'&&/^[\w-]+:\d+$/.test(k)?k:null);
  return result;
}

/** Membership, not just viewport size, owns a responsive grid. Ordinary
 * inspection/dragging keeps the existing camera; arrivals and departures
 * recompute columns so an initially empty zone cannot grow one endless row.
 * Coordinates are excluded deliberately: moving a card is not a new arrival.
 */
export function gridMembership(objects){return objects.map(key).sort().join('|');}
export function responsiveGrid(objects,slots,width,height,previous=null,force=false){
  const members=gridMembership(objects);
  const changed=force||!previous||previous.width!==width||previous.height!==height||previous.members!==members;
  const grid=gridLayout(objects,slots,width,height,changed?null:previous.columns);
  return {...grid,changed,view:{width,height,columns:grid.shape.columns,members}};
}
