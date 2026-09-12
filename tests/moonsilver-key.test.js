import test from 'node:test';
import assert from 'node:assert/strict';
import { fixture, ability, choose, roundTrip } from './helpers.js';

const mana = { W: 100, U: 100, B: 100, R: 100, G: 100, C: 100 };

test('Moonsilver Key finds KCI but not Radiant Lotus because Lotus targets', () => {
  const g = fixture({
    battlefield: ['Moonsilver Key'],
    libraryActive: ['Krark-Clan Ironworks', 'Radiant Lotus', 'Grim Monolith', 'Clock of Omens'],
  }, { mana });

  ability(g, 'Moonsilver Key', 'key');
  g.act({ type: 'RESOLVE_TOP' });

  const candidates = g.state.pending.candidates.map(ref => g.definition(ref).name);
  assert.deepEqual(candidates, ['Krark-Clan Ironworks', 'Grim Monolith']);
  choose(g, [g.state.pending.candidates[0]]);
  assert.equal(g.state.zones.hand.map(id => g.definition(id).name).includes('Krark-Clan Ironworks'), true);
  roundTrip(g);
});
