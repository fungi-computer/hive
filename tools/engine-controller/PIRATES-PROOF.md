# Existing Pirates reuse witness

Pirates is an existing registered browser/public DO pack. This repair adds no
new game and no Pirate/content-name branch to native planning, Region, transport
or public host. Its `GamePack` definition now declares the shared traversal and
storage capabilities its hauling actually needs. Native planning now accepts
both generated terrain and authored support surfaces. A small geometry owner
resolves bounded, reachable transfer contacts in the surface's local frame.

## Public authoring boundary

An ordinary pack author edits definitions, scoped commands and presentation in
`engine/src/games/pirates.ts`, using:

- `Surface`: local rectangle and height on the positioned deck; `Support`:
  reference to that physical frame. Neither requires a generated terrain world.
- `Body`, `Traversal`: native motion and clearance/step constraints. Support
  navigation uses integer metre x/z cells at the authored surface height.
- `Container`, `StorageProvider`, `MaterialLot`: carrying capacity, storage
  eligibility and unique physical custody/quantity. Art grants none of these.
- `Party`, `OwnedBy`, `PartyMember`, `OwnedByParty`: authority and work pool.
- `SupplyAllocation`, `WorkPolicy`, `WorkExecution`, `WorkSchedule`,
  `WorkParticipation`: the existing native hauling obligation and participation.
- `command`, `query`, `encodeDefinition`: checked public definitions and commands.

Another initial supported-surface cargo task declares a finite lot, source and
destination containers on the frame and an allocation referencing them; it uses
the same native reservation, assignment, route, pickup and delivery owners.
Runtime material creation/transfer must remain typed native operations. The
`loadCargo` command only enables participation for controlled party crew; it
does not move quantities or manufacture task success. Ship/crew/chest/hold art
uses existing `pirate.*` sprite identities and accepted baked assets.

This repairs a concrete Edmund-style public-definition use case. It does **not**
claim complete Edmund authoring readiness, arbitrary recipe/buildable authoring,
a public package publication or a fully qualified second production game.

## Controller and durability

`pirates.mts` registers scoped observation and `loadCargo` through the same
`createRegionControllerModule` consumed by maintained controllers. The trusted
host grants crew1, keeps the public DO credential, and offers no clock stepping,
ship control, raw state or authority selection to guest code. `pirates-worker.mts`
is a stateless controller fixture: the real public engine DO owns all state,
occurrences, receipts and SQLite transactions.

`runtime.mts` shares the actual Botanical Mycelium lease/execute lifecycle and
Cloudflare Code Mode sandbox with the existing Quarry controller. Shiitake's
maintained run scope consumes these Mycelium modules and sandbox capabilities;
this test executes that real capability seam, **not** a model provider call or a
full durable Shiitake Session. A canceled/lost execute response does not undo a
committed command; retry retains epoch, id, expected revision and command bytes.

Run from repository root with the ordinary proof guard:

```sh
/home/levi/src/Botanical-next/.agents/skills/orchestrate-multi-lane-work/scripts/run-proof.sh node tools/engine-controller/pirates-proof.mjs .botanical/pirates-controller-proof
```

The harness separately bundles the real public worker with root dependencies
and the controller with its owned dependency/config boundary, runs local workerd
with SQLite persistence, rejects unauthorized code, starts cargo work, destroys
the entire runtime, retries the same command, waits for native delivery, restarts
again and checks durable results and conserved quantities. `result.json` records
source/WASM hashes and the local-only evidence class. Use a fresh output directory
per source build: incompatible current-format stores are deliberately rejected.

## Evidence and limits

Native Pirates proof covers all four translated/rotated headings, mid-carry
save/restore, delivery, total seven units conserved and terminal restore. The
Colony manual-cargo/resume law exercises the same supply/transfer owner on terrain
including current-format restore. Browser `WorkerRuntime` start/save/restore and
Survival's minimal-schema restore cover the public session boundary. Declared
native schema/version mismatches and all custom schema mismatches still reject;
optional native-injected schemas do not require unused game declarations.

No fresh rendered art review, public hosted deployment or performance capacity
claim is made here. Existing Quarry controller proof checks the shared sandbox
extraction. Fresh Fallow tooling was unavailable in this lane; `world.rs` remains
a large pre-existing ownership hotspot, with new surface contact logic isolated
in `surface_contacts.rs` rather than expanding its geometry branches.

Local qualification on September 23 passed after the generic Region resident
acknowledgement correction (`6efc0316`): replay/rejected commands have no new
native capture to acknowledge. No host branch or synthetic Pirate state was
needed. The first cargo command was accepted at revision 4, completed by revision
63 (simulated 6.2 seconds), and remained complete after process replacement at
revision 64. Both post-restart command retries returned the original receipt.

- Public bundle plus WASM SHA256:
  `62778b856f06e1491d0823a528ea7d95f59810546c103d41fe239c9f75db09f7`.
- Native WASM SHA256:
  `a52053a37591b85b4f87f397818e070c1873d21474d59d8a22d4653187fe01c2`.
- Retained raw evidence in this lane:
  `.botanical/pirates-public-qualified/result.json`.
- Pirates: 5 laws; native-schema/browser recovery: 2 laws; Colony shared hauling:
  1 law; native surface contact geometry: 1 law; existing Quarry controller:
  accepted/unauthorized/restart/replay witness passed. Scoped controller TypeScript
  check passed. These are correctness witnesses, not population benchmarks.

The integration owner must rebuild WASM against the integrated native source;
this lane's artifact predates parallel retained-search record changes. Public
hosted parity and visual browser review remain release work.

## Mycelium / Code Mode adapter witness — September 23

`runtime.mts` now uses the same public Code Mode connector shape as Botanical's
`apps/demo/src/codemode-sandbox.ts`: sanitized namespaces, `RpcTarget`
`callTool` bindings, no sandbox network access, and the host cancellation signal.
The local consumer preserves its `{ executionId, value }` response envelope.
The public Pirates worker proof passed through the actual Mycelium Effect/Stream
execute tool and a persistent local workerd SQLite DO: observation was scoped to
the granted crew, unauthorized controller calls failed, `loadCargo` was
admitted once, exact retry after process replacement returned the original
receipt, delivery completed with bread/wood conserved, and a second restart
recovered the terminal result. This does not run a Shiitake model/session or
establish hosted parity.

- Engine bundle implementation hash: `74c3d5d57ce4086943d51a46a9256b8928014bea182e9866f8f93d4d9fc89131`.
- Existing WASM SHA256: `5c7e1d4dfef0ea996e1ba8336398121c32182f592baa853a842bf5a40d36bb89`; the lane and integration branch have identical Rust kernel sources. No Cargo build was run here.
- Accepted receipt: revision 7, command `load-cargo-0`; recovered terminal: revision 62, two units delivered, zero pending.
- Raw evidence: `.botanical/pirates-controller-luna-20260923-retry1/result.json`.

The first corrected-adapter attempt preserved its output-envelope mismatch in
`.botanical/pirates-controller-luna-20260923/failure-output-shape.txt`; restoring
the consumer's existing envelope fixed that result without changing owner or
command semantics.
