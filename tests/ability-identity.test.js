import test from 'node:test';
import assert from 'node:assert/strict';
import { cards, fixture, id } from './helpers.js';

test('every supported permanent exposes unique activated-ability identifiers', () => {
  // A land's inherited mana ability must not be registered a second time by
  // its specific module: duplicate IDs create ambiguous UI controls and can
  // cause dynamically generated ability tests to hide the duplicate.
  for (const card of cards.filter(c => c.candidate && c.types.some(t =>
    ['Land', 'Artifact', 'Creature', 'Enchantment', 'Planeswalker', 'Battle'].includes(t)))) {
    const game = fixture({ battlefield: [card.name] });
    const abilities = game.abilities(id(game, card.name));
    const names = abilities.map(a => a.id);
    assert.ok(names.every(n => typeof n === 'string' && n.length > 0), card.name + ': every ability needs an ID');
    assert.equal(new Set(names).size, names.length, card.name + ': duplicate activated ability ' + names.join(', '));
  }
});
