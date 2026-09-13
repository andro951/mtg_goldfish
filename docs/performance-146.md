# Astra 1.4.6 — trace review and performance changes

## Evidence

Source: the user-supplied `Trace-20260913T104221.json.gz`, recorded from Astra 1.4.1. The anonymized `trace-20260913-summary.json` records its SHA-256 and reproducible measurements. The raw trace is not included in this repository.

The selected trace spans 72.333 seconds. Its main thread contains 32 tasks longer than 50 ms. The ten `previous.onsuccess` callbacks total 42.319 seconds; the slowest lasts 5.236 seconds. This is the callback that reads the previous autosave, serializes both full sessions to compare them, and writes another complete copy. The same implementation was still present in the verified 1.4.5 source. Timer-based saves also copied complete histories before that callback ran. Sampled JavaScript heap reaches roughly 2.44 GB.

Rendering was not the dominant cost in this recording: layout totals approximately 88 ms, style recalculation 54 ms, and paint 290 ms. These are overlapping trace categories, not additive partitions of total elapsed time. Existing drag-preview, selection-DOM reuse, and target-arrow regressions remain in the acceptance suite; they were not replaced by a framework or language rewrite.

## Changes

Autosave stores an initial-state record, one immutable record per committed action, and a current-state/layout body. Tiny head records point to the current and previous complete recovery points. Each append writes only new history records and the current body. Both heads advance in one IndexedDB transaction. An aborted transaction publishes neither partial state nor a broken recovery point; garbage collection retains all chunks referenced by either head.

The localStorage fallback uses staged chunks and a single atomic head update, with rollback on quota failure. Migration keeps the previous legacy envelope until it has legitimately rotated out. Blocked database upgrades explicitly ask the user to close older tabs instead of hiding the existing save behind another backend.

The application captures at most one in-flight save and coalesces later changes. Repeated unchanged flushes do not create snapshots. Layout-only saves reuse history records, and validated reloads adopt the existing record identities.

Reversible array patches retain only changed segments. Append-only zone history therefore grows linearly in the undo journal instead of being copied into every later action. State snapshots share deeply frozen historical records but keep live objects and arrays isolated. Canonical FNV checksums remain compatible with the earlier serializer, with less temporary allocation. Trigger-source deduplication now uses a Set instead of repeated scans. Manual-action totals are cached per immutable history entry.

Old whole-array histories are compacted during import, retaining their events, actions, checksums, undo and redo. Historical implicit Provisioner choices, including the legacy prefix of an unfinished action, remain reproducible; newly executed choices still default to Ask.

## Verification and limits

The regression suite includes randomized patch/hash equivalence, a 20,000-record append, 160 actual zone-change actions, old-session compaction, rollback, public-export isolation, pending-action reload, quota and transaction failure, chunk garbage collection, and cross-store identity reuse. Browser tests exercise actual IndexedDB, real card controls, loyalty geometry, the Ask selector, and autosave coalescing.

`test-results/performance.json` compares 1.4.5 with the current build in the same Chromium process using independent browser contexts, 160 identical moves and eight awaited real autosaves per build. Its build hashes bind the measurements to the tested HTML. It is a controlled synthetic workload, **not a replay of the user's recorded session**, and its timings must not be treated as predictions for another computer.

A separate engine-only benchmark is available as `node tools/benchmark-engine.mjs <source-directory>`. The local 160-move comparison reduced a session from 67,968,102 bytes to approximately 3.56 MB without deleting history. Absolute timings vary with the machine and workload.

First import of a very large old JSON file still requires parsing and integrity validation. A finite stress suite cannot prove that every possible deck, browser, session length or interaction is free from latency. These changes remove the specific full-history autosave and quadratic-growth paths exposed by the supplied trace rather than concealing them by disabling autosave or truncating undo history.
