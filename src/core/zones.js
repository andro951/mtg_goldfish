import { clone, ref, sameRef, asArray, unique, requireRule, integer, COLORS } from './util.js';
import { makeInstance } from './deck.js';

/** All physical zone changes, LKI, replacements and state-based actions live here. */
export const zoneMethods = {
  moveBatch(requests, context = {}) {
    const moves = requests.filter(m => this.object(m.id)).map(m => ({ cause: 'effect', ...clone(m) }));
    if (!moves.length) return [];
    requireRule(unique(moves.map(m => typeof m.id === 'string' ? m.id : m.id.id)).length === moves.length, 'A simultaneous move cannot include a card twice.');
    const beforeSources = this.objects('battlefield').map(o => this.lastKnown(o));
    const prepared = [];
    for (const move of moves) {
      const object = this.object(move.id); if (!object) continue;
      if (object.token && object.flags.leftBattlefield && move.to === 'battlefield') continue;
      if (move.from && object.zone !== move.from) continue;
      if (move.cause === 'destroy' && this.characteristics(object).keywords.includes('Indestructible')) { this.record('DESTRUCTION_PREVENTED', { object: ref(object), reason: 'Indestructible' }); continue; }
      if (object.zone === move.to && !move.position) continue;
      const lki = this.lastKnown(object), proposal = { ...move, id: object.id, from: object.zone, tapped: !!move.tapped };
      if (proposal.to === 'battlefield') {
        const module = this.module(object);
        if (module.entersTapped) proposal.tapped = true;
        if (module.entryTapped) proposal.tapped=!!module.entryTapped(this,object,context);
        const replacements = beforeSources.flatMap(source => (this.module(source).replacements || []).map(rule => ({ source, rule })))
          .filter(({ source, rule }) => rule.match(this, source, object, proposal, context));
        for (const effect of this.state.effects.filter(e => e.kind === 'landsEnterTapped' && e.controller === (move.controller ?? object.owner)))
          if (this.characteristics(object).types.includes('Land')) replacements.push({ source: null, rule: { id: effect.id, entryTapped: true, transform: p => { p.tapped = true; } } });
        const directions = unique(replacements.map(r => r.rule.entryTapped).filter(v => typeof v === 'boolean'));
        if (directions.length > 1 && context.entryOverrides?.[object.id] == null) {
          this.state.deferredMove = { moves, context: clone(context), objectId: object.id };
          this.state.pending = { kind: 'replacement', label: `${this.definition(object).name}: choose replacement order`, description: 'Both tapped and untapped entry effects apply. Choose the final entry state.',
            options: [{ value: 'untapped', label: 'Enter untapped (apply untapped replacement last)' }, { value: 'tapped', label: 'Enter tapped (apply tapped replacement last)' }], min: 1, max: 1 };
          return null;
        }
        for (const { source, rule } of replacements) {
          rule.transform(proposal, this, source, object, context);
          this.record('REPLACEMENT_APPLIED', { rule: rule.id, source: ref(source), object: ref(object), entryTapped: proposal.tapped });
        }
        if (context.entryOverrides?.[object.id] != null) proposal.tapped = context.entryOverrides[object.id];
      }
      if(object.flags.unearthed&&proposal.from==='battlefield'&&proposal.to!=='exile'){proposal.to='exile';this.record('REPLACEMENT_APPLIED',{rule:'unearth',object:ref(object),destination:'exile'});}
      if (proposal.from === 'battlefield' && proposal.to === 'graveyard' && (object.counters.finality || 0) > 0) {
        proposal.to = 'exile'; this.record('REPLACEMENT_APPLIED', { rule: 'finality-counter', object: ref(object), destination: 'exile' });
      }
      prepared.push({ object, lki, proposal });
    }
    const batchId = this.state.nextBatchId++, changes = [];
    for (const { object, lki, proposal } of prepared) {
      const from = object.zone, to = proposal.to;
      requireRule(this.state.zones[to], `Unknown destination ${to}.`);
      const fromList = this.state.zones[from];
      fromList.splice(fromList.indexOf(object.id), 1);
      if (from === to) {
        const target = this.state.zones[to]; if (proposal.position === 'bottom') target.push(object.id); else target.unshift(object.id);
        continue;
      }
      const tablePlacement = clone(object.flags.tablePlacement || null);
      const wasCast = from === 'stackCards' && !!object.flags.cast;
      const castFlags={...(object.flags.escaped?{escaped:true}:{}),...(object.flags.warped?{warped:true}:{})};
      const castX = object.flags.castX || 0, prototype = clone(object.flags.prototype || null);
      const spawnCopy = object.token && from === 'workspace' ? clone(object.copy) : null;
      const meldParts = clone(object.flags.meldParts || null);
      object.oid++; object.face=proposal.face??0; object.zone = to; object.controller = proposal.controller ?? object.owner;
      object.tapped = false; object.counters = {}; object.damage = 0; object.attachedTo = null;
      object.modifications = []; object.copy = spawnCopy; object.attacksThisTurn = 0; object.location = null;
      object.flags = { ...(object.token && (lki.flags.hasBeenOnBattlefield || from === 'battlefield') ? { hasBeenOnBattlefield: true, leftBattlefield: true } : {}), ...(proposal.flags || {}) };
      if (tablePlacement && ['stackCards','battlefield'].includes(to)) {
        if(to==='stackCards')object.flags.tablePlacement=tablePlacement;
        else {
          object.location={x:tablePlacement.x,y:tablePlacement.y,anchor:'corner-v2'};
          tablePlacement.order.forEach((id,index)=>{const target=this.object(id);if(target)target.flags.tableZ=index;});
        }
      }
      if (to === 'battlefield') {
        if(wasCast)Object.assign(object.flags,castFlags);
        object.enteredTurn = this.state.turnSerial; object.controlledSince = this.state.turnSerial;
        object.tapped = proposal.tapped; object.flags.cast = wasCast; object.flags.castX = castX;
        if (prototype) object.flags.prototype = prototype;
        if (object.token) object.flags.hasBeenOnBattlefield = true;
        if (proposal.copy) object.copy = clone(proposal.copy);
        const module = this.module(object), definition = this.definition(object);
        if (definition.types.includes('Planeswalker')) object.counters.loyalty = Number(definition.loyalty) || 0;
        if (module.entersCounters) Object.assign(object.counters, typeof module.entersCounters === 'function' ? module.entersCounters(this, object) : module.entersCounters);
        if (module.saga) object.counters.lore = 1;
        if (proposal.counters) for (const [type, amount] of Object.entries(proposal.counters)) object.counters[type] = (object.counters[type] || 0) + amount;
        if (proposal.modifications) object.modifications.push(...clone(proposal.modifications));
        if (proposal.copy) object.copy = clone(proposal.copy);
        if (proposal.attachedTo) object.attachedTo = clone(proposal.attachedTo);
      }
      const toList = this.state.zones[to];
      if (proposal.position === 'top') toList.unshift(object.id); else toList.push(object.id);
      object.lastMove = { from, to, cause: proposal.cause, turnSerial: this.state.turnSerial, batchId, oid: object.oid };
      if (object.commander && to !== 'command' && ['graveyard', 'exile', 'hand', 'libraryActive', 'libraryReserve'].includes(to) && proposal.cause !== 'commander-declined') object.flags.commanderChoicePending = true;
      const change = { id: object.id, from, to, cause: proposal.cause, batchId, beforeRef: ref(lki), afterRef: ref(object), lki };
      this.state.provenance.push({ ...clone(change), turnSerial: this.state.turnSerial });
      changes.push(change);
      if (meldParts && from === 'battlefield') {
        // A merged permanent leaves once, but both physical cards get zone
        // histories so later this-turn recursion can find either front face.
        for (const partId of meldParts.filter(id => id !== object.id)) {
          const part = this.state.instances[partId];
          if (part && part.zone === 'workspace' && part.flags.meldedInto === object.id) {
            const beforeRef = ref(part);
            this.state.zones.workspace.splice(this.state.zones.workspace.indexOf(partId), 1);
            part.zone = to; part.oid++; part.tapped = false; part.counters = {}; part.flags = {}; part.copy = null;
            part.lastMove = { from: 'battlefield', to, cause: proposal.cause, turnSerial: this.state.turnSerial, batchId, oid: part.oid };
            this.state.zones[to].push(part.id);
            const component = { id: part.id, from: 'battlefield', to, cause: proposal.cause, batchId, beforeRef, afterRef: ref(part), lki: clone(lki), componentOnly: true };
            this.state.provenance.push({ ...clone(component), turnSerial: this.state.turnSerial }); changes.push(component);
          }
        }
        object.copy = null;
      }
    }
    this.touch(); this.state.activeLibraryBoundary = this.state.zones.libraryActive.length;
    for (const change of changes) change.object = this.lastKnown(this.state.instances[change.id]);
    if (changes.length) this.emit('ZONE_BATCH', { batchId, changes }, beforeSources);
    for (const change of changes) {
      this.emit('ZONE_CHANGE', { batchId, change }, beforeSources);
      if (change.from === 'battlefield' && !change.componentOnly) {
        this.emit('LEAVE', { batchId, change }, beforeSources);
        if (change.cause === 'sacrifice') this.emit('SACRIFICED', { batchId, change }, beforeSources);
        if (change.to === 'graveyard' && change.lki.characteristics.types.includes('Creature')) this.emit('DIED', { batchId, change }, beforeSources);
      }
      if (change.cause === 'discard') this.emit('DISCARDED', { batchId, change }, beforeSources);
      if (change.to === 'battlefield') this.emit('ENTER', { batchId, change });
    }
    // Entering with counters isn't putting them on after entry; Saga chapter
    // triggers nevertheless see the first lore counter on the entering object.
    for (const change of changes.filter(c => c.to === 'battlefield')) {
      const object = this.object(change.afterRef);
      if (object && this.module(object).saga) this.emit('SAGA_LORE', { object: ref(object), from: 0, to: object.counters.lore, batchId });
    }
    return changes;
  },
  resumeReplacement(value) {
    requireRule(['tapped', 'untapped'].includes(value), 'Choose an entry state.');
    const deferred = this.state.deferredMove;
    requireRule(deferred, 'No replacement is waiting.');
    deferred.context.entryOverrides ||= {}; deferred.context.entryOverrides[deferred.objectId] = value === 'tapped';
    this.state.deferredMove = null; this.state.pending = null;
    this.record('REPLACEMENT_ORDER_CHOSEN', { objectId: deferred.objectId, entryTapped: value === 'tapped' });
    this.moveBatch(deferred.moves, deferred.context);
    if (this.state.resolving && !this.state.pending) this.runEffects();
  },
  tapObjects(ids, tapped, cause = 'effect', context = {}) {
    const batchId = this.state.nextBatchId++;
    for (const id of unique(asArray(ids).map(r => typeof r === 'string' ? r : r.id))) {
      const object = this.object(id); if (!object || object.zone !== 'battlefield' || object.tapped === tapped) continue;
      object.tapped = tapped; this.touch();
      this.emit(tapped ? 'BECAME_TAPPED' : 'BECAME_UNTAPPED', { object: ref(object), batchId, cause, context: clone(context) });
    }
  },
  addCounters(idOrRef, type, amount, cause = 'effect') {
    const object = this.object(idOrRef); if (!object || object.zone !== 'battlefield') return;
    const from = object.counters[type] || 0, to = Math.max(0, from + Number(amount));
    if (from === to) return;
    object.counters[type] = to; this.touch();
    this.emit('COUNTER_CHANGED', { object: ref(object), type, from, to, cause });
    if (type === 'lore') this.emit('SAGA_LORE', { object: ref(object), from, to });
  },
  addMana(player, production, source = null, restriction = null) {
    const p = this.manaPlayer(player);
    for (const [color, value] of Object.entries(production)) {
      requireRule(COLORS.includes(color), `Invalid mana color ${color}.`);
      const amount = integer(value, 0, 1000000, 'Mana production');
      if (!amount) continue;
      if (restriction) p.restrictedMana.push({ id: `m${this.state.nextId++}`, color, amount, restriction, source: clone(source) });
      else p.mana[color] += amount;
    }
    this.emit('MANA_ADDED', { player, production, source: clone(source), restriction });
  },
  playerProtected(player, fromController = null) {
    return this.state.effects.some(e => e.kind === 'protection' && e.player === player);
  },
  changeLife(player, amount, reason = 'effect') {
    this.manaPlayer(player).life += amount; this.emit('LIFE_CHANGED', { player, amount, reason });
  },
  dealDamage(target, amount, context = {}) {
    const n = Math.max(0, Number(amount) || 0);
    if (typeof target === 'number' || target?.player != null) {
      const player = typeof target === 'number' ? target : target.player;
      if (this.playerProtected(player, context.controller)) { this.record('DAMAGE_PREVENTED', { player, amount: n, reason: 'Protection' }); return; }
      this.changeLife(player, -n, 'damage');
    } else {
      const object = this.object(target); if (!object || object.zone !== 'battlefield') return;
      if (this.characteristics(object).keywords.includes('Protection from everything')) return;
      if (this.characteristics(object).types.includes('Planeswalker')) this.addCounters(object.id, 'loyalty', -n, 'damage');
      else { object.damage += n; this.touch(); }
    }
    this.emit('DAMAGE_DEALT', { target: clone(target), amount: n, source: context.source || null });
  },
  drawCards(count = 1, player = 0, cause = 'draw') {
    const result = [];
    for (let index = 0; index < count; index++) {
      if (player !== 0 && !this.activeLibrary(player).length) { this.state.players[player].abstractHand++; this.emit('DRAW', { player, abstract: true }); continue; }
      const object = this.top(player);
      if (!object) { this.state.players[player].failedDraw = true; this.record('DRAW_EMPTY', { player }); break; }
      if (object.zone === 'libraryReserve') { this.state.reserveReached = true; this.record('RESERVE_REACHED', { object: ref(object) }); }
      const changes = this.moveBatch([{ id: ref(object), to: 'hand', cause }]);
      if (changes?.length) {
        const card = this.object(object.id), key = `draw:${player}:${this.state.turnSerial}:${this.state.activePlayer}`;
        this.state.turnCounts[key] = (this.state.turnCounts[key] || 0) + 1;
        const first = this.state.turnCounts[key] === 1;
        this.emit('DRAW', { player, card: ref(card), first, amount: 1 }); result.push(card.id);
        if (first && player === 0 && this.module(card).miracle) {
          // Reveal during this particular draw, before the next card is drawn.
          // The resulting triggered ability still waits for the whole effect.
          this.state.drawContinuation = { remaining: count - index - 1, player, cause, accumulated: [...result] };
          this.state.pending = { kind: 'miracleReveal', key: 'miracle-reveal', label: `Reveal ${this.definition(card).name} for miracle?`, object: ref(card), cost: this.module(card).miracle,
            optional: true, options: [{ value: 'reveal', label: 'Reveal for miracle' }, { value: 'decline', label: 'Do not reveal' }] };
          break;
        }
      }
    }
    return result;
  },
  millCards(count, player = 0) {
    const ids = this.activeLibrary(player).slice(0, Math.max(0, Number(count) || 0));
    if (ids.length < count && !this.state.reserveAccess) {
      const more = this.objects('libraryReserve', player).map(o => o.id).slice(0, count - ids.length);
      ids.push(...more);
    }
    const changes = this.moveBatch(ids.map(id => ({ id, to: 'graveyard', cause: 'mill' })));
    this.emit('MILLED', { player, ids, batchId: changes?.[0]?.batchId ?? null }); return changes || [];
  },
  shuffleLibrary(player = 0) {
    const zone = this.state.zones.libraryActive, own = zone.filter(id => this.state.instances[id].owner === player);
    const random = this.randomShuffle(own, 'library-shuffle'); let i = 0;
    this.state.zones.libraryActive = zone.map(id => this.state.instances[id].owner === player ? random[i++] : id);
    // The harness reserve is intentionally not mixed into the active deck.
    if (!own.length && this.canAccessReserve()) this.state.zones.libraryReserve = this.randomShuffle(this.state.zones.libraryReserve, 'exhausted-reserve-shuffle');
    this.record('LIBRARY_SHUFFLED', { player, activeCount: own.length, reservePreserved: true });
  },
  putInLibrary(ids, position = 'top', random = false) {
    const cards = asArray(ids).filter(id => this.object(id));
    const ordered = random ? this.randomShuffle(cards, 'random-bottom') : cards;
    const moving = ordered.filter(id => !['libraryActive', 'libraryReserve'].includes(this.object(id).zone));
    if (moving.length) this.moveBatch(moving.map(id => ({ id, to: 'libraryActive', cause: 'put-library' })));
    for (const id of ordered) {
      const object = this.object(id); if (!object) continue;
      const list = this.state.zones[object.zone]; list.splice(list.indexOf(object.id), 1);
      object.zone = 'libraryActive';
    }
    if (position === 'top') this.state.zones.libraryActive.unshift(...ordered); else this.state.zones.libraryActive.push(...ordered);
    this.state.activeLibraryBoundary = this.state.zones.libraryActive.length;
    this.record('LIBRARY_ORDERED', { position, ids: ordered, random });
  },
  createToken(cardIdOrName, count = 1, controller = 0, options = {}) {
    const definition = this.registry.get(cardIdOrName), ids = [];
    for (let i = 0; i < count; i++) {
      const id = `t${this.state.nextId++}`, object = makeInstance(id, definition.id, 'workspace', controller);
      object.token = true; object.copy = options.copy ? clone(options.copy) : null;
      this.state.instances[id] = object; this.state.zones.workspace.push(id); ids.push(id);
    }
    this.touch(); this.moveBatch(ids.map(id => ({ id, to: 'battlefield', cause: 'create-token', controller, tapped: options.tapped, counters: options.counters, modifications: options.modifications })));
    return ids;
  },
  copiableValues(objectOrSnapshot, exceptions = {}) {
    const object = typeof objectOrSnapshot === 'string' ? this.object(objectOrSnapshot) : objectOrSnapshot;
    const base = clone(object.copy || object.definition || this.registry.get(object.cardId));
    base.rulesId = object.copy?.rulesId || object.cardId;
    if (exceptions.addTypes) base.types = unique([...base.types, ...exceptions.addTypes]);
    if (exceptions.addSubtypes) base.subtypes = unique([...base.subtypes, ...exceptions.addSubtypes]);
    if (exceptions.power != null) base.power = String(exceptions.power);
    if (exceptions.toughness != null) base.toughness = String(exceptions.toughness);
    if (exceptions.colors) base.colors = [...exceptions.colors];
    return base;
  },
  copyToken(snapshot, controller, exceptions = {}) {
    return this.createToken(snapshot.cardId, 1, controller, { copy: this.copiableValues(snapshot, exceptions) });
  },
  attach(sourceRef, targetRef) {
    const source = this.object(sourceRef), target = targetRef ? this.object(targetRef) : null;
    if (!source || source.zone !== 'battlefield') return;
    if (target && (target.zone !== 'battlefield' || !this.characteristics(target).types.includes('Creature'))) return;
    source.attachedTo = ref(target); this.touch(); this.emit('ATTACHED', { object: ref(source), target: ref(target) });
  },
  checkStateActions() {
    const death = [], keepChoices = [], cancelCounters = [];
    for (const object of this.objects('battlefield')) {
      const c = this.characteristics(object);
      if (c.types.includes('Creature') && (c.toughness <= 0 || (object.damage >= c.toughness && !c.keywords.includes('Indestructible')))) death.push({ id: ref(object), to: 'graveyard', cause: c.toughness <= 0 ? 'zero-toughness' : 'destroy' });
      else if (c.types.includes('Planeswalker') && (object.counters.loyalty || 0) <= 0) death.push({ id: ref(object), to: 'graveyard', cause: 'zero-loyalty' });
      else if (this.module(object).saga && (object.counters.lore || 0) >= this.module(object).saga) {
        const awaiting = [...this.state.pendingTriggers, ...this.state.stack, ...(this.state.triggersToPlace || []), ...(this.state.triggerGroups || []).flatMap(g => g.triggers)]
          .some(t => sameRef(t.source, object) && t.kind === 'trigger' && String(t.abilityId).startsWith('chapter-'));
        if (!awaiting && !sameRef(this.state.resolving?.object?.source, object)) death.push({ id: ref(object), to: 'graveyard', cause: 'sacrifice' });
      }
      if (object.attachedTo) {
        const target = this.object(object.attachedTo);
        if (!target || target.zone !== 'battlefield' || !this.characteristics(target).types.includes('Creature')) { object.attachedTo = null; this.touch(); }
      }
      if (c.subtypes.includes('Aura') && !object.attachedTo && !death.some(m => m.id.id === object.id)) death.push({ id: ref(object), to: 'graveyard', cause: 'unattached-aura' });
      const plus = object.counters['+1/+1'] || 0, minus = object.counters['-1/-1'] || 0;
      if (plus && minus) cancelCounters.push({object:ref(object),amount:Math.min(plus,minus)});
    }
    // Simultaneous SBAs use the pre-SBA last known counters for dying objects.
    // Removing +1/+1 and -1/-1 counters first would wrongly enable persist.
    if (death.length) this.moveBatch(death);
    for (const cancel of cancelCounters) { const o=this.object(cancel.object);if(o){o.counters['+1/+1']-=cancel.amount;o.counters['-1/-1']-=cancel.amount;this.touch();} }
    if (death.length) return true;
    for (const object of Object.values(this.state.instances)) {
      if (object.token && object.zone !== 'battlefield' && object.flags.hasBeenOnBattlefield && object.zone !== 'void') {
        const zone = this.state.zones[object.zone]; zone.splice(zone.indexOf(object.id), 1);
        object.zone = 'void'; this.touch(); this.record('TOKEN_CEASED', { object: ref(object) }); return true;
      }
      if (object.flags.commanderChoicePending) {
        this.state.pending = { kind: 'commander', label: `Move ${this.definition(object).name} to the command zone?`, object: ref(object), min: 1, max: 1,
          options: [{ value: 'command', label: 'Move to command zone' }, { value: 'stay', label: `Leave in ${object.zone}` }] };
        return false;
      }
    }
    const legends = new Map();
    for (const object of this.objects('battlefield')) {
      const c = this.characteristics(object); if (!c.supertypes.includes('Legendary')) continue;
      const key = `${object.controller}:${c.name}`; if (!legends.has(key)) legends.set(key, []); legends.get(key).push(object.id);
    }
    for (const [key, ids] of legends) if (ids.length > 1) {
      this.state.pending = { kind: 'legend', label: `Legend rule: choose one ${this.definition(this.object(ids[0])).name} to keep`, candidates: ids, min: 1, max: 1, ids };
      return false;
    }
    for (const player of this.state.players) if (!player.lost && (player.life <= 0 || player.poison >= 10 || player.failedDraw || Object.values(player.commanderDamage).some(n => n >= 21))) {
      player.lost = true; this.record('PLAYER_LOST', { player: player.id, life: player.life, poison: player.poison, emptyDraw: !!player.failedDraw });
      if (player.id === 0) this.state.status = 'lost';
    }
    if (this.state.players.slice(1).every(p => p.lost)) this.state.status = 'won';
    return false;
  },
};
