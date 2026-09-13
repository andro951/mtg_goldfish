import { COLORS, ref, requireRule, asArray } from './util.js';

// This is a UI shortcut, not a replacement or extra rules ability. Definitions
// opt in only when the cost is {T} and the entire effect adds exactly one mana.
// Do not call arbitrary effect programs just to guess what a click might do.
export const ONE_MANA_ACTION = 'ACTIVATE_SINGLE_MANA';
export const ONE_MANA_ID = 'ui-single-mana';
export function oneManaOptions(g, source, abilities = g.abilities(source)) {
  const routes = new Map(), grouped = [];
  for (const ability of abilities) {
    const meta = ability.singleMana;
    if (!meta || !ability.mana || !ability.tap || ability.cost || ability.life || ability.energy ||
        ability.loyalty != null || ability.sorcery || ability.instantOnly || ability.validate ||
        (ability.costs && (!Array.isArray(ability.costs) || ability.costs.length))) continue;
    const colors = typeof meta.colors === 'function' ? meta.colors(g, source) : meta.colors;
    if (!Array.isArray(colors) || !colors.length || colors.some(c => !COLORS.includes(c))) continue;
    grouped.push(ability.id);
    for (const color of colors) {
      const route = { color, abilityId: ability.id, inputs: meta.key ? { [meta.key]: color } : {}, restriction: meta.restriction || null };
      const old = routes.get(color);
      // Prefer unrestricted mana when the same tap can produce that color
      // either way. Never erase an actual restriction on a restricted-only color.
      if (!old || (old.restriction && !route.restriction)) routes.set(color, route);
      else if (old.restriction && route.restriction && old.restriction !== route.restriction) {
        // Incomparable spending restrictions need an explicit ability choice.
        return { grouped: [], choices: [] };
      }
    }
  }
  return { grouped, choices: COLORS.filter(c => routes.has(c)).map(c => routes.get(c)) };
}

export function beginOneMana(g, action) {
  const parent = g.state.pending;
  requireRule(!parent || ['payment', 'effectPayment'].includes(parent.kind), 'Finish the highlighted choice first.', 'CHOICE_PENDING');
  requireRule(!g.state.actionDraft || parent?.kind === 'payment', 'An action is already being prepared.', 'CHOICE_PENDING');
  requireRule(!g.state.resolving || parent?.kind === 'effectPayment', 'An effect is still resolving.');
  requireRule(g.state.started && g.state.status === 'playing', 'Keep your opening hand before starting play.');
  const source = g.object(action.id);
  requireRule(source?.zone === 'battlefield' && source.controller === 0, 'You do not control this permanent.', 'ABILITY_UNAVAILABLE');
  requireRule(!source.tapped, 'This permanent is already tapped.', 'TAP_COST');
  requireRule(!g.isSick(source), 'This creature has summoning sickness.', 'SUMMONING_SICKNESS');
  const { choices } = oneManaOptions(g, source);
  requireRule(choices.length, 'No compatible one-mana ability is currently available.', 'ABILITY_UNAVAILABLE');
  if (choices.length === 1) return activateRoute(g, source, choices[0]);
  // Leave the parent draft/resolving frame intact. Cancel restores only this
  // pending decision; mana already produced for the parent payment is retained.
  g.state.pending = { kind: 'oneManaChoice', key: 'oneManaColor', type: 'option', label: 'Choose one mana',
    min: 1, max: 1, source: ref(source), parent,
    options: choices.map(r => ({ value: r.color, label: r.color, restriction: r.restriction })) };
}
export function acceptOneMana(g, value) {
  const pending = g.state.pending, color = asArray(value)[0], source = g.object(pending.source);
  requireRule(asArray(value).length === 1 && pending.options.some(o => o.value === color), 'Choose one of the displayed mana types.', 'INVALID_CHOICE');
  requireRule(source?.zone === 'battlefield', 'This mana source is no longer on the battlefield.', 'ABILITY_UNAVAILABLE');
  // Re-evaluate the live grant/threshold and object identity; a stale selector
  // must not manufacture an ability that has disappeared.
  const route = oneManaOptions(g, source).choices.find(r => r.color === color);
  requireRule(route, 'That mana option is no longer available.', 'ABILITY_UNAVAILABLE');
  g.state.pending = pending.parent;
  return activateRoute(g, source, route);
}
function activateRoute(g, source, route) {
  const action = { type: 'ACTIVATE_ABILITY', id: source.id, abilityId: route.abilityId, inputs: route.inputs };
  if (g.state.pending) return g.beginPaymentManaAbility(action);
  return g.beginAbility(action);
}
