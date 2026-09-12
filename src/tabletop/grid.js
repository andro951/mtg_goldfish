import { CARD_W,CARD_H } from './geometry.js';
const key=o=>`${o.id}:${o.oid}`;
/** A slot is owned by an object incarnation, not by its last painted rectangle.
 * Manually positioned cards immediately release their slots. New arrivals use
 * the first hole, even when a detached card still visually covers that slot. */
export function gridLayout(objects, previous=[], width=290) {
  const columns=Math.max(1,Math.floor((width-16)/(CARD_W+8)));
  const live=new Map(objects.filter(o=>!o.location||o.location.grid===o.zone).map(o=>[key(o),o]));
  const used=new Set(),slots=Array.from(previous,k=>{if(!live.has(k)||used.has(k))return null;used.add(k);return k;});
  for(const o of objects)if(live.has(key(o))&&!used.has(key(o))){
    const desired=o.location?.grid===o.zone?o.location.slot:null;
    let index=Number.isInteger(desired)&&desired>=0&&desired<5000&&!slots[desired]?desired:slots.indexOf(null);
    if(index<0)index=slots.length;while(slots.length<=index)slots.push(null);slots[index]=key(o);used.add(key(o));
  }
  while(slots.length&&slots.at(-1)==null)slots.pop();
  const indices=new Map(slots.map((k,i)=>[k,i]));
  const cards=objects.map((o,index)=>{
    const slot=indices.get(key(o)),manual=slot==null,pos=o.location;
    return {id:o.id,index,tapped:!!o.tapped,z:Number.isFinite(o.flags?.tableZ)?o.flags.tableZ:index,gridSlot:manual?null:slot,
      x:manual?(pos?.x||0):8+(slot%columns)*(CARD_W+8),
      y:manual?(pos?.y||0)+(pos?.anchor==='corner-v2'?0:CARD_H):CARD_H+8+Math.floor(slot/columns)*(CARD_H+8)};
  });
  return {slots,cards};
}
export function cleanGrids(value){
  const result={};for(const zone of ['graveyard','exile','outside'])if(Array.isArray(value?.[zone]))
    result[zone]=value[zone].slice(0,5000).map(k=>typeof k==='string'&&/^[\w-]+:\d+$/.test(k)?k:null);
  return result;
}
