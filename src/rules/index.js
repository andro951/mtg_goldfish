import { CardRegistry } from '../core/registry.js';
import { installCommonHandlers } from './helpers.js';
import { installLands } from './lands.js';
import { installManaEngines } from './mana-engines.js';
import { installLandfall } from './landfall.js';

export function createRegistry(definitions) {
  const registry = new CardRegistry(definitions);
  installCommonHandlers(registry);
  installLands(registry);
  installManaEngines(registry);
  installLandfall(registry);
  return registry;
}
