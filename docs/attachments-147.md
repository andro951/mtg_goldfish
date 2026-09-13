# Attachment connections and following — 1.4.7

## Player controls

Equipment and Aura arrows represent actual `attachedTo` relationships, not prospective targets. A pending Equip action therefore retains its ordinary stack target arrow; the persistent attachment arrow and following layout start only when the attachment exists.

Following starts enabled for each new Equipment/Aura object. The card is placed behind its host with a small upper-left offset. Multiple attachments form a staggered fan. Near the viewport edge, the fan points inward and uses available spacing rather than moving the host or sending its attachments offscreen. Extremely small viewports cannot expose every card completely; the host's inspector lists all attachments so the cards remain accessible.

Dragging the host includes its following attachments in the live preview and commits a single undoable move. Dragging an attachment separately turns following off for that card without detaching it in the rules. Right-click the card, or open its abilities inspector, and press **Follow attached permanent** to put it back under its current host and resume following. The host inspector's **Attached cards** buttons also open each child's inspector.

Following is a per-instance setting. Moving the card to another host preserves the player's manual-position choice. Undo/redo, autosave, and session export/import preserve it. A card leaving and returning is a new object, with following enabled again. Cancelled gestures and invalid drops do not turn following off. Tapping a host never taps its Equipment or Auras.

Soulbond uses a distinct dashed line without an attachment arrowhead. The paired creatures remain separately movable. Both endpoints can highlight the relationship through hover, selection, keyboard focus, or inspection. The overlay never intercepts clicks.

## State and layout

Attachment and pair references include object incarnation IDs. A returning card cannot inherit a stale relationship to its earlier battlefield identity. Soulbond references are reciprocal and carry the controller at pairing; leaving the battlefield, ceasing to be a creature, or a change of controller clears the pair. Losing the Soulbond keyword alone does not clear an otherwise valid pair.

Soulbond pairing uses optional, non-targeting trigger resolution. The source and prospective partner are rechecked on resolution. Its generic rules follow the Soulbond section of Wizards' **Modern Masters 2017 Edition Release Notes** (2017-03-03) and the **Innistrad: Crimson Vow Release Notes** (2021-11-05). No additional native Soulbond cards were added to the existing 317-card catalog. Tests grant the keyword to fixture creatures so the pairing engine and visual lifecycle can be exercised without mislabeling unsupported individual cards as fully supported.

Following layout is derived from rules references and saved presentation preferences, not repeated engine actions during rendering. A guarded visual memo keeps a detached card at its last visible position without overriding a later manual move or undo. Defensive cycle detection prevents corrupt imported relationships from creating an infinite traversal.

Connection geometry reads the battlefield bounds once and uses canonical card positions, avoiding hover-lift drift. Moving endpoints use existing drag previews. Updates are scheduled by actual input, render, camera, and scroll changes; there is no continuous idle animation loop. Unchanged geometry does not rebuild SVG markup. Existing stack-target arrows keep their separate behavior.

## Verification scope

`attachment-layout.test.js` covers real relationships versus prospective targets, stacking order and canonical picking, pure/stable placement, tapped shapes, manual versus grouped drags, invalid input rollback, per-card toggle persistence, undo/redo/import/replay, detachment, stale references, nested attachments, cycle defense and edge-safe fans.

`soulbond-links.test.js` covers actual entry-triggered optional pairing, declining a pair, already-paired creatures, invalidation by blink or response, creature/control changes, losing the keyword, shroud and pending-choice export/import.

`ui_acceptance_attachments.py` uses real mouse controls, actual Equip and reconfigure actions, group previews, independent Equipment/Aura dragging, the follow toggle, host inspector navigation, undo/redo, export/import, real autosave reload, cancelled/invalid drops, tapped hosts, camera updates, idle SVG mutation observation, and pair creation/removal. These groups run alongside the entire existing browser suite, including the 1.4.6 journal and performance checks.

The release gate also requires current-build hashes for HTTP/direct-file acceptance, isolated single-file offline tests and the controlled long-session benchmark. The benchmark compares the current build to the pinned pre-optimization 1.4.5 baseline; it does not claim to measure every possible attachment-heavy board.
