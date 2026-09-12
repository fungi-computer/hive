# Clearing consolidation: one dependable colony, many actors in one world

Status: implementation plan, September 12. Root owns architecture, review and
integration. This is the next repair sequence under the existing playable-Colony
goal, not a new rewrite or replacement goal. Source baseline d629eb3. The latest
local smoke implementation remains; do not reopen pressure/connected-cave work.

## Product and finish line

Levi and a friend build and maintain a cozy multi-storey goblin home in a generated
world. Humans, ordinary NPCs, saved scripts and Shiitake can participate through
scoped observations and the same authoritative command owner. Controllers differ;
physical rules, goods, permissions and consequences do not. AI storyteller powers
are separate explicit grants, never an unrestricted player mutation door.

The next public story is a reliable colony, not a claim that Hive already solves
all web games. The broader engine earns its credibility through this consumer and
the existing RTS/survival/pirate consumers. Keep those working; do not add another
demo or widen their gameplay while Colony's basic loop is broken.

Keep the full acceptance workload and fixed performance budgets in
[GAS-REPAIR-PLAN](GAS-REPAIR-PLAN.md). Twenty minutes with two actual browser clients,
32 earned cuts across two depths, full storage/ground spoil/hauling recovery,
multiple building levels, seepage, indoor smoke, reconnect and committed replay
remain required. A milestone below is not whole-goal completion.

## What consolidation means

Preserve the retained Clearing's useful interaction and gameplay laws. Reuse
working controls and original art where their contracts fit; translate their
semantic rules where the Rust/DO owner changed. Remove replaced decision paths
when real callers move. Do not run the retained JS simulation alongside Rust,
copy obsolete save models, or manufacture compatibility adapters.

Ownership remains:

- Rust: authoritative movement/path queries, assignment solver, materials,
  physical work, generated geometry, bounded water and local smoke/heat.
- TypeScript game definitions: content, recipes, work policy and presentation
  composed over those operations. No private game pathfinder or parallel cargo.
- Region/DO host: principal/scope admission, accepted command identity,
  committed revision/results and durable recovery/wake.
- Shared client: gestures, selected view and rendering; display runtime admission
  and work facts. Prediction never settles work or inventory.
- Controller integration: the existing public Mycelium capability path over game
  admission. No second scheduler or model call inside physical ticks.

Watchdog is the reference for opaque jobs, private claims, exact settlement and
cancellation intent. Read its current implementation before adopting a host use;
it does not replace the native physical job owner or automatically supply game
atomicity, route recovery, UI admission, or undo committed material effects.

## Source findings to repair, not redesign around

Retained src/digging-controls.test.js and ui-actions.ts specify armed tools,
one-release strokes, cancellation, slice changes and Escape. src/main.js keeps
command metadata and reports batch results. src/orders.ts rejects duplicate
voxels and unsafe excavation positions. src/jobs.ts returns explicit candidate
absence/reasons and plans carrying travel from the source arrival. Movement and
cancellation preserve paid edges and custody. These are the behavioral baseline.

Current concrete gaps:

1. engine/src/sdk/delivery.ts and construction-work.ts suppress same-target Move
   solely because Destination exists. Rust world.rs retains Destination when a
   terrain edit invalidates a route and marks it waiting. The native same-target
   Move is its repair door; both callers suppress it. Reproduced after digging.
2. Delivery checks both legs from the worker's original position and prices only
   the source leg. It does not establish source-arrival-to-destination travel.
3. Colony route failure leaves an unassigned dig with no useful stable reason.
   Budget/deferred search and genuinely unreachable terrain must remain distinct.
4. remote-client.ts can accumulate16 inputs behind blocked recovery or a missing
   observation revision. The UI has no explicit admission/recovery projection.
5. client.js can overwrite a synchronous enqueue error with '<tool> submitted'.
   A rectangle is one command; user deep-dig/queue-full cause is not established.
6. Scattered gesture/view/result state has weaker integration than Clearing's
   completed flow. State-machine libraries alone do not establish deterministic UI.

Root personally read these callers. Supporting read-only audit notes are under
.botanical/consolidation-audit; the tracked decisions here remain the authority.

## Delivery sequence

### 1. Restore a dependable command-to-completion loop

One coupled movement/work outcome fixes both delivery and construction callers.
Reuse the native healthy-route fast path and waiting-route repair. If polling a
same-target Move proves expensive, expose a narrow native readiness fact; do not
invent provider-local retry geometry. Correct carrying-leg admission/cost at the
native query seam. Unreachable work remains unclaimed or explicitly waiting with
finite cargo and a stated next condition. Independent area cells may progress out
of order; personal orders retain explicit priority. A blocked voxel must not stop
unrelated jobs. No teleporting, skipping paid travel, or increasing hop height to
make a test pass.

