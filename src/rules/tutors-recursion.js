import { ref, sameRef, unique, asArray } from '../core/util.js';
import { register, BF, GY, HAND, LIB, PERMANENT_TYPES, target, selectInput, sacrifice, selfSacrifice, selfExile, draw, choose, move, optional, search, etb, upkeep, countType, paid, paidMV, selected, selfDied, ownArtifactLeft } from './helpers.js';

const artifactGY = { ...GY, artifact: true };
const graveReturn = (selector, tapped = false) => [{ op: 'move', selector: { ...GY, ...selector }, to: 'battlefield', tapped, cause: 'reanimate' }];
const normalLadder = (name, type, cost, sorcery = true, another = false) => ({ name, type, cost, sorcery, another });
const eligibleThisTurn = (g, controller, types = null, allPlayers = false) => unique(g.state.provenance.filter(change => {
  const card = g.object(change.afterRef);
  return change.turnSerial === g.state.turnSerial && change.from === 'battlefield' && change.to === 'graveyard' && card?.zone === 'graveyard' && !card.token &&
    (allPlayers || card.owner === controller) && (!types || g.characteristics(card).types.some(t => types.includes(t)));
}).map(c => c.id));

export function installTutorsRecursion(registry) {
  for (const spec of [normalLadder('Oswald Fiddlebender', 'Artifact', '{W}'), normalLadder('Repurposing Bay', 'Artifact', '{2}', true, true), normalLadder('Birthing Pod', 'Creature', '{1}{G/P}')]) {
    register(registry, spec.name, { activated: [{ id: 'ladder', label: `Sacrifice ${spec.another ? 'another ' : ''}${spec.type.toLowerCase()}; search exactly MV + 1`, cost: spec.cost, tap: true, sorcery: spec.sorcery,
      costs: [sacrifice({ ...BF, type: spec.type, another: spec.another })], effect: (g, ctx) => [search({ type: spec.type, manaValue: paidMV(ctx) + 1 }, 'battlefield', { key: 'ladderSearch' })] }] });
  }
  register(registry, 'Kuldotha Forgemaster', { activated: [{ id: 'forge', label: 'Sacrifice three artifacts; search an artifact to battlefield', tap: true,
    costs: [sacrifice({ ...BF, artifact: true }, 3)], effect: () => [search({ artifact: true }, 'battlefield', { key: 'forgeSearch' })] }] });
  register(registry, 'Eldritch Evolution', { spell: { costs: [sacrifice({ ...BF, creature: true })], exileAfter: true,
    effect: (g, ctx) => [search({ creature: true, manaValue: { lte: paidMV(ctx) + 2 } }, 'battlefield', { key: 'evolutionSearch' })] } });
  register(registry, 'Neoform', { spell: { costs: [sacrifice({ ...BF, creature: true })],
    effect: (g, ctx) => [search({ creature: true, manaValue: paidMV(ctx) + 1 }, 'battlefield', { key: 'neoformSearch', counters: { '+1/+1': 1 } })] } });
  register(registry, 'Expedition Map', { activated: [{ id: 'map', label: 'Sacrifice: find a land for your hand', cost: '{2}', tap: true, costs: [selfSacrifice], effect: () => [search({ land: true }, 'hand', { key: 'mapSearch' })] }] });
  register(registry, 'Moonsilver Key', { activated: [{ id: 'key', label: 'Find an artifact with a mana ability or a basic land', cost: '{1}', tap: true, costs: [selfSacrifice],
    effect: () => [search({ anyOf: [{ artifact: true, manaAbility: true }, { land: true, supertype: 'Basic' }] }, 'hand', { key: 'keySearch' })] }] });
  register(registry, 'Elvish Reclaimer', { characteristics: (g, o, c) => { if (o.zone === 'battlefield' && g.count({ ...GY, owner: o.controller, land: true }) >= 3) { c.power += 2; c.toughness += 2; } },
    activated: [{ id: 'reclaim', label: 'Sacrifice a land; find a tapped land', cost: '{2}', tap: true, costs: [sacrifice({ ...BF, land: true })], effect: () => [search({ land: true }, 'battlefield', { key: 'reclaimerSearch', tapped: true })] }] });
  register(registry, 'Arcum Dagsson', { activated: [{ id: 'transmute', label: 'An artifact creature’s controller sacrifices it and may search', tap: true,
    inputs: [target({ zones: ['battlefield'], allTypes: ['Artifact', 'Creature'] })], effect: (g, ctx) => {
      const victim = g.object(selected(ctx)[0]); if (!victim) return [];
      return [{ op: 'sacrifice', ids: [ref(victim)] }, optional('search', `${g.state.players[victim.controller].name}: search for a noncreature artifact?`,
        [{ op: 'search', player: victim.controller, selector: { artifact: true, creature: false }, to: 'battlefield', key: 'arcumSearch' }])];
    } }] });
  register(registry, 'Goblin Engineer', { triggers: [etb('bury-artifact', 'You may search for an artifact to put into your graveyard', () => [optional('bury-artifact', 'Search for an artifact?', [search({ artifact: true }, 'graveyard', { key: 'engineerSearch' })])])],
    activated: [{ id: 'exchange', label: 'Sacrifice an artifact; return an artifact with MV ≤ 3', cost: '{R}', tap: true, costs: [sacrifice({ ...BF, artifact: true })],
      inputs: [target({ ...artifactGY, manaValue: { lte: 3 } })], effect: () => [move('$input.target', 'battlefield', { cause: 'reanimate' })] }] });
  register(registry, 'Goblin Welder', { activated: [{ id: 'exchange', label: 'Simultaneously exchange a battlefield and graveyard artifact', tap: true,
    inputs: [target({ zones: ['battlefield'], artifact: true }, 'battlefieldTarget'), target({ zones: ['graveyard'], artifact: true, samePlayerAs: 'battlefieldTarget' }, 'graveTarget')],
    effect: (g, ctx) => {
      const a = g.object(asArray(ctx.inputs.battlefieldTarget)[0]), b = g.object(asArray(ctx.inputs.graveTarget)[0]);
      if (!a || !b || a.zone !== 'battlefield' || b.zone !== 'graveyard' || a.controller !== b.owner) return [];
      g.moveBatch([{ id: ref(a), to: 'graveyard', cause: 'sacrifice' }, { id: ref(b), to: 'battlefield', cause: 'reanimate', controller: b.owner }], ctx);
      return [];
    } }] });
  register(registry, 'Master Transmuter', { activated: [{ id: 'transmute', label: 'Return an artifact as cost; you may put an artifact from hand onto battlefield', cost: '{U}', tap: true,
    costs: [{ kind: 'return', key: 'returned', selector: { ...BF, artifact: true }, count: 1 }],
    effect: () => [choose('replacement', 'You may put an artifact from hand onto the battlefield', { ...HAND, artifact: true }, 0, 1), move('$var.replacement', 'battlefield')] }] });
  register(registry, 'Metalwork Colossus', { costReduction: (g, o) => g.select({ ...BF, controller: o.owner, artifact: true, creature: false }).reduce((n, id) => n + g.characteristics(id).manaValue, 0),
    activated: [{ id: 'recover', label: 'Sacrifice two artifacts: return Metalwork Colossus to hand', zone: 'graveyard', costs: [sacrifice({ ...BF, artifact: true }, 2)],
      effect: () => [move('$source', 'hand', { from: 'graveyard' })] }] });
  register(registry, 'Salvage Titan', { alternateCosts: [{ id: 'three-artifacts', label: 'Sacrifice three artifacts instead of mana cost', cost: '', costs: [sacrifice({ ...BF, artifact: true }, 3)] }],
    activated: [{ id: 'recover', label: 'Exile three artifact cards from your graveyard: return Titan to hand', zone: 'graveyard',
      costs: [{ kind: 'exile', key: 'exiled', selector: artifactGY, count: 3 }], effect: () => [move('$source', 'hand', { from: 'graveyard' })] }] });
  register(registry, 'Scrap Trawler', { triggers: [{ id: 'salvage', label: 'Return a lesser-mana-value artifact to hand', event: 'LEAVE',
    test: (g, s, e) => ownArtifactLeft(g, s, e) && e.change.to === 'graveyard',
    inputs: (g, s, ctx) => [target({ ...artifactGY, manaValue: { lt: ctx.event.change.lki.characteristics.manaValue } })],
    effect: () => [move('$input.target', 'hand')],
  }] });
  register(registry, 'The Cauldron of Eternity', { costReduction: (g, o) => 2 * g.count({ ...GY, owner: o.owner, creature: true }),
    triggers: [{ id: 'bottom-creature', label: 'Put the creature on the bottom of its owner’s library', event: 'DIED', test: (g, s, e) => e.change.lki.controller === s.controller,
      effect: (g, ctx) => [{ op: 'library', ids: [ctx.event.change.afterRef], position: 'bottom' }] }],
    activated: [{ id: 'reanimate', label: 'Pay 2 life; return a creature from your graveyard', cost: '{2}{B}', tap: true, life: 2, sorcery: true,
      inputs: [target({ ...GY, creature: true })], effect: () => [move('$input.target', 'battlefield', { cause: 'reanimate' })] }] });
  register(registry, 'Portal to Phyrexia', { triggers: [
    etb('sacrifice-three', 'Each opponent sacrifices three creatures', () => [{ op: 'call', handler: 'recursion.portal-sacrifices' }]),
    upkeep('reanimate', 'Return a creature from any graveyard under your control', () => [move('$input.target', 'battlefield', { controller: 0, cause: 'reanimate', modifications: [{ addSubtypes: ['Phyrexian'] }] })], { inputs: [target({ zones: ['graveyard'], creature: true })] }),
  ] });
  registry.registerHandler('recursion.portal-sacrifices', (g, ctx) => {
    const commands = [];
    for (const player of [1, 2, 3].filter(p => !g.state.players[p].lost)) {
      const real = g.select({ zones: ['battlefield'], controller: player, creature: true }), abstract = g.state.players[player].abstractCreatures;
      // Abstract opponents have no named creatures. Concrete test objects are preferred;
      // remaining mandatory sacrifices consume only the explicitly configured abstract count.
      const n = Math.min(3, real.length);
      if (n) commands.push(choose(`portal-${player}`, `Opponent ${player}: choose ${n} creature${n === 1 ? '' : 's'} to sacrifice`, { zones: ['battlefield'], controller: player, creature: true }, n, n));
      const taken = Math.min(Math.max(0, 3 - n), abstract);
      if (taken) { g.state.players[player].abstractCreatures -= taken; g.record('ABSTRACT_CREATURES_SACRIFICED', { player, count: taken }); }
    }
    commands.push({ op: 'call', handler: 'recursion.portal-commit' }); return commands;
  });
  registry.registerHandler('recursion.portal-commit', (g, ctx) => [{ op: 'sacrifice', ids: [1, 2, 3].flatMap(p => ctx.vars[`portal-${p}`] || []) }]);
  register(registry, 'Bringer of the White Dawn', { alternateCosts: [{ id: 'five-colors', label: 'Pay WUBRG instead', cost: '{W}{U}{B}{R}{G}' }],
    triggers: [upkeep('return-artifact', 'You may return an artifact to the battlefield', () => [move('$input.target', 'battlefield', { cause: 'reanimate' })], { inputs: [target(artifactGY)], optional: true })] });
  const sunriseTypes = ['Artifact', 'Creature', 'Enchantment', 'Land'];
  register(registry, "Faith's Reward", { spell: { effect: (g, ctx) => [move(eligibleThisTurn(g, ctx.controller, PERMANENT_TYPES), 'battlefield', { cause: 'this-turn-return' })] } });
  register(registry, 'Second Sunrise', { spell: { effect: (g, ctx) => [move(eligibleThisTurn(g, ctx.controller, sunriseTypes, true), 'battlefield', { cause: 'this-turn-return' })] } });
  register(registry, "Gerrard's Hourglass Pendant", { skipExtraTurns: true, activated: [{ id: 'return-this-turn', label: 'Exile Pendant: return eligible permanents lost this turn tapped', cost: '{4}', tap: true, costs: [selfExile],
    effect: (g, ctx) => [move(eligibleThisTurn(g, ctx.controller, sunriseTypes), 'battlefield', { cause: 'this-turn-return', tapped: true })] }] });
  register(registry, 'Open the Vaults', { spell: { effect: () => [{ op: 'move', selector: { zones: ['graveyard'], type: ['Artifact', 'Enchantment'], token: false }, to: 'battlefield', cause: 'reanimate' }] } });
  register(registry, 'Redress Fate', { miracle: '{3}{W}', spell: { effect: () => graveReturn({ type: ['Artifact', 'Enchantment'], token: false }) } });
  register(registry, 'Lumra, Bellow of the Woods', { cda: (g, o, c) => { c.power = countType(g, 'Land', o.controller); c.toughness = c.power; },
    triggers: [etb('lands-return', 'Mill four; return all your graveyard lands tapped', () => [{ op: 'mill', count: 4 }, ...graveReturn({ land: true }, true)])] });
  register(registry, 'Aftermath Analyst', { triggers: [etb('mill', 'Mill three cards', () => [{ op: 'mill', count: 3 }])],
    activated: [{ id: 'return-lands', label: 'Sacrifice Analyst: return all graveyard lands tapped', cost: '{3}{G}', costs: [selfSacrifice], effect: () => graveReturn({ land: true }, true) }] });
  register(registry, 'Molderhulk', { costReduction: (g, o) => g.count({ ...GY, owner: o.owner, creature: true }),
    triggers: [etb('return-land', 'Return a land from your graveyard', () => [move('$input.target', 'battlefield', { cause: 'reanimate' })], { inputs: [target({ ...GY, land: true })] })] });
  register(registry, 'Wake the Past', { spell: { effect: () => [{ op: 'move', selector: { ...GY, artifact: true, token: false }, to: 'battlefield', key: 'returnedArtifacts', cause: 'reanimate' },
    { op: 'call', handler: 'recursion.wake-haste' }] } });
  registry.registerHandler('recursion.wake-haste', (g, ctx) => [{ op: 'modify', ids: (ctx.vars.returnedArtifacts || []).map(c => c.afterRef), modification: { keywords: ['Haste'] } }]);
  register(registry, 'Scapeshift', { spell: { effect: () => [choose('landsSacrificed', 'Sacrifice any number of lands simultaneously', { ...BF, land: true }, 0, 10000),
    { op: 'sacrifice', ids: '$var.landsSacrificed', key: 'shifted' }, { op: 'call', handler: 'recursion.scapeshift-search' }] } });
  registry.registerHandler('recursion.scapeshift-search', (g, ctx) => [search({ land: true }, 'battlefield', { key: 'scapeshiftSearch', max: (ctx.vars.shifted || []).length, tapped: true })]);
  register(registry, "Nahiri's Lithoforming", { spell: { effect: (g, ctx) => [choose('landsSacrificed', `Sacrifice ${ctx.castX} lands (as many as possible)`, { ...BF, land: true }, ctx.castX, ctx.castX),
    { op: 'sacrifice', ids: '$var.landsSacrificed', key: 'lithoLands' }, { op: 'call', handler: 'recursion.litho-draw' },
    { op: 'effect', effect: { kind: 'extraLands', amount: ctx.castX, controller: ctx.controller, expires: 'endOfTurn' } },
    { op: 'effect', effect: { kind: 'landsEnterTapped', controller: ctx.controller, expires: 'endOfTurn' } }] } });
  registry.registerHandler('recursion.litho-draw', (g, ctx) => [draw((ctx.vars.lithoLands || []).length)]);
  register(registry, 'Pitiless Carnage', { plot: '{1}{B}{B}', spell: { effect: () => [choose('carnage', 'Sacrifice any number of permanents', BF, 0, 10000),
    { op: 'sacrifice', ids: '$var.carnage', key: 'carnageSacrificed' }, { op: 'call', handler: 'recursion.carnage-draw' }] } });
  registry.registerHandler('recursion.carnage-draw', (g, ctx) => [draw((ctx.vars.carnageSacrificed || []).length)]);
}
