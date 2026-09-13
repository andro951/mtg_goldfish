import test from 'node:test';
import assert from 'node:assert/strict';
import { fixture, id, cards, registry, ability, cast, choose, drain, roundTrip } from './helpers.js';
import { Engine, clone, stateHash, COLORS } from '../src/core/index.js';
import { oneManaOptions, ONE_MANA_ID } from '../src/core/one-mana.js';
import { cardActions } from '../src/tabletop/card-actions.js';
import { captureStep, preflightSequence } from '../src/tabletop/programs.js';
const start=(g,name)=>g.act({type:'ACTIVATE_SINGLE_MANA',id:id(g,name)});
const colors=(g,name)=>oneManaOptions(g,g.object(id(g,name))).choices.map(r=>r.color);
const lands=['Ancient Den','Seat of the Synod','Vault of Whispers','Great Furnace','Tree of Tales'];
const group=(g,name)=>cardActions(g,id(g,name));

for(const [name,expected]of [['Tundra',['W','U','B','R','G']],['Silverbluff Bridge',['W','U','B','R','G']],['Darksteel Citadel',COLORS]]){
 test(`combined mana: ${name} with Lantern has one selector and no automatic tap`,()=>{
  const g=fixture({battlefield:[name,'Chromatic Lantern']});const access=group(g,name);
  assert.equal(access.quickMana.id,ONE_MANA_ID);assert.equal(access.displayAbilities.length,1);assert.equal(access.showAbilities,false);assert.deepEqual(colors(g,name),expected);
  start(g,name);assert.equal(g.state.pending.kind,'oneManaChoice');assert.deepEqual(g.state.pending.options.map(o=>o.value),expected);assert.equal(g.object(id(g,name)).tapped,false);
  assert.equal(Object.values(g.state.players[0].mana).reduce((a,b)=>a+b),0);
  choose(g,'B');assert.equal(g.object(id(g,name)).tapped,true);assert.equal(g.state.players[0].mana.B,1);assert.equal(g.state.stack.length,0);
  assert.equal(g.history.at(-1).events.filter(e=>e.type==='MANA_ABILITY_RESOLVED').length,1);roundTrip(g);
 });
}
test('combined mana: colorless uses the printed ability; colors use a real live grant',()=>{
 for(const color of COLORS){
  const g=fixture({battlefield:['Darksteel Citadel','Chromatic Lantern']});start(g,'Darksteel Citadel');choose(g,color);
  const e=g.history.at(-1).events.find(e=>e.type==='MANA_ABILITY_RESOLVED');assert.equal(e.abilityId,color==='C'?'mana':'lantern-mana');assert.equal(g.state.players[0].mana[color],1);roundTrip(g);
 }
});
test('combined mana: Lantern plus active World Tree deduplicates colors, not effects',()=>{
 const g=fixture({battlefield:['Chromatic Lantern','The World Tree',...lands]});const o=g.object(id(g,'Ancient Den'));
 assert.equal(g.abilities(o).length,3);assert.equal(group(g,'Ancient Den').displayAbilities.length,1);assert.deepEqual(colors(g,'Ancient Den'),COLORS.slice(0,5));
 start(g,'Ancient Den');choose(g,'U');assert.equal(g.state.players[0].mana.U,1);assert.equal(g.object(id(g,'Chromatic Lantern')).tapped,false);roundTrip(g);
});
test('combined mana: World Tree threshold enters and leaves the live shortcut',()=>{
 const g=fixture({battlefield:['The World Tree',...lands]});assert.equal(group(g,'Ancient Den').quickMana.id,ONE_MANA_ID);
 g.act({type:'DEBUG_MOVE',id:id(g,'Great Furnace'),zone:'graveyard'});assert.equal(group(g,'Ancient Den').quickMana.id,'mana');assert.deepEqual(colors(g,'Ancient Den'),['W']);
 g.act({type:'UNDO'});assert.equal(group(g,'Ancient Den').quickMana.id,ONE_MANA_ID);roundTrip(g);
});
for(const name of ['Treasure Vault','Academy Ruins','Buried Ruin','Oboro, Palace in the Clouds','Fomori Vault',"Inventors' Fair",'The Mycosynth Gardens','The World Tree','Scene of the Crime']){
 test(`land face: ${name} always exposes utility choices, with or without Lantern`,()=>{
  for(const withLantern of [false,true]){
   const g=fixture({battlefield:[name,...lands,'Sol Ring',...(withLantern?['Chromatic Lantern']:[])]});
   const before=JSON.stringify(g.exportSession()),access=group(g,name);
   assert.equal(access.quickMana,null);assert.equal(access.showAbilities,true);assert.ok(access.displayAbilities.length>1);assert.equal(JSON.stringify(g.exportSession()),before);
  }
 });
}
for(const name of ['Simic Growth Chamber','Selesnya Sanctuary','Golgari Rot Farm','Dimir Aqueduct','Gruul Turf','Azorius Chancery','Izzet Boilerworks','Boros Garrison','Orzhov Basilica',"Mishra's Workshop"]){
 test(`multi-mana: ${name} stays distinct from one-mana grants`,()=>{
  for(const grants of [[],['Chromatic Lantern'],['Chromatic Lantern','The World Tree',...lands]]){
   const g=fixture({battlefield:[name,...grants]});const access=group(g,name);assert.equal(access.quickMana,null);assert.ok(access.displayAbilities.some(a=>a.id==='mana'));assert.ok(access.showAbilities);
   if(grants.length){const choices=oneManaOptions(g,g.object(id(g,name)));assert.ok(!choices.grouped.includes('mana'));assert.deepEqual(choices.choices.map(r=>r.color),COLORS.slice(0,5));}
   ability(g,name,'mana');assert.equal(g.state.players[0].mana.U+g.state.players[0].mana.B+g.state.players[0].mana.W+g.state.players[0].mana.R+g.state.players[0].mana.G+g.state.players[0].mana.C+g.state.players[0].restrictedMana.reduce((n,t)=>n+t.amount,0),name==="Mishra's Workshop"?3:2);roundTrip(g);
  }
 });
}
test('combined mana: extra-cost filtering stays separate and does not spend extra resources implicitly',()=>{
 for(const name of ['Scene of the Crime','The Mycosynth Gardens']){
  const g=fixture({battlefield:[name,'Chromatic Lantern','Walking Atlas']});const access=group(g,name);assert.equal(access.quickMana,null);assert.ok(access.displayAbilities.some(a=>a.id==='filter'));
  start(g,name);choose(g,'G');assert.equal(g.state.players[0].mana.G,1);assert.equal(g.object(id(g,'Walking Atlas')).tapped,false);roundTrip(g);
 }
});
test('combined mana: restricted Power Depot colors preserve their spending tag; Lantern overrides only equivalent color choices',()=>{
 const g=fixture({battlefield:['Power Depot']});assert.equal(group(g,'Power Depot').quickMana.id,ONE_MANA_ID);assert.deepEqual(colors(g,'Power Depot'),COLORS);
 start(g,'Power Depot');assert.equal(g.state.pending.options.find(o=>o.value==='G').restriction,'artifactSpellOrAbility');choose(g,'G');assert.equal(g.state.players[0].mana.G,0);assert.equal(g.state.players[0].restrictedMana[0].restriction,'artifactSpellOrAbility');roundTrip(g);
 const f=fixture({battlefield:['Power Depot','Chromatic Lantern']});start(f,'Power Depot');choose(f,'G');assert.equal(f.state.players[0].mana.G,1);assert.equal(f.state.players[0].restrictedMana.length,0);roundTrip(f);
});
test('combined mana: cancelled selector, invalid color and undo/redo are atomic',()=>{
 const g=fixture({battlefield:['Silverbluff Bridge','Chromatic Lantern']});const before=stateHash(g.state);
 start(g,'Silverbluff Bridge');const pending=JSON.stringify(g.state);assert.equal(g.perform({type:'CHOOSE',value:'C'}).ok,false);assert.equal(JSON.stringify(g.state),pending);
 g.act({type:'CANCEL'});assert.equal(stateHash(g.state),before);assert.equal(g.cursor,0);
 start(g,'Silverbluff Bridge');choose(g,'R');const after=stateHash(g.state);g.act({type:'UNDO'});assert.equal(stateHash(g.state),before);g.act({type:'REDO'});assert.equal(stateHash(g.state),after);roundTrip(g);
});
test('combined mana: source control, tapped state and summoning sickness are checked before opening',()=>{
 for(const props of [{tapped:true},{owner:1,controller:1},{sick:true,props:{modifications:[{addTypes:['Creature'],basePower:2,baseToughness:2}]}}]){
  const g=fixture({battlefield:[{name:'Darksteel Citadel',...props},'Chromatic Lantern']});const before=stateHash(g.state);
  assert.equal(g.perform({type:'ACTIVATE_SINGLE_MANA',id:id(g,'Darksteel Citadel')}).ok,false);assert.equal(stateHash(g.state),before);
 }
});
test('combined mana: disappearing grant or blinked source cannot leave a stale usable color',()=>{
 const g=fixture({battlefield:['Darksteel Citadel','Chromatic Lantern']});start(g,'Darksteel Citadel');g.moveBatch([{id:id(g,'Chromatic Lantern'),to:'graveyard'}]);
 assert.equal(g.perform({type:'CHOOSE',value:'U'}).ok,false);assert.equal(g.object(id(g,'Darksteel Citadel')).tapped,false);g.act({type:'CANCEL'});
 start(g,'Darksteel Citadel');g.moveBatch([{id:id(g,'Darksteel Citadel'),to:'exile'}]);g.moveBatch([{id:id(g,'Darksteel Citadel'),to:'battlefield'}]);assert.equal(g.perform({type:'CHOOSE',value:'C'}).ok,false);g.act({type:'CANCEL'});roundTrip(g);
});
test('combined mana: spell-payment cancel preserves the parent and already-floated mana',()=>{
 const g=fixture({battlefield:['Darksteel Citadel','Chromatic Lantern'],hand:['Walking Atlas']},{mana:{C:1}});cast(g,'Walking Atlas',{}, {payment:null});const parent=clone(g.state.pending);
 start(g,'Darksteel Citadel');assert.equal(g.state.pending.kind,'oneManaChoice');g.act({type:'CANCEL'});assert.deepEqual(g.state.pending,parent);assert.equal(g.state.players[0].mana.C,1);assert.equal(g.object(id(g,'Darksteel Citadel')).tapped,false);
 start(g,'Darksteel Citadel');choose(g,'U');assert.equal(g.state.pending.kind,'payment');assert.equal(g.state.players[0].mana.U,1);choose(g,'auto');drain(g);assert.ok(id(g,'Walking Atlas','battlefield'));roundTrip(g);
});
test('combined mana: resolving-effect payment can cancel and resume through the same picker',()=>{
 const g=fixture({battlefield:[{name:'Mana Vault',tapped:true},'Darksteel Citadel','Chromatic Lantern','Grim Monolith']},{mana:{C:3}});
 g.act({type:'ADVANCE_PHASE',step:'upkeep'});g.act({type:'RESOLVE_TOP'});assert.equal(g.state.pending.kind,'effectPayment');ability(g,'Grim Monolith','mana');const parent=clone(g.state.pending);
 start(g,'Darksteel Citadel');g.act({type:'CANCEL'});assert.deepEqual(g.state.pending,parent);assert.ok(g.state.resolving);
 start(g,'Darksteel Citadel');choose(g,'C');assert.equal(g.state.pending.kind,'effectPayment');choose(g,'pay');assert.equal(g.object(id(g,'Mana Vault')).tapped,false);roundTrip(g);
});
test('combined mana: open picker imports with and without a parent spell payment',()=>{
 for(const paying of [false,true]){
  const g=fixture({battlefield:['Darksteel Citadel','Chromatic Lantern'],hand:['Walking Atlas']},{mana:{C:1}});
  if(paying)cast(g,'Walking Atlas',{}, {payment:null});start(g,'Darksteel Citadel');
  const f=Engine.importSession(registry,g.exportSession());assert.equal(f.state.pending.kind,'oneManaChoice');choose(f,'G');
  if(paying){assert.equal(f.state.pending.kind,'payment');choose(f,'auto');drain(f);}roundTrip(f);
 }
});
test('combined mana: copied mana sources and basic-type grants use the live definition',()=>{
 const g=fixture({battlefield:[{name:'The Mycosynth Gardens',props:{copy:{...registry.get('Darksteel Citadel'),rulesId:registry.get('Darksteel Citadel').id}}},'Chromatic Lantern']});
 assert.deepEqual(colors(g,'Darksteel Citadel'),COLORS);assert.equal(group(g,'Darksteel Citadel').displayAbilities.length,1);start(g,'Darksteel Citadel');choose(g,'C');roundTrip(g);
 const f=fixture({battlefield:[{name:'Darksteel Citadel',props:{modifications:[{addSubtypes:['Forest']}]}}]});assert.deepEqual(colors(f,'Darksteel Citadel'),['G','C']);start(f,'Darksteel Citadel');choose(f,'G');roundTrip(f);
});
test('combined mana: recorded selectors preflight and replay as one atomic sequence',()=>{
 const g=fixture({battlefield:['Darksteel Citadel','Chromatic Lantern']}),steps=[];
 for(const action of [{type:'ACTIVATE_SINGLE_MANA',id:id(g,'Darksteel Citadel')},{type:'CHOOSE',value:'U'}]){steps.push(captureStep(g,action));g.act(action);}
 assert.ok(steps.every(Boolean));g.act({type:'UNDO'});const checked=preflightSequence(g,{steps});assert.ok(checked.ok,checked.error);
 g.act({type:'RUN_SEQUENCE',commands:checked.commands});assert.equal(g.state.players[0].mana.U,1);assert.equal(g.cursor,1);roundTrip(g);
});
test('combined mana: every declared single-mana route really produces exactly one mana and no other effect',()=>{
 let audited=0;
 for(const card of cards.filter(c=>c.candidate&&!c.types.some(t=>['Instant','Sorcery'].includes(t)))){
  const g=fixture({battlefield:[card.name,'Chromatic Lantern','The World Tree',...lands,'Sol Ring','The Wandering Minstrel']});const source=g.object(id(g,card.name));
  for(const route of oneManaOptions(g,source).choices){
   const a=g.abilities(source).find(a=>a.id===route.abilityId),ctx=g.context(source,{inputs:route.inputs}),program=a.effect(g,ctx);
   assert.equal(program.length,1,card.name);assert.equal(program[0].op,'mana',card.name);
   const c=program[0];assert.equal(c.production?Object.values(c.production).reduce((a,b)=>a+b,0):c.amount??1,1,card.name);
   assert.equal(c.production?Object.keys(c.production).find(k=>c.production[k]===1):c.color,route.color,card.name);
   assert.equal(c.restriction||null,route.restriction,card.name);audited++;
  }
 }
 assert.ok(audited>200,String(audited));
});
test('land face audit: every catalog land with a non-single-mana live action opens the inspector',()=>{
 let audited=0;
 for(const card of cards.filter(c=>c.candidate&&c.types.includes('Land'))){
  for(const grant of [[],['Chromatic Lantern'],['The World Tree',...lands],['Chromatic Lantern','The World Tree',...lands]]){
   const g=fixture({battlefield:[card.name,...grant,'Sol Ring','Walking Atlas','Mox Opal']});const source=g.object(id(g,card.name));const actions=g.abilities(source),single=oneManaOptions(g,source,actions),access=group(g,card.name);
   if(actions.some(a=>!single.grouped.includes(a.id)))assert.equal(access.quickMana,null,card.name);
   if(actions.length&&actions.every(a=>single.grouped.includes(a.id)))assert.ok(access.quickMana,card.name);
   audited++;
  }
 }
 assert.ok(audited>=160,String(audited));
});
