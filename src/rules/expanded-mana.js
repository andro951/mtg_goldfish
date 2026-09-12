import { ref, sameRef, clone } from '../core/util.js';
import { register,BF,GY,HAND,anyColor,colorInput,options,mana,chooseColorMana,draw,move,choose,search,etb,upkeep,endStep,target,selfSacrifice,selfExile,discardCost,sacrifice,tapOthers,playerTarget } from './helpers.js';
import { call,lands,artifacts,maximalMV,deathDraw,artifactDeath,selfLeaves,tokenCopy } from './expanded-shared.js';

export function installExpandedMana(registry){
 const fixed={'Sol Ring':{C:2},'Thran Dynamo':{C:3}};
 for(const [name,production]of Object.entries(fixed))register(registry,name,{activated:[mana(production)]});
 register(registry,'Gilded Lotus',{possibleMana:anyColor,activated:[mana({}, {label:'Add three mana of one color',effectInputs:[colorInput()],effect:(g,c)=>[{op:'mana',color:c.inputs.color,amount:3}]})]});
 for(const [name,production]of Object.entries({'Azorius Signet':{W:1,U:1},'Boros Signet':{R:1,W:1},'Selesnya Signet':{G:1,W:1}}))register(registry,name,{activated:[mana(production,{cost:'{1}'})]});
 const identity=(g,p=0)=>[...new Set(Object.values(g.state.instances).filter(o=>o.commander&&o.owner===p).flatMap(o=>g.registry.get(o.cardId).colorIdentity||[]))];
 for(const name of ['Arcane Signet','Command Tower']){
  registry.module(name).activated=[];
  register(registry,name,{possibleMana:anyColor,activated:[mana({}, {label:'Add a color from your commander’s color identity',available:(g,s)=>identity(g,s.controller).length>0,effectInputs:(g,s)=>[colorInput('color',identity(g,s.controller))],effect:(g,c)=>[{op:'mana',color:c.inputs.color}]})]});
 }
 for(const [name,colors]of Object.entries({'Tundra':['W','U'],'Tropical Island':['G','U'],'Volcanic Island':['U','R']})){
  registry.module(name).activated=[];register(registry,name,{possibleMana:colors,activated:[mana({}, {effectInputs:[colorInput('color',colors)],label:'Add '+colors.join(' or '),effect:(g,c)=>[{op:'mana',color:c.inputs.color}]})]});
 }
 for(const [name,production]of Object.entries({'Boros Garrison':{R:1,W:1},'Orzhov Basilica':{W:1,B:1}})){
  registry.module(name).activated=[];register(registry,name,{entersTapped:true,activated:[mana(production)],triggers:[etb('return-land','Return a land you control',()=>[choose('land','Return a land you control', {...BF,land:true}),move('$var.land','hand')])]});
 }
 for(const name of ['Temple of Enlightenment','Temple of Epiphany','Temple of Mystery'])register(registry,name,{entersTapped:true,triggers:[etb('scry','Scry 1',()=>[{op:'scry',count:1}])]});
 for(const [name,types]of Object.entries({'Misty Rainforest':['Forest','Island'],'Scalding Tarn':['Island','Mountain']})){
  registry.module(name).activated=[];register(registry,name,{activated:[{id:'fetch',label:`Pay 1 life, sacrifice: search for ${types.join(' or ')}`,tap:true,life:1,costs:[selfSacrifice],effect:()=>[search({land:true,subtype:types},'battlefield')]}]});
 }
 const artifactColor=(name,cost='',amount=1)=>register(registry,name,{possibleMana:anyColor,activated:[{id:'mana',label:`Sacrifice: add ${amount===1?'one mana':amount+' mana'} of any color`,tap:name==='Lotus Petal'||name==='Chromatic Star',mana:true,cost,costs:[selfSacrifice],effectInputs:[colorInput()],effect:(g,c)=>[{op:'mana',color:c.inputs.color,amount}]}]});
 artifactColor('Lotus Petal');artifactColor('Chromatic Star','{1}');register(registry,'Chromatic Star',{triggers:[deathDraw()]});
 register(registry,'Terrarion',{entersTapped:true,possibleMana:anyColor,activated:[{id:'mana',label:'Sacrifice: add two mana in any combination of colors',mana:true,cost:'{2}',tap:true,costs:[selfSacrifice],effectInputs:[colorInput('firstColor'),colorInput('secondColor')],effect:(g,c)=>[{op:'mana',color:c.inputs.firstColor},{op:'mana',color:c.inputs.secondColor}]}],triggers:[deathDraw()]});
 register(registry,"Lion's Eye Diamond",{possibleMana:anyColor,activated:[{id:'mana',label:'Discard your hand and sacrifice: add three mana of one color',mana:true,instantOnly:true,costs:(g,s)=>[selfSacrifice,{kind:'discard',key:'discardHand',selector:HAND,count:g.objects('hand',s.controller).length}],effectInputs:[colorInput()],effect:(g,c)=>[{op:'mana',color:c.inputs.color,amount:3}]}]});
 register(registry,'Vessel of Volatility',{possibleMana:['R'],activated:[{id:'mana',label:'Sacrifice: add RRRR',cost:'{1}{R}',mana:true,costs:[selfSacrifice],effect:()=>[{op:'mana',production:{R:4}}]}]});
 register(registry,'Mox Jasper',{possibleMana:anyColor,activated:[mana({}, {available:g=>g.count({...BF,subtype:'Dragon'})>0,effectInputs:[colorInput()],effect:(g,c)=>[{op:'mana',color:c.inputs.color}],label:'Add any color (requires a Dragon)'})]});
 for(const [name,cost,production,sac]of [['Lotus Bloom','',null,true],['Mox Tantalite','',null,false],['Sol Talisman','{1}',{C:2},false]])register(registry,name,{noManaCost:true,suspend:{time:3,cost},activated:[mana(production||{}, {label:production?'Add CC':sac?'Sacrifice: add three mana of one color':'Add one mana of any color',costs:sac?[selfSacrifice]:[],effectInputs:production?[]:[colorInput()],effect:production?()=>[{op:'mana',production}]:(g,c)=>[{op:'mana',color:c.inputs.color,amount:sac?3:1}]})]});
 register(registry,'Zuran Orb',{activated:[{id:'sac-land',label:'Sacrifice a land: gain 2 life',costs:[sacrifice({...BF,land:true})],effect:()=>[{op:'life',amount:2}]}]});
 register(registry,'Claws of Gix',{activated:[{id:'sac-permanent',label:'Sacrifice a permanent: gain 1 life',cost:'{1}',costs:[sacrifice(BF)],effect:()=>[{op:'life',amount:1}]}]});
 register(registry,'Glimmervoid',{possibleMana:anyColor,activated:[mana({}, {effectInputs:[colorInput()],effect:(g,c)=>[{op:'mana',color:c.inputs.color}],label:'Add any color'})],triggers:[{id:'sacrifice',label:'Sacrifice Glimmervoid if you control no artifacts',event:'END_STEP',test:(g,s)=>artifacts(g,s.controller)===0,interveningIf:(g,c)=>artifacts(g,c.controller)===0,effect:()=>[{op:'sacrifice',ids:'$source'}]}]});
 register(registry,"Karn, Legacy Reforged",{cda:(g,o,c)=>{c.power=c.toughness=maximalMV(g,o.controller);},triggers:[upkeep('mana','Add colorless mana for each artifact (retained this turn)',(g,c)=>[{op:'mana',production:{C:artifacts(g,c.controller)},restriction:'notNonartifactSpell',retain:'endOfTurn'}])]});
 register(registry,'Blinkmoth Urn',{triggers:[{id:'first-main',label:'Active player adds colorless for their artifacts',event:'MAIN_BEGAN',test:(g,s,e)=>e.precombat&&!s.tapped,interveningIf:(g,c)=>{const s=g.object(c.source);return !!s&&!s.tapped;},effect:(g,c)=>[{op:'mana',player:c.event.player,production:{C:artifacts(g,c.event.player)}}]}]});
 register(registry,'Gonti\'s Aether Heart',{triggers:[{id:'energy',label:'Get two energy counters',event:'ENTER',test:(g,s,e)=>e.change.object.controller===s.controller&&e.change.object.characteristics.types.includes('Artifact'),effect:()=>[{op:'energy',amount:2}]}],activated:[{id:'extra-turn',label:'Pay eight energy and exile: take an extra turn',energy:8,costs:[selfExile],effect:()=>[{op:'extraTurn'}]}]});
 register(registry,'Omni-Cheese Pizza',{triggers:[etb('draw','Draw a card',()=>[draw()])],activated:[{id:'mana',label:'Sacrifice: add one mana of any color',cost:'{1}',tap:true,mana:true,costs:[selfSacrifice],effectInputs:[colorInput()],effect:(g,c)=>[{op:'mana',color:c.inputs.color}]},{id:'food',label:'Sacrifice Food: gain 3 life',cost:'{2}',tap:true,costs:[selfSacrifice],effect:()=>[{op:'life',amount:3}]}]});
 register(registry,'Nutrient Block',{triggers:[deathDraw()],activated:[{id:'food',label:'Sacrifice Food: gain 3 life',cost:'{2}',tap:true,costs:[selfSacrifice],effect:()=>[{op:'life',amount:3}]}]});
 register(registry,'Ichor Wellspring',{triggers:[etb('draw','Draw a card',()=>[draw()]),deathDraw()]});
 register(registry,'Origin Spellbomb',{activated:[{id:'myr',label:'Sacrifice: create a Myr',cost:'{1}',tap:true,costs:[selfSacrifice],effect:()=>[{op:'token',card:'Myr'}]}],triggers:[{id:'death-draw',label:'You may pay W to draw a card',event:'LEAVE',lookBack:true,test:(g,s,e)=>selfLeaves(g,s,e)&&e.change.to==='graveyard',effect:()=>[{op:'pay',mana:'{W}',then:[draw()]}]}]});
 register(registry,'Conjurer\'s Bauble',{activated:[{id:'recycle',label:'Put up to one target graveyard card on library bottom; draw',tap:true,costs:[selfSacrifice],inputs:[target(GY,'target',0,1)],effect:()=>[{op:'library',ids:'$input.target',position:'bottom'},draw()]}]});
}
