import { parseDeck } from '../core/index.js';

export const DECK_POOLS = Object.freeze(['main','command','outside']);
const label = { main:'Main pool', command:'Commander', outside:'Outside the game' };
const keyOf = value => String(value || '').trim().toLowerCase();

export function deckRecords(text) {
  const parsed = parseDeck(text), merged = [];
  for (const row of parsed.records) {
    const pool = DECK_POOLS.includes(row.pool) ? row.pool : 'main', key = `${pool}\u0000${keyOf(row.name)}`;
    const existing = merged.find(item => item._key === key);
    if (existing) existing.quantity += row.quantity;
    else merged.push({ pool, quantity: row.quantity, name: row.name, _key:key });
  }
  return { ...parsed, records: merged.map(({_key,...row}) => row) };
}

export function serializeDeck(records) {
  const groups = Object.fromEntries(DECK_POOLS.map(pool => [pool, []]));
  for (const row of records) if (row.quantity > 0 && groups[row.pool]) groups[row.pool].push(row);
  const lines = [];
  for (const [index,pool] of DECK_POOLS.entries()) {
    if (index) lines.push('', `// ${pool === 'command' ? 'Commander' : pool === 'outside' ? 'Outside the Game' : 'Main'}`);
    for (const row of groups[pool]) lines.push(`${Math.max(1, Math.trunc(row.quantity))} ${row.name}`);
  }
  return lines.join('\n').trimEnd() + '\n';
}

export function editDeck(text, operation) {
  const state = deckRecords(text), records = state.records.map(row => ({...row}));
  const find = (pool,name) => records.findIndex(row => row.pool === pool && keyOf(row.name) === keyOf(name));
  if (operation.type === 'adjust') {
    const index = find(operation.pool, operation.name), delta = Math.trunc(operation.delta || 0);
    if (index >= 0) {
      records[index].quantity = Math.max(0, Math.min(1000, records[index].quantity + delta));
      if (!records[index].quantity) records.splice(index,1);
    } else if (delta > 0) records.push({pool:operation.pool, name:operation.name, quantity:Math.min(1000,delta)});
  } else if (operation.type === 'set') {
    const index = find(operation.pool, operation.name), quantity = Math.max(0, Math.min(1000, Math.trunc(operation.quantity || 0)));
    if (index >= 0) quantity ? records[index].quantity = quantity : records.splice(index,1);
    else if (quantity) records.push({pool:operation.pool,name:operation.name,quantity});
  } else if (operation.type === 'remove') {
    const index = find(operation.pool, operation.name); if (index >= 0) records.splice(index,1);
  } else if (operation.type === 'move') {
    const index = find(operation.from, operation.name); if (index >= 0 && operation.to !== operation.from) {
      const [moved] = records.splice(index,1), target = find(operation.to, operation.name);
      if (target >= 0) records[target].quantity = Math.min(1000, records[target].quantity + moved.quantity);
      else records.push({...moved,pool:operation.to});
    }
  } else if (operation.type === 'reorder') {
    const from = find(operation.pool, operation.name), before = find(operation.pool, operation.before);
    if (from >= 0 && before >= 0 && from !== before) {
      const [moved] = records.splice(from,1), adjusted = records.findIndex(row => row.pool === operation.pool && keyOf(row.name) === keyOf(operation.before));
      records.splice(adjusted,0,moved);
    }
  }
  return serializeDeck(records);
}

export function deckCounts(text, registry) {
  const {records,errors} = deckRecords(text), counts={main:0,command:0,outside:0,lands:0,nonlands:0,unsupported:0};
  const membership = {};
  for (const row of records) {
    counts[row.pool] += row.quantity;
    const key=keyOf(row.name); membership[key] ||= {main:0,command:0,outside:0}; membership[key][row.pool]+=row.quantity;
    if (!registry.has(row.name)) { counts.unsupported += row.quantity; continue; }
    if (row.pool === 'main') registry.get(row.name).types.includes('Land') ? counts.lands += row.quantity : counts.nonlands += row.quantity;
  }
  const requiredNonlands=Math.max(0,99-counts.lands),reserve=Math.max(0,counts.nonlands-requiredNonlands),activeNonlands=Math.min(counts.nonlands,requiredNonlands);
  return {...counts,reserve,activeNonlands,requiredNonlands,membership,records,parseErrors:errors};
}

export function supportedCards(registry,{query='',type='',color='',sort='name'}={}) {
  const q=String(query).trim().toLowerCase();
  const cards=registry.list().filter(card => card.candidate && (!q || `${card.name} ${card.typeLine} ${card.oracleText}`.toLowerCase().includes(q)) && (!type || card.types.includes(type)) && colorMatch(card,color));
  cards.sort((a,b)=> sort === 'mv' ? a.manaValue-b.manaValue || a.name.localeCompare(b.name) : sort === 'type' ? a.typeLine.localeCompare(b.typeLine)||a.name.localeCompare(b.name) : a.name.localeCompare(b.name));
  return cards;
}
function colorMatch(card,color){
  if(!color)return true;const id=card.colorIdentity||[];
  if(color==='C')return id.length===0;if(color==='M')return id.length>1;return id.includes(color);
}
export function poolLabel(pool){return label[pool]||pool;}
