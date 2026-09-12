import { clone, ref, sameRef, asArray, unique, requireRule, integer } from './util.js';
import { parseManaCost, suggestPayment, spendPayment } from './mana.js';

const pathValue = (root, path) => path.split('.').filter(Boolean).reduce((v, k) => v == null ? undefined : v[k], root);

/** Serializable, resumable effect programs. Card modules compose these operations. */
export const effectMethods = {
  value(value, context) {
    if (typeof value === 'string' && value.startsWith('$')) {
      const path = value.slice(1), root = { source: context.source, controller: context.controller, input: context.inputs, var: context.vars, event: context.event, costs: context.costs, snapshot: context.sourceSnapshot };
      return clone(pathValue(root, path));
    }
    if (Array.isArray(value)) return value.map(v => this.value(v, context));
    if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([key, v]) => [key, this.value(v, context)]));
    return value;
  },
  effectIds(value, context) {
    return unique(asArray(this.value(value, context)).flat().map(v => this.object(v)).filter(Boolean).map(o => o.id));
  },
  effectCondition(test, context) {
    if (typeof test === 'boolean') return test;
    if (!test) return false;
    if (test.nonempty != null) return asArray(this.value(test.nonempty, context)).length > 0;
    if (test.exists != null) return !!this.object(this.value(test.exists, context));
    if (test.eq) return this.value(test.eq[0], context) === this.value(test.eq[1], context);
    if (test.gte) return Number(this.value(test.gte[0], context)) >= Number(this.value(test.gte[1], context));
    if (test.all) return test.all.every(t => this.effectCondition(t, context));
    if (test.any) return test.any.some(t => this.effectCondition(t, context));
    if (test.not) return !this.effectCondition(test.not, context);
    return false;
  },
  insertEffects(commands) {
    const frame = this.state.resolving;
    if (frame && commands?.length) frame.commands.splice(frame.pc, 0, ...clone(commands));
  },
  runEffects() {
    for (let guard = 0; guard < 10000; guard++) {
      const frame = this.state.resolving;
      if (!frame || this.state.pending || this.state.actionDraft) return;
      if (frame.pc >= frame.commands.length) {
        this.record('RESOLUTION_FINISHED', { stackId: frame.object.id, label: frame.object.label, cardId:frame.object.sourceCardId, abilityId:frame.object.abilityId||null, source:frame.object.source });
        this.state.resolving = null; this.state.lookWorkspace = null;
        if (this.state.effectPaymentParent) {
          const parent = this.state.effectPaymentParent; this.state.effectPaymentParent = null;
          this.state.resolving = parent.frame; this.state.pending = parent.pending;
        }
        if (this.state.paymentParent && !this.state.pending) {
          const parent = this.state.paymentParent; this.state.paymentParent = null;
          this.state.actionDraft = parent.draft; this.state.pending = parent.pending;
          this.state.pending.suggested = suggestPayment(parent.pending.cost, this.state.players[0], parent.pending.context);
        }
        return;
      }
      const command = frame.commands[frame.pc++];
      requireRule(command && typeof command.op === 'string', 'Invalid effect instruction.');
      this.executeEffect(command, frame.context);
      this.touch();
    }
    throw new Error('Effect safety limit reached. The transaction has been preserved for undo.');
  },
  executeEffect(command, context) {
    const cmd = this.value(command, context), player = cmd.player ?? context.controller ?? 0;
    switch (command.op) {
      case 'call': {
        const handler = this.registry.handlers.get(command.handler); requireRule(handler, `Missing effect handler ${command.handler}.`);
        const result = handler(this, context, cmd);
        if (result) this.insertEffects(asArray(result)); return;
      }
      case 'set': context.vars[command.key] = clone(cmd.value); return;
      case 'if': this.insertEffects(this.effectCondition(command.test, context) ? command.then : command.else); return;
      case 'record': this.record(cmd.type || 'EFFECT_NOTE', cmd.detail || {}); return;
      case 'optional': {
        const key = `${context.sourceCardId}/${command.key || context.triggerId || 'optional'}`;
        const preference = this.state.optionalPreferences[key] || command.defaultPolicy || 'ASK';
        if (preference === 'YES') this.insertEffects(command.then || []);
        else if (preference === 'NO') this.insertEffects(command.else || []);
        else this.state.pending = { kind: 'optional', key, label: command.label || 'Use this optional effect?', min: 1, max: 1, optional: true,
          options: [{ value: 'YES', label: 'Yes' }, { value: 'NO', label: 'No' }], then: clone(command.then || []), else: clone(command.else || []), source: context.source };
        return;
      }
      case 'choose': return this.effectChoose(command, context);
      case 'draw': {
        const ids = this.drawCards(integer(cmd.count ?? 1, 0, 1000000), player);
        if (command.key) context.vars[command.key] = ids;
        if (this.state.drawContinuation) this.state.drawContinuation.resultKey = command.key || null;
        return;
      }
      case 'takeTop': {
        const ids = this.activeLibrary(player).slice(0, integer(cmd.count ?? 1, 0, 1000000));
        this.moveBatch(ids.map(id => ({ id, to: cmd.to || 'hand', cause: cmd.cause || 'put-top-in-hand' })));
        if (command.key) context.vars[command.key] = ids; return;
      }
      case 'mill': {
        const changes = this.millCards(integer(cmd.count ?? 1, 0, 1000000), player);
        if (command.key) context.vars[command.key] = clone(changes); return;
      }
      case 'look': {
        const ids = this.activeLibrary(player).slice(0, integer(cmd.count ?? 1, 0, 1000000));
        context.vars[command.key || 'looked'] = ids;
        this.state.lookWorkspace = { ids, label: command.label || 'Look at library', visibility: cmd.reveal ? 'revealed' : 'private' };
        this.record(cmd.reveal ? 'REVEALED' : 'LOOKED', { ids, player, count: ids.length }); return;
      }
      case 'move': case 'sacrifice': case 'destroy': case 'discard': {
        const ids = command.selector ? this.select(cmd.selector, context) : this.effectIds(command.ids, context);
        const destination = cmd.to || 'graveyard', cause = command.op === 'move' ? cmd.cause || 'effect' : command.op;
        const changes = this.moveBatch(ids.map(id => ({ id, to: destination, cause, from: cmd.from, tapped: cmd.tapped, controller: cmd.controller, counters: cmd.counters, flags: cmd.flags, modifications: cmd.modifications, copy: cmd.copy, attachedTo: cmd.attachedTo })), context);
        if (command.key) context.vars[command.key] = clone(changes || []); return;
      }
      case 'tap': case 'untap': {
        const ids = command.selector ? this.select(cmd.selector, context) : this.effectIds(command.ids, context);
        this.tapObjects(ids, command.op === 'tap', 'effect', context); return;
      }
      case 'mana': {
        const production = cmd.production || { [cmd.color || 'C']: integer(cmd.amount ?? 1, 0, 1000000) };
        this.addMana(player, production, context.source, cmd.restriction || null); return;
      }
      case 'life': this.changeLife(player, Number(cmd.amount) || 0); return;
      case 'energy': this.state.players[player].energy = Math.max(0, this.state.players[player].energy + (Number(cmd.amount) || 0)); this.emit('ENERGY_CHANGED', { player, amount: cmd.amount }); return;
      case 'damage': {
        const targets = cmd.players || (cmd.player != null ? [cmd.player] : asArray(cmd.targets ?? cmd.ids));
        for (const target of targets) this.dealDamage(target, Number(cmd.amount) || 0, context); return;
      }
      case 'counter': {
        const ids = command.selector ? this.select(cmd.selector, context) : this.effectIds(command.ids || '$source', context);
        for (const id of ids) this.addCounters(id, cmd.type || '+1/+1', Number(cmd.amount) || 0); return;
      }
      case 'token': {
        const ids = this.createToken(cmd.card, integer(cmd.count ?? 1, 0, 1000000), player, cmd.options || {});
        if (command.key) context.vars[command.key] = ids; return;
      }
      case 'copyToken': {
        const object = cmd.snapshot || this.object(cmd.source); if (!object) return;
        const ids = this.copyToken(object, player, cmd.exceptions || {}); if (command.key) context.vars[command.key] = ids; return;
      }
      case 'becomeCopy': {
        const source = this.object(cmd.source), target = this.object(cmd.target);
        if (!source || !target || source.zone !== 'battlefield' || target.zone !== 'battlefield') return;
        source.copy = this.copiableValues(target, cmd.exceptions || {}); this.touch(); this.emit('COPIED', { object: ref(source), copied: ref(target) }); return;
      }
      case 'attach': this.attach(cmd.source || context.source, asArray(cmd.target)[0] || null); return;
      case 'modify': {
        const ids = command.selector ? this.select(cmd.selector, context) : this.effectIds(command.ids, context);
        if (cmd.permanent) for (const id of ids) this.object(id).modifications.push(clone(cmd.modification));
        else this.state.effects.push({ id: `effect-${this.state.nextId++}`, kind: 'modify', layer: cmd.layer || 7, controller: player,
          targets: ids.map(id => ref(this.object(id))), modification: clone(cmd.modification), expires: cmd.expires || 'endOfTurn', createdTurn: this.state.turnSerial });
        this.touch(); return;
      }
      case 'effect': this.state.effects.push({ id: `effect-${this.state.nextId++}`, createdTurn: this.state.turnSerial, controller: player, ...clone(cmd.effect) }); return;
      case 'grantPermission': {
        const cards = this.effectIds(command.ids, context).map(id => ref(this.object(id)));
        this.state.effects.push({ id: `permission-${this.state.nextId++}`, kind: 'permission', cards, controller: player, createdTurn: this.state.turnSerial,
          method: cmd.method || 'normal', expires: cmd.expires, zone: cmd.zone, label: cmd.label || 'Granted casting permission', land: cmd.land !== false, spell: cmd.spell !== false, instant: !!cmd.instant, cost: cmd.cost });
        return;
      }
      case 'delayed': {
        this.state.delayed.push({ id: `delayed-${this.state.nextId++}`, when: cmd.when || 'nextEnd', controller: player, context: clone(context),
          program: clone(command.program || []), label: cmd.label || 'Delayed triggered ability', createdTurn: this.state.turnSerial, linkedSource: clone(context.source) });
        this.record('DELAYED_TRIGGER_CREATED', { when: cmd.when || 'nextEnd', label: cmd.label, source: context.source }); return;
      }
      case 'pay': {
        const cost = parseManaCost(cmd.mana || '', { x: cmd.x || 0 });
        this.state.pending = { kind: 'effectPayment', label: cmd.label || `Pay ${cmd.mana}?`, optional: true, cost, context: { kind: 'effect', types: [], spendAsAny: this.hasStatic('spendAsAny', player) },
          player, then: clone(command.then || []), else: clone(command.else || []), key: command.key || null,
          options: [{ value: 'pay', label: 'Pay' }, { value: 'decline', label: 'Decline' }], suggested: suggestPayment(cost, this.state.players[player], { kind: 'effect', spendAsAny: this.hasStatic('spendAsAny', player) }) };
        return;
      }
      case 'shuffle': this.shuffleLibrary(player); return;
      case 'library': {
        const ids = this.effectIds(command.ids, context); this.putInLibrary(ids, cmd.position || 'top', !!cmd.random); return;
      }
      case 'search': {
        const key = command.key || `search-${this.state.nextId++}`;
        const selector = { zones: ['libraryActive'], owner: player, ...(cmd.selector || {}) };
        this.insertEffects([
          { op: 'choose', key, label: cmd.label || 'Search your library', selector, min: cmd.min ?? 0, max: cmd.max ?? 1, optional: true, reveal: true },
          { op: 'move', ids: `$var.${key}`, to: cmd.to || 'hand', tapped: cmd.tapped, counters: cmd.counters, cause: 'search' },
          { op: 'shuffle', player },
        ]); return;
      }
      case 'scry': case 'surveil': {
        const key = `library-choice-${this.state.nextId++}`, ids = this.activeLibrary(player).slice(0, integer(cmd.count ?? 1, 0, 1000));
        context.vars[key] = ids; this.state.lookWorkspace = { ids, label: command.op === 'scry' ? 'Scry' : 'Surveil', visibility: 'private' };
        this.insertEffects([
          { op: 'choose', key: `${key}-selected`, label: command.op === 'scry' ? 'Choose cards to put on the bottom' : 'Choose cards to put in your graveyard', ids, min: 0, max: ids.length },
          { op: 'libraryFinish', kind: command.op, key, player },
        ]); return;
      }
      case 'libraryFinish': {
        const selected = context.vars[`${command.key}-selected`] || [], remaining = (context.vars[command.key] || []).filter(id => !selected.includes(id));
        if (command.kind === 'scry') this.putInLibrary(selected, 'bottom');
        else this.moveBatch(selected.map(id => ({ id, to: 'graveyard', cause: 'surveil' })));
        if (remaining.length > 1) this.insertEffects([{ op: 'choose', key: `${command.key}-order`, label: 'Order the remaining cards (top first)', ids: remaining, min: remaining.length, max: remaining.length, ordered: true }, { op: 'library', ids: `$var.${command.key}-order`, position: 'top' }]);
        return;
      }
      case 'extraCombat': {
        this.state.extraCombats.push({ id: `combat-${this.state.nextId++}`, after: cmd.after || this.state.step, controller: player, untapCreatures: cmd.untapCreatures !== false });
        this.record('EXTRA_COMBAT_SCHEDULED', { after: cmd.after || this.state.step, controller: player }); return;
      }
      case 'castChoice': {
        const ids = this.effectIds(command.ids, context).filter(id => !this.characteristics(id).types.includes('Land'));
        if (!ids.length) return;
        this.state.pending = { kind: 'castWindow', label: cmd.label || 'Cast a spell without paying its mana cost?', candidates: ids, min: 0, max: 1,
          optional: true, ids, method: cmd.method || 'free', cost: cmd.cost, source: context.source };
        return;
      }
      case 'enterSpell': {
        const object = this.object(this.state.resolving.object.source);
        if (object?.zone === 'stackCards') {
          const changes = this.moveBatch([{ id: ref(object), to: 'battlefield', cause: 'spell-resolved', controller: context.controller }], context);
          context.permanentRef = changes?.[0]?.afterRef || null;
        }
        return;
      }
      case 'finishSpell': {
        const object = this.object(this.state.resolving.object.source);
        if (object?.zone === 'stackCards') this.moveBatch([{ id: ref(object), to: cmd.destination || 'graveyard', cause: 'spell-resolved' }]); return;
      }
      case 'endEffect': this.state.resolving.pc = this.state.resolving.commands.length; return;
      default: throw new Error(`Unknown effect operation ${command.op}`);
    }
  },
  effectChoose(command, context) {
    const cmd = this.value(command, context), key = command.key || `choice-${this.state.nextId++}`;
    let spec;
    if (cmd.options) {
      spec = { key, type: cmd.type || 'option', label: cmd.label, options: cmd.options, min: cmd.min ?? 1, max: cmd.max ?? 1, ordered: !!cmd.ordered };
    } else {
      let selector = cmd.selector || { zones: ['battlefield'] };
      if (command.ids != null) {
        const ids = this.effectIds(command.ids, context);
        selector = { zones: unique(ids.map(id => this.object(id).zone)), ...selector, ids };
        if (!cmd.selector?.zones) selector.zones = unique(ids.map(id => this.object(id).zone));
      }
      const ids = this.select(selector, context);
      const min = Math.min(cmd.min ?? 1, ids.length), max = Math.min(cmd.max ?? cmd.min ?? 1, ids.length);
      spec = { key, type: 'select', label: cmd.label || 'Choose cards', selector, candidates: ids, min, max, ordered: !!cmd.ordered, sumManaValue: cmd.sumManaValue };
      if (!ids.length || max === 0) { context.vars[key] = []; this.record('EMPTY_SELECTION', { key }); return; }
    }
    const policyKey = command.policyKey ? `${context.sourceCardId}/${command.policyKey}` : null;
    const preference = policyKey ? this.state.optionalPreferences[policyKey] || command.defaultValue : null;
    if (preference && preference !== 'ASK' && spec.options?.some(o => o.value === preference)) {
      context.vars[key] = preference; this.record('OPTIONAL_POLICY_APPLIED', { key: policyKey, value: preference }); return;
    }
    this.state.pending = { ...spec, kind: 'effect', optional: spec.min === 0 || !!cmd.optional, source: context.source, policyKey };
  },
  acceptEffectChoice(value, action = {}) {
    const pending = this.state.pending, frame = this.state.resolving;
    requireRule(frame, 'The resolving effect is missing.');
    if (pending.kind === 'optional') {
      const option = value === 'YES' || value === true || asArray(value)[0] === 'YES' ? 'YES' : 'NO';
      if (action.remember) this.state.optionalPreferences[pending.key] = option;
      this.state.pending = null; this.insertEffects(option === 'YES' ? pending.then : pending.else);
    } else if (pending.kind === 'effectPayment') {
      const option = asArray(value)[0];
      requireRule(['pay', 'decline'].includes(option) || (value && typeof value === 'object' && !Array.isArray(value)), 'Choose Pay or Decline.');
      if (option !== 'decline') {
        const payment = value && typeof value === 'object' && !Array.isArray(value) ? value : null;
        const paid = spendPayment(pending.cost, this.state.players[pending.player], pending.context, payment);
        this.record('RESOLUTION_COST_PAID', { source: frame.context.source, payment: paid });
      }
      this.state.pending = null; this.insertEffects(option === 'decline' ? pending.else : pending.then);
    } else if (pending.kind === 'effect') {
      frame.context.vars[pending.key] = this.validateInput(pending, value, frame.context);
      if (action.remember && pending.policyKey) this.state.optionalPreferences[pending.policyKey] = frame.context.vars[pending.key];
      this.state.pending = null;
    } else if (pending.kind === 'castWindow') {
      const ids = asArray(value).filter(v => v !== 'skip' && v != null);
      requireRule(ids.length <= 1 && ids.every(id => pending.ids.includes(id)), 'Choose one of the offered spells, or decline.');
      this.state.pending = null;
      if (ids.length) {
        this.state.castParent = frame; this.state.resolving = null;
        this.state.castWindow = { cards: ids.map(id => ref(this.object(id))), method: pending.method, cost: pending.cost, label: pending.label };
        this.beginCardAction({ type: 'CAST_SPELL', id: ids[0], permission: 'resolution-window', payment: action.payment || 'auto', inputs: action.inputs || {} });
        return;
      }
    }
    this.runEffects();
  },
};
