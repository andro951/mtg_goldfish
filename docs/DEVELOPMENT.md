# Development and recovery

## Source layout

`src/core` owns the serializable game state, intent validation, explicit costs, mana allocation, phase navigation, selectors, event production, delayed effects, stack, transactional history and deterministic replay. It does not parse English Oracle text to guess behavior.

`src/rules` registers card capabilities and small named effect handlers. Its modules group mana engines, landfall, library manipulation, tutors/recursion, artifact mechanics and special mechanics. `accepted-cards.js` is an explicit acceptance allowlist, not a blanket declaration that future imports are implemented.

`src/ui` contains presentation, dialogs, pointer interactions, browser persistence and prepared laboratory fixtures. DOM and image data do not belong in game state. `window.ASTRA_IMAGES` is an optional presentation cache used by the single-file edition; canonical definitions retain compact local image paths even when an image is displayed from an embedded data URI.

`data` contains a pinned Oracle snapshot, compact definitions, candidate-pool records, original text, and a hashed local image manifest. Tokens and derived faces extend the definitions beyond the 160 candidates. `assets/cards` contains the local JPEG files.

`tests` contains targeted interactions, per-card legal-entry and activated-ability capability smoke tests, transaction/import integrity tests, and a real browser suite. `tools` builds both editions, serves locally, imports data, applies historical checkpoints and validates a release archive.

## Object and zone invariants

Each physical object has its own ID. Zone changes create a new object incarnation (`oid`); a target referring to a former incarnation does not become legal merely because the physical card returned. Token copies and copied definitions retain their own characteristics and last-known information. Move batches preserve simultaneous entry/leave relationships and distinguish casting, playing a land, putting a permanent into play, drawing, revealing and looking.

The active and reserve libraries are separate arrays. The reserve is a harness feature and must not leak into an ordinary active-library tutor selector. A visible top card is a permission, not a permanent reveal of the whole active order. Effects that temporarily expose cards carry a constrained workspace and explicit completion choices.

Mana has normal colored/colorless amounts and tagged restricted amounts. Payment validation considers the spell/action context; mana value stays distinct from the final paid cost. Mana suggestions consume only existing pool contents. UI code must never implement its own automatic source tapping or free sacrifice/move semantics.

## Intents, decisions and history

Use `engine.perform(intent)` for UI calls; it returns `{ok, error}` instead of throwing a rule error. Use `engine.act(intent)` in tests when failure should throw. A command is processed through validation, costs, choice suspension, effects, events, state checks and trigger collection before the transaction is committed. A pending cost or choice is part of its parent action.

UI subscribers are observers: an exception in a view or persistence observer cannot roll back an already committed game action. The engine records the latest observer error for diagnostics. The application catches view errors and still attempts autosave.

History stores before/after hashes, input intents, events and patches. Undo reverses an entire committed transaction; redo reapplies the exact outcome, including random results. A current transaction can be cancelled or rolled back. Export includes initial/current states, full undo/redo history, pending transaction and the rules-pack version.

Import validates the schema, zones, IDs, full patch history including entries after the undo cursor, transaction baseline, and replay of pending intents before replacing the current engine. Prototype-mutating keys and patch paths are rejected. State checksums detect accidental corruption; this is not an adversarial authentication or anti-cheat format.

## Add or update a card

1. Add its name and quantity to a developer candidate list and run the importer explicitly: `python tools/import_cards.py --deck data/candidate-pool.txt`. Existing metadata and printing pins are preserved. `--refresh` requests a developer-controlled refresh. This command may use the network; the runtime never invokes it.
2. Review the full local Oracle text, ruling snapshot, types, subtypes, keywords, mana value, faces, token references and art. A successful metadata import is **not** a rules implementation.
3. Register every required activated, triggered, static, replacement, spell or special-action capability in the relevant rules module. Reuse typed selectors and effects rather than branching on names inside core code. Targets use current incarnation references, and sacrifice costs are selected and paid before the ability reaches the stack.
4. Test both the intended line and rejection cases: timing, summoning sickness, payment restrictions, selection bounds, departed targets, own/opponent turns, batch moves, delayed effects and alternate play permissions as applicable. Exercise actual resulting state, not just that a function returned successfully.
5. Test export/import during a pending choice, complete the action, then test undo, redo and replay. Add a browser flow for any new interaction or choice presentation.
6. Only after review, add the name to `accepted-cards.js`. Imported but unsupported names must remain explicitly unsupported or partial; they must not inherit a generic 'full' fallback.
7. Bump the package/rules-pack version when state or semantics become incompatible. Rebuild both HTML editions and run the full verification pipeline before distributing the updated artifact. Old sessions with an incompatible rules-pack identifier are rejected rather than silently reinterpreted.

The 160 candidate acceptance cases exercise legal entry, and the registered-ability cases exercise activation and completion. These broad smoke cases are accompanied by targeted tests; they do not replace thoughtful rules assertions or prove all possible interaction combinations.

## Browser acceptance

`python tests/browser_test.py` starts the standard-library Node server, uses isolated Chromium contexts, clicks the real controls and checks engine outcomes. It also verifies direct-file startup, image loading, IndexedDB recovery after reload, actual downloads, rejected corrupted imports, responsive widths, and absence of external requests and browser errors.

The optional `--memory` mode renders authored HTML bytes into a blank page only for environments where URL navigation is unavailable. Its report explicitly lists the persistence/download/file-navigation checks it cannot run. A release must use the full report with **no skipped checks**; a memory-only report is insufficient.

The separate portable test opens a copied `Astra-standalone.html` with no adjacent source or asset directory, confirming that the single-file delivery does not depend on files left behind in the build workspace.

## Build and release

The build script bundles the local ES modules and CSS without runtime third-party dependencies. The folder edition keeps local images as files. `--standalone` embeds the same art in a separate presentation cache. Both editions block runtime network connections through their content security policy.

After Node and full browser tests, run `python tools/package.py`. It requires successful test reports, validates every asset hash, checks the generated HTML hashes, scans source/data for unresolved merge markers, and creates `dist/AstraSimulator.zip` with a per-file SHA-256 manifest. The archive contains normal editable source, local assets, docs, tests, build tools, and the folder edition. The standalone edition is a separate output to avoid duplicating all art inside the ZIP.

## Durable checkpoint recovery

The ordinary files on the repository's `main` branch are the source of truth. Checkpoints are supplementary immutable transport records used while building across temporary workspaces. Do not reapply them blindly to a partially edited tree. `.checkpoints-applied.json` records hashes of already-applied records; changing a recorded checkpoint is rejected.

For normal development, clone/download the current repository and edit its source files. For recovery, first inspect the latest remote branch and successful CI artifact rather than assuming a temporary local workspace is newer. A successful workflow artifact contains the exact source, tests, reports and local assets used for that run. Save progress to the remote repository at working milestones and verify the remote commit, not just a local Git commit.

CI preserves incoming source checkpoints before tests and packages its workspace even on failure. A failure artifact is useful for recovery but **is not a validated release**. Release status requires the full workflow to pass and the archive manifest to verify.
