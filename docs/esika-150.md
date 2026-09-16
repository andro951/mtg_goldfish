# Esika / Gods pool — 1.5.0

## Exact request and deck preset

`data/decks/esika-gods-pool.txt` is the revised 146-name request: 116 main-pool copies, one Esika commander, and 29 outside-the-game copies. Crystal Quarry and Cascading Cataracts are in Outside the Game, and the revised fetch/dual/utility land package is included. The editor preset is **Esika · Revised 146-card Gods pool**. The existing candidate harness keeps all main-pool lands and selects enough nonlands to create a 99-card active library, with 17 remaining candidates in reserve. It does not silently trim the supplied file to a 100-card deck.

The combined catalog grows from 317 to 454 candidate names, with 495 local card/token definitions and 501 card/face images. All prior lists remain available and supported. Loading a preset is explicit, not an automatic replacement of the user's saved deck.

## Rules and interaction coverage

Esika supports both modal faces from hand and command zone, their real mana costs, commander tax, creature/enchantment characteristics and cast triggers. The Prismatic Bridge reveals into play rather than casting its hit. Devotion counts printed colored symbols, including hybrids, rather than the colors granted to permanents; Gods dynamically gain or lose creature status. A God that ceases to be a creature is removed from combat and cannot rejoin just by regaining devotion.

Enchantment animation includes Starfield of Nyx, Opalescence, Zur and Bello, with current type, power/toughness and applicable keywords. Bestow uses an Aura spell and actual attachment; an invalid target or an attachment ending restores the creature form. Returned Enduring cards have new object identities and lose creature status without inheriting obsolete attachments or counters. These mechanics use the existing attachment arrows/follow controls and creature-stat overlays.

Lifegain tracking uses total life gained during the turn, not net life change. Tokens, counters, conditional indestructibility, exact-threshold Amalia destruction, optional payments, reflexive targeted triggers and end-step returns are covered. Wraths use simultaneous changes, and tests distinguish destruction, damage, sacrifice and exile. Tutors, top-card effects, surveil, scry, reanimation, overload and hybrid-cost decisions use real serializable game actions with undo, redo and import/replay tests.

The revised lands retain the utility-land inspector behavior. Compatible one-mana abilities are merged only in the interface. Multi-mana filters and extra costs remain separate. Shock lands ask about life payment before entry; paying does not negate an instruction to enter tapped. Fetches search by land types rather than basic status. Reflecting Pool and Cactus Preserve evaluate potential mana types without executing abilities, including colorless and granted types, and avoid recursion between dependent lands. Cactus Preserve uses only its controller's commanders when determining animation size.

## Verification and limits

Each of the 146 requested names must have canonical metadata, a local image, an implemented module, a passing legal-entry test and at least one passing focused rules scenario. `tools/verify-card-support.mjs` writes an individual audit; the release gate checks that the complete revised request is present. The expanded land-click audit covers 83 land names in four configurations, for 332 cases. Browser scenarios cover both Esika faces, bestow, hybrid costs, overload, entry replacements, floating Look, mode selection, life payment, Enduring recovery, Dance of the Manse, preset partitions and pending-session reload.

This extends the existing goldfish simulator, not a full multiplayer client. Opponents remain abstract: there is no blocker AI, and opponent payments/discard choices use explicit prompts or reported values. Effects that require an opponent's Island count or producible land colors use modeled opponent data and actual opponent lands on the table. A finite test suite does not prove every possible interaction with every printed Magic card. The audit describes this supported catalog and the scenarios actually exercised.

Old supported sessions retain their historical replay behavior; new live actions use the new rules. Export before replacing the old application. Larger catalogs increase the standalone file size because card images remain embedded for offline use.

## Rules references used in review

Canonical card text and images are pinned in `data/cards.json`, `data/oracle-snapshot.json` and the asset manifest. These primary release notes were used to cross-check particularly sensitive mechanics:

- Wizards of the Coast, Commander Masters release notes: https://magic.wizards.com/en/news/feature/commander-masters-release-notes
- Wizards of the Coast, Outlaws of Thunder Junction release notes: https://magic.wizards.com/en/news/feature/outlaws-of-thunder-junction-release-notes
- Wizards of the Coast, Theros Beyond Death release notes: https://magic.wizards.com/en/news/feature/theros-beyond-death-release-notes-2020-01-10
- Wizards of the Coast, Modern Horizons 3 mechanics: https://magic.wizards.com/en/news/feature/modern-horizons-3-mechanics
