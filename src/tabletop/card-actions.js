/** UI routing only: an inspection affordance never pays a cost or activates
 * anything. Read the live ability list, including copied and granted abilities.
 * The face keeps its fast mana gesture; the separate button reveals the rest. */
export function cardActions(engine, objectOrId) {
  const object = engine.object(objectOrId);
  if (!object || object.zone !== 'battlefield') return { abilities: [], quickMana: null, showAbilities: false };
  const abilities = engine.abilities(object);
  const tapMana = abilities.filter(ability => ability.mana && ability.tap);
  return {
    abilities,
    quickMana: tapMana.length === 1 ? tapMana[0] : null,
    showAbilities: abilities.length > 1 && abilities.some(ability => ability.mana),
  };
}
