import { COLORS, emptyMana, integer, requireRule, clone, sum } from './util.js';

/** Colored/colorless/hybrid/Phyrexian costs; generic reduction never changes MV. */
export function parseManaCost(text = '', options = {}) {
  const cost = { generic: 0, colored: emptyMana(), life: 0, symbols: [] };
  for (const [, symbol] of String(text).matchAll(/\{([^}]+)\}/g)) {
    cost.symbols.push(symbol);
    if (/^\d+$/.test(symbol)) cost.generic += Number(symbol);
    else if (symbol === 'X') cost.generic += integer(options.x ?? 0);
    else if (COLORS.includes(symbol)) cost.colored[symbol]++;
    else if (symbol.includes('/')) {
      const parts = symbol.split('/');
      const selected = options.hybrid?.[symbol] ?? (parts.includes('P') && options.phyrexianLife ? 'P' : parts[0]);
      requireRule(parts.includes(selected), `Invalid payment choice for {${symbol}}.`);
      if (selected === 'P') cost.life += 2;
      else if (/^\d+$/.test(selected)) cost.generic += Number(selected);
      else { requireRule(COLORS.includes(selected), `Unsupported mana symbol {${symbol}}.`); cost.colored[selected]++; }
    } else throw new Error(`Unsupported mana symbol {${symbol}}`);
  }
  return cost;
}
export function manaCostText(cost) {
  const parts = [];
  if (cost.generic) parts.push(`{${cost.generic}}`);
  for (const color of COLORS) for (let i = 0; i < (cost.colored[color] || 0); i++) parts.push(`{${color}}`);
  return (parts.join('') || '{0}') + (cost.life ? ` + ${cost.life} life` : '');
}
export function restrictionAllows(tag, context = {}) {
  if (!tag.restriction) return true;
  if (tag.restriction === 'artifactSpell') return context.kind === 'spell' && context.types?.includes('Artifact');
  if (tag.restriction === 'notNonartifactSpell') return context.kind !== 'spell' || context.types?.includes('Artifact');
  if (tag.restriction === 'artifactSpellOrAbility') return ['spell', 'ability'].includes(context.kind) && context.types?.includes('Artifact');
  if (tag.restriction === 'creatureSpell') return context.kind === 'spell' && context.types?.includes('Creature');
  return false;
}

/** Suggest a pool allocation only. This never taps or activates a permanent. */
export function suggestPayment(cost, player, context = {}) {
  const buckets = ['C', 'W', 'U', 'B', 'R', 'G'].map(color => ({ color, available: player.mana[color] || 0, id: null }));
  for (const tag of player.restrictedMana || []) if (restrictionAllows(tag, context)) buckets.unshift({ color: tag.color, available: tag.amount, id: tag.id });
  const normal = emptyMana(), tagged = [];
  const use = bucket => {
    bucket.available--;
    if (bucket.id) { const found = tagged.find(t => t.id === bucket.id); if (found) found.amount++; else tagged.push({ id: bucket.id, amount: 1 }); }
    else normal[bucket.color]++;
  };
  for (const color of COLORS) for (let n = 0; n < (cost.colored[color] || 0); n++) {
    const exact = buckets.find(b => b.color === color && b.available > 0);
    const any = context.spendAsAny && color !== 'C' ? buckets.find(b => b.available > 0) : null;
    if (!(exact || any)) return null;
    use(exact || any);
  }
  // Reserve all specifically required symbols first. For the generic portion,
  // prefer real colorless mana, then the largest eligible remaining color pool.
  // Ties are deterministic; restricted mana is used first within the same color.
  const totals = Object.fromEntries(COLORS.map(c => [c, sum(buckets.filter(b => b.color === c).map(b => b.available))]));
  const genericOrder = ['C', ...COLORS.filter(c => c !== 'C').sort((a, b) => totals[b] - totals[a] || COLORS.indexOf(a) - COLORS.indexOf(b))];
  let remaining = cost.generic;
  for (const color of genericOrder) for (const bucket of buckets.filter(b => b.color === color)) {
    const amount = Math.min(remaining, bucket.available);
    if (amount <= 0) continue;
    bucket.available -= amount; remaining -= amount;
    if (bucket.id) { const found = tagged.find(t => t.id === bucket.id); if (found) found.amount += amount; else tagged.push({ id: bucket.id, amount }); }
    else normal[color] += amount;
  }
  if (remaining) return null;
  if (player.life < cost.life) return null;
  return { normal, tagged };
}

export function validatePayment(cost, player, context = {}, proposed = null) {
  const payment = proposed || suggestPayment(cost, player, context);
  requireRule(payment, `Not enough mana in your pool to pay ${manaCostText(cost)}. Activate mana abilities first; lands are never auto-tapped.`, 'INSUFFICIENT_MANA');
  const normal = emptyMana(), tagged = [], paidColors = emptyMana();
  for (const color of COLORS) {
    const amount = integer(payment.normal?.[color] ?? payment[color] ?? 0, 0, 1000000, 'Mana payment');
    requireRule(amount <= player.mana[color], `You do not have ${amount} ${color} mana.`, 'INSUFFICIENT_MANA');
    normal[color] = amount; paidColors[color] += amount;
  }
  const used = new Set();
  for (const supplied of payment.tagged || []) {
    requireRule(!used.has(supplied.id), 'Restricted mana entry was repeated.', 'INVALID_PAYMENT'); used.add(supplied.id);
    const tag = player.restrictedMana.find(t => t.id === supplied.id);
    const amount = integer(supplied.amount, 0, 1000000);
    requireRule(tag && restrictionAllows(tag, context), 'That restricted mana cannot pay this cost.', 'MANA_RESTRICTION');
    requireRule(amount <= tag.amount, 'Not enough restricted mana.', 'INSUFFICIENT_MANA');
    tagged.push({ id: tag.id, amount }); paidColors[tag.color] += amount;
  }
  const required = cost.generic + sum(COLORS.map(c => cost.colored[c] || 0));
  requireRule(sum(Object.values(paidColors)) === required, `Allocate exactly ${required} mana.`, 'INVALID_PAYMENT');
  for (const color of COLORS) {
    if (context.spendAsAny && color !== 'C') continue;
    requireRule(paidColors[color] >= (cost.colored[color] || 0), `Payment requires ${(cost.colored[color] || 0)} ${color} mana.`, 'INVALID_PAYMENT');
  }
  requireRule(player.life >= cost.life, 'Not enough life to pay this cost.', 'INSUFFICIENT_LIFE');
  return { normal, tagged };
}

export function spendPayment(cost, player, context = {}, proposed = null) {
  const payment = validatePayment(cost, player, context, proposed);
  for (const color of COLORS) player.mana[color] -= payment.normal[color];
  for (const paid of payment.tagged) player.restrictedMana.find(t => t.id === paid.id).amount -= paid.amount;
  player.restrictedMana = player.restrictedMana.filter(t => t.amount > 0);
  player.life -= cost.life;
  return { ...clone(payment), life: cost.life, cost: manaCostText(cost) };
}
