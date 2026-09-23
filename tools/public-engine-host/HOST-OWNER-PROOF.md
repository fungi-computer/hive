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
