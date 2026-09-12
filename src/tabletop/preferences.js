import { clamp } from './geometry.js';
export const PREF_KEY='astra-table-layout-v2';
export function defaultPreferences(){return {version:2,sidebarWidth:100,handHeight:155,dockWidth:290,dock:null,
  cameras:{},popups:{},holdPriority:false,reserveAccess:true,orderTriggers:true,deckText:null};}
export function cleanPreferences(value={}){
  const p=defaultPreferences(); if(!value||typeof value!=='object')return p;
  p.sidebarWidth=clamp(value.sidebarWidth??p.sidebarWidth,92,260);
  p.handHeight=clamp(value.handHeight??p.handHeight,80,400);
  p.dockWidth=clamp(value.dockWidth??p.dockWidth,170,900);
  p.dock=['graveyard','exile','workspace','outside'].includes(value.dock)?value.dock:null;
  for(const key of ['holdPriority','reserveAccess','orderTriggers'])if(typeof value[key]==='boolean')p[key]=value[key];
  for(const zone of ['battlefield','graveyard','exile','workspace','outside']){
    const c=value.cameras?.[zone];if(c&&Number.isFinite(c.x)&&Number.isFinite(c.y)&&Number.isFinite(c.zoom))
      p.cameras[zone]={x:clamp(c.x,-100000,100000),y:clamp(c.y,-100000,100000),zoom:clamp(c.zoom,.18,3)};
  }
  for(const key of ['inspector','stack','decision']){
    const pos=value.popups?.[key];if(pos&&Number.isFinite(pos.x)&&Number.isFinite(pos.y))p.popups[key]={x:clamp(pos.x,0,10000),y:clamp(pos.y,0,10000)};
  }
  if(typeof value.deckText==='string')p.deckText=value.deckText.slice(0,100000);
  return p;
}
export function loadPreferences(storage=globalThis.localStorage){try{return cleanPreferences(JSON.parse(storage.getItem(PREF_KEY)||'{}'));}catch{return defaultPreferences();}}
export function savePreferences(p,storage=globalThis.localStorage){try{storage.setItem(PREF_KEY,JSON.stringify(cleanPreferences(p)));return true;}catch{return false;}}
