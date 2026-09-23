# Host clock and publication owner — September 23, 2026

Source outcome, not a hosted capacity or full gate-3 qualification.

The public host now keeps an admitted unpaused world advancing fixed 100 ms
physical occurrences when its last presence lease expires. Presence and physical
work are separate. Current native/game systems do not expose a trustworthy quiet
or next-deadline projection, so `sessionClockDemand` conservatively reports active
for every unpaused session. Paused worlds remove their physical alarm; commands
that resume them commit the accepted intent, occurrence and alarm together.
There is no offline elapsed-time settlement or inferred quietness from no clients.

Before executing a due occurrence the host persists a separate one-second rescue
alarm. The occurrence's world/clock/receipt changes and replacement alarm use the
same surrounding transaction, including its transaction alarm handle. Failure
rolls that transaction back and leaves the rescue alarm. This prevents a repeatable
execution/rearm failure from depending exclusively on the platform's finite
exception retry budget. One occurrence is processed per invocation, and the normal
next occurrence is at least 100 ms after computation completes, preserving the
existing overrun policy without replaying missed wall-clock steps.

Publication selects eligible recipients before native reads. Each socket retains
one outstanding observation identity `(revision,replayEpoch)` in its hibernation
attachment. It must acknowledge that exact pair before receiving the latest
coalesced state. Slow sockets incur no repeated projection/encoding work while
blocked, and a failed socket send retires only that recipient. The client sends
this ACK after successfully parsing an observation, including duplicate UI
revisions. Replay-epoch rollover can publish without a physical revision change.
Session-local Whistle baselines are invalidated when the resident is replaced.

Presentation and contextual-command projections retain results against the query
values and other reads they actually used. Dependency reads still run; native
render facts and inventory/work decoration still rebuild for each published
physical revision. This is scoped projection reuse and bounded subscriber work,
not a claim that the whole observation is proportional to changed records. The
existing shared cooperative observation scope is unchanged; hidden information
and scoped AI observations remain further work.

Two audited admission defects are corrected: the first invitation must hash to
the requested world handle, and v2 unauthenticated sockets immediately arm their
five-second expiry. An admitted join retry reads the original participant/native
binding, even after receipt retirement, rather than dispatching the original join
under a newer replay epoch.

## Evidence

`run-owner-laws.mjs` bundles the actual host methods, real Region implementation,
clock/publication owners and dependency projector. Node SQLite models atomic
storage rollback; the Cloudflare base class and socket platform are substituted.
The host owner tests use a small deterministic Region program rather than native
physics. Tests cover no-client progress after lease expiry, restart, duplicate
alarm, quiet command arrival, rollback on rearm failure, nine consecutive failed
rearms followed by recovery without client input, slow/fast recipients, retained
credit, same-revision epoch rollover, both admission fixes, join retry across
retirement, resident replacement and dynamic projection dependencies.

Run with the shared-host proof guard:

```sh
/home/levi/src/Botanical-next/.agents/skills/orchestrate-multi-lane-work/scripts/run-proof.sh node tools/public-engine-host/run-owner-laws.mjs
```

The lane imports the stable-record journal and replay-window commits as explicit
dependencies. `SessionResident.accept` acknowledges the captured generation only
after the host transaction commits; rollback/discard does not acknowledge it.

Full configured TypeScript checking is blocked by absent `@types/node` in the
existing shared dependencies. A production-only diagnostic configuration with
`types: []` reaches existing SDK/game errors, plus the pre-existing performance
placement string/EntityId mismatch. No package installation was performed.

## Remaining qualification boundary

