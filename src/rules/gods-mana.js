import {ref,sameRef,asArray,clone,unique,requireRule} from '../core/util.js';
import {BF,GY,HAND,anyColor,colorInput,options,mana,draw,move,choose,search,etb,upkeep,endStep,target,selfSacrifice,selfExile,discardCost,sacrifice,tapOthers,playerTarget} from './helpers.js';
import {registerG as reg,call,token,god,ownCreature,keywords,creatures,enchants,power} from './gods-shared.js';
const identity=(g,p=0)=>unique(Object.values(g.state.instances).filter(o=>o.commander&&o.owner===p).flatMap(o=>g.registry.get(o.cardId).colorIdentity));
const single=(extra={})=>mana({}, {singleMana:{colors:anyColor,key:'color'},effectInputs:[colorInput()],label:'Add one mana of any color',effect:(g,c)=>[{op:'mana',color:c.inputs.color}],...extra});
const quantity=(label,amount,color='color',extra={})=>mana({}, {label,manaColors:(g,s)=>(color==='color'?anyColor:[color]).filter(v=>amount(g,g.context(s,{inputs:{color:v}}))>0),effectInputs:color==='color'?[colorInput()]:[],effect:(g,c)=>[{op:'mana',color:color==='color'?c.inputs.color:color,amount:amount(g,c)}],...extra});
const commandMana=single({singleMana:{colors:(g,s)=>identity(g,s.controller),key:'color'},effectInputs:(g,s)=>[colorInput('color',identity(g,s.controller))]});
export function installGodsMana(r){
 r.grantedAbilities.set('gods-tap-any',single({id:'gods-tap-any'}));
 const grant={ability:'gods-tap-any',match:(g,s,o)=>o.zone==='battlefield'&&o.controller===s.controller&&g.characteristics(o).types.includes('Creature')};
 for(const name of ['Cryptolith Rite','Enduring Vitality','Elven Chorus'])reg(r,name,{grants:[grant]});
 reg(r,'Esika, God of the Tree',{modalBack:true,activated:[single()],grants:[{...grant,match:(g,s,o)=>grant.match(g,s,o)&&!sameRef(s,o)&&g.characteristics(o).supertypes.includes('Legendary')}],statics:[keywords((g,s,o,c)=>ownCreature(g,s,o,c)&&!sameRef(s,o)&&c.supertypes.includes('Legendary'),['Vigilance'])],back:{status:'implemented',keywords:[],triggers:[upkeep('bridge','Reveal a creature or planeswalker and put it into play',()=>[call('bridge')])]}});
 r.registerHandler('gods.bridge',(g,c)=>{
  const library=g.activeLibrary(c.controller),i=library.findIndex(id=>g.characteristics(id).types.some(t=>['Creature','Planeswalker'].includes(t))),ids=library.slice(0,i<0?library.length:i+1);
  g.record('REVEALED',{ids,player:c.controller,reason:'The Prismatic Bridge'});const hit=i>=0?ids.at(-1):null;
  return [...(hit?[move(ref(g.object(hit)),'battlefield')]:[]),{op:'library',ids:hit?ids.slice(0,-1):ids,position:'bottom',random:true}];
 });
 reg(r,'Nyx Lotus',{entersTapped:true,possibleMana:anyColor,activated:[quantity('Add mana equal to devotion to the chosen color',(g,c)=>g.devotion(c.controller,c.inputs.color))]});
 reg(r,'Nykthos, Shrine to Nyx',{possibleMana:['C',...anyColor],replaceActivated:[mana({C:1}),quantity('Add mana equal to devotion to a color',(g,c)=>g.devotion(c.controller,c.inputs.color),'color',{id:'devotion',cost:'{2}'})]});
 reg(r,'Sanctum Weaver',{possibleMana:anyColor,activated:[quantity('Add one color equal to your enchantments',(g,c)=>enchants(g,c.controller).length)]});
 for(const n of ['Bloom Tender','Faeburrow Elder'])reg(r,n,{possibleMana:anyColor,activated:[mana({}, {label:'Add one mana of each color among your permanents',effect:(g,c)=>[{op:'mana',production:Object.fromEntries(g.permanentColors(c.controller).map(v=>[v,1]))}]})]});
 reg(r,'Faeburrow Elder',{statics:[power((g,s,o)=>sameRef(s,o),(g,s)=>g.permanentColors(s.controller).length)]});
 reg(r,"Karametra's Acolyte",{possibleMana:['G'],activated:[quantity('Add green mana equal to devotion to green',(g,c)=>g.devotion(c.controller,'G'),'G')]});
 reg(r,'Timeless Lotus',{entersTapped:true,possibleMana:anyColor,activated:[mana({W:1,U:1,B:1,R:1,G:1})]});
 reg(r,'Altar of the Pantheon',{devotionBonus:1,possibleMana:anyColor,activated:[single({singleMana:null,effect:(g,c)=>[{op:'mana',color:c.inputs.color},call('altar-life')]})]});
 r.registerHandler('gods.altar-life',(g,c)=>g.controlled(c.controller).some(o=>{const d=g.characteristics(o);return d.subtypes.some(t=>['God','Demigod'].includes(t))||d.supertypes.includes('Legendary')&&d.types.includes('Enchantment');})?[{op:'life',amount:1}]:[]);
 reg(r,'Nyxbloom Ancient',{manaMultiplier:3});
 reg(r,'Kruphix, God of Horizons',{...god(['G','U'],7),retainMana:true,noMaximumHandSize:true});
 reg(r,'Fanatic of Rhonas',{possibleMana:['G'],activated:[mana({G:1}),mana({G:4},{id:'ferocious',label:'Ferocious — add GGGG',showWhenUnavailable:'Requires a creature with power 4 or greater',available:(g,s)=>creatures(g,s.controller).some(o=>g.characteristics(o).power>=4)}),{id:'eternalize',zone:'graveyard',cost:'{2}{G}{G}',sorcery:true,costs:[selfExile],label:'Eternalize as a 4/4 black Zombie',effect:(g,c)=>[call('eternalize')]}]});
 r.registerHandler('gods.eternalize',(g,c)=>{
  const copy=g.copiableValues(c.sourceSnapshot,{power:4,toughness:4,colors:['B'],addSubtypes:['Zombie']});copy.manaCost='';copy.manaValue=0;
  return [{op:'token',card:c.sourceCardId,options:{copy}}];
 });
 reg(r,'Ramos, Dragon Engine',{possibleMana:anyColor,activated:[{id:'ramos-mana',label:'Remove five +1/+1 counters: add WWUUBBRRGG',mana:true,oncePerTurn:true,costs:[{kind:'counter',self:true,type:'+1/+1',delta:-5}],effect:()=>[{op:'mana',production:{W:2,U:2,B:2,R:2,G:2}}]}],triggers:[{id:'spell-colors',label:'Add a counter for each color of the spell',event:'SPELL_CAST',test:(g,s,e)=>e.controller===s.controller,effect:(g,c)=>[{op:'counter',ids:c.source,type:'+1/+1',amount:c.event.characteristics.colors.length}]}]});
 const mix=(g,s,c,count)=>{
  const specs=[];let remaining=Math.max(0,count);
  for(const v of anyColor.slice(0,-1)){const key='mana-'+v;specs.push({key,type:'number',label:`Allocate ${v} mana (${remaining} remaining)`,min:0,max:remaining});if(c.inputs[key]==null)return specs;remaining-=c.inputs[key];}
  return specs;
 };
 r.registerHandler('gods.mixed-mana',(g,c,cmd)=>{
  const total=cmd.amount,production={};let remaining=Math.max(0,total);
  for(const v of anyColor.slice(0,-1)){production[v]=Math.min(remaining,c.inputs['mana-'+v]||0);remaining-=production[v];}production.G=remaining;
  return [{op:'mana',production}];
 });
 reg(r,'Selvala, Heart of the Wilds',{possibleMana:anyColor,activated:[{id:'mana',label:'Add mana in any combination equal to greatest creature power',mana:true,tap:true,cost:'{G}',effectInputs:(g,s,c)=>mix(g,s,c,Math.max(0,...creatures(g,s.controller).map(o=>g.characteristics(o).power))),effect:(g,c)=>[call('mixed-mana',{amount:Math.max(0,...creatures(g,c.controller).map(o=>g.characteristics(o).power))})]}],triggers:[{id:'greatest-entry',label:'The creature’s controller may draw for greatest power',event:'ENTER',test:(g,s,e)=>!sameRef(s,e.change.afterRef)&&e.change.object.characteristics.types.includes('Creature'),effect:(g,c)=>[call('selvala-entry')]}]});
 r.registerHandler('gods.selvala-entry',(g,c)=>{
  const enter=g.object(c.event.change.afterRef),snapshot=enter?g.characteristics(enter):c.event.change.object.characteristics;
  return creatures(g).filter(o=>!sameRef(o,c.event.change.afterRef)).every(o=>g.characteristics(o).power<snapshot.power)?[{op:'optional',key:'selvala-draw',label:'The entering creature has greatest power. Its controller draws?',then:[draw(1,c.event.change.object.controller)]}]:[];
 });
 for(const n of ['Archway Commons','Transguild Promenade','Rupture Spire','Gateway Plaza'])reg(r,n,{entersTapped:true,possibleMana:anyColor,replaceActivated:[single()],triggers:[etb('entry-payment','Pay {1} or sacrifice this land',(g,c)=>[{op:'pay',mana:'{1}',else:[{op:'sacrifice',ids:c.source}]}])]});
 for(const [n,types]of [['Public Thoroughfare',['Artifact','Land']],['Command Bridge',null]])reg(r,n,{entersTapped:true,possibleMana:anyColor,replaceActivated:[single()],triggers:[etb('entry-tap','Tap an untapped permanent or sacrifice this land',(g,c)=>[choose('tapEntry','You may tap an untapped '+(types?'artifact or land':'permanent'),{...BF,controller:c.controller,tapped:false,...(types?{type:types}:{})},0,1),{op:'if',test:{nonempty:'$var.tapEntry'},then:[{op:'tap',ids:'$var.tapEntry'}],else:[{op:'sacrifice',ids:c.source}]}])]});
 reg(r,'City of Brass',{possibleMana:anyColor,replaceActivated:[single()],triggers:[{id:'pain',label:'City of Brass deals 1 damage to you',event:'BECAME_TAPPED',test:(g,s,e)=>sameRef(s,e.object),effect:(g,c)=>[{op:'godsDamage',packet:[{target:c.controller,amount:1}]}]}]});
 for(const [n,nDamage,tapped]of [['Tarnished Citadel',3,false],['Grand Coliseum',1,true]])reg(r,n,{entersTapped:tapped,possibleMana:['C',...anyColor],replaceActivated:[mana({C:1}),single({id:'pain-mana',singleMana:null,label:`Add any color; this land deals ${nDamage} damage to you`,effect:(g,c)=>[{op:'mana',color:c.inputs.color},{op:'godsDamage',packet:[{target:c.controller,amount:nDamage}]}]})]});
 reg(r,'Mana Confluence',{possibleMana:anyColor,replaceActivated:[single({life:1,singleMana:null,label:'Pay 1 life: add one mana of any color'})]});
 reg(r,'Starting Town',{entryTapped:(g,o)=>((g.state.controllerTurns?.[o.owner]||0)>3),possibleMana:['C',...anyColor],replaceActivated:[mana({C:1}),single({id:'life-mana',singleMana:null,life:1,label:'Pay 1 life: add any color'})]});
 for(const n of ['Holdout Settlement',"Survivors' Encampment"])reg(r,n,{possibleMana:['C',...anyColor],replaceActivated:[mana({C:1}),single({id:'crew-mana',singleMana:null,costs:[tapOthers({...BF,creature:true})],label:'Tap an untapped creature: add any color'})]});
 reg(r,'Crystal Quarry',{possibleMana:['C',...anyColor],replaceActivated:[mana({C:1}),mana({W:1,U:1,B:1,R:1,G:1},{id:'filter',cost:'{5}',label:'Pay 5: add WUBRG'})]});
 reg(r,'Cascading Cataracts',{possibleMana:['C',...anyColor],replaceActivated:[mana({C:1}),{id:'filter',label:'Pay 5: add five mana in any combination of colors',mana:true,tap:true,cost:'{5}',effectInputs:(g,s,c)=>mix(g,s,c,5),effect:()=>[call('mixed-mana',{amount:5})]}]});
 reg(r,"Mirrodin's Core",{possibleMana:['C',...anyColor],replaceActivated:[mana({C:1}),{id:'charge',label:'Put a charge counter on this land',tap:true,effect:()=>[{op:'counter',ids:'$source',type:'charge',amount:1}]},single({id:'charge-mana',singleMana:null,costs:[{kind:'counter',self:true,type:'charge',delta:-1}],label:'Remove a charge counter: add any color'})]});
 reg(r,"Serra's Sanctum",{possibleMana:['W'],replaceActivated:[quantity('Add W for each enchantment you control',(g,c)=>enchants(g,c.controller).length,'W')]});
 reg(r,'Abundant Countryside',{possibleMana:['C',...anyColor],replaceActivated:[mana({C:1}),single({id:'creature-mana',singleMana:{colors:anyColor,key:'color',restriction:'creatureSpell'},effect:(g,c)=>[{op:'mana',color:c.inputs.color,restriction:'creatureSpell'}]}),{id:'shapeshifter',cost:'{6}',tap:true,label:'Create a 1/1 Shapeshifter with changeling',effect:()=>[token('Shapeshifter')]}]});
 const legendColors=(g,p)=>unique(g.controlled(p).filter(o=>g.characteristics(o).supertypes.includes('Legendary')).flatMap(o=>g.characteristics(o).colors));
 reg(r,'Plaza of Heroes',{possibleMana:['C',...anyColor],replaceActivated:[mana({C:1}),single({id:'legend-mana',label:'Add any color for a legendary spell',singleMana:{colors:anyColor,key:'color',restriction:'legendarySpell'},effect:(g,c)=>[{op:'mana',color:c.inputs.color,restriction:'legendarySpell'}]}),single({id:'legend-colors',label:'Add a color among your legendary permanents',singleMana:{colors:(g,s)=>legendColors(g,s.controller),key:'color'},available:(g,s)=>legendColors(g,s.controller).length>0,effectInputs:(g,s)=>[colorInput('color',legendColors(g,s.controller))]}),{id:'protect',cost:'{3}',tap:true,costs:[selfExile],label:'Give a legendary creature hexproof and indestructible',inputs:[target({zones:['battlefield'],creature:true,legendary:true})],effect:()=>[{op:'modify',ids:'$input.target',modification:{keywords:['Hexproof','Indestructible']}}]}]});
 reg(r,'Hidden Hideout',{entersTapped:true,possibleMana:anyColor,replaceActivated:[commandMana,{id:'lifelink',cost:'{2}',tap:true,label:'Give lifelink to a creature you control with a counter',inputs:(g,s)=>[target({...BF,creature:true,ids:creatures(g,s.controller).filter(o=>Object.values(o.counters).some(n=>n>0)).map(o=>o.id)})],effect:()=>[{op:'modify',ids:'$input.target',modification:{keywords:['Lifelink']}}]}]});
 reg(r,'Valgavoth\'s Lair',{entersTapped:true,chooseEntryColor:true,possibleMana:anyColor,replaceActivated:[single({singleMana:{colors:(g,s)=>s.flags.chosenColor?[s.flags.chosenColor]:[],key:'color'},effectInputs:(g,s)=>[colorInput('color',s.flags.chosenColor?[s.flags.chosenColor]:[])],available:(g,s)=>!!s.flags.chosenColor})]});
 reg(r,'Path of Ancestry',{entersTapped:true,possibleMana:anyColor,replaceActivated:[single({...commandMana,singleMana:null,ancestry:true,manaColors:(g,s)=>identity(g,s.controller),label:'Add a commander color; scry for a shared creature type',effect:(g,c)=>[{op:'mana',color:c.inputs.color,track:true}]})]});
 reg(r,'Forbidden Orchard',{possibleMana:anyColor,replaceActivated:[single()],triggers:[{id:'spirit',label:'Target opponent creates a 1/1 Spirit',event:'LAND_TAPPED_FOR_MANA',test:(g,s,e)=>sameRef(s,e.object),inputs:[playerTarget('player',true)],effect:(g,c)=>[token('Spirit',{player:c.inputs.player,colors:[],keywords:[],types:['Creature'],subtypes:['Spirit'],power:1,toughness:1})]}]});
 const orchardColors=(g,s)=>g.state.settings.exoticOrchardAllColors!==false?[...anyColor]:g.opposingLandColors(s,new Set([s.id]));
 reg(r,'Exotic Orchard',{possibleMana:anyColor,replaceActivated:[single({orchard:true,singleMana:{colors:orchardColors,key:'color'},label:'Add a color an opponent’s lands could produce',effectInputs:(g,s)=>[colorInput('color',orchardColors(g,s))]})]});
}
