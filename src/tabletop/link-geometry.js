const center=r=>({x:r.left+r.width/2,y:r.top+r.height/2});
function edge(r,towards){const c=center(r),dx=towards.x-c.x,dy=towards.y-c.y,scale=1/Math.max(Math.abs(dx)/(r.width/2+3),Math.abs(dy)/(r.height/2+3),1);return{x:c.x+dx*scale,y:c.y+dy*scale};}
export function arrowGeometry(from,to){
  const a=edge(from,center(to)),b=edge(to,center(from)),dx=b.x-a.x,dy=b.y-a.y;
  const distance=Math.hypot(dx,dy),bow=Math.min(70,distance*.12),nx=distance?-dy/distance:0,ny=distance?dx/distance:0;
  const n=v=>Math.round(v*10)/10;
  return {d:`M${n(a.x)},${n(a.y)} C${n(a.x+dx*.32+nx*bow)},${n(a.y+dy*.32+ny*bow)} ${n(a.x+dx*.68+nx*bow)},${n(a.y+dy*.68+ny*bow)} ${n(b.x)},${n(b.y)}`,end:b};
}
