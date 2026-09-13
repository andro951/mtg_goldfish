# Land clicks and single-mana choices — 1.4.9

## Click behavior

Clicking Treasure Vault or another utility land opens its abilities inspector without tapping it. This applies both when its native mana ability is the only mana ability and when an additional mana ability has been granted. Conditional utility abilities on Inventors’ Fair and Shifting Woodland stay visible but disabled while their requirements are unmet. An ungranted Saga chapter is not treated as an existing ability.

A permanent’s compatible tap-for-exactly-one-mana abilities appear as one combined choice. Colors are deduplicated in W/U/B/R/G order, with actual colorless mana retained separately. Thus a colored-only land plus Chromatic Lantern displays five options; a colorless land displays six. With Lantern and an active World Tree, duplicate granted colors still appear only once.

Bounce-land two-mana production remains a separate action. Clicking the land opens the inspector, where the native two-mana action and the granted one-mana choice remain distinguishable. The same separation applies to other multi-mana production, extra-cost filters, sacrifices, and abilities with additional effects. Nonland mana rocks retain their existing fast activation behavior.

## Rules and interaction safety

This combines the interface, not the rules abilities. Picking a color activates one real, currently available ability on the selected permanent. It taps once and does not also tap the granting permanent. Conditions are reevaluated for the live source identity. Restricted mana keeps its spending restriction, which appears in its choice tooltip; when an unrestricted ability can produce the same color for the same tap, that real ability is preferred.

Opening or cancelling a selector does not tap the source or produce mana. During spell or effect payment, Escape dismisses only the mana picker and returns to the payment, preserving mana already floated. Undo, redo, unfinished-session import/reload, and recorded sequences retain the actual actions. Historical CARD_CLICK replay semantics are unchanged; the live tabletop uses the new routing.

## Verification scope

The catalog contains 49 land names. `tools/verify-land-clicks.mjs` audits all 49 with native abilities, Lantern, an active World Tree, and both grants: 196 configurations. It checks that extra actions are not bypassed and that every combined route has an actual one-mana effect. The report is `test-results/land-click-audit.json`.

Focused engine tests cover amounts, colorless mana, restricted mana, conditions, copied land types, cancellation, nested payments, stale sources, undo/redo, import and sequence replay. Actual browser tests cover the visible inspector, five/six-symbol selectors, bounce-land choices, real payments, autosave reload, mouse, touch and keyboard. Existing Look, responsive zone grids, attachment-following, loyalty and performance checks remain enabled. These checks cover the simulator’s supported catalog, not every printed Magic card.

Export a session before replacing the older HTML and import it into the new version as needed.
