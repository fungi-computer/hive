# Clearing repair implementation packet

**September 15 whole-engine review:** [Engine ownership audit](08-engine-ownership-audit.md)
records the actual Rust, GamePack/DO, client/art and Shiitake/Watchdog comparison,
updated against `85bfd7a5` plus the current dirty supply work. Its
[creator/behavior follow-through](08-engine-ownership-audit.md#creator-engine-and-shared-behavior-september-15-follow-through)
specifies individual decisions, optional group assignment and shared execution;
the optional colony mechanism bundle; and the bounded XState authoring evaluation.
It records newly found reservation, carrier-capacity, acknowledgement/reload and
ordinary-result gaps. No native statechart interpreter is accepted or required
before the current playable repair.
The [creator acceptance review](08-engine-ownership-audit.md#creator-acceptance-the-edmund-mcmillen-question)
adds concrete tests for expressive TypeScript rules, admitted physical lifecycle,
one pack entrypoint and a fast art/gameplay iteration loop. It does not turn the
Clearing repair into another editor or engine rewrite.
It owns the current deep-module correction and repair order. All automatic jobs
share one Rust scheduler. Domain modules own requirements and physical effects;
they do not grow individual scheduling or delivery lifecycles. Native migration
is still incomplete at this source checkpoint. Historical runtime receipts
below are not evidence of its acceptance.

**September 15 implementation design:** [Native work planner](07-native-work-planner.md)
specifies the complete Rust planning pipeline, ownership, budgets, recovery and
consumer cutover. It is a design, not implemented acceptance. The current
[construction cancellation policy](02-construction.md#impossible-versus-waiting)
cancels structurally invalidated plans; missing labor/materials remain waiting.

**Current job architecture correction (September 14):**
[Rust-owned declarative job planning](01-work.md#rust-owned-declarative-job-planning-current-correction)
supersedes the earlier TypeScript provider scheduling design. This migration is
INCOMPLETE. Native physical operations and a shared matcher do not establish
engine-owned planning. TypeScript declares game requirements; Rust owns bounded
discovery, eligibility, assignment and execution of supported work. The water
query batching patch is an interim bug fix, not acceptance of this architecture.

[Native placement admission audit](02-construction.md#current-audit-reject-conflicting-plans-at-the-native-boundary)
adds required geometric conflict and prerequisite checks before a construction
intent is accepted. The screenshot's exact site/render cause remains unverified;
the source admission gap is confirmed. C4/C5 remain unproved.

**September 14 accepted design update:**
[Grid-edge buildings and declarative art parts](06-edge-buildings-and-art-parts.md)
owns the next construction/rendering implementation. Walls and doors move to
canonical grid boundaries; floors stay full tiles; stair rails and supporting
surfaces become separately ordered original-art parts. Read this update before
the historical status and earlier construction/drawing instructions below.
It is an implementation plan, not a claim of landed code or hosted acceptance.

Status: active integration on `engine/clearing-edge-integration-20260914`.
The reviewed native checkpoint is `13abeb0c`; later source must still be reported
separately until accepted. The native scheduler remains intentionally inactive in
the GamePack until every current work family has migrated.
Historical branches and receipts remain evidence; they are not the active queue.

The joined source now contains the native WorkAttempt identity/lifecycle owner,
party-scoped pending actions and authored creation, lawful transfer contacts,
atomic floor-finish replacement under occupied furniture, and the actual Colony
floor consumer. It also contains native world-local party allocation and replay:
one host-derived binding commits a player, party and GamePack-authored people in
the Region transaction, and reconnect projects the actual bounded PartyMember IDs
rather than synthesizing names in the host. Draft and Undraft use the persistent
bottom action dock; unavailable actions remain visible with their reason, while
selection stays UI state and server admission remains authoritative.

Native construction and process inputs now contribute to one bounded supply
planner and one allocation/pickup/delivery lifecycle. Two workers can reserve and
carry distinct portions without overbooking; Draft preserves actual carried cargo;
restore resumes the same allocation. Process inputs preserve `portion` versus
`whole-lot` policy, so mugwort, barm and kegs cannot be assembled from fragments.
The real process lifecycle fixture carries finite `LotWater` into the kettle and
then admits the original brewing recipe. This is accepted source foundation, not
a GamePack cutover or a claim that the TypeScript planner has been removed yet.

Original retained art placement metadata is owned beside the bed, brewer and stair
recipes and survives the v5 static pack. The client converts canonical point and
multi-cell footprint facts into projected bounds, compares only overlapping nearby
sprites, caches static relationships and gives ordinary Pixi sprites deterministic
`zIndex` values. Picking walks that same front-to-back order and then applies the
existing alpha silhouette. The superseded per-pixel depth renderer is deleted.
Terrain and water occupy explicit storey bands rather than pretending to be
physical sprites.

The current native checkpoint passes all 346 Rust library laws and all 14 public
kernel integration laws (`run-u8338` and `run-u8334`). Earlier drawing laws pass
46/46, party laws pass 70/70, and the immutable frontend version `2b0f54e3` matches
all 176 frozen files.
The DO backend version `ff3a9d97` is live with the Clearing preview origin. Hosted
playability remains open because Cloudflare's `clearing-garden` alias still serves
the older `c4393a6f` HTML even though the current uploaded version records that
alias. Do not treat the immutable version proof as alias parity and do not rerun the
browser witness until the exact public URL serves the accepted bytes.

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
6. [Grid-edge buildings and art parts](06-edge-buildings-and-art-parts.md): current
   coordinate contract, physical consumers, edge gestures, multipart bake/sorting,
   writer sequence and acceptance ledger; includes missing ordinary diagonal
   walking and shared corner/cost/restore rules; supersedes conflicting wall guidance.
7. [Native work planner](07-native-work-planner.md): current all-family native
   migration, private transition ownership, shared budgets, partial-source status
   and exact TS deletions.
8. [Engine ownership audit](08-engine-ownership-audit.md): deep module boundaries,
   source-confirmed defects across the engine, retained mechanisms and repair order.

## Non-negotiable implementation choices

- One native scheduler and work-attempt association; domain requirement
  contributions never select workers or own a competing claim. Native physical
  operations remain sole quantity/progress owners. Host Watchdog is not
  instantiated per game task or per goblin.
- Existing Region transaction commits membership/world records/receipt together;
  no participant database outside that owner, no auth service or global user ID.
- Explicit Draft/Undraft. A click to select does not change work mode. In this
  Colony slice manual Go requires Draft; normal contextual work remains an order.
- Draw order derives from canonical point or multi-cell footprint facts, projected
  through the shared camera. It never derives physical occupancy from opaque sprite
  pixels. Alpha silhouettes refine selection only after deterministic ordering.
- No automatic old-save migration or reset. Preserve old bytes and clearly reject
  unsupported formats. Existing-world continuity and any upgrade disposition are
  explicit release checks; a successful fresh-world test cannot prove continuity.

## Writer boundaries and sequence

The lead reads/reviews all first working shapes and original art. Luna handles
bounded implementation. Do not assign unresolved architecture to an implementer.

| Chunk | Writer files | Dependency / review checkpoint |
| --- | --- | --- |
| A | coupled native work/material modules, component registration, action dispatch and TS cutover | One scheduler; shared result/cancellation/delivery lifecycle proved with construction and process before remaining families |
| B | construction/contact native module and matching SDK; floor command/preview | Serial with A wherever native dispatch/contracts overlap |
| C | remove TS automatic providers and migrate every current pack caller | Serial with A; this is the native cutover, not another provider implementation |
| D | Colony party definitions/spawn/draft + Region principal propagation + host protocol/client credential | Scope type pinned with A; no competing edits to Colony/host/session files |
| E | original art bake/manifest, multipart sprite sorting/picking/preview | Independent of A/B; lead personally reviews art/datum and rendered proof |
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
