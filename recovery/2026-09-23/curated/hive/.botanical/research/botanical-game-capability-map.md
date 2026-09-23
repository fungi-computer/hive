# Botanical capability map for Hive

Read-only orientation for the Game CTO. It records source evidence, not an integration proposal or production claim.

## Authority and read point

- Botanical source read at `a96c67c351d4a1935d4b9c3573eefb0611c69749` (2026-09-07); the checkout's only status entry was untracked `?? .fungi/`.
- `wiki/0-system/current-direction.md` says the retained rebuild has a local preview with Shiitake/Parakeet, one Home Computer, and the Agent Host browser proof. Complete journey, hosted browser/provider path, offline/reconnect delivery, and production remain unfinished.
- Source establishes current behavior. The ADRs establish accepted target ownership. Neither establishes production operation.

## Existing Hive authority

`src/model.ts` owns the closed `Command` union and `Clearing` state: tick, resources, jobs, and replay history.
`src/orders.ts:commandProblem`, `acceptCommand`, and `admitCommands` decide whether a command applies, mutate state, and append only applied copies at the current completed tick.
`src/actors.ts:scopeProblem` and `inScope` enforce the present party/member scope. The fixed-step caller is `src/main.js`/`src/ticker.js`; React/Jotai display and gesture machinery are clients, and libcolony does assignment work.

Future human and steward action must therefore decode/admit a typed game command, transition state on the game clock, and return a game result. Clock, material accounting, assignment, replay, and game permission decisions stay in Hive.

## Whistle — current implementation

`packages/whistle/src/index.ts:createWhistle` is an in-memory, dependency-free semantic command graph.

- A contribution supplies `sourceId`, `namespace`, and commands. A command has ID, human metadata, optional projections, and a host callback accepting only `{ origin }`.
- `contribute` validates identity/collision ownership and private defensive ceilings, copies metadata into the graph, and returns a generation-specific idempotent lease.
- `snapshot` returns immutable derived rows for bindings, palette, slash, help, menu, and agent. Canonical command identity is `namespace:id`; ordering is deterministic.
- `execute(commandId, { origin })` calls an admitted handler and normalizes `handled`, `closed`, `missing`, `invalid`, or `failed`; a handler cannot return a game-domain result through this interface.
- `close` synchronously clears the graph. It owns no persistence, transport, listener, timer, authorization, or in-flight-handler cancellation.

Whistle can later provide shared human/agent discoverability and a common invocation entry point. It is not a game command protocol, parser, tool-schema generator, resource/clock authority, or storyteller authority.

## Whistle — accepted intent versus source

`wiki/3-resources/decisions/adr-whistle-semantic-command-runtime.md` assigns future context/availability evaluation, unavailable reasons, subscriptions, revisions, and a physical-keymap adapter to Whistle. It assigns Agar grants/admission and hosts' focus/render/effects elsewhere; Mycelium exposes agent tools.

The ADR's illustrative `setContext`, `getSnapshot`, and `subscribe` calls are absent from the candidate. `packages/whistle/README.md` also states no parser, transport, context, conditional availability, unavailable outcome, subscriptions, or notifications. Do not infer a server, event schema, durable queue, or those APIs.

## Proven Whistle/agent trace

1. `apps/demo/src/browser.tsx:Demo` creates Whistle, contributes `demo:show-browser-command-status` with an `agent` projection, and opens `connectBrowser`.
2. `services/agent-host/src/index.ts:createAgentHost` defines Zod-owned Mycelium `ui.discover` and `ui.execute` operations over its connected-browser runtime.
3. `services/agent-host/src/browser.ts:handleBrowserRequest` claims the SSE request, projects `whistle.snapshot().agent` for discovery, or calls `whistle.execute(commandId, { origin: "agent" })`, then posts the correlated normalized result.
4. The handler runs `setBrowserStatusVisible(true)`. `apps/demo/test/home-browser-proof.mjs` directs the model to use Mycelium `execute` for `ui.discover({})` then `ui.execute({ commandId })`, verifies the command ID and `{"status":"handled"}`, and observes the visible browser status.

