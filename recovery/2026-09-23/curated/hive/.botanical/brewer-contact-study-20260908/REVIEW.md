# Brewer contact: first working original art shape

2026-09-08. Root-authored ignored-only geometry, based on pinned9f78aa3 copies.
Tracked live art and current Fill Kettle UI are untouched. This is preparation
for the later attended brewing phase, not an additional pail-release gate.

The source/caller read found the old paddle grip over one geometry unit from
the closest legal worker cell, beyond the accepted figure's limb lengths. A
work pose alone could not fix it. The working candidate keeps the station's
2x2 footprint and gives the brewer a longer diagonally held paddle. Two fixed-
length arms bend to two authored grip positions from one shared phase function;
no arm stretching, duplicated paddle animation or second actor position.

Unrotated worker cell is (2,1), facing -X; station direction1 rotates the complete
contact about (.5,.5), yielding worker (1,-1), facing +Z. Ordinary access cells
remain useful for delivery; later PREPARE needs this distinct exact work contact.
This does not implement a general furniture reservation or navigation framework.

Owned run-u2543.scope, invocation86863531eb03451cbcc4ab12c576056e, native14435,
exited0 normally. `render-v1/proof.json` covers32 actual composed Three bakes:
Rowan/Sedge ×2 station facings ×8 phases, 64 exact palm/grip contacts, unchanged
limb lengths, legal integer feet, nonclipped alpha, distinct phases, Pixi playback,
pause and disposal, stable source hashes and errors[]. Its ephemeral Vite/browser
closed normally. No unrelated runtime/proof process was touched.

Root personally viewed `render-v1/native-and-game-scale.png`: both figures keep
the accepted identity, can hold the handle naturally, and read at native and3x
scale. This accepts the first contact geometry direction only. Personal full
motion review and the eventual separate-sprite ordering/caller remain pending.
The composed Three image does not prove those runtime layers. No integration
patch or final changed-art acceptance is issued from this first checkpoint.

Retain the pinned baseline inventory and all32 phase PNGs. The current active
art writer may independently add accepted carry-pail; never replace its whole
figures file with this study copy. Any later integration is a narrow new-pose
delta after caller/contact review.

## Rim correction and motion disposition

The first geometric hand-contact check did not establish pot clearance. Root
added a shaft/rim check and retained the failed v2 run-u2579,
invocation1a0b5e4922c7401daf5bfe518270b65c, exit1: three ray intersections at the
first tested pose. V1/V2 sources and evidence are preserved separately.

Geometry-only u2582/242cc154a5fd44b09985fe631ed5af8d exited0 and qualified one
candidate within the declared position ranges using both unchanged arm lengths
and16 shaft-clearance rays per phase. This is a bounded art-contact search,
not a collision engine. The v3 contact extends toward the back of the kettle
and raises the handle; neither feet nor limb lengths change.

Rendered v3 u2583/3dd2537417a546a78c62e2a30ea89fd9, native35528, exited0:
32 bakes,64 exact palm contacts, nine shaft-offset rays per pose clear the actual
kettle body/rim, legal cells, original reach, alpha containment, playback/pause,
disposal and stable source. Root personally viewed both v3 native/game-scale
gallery and all32 native phase images.

**Final motion is not accepted yet.** The hand position is high and body motion
too subtle at native scale. The geometry demonstrates feasible reach and clears
the pot, but those passed assertions do not make it a finished working animation.
Keep this as the future PREPARE contact prototype. The next art correction should
seek a natural torso/shoulder pose and more legible stirring while retaining
physical contact and clearance; it cannot silently move the logical worker,
stretch arms or change the accepted idle kettle. No production art patch follows
from v3. Current carried-pail integration and Fill Kettle release continue.
