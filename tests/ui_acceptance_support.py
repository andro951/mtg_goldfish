#!/usr/bin/env python3
"""Click-through acceptance of the 1.1 tabletop. State is only observed.
Prepared fixtures enter through the actual Import UI; gameplay uses real controls.
--memory renders authored HTML bytes in a blank document where URL navigation is
unavailable. Network/persistence tests still run separately in unrestricted CI.
"""
from __future__ import annotations
import argparse,json,os,shutil,subprocess,time,traceback
from pathlib import Path
from playwright.sync_api import sync_playwright
ROOT=Path(__file__).resolve().parents[1];OUT=ROOT/'test-results';SHOTS=OUT/'screenshots';SHOTS.mkdir(parents=True,exist_ok=True)
parser=argparse.ArgumentParser();parser.add_argument('--memory',action='store_true');parser.add_argument('--groups',default='');parser.add_argument('--url',default='http://127.0.0.1:4173');args=parser.parse_args()
checks=[];failures=[];errors=[];requests=[];skipped=[]
subprocess.run(['node','tests/make_ui_fixtures.mjs'],cwd=ROOT,check=True)
html=(ROOT/'Astra-standalone.html').read_text()
def check(name,ok,detail=''):
 if not ok:raise AssertionError(name+(': '+str(detail) if detail else ''))
 checks.append(name);print('PASS',name,flush=True)
def click(p,action,scope='',extra=''):
 p.locator(f'{scope} [data-action="{action}"]{extra}'.strip()).first.click()
def menu(p,name=None):
 if p.locator('[role=dialog][aria-modal=true]').count():
  click(p,'close-dialog','.modal')
 click(p,'menu')
 if name:click(p,'dialog','.modal',f'[data-dialog="{name}"]')
def close(p):
 if p.locator('.modal').count():click(p,'close-dialog','.modal')
def hold(p,value=True):
 menu(p);p.locator('.menu-preference input').set_checked(value);close(p)
def manual_controls(p,value=True):
 menu(p,'settings');p.locator('[data-setting=manualControls]').set_checked(value);close(p)
def lab(p,name,manual=True):
 menu(p,'labs');p.locator(f'[data-lab="{name}"]').click();p.wait_for_function('(n)=>astra.engine.state.seed===`lab-${n}`',arg=name)
 if manual:
  hold(p,True);manual_controls(p,True)
def state(p,expression):return p.evaluate('astra.engine.'+expression)
def pending(p):return state(p,'state.pending')
def checksum(p):return state(p,'exportSession().stateChecksum')
def obj(p,name,zone=None):
 return p.evaluate("([name,zone])=>Object.values(astra.engine.state.instances).filter(o=>o.zone!=='void'&&(!zone||o.zone===zone)&&astra.engine.definition(o).name===name).sort((a,b)=>['battlefield','hand','graveyard','command','exile','stackCards','libraryActive','libraryReserve'].indexOf(a.zone)-['battlefield','hand','graveyard','command','exile','stackCards','libraryActive','libraryReserve'].indexOf(b.zone))[0]",[name,zone])
def card(p,id,zone):
 if zone=='battlefield' or zone in ['graveyard','exile','outside','workspace']:return p.locator(f'[data-surface="{zone}"] [data-position="{id}"] .face')
 if zone=='hand':return p.locator(f'.hand [data-card="{id}"] .face')
 return p.locator(f'.rail [data-card="{id}"] .face')
def inspect(p,name,zone='battlefield'):
 o=obj(p,name,zone);assert o,f'{name} missing in {zone}'
 if p.locator('.inspector-window').count():click(p,'close-inspector')
 card(p,o['id'],zone).click(button='right');return o
def cast(p,name,zone='hand'):
 o=inspect(p,name,zone);click(p,'cast','.inspector-window');return o
def activate(p,name,ability=None):
 o=inspect(p,name);click(p,'ability','.inspector-window',f'[data-ability="{ability}"]' if ability else '');return o
def choose_cards(p,ids):
 for id in ids:p.locator(f'.decision-gallery [data-action="card"][data-id="{id}"]').click()
 click(p,'confirm-choice','[data-floating="decision"]')
def choose_option(p,value):
 q=pending(p);opts=q.get('options') or ([{'value':'command'},{'value':'stay'}] if q['kind']=='commander' else [{'value':'reveal'},{'value':'decline'}])
 i=next(i for i,o in enumerate(opts) if (o['value'] if isinstance(o,dict) else o)==value)
 p.locator(f'[data-floating="decision"] [data-action="option"][data-option="{i}"]').click()
def pay(p):
 click(p,'suggest-payment','[data-floating="decision"]');click(p,'pay','[data-floating="decision"]')
def settle(p,remember=False,pay_optional=False):
 for _ in range(150):
  q=pending(p)
  if q:
   kind=q['kind']
   if kind=='payment':pay(p)
   elif kind=='effectPayment':pay(p) if pay_optional else click(p,'decline','[data-floating="decision"]')
   elif q.get('ordered') or kind=='triggerOrder':click(p,'confirm-choice','[data-floating="decision"]')
   elif q.get('type')=='number':p.locator('#number-choice').fill(str(q.get('min',0)));click(p,'confirm-number','[data-floating="decision"]')
   elif q.get('candidates') is not None or q.get('ids') is not None:choose_cards(p,(q.get('candidates') or q.get('ids') or [])[:q.get('min',0)])
   elif q.get('options'):
    value='NO' if kind=='optional' else q['options'][0]['value']
    if remember and p.locator('#remember-choice').count():p.locator('#remember-choice').check()
    if q.get('max',1)>1:
     for o in q['options'][:q.get('min',0)]:choose_option(p,o['value'])
     click(p,'confirm-choice','[data-floating="decision"]')
    else:choose_option(p,value)
   elif kind=='commander':choose_option(p,'stay')
   elif kind=='miracleReveal':choose_option(p,'decline')
   else:raise AssertionError('Unhandled choice '+json.dumps(q))
  elif state(p,'state.stack.length'):click(p,'resolve','.stack-window')
  else:return
 raise AssertionError('Resolution did not terminate')
def fixture(p,name):
 menu(p,'save');p.locator('#session-file').set_input_files(str(OUT/'fixtures'/f'{name}.json'));p.wait_for_function('(n)=>astra.engine.state.initialDeck.scenario===`UI acceptance: ${n}`',arg=name)
 p.locator('[data-action="fit"][data-zone="battlefield"]').click()
def shot(p,name):p.screenshot(path=str(SHOTS/name),full_page=True)
def point_card(p,name,zone='battlefield',fx=.5,fy=.5):
 o=obj(p,name,zone);r=card(p,o['id'],zone).bounding_box();return r['x']+r['width']*fx,r['y']+r['height']*fy

def drag(p,x,y,tx,ty,mid=None):
 p.mouse.move(x,y);p.mouse.down();p.mouse.move(tx,ty,steps=12)
 if mid:mid()
 p.mouse.up()
def place(p,name,left,top,fx=.5,fy=.5):
 id=obj(p,name)['id'];b=card(p,id,'battlefield').bounding_box();drag(p,b['x']+b['width']*fx,b['y']+b['height']*fy,left+b['width']*fx,top+b['height']*fy)
 return id