This is live one-browser work, not durable game action delivery. `services/agent-host/src/effect.ts:make` has one active connection and one pending request; disconnect after an execute claim yields `browser_execution_indeterminate`. Current direction marks offline/reconnect delivery unfinished.

## Shiitake — current lifecycle and Session surface

`packages/shiitake/src/index.ts:Shiitake.make` is the Promise facade over the canonical Effect constructor.
`packages/shiitake/src/internal/contracts.ts:ShiitakeOptions` requires a native synchronous SQLite transaction owner, a zero-argument reconciliation scheduler, model acquisition, instruction loading, and optional Mycelium tools/extensions.

`packages/shiitake/src/client.ts` exports an addressable `ShiitakeAgent`. `agent.session(sessionId)` performs no I/O; its handle supplies typed `command`, `abort`, bounded `read`, strict-after `subscribe`, and race-safe `watch`. Prompt acceptance is request-ID idempotent; complete message lineages support `branch` and `fork`; `agent.close` owns host teardown.

`internal/coordinator.ts:executeSessionCommand` decodes a Session command. `acceptAndWakeCommand` commits a prompt through private Woodstock and requests a runtime wake. `internal/runtime-coordinator.ts:openRuntimeCoordinator` creates Watchdog over the same SQLite owner. `internal/accepted-run-executor.ts:executeAcceptedRun` claims queued work, verifies the frozen extension contract, runs the scope, and settles it. `internal/run-scope.ts:runAcceptedCommand` acquires instructions, model, and a Mycelium lease and gives the Pi-derived loop its single `execute` Mule tool.

## Shiitake — ADR intent, dependencies, current limits

`wiki/3-resources/decisions/adr-shiitake-construction-and-session-interface.md` accepts one `make` bag, synchronous cheap Session addressing, and `watch` as a read/subscribe convenience. It rejects public family-port assembly and a Cloudflare base class as the portable root.

Current source, focused tests, and current direction demonstrate more than the stale README limitation list: `runWithCompaction` performs pre/post-threshold semantic compaction, persists a Woodstock compaction transition, and can do one compact-and-continue recovery. `LiveModelRun.run` performs bounded live provider retry (at most ten, 3–60-second exponential backoff), records retry start/end events through `recordLiveRetryEvent`, and is interruptible during backoff. `session.abort()` reaches `Watchdog.cancel`; the active-cancellation test observes the model AbortSignal and a settled `cancelled` job. Local and remote `watch` supply snapshot/live-frame observation, and `ShiitakeDO` exposes Hono/SSE.

The demonstrated incomplete remainder is different: durable partial-message snapshots are deferred (only the streaming placeholder and completed message persist); an installed Zookeeper handoff/implementation, goal/mail lifecycle exposure, cleanup observation, and later retention remain open. Shiitake has a host-owned coalesced wake seam (`RuntimeHost.bind`/`requestWake`), while source exposes no physical Durable Object alarm interface. Current direction also leaves offline browser delivery and the complete product/production journey unfinished. Shiitake does not own provider catalogs/credentials, browser delivery, deployment, or production operations.

It depends on Effect, host native SQLite transaction sync, Watchdog, BirdDog/Mule/Woodstock internals, and a host-selected model/tools environment. It is a durable LLM Session runtime, not a deterministic game engine.

## Proven Session and execute-tool trace

`apps/demo/src/agent-do.ts:DemoAgentDO.shiitakeOptions` constructs Home and Agent Host modules, supplies them as Shiitake tools, and uses `ShiitakeDO` for Cloudflare SQLite/lifetime adaptation.
An accepted model prompt reaches `runAcceptedCommand`; Mycelium builds an immutable lease and projects the sole Mule tool from `packages/mycelium/src/execute-tool.ts:createExecuteDoor`.
That tool accepts only `{ code: string }`, creates scoped bindings, uses Zod for operation input/output, asks the host sandbox to execute code, and returns one terminal result. The tool does not decide game policy.

