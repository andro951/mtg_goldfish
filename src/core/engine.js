import { RULES_PACK, VERSION, COLORS, ZONES, STEPS, clone, ref, sameRef, asArray, unique, sum, isMain, requireRule, RuleError, integer, stateHash, diffState, applyPatches, assertSerializable, shuffled } from './util.js';
import { createGameState, makeInstance, validateState } from './deck.js';
import { candidates, matches, validateSelection } from './selectors.js';

/** The state machine knows rules capabilities, never individual card names. */
export class Engine {
  constructor(registry, state) {
    this.registry = registry; this.state = clone(state); this.initialState = clone(state);
    this.history = []; this.cursor = 0; this.transaction = null; this._cache = null; this._deriving = null;
    this.listeners = new Set(); this.lastError = null;
    validateState(this.state, registry);
  }
  static create(registry, records, seed, options) { return new Engine(registry, createGameState(registry, records, seed, options)); }
  subscribe(listener) { this.listeners.add(listener); return () => this.listeners.delete(listener); }
  notify() { for (const listener of this.listeners) listener(this); }
  touch() { this._cache = null; }
  object(idOrRef) {
    const object = this.state.instances[typeof idOrRef === 'string' ? idOrRef : idOrRef?.id];
    if (!object || object.zone === 'void' || (typeof idOrRef === 'object' && idOrRef.oid != null && object.oid !== idOrRef.oid)) return null;
    return object;
  }
  source(context) { return this.object(context?.source); }
  definition(objectOrId) {
    const object = typeof objectOrId === 'string' ? this.object(objectOrId) : objectOrId;
    requireRule(object, 'That game object no longer exists.');
    return object.copy || this.registry.get(object.cardId);
  }
  module(objectOrId) {
    const object = typeof objectOrId === 'string' ? this.object(objectOrId) : objectOrId;
    if (!object) return {};
    return this.registry.module(object.copy?.rulesId || object.cardId);
  }
  objects(zone = 'battlefield', owner = null) { return (this.state.zones[zone] || []).map(id => this.state.instances[id]).filter(o => owner == null || o.owner === owner); }
  controlled(player = 0) { return this.objects('battlefield').filter(o => o.controller === player); }
  count(selector = {}, context = {}) { return candidates(this, { zones: ['battlefield'], ...selector }, context).length; }
  select(selector, context = {}) { return candidates(this, selector, context); }
  matches(object, selector, context = {}) { return matches(this, object, selector, context); }
  canAccessReserve() { return this.state.reserveAccess || this.state.zones.libraryActive.length === 0; }
  activeLibrary(player = 0) {
    const active = this.objects('libraryActive', player).map(o => o.id);
    return this.canAccessReserve() ? [...active, ...this.objects('libraryReserve', player).map(o => o.id)] : active;
  }
  top(player = 0) { return this.object(this.activeLibrary(player)[0]); }
  hasStatic(key, controller = 0) { return this.controlled(controller).some(o => this.module(o)[key]); }
  manaPlayer(player = 0) { return this.state.players[integer(player, 0, 3)]; }
  landAllowance(player = 0) {
    let amount = 1;
    for (const source of this.controlled(player)) { const value = this.module(source).extraLands; amount += typeof value === 'function' ? value(this, source) : value || 0; }
    for (const effect of this.state.effects) if (effect.kind === 'extraLands' && effect.controller === player) amount += effect.amount;
    return amount;
  }
  baseCharacteristics(object) {
    const definition = this.definition(object), base = { ...clone(definition), id: object.id, oid: object.oid,
      types: [...definition.types], subtypes: [...definition.subtypes], supertypes: [...definition.supertypes],
      colors: [...definition.colors], keywords: [...definition.keywords], power: Number(definition.power) || 0,
      toughness: Number(definition.toughness) || 0, manaValue: Number(definition.manaValue) || 0 };
    if (object.zone === 'stackCards') base.manaValue += (object.flags.castX || 0) * (definition.manaCost.match(/\{X\}/g) || []).length;
    if (object.flags.prototype) Object.assign(base, clone(object.flags.prototype));
    if (this.module(object).reconfigure && object.attachedTo) base.types = base.types.filter(t => t !== 'Creature');
    for (const modification of object.modifications || []) {
      if (modification.types) base.types = [...modification.types];
      if (modification.addTypes) base.types = unique([...base.types, ...modification.addTypes]);
      if (modification.addSubtypes) base.subtypes = unique([...base.subtypes, ...modification.addSubtypes]);
      if (modification.keywords) base.keywords = unique([...base.keywords, ...modification.keywords]);
      if (modification.basePower != null) base.power = modification.basePower;
      if (modification.baseToughness != null) base.toughness = modification.baseToughness;
    }
    return base;
  }
  characteristics(objectOrId) {
    const object = typeof objectOrId === 'string' ? this.object(objectOrId) : objectOrId;
    if (!object) return null;
    if (this._deriving) return this._deriving[object.id] || this.baseCharacteristics(object);
    if (!this._cache) {
      const all = Object.values(this.state.instances).filter(o => o.zone !== 'void');
      const view = Object.fromEntries(all.map(o => [o.id, this.baseCharacteristics(o)])); this._deriving = view;
      try {
        const sources = this.objects('battlefield');
        const statics = sources.flatMap(source => (this.module(source).statics || []).map(rule => ({ source, rule })));
        for (const layer of [4, 6, 7]) {
          for (const { source, rule } of statics.filter(x => (x.rule.layer || 7) === layer))
            for (const target of all) if (!rule.match || rule.match(this, source, target, view[target.id])) rule.apply(this, source, target, view[target.id]);
          for (const effect of this.state.effects.filter(e => e.kind === 'modify' && (e.layer || 7) === layer)) {
            for (const target of all) if ((effect.targets ? effect.targets.some(r => sameRef(r, target)) : matches(this, target, effect.selector || {}, { controller: effect.controller }))) this.applyCharacteristicModification(view[target.id], effect.modification);
          }
          if (layer === 7) {
            for (const target of all) {
              const own = this.module(target).characteristics;
              if (own) own(this, target, view[target.id]);
            }
          }
        }
        for (const target of all) {
          const c = view[target.id];
          for (const modification of target.modifications || []) { c.power += modification.power || 0; c.toughness += modification.toughness || 0; }
          c.power += (target.counters['+1/+1'] || 0) - (target.counters['-1/-1'] || 0);
          c.toughness += (target.counters['+1/+1'] || 0) - (target.counters['-1/-1'] || 0);
          c.keywords = unique(c.keywords); c.types = unique(c.types); c.subtypes = unique(c.subtypes);
        }
        this._cache = view;
      } finally { this._deriving = null; }
    }
    return this._cache[object.id] || this.baseCharacteristics(object);
  }
  applyCharacteristicModification(c, modification) {
    if (modification.types) c.types = [...modification.types];
    if (modification.addTypes) c.types = unique([...c.types, ...modification.addTypes]);
    if (modification.addSubtypes) c.subtypes = unique([...c.subtypes, ...modification.addSubtypes]);
    if (modification.keywords) c.keywords = unique([...c.keywords, ...modification.keywords]);
    if (modification.basePower != null) c.power = modification.basePower;
    if (modification.baseToughness != null) c.toughness = modification.baseToughness;
    c.power += modification.power || 0; c.toughness += modification.toughness || 0;
  }
  isSick(object) { return this.characteristics(object).types.includes('Creature') && object.controlledSince >= this.state.turnSerial && !this.characteristics(object).keywords.includes('Haste'); }
  isSorceryTime(controller = 0) { return this.state.activePlayer === controller && ['main1', 'main2'].includes(this.state.step) && !this.state.stack.length && !this.state.resolving && this.state.priorityHolder === controller; }
  abilities(objectOrId) {
    const object = typeof objectOrId === 'string' ? this.object(objectOrId) : objectOrId;
    if (!object) return [];
    return (this.module(object).activated || []).filter(a => (a.zone || 'battlefield') === object.zone && (!a.available || a.available(this, object)));
  }
  context(source, extra = {}) {
    return { source: ref(source), sourceCardId: source?.copy?.rulesId || source?.cardId || null,
      sourceSnapshot: source ? this.lastKnown(source) : null, controller: source?.controller ?? 0, inputs: {}, vars: {}, ...clone(extra) };
  }
  lastKnown(object) { return { ...clone(object), characteristics: clone(this.characteristics(object)), definition: clone(this.definition(object)) }; }
  randomShuffle(ids, reason = 'shuffle') {
    const start = this.state.rng.count, result = shuffled(ids, this.state.rng);
    this.record('RANDOM_RESULT', { reason, beforeCount: start, afterCount: this.state.rng.count, result }); return result;
  }
  record(type, detail = {}) {
    const event = { sequence: ++this.state.eventSerial, type, turn: this.state.turnNumber, turnSerial: this.state.turnSerial, step: this.state.step, activePlayer: this.state.activePlayer, ...clone(detail) };
    if (this.transaction) this.transaction.events.push(event);
    return event;
  }
  perform(action) {
    if (action?.type === 'UNDO') return this.undo();
    if (action?.type === 'REDO') return this.redo();
    const attemptBefore = clone(this.state), newTransaction = !this.transaction;
    if (newTransaction) this.transaction = { before: clone(this.state), intents: [], events: [], label: action.type };
    const previousIntents = this.transaction.intents.length, previousEvents = this.transaction.events.length;
    try {
      requireRule(action && typeof action.type === 'string', 'Invalid action.');
      this.transaction.intents.push(clone(action)); this.touch(); this.lastError = null;
      this.handleAction(action);
      this.settle();
      if (!this.state.pending && !this.state.actionDraft && !this.state.resolving) this.commitTransaction();
      this.notify(); return { ok: true, pending: clone(this.state.pending) };
    } catch (error) {
      this.state = attemptBefore; this.touch();
      if (newTransaction) this.transaction = null;
      else { this.transaction.intents.length = previousIntents; this.transaction.events.length = previousEvents; }
      this.lastError = { message: error.message, code: error.code || 'ENGINE_ERROR', detail: error.detail || null };
      if (!(error instanceof RuleError)) console.error(error);
      this.notify(); return { ok: false, error: this.lastError };
    }
  }
  act(action) { const result = this.perform(action); if (!result.ok) throw new RuleError(result.error.message, result.error.code); return result; }
  commitTransaction() {
    const transaction = this.transaction; if (!transaction) return;
    this.state.activeLibraryBoundary = this.state.zones.libraryActive.length;
    validateState(this.state, this.registry);
    const patches = diffState(transaction.before, this.state);
    if (patches.length || transaction.events.length) {
      this.history.splice(this.cursor);
      this.history.push({ index: this.cursor + 1, label: transaction.label, actions: transaction.intents, events: transaction.events,
        patches, beforeHash: stateHash(transaction.before), afterHash: stateHash(this.state),
        rngBefore: transaction.before.rng.count, rngAfter: this.state.rng.count });
      this.cursor = this.history.length;
    }
    this.transaction = null;
  }
  undo() {
    if (this.transaction) { this.state = clone(this.transaction.before); this.transaction = null; this.touch(); this.notify(); return { ok: true }; }
    if (!this.cursor) return { ok: false, error: { message: 'Nothing to undo.' } };
    this.state = applyPatches(this.state, this.history[--this.cursor].patches, true);
    this.touch(); this.lastError = null; this.notify(); return { ok: true };
  }
  redo() {
    if (this.transaction || this.cursor >= this.history.length) return { ok: false, error: { message: 'Nothing to redo.' } };
    this.state = applyPatches(this.state, this.history[this.cursor++].patches);
    this.touch(); this.lastError = null; this.notify(); return { ok: true };
  }
  exportSession() {
    return { format: 'astra-goldfish-session', schemaVersion: 1, version: VERSION, rulesPack: RULES_PACK,
      initialState: clone(this.initialState), currentState: clone(this.state), history: clone(this.history), cursor: this.cursor,
      transaction: clone(this.transaction), stateChecksum: stateHash(this.state), manualActions: this.history.slice(0, this.cursor).flatMap(h => h.events).filter(e => /DEBUG|MANUAL/.test(e.type)).length };
  }
  static importSession(registry, document) {
    assertSerializable(document);
    requireRule(document?.format === 'astra-goldfish-session' && document.rulesPack === RULES_PACK, 'This is not a compatible Astra session.', 'INVALID_SESSION');
    validateState(document.initialState, registry); validateState(document.currentState, registry);
    requireRule(document.stateChecksum === stateHash(document.currentState), 'Session checksum does not match. The file may be damaged.', 'INVALID_SESSION');
    const engine = new Engine(registry, document.initialState);
    requireRule(Array.isArray(document.history) && document.history.length <= 100000, 'Invalid session history.', 'INVALID_SESSION');
    engine.history = clone(document.history); engine.cursor = integer(document.cursor, 0, engine.history.length);
    let reconstructed = clone(document.initialState);
    for (const entry of engine.history.slice(0, engine.cursor)) {
      requireRule(entry.beforeHash === stateHash(reconstructed), 'History integrity check failed.', 'INVALID_SESSION');
      reconstructed = applyPatches(reconstructed, entry.patches);
      requireRule(entry.afterHash === stateHash(reconstructed), 'History result does not match.', 'INVALID_SESSION');
    }
    if (!document.transaction) requireRule(stateHash(reconstructed) === document.stateChecksum, 'History does not reproduce the session.', 'INVALID_SESSION');
    engine.state = clone(document.currentState); engine.transaction = clone(document.transaction); return engine;
  }
  verifyReplay() {
    const replay = new Engine(this.registry, this.initialState);
    for (const entry of this.history.slice(0, this.cursor)) {
      for (const action of entry.actions) replay.act(action);
      requireRule(stateHash(replay.state) === entry.afterHash, `Replay diverged at action ${entry.index}.`, 'REPLAY_MISMATCH');
    }
    return { ok: true, actions: this.cursor, checksum: stateHash(replay.state) };
  }
  exportText() {
    const rows = [`ASTRA GOLDFISH — ${RULES_PACK}`, `Seed: ${this.state.seed}`, `Active nonlands: ${this.state.initialDeck.selectedNonlands}; fixed lands: ${this.state.initialDeck.fixedLands}`, ''];
    for (const entry of this.history.slice(0, this.cursor)) {
      rows.push(`#${entry.index} ${entry.label} [${entry.afterHash}]`);
      for (const event of entry.events) rows.push(`  T${event.turn} ${event.step}: ${event.type} ${JSON.stringify(event)}`);
    }
    return rows.join('\n');
  }
}
