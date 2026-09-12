import { clone, ref, sameRef, asArray, unique, requireRule } from './util.js';

export const eventMethods = {
  emit(type, detail = {}, previousSources = []) {
    this.touch();
    const event = this.record(type, detail);
    const current = Object.values(this.state.instances).filter(o => o.zone !== 'void');
    const sources = [...current, ...previousSources].filter((o, i, all) => all.findIndex(p => sameRef(p, o)) === i);
    for (const source of sources) {
      const module = this.module(source);
      for (const trigger of module.triggers || []) {
        if (!asArray(trigger.events || trigger.event).includes(type)) continue;
        if ((trigger.zone || 'battlefield') !== source.zone) continue;
        const context = this.context(source, { event, triggerId: trigger.id });
        if (trigger.test && !trigger.test(this, source, event, context)) continue;
        if (trigger.interveningIf && !trigger.interveningIf(this, context)) continue;
        const countKey = `${source.id}:${source.oid}:${trigger.id}:${trigger.oncePerTurn ? this.state.turnSerial : event.batchId ?? event.sequence}`;
        if ((trigger.oncePerBatch || trigger.oncePerTurn) && this.state.triggerCounts[countKey]) continue;
        if (trigger.oncePerBatch || trigger.oncePerTurn) this.state.triggerCounts[countKey] = 1;
        let multiplier = 1;
        for (const doubling of this.objects('battlefield')) {
          const rule = this.module(doubling).triggerMultiplier;
          if (rule && rule(this, doubling, event, source)) multiplier += 1;
        }
        for (let i = 0; i < multiplier; i++) this.queueTrigger({
          source: ref(source), sourceCardId: context.sourceCardId, controller: source.controller,
          abilityId: trigger.id, label: `${this.definition(source).name} — ${trigger.label || trigger.id}`,
          context, optional: !!trigger.optional, multiplierIndex: i,
        });
      }
    }
    return event;
  },
  queueTrigger(trigger) {
    const object = { id: `s${this.state.nextStackId++}`, kind: 'trigger', ...clone(trigger), targets: [] };
    this.state.pendingTriggers.push(object);
    this.record('TRIGGER_CREATED', { stackId: object.id, label: object.label, controller: object.controller, source: object.source, event: object.context?.event?.sequence ?? null });
    return object;
  },
  triggerDefinition(stackObject) {
    if (stackObject.program) return { id: stackObject.abilityId, effect: () => clone(stackObject.program), inputs: [] };
    return (this.registry.module(stackObject.sourceCardId).triggers || []).find(t => t.id === stackObject.abilityId);
  },
  settle() {
    this.touch();
    for (let guard = 0; guard < 1000; guard++) {
      this.state.activeLibraryBoundary = this.state.zones.libraryActive.length;
      if (this.state.pending || this.state.actionDraft || this.state.resolving) return;
      if (this.checkStateActions()) continue;
      if (this.state.pending) return;
      if (this.state.triggersToPlace?.length) { this.prepareNextTrigger(); return; }
      if (this.state.pendingTriggers.length) { this.flushTriggers(); return; }
      if (this.state.advanceTarget && !this.state.stack.length) {
        const beforeStep = `${this.state.activePlayer}:${this.state.step}`;
        this.continueAdvance();
        if (beforeStep !== `${this.state.activePlayer}:${this.state.step}` || this.state.pendingTriggers.length) continue;
      }
      return;
    }
    throw new Error('State settlement exceeded its safety limit. Resolve a smaller group of actions.');
  },
  flushTriggers() {
    if (this.state.resolving || this.state.pending || this.state.actionDraft || !this.state.pendingTriggers.length) return;
    const waiting = this.state.pendingTriggers.splice(0);
    // APNAP: the active player's group is placed first (and therefore resolves last).
    const groups = [];
    for (let offset = 0; offset < 4; offset++) {
      const controller = (this.state.activePlayer + offset) % 4;
      const triggers = waiting.filter(t => t.controller === controller);
      if (triggers.length) groups.push({ controller, triggers });
    }
    this.state.triggerGroups = groups;
    this.prepareTriggerGroup();
  },
  prepareTriggerGroup() {
    if (!this.state.triggerGroups?.length) { this.state.triggerGroups = []; return; }
    const group = this.state.triggerGroups.shift();
    if (group.triggers.length > 1 && this.state.settings.orderTriggers) {
      this.state.pending = { kind: 'triggerOrder', label: `Order ${group.triggers.length} simultaneous triggers`,
        description: 'Arrange the order you want them to RESOLVE. The first item resolves first. All triggers in this group have the same controller.',
        controller: group.controller, min: group.triggers.length, max: group.triggers.length, ordered: true,
        options: group.triggers.map(t => ({ value: t.id, label: t.label })), triggers: group.triggers };
    } else {
      this.state.triggersToPlace = [...group.triggers];
      this.prepareNextTrigger();
    }
  },
  acceptTriggerOrder(values) {
    const pending = this.state.pending, ids = asArray(values);
    requireRule(pending?.kind === 'triggerOrder' && ids.length === pending.triggers.length && unique(ids).length === ids.length && ids.every(id => pending.triggers.some(t => t.id === id)), 'Choose every trigger exactly once.', 'INVALID_SELECTION');
    this.state.triggersToPlace = [...ids].reverse().map(id => pending.triggers.find(t => t.id === id));
    this.state.pending = null;
    this.record('TRIGGERS_ORDERED', { resolutionOrder: ids });
    this.prepareNextTrigger();
  },
  prepareNextTrigger() {
    if (this.state.pending || this.state.actionDraft) return;
    if (!this.state.triggersToPlace?.length) { this.prepareTriggerGroup(); return; }
    const trigger = this.state.triggersToPlace.shift(), definition = this.triggerDefinition(trigger);
    if (!definition) throw new Error(`Missing registered trigger ${trigger.sourceCardId}/${trigger.abilityId}`);
    this.state.actionDraft = { kind: 'trigger', stackObject: trigger, context: clone(trigger.context), inputs: {}, source: trigger.source, abilityId: trigger.abilityId };
    this.advanceDraft();
  },
  putPreparedTrigger(draft) {
    const object = draft.stackObject;
    object.context = draft.context; object.targets = draft.targets || [];
    this.state.stack.push(object);
    this.state.actionDraft = null;
    this.record('TRIGGER_ON_STACK', { stackId: object.id, label: object.label, targets: object.targets });
    this.prepareNextTrigger();
  },
  resolveTop() {
    requireRule(!this.state.pending && !this.state.actionDraft && !this.state.resolving, 'Finish the current choice first.');
    requireRule(this.state.stack.length, 'The stack is empty.');
    const object = this.state.stack.pop();
    const context = clone(object.context || {});
    const legalTargets = (object.targets || []).filter(t => t.player != null ? !this.state.players[t.player].lost && !this.playerProtected(t.player, object.controller) :
      this.object(t.ref) && this.matches(this.object(t.ref), t.selector, { ...context, controller: object.controller }));
    if ((object.targets || []).length && !legalTargets.length) {
      this.record('FIZZLED', { stackId: object.id, label: object.label, reason: 'All targets are illegal.' });
      if (object.kind === 'spell') this.moveBatch([{ id: object.source.id, to: 'graveyard', cause: 'countered-by-rules' }]);
      return;
    }
    for (const target of object.targets || []) if (target.key && target.player == null) {
      const validForKey = legalTargets.filter(t => t.key === target.key).map(t => t.ref.id);
      context.inputs[target.key] = validForKey;
    }
    context.legalTargets = legalTargets; context.stackId = object.id;
    let definition;
    if (object.kind === 'trigger') definition = this.triggerDefinition(object);
    else if (object.kind === 'ability') definition = (this.registry.module(object.sourceCardId).activated || []).find(a => a.id === object.abilityId);
    else definition = this.registry.module(object.sourceCardId).spell || {};
    if (!definition) throw new Error(`No effect registered for ${object.label}`);
    if (definition.interveningIf && !definition.interveningIf(this, context)) {
      this.record('INTERVENING_IF_FALSE', { stackId: object.id, label: object.label }); return;
    }
    let commands = object.program ? clone(object.program) : definition.effect ? definition.effect(this, context) : [];
    if (!Array.isArray(commands)) commands = commands ? [commands] : [];
    if (definition.optional) commands = [{ op: 'optional', key: definition.id || object.abilityId, label: definition.label || object.label, then: commands }];
    if (object.kind === 'spell') {
      const source = this.object(object.source), c = source && this.characteristics(source);
      if (c?.types.some(t => ['Artifact', 'Creature', 'Enchantment', 'Land', 'Planeswalker', 'Battle'].includes(t))) commands = [{ op: 'enterSpell' }, ...commands];
      commands.push({ op: 'finishSpell', destination: definition.exileAfter ? 'exile' : 'graveyard' });
    }
    this.record('RESOLUTION_STARTED', { stackId: object.id, label: object.label });
    this.state.resolving = { object, context, commands, pc: 0 };
    this.runEffects();
  },
  resolveAll(limit = 1000) {
    for (let n = 0; n < limit && this.state.stack.length && !this.state.pending && !this.state.actionDraft && !this.state.resolving; n++) {
      this.resolveTop(); this.settle();
    }
    if (this.state.stack.length && !this.state.pending && !this.state.actionDraft && !this.state.resolving) this.record('RESOLVE_ALL_PAUSED', { reason: 'Safety limit reached; remaining stack is preserved.' });
  },
};
