# Furniture contact and navigation: chosen next boundary

The newer [bed-contact next slice](bed-contact-next-slice-20260908.md) settles
the persistence boundary: contact stores provider, slot and phase only.
Movement remains the sole owner of position, path and `leg`; Go waits/rejects
until exit completes. Levi's fresh-v7 policy supersedes historical overlap/egress
recovery: no v1–v6 decoder, migration, compatibility type, back-shim or live
legacy mirror is authorized; old slots remain invalid/raw-download/New Clearing.
The eventual contact-version transition for valid v7 worlds remains undecided,
not prohibited as a general future migration policy.

Astra Game CTO decision, 2026-09-08, following Delivery's `d57d02e` picker/Go publication and Levi's clarification of the bed screenshot. Controls remain the current writer's priority. This is an ignored readiness handoff for Delivery, not a runtime change or acceptance of new rendered pixels.

## Decision

Keep the small grid/surface navigation owner. Update derived static geometry, endpoint adjacency and clearance caches when actual topology changes, coalescing affected regions at a deterministic transition boundary. Include blueprint blocking where the current game deliberately reserves a future wall; topology is not synonymous with finished construction alone. Every query sees the matching authoritative revision. Do not rebake on a timer, periodically scan the whole world, or introduce a navmesh library for this repair.

Moving bodies, furniture use slots, short-lived landing reservations and active traversal clearance are dynamic constraints managed through the same navigation API, separate from static geometry. Measure actual route expansions, reuse/invalidation, active bodies and edited regions before selecting navigation meshes or shared destination fields. A shared field helps only when goals/profile/cost policy are compatible; it cannot erase current reservations or substitute for loaded-route eligibility. The longer surface/traversal direction is in `vertical-world-and-tower-ready-contract.md`.

The near-term semantic rule is explicit: **a finished bed excludes ordinary human walking, idle placement and Go over its entire footprint. Sleeping deliberately uses the bed through a reserved furniture-use surface.** A bed is not globally walkable just because it is usable. Cats will reach appropriate furniture tops through reviewed capability-based transitions, using that same surface owner; no `if cat then ignore objects` exemption. Cat hopping remains a later small art/navigation packet, not an additional requirement for the controls repair.

## Actual joined callers that must change together

- `world.js:blockedCells` omits beds. `construction.js:footprint` already contains both bed cells. `workPositions` uses neighbors of the anchor, which includes the bed's foot cell in either direction. New bed completion must not turn the builder's present cell into an illegal ordinary location.
- `jobs.ts:jobOption(rest)` routes directly to the bed anchor; `bedFree` derives exclusivity from an assigned sleep task. `construction.js:shelteredBeds` also checks access to that anchor. Blocking beds without changing those goals would remove all usable beds.
- `activity.ts:advanceWork` treats sleep as an on-target action and tests `sameCell`. `finishActivity` clears task/path/work and leaves coordinates unchanged. Wake, full rest, direct orders, Draft, cancellation and shelter teardown can therefore leave a newly ordinary body inside a now-blocking bed.
- `persistence.ts` validates sleep job/bed identity but needs the corresponding use/approach/exit location contract and exclusivity. Old valid saves can contain idle or walking people inside beds; a new strict blocker cannot simply invalidate those saves.

These are one small coupled contact migration with one writer. A render-only correction may land separately when useful. No material, party or animal framework rewrite is required to describe one bed use slot.

## Entry, use and exit are physical obligations

Define legal work and use approach positions outside the entire footprint, with appropriate support and navigation. Only a typed bed-entry transition may cross from such an approach onto its reserved use surface. The first bed has one use slot. The renderer derives the approved sleep pose/contact point from the bed's actual definition and direction, while ordinary route goals remain outside its blocked body.

Reserve the use slot when committing a sleep assignment, then revalidate entry before use. Cancelled approaches release it. Once a body is using the bed, its furniture contact belongs to its physical location, rather than vanishing when the requesting job is removed. Wake/cancel/Draft can end sleep and request exit immediately; a body actually exits through a legal adjacent position before ordinary work or free standing resumes. Paused commands do not advance the tick or teleport the body. If an exit must wait, expose that reason and retain the minimum physical use/exit obligation, without continuing to grant sleep progress.

This is the bounded implementation policy to prove; choose the smallest checked representation that distinguishes approaching, using and pending exit. It need not persist a second independent position or a library runtime. A drafted actor can have no ordinary work assignment while still having a physical exit obligation; update the exact validator accordingly rather than abusing a sleep task as that obligation. Go can consume a legal exit followed by its route, and must not erase the use reference before exit. Existing cargo/claim interruption still uses its real material owner. Do not put a new hauling implementation into furniture code.

Before a bed finishes, verify its prospective blocking volume is clear of bodies, active traversal and conflicting loose goods, and choose the builder's work point outside it. Check before the final work increment: the current save law rejects an unfinished site already at the full work count, so waiting must not create that contradictory state. Construction input already delivered to the site remains its real accounted input, distinct from unrelated loose goods in the footprint. Future planned routes can invalidate and replan; they should not permanently lock construction. Deconstruction of an occupied bed waits for a legal exit, and losing shelter wakes the sleeper through the same exit path. Structural removal/support remains a separate check.

