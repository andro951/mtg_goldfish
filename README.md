# Astra 1.5.1 — The Goldfish Lab

## Opponent mana conveniences (1.5.1)

**Carpet of Flowers** now has a configurable opponent-Island estimate in Settings. The default rate is **0.5 Islands per one of your turns**; its cumulative estimate is `floor((your turn - 1) × rate)`, giving **0 / 1 / 1 / 2** on turns 2–5 at the default rate. That estimate is added to the selected opponent’s Islands that are actually represented on the battlefield (and any explicitly reported abstract Islands), rather than replacing modeled game state. Existing sessions without the setting use 0.5 without rewriting their historical state.

**Path of Ancestry** is once again a direct mana-source click. Clicking the land opens the normal **W / U / B / R / G** commander-color palette with no special Path-only UI; choosing a color taps the land and retains the ancestry provenance used to trigger the card’s scry ability when that mana is spent on a matching creature spell.

**Exotic Orchard** keeps the 1.5.1 convenience toggle that treats opponents as having access to all five colors by default. Turning it off returns to the simulator’s actually modeled/reported opponent-land colors. The setting is included in normal session persistence.

The 1.5.0 Esika/Gods pool, automatic Ask defaults, mana selectors, attachment controls, floating Look workspace, loyalty overlays, responsive grids, and incremental autosave are retained.

## Revised Esika / Gods pool (1.5.0)

The revised **146-card Esika list** is implemented with canonical card data and local images. This adds 137 names to the previous catalog for **454 supported candidates**. Load **Esika · Revised 146-card Gods pool** from the deck editor's preset menu. Its 116 main-pool cards, Esika commander and 29 outside-the-game cards are preserved exactly; the goldfish harness selects 99 active cards and leaves 17 main-pool cards in reserve. Your existing saved deck is not replaced automatically.

Esika's two cast faces have separate choices and costs, including commander tax. Shared mechanics include devotion and God creature status, enchantment animation, bestow, hybrid mana, overload, lifegain thresholds, Enduring returns, transform faces, tutors, board wipes and reanimation. The revised lands include typed fetches, optional shock-land life payments, mana filters and dynamic mana types. New prompts use the existing movable decision and Look windows, and optional effects start at Ask.

All 146 requested names have a passing focused rules test in addition to registry and legal-entry checks. The release includes `test-results/esika-card-audit.json`, listing each name, section, metadata status and passing scenarios. The old 177-card request remains supported. See `docs/esika-150.md` for controls, compatibility and scope.

Export your session before upgrading, close the older tab, and import it into the new version as needed. The simulator remains a goldfish table with abstract opponents and no blocker AI. Opponent choices such as payments and discard types are reported explicitly rather than guessed. Existing attachment following, attacker-click selection, merged mana selectors, floating Look, responsive grids, loyalty overlays and incremental autosave are retained.

## Click creatures to select attackers (1.4.10)

During your Attack step, before attackers have been declared, click a battlefield creature to select it as an attacker. A bright orange border marks each pick; click again to deselect it. This takes precedence over a creature’s usual inspector or quick-mana click. Right-click and explicit ability buttons still inspect the card. Pending targeting and payment decisions retain their normal click behavior.

Press **Declare attackers (N)** on the toolbar to declare the highlighted creatures together. Selection alone never taps anything, produces mana, or fires an attack trigger. **Attack options** adjusts opponents for individual attackers, and **Clear** removes all picks. Phase-navigation buttons open the attack options instead of silently discarding selected attackers.

Attacker picks are separate from drag-group selection and survive normal rerenders, resize, autosave reload and session export/import. Illegal or stale picks are removed when a creature changes zones, controller or attack eligibility; leaving combat or declaring clears the draft. The rules engine still performs the actual simultaneous declaration and enforces haste, vigilance, defender and summoning sickness.

All previous mana selectors, floating Look, responsive grids, attachment-following, loyalty overlays and autosave improvements are retained. Export your current session before upgrading.


