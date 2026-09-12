import { ref, sameRef, unique } from '../core/util.js';
import { register, BF, GY, HAND, LIB, anyColor, options, colorInput, xInput, target, selfSacrifice, discardCost, mana, draw, choose, move, search, etb, upkeep, landfall, countType, tapOthers, selected } from './helpers.js';

export function installLands(registry) {
  for (const card of registry.list().filter(c => c.candidate && c.types.includes('Land'))) {
    const line = card.oracleText.split('\n').find(line => /^\{T\}: Add /.test(line));
    const colors = line ? [...line.matchAll(/\{([WUBRGC])\}/g)].map(m => m[1]) : [];
    const choice = line && /\bor\b/.test(line);
    const production = {};
    for (const color of colors) production[color] = (production[color] || 0) + 1;
    register(registry, card.id, { entersTapped: /enters tapped/.test(card.oracleText), possibleMana: unique(colors),
      activated: colors.length ? [choice ? mana({}, { inputs: [colorInput('color', unique(colors))], label: `Add ${unique(colors).join(' or ')}`, effect: (g, ctx) => [{ op: 'mana', color: ctx.inputs.color }] }) : mana(production)] : [] });
  }
  for (const name of ['Simic Growth Chamber', 'Selesnya Sanctuary', 'Golgari Rot Farm', 'Dimir Aqueduct', 'Gruul Turf', 'Azorius Chancery', 'Izzet Boilerworks']) {
    register(registry, name, { triggers: [etb('return-land', 'Return a land you control', () => [choose('returnedLand', 'Return a land you control to its owner’s hand', { ...BF, land: true }), move('$var.returnedLand', 'hand', { cause: 'bounce-land' })])] });
  }
  register(registry, 'Mishra\'s Workshop', { activated: [] });
  // Replace the basic ability, rather than accidentally providing unrestricted CCC.
  const workshop = registry.module('Mishra\'s Workshop'); workshop.activated = [mana({ C: 3 }, { effect: () => [{ op: 'mana', production: { C: 3 }, restriction: 'artifactSpell' }] })];
  register(registry, 'Oboro, Palace in the Clouds', { activated: [{ id: 'return', label: 'Return Oboro to hand', cost: '{1}', effect: () => [move('$source', 'hand')] }] });
  register(registry, 'Buried Ruin', { activated: [{ id: 'recover', label: 'Return target artifact card', cost: '{2}', tap: true, costs: [selfSacrifice], inputs: [target({ ...GY, artifact: true })], effect: () => [move('$input.target', 'hand')] }] });
  register(registry, 'Treasure Vault', { activated: [{ id: 'treasures', label: 'Create X Treasures', cost: '{X}{X}', tap: true, inputs: [xInput], costs: [selfSacrifice], effect: (g, ctx) => [{ op: 'token', card: 'Treasure', count: ctx.inputs.x }] }] });
  register(registry, 'Scene of the Crime', { possibleMana: ['C', ...anyColor], activated: [
    { id: 'filter', label: 'Tap a creature: add any color', mana: true, tap: true, costs: [tapOthers({ ...BF, creature: true }, 1)], effectInputs: [colorInput()], effect: (g, ctx) => [{ op: 'mana', color: ctx.inputs.color }] },
    { id: 'clue', label: 'Sacrifice Clue: draw a card', cost: '{2}', costs: [selfSacrifice], effect: () => [draw()] },
  ] });
  register(registry, 'Power Depot', { possibleMana: ['C', ...anyColor], entersCounters: { '+1/+1': 1 }, activated: [
    { id: 'restricted-color', label: 'Add any color (artifact spell/ability only)', mana: true, tap: true, inputs: [colorInput()], effect: (g, ctx) => [{ op: 'mana', color: ctx.inputs.color, restriction: 'artifactSpellOrAbility' }] },
  ], triggers: [{ id: 'modular', label: 'Modular 1', event: 'LEAVE', lookBack: true, test: (g, s, e) => e.change.to === 'graveyard' && sameRef(s, e.change.beforeRef), optional: true,
    inputs: [target({ zones: ['battlefield'], allTypes: ['Artifact', 'Creature'] })], effect: (g, ctx) => [{ op: 'counter', ids: '$input.target', type: '+1/+1', amount: ctx.event.change.lki.counters['+1/+1'] || 0 }] }] });
  const fairCondition = (g, controller = 0) => countType(g, 'Artifact', controller) >= 3;
  register(registry, 'Inventors\' Fair', { triggers: [upkeep('fair-life', 'Gain 1 life if you control three artifacts', () => [{ op: 'life', amount: 1 }], {
    test: (g, s, e) => e.player === s.controller && fairCondition(g, s.controller), interveningIf: (g, ctx) => fairCondition(g, ctx.controller),
  })], activated: [{ id: 'tutor', label: 'Search for an artifact', cost: '{4}', tap: true, costs: [selfSacrifice], available: g => fairCondition(g), effect: () => [search({ artifact: true })] }] });
  register(registry, 'Fomori Vault', { activated: [{ id: 'vault', label: 'Look at top cards; keep one', cost: '{3}', tap: true, costs: [discardCost()],
    effect: (g, ctx) => [{ op: 'look', count: countType(g, 'Artifact', ctx.controller), key: 'vaultLook' },
      { op: 'choose', key: 'vaultKeep', label: 'Put one of these cards into your hand', ids: '$var.vaultLook', min: 1, max: 1 },
      move('$var.vaultKeep', 'hand'), { op: 'call', handler: 'lands.vault-bottom' }] }] });
  registry.registerHandler('lands.vault-bottom', (g, ctx) => [{ op: 'library', ids: (ctx.vars.vaultLook || []).filter(id => !(ctx.vars.vaultKeep || []).includes(id)), position: 'bottom', random: true }]);
  register(registry, 'The Mycosynth Gardens', { possibleMana: ['C', ...anyColor], activated: [
    { id: 'filter', label: 'Filter one mana to any color', mana: true, cost: '{1}', tap: true, inputs: [colorInput()], effect: (g, ctx) => [{ op: 'mana', color: ctx.inputs.color }] },
    { id: 'copy', label: 'Become a copy of a nontoken artifact', cost: '{X}', tap: true,
      inputs: (g, s, ctx) => [xInput, ...(ctx.inputs.x != null ? [target({ ...BF, artifact: true, token: false, manaValue: ctx.inputs.x })] : [])],
      effect: (g, ctx) => [{ op: 'becomeCopy', source: ctx.source, target: selected(ctx)[0] }] },
  ] });
  const sevenNames = (g, controller) => new Set(g.controlled(controller).filter(o => g.characteristics(o).types.includes('Land')).map(o => g.characteristics(o).name)).size >= 7;
  register(registry, 'Field of the Dead', { triggers: [landfall('zombie', 'Create a Zombie with seven different land names', () => [{ op: 'token', card: 'Zombie' }], {
    test: (g, s, e) => e.change.object.controller === s.controller && e.change.object.characteristics.types.includes('Land') && sevenNames(g, s.controller),
    interveningIf: (g, ctx) => sevenNames(g, ctx.controller),
  })] });
  registry.registerHandler('lands.saga-grant', (g, ctx, cmd) => { const source = g.object(ctx.source); if (source) source.flags[cmd.flag] = true; return []; });
  register(registry, 'Urza\'s Saga', { saga: 3, possibleMana: ['C'], activated: [
    mana({ C: 1 }, { available: (g, s) => !!s.flags.sagaMana }),
    { id: 'construct', label: 'Create a Construct', cost: '{2}', tap: true, available: (g, s) => !!s.flags.sagaConstruct, effect: () => [{ op: 'token', card: 'Construct' }] },
  ], triggers: [
    { id: 'chapter-1', label: 'I — Gain a colorless mana ability', event: 'SAGA_LORE', test: (g, s, e) => sameRef(s, e.object) && e.from < 1 && e.to >= 1, effect: () => [{ op: 'call', handler: 'lands.saga-grant', flag: 'sagaMana' }] },
    { id: 'chapter-2', label: 'II — Gain the Construct ability', event: 'SAGA_LORE', test: (g, s, e) => sameRef(s, e.object) && e.from < 2 && e.to >= 2, effect: () => [{ op: 'call', handler: 'lands.saga-grant', flag: 'sagaConstruct' }] },
    { id: 'chapter-3', label: 'III — Search for an artifact costing exactly {0} or {1}', event: 'SAGA_LORE', test: (g, s, e) => sameRef(s, e.object) && e.from < 3 && e.to >= 3,
      effect: g => [search({ artifact: true, ids: g.activeLibrary().filter(id => ['{0}', '{1}'].includes(g.definition(g.object(id)).manaCost)) }, 'battlefield')] },
  ] });
}
