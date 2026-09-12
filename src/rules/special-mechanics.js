import { clone, ref, sameRef, requireRule } from '../core/util.js';
import { register, BF, GY, HAND, target, tapOthers, draw, choose, move, search, etb, landfall, spellCast, typeEntered, countType, options, xInput, mana } from './helpers.js';
const artifactSpell = (g, s, e) => e.characteristics.types.includes('Artifact');
const station = () => ({ id: 'station', label: 'Station: tap another creature to add its power in charge counters', sorcery: true,
  costs: [tapOthers({ ...BF, creature: true, another: true }, 1, 'stationed')], effect: () => [{ op: 'call', handler: 'special.station' }] });
const threshold = (n, layer, apply) => ({ layer, match: (g, s, o) => sameRef(s, o) && (s.counters.charge || 0) >= n, apply });
const addCreature = (g, s, o, c) => c.types.push('Creature');
const flying = (g, s, o, c) => c.keywords.push('Flying');
const chapter = (n, label, effect, extra = {}) => ({ id: `chapter-${n}`, label, event: 'SAGA_LORE', test: (g, s, e) => sameRef(s, e.object) && e.from < n && e.to >= n, effect, ...extra });
const spellReduction = n => ({ test: (g, s, o) => s.controller === o.owner && g.characteristics(o).types.some(t => ['Artifact', 'Instant', 'Sorcery'].includes(t)), amount: () => n });