## Utility-land clicks and combined single-mana choices (1.4.9)

**Treasure Vault and other utility lands open their inspector when clicked**, rather than automatically spending their tap on mana. Conditional utility actions remain visible but disabled when their requirements are not met.

**Compatible tap-for-one-mana abilities share one selector.** A colored land with Chromatic Lantern or an active World Tree opens the five-color picker directly; a land with a genuine colorless option offers all six mana types. Duplicate colors are shown once, and the selected real ability activates once. Restrictions on spending that mana are retained.

**Bounce lands still open the inspector.** Their native two-mana action remains separate from a granted one-mana choice. Multi-mana, extra-cost, sacrifice and utility abilities are not silently merged. Escape from a nested mana picker returns to the original spell/effect payment without discarding floated mana.

All 49 catalog lands are audited in four configurations (196 cases). See `docs/mana-clicks-149.md` and `test-results/land-click-audit.json` for scope. The floating Look window, responsive zone grids, attachment following, Ask defaults, loyalty overlays and incremental autosave remain intact.

## Floating Look and automatic zone grids (1.4.8)

**Look is now an independent floating window.** Sarinth Steelseeker, scry, surveil, and other effects using the look workspace automatically display their cards over the graveyard/right side of the battlefield, without opening a side dock or reducing the battlefield width. Move the window by its header, resize from its lower-right corner, and use the mouse wheel or +/− controls to zoom its cards independently. Fit and Grid restore a readable fitted view. The Look toolbar toggle remains available even when the workspace is empty; hiding it never cancels the pending effect. A new look opens it again, including a second trigger showing the same top card.

Window size, position, and the current look's camera survive normal rerenders and session export/import or autosave reload. New batches fit to the available area. Existing scry/surveil selection and ordering controls remain; the Look previews mirror proposed order without changing the real library until confirmation. Looking at, inspecting, or dragging a preview does not move the actual card to the battlefield.

**Graveyard, exile, and outside-the-game zones reflow their automatic grids as cards arrive or leave**, not just after resizing or pressing Grid. An empty zone can no longer retain a one-column layout as it grows. Manual arrangements remain possible and are not reset by arrivals; each zone's Grid button puts every card back into the current responsive grid. Older saved one-column layouts receive a responsive refit when opened.

The 317-card catalog, attachment-following controls, Ask defaults, loyalty overlays, and incremental autosave are retained. See `docs/look-grid-148.md` for the control details and regression scope. Export your session before upgrading, then import it into the new application as needed.


## Attached cards and soulbond connections (1.4.7)

Equipment and Auras now show persistent arrows to the permanent they are actually attached to. Attachments default to **Follow attached permanent**: they tuck behind the host, offset slightly up and left, and move with it during a drag. Multiple attachments form a staggered fan. Near a viewport edge the fan turns inward rather than hiding cards offscreen; the host and camera are never moved automatically.

Drag an attached card separately to switch following off for that instance. Its rules attachment and arrow remain intact. Right-click the card (or open its abilities inspector), then click **Follow attached permanent** to snap it back under its current host and resume following. The host's inspector also lists attached cards so partly covered cards remain easy to access. The preference survives reattachment, undo/redo, autosave, and session export/import. Cancelled drags do not change it. A card leaving and returning is a new object and starts with following on again.

Soulbond pairs show a distinct dashed connection rather than an attachment arrow; paired creatures stay independently movable. Links brighten when either endpoint is hovered, selected, focused, or inspected. The overlay does not intercept clicks, and it uses event-driven updates rather than an idle animation loop. Actual detachments, zone changes and invalidated pairing references remove their links.

The existing 317-card catalog and all 177 names in the September request remain unchanged. Generic soulbond pairing and display are tested with granted-keyword fixtures because that catalog currently has no native Soulbond cards; this release does not silently claim support for additional individual cards. See `docs/attachments-147.md` for implementation and verification scope. The 1.4.6 autosave improvements, Ask defaults, loyalty overlays, targeting arrows, and visible automatic arrivals are retained.

