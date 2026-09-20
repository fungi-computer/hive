# Hive durable authority and controller source study — 2026-09-20

Read-only study of `/home/levi/src/hive-worktrees/living-terrain-integration`, HEAD `cf9c7854a401cbb245d4b98bf0a32aa2515f81ae`. Renderer/packet dirty work was present later; the authority/runtime sources below were not modified by this study. Botanical comparison: `/home/levi/src/Botanical-next`, HEAD `5b442a48f35c8ad441a267a87d639efc965a50b5`. Source anchors below are relative to those respective roots.

## Judgment

The Region owner already implements meaningful transaction, rollback, replay and clock laws. Preserve it and the physical owners. Important remaining weaknesses are full-state work around every transition, finite-lifetime ordinary command admission, an unjoined current-engine controller/event interface, and future sleeping-world capability. These are distinct from renderer correctness; they do not establish that all simulation laws are weak.

## Evidence actually rerun

Mandatory wrapper:

```text
/home/levi/src/Botanical-next/.agents/skills/orchestrate-multi-lane-work/scripts/run-proof.sh timeout --signal=TERM --kill-after=5s 60s node --test src/engine/region/region.test.js src/engine/region/admission.test.js
```

Passed 20/20, zero failures, approximately 0.66 seconds, exit 0. Systemd scope `run-u2505.scope`, invocation `9460f9b14d624bb495e6bbab415800c0`. No builds, installs, game mutations or further proof runs. This proves the existing Region quarry/record/clock fixtures, not complete current hosted Colony or live AI integration.

Covered laws: atomic excavation/material identity/event/receipt recovery; SQL failure rollback; exact same-ID replay; conflicting input refusal; stale revision; authorization; receipt/event/storage exhaustion fails closed; opaque record rollback; ordered clock duplicate/gap/retired handling; corrupt frontier rejection. See `src/engine/region/region.test.js:45,67,88,113,232,381,414,479`; `admission.test.js:13,25`.

Other tests read, not rerun: current Colony water records rollback/recovery (`engine/src/runtime/session-region-records.test.ts:134`), multi-command outer rollback and resident recovery (`:210`), resident reuse/poison disposal (`:276,338`), disconnected party continuation while host still advances (`:68`).

## Current human command path

A Colony Dig area command follows:

1. Client queue accepts command, freezes one retry ID/body (`engine/src/runtime/remote-client.ts:595`). Response loss reuses that body.
2. Public host maps credential to participant (`tools/public-engine-host/worker.ts:700`) and submits using its principal (`:730`).
3. Region authorizes the checked named command (`engine/src/runtime/region-program.ts:292`). Raw action/time/party-creation operations remain host-only.
4. Colony dig derives the player's party (`engine/src/games/colony.ts:498`). GameSession attaches action scope and retains queued intent (`engine/src/runtime/session.ts:432,472`).
5. Session resident captures resulting state; Region atomically commits records/state/admission receipt. Host accepts resident only after transaction success (`tools/public-engine-host/worker.ts:595-641`). Failure discards it.
6. A later host clock applies physical planning/work. Native action-role table treats excavation's party as a planning subject (`engine/kernel/src/access_roles.rs:68`); physical dispatch delegates to the excavation owner (`engine/kernel/src/world.rs:5892`).

Client `submitCommand` (`engine/src/client/command-submission.js:4`) reports “Order queued” when local queueing succeeds; that is not durable admission or job completion. Preserve those three distinct outcomes in the eventual public authoring/controller API.

## Actual expensive mechanisms

- Native `advance_json` stages most work/planner/direct/projectile mutations by calling `save_records()` before execution (`engine/kernel/src/world.rs:4455-4483`). This protects rollback.
- `save_records()` captures entities, environment and atmosphere (`world.rs:3948-3954`). Entity capture scans IDs and registered schemas, materializes routes/jobs/tasks and serializes all entities (`:3999-4074`).
- After every command/clock transition, `engine/src/runtime/region-program.ts:178` performs another `session.save()`.
- `engine/src/runtime/kernel-records.ts:145-156` copies all native records to JS and preflights them; entity preflight joins chunks and parses JSON (`:93-118`).
- `engine/src/runtime/session-record-store.ts:43-53` byte-compares every before/after record to choose SQL writes.

