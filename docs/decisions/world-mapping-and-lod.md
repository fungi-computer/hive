# World mapping and terrain LOD direction

Status: reviewed future direction, 2026-09-07. This record does not change the
15×15 playable clearing, active upstairs work, brewery direction, or current
World Lab implementation.

The [Minecraft-inspired terrain and isometric world study](minecraft-inspired-terrain-and-isometric-world-study.md)
is a future landform/cave/rendering companion. The current Maps sprint and its
bounded World Lab remain the active precedence.

## Committed direction

Normal travel crosses chunk boundaries invisibly. Prefetch follows camera/travel
direction and retains bounded overhang for canopies, roofs, and props. Camera
visibility is separate from active-world work; unknown data is never invented as
walkable ground. Cold loads and distant jumps may show an honest loading state.

Minimap loading is distinct from discovery permission. A surveyed atlas and later
physical charts/fog are separate visibility, durable knowledge, and item-custody
concerns; a chart is not a second terrain database. A possible geography-backed
Three pixel globe remains a future presentation study, not topology proof.

## One geography, several map resolutions

Use one footprint-aware generator across coarse globe, atlas/minimap, and local
LOD. Every query keeps the same seed, global/surface coordinates, recipe/version,
and amplitude scale. Build broad geography (continents/coasts/ridges/climate)
with finer layers on top; choose frequencies compatible with each pixel footprint.
Do not enumerate full-detail cells and resize them, change coordinate scale, or
renormalize amplitudes per zoom. Local authoritative terrain and pathing remain
unchanged by map resolution; coarse colors never grant walkability.

The next recipe also derives shoreline classification from the final physical
height and fixed sea datum. An independent coast-distance colour cannot define
water, and LOD cannot substitute a different sea or height recipe. The retained
drainage atlas remains evidence about the old sampler until its outlets are
recomputed against that corrected height-derived geography.

The first lab baseline remains 512², with 1024² only as a measured diagnostic.
A 4096² initial persistent region and an approximately 1000 km circumference
planet are unmeasured size proposals, not capacity claims or save-migration
decisions. Finite-surface mapping, projection, adjacency, seam/pole behavior,
and bidirectional picking remain unresolved before globe gameplay.

## Proof boundary

The first useful proof names a coast or ridge and shows it coherently in coarse
map and local detail, checks signed chunk seams and request-order equality, and
records bounded sampling work without hidden full-region enumeration. Cross-scale
identity and seam continuity are required; hashes or equal bytes alone do not
prove visual geography. Later roads, rivers, settlements, edits, discovery, and
physical chart rules need explicit scale-appropriate records or overlays.

World Lab owns its independent page/terrain files and proof; game-delivery retains
source, docs, Git, and deployment custody. No generic LOD/terrain framework,
streaming gameplay, globe gameplay, or remote hosting is implied by this record.
