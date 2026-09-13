import test from 'node:test';
import assert from 'node:assert/strict';
import { fixture, id, registry, cards, ability, drain, roundTrip } from './helpers.js';
import { cardActions } from '../src/tabletop/card-actions.js';

for (const name of ['Treasure Vault','Buried Ruin','Oboro, Palace in the Clouds','Fomori Vault',"Inventors' Fair",'The Mycosynth Gardens','Scene of the Crime','Grim Monolith','Chromatic Orrery','The World Tree','Urza, Lord High Artificer']) {
  test(`ability control: ${name} exposes alternatives without an accidental land activation`, () => {
    const g=fixture({battlefield:[name,'Ancient Den','Tree of Tales','Sol Ring','Walking Atlas','Great Furnace','Seat of the Synod']});
    const before=JSON.stringify(g.exportSession()), access=cardActions(g,id(g,name));
    assert.equal(access.showAbilities,true);assert.ok(access.abilities.length>1);
    assert.equal(JSON.stringify(g.exportSession()),before,'Inspecting actions must not change game state or history.');
    if(g.characteristics(id(g,name)).types.includes('Land'))assert.equal(access.quickMana,null);
    else assert.equal(access.quickMana?.id ?? null,access.abilities.filter(a=>a.mana&&a.tap).length===1?access.abilities.find(a=>a.mana&&a.tap).id:null);
  });
}
for (const name of ['Ancient Den','Razortide Bridge','Tundra','Mox Opal','Sol Ring','Power Depot']) {
  test(`ability control: simple mana source ${name} retains one-click mana without redundant badge`,()=>{
    const g=fixture({battlefield:[name,'Walking Atlas','Mox Amber']});
    const access=cardActions(g,id(g,name));assert.equal(access.showAbilities,false);assert.ok(access.quickMana);
  });
}
test('ability control: tapped monolith still exposes the untap action',()=>{
  const g=fixture({battlefield:[{name:'Grim Monolith',tapped:true}]},{mana:{C:4}});
  assert.equal(cardActions(g,id(g,'Grim Monolith')).showAbilities,true);
  ability(g,'Grim Monolith','untap');drain(g);assert.equal(g.object(id(g,'Grim Monolith')).tapped,false);roundTrip(g);
});
test('ability control: plain land acquires then loses affordance with granted ability',()=>{
  const g=fixture({battlefield:["Bootleggers' Stash",'Ancient Den','Krark-Clan Ironworks']});
  assert.equal(cardActions(g,id(g,'Ancient Den')).showAbilities,true);
  ability(g,'Krark-Clan Ironworks','sacrifice',{sacrificed:[id(g,"Bootleggers' Stash")]});drain(g);
  assert.equal(cardActions(g,id(g,'Ancient Den')).showAbilities,false);roundTrip(g);
});
test('ability control: saga construct appears only after chapter grants it',()=>{
  const g=fixture({battlefield:["Urza's Saga"]});const saga=g.object(id(g,"Urza's Saga"));
  assert.equal(cardActions(g,saga).showAbilities,false);saga.flags.sagaConstruct=true;
  assert.equal(cardActions(g,saga).showAbilities,true);
});
test('ability control: no activation badges in hand, graveyard, exile or library',()=>{
  for(const zone of ['hand','graveyard','exile','libraryActive']){
    const g=fixture({[zone]:['Treasure Vault']});assert.equal(cardActions(g,id(g,'Treasure Vault')).showAbilities,false);
  }
});
test('ability control: every supported permanent with live mana and another ability is discoverable',()=>{
  let affected=0;
  for(const card of cards.filter(c=>c.candidate&&!c.types.some(t=>['Instant','Sorcery'].includes(t)))) {
    const g=fixture({battlefield:[card.name,'Ancient Den','Sol Ring','Walking Atlas']});const object=g.object(id(g,card.name)), abilities=g.abilities(object);
    const access=cardActions(g,object),expected=(access.displayAbilities.length>1&&abilities.some(a=>a.mana))||(card.types.includes('Land')&&abilities.length>0&&!access.quickMana);
    assert.equal(access.showAbilities,expected,card.name);if(expected)affected++;
  }
  assert.ok(affected>=13,`${affected} mixed-ability sources covered`);
});
test('Treasure Vault X=3 pays six, sacrifices as cost and makes exactly three Treasures',()=>{
  const g=fixture({battlefield:['Treasure Vault']},{mana:{C:6}});
  ability(g,'Treasure Vault','treasures',{x:3});assert.ok(id(g,'Treasure Vault','graveyard'));
  assert.equal(g.state.players[0].mana.C,0);assert.equal(g.state.stack.length,1);drain(g);
  assert.equal(g.controlled().filter(o=>o.token&&g.definition(o).name==='Treasure').length,3);roundTrip(g);
});
