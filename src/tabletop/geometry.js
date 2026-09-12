/** Presentation geometry. A card's anchor is its upright bottom-left corner.
 * Clockwise tapping brings the physical bottom-right corner to that anchor.
 * Hover elevation NEVER participates in picking or persistent layer order. */
export const CARD_W = 110;
export const CARD_H = CARD_W * 88 / 63;
export const clamp = (n, min, max) => Math.min(max, Math.max(min, Number(n) || 0));
export const round = n => Math.round(n * 1000) / 1000;
export function bounds(card, width = CARD_W, height = CARD_H) {
  return card.tapped
    ? {left:card.x, top:card.y-width, right:card.x+height, bottom:card.y, width:height, height:width}
    : {left:card.x, top:card.y-height, right:card.x+width, bottom:card.y, width, height};
}
export const contains = (r,p) => p.x >= r.left && p.x <= r.right && p.y >= r.top && p.y <= r.bottom;
export const overlaps = (a,b) => a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top;
export function worldPoint(point, viewport, camera) {
  return {x:(point.x-viewport.left-camera.x)/camera.zoom, y:(point.y-viewport.top-camera.y)/camera.zoom};
}
export function screenBounds(card, viewport, camera) {
  const r=bounds(card), z=camera.zoom;
  return {left:viewport.left+camera.x+r.left*z,top:viewport.top+camera.y+r.top*z,
    right:viewport.left+camera.x+r.right*z,bottom:viewport.top+camera.y+r.bottom*z,width:r.width*z,height:r.height*z};
}
export function canonicalHit(cards, point) {
  let found=null;
  for(const card of cards)if(contains(bounds(card),point)&&(!found||card.z>found.z||(card.z===found.z&&card.index>found.index)))found=card;
  return found;
}
export function anchorFromGrab(point, grab, tapped=false) {
  const width=tapped?CARD_H:CARD_W, height=tapped?CARD_W:CARD_H;
  const left=point.x-grab.x*width, top=point.y-grab.y*height;
  return {x:round(left), y:round(top+height)};
}
export function zoomAt(camera, point, viewport, delta) {
  const world=worldPoint(point,viewport,camera), zoom=clamp(camera.zoom*Math.exp(-clamp(delta,-1000,1000)*.0015),.18,3);
  return {zoom,x:point.x-viewport.left-world.x*zoom,y:point.y-viewport.top-world.y*zoom};
}
export function fitCamera(cards,width,height,padding=16) {
  if(!cards.length)return {zoom:1,x:0,y:0};
  const boxes=cards.map(c=>bounds(c));
  const left=Math.min(...boxes.map(b=>b.left)),top=Math.min(...boxes.map(b=>b.top));
  const right=Math.max(...boxes.map(b=>b.right)),bottom=Math.max(...boxes.map(b=>b.bottom));
  const zoom=clamp(Math.min((width-padding*2)/(right-left),(height-padding*2)/(bottom-top),1),.18,3);
  return {zoom,x:padding-left*zoom,y:padding-top*zoom};
}
export function cardLayout(objects, viewportWidth=900) {
  const columns=Math.max(1,Math.floor((viewportWidth-CARD_H-18)/(CARD_W+10)));
  return objects.map((object,index)=>{
    const old=object.location, modern=old?.anchor==='corner-v2';
    return {id:object.id,index,tapped:!!object.tapped,
      x:old?old.x:CARD_H+10+(index%columns)*(CARD_W+10),
      y:old?old.y+(modern?0:CARD_H):CARD_H+14+Math.floor(index/columns)*(CARD_H+16),
      z:Number.isFinite(object.flags?.tableZ)?object.flags.tableZ:index};
  });
}
/** Return bottom-to-top order. Preserve existing stationary order whenever
 * possible. Cursor-covered cards go below the drop; overlapping cards that
 * the cursor does not cover go above it. In a contradictory old stack, the
 * explicit drop constraints take priority, with a stable partition. */
export function dropOrder(cards, movingIds, movedCards, cursor) {
  const moving=new Set(movingIds), stationary=[...cards].filter(c=>!moving.has(c.id)).sort((a,b)=>a.z-b.z||a.index-b.index);
  const movedBounds=movedCards.map(c=>bounds(c));
  const below=stationary.filter(c=>contains(bounds(c),cursor));
  const above=stationary.filter(c=>!contains(bounds(c),cursor)&&movedBounds.some(r=>overlaps(r,bounds(c))));
  const lower=Math.max(-1,...below.map(c=>stationary.indexOf(c)))+1;
  const upper=Math.min(stationary.length,...above.map(c=>stationary.indexOf(c)));
  if(lower<=upper)return [...stationary.slice(0,lower).map(c=>c.id),...movingIds,...stationary.slice(lower).map(c=>c.id)];
  const ids=new Set(below.map(c=>c.id));
  return [...stationary.filter(c=>ids.has(c.id)).map(c=>c.id),...movingIds,...stationary.filter(c=>!ids.has(c.id)).map(c=>c.id)];
}
export function popupPosition(anchor,width,height,viewport,saved=null) {
  const gap=12, maxX=Math.max(4,viewport.width-width-4),maxY=Math.max(4,viewport.height-height-4);
  let x=saved?.x??(anchor.x+gap),y=saved?.y??(anchor.y+gap);
  if(!saved){if(x>maxX)x=anchor.x-width-gap;if(y>maxY)y=anchor.y-height-gap;}
  return {x:clamp(x,4,maxX),y:clamp(y,4,maxY)};
}

/** Prefer a nearby free rectangle for automatic popups. Explicitly positioned
 * windows keep their positions; small screens can still overlap and be moved. */
export function avoidPopupOverlap(preferred,width,height,viewport,occupied=[]){
  const clampPos=p=>({x:clamp(p.x,4,Math.max(4,viewport.width-width-4)),y:clamp(p.y,34,Math.max(34,viewport.height-height-4))});
  const candidates=[clampPos(preferred)];
  for(const r of occupied){
    candidates.push(clampPos({x:r.left-width-8,y:preferred.y}),clampPos({x:r.right+8,y:preferred.y}),
      clampPos({x:preferred.x,y:r.top-height-8}),clampPos({x:preferred.x,y:r.bottom+8}));
  }
  const score=p=>occupied.reduce((sum,r)=>sum+Math.max(0,Math.min(p.x+width,r.right)-Math.max(p.x,r.left))*Math.max(0,Math.min(p.y+height,r.bottom)-Math.max(p.y,r.top)),0)*1000+Math.hypot(p.x-preferred.x,p.y-preferred.y);
  return candidates.sort((a,b)=>score(a)-score(b))[0];
}