Therefore SQL writes are incremental but checkpoint construction/change detection remain proportional to state. No measured percentage or claimed performance win follows from inspection. Instrument native execution, rollback capture, export/copy, JS validation/diff, SQL commit and observation separately before changing this.

Current browser-worker `stepCpuMs` ends before `captureAccepted()` (`engine/src/runtime/worker.ts:162-170`); it omits the latter full capture. Its `snapshotBytes` serializes a typed-array-containing JS snapshot as JSON, not actual native binary payload size.

Corrective seam: one mutation/checkpoint owner with dirty-page or journal output that preserves rollback and restart. Do not merely delete staging. Current callers manually coordinate resident begin/dispatch/accept/discard in ordinary command, join and clock; a deep session authority should own serialization, candidate lifetime, failed-commit invalidation and dirty capture behind submission/advance/observe operations. A forwarding wrapper exposing the same choreography is insufficient.

## Receipt capacity: ordinary commands, not autonomous ticks

Default ordinary receipts are capped at 4,096 (`src/engine/region/index.ts:104`). Public host uses defaults (`tools/public-engine-host/worker.ts:307`). Each fresh successfully committed ordinary dispatch consumes one row, including a durably recorded rejected conditional request. Same-ID exact replay returns the existing row and consumes none (`index.ts:555-577`). New party joins also use ordinary dispatch.

**Autonomous clock ticks do not consume these receipts.** `dispatchOccurrence` selects clock mode; `index.ts:543-553` updates the single `hive_region_clock` frontier row and returns before `saveReceipt`. `tools/public-engine-host/worker.ts:783` uses this operation for alarms. The latest exact clock occurrence replays; older occurrences reject as retired and gaps reject (`index.ts:593-617`). Elapsed simulation time cannot by itself exhaust the 4,096 ordinary-command cap.

There is no ordinary-receipt retirement/compaction API. At capacity, fresh ordinary commands throw `region-receipt-capacity`, existing exact retries still work. This is a tested fail-closed capacity policy (`region.test.js:113-132`), not receipt corruption. Illustrative arithmetic: 4,096 fresh admitted commands at one/minute is about 68.3 hours; at one/second about 68.3 minutes, before subtracting already-used receipts. These are not measured player cadences. Do not claim current Colony exhausts receipts in minutes from its clock, nor extrapolate current raw Survival direct input as working: its old proof conflicts with current authorization.

Before persistent game-maker release, choose bounded command-sequence/replay-retirement semantics with a durable retired frontier so a delayed old command cannot become new after compaction. Increasing the cap only postpones the lifetime limit.

## Deliberate active lease versus future offline capability

Current public host uses a 15-second lease and 100ms clock occurrences (`tools/public-engine-host/protocol.ts:8-13`). It processes one occurrence per alarm, preserving its scheduled cadence (`worker.ts:774-803`, `clock-schedule.ts:4`). After lease expiry it clears due work (`worker.ts:755-773`); renewed activity schedules from now (`:407-425`).

This is **intentional current product policy**, not a defect inferred from an aspirational document. `engine/implementation/clearing-repair/03-parties.md:196-201` explicitly requires retaining the WORLD lease/wake policy, says another active participant keeps disconnected people's work alive, rejects keeping a DO alive forever merely because parties exist, and states “no offline catch-up is added here.” The read test `session-region-records.test.ts:68` proves retained workers/intent under continued advancement, not elapsed-time progress after everyone leaves.

The future requirement is also explicit: `docs/decisions/local-snapshots-and-durable-ai-jobs.md:65-79` distinguishes computational sleep from game pause and requires bounded frontier-based settlement. Lines 132-137 propose a paid passive brew plus crop across reopen, with duplicate reopen conservation, and explicitly label this later qualification. Frame this as future capability needed for unattended web games/agents, not a present lease bug or immediate renderer prerequisite. Do not implement universal missed-tick replay.

