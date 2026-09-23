# Hive framework handoff — September 23, 2026

This is the source and proof handoff for the single-Region framework sprint in
[FRAMEWORK-PROOF-SPRINT.md](FRAMEWORK-PROOF-SPRINT.md). The game is paused; the
playable Clearing stays deliberately small. No production backend, public
preview or main branch was changed by this handoff.

## What works now

The integration branch is `engine/event-driven-scheduler-audit-20260923`.
Its accepted native owners include bounded navigation, joint assignment,
current-format durable record capture, Region replay retirement, incremental
field-water state accounting and changed-entity encoding. The public host now
has one cadence owner for durable occurrence identity, admission, retry and
alarm selection. The observation projector retains exact dependency baselines
across disposable committed sessions. The separate v4 qualification fixture
and a scoped Survival controller witness are present as **diagnostics**, not
capacity or second-pack acceptance claims.

The native library suite passed **466 tests, zero failures, one ignored** after
the record and accounting cuts. The generated release WASM used in the paired
v3 comparison has SHA-256
`4b2607b232935b0d4c39be0290810c28716bffa350fee4227f2f2ce987b444d4`.
It was built from production source at `5bc649a1`; later commits add only
qualification source, documentation and a Survival proof correction. The raw
paired ledger is retained locally at
`.botanical/framework-v3-ledger-integrated-5bc649a1.json`.

On the **same pinned v3 256×256/100-worker local WASM fixture**, the earlier
cursor build (`f454c8c5…`) and rebuilt owner cut (`4b2607b2…`) produced
identical commands, final physical output, water balance, recovery and ten-step
continuation. For 1,800 active steps:

| Cost | Before | After | Meaning |
| --- | ---: | ---: | --- |
| Total local wall | 55.17 s | 45.06 s | ~18% lower in this pair |
| Native step total | 32.47 s | 22.33 s | ~31% lower; field-water accounting no longer recounts the entire world on a no-op |
| Native step p95 | 52.9 ms | 50.1 ms | Tail remains too high for a comfortable 100 ms hosted cadence |
| Changed-record capture total | 15.76 s | 15.72 s | Essentially unchanged; the record encoder alone did not remove the remaining capture owner cost |
| Max changed bytes in one step | 390,564 | 390,564 | Exact changed-state behavior retained |

This pair excludes SQL, Durable Object CPU, network and browser rendering.
Shared-host variance means the exact percentage is not a hosted capacity
estimate. The full 466-test native suite and the paired physical/recovery
equality are stronger correctness evidence than the wall-time percentage.

The new v4 qualification fixture is described in
[framework-proof-v4.md](scripts/framework-proof-v4.md). Its full 6,000-step
local WASM run took 566.4 wall seconds for 600 simulated seconds, had at least
90 moving or working workers in 599/600 one-second samples, produced finite
wood in every minute, and preserved water/wood conservation and recovery.
It **failed** the predeclared oldest-job age limit in minutes 3, 5, 7, 8 and
9. The raw run's binary provenance is explicitly corrected in the committed
[v4 evidence ledger](scripts/framework-proof-v4-evidence.json); do not treat
that run as a comparison against the later integrated WASM.

Local workerd proofs for the extracted host cadence passed two-client replay,
fault handling, quiet pause/resume and request-free alarm progress after a
process restart. Their transaction and observed sequence intervals varied
widely across short runs; the final ledger's sequence interval was p50 345 ms,
p95 997 ms. These prove wake/restart laws, **not** 100 ms end-to-end service.
The current shared host also returned `workerd: Uncaught Error: internal error`
before startup in the v4 overlay and existing v3 host driver. Cloudflare
performance backends remain parked, so the required ten-minute hosted gate
has not run.

