# Packed Watchdog consumer — first source shape

This separate local harness composes the unchanged `openRegion` and
`createQuarryRegionProgram` with the public Promise `Watchdog.make` package.
The baseline worker/proof/config/README remain untouched. Source review is the
current checkpoint; no native alarm/process-loss proof is claimed yet.

## Files and ordinary dependencies

- `watchdog-worker.ts`: one SQLite DO, authenticated work admission/read,
  fixed-queue alarm host, bounded harness links and a one-shot crash barrier.
- `watchdog.wrangler.json`: separate local worker/class/migration, no credentials.
- `package.json`, `package-lock.json`, `vendor/*.tgz`: ordinary package consumer.
  Repository `.gitignore` already ignores nested node_modules and .wrangler.

Vendored artifacts (SHA256):

- Watchdog 0.0.0: `00ca3f33f7eac8742555fec180bc5788afe414fc3f0ea5a6afa953282cde626e`
- Cairn 0.0.0: `803c6e3a95290443ba0dcd22e73d3be95795e0dc356df82f0f8ceba554581f45`

Both are direct file dependencies, installed together without overrides, source
aliases or private imports. Watchdog brings its declared Effect 3.22.1;
Zod 4.5.4 is an explicit harness input-parser dependency. Cairn's own Zod 4.2.1
remains normally nested. These local development artifacts are not a registry
publication or a new root dependency. `npm ci --ignore-scripts --no-audit --no-fund`
inside this directory reconstructs the ordinary consumer.

## Public routes and ownership

Per-run writer/spectator/debug secrets are supplied by the future proof driver,
never committed. `/health` does not resolve or fetch a Durable Object.

`POST /work` accepts the region's checked `{id,expectedRevision,command}` shape.
Only writer credentials enqueue. The host supplies principal; request ID is at
most 80 characters and the complete input is at most 8192 UTF-8 bytes. The job
ID is an unambiguous JSON tuple of region, authenticated principal and request
ID. The actual JSON-encoded tuple must be at most 256 characters; escaped IDs exceeding that limit are rejected before wake or admission. The immutable payload includes
the exact expected revision; recovery cannot update it to make a stale command
succeed. One fixed queue/lane and one bounded recovery are configured.

Admission prearms native alarm storage, then one native SQL transaction joins
Watchdog's public `transactional.enqueueAcceptedJob` and a bounded host link.
The link stores only job identity and a harness-only barrier, not copied
queued/running/terminal state. At most 32 distinct admissions are retained; IDs
are never silently recycled. A duplicate Watchdog identity checks the complete
immutable payload; changed input rejects. Reply is the same accepted job pointer.
There is no physical excavation at admission.

`GET /work?id=...` resolves the caller's scoped job through public `read`. A
completed job has a durable region receipt; the existing `region.dispatch` with
the identical saved input safely returns it. Domain applied/rejected status is
separate from Watchdog completed. No private table query or new region receipt
API is used. `/debug` uses separate credentials and exposes detached committed
state/events, public queue head, native alarm, and bounded harness witnesses.
It is a proof door, not player observation policy.

The executor calls unchanged `region.dispatch`, waits for native storage sync,
then returns completed. A crash after physical commit but before Watchdog's
terminal write requeues its disappeared claim and dispatches the same identity.
The region receipt is found before current revision/eligibility checks, so the
old lot/result/event is returned without a second excavation. Watchdog provides
no terminal transaction hook: no code writes its tables directly, and its
terminal row is deliberately separate from the physical commit.

## Native wake and race policy

One Watchdog runtime is built per DO instance. Its liveness probe recognizes
only that instance's active execution; fresh predecessor running rows are false.
The package's exact claims/recovery and per-runtime busy guard remain owners.
No independent thread, timer, scheduler queue or libcolony change is introduced.

A short serialized control gate (maximum 16 active/waiting control calls) covers
admission plus wake reads/writes. It never encloses `tick` or a held executor;
Watchdog's recompute callback can enter it without deadlock. This RAM gate
coordinates access, but no acknowledged work obligation depends on it surviving.

Admission writes a durable alarm BEFORE the SQL enqueue. Crash before enqueue
leaves a harmless empty alarm; a failed alarm write prevents acceptance. The
alarm handler checks the known queue and persists its successor BEFORE tick.
Both queued work and a claimed/barrier-held run therefore have durable wake
before process loss. Errors propagate to native alarm retry; they are not
converted into successful delivery or a fictional completed region effect.

