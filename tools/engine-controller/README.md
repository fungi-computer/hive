# Native engine controller consumer

The source-owned Mycelium integration registers `quarry.observe` and
`quarry.command` through public authored schemas and handlers. It does not own
simulation state, a scheduler or a receipt table. The host captures principal
and region before registration; guest input cannot change either. Observation
and receipt-result schemas are explicit consumer definitions. Raw checkpoints,
hidden voxels and event history are absent.

`command({id, expectedRevision, command})` calls the unchanged native region
owner. Its receipt is durable. Retry exactly the same input after an uncertain
response; a new execute invocation is not a new physical command. Altered input
under the same ID conflicts. The region authorizes every new command. A committed
effect survives execution cancellation, output failure or process replacement.

This is the original independent finite quarry consumer, not Goblin pawn work
or hosted Shiitake participation. No provider/model call, MCP invocation or
backend deployment occurs. Goblin can register its own supported command schema
and observation over the same integration seam.

## Run the isolated consumer

From this directory, install with `npm ci --ignore-scripts --no-audit --no-fund`.
All four public Botanical packages are exact packed artifacts under `vendor/`;
there are no workspace aliases, overrides or private imports. See
[vendor/PACKET.md](vendor/PACKET.md) and [vendor/readback.json](vendor/readback.json)
for source73741d9174ba734a8d1fb55d3303487a5a94b875 and archive hashes.

On the shared host, wrap each check with
`/home/levi/src/Botanical-next/.agents/skills/orchestrate-multi-lane-work/scripts/run-proof.sh`:

```sh
node node_modules/typescript/bin/tsc --project tsconfig.platform.json --noEmit
# Full host declaration check currently reports the external conflict below:
node node_modules/typescript/bin/tsc --project tsconfig.json --noEmit
node proof.mjs ../../.botanical/engine-controller/a-fresh-run
```

Use a fresh proof directory; the driver never deletes an existing database.
It bundles the original source module with this package's installed public
imports. `mycelium.mts` is a separately checked platform integration; physical
engine consumers do not acquire its dependencies. There is no nested engine
package added merely for module resolution.

## Execution and cleanup

The current public contract is `lease.executeTool.prepare(PiToolCall)` returning
an Effect and `prepared.execute()` returning a Stream. The host uses public
`Effect.runPromise` and `Stream.runCollect`, passes the native request signal,
and awaits lease release and runtime close through nested `finally` blocks.
Removed Mule `toolSurface` APIs are not used.

The public Codemode `DynamicWorkerExecutor` runs actual JavaScript with a native
LOADER and `globalOutbound: null`. Mycelium owns binding admission, deadline and
bounded cancellation acknowledgement. The host waits for executor settlement;
a rejected wrapper is not reported as proof that backing work stopped. The
controller checks cancellation immediately before synchronous region dispatch.
This proof does not establish arbitrary runaway-code cancellation or a durable
scheduler for unfinished execute programs.

## Current evidence and limits

Native proof u4101 /ca9e6760b6aa44b2926b8feca5b982de passed under workerd1.20260828.1,
Miniflare5.20260828.0-alpha and Codemode0.5.1. It discovers the authored operation
through Forage, checks permitted observation, rejects unauthorized commands and
observations and an injected principal field, then commits one actual excavation.
A guest that never returns withholds the response. A read-only external SQLite
witness observes commitment before runtime disposal. After reopening the same
storage, exact retries return the original receipt under fresh execute IDs;
changed input conflicts. Final storage retains exactly one excavation, chalk
lot, event and receipt. Before/after witnesses and transitive source hashes are
retained in `.botanical/engine-controller/native-v4` at the controller worktree.
This is process replacement after an observed commit, not failure inside commit.

Earlier attempts are retained separately: v1 needed explicit esbuild mainFields;
v2 correctly rejected an unbounded recursive JSON output discovery schema;
v3 caught an obsolete Miniflare persistence option. V4 uses the current
`resourcePersistencePath` and consumer-authored finite result schema.

