import { COLORS } from '../core/index.js';
import { escapeHTML } from '../core/util.js';
export const h = escapeHTML;
const assetURLs = new Map();
export function asset(path) {
  const embedded=globalThis.ASTRA_IMAGES?.[path];if(!embedded)return path;
  if(assetURLs.has(path))return assetURLs.get(path);
  // The cache is presentation-only. Game state and save files contain paths.
  const match=/^data:([^;,]+);base64,(.*)$/.exec(embedded);
  if(!match)return embedded;
  const binary=atob(match[2]),bytes=new Uint8Array(binary.length);
  for(let i=0;i<binary.length;i++)bytes[i]=binary.charCodeAt(i);
  const url=URL.createObjectURL(new Blob([bytes],{type:match[1]}));assetURLs.set(path,url);return url;
}
export const STEP_NAMES = {setup:'Opening hand',untap:'Untap',upkeep:'Upkeep',draw:'Draw',main1:'Main 1',beginCombat:'Combat',attackers:'Attack',damage:'Damage',endCombat:'End combat',main2:'Main 2',end:'End',cleanup:'Cleanup'};
export const ZONE_NAMES = {battlefield:'Battlefield',graveyard:'Graveyard',exile:'Exile',workspace:'Look',outside:'Outside the game',hand:'Hand',command:'Command zone',libraryActive:'Library',libraryReserve:'Reserve',stackCards:'Stack'};
export const logo = '<svg viewBox="0 0 48 48" aria-hidden="true"><path d="M24 5 44 41H4L24 5ZM13 26h24M19 16h17" fill="none" stroke="currentColor" stroke-width="1.4"/></svg>';
export function button(label, action, attrs = '', kind = '') { return `<button type="button" class="${h(kind)}" data-action="${h(action)}" ${attrs}>${label}</button>`; }
export function symbol(color) { return `<span class="mana-symbol mana-${h(color)}" title="${h({W:'White',U:'Blue',B:'Black',R:'Red',G:'Green',C:'Colorless'}[color] || color)}">${h(color)}</span>`; }
export function manaText(text) { return h(text || '{0}').replace(/\{([^}]+)\}/g, (_, c) => symbol(c)); }
export function empty(title, text = '') { return `<div class="empty">${logo}<h3>${h(title)}</h3><p>${h(text)}</p></div>`; }
export function cardHTML(engine, id, options = {}) {
  const object = engine.object(id); if (!object) return '';
  const card = engine.definition(object), c = engine.characteristics(object), selected = options.selected?.has(id), legal = options.legal?.includes(id);
  const positioned = options.positioned && object.location;
  const badges = [...Object.entries(object.counters).filter(([,n])=>n).map(([k,n])=>`${n} ${k}`), ...(object.token?['Token']:[]), ...(object.commander?['Commander']:[])];
  if (engine.isSick(object) && object.zone === 'battlefield') badges.push('New');
  if (object.flags.attacking) badges.push('Attacking');
  if (object.damage) badges.push(`${object.damage} damage`);
  const style = positioned ? `left:${object.location.x}px;top:${object.location.y}px;position:absolute` : '';
  return `<article class="card ${object.tapped?'is-tapped':''} ${selected?'is-selected':''} ${legal?'is-legal':''} ${options.small?'small-card':''}" data-card="${h(id)}" data-zone="${h(object.zone)}" style="${style}" aria-label="${h(card.name)}${object.tapped?', tapped':''}">
    <button class="card-face" data-action="card" data-id="${h(id)}" aria-label="${h(card.name)}${object.tapped?', tapped':''}" title="${h(card.name)} — ${h(object.zone==='battlefield'?'Click for a mana ability; use the name to inspect':'Inspect and choose an action')}"><img src="${h(asset(object.face && card.backImage ? card.backImage : card.image))}" alt="${h(card.name)}" loading="lazy" draggable="false"><span class="card-fallback">${h(card.name)}</span>${object.tapped?'<span class="tap-badge">Tapped</span>':''}${c.types.includes('Creature')?`<span class="pt-badge">${h(c.power)}/${h(c.toughness)}</span>`:''}</button>
    ${button(h(card.name),'inspect',`data-id="${h(id)}" title="Inspect ${h(card.name)}"`,'card-name')}
    ${badges.length?`<div class="card-badges">${badges.map(b=>`<span>${h(b)}</span>`).join('')}</div>`:''}
  </article>`;
}
export function manaPoolHTML(player) {
  return `<div class="mana-grid">${COLORS.map(c=>`<div class="mana-cell"><div>${symbol(c)}<strong>${player.mana[c]}</strong></div><div class="split">${button('−','mana',`data-color="${c}" data-delta="-1" aria-label="Remove ${c} mana" ${player.mana[c]===0?'disabled':''}`)}${button('+','mana',`data-color="${c}" data-delta="1" aria-label="Add ${c} mana"`)}</div></div>`).join('')}</div>${player.restrictedMana.map(t=>`<div class="restricted-mana">${symbol(t.color)} <b>${t.amount}</b> · ${h(t.restriction)}</div>`).join('')}`;
}
export function saveDownload(name, value, type = 'application/json') {
  const blob = new Blob([typeof value === 'string' ? value : JSON.stringify(value,null,2)], {type});
  const url = URL.createObjectURL(blob), link = document.createElement('a');
  link.href = url; link.download = name; document.body.append(link); link.click(); link.remove(); setTimeout(()=>URL.revokeObjectURL(url),1000);
}
