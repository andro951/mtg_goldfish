import { STEPS, COLORS, emptyMana, clone, ref, unique, requireRule, integer } from './util.js';

/** Explicit turn/step progression; convenience buttons never skip rules events. */
export const phaseMethods = {
  advancePhase(action = {}) {
    requireRule(!this.state.stack.length && !this.state.pending && !this.state.resolving, 'Resolve the stack and pending choices before advancing.', 'STACK_NOT_EMPTY');
    if (action.next || !action.step) {
      this.state.advanceTarget = null; this.advanceOneStep(); return;
    }
    const player = integer(action.player ?? this.state.activePlayer, 0, 3), step = action.step;
    requireRule(STEPS.includes(step), 'Unknown step.');
    this.state.advanceTarget = { player, step };
    this.continueAdvance();
  },
  continueAdvance() {
    const target = this.state.advanceTarget; if (!target) return;
    for (let guard = 0; guard < 100; guard++) {
      if (this.state.pending || this.state.resolving || this.state.stack.length || this.state.pendingTriggers.length) return;
      if (this.state.activePlayer === target.player && this.state.step === target.step) { this.state.advanceTarget = null; return; }
      this.advanceOneStep();
    }
    throw new Error('Phase navigation exceeded its safety limit.');
  },
  advanceOneStep() {
    requireRule(!this.state.stack.length, 'The stack must be empty.');
    const previous = this.state.step;
    for (const player of this.state.players) {
      if (Object.values(player.mana).some(Boolean) || player.restrictedMana.length) this.record('MANA_EMPTIED', { player: player.id, mana: clone(player.mana), restricted: clone(player.restrictedMana) });
      player.mana = emptyMana(); player.restrictedMana = [];
    }
    if (previous === 'cleanup') return this.startNextTurn();
    if (['main1', 'main2'].includes(previous)) {
      const nextExtra = this.state.extraCombats.findIndex(c => c.after === previous && c.controller === this.state.activePlayer);
      if (nextExtra >= 0) {
        this.state.currentExtraCombat = this.state.extraCombats.splice(nextExtra, 1)[0];
        this.state.extraCombatActive = true; this.state.combatReturn = previous === 'main1' ? 'beginCombat' : 'end';
        return this.enterStep('beginCombat');
      }
    }
    if (previous === 'endCombat' && this.state.extraCombatActive) {
      const origin = this.state.currentExtraCombat.after;
      const nextExtra = this.state.extraCombats.findIndex(c => c.after === origin && c.controller === this.state.activePlayer);
      if (nextExtra >= 0) {
        this.state.currentExtraCombat = this.state.extraCombats.splice(nextExtra, 1)[0];
        return this.enterStep('beginCombat');
      }
      const destination = this.state.combatReturn || 'main2';
      this.state.extraCombatActive = false; this.state.currentExtraCombat = null; this.state.combatReturn = null;
      return this.enterStep(destination);
    }
    const index = STEPS.indexOf(previous);
    requireRule(index >= 0, 'Keep your hand before advancing.');
    return this.enterStep(STEPS[index + 1]);
  },
  startNextTurn() {
    let next = this.state.activePlayer;
    for (let attempts = 0; attempts < 4; attempts++) { next = (next + 1) % 4; if (!this.state.players[next].lost) break; }
    this.state.activePlayer = next; this.state.priorityHolder = next === 0 ? 0 : 0;
    this.state.turnSerial++; if (next === 0) this.state.turnNumber++;
    this.state.lastTurnBegan ||= [1, 0, 0, 0]; this.state.lastTurnBegan[next] = this.state.turnSerial;
    this.state.controllerTurns ||= [1, 0, 0, 0]; this.state.controllerTurns[next]++;
    if (next === 0) this.state.landPlaysUsed = 0;
    this.state.turnCounts = {}; this.state.triggerCounts = {};
    for (const object of Object.values(this.state.instances)) { object.attacksThisTurn = 0; delete object.flags.attacking; }
    this.state.effects = this.state.effects.filter(e => !(e.expires === 'nextTurn' && e.expiryPlayer === next));
    this.record('TURN_BEGAN', { player: next, turnSerial: this.state.turnSerial });
    this.touch(); this.enterStep('untap');
  },
  enterStep(step) {
    this.state.step = step; this.record('STEP_BEGAN', { step, player: this.state.activePlayer, extraCombat: this.state.extraCombatActive });
    this.processStep(step);
  },
  processStep(step) {
    const player = this.state.activePlayer;
    if (step === 'untap') {
      const ordinary = this.controlled(player).filter(o => !this.module(o).noNaturalUntap).map(o => o.id);
      const otherUntaps = [];
      for (const object of this.objects('battlefield').filter(o => o.controller !== player)) {
        const sources = this.controlled(object.controller);
        if (sources.some(source => { const hook = this.module(source).opponentUntap; return hook && hook(this, source, object); })) otherUntaps.push(object.id);
      }
      this.tapObjects(unique([...ordinary, ...otherUntaps]), false, 'untap-step');
      this.emit('UNTAP_STEP', { player });
    } else if (step === 'upkeep') this.emit('UPKEEP', { player });
    else if (step === 'draw') {
      this.drawCards(1, player); this.emit('DRAW_STEP', { player });
    } else if (step === 'main1') {
      // Lore is a turn-based action at the beginning of the precombat main phase.
      for (const object of this.controlled(player).filter(o => this.module(o).saga)) this.addCounters(ref(object), 'lore', 1, 'precombat-main');
      this.emit('MAIN_BEGAN', { player, precombat: true });
    } else if (step === 'main2') this.emit('MAIN_BEGAN', { player, precombat: false });
    else if (step === 'beginCombat') {
      this.state.attackersDeclared = false;
      for (const object of this.objects('battlefield')) delete object.flags.attacking;
      if (this.state.extraCombatActive && this.state.currentExtraCombat?.untapCreatures) this.tapObjects(this.controlled(player).filter(o => this.characteristics(o).types.includes('Creature')).map(o => o.id), false, 'extra-combat');
      this.emit('COMBAT_BEGAN', { player, extra: this.state.extraCombatActive });
      for (const emblem of this.state.emblems.filter(e => e.trigger === 'combat' && e.controller === player)) this.queueTrigger({ controller: player, source: null, sourceCardId: emblem.sourceCardId, abilityId: emblem.abilityId,
        label: emblem.label, program: clone(emblem.program), context: { controller: player, source: null, sourceCardId: emblem.sourceCardId, vars: {}, inputs: {}, event: { player, step, turnSerial: this.state.turnSerial } } });
    } else if (step === 'end') {
      this.emit('END_STEP', { player });
      const due = this.state.delayed.filter(d => d.when === 'nextEnd' || (d.when === 'yourEnd' && d.controller === player));
      this.state.delayed = this.state.delayed.filter(d => !due.includes(d));
      for (const delayed of due) this.queueTrigger({ controller: delayed.controller, source: delayed.context.source, sourceCardId: delayed.context.sourceCardId,
        abilityId: delayed.id, label: delayed.label, program: delayed.program, context: clone(delayed.context) });
    } else if (step === 'cleanup') {
      this.state.effects = this.state.effects.filter(e => e.expires !== 'endOfTurn');
      for (const object of this.objects('battlefield')) {
        object.damage = 0; delete object.flags.attacking;
        object.modifications = object.modifications.filter(m => m.expires !== 'endOfTurn');
      }
      this.touch();
      if (player === 0 && this.state.zones.hand.length > 7) {
        const excess = this.state.zones.hand.length - 7;
        this.state.pending = { kind: 'cleanupDiscard', label: `Discard ${excess} to maximum hand size`, candidates: [...this.state.zones.hand], min: excess, max: excess };
      } else if (player !== 0) this.state.players[player].abstractHand = Math.min(7, this.state.players[player].abstractHand);
      this.emit('CLEANUP', { player });
    }
  },
  declareAttackers(action) {
    requireRule(this.state.activePlayer === 0 && this.state.step === 'attackers', 'Declare attackers during your declare-attackers step.');
    requireRule(!this.state.attackersDeclared, 'Attackers have already been declared this combat.');
    const entries = (action.attackers || []).map(a => typeof a === 'string' ? { id: a, player: action.player ?? 1 } : a);
    requireRule(unique(entries.map(a => a.id)).length === entries.length, 'A creature cannot be declared twice.');
    for (const attacker of entries) {
      const object = this.object(attacker.id);
      requireRule(object?.zone === 'battlefield' && object.controller === 0 && this.characteristics(object).types.includes('Creature'), 'Choose creatures you control.');
      requireRule(!object.tapped && !this.isSick(object), 'An attacker must be untapped and not have summoning sickness.');
      requireRule(!this.characteristics(object).keywords.includes('Defender'), 'A creature with defender cannot attack.');
      requireRule(attacker.player >= 1 && attacker.player <= 3 && !this.state.players[attacker.player].lost, 'Choose a remaining opponent.');
    }
    this.state.attackersDeclared = true;
    for (const attacker of entries) {
      const object = this.object(attacker.id); object.attacksThisTurn++; object.flags.attacking = { player: attacker.player, combatId: this.state.currentExtraCombat?.id || `normal-${this.state.turnSerial}` };
    }
    this.touch();
    this.tapObjects(entries.filter(a => !this.characteristics(a.id).keywords.includes('Vigilance')).map(a => a.id), true, 'attack');
    for (const attacker of entries) this.emit('ATTACK_DECLARED', { object: ref(this.object(attacker.id)), player: attacker.player, controller: 0 });
    this.record('ATTACKERS_DECLARED', { attackers: entries });
  },
};
