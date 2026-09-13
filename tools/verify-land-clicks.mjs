/** Catalog-wide UI routing audit; no sources or games are modified. */
import fs from 'node:fs';
import assert from 'node:assert/strict';
import { fixture, id, cards } from '../tests/helpers.js';
import { cardActions } from '../src/tabletop/card-actions.js';
import { oneManaOptions } from '../src/core/one-mana.js';
const supports=['Ancient Den','Seat of the Synod','Vault of Whispers','Great Furnace','Tree of Tales','Darksteel Citadel'];
const scenarios=[['native',[]],['lantern',['Chromatic Lantern']],['world-tree',['The World Tree',...supports]],['both-grants',['Chromatic Lantern','The World Tree',...supports]]];
const lands=cards.filter(c=>c.candidate&&c.types.includes('Land'));
const rows=[];
for(const card of lands)for(const [scenario,grants] of scenarios){
 const names=[...new Set([card.name,...grants])];
 const g=fixture({battlefield:names,command:['The Wandering Minstrel']});
 const object=g.object(id(g,card.name)),a=cardActions(g,object),single=oneManaOptions(g,object);
 const distinct=a.displayAbilities.filter(x=>!x.singleManaGroup&&!single.grouped.includes(x.id));
 assert.ok(!distinct.length||a.quickMana===null,`${card.name}: extra action was hidden`);
 for(const option of single.choices){
  const original=g.abilities(object).find(x=>x.id===option.abilityId),program=original.effect(g,g.context(object,{inputs:option.inputs}));
  assert.equal(program.length,1);assert.equal(program[0].op,'mana');
  assert.equal(program[0].production?Object.values(program[0].production).reduce((a,b)=>a+b):program[0].amount??1,1);
 }
 rows.push({name:card.name,scenario,click:a.quickMana?(a.quickMana.singleManaGroup?'combined one-mana picker':'native mana ability'):'inspector',
  oneManaChoices:single.choices.map(x=>({color:x.color,abilityId:x.abilityId,restriction:x.restriction})),
  distinctActions:distinct.map(x=>({id:x.id,enabled:!x.unavailable}))});
}
const report={version:JSON.parse(fs.readFileSync(new URL('../package.json',import.meta.url))).version,status:'passed',catalogLands:lands.length,scenarios:scenarios.map(s=>s[0]),cases:rows.length,rows};
fs.mkdirSync(new URL('../test-results/',import.meta.url),{recursive:true});
fs.writeFileSync(new URL('../test-results/land-click-audit.json',import.meta.url),JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify({status:report.status,catalogLands:report.catalogLands,cases:report.cases}));
