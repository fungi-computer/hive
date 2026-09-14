# Clearing repair implementation packet

Status: design instructions, not implemented/qualified behavior. Source baseline
`ab58104` in `/mnt/fungi-data/botanical-work/pathfinding-clean`. Integrator remains
on `engine/pathfinding-clean-20260913`; use separate worktrees for each writer.
This packet refines the September 14 sections of
[the owning sprint](../../CLEARING-CONSOLIDATION-PLAN.md). Later direct Levi
instructions supersede it. Do not revive historical queues elsewhere in that file.

## Outcome

A player joins a shared world, receives two people in one persistent party, can
Draft/Undraft them, designate/build/haul/brew without trapped workers, and see
correct furniture/people/stair overlaps. Disconnecting leaves the party working
while the Region runs. Commands and supplies remain party-scoped. Original art,
Rust physical ownership, DO durability and existing assignment performance remain.

## Read in this order

1. [Work attempts and exact physical results](01-work.md): canonical types,
   transitions, cancellation/cargo, complete consumer migration and deletions.
2. [Contacts and floor finishes](02-construction.md): existing coordinate rules,
   shared contact query, atomic replacement and preview/command integration.
3. [Parties, join and Draft](03-parties.md): identity/protocol, transaction,
   permissions, spawn, offline presence and UI.
4. [Spatial drawing and original art](04-drawing.md): datum correction, depth
   representation, exact picking, clipping and performance acceptance.
5. [Integration, evidence and release](05-delivery.md): dependency order,
   executable checks, upgrade rules and actual preview publication.

## Non-negotiable implementation choices

- One native work-attempt association; providers propose behavior, never own a
  competing worker claim. Native physical operations remain sole quantity/progress
  owners. Host Watchdog is not instantiated per game task or per goblin.
- Existing Region transaction commits membership/world records/receipt together;
  no participant database outside that owner, no auth service or global user ID.
- Explicit Draft/Undraft. A click to select does not change work mode. In this
  Colony slice manual Go requires Draft; normal contextual work remains an order.
- Opaque sprite depth is a visual fact baked from original geometry, not physical
  occupancy. Use per-pixel depth for intersecting long artwork instead of hiding
  an unsatisfiable whole-sprite sort behind offsets. See the bounded feasibility
  step in drawing; do it before re-exporting the whole bank.
- No automatic old-save migration or reset. Preserve old bytes and clearly reject
  unsupported formats. Existing-world continuity and any upgrade disposition are
  explicit release checks; a successful fresh-world test cannot prove continuity.

## Writer boundaries and sequence

The lead reads/reviews all first working shapes and original art. Luna handles
bounded implementation. Do not assign unresolved architecture to an implementer.

| Chunk | Writer files | Dependency / review checkpoint |
| --- | --- | --- |
| A | native work module, component registration, native action dispatch, TS contracts/session/SDK | Lead freezes types below; working exact-result + cancellation example before all providers |
| B | construction/contact native module and matching SDK; floor command/preview | Serial with A wherever native dispatch/contracts overlap |
| C | all existing work providers + party eligibility hook | A/B types pinned; one writer for all claims/lifecycle migration |
| D | Colony party definitions/spawn/draft + Region principal propagation + host protocol/client credential | Scope type pinned with A; no competing edits to Colony/host/session files |
| E | original art bake/manifest, client depth pass/picking/preview | Independent of A/B; lead personally handles art/datum and first GPU proof |
| F | acceptance fixtures, joined checks, commit/release | Read pinned candidates in parallel; lead integrates serially |

A table row is a complete bounded outcome through corrections/tests/commit, not a
new permanent team. Shared file changes land serially or through one coupled
writer. Reviewers write ignored notes only. Continue independent authorized work
while a pinned revision is reviewed. Do not duplicate a running proof.

## Scope and decision discipline

The types and operations in these pages are the intended replacement API shapes,
not claims that those exports already exist. Minor naming/layout decisions can be
made locally; changing authority, cargo semantics, permissions, algorithm,
transaction boundaries or release compatibility requires lead review against this
packet. Missing dependencies or unexpected physical behavior are defects to
investigate, not reasons to invent a fallback. Report the source, failed law and
proposed correction in the existing sprint, without another management framework.

Source-grounded baseline: the simple floor-under-brewer runtime law passed in
`run-u7158` against the existing generated WASM. The failed exact-world delivery
transition, replacement, new attempt lifecycle, party join and new drawing remain
unproved. No new build, browser check or deployment is implied by these docs.