In parallel, one isolated client/transport outcome owns admission through display.
Follow [the Townies/Shiitake/Woodstock source comparison](MULTIPLAYER-STREAM-CONSOLIDATION.md).
Keep Region's current persistence and coalescing publisher. Remove the blanket
receipt-to-observation command barrier; a delayed view must not block an already
known result. Command recovery and observation recovery have separate owners.
A local send returns accepted-to-queue or a typed refusal. Queued, awaiting result,
recovering, and unavailable have defined display
and input policy. Stop accepting world mutations when recovery has no capacity;
keep camera/view controls available. Preserve an uncertain command's ID and bytes;
retry does not become a new action. Cancelling an unsent input and requesting
cancellation of accepted work are different operations. Never clear unknown work
as if it failed. Do not increase MAX_PENDING or add an independent UI queue.

First-shape root review checks ownership and deletions in parallel with writing.
The joined acceptance is the actual sequence: rectangle -> workers cross its edge
while hauling -> deeper target lacks a route -> unrelated work completes -> add a
legal route -> waiting work resumes -> cancel during travel -> reconnect. Include
lost acknowledgements and queue refusal without false 'submitted' feedback.
Native/transport focused laws precede one actual DO/client scenario. No repeated
historical browser matrix. Ship the coherent correction, not isolated unrelated
patches accompanied by a claim the loop is fixed.

### 2. Make Colony the retained Clearing successor

Consolidate the command catalog and gesture transitions: visible designation,
current slice, ghost/preview, applied/rejected feedback, Escape, right-click,
pointer loss, level changes and reconnect. Reuse Caps, original sprites, carrying
and pick-up/drop-off animation and existing bake pipeline. Keep gameplay truth
separate from animation. Every blocked job exposes a useful reason and remedy.

Restore the small home loop through shared owners: safe-rim digging, stairs and
upper floors, floor support spans, ground stock/storage zones and hauling, useful
water/seepage and local smoke/fire. Account for guest and worker needs through
shared needs/interaction capabilities, not a one-off thirsty-customer branch.
Port the retained brewery as a definition-driven staged process, following
RETAINED-BREWING-RESTORATION.md: supply -> attended preparation -> unattended
fermentation -> attended finishing -> serving. A player assigns production intent;
workers perform available stages. Use existing materials and work allocation.
Do not implement special-purpose hauling, a separate brew allocator or duplicated
fuel/output settlement. Restore this in coherent playable chunks after stage1,
not as a prerequisite that delays its release.

The full fixed Colony acceptance workload is the exit for stabilization. User
feedback remains required; a simulated client or one green unit does not replace
human play. Exposed UI/performance failures reopen this same slice.

### 3. Demonstrate many actors, one authority

Once the human loop works, bind one scripted helper and then Shiitake to the
same observed colony. Concrete demonstration: Levi builds, a friend digs, the
helper supplies the station; Levi can revoke its control. Duplicate/retried
requests cannot create goods or bypass actor/resource reservations. Restrict each
controller to its allowed people/actions; storyteller interventions use separately
named authority. Keep ordinary colony work independent of model availability.

Reuse existing Mycelium execute/operation integration and Region command receipts.
Prove the actual shared world effect and revocation, not a successful model run.
The first publishable clip shows those participants doing useful work together in
one unchanged game. Wider-world handoff and sleeping-region behavior remain in
the engine direction; they do not postpone this small-colony finish line.

## How we move faster without lowering standards

Root owns the coupled design and actual acceptance. Luna implementers own complete
bounded outcomes in isolated worktrees; reviewers read pinned source. Two writing
lanes at most for stage1: movement/work and client/transport, with explicit shared
contract custody. No code scattering across a roster and no new management layer.
Every chunk states the player-visible before/after, owner, obsolete code removed,
and evidence. A failure triggers the smallest discriminating observation; preserve
actual failure state and stop rerunning scenarios that cannot explain it.

No new gas research, engine rewrite, editor expansion or speculative framework on
this critical path. The current local-gas/fixed-water design is changed only for a
demonstrated gameplay or conservation failure. Measure full active work, commit,
projection and client responsiveness against the already fixed budgets.

## Townies comparison, bounded source research

Public repository found: https://github.com/Brayden/townies . README and
https://github.com/Brayden/townies/blob/main/docs/architecture.md describe one
SQLite-backed DO per town, authenticated WebSockets, server gameplay authority,
client movement prediction and device movement ownership. Its source is public;
code/project-owned non-brand assets declare Apache-2.0 with asset/brand exceptions.
This is not a measured50-player capacity result from our review.