## Performance, Ask defaults and loyalty (1.4.6)

Optional choices start at **Ask**, including Tireless Provisioner. Choosing Food or Treasure once does not save a default; an explicit remembered preference still works. Old historical decisions replay under their original behavior, while new live choices use Ask.

Planeswalkers show their **current loyalty number over the printed bottom-right shield**, rather than among top-left counters. The number updates when costs are paid and with undo/redo. Creature power/toughness overlays remain; an animated planeswalker can show both without overlap.

The supplied 1.4.1 trace exposed repeated 3.6–5.2 second autosave stalls in code that was still present in 1.4.5. Autosave now uses transactional, incremental IndexedDB records, preserving current and previous recovery points. Unchanged flushes are skipped, concurrent changes are coalesced, and layout changes do not copy or rewrite historical actions. Undo records store changed array segments instead of duplicating the entire accumulated zone history. Frozen historical snapshots and streamed canonical hashes reduce action-time allocation. Old histories are compacted on import without dropping actions.

**Before upgrading:** export your current session, close older Astra tabs, and open the new HTML. Import the exported session when needed. A blocked database migration is reported rather than silently switching to a separate save store. Very large old files may still take time to parse and validate on their first import. Session exports created by this version should be opened with this version or newer.

See `docs/performance-146.md` and the build-bound `test-results/performance.json` for the trace findings and controlled before/after benchmark. Existing card support, targeting arrows, visible arrival placement, and automation controls are retained.

## Visible automatic arrivals and the 13 September card pool

Cards automatically entering the battlefield now use the **current visible battlefield**, including its actual size, pan and zoom. Lands prefer the lower third; other permanents prefer the upper two thirds. Crowded lanes use staggered overlap instead of adding offscreen rows. New arrivals appear above existing cards without moving them or changing the camera. Manual drops, saved positions and undo/redo retain their locations. On a surface smaller than a zoomed card, the largest possible part remains visible rather than silently changing the player's zoom.

The exact 177-name request is available as **13 September · Requested 177-card pool** in the deck-preset selector. Its commander and 72 outside-the-game cards remain in their own sections. Existing saved decks are not replaced. All 177 names have explicit rules coverage, pinned canonical metadata and local images; the union with older supported lists is 317 candidates. `test-results/requested-card-audit.json` lists every requested name and its status.

Seven missing implementations were added: Academy Ruins, Planar Bridge, Mycosynth Golem, Cauldron of Souls, Chocobo Racetrack, Doors of Durin and Cosmic Cube. The added regression suite covers their activations, triggers, costs and identity-sensitive interactions. Persist uses the dying object's last-known counters, including simultaneous state-based actions, and does not incorrectly return a card that changed graveyard identity in response.

The Notes editor now receives focus synchronously. A delayed modal callback can no longer steal focus and cause Backspace to undo a game action. Regression tests prove both the text edit and unchanged, nonempty game history. The earlier Top ordering, Moraug delayed untap, Main 2 path and remaining-extra-combat indicator were retained and rechecked. The original intermittent Main 2 report was not conclusively reproduced; the explicit phase invariant and its tests remain.

Browser and portable reports are now bound to the exact tested HTML SHA-256. Packaging rejects stale reports from a different build, even when the version number matches.


## Extra-combat phase visibility and Step sequencing (1.4.5)

The phase bar now shows a compact **Extra ×N** chip only while one or more additional combat phases remain. The count includes the currently active extra combat, so two scheduled Moraug combats display `Extra ×2`, then `Extra ×1` when the second extra combat begins, and disappear after the extra-combat chain is finished. Hover the chip to see whether those phases were created during Main 1 or Main 2.

**Step →** has an explicit invariant: after an ordinary combat's End combat step it always enters **Main 2**. Moraug combats created in Main 1 are inserted before the normal combat, after which Step proceeds to Main 2. A Moraug combat created during Main 2 correctly proceeds to End after the final extra combat because that Main 2 has already happened; the chip tooltip calls this out so the two cases are not visually ambiguous.


