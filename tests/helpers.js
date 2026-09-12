import fs from 'node:fs';
import { Engine, createGameState, makeInstance, clone, ref, stateHash, ZONES } from '../src/core/index.js';
import { createRegistry } from '../src/rules/index.js';
export const cards = JSON.parse(fs.readFileSync(new URL('../data/cards.json', import.meta.url)));
export const pool = JSON.parse(fs.readFileSync(new URL('../data/pool.json', import.meta.url)));
export const registry = createRegistry(cards);
export function fixture(zones = {}, options = {}) {
  const state = createGameState(registry, pool, options.seed || 'test-seed', { openingHand: 0 });
  state.instances = {}; for (const zone of ZONES) state.zones[zone] = [];
  state.started = true; state.step = options.step || 'main1'; state.activePlayer = options.player || 0;
  state.settings.orderTriggers = options.orderTriggers ?? false; state.settings.debug = true;
  state.landPlaysUsed = options.landPlaysUsed || 0;
  let n = 1;
  const supplied = { libraryActive: Array(24).fill('Ancient Den'), ...zones };
  for (const [zone, specs] of Object.entries(supplied)) for (const raw of specs) {
    const spec = typeof raw === 'string' ? { name: raw } : raw;
    const definition = registry.get(spec.name), object = makeInstance(`f${n++}`, definition.id, zone, spec.owner || 0);
    object.controller = spec.controller ?? object.owner; object.controlledSince = spec.sick ? state.turnSerial : -1;
    if (zone === 'battlefield') {
      const mod = registry.module(definition.id);
      if (definition.types.includes('Planeswalker')) object.counters.loyalty = Number(definition.loyalty);
      if (mod.entersCounters && typeof mod.entersCounters !== 'function') Object.assign(object.counters, mod.entersCounters);
      if (mod.saga) { object.counters.lore = spec.lore ?? 1; if (mod.saga === 3) object.flags.sagaMana = true; }
    }
    Object.assign(object, clone(spec.props || {}));
    if (spec.tapped != null) object.tapped = spec.tapped;
    if (spec.counters) Object.assign(object.counters, spec.counters);
    state.instances[object.id] = object; state.zones[zone].push(object.id);
  }
  state.nextId = n + 1000; state.activeLibraryBoundary = state.zones.libraryActive.length;
  state.initialDeck.activeOrder = [...state.zones.libraryActive]; state.initialDeck.reserveOrder = [...state.zones.libraryReserve];
  state.initialDeck.commanderIds = [...state.zones.command];
  if (options.mana) Object.assign(state.players[0].mana, options.mana);
  return new Engine(registry, state);
}
export function id(g, name, zone = null) { const priority = ['battlefield','hand','graveyard','command','exile','stackCards','libraryActive','libraryReserve','outside']; return Object.values(g.state.instances).filter(o => o.zone !== 'void' && (!zone || o.zone === zone) && g.definition(o).name === name).sort((a,b) => priority.indexOf(a.zone) - priority.indexOf(b.zone))[0]?.id; }
export function ids(g, name, zone = null) { return Object.values(g.state.instances).filter(o => o.zone !== 'void' && (!zone || o.zone === zone) && g.definition(o).name === name).map(o => o.id); }
export function ability(g, name, abilityId, inputs = {}, extra = {}) { return g.act({ type: 'ACTIVATE_ABILITY', id: id(g, name), abilityId, inputs, payment: 'auto', ...extra }); }
export function cast(g, name, inputs = {}, extra = {}) { return g.act({ type: 'CAST_SPELL', id: id(g, name, extra.zone || 'hand'), inputs, payment: 'auto', ...extra }); }
export function choose(g, value, extra = {}) { return g.act({ type: 'CHOOSE', value, ...extra }); }
export function drain(g, choices = {}, limit = 300) {
  for (let i = 0; i < limit; i++) {
    const p = g.state.pending;
    if (p) {
      let value = choices[p.key] ?? choices[p.kind];
      if (typeof value === 'function') value = value(g, p);
      if (value === undefined) {
        if (p.kind === 'optional') value = 'NO';
        else if (p.kind === 'effectPayment') value = 'decline';
        else if (p.kind === 'payment') value = 'auto';
        else if (p.kind === 'commander') value = 'stay';
        else if (p.kind === 'triggerOrder') value = p.options.map(o => o.value);
        else if (p.kind === 'replacement') value = 'untapped';
        else if (p.type === 'number') value = p.min || 0;
        else if (p.candidates) value = p.candidates.slice(0, p.min ?? 1);
        else if (p.options) value = (p.max || 1) > 1 ? p.options.slice(0, p.min || 1).map(o => o.value) : p.options[0].value;
        else throw new Error('Unknown pending choice ' + JSON.stringify(p));
      }
      choose(g, value); continue;
    }
    if (!g.state.stack.length) return g;
    g.act({ type: 'RESOLVE_TOP' });
  }
  throw new Error('Drain exceeded limit: ' + JSON.stringify(g.state.pending));
}
export function roundTrip(g) {
  const before = stateHash(g.state), exported = g.exportSession();
  const imported = Engine.importSession(registry, exported);
  if (stateHash(imported.state) !== before) throw new Error('Import mismatch');
  g.verifyReplay();
  if (g.cursor) { g.act({ type: 'UNDO' }); g.act({ type: 'REDO' }); if (stateHash(g.state) !== before) throw new Error('Undo/redo mismatch'); }
}
