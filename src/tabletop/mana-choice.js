import { h } from '../ui/components.js';

export const MANA_NAMES = { W:'White', U:'Blue', B:'Black', R:'Red', G:'Green', C:'Colorless' };
// Compact, locally drawn pictograms: no font or network dependency.
const glyphs = {
  W:'<circle cx="12" cy="12" r="4.2"/><path d="M12 1v4m0 14v4M1 12h4m14 0h4M4.2 4.2l2.9 2.9m9.8 9.8 2.9 2.9M4.2 19.8l2.9-2.9m9.8-9.8 2.9-2.9" fill="none" stroke="currentColor" stroke-width="2"/>',
  U:'<path d="M12 1C10 6 4.5 10 4.5 15.3a7.5 7.5 0 0 0 15 0C19.5 10 14 6 12 1Zm-4 14c0 2 1 3 3 4-3 .4-5-2-3-4Z" fill-rule="evenodd"/>',
  B:'<path d="M12 2C5 2 2 6.6 2 12c0 3 2 5 5 5v5h3v-4h1v4h2v-4h1v4h3v-5c3 0 5-2 5-5 0-5.4-3-10-10-10ZM5 10h5v4H6Zm9 0h5l-1 4h-4Zm-3 6 1-3 1 3Z" fill-rule="evenodd"/>',
  R:'<path d="M13 1c2 6-5 7-3 12 1-3 5-3 5-7 7 7 9 14-1 17H8C-2 15 6 11 7 6c-1 5 1 4 2 2 1-2 2-4 4-7Zm0 12c1 4-3 4-3 7 6 1 8-3 3-7Z" fill-rule="evenodd"/>',
  G:'<path d="M10 14H7c-4 0-6-3-4-6 0-3 2-4 5-4 1-4 7-4 8 0 4-1 6 3 4 5 4 5 0 8-6 7v3l5 3H5l5-3Zm1-5v8h2V8l-1 3Zm-5 2 4 3v-2Zm8 1v2l4-3Z" fill-rule="evenodd"/>',
  C:'<path d="m12 1 11 11-11 11L1 12Zm0 5-6 6 6 6 6-6Z" fill-rule="evenodd"/>',
};
export function manaGlyph(color){
  return `<span class="mana-symbol mana-${h(color)}" title="${h(MANA_NAMES[color]||color)}">${glyphs[color]?`<svg viewBox="0 0 24 24" aria-hidden="true" fill="currentColor">${glyphs[color]}</svg>`:h(color)}</span>`;
}
export function isManaColorChoice(p){
  return !!p && !p.candidates?.length && !p.ordered && (p.max??1)===1 && p.options?.length>0
    && p.options.every(o=>Object.hasOwn(MANA_NAMES,typeof o==='object'?o.value:o));
}
export function manaChoiceHTML(p){
  if(!isManaColorChoice(p))return '';
  // Only the legal symbols are visible; title/labels remain available to
  // keyboard users and screen readers. Escape cancels via the normal engine.
  return `<section class="floating mana-window" data-floating="decision" role="dialog" aria-modal="false" aria-label="Choose mana color"><div class="mana-options">${p.options.map((o,i)=>{
    const color=typeof o==='object'?o.value:o;
    const restriction=typeof o==='object'&&o.restriction?({artifactSpellOrAbility:'Artifact spells or abilities only',artifactSpell:'Artifact spells only',notNonartifactSpell:'Cannot cast nonartifact spells',creatureSpell:'Creature spells only'}[o.restriction]||'Restricted mana'):'';
    const label=MANA_NAMES[color]+(restriction?' — '+restriction:'');
    return `<button type="button" class="mana-choice" data-action="option" data-option="${i}" aria-label="Add ${h(MANA_NAMES[color].toLowerCase())} mana${restriction?' — '+h(restriction):''}" title="${h(label)} · Escape to cancel">${manaGlyph(color)}</button>`;
  }).join('')}</div></section>`;
}