## Card ordering and Moraug timing (1.4.4)

Ordered **cards** now show their real card images rather than names alone. This includes Sensei's Divining Top and other top/library ordering decisions. Click a card image in the ordering window to open its inspector without changing the chosen order; trigger-ordering lists remain compact because those rows represent effects rather than cards.

Moraug's additional combat is still scheduled directly by the resolving landfall ability, but the instruction to untap creatures at the beginning of that combat is modeled as the delayed triggered ability it actually is. It appears on the stack at beginning of combat, can be responded to, and creatures remain tapped until that trigger resolves. Existing 1.4.3 sessions with a Moraug extra combat already scheduled are upgraded when that combat begins.


## Mana palette dismissal (1.4.3)

Mana-color palettes are transient. Clicking anywhere except one of the displayed mana symbols closes the palette and cancels that uncommitted mana activation. The dismissing click is consumed, so it cannot accidentally tap or move a card underneath. During an existing spell/ability payment, dismissal restores that parent payment and preserves mana already produced by other sources. Escape continues to provide the same cancellation behavior.

A compact, offline, rules-aware Magic testing table for the combined **317-card supported pool**. The battlefield fills the window; other controls appear only when needed.

## Open the application

**No installation or internet connection is needed to play.**

Open `Astra-standalone.html` in your browser. This single file contains the application, all 351 card/token/face images, and the real Magic card back. It can be moved on its own.

Alternatively, extract the source ZIP and open `AstraSimulator/index.html`. Keep the `assets` folder beside that file. Do not open the HTML from inside an unextracted ZIP.

For a consistent local-server origin, Node.js 22 or later can run `npm start`; open `http://127.0.0.1:4173`. No `npm install` is required. The server binds to the local machine only. All network use belongs to optional developer import/test setup, not to gameplay.

**Moving an existing game into this edition:** export its session JSON from the old application, open this edition, then use **Menu → Save / import**. This interface update retains the existing rules-pack/session compatibility. New games default to hold priority off and reserve access on; imported games keep their saved game settings.


## Deck text editor and responsive side-zone grids (1.4.3)

The visual drag-and-drop deck builder remains the default, and the original quantity/name workflow is now a **separate Deck text editor**. Open it directly from Menu → Deck text, or switch between Visual editor and Text editor from either deck dialog. Both edit the same saved deck source immediately, so a change in one appears in the other. The text editor supports the familiar `// Main`, `// Commander`, and `// Outside the Game` sections, bulk paste, validation, supplied-list presets, and restoring the original supplied pool.

Graveyard, exile, and outside-the-game grids now reflow responsively to the **actual visible side-panel width and height**. Resizing the dock recalculates the best row/column shape and refits its grid-owned cards, instead of leaving the old narrow layout at a tiny stale zoom. Manually detached cards keep their saved coordinates and their vacated slot remains available for the next arrival. The grid button reattaches every card. After resizing, you can still wheel to choose your own zoom; another panel resize intentionally refits the grid to the new space.

## Mana-source special abilities (1.4.1)

Mana sources with additional activated abilities now have a small **⋯ Abilities** button on the card. Click that button to open the inspector **without tapping or paying anything**. Clicking the artwork retains the quick-mana action. The same button closes the inspector again. Right-click remains available, but is no longer the only discoverable path.

For **Treasure Vault**, click **⋯ → Create X Treasures**, select X, and pay the displayed cost. For example, X=3 asks for six mana, taps and sacrifices the Vault as costs, then its ability creates three Treasure tokens on resolution. Cancelling before payment leaves the Vault and resources unchanged.

The control reads the current ability list, including copied, chapter-granted and other granted abilities. It also covers lands such as Buried Ruin, Fomori Vault and Oboro, and artifacts such as Grim Monolith. A tapped permanent can still expose a legal non-tap ability; its tap-cost abilities remain unavailable. The button stays on the exposed left corner when tapped so it does not disappear behind the next card in a row. Ordinary mana-only lands keep their uncluttered image.

