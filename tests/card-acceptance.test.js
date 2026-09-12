import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { Engine, validateState, COLORS } from '../src/core/index.js';
import { registry, cards, fixture, roundTrip } from './helpers.js';

/** Every candidate is exercised through a legal cast/land play and through
 * every registered activated ability. These are capability smoke tests, not
 * substitutes for the interaction assertions in the other test files. */
const stable = ['The Wandering Minstrel','Metalwork Colossus', 'Walking Atlas', 'Ancient Den', 'Seat of the Synod', 'Tree of Tales', 'Great Furnace', 'Sol Ring', 'Scroll Rack', 'Gilded Lotus', 'Manabond', ...Array(5).fill('Myr')];
const grave = ['Sol Ring','Scroll Rack','Scrap Trawler','Metalwork Colossus','Ancient Den','Tree of Tales',"Faith's Reward",'Manabond','Summon: Bahamut'];
const library = ['Mox Amber','Sol Ring','Scroll Rack','Scrap Trawler','Krark-Clan Ironworks','Gilded Lotus','Metalwork Colossus','Urza, Lord High Artificer','The Wandering Minstrel','Ancient Den','Tree of Tales', ...Array(30).fill('Ancient Den')].filter(n=>registry.has(n));
function setup(card, zone) {
  const g=fixture({battlefield:stable.filter(n=>registry.has(n)&&n!==card.name), graveyard:grave.filter(n=>registry.has(n)&&n!==card.name), hand:['Ancient Den','Tree of Tales'], libraryActive:library});
  const d=registry.get(card.id), state=g.state;
  // Build explicit fixture state before the engine's initial snapshot is taken.
  const proto={id:'subject',oid:1,cardId:d.id,zone,owner:0,controller:0,tapped:false,counters:{},damage:0,token:false,commander:false,face:0,enteredTurn:0,controlledSince:-1,attachedTo:null,flags:{},modifications:[],copy:null,lastMove:null,attacksThisTurn:0,location:null};
  if(zone==='battlefield'){
    if(d.types.includes('Planeswalker'))proto.counters.loyalty=30;
    Object.assign(proto.counters, {charge:15,burden:1,'+1/+1':1});
    const m=registry.module(d.id);if(m.saga){proto.counters.lore=1;proto.flags.sagaMana=true;}
  }
  state.instances.subject=proto;state.zones[zone].push('subject');state.settings.debug=false;
  for(const c of COLORS)state.players[0].mana[c]=500;
  state.players[0].life=10000;state.players[0].energy=50;
  for(const p of state.players.slice(1)){p.abstractCreatures=10;p.abstractHand=7;}
  state.initialDeck.activeOrder=[...state.zones.libraryActive];
  return new Engine(registry,state);
}
function candidateValues(p) {
  if(p.kind==='optional')return ['NO'];
  if(p.kind==='payment')return ['auto'];
  if(p.kind==='effectPayment')return ['decline'];
  if(p.kind==='commander')return ['stay'];
  if(p.kind==='replacement')return ['untapped','tapped'];
  if(p.type==='number')return Array.from({length:Math.min(21,(p.max||20)-(p.min||0)+1)},(_,i)=>(p.min||0)+i);
  if(p.ordered||p.kind==='triggerOrder')return [p.candidates||p.options.map(o=>o.value)];
  if(p.candidates){
    const min=p.min??1,max=p.max??min,values=[],c=p.candidates;
    if(!min)values.push([]);
    for(let count=Math.max(1,min);count<=Math.min(max,c.length);count++){
      values.push(c.slice(0,count));
      // Alternatives cover explicit power-sum and other constrained costs.
      if(count===1)for(const id of c.slice(1))values.push([id]);
      if(values.length>100)break;
    }
    return values;
  }
  if(p.options)return (p.max||1)>1?[p.options.slice(0,p.min||1).map(o=>o.value)]:p.options.map(o=>o.value);
  if(p.kind==='miracleReveal')return ['decline'];
  throw new Error('Unrecognized choice '+JSON.stringify(p));
}
function settle(g){
  for(let i=0;i<250;i++){
    if(g.state.pending){const p=g.state.pending;let ok=false,last;
      for(const value of candidateValues(p)){last=g.perform({type:'CHOOSE',value});if(last.ok){ok=true;break;}}
      assert.ok(ok,`Cannot satisfy ${p.label}: ${JSON.stringify(last)}`);
    }else if(g.state.stack.length){g.act({type:'RESOLVE_TOP'});}
    else {assert.equal(g.state.resolving,null);assert.equal(g.state.actionDraft,null);return;}
  }
  throw new Error('Resolution did not terminate.');
}
function verify(g){validateState(g.state,registry);assert.equal(g.state.settings.debug,false);roundTrip(g);}
for(const card of cards.filter(c=>c.candidate)){
  test(`card acceptance: ${card.name} — metadata and legal entry`,()=>{
    const mod=registry.module(card.id);assert.ok(['implemented','full'].includes(mod.status));
    assert.ok(card.image&&fs.existsSync(new URL('../'+card.image,import.meta.url)));
    assert.ok(card.oracleText||card.types.includes('Land'));
    const g=setup(card,'hand');
    g.act({type:card.types.includes('Land')?'PLAY_LAND':'CAST_SPELL',id:'subject',payment:'auto'});settle(g);
    assert.notEqual(g.state.instances.subject.zone,'hand','The selected card must leave hand through the requested legal action.');
    verify(g);
  });
  for(const ability of registry.module(card.id).activated||[]){
    test(`ability acceptance: ${card.name} / ${ability.id}`,()=>{
      const zone=ability.zone||ability.zones?.[0]||'battlefield',g=setup(card,zone);
      // Timing-restricted abilities are tested at their documented legal time.
      if(ability.upkeepOnly||card.name==='Scourglass')g.state.step='upkeep';
      if(card.name==="Urza's Saga"&&ability.id==='construct')g.state.instances.subject.flags.sagaConstruct=true;
      const ready=new Engine(registry,g.state);
      ready.act({type:'ACTIVATE_ABILITY',id:'subject',abilityId:ability.id,payment:'auto'});settle(ready);verify(ready);
    });
  }
}
