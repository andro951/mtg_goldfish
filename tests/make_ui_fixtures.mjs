import fs from 'node:fs';
import { fixture, registry } from './helpers.js';
import { Engine } from '../src/core/index.js';
const out=new URL('../test-results/fixtures/',import.meta.url);fs.mkdirSync(out,{recursive:true});
function save(name,zones,options={}){
 const g=fixture(zones,options);g.state.settings.debug=false;g.state.settings.holdPriority=false;g.state.reserveAccess=true;
 const state=g.state;state.initialDeck.scenario='UI acceptance: '+name;
 fs.writeFileSync(new URL(name+'.json',out),JSON.stringify(new Engine(registry,state).exportSession()));
}
save('mana',{battlefield:['The Wandering Minstrel','Razortide Bridge','Mox Amber','Mox Opal','Ancient Den','Tree of Tales','Mana Vault',"Mishra's Workshop"],hand:['Walking Atlas','The One Ring']});
save('amber-no-legend',{battlefield:['Mox Amber','Mox Opal'],hand:['Walking Atlas']});
save('layers',{battlefield:['Ancient Den','Tree of Tales','Great Furnace','Seat of the Synod'],hand:['Walking Atlas','Razortide Bridge'],graveyard:['Scroll Rack','Mox Amber']},{mana:{C:4}});
save('payments',{battlefield:['The Wandering Minstrel','Mox Amber','Mox Opal','Ancient Den','Razortide Bridge','Mana Vault',"Mishra's Workshop"],hand:['The One Ring','Walking Atlas'],graveyard:['Scroll Rack']});
save('damaged-source',{battlefield:['Krark-Clan Ironworks','Ancient Den'],graveyard:['Mox Amber']});
save('plot',{hand:['Pitiless Carnage'],battlefield:['Ancient Den']},{mana:{B:2,C:1}});

save('inspector-actions',{battlefield:['Krark-Clan Ironworks','Ancient Den','Scene of the Crime','Walking Atlas']},{mana:{C:2}});
save('raft-modes',{battlefield:['Elven Raft-Steerer','Walking Atlas','Azusa, Lost but Seeking',{name:'Krang, Master Mind',owner:1,controller:1}],hand:['Ancient Den','Tree of Tales']});

save('programs',{battlefield:['Urza, Lord High Artificer','Grinding Station','Clock of Omens','Ancient Den'],hand:['Mox Amber','Walking Atlas','Tree of Tales']},{mana:{C:4}});
save('program-repeat',{battlefield:['Grim Monolith']},{mana:{C:10}});
save('player-defaults',{battlefield:['Codex Shredder','Grinding Station','Ancient Den'],hand:['Mox Amber']});
save('grid-entries',{battlefield:['Krark-Clan Ironworks','Mana Vault','Mox Opal'],graveyard:['Scroll Rack','Ancient Den','Mox Amber'],exile:['Tree of Tales','Great Furnace']});
{
 const g=fixture({battlefield:Array.from({length:29},()=>({name:'Grinding Station',tapped:true})),hand:['Mox Amber']},{orderTriggers:true});
 g.state.settings.debug=false;g.state.settings.holdPriority=true;g.state.initialDeck.scenario='UI acceptance: order-many';g.initialState=structuredClone(g.state);
 g.act({type:'CAST_SPELL',id:Object.values(g.state.instances).find(o=>o.zone==='hand').id,payment:'auto'});g.act({type:'RESOLVE_TOP'});
 fs.writeFileSync(new URL('order-many.json',out),JSON.stringify(g.exportSession()));
}
{
 const g=fixture({battlefield:['Urza, Lord High Artificer',{name:'Grinding Station',tapped:true},'Fateful Discovery'],hand:['Mox Amber']},{orderTriggers:true});
 g.state.settings.debug=false;g.state.settings.holdPriority=true;g.state.initialDeck.scenario='UI acceptance: priority-stack';g.initialState=structuredClone(g.state);
 g.act({type:'CAST_SPELL',id:Object.values(g.state.instances).find(o=>o.zone==='hand').id,payment:'auto'});g.act({type:'RESOLVE_TOP'});
 const options=g.state.pending.triggers;const order=[...options].sort((a,b)=>Number(b.abilityId==='untap')-Number(a.abilityId==='untap')).map(t=>t.id);
 g.act({type:'CHOOSE',value:order});
 fs.writeFileSync(new URL('priority-stack.json',out),JSON.stringify(g.exportSession()));
}
save('raft-hooks',{battlefield:['Urza, Lord High Artificer','Walking Atlas','Elven Raft-Steerer','Azusa, Lost but Seeking','Traveling Chocobo'],hand:['Ancient Den','Tree of Tales']},{orderTriggers:true});
save('target-many',{battlefield:['Krark-Clan Ironworks',...Array(48).fill('Ancient Den')]});
save('program-stop',{battlefield:['Grim Monolith']},{mana:{C:1000}});
save('multi-cost',{battlefield:['Kuldotha Forgemaster','Ancient Den','Tree of Tales','Great Furnace']});

// Expanded-pool tests use prepared states only through the public session Import UI.
save('expanded-arrows',{battlefield:['Tideforce Elemental','Walking Atlas','Codex Shredder','Ancient Den','Clock of Omens','Buried Ruin'],hand:['Whir of Invention'],graveyard:['Sol Ring']},{mana:{U:8,C:5}});
save('expanded-payment',{battlefield:['The Wandering Minstrel','Arcane Signet','Ancient Den'],hand:['Walking Atlas','Growth Spiral'],command:[]},{mana:{U:8,G:3,R:2}});
save('expanded-suspend',{hand:['Lotus Bloom','Mox Tantalite','Sol Talisman'],battlefield:['Ancient Den']},{mana:{C:1}});
save('expanded-improvise',{battlefield:['Ancient Den','Tree of Tales','Mox Amber'],hand:['Whir of Invention'],libraryActive:['Scrap Trawler','Sol Ring','Tree of Tales']},{mana:{U:3}});
save('expanded-dredge',{hand:[],graveyard:['Life from the Loam'],battlefield:[]});
save('expanded-choices',{hand:['Intuition','Gifts Ungiven','Transmute Artifact'],battlefield:['Sol Ring'],libraryActive:['Ancient Den','Walking Atlas','Krark-Clan Ironworks','Tree of Tales','Mox Amber']},{mana:{U:10,C:15}});
save('expanded-automatic',{battlefield:["Gonti's Aether Heart",'Aetherworks Marvel','Krark-Clan Ironworks','Ancient Den','Zuran Orb'],hand:['Tree of Tales']});
save('expanded-cascade',{hand:['Apex Devastator'],libraryActive:['Ancient Den','Mox Amber','Tree of Tales','Sol Ring','Great Furnace','Walking Atlas','Vault of Whispers','Grim Monolith']},{mana:{C:8,G:2}});
save('expanded-discover',{battlefield:['Chimil, the Inner Sun'],libraryActive:['Ancient Den','Sol Ring','Tree of Tales']});
save('expanded-combat',{battlefield:['Akiri, Line-Slinger','Ancient Den','Sol Ring'],hand:['Mox Amber']});
save('expanded-warp',{hand:['Eusocial Engineering','Ancient Den']},{mana:{C:1,G:1}});
save('expanded-baulbes',{battlefield:["Mishra's Bauble","Urza's Bauble"],hand:['Sol Ring','Tree of Tales'],libraryActive:['Walking Atlas','Mox Amber','Ancient Den']});