This bounded one-queue harness never calls deleteAlarm. Settling the last job may
leave one already-armed no-op wake; that idle alarm returns without rearming.
This explicitly avoids a stale idle-disarm deleting a newly admitted job's wake.
Admission/recompute preserve an already earlier alarm. Active alarm handling
sets a five-second successor for its consumed wake. Constructor repair checks
persisted pending work and missing native alarm, but does not execute a tick.
Repair is a backstop, not acceptable evidence for autonomous wake after restart.

## Harness-only process-loss barrier

A debug-authorized `X-Harness-Fault: after-region-commit` at new admission arms
one persisted barrier. After region commit+sync the executor marks it reached
and syncs again, then remains pending until its process is killed (or explicit
abort). It does not throw: throwing would let Watchdog settle failed and would
not prove disappeared-claim recovery. On restart reached remains stored and the
barrier is skipped. Region dispatch replays the old receipt and Watchdog can
settle completed. Repeating admission cannot rearm an existing barrier.

## Evidence and next proof

Ordinary installations completed through prescribed wrapper: run-u3874 /
`a009331dd3af414c9265bb10d49cf560` (both pinned artifacts), run-u3879 /
`37d85f03f5f24f0f985040915682db6e` (explicit parser). Installed lock resolves both
Fungi packages from these local tarballs. Public dependency browser bundle
completed with esbuild: run-u3884 / `7a8831b9adae48b7af941e656761ae56` (~2.4 MiB
unminified). This is a syntax/bundle check, not TypeScript or runtime evidence.
An initial invocation mistakenly passed the native esbuild binary to Node
(run-u3883); it failed before bundling and was corrected to execute the binary.

After source acceptance, the first new runtime proof must enqueue, kill/restart
owned workerd with the same SQLite persistence, and establish alarm completion
WITHOUT any DO fetch triggering reopen/work. Health requests must stay outside
the DO; inspect persisted evidence independently before the first DO debug/read.
Repeat at the reached post-region-commit barrier and assert one physical edit,
one lot, one event, exact region result, then completed Watchdog state. Merely
calling debug after restart and waiting would let constructor repair mask a
missing native alarm and is insufficient.

Later matrix: native alarm failure before enqueue/rearm, overlapping alarm and
admission, changed duplicate payload, stale domain rejection, cancellation and
recovery exhaustion. No claim yet for those cases, remote exactly-once effects,
Goblin gameplay execution, hosted deployment or full engine completion.

First strict consumer check passed with Wrangler-generated workerd declarations:
`run-u3898`, invocation `51558dc9044740e19b12e1917c6fd344`, using
`node ../../node_modules/typescript/bin/tsc -p watchdog.tsconfig.json`.
The generated runtime declares native SQLite blob results as `ArrayBuffer`; the
region capability additionally accepts `Uint8Array` bindings.

First runtime attempt **failed before admission** (`run-u3900`, invocation
`c78a8ec769264e09b0a0298f34ce2a84`). Evidence and exact source hashes:
`.botanical/engine-do/watchdog-20260909-v1/receipt.json`; sanitized log and isolated
SQLite are retained beside it. The local typed SQL adapter deferred `exec` until
`toArray()`, so standalone DDL never executed and construction failed with
`no such table: hive_region`. Correction is eager native execution followed by
the typed cursor projection. Runtime was stopped and listener closure verified.
Neither restart law has run successfully; this is not a durability proof.

The eager SQL correction passed the same strict typecheck (`run-u3906`,
`f28a0bfe18ff494794c7f6d2cf63ce88`). The corrected fresh v2 runtime passed
(`run-u3907`, `91c667319df84089a12dd1038cdecfae`) with evidence in
`.botanical/engine-do/watchdog-20260909-v2/`. Its receipt contains exact source
and artifact hashes; before/after JSON files are external read-only SQLite
observations, preceding public result reads after each restart. Two owned
processes were killed: queued before work, and running at the synced post-effect
barrier. Retained alarms recovered both without a DO fetch or constructor alarm
repair. Final state retains exactly two excavation effects, two material units,
two events and two region receipts; the second job recovered once and replayed
its existing receipt. All owned listeners closed. HTTP failures now preserve
status and a bounded sanitized non-JSON body instead of obscuring host errors
with a JSON parsing exception. V1 failure evidence remains intact.

This is local native-DO evidence for these two windows only. Cancellation,
exhaustion, alarm failure edges and hosted deployment are not covered here.