Both keyboard activation and touch are supported. One touchscreen tap is handled once rather than again through its synthesized click. During an outstanding spell payment, inspection preserves that payment and exposes only the mana actions permitted there; non-mana abilities do not bypass the engine.

## New in 1.4

**Manual controls default off.** Mana, life, energy and poison totals remain visible but their adjustment buttons are hidden. Use normal card actions to change them. **Menu → Settings → Manual resource controls** restores manual bookkeeping when deliberately needed. This is separate from developer overrides; opening a payment does not prevent legal mana activations.

**Both supplied lists are included.** In **Menu → Deck editor → Load one of your supplied lists**, choose List 1 or List 2, then start a New test. Loading a list changes the editor, not a game already in progress. List 1 preserves 292 copies (including two Arcbound Ravagers), with 203 main-pool cards, one commander and 88 outside cards. List 2 preserves 168 copies: 126 main, one commander and 41 outside. The candidate harness selects an active 99 and retains the extra main-pool cards as reserve (104 or 27 respectively).

**Target arrows** connect each stack object to its declared targets. They are faint by default and brighten when that stack card is hovered, focused or selected. Click a selected stack card again to dismiss its inspection. Arrows follow panning, zooming and dragging. A dashed endpoint on a zone button means the target is in a closed/offscreen zone. Costs are not targets and never receive misleading arrows; a card leaving and reentering is not silently retargeted.

**Generic mana allocation** reserves explicit colored/colorless requirements, uses real colorless for the numeric portion, then spends from the largest remaining eligible color pool. Restricted mana is considered only where permitted. Actual `{C}` costs still require colorless mana; numeric `{1}`, `{2}`, etc. are generic costs.

The expansion includes suspend, dredge, offering, improvise, escape, warp, cascade/discover, station thresholds, transformed faces, linked graveyard-return effects and the relevant triggered/static mechanics. Suspend cards with no mana cost have a **Suspend** action instead of an illegal ordinary Cast action. Every new candidate has a focused mechanic test in addition to legal-entry/capability checks. `test-results/card-support.json` verifies all 317 names from all three complete lists, including outside-the-game cards.

## The compact table

The top-left **Menu** button contains New test, Laboratory, Cards, Deck editor, Save / import, Settings, Action log and Notes, plus Guide and undo/redo. The narrow toolbar also provides phases, opponent turns and the small zone/selection/arrangement icons.

The battlefield is always visible. Graveyard, exile and outside-the-game open alongside it, not instead of it. Close the side zone to return its width to the battlefield. Wheel over either table to zoom around your pointer. Drag empty space to pan; holding Space allows panning from over a card. The small fit icon brings that area's cards back into view.

Resize the left rail horizontally by dragging its right divider. Resize the hand vertically by dragging its top divider. Resize the side zone horizontally by dragging its left divider. Hand cards grow or shrink with the hand row and end four pixels above the window bottom. Keyboard-focused dividers also accept arrow keys; Shift makes larger adjustments.

Inspector, stack and decision windows float independently and can be moved by dragging their title bars. Layout, zoom and popup positions are saved. **Menu → Settings → Reset layout** returns to the compact starting geometry. There is no separate card-size setting: table zoom and hand height own those sizes.

## Cards, tapping and mana

Click a card to inspect it, then click that same card again to close inspection. An untapped battlefield source with one available tap-mana ability instead activates that ability on a normal click. **Right-click** always inspects. Inspector actions use the same rules checks as other inputs.

Multicolor mana sources show a small popup of **only their legal mana symbols**. Click a symbol to add that color. There is no extra confirmation. Sources with one color do not need a color chooser. A tapped source cannot produce another mana prompt; an unavailable ability is not silently granted.

Tapped cards rotate **clockwise**. The card’s physical original bottom-right corner moves to the exact position of its upright bottom-left corner; its sideways footprint extends to the right of that anchor. Untapping requires the appropriate game effect or turn step; a second click is not a free untap.

