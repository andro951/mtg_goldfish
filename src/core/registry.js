import { freezeDeep, normalizeName, requireRule, clone } from './util.js';

/** Canonical card definitions and independently registered rules capabilities. */
export class CardRegistry {
  constructor(definitions = []) {
    this.cards = new Map(); this.aliases = new Map(); this.rules = new Map(); this.handlers = new Map();
    for (const definition of definitions) this.addDefinition(definition);
  }
  addDefinition(definition) {
    requireRule(definition && typeof definition.id === 'string' && typeof definition.name === 'string', 'Invalid card definition.');
    const card = freezeDeep(clone({ types: [], subtypes: [], supertypes: [], keywords: [], colors: [], colorIdentity: [], manaCost: '', manaValue: 0, oracleText: '', ...definition }));
    this.cards.set(card.id, card);
    this.aliases.set(normalizeName(card.name), card.id);
    this.aliases.set(normalizeName(card.key || card.id), card.id);
    for (const face of card.faces || []) if (face.name) this.aliases.set(normalizeName(face.name), card.id);
    return card;
  }
  get(idOrName) {
    const id = this.cards.has(idOrName) ? idOrName : this.aliases.get(normalizeName(idOrName));
    const result = this.cards.get(id);
    requireRule(result, `Card is not in the local rules pack: ${idOrName}`, 'UNSUPPORTED_CARD');
    return result;
  }
  has(idOrName) { return this.cards.has(idOrName) || this.aliases.has(normalizeName(idOrName)); }
  register(idOrName, capability) {
    const definition = this.get(idOrName);
    const previous = this.rules.get(definition.id) || {};
    const merged = { ...previous, ...capability };
    for (const key of ['triggers', 'activated', 'statics', 'replacements', 'permissions', 'costModifiers']) merged[key] = [...(previous[key] || []), ...(capability[key] || [])];
    this.rules.set(definition.id, merged);
    return this;
  }
  module(idOrName) { return this.rules.get(this.get(idOrName).id) || {}; }
  registerHandler(name, fn) {
    requireRule(!this.handlers.has(name), `Duplicate effect handler: ${name}`);
    this.handlers.set(name, fn);
    return this;
  }
  list() { return [...this.cards.values()]; }
  report(records = []) {
    const missing = [], partial = [], supported = [], duplicates = [];
    const seen = new Map();
    for (const row of records) {
      const name = normalizeName(row.name);
      seen.set(name, (seen.get(name) || 0) + row.quantity);
      if (!this.has(row.name)) { missing.push(row); continue; }
      const card = this.get(row.name), module = this.module(card.id);
      const item = { ...row, id: card.id, canonicalName: card.name };
      if (module.status === 'full') supported.push(item); else partial.push({ ...item, notes: module.notes || 'Rules module not yet accepted.' });
    }
    for (const [name, quantity] of seen) if (quantity > 1) duplicates.push({ name, quantity });
    return { missing, partial, supported, duplicates, accepted: !missing.length && !partial.length };
  }
}
