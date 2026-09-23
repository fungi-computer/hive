# Room blueprint seam

Read-only design check, 2026-09-07. This note does not implement templates or
change the current repeated-wall release.

## Current construction facts

`src/model.ts:7,10-19,74-81` represents a build intent as a `build` command
with one `BuildingKind`, cell, direction, party and actor scope. A persisted
site has only its own ID, type, position, direction, delivered amount, work,
and `finishedAt`. Jobs reference the site by a newly allocated target ID.

`src/orders.ts:131-154` proves the lifecycle: accepting a build command creates
a fresh `site-${nextId}` with `delivered: 0`, `work: 0`, and `finishedAt: null`,
then a separate fresh `job-${nextId}`. `cancelJob` removes the job/site and
refunds delivered material (`orders.ts:54-60`). A room stamp must therefore
expand into ordinary build commands and let the existing command path allocate
all IDs and work. Copying sites, jobs, claims, delivered amounts, or actor
state would duplicate authority and material.

`src/construction.js:18-26` is the important footprint limit. Walls, doors,
roofs and other non-bed buildings occupy one cell. A bed occupies two cells:
direction `0` extends to `(x, z + 1)` and direction `1` extends to `(x + 1, z)`.
The model normalizes every build direction to `0` or `1` in `orders.ts:137`; a
template must not assume four directional anchors or emit directions `2`/`3`
without extending the model and art contract.

`placementProblem` checks the complete footprint against the map, trees, rocks,
watcher, and same-category sites (`construction.js:28-45`). Walls additionally
cannot overlap actors/cat paths or wood piles (`:47-60`). A stamp must validate
the transformed footprints and visibly report blocked placements. The existing
per-command API can accept some intents and reject others; it does not yet
guarantee atomic room admission. Choose that group behavior explicitly when the
first template caller lands, rather than silently losing part of a layout.

Roofs deliberately overlap non-roof sites: the duplicate check only rejects an
overlap when both existing and new site are roofs (`:34-39`). However,
`jobs.ts:38-41` makes a roof job wait until `roofSupported`, and
`construction.js:95-104` requires finished enclosing wall/door or an already
indoor cell. A copied room may include roofs and can submit them with its walls;
the scheduler will wait safely. Roofs still require one-cell coverage matching
the room and should never be treated as a finished cover at stamp time.

`indoors` uses only finished wall/door boundaries (`construction.js:65-93`), and
`shelteredBeds` requires a finished reachable door, a finished bed, interior
bed footprint cells, and finished roofs over every bed cell (`:106-133`). A
template's room semantics are consequently derived from the resulting sites;
there is no room object to serialize or copy.

## Smallest safe template shape

Keep a template as authored relative build intents, for example
`{ type, dx, dz, direction }`, with a declared single-storey level `0` and an
anchor convention. On stamp, transform each relative cell around the anchor,
rotate the complete footprint and re-anchor it in the supported positive-axis
bed representation. Merely rotating the anchor and toggling direction is not
sufficient: a rotated positive-X extent can become negative-Z. The current art
also lacks four distinct bed headings; do not claim preservation of every
head/foot orientation without extending that contract. Reuse the owning
placement rules to check both live collisions and internal template overlaps;
do not introduce a second placement validator in the UI. Expand ordinary build
intents in dependency-friendly order:
enclosing walls/door, bed, then roofs. The command path still owns placement,
site/job IDs, material hauling, claims, work, cancellation and completion.

The template must contain no actor IDs, selected actors, jobs, claims, cargo,
wood amounts, `finishedAt`, paths, or rendered objects. A second stamp gets
new sites/jobs and must pay/haul its own recipe materials. Preserve the source
template's door and roof intents; never copy only a visual room shell.

The first useful proof is one authored 0-level room with a door, walls, a
two-cell bed in each supported orientation, and roofs over the bed cells:

1. Stamp it once and verify fresh sites/jobs start with zero delivered/work and
   no copied actors or claims.
2. Stamp it again at a non-overlapping anchor and verify IDs, work and material
   obligations are independent.
3. Confirm roofs remain pending until finished enclosure exists, then confirm
   the resulting bed is sheltered and usable.
4. Reject an anchor that would place any transformed cell outside the map or on
   a tree, rock, watcher, actor/path, pile, or existing same-category site.
5. Replay the same command stream and compare site/job IDs, material totals,
   completion ticks and shelter results.

This is a reusable command expansion seam, not a room database, copied-state
mechanism, or general building framework. Multi-floor templates, arbitrary
four-way furniture, partial-stamp recovery, and structural editing need their
own callers and proofs later.
