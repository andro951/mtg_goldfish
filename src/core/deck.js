import { RULES_PACK, VERSION, ZONES, emptyMana, seedState, shuffled, integer, requireRule, normalizeName, clone } from './util.js';

export function parseDeck(text) {
  let pool = 'main'; const records = [], warnings = [], errors = [];
  String(text).split(/\r?\n/).forEach((raw, i) => {
    const line = raw.trim();
    if (!line) return;
    if (/^(\/\/|#)/.test(line)) {
      const label = line.replace(/^(\/\/|#)\s*/, '').toLowerCase();
      if (label.includes('commander')) pool = 'command';
      else if (/outside|sideboard|maybeboard/.test(label)) pool = 'outside';
      else if (label.includes('main')) pool = 'main';
      return;
    }
    const match = line.match(/^(\d+)\s*x?\s+(.+)$/);
    if (!match || Number(match[1]) < 1 || Number(match[1]) > 1000) { errors.push({ line: i + 1, text: raw, message: 'Expected a positive quantity and card name.' }); return; }
    // Deck-site printing suffixes are navigation metadata, never a renamed card.
    const name = match[2].replace(/\s+\([A-Za-z0-9]{2,8}\)\s+[A-Za-z0-9*-]+(?:\s+\*F\*)?$/, '').trim();
    records.push({ pool, quantity: Number(match[1]), name, sourceLine: i + 1 });
  });
  const counts = new Map();
  for (const row of records) counts.set(normalizeName(row.name), (counts.get(normalizeName(row.name)) || 0) + row.quantity);
  for (const [name, quantity] of counts) if (quantity > 1) warnings.push({ type: 'DUPLICATE', name, quantity, message: `${name}: ${quantity} copies are preserved; they are not silently removed.` });
  return { records, warnings, errors, source: String(text) };
}

export function makeInstance(id, cardId, zone, owner = 0) {
  return { id, oid: 1, cardId, zone, owner, controller: owner, tapped: false, counters: {}, damage: 0,
    token: false, commander: false, face: 0, enteredTurn: 0, controlledSince: 0, attachedTo: null,
    flags: {}, modifications: [], copy: null, lastMove: null, attacksThisTurn: 0, location: null };
}

export function createGameState(registry, inputRecords, seed = 'astra', options = {}) {
  const records = inputRecords.map(row => ({ ...row, pool: row.pool === 'commander' ? 'command' : row.pool }));
  const rng = seedState(seed), instances = {}, zones = Object.fromEntries(ZONES.map(z => [z, []]));
  const lands = [], nonlands = [], commanders = [], outside = [];
  let serial = 1;
  for (const row of records) {
    const definition = registry.get(row.id || row.name);
    const quantity = integer(row.quantity, 1, 1000, 'Card quantity');
    for (let j = 0; j < quantity; j++) {
      const id = `c${serial++}`;
      const object = makeInstance(id, definition.id, 'libraryActive');
      instances[id] = object;
      if (row.pool === 'command') { commanders.push(id); object.commander = true; }
      else if (row.pool === 'outside') outside.push(id);
      else if (definition.types.includes('Land')) lands.push(id);
      else nonlands.push(id);
    }
  }
  requireRule(commanders.length === 1, 'The candidate harness requires exactly one commander.', 'INVALID_DECK');
  const activeSize = integer(options.activeSize ?? 99, 1, 250, 'Active library size');
  const needed = activeSize - lands.length;
  requireRule(needed >= 0 && nonlands.length >= needed, `Need ${needed} nonland copies for the active ${activeSize}; the candidate pool contains ${nonlands.length}.`, 'INVALID_DECK');
  const randomized = shuffled(nonlands, rng);
  zones.libraryActive = shuffled([...lands, ...randomized.slice(0, needed)], rng);
  zones.libraryReserve = shuffled(randomized.slice(needed), rng);
  zones.command = commanders; zones.outside = outside;
  for (const [zone, ids] of Object.entries(zones)) for (const id of ids) instances[id].zone = zone;
  const initialDeck = { seed: String(seed), activeOrder: [...zones.libraryActive], reserveOrder: [...zones.libraryReserve],
    activeCardIds: zones.libraryActive.map(id => instances[id].cardId), reserveCardIds: zones.libraryReserve.map(id => instances[id].cardId),
    fixedLands: lands.length, selectedNonlands: needed, commanderIds: [...commanders], outsideIds: [...outside], records: clone(records) };
  const state = {
    schemaVersion: 1, version: VERSION, rulesPack: RULES_PACK, seed: String(seed), rng, nextId: serial, nextStackId: 1, nextBatchId: 1,
    initialDeck, turnNumber: 1, turnSerial: 1, lastTurnBegan: [1, 0, 0, 0], activePlayer: 0, priorityHolder: 0, step: 'setup', started: false,
    zones, instances, stack: [], pendingTriggers: [], pending: null, resolving: null, actionDraft: null,
    activeLibraryBoundary: zones.libraryActive.length, reserveAccess: false, reserveReached: false,
    landPlaysUsed: 0, commanderCasts: {}, players: Array.from({ length: 4 }, (_, index) => ({
      id: index, name: index ? `Opponent ${index}` : 'You', life: 40, poison: 0, energy: 0, mana: emptyMana(),
      restrictedMana: [], commanderDamage: {}, lost: false, abstractCreatures: 0, abstractHand: 7,
    })),
    delayed: [], effects: [], emblems: [], provenance: [], eventSerial: 0, turnCounts: {}, triggerCounts: {},
    extraCombats: [], extraCombatActive: false, scheduledStep: null, advanceTarget: null,
    optionalPreferences: {}, settings: { holdPriority: true, orderTriggers: true, autoResolveOptional: false, manualControls: false, debug: false, firstMulliganFree: true },
    mulligans: 0, notes: [], diagnostics: [], manualAssistance: [], status: 'playing',
  };
  const draw = Math.min(integer(options.openingHand ?? 7, 0, activeSize), zones.libraryActive.length);
  zones.hand = zones.libraryActive.splice(0, draw);
  for (const id of zones.hand) instances[id].zone = 'hand';
  state.activeLibraryBoundary = zones.libraryActive.length;
  return state;
}

export function validateState(state, registry) {
  requireRule(state && state.rulesPack === RULES_PACK, `Session requires rules pack ${state?.rulesPack || 'unknown'}; installed pack is ${RULES_PACK}.`, 'VERSION_MISMATCH');
  requireRule(Array.isArray(state.players) && state.players.length === 4, 'Invalid session players.', 'INVALID_SESSION');
  requireRule(state.zones && state.instances && Array.isArray(state.stack), 'Invalid session zones.', 'INVALID_SESSION');
  const seen = new Set();
  for (const zone of ZONES) {
    requireRule(Array.isArray(state.zones[zone]), `Missing zone ${zone}.`, 'INVALID_SESSION');
    for (const id of state.zones[zone]) {
      const object = state.instances[id];
      requireRule(object && object.zone === zone && !seen.has(id), 'A card is duplicated or in an inconsistent zone.', 'INVALID_SESSION');
      seen.add(id); registry.get(object.cardId);
      requireRule(Number.isInteger(object.owner) && object.owner >= 0 && object.owner < 4 && Number.isInteger(object.controller) && object.controller >= 0 && object.controller < 4, 'Invalid controller.', 'INVALID_SESSION');
    }
  }
  for (const [id, object] of Object.entries(state.instances)) requireRule(seen.has(id) || object.zone === 'void', `Unzoned card ${id}.`, 'INVALID_SESSION');
  for (const player of state.players) {
    requireRule(Number.isFinite(player.life) && Number.isFinite(player.poison), 'Invalid player totals.', 'INVALID_SESSION');
    for (const n of Object.values(player.mana)) integer(n, 0, 1000000, 'Mana');
  }
  requireRule(state.activeLibraryBoundary === state.zones.libraryActive.length, 'Reserve boundary is inconsistent.', 'INVALID_SESSION');
  return true;
}
