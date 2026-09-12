import { clone,ref,sameRef,asArray } from '../core/util.js';
import { register,BF,GY,HAND,LIB,target,playerTarget,sacrifice,selfSacrifice,draw,choose,move,search,etb,spellCast } from './helpers.js';
import { call,lands,putLands,addLandPlays,anyTarget,damageTo,gyPermission,maximalMV } from './expanded-shared.js';

export function installExpandedTutors(registry){
 register(registry,'Fabricate',{spell:{effect:()=>[search({artifact:true})]}});
 for(const [name,selector]of [['Trinket Mage',{manaValue:{lte:1}}],['Tribute Mage',{manaValue:2}],['Transit Mage',{anyOf:[{manaValue:4},{manaValue:5}]}]])register(registry,name,{triggers:[etb('search','You may search for the specified artifact',()=>[search({artifact:true,...selector})])]});
 register(registry,'Crop Rotation',{spell:{costs:[sacrifice({...BF,land:true})],effect:()=>[search({land:true},'battlefield')]}});
 register(registry,'Reshape',{spell:{costs:[sacrifice({...BF,artifact:true})],effect:(g,c)=>[search({artifact:true,manaValue:{lte:c.inputs.x||0}},'battlefield')]}});
 register(registry,'Whir of Invention',{improvise:true,spell:{effect:(g,c)=>[search({artifact:true,manaValue:{lte:c.inputs.x||0}},'battlefield')]}});
 register(registry,'Reshape the Earth',{spell:{effect:()=>[search({land:true},'battlefield',{max:10,tapped:true})]}});
 register(registry,'Splendid Reclamation',{spell:{effect:()=>[{op:'move',selector:{...GY,land:true},to:'battlefield',tapped:true}]}});
 register(registry,'Life from the Loam',{dredge:3,spell:{inputs:[target({...GY,land:true},'target',0,3)],effect:()=>[move('$input.target','hand')]}});
 register(registry,'Pull Through the Weft',{spell:{inputs:[target({...GY,nonlandPermanent:true},'nonlands',0,2,'Choose up to two nonland permanent cards'),target({...GY,land:true},'lands',0,2,'Choose up to two land cards')],effect:()=>[move('$input.nonlands','hand'),move('$input.lands','battlefield',{tapped:true})]}});
 register(registry,'Explore',{spell:{effect:()=>[addLandPlays(1),draw()]}});
 register(registry,'Summer Bloom',{spell:{effect:()=>[addLandPlays(3)]}});
 register(registry,'Growth Spiral',{spell:{effect:()=>[draw(),...putLands()]}});
 register(registry,'Deadly Dispute',{spell:{costs:[sacrifice({...BF,type:['Creature','Artifact']})],effect:()=>[draw(2),{op:'token',card:'Treasure'}]}});
 register(registry,'Reprocess',{spell:{effect:()=>[choose('sacrificed','Sacrifice any number of artifacts, creatures, and lands',{...BF,type:['Artifact','Creature','Land']},0,100000),call('sacrifice-count'),call('after-sac-draw')]}});
 register(registry,"Worldsoul's Rage",{spell:{inputs:[anyTarget()],effect:(g,c)=>[damageTo(c.inputs.x||0),...putLands(c.inputs.x||0,{graveyard:true,tapped:true})]}});
 register(registry,'Genesis Wave',{spell:{effect:(g,c)=>[{op:'look',count:c.inputs.x||0,key:'wave',reveal:true},call('wave-select')]}});
 registry.registerHandler('expanded.wave-select',(g,c)=>[{op:'choose',key:'waveKeep',label:'Choose permanent cards with mana value X or less',ids:c.vars.wave,selector:{permanent:true,manaValue:{lte:c.inputs.x||0}},min:0,max:c.vars.wave.length},move('$var.waveKeep','battlefield'),call('wave-rest')]);
 registry.registerHandler('expanded.wave-rest',(g,c)=>[move(c.vars.wave.filter(id=>!c.vars.waveKeep.includes(id)),'graveyard')]);
 register(registry,'Scrap Mastery',{spell:{effect:()=>[call('mastery-exile'),{op:'sacrifice',selector:{zones:['battlefield'],artifact:true}},call('mastery-return')]}});
 registry.registerHandler('expanded.mastery-exile',(g,c)=>{const cards=g.select({zones:['graveyard'],artifact:true});const changes=g.moveBatch(cards.map(id=>({id,to:'exile',cause:'scrap-mastery'})),c)||[];c.vars.mastery=changes.filter(v=>v.to==='exile').map(v=>v.afterRef);return [];});
 registry.registerHandler('expanded.mastery-return',(g,c)=>[move(c.vars.mastery,'battlefield',{from:'exile',cause:'scrap-mastery-return'})]);
 register(registry,'Intuition',{spell:{inputs:[playerTarget('opponent',true)],effect:()=>[call('intuition-search')]}});
 register(registry,'Gifts Ungiven',{spell:{inputs:[playerTarget('opponent',true)],effect:()=>[{op:'choose',key:'gifts',label:'Search for up to four cards with different names',selector:LIB,min:0,max:4,differentNames:true},call('gifts-pick')]}});
 registry.registerHandler('expanded.intuition-search',(g,c)=>[{op:'choose',key:'intuition',label:'Search for three cards for your opponent to choose from',selector:LIB,min:Math.min(3,g.activeLibrary(c.controller).length),max:3},call('intuition-pick')]);
 registry.registerHandler('expanded.intuition-pick',(g,c)=>{
  g.record('REVEALED',{ids:c.vars.intuition,reason:'Intuition'});
  return [{op:'choose',key:'intuitionChosen',label:`${g.state.players[c.inputs.opponent].name} chooses one card for your hand`,ids:c.vars.intuition,min:1,max:1},move('$var.intuitionChosen','hand'),call('intuition-rest')];
 });
 registry.registerHandler('expanded.intuition-rest',(g,c)=>[move(c.vars.intuition.filter(id=>!c.vars.intuitionChosen.includes(id)),'graveyard'),{op:'shuffle'}]);
 registry.registerHandler('expanded.gifts-pick',(g,c)=>{g.record('REVEALED',{ids:c.vars.gifts,reason:'Gifts Ungiven'});const count=Math.min(2,c.vars.gifts.length);return [{op:'choose',key:'giftsGraveyard',label:`${g.state.players[c.inputs.opponent].name} chooses ${count} for your graveyard`,ids:c.vars.gifts,min:count,max:count},move('$var.giftsGraveyard','graveyard'),call('gifts-rest')];});
 registry.registerHandler('expanded.gifts-rest',(g,c)=>[move(c.vars.gifts.filter(id=>!c.vars.giftsGraveyard.includes(id)),'hand'),{op:'shuffle'}]);
 register(registry,'Transmute Artifact',{spell:{effect:()=>[choose('transmuteSacrifice','Sacrifice an artifact as this spell resolves',{...BF,artifact:true}),call('transmute-sacrifice')]}});
 registry.registerHandler('expanded.transmute-sacrifice',(g,c)=>{
  const object=g.object(c.vars.transmuteSacrifice[0]);if(!object)return [];
  c.vars.transmuteMV=g.characteristics(object).manaValue;const moved=g.moveBatch([{id:ref(object),to:'graveyard',cause:'sacrifice'}],c)||[];
  if(!moved.length)return [];
  return [{op:'choose',key:'transmuteFound',label:'Search for an artifact; pay any mana-value difference on resolution',selector:{...LIB,artifact:true},min:0,max:1},call('transmute-payment')];
 });
 registry.registerHandler('expanded.transmute-payment',(g,c)=>{
  const found=g.object(c.vars.transmuteFound[0]);if(!found)return [{op:'shuffle'}];
  const difference=Math.max(0,g.characteristics(found).manaValue-c.vars.transmuteMV);g.record('REVEALED',{ids:[found.id],reason:'Transmute Artifact'});
  return [...(difference?[{op:'pay',mana:`{${difference}}`,label:`Pay ${difference} to put the found artifact onto the battlefield?`,then:[move(ref(found),'battlefield')],else:[move(ref(found),'graveyard')]}]:[move(ref(found),'battlefield')]),{op:'shuffle'}];
 });
 register(registry,'Thrasios, Triton Hero',{activated:[{id:'scry-reveal',label:'Scry 1, then reveal top: land into play tapped, otherwise draw',cost:'{4}',effect:()=>[{op:'scry',count:1},call('thrasios-top')]}]});
 registry.registerHandler('expanded.thrasios-top',(g,c)=>{
  const top=g.top(c.controller);if(!top)return [draw()];g.record('REVEALED',{ids:[top.id],reason:'Thrasios'});
  return g.characteristics(top).types.includes('Land')?[move(ref(top),'battlefield',{tapped:true})]:[draw()];
 });
 register(registry,'Muzzio, Visionary Architect',{activated:[{id:'look-artifact',label:'Look at top cards up to your highest artifact mana value',cost:'{3}{U}',tap:true,effect:(g,c)=>[{op:'look',count:maximalMV(g,c.controller),key:'muzzio'},call('muzzio-pick')]}]});
 registry.registerHandler('expanded.muzzio-pick',(g,c)=>[{op:'choose',key:'muzzioKeep',label:'Reveal an artifact and put it onto the battlefield',ids:c.vars.muzzio,selector:{artifact:true},min:0,max:1},move('$var.muzzioKeep','battlefield'),call('look-rest-bottom',{look:'muzzio',selected:'muzzioKeep'})]);
 register(registry,'Conduit of Worlds',{permissions:[gyPermission],activated:[{id:'cast-graveyard',label:'You may cast a target graveyard permanent if you have cast no spells this turn',tap:true,sorcery:true,inputs:[target({...GY,nonlandPermanent:true})],effect:()=>[call('conduit-window')]}]});
 registry.registerHandler('expanded.conduit-window',(g,c)=>{
  if(g.state.turnCounts[`spells:${c.controller}`])return [];
  return [{op:'castChoice',ids:c.inputs.target,method:'normal',key:'conduitCast',label:'Cast this permanent, then no more spells this turn?'},{op:'if',test:{eq:['$var.conduitCast',true]},then:[{op:'effect',effect:{kind:'noMoreSpells',expires:'endOfTurn'}}]}];
 });
 register(registry,'Gandalf the White',{flashPermission:(g,s,o)=>{const c=g.characteristics(o);return c.types.includes('Artifact')||c.supertypes.includes('Legendary');},triggerMultiplier:(g,s,e,triggerSource)=>{
  if(!['ENTER','LEAVE','DIED','ZONE_BATCH'].includes(e.type)||triggerSource.controller!==s.controller||triggerSource.zone!=='battlefield')return false;
  if(e.type==='ZONE_BATCH')return e.changes.some(change=>change.from==='battlefield'&&(change.lki.characteristics.types.includes('Artifact')||change.lki.characteristics.supertypes.includes('Legendary')));
  const c=['LEAVE','DIED'].includes(e.type)?e.change.lki.characteristics:e.change.object.characteristics;
  return c.types.includes('Artifact')||c.supertypes.includes('Legendary');
 }});
}
