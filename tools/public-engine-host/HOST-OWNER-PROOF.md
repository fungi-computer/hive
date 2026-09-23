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
