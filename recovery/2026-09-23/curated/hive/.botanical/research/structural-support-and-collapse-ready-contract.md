# Structural support and collapse: ready contract

Read-only source inventory, 2026-09-08. This is a future contract only; it
does not add structural simulation to the brewing slice.

## Current Hive behavior

The current upper floor restriction is in [`src/construction.js`](../../src/construction.js):
`floorSupported` (lines 87–109) accepts a level-1 cell only when the matching
level-0 cell is enclosed by `indoors(state, 0)` or has a finished wall. A lower
roof or door blocks that support. Thus “wall directly below” is a useful
description of the explicit case, but an enclosed ground cell also qualifies.

`placementProblem` (lines 289–294) rejects an unsupported floor before a build
job is created. `upperSurface` in [`src/world.js`](../../src/world.js) (lines
100–107) makes only a finished floor or stair landing walkable support for
level-1 occupants and structures. Upper walls/roofs then require every cell to
have that finished surface (construction lines 343–357).

Deconstruction already computes a prospective state and refuses to remove a
floor if another upper floor would lose `floorSupported` (construction lines
201–218). Orders only require a finished target and prevent duplicate
deconstruction jobs ([`src/orders.ts`](../../src/orders.ts), lines 104–115);
dependency safety belongs in `removalProblem`, not in a new job store.

Persistence is strict schema 6. `siteSchemaV6` in [`src/persistence.ts`](../../src/persistence.ts)
(lines 270–280) enumerates building types; `checkSiteTopology` (lines 955–967)
rechecks floor support, and `validateClearing` (lines 1662–1666) runs all
invariants. [`src/model.ts`](../../src/model.ts) defines a site as a cell,
type, direction, material progress and finish tick; there is no support field.

## Smallest post contract

Add one ground-level, one-cell `post` building. A finished post supports every
level-1 floor cell whose horizontal **Chebyshev distance** from the post is at
most 1: `max(abs(dx), abs(dz)) <= 1`. That is exactly a 3x3 platform centered
on one post, including diagonals. Do not use a flood fill or connected-floor
propagation in the first contract: every floor cell must independently pass
the direct-ground, finished-wall, enclosed-ground, or radius-one-post rule.

Keep stair headroom, cross-level floor/roof conflicts, footprint bounds and
upper-surface rules unchanged. A post occupies its ground cell, blocks ground
movement like a wall while being built/finished, and cannot share that cell
with a lower roof, door, stair, pile, tree, rock or other object. Its art and
cost can reuse the wall construction path; its support meaning must remain a
separate predicate so a decorative prop cannot accidentally carry a floor.

The rule permits edge cells of a 3x3 platform and forbids a fourth row/column.
It is a deliberately simple load footprint, not a claim that real timber has
this capacity. A later design may add post strength, beams, cantilevers or
distributed loads, but none should be inferred from current `upperSurface`.

## Deconstruction and upper load

Removing a post must first evaluate the prospective state and reject the order
if any remaining level-1 floor loses all qualifying supports. Removing a floor
must retain the existing “upper surface clear” checks for actors, paths, piles,
bundles and upper footprints. Once a supported floor exists, current code lets
upper walls and roofs rest on it; that is a surface dependency, not a second
load calculation.

The first proof should contain one finished post and all nine surrounding
floors, save and restore it, then show that post removal is blocked until the
dependent floors are removed. Add a second post and remove the first to prove
that overlapping support footprints preserve the shared cells. A separate
proof should cover a post under a single edge floor; this makes the intended
cantilever boundary visible without inventing beam physics.

## Roof collapse is a separate system

Hive’s `roofSupported` (construction lines 484–497) currently checks enclosure
or a wall/door on the same cell. Jobs use it to wait before building a roof
([`src/jobs.ts`](../../src/jobs.ts), `buildOption`), but no collapse propagation
exists. A roof/cover is therefore not the same object as a load-bearing floor.

Ludeon’s [Sun shadows post](https://ludeon.com/blog/2013/08/sun-shadows/)
confirms that RimWorld tracks roofed areas and collapses unsupported sections,
but does not publish a distance metric there. An old [official Ludeon forum
discussion](https://ludeon.com/forums/index.php?topic=1049.0) reports a
support-distance rule and caveat that the roofing system was being redone; the
reported six-tile/nearest-support figures are historical player measurements,
not a stable current specification. Treat Manhattan, Euclidean, Chebyshev,
support propagation and roof material effects as unresolved until a target
version is selected.

When chosen, roof collapse should be its own contract: identify connected roof
cells, mark cells unsupported after wall/post removal, resolve collapse in a
deterministic order, and define actor/item damage and salvage. Do not make a
3x3 floor post silently imply roof support, and do not add roof collapse to the
post/floor proof or current brewing work.

## Save and implementation boundary

Adding `post` requires a model/building union update, strict site schema and a
save-schema migration or explicit version bump. Restored states must rerun the
same support and deconstruction invariants; old saves must remain valid without
invented posts. New support must be included wherever construction, jobs,
removal, topology validation and UI descriptions currently call
`floorSupported` or enumerate building kinds. No support cache should be
persisted before profiling demonstrates a need.

Minimum acceptance is the focused post/3x3 save-and-removal proof above. Roof
collapse, wide roofs, upper-load chains, damage, debris and arbitrary
cantilever rules remain a later, separately reviewed contract.
