# Astra 1.4 — The Goldfish Lab

A compact, offline, rules-aware Magic testing table for the combined **310-card supported pool**. The battlefield fills the window; other controls appear only when needed.

## Open the application

**No installation or internet connection is needed to play.**

Open `Astra-standalone.html` in your browser. This single file contains the application, all 343 card/token/face images, and the real Magic card back. It can be moved on its own.

Alternatively, extract the source ZIP and open `AstraSimulator/index.html`. Keep the `assets` folder beside that file. Do not open the HTML from inside an unextracted ZIP.

For a consistent local-server origin, Node.js 22 or later can run `npm start`; open `http://127.0.0.1:4173`. No `npm install` is required. The server binds to the local machine only. All network use belongs to optional developer import/test setup, not to gameplay.

**Moving an existing game into this edition:** export its session JSON from the old application, open this edition, then use **Menu → Save / import**. This interface update retains the existing rules-pack/session compatibility. New games default to hold priority off and reserve access on; imported games keep their saved game settings.

## New in 1.4

**Manual controls default off.** Mana, life, energy and poison totals remain visible but their adjustment buttons are hidden. Use normal card actions to change them. **Menu → Settings → Manual resource controls** restores manual bookkeeping when deliberately needed. This is separate from developer overrides; opening a payment does not prevent legal mana activations.

**Both supplied lists are included.** In **Menu → Deck editor → Load one of your supplied lists**, choose List 1 or List 2, then start a New test. Loading a list changes the editor, not a game already in progress. List 1 preserves 292 copies (including two Arcbound Ravagers), with 203 main-pool cards, one commander and 88 outside cards. List 2 preserves 168 copies: 126 main, one commander and 41 outside. The candidate harness selects an active 99 and retains the extra main-pool cards as reserve (104 or 27 respectively).

**Target arrows** connect each stack object to its declared targets. They are faint by default and brighten when that stack card is hovered, focused or selected. Click a selected stack card again to dismiss its inspection. Arrows follow panning, zooming and dragging. A dashed endpoint on a zone button means the target is in a closed/offscreen zone. Costs are not targets and never receive misleading arrows; a card leaving and reentering is not silently retargeted.

**Generic mana allocation** reserves explicit colored/colorless requirements, uses real colorless for the numeric portion, then spends from the largest remaining eligible color pool. Restricted mana is considered only where permitted. Actual `{C}` costs still require colorless mana; numeric `{1}`, `{2}`, etc. are generic costs.

The expansion includes suspend, dredge, offering, improvise, escape, warp, cascade/discover, station thresholds, transformed faces, linked graveyard-return effects and the relevant triggered/static mechanics. Suspend cards with no mana cost have a **Suspend** action instead of an illegal ordinary Cast action. Every new candidate has a focused mechanic test in addition to legal-entry/capability checks. `test-results/card-support.json` verifies all 310 names from both complete lists, including outside-the-game cards.

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

**Menu → Deck editor** is a visual builder backed by the 310 supported candidate cards. Search names, types or rules text; filter by card type or color identity; sort by name, mana value or type; then drag cards from the supported database into Main, Commander or Outside the Game. Drag existing deck entries between sections, drop them on Remove, or use the quantity controls for exact copy counts. Membership badges on search results show where copies already live. The editor continuously shows main-pool, land, reserve, commander and outside counts and reports whether the current list can start a New test.

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
