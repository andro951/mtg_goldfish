import { ref, sameRef, unique, requireRule } from '../core/util.js';
import { register, BF, HAND, anyColor, options, colorInput, selectInput, playerTarget, target, tapOthers, sacrifice, selfSacrifice, mana, draw, etb, upkeep, optional, countType, paidMV, paid, choose, move, allArtifacts } from './helpers.js';

export function installManaEngines(registry) {
  for (const card of registry.list().filter(c => !c.candidate)) register(registry, card.id, {});
  register(registry, 'Treasure', { activated: [{ id: 'mana', label: 'Sacrifice: add any color', tap: true, mana: true, inputs: [colorInput()], costs: [selfSacrifice], effect: (g, ctx) => [{ op: 'mana', color: ctx.inputs.color }] }] });
  register(registry, 'Food', { activated: [{ id: 'eat', label: 'Sacrifice Food: gain 3 life', cost: '{2}', tap: true, costs: [selfSacrifice], effect: () => [{ op: 'life', amount: 3 }] }] });
  register(registry, 'Construct', { characteristics: (g, o, c) => { if (o.zone === 'battlefield') { const n = countType(g, 'Artifact', o.controller); c.power += n; c.toughness += n; } } });
  register(registry, 'Pilot', { crewBonus: 2 });
  register(registry, 'Grim Monolith', { noNaturalUntap: true, activated: [mana({ C: 3 }), { id: 'untap', label: 'Untap Grim Monolith', cost: '{4}', effect: () => [{ op: 'untap', ids: '$source' }] }] });
  register(registry, 'Mana Vault', { noNaturalUntap: true, activated: [mana({ C: 3 })], triggers: [
    upkeep('untap-offer', 'You may pay {4} to untap Mana Vault', () => [{ op: 'pay', mana: '{4}', label: 'Pay {4} to untap Mana Vault?', then: [{ op: 'untap', ids: '$source' }] }]),
    { id: 'draw-damage', label: 'Mana Vault deals 1 damage to you', event: 'DRAW_STEP', test: (g, s, e) => e.player === s.controller && s.tapped,
      interveningIf: (g, ctx) => !!g.object(ctx.source)?.tapped, effect: (g, ctx) => [{ op: 'damage', player: ctx.controller, amount: 1 }] },
  ] });
  register(registry, 'Mox Opal', { activated: [{ id: 'mana', singleMana:{colors:anyColor,key:'color'}, label: 'Metalcraft: add any color', tap: true, mana: true, available: (g, s) => countType(g, 'Artifact', s.controller) >= 3,
    inputs: [colorInput()], effect: (g, ctx) => [{ op: 'mana', color: ctx.inputs.color }] }] });
  const amberColors = (g, controller = 0) => unique(g.controlled(controller).filter(o => {
    const c = g.characteristics(o); return c.supertypes.includes('Legendary') && (c.types.includes('Creature') || c.types.includes('Planeswalker'));
  }).flatMap(o => g.characteristics(o).colors));
  register(registry, 'Mox Amber', { activated: [{ id: 'mana', singleMana:{colors:(g,s)=>amberColors(g,s.controller),key:'color'}, label: 'Add a color among your legends', tap: true, mana: true, available: (g, s) => amberColors(g, s.controller).length > 0,
    inputs: (g, s) => [colorInput('color', amberColors(g, s.controller))], effect: (g, ctx) => [{ op: 'mana', color: ctx.inputs.color }] }] });
  register(registry, 'Empowered Autogenerator', { entersTapped: true, activated: [{ id: 'mana', label: 'Add charge; produce that much mana', tap: true, mana: true, inputs: [colorInput()],
    effect: () => [{ op: 'counter', ids: '$source', type: 'charge', amount: 1 }, { op: 'call', handler: 'mana.autogenerator' }] }] });
  registry.registerHandler('mana.autogenerator', (g, ctx) => [{ op: 'mana', color: ctx.inputs.color, amount: g.object(ctx.source)?.counters.charge || 0 }]);
  register(registry, 'Krark-Clan Ironworks', { activated: [{ id: 'sacrifice', label: 'Sacrifice an artifact: add CC', mana: true, costs: [sacrifice({ ...BF, artifact: true })], effect: () => [{ op: 'mana', production: { C: 2 } }] }] });
  register(registry, 'Priest of Yawgmoth', { activated: [{ id: 'sacrifice', label: 'Sacrifice an artifact: add its mana value in black', tap: true, mana: true,
    costs: [sacrifice({ ...BF, artifact: true })], effect: (g, ctx) => [{ op: 'mana', production: { B: paidMV(ctx) } }] }] });
  register(registry, 'Radiant Lotus', { activated: [{ id: 'lotus', label: 'Sacrifice artifacts; target player adds 3N mana', tap: true, mana: false,
    inputs: [playerTarget()], costs: [{ kind: 'sacrifice', key: 'sacrificed', selector: { ...BF, artifact: true }, min: 1, max: 10000 }], effectInputs: [colorInput()],
    effect: (g, ctx) => [{ op: 'mana', player: ctx.inputs.player, color: ctx.inputs.color, amount: 3 * paid(ctx).length }] }] });
  register(registry, 'Urza, Lord High Artificer', { triggers: [etb('construct', 'Create a Construct', () => [{ op: 'token', card: 'Construct' }])], activated: [
    { id: 'artifact-mana', label: 'Tap an artifact: add U', mana: true, costs: [tapOthers({ ...BF, artifact: true }, 1)], effect: () => [{ op: 'mana', production: { U: 1 } }] },
    { id: 'exile-top', label: 'Shuffle; exile top; play it free this turn', cost: '{5}', effect: () => [{ op: 'shuffle' }, { op: 'takeTop', to: 'exile', key: 'urzaExile', cause: 'urza-exile' },
      { op: 'grantPermission', ids: '$var.urzaExile', zone: 'exile', method: 'free', expires: 'endOfTurn', label: 'Urza — play without paying its mana cost this turn' }] },
  ] });
  register(registry, 'The Great Henge', { costReduction: (g, o) => Math.max(0, ...g.controlled(o.owner).filter(p => g.characteristics(p).types.includes('Creature')).map(p => g.characteristics(p).power)),
    activated: [mana({ G: 2 }, { effect: () => [{ op: 'mana', production: { G: 2 } }, { op: 'life', amount: 2 }] })],
    triggers: [{ id: 'creature-draw', label: 'Put a counter on the entering creature; draw', event: 'ENTER', test: (g, s, e) => e.change.object.controller === s.controller && !e.change.object.token && e.change.object.characteristics.types.includes('Creature'),
      effect: (g, ctx) => [{ op: 'counter', ids: [ctx.event.change.afterRef], type: '+1/+1', amount: 1 }, draw()] }] });
  register(registry, 'Chromatic Orrery', { spendAsAny: true, activated: [mana({ C: 5 }), { id: 'draw', label: 'Draw for each color among your permanents', cost: '{5}', tap: true,
    effect: (g, ctx) => [draw(unique(g.controlled(ctx.controller).flatMap(o => g.characteristics(o).colors)).length)] }] });
  register(registry, 'Metalworker', { activated: [{ id: 'reveal-mana', label: 'Reveal artifacts in hand: add 2C each', mana: true, tap: true,
    inputs: [selectInput('revealed', 'Reveal any number of artifact cards in your hand', { ...HAND, artifact: true }, 0, 10000)],
    effect: (g, ctx) => [{ op: 'record', type: 'CARDS_REVEALED', detail: { cards: ctx.inputs.revealed } }, { op: 'mana', production: { C: 2 * ctx.inputs.revealed.length } }] }] });
  register(registry, 'Shimmer Dragon', { characteristics: (g, o, c) => { if (o.zone === 'battlefield' && countType(g, 'Artifact', o.controller) >= 4) c.keywords.push('Hexproof'); },
    activated: [{ id: 'draw', label: 'Tap two artifacts: draw a card', costs: [tapOthers({ ...BF, artifact: true }, 2)], effect: () => [draw()] }] });
  const landMana = (g, object) => {
    const module = g.module(object), colors = typeof module.possibleMana === 'function' ? module.possibleMana(g, object) : module.possibleMana || [];
    return unique(colors);
  };
  register(registry, 'Squandered Resources', { activated: [{ id: 'land-mana', label: 'Sacrifice a land: add a type it could produce', mana: true,
    costs: [sacrifice({ ...BF, land: true })],
    effectInputs: (g, s, ctx) => ctx.inputs.sacrificed?.length ? [colorInput('color', landMana(g, g.object(ctx.inputs.sacrificed[0])))] : [],
    effect: (g, ctx) => [{ op: 'mana', color: ctx.inputs.color }] }] });
}