export function installSpecialMechanics(registry) {
  register(registry, 'Shorikai, Genesis Engine', { activated: [
    { id: 'draw', label: 'Draw two, discard one, create a Pilot', cost: '{1}', tap: true, effect: () => [draw(2), { op: 'call', handler: 'common.loot' }, { op: 'token', card: 'Pilot' }] },
    { id: 'crew', label: 'Crew 8 (Pilots contribute +2)', costs: [{ ...tapOthers({ ...BF, creature: true, another: true }, 0, 'crewed'), min: 0, max: 100000, crew: true, minTotalPower: 8 }],
      effect: () => [{ op: 'modify', ids: '$source', modification: { addTypes: ['Creature'] } }] },
  ] });
  registry.registerHandler('special.station', (g, ctx) => {
    const crew = ctx.costs.stationed?.[0], latest = crew && g.lastKnownFor(ref(crew), crew);
    return [{ op: 'counter', ids: '$source', type: 'charge', amount: Math.max(0, latest?.characteristics.power || 0) }];
  });
  register(registry, 'The Seriema', { activated: [station()], triggers: [etb('legend', 'Search for a legendary creature', () => [search({ creature: true, legendary: true })])], statics: [
    threshold(7, 4, addCreature), threshold(7, 6, flying),
    { layer: 6, match: (g, s, o, c) => (s.counters.charge || 0) >= 7 && o.zone === 'battlefield' && !sameRef(s, o) && o.controller === s.controller && o.tapped && c.types.includes('Creature') && c.supertypes.includes('Legendary'), apply: (g, s, o, c) => c.keywords.push('Indestructible') },
  ] });
  register(registry, 'Uthros Research Craft', { activated: [station()], statics: [threshold(12, 4, addCreature), threshold(12, 6, flying)],
    characteristics: (g, o, c) => { if (o.zone === 'battlefield' && (o.counters.charge || 0) >= 12) c.power += countType(g, 'Artifact', o.controller); },
    triggers: [spellCast('research', 'Draw a card and add a charge counter', (g, s, e) => (s.counters.charge || 0) >= 3 && artifactSpell(g, s, e), () => [draw(), { op: 'counter', type: 'charge', amount: 1 }])],
  });
  register(registry, 'Rydia, Summoner of Mist', { triggers: [landfall('rummage', 'You may discard a card, then draw', () => [{ op: 'call', handler: 'common.rummage' }])], activated: [{
    id: 'summon', label: 'Return a Saga of mana value X with finality and haste', cost: '{X}', tap: true, sorcery: true,
    inputs: (g, s, ctx) => [xInput, target({ ...GY, subtype: 'Saga', manaValue: ctx.inputs.x ?? 0 })],
    effect: () => [move('$input.target', 'battlefield', { counters: { finality: 1 }, modifications: [{ keywords: ['Haste'], expires: 'endOfTurn' }] })],
  }] });
  register(registry, 'Summon: Bahamut', { saga: 4, triggers: [
    ...[1, 2].map(n => chapter(n, `${n === 1 ? 'I' : 'II'} — Destroy up to one nonland permanent`, () => [{ op: 'destroy', ids: '$input.target' }], { inputs: [target({ land: false, permanent: true }, 'target', 0, 1)] })),
    chapter(3, 'III — Draw two cards', () => [draw(2)]),
    chapter(4, 'IV — Mega Flare', (g, ctx) => {
      const amount = g.controlled(ctx.controller).filter(o => !sameRef(o, ctx.source)).reduce((n, o) => n + g.characteristics(o).manaValue, 0);
      return g.state.players.filter(p => p.id !== ctx.controller).map(p => ({ op: 'damage', player: p.id, amount }));
    }),
  ] });
  register(registry, 'Tezzeret the Seeker', { activated: [
    { id: 'untap', label: '+1: Untap up to two artifacts', loyalty: 1, inputs: [target({ artifact: true }, 'target', 0, 2)], effect: () => [{ op: 'untap', ids: '$input.target' }] },
    { id: 'search', label: '−X: Search for an artifact of mana value X or less', loyalty: (g, s, ctx) => -(ctx.inputs.x || 0), inputs: [xInput], effect: (g, ctx) => [search({ artifact: true, manaValue: { lte: ctx.inputs.x } }, 'battlefield')] },
    { id: 'animate', label: '−5: Your artifacts become 5/5 creatures this turn', loyalty: -5, effect: () => [{ op: 'modify', selector: { ...BF, artifact: true }, modification: { addTypes: ['Creature'], basePower: 5, baseToughness: 5 } }] },
  ] });
  register(registry, 'Tezzeret, Cruel Captain', { triggers: [{ id: 'loyalty', label: 'Put a loyalty counter on Tezzeret', event: 'ENTER', test: typeEntered('Artifact'), effect: () => [{ op: 'counter', type: 'loyalty', amount: 1 }] }], activated: [
    { id: 'untap', label: '0: Untap artifact or creature; counter if both', loyalty: 0, inputs: [target({ type: ['Artifact', 'Creature'] })], effect: () => [{ op: 'untap', ids: '$input.target' }, { op: 'call', handler: 'special.captain-counter' }] },
    { id: 'search', label: '−3: Find an artifact of mana value at most 1', loyalty: -3, effect: () => [search({ artifact: true, manaValue: { lte: 1 } })] },
    { id: 'emblem', label: '−7: Get a permanent combat emblem', loyalty: -7, effect: () => [{ op: 'call', handler: 'special.captain-emblem' }] },
  ] });
  registry.registerHandler('special.captain-counter', (g, ctx) => (ctx.inputs.target || []).filter(id => g.matches(id, { allTypes: ['Artifact', 'Creature'] })).map(id => ({ op: 'counter', ids: [id], amount: 1 })));
  registry.registerHandler('special.captain-emblem', (g, ctx) => {
    g.state.emblems.push({ id: `emblem-${g.state.nextId++}`, controller: ctx.controller, trigger: 'combat', sourceCardId: ctx.sourceCardId, abilityId: 'captain-emblem',
      label: 'Tezzeret emblem — three counters on an artifact', inputs: [target({ ...BF, artifact: true })], program: [{ op: 'counter', ids: '$input.target', amount: 3 }, { op: 'call', handler: 'special.emblem-animate' }] });
    g.record('EMBLEM_CREATED', { controller: ctx.controller, sourceCardId: ctx.sourceCardId }); return [];
  });
  registry.registerHandler('special.emblem-animate', (g, ctx) => (ctx.inputs.target || []).filter(id => !g.characteristics(id).types.includes('Creature')).map(id => ({
    op: 'modify', ids: [id], permanent: true, modification: { addTypes: ['Creature'], addSubtypes: ['Robot'], basePower: 0, baseToughness: 0 },
  })));
  register(registry, 'The Mightstone and Weakstone', { triggers: [etb('choice', 'Draw two, or give a creature −5/−5', (g, ctx) => ctx.inputs.mode === 'draw' ? [draw(2)] : [{ op: 'modify', ids: '$input.target', modification: { power: -5, toughness: -5 } }], {
    inputs: (g, s, ctx) => [{ key: 'mode', type: 'option', label: 'Choose the enters ability mode', options: options(['draw', 'weaken']) }, ...(ctx.inputs.mode === 'weaken' ? [target({ creature: true })] : [])],
  })], activated: [mana({ C: 2 }, { effect: () => [{ op: 'mana', production: { C: 2 }, restriction: 'notNonartifactSpell' }] })] });
  register(registry, 'Urza, Lord Protector', { costModifiers: [spellReduction(1)], activated: [{ id: 'meld', label: 'Meld with The Mightstone and Weakstone', cost: '{7}', sorcery: true, effect: () => [{ op: 'call', handler: 'special.meld' }] }] });
  registry.registerHandler('special.meld', (g, ctx) => {
    const source = g.object(ctx.source), stone = g.controlled(ctx.controller).find(o => o.owner === ctx.controller && g.definition(o).name === 'The Mightstone and Weakstone');
    if (!source || source.zone !== 'battlefield' || source.owner !== ctx.controller || source.controller !== ctx.controller || g.definition(source).name !== 'Urza, Lord Protector' || !stone) return [];
    return [move([ref(source), ref(stone)], 'exile', { key: 'meldExiled', cause: 'meld-exile' }), { op: 'call', handler: 'special.meld-enter' }];
  });
  registry.registerHandler('special.meld-enter', (g, ctx) => {
    const parts = (ctx.vars.meldExiled || []).map(c => g.object(c.afterRef)).filter(o => o?.zone === 'exile');
    const urza = parts.find(o => registry.get(o.cardId).name === 'Urza, Lord Protector'), stone = parts.find(o => registry.get(o.cardId).name === 'The Mightstone and Weakstone');
    if (parts.length !== 2 || (ctx.vars.meldExiled || []).some(c => c.lki.token || c.lki.copy) || !urza || !stone) return [];
    const definition = clone(registry.get('Urza, Planeswalker')); definition.rulesId = definition.id;
    return [move([ref(stone)], 'workspace', { flags: { meldedInto: urza.id }, cause: 'meld-component' }),
      move([ref(urza)], 'battlefield', { copy: definition, flags: { meldParts: [urza.id, stone.id] }, cause: 'meld-return' })];
  });
  register(registry, 'Urza, Planeswalker', { loyaltyLimit: 2, activated: [
    { id: 'reduce', label: '+2: Reduce artifact, instant and sorcery costs; gain 2', loyalty: 2, effect: () => [{ op: 'effect', effect: { kind: 'costReduction', amount: 2, types: ['Artifact', 'Instant', 'Sorcery'], expires: 'endOfTurn' } }, { op: 'life', amount: 2 }] },
    { id: 'loot', label: '+1: Draw two, discard one', loyalty: 1, effect: () => [draw(2), { op: 'call', handler: 'common.loot' }] },
    { id: 'soldiers', label: '0: Create two Soldier artifact creature tokens', loyalty: 0, effect: () => [{ op: 'token', card: 'Soldier', count: 2 }] },
    { id: 'exile', label: '−3: Exile a nonland permanent', loyalty: -3, inputs: [target({ land: false, permanent: true })], effect: () => [move('$input.target', 'exile')] },
    { id: 'ultimate', label: '−10: Protect your artifacts and planeswalkers; destroy all nonlands', loyalty: -10,
      effect: () => [{ op: 'modify', selector: { ...BF, type: ['Artifact', 'Planeswalker'] }, modification: { keywords: ['Indestructible'] } }, { op: 'destroy', selector: { zones: ['battlefield'], land: false } }] },
  ] });
}