Cloudflare documents at-least-once alarms and six automatic exception retries,
and recommends explicitly scheduling another alarm for continuing retries:
[alarm contract](https://developers.cloudflare.com/durable-objects/api/alarms/).
Local SQLite laws prove application ordering and rollback, not Cloudflare's
persistence/failover behavior. If durable storage refuses the initial rescue
`setAlarm` throughout all platform retries, this single-DO arrangement has no
independent durable wake source. Permanent storage failure, crash before that
write and exhausted platform retries remain an unqualified platform gap; a later
client request is not presented as its solution. Native quiet/deadline reporting
and hosted alarm recovery remain required before gate 3 passes. No broad
performance run or deployment was performed.

## Registered fixture schedules

The v2 and v3 performance hosts now register the pack-owned v2 command ledger
with the Session occurrence owner. The Region supplies its verified clock
sequence; step `sequence + 1` submits bounded commands under the fixture's
explicit player scope, advances one fixed physical step, and captures once.
World changes, command transcript/action counts, clock identity and receipt
commit together. No extra counter survives only in RAM. Ordinary command intake
cannot impersonate a scheduled occurrence, and duplicate clocks return their
original receipt before executing the driver. Registry identity includes the
schedule ID/version. Fixture RNG seed is 1, matching the local measurement's
GameSession default; ordinary public packs retain seed 17.

The preserved v2 driver changes only its TypeScript parameter annotation to the
actual two-method read/command interface. V3 uses that exact implementation and
schedule. Registrations contain the content/policy branches; Region and Session
contain none. The cost ledger emits scheduled commands only after the surrounding
host transaction commits, and validates the receipt's shape, counts, schedule
identity/version and numbered step before accepting it.

`engine/src/runtime/occurrence-driver.test.ts` passes four laws, including all
1,800 v2/v3 schedule positions, real v3 native/SQLite rollback after scheduled
commands and physical advancement, restart, exact receipt replay and rejection of
an ordinary request impersonating a clock. The existing 16 host laws also pass.
These runs use native source `730a1e8f` and WASM SHA256
`5c7e1d4dfef0ea996e1ba8336398121c32182f592baa853a842bf5a40d36bb89`.

`framework-driver-proof.mjs --output <directory>` is the bounded actual-workerd
consumer. Its proof-only RPC can repeat the last real Region clock request; it
cannot alter the driver, schedule, time or production routes. Persisted SQLite
reads from Node check progress after workerd process restart without sending a
request to the Region. The ordinary public HTTP API drives initial observation,
pause/retry and resume. This is a short durability/consumer law, not a capacity
measurement or the 10-minute hosted qualification.

The September 23 actual-workerd run passed on source `ed2e910f`. Step 2 committed
four stockpile designations under `player:1`; the paused checkpoint retained all
four canonical entity records. Duplicate clock receipts matched before and after
process restart. A second restart after resume advanced sequence 3 to 4 without
any request to the Region. Its inventory hash is
`cca55ec1747b0de67d0ff95548c2d8e18673c9d96dd81f810e041c7cab1a2b0a`;
the lane retains the full inventory and SQLite artifacts at
`.botanical/framework-driver-proof-final/RESULT.json`.

```sh
/home/levi/src/Botanical-next/.agents/skills/orchestrate-multi-lane-work/scripts/run-proof.sh node tools/public-engine-host/framework-driver-proof.mjs --output .botanical/framework-driver-proof
```

## Durable host faults and finite retries

Host format 2 persists `running`, `retrying`, or `faulted` alongside the exact due
sequence, request and deadline. A deterministic Region/Session/kernel admission
or invariant failure becomes terminal on its first failed attempt. Other errors
retry after 1, 2, 4 and 8 seconds; the fifth failed attempt is terminal. Failure
metadata commits separately after world rollback and before alarm operations,
so failed rearming cannot erase the attempt budget. Successful acceptance resets
that budget in the same transaction as the physical occurrence. Postcommit
resident/evidence errors are fenced by the durable frontier and cannot fault the
next occurrence. Terminal worlds have no physical alarm; socket authentication
expiry can still use the one native alarm without executing the preserved step.

The host keeps the committed world queryable. Observations/connect responses carry
checked `hostStatus`; authenticated sockets receive one small status message per
change, even when their last physical frame has not been acknowledged. The remote
client reports the stopped step/reason through its existing visible error and
connection path and stops new command intake. Exact retained ordinary receipts
still replay before authorization; new mutations receive HTTP 423 and cannot
clear the fault. No guest repair/reset endpoint exists. A later repair must retain
and accept the original due identity; this cut deliberately does not invent one.

All public native packs now explicitly admit at most 65,536 records (the shared
kernel contract) and 32 MiB of aggregate Region storage. That storage envelope
accommodates the kernel's 9 MiB payload ceiling, worst-case key/metadata overhead
of about 11 MiB, and bounded state/receipt/event headroom. The per-record 256 KiB,
per-change 1 MiB/1,024 rows, initial 8 MiB and page 1 MiB bounds remain. This fixes
an accidental generic 4,096-row host restriction; it does not claim unbounded
capacity. Existing different policy/program/host-format worlds are unsupported,
retain their data, and have their alarm removed during constructor recovery or
alarm delivery. There is no migration or old execution path.

Nineteen host/Region laws and 23 remote-client laws pass. The actual-workerd
`host-fault-proof.mjs` injects failure after native records and the clock UPDATE:
capacity faults once, rolls back the physical candidate, retains 1,294 canonical
records and the exact pending identity, remains queryable after process restart,
replays prior pause/resume/clock receipts exactly, and refuses new commands.
Unsupported-format restart deletes a pre-existing alarm without changing records.
A transient failure recovers sequence 1 to 2 after process restart without a
request to the Region. The proof asserts the persisted 65,536/32 MiB policy.
The result/inventory is preserved in
`engine/implementation/clearing-repair/evidence/20260923-host-fault-workerd.json`;
raw SQLite/bundle artifacts remain at `.botanical/host-fault-workerd-final`.

```sh
/home/levi/src/Botanical-next/.agents/skills/orchestrate-multi-lane-work/scripts/run-proof.sh node tools/public-engine-host/host-fault-proof.mjs --output .botanical/host-fault-workerd
```

This is local workerd correctness evidence, not a hosted capacity measurement.
If durable storage cannot persist fault/retry metadata or any alarm, the existing
finite Cloudflare retry/platform availability gap remains. A failed rearm after
persisted metadata may cause platform retries, but cannot re-execute a terminal
world or forget its durable attempt count. The production-only type diagnostic
reports the existing SDK/game errors and placement string/EntityId mismatch;
no new host/fault-contract error was reported.

## Cadence owner checkpoint — September 23, 2026

`host-cadence.ts` now owns the public-host row format, validation, demand,
occurrence admission/completion, retry status, alarm selection and full cadence
row persistence. The DO still supplies Region state and commits that row through
the same transaction as the native clock and receipt. The old split
`clock-schedule.ts` / `wake-policy.ts` paths are removed. An admitted step keeps
its exact request through retry; after completion, a successor deadline is at
least 100 ms in the future, so slow work does not create a replay chain of missed
physical steps.

Actual local workerd evidence on host source `4107a496` ran 25+ occurrences with
two clients (one slow), replayed the last clock receipt, paused/resumed through
the public command path and advanced from sequence 26 to 27 after process restart
without a Region request. A separate fault proof preserved the old Region on an
injected failed candidate and autonomously recovered a transient failure from
sequence 1 to 2. The workerd ledger showed Node-observed sequence intervals at
p50 345 ms / p95 997 ms, alarm lateness p50 40 ms / p95 268 ms / maximum 3,265
ms, and transaction elapsed p50 194 ms / p95 858 ms. These vary materially under
shared-host load and do not pass a 100 ms end-to-end throughput target. Timings
are elapsed wall measurements, not CPU. The proof reused generated WASM SHA-256
`f454c8c5d7c86e83c8a5fa04e7bc9e7e4a8ec7bae567233ca91bc4ea75499e4f` from the
scheduler-audit worktree at `dceba216`; it validates the host transaction and
wake boundary, not a matching native build or the full capacity gate.

The retained actual-workerd ledgers are
`.botanical/host-cadence-workerd-proof-transaction-owner/RESULT.json` (SHA-256
`53b4fa467d73615da3c671f1b89b7f38648aef7e43407fc364a2018e885aed36`) and
`.botanical/host-cadence-fault-proof-transaction-owner/RESULT.json` (SHA-256
`b775c01e6b8b52f6565d10e378e4c4efb382c17a30f5ad56653c5105d82cbccc`). Both
use the standard `run-proof.sh` wrapper. No hosted deployment was performed.
