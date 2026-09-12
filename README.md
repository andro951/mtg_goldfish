# Astra 1.1 — The Goldfish Lab

A compact, offline, rules-aware Magic testing table for the supplied **160-card candidate pool**. The battlefield fills the window; other controls appear only when needed.

## Open the application

**No installation or internet connection is needed to play.**

Open `Astra-standalone.html` in your browser. This single file contains the application, all 175 card/token/derived images, and the real Magic card back. It can be moved on its own.

Alternatively, extract the source ZIP and open `AstraSimulator/index.html`. Keep the `assets` folder beside that file. Do not open the HTML from inside an unextracted ZIP.

For a consistent local-server origin, Node.js 22 or later can run `npm start`; open `http://127.0.0.1:4173`. No `npm install` is required. The server binds to the local machine only. All network use belongs to optional developer import/test setup, not to gameplay.

**Moving an existing game into this edition:** export its session JSON from the old application, open this edition, then use **Menu → Save / import**. This interface update retains the existing rules-pack/session compatibility. New games default to hold priority off and reserve access on; imported games keep their saved game settings.

## The compact table

The top-left **Menu** button contains New test, Laboratory, Cards, Deck pool, Save / import, Settings, Action log and Notes, plus Guide and undo/redo. The narrow toolbar also provides phases, opponent turns and the small zone/selection/arrangement icons.

The battlefield is always visible. Graveyard, exile and outside-the-game open alongside it, not instead of it. Close the side zone to return its width to the battlefield. Wheel over either table to zoom around your pointer. Drag empty space to pan; holding Space allows panning from over a card. The small fit icon brings that area's cards back into view.

Resize the left rail horizontally by dragging its right divider. Resize the hand vertically by dragging its top divider. Resize the side zone horizontally by dragging its left divider. Hand cards grow or shrink with the hand row and end four pixels above the window bottom. Keyboard-focused dividers also accept arrow keys; Shift makes larger adjustments.

Inspector, stack and decision windows float independently and can be moved by dragging their title bars. Layout, zoom and popup positions are saved. **Menu → Settings → Reset layout** returns to the compact starting geometry. There is no separate card-size setting: table zoom and hand height own those sizes.

## Cards, tapping and mana

Click a card to inspect it, then click that same card again to close inspection. An untapped battlefield source with one available tap-mana ability instead activates that ability on a normal click. **Right-click** always inspects. Inspector actions use the same rules checks as other inputs.

Multicolor mana sources show a small popup of **only their legal mana symbols**. Click a symbol to add that color. There is no extra confirmation. Sources with one color do not need a color chooser. A tapped source cannot produce another mana prompt; an unavailable ability is not silently granted.

Tapped cards really rotate sideways. The upright bottom-left corner stays fixed and becomes the sideways bottom-right corner. Untapping requires the appropriate game effect or turn step; a second click is not a free untap.

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

## Start, save and recover

**Menu → New test** creates a seeded opening hand using the deck editor. The same deck and seed reproduce the initial active and reserve ordering. Keep or mulligan; the first multiplayer mulligan is free by default. Later London mulligans ask which cards to bottom. Laboratory offers five clearly labelled prepared scenarios; these are not randomized opening hands and do not enable developer overrides.

The supplied main pool contains 119 copies: 34 fixed lands, 65 selected nonlands in the active 99, and 20 reserve candidates. There is one commander and 41 outside-the-game cards. Reserve access is on by default in this edition and can be disabled in Settings. The supplied duplicate Scroll Rack is preserved and reported, not deleted. The harness is not a Commander deck-legality validator.

Deck pool accepts quantity/name lines and `// Main`, `// Commander`, and `// Outside the Game` headings. Unsupported names produce a missing-card report rather than being silently treated as implemented cards. Editing the deck does not replace an in-progress table until a new test is started.

Browser autosave includes the exact game state, pending decisions, undo/redo history, notes and table layout. It keeps a previous distinct recovery point. **Save / import** exports a portable session JSON or a readable action log, imports a session with integrity checks, recovers the previous autosave, and verifies deterministic replay. A corrupted import is rejected before replacing the current game.

Browser storage is local to its profile and file/origin. Export before moving computers, clearing browser data or changing profiles. When persistent browser storage is unavailable, the application reports that failure rather than claiming an in-memory copy is safely saved. Source-code checkpoints are separately preserved in this GitHub repository.

Shortcuts: **Escape** cancels/declines the current choice, cancels an in-progress drag/resize/pan, closes a menu, or dismisses inspection. **Backspace** or **Ctrl/Cmd+Z** undoes outside text fields. **Ctrl/Cmd+Shift+Z** redoes. **Ctrl/Cmd+S** exports a session. Mandatory rules choices cannot simply be skipped; cancellation rolls back an action or declines an optional effect as appropriate. Undo intentionally does not immediately auto-resolve the restored stack.

## Scope and verification

This is the supplied-pool **goldfish** simulator, not a universal multiplayer Magic judge. Three opponents have abstract life, hand and creature counts. Blocking and combat-damage assignment remain explicitly user-assisted. Developer overrides are off by default, require opting in through Settings, and are marked in the action log.

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
