import { clone, ref, sameRef, asArray, unique, requireRule, integer, COLORS, ZONES, emptyMana } from './util.js';
import { candidates, validateSelection } from './selectors.js';
import { parseManaCost, suggestPayment, spendPayment, validatePayment, manaCostText } from './mana.js';
import { makeInstance } from './deck.js';

const list = (value, engine, source, context) => typeof value === 'function' ? value(engine, source, context) : value || [];
const costKey = (cost, index) => cost.key || `cost-${index}`;

export const actionMethods = {
  handleAction(action) {
    const type = action.type;
    if (type === 'CHOOSE') return this.acceptChoice(action.value, action);
    if (type === 'CANCEL') {
      requireRule(this.state.pending?.optional || this.state.actionDraft?.kind !== 'trigger', 'A mandatory trigger or effect cannot be cancelled.');
      if (this.state.pending?.optional && ['effect', 'castWindow'].includes(this.state.pending.kind)) return this.acceptChoice([], action);
      if (this.state.pending?.kind === 'optional') return this.acceptChoice('NO', action);
      if (this.state.pending?.kind === 'miracleReveal') return this.acceptChoice('decline', action);
      if (this.state.pending?.kind === 'effectPayment') return this.acceptChoice('decline', action);
      requireRule(this.transaction, 'No action is in progress.');
      const before = clone(this.transaction.before); this.transaction = null; this.state = before; this.touch(); return;
    }
    if (type === 'SET_OPTIONAL') {
      const { key, value } = action;
      requireRule(typeof key === 'string' && key.length < 250 && ['ASK', 'YES', 'NO', 'Treasure', 'Food'].includes(value), 'Invalid optional preference.');
      this.state.optionalPreferences[key] = value; this.record('OPTIONAL_POLICY', { key, value }); return;
    }
    if (type === 'SET_SETTING') {
      requireRule(['holdPriority', 'orderTriggers', 'debug', 'firstMulliganFree'].includes(action.key), 'Unknown setting.');
      this.state.settings[action.key] = !!action.value; this.record('SETTING_CHANGED', { key: action.key, value: !!action.value }); return;
    }
    if (type === 'NOTE') {
      const text = String(action.text || '').trim().slice(0, 10000); requireRule(text, 'Enter a note.');
      this.state.notes.push({ text, turn: this.state.turnNumber, step: this.state.step, sequence: this.state.eventSerial + 1 });
      this.record('NOTE', { text }); return;
    }
    if (type === 'ADJUST_MANA') {
      const player = integer(action.player ?? 0, 0, 3), color = action.color;
      requireRule(COLORS.includes(color), 'Choose a mana color.');
      const amount = integer(action.delta, -1000000, 1000000, 'Mana adjustment');
      requireRule(this.state.players[player].mana[color] + amount >= 0, 'Mana cannot be negative.');
      this.state.players[player].mana[color] += amount; this.record('MANUAL_MANA', { player, color, delta: amount }); return;
    }
    if (type === 'ADJUST_PLAYER') {
      const player = integer(action.player ?? 0, 0, 3), field = action.field || 'life';
      requireRule(['life', 'poison', 'energy', 'abstractCreatures', 'abstractHand'].includes(field), 'Invalid player field.');
      const delta = integer(action.delta, -1000000, 1000000), p = this.state.players[player];
      requireRule(field === 'life' || p[field] + delta >= 0, 'This total cannot be negative.');
      p[field] += delta; this.record('MANUAL_PLAYER_TOTAL', { player, field, delta }); return;
    }
    if (type === 'LAYOUT') {
      const updates = action.updates || [{ id: action.id, x: action.x, y: action.y }];
      for (const update of updates) {
        const object = this.object(update.id); requireRule(object && ['battlefield', 'graveyard'].includes(object.zone), 'Only cards already in battlefield or graveyard can be repositioned.');
        object.location = { x: integer(Math.round(update.x), 0, 10000), y: integer(Math.round(update.y), 0, 10000) };
      }
      this.record('LAYOUT_CHANGED', { updates }); return;
    }
    if (type === 'RESERVE_ACCESS') {
      this.state.reserveAccess = !!action.enabled; this.record('HARNESS_RESERVE_ACCESS', { enabled: this.state.reserveAccess }); return;
    }
    if (type.startsWith('DEBUG_')) return this.debugAction(action);
    if (this.state.pending || this.state.actionDraft) {
      if (type === 'ACTIVATE_ABILITY' && ['payment', 'effectPayment'].includes(this.state.pending?.kind)) return this.beginPaymentManaAbility(action);
      requireRule(false, 'Finish the highlighted choice before taking another action.', 'CHOICE_PENDING');
    }
    requireRule(!this.state.resolving, 'An effect is still resolving.');
    if (type === 'KEEP_HAND') return this.keepHand();
    if (type === 'MULLIGAN') return this.mulligan();
    requireRule(this.state.started, 'Keep your opening hand before starting play.');
    requireRule(this.state.status === 'playing', 'This test has ended. Undo the ending action or start a new test.');
    if (type === 'CAST_SPELL' || type === 'PLAY_LAND') return this.beginCardAction(action);
    if (type === 'ACTIVATE_ABILITY') return this.beginAbility(action);
    if (type === 'SPECIAL_ACTION') return this.beginSpecial(action);
    if (type === 'RESOLVE_TOP') return this.resolveTop();
    if (type === 'RESOLVE_ALL') return this.resolveAll();
    if (type === 'PASS_PRIORITY') { this.record('PRIORITY_PASSED', { player: 0 }); if (this.state.stack.length) return this.resolveTop(); return this.advancePhase({ next: true }); }
    if (type === 'ADVANCE_PHASE') return this.advancePhase(action);
    if (type === 'DECLARE_ATTACKERS') return this.declareAttackers(action);
    if (type === 'MANUAL_DAMAGE') {
      requireRule(['damage', 'attackers', 'endCombat'].includes(this.state.step), 'Combat damage assistance is available during combat.');
      const amount = integer(action.amount, 0, 1000000), player = integer(action.player, 0, 3);
      this.record('MANUAL_COMBAT_DAMAGE', { player, amount, source: action.source || null });
      this.dealDamage(player, amount, { controller: 0, source: action.source || null });
      if (action.commanderId) {
        const commander = this.object(action.commanderId); requireRule(commander?.commander, 'That source is not a commander.');
        this.state.players[player].commanderDamage[commander.cardId] = (this.state.players[player].commanderDamage[commander.cardId] || 0) + amount;
      }
      return;
    }
    if (type === 'DROP_CARD') {
      const object = this.object(action.id); requireRule(object, 'Card not found.');
      if (object.zone === action.zone && ['battlefield', 'graveyard'].includes(object.zone)) return this.handleAction({ type: 'LAYOUT', id: object.id, x: action.x || 0, y: action.y || 0 });
      requireRule(action.zone === 'battlefield', 'Cross-zone dragging is not a legal action. Use a spell, ability, or effect.', 'ILLEGAL_ZONE_MOVE');
      return this.beginCardAction({ ...action, type: this.characteristics(object).types.includes('Land') ? 'PLAY_LAND' : 'CAST_SPELL' });
    }
    if (type === 'CARD_CLICK') {
      const object = this.object(action.id); requireRule(object?.zone === 'battlefield', 'Inspect this card to choose an action.');
      const abilities = this.abilities(object).filter(a => a.mana && a.tap);
      requireRule(abilities.length === 1, object.tapped ? 'A tapped permanent needs an untap effect; clicking is not a free untap.' : 'Choose a specific ability in the inspector.', 'ABILITY_REQUIRED');
      return this.beginAbility({ type: 'ACTIVATE_ABILITY', id: object.id, abilityId: abilities[0].id, inputs: action.inputs, payment: action.payment });
    }
    throw new Error(`Unknown action ${type}`);
  },
  castingPermissions(object, land = false) {
    const permissions = [], c = this.characteristics(object), player = object.owner;
    if (player !== 0) return [];
    if (object.zone === 'hand') permissions.push({ id: 'hand', label: land ? 'Play from hand' : 'Cast from hand', method: 'normal' });
    if (object.zone === 'command' && object.commander && !land) permissions.push({ id: 'command', label: 'Cast commander', method: 'normal', commander: true });
    for (const source of this.controlled(0)) for (const rule of this.module(source).permissions || []) {
      if (land ? !rule.land : !rule.spell) continue;
      const zoneMatches = rule.zone === object.zone || (rule.zone === 'libraryActive' && object.zone === 'libraryReserve' && this.canAccessReserve());
      if (!zoneMatches || (rule.test && !rule.test(this, source, object, land))) continue;
      permissions.push({ id: `${source.id}:${source.oid}:${rule.id}`, label: rule.label, method: rule.method || 'normal', provider: ref(source), ruleId: rule.id, additionalCosts: clone(list(rule.additionalCosts, this, source, this.context(object))) });
    }
    for (const effect of this.state.effects.filter(e => e.kind === 'permission')) {
      if (effect.controller !== 0 || (land ? effect.land === false : effect.spell === false)) continue;
      if (!effect.cards?.some(r => sameRef(r, object))) continue;
      if (effect.afterTurn != null && this.state.turnSerial <= effect.afterTurn) continue;
      if (effect.zone && effect.zone !== object.zone) continue;
      permissions.push({ id: effect.id, label: effect.label || 'Granted play permission', method: effect.method || 'normal', instant: !!effect.instant, cost: effect.cost, plot: !!effect.plot });
    }
    if (this.state.castWindow?.cards.some(r => sameRef(r, object))) permissions.push({ id: 'resolution-window', label: this.state.castWindow.label || 'Cast during resolution', method: this.state.castWindow.method || 'free', instant: true, cost: this.state.castWindow.cost });
    if (!land) {
      const alternates = list(this.module(object).alternateCosts, this, object, this.context(object));
      for (const permission of [...permissions].filter(p => p.method === 'normal')) for (const alternate of alternates) {
        if (!alternate.test || alternate.test(this, object)) permissions.push({ ...permission, id: `${permission.id}/${alternate.id}`, label: alternate.label, method: 'alternate', cost: alternate.cost || '', additionalCosts: clone(alternate.costs || []), alternateId: alternate.id });
      }
    }
    return permissions;
  },
  canSeeTop() { return this.controlled(0).some(o => this.module(o).lookTop && (!this.module(o).lookTopTest || this.module(o).lookTopTest(this, o))); },
  beginCardAction(action) {
    const source = this.object(action.id); requireRule(source, 'Card not found.');
    const land = action.type === 'PLAY_LAND', c = this.characteristics(source);
    requireRule(this.module(source).status && this.module(source).status !== 'unsupported', 'This card does not yet have a rules implementation.', 'UNSUPPORTED_CARD');
    requireRule(land === c.types.includes('Land'), land ? 'This card is not a land.' : 'Lands are played, not cast.');
    const permissions = this.castingPermissions(source, land);
    requireRule(permissions.length, `You do not have permission to ${land ? 'play' : 'cast'} this card from ${source.zone}.`, 'NO_PERMISSION');
    const context = this.context(source, { inputs: clone(action.inputs || {}), castX: action.x ?? action.inputs?.x ?? 0 });
    if (action.permission) context.inputs.permission = action.permission;
    if (action.x != null) context.inputs.x = action.x;
    this.state.actionDraft = { kind: land ? 'land' : 'spell', source: ref(source), sourceCardId: context.sourceCardId, context, autoPayment: action.payment === 'auto', payment: action.payment && action.payment !== 'auto' ? clone(action.payment) : null, permissions, targets: [] };
    this.advanceDraft();
  },
  beginAbility(action) {
    const source = this.object(action.id); requireRule(source, 'The source no longer exists.');
    requireRule(source.controller === 0 || (source.zone !== 'battlefield' && source.owner === 0), 'You do not control this ability.');
    const ability = this.abilities(source).find(a => a.id === action.abilityId);
    requireRule(ability, 'This ability is not available in the current zone.', 'ABILITY_UNAVAILABLE');
    const context = this.context(source, { inputs: clone(action.inputs || {}) });
    if (action.x != null) context.inputs.x = action.x;
    this.state.actionDraft = { kind: 'ability', source: ref(source), sourceCardId: context.sourceCardId, abilityId: ability.id, context, targets: [], autoPayment: action.payment === 'auto', payment: action.payment && action.payment !== 'auto' ? clone(action.payment) : null };
    this.advanceDraft();
  },
  beginSpecial(action) {
    const source = this.object(action.id); requireRule(source && source.owner === 0, 'Card not found.');
    const module = this.module(source);
    requireRule(action.special === 'plot' && module.plot && source.zone === 'hand', 'That special action is not available.');
    requireRule(this.isSorceryTime(), 'Plot only at sorcery speed.');
    const context = this.context(source, { inputs: clone(action.inputs || {}) });
    this.state.actionDraft = { kind: 'plot', source: ref(source), sourceCardId: source.cardId, context, autoPayment: action.payment === 'auto', targets: [] };
    this.advanceDraft();
  },
  draftDefinition(draft = this.state.actionDraft) {
    if (draft.kind === 'trigger') return this.triggerDefinition(draft.stackObject);
    if (draft.kind === 'ability') return (this.registry.module(draft.sourceCardId).activated || []).find(a => a.id === draft.abilityId);
    if (draft.kind === 'plot') return { cost: this.registry.module(draft.sourceCardId).plot };
    return this.registry.module(draft.sourceCardId).spell || {};
  },
  draftCosts(draft) {
    const source = this.object(draft.source), definition = this.draftDefinition(draft), context = draft.context;
    const costs = clone(list(definition.costs, this, source, context));
    if (draft.permission?.additionalCosts) costs.push(...clone(draft.permission.additionalCosts));
    if (definition.tap) costs.unshift({ kind: 'tap', self: true });
    if (definition.life) costs.push({ kind: 'life', amount: typeof definition.life === 'function' ? definition.life(this, source, context) : definition.life });
    if (definition.energy) costs.push({ kind: 'energy', amount: definition.energy });
    if (definition.loyalty != null) costs.push({ kind: 'counter', self: true, type: 'loyalty', delta: typeof definition.loyalty === 'function' ? definition.loyalty(this, source, context) : definition.loyalty });
    return costs;
  },
  inputSpecs(draft) {
    const source = this.object(draft.source), definition = this.draftDefinition(draft), context = draft.context;
    const specs = [];
    if (['spell', 'land'].includes(draft.kind)) {
      if (draft.permissions.length > 1) specs.push({ key: 'permission', type: 'option', label: 'Choose how to play this card', options: draft.permissions.map(p => ({ value: p.id, label: p.label })) });
      else if (context.inputs.permission == null) context.inputs.permission = draft.permissions[0].id;
      if (context.inputs.permission != null) {
        const p = draft.permissions.find(x => x.id === context.inputs.permission); requireRule(p, 'This play permission is no longer available.'); draft.permission = p;
      }
    }
    if (draft.kind === 'spell') {
      if (this.definition(source).manaCost.includes('{X}') && draft.permission?.method !== 'free') specs.push({ key: 'x', type: 'number', label: 'Choose X', min: 0, max: 10000 });
      if (this.definition(source).manaCost.includes('/P}') && draft.permission?.method === 'normal') specs.push({ key: 'phyrexian', type: 'option', label: 'Phyrexian mana', options: [{ value: 'mana', label: 'Pay colored mana' }, { value: 'life', label: 'Pay 2 life instead' }] });
    }
    if (draft.kind === 'ability') {
      const mana = typeof definition.cost === 'function' ? definition.cost(this, source, context) : definition.cost || '';
      if (mana.includes('/P}')) specs.push({ key: 'phyrexian', type: 'option', label: 'Phyrexian mana', options: [{ value: 'mana', label: 'Pay colored mana' }, { value: 'life', label: 'Pay 2 life instead' }] });
    }
    specs.push(...list(definition.inputs, this, source, context));
    if (draft.kind !== 'trigger' && draft.kind !== 'land') for (const [index, cost] of this.draftCosts(draft).entries()) {
      if (cost.self || !['tap', 'sacrifice', 'discard', 'exile', 'return'].includes(cost.kind)) continue;
      specs.push({ key: costKey(cost, index), type: 'select', label: cost.label || `Choose cards to ${cost.kind} as a cost`, selector: cost.selector || {}, min: cost.min ?? cost.count ?? 1, max: cost.max ?? cost.count ?? cost.min ?? 1, cost: true, ...(cost.minTotalPower != null ? { minTotalPower: cost.minTotalPower, crew: !!cost.crew } : {}) });
    }
    return specs;
  },
  materializeInput(spec, context) {
    const input = clone(spec); input.min ??= 1; input.max ??= input.min;
    if (spec.type === 'select' || !spec.type) {
      input.type = 'select'; input.candidates = candidates(this, spec.selector || {}, context);
      input.options = input.candidates.map(id => ({ value: id, label: this.definition(this.object(id)).name }));
    } else if (spec.type === 'player') {
      input.options = this.state.players.filter(p => !p.lost && (spec.opponent ? p.id !== context.controller : true) && (!spec.target || !this.playerProtected(p.id, context.controller))).map(p => ({ value: p.id, label: p.name }));
    }
    return input;
  },
  validateInput(spec, value, context) {
    if (spec.type === 'number') return integer(value, spec.min ?? 0, spec.max ?? 10000, spec.label || 'Number');
    if (spec.type === 'select' || !spec.type) {
      const ids = validateSelection(this, value, spec.selector || {}, context, { min: spec.min ?? 1, max: spec.max ?? spec.min ?? 1 });
      if (spec.ordered && spec.candidates && spec.min === spec.candidates.length) requireRule(ids.every(id => spec.candidates.includes(id)), 'Invalid ordering.');
      if (spec.candidates) requireRule(ids.every(id => spec.candidates.includes(id)), 'That card is not in this selection.');
      if (spec.sumManaValue != null) requireRule(ids.reduce((n, id) => n + this.characteristics(id).manaValue, 0) <= spec.sumManaValue, 'Combined mana value exceeds the allowed total.');
      if (spec.minTotalPower != null) {
        const total = ids.reduce((n, id) => n + Math.max(0, this.characteristics(id).power + (spec.crew ? this.module(this.object(id)).crewBonus || 0 : 0)), 0);
        requireRule(total >= spec.minTotalPower, `Selected creatures need at least ${spec.minTotalPower} total power.`, 'CREW_POWER');
      }
      return ids;
    }
    const choices = asArray(value);
    requireRule(choices.length >= (spec.min ?? 1) && choices.length <= (spec.max ?? 1), 'Choose the required number of options.');
    requireRule(unique(choices).length === choices.length, 'An option cannot be chosen twice.');
    requireRule(choices.every(v => (spec.options || []).some(o => (typeof o === 'object' ? o.value : o) === v)), 'That option is not available.');
    return spec.max > 1 || spec.ordered ? choices : choices[0];
  },
  advanceDraft() {
    const draft = this.state.actionDraft; if (!draft) return;
    const definition = this.draftDefinition(draft); requireRule(definition, 'Rules definition missing.');
    let source = this.object(draft.source);
    if (draft.kind !== 'trigger') requireRule(source, 'The ability source or spell is no longer present.');
    for (let guard = 0; guard < 40; guard++) {
      const specs = this.inputSpecs(draft); let changed = false;
      for (const specRaw of specs) {
        const spec = this.materializeInput(specRaw, draft.context);
        if (Object.hasOwn(draft.context.inputs, spec.key)) {
          draft.context.inputs[spec.key] = this.validateInput(spec, draft.context.inputs[spec.key], draft.context); continue;
        }
        if (spec.type !== 'number' && spec.options?.length === 0) {
          if ((spec.min || 0) > 0) {
            if (draft.kind === 'trigger') {
              this.record('TRIGGER_NOT_PLACED', { stackId: draft.stackObject.id, reason: 'No legal required target or choice.' });
              this.state.actionDraft = null; this.prepareNextTrigger(); return;
            }
            requireRule(false, `No legal choices for: ${spec.label}`, 'NO_LEGAL_SELECTION');
          }
          draft.context.inputs[spec.key] = []; changed = true; break;
        }
        this.state.pending = { ...spec, kind: 'draft', label: spec.label || 'Choose', optional: spec.min === 0, source: draft.source };
        return;
      }
      if (changed) continue;
      // A selected mode may add subsequent dependent inputs.
      const after = this.inputSpecs(draft);
      if (after.some(s => !Object.hasOwn(draft.context.inputs, s.key))) continue;
      draft.targets = [];
      for (const specRaw of after.filter(s => s.target || s.selector?.target)) {
        const spec = this.materializeInput(specRaw, draft.context), value = draft.context.inputs[spec.key];
        if (spec.type === 'player') draft.targets.push({ key: spec.key, player: value });
        else for (const id of asArray(value)) draft.targets.push({ key: spec.key, ref: ref(this.object(id)), selector: clone(spec.selector || {}) });
      }
      if (draft.kind === 'trigger') return this.putPreparedTrigger(draft);
      this.validateDraft(draft);
      if (draft.kind === 'land') {
        this.state.landPlaysUsed++; this.record('LAND_PLAYED', { source: draft.source, permission: draft.permission.id, playsUsed: this.state.landPlaysUsed, allowance: this.landAllowance() });
        this.state.actionDraft = null; this.moveBatch([{ id: draft.source, to: 'battlefield', cause: 'play-land', controller: 0 }]); return;
      }
      const quote = this.quoteDraft(draft); draft.quote = quote;
      if (!draft.autoPayment && !draft.payment && (quote.cost.generic || Object.values(quote.cost.colored).some(Boolean) || quote.cost.life)) {
        this.state.pending = { kind: 'payment', label: `Pay ${manaCostText(quote.cost)}`, description: 'Allocate mana already in your pool. No lands are tapped automatically.', cost: quote.cost, context: quote.context, suggested: suggestPayment(quote.cost, this.state.players[0], quote.context), source: draft.source };
        return;
      }
      return this.finishDraft(draft, draft.payment);
    }
    throw new Error('Input preparation exceeded safety limit.');
  },
  validateDraft(draft) {
    const source = this.object(draft.source), definition = this.draftDefinition(draft);
    if (draft.kind === 'land') {
      requireRule(this.isSorceryTime(), 'Play lands only during your main phase with an empty stack.', 'TIMING');
      requireRule(this.state.landPlaysUsed < this.landAllowance(), 'No land plays remain this turn.', 'LAND_LIMIT');
    } else if (draft.kind === 'spell') {
      const c = this.characteristics(source), flash = c.types.includes('Instant') || c.keywords.includes('Flash');
      requireRule(draft.permission?.instant || flash || this.isSorceryTime(), 'This spell requires your main phase and an empty stack.', 'TIMING');
      if (draft.permission?.plot) requireRule(this.isSorceryTime(), 'Plotted spells may only be cast as a sorcery.', 'TIMING');
    } else if (draft.kind === 'ability') {
      requireRule(!definition.available || definition.available(this, source), 'This ability is no longer available.', 'ABILITY_UNAVAILABLE');
      if (definition.sorcery || definition.loyalty != null) requireRule(this.isSorceryTime(), 'Activate this ability only as a sorcery.', 'TIMING');
      if (definition.loyalty != null) {
        const used = source.flags.loyaltyTurn === this.state.turnSerial ? source.flags.loyaltyUsed || 0 : 0;
        requireRule(used < (this.module(source).loyaltyLimit || 1), 'This object has already used its loyalty activation allowance this turn.', 'LOYALTY_LIMIT');
      }
      if (definition.validate) definition.validate(this, source, draft.context);
    }
    const consumed = new Set(), tappedForCost = new Set();
    for (const [index, cost] of this.draftCosts(draft).entries()) {
      const selected = cost.self ? [source.id] : asArray(draft.context.inputs[costKey(cost, index)]);
      if (cost.kind === 'tap') for (const id of selected) {
        requireRule(!tappedForCost.has(id), 'The same permanent cannot pay two tap costs.'); tappedForCost.add(id);
        const object = this.object(id); requireRule(object?.zone === 'battlefield' && !object.tapped && object.controller === 0, 'Tap costs require untapped permanents you control.', 'TAP_COST');
        if (cost.self) requireRule(!this.isSick(object), 'This creature has summoning sickness and cannot pay its tap-symbol cost.', 'SUMMONING_SICKNESS');
      }
      if (['sacrifice', 'discard', 'exile', 'return'].includes(cost.kind)) for (const id of selected) {
        const object = this.object(id); requireRule(object, 'A cost object is missing.');
        requireRule(!consumed.has(id), 'The same card cannot pay two zone-changing costs.'); consumed.add(id);
        if (cost.kind === 'sacrifice') requireRule(object.zone === 'battlefield' && object.controller === 0, 'Only a permanent you control can be sacrificed.');
        if (cost.kind === 'discard') requireRule(object.zone === 'hand' && object.owner === 0, 'Only a card in your hand can be discarded.');
      }
      if (cost.kind === 'counter') requireRule((source.counters[cost.type] || 0) + cost.delta >= 0, `Not enough ${cost.type} counters.`, 'COUNTER_COST');
      if (cost.kind === 'life') requireRule(this.state.players[0].life >= cost.amount, 'Not enough life for the cost.', 'LIFE_COST');
      if (cost.kind === 'energy') requireRule(this.state.players[0].energy >= cost.amount, 'Not enough energy.', 'ENERGY_COST');
    }
  },
  quoteDraft(draft) {
    const source = this.object(draft.source), definition = this.draftDefinition(draft), c = this.characteristics(source), input = draft.context.inputs;
    let mana = typeof definition.cost === 'function' ? definition.cost(this, source, draft.context) : definition.cost || '';
    if (draft.kind === 'spell') mana = this.definition(source).manaCost;
    const permission = draft.permission;
    if (draft.kind === 'spell' && ['free', 'life', 'alternate'].includes(permission?.method)) mana = permission.cost || '';
    const cost = parseManaCost(mana, { x: input.x || 0, hybrid: input.hybrid, phyrexianLife: input.phyrexian === 'life' });
    if (permission?.method === 'life') cost.life += c.manaValue;
    if (permission?.commander) cost.generic += 2 * (this.state.commanderCasts[source.cardId] || 0);
    if (draft.kind === 'spell') {
      let reduction = typeof this.module(source).costReduction === 'function' ? this.module(source).costReduction(this, source, draft.context) : this.module(source).costReduction || 0;
      for (const provider of this.controlled(0)) for (const modifier of this.module(provider).costModifiers || []) if (!modifier.test || modifier.test(this, provider, source)) reduction += modifier.amount(this, provider, source, draft.context);
      for (const effect of this.state.effects.filter(e => e.kind === 'costReduction' && e.controller === 0)) if (!effect.types || effect.types.some(t => c.types.includes(t))) reduction += effect.amount;
      cost.generic = Math.max(0, cost.generic - reduction);
    }
    return { cost, context: { kind: draft.kind === 'spell' ? 'spell' : 'ability', types: c.types, spendAsAny: this.hasStatic('spendAsAny', 0) } };
  },
  payDraftCosts(draft, payment) {
    this.validateDraft(draft);
    const quote = this.quoteDraft(draft), source = this.object(draft.source), context = draft.context;
    const costs = this.draftCosts(draft);
    validatePayment(quote.cost, this.state.players[0], quote.context, payment);
    context.costs = {}; context.castX = Number(context.inputs.x) || 0;
    context.sourceSnapshot = this.lastKnown(source);
    const paid = spendPayment(quote.cost, this.state.players[0], quote.context, payment);
    this.record('MANA_COST_PAID', { source: draft.source, payment: paid });
    for (const [index, cost] of costs.entries()) {
      const key = costKey(cost, index), ids = cost.self ? [source.id] : asArray(context.inputs[key]);
      context.costs[key] = ids.map(id => this.lastKnown(this.object(id)));
      this.record('COST_PAID', { kind: cost.kind, source: draft.source, ids, amount: cost.amount ?? cost.delta ?? null, counters: cost.type || null });
      if (cost.kind === 'tap') this.tapObjects(ids, true, 'cost', { source: draft.source });
      if (cost.kind === 'sacrifice') this.moveBatch(ids.map(id => ({ id, to: 'graveyard', cause: 'sacrifice' })));
      if (cost.kind === 'discard') this.moveBatch(ids.map(id => ({ id, to: 'graveyard', cause: 'discard' })));
      if (cost.kind === 'exile') this.moveBatch(ids.map(id => ({ id, to: 'exile', cause: 'exile-cost' })));
      if (cost.kind === 'return') this.moveBatch(ids.map(id => ({ id, to: 'hand', cause: 'return-cost' })));
      if (cost.kind === 'counter') this.addCounters(source.id, cost.type, cost.delta, 'cost');
      if (cost.kind === 'life') this.changeLife(0, -cost.amount, 'pay-life');
      if (cost.kind === 'energy') { this.state.players[0].energy -= cost.amount; this.record('ENERGY_PAID', { amount: cost.amount }); }
      if (cost.kind === 'reveal') this.record('CARDS_REVEALED_AS_COST', { ids });
    }
    return paid;
  },
  finishDraft(draft, payment = null) {
    const definition = this.draftDefinition(draft), sourceBefore = this.object(draft.source);
    const label = this.definition(sourceBefore).name + (draft.kind === 'ability' ? ` — ${definition.label || definition.id}` : '');
    const paid = this.payDraftCosts(draft, payment);
    if (definition.loyalty != null) { sourceBefore.flags.loyaltyUsed = sourceBefore.flags.loyaltyTurn === this.state.turnSerial ? (sourceBefore.flags.loyaltyUsed || 0) + 1 : 1; sourceBefore.flags.loyaltyTurn = this.state.turnSerial; }
    this.state.pending = null; this.state.actionDraft = null;
    if (draft.kind === 'plot') {
      this.moveBatch([{ id: draft.source, to: 'exile', cause: 'plot' }]);
      const source = this.object(draft.source.id);
      this.state.effects.push({ id: `permission-${this.state.nextId++}`, kind: 'permission', cards: [ref(source)], zone: 'exile', controller: 0, method: 'free', plot: true, afterTurn: this.state.turnSerial, label: 'Cast plotted card for free (sorcery speed)' });
      this.record('PLOTTED', { source: ref(source) }); return;
    }
    if (draft.kind === 'spell') {
      this.moveBatch([{ id: draft.source, to: 'stackCards', cause: 'cast' }]);
      const source = this.object(draft.source.id); source.flags.cast = true; source.flags.castX = draft.context.castX;
      draft.source = ref(source); draft.context.source = ref(source);
      if (draft.permission?.commander) this.state.commanderCasts[source.cardId] = (this.state.commanderCasts[source.cardId] || 0) + 1;
      this.touch();
    }
    const stackObject = { id: `s${this.state.nextStackId++}`, kind: draft.kind === 'spell' ? 'spell' : 'ability', source: draft.source, sourceCardId: draft.sourceCardId,
      abilityId: draft.abilityId || null, label, controller: 0, context: clone(draft.context), targets: clone(draft.targets), paid, permission: clone(draft.permission || null) };
    if (definition.mana && draft.kind === 'ability') {
      this.record('MANA_ABILITY_RESOLVED', { source: draft.source, label });
      const commands = definition.effect ? definition.effect(this, draft.context) : [];
      this.state.resolving = { object: stackObject, context: clone(draft.context), commands: asArray(commands), pc: 0, manaAbility: true };
      this.runEffects();
    } else {
      this.state.stack.push(stackObject);
      this.record('STACK_OBJECT_CREATED', { stackId: stackObject.id, kind: stackObject.kind, label, targets: stackObject.targets, paid });
      if (draft.kind === 'spell') this.emit('SPELL_CAST', { card: draft.source, controller: 0, characteristics: clone(this.characteristics(this.object(draft.source))), permission: draft.permission.id, stackId: stackObject.id });
    }
    if (this.state.castParent) {
      this.state.resolving = this.state.castParent; this.state.castParent = null; this.state.castWindow = null;
      this.runEffects();
    }
    if (this.state.paymentParent && !this.state.resolving && !this.state.pending) {
      const parent = this.state.paymentParent; this.state.paymentParent = null;
      this.state.actionDraft = parent.draft; this.state.pending = parent.pending;
      this.state.pending.suggested = suggestPayment(this.state.pending.cost, this.state.players[0], this.state.pending.context);
    }
  },
  beginPaymentManaAbility(action) {
    const source = this.object(action.id), ability = source && this.abilities(source).find(a => a.id === action.abilityId);
    requireRule(ability?.mana, 'Only mana abilities may be activated while paying.');
    requireRule(!this.state.paymentParent, 'Finish the current mana ability first.');
    if (this.state.pending.kind === 'effectPayment') {
      requireRule(!this.state.effectPaymentParent, 'Finish the current mana ability first.');
      this.state.effectPaymentParent = { frame: this.state.resolving, pending: this.state.pending };
      this.state.resolving = null;
    } else this.state.paymentParent = { draft: this.state.actionDraft, pending: this.state.pending };
    this.state.actionDraft = null; this.state.pending = null; this.beginAbility(action);
  },
  acceptChoice(value, action = {}) {
    const pending = this.state.pending; requireRule(pending, 'No choice is pending.');
    this.record('CHOICE_MADE', { kind: pending.kind, key: pending.key || null, value: clone(value) });
    if (pending.kind === 'miracleReveal') {
      const option = asArray(value)[0]; requireRule(['reveal', 'decline'].includes(option), 'Reveal the card or decline miracle.');
      const card = this.object(pending.object), continuation = this.state.drawContinuation;
      this.state.pending = null; this.state.drawContinuation = null;
      if (option === 'reveal' && card?.zone === 'hand') {
        card.flags.revealed = true;
        this.record('MIRACLE_REVEALED', { object: ref(card), cost: pending.cost });
        this.queueTrigger({ source: ref(card), sourceCardId: card.cardId, controller: card.owner, abilityId: 'miracle', label: `${this.definition(card).name} — miracle`,
          context: this.context(card), program: [{ op: 'castChoice', ids: [ref(card)], method: 'alternate', cost: pending.cost, label: `Cast for miracle ${pending.cost}?` }] });
      }
      const drawn = continuation ? this.drawCards(continuation.remaining, continuation.player, continuation.cause) : [];
      if (continuation?.resultKey && this.state.resolving) this.state.resolving.context.vars[continuation.resultKey] = [...continuation.accumulated, ...drawn];
      if (this.state.resolving && !this.state.pending) this.runEffects();
      return;
    }
    if (pending.kind === 'triggerOrder') return this.acceptTriggerOrder(value);
    if (pending.kind === 'replacement') return this.resumeReplacement(asArray(value)[0]);
    if (pending.kind === 'draft') {
      const draft = this.state.actionDraft; requireRule(draft, 'No action is being prepared.');
      draft.context.inputs[pending.key] = this.validateInput(pending, value, draft.context);
      this.state.pending = null; return this.advanceDraft();
    }
    if (pending.kind === 'payment') {
      const payment = value === 'auto' || value === true ? null : value;
      return this.finishDraft(this.state.actionDraft, payment);
    }
    if (pending.kind === 'commander') {
      const option = asArray(value)[0]; requireRule(['command', 'stay'].includes(option), 'Choose command zone or current zone.');
      const object = this.object(pending.object); this.state.pending = null;
      if (!object) return;
      object.flags.commanderChoicePending = false;
      if (option === 'command') this.moveBatch([{ id: ref(object), to: 'command', cause: 'commander-choice' }]);
      else this.record('COMMANDER_REMAINED', { object: ref(object), zone: object.zone });
      return;
    }
    if (pending.kind === 'legend') {
      const ids = asArray(value); requireRule(ids.length === 1 && pending.ids.includes(ids[0]), 'Choose one legend to keep.');
      this.state.pending = null;
      return this.moveBatch(pending.ids.filter(id => id !== ids[0]).map(id => ({ id, to: 'graveyard', cause: 'legend-rule' })));
    }
    if (pending.kind === 'mulliganBottom') {
      const ids = validateSelection(this, value, { zones: ['hand'], owner: 0 }, {}, { min: pending.min, max: pending.max });
      this.state.pending = null; this.putInLibrary(ids, 'bottom'); return this.startAfterKeep();
    }
    if (pending.kind === 'cleanupDiscard') {
      const ids = validateSelection(this, value, { zones: ['hand'], owner: 0 }, {}, { min: pending.min, max: pending.max });
      this.state.pending = null; this.moveBatch(ids.map(id => ({ id, to: 'graveyard', cause: 'discard' }))); return;
    }
    if (pending.kind === 'effect' || pending.kind === 'optional' || pending.kind === 'effectPayment' || pending.kind === 'castWindow') return this.acceptEffectChoice(value, action);
    throw new Error(`Unknown choice ${pending.kind}`);
  },
  keepHand() {
    requireRule(!this.state.started, 'The opening hand has already been kept.');
    const bottom = Math.max(0, this.state.mulligans - (this.state.settings.firstMulliganFree ? 1 : 0));
    if (bottom) {
      this.state.pending = { kind: 'mulliganBottom', label: `London mulligan: put ${bottom} cards on the bottom`, candidates: [...this.state.zones.hand], min: Math.min(bottom, this.state.zones.hand.length), max: Math.min(bottom, this.state.zones.hand.length) }; return;
    }
    this.startAfterKeep();
  },
  startAfterKeep() {
    this.state.started = true; this.state.step = 'untap'; this.state.controllerTurns ||= [1, 0, 0, 0];
    this.record('OPENING_HAND_KEPT', { hand: [...this.state.zones.hand], mulligans: this.state.mulligans });
    this.processStep('untap');
  },
  mulligan() {
    requireRule(!this.state.started, 'Mulligans are only available before starting.');
    requireRule(this.state.mulligans < 7 + (this.state.settings.firstMulliganFree ? 1 : 0), 'No further mulligans are available.');
    this.moveBatch(this.state.zones.hand.map(id => ({ id, to: 'libraryActive', cause: 'mulligan' })));
    this.shuffleLibrary();
    const ids = this.state.zones.libraryActive.slice(0, 7);
    this.moveBatch(ids.map(id => ({ id, to: 'hand', cause: 'opening-hand' })));
    this.state.mulligans++; this.record('MULLIGAN', { number: this.state.mulligans, hand: ids });
  },
  debugAction(action) {
    requireRule(this.state.settings.debug, 'Developer overrides are disabled. Enable them explicitly in Settings.', 'DEBUG_DISABLED');
    requireRule(!this.state.pending && !this.state.resolving && !this.state.actionDraft, 'Do not override a resolving action.');
    this.record('DEBUG_OVERRIDE', { action: clone(action) });
    if (action.type === 'DEBUG_SPAWN') {
      const card = this.registry.get(action.cardId || action.name), id = `d${this.state.nextId++}`;
      const object = makeInstance(id, card.id, 'workspace', integer(action.owner ?? 0, 0, 3));
      this.state.instances[id] = object; this.state.zones.workspace.push(id);
      this.moveBatch([{ id, to: action.zone || 'battlefield', cause: 'debug-spawn', controller: action.controller ?? object.owner }]);
      if (action.ready && this.object(id)) this.object(id).controlledSince = -1;
      return id;
    }
    if (action.type === 'DEBUG_MOVE') { requireRule(ZONES.includes(action.zone), 'Unknown zone.'); return this.moveBatch(asArray(action.ids || action.id).map(id => ({ id, to: action.zone, cause: action.cause || 'debug-move', tapped: action.tapped }))); }
    if (action.type === 'DEBUG_COUNTER') return this.addCounters(action.id, action.counter, integer(action.delta, -1000000, 1000000), 'debug');
    if (action.type === 'DEBUG_TAP') return this.tapObjects(asArray(action.ids || action.id), !!action.tapped, 'debug');
    if (action.type === 'DEBUG_DRAW') return this.drawCards(integer(action.count, 0, 1000));
    if (action.type === 'DEBUG_MILL') return this.millCards(integer(action.count, 0, 1000));
    if (action.type === 'DEBUG_SHUFFLE') return this.shuffleLibrary();
    if (action.type === 'DEBUG_DAMAGE') return this.dealDamage(action.id, integer(action.amount, 0, 100000));
    requireRule(false, 'Unknown developer action.');
  },
};
