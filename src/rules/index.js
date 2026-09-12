import { CardRegistry } from '../core/registry.js';
import { installCommonHandlers } from './helpers.js';
import { installLands } from './lands.js';
import { installManaEngines } from './mana-engines.js';
import { installLandfall } from './landfall.js';

import { installTutorsRecursion } from './tutors-recursion.js';

import { installLibraryEngines } from './library-engines.js';

import { installArtifactMechanics } from './artifact-mechanics.js';

export function createRegistry(definitions) {
  const registry = new CardRegistry(definitions);
  installCommonHandlers(registry);
  installLands(registry);
  installManaEngines(registry);
  installLandfall(registry);
  installTutorsRecursion(registry);
  installLibraryEngines(registry);
  installArtifactMechanics(registry);
  return registry;
}