Read shared/town-wire.ts and server/towns/realtime.ts as well. They separate
public/private projections, carry revisions and close lagging peers for recovery.
Their connection-local request sequence is not proof of Hive's required durable
cross-reconnect command receipt. Learn from the concrete usable product and small
world owner; do not copy its wire protocol or downgrade our replay guarantees.
No conclusion about overall code quality follows from a tweet, screenshots, or
these few files. No competitor source/art was imported.

## Two-day velocity and publishable-demo estimate — September 12

Measured history window: September 10 15:43:15 UTC through September 12 15:43:15
UTC, integrated source through d93f723. `git log --first-parent` filtered by commit
timestamp contains 524 commits: 48 on September 10, 460 on September 11, and 16 on
September 12. These include helper integrations, fixes, documentation and work
subsequently replaced. They are NOT 524 independent outcomes or measured labor
hours. Active model time and exclusive working time were not reconstructed.

Outcome accounting:

| Work | Evidence at this checkpoint | Counts toward a dependable Colony? |
| --- | --- | --- |
| Existing cannon and other foundation consumers | September 10 live cannon/recovery and delivery/survival records, 16e842e, e9bfce1, 7423f79 | Reusable working foundation and an existing enjoyable demo; not Colony acceptance |
| Colony environment and performance | September 11 paid hearth/observation/recovery work and a short hosted dig/build/smoke trial; subsequent human stalls | Useful partial result, reopened by actual play |
| Gas direction | Pressure/room work followed by its removal in fdcb35b | Necessary simplification; much prior effort is rework, not accumulated progress |
| Digging and ground spoil | 4414a57 published; actual native 4x4 law completes after occupied guest moves; finite stock preserved | Real improvement, not sustained two-depth acceptance |
| Current hosted combined scenario | Two sockets, two cuts, receipt replay and wall pass; hearth supply times out | Still blocked; live paid fire in this joined scenario unaccepted |
| Client/job consolidation | Actual caller gaps documented; fixes not yet implemented | Readiness to repair, not shipped gameplay |

Net assessment: high implementation throughput, low reliable-gameplay throughput.
No completed sustained Colony acceptance run in this window. The public game has
improved, but commit count cannot justify a confident overnight completion date.
The estimate below is engineering judgment based on remaining coupled outcomes,
not a statistically fitted delivery rate from two days of churn.

### Smallest demo worth sharing

A stranger quickly understands how to designate work. Two people can share the
small colony using the existing demo access model, build a modest home and cellar,
handle the dirt and supplies, encounter visible seepage and hearth smoke, and
complete one short production/guest-serving loop. Original goblins and carrying
animations make the work legible. The 30–60 second clip shows actual normal play;
the link must support continued play, not just a staged showcase.

This is a better *specific hook* than generic chores: build a cozy goblin home,
dig into trouble, then make it hospitable. It is not a claim of better overall
quality or 50-player capacity than Townies. Shared demo access is not completed
individual player/account grants. Account-based invitations remain a separate
public App/customer dependency and must not be advertised as implemented.

### Forecast, not a promised deadline

Target **5–8 focused working days** for that shareable Colony slice, with the first
credible private playtest after **1–2 days**. These are elapsed working-day estimates
for root review plus at most two bounded native implementation lanes, not a claim
about 24-hour unattended throughput or parallelism eliminating integration time.

| Sequence | Estimated effort | Observable exit |
| --- | --- | --- |
| Movement/work and command recovery | 1–2 days | Digging, full storage and reconnect stop stranding workers or locking input |
| Restore coherent retained controls and joined environment play | 1–2 days | Visible rectangle/level selection, useful blocked reasons, earned cellar/building and supplied hearth/seepage |
| One short goal/reward loop | 2–3 days | Definition-driven first recipe over shared material/work ownership; supply, preparation, wait, output and guest interaction |
| Joined acceptance and presentation | About 1 day | Fixed sustained two-client scenario passes, Levi plays it, concise onboarding and genuine shareable clip |

The day ranges total 5–8. Some source work may overlap, but acceptance dependencies
remain serial. Full retained brewing, deep social systems, generalized account
multiplayer, region transfers and AI autoplay do not fit this estimate. A wholly
new event-sourced persistence model is explicitly excluded: retain transactional
state/receipts, simplify replication, add selected durable facts when consumed.

Largest uncertainty is another shared movement/custody failure under combined
play. Recipe composition also remains actual missing implementation, not a copy
operation. If the initial stabilization exit is still red after two focused days,
revise this forecast against the concrete failure rather than rolling the same
promise forward. Do not add another architecture rewrite to hide the missed exit.

Track future progress in this existing section by accepted player-visible exits,
regressions and scope changes. Record private playtest readiness before polish;
update the estimate when evidence changes. Keep the existing complete goal and
fixed performance workload as the acceptance authority.
