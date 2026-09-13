import { CARD_W, CARD_H, bounds, overlaps, screenBounds } from './geometry.js';

/** Place an automatic arrival in the *visible* battlefield, not at a fixed
 * world origin. All scoring uses screen pixels, so pan and zoom are irrelevant
 * to lane selection. Existing positions and the camera are never changed.
 * Lands prefer the lower third; other permanents prefer the upper two thirds.
 * A crowded lane gets staggered overlap rather than another offscreen row.
 */
export function visiblePlacement(card, existing, viewport, camera, {land=false, obstacles=[]}={}) {
  const zoom=camera?.zoom>0&&Number.isFinite(camera.zoom)?camera.zoom:1;
  const cam={x:Number.isFinite(camera?.x)?camera.x:0,y:Number.isFinite(camera?.y)?camera.y:0,zoom};
  const width=Math.max(1,viewport.width),height=Math.max(1,viewport.height);
  const view={left:0,top:0,width,height,right:width,bottom:height};
  const w=(card.tapped?CARD_H:CARD_W)*zoom,h=(card.tapped?CARD_W:CARD_H)*zoom;
  // At extreme zoom on a tiny surface, keep the largest possible portion in
  // view, including the top/name strip. Do not silently zoom or pan the table.
  const pad=Math.min(10,width*.025,height*.025);
  const minX=w+2*pad<=width?pad:0,maxX=Math.max(minX,width-w-pad);
  const minY=h+2*pad<=height?pad:0,maxY=Math.max(minY,height-h-pad);
  const split=height*2/3;
  let low=land?Math.max(minY,split+pad):minY;
  let high=land?maxY:Math.min(maxY,split-pad-h);
  if(high<low){ // Lane too shallow: keep the card visible, near its own edge.
    low=high=land?maxY:minY;
  }
  const occupied=existing.map(c=>screenBounds(c,view,cam)).filter(r=>overlaps(r,view));
  const blockers=obstacles.filter(r=>overlaps(r,view));
  const area=(a,b)=>Math.max(0,Math.min(a.right,b.right)-Math.max(a.left,b.left))*Math.max(0,Math.min(a.bottom,b.bottom)-Math.max(a.top,b.top));
  const axis=(lo,hi,step)=>{
    const result=[lo];for(let p=lo+step;p<hi-.01;p+=step)result.push(p);
    if(hi>lo+.01)result.push(hi);return result;
  };
  let best=null,bestScore=Infinity;
  function consider(x,y){
    const r={left:x,top:y,right:x+w,bottom:y+h};
    let score=0;
    for(const other of occupied){
      const covered=area(r,other);score+=covered;
      // Prefer a visibly offset stack even when a lane is already full.
      if(Math.abs(x-other.left)<8&&(Math.abs(y-other.top)<8||Math.abs(y+h-other.bottom)<8))score+=w*h*20;
    }
    for(const other of blockers)score+=area(r,other)*8;
    if(score<bestScore){bestScore=score;best={x,y};}
    return score===0;
  }
  // Fast path: a loose grid, bounded by the current surface dimensions.
  outer:for(const y of axis(low,high,h+12))for(const x of axis(minX,maxX,w+12)){
    if(consider(x,y))break outer;
  }
  if(bestScore>0){
    // Dense candidate grid plus offsets from real cards: avoids identical
    // positions without an unbounded offscreen vacancy search. Cap the grid
    // density for large monitors and huge token batches.
    const dx=Math.max(18,Math.min(36,w*.24),(maxX-minX)/60);
    const dy=Math.max(18,Math.min(32,h*.18),(high-low)/35);
    outer:for(const y of axis(low,high,dy))for(const x of axis(minX,maxX,dx)){
      if(consider(x,y))break outer;
    }
    if(bestScore>0)for(const other of occupied){
      for(const [dx,dy] of [[22,0],[-22,0],[0,22],[0,-22],[22,22]]){
        consider(Math.min(maxX,Math.max(minX,other.left+dx)),Math.min(high,Math.max(low,other.top+dy)));
      }
    }
  }
  return {x:(best.x-cam.x)/zoom,y:(best.y+h-cam.y)/zoom,
    z:Math.max(-1,...existing.map(c=>Number.isFinite(c.z)?c.z:-1))+1};
}
