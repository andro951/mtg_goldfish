import { asArray, requireRule, unique } from './util.js';

const compare = (value, constraint) => constraint == null || typeof constraint === 'number' ? constraint == null || value === constraint :
  (constraint.eq == null || value === constraint.eq) && (constraint.lte == null || value <= constraint.lte) &&
  (constraint.gte == null || value >= constraint.gte) && (constraint.lt == null || value < constraint.lt) && (constraint.gt == null || value > constraint.gt);

function playerMatches(value, expected, context) {
  if (expected == null || expected === 'any') return true;
  if (expected === 'you' || expected === 'source') return value === (context.controller ?? 0);
  if (expected === 'opponent') return value !== (context.controller ?? 0);
  return value === Number(expected);
}

/** Declarative selector; used by costs, targets, search, copies and attachments. */
export function matches(engine, idOrObject, selector = {}, context = {}) {
  const object = typeof idOrObject === 'string' ? engine.state.instances[idOrObject] : idOrObject;
  if (!object || object.zone === 'void') return false;
  const c = engine.characteristics(object);
  if (selector.zones && !selector.zones.includes(object.zone) && !(object.zone === 'libraryReserve' && selector.zones.includes('libraryActive') && engine.canAccessReserve())) return false;
  if (!playerMatches(object.owner, selector.owner, context) || !playerMatches(object.controller, selector.controller, context)) return false;
  if (selector.ids && !selector.ids.includes(object.id)) return false;
  if (selector.exclude?.includes(object.id)) return false;
  if (selector.another && context.source?.id === object.id) return false;
  if (selector.type && !asArray(selector.type).some(t => c.types.includes(t))) return false;
  if (selector.allTypes && !selector.allTypes.every(t => c.types.includes(t))) return false;
  if (selector.notTypes && selector.notTypes.some(t => c.types.includes(t))) return false;
  if (selector.subtype && !asArray(selector.subtype).some(t => c.subtypes.includes(t))) return false;
  if (selector.supertype && !asArray(selector.supertype).some(t => c.supertypes.includes(t))) return false;
  for (const [field, type] of [['artifact', 'Artifact'], ['creature', 'Creature'], ['land', 'Land']]) if (selector[field] != null && c.types.includes(type) !== selector[field]) return false;
  if (selector.legendary != null && c.supertypes.includes('Legendary') !== selector.legendary) return false;
  const historic = c.types.includes('Artifact') || c.supertypes.includes('Legendary') || c.subtypes.includes('Saga');
  if (selector.historic != null && historic !== selector.historic) return false;
  if (selector.nonlandPermanent && (c.types.includes('Land') || !c.types.some(t => ['Artifact', 'Creature', 'Enchantment', 'Planeswalker', 'Battle'].includes(t)))) return false;
  if (selector.permanent && !c.types.some(t => ['Artifact', 'Creature', 'Enchantment', 'Planeswalker', 'Battle', 'Land'].includes(t))) return false;
  if (selector.tapped != null && object.tapped !== selector.tapped) return false;
  if (selector.token != null && object.token !== selector.token) return false;
  if (selector.faceDown != null && !!object.flags.faceDown !== selector.faceDown) return false;
  if (!compare(c.manaValue, selector.manaValue) || !compare(c.power, selector.power) || !compare(c.toughness, selector.toughness)) return false;
  if (selector.keyword && !c.keywords.includes(selector.keyword)) return false;
  if (selector.manaAbility && !engine.abilities(object).some(a => a.mana)) return false;
  if (selector.samePlayerAs) {
    const prior = context.inputs?.[selector.samePlayerAs];
    const previous = engine.state.instances[asArray(prior)[0]?.id || asArray(prior)[0]];
    if (!previous || previous.controller !== object.owner) return false;
  }
  if (selector.counter && (object.counters[selector.counter.type] || 0) < (selector.counter.min ?? 1)) return false;
  if (selector.target) {
    if (c.keywords.includes('Shroud')) return false;
    if (c.keywords.includes('Hexproof') && object.controller !== (context.controller ?? 0)) return false;
    if (c.keywords.includes('Protection from everything')) return false;
  }
  if (selector.anyOf && !selector.anyOf.some(s => matches(engine, object, s, context))) return false;
  if (selector.allOf && !selector.allOf.every(s => matches(engine, object, s, context))) return false;
  if (selector.not && matches(engine, object, selector.not, context)) return false;
  return true;
}

export function candidates(engine, selector = {}, context = {}) {
  const zones = selector.zones || ['battlefield'];
  const ids = zones.flatMap(zone => engine.state.zones[zone] || []);
  if (zones.includes('libraryActive') && engine.canAccessReserve()) ids.push(...engine.state.zones.libraryReserve);
  return unique(ids).filter(id => matches(engine, id, selector, context));
}

export function validateSelection(engine, selected, selector, context = {}, count = {}) {
  const ids = asArray(selected).map(v => typeof v === 'string' ? v : v.id);
  const min = count.min ?? selector.min ?? 1, max = count.max ?? selector.max ?? min;
  requireRule(ids.length >= min && ids.length <= max, `Choose ${min === max ? min : `${min}–${max}`} card${max === 1 ? '' : 's'}.`, 'INVALID_SELECTION');
  requireRule(unique(ids).length === ids.length, 'The same card cannot be chosen twice.', 'INVALID_SELECTION');
  for (const id of ids) requireRule(matches(engine, id, selector, context), 'That card is not a legal choice for this effect.', 'INVALID_TARGET');
  return ids;
}