## Controller and durable completion joins

Reusable adapter exists at `src/engine/controllers/mycelium.mts:12`. It captures the host-selected principal, requires explicit command/observation/result schemas, and checks cancellation immediately before synchronous Region dispatch (`:62-77`). Exact command IDs survive transient execute invocation identities.

Current demonstrated consumer is old Goblin: `tools/engine-controller/goblin.mts:5` imports `src/world-presets/goblin-region.ts`, projects old Clearing actor/known voxel state, and issues old rest/dig orders. `goblin.test.mts:212` proves paused durable admission, reconstruction/replay and later one-unit soil production. No Mycelium/Shiitake registration exists in current `engine/src` or `tools/public-engine-host`. Preserve the adapter and move a bounded consumer onto the actual GameSession/Colony authority; do not claim the old demonstration satisfies the active engine join.

Also, current `engine/src/runtime/region-program.ts:185` always supplies `events: []`, although Region supports atomic committed events. `session.ts:999` replaces recent action outcomes; `presentation-cues.ts:17-18` retains 64 launch/impact cues for only three seconds. Saved work/job state is authoritative, but a resumable semantic completion observation channel for controllers has not been joined. Add actual bounded completion/event facts with scope/cursors, not a generic per-frame event log.

## Botanical comparison at pinned current source

- `packages/watchdog/src/index.ts:52-88`: generic durable executor lifecycle needs owner SQLite, liveness and host wake recomputation. It does not supply game simulation policy.
- `packages/watchdog/src/effect.ts:123-134`: narrow synchronous transaction projection exposes enqueue and cancellation, allowing an actual shared-owner commit.
- `packages/watchdog/src/internal/sqlite-store.ts:353-448`: atomic ordered claims and exact claim-token settlement.
- Hive `tools/engine-do/watchdog-worker.ts:55,97,147` genuinely reuses that public capability in a quarry loss/recovery proof, not current Colony.
- `packages/mycelium/src/registration.ts:70-101`: opaque authored operations retain schemas/handlers and validate input/output. Hive already uses this public mechanism.
- `packages/shiitake/src/internal/contracts.ts:89-135`: scoped authored modules/sandbox/model/instruction/runtime seams are already available. No new Hive agent runtime is needed.
- `packages/shiitake/src/cloudflare.ts:60-128`: the convenience runtime schedules reconciliation via `waitUntil`; do not infer full autonomous alarm guarantees from that convenience adapter alone. Inspect the selected host wake owner for a real unattended join.

## Evidence drift

The DO decision's historical statement at `local-snapshots-and-durable-ai-jobs.md:129` that no autonomous alarm join exists is stale relative to current PublicEngineRegion. Current host does own alarms, persisted occurrences, transactionally joined wake and resident failure disposal.

Conversely, retained `tools/public-engine-host/proof.mjs:129-144` exercises Survival raw pause/resume/direct actions. Current `region-program.ts:295` makes those host-only, while `engine/src/games/survival.ts:139` has player localScope, which public host maps at `worker.ts:296`. Source therefore contradicts treating that old script/report as proof of current cross-game behavior. Requalify selected current consumers; do not weaken authorization to revive an old proof.

## Recommended order within the combined study

1. Measure transition/checkpoint/transport/render separately and fix the immediately demonstrated rendering laws without changing art pipeline.
2. Remove full-state transition costs at their mutation/checkpoint owner while retaining the proven failure laws.
3. Make ordinary-command lifetime/replay policy suitable for persistent worlds.
4. Join one human and one Mycelium controller to current GameSession commands plus one durable result/event query.
5. Qualify one authored passive elapsed-time behavior when unattended play enters the delivery scope.

The important distinction is proven mechanism versus completed product: current transaction and physical ownership mechanisms are valuable; the cheap and sustained web-game authoring/runtime experience is not yet established.
