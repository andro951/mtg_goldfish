# Floating Look and live zone grids — 1.4.8

## Look controls

The eye/Look button in the top toolbar toggles an independent floating workspace. It no longer shares the graveyard/exile/outside dock. A new look automatically opens the popup near the graveyard side of the table. It closes when the workspace is cleared. Closing it manually only hides the view: it never cancels or answers the game effect. A later look opens it again, even when it shows the same library card.

Drag the header to move the window. Drag the lower-right resize handle to resize it; the focused handle also accepts arrow keys. Mouse-wheel zoom and the plus/minus buttons affect only the preview camera. Drag empty preview space, or hold Space while dragging, to pan. Fit or the popup's Grid button restores the fitted card view. A new look batch is fitted to the available window area; manual zoom and pan are retained for ordinary rerenders, hiding/reopening, inspection, and restored instances of the same pending look. Window dimensions and position are saved with the layout.

The preview never changes a card's actual zone or grants permission to cast or move it. Right-clicking a preview opens its inspector. Where the pending scry or surveil choice accepts card selections, clicking the preview selects that card. Existing decision and order-confirmation controls remain separate. While ordering, Look displays only the remaining cards in their proposed top-first order; the actual library changes only when the rules engine accepts the choice.

## Automatic non-battlefield grids

Graveyard, exile, and outside-the-game docks compute their columns from their real surface size and current membership. Membership changes trigger reflow and fitting for grid-owned cards, instead of retaining the columns of a previously empty or tiny zone. New object incarnations count as new membership. This also repairs old saved metadata that lacks a membership signature.

Cards positioned manually remain at their world coordinates while new arrivals fill available grid cells. Moving a card does not itself refit the camera or rearrange other cards. The dock's Grid button is an explicit reset that returns all cards to the responsive grid. Battlefield placement, attachment-following, and the hand layout remain distinct from the side-zone grids.

## Verification scope

Unit regressions exercise growing and shrinking grids, replacements, manually released cells, saved preferences, pending look import, repeated same-card triggers, and read-only projections. Browser regressions use real Steelseeker, scry and surveil effects; move/resize/zoom/pan controls; card selections through an overlapping surface; pending export/import and actual autosave reload; repeated mill/exile activations; and the grid-reset button. Existing attachment, ordering, storage, performance, and offline release suites remain enabled. Release reports are tied to the exact HTML hashes; in-memory browser checks alone are not sufficient for packaging.