Full declaration checking uses `skipLibCheck: false`. Generated `runtime.d.ts`
comes from Wrangler4.127.1 for the exact native compatibility date/flags in
`wrangler.json`. These generated Worker globals still conflict with the Node24
ambient globals required by the installed public SDK closure (Blob/File, streams,
URL, events and console). Full host check u4106 therefore fails; native behavior
is independently proven above. No declarations are patched and no library checks
are suppressed. Codemode0.5.1 also requires ambient `cloudflare:workers` classes
and a global WorkerLoader, so importing only module-scoped Worker interfaces does
not close that external declaration boundary. Reproduce generated types from
the repository's installed tool with
`node ../../node_modules/wrangler/bin/wrangler.js types runtime.d.ts --config wrangler.json --include-env false`.
MCP SDK1.25.2 and ai6.0.0 are pinned development peers required by the unconditional
public declarations of Google GenAI1.52.0 and Codemode respectively. Their presence
does not introduce MCP transport or model execution. The earlier u4096 check used
skipLibCheck and establishes only caller checking, not declaration closure.

The authored-module/quarry platform check uses standard ES2023 and DOM libraries
with Node types, without generated Worker globals. Earlier u4114 omitted the
standard DOM library and exposed missing ErrorEvent/HeadersInit in public SDK
declarations; the platform config now includes those maintained standard types.

Fallow found no authored-module complexity advisory. The host fetch entry remains
CC11/cognitive13: it owns authentication, preparation and nested lifecycle cleanup.
The independent native proof covers those paths; no suppression or source deletion
was used to hide the advisory.

Strict authored-module/quarry declaration closure passed u4121 /
20e39221051f4d4ca2c7bd426735f257 with `skipLibCheck: false`. This checks
the installed public package declarations and the source-owned integration under
the platform config; it does not reclassify the failed combined host check.
Fallow reports zero cycles. Its isolated tool-root dead-file/dependency results
include generated declarations and externally launched proof entrypoints; those
are not deletion authority.

## Goblin delegated controller

`goblin.mts` registers the same public authored-module owner against the actual
Goblin RegionProgram. The server selects one actor and at most 64 known shallow
dig cells. Guest inputs are typed personal `rest` or `dig`; the consumer compiles
those to existing home-party orders for that actor. It cannot pause, advance,
recruit or choose another actor/principal. Observation contains only the bound
actor's position and needs, clock/pause, revision and the explicitly disclosed
cells. A copied grant cannot be expanded by later caller mutation. Disclosed cells
are host-owned knowledge input; this does not implement fog, discovery or a new
saved knowledge ledger.

This is player delegation under the current `goblin-player` principal, not an
independent actor account. Durable IDs share that player's namespace. Reconstruct
the same delegation on retry; an altered compiled order under an existing ID
conflicts. The controller does not own jobs or infer completion from admission.
Current game order checks still decide membership, terrain and work eligibility.

From the repository root, run the focused laws under the shared proof wrapper:

```sh
node tools/engine-controller/goblin-laws.mjs .botanical/engine-controller/goblin-fresh
```

The driver bundles source into the tool's ignored `.wrangler` directory and
records the transitive source and Wasm hashes. Its deterministic sandbox fixture
invokes public Mycelium bindings through the actual Effect/Stream execute lifecycle;
it does not evaluate JavaScript. Native-v4 remains the separate native sandbox and
DO transport evidence. These laws use native Node SQLite with actual openRegion,
Goblin rules, Clearing and the maintained libcolony Wasm optimizer.

Three laws passed u4136 /7a58faa3319643e5a846cd352481b9ad: personal rest and dig
admission remain paused; actor/cell/host-action escalation fails without mutation;
observations remain narrow; reconstruction returns the original durable receipt;
and separate host advancement performs a real pawn dig yielding exactly one soil
unit, with later replay unchanged. The first u4132 attempt exposed a fixture DDL
adapter error (Node prepare executed only the first schema statement), corrected
to the existing region test's multi-statement db.exec setup. Both logs are retained.

Fallow u4140 reports no Goblin consumer hotspot and zero cycles. Its additional
advisory is the test invocation helper (CC5/cognitive6, estimated unmeasured test
coverage); it coordinates the real public lifecycle and checks failure results.
The previously documented host fetch advisory remains unchanged. No suppressions
or production behavior changes were made for this report.

Strict platform declaration checking including the Goblin consumer and laws passed
u4133 /ed6793a0212d4d4e8621b8241ae5cc37 with skipLibCheck:false. The separately
documented combined Worker/Node ambient conflict remains unresolved; this check
and the Goblin laws do not claim that full native-host declaration closure.
