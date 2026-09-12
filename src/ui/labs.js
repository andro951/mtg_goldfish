import { Engine, createGameState, makeInstance, ZONES, clone, ref } from '../core/index.js';
export const LABS = [
  {id:'breakfast',name:'Second Breakfast',tag:'Sacrifice · recursion',description:'A prepared KCI table. Float mana, sacrifice your artifacts and lands, order Scrap Trawler triggers, then rebuild with Open the Vaults. This is a scenario, not an opening hand.',
    battlefield:['Krark-Clan Ironworks','Codex Shredder','Scrap Trawler','The Wandering Minstrel','Ancient Den','Great Furnace','Seat of the Synod','Tree of Tales','Mana Vault'],
    hand:["Faith's Reward",'Open the Vaults','The One Ring'],graveyard:['Clock of Omens','Mox Amber','Razortide Bridge'],mana:{W:4,C:4}},
  {id:'landfall',name:'Landfall laboratory',tag:'Batches · replacements',description:'Compare simultaneous land entries, Minstrel replacements, Chocobo trigger multipliers and Gitrog batches. Provisioner defaults to Treasure; its policy can be changed in the inspector.',
    battlefield:['The Wandering Minstrel','Traveling Chocobo','Tireless Provisioner','The Gitrog Monster','Ancient Den','Seat of the Synod'],
    hand:['Simic Growth Chamber','Scapeshift','Cultivator Colossus','Walking Atlas'],graveyard:['Tree of Tales'],mana:{G:6,C:12}},
  {id:'library',name:'The top-deck workshop',tag:'Ordering · permissions',description:'Top, Kitten and Crystal Skull are ready. Reality Chip is attached to Walking Atlas, so both normal-mana and Citadel life-payment paths are available from the top.',
    battlefield:["Sensei's Divining Top",'Displacer Kitten','Crystal Skull, Isu Spyglass',"Bolas's Citadel",'The Reality Chip','Walking Atlas','Scroll Rack'],
    hand:['Ancient Den','Mox Opal'],library:['The One Ring','Seat of the Synod','Codex Shredder','Mox Amber','Great Furnace','Open the Vaults','Mox Amber'],mana:{C:8,U:2},attachChip:true},
  {id:'artifacts',name:'Artifact foundry',tag:'Copies · delayed triggers',description:'Explore delayed Duplicator copies, Ultron animation and Urza’s copy exceptions. The artifacts here are independent physical instances; copy counters and timing remain separate.',
    battlefield:['Esoteric Duplicator','Ultron, Artificial Malevolence','Urza, Prince of Kroog','Krark-Clan Ironworks','Ancient Den','Walking Atlas'],
    hand:['Myr Battlesphere','Clock of Omens','The One Ring'],graveyard:['Mox Amber'],mana:{C:20,U:3,W:3}},
  {id:'special',name:'Planar engineering',tag:'Loyalty · crew · meld',description:'Test planeswalker activations, Shorikai’s Pilot crew and Urza’s meld. New objects reset counters and loyalty permissions; a melded permanent keeps both physical card histories.',
    battlefield:['Tezzeret the Seeker','Tezzeret, Cruel Captain','Urza, Lord Protector','The Mightstone and Weakstone','Shorikai, Genesis Engine','Pilot','Pilot','Pilot','Ancient Den'],
    hand:['The Seriema','Uthros Research Craft'],graveyard:['Summon: Bahamut'],mana:{C:18,W:3,U:3}},
];
export function createLab(registry, pool, name) {
  const lab = LABS.find(l => l.id === name); if (!lab) throw new Error('Unknown laboratory scenario.');
  const state = createGameState(registry, pool, `lab-${name}`, {openingHand:0});
  state.instances = {}; for (const zone of ZONES) state.zones[zone] = [];
  let serial = 1;
  const library = [...(lab.library || ['Walking Atlas','Ancient Den','Mox Amber','Seat of the Synod','Tireless Provisioner','Tree of Tales','The One Ring','Great Furnace']), ...Array(12).fill('Ancient Den')];
  for (const [zone, names] of Object.entries({libraryActive:library, battlefield:lab.battlefield, hand:lab.hand, graveyard:lab.graveyard || []})) for (const name of names) {
    const def = registry.get(name), card = makeInstance(`lab${serial++}`, def.id, zone);
    card.controlledSince = -1;
    if (def.types.includes('Planeswalker') && zone === 'battlefield') card.counters.loyalty = Number(def.loyalty);
    if (registry.module(def.id).saga && zone === 'battlefield') card.counters.lore = 1;
    if (['Pilot'].includes(name)) card.token = true;
    state.instances[card.id] = card; state.zones[zone].push(card.id);
  }
  if (lab.attachChip) {
    const find = name => Object.values(state.instances).find(c => registry.get(c.cardId).name === name);
    find('The Reality Chip').attachedTo = ref(find('Walking Atlas'));
  }
  state.nextId = serial + 1000; state.started = true; state.step = 'main1';
  state.activeLibraryBoundary = library.length;
  state.initialDeck = {...state.initialDeck, scenario:lab.name, scenarioDescription:lab.description, activeOrder:[...state.zones.libraryActive], reserveOrder:[], commanderIds:[], outsideIds:[], fixedLands:library.filter(n=>registry.get(n).types.includes('Land')).length, selectedNonlands:library.filter(n=>!registry.get(n).types.includes('Land')).length};
  Object.assign(state.players[0].mana, lab.mana);
  state.notes.push({text:`Laboratory scenario: ${lab.name}. ${lab.description}`,turn:1,step:'main1',sequence:0});
  return new Engine(registry, state);
}