When casting, choose a legal play permission, target, mode or additional cost as necessary. The payment window allocates mana already in your pool. It never automatically taps sources. You can still click your lands and artifacts for mana while payment is waiting. A nested color choice returns to the original payment. Escape cancels that unfinished nested activation without discarding mana from sources already activated during the payment.

The default suggested allocation is refreshed while you add mana unless you edit the allocation yourself. Use **Use suggested allocation** to refresh it explicitly. Restricted mana appears separately and is validated against the action being paid for. Paying life through a particular casting permission is distinct from paying mana through a normal permission.

## Dragging, hovering and layering

A drag preview follows the point where you grabbed the card. Releasing keeps that point at the pointer, including when the card is sideways or the table is zoomed. A hand-to-battlefield drop requests a legal play or cast; its placement is retained through payment and resolution. It does not force an illegal zone move.

Hover elevation is temporary and does not change picking geometry. Moving from the exposed edge of a lower card onto the original visible footprint of an upper card switches to that upper card, rather than letting the lifted lower card steal the pointer.

For a drop, cards beneath the pointer go **below** the dragged card. Other overlapping cards not beneath the pointer go **above** it. This permits inserting a new card between two overlapping cards. Select mode, Shift-click and marquee selection support moving groups. Arrange restores a readable grid in the active table. Layout moves and arrangement can be undone.

## Stack, decisions and phases

**Hold priority is off by default.** The application resolves spells and abilities automatically, pausing for required choices. Opening a menu pauses that automatic continuation; closing the menu resumes it. Turn Hold on in Menu or the stack window to respond before resolution.

The stack window exists only while a spell or ability is waiting or resolving. It shows card/source art: gold borders identify spells and teal borders identify effects. Hover an image for the exact effect; click it to inspect. Resolve handles the next object, All continues until a choice is required, and Pass passes priority.

Simultaneous trigger ordering is displayed in **resolution order**: the first row resolves first. Triggers created during a resolving effect wait until that effect finishes. Card selectors show legal candidates, distinguish costs from effects, and permit an empty selection when the rules allow choosing none.

The eye / **Look** workspace is for temporary multi-card effects such as inspecting, revealing or ordering several library cards. Its icon exists only while that workspace exists, and a completed workspace closes automatically. It is not the top-card display. A legal top-card viewing permission instead replaces the library back with the actual top card automatically.

The left rail shows library and reserve count badges, a hand-count icon and a land-play icon with hover text. Compact rows track mana, life, energy, poison and opponent life. OP1/OP2/OP3 on the toolbar advance to those opponents and highlight the active opponent. **Next turn** and **Your next turn** are adjacent. Phase navigation processes intervening game steps and pauses for relevant stack objects and choices.

## Reusable graveyard and exile grids

New arrivals occupy the first free slot in the zone’s grid array. Dragging a card out detaches that card from the grid immediately, freeing its slot for the next arrival; the detached card stays where you placed it. The grid icon in the zone header returns **all** cards to the grid and updates their actual positions. Grid reset, manual positions, and undo/redo work together. Detached slots and positions are included in session exports and autosaves.

## Player defaults and faster choices

Cards such as **Codex Shredder** expose **Ask / You / OP1 / OP2 / OP3** in their inspector. **Choose once** ignores that default for one activation without erasing it. A **Player** button in a later pending cost/choice can return to that activation’s target-player selection. Illegal or unavailable player choices are never forced by a saved preference.

**Settings → Auto-accept completed selections** can skip the confirmation after a single target or after selecting the full required number of cards. It also checks sufficient crew power. Variable-count choices still let you decide when to stop. The setting is also available in card-selection windows. Undo still reverses the complete activation, including its costs.

Trigger and library ordering windows are resizable using the lower-right grip or arrow keys while that grip is focused. Drag rows directly, use single arrows for one position, or use **⇈ / ⇊** for top/bottom. Trigger rows are displayed first-to-resolve first; library rows are top-card first. Window size is remembered.

## Sequences and loops

