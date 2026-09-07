# Local snapshots and later durable AI jobs

**Status:** accepted local-save direction plus a later-server target assessment,
2026-09-07. Botanical Watchdog source provenance:
`a96c67c351d4a1935d4b9c3573eefb0611c69749`. This note changes no current
runtime dependency or scheduler.

## Current local browser save

The current local-save boundary remains a versioned asynchronous IndexedDB
snapshot through `idb`, not Watchdog. One committed snapshot atomically contains
world state, admitted jobs/cancellation disposition, and material/claim facts.
Continue restores that committed state paused; it does not replay a completed
action or advance the world offline. New Clearing, downloadable backup, migration
and recovery remain the separately directed local-save surface.

A writer must compare its base revision and lose when stale; `Saved` appears only
after the snapshot transaction commits. A failed save preserves the prior
recoverable checkpoint. Periodic autosave may lose changes since its last
successfully committed checkpoint after a crash, so a visible order is not
automatically a durable acknowledgement. Exact snapshot schema and invariants
remain for the promised dedicated design note.

## Later Watchdog target, not current adoption

Watchdog is a strong later server/AI job owner only where one service already
provides its required synchronous SQLite transaction, serialized execution,
liveness answer, and wake/reconciliation capability. Its observed API/lifecycle
is payload-blind durable-row ingestion, claim, cancellation, execution and
claim-token settlement. That is not a pawn scheduler, browser IndexedDB adapter,
current dependency, or replacement for fixed-step simulation jobs.

Watchdog row settlement/interruption recovery does not prove exactly-once external
effects: a disappeared claim may leave a model/tool action ambiguous. A future AI
command therefore still needs domain-level accepted/replayed/rejected receipts,
idempotency where possible, and reconciliation or an explicit outcome-unknown
policy at the owning game authority. Watchdog lifecycle settlement alone is
insufficient.

## Boundary

Keep game command admission, materials, cancellation and world effects in the
owning simulation. Translate a specifically accepted future service action into a
durable payload only at a real server boundary. Do not add Watchdog, SQLite,
liveness probes, wakes, an external executor, or a second scheduler to the
current local browser save.
