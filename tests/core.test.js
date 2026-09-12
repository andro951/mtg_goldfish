import test from 'node:test';
import assert from 'node:assert/strict';
import { Engine, createGameState, parseDeck, stateHash, ref } from '../src/core/index.js';
import { parseManaCost, suggestPayment, validatePayment } from '../src/core/mana.js';
import { registry, pool, fixture, id, ids, ability, cast, choose, drain, roundTrip } from './helpers.js';

test('candidate pool: 34 lands, 65 active nonlands, 20 reserve, deterministic ordering', () => {
  const a = createGameState(registry, pool, 'seed', { openingHand: 0 });
  const b = createGameState(registry, pool, 'seed', { openingHand: 0 });
  assert.equal(a.initialDeck.fixedLands, 34); assert.equal(a.initialDeck.selectedNonlands, 65);
  assert.equal(a.zones.libraryActive.length, 99); assert.equal(a.zones.libraryReserve.length, 20); assert.equal(a.zones.command.length, 1);
  assert.deepEqual(a, b); assert.notDeepEqual(a.initialDeck.activeOrder, createGameState(registry, pool, 'other').initialDeck.activeOrder);
});
test('duplicate source copies are preserved and reported', () => {
  const p = parseDeck('1 Scroll Rack\n1 Scroll Rack\n// Commander\n1 The Wandering Minstrel');
  assert.equal(p.warnings.length, 1); assert.equal(p.records.length, 3); assert.equal(p.errors.length, 0);
});
test('base land allowance is one; Azusa updates it without undoing past plays', () => {
  const g = fixture({ battlefield: ['Azusa, Lost but Seeking'], hand: ['Ancient Den', 'Seat of the Synod', 'Tree of Tales', 'Great Furnace'] });
  assert.equal(g.landAllowance(), 3);
  for (const name of ['Ancient Den', 'Seat of the Synod']) g.act({ type: 'PLAY_LAND', id: id(g, name, 'hand') });
  g.act({ type: 'DEBUG_MOVE', id: id(g, 'Azusa, Lost but Seeking'), zone: 'graveyard' });
  assert.equal(g.landAllowance(), 1); assert.equal(g.state.landPlaysUsed, 2);
  assert.equal(g.perform({ type: 'PLAY_LAND', id: id(g, 'Tree of Tales', 'hand') }).ok, false); roundTrip(g);
});
test('Minstrel replaces tapped entry while a bounce trigger still waits on stack', () => {
  const g = fixture({ battlefield: ['The Wandering Minstrel'], hand: ['Simic Growth Chamber'] });
  g.act({ type: 'PLAY_LAND', id: id(g, 'Simic Growth Chamber') });
  assert.equal(g.object(id(g, 'Simic Growth Chamber')).tapped, false); assert.equal(g.state.stack.length, 1);
  drain(g); assert.equal(g.object(id(g, 'Simic Growth Chamber')).zone, 'hand'); roundTrip(g);
});
test('Minstrel cannot modify its own simultaneous arrival batch', () => {
  const g = fixture({ hand: ['The Wandering Minstrel', 'Razortide Bridge'] });
  g.act({ type: 'DEBUG_MOVE', ids: [...g.state.zones.hand], zone: 'battlefield' });
  assert.equal(g.object(id(g, 'Razortide Bridge')).tapped, true); roundTrip(g);
});
test('normal hand drag casts a spell and cannot bypass mana payment', () => {
  const g = fixture({ hand: ['Walking Atlas'] }); const card = id(g, 'Walking Atlas');
  g.act({ type: 'DROP_CARD', id: card, zone: 'battlefield' });
  assert.equal(g.state.pending.kind, 'payment'); assert.equal(g.object(card).zone, 'hand');
  assert.equal(g.perform({ type: 'CHOOSE', value: 'auto' }).ok, false);
  g.act({ type: 'CANCEL' }); assert.equal(g.object(card).zone, 'hand');
  assert.equal(g.perform({ type: 'DROP_CARD', id: card, zone: 'graveyard' }).ok, false);
});
test('KCI is an immediate mana ability; costs are sacrificed before mana', () => {
  const g = fixture({ battlefield: ['Krark-Clan Ironworks', 'Ancient Den'] });
  ability(g, 'Krark-Clan Ironworks', 'sacrifice', { sacrificed: [id(g, 'Ancient Den')] });
  assert.equal(g.state.players[0].mana.C, 2); assert.equal(g.state.stack.length, 0); assert.equal(g.object(id(g, 'Ancient Den')).zone, 'graveyard');
  const events = g.history.at(-1).events; assert.ok(events.findIndex(e => e.type === 'COST_PAID') < events.findIndex(e => e.type === 'MANA_ADDED')); roundTrip(g);
});
test('Gitrog counts simultaneous mill as one event batch but separate KCI activations separately', () => {
  const g = fixture({ battlefield: ['The Gitrog Monster', 'Krark-Clan Ironworks', 'Ancient Den', 'Seat of the Synod'] });
  g.act({ type: 'DEBUG_MILL', count: 3 }); assert.equal(g.state.stack.length, 1);
  for (const name of ['Ancient Den', 'Seat of the Synod']) ability(g, 'Krark-Clan Ironworks', 'sacrifice', { sacrificed: [id(g, name, 'battlefield')] });
  assert.equal(g.state.stack.length, 3); drain(g); assert.equal(g.state.zones.hand.length, 3); roundTrip(g);
});
test('summoning sickness persists across opponent turns until your next turn', () => {
  const g = fixture({ battlefield: [{ name: 'Walking Atlas', sick: true }] });
  const atlas = g.object(id(g, 'Walking Atlas')); assert.equal(g.isSick(atlas), true);
  for (const player of [1,2,3]) { g.act({ type: 'ADVANCE_PHASE', player, step: 'main1' }); assert.equal(g.isSick(atlas), true); }
  g.act({ type: 'ADVANCE_PHASE', player: 0, step: 'main1' }); assert.equal(g.isSick(g.object(atlas.id)), false); roundTrip(g);
});
test('Seedborn untaps Mana Vault on opponents untaps, not on its own natural untap', () => {
  const g = fixture({ battlefield: [{ name: 'Mana Vault', tapped: true }, 'Seedborn Muse'] });
  g.act({ type: 'ADVANCE_PHASE', player: 1, step: 'main1' });
  assert.equal(g.object(id(g, 'Mana Vault')).tapped, false); roundTrip(g);
});
test('restricted mana: Workshop is artifact spells only, Depot permits artifact abilities', () => {
  const player = { life: 40, mana: {W:0,U:0,B:0,R:0,G:0,C:0}, restrictedMana: [{id:'a', color:'C', amount:3, restriction:'artifactSpell'}] };
  const cost = parseManaCost('{2}');
  assert.ok(suggestPayment(cost, player, {kind:'spell', types:['Artifact']}));
  assert.equal(suggestPayment(cost, player, {kind:'ability', types:['Artifact']}), null);
  player.restrictedMana[0].restriction = 'artifactSpellOrAbility';
  assert.ok(suggestPayment(cost, player, {kind:'ability', types:['Artifact']}));
});
test('additional-trigger effects add one apiece: two effects produce three triggers', () => {
  const g = fixture({ battlefield: ['Traveling Chocobo', 'Ancient Greenwarden', 'Lotus Cobra'], hand: ['Ancient Den'] });
  g.act({ type: 'PLAY_LAND', id: id(g, 'Ancient Den', 'hand') }); assert.equal(g.state.stack.length, 3);
  drain(g); assert.equal(Object.values(g.state.players[0].mana).reduce((a,b)=>a+b), 3); roundTrip(g);
});
test('opposing fields and hidden zones are never legal free-move fallbacks', () => {
  const g = fixture({ hand: ['Ancient Den'] });
  assert.equal(g.perform({ type:'DROP_CARD', id:id(g,'Ancient Den','hand'), zone:'exile' }).ok, false);
  g.act({ type:'SET_SETTING', key:'debug', value:false });
  assert.equal(g.perform({ type:'DEBUG_MOVE', id:id(g,'Ancient Den','hand'), zone:'battlefield' }).ok, false);
});
test('snapshot import rejects corruption and replay reproduces random state', () => {
  const g = fixture(); g.act({ type:'DEBUG_SHUFFLE' }); g.act({type:'NOTE',text:'Deterministic checkpoint'}); roundTrip(g);
  const exported = g.exportSession(); exported.currentState.players[0].life += 1;
  assert.throws(() => Engine.importSession(registry, exported));
});