The **circular-arrow toolbar button** opens Sequences. Choose **Record a sequence**, perform the legal line on your table, then open Sequences again and save it. Include every required cost, target, mode, and payment choice. Automatic stack resolution and player rules pause during recording; use Resolve explicitly for effects that belong in the recording. A recording must finish outside a pending decision.

**Once** runs the complete line once. **Repeat** attempts the chosen number of iterations. Each iteration is simulated and validated before any real costs are paid. If a required card, target, mana payment, or stack object is wrong, that iteration does not start. A failed late command also rolls back the whole iteration. Completed iterations are separate undoable actions. **Stop** or Escape stops between complete iterations.

A sequence is saved for **this game only** by default, including the game’s autosave/export. Tick **Save for future games** to retain it for new tests. You can rename it, reorder/remove recorded steps, check legality without executing, or delete it. Cross-game card bindings require unambiguous matching cards; the app does not guess between indistinguishable copies.

The recorder is a bounded shortcut, not an arbitrary scripting language. It records legal card actions, explicit resolutions and choices, not debug commands or manual mana/life adjustments. Limits are 256 commands per line and 1,000 iterations per request. A configured priority shortcut inside a longer atomic line makes preflight stop with an explanation; split the line at that boundary or temporarily disable that shortcut rather than silently skipping it.

## Conditional actions and priority stops

The **lightning toolbar button** opens Player automations. Nothing is configured by default. Create a rule by choosing its event, card, optional ability, action, conditions, and lifetime. Conditions can require **all** or **any** of the listed cards to be present, absent, or untapped under your control. Rules can hold priority, run a recorded sequence, or run it then hold. A hold only occurs while something remains on the stack. Enabled checkboxes toggle rules without deleting them.

For **Grinding Station → Urza**: record Urza’s artifact-mana activation with Grinding Station as the tap cost. Then create a rule **After an effect resolves → Grinding Station → untap → Run that sequence**, conditioned on controlling Urza. The engine rechecks the whole sequence; it will not tap an already-tapped Station or act without Urza. For a priority stop instead, choose **When a permanent untaps → Grinding Station → Hold priority**, with an **Any** condition group containing Urza and Clock of Omens.

Each stack card has a small **↪ shortcut button**. It can create a sequence or priority stop **before** or **after** that spell/effect resolves, scoped to **that item**, **all matching items currently on the stack**, **all matches for this game**, or **future games**. Current-stack rules store those item IDs, so new copies are not accidentally included. This supports tapping a creature through Urza just before a Raft-Steerer effect untaps it, or acting immediately after that effect finishes.

Player rules run only at clean priority boundaries, after mandatory choices and the current resolving effect finish. A failed automatic sequence pauses automation with its reason rather than partially executing. A 100-rule automatic-chain limit prevents self-triggering shortcuts from freezing the application. Resume is explicit after a stop. Future-game rules retain any referenced sequence automatically; unsaved unrelated game sequences do not leak into the next game.

## Start, save and recover

**Menu → New test** creates a seeded opening hand using the deck editor. The same deck and seed reproduce the initial active and reserve ordering. Keep or mulligan; the first multiplayer mulligan is free by default. Later London mulligans ask which cards to bottom. Laboratory offers five clearly labelled prepared scenarios; these are not randomized opening hands and do not enable developer overrides.

The original legacy preset contains 119 main-pool copies: 34 fixed lands, 65 selected nonlands in the active 99, and 20 reserve candidates. There is one commander and 41 outside-the-game cards. Reserve access is on by default in this edition and can be disabled in Settings. The supplied duplicate Scroll Rack is preserved and reported, not deleted. The harness is not a Commander deck-legality validator.

**Menu → Deck editor** is a visual builder backed by the 317 supported candidate cards. Search names, types or rules text; filter by card type or color identity; sort by name, mana value or type; then drag cards from the supported database into Main, Commander or Outside the Game. Drag existing deck entries between sections, drop them on Remove, or use the quantity controls for exact copy counts. Membership badges on search results show where copies already live. The editor continuously shows main-pool, land, reserve, commander and outside counts and reports whether the current list can start a New test.

