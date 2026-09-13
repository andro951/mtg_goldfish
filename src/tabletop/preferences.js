import { futurePrograms } from './programs.js';
import { clamp } from './geometry.js';
export const PREF_KEY='astra-table-layout-v2';
export function defaultPreferences(){return {version:2,sidebarWidth:100,handHeight:155,dockWidth:290,dock:null,workspaceOpen:false,
  cameras:{},gridViews:{},popups:{},modeDefaults:{},holdPriority:false,reserveAccess:true,orderTriggers:true,autoAccept:false,manualControls:false,popupSizes:{},playerDefaults:{},savedPrograms:{},deckText:null};}
export function cleanPreferences(value={}){
  const p=defaultPreferences(); if(!value||typeof value!=='object')return p;
  p.sidebarWidth=clamp(value.sidebarWidth??p.sidebarWidth,92,260);
  p.handHeight=clamp(value.handHeight??p.handHeight,80,400);
  p.dockWidth=clamp(value.dockWidth??p.dockWidth,170,10000);
  p.dock=['graveyard','exile','outside'].includes(value.dock)?value.dock:null;
  p.workspaceOpen=value.dock==='workspace'||value.workspaceOpen===true;
  for(const key of ['holdPriority','reserveAccess','orderTriggers','autoAccept','manualControls'])if(typeof value[key]==='boolean')p[key]=value[key];
  for(const zone of ['battlefield','graveyard','exile','workspace','outside']){
    const c=value.cameras?.[zone];if(c&&Number.isFinite(c.x)&&Number.isFinite(c.y)&&Number.isFinite(c.zoom))
      p.cameras[zone]={x:clamp(c.x,-100000,100000),y:clamp(c.y,-100000,100000),zoom:clamp(c.zoom,.18,3)};
  }
  // Persist the geometry that the saved camera was laid out for. Old sessions
  // lacking it get one responsive refit; ordinary renders keep a user's zoom.
  for(const zone of ['graveyard','exile','outside','workspace']){
    const v=value.gridViews?.[zone];
    if(v&&Number.isFinite(v.width)&&Number.isFinite(v.height)&&Number.isInteger(v.columns)&&v.columns>0&&v.columns<=5000)
      p.gridViews[zone]={width:clamp(v.width,20,10000),height:clamp(v.height,20,10000),columns:v.columns,...(typeof v.members==='string'&&v.members.length<=150000?{members:v.members}:{})};
  }
  for(const key of ['inspector','stack','decision','workspace']){
    const pos=value.popups?.[key];if(pos&&Number.isFinite(pos.x)&&Number.isFinite(pos.y))p.popups[key]={x:clamp(pos.x,0,10000),y:clamp(pos.y,0,10000)};
  }
  if(value.modeDefaults&&typeof value.modeDefaults==='object')for(const [key,choice] of Object.entries(value.modeDefaults).slice(0,500)){
    if(typeof key==='string'&&key.length<300&&typeof choice==='string'&&choice.length<100)p.modeDefaults[key]=choice;
  }
  for(const name of ['decision','stack','workspace']){
    const v=value.popupSizes?.[name];if(v&&Number.isFinite(v.width)&&Number.isFinite(v.height))p.popupSizes[name]={width:clamp(v.width,280,1800),height:clamp(v.height,160,1200)};
  }
  if(value.playerDefaults&&typeof value.playerDefaults==='object')for(const [key,choice] of Object.entries(value.playerDefaults).slice(0,500))
    if(key.length<250&&!['__proto__','constructor','prototype'].includes(key)&&Number.isInteger(choice)&&choice>=0&&choice<=3)p.playerDefaults[key]=choice;
  if(typeof value.deckText==='string')p.deckText=value.deckText.slice(0,100000);
  p.savedPrograms=futurePrograms(value.savedPrograms||{sequences:[],rules:[]});
  return p;
}
export function loadPreferences(storage){try{return cleanPreferences(JSON.parse((storage??globalThis.localStorage).getItem(PREF_KEY)||'{}'));}catch{return defaultPreferences();}}
export function savePreferences(p,storage){try{(storage??globalThis.localStorage).setItem(PREF_KEY,JSON.stringify(cleanPreferences(p)));return true;}catch{return false;}}
