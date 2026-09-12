# Astra — The Goldfish Lab

A local, offline, rules-aware Magic testing table for the supplied **160-card candidate pool**. The application contains its rules engine, canonical card snapshot, local art, deterministic deck harness, five prepared experiments, and portable session history.

## Open and play

**No installation is needed to play.**

- **Single-file edition:** open `Astra-standalone.html` in a modern browser. All art is embedded, so this file can be moved on its own.
- **Source / folder edition:** extract `AstraSimulator.zip`, then open `AstraSimulator/index.html`. Keep its `assets` folder beside it. Do not open the HTML from inside the compressed archive.
- **Optional local server:** with Node.js 22 or later, run `npm start` in the project folder and visit `http://127.0.0.1:4173`. No `npm install` is required. Use a consistent URL and browser profile for consistent browser autosave storage. `PORT=4174` changes the port on platforms supporting that environment-variable syntax.

The delivered runtime does not fetch cards, call APIs, or require an account. Card rules and images are a pinned local snapshot; they do not silently change when an online database changes.

## First test

Choose **New test**, enter a seed or accept the generated one, and start. Use **Mulligan** or **Keep hand**. The first multiplayer mulligan is free by default; later London mulligans ask which cards to put on the bottom.

Choose **Main 1** to process the intervening untap, upkeep and draw steps in sequence. Advancement stops when a trigger, stack object or decision needs attention. After resolving that interruption, use the phase controls again as needed.

Click a card's **name** to inspect its live characteristics, rules text and actions. Choose **Play this land** or **Cast this spell**. Dragging a card from your hand onto the battlefield requests the same legal action; it never bypasses timing, land limits, costs or targets.

A short click on a battlefield image requests its single tap-mana ability. A card with multiple such choices opens inspection instead. Clicking a tapped card is **not** an untap command. Untapping requires a rules effect or the appropriate turn step.

Mana is explicit: activate sources, then allocate the pool in the payment panel. **Use suggested allocation** only distributes mana already in the pool; it never taps lands for you. Restricted mana is displayed separately. Available mana abilities can be used while a payment is waiting. Failed or cancelled casts and activations do not partially pay their costs.

## Stack, triggers and library choices

**Hold priority** is on by default. Your spell or ability stays on the stack until you resolve it, pass priority, or respond. **Resolve top** resolves one object. **All** continues until it reaches a choice or has nothing left to resolve.

Simultaneous triggers can be reordered. This interface displays **resolution order: the first row resolves first**. It translates that order into the last-in, first-out stack. Triggers generated during a resolving effect wait until that effect finishes.

Target and cost selectors show eligible objects, not arbitrary zone controls. A sacrifice cost is labelled as a cost and is paid before its ability is placed on the stack. Zero-minimum optional selections can be confirmed with no cards. A saved YES preference does not force you to select a card for a later optional selection.

Top-of-library information stays concealed unless an active rules permission allows it. Top, Scroll Rack, searches, reveals and other library effects use constrained workspaces with explicit ordering and destinations. A card cast through a normal top-card permission is distinct from one cast by paying life through Bolas's Citadel.

## Table controls

Use the battlefield, graveyard, exile, look-workspace and outside-the-game tabs to inspect those zones. Dragging within the battlefield or graveyard changes layout only. **Select**, Shift-click and marquee selection support moving a group together. **Arrange** restores a readable grid and is undoable. A long press begins the same pointer movement on touch devices.

Life, energy and mana adjustments are logged. Three opponents have abstract life, creature and hand counts. Set their abstract counts in Settings when an effect depends on them. Attack declarations check the implemented timing and creature rules; blockers and combat-damage assignment are user-assisted. The **Assign damage** button is labelled manual assistance and records its adjustment.

Optional effect policies are per card definition and ability. Use the inspector or Settings to choose ASK, YES or NO. Tireless Provisioner's token choice defaults to Treasure and also supports Food or ASK. Settings exposes remembered choices so they can be reset to ASK.

Developer overrides are **off by default**. Enabling them exposes explicit debug spawning, drawing, milling and shuffling. Their events are marked `DEBUG_OVERRIDE`; they do not count as rules-valid ways to play a card.

## Laboratory presets

**Laboratory** offers five prepared scenarios covering the artifact sacrifice/recursion engine, top-of-library play, landfall/entry triggers, copying/artifact mechanics, and special mechanics such as loyalty, crew, station and meld. They are clearly labelled fixtures, not randomized opening hands, and start without developer overrides.

