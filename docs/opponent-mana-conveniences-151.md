# Opponent mana conveniences — Astra 1.5.1

This release checkpoint covers the opponent-state conveniences used by Carpet of Flowers, Path of Ancestry, and Exotic Orchard.

- Carpet of Flowers estimates additional opponent Islands with `floor((your turn - 1) × rate)`. The default rate is `0.5`, giving estimated additions of `0 / 1 / 1 / 2` on your turns 2–5. The estimate is added to Islands actually modeled for the selected opponent.
- Path of Ancestry uses the ordinary direct mana-source click path. With a five-color commander it opens the standard W/U/B/R/G mana picker; the selected mana retains ancestry provenance for Path's matching-creature scry behavior.
- Exotic Orchard defaults to the simulator convenience that opponents can provide all five colors. Disabling that setting returns to colors the simulator actually models or reports for opposing lands.

Release regression coverage includes engine/session round trips plus a real rendered battlefield-click acceptance check for Path and the Carpet setting.
