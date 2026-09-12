import { ref, sameRef, clone, asArray } from '../core/util.js';
import { register, BF, GY, HAND, target, playerTarget, sacrifice, selfSacrifice, discardCost, mana, draw, choose, move, optional, etb, upkeep, endStep, landfall, spellCast, typeEntered, countType, paidMV, options } from './helpers.js';

const historic = c => c.types.includes('Artifact') || c.supertypes.includes('Legendary') || c.subtypes.includes('Saga');
const topPermission = (id, label, method = 'normal', test = () => true) => ({ id, label, method, zone: 'libraryActive', land: true, spell: true, test: (g, s, o, land) => sameRef(g.top(s.controller), o) && test(g, s, o, land) });
const artifactEntry = (id, label, effect, extra = {}) => ({ id, label, event: 'ENTER', test: typeEntered('Artifact'), effect, ...extra });
const remainingLook = (g, ctx, key, chosen = []) => (ctx.vars[key] || []).filter(id => !chosen.includes(id) && ['libraryActive', 'libraryReserve'].includes(g.object(id)?.zone));
const loot = () => [draw(), { op: 'call', handler: 'common.loot' }];

export function installLibraryEngines(registry) {
  register(registry, "Bolas's Citadel", { lookTop: true, permissions: [topPermission('citadel', 'Citadel — pay life equal to mana value', 'life')], activated: [{
    id: 'drain', label: 'Sacrifice ten nonlands: opponents lose 10 life', tap: true,
    costs: [sacrifice({ ...BF, land: false, permanent: true }, 10)], effect: (g, ctx) => g.state.players.filter(p => p.id !== ctx.controller && !p.lost).map(p => ({ op: 'life', player: p.id, amount: -10 })),
  }] });
  register(registry, 'Crystal Skull, Isu Spyglass', { lookTop: true, permissions: [topPermission('historic-top', 'Crystal Skull — cast or play historic top card', 'normal', (g, s, o) => historic(g.characteristics(o)))], activated: [mana({ U: 1 })] });
  register(registry, 'The Reality Chip', { lookTop: true, reconfigure: true,
    permissions: [topPermission('chip-top', 'Reality Chip — normal mana cost from top', 'normal', (g, s) => !!g.object(s.attachedTo) && g.characteristics(g.object(s.attachedTo)).types.includes('Creature'))],
    activated: [{ id: 'reconfigure', label: 'Reconfigure: attach or detach', cost: '{2}{U}', sorcery: true,
      inputs: (g, s, ctx) => [{ key: 'mode', type: 'option', label: 'Reconfigure', options: options(s.attachedTo ? ['attach', 'detach'] : ['attach']) }, ...(ctx.inputs.mode === 'attach' ? [target({ ...BF, creature: true, another: true })] : [])],
      effect: (g, ctx) => [{ op: 'attach', target: ctx.inputs.mode === 'detach' ? [] : ctx.inputs.target }],
    }],
  });
  register(registry, "Sensei's Divining Top", { activated: [
    { id: 'look', label: 'Look at and order the top three', cost: '{1}', effect: () => [{ op: 'look', count: 3, key: 'topLook' }, { op: 'call', handler: 'library.top-order' }] },
    { id: 'draw', label: 'Draw, then put Top on your library', tap: true, effect: () => [draw(), { op: 'library', ids: '$source', position: 'top' }] },
  ] });
  registry.registerHandler('library.top-order', (g, ctx) => {
    const ids = remainingLook(g, ctx, 'topLook');
    return [{ op: 'choose', key: 'topOrder', label: 'Order these cards (top first)', ids, min: ids.length, max: ids.length, ordered: true }, { op: 'library', ids: '$var.topOrder', position: 'top' }];
  });
  register(registry, 'Scroll Rack', { activated: [{ id: 'rack', label: 'Exchange hand cards with the top of your library', cost: '{1}', tap: true,
    effect: () => [choose('rackHand', 'Choose any number of cards from your hand', HAND, 0, 10000), { op: 'call', handler: 'library.rack' }],
  }] });
  registry.registerHandler('library.rack', (g, ctx) => {
    const ids = ctx.vars.rackHand || [];
    return [move(ids, 'exile', { flags: { faceDown: true, linkedGroup: ctx.stackId }, key: 'rackExiled', cause: 'scroll-rack' }), { op: 'takeTop', count: ids.length, to: 'hand' }, { op: 'call', handler: 'library.rack-return' }];
  });
  registry.registerHandler('library.rack-return', (g, ctx) => {
    const ids = (ctx.vars.rackExiled || []).map(c => c.afterRef).filter(r => g.object(r)?.zone === 'exile');
    return [{ op: 'choose', key: 'rackOrder', label: 'Return your exiled cards in order (top first)', ids, min: ids.length, max: ids.length, ordered: true }, { op: 'library', ids: '$var.rackOrder', position: 'top' }];
  });
  register(registry, 'Aetherworks Marvel', { triggers: [{ id: 'energy', label: 'Get an energy counter', event: 'LEAVE', lookBack: true,
    test: (g, s, e) => e.change.to === 'graveyard' && e.change.lki.controller === s.controller,
    effect: () => [{ op: 'energy', amount: 1 }],
  }], activated: [{ id: 'marvel', label: 'Pay six energy: look at six; cast one free', tap: true, energy: 6,
    effect: () => [{ op: 'look', count: 6, key: 'marvelLook' }, { op: 'castChoice', ids: '$var.marvelLook', method: 'free', label: 'Cast a nonland card from the six without paying its mana cost' }, { op: 'call', handler: 'library.marvel-bottom' }],
  }] });
  registry.registerHandler('library.marvel-bottom', (g, ctx) => [{ op: 'library', ids: remainingLook(g, ctx, 'marvelLook'), position: 'bottom', random: true }]);
  register(registry, 'The One Ring', { triggers: [
    etb('protection', 'Protection from everything until your next turn', (g, ctx) => [{ op: 'effect', effect: { kind: 'protection', player: ctx.controller, expires: 'nextTurn', expiryPlayer: ctx.controller } }], {
      test: (g, s, e) => sameRef(s, e.change.afterRef) && !!e.change.object.flags.cast,
      interveningIf: (g, ctx) => !!ctx.event.change.object.flags.cast,
    }),
    upkeep('burden-life', 'Lose life equal to burden counters', (g, ctx) => [{ op: 'life', amount: -(g.object(ctx.source)?.counters.burden ?? ctx.sourceSnapshot.counters.burden ?? 0) }]),
  ], activated: [{ id: 'draw', label: 'Add a burden counter, then draw that many', tap: true, effect: () => [{ op: 'counter', ids: '$source', type: 'burden', amount: 1 }, { op: 'call', handler: 'library.ring-draw' }] }] });
  registry.registerHandler('library.ring-draw', (g, ctx) => [draw(g.object(ctx.source)?.counters.burden ?? ctx.sourceSnapshot.counters.burden ?? 0)]);
  register(registry, 'Emry, Lurker of the Loch', { costReduction: (g, o) => countType(g, 'Artifact', o.owner), triggers: [etb('mill', 'Mill four cards', () => [{ op: 'mill', count: 4 }])], activated: [{
    id: 'cast-artifact', label: 'Permit casting target artifact from your graveyard this turn', tap: true, inputs: [target({ ...GY, artifact: true })],
    effect: () => [{ op: 'grantPermission', ids: '$input.target', zone: 'graveyard', expires: 'endOfTurn', land: false, label: 'Emry — cast this artifact this turn' }],
  }] });
  register(registry, 'Six', { permissions: [{ id: 'retrace', label: 'Six — retrace by discarding a land', zone: 'graveyard', spell: true, land: false,
    test: (g, s, o) => g.state.activePlayer === s.controller && o.owner === s.controller && g.matches(o, { permanent: true, land: false }), additionalCosts: [discardCost({ ...HAND, land: true }, 1, 'retraceLand')],
  }], triggers: [{ id: 'attack-mill', label: 'Mill three; you may take a land', event: 'ATTACK_DECLARED', test: (g, s, e) => sameRef(s, e.object),
    effect: () => [{ op: 'mill', count: 3, key: 'sixMilled' }, { op: 'call', handler: 'library.six-land' }],
  }] });
  registry.registerHandler('library.six-land', (g, ctx) => {
    const ids = (ctx.vars.sixMilled || []).map(c => c.afterRef).filter(r => g.object(r)?.zone === 'graveyard' && g.characteristics(g.object(r)).types.includes('Land'));
    return [{ op: 'choose', key: 'sixLand', label: 'You may take one of the milled lands', ids, min: 0, max: 1 }, move('$var.sixLand', 'hand')];
  });
  register(registry, 'Jhoira, Weatherlight Captain', { triggers: [spellCast('historic-draw', 'Draw for a historic spell', (g, s, e) => historic(e.characteristics), () => [draw()])] });
  register(registry, 'Quicksmith Genius', { triggers: [artifactEntry('rummage', 'You may discard a card, then draw', () => [{ op: 'call', handler: 'common.rummage' }], { optional: true })] });
  register(registry, 'Rook Turret', { triggers: [artifactEntry('loot', 'You may draw, then discard', loot, { optional: true, test: (g, s, e) => typeEntered('Artifact')(g, s, e) && !sameRef(s, e.change.afterRef) })] });
  register(registry, 'Transplant Theorist', { triggers: [artifactEntry('loot', 'You may draw, then discard', loot, { optional: true })], activated: [{ id: 'bottom', label: 'Put a card from your graveyard on the bottom', cost: '{2}', inputs: [target(GY)], effect: () => [{ op: 'library', ids: '$input.target', position: 'bottom' }] }] });
  register(registry, 'Sarinth Steelseeker', { triggers: [artifactEntry('look', 'Look at top; take a land or optionally mill it', () => [{ op: 'look', count: 1, key: 'steelseekerLook' }, { op: 'call', handler: 'library.steelseeker' }])] });
  registry.registerHandler('library.steelseeker', (g, ctx) => {
    const ids = remainingLook(g, ctx, 'steelseekerLook');
    if (!ids.length) return [];
    const land = g.characteristics(ids[0]).types.includes('Land');
    return [{ op: 'choose', key: 'steelseekerMode', label: 'Choose what to do with the top card', options: options(land ? ['hand', 'graveyard', 'leave'] : ['graveyard', 'leave']) }, { op: 'call', handler: 'library.steelseeker-finish' }];
  });
  registry.registerHandler('library.steelseeker-finish', (g, ctx) => ['hand', 'graveyard'].includes(ctx.vars.steelseekerMode) ? [move(remainingLook(g, ctx, 'steelseekerLook'), ctx.vars.steelseekerMode, { cause: 'steelseeker', ...(ctx.vars.steelseekerMode === 'hand' ? { reveal: true } : {}) })] : []);
  register(registry, 'Golbez, Crystal Collector', { triggers: [
    artifactEntry('surveil', 'Surveil 1', () => [{ op: 'surveil', count: 1 }]),
    endStep('recover', 'Return a creature; with eight artifacts drain opponents', () => [move('$input.target', 'hand', { key: 'golbezReturned' }), { op: 'call', handler: 'library.golbez-drain' }], {
      test: (g, s, e) => e.player === s.controller && countType(g, 'Artifact', s.controller) >= 4,
      interveningIf: (g, ctx) => countType(g, 'Artifact', ctx.controller) >= 4, inputs: [target({ ...GY, creature: true })],
    }),
  ] });
  registry.registerHandler('library.golbez-drain', (g, ctx) => {
    const card = g.object(ctx.vars.golbezReturned?.[0]?.afterRef);
    if (!card || countType(g, 'Artifact', ctx.controller) < 8) return [];
    const power = Math.max(0, g.characteristics(card).power);
    return g.state.players.filter(p => p.id !== ctx.controller).map(p => ({ op: 'life', player: p.id, amount: -power }));
  });
  register(registry, 'Codex Shredder', { activated: [
    { id: 'mill', label: 'Target player mills one', tap: true, inputs: [playerTarget()], effect: (g, ctx) => [{ op: 'mill', count: 1, player: ctx.inputs.player }] },
    { id: 'recover', label: 'Return target card from your graveyard', cost: '{5}', tap: true, costs: [selfSacrifice], inputs: [target(GY)], effect: () => [move('$input.target', 'hand')] },
  ] });
  register(registry, 'Scrabbling Claws', { activated: [
    { id: 'exile-choice', label: 'Target player exiles a card from their graveyard', tap: true, inputs: [playerTarget()], effect: (g, ctx) => [choose('clawsCard', 'That player chooses a card to exile', { zones: ['graveyard'], owner: ctx.inputs.player }, 1), move('$var.clawsCard', 'exile')] },
    { id: 'exile-draw', label: 'Exile target graveyard card; draw', cost: '{1}', costs: [selfSacrifice], inputs: [target({ zones: ['graveyard'] })], effect: () => [move('$input.target', 'exile'), draw()] },
  ] });
  register(registry, 'Valakut Exploration', { triggers: [
    landfall('exile', 'Exile the top card; you may play it while exiled', () => [{ op: 'takeTop', to: 'exile', key: 'valakutCard' }, { op: 'grantPermission', ids: '$var.valakutCard', zone: 'exile', label: 'Valakut Exploration — play while exiled' }, { op: 'call', handler: 'library.valakut-link' }]),
    endStep('unused', 'Unused exiled cards go to graveyard; damage opponents', (g, ctx) => [{ op: 'call', handler: 'library.valakut-end' }], {
      test: (g, s, e) => e.player === s.controller && (s.flags.valakutExiled || []).some(r => g.object(r)?.zone === 'exile'),
      interveningIf: (g, ctx) => (g.object(ctx.source)?.flags.valakutExiled || ctx.sourceSnapshot.flags.valakutExiled || []).some(r => g.object(r)?.zone === 'exile'),
    }),
  ] });
  registry.registerHandler('library.valakut-link', (g, ctx) => {
    const source = g.object(ctx.source);
    if (source) source.flags.valakutExiled = [...(source.flags.valakutExiled || []), ...(ctx.vars.valakutCard || []).map(id => ref(g.object(id))).filter(Boolean)];
    return [];
  });
  registry.registerHandler('library.valakut-end', (g, ctx) => {
    const source = g.object(ctx.source) || ctx.sourceSnapshot, ids = (source.flags.valakutExiled || []).filter(r => g.object(r)?.zone === 'exile');
    return [move(ids, 'graveyard', { cause: 'valakut-end' }), ...g.state.players.filter(p => p.id !== ctx.controller).map(p => ({ op: 'damage', player: p.id, amount: ids.length }))];
  });
  register(registry, 'Memory Jar', { activated: [{ id: 'jar', label: 'Exile hands; draw seven; restore at next end step', tap: true, costs: [selfSacrifice], effect: () => [{ op: 'call', handler: 'library.jar' }] }] });
  registry.registerHandler('library.jar', (g, ctx) => {
    ctx.vars.jarAbstract = g.state.players.map(p => p.id === 0 ? 0 : p.abstractHand);
    for (const p of g.state.players) if (p.id !== 0) p.abstractHand = 0;
    const ids = g.objects('hand').map(o => ref(o));
    return [move(ids, 'exile', { key: 'jarExiled', flags: { faceDown: true, linkedGroup: ctx.stackId }, cause: 'memory-jar' }),
      ...g.state.players.filter(p => !p.lost).map(p => draw(7, p.id)), { op: 'delayed', when: 'nextEnd', label: 'Memory Jar — discard and restore original hands', program: [{ op: 'call', handler: 'library.jar-restore' }] }];
  });
  registry.registerHandler('library.jar-restore', (g, ctx) => {
    for (const p of g.state.players) if (p.id !== 0) { g.record('ABSTRACT_HAND_DISCARDED', { player: p.id, count: p.abstractHand }); p.abstractHand = ctx.vars.jarAbstract[p.id] || 0; }
    const exiled = (ctx.vars.jarExiled || []).map(c => c.afterRef).filter(r => g.object(r)?.zone === 'exile');
    return [{ op: 'discard', ids: g.objects('hand').map(o => ref(o)) }, move(exiled, 'hand', { cause: 'memory-jar-return' })];
  });
  register(registry, 'Combustible Gearhulk', { triggers: [etb('draw-or-burn', 'Opponent chooses: draw three, or mill and deal damage', () => [{ op: 'choose', key: 'gearhulkChoice', label: 'Target opponent chooses your draw or mill', options: options(['draw', 'mill']) }, { op: 'call', handler: 'library.gearhulk' }], { inputs: [playerTarget('player', true)] })] });
  registry.registerHandler('library.gearhulk', (g, ctx) => ctx.vars.gearhulkChoice === 'draw' ? [draw(3)] : [{ op: 'mill', count: 3, key: 'gearhulkMill' }, { op: 'call', handler: 'library.gearhulk-damage' }]);
  registry.registerHandler('library.gearhulk-damage', (g, ctx) => [{ op: 'damage', player: ctx.inputs.player, amount: (ctx.vars.gearhulkMill || []).reduce((n, c) => n + c.lki.characteristics.manaValue, 0) }]);
  register(registry, 'Smelting Vat', { activated: [{ id: 'smelt', label: 'Sacrifice an artifact; reveal eight and keep up to two', cost: '{1}', tap: true, costs: [sacrifice({ ...BF, artifact: true, another: true })], effect: () => [{ op: 'look', count: 8, reveal: true, key: 'vatLook' }, { op: 'call', handler: 'library.vat' }] }] });
  registry.registerHandler('library.vat', (g, ctx) => [{ op: 'choose', key: 'vatKeep', label: `Choose up to two noncreature artifacts with total mana value at most ${paidMV(ctx)}`, ids: '$var.vatLook', selector: { artifact: true, creature: false }, min: 0, max: 2, sumManaValue: paidMV(ctx) }, move('$var.vatKeep', 'battlefield'), { op: 'call', handler: 'library.vat-bottom' }]);
  registry.registerHandler('library.vat-bottom', (g, ctx) => [{ op: 'library', ids: remainingLook(g, ctx, 'vatLook', ctx.vars.vatKeep || []), position: 'bottom', random: true }]);
}