`apps/tui/src/one-shot-run.ts:runOneShot` is a direct Session caller: it opens `session.watch()`, calls `session.command({ type: "prompt", requestId, text })`, consumes frames until idle, then closes the watch. The server path is coordinator → Watchdog → accepted-run executor → run scope. Demo browser code similarly uses the neutral HTTP client at `apps/demo/src/browser.tsx`; `packages/shiitake/src/cloudflare.ts:ShiitakeDO` and `http-routes.ts` provide Hono/SSE.

## Reuse decision

Reuse later, only at demonstrated seams:

- Whistle: optional renderer-neutral game-command catalog/projection and invocation entry after a game-owned typed adapter exists.
- Mycelium: optional model-tool boundary for bounded, Zod-described `observe` and `command` operations.
- Shiitake: optional durable LLM conversation/run lifecycle when a steward needs it; Session history remains separate from authoritative game replay.

Keep local to Hive:

- command vocabulary/decoding/admission, actor authority, resource checks, fixed clock, assignments, state mutation, replay, and observations;
- one capability policy that grants human and familiar/devil steward the same admitted commands, resources, and clock; and
- a separate storyteller identity/policy with only expressly granted narrative/world authority. Neither Whistle nor Shiitake separates these game roles today.

## Missing joins — do not invent

- No game-to-Whistle contribution, parameter schema, actor identity, availability context, subscription, or command-result propagation exists.
- Whistle agent rows are human metadata, not parameterized/callable game tools; no game observation schema/tool exists.
- No Shiitake game host, model/provider choice, SQLite owner, scheduler, Session-to-game identity map, or durable game delivery exists.
- Agent Host proves only live browser command discovery/execution; it has no game clock or resource view and does not make browser work durable.
- No source demonstrates a steward-versus-world-storyteller authority boundary. Define that in the game domain before wiring any runtime.

## Minimal future experiment

Without importing Botanical or adding a server, expose a local typed test facade over one cloned/paused `Clearing`: `observe()` returns a deliberately bounded game view and `command(Command)` calls `admitCommands`.
Invoke it once as a human and once as a fake steward with identical input; prove the same result, tick, resources, and replay entry. Prove a storyteller fixture cannot call it without an explicit game grant. Only then evaluate a disposable Mycelium or Whistle projection against those exact operations.

## Personal source-reading list before future design

- Hive: `src/model.ts`, `src/orders.ts`, `src/actors.ts`, `src/main.js`, and `src/ticker.js`.
- Whistle: `packages/whistle/src/index.ts:createWhistle`, its README, and `wiki/3-resources/decisions/adr-whistle-semantic-command-runtime.md`.
- Proven bridge: `services/agent-host/src/index.ts:createAgentHost`, `services/agent-host/src/effect.ts:make`, `services/agent-host/src/browser.ts:handleBrowserRequest`, `apps/demo/src/browser.tsx:Demo`, and `apps/demo/test/home-browser-proof.mjs`.
- Shiitake: `packages/shiitake/src/index.ts:Shiitake.make`, `packages/shiitake/src/client.ts`, `packages/shiitake/src/internal/coordinator.ts:executeSessionCommand`, `packages/shiitake/src/internal/accepted-run-executor.ts:executeAcceptedRun`, `packages/shiitake/src/internal/run-scope.ts:runAcceptedCommand`, and its construction ADR.
- Tool host: `packages/mycelium/src/execute-tool.ts:createExecuteDoor` and `apps/demo/src/agent-do.ts:DemoAgentDO.shiitakeOptions`.

Wall check: do not turn the ADR's future Whistle API or the Demo's live SSE bridge into a fictional game protocol. The first abstraction must reduce real game-call-site complexity and prove one typed command/result path.
