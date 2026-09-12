import { ref, sameRef } from '../core/util.js';
import { register, BF, GY, HAND, target, playerTarget, sacrifice, selfSacrifice, discardCost, tapOthers, draw, choose, move, search, etb, landfall, spellCast, selfDied, typeEntered, options } from './helpers.js';

/** Sacrifice, untap, attachment, copy, and token engines share normal selectors. */
export function installArtifactMechanics(registry) {
  register(registry, 'Clock of Omens', { activated: [{ id: 'untap', label: 'Tap two artifacts: untap target artifact',
    inputs: [target({ artifact: true })], costs: [tapOthers({ ...BF, artifact: true }, 2)], effect: () => [{ op: 'untap', ids: '$input.target' }],
  }] });
  register(registry, 'Displacer Kitten', { triggers: [spellCast('blink', 'Exile and return up to one nonland permanent', (g, s, e) => !e.characteristics.types.includes('Creature'),
    () => [move('$input.target', 'exile', { key: 'kittenExiled' }), { op: 'call', handler: 'artifact.kitten-return' }],
    { inputs: [target({ ...BF, land: false, permanent: true }, 'target', 0, 1)] })] });
  registry.registerHandler('artifact.kitten-return', (g, ctx) => [move((ctx.vars.kittenExiled || []).map(c => c.afterRef).filter(r => g.object(r)?.zone === 'exile'), 'battlefield')]);
  register(registry, 'Esoteric Duplicator', { activated: [{ id: 'draw', label: 'Sacrifice this Clue: draw a card', cost: '{2}', costs: [selfSacrifice], effect: () => [draw()] }], triggers: [{
    id: 'duplicate', label: 'Pay 2 for a copy at the next end step', event: 'SACRIFICED', lookBack: true,
    test: (g, s, e) => e.change.lki.controller === s.controller && e.change.lki.characteristics.types.includes('Artifact'),
    effect: () => [{ op: 'pay', mana: '{2}', then: [{ op: 'delayed', when: 'nextEnd', label: 'Esoteric Duplicator — create the sacrificed artifact copy', program: [{ op: 'copyToken', snapshot: '$event.change.lki' }] }] }],
  }] });
  register(registry, 'Ultron, Artificial Malevolence', { triggers: [{ id: 'copy', label: 'Pay 2 to copy the new nontoken artifact', event: 'ENTER',
    test: (g, s, e) => typeEntered('Artifact')(g, s, e) && !sameRef(s, e.change.afterRef) && !e.change.object.token,
    effect: () => [{ op: 'pay', mana: '{2}', then: [{ op: 'call', handler: 'artifact.ultron-copy' }] }],
  }] });
  registry.registerHandler('artifact.ultron-copy', (g, ctx) => {
    const source = g.object(ctx.event.change.afterRef) || ctx.event.change.object;
    return [{ op: 'copyToken', snapshot: g.lastKnown(source), key: 'ultronToken' }, { op: 'call', handler: 'artifact.ultron-animate' }];
  });
  registry.registerHandler('artifact.ultron-animate', (g, ctx) => (ctx.vars.ultronToken || []).filter(id => !g.characteristics(id).types.includes('Creature')).map(id => ({
    op: 'modify', ids: [id], permanent: true, modification: { addTypes: ['Creature'], addSubtypes: ['Robot', 'Villain'], basePower: 2, baseToughness: 2 },
  })));
  register(registry, 'Urza, Prince of Kroog', { statics: [{ layer: 7, match: (g, s, o, c) => o.zone === 'battlefield' && o.controller === s.controller && c.types.includes('Artifact') && c.types.includes('Creature'), apply: (g, s, o, c) => { c.power += 2; c.toughness += 2; } }], activated: [{
    id: 'copy', label: 'Copy an artifact as a 1/1 Soldier', cost: '{6}', inputs: [target({ ...BF, artifact: true })],
    effect: (g, ctx) => [{ op: 'copyToken', source: ctx.inputs.target[0], exceptions: { addTypes: ['Creature'], addSubtypes: ['Soldier'], power: 1, toughness: 1 } }],
  }] });
  register(registry, 'Myr Battlesphere', { triggers: [etb('myr', 'Create four Myr tokens', () => [{ op: 'token', card: 'Myr', count: 4 }]), {
    id: 'attack', label: 'Tap any number of Myr to boost Battlesphere and deal damage', event: 'ATTACK_DECLARED', test: (g, s, e) => sameRef(s, e.object),
    effect: () => [choose('myr', 'You may tap any number of untapped Myr', { ...BF, subtype: 'Myr', tapped: false }, 0, 100000), { op: 'call', handler: 'artifact.battlesphere' }],
  }] });
  registry.registerHandler('artifact.battlesphere', (g, ctx) => {
    const ids = (ctx.vars.myr || []).filter(id => g.object(id)?.zone === 'battlefield' && !g.object(id).tapped), n = ids.length;
    return [{ op: 'tap', ids }, { op: 'modify', ids: '$source', modification: { power: n } }, { op: 'damage', player: ctx.event.player, amount: n }];
  });
  register(registry, 'Myr Turbine', { activated: [
    { id: 'myr', label: 'Create a Myr token', tap: true, effect: () => [{ op: 'token', card: 'Myr' }] },
    { id: 'search', label: 'Tap five Myr: search for a Myr creature', tap: true, costs: [tapOthers({ ...BF, subtype: 'Myr' }, 5)], effect: () => [search({ creature: true, subtype: 'Myr' }, 'battlefield')] },
  ] });
  register(registry, 'Umbral Collar Zealot', { activated: [{ id: 'surveil', label: 'Sacrifice another creature or artifact: surveil 1', costs: [sacrifice({ ...BF, another: true, type: ['Artifact', 'Creature'] })], effect: () => [{ op: 'surveil', count: 1 }] }] });
  register(registry, 'Phantom Train', { activated: [{ id: 'animate', label: 'Sacrifice another artifact or creature: counter and animate', costs: [sacrifice({ ...BF, another: true, type: ['Artifact', 'Creature'] })], effect: () => [{ op: 'counter', type: '+1/+1', amount: 1 }, { op: 'modify', ids: '$source', modification: { addTypes: ['Creature'], addSubtypes: ['Spirit'] } }] }] });
  register(registry, 'Grinding Station', { activated: [{ id: 'mill', label: 'Sacrifice an artifact: target player mills three', tap: true, inputs: [playerTarget()], costs: [sacrifice({ ...BF, artifact: true })], effect: (g, ctx) => [{ op: 'mill', player: ctx.inputs.player, count: 3 }] }], triggers: [{
    id: 'untap', label: 'You may untap Grinding Station', event: 'ENTER', test: (g, s, e) => e.change.object.characteristics.types.includes('Artifact'), optional: true, effect: () => [{ op: 'untap', ids: '$source' }],
  }] });
  register(registry, 'Salvaging Station', { activated: [{ id: 'return', label: 'Return a noncreature artifact with mana value at most 1', tap: true, inputs: [target({ ...GY, artifact: true, creature: false, manaValue: { lte: 1 } })], effect: () => [move('$input.target', 'battlefield')] }], triggers: [{
    id: 'untap', label: 'You may untap Salvaging Station', event: 'DIED', optional: true, effect: () => [{ op: 'untap', ids: '$source' }],
  }] });
  register(registry, 'Scourglass', { activated: [{ id: 'destroy', label: 'Upkeep: destroy all nonartifact, nonland permanents', tap: true, costs: [selfSacrifice], available: (g, s) => g.state.activePlayer === s.controller && g.state.step === 'upkeep', effect: () => [{ op: 'destroy', selector: { zones: ['battlefield'], artifact: false, land: false } }] }] });
  register(registry, 'Spine of Ish Sah', { triggers: [etb('destroy', 'Destroy target permanent', () => [{ op: 'destroy', ids: '$input.target' }], { inputs: [target({ permanent: true })] }), {
    id: 'return', label: 'Return Spine to its owner’s hand', event: 'LEAVE', lookBack: true, test: (g, s, e) => sameRef(s, e.change.beforeRef) && e.change.to === 'graveyard', effect: () => [move('$event.change.afterRef', 'hand')],
  }] });
  register(registry, 'Trade Routes', { activated: [
    { id: 'return', label: 'Return target land you control to hand', cost: '{1}', inputs: [target({ ...BF, land: true })], effect: () => [move('$input.target', 'hand')] },
    { id: 'draw', label: 'Discard a land card: draw', cost: '{1}', costs: [discardCost({ ...HAND, land: true })], effect: () => [draw()] },
  ] });
  register(registry, 'Lightning Greaves', { activated: [{ id: 'equip', label: 'Equip a creature you control', cost: '{0}', sorcery: true, inputs: [target({ ...BF, creature: true })], effect: () => [{ op: 'attach', target: '$input.target' }] }], statics: [{
    layer: 6, match: (g, s, o, c) => sameRef(s.attachedTo, o) && o.zone === 'battlefield' && c.types.includes('Creature'), apply: (g, s, o, c) => c.keywords.push('Haste', 'Shroud'),
  }] });
  register(registry, 'Boar', { triggers: [{ id: 'food', label: 'Create a Food token', event: 'DIED', lookBack: true, test: selfDied, effect: () => [{ op: 'token', card: 'Food' }] }] });
  register(registry, 'Goblin Shaman', { triggers: [{ id: 'treasure', label: 'Create a Treasure token', event: 'ATTACK_DECLARED', test: (g, s, e) => sameRef(s, e.object), effect: () => [{ op: 'token', card: 'Treasure' }] }] });
  register(registry, 'Smaug', { triggers: [{ id: 'treasures', label: 'Create fourteen Treasure tokens', event: 'DIED', lookBack: true, test: selfDied, effect: () => [{ op: 'token', card: 'Treasure', count: 14 }] }] });
  register(registry, 'Smoke Blessing', { triggers: [{ id: 'blessing', label: 'Enchanted creature’s controller takes 1; create Treasure', event: 'DIED', test: (g, s, e) => sameRef(s.attachedTo, e.change.beforeRef),
    effect: (g, ctx) => [{ op: 'damage', player: ctx.event.change.lki.controller, amount: 1 }, { op: 'token', card: 'Treasure' }],
  }] });
}