The scoped Survival controller compiles, but its actual public-worker witness
failed: accepted `takeFood` intent left all eight bread units in the locker
after more than 20 simulated seconds. The autonomous clock changed hunger and
revision as expected. See [SURVIVAL-PROOF.md](../tools/engine-controller/SURVIVAL-PROOF.md).
Do not claim second-pack behavior, a full Shiitake model session or hosted
parity from this source.

## Next performance cuts, in order

1. **Finish mutation-proportional record ownership.** The changed-record
   capture still costs about 15.7 seconds over 1,800 steps and produces
   222,199 changed rows / 152 MB including row overhead. The native root
   record and route/search validation still make capture visit broader state
   than the mutations require. Move those remaining facts behind stable dirty
   identities and keep the full checkpoint as an explicit oracle; compare
   exact bytes, rows, CPU and restore on the unchanged v3 fixture. Do not add
   another snapshot or client-side owner.
2. **Bound the v4 work backlog at the native planner owner.** The 120-second
   age law fails despite sustained useful movement. Measure candidate
   generation, assignment episode reuse, route continuation and actual oldest
   job age separately. Retain the Hungarian joint assignment and eight-at-a-
   time admission; expand a retained episode only when its input frontier
   changes. Repeat the pinned v4 ten-minute run without changing its cohorts
   or acceptance thresholds.
3. **Requalify the actual DO transaction/publication budget.** Restore a
   serviceable local workerd startup, then record native step, changed-record
   capture, SQL row/commit wall time, observation build/socket cost, alarm
   lateness and memory for the same source/WASM. The host cadence owner now
   prevents overdue-deadline accumulation; it cannot make a >100 ms
   transaction run at 100 ms. A two-client local pass is needed before asking
   to unpark the separate performance backend for the hosted ten-minute gate.
4. **Complete reuse with the existing packs.** Diagnose why Survival's
   accepted food intent never picks up bread, then run its public Region +
   Mycelium Code Mode restart/replay proof. Preserve Pirates' existing cargo
   witness. A full Shiitake provider-backed session remains a separate claim.

## Repository and machine custody

The active integration branch and its isolated owner branches are the source
of truth; do not merge to `main` during this pause. There are 87 registered
Hive worktrees. The old `/home/levi/src/hive` checkout remains heavily dirty
and has an unresolved `engine/kernel/src/lib.rs` conflict; several other
worktrees have unique dirty source. They are preserved in place pending
explicit extraction/review, not safe to reset or remove merely because a
newer branch exists. A Git preservation anchor can retain all committed branch
tips without promoting them into the active integration history; dirty bytes
require a separate exact snapshot.

The active integration branch is pushed to `origin`. The preservation branch
`archive/hive-preservation-20260923` is also pushed: its Git ancestry retains
all 87 worktree commit tips, and its tree contains exact snapshots of 154
non-ignored dirty source files, the two stages of the old unresolved index
entry, and 16 raw framework proof ledgers. A second archive audit preserved
591 unique authored notes/current pause/browser/motion artifacts, 923 unique
environmental experiment results and scripts, 522 compact historical proof
metadata files, and 16 large terrain/camera reports compressed losslessly
from 539 MB to 17 MB. Every tier has original paths and SHA-256 hashes in a
manifest; archived bytes and the decompressed large reports were verified.
This is a recovery anchor, not an accepted merge of those lanes or a claim
that every historical experiment is valid. The old dirty worktrees remain in
place. Remaining ignored `.botanical` files are predominantly rebuildable
toolchains, distributions, runtime stores, external dependencies and
intermediate duplicate captures; they remain local and should not be swept
without separate custody.

The disk audit initially found about 3.4 GB free on a 75 GB filesystem. After
confirming no Rust build or proof process was active, the integration worktree's
rebuildable Cargo `target` was removed; the temporary state-accounting target
had already disappeared. Free space was 7.5 GB afterward. The original art,
source worktrees and `.botanical` proof archives were preserved. The two
long-lived Cloudflare tunnels observed on this host belong to Botanical, not
Hive. No Hive tunnel or Hive dev server was found at the audit time.
