import { installExpandedArtifacts } from './expanded-artifacts.js';
import { installExpandedSpecial } from './expanded-special.js';
import { installExpandedTutors } from './expanded-tutors.js';
import { installExpandedLandfall } from './expanded-landfall.js';
import { installExpandedShared } from './expanded-shared.js';
import { installExpandedMana } from './expanded-mana.js';
export function installExpanded(registry){
 installExpandedShared(registry);installExpandedMana(registry);installExpandedLandfall(registry);installExpandedTutors(registry);installExpandedArtifacts(registry);installExpandedSpecial(registry);
}
