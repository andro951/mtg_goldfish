/** Pure deterministic utilities shared by engine, tests and offline browser build. */
export const VERSION = '1.0.0';
export const RULES_PACK = 'astra-160@1.0.0';
export const COLORS = Object.freeze(['W', 'U', 'B', 'R', 'G', 'C']);
export const ZONES = Object.freeze(['libraryActive', 'libraryReserve', 'hand', 'battlefield', 'graveyard', 'exile', 'command', 'outside', 'workspace', 'stackCards']);
export const STEPS = Object.freeze(['untap', 'upkeep', 'draw', 'main1', 'beginCombat', 'attackers', 'damage', 'endCombat', 'main2', 'end', 'cleanup']);
export const clone = value => value === undefined ? undefined : JSON.parse(JSON.stringify(value));
export const normalizeName = value => String(value).normalize('NFKC').replace(/[’‘]/g, "'").replace(/\s+/g, ' ').trim().toLowerCase();
export const unique = values => [...new Set(values)];
export const sum = values => values.reduce((a, b) => a + b, 0);
export const asArray = value => value == null ? [] : Array.isArray(value) ? value : [value];
export const isMain = state => state.activePlayer === 0 && ['main1', 'main2'].includes(state.step);
export const emptyMana = () => ({ W: 0, U: 0, B: 0, R: 0, G: 0, C: 0 });
export const ref = object => object ? { id: object.id, oid: object.oid } : null;
export const sameRef = (a, b) => !!a && !!b && a.id === b.id && a.oid === b.oid;
export function integer(value, min = 0, max = 1000000, label = 'Number') {
  const n = Number(value);
  if (!Number.isSafeInteger(n) || n < min || n > max) throw new RuleError(`${label} must be an integer from ${min} to ${max}.`, 'INVALID_NUMBER');
  return n;
}
export class RuleError extends Error {
  constructor(message, code = 'ILLEGAL_ACTION', detail = null) { super(message); this.name = 'RuleError'; this.code = code; this.detail = detail; }
}
export function requireRule(condition, message, code) { if (!condition) throw new RuleError(message, code); }
export function hashText(text) {
  let h = 2166136261;
  for (let i = 0; i < text.length; i++) { h ^= text.charCodeAt(i); h = Math.imul(h, 16777619); }
  return (h >>> 0).toString(16).padStart(8, '0');
}
export function stableJSON(value) {
  if (Array.isArray(value)) return '[' + value.map(v => v === undefined ? 'null' : stableJSON(v)).join(',') + ']';
  if (value && typeof value === 'object') return '{' + Object.keys(value).filter(k => value[k] !== undefined).sort().map(k => JSON.stringify(k) + ':' + stableJSON(value[k])).join(',') + '}';
  return JSON.stringify(value);
}
export const stateHash = state => hashText(stableJSON(state));
export function seedState(seed) { return { value: parseInt(hashText(String(seed)), 16) || 0x9e3779b9, count: 0 }; }
export function randomUnit(rng) {
  let x = rng.value >>> 0;
  x ^= x << 13; x ^= x >>> 17; x ^= x << 5;
  rng.value = x >>> 0; rng.count++;
  return rng.value / 4294967296;
}
export function shuffled(values, rng) {
  const result = [...values];
  for (let i = result.length - 1; i > 0; i--) { const j = Math.floor(randomUnit(rng) * (i + 1)); [result[i], result[j]] = [result[j], result[i]]; }
  return result;
}
export function freezeDeep(value) {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) { Object.values(value).forEach(freezeDeep); Object.freeze(value); }
  return value;
}

/** Generic reversible JSON patches: no card-specific undo handlers. */
export function diffState(before, after, path = [], patches = []) {
  if (Object.is(before, after)) return patches;
  const plain = x => x !== null && typeof x === 'object' && !Array.isArray(x);
  if (plain(before) && plain(after)) {
    for (const key of unique([...Object.keys(before), ...Object.keys(after)])) {
      const b = Object.hasOwn(before, key), a = Object.hasOwn(after, key);
      if (!b || !a) patches.push({ path: [...path, key], before: b ? clone(before[key]) : null, after: a ? clone(after[key]) : null, hadBefore: b, hadAfter: a });
      else diffState(before[key], after[key], [...path, key], patches);
    }
  } else if (JSON.stringify(before) !== JSON.stringify(after)) {
    patches.push({ path, before: clone(before), after: clone(after), hadBefore: true, hadAfter: true });
  }
  return patches;
}
export function applyPatches(state, patches, backwards = false) {
  let result = state;
  for (const patch of backwards ? [...patches].reverse() : patches) {
    requireRule(Array.isArray(patch.path) && patch.path.every(k => typeof k === 'string' && !['__proto__', 'constructor', 'prototype'].includes(k)), 'Unsafe session patch.', 'INVALID_SESSION');
    const value = clone(backwards ? patch.before : patch.after);
    const present = backwards ? patch.hadBefore : patch.hadAfter;
    if (!patch.path.length) { result = value; continue; }
    let parent = result;
    for (const key of patch.path.slice(0, -1)) { requireRule(parent && Object.hasOwn(parent, key), 'Session patch path is invalid.', 'INVALID_SESSION'); parent = parent[key]; }
    const key = patch.path.at(-1);
    if (present) parent[key] = value; else delete parent[key];
  }
  return result;
}
export function escapeHTML(value) { return String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]); }
export function assertSerializable(value, depth = 0) {
  requireRule(depth < 100, 'Session nesting is too deep.', 'INVALID_SESSION');
  if (value && typeof value === 'object') for (const [key, entry] of Object.entries(value)) {
    requireRule(!['__proto__', 'constructor', 'prototype'].includes(key), 'Unsafe session key.', 'INVALID_SESSION');
    assertSerializable(entry, depth + 1);
  }
  else requireRule(value === null || ['string', 'number', 'boolean'].includes(typeof value), 'Session contains invalid values.', 'INVALID_SESSION');
}
