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
