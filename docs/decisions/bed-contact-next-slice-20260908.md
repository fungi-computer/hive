# Bed contact: next-slice readiness — 2026-09-08

Read-only readiness at `071a59e09533`, under the accepted furniture-contact and
isometric-order decisions. No runtime assignment or long home harness follows.

## Current fresh-v7 precedence

Levi's fresh-v7 policy supersedes the historical-overlap/save-migration wording
retained later in this readiness record. No v1–v6 decoder, migration,
compatibility type, back-shim or live legacy mirror is authorized. Fresh v7
fixtures validate contact state directly; old slots remain invalid and available
only through raw download or explicit New Clearing replacement. The historical
cases below remain design evidence, not implementation scope. The eventual
contact-version transition for worlds first saved as valid v7 remains undecided
until its actual implementation handoff; this is not an eternal no-migration
policy for later valid worlds.

## Exact remaining player-visible problems

1. **A finished bed is ordinary route space.** `world.js:121-139` blocks rocks,
   watcher, standing trees, wall plans, stair ramp cells, and absent upper
   surfaces, but no bed footprint. `movement.js:18-40` routes through either bed
   cell, and `orders.ts:45-57,361-373` permits drafted Go through the same set.
2. **Sleep has no physical entry or exit.** `jobs.ts:226-285` calls `route` to
   the bed anchor and considers a bed occupied only while another actor has a
   sleep task. `activity.ts:332-381` changes walk directly to sleep on the
   anchor. `finishActivity` (`activity.ts:50-60`) clears task/path but leaves the
   actor there. Morning (`routine.ts:15-28`), full rest, cancel/direct order,
   Draft (`orders.ts:138-175,341-347`), and shelter loss/deconstruction
   (`activity.ts:218-253`) can consequently produce an idle or drafted body
   inside furniture. Paused commands can trigger that state immediately.
3. **Construction can create the conflict.** `construction.js:128-183` derives
   generic work positions from neighbors of the anchor; for a two-cell bed one
   neighbor is its foot cell. `activity.ts:187-197` completes the bed without a
   prospective body/path-clearance check. `placementProblem` protects wall and
   stair paths specifically (`construction.js:285-406`), not a bed's whole
   future solid footprint.
4. **Removal wakes but does not egress.** `removalProblem`
   (`construction.js:201-261`) has upper-floor/stair safety checks but no occupied
   furniture rule. Deconstruction interrupts sleepers before removing the site,
   which clears their sleep task at their unchanged bed coordinate.
5. **The picture still lacks contact-aware ordering.** `view.js:20-28,449-480`
   sorts a whole actor at one anchor; `construction-view.js:150-182` sorts a
   whole two-cell bed from its anchor. A foot floor can paint over the bed, and
   mattress/body/cover order has no declared relation.

## Minimal deep owner

Add one narrow **furniture-contact** module, backed by authoritative contact
records in clearing state. A furniture definition exposes its solid footprint
and named use slots. Each slot specifies a body contact cell, legal external
approach/exit cells, facing/pose key, clearance profile, and whether the body is
on the furniture surface or adjacent to it. This supports the existing bed's
one on-surface slot and an upcoming brewer's adjacent workstation slot without
making either rest or fermentation generic.

The module owns slot exclusivity and the phases `approaching → using → exiting`,
plus checked operations to reserve, authorize entry, request exit, and release.
It answers solid-body blockers, available slots, legal work/use approaches, and
prospective completion/removal conflicts. Existing movement remains the sole
owner of position, path, leg progress, edge timing, and traversal. Contact may
derive approach/exit endpoints and request a route, but never stores a second
path, coordinate, or progress copy. Rest, jobs, pathfinding, materials, brewing,
support, and rendering keep their outcomes. Contact is the physical obligation;
a sleep job remains intent.

On wake, cancellation, Draft, or shelter loss, `using` becomes `exiting`. Rest
progress stops, but a blocked exit retains the provider/slot and a visible
waiting reason. Movement advances the authorized exit through the actor's
existing path/leg fields; contact observes arrival and releases the obligation.
Ordinary assignment and drafted Go cannot start another traversal until that
exit completes. The smallest Go contract while `using` or `exiting` is an
explicit rejected/waiting receipt such as “Finish leaving the bed first”; the
player can issue Go after exit. It must never report applied and then discard the
destination. Deconstructing an occupied provider waits for legal exit. Bed
completion waits before its final increment if its whole prospective footprint
contains a body, active edge, or conflicting loose good; its build approach is
outside the footprint.

## Materials dependency and independent readiness

Geometry, slot definitions, deterministic approach ordering, transition laws,
and the visual ordering relation do not depend on material representation.

Runtime wiring must follow Delivery's coupled v7 checkpoint. It intersects the
current writer's `model.ts`, `activity.ts`, `jobs.ts`, `orders.ts`, `clearing.ts`,
and `persistence.ts`; egress must preserve the canonical v7 hand lot/transfer.
Workstation use also needs the accepted container/process boundary. After
handoff, one writer wires all consumers and deletes bed-specific ownership.

## Save, rest, and cat distinctions

The next save version records only contact owner, provider, slot, and phase;
existing actor position/path/leg fields remain the sole movement continuation.
Validation requires unique slot/actor ownership, a valid provider, supported
contact surface, and a movement state/path endpoint consistent with the phase.
Existing sleepers can migrate with rest/work progress intact. A narrowly scoped
legacy-overlap egress obligation is a proposal, not a proven migration: first
read representative historical idle, walking, carried-material, and mid-leg save
fixtures, then choose a deterministic recovery that retains the existing
movement continuation. Do not teleport, silently reset a path, write on load, or
leave a permanent blocker exemption.

Rest changes only while a human is `using` a bed. The current cat path remains
ground-only (`clearing.ts:61-88`), and its nearby `sleep` pose is not bed
occupancy. Future cat-on-furniture needs a compatible cat slot/capability and
contact transition, never an exemption from solid furniture.

## Focused proof

For both bed directions and both levels: reject ordinary transit/Go over the
full footprint; build from outside and wait safely on a crossing body/path;
reserve one slot against two sleepers; enter, sleep, and exit on morning, full
rest, cancel, Draft, shelter loss, and deconstruction; reject Go visibly during
contact, then accept it after exit; hold a blocked exit without rest gain;
preserve v7 goods through interruption. Pause/save/reload at approach, use, and
exit and compare exact movement continuation with no contact-owned path copy.
After historical fixtures are read, add only the representative legacy
overlap/active-edge cases the migration actually supports. Add one
workstation-slot fixture proving the same exclusive approach/release API without
coupling fermentation to contact. A compact two-axis/two-level render trace uses
the contact's provider/slot/phase with movement's `visualPosition` for
support-before-bed and sleep composition; no full-house replay is required.
