/** Attacker picks are a UI draft, not game actions or the table's drag selection.
 * Only DECLARE_ATTACKERS commits them, simultaneously, through the rules engine.
 */
export function attackCombatKey(g) {
  const s=g.state;
  return s.started&&s.activePlayer===0&&s.step==='attackers'&&!s.attackersDeclared
    ? `${s.turnSerial}/${s.currentExtraCombat?.id||'normal'}` : null;
}
export function attackSelectionReady(g) {
  const s=g.state;
  return !!attackCombatKey(g)&&!s.pending&&!s.resolving&&!s.actionDraft&&!s.stack.length&&!s.pendingTriggers.length;
}
export function attackerProblem(g,objectOrId) {
  const o=g.object(objectOrId);
  if(!o||o.zone!=='battlefield'||o.controller!==0)return 'Choose a creature you control on the battlefield.';
  const c=g.characteristics(o);
  if(!c.types.includes('Creature'))return 'Only creatures can attack.';
  if(o.tapped)return 'This creature is tapped and cannot attack.';
  if(g.isSick(o))return 'This creature has summoning sickness and cannot attack.';
  if(c.keywords.includes('Defender'))return 'This creature has defender and cannot attack.';
  if(g.module(o).canAttack&&!g.module(o).canAttack(g,o))return 'This creature’s attack requirement is not met.';
  if(!g.state.players.some(p=>p.id>0&&!p.lost))return 'There are no remaining opponents to attack.';
  return null;
}
export function cleanAttackDraft(g,value) {
  const combat=attackCombatKey(g),cards={};
  if(!combat||value?.combat!==combat)return {combat,cards};
  if(!value.cards||typeof value.cards!=='object'||Array.isArray(value.cards))return {combat,cards};
  for(const [id,pick] of Object.entries(value.cards).slice(0,10000)) {
    const o=g.object(id);
    // Zone changes reuse card IDs, so also validate their object incarnation.
    if(!pick||o?.oid!==pick.oid||attackerProblem(g,o))continue;
    if(!Number.isInteger(pick.player)||pick.player<1||!g.state.players.some(p=>p.id===pick.player&&!p.lost))continue;
    cards[id]={oid:o.oid,player:pick.player,selected:pick.selected===true};
  }
  return {combat,cards};
}
export function selectedAttackers(g,draft) {
  const clean=cleanAttackDraft(g,draft);
  return g.controlled().filter(o=>clean.cards[o.id]?.selected).map(o=>({id:o.id,player:clean.cards[o.id].player}));
}
export function setAttackPick(g,value,id,{selected,player}={}) {
  const draft=cleanAttackDraft(g,value);
  if(!attackSelectionReady(g))return {draft,error:'Finish the stack or pending choice before selecting attackers.'};
  const error=attackerProblem(g,id);if(error)return {draft,error};
  const old=draft.cards[id],opponent=player??old?.player??g.state.players.find(p=>p.id>0&&!p.lost)?.id;
  if(!Number.isInteger(opponent)||opponent<1||!g.state.players.some(p=>p.id===opponent&&!p.lost))return {draft,error:'Choose a remaining opponent.'};
  draft.cards[id]={oid:g.object(id).oid,player:opponent,selected:selected??old?.selected??false};
  return {draft,error:null};
}
export function toggleAttackPick(g,draft,id) {
  const clean=cleanAttackDraft(g,draft);
  return setAttackPick(g,clean,id,{selected:!clean.cards[id]?.selected});
}
