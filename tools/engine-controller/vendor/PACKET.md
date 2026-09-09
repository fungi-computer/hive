# Hive controller capability tarballs

Source: clean Botanical integration `73741d9174ba734a8d1fb55d3303487a5a94b875`. Four package trees match accepted `97fd33c`. Morel confirmed canonical sequential builds completed before packing; no rebuild or source change by Enoki.

Private local artifact delivery only; no npm publication.

| Package | Tarball | SHA-256 |
| --- | --- | --- |
| @fungi.computer/cairn | `/home/levi/src/Botanical-lane-integration/.botanical/game-capability-packs/fungi.computer-cairn-0.0.0.tgz` | `803c6e3a95290443ba0dcd22e73d3be95795e0dc356df82f0f8ceba554581f45` |
| @fungi.computer/forage | `/home/levi/src/Botanical-lane-integration/.botanical/game-capability-packs/fungi.computer-forage-0.0.0.tgz` | `af36dbd4bf63562421630900b97b0e683ded62fbf6ef06fb9354caf02dc22fce` |
| @fungi.computer/mule | `/home/levi/src/Botanical-lane-integration/.botanical/game-capability-packs/fungi.computer-mule-0.0.0.tgz` | `f990be4c617303dc3e7049cfc469d3a08f0a8c81024f1a8ef83bf24dc4bea39a` |
| @fungi.computer/mycelium | `/home/levi/src/Botanical-lane-integration/.botanical/game-capability-packs/fungi.computer-mycelium-0.0.0.tgz` | `8e9e08ada2329aeb7cae284a89dab9ebcb2ffa6e25448dfecdac5c9c3d335396` |

Each archive was produced with `pnpm pack --json --pack-destination /home/levi/src/Botanical-lane-integration/.botanical/game-capability-packs` from its package directory (Node24.20.0, pnpm11.24.0). Every regular tar entry matches the checked-in stranger.json allowlist; every non-manifest byte matches its source/build file; manifest exports are unchanged and all workspace dependencies became 0.0.0. readback.json records file SHA-256 values, package Git trees, exports and complete runtime dependencies. Cairn hash matches the prior qualified artifact.

Closure: Mycelium requires all four tarballs together; Mule requires Cairn. External runtime dependencies remain declared normally: nanoid5.1.16, zod4.2.1, effect3.22.1 and @earendil-works/pi-ai0.85.1.

Public import paths: Cairn root, /id and /words; Forage root; Mule root and /effect; Mycelium root and /effect. All eight built entrypoints imported successfully. These are workspace import checks plus exact archive byte comparison, not a fresh installed-stranger claim.

Actual caller reviewed: Hive controllers revision60250d1, src/engine/controllers/mycelium.mts and tools/engine-controller/worker.mts. The existing caller imports (including the stale Mule import identified below): `import { Mycelium, type Sandbox } from "@fungi.computer/mycelium"`, `import { toolSurface } from "@fungi.computer/mule"`, and `import { z } from "zod"`. Mycelium.module/operation/make, runtime.acquire, lease.executeTool, lease.release and runtime.close are public.

Sandbox.execute(request, signal) receives executionId, code, timeoutMs, and nested module/operation bindings. Bound operations parse Zod inputs and return JSON; forage.search/describe are included. Mycelium owns deadline and bounded cancellation acknowledgement: timeout1..900000ms default180000; abortGrace1..30000ms default5000. Results are bounded JSON (depth64, serialized256KiB). Execution identity is distinct from durable command identity.

The host owns actual JavaScript isolation, outbound permissions, cancellation observation and backing-work settlement. Codemode DynamicWorkerExecutor and native Miniflare LOADER are host dependencies, not Botanical exports. The existing controller waits for executor settlement and then checks abort, unlike a Promise.race that would only reject the wrapper. No native cancellation or isolation proof is claimed by these package checks. No private Local host or model/provider call is needed.

Consumer handoff: use these exact filenames in tools/engine-controller/vendor, where the existing package.json already names all four. The actual consumer owner should perform its ordinary local install, typecheck and native proof; use the current Effect prepare/execute contract below; no compatibility adapter or package framework is indicated. The maintained Mycelium stranger mechanics likewise install all four together with npm install --ignore-scripts --no-audit --no-fund --package-lock=false --prefer-offline. Consumer installation/native proof is owned by Game CTO and remains separate from this artifact verification.

## Required caller correction found by behavioral smoke

The checked-in Mycelium stranger runtime fails with `SyntaxError: @fungi.computer/mule does not provide an export named toolSurface`. Hive60250d1 imports the same removed helper. This disproves compatibility of that exact caller; successful entrypoint imports alone were insufficient. The current Mule source intentionally exports mule/muleEffect/runEffect and types; do not restore a compatibility shim.

The current public `lease.executeTool` is a MuleTool with descriptor and Effect `prepare(call)`; its prepared tool exposes `execute(): Stream`. Use maintained Effect imports `effect/Effect` and `effect/Stream` (declare effect3.22.1 directly in the consumer), with a Pi call `{type: "toolCall", id, name: "execute", arguments: {code}}`. Resolve preparation with Effect.runPromise, and consume execution with Effect.runPromise(Stream.runCollect(prepared.execute())); pass the host signal through Effect.runPromise options where applicable. Existing lease release/runtime close remain unchanged. The old callId/rawArguments/status/invocation shape is superseded. Game CTO owns this correction in the actual controller and its native acceptance. Root owns correction of Botanical's stale stranger fixture. Neither requires changes to these package tar bytes.

Verified current-contract smoke: Node from packages/mycelium imports Mycelium dist plus public Effect/Stream/Zod, creates demo.ping through module/operation, acquires a lease, prepares the Pi call and collects its execution stream, asserts the terminal JSON {"value":"pong"}, then releases/closes. Exit0. This is a workspace behavior smoke with packed-byte equivalence, not isolated installed/native-host evidence.

Fixture correction exists at /home/levi/src/Botanical-lane-capability-release on fix/mycelium-stranger-current-tool (one uncommitted runtime.mjs file; no dependency setup/hooks in new tree). Exact corrected file bytes passed Node stdin execution using integration/packages/mycelium resolution, ESLint stdin, Prettier and git diff-check. Adjacent consumer.mts has no identified stale call. Strict command `node node_modules/typescript/bin/tsc --noEmit --strict --module NodeNext --moduleResolution NodeNext --skipLibCheck false packages/mycelium/test/stranger/consumer.mts` failed because installed @google/genai1.52.0 declarations cannot resolve @modelcontextprotocol/sdk/client/index.js. This is unresolved external declaration closure in the current workspace; isolated installed consumer type proof remains required. No skipLibCheck or dependency installation was used to mask it.

Dependency diagnosis: installed @google/genai1.52.0 package.json declares @modelcontextprotocol/sdk ^1.25.2 as an optional peer, while dist/node/node.d.ts imports it unconditionally. The current pnpm workspace lacks that optional peer. A strict consumer must supply this maintained peer or an upstream correction; the exact ordinary consumer install/typecheck owns verification.
