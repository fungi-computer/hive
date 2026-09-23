# Shiitake game tools — source review, 2026-09-07

Read-only source review at Botanical-next `c36ab33`. No runtime, browser, or
credential check was run. The exact source hashes consulted are recorded in the
shell receipt for this task; these packages may be live/dirty.

## What exists now

One accepted Shiitake **prompt** reaches the current tool path as follows:

1. `runAcceptedCommand` loads that Shiitake session's instruction snapshot,
   combines its optional module registrations with the host tool source, creates
   Mycelium, acquires a lease, and supplies **only** `lease.executeTool` to
   Mule (`packages/shiitake/src/internal/run-scope.ts:26-47, 51-105`).
2. The sole tool has descriptor name `execute` and accepts exactly `{ code:
   string }` (`packages/mycelium/src/execute-tool.ts:28-40, 130-151`). Its
   sandbox bindings expose the compiled operation namespaces plus
   `forage.search` and `forage.describe`; the model must discover a path and
   invoke it from the program (`execute-tool.ts:42-99`).
3. A lease captures an immutable compiled capability revision and Forage catalog
   (`packages/mycelium/src/index.ts:93-111`; `compiler.ts:143-232`). An operation
   declaration has Zod-owned input parsing, optional output validation, and an
   async host implementation (`index.ts:113-138`; `registration.ts:62-87`).
4. The operation receives only `{ executionId, signal }` as its explicit
   Mycelium invocation context (`index.ts:37-43`). It does **not** receive a
   Shiitake `sessionId`, a model/tool-call ID, account identity, game world,
   permissions, or a transaction handle. A game operation can close over a
   host-provided capability, but that is not an authorization contract supplied
   by Mycelium.

Successful sandbox output must be JSON, nesting depth at most 64 and serialized
output at most 256 KiB (`internal/execution-lifecycle.ts:22-40, 131-160`). It
becomes one Mule terminal `result` part containing one text block whose `text`
is the JSON string; errors become a `MuleError` in `tool` phase
(`execute-tool.ts:139-172`). The default execution deadline is 180 seconds,
default cancellation grace is 5 seconds, and a Mycelium runtime admits at most
eight backing sandbox executions (`execution-lifecycle.ts:62-72, 75-128,
233-335`). This is a per-Mycelium-runtime bound; Shiitake constructs that runtime
inside an accepted run, so the inspected source does not establish one global
game-agent concurrency limit.

Shiitake does have durable **conversation** session semantics: prompt acceptance
returns `{ status: "accepted", requestId }`; a session can read 1–200 messages,
subscribe after an opaque cursor, or obtain a race-safe snapshot/watch
(`packages/shiitake/src/client.ts:31-176`; `internal/client-boundary.ts:15-57`).
Those are Pi/Woodstock conversation records and activity/progress projections,
not world observations. The HTTP projection resolves a supplied session and
offers command/read/SSE routes, but the inspected route contains no account or
authorization boundary (`packages/shiitake/src/http-routes.ts:130-211`). This
does not prove no outer host authenticates requests; it establishes that such a
principal is not passed through this route or Mycelium context.

The only current Shiitake extension permission vocabulary is
`compaction_handoff | maintenance_policy`, explicitly for trusted static
extensions (`packages/shiitake/src/extensions.ts:5-44`). It is not a colony,
familiar, nation, or storyteller permission system. The existing observation
kernel is also session wake coordination with a 64-registration/256-pending-hint
limit, and treats durable session reads as authoritative
(`internal/observation-kernel.ts:6-10, 34-44, 98-185`). Reuse that distinction,
not its session protocol, for a future game observer.

## Smallest future Hive direction

Do not call the current `execute` tool an MCP/DO game server. It is a suitable
model-program door over a host-supplied operation catalog. A future Hive host
can expose two small game operations through that catalog, while the world host
remains the sole validator, simulator and writer:

| Operation family | Required contract direction | Why it is separate |
| --- | --- | --- |
| `game.observe` | Input identifies a bounded query/cursor; output is a filtered serializable projection with `worldId`, authoritative `revision` (and tick where useful), plus page/continuation information. The projection filters private inventory, fog, other factions and internal scheduler state before it reaches the model. | A model context window and a live world are different retention/visibility domains. Revisioned observations let a command explain which facts it saw. |
| `game.command` | Input carries a fresh idempotency command ID, a typed player-valid intent, and optionally an expected observation revision. The world host returns an accepted/replayed/rejected/conflict receipt containing its command ID, resulting revision when committed, and a durable work/job reference when completion is deferred. | The model never writes state by running sandbox JavaScript; it asks the existing world command authority to validate/commit one intent. Retries cannot create a second job. |
| `game.read_work` | Input is a receipt/work ID and bounded cursor; output is a filtered revisioned status/outcome page. | Building, travel and later nation actions outlive one `execute` call. A receipt is not a claim that the work completed. |

The host must bind a verified **principal and grant** before constructing the
game capability projection; model-authored input cannot be trusted to name its
own authority. Keep account ownership, current world authority, party/actor
scope and role grants distinct. That supports an AI account acting within its
own colony, a familiar constrained to its delegated actor/actions, and a
privileged storyteller with explicitly granted world-event actions. Each still
passes the same world command validation and receives only its filtered
observation view. The initial permission vocabulary is a product/host decision,
not something to infer from Shiitake's compaction permissions.

This is intentionally an adapter direction, not an SDK or DO design. Mycelium
already owns discovery, sandbox JSON crossing, bounded execution and terminal
tool projection. Shiitake already owns model-run/session retention. Hive should
own game vocabulary, observation filtering, authorization, command settlement,
receipt retention and long-job readback. A future DO can host that world
authority, but neither a Hive DO nor an MCP transport/client is present in the
inspected Shiitake/Mycelium execution path.

## First proof when a game host exists

Use one familiar or AI-colony principal, one filtered observation, one accepted
build/work command, an idempotent replay of its command ID, and `read_work`
until the authoritative outcome. Attempt the same command outside its actor or
world grant and return a typed rejection without disclosing filtered state. The
proof should show the command receipt's observation revision and completion
readback, not a literal SDK call sequence.