Opening a new test or laboratory replaces the current table. Export a session first to keep an independent copy.

## Candidate-pool construction

The supplied pool is a testing harness, not a Commander legality validator:

| Partition | Supplied copies |
| --- | ---: |
| Main candidate pool | 119 |
| Fixed lands within main pool | 34 |
| Selected nonlands | 65 |
| Active library before opening draw | 99 |
| Isolated reserve nonlands | 20 |
| Commander | 1 |
| Outside the game | 41 |

The active 99 and reserve are independently ordered by the seed. Ordinary active-library effects do not freely mix in reserve candidates. Reserve access is an explicit, logged harness setting. The supplied list contains two copies of **Scroll Rack**; both physical copies are preserved and the duplicate is reported rather than removed.

**Deck pool** accepts quantity/name lines and `// Main`, `// Commander`, and `// Outside the Game` sections. Validate before starting a new test. Unknown names produce a downloadable missing-card report. There is no silent fallback that pretends an unsupported card has complete rules.

## Save and recover

Browser autosave stores the session, including the current seed, exact order, undo/redo history, notes, pending decisions and unfinished actions. IndexedDB stores the current and previous autosaves transactionally; local storage is a fallback. When persistent storage is unavailable, the interface says so instead of claiming that an in-memory copy is safely saved.

**Save session → Export session.json** creates a portable copy. Import it in the same rules-pack version to resume on another computer or browser. Import checks the current state, full history including redo entries, and pending transaction before replacing your game. The readable action log is available separately. **Verify deterministic replay** re-executes committed actions and checks the result.

Browser storage is tied to its profile and file/origin. Moving or renaming a local HTML file, clearing browser data, private browsing, or opening another browser can change the available storage. Export before moving computers or clearing data. Browser autosave preserves game sessions; source-code checkpoints are separately stored in this GitHub repository.

Shortcuts outside text fields: **Ctrl/Cmd+Z** undo; **Ctrl/Cmd+Shift+Z** redo; **Ctrl/Cmd+S** export. Escape closes a dialog. Undo reverses a whole action, including its subsidiary choices; it also rolls back an unfinished action.

## Verification and scope

The repository includes a test for legal entry of every candidate card, tests for every registered activated ability, targeted rule interactions, transactional integrity/replay tests, and real Chromium click-through acceptance. Per-card capability tests are smoke tests; they are not a claim to enumerate every possible combination of Magic cards.

Current reproducible evidence is in:

- `test-results/engine.tap` — named Node tests and pass/fail totals.
- `test-results/browser.json` — actual HTTP/direct-file Chromium checks, errors, network requests and skipped checks.
- `test-results/screenshots/` — desktop, tablet, mobile and decision-workspace screenshots in the release archive / CI artifact.
- `test-results/build.json` and `build-standalone.json` — build hashes and runtime-dependency declarations.
- `test-results/release.json` — archive verification and byte hashes when packaged.

This is the supplied-pool **goldfish** scope, not a general multiplayer Magic judge. There is no opponent AI, arbitrary opposing board implementation, or complete blocker/prevention/damage-assignment engine. Those interactions remain explicitly user-assisted. Registered mechanics, own-board state, costs, triggered effects and the supplied test scenarios are automated within that scope. Tests passing is evidence of the tested behavior, not a guarantee that no software defect can exist.

## Rebuild or extend

```sh
npm test
node tools/build.mjs
node tools/build.mjs --standalone
python -m pip install playwright==1.57.0
python -m playwright install chromium
python tests/browser_test.py
python tools/package.py
```

Node tests, both builds and packaging use only their respective standard libraries. Playwright is a **development-only** test dependency. Browser installation may also require OS libraries; CI uses `python -m playwright install --with-deps chromium` on Ubuntu.

See `docs/DEVELOPMENT.md` for the module contracts, import/update workflow, acceptance gating, and checkpoint recovery.

## Card assets and attribution

Canonical metadata, Oracle IDs, printing IDs, rulings and image-source URLs are recorded in the local data files and asset manifest. Magic: The Gathering, card text, imagery and related marks belong to their respective rights holders. This personal testing tool is not affiliated with or endorsed by Wizards of the Coast or Scryfall. Inclusion of an image is not a grant of commercial rights to that image.
