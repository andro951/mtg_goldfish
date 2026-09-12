import { ref, sameRef, asArray, clone, COLORS, unique } from '../core/util.js';

export const BF = { zones: ['battlefield'], controller: 'you' };
export const GY = { zones: ['graveyard'], owner: 'you' };
export const HAND = { zones: ['hand'], owner: 'you' };
export const LIB = { zones: ['libraryActive'], owner: 'you' };
export const PERMANENT_TYPES = ['Artifact', 'Creature', 'Enchantment', 'Land', 'Planeswalker', 'Battle'];
export const anyColor = ['W', 'U', 'B', 'R', 'G'];
export const options = values => values.map(value => ({ value, label: value }));
export const colorInput = (key = 'color', colors = anyColor) => ({ key, type: 'option', label: 'Choose a mana color', options: options(colors) });
export const xInput = { key: 'x', type: 'number', label: 'Choose X', min: 0, max: 10000 };
export const selectInput = (key, label, selector, min = 1, max = min) => ({ key, type: 'select', label, selector, min, max });
export const target = (selector, key = 'target', min = 1, max = min, label = 'Choose target') => ({ key, type: 'select', label, selector: { ...selector, target: true }, target: true, min, max });
export const playerTarget = (key = 'player', opponent = false) => ({ key, type: 'player', label: 'Choose target player', target: true, opponent });
export const sacrifice = (selector = BF, count = 1, key = 'sacrificed') => ({ kind: 'sacrifice', key, selector, count });
export const selfSacrifice = { kind: 'sacrifice', self: true, key: 'sacrificedSelf' };
export const discardCost = (selector = HAND, count = 1, key = 'discarded') => ({ kind: 'discard', key, selector, count });
export const selfExile = { kind: 'exile', self: true, key: 'exiledSelf' };
export const tapOthers = (selector = BF, count = 1, key = 'tapped') => ({ kind: 'tap', key, selector: { ...selector, tapped: false }, count });
export const draw = (count = 1, player) => ({ op: 'draw', count, ...(player != null ? { player } : {}) });
export const move = (ids, to, extra = {}) => ({ op: 'move', ids, to, ...extra });
export const choose = (key, label, selector, min = 1, max = min) => ({ op: 'choose', key, label, selector, min, max });
export const optional = (key, label, then, otherwise = []) => ({ op: 'optional', key, label, then, else: otherwise });
export const search = (selector, to = 'hand', extra = {}) => ({ op: 'search', selector: { ...LIB, ...selector }, to, ...extra });
export const mana = (production, extra = {}) => ({ id: 'mana', label: `Add ${Object.entries(production).map(([c, n]) => c.repeat(n)).join('')}`, tap: true, mana: true, effect: () => [{ op: 'mana', production }], ...extra });
export const countType = (g, type, controller = 0) => g.count({ type, controller });
export const paid = (ctx, key = 'sacrificed') => ctx.costs?.[key] || [];
export const paidMV = (ctx, key = 'sacrificed') => paid(ctx, key).reduce((n, o) => n + o.characteristics.manaValue, 0);
export const sourceObject = (g, ctx) => g.object(ctx.source) || ctx.sourceSnapshot;
export const sourceNow = (g, ctx) => g.object(ctx.source);
export const selected = (ctx, key = 'target') => asArray(ctx.inputs?.[key]);
export const sourceId = ctx => ctx.source;
export const isYou = (source, event) => event.player === source.controller;
export const enteredUnderYou = (g, source, event) => event.change?.object.controller === source.controller;
export const typeEntered = type => (g, source, event) => enteredUnderYou(g, source, event) && event.change.object.characteristics.types.includes(type);
export const selfEntered = (g, source, event) => sameRef(source, event.change?.afterRef);
export const selfDied = (g, source, event) => sameRef(source, event.change?.beforeRef);
export const ownArtifactLeft = (g, source, event) => event.change?.from === 'battlefield' && event.change.lki.controller === source.controller && event.change.lki.characteristics.types.includes('Artifact');
export const landfall = (id, label, effect, extra = {}) => ({ id, label, event: 'ENTER', test: typeEntered('Land'), effect, ...extra });
export const etb = (id, label, effect, extra = {}) => ({ id, label, event: 'ENTER', test: selfEntered, effect, ...extra });
export const upkeep = (id, label, effect, extra = {}) => ({ id, label, event: 'UPKEEP', test: (g, s, e) => isYou(s, e), effect, ...extra });
export const endStep = (id, label, effect, extra = {}) => ({ id, label, event: 'END_STEP', test: (g, s, e) => isYou(s, e), effect, ...extra });
export const spellCast = (id, label, predicate, effect, extra = {}) => ({ id, label, event: 'SPELL_CAST', test: (g, s, e) => e.controller === s.controller && predicate(g, s, e), effect, ...extra });
export const allArtifacts = (g, controller = 0) => g.controlled(controller).filter(o => g.characteristics(o).types.includes('Artifact'));
export const manaValueSum = (g, ids) => asArray(ids).reduce((n, id) => n + (g.characteristics(id)?.manaValue || 0), 0);
export function register(registry, name, module) {
  registry.register(name, { status: 'implemented', notes: 'Rules implemented; acceptance suite determines release status.', ...module });
}

export function installCommonHandlers(registry) {
  registry.registerHandler('common.tap-choice', (g, ctx, cmd) => {
    const ids = cmd.ids || ctx.inputs.target;
    const mode = ctx.vars[cmd.key || 'tapChoice'];
    return mode === 'tap' || mode === 'untap' ? [{ op: mode, ids }] : [];
  });
  registry.registerHandler('common.loot', (g, ctx) => [choose('discard', 'Discard a card', HAND, 1), { op: 'discard', ids: '$var.discard' }]);
  registry.registerHandler('common.rummage', (g, ctx) => [choose('discard', 'You may discard a card', HAND, 0, 1), { op: 'if', test: { nonempty: '$var.discard' }, then: [{ op: 'discard', ids: '$var.discard' }, draw(1)] }]);
  registry.registerHandler('common.draw-color', (g, ctx, cmd) => [{ op: 'mana', color: ctx.vars[cmd.key || 'manaColor'], amount: cmd.amount || 1 }]);
  registry.registerHandler('common.modular', (g, ctx) => [{ op: 'counter', ids: selected(ctx), type: '+1/+1', amount: ctx.event.change.lki.counters['+1/+1'] || 0 }]);
}
export const chooseColorMana = (amount = 1, key = 'manaColor') => [{ op: 'choose', key, label: 'Choose a mana color', options: options(anyColor) }, { op: 'mana', color: `$var.${key}`, amount }];
export const tapChoice = (ids = '$input.target', optionalChoice = true) => [
  { op: 'choose', key: 'tapChoice', label: 'Tap or untap this creature?', options: [...options(['tap', 'untap']), ...(optionalChoice ? [{ value: 'leave', label: 'Leave unchanged' }] : [])] },
  { op: 'call', handler: 'common.tap-choice', ids },
];