`updateRoutine`, `assignWork` and its cargo-continuation branches, `advanceWork`, and `advanceDrafted` must respect the same pending physical exit. Clearing an ordinary task cannot make an occupant eligible for another movement owner in that tick. Advance at most one movement/contact edge per body per fixed tick; a finished exit may expose readiness for a later step but cannot also consume a full second route step through another caller. A body waiting for exit is neither an ordinary idle worker nor a free-standing drafted body merely because its old sleep task was removed.

Prevent an ordinary player construction edit from sealing every legal exit of an occupied bed without an explicitly supported recovery behavior. A blocked destination should not force a body onto a different storey, through a wall, or into duplicate inventory. Forced destruction and injury are later systems and do not need to be smuggled into this repair.

## Preserve old saves deliberately

Version this location/contact change. Existing valid sleeping actors acquire the corresponding unique bed-use reference and retain their actual rest progress. Existing walkers aimed at a bed acquire a legal approach/entry plan under an explicit deterministic migration. Retain job and material identities; do not recreate goods from a job definition.

For legacy ordinary actors already overlapping a bed, preserve the old saved position and record a narrowly scoped migration-only egress obligation tied to the exact overlapping furniture. On resume they may physically leave that recorded overlap toward a legal adjacent floor, then the exemption disappears. They cannot use it to enter a new bed or authorize unrelated blocked movement. A currently unavailable exit remains an explicit recoverable waiting condition. Do not silently relocate them to a nearest-free tile, reset the world, or claim exact positional preservation after moving them during decode.

The migration must account for active jobs, carried goods and paths in that legacy case; it may invalidate future route caches, but must preserve the actual material/custody and requested work. Include a legacy actor with `leg > 0` already moving into or through a bed: preserving only the integer endpoint while clearing path/leg snaps the body and is not exact restoration. Retain the narrowly scoped old active-edge geometry, timing and egress obligation until it reaches a supported recovery point, or explicitly recut that case before landing. It must also provide an actionable route out of a fully enclosed legacy overlap. For example, normal deconstruction of an accessible enclosing obstruction can open an exit; removing the overlapping bed itself can be allowed only after a prospective check proves the body already has valid underlying support and no actual occupied top surface would be destroyed. If a saved case has no supported recovery under the chosen policy, report that concrete case before release and recut it. Do not ship an indefinite hidden validator exception.

Keep the original raw save recoverable and do not write on load. New snapshots encode the bounded contact/egress obligation honestly; new ordinary gameplay cannot create an untagged actor-in-bed state. Strict restore checks one slot owner, provider identity, support and allowed edge/phase. Entry/exit progress is nonnegative with a positive bounded traversal duration; starting or waiting can legitimately have zero progress. Using a bed has its own rest/progress semantics and is not forced into a fixed-duration movement bound.

## The separate floor-over-bed rendering defect

The clarified screenshot concerns a separate Upper floor tile painting over the foot of an Upper bed. In current `construction-view.js`, both use the anchor sum plus the same Upper offset. The bed spans two cells, so its foot-supporting floor has an anchor sum one greater and can paint later than the entire bed. This is a missing geometric relation, not evidence that a special bed texture is needed.

For this case, every actual supporting floor surface must precede the supported bed body. A whole-bed sprite can satisfy that relation if the resulting ordering is acyclic. Keep physical support/visible geometry bounds and stable deterministic ordering from `isometric-order-and-structural-support.md`; do not replace this with another arbitrary global bed offset or draw all furniture above all floors at every elevation. Split a baked object into reviewed parts only when a demonstrated overlap requires interleaving or produces a cycle that whole sprites cannot satisfy. This screenshot alone does not establish that requirement.

The proved supporting-floor-before-bed relation is presentation-only. It does
not make draw order the owner of physical support or contact: full-footprint bed
blocking, legal entry, the reserved use slot, exit and sleep remain owned by the
physical contact/navigation transition above.

Navigation blocking will not repair those pixels. Conversely, changing depth order will not stop Sedge from being legally routed into the bed under the old model. Prove both claims separately and retain the actual source/art boundary: unchanged accepted geometry needs ordinary source/render verification, not another ceremonial art gate. New bake parts or contact animation go through the existing reserved original-art review if they change the visible art.

## Focused exit, after controls

Use deterministic laws for both bed directions: full footprint excluded from ordinary Go/transit; outside build approach; completion does not trap a body; one sleeper use slot; reachable entry and exit; wake/Draft/cancel/shelter loss; blocked exit waits; deconstruction respects contact; exact paused restore and representative legacy overlap/egress with goods conserved. Include a route-invalidated-by-completion law, rather than hiding the change in a rendering test.

One compact rendered fixture should show the bed's entire foot above its actual support floor in both directions, an ordinary person stopping beside it, deliberate sleep contact, and exit. It does not need to earn an entire two-storey house again. One short joined real UI/served check after source acceptance is sufficient; retain scope limitations and failed evidence. Controls, source cleanup and independent World Lab work continue under Delivery's existing custody while this packet is prepared.

Root reviewed the independent exact-caller note `.botanical/research/bed-contact-caller-review.md` in full and incorporated its source findings and final corrections above. That reader found the chosen physical use/exit policy coherent, with the phase-zero, single-movement-owner and legacy-active-edge corrections now included. The note is supporting source evidence, not another requested tracked architecture framework.
