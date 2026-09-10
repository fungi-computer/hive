# Colyseus, distributed JavaScript worlds and sleeping regions

King Bolete, September 10, 2026. Research and proposed adoption boundaries against
Hive `3fa9947a312345a178c23c0317dc7289edb04f11`. No dependency installation,
runtime implementation, benchmark or host compatibility proof accompanied this
review. The current preview remains browser-owned and Levi reports it too slow
to playtest. Networking research does not qualify its performance.

## Decision

Learn broadly from Colyseus's client/server contract. Evaluate its standalone
schema encoder only when the actual bounded observation consumer needs it.
Do not adopt its Room lifecycle as Hive's durable simulation owner, and do not
treat the community Cloudflare starter as a maintained, durable-world package.

Levi explicitly reframed the world: it should feel alive on return without
continuously computing every place ever visited. Support the same simulation
under a local browser Worker or online DO. Keep permanent edits and meaningful
history; spend detailed CPU where interaction needs it. The authoritative policy
is in [browser/DO hosts and sleeping regions](local-snapshots-and-durable-ai-jobs.md#browser-and-do-hosts-with-sleeping-regions--september-10).

## Useful Colyseus mechanisms and their actual Hive fit

| Mechanism | What to learn or reuse | Hive boundary / limit |
| --- | --- | --- |
| Initial state followed by changed fields | A reconnect begins with a coherent view; subsequent traffic represents changes. | Encode a permitted projection of committed Region state. Network Schema objects must not become a second inventory or world owner. Patches collapse intermediate mutations; they are not durable event history. [State sync](https://docs.colyseus.io/state). |
| Standalone `@colyseus/schema` | Public Encoder, Decoder and StateView are separable from Room. Strongest concrete package candidate. | First extract what HUD/view really need. Preserve stable display identities across detached state commits. Compare bounded snapshots before selecting binary patches; qualify one coherent published version in browser and workerd. [Source and exports](https://github.com/colyseus/schema). |
| Per-client StateView | Send relevant objects and fields, including explicit removals as visibility changes. | Exploration and authority decide what may leave the server. Unmarked fields are visible by default, and the docs warn about large datasets. A rendering cull is not permission; avoid transmitting every fluid cell. [Views](https://docs.colyseus.io/state/view). |
| Streaming collections | Budget new entries over multiple patches; prioritize nearby information. | Experimental API. It limits additions, not all subsequent changes or all encoding work. Keep transmission budgets distinct from simulation activation and fog of war. [Streaming](https://docs.colyseus.io/state/streaming). |
| Composable validated handlers | Reusable typed message maps fit small modules with explicit operations. | Input shape validation does not prove ownership, reachability or capacity. Keep Hive's existing command admission and material/work handlers. Reject accidental duplicate handler names instead of silently overriding through object spread. [Message composition](https://docs.colyseus.io/room/messages). |
| Separate clocks | Simulation step, patch delivery and rendering need independent cadences. | A 60fps camera must not force 60 durable saves or full environmental updates per second. Publish only committed facts; a library's automatic patch timer cannot publish an uncommitted candidate. [Room timing and patches](https://docs.colyseus.io/room). |
| Drop, reconnect and leave | Preserve a player's session experience across transient network loss, then reconcile it. | Socket/seat identity is not account identity. A lost acknowledgment retries the same scoped command; reconnect gets a fresh committed view. Buffering messages does not make their effects durable or idempotent. [Reconnection](https://docs.colyseus.io/room/reconnection). |
| Interpolation and prediction | Smooth received movement and give immediate local input feedback. | Start with cosmetic interpolation of committed traversal. Do not predict digging, resource creation or paid work. Whole-world rollback would need more than positions, including solver state and claims. [Prediction](https://docs.colyseus.io/netcode/client-prediction). |
| Input sequencing and budgets | Bound incoming input and distinguish receipt acknowledgment from presentation. | Validate principal and legal intent through Hive. Do not let input rate grant simulation time. Sequence numbers do not replace durable command IDs. [Server input](https://docs.colyseus.io/netcode/server-input). |
| Room lifecycle and admission | Separate authentication, membership, connection lifetime and world lifetime. | An empty room may be disposable for a match; a settlement persists. Core Room uses process timers and in-memory reservations. An `onDispose` save is insufficient for a DO eviction. [Lifecycle](https://docs.colyseus.io/room/lifecycle), [Room source](https://github.com/colyseus/colyseus/blob/master/packages/core/src/Room.ts). |
| Matchmaking, presence and distribution | Locate an owner and route a client to it; keep discovery separate from game state. | One Colyseus room belongs to one process. More processes permit more rooms; they do not parallelize one coupled world. DO names may already provide the required routing. Do not add Redis merely to imitate Colyseus deployment. [Scaling](https://docs.colyseus.io/scalability). |
| Load testing and operational tools | Script actual connecting clients and ordinary commands; inspect connection and state delivery behavior. | A connected idle-client count says little about digging, fields, serialization or commit cost. Later qualification should measure actual actions, transmitted bytes and recovery separately. No new test matrix follows from this study. [Load testing](https://docs.colyseus.io/tools/loadtest). |
| Command package and plugins | Content can compose supported handlers instead of branching one huge room class. | Hive already has typed durable commands. Adding another dispatcher or a universal plugin bus would duplicate the owner. Reuse a dependency only where it replaces demonstrated work. [Command package](https://github.com/colyseus/command). |

Colyseus's normal transport documentation covers Node/Bun transports rather than
an official durable DO host. Its room persistence documentation describes
ephemeral room state and application database integration. That is a different
contract from acknowledging every game command only after an atomic commit.
[Transports](https://docs.colyseus.io/server/transport),
[room persistence FAQ](https://docs.colyseus.io/faq#how-do-i-persist-room-data).

The official docs identify v0.18. Independently read mutable core/schema branch
manifests returned inconsistent exact version combinations during this review;
they are not a qualified installation recipe. A package evaluation must pin
compatible published artifacts and their actual declarations/bundles.

## Community Cloudflare transport: maintenance and source audit

Examined [c-py/colyseus-cloudflare-worker-transport](https://github.com/c-py/colyseus-cloudflare-worker-transport)
at commit `b0f296e444867dc2edb47e351c28b7238e08289f`, June 4, 2026.
The observed history contains one commit. No releases or CI workflow were found;
the repository contains one room connection/state-sync smoke test. These are
observed maintenance signals, not a claim about the author's future intentions.
[Pinned tree](https://github.com/c-py/colyseus-cloudflare-worker-transport/tree/b0f296e444867dc2edb47e351c28b7238e08289f),
[test](https://github.com/c-py/colyseus-cloudflare-worker-transport/blob/b0f296e444867dc2edb47e351c28b7238e08289f/test/MyRoom.test.ts).

The public repository is a starter app: package name `my-app`, `private: true`,
Colyseus 0.17 dependencies, with `postinstall: patch-package`. Its lock resolves
core 0.17.43 and schema 4.0.25. It is not presented as a separately consumable,
released transport library. The manifest says `UNLICENSED`; the pinned tree has
no root LICENSE/COPYING. Reuse permission would need resolving before copying
code. Three dependency patches alter monitor/playground asset paths and
iconv-lite browser declarations. [Manifest](https://github.com/c-py/colyseus-cloudflare-worker-transport/blob/b0f296e444867dc2edb47e351c28b7238e08289f/package.json),
[patches](https://github.com/c-py/colyseus-cloudflare-worker-transport/tree/b0f296e444867dc2edb47e351c28b7238e08289f/patches).

It provides a Worker entry, Matchmaker DO, Room DO, Presence/Driver DO and custom
transport. Presence persists collections and room metadata, with alarms for
expiry and hibernating pub/sub sockets. That is useful infrastructure work.
It does **not** persist the actual game room, world snapshot, command receipts
or physical transaction log. The Room DO gets a Colyseus room from an in-memory
server and accepts its game socket with ordinary `serverWs.accept()`; it does
not implement the game's hibernation callbacks. Its client adapter depends on
internal-facing core types/helpers and manual patch/send scheduling.
[Room DO](https://github.com/c-py/colyseus-cloudflare-worker-transport/blob/b0f296e444867dc2edb47e351c28b7238e08289f/src/transport/worker/durableObjects/ColyseusRoomDO.ts),
[Presence DO](https://github.com/c-py/colyseus-cloudflare-worker-transport/blob/b0f296e444867dc2edb47e351c28b7238e08289f/src/transport/worker/durableObjects/ColyseusPresenceDO.ts),
[server bootstrap](https://github.com/c-py/colyseus-cloudflare-worker-transport/blob/b0f296e444867dc2edb47e351c28b7238e08289f/src/transport/worker/helpers/getServer.ts),
[client adapter](https://github.com/c-py/colyseus-cloudflare-worker-transport/blob/b0f296e444867dc2edb47e351c28b7238e08289f/src/transport/worker/transport/CloudflareWebSocketClient.ts).

**Assessment:** useful source reference, insufficient as a maintained durable
world dependency. Choosing it means owning compatibility, patches, state
reconstruction, game-socket lifecycle and source permission. It does not remove
Hive's difficult boundaries. No installation or claimed DO runtime acceptance.

## JavaScript distributed worlds already exist

**Direct Levi direction:** Screeps should be a major motivation for Hive. Treat
it as a continuing product/architecture reference, especially first-class
programmable players and durable consequences. This complements Goblin's cozy
human play and Shiitake's controller roles; it is not a request to copy a
programmer-only interface or require every player to write code.

Screeps is a direct counterexample to the claim that nobody has built this.
Its public architecture describes a JavaScript/Node world with database-backed
state and player/room work distributed across machines. Its open-source server
also describes itself as distributed. The architecture page retains old
Node/Mongo/Redis versions and historical hardware figures: these establish the
design lineage, not present-day performance or the current production fleet.
[Architecture](https://docs.screeps.com/architecture.html),
[standalone server](https://github.com/screeps/screeps).

The useful lesson is explicit ownership: process one room's changes together,
then commit state. Screeps's documented staged global tick coordination is not
the sleeping, independently advancing regional policy Levi now wants. Its game
rules and timing make particular distribution tradeoffs; they are not a generic
seamless voxel engine. [Game time](https://docs.screeps.com/game-loop.html).

Our engineering assessment of why a general engine is harder:

1. **Distributed interactions need game semantics.** A person crossing a border
   with an item must have one owner after retries/crashes. A flood through that
   border needs finite admitted exchange. A transport cannot choose those rules.
2. **A crowded place remains coupled.** Thousands of quiet regions can sleep;
   a busy battle or connected flood may need one busy owner or a deliberately
   designed partition. Additional owners do not automatically divide that work.
3. **Durability changes the programming model.** RAM mutation and a successful
   socket send are insufficient. State, consumed goods, commands and required
   outgoing obligations need a coherent commit and restart behavior.
4. **Generalizing exposes different games' conflicts.** A turn-based colony,
   twitch combat game and editable fluid world need different time and boundary
   policies. Small supported capabilities can compose; an opaque callback alone
   does not make arbitrary game code safe to distribute.
5. **CPU and infrastructure are separate costs.** TypeScript is useful for shared
   rules, browser tooling, commands and orchestration. Numerical work still needs
   bounded data and measured cost; switching hosts/languages does not eliminate
   work or serialization. WASM remains an optional measured kernel replacement.

These are design explanations, not a researched claim that all studios made
the same commercial decision. DOs make the ownership unit attractive by placing
single-threaded compute beside persistent storage and routing requests by stable
identity. They do not supply cross-object transactions or unlimited per-owner CPU.
[Cloudflare ownership guidance](https://developers.cloudflare.com/durable-objects/best-practices/rules-of-durable-objects/).

## Catch-up, not an accumulated tick debt

Separate **recovery replay** of committed history from **offline progression**.
The first reconstructs what happened. The second computes what the game policy
says should happen over an unattended interval. It need not replay fine physics.
Eight hours at 20Hz would be 576,000 missed ticks; a week would be 12,096,000.
A saved world must not acquire that loading cost merely because nobody opened it.

Use a small number of meaningful transitions: a planted crop matures; a paid
passive brew reaches its next attended phase; a finite fuel supply ends; a
caravan becomes due. Quiet fields may use conserved basin/room summaries with
coarser evolution. Sleeping a drained pond cannot refill it; sleeping a sealed
room cannot erase its smoke. Re-entering twice cannot produce twice the beer.
Paid sources still settle their receiver's material/heat; skipping a release
cursor alone is not catch-up. These are intended behaviors, not current features.

Unvisited base terrain needs no DO. A previously visited quiet region retains a
checkpoint without a running process. An active player/agent or a consequential
external effect can wake the appropriate owner; a crop readiness date need not
wake anyone until it matters. Tightly coupled neighboring activity can activate
a bounded group, without recursively waking the planet. Continuous detailed
simulation is reserved for actual interactions, not a camera-history flag.
[DO sleep and lost RAM](https://developers.cloudflare.com/durable-objects/concepts/durable-object-lifecycle/).

Sleep is not pause. Local pause remains explicit; online offline-growth and
unattended danger need declared game rules. Shared temporal handlers use one
canonical stock/time owner. Coarse and detailed trajectories may differ within
declared limits. Preserve unique identities, physical totals, changes and causal
order; save the covered interval so splitting visits cannot farm extra progress.
See the canonical policy for wake/transfer/clock details.

## Actual Hive gaps and a bounded next sequence

Current source still advances from Pixi's callback in `src/main.js`; HUD/view
query a full Clearing. Existing `src/engine/region/index.ts` already has the
atomic command/replay owner, but the retained Goblin Worker is a proof host,
not a complete customer-facing world service. Its proof API and full-state
inspection cannot become the public multiplayer API. It has no autonomous
world alarm join. Current Region receipt capacity is 4,096 with no sustained
retention lifecycle: one durable advance command per 20Hz tick would exhaust
that in about 205 seconds. Batching and safe receipt retention must be resolved
before claiming sustained online play.

Proposed implementation order, subject to the current design review:

1. Finish the actual client/simulation separation over existing commands and
   bounded observations. Keep local browser authority usable. Remove the
   demonstrated repeated geometry/admission work; a transport is not that fix.
2. Run the same small clearing under one durable online owner with two clients,
   scoped views, reconnect and existing retry/commit laws. Keep the region size
   workload-based; rendering chunks do not dictate DO boundaries.
3. Introduce one useful sleep consumer: crop plus paid passive process, duplicate
   reopen and one external transfer. Use authored intervals and bounded work;
   no historical tick matrix. Ensure wake obligations survive an absent process.
4. Add cross-region travel/finite transfer after one owner is useful. Water/gas
   boundaries require their own admitted quantities and time interval, not a
   world-wide per-frame RPC graph. Preserve the large-world and vertical vision
   without claiming arbitrary seamless subdivision already works.

No full Colyseus adoption, new server framework, generic scheduler, permanent
polling loop or fresh performance claim is authorized by this research alone.

## Source review provenance

Three native reads informed this review, all source-only:

- Hume: `room-current-environment/.botanical/do-client-join/COLYSEUS-READINESS.md`,
  SHA256 `8c822b769e0ab9b12f0b0ce891a4f1d4bef9cc349a8f1c00946d0f96d6a11ab8`.
- Meitner: `vessel-boundary/.botanical/vessel-boundary/SLEEPING-REGIONS-3FA9947.md`
  and its adjacent 27-source inventory. Existing growth/needs are cheap candidates;
  paid receivers, labor, physical borders and wake remain explicit missing joins.
- Pauli: `presentation-current/.botanical/research/colyseus-cloudflare-worker-transport/ASSESSMENT.md`,
  pinned tree/manifest/room/presence/test and patch/license addendum.

Those paths are under `/home/levi/src/hive-worktrees/`. King personally read the
findings, current caller notes, pinned RoomDO/manifest and official docs, and
authored the canonical decision. No observed public source is a substitute for
an installed consumer proof; none was run here.
