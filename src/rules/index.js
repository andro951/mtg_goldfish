import {installGods,GODS_POOL} from './gods.js';
import { installLatest } from './latest.js';
import { ACCEPTED_EXPANSION } from './accepted-expansion.js';
import { installExpanded } from './expanded.js';
import { ACCEPTED_CARDS } from './accepted-cards.js';
import { CardRegistry } from '../core/registry.js';
import { installCommonHandlers } from './helpers.js';
import { installLands } from './lands.js';
import { installManaEngines } from './mana-engines.js';
import { installLandfall } from './landfall.js';

import { installTutorsRecursion } from './tutors-recursion.js';

import { installLibraryEngines } from './library-engines.js';

import { installArtifactMechanics } from './artifact-mechanics.js';

import { installSpecialMechanics } from './special-mechanics.js';

export function createRegistry(definitions) {
  const registry = new CardRegistry(definitions);
  installCommonHandlers(registry);
  installLands(registry);
  installManaEngines(registry);
  installLandfall(registry);
  installTutorsRecursion(registry);
  installLibraryEngines(registry);
  installArtifactMechanics(registry);
  installSpecialMechanics(registry);
  installExpanded(registry);
  installLatest(registry);
  installGods(registry);
  for (const name of [...ACCEPTED_CARDS, ...ACCEPTED_EXPANSION, ...GODS_POOL]) {
    if (registry.has(name) && registry.module(name).status === 'implemented') registry.register(name, { status: 'full', notes: 'Accepted for expanded goldfish scope; see the capability and interaction tests.' });
  }
  return registry;
}
