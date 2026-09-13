import {assert,cardTest,board,id,ability,choose,drain,roundTrip,resolve,events} from './expanded-test-support.js';
for(const [name,zone] of [["Mishra's Bauble",'libraryActive'],["Urza's Bauble",'hand']]){
 cardTest(name,'looks privately without a zone change, then draws on the next upkeep even on opponent turn',()=>{
  const g=board({battlefield:[name],hand:['Sol Ring','Tree of Tales'],libraryActive:['Walking Atlas','Mox Amber','Ancient Den']});
  ability(g,name,'look',{player:0});assert.ok(id(g,name,'graveyard'));resolve(g);
  assert.equal(g.state.lookWorkspace.ids.length,1);const seen=g.state.lookWorkspace.ids[0];assert.equal(g.object(seen).zone,zone);assert.equal(g.state.zones.hand.length,2);
  choose(g,'done');assert.equal(g.state.delayed.length,1);const before=[...g.state.zones.hand];g.act({type:'ADVANCE_PHASE',player:1,step:'upkeep'});drain(g);
  assert.equal(g.state.zones.hand.length,before.length+1);assert.equal(g.state.delayed.length,0);assert.equal(g.state.activePlayer,1);roundTrip(g);
 });
 cardTest(name,'still schedules the upkeep draw when chosen zone has no card to view',()=>{
  const g=board({battlefield:[name],hand:[],libraryActive:['Ancient Den']});ability(g,name,'look',{player:1});resolve(g);
  assert.equal(g.state.pending,null);assert.equal(g.state.delayed.length,1);g.act({type:'ADVANCE_PHASE',player:1,step:'upkeep'});drain(g);assert.equal(g.state.zones.hand.length,1);roundTrip(g);
 });
}
