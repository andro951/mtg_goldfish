import { ref, sameRef, unique } from '../core/util.js';
import { register, BF, GY, HAND, LIB, anyColor, options, colorInput, target, mana, draw, choose, move, optional, etb, upkeep, endStep, spellCast, landfall, tapChoice, chooseColorMana, countType, selfSacrifice, selected, typeEntered } from './helpers.js';

const gyLands = { id: 'graveyard-lands', label: 'Play a land from your graveyard', zone: 'graveyard', land: true, spell: false, test: (g, s, c) => c.owner === s.controller && g.characteristics(c).types.includes('Land') };
const townCount = (g, controller = 0) => g.count({ ...BF, controller, subtype: 'Town' });
const handLand = (tapped = false, key = 'land') => [choose(key, 'You may put a land from your hand onto the battlefield', { ...HAND, land: true }, 0, 1), move(`$var.${key}`, 'battlefield', { tapped })];

export function installLandfall(registry) {
  register(registry, 'The Wandering Minstrel', { replacements: [{ id: 'lands-enter-untapped', entryTapped: false,
    match: (g, s, o, proposal) => proposal.to === 'battlefield' && (proposal.controller ?? o.owner) === s.controller && g.characteristics(o).types.includes('Land'),
    transform: proposal => { proposal.tapped = false; },
  }], triggers: [{ id: 'ballad', label: 'The Minstrel’s Ballad', event: 'COMBAT_BEGAN', test: (g, s, e) => e.player === s.controller && townCount(g, s.controller) >= 5,
    interveningIf: (g, ctx) => townCount(g, ctx.controller) >= 5, effect: () => [{ op: 'token', card: 'Elemental' }] }],
    activated: [{ id: 'ballad-buff', label: 'Other creatures get +Towns/+Towns', cost: '{3}{W}{U}{B}{R}{G}', effect: (g, ctx) => [{ op: 'modify', selector: { ...BF, creature: true, another: true }, modification: { power: townCount(g, ctx.controller), toughness: townCount(g, ctx.controller) } }] }] });
  register(registry, 'Azusa, Lost but Seeking', { extraLands: 2 });
  register(registry, 'Aesi, Tyrant of Gyre Strait', { extraLands: 1, triggers: [landfall('draw', 'You may draw a card', () => [draw()], { optional: true })] });
  register(registry, 'Tatyova, Benthic Druid', { triggers: [landfall('draw-life', 'Gain 1 life and draw a card', () => [{ op: 'life', amount: 1 }, draw()])] });
  register(registry, 'Crucible of Worlds', { permissions: [gyLands] });
  register(registry, 'Icetill Explorer', { extraLands: 1, permissions: [gyLands], triggers: [landfall('mill', 'Mill a card', () => [{ op: 'mill', count: 1 }])] });
  const doubleEntry = includeBird => (g, multiplier, event, triggerSource) => event.type === 'ENTER' && event.change.object.controller === multiplier.controller && triggerSource.controller === multiplier.controller &&
    (event.change.object.characteristics.types.includes('Land') || (includeBird && event.change.object.characteristics.subtypes.includes('Bird')));
  register(registry, 'Ancient Greenwarden', { permissions: [gyLands], triggerMultiplier: doubleEntry(false) });
  register(registry, 'Traveling Chocobo', { lookTop: true, triggerMultiplier: doubleEntry(true), permissions: [{ id: 'top-bird-land', label: 'Chocobo — play top land or cast top Bird', zone: 'libraryActive', land: true, spell: true,
    test: (g, s, o, land) => sameRef(g.top(s.controller), o) && (land || g.characteristics(o).subtypes.includes('Bird')) }] });
  for (const name of ['Walking Atlas', 'Llanowar Scout', 'Sakura-Tribe Scout', 'Scaled Herbalist']) register(registry, name, { activated: [{ id: 'put-land', label: 'Put a land from hand onto the battlefield', tap: true, effect: () => handLand() }] });
  register(registry, 'PuPu UFO', { activated: [
    { id: 'put-land', label: 'Put a land from hand onto the battlefield', tap: true, effect: () => handLand() },
    { id: 'town-power', label: 'Base power becomes your number of Towns', cost: '{3}', effect: (g, ctx) => [{ op: 'modify', ids: '$source', modification: { basePower: townCount(g, ctx.controller) } }] },
  ] });
  register(registry, 'Seedborn Muse', { opponentUntap: (g, source, object) => source.controller === object.controller });
  register(registry, 'Unwinding Clock', { opponentUntap: (g, source, object) => source.controller === object.controller && g.characteristics(object).types.includes('Artifact') });
  register(registry, 'Lotus Cobra', { triggers: [landfall('mana', 'Add one mana of any color', () => chooseColorMana())] });
  register(registry, 'Tireless Provisioner', { triggers: [landfall('provision', 'Create a Treasure or Food', () => [{ op: 'choose', key: 'tokenKind', label: 'Create Treasure or Food', options: options(['Treasure', 'Food']), policyKey: 'token-kind', defaultValue: 'Treasure' }, { op: 'token', card: '$var.tokenKind' }])] });
  register(registry, 'Roil Cartographer', { triggers: [landfall('energy', 'Get an energy counter', () => [{ op: 'energy', amount: 1 }])], activated: [{ id: 'draw-three', label: 'Pay six energy: draw three cards', tap: true, energy: 6, effect: () => [draw(3)] }] });
  register(registry, 'Fateful Discovery', { triggers: [{ id: 'artifact-draw', label: 'Draw a card', event: 'ENTER', test: typeEntered('Artifact'), effect: () => [draw()] }] });
  register(registry, 'Nissa, Resurgent Animist', { triggers: [landfall('animist', 'Add mana; second resolution reveals an Elf or Elemental', () => [...chooseColorMana(), { op: 'call', handler: 'landfall.nissa' }])] });
  registry.registerHandler('landfall.nissa', (g, ctx) => {
    const key = `nissa-resolution:${ctx.source.id}:${ctx.source.oid}:${g.state.turnSerial}`;
    g.state.turnCounts[key] = (g.state.turnCounts[key] || 0) + 1;
    if (g.state.turnCounts[key] !== 2) return [];
    const library = g.activeLibrary(ctx.controller), found = library.findIndex(id => g.characteristics(id).subtypes.some(t => ['Elf', 'Elemental'].includes(t)));
    const ids = found < 0 ? library : library.slice(0, found + 1), card = found < 0 ? [] : [ids.at(-1)];
    return [{ op: 'record', type: 'REVEALED', detail: { cards: ids, reason: 'Nissa second resolution' } }, move(card, 'hand'), { op: 'library', ids: ids.filter(id => !card.includes(id)), position: 'bottom', random: true }];
  });
  register(registry, 'The Gitrog Monster', { extraLands: 1, triggers: [
    upkeep('upkeep-land', 'Sacrifice a land or The Gitrog Monster', () => [choose('gitrogLand', 'Sacrifice a land, or decline to sacrifice The Gitrog Monster', { ...BF, land: true }, 0, 1), { op: 'if', test: { nonempty: '$var.gitrogLand' }, then: [{ op: 'sacrifice', ids: '$var.gitrogLand' }], else: [{ op: 'sacrifice', ids: '$source' }] }]),
    { id: 'land-graveyard', label: 'One or more land cards entered your graveyard: draw', event: 'ZONE_BATCH', oncePerBatch: true,
      test: (g, s, e) => e.changes.some(c => c.to === 'graveyard' && c.lki.owner === s.controller && !c.lki.token && c.lki.characteristics.types.includes('Land')), effect: () => [draw()] },
  ] });
  register(registry, 'Retreat to Coralhelm', { triggers: [landfall('retreat', 'Tap/untap a creature or scry', (g, ctx) => ctx.inputs.mode === 'scry' ? [{ op: 'scry', count: 1 }] : tapChoice(), {
    modePreference: { key: 'mode', label: 'Landfall mode', options: [{ value: 'creature', label: 'Creature' }, { value: 'scry', label: 'Scry' }] },
    inputs: (g, s, ctx) => [{ key: 'mode', type: 'option', label: 'Choose Retreat’s mode', options: [...(g.count({ zones: ['battlefield'], creature: true, target: true }, ctx) ? [{ value: 'creature', label: 'You may tap or untap target creature' }] : []), { value: 'scry', label: 'Scry 1' }] },
      ...(ctx.inputs.mode === 'creature' ? [target({ zones: ['battlefield'], creature: true })] : [])],
  })] });
  const raftModes = (g, ctx) => [
    ...(g.count({ creature: true, controller: 'opponent', target: true }, ctx) ? [{ value: 'tap', label: 'Tap target creature an opponent controls' }] : []),
    ...(g.count({ creature: true, controller: 'you', target: true }, ctx) ? [{ value: 'untap', label: 'Untap target creature you control' }] : []),
  ];
  register(registry, 'Elven Raft-Steerer', { triggers: [landfall('steer', 'Tap an opposing creature or untap your creature', (g, ctx) => [{ op: ctx.inputs.mode, ids: '$input.target' }], {
    modePreference: { key: 'mode', label: 'Landfall mode', options: [{ value: 'tap', label: 'Tap opponent' }, { value: 'untap', label: 'Untap yours' }] },
    inputs: (g, s, ctx) => [{ key: 'mode', type: 'option', label: 'Choose Raft-Steerer’s mode', options: raftModes(g, ctx) },
      ...(ctx.inputs.mode ? [target({ zones: ['battlefield'], creature: true, controller: ctx.inputs.mode === 'tap' ? 'opponent' : 'you' })] : [])],
  })] });
  register(registry, 'Tideforce Elemental', { activated: [{ id: 'tideforce', label: 'Tap or untap another creature', cost: '{U}', tap: true, inputs: [target({ zones: ['battlefield'], creature: true, another: true })], effect: () => tapChoice() }],
    triggers: [landfall('untap', 'You may untap Tideforce Elemental', () => [{ op: 'untap', ids: '$source' }], { optional: true })] });
  register(registry, 'Scaretiller', { triggers: [{ id: 'tiller', label: 'Put a land from hand or return a land from graveyard', event: 'BECAME_TAPPED', test: (g, s, e) => sameRef(s, e.object),
    modePreference: { key: 'mode', label: 'Tapped trigger mode', options: [{ value: 'hand', label: 'Hand land' }, { value: 'graveyard', label: 'Graveyard land' }] },
    inputs: (g, s, ctx) => [{ key: 'mode', type: 'option', label: 'Choose Scaretiller’s mode', options: [{ value: 'hand', label: 'You may put a land from hand onto the battlefield tapped' }, ...(g.count({ ...GY, land: true, target: true }, ctx) ? [{ value: 'graveyard', label: 'Return target land from your graveyard tapped' }] : [])] },
      ...(ctx.inputs.mode === 'graveyard' ? [target({ ...GY, land: true })] : [])],
    effect: (g, ctx) => ctx.inputs.mode === 'graveyard' ? [move('$input.target', 'battlefield', { tapped: true })] : handLand(true),
  }] });
  register(registry, 'Cultivator Colossus', { cda: (g, o, c) => { c.power = countType(g, 'Land', o.controller); c.toughness = c.power; }, triggers: [etb('colossus', 'Put a land, draw, and repeat', () => [{ op: 'call', handler: 'landfall.colossus' }], { optional: true })] });
  registry.registerHandler('landfall.colossus', (g, ctx) => {
    if (!g.select({ ...HAND, land: true }, ctx).length || g.state.optionalPreferences[`${ctx.sourceCardId}/colossus`] === 'NO') return [];
    return [choose('colossusLand', 'Put a land onto the battlefield tapped; choose none to finish', { ...HAND, land: true }, 0, 1),
      { op: 'if', test: { nonempty: '$var.colossusLand' }, then: [move('$var.colossusLand', 'battlefield', { tapped: true }), draw(), { op: 'call', handler: 'landfall.colossus' }] }];
  });
  register(registry, 'Manabond', { triggers: [endStep('manabond', 'Put all lands in hand onto the battlefield; discard the rest', (g, ctx) => [{ op: 'record', type: 'HAND_REVEALED', detail: { cards: [...g.state.zones.hand] } },
    { op: 'move', selector: { ...HAND, land: true }, to: 'battlefield' }, { op: 'discard', selector: HAND }], { optional: true })] });
  register(registry, 'Kodama of the East Tree', { triggers: [{ id: 'kodama', label: 'Put a permanent of equal or lesser mana value from hand', event: 'ENTER', optional: true,
    test: (g, s, e) => e.change.object.controller === s.controller && !sameRef(s, e.change.afterRef) && e.change.object.flags.kodamaAbility !== `${s.id}:${s.oid}`,
    interveningIf: (g, ctx) => ctx.event.change.object.flags.kodamaAbility !== `${ctx.source.id}:${ctx.source.oid}`,
    effect: (g, ctx) => [choose('kodamaPermanent', 'You may put a permanent card from hand onto the battlefield', { ...HAND, permanent: true, manaValue: { lte: ctx.event.change.object.characteristics.manaValue } }, 0, 1),
      move('$var.kodamaPermanent', 'battlefield', { flags: { kodamaAbility: `${ctx.source.id}:${ctx.source.oid}` } })],
  }] });
  register(registry, 'Moraug, Fury of Akoum', { statics: [{ layer: 7, match: (g, s, o, c) => o.zone === 'battlefield' && o.controller === s.controller && c.types.includes('Creature'), apply: (g, s, o, c) => { c.power += o.attacksThisTurn || 0; } }],
    triggers: [landfall('extra-combat', 'Additional combat after this main phase', (g, ctx) => [{ op: 'extraCombat', after: ctx.event.step, beginTrigger: {
      abilityId: 'extra-combat-untap', label: 'Moraug, Fury of Akoum — untap all creatures you control',
      program: [{ op: 'untap', selector: { ...BF, creature: true, controller: 'you' } }],
    } }], {
      test: (g, s, e) => e.change.object.controller === s.controller && e.change.object.characteristics.types.includes('Land') && g.state.activePlayer === s.controller && ['main1', 'main2'].includes(g.state.step),
      interveningIf: (g, ctx) => g.state.activePlayer === ctx.controller && ['main1', 'main2'].includes(g.state.step),
    })] });
  register(registry, 'Chulane, Teller of Tales', { triggers: [spellCast('chulane', 'Draw, then you may put a land onto the battlefield', (g, s, e) => e.characteristics.types.includes('Creature'), () => [draw(), ...handLand()])],
    activated: [{ id: 'return-creature', label: 'Return target creature you control', cost: '{3}', tap: true, inputs: [target({ ...BF, creature: true })], effect: () => [move('$input.target', 'hand')] }] });
  register(registry, 'H.E.R.B.I.E. Scout Unit', { triggers: [etb('scout', 'Draw; you may put a land onto the battlefield tapped', () => [draw(), ...handLand(true)])] });
  register(registry, 'Gandalf, Shadow\'s Foe', { triggers: [
    etb('blink-lands', 'Exile up to three lands; return them tapped', () => [{ op: 'call', handler: 'landfall.gandalf-blink' }], { inputs: [target({ ...BF, land: true }, 'target', 0, 3)] }),
    landfall('draw-counter', 'Draw a card; put a +1/+1 counter on Gandalf', () => [draw(), { op: 'counter', ids: '$source', type: '+1/+1', amount: 1 }]),
  ] });
  registry.registerHandler('landfall.gandalf-blink', (g, ctx) => {
    const ids = selected(ctx).filter(id => g.object(id)?.zone === 'battlefield');
    return [move(ids, 'exile', { cause: 'blink' }), move(ids, 'battlefield', { tapped: true, from: 'exile', cause: 'blink-return' })];
  });
  register(registry, 'Panther Robot', { costReduction: (g, o) => countType(g, 'Artifact', o.owner) });
  register(registry, 'Thought Monitor', { costReduction: (g, o) => countType(g, 'Artifact', o.owner), triggers: [etb('draw-two', 'Draw two cards', () => [draw(2)])] });
  register(registry, 'Krang, Master Mind', { costReduction: (g, o) => countType(g, 'Artifact', o.owner),
    characteristics: (g, o, c) => { if (o.zone === 'battlefield') c.power += g.controlled(o.controller).filter(other => other.id !== o.id && g.characteristics(other).types.includes('Artifact')).length; },
    triggers: [etb('refill', 'Draw until you have four cards', g => [draw(Math.max(0, 4 - g.state.zones.hand.length))], { test: (g, s, e) => sameRef(s, e.change.afterRef) && g.state.zones.hand.length < 4,
      interveningIf: g => g.state.zones.hand.length < 4 })] });
  register(registry, 'Krang, Utrom Warlord', { statics: [{ layer: 6, match: (g, s, o, c) => o.zone === 'battlefield' && o.controller === s.controller && o.id !== s.id && c.types.includes('Artifact') && c.types.includes('Creature'),
    apply: (g, s, o, c) => { c.keywords.push('Flying', 'Trample', 'Indestructible', 'Haste'); } }] });
}