For bulk edits, **Advanced text / paste list** remains available with `// Main`, `// Commander`, and `// Outside the Game` headings. Unsupported names stay visible so you can remove them and are reported rather than silently treated as implemented cards. Deck edits are saved locally and affect the next New test; they do not mutate the game already in progress.

Browser autosave includes the exact game state, pending decisions, undo/redo history, notes and table layout. It keeps a previous distinct recovery point. **Save / import** exports a portable session JSON or a readable action log, imports a session with integrity checks, recovers the previous autosave, and verifies deterministic replay. A corrupted import is rejected before replacing the current game.

Browser storage is local to its profile and file/origin. Export before moving computers, clearing browser data or changing profiles. When persistent browser storage is unavailable, the application reports that failure rather than claiming an in-memory copy is safely saved. Source-code checkpoints are separately preserved in this GitHub repository.

Shortcuts: **Escape** cancels/declines the current choice, cancels an in-progress drag/resize/pan, closes a menu, or dismisses inspection. **Backspace** or **Ctrl/Cmd+Z** undoes outside text fields. **Ctrl/Cmd+Shift+Z** redoes. **Ctrl/Cmd+S** exports a session. Mandatory rules choices cannot simply be skipped; cancellation rolls back an action or declines an optional effect as appropriate. Undo intentionally does not immediately auto-resolve the restored stack.

## Scope and verification

This is the supplied-pool **goldfish** simulator, not a universal multiplayer Magic judge. Three opponents have abstract life, hand and creature counts. Opponents have no blocker AI. **Deal unblocked damage** applies the goldfish combat step from the declared attackers, including first strike, vigilance and lifelink; it is not a general multiplayer combat judge. Developer overrides are off by default, require opting in through Settings, and are marked in the action log.

The tests exercise legal entry of every supplied candidate, registered activated capabilities, targeted rule interactions, transaction/import integrity and the new tabletop through actual browser controls. The browser suite covers every menu, all phase buttons, mana/color/payment flows, whole sacrifice/recursion lines, library workspaces, triggers, crew, loyalty, meld, station, Plot, exact drag geometry, hover/layering, resize/pan cancellation, undo/redo, downloads and reload recovery. Desktop, laptop, tablet and phone-sized screenshots are included. Tests provide reproducible evidence of those cases, not a guarantee about every possible combination of Magic cards.

Current evidence is in `test-results/engine.tap`, `browser.json`, `portable.json`, `release.json`, `package-verification.json`, and `screenshots/`. Release packaging rejects failed/skipped browser checks, verifies card and UI image hashes, rebuilds both HTML editions to identical bytes, and reads back every entry in the source ZIP against its SHA-256 manifest.

```sh
npm test
node tools/build.mjs
node tools/build.mjs --standalone
python -m pip install playwright==1.57.0
python -m playwright install chromium
python tests/browser_tabletop.py
python tests/portable_test.py
python tools/package.py
```

Node tests, builds and packaging use their standard libraries. Playwright is a development-only browser-test dependency. On Ubuntu, browser OS libraries can be installed using `python -m playwright install --with-deps chromium` as CI does. `--memory` is an explicitly limited UI-test mode for environments without URL navigation; it cannot satisfy release persistence/download checks.

The current interface lives in `src/tabletop`; `src/core` and `src/rules` own game behavior. Some shared dialogs, selectors, storage and laboratory fixtures remain in `src/ui`; its original application/controller and old browser suite are historical, not the delivered entry point. See `docs/DEVELOPMENT.md` for engine and checkpoint contracts.

## Assets

Metadata, rulings, Oracle/printing IDs and source URLs are recorded in the local data and image manifests. Magic: The Gathering, card text, imagery and marks belong to their respective rights holders. This personal testing application is not affiliated with or endorsed by Wizards of the Coast or Scryfall. The local reference images do not grant commercial reproduction rights.
