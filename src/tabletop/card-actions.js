import { oneManaOptions, ONE_MANA_ID } from '../core/one-mana.js';

/** Land faces never hide a utility, multi-mana or extra-cost activation behind
 * a tap shortcut. Equivalent tap-for-one abilities share one color selector,
 * while the rules engine keeps and executes the original ability definitions. */
export function cardActions(engine, objectOrId) {
  const object = engine.object(objectOrId);
  if (!object || object.zone !== 'battlefield') return { abilities: [], displayAbilities: [], quickMana: null, showAbilities: false };
  const abilities = engine.abilities(object), single = oneManaOptions(engine, object, abilities);
  const grouped = single.grouped.length > 1;
  const group = grouped ? { id: ONE_MANA_ID, label: `Add one mana: ${single.choices.map(r => r.color).join(' / ')}`,
    mana: true, tap: true, singleManaGroup: true } : null;
  const unavailable = (engine.module(object).activated || []).filter(a => a.showWhenUnavailable && !abilities.some(b => b.id === a.id))
    .map(a => ({...a, unavailable: true}));
  const displayAbilities = [];let inserted = false;
  for (const ability of abilities) {
    if (grouped && single.grouped.includes(ability.id)) { if (!inserted) { displayAbilities.push(group); inserted = true; } }
    else displayAbilities.push(ability);
  }
  displayAbilities.push(...unavailable);
  const isLand = engine.characteristics(object).types.includes('Land');
  const tapMana = displayAbilities.filter(a => a.mana && a.tap);
  const quickMana = isLand
    ? (displayAbilities.length === 1 && (group || single.grouped.includes(displayAbilities[0].id)) ? displayAbilities[0] : null)
    : (tapMana.length === 1 ? tapMana[0] : null);
  return { abilities, displayAbilities, quickMana,
    showAbilities: (displayAbilities.length > 1 && abilities.some(a => a.mana)) || (isLand && abilities.length > 0 && !quickMana) };
}
