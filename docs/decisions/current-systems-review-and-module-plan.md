# Current systems review and module migration plan

## Current whole-game audit — 2026-09-09

This section supersedes the historical repair queue below. Astra owns this audit
and all serial source/Git/proof/deploy custody. Two native readers independently
reviewed execution/materials and presentation/input, then Astra inspected their
actual callers and the world, save, clock, assignment and lab boundaries. The
needs test author was stopped at its retained checkpoint; no runtime writer
competed with this audit. No Herdr lanes are being refilled.

**Conclusion:** the material kernel is substantially shared, but capability
resolution, supply planning, durable execution and validation still leak into
individual features. This is why another content type keeps requiring changes
across jobs, activity and persistence. Earlier plans identified several of these
owners; accepting helper extraction without migrating all consumers left the
central problem unfinished. This is an acceptance failure, not a reason to add
another generic framework or repeat the research.

Baseline: HEAD `2e7e543`, shipped digging runtime `449e9b8`, plus the preserved
dirty schema-15 care candidate. Care, food art and its new tests are **not shipped**.
The current source inventory and full Fallow report are retained under
`.botanical/architecture-audit-20260909/`. Line anchors below refer to that
inventory and will move as the fixes land.

### Concrete defects found during this audit

1. **Care intent and save validation disagree in the dirty candidate.**
   `needs.ts:99` permits automatic thirst alongside pinned manual rest;
   `orders.ts:515` permits the reciprocal admission. But
   `persistence.ts:1904` rejects any second care job for the same actor.
   `careFacts` also chooses the first actor job, not necessarily its active one.
   Define one care-intent policy covering identity, coexistence, priority and
   active display, then use it in admission, automatic planning and restore.
   Do not fix this by silently deleting an intent on save.

2. **A split delivery lot can be mistaken for its source identity.**
   `jobs.ts:269` requests a two-unit wood Store portion from an exact source
   lot. `materials.ts:1057` may correctly create a new carried lot, preserving
   the request's source provenance. `persistence.ts:2536` requires the carried
   ID to equal that original ID for delivery, while exempting the new use path.
   The corresponding brewing supply can also request an exact-lot portion.
   Validation must distinguish source provenance from current physical custody
   by phase, preserving all quantity, actor, claim and destination checks.
   Relabelling the source to satisfy the parser would erase useful history.
   The same ID-equality rejection and exact-lot Store planner are present in
   shipped `449e9b8`; reproduction below used the inventoried current candidate.

These are examples of why working material operations plus passing isolated
tests are insufficient. The saved-world consumer must accept every legitimate
intermediate state created by those same operations.

**Reproduced:** one actual-WASM diagnostic, `run-u3627.scope`, invocation
`369736976bc9454eb3a39c5ed480c385`, exit 0 in 0.86s, asserts both failures.
The care fixture explicitly lowers hydration to 35, validates that baseline,
admits Rest while paused and validates again; one actual step queues thirst,
then snapshot rejects the second intent. Storage uses actual Chop → Build shelf
→ Store with no inventory/site/transfer fixture mutations. At tick 228 it splits
five wood into three at source and two in hand; snapshot rejects the valid new
carried ID. These are local simulation/save reproductions, not hosted browser
replays. Before/after source hashes match. The script and full observations are
`.botanical/architecture-audit-20260909/persistence-contradictions.{mjs,json}`.

### Missing owners and the code each must replace

| Priority / owner | Existing consumers and evidence | Required deletion and acceptance |
| --- | --- | --- |
| **First: material endpoint and contact resolution** | `construction.js:181` already owns site slots. Source/contact discrimination recurs in `activity.ts:131,747`, `jobs.ts:1267`, and `finite-sources.ts:339`. Save's `relationContext:1866` separately assembles site/source/vessel/terrain containers. | Extend the real endpoint providers into one resolved description of capacity, deposit/withdraw policy, physical location and operation-specific contact cells. Planning, continuation and validation consume that description. Delete repeated endpoint-type ladders; source closure, removed shelf and lost access produce compatible answers. Container identity remains distinct from its access cells. |
| **First: item and carrier capabilities** | `item-containers.ts:31` resolves a definition only after admitting pail/keg names. `materials.ts:808`, `jobs.ts:470` and `activity.ts:537` specifically require pail. Portion/carry rules differ between `jobs.ts:120` and `269`. | Define accepted content, capacity, intact-versus-divisible custody and carrier load once. Existing lot/material owner enforces these resolved facts. Delete content-name checks from shared transport. Another compatible vessel or consumable must be a definition/asset addition; an incompatible one still rejects. Contents keep their own lot identity inside the intact vessel. |
| **First: common supply planner** | Construction, storage, cache repair, brew supply and backfill each implement source eligibility, quantity, pickup route and payload route in `jobs.ts:131,245,320,557,846`. Eating adds `927`. | One typed demand plus source/quantity policy goes through the existing availability and navigation owners into a candidate. Delete those repeated selection/routing loops as their consumers migrate. Preserve stable tie ordering, rim-only backfill and sealed-cache access; keep joint libcolony assignment. |
| **First: durable step execution and exhaustive admission** | `activity.ts:425-587` coordinates acquire/draw/approach/pour, and `705` starts a second consume pickup path. `jobs.ts:1375`, `activity.ts:95` and `orders.ts:463` repeat setup/rollback. `advanceWork:700` has no exhaustive terminal check, while `orders.ts:412,550` has fallback/list dispatch. | A closed typed executor owns entered-step prerequisites, progress, wait/failure results and cleanup. Existing movement, transfer and effect owners perform mutations. Migrate current kettle/herb/drink/eat consumers and remove their duplicate orchestration; preserve the unattended fermentation owner. Omitted handlers must fail at the actual checked dispatcher. Phase-by-phase cancellation, moving recipients, contention and paused restore must conserve goods and settle once. |
| **First, alongside that migration: shared domain validation** | `persistence.ts:2281,2390,2536` independently reconstruct operation/transfer semantics, with separate consume and water branches. `validateConservation:2724` folds each content type separately. The contradictions above are current consequences. | Domain owners expose pure phase/reference/custody predicates used by mutation preflight and restore. Persistence owns strict wire schemas, migrations and cross-domain relationship validation. Build one reference context; do not replay commands on load. Preserve historical definition versions and original grants. Refactor conservation through explicitly accounted sources, transformations, embeddings and sinks, rather than a new special total for every material. |
| **Next: body/navigation and furniture contact** | `world.js:52` and `construction.js:239` duplicate footprints. `movement.js:18` silently defaults to planar topology. `world.js:204` finds a single stair; beds remain ordinary route space in `blockedCells:217`. `clearing.ts:75` couples cat following to Rowan and ground-only planning. | One geometry definition supports distinct collision, support, contact and render queries; one explicit navigation context/profile supplies edges. First consumer is normal pawn transit versus reserved bed contact, then the cat's intentional furniture/stair access. Delete duplicate footprints and implicit live-route fallback. Single stair and levels 0/1 are deliberate current limits, not a claimed many-storey implementation. |
| **Next, independent of material code: checked controls** | `keys.js:56` and multiple `hud.jsx` button/help branches repeat metadata. `ui-actions.ts:529` dispatches only level itself and forwards other actions into unchecked JSX. `tsconfig.json` has `checkJs:false`. | Move actual supported actions, labels, enablement and invocation into a checked control owner. Keys retain physical key/focus normalization; HUD consumes descriptors. Delete matching raw action metadata and forwarding-only ownership. Button/key/help agree, including focus, composition, paused admission and persistent tools. |
| **Next, presentation: interactive target lifecycle and render order** | Cached alpha geometry/debug already lives in `visual-hit-geometry.js:147`; pointer guards/binding/disposal repeat across trees, actors, sources, lots, herbs and sites. `view.js:25` and `construction-view.js:222` separately calculate scalar depth. | Extend the existing target owner with a binder/disposer; delete repeated handlers and stale record cleanup. Separately implement visible render parts and stable ordering for beds/ramps/full actor poses. Picking resolves the actually visible part to one ID. Shape picking, collision, support and occlusion remain different questions; a new z constant or Three raycaster does not solve the Pixi order. |
| **Next, presentation: inspector and session lifetime** | `hud.jsx:2127` clamps to a hardcoded 244px width; CSS separately estimates rail avoidance. `main.js:57,542,765` installs partially unowned listeners/subscriptions; ticker and view have no joined disposer. | Measured target-card placement uses usable bounds and occupied UI rectangles. A production presentation-session owner joins camera, React root, input, ticker, Pixi and art disposal. Delete the fixed width and scattered anonymous registrations. Two mount/dispose cycles must not duplicate ticks/input or retain targets. This is a lifecycle hazard, not a measured current leak. |
| **Before another workstation: recipe process composition** | `recipes.ts:36` requires prepare/ferment/keg/tap/discard; `brewing.ts:419` picks the single herbal-ale definition. The current schema is a brewing family, not a general workstation contract. | Pin the selected recipe and compose supported attended/wait/settle stages using existing process/material owners. Keep real fermentation timing separate from hauling. Another recipe over supported stages should not edit the scheduler, transfer kernel or central validator. Do not rewrite a working specialized effect merely because its name is specific. |

### Queries, performance and environmental integration

There is useful narrowing already: `assignWork` uses a dirty gate, a bounded
shared-job frontier and one optimizer call; `matching.ts` preserves forbidden
edges and joint assignment. Cached alpha masks and terrain revisions also exist.
Keep these. ECS membership, current work eligibility and spatial proximity must
not collapse into one query.

There are still repeated full scans: `blockedCells` visits every upper cell and
scans sites for support; `drawSites` computes both enclosures and per-site
material/appearance relations every render; candidate planning repeatedly
resolves contact/routes. Introduce derived topology, endpoint and availability
indexes at the canonical mutation owners only as these consumers migrate.
Invalidate for completed construction/removal, physical terrain edits, source
access changes, transfer changes, paused commands and load/reset as applicable.
Keep moving actor/contact reservations separate from static topology. Measure
candidate generation, route work, optimizer, snapshot validation, render and
memory separately before making a population/performance claim. No navmesh,
archetype ECS or periodic world rebake is authorized by this audit.

The current `terrain.ts` correctly owns shallow edits and their revision;
`terrain-surface-geometry.js` supplies shared render/pick faces. It is still an
authored 15×15 base, not generated-world residency. `world-lab/terrain.js` and
its cancelable worker independently demonstrate bounded generation and LOD.
Soil/water and gas/heat pages decode recorded numerical evidence. Their player
controls do not advance a production field simulation. The missing eventual
join is an explicit terrain/openings/field exchange boundary, conserved
material-unit conversion, one clock and saved field checkpoint. Keep those
later consumers on the existing environmental contracts; do not import an
experimental solver into care, or claim a recording is a runtime system.

The first guest must use the same care, goods, movement/contact and recruitment
authorities. `feed.js` is an initial request/approval sequence, not yet a recurring
physical visitor/director. Trees and herbs still have separate lifecycle
implementations; unify the supported growth/death/decomposition operations when
a second living-ground consumer lands. Social relationships, belief/royalty,
groups/zones, ecology, AI players/storytellers and realms remain planned
consumers, not hidden implementations this audit supposedly verified.

### Fallow and test disposition

Fallow 3.20.0 full working-tree report completed with 1,834ms reported analysis.
It reports 91 structural/dependency issues, 175 clone groups over 142 files and
233 complexity threshold findings across 178 analyzed files / 4,929 functions.
149 threshold findings are in non-test `src`. Its coverage model is
**static estimated**, not measured test coverage.

- 138 clone groups have no non-test `src` instance; 37 include one, and 33 are
  entirely non-test `src`. Source duplicates include supply routing, phase
  validation and target event lifecycles. Historical schema repetition and
  deliberately independent recording formats cannot be consolidated blindly.
- The 30 unused-file reports include pathname-launched proofs, the untracked
  care fixture/proof, an explicit presentation test entry and retained libcolony
  source. Preserve them. The Stipe dependency is Caps' packed peer; do not remove
  it. Reported public exports need individual caller checks; an unused export
  does not imply its implementation is unused.
- The real activity/routine import cycle remains. Pure time queries can move
  below both; activity cleanup stays at its real owner.
- Large responsibilities remain: Target cognitive 125, commandProblem 119,
  advanceWork 105, validateMaterialBindings 94, drawSites 89, assignWork 83.
  These scores prioritize review; they are not 233 independently proved bugs.
- `npm test` explicitly runs clearing and persistence tests. It does not
  automatically cover materials, needs, gesture/picking or lab modules.
  Each migrated owner needs its affected suites in an explicit, short release
  command. No claim that every new test runs merely because it is named
  `*.test.js`; no replacement with a ten-minute full-home browser marathon.

This pass is source/caller review plus static analysis and the bounded
diagnostics recorded below. It is not a new hosted proof, full-game correctness
claim or new performance benchmark.

### Landing order and acceptance

1. **Correct the two phase/policy save disagreements with shared rules and
   focused regression laws.** Preserve the current playable digging deployment
   and all needs candidate bytes. Record a separate correctness checkpoint.
2. **Complete execution composition before care ships.** One coupled writer
   owns endpoint/capability/supply/step/validation migration. Start with resolved
   endpoint and capability facts, inspect the first working caller shape, then
   migrate all named current supply consumers and kettle/herb/drink/eat
   orchestration. Review which old owner disappeared before broader proof.
3. **Run an independent bounded controls/presentation lane** on explicitly
   separate files when there is capacity; integrate serially. Furniture contact
   precedes overnight guests. Shared render order fixes the known bed/floor
   issue independently of the physical contact policy.
4. **Ship shared care, then the first physical inn guest.** Use actual food,
   water, resting places and receipts through these owners. Follow the existing
   tiny-clearing release plan for useful gardening, brewing/heat and renewable
   materials. Additional content is the composition test, not an excuse for
   another branch in the central executor.

A dependency proposal must demonstrate the current owner/callers it replaces.
Excalibur informed the capability/query/lifetime design; installing it now would
not delete our supply loops or repair save semantics. Implement the missing
boundaries in the existing deterministic runtime first.

### Three.js tooling fit

The user proposed [threejs-devtools-mcp](https://github.com/DmitriyGolub/threejs-devtools-mcp)
and the [official editor](https://threejs.org/editor/). These are relevant to
original model, camera, material and lighting inspection. Hive's current
`art.js:41` renders temporary Three scenes, disposes their geometry and creates
Pixi textures; only the renderer is retained for terrain rebakes. Gameplay input,
visible-sprite ordering and alpha targets are Pixi concerns.

The MCP bridge captures live Three render calls and exposes inspection and
mutation tools. Evaluate it only on an isolated, retained original-art scene;
do not add it to the game bundle or mistake the last disposed bake scene for
the live game. The editor can import serialized scene snapshots; edits do not
automatically rewrite our procedural factories. The bounded local trial and
source/format evidence belong in `.botanical/three-tool-trial/`; production
source and global agent configuration remain unchanged by this audit.

An actual original Copper Familiar kettle has been exported to
`output/brewhouse-kettle.r185.json` in that directory. Local installed Three
0.185.1 ObjectLoader preserves 42 nodes, 36 meshes/geometries, eight materials,
two lights, transforms and world bounds. The exporter must update world matrices
before serialization. The test does not preserve the procedural factory, bake
camera/outline/Pixi texture or automatically round-trip editor edits into source;
it also does not claim browser import into the moving official editor build.
Evidence: `roundtrip-report.json`, `run-u3630`, JSON SHA256
`9d7558c491f7c5aa943fed357e2d8a8062321d680074004b650599c8ff1f6ef9`.

The pinned MCP package 0.4.1 was downloaded into an isolated temporary prefix
with installation scripts disabled. Source and packaged `dist/index.js:268`
both use `httpServer.listen(this.port)` without a host option; the bridge accepts
non-HMR WebSocket upgrades without authentication. It therefore does not meet
this shared host's loopback-only trial boundary as shipped. No MCP listener,
agent registration or game instrumentation was started. This is a concrete
tool-launch limitation, not a blocker on the audit or editor artifact. The
[bridge source](https://github.com/DmitriyGolub/threejs-devtools-mcp/blob/main/src/bridge/server.ts)
and [configuration documentation](https://github.com/DmitriyGolub/threejs-devtools-mcp/blob/main/docs/advanced.md)
were inspected directly; a tool version with explicit loopback binding can be
evaluated against the isolated retained-kettle scene.

---

Game CTO personal source review, 2026-09-08, anchored to published `32cd4235e22a6f7d456c3100d87fa8abd89475cd` plus the preserved working tree. Levi requested a deeper audit after false wall picking and bed overlap, followed by a concrete module plan. This is a current repair/migration contract. The larger [architecture plan](architecture-implementation-plan.md) and its simulation/world/living-system records describe later consumers.

The newer [controls floor-priority recut](controls-floor-priority-recut.md) now
owns ordering: controls first, then one deleted-old-branch wood+herb transfer
owner before brewing completion. [Unified work algebra](unified-work-algebra-recut.md)
is the source-of-truth recut; vertical/tower and cat-surface work remain future.
The settled [furniture contact and navigation decision](furniture-contact-and-navigation-decision.md)
now supplies the bed contact/exit policy and its caller boundary; its supporting
bed-contact review remains ignored evidence.
The accepted audit disposition makes the next durable migration schema-v7 for
both wood and herb after the isolated helper; do not land an herb-only save
intermediate. The scan's counts remain static estimates with scan-vs-HEAD scope.
The [Excalibur reuse decision](excalibur-ecs-and-reuse-decision.md) and [depth
review](excalibur-depth-source-review.md) refine this migration only: retain the
existing owners, add at most one measured derived index and joint optimizer, and
keep spatial lookup separate from painter order.

## Evidence and limits

Root personally opened the actual Pixi event boundary/Sprite bounds implementation and Hive's construction-view, view, camera/scale, main input/save/ticker callers, HUD projections/action router, command admission, assignment, activity/routine, movement/topology, construction/support, and selected relational save validators. This is a targeted cross-system review, not a claim every line is correct. Independent source readers challenged picking, rendering, support and the future architecture. No full browser suite ran in this pass.

Fresh Fallow 3.20.0, no cache, explicit Hive root:

| Evidence                                                                                                     | Result                                        | Scope                                                                                                                                                       |
| ------------------------------------------------------------------------------------------------------------ | --------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `.botanical/cto-systems-audit-20260908/audit.json`, run-u1354, invocation `56de2f15c9164d29be38b257f405077d` | Normal exit 1 for findings; 1,659 ms reported | Audit against shelf baseline `765c3282982d2ee6b07d5bea67bc21d08e4c2011`; 48 changed files including preserved untracked work                                |
| `health.json`, run-u1355, invocation `fd3823ba8ba2444e8b65a0baa0c85100` in the same directory                | Normal exit 1 for findings; 680 ms reported   | Whole discovered working tree, 77 files, 2,589 functions                                                                                                    |
| `route-probe.mjs` / `route-probe.json`, run-u1356, invocation `03c63443e45a4abe96e4c44b94cdd8cf`             | Normal exit 0; about 0.25 s tool elapsed      | Existing upstairs unit fixture copied into ignored diagnostic, validated with current `validateClearing`; actual topology route versus current Go admission |

All three ran under the mandated 10-minute/5-second-grace proof runner and completed; none timed out. The route probe uses a constructed valid source fixture, not an earned browser build, hosted input test, WASM workload or performance benchmark. Prior upstairs browser limits remain unchanged.

Audit reports 29 dead-code/dependency/cycle issues, 91 changed-file complexity findings and 40 clone groups. Full health reports 154 threshold findings, of which 100 are in non-test `src` files. Static estimated coverage influences CRAP/health grades; those are not measured test coverage or proof of runtime failure. The aggregate C/55.4 health score must not replace finding disposition.

Disposition of reported dead/duplicate work:

- Seven reported unused proof scripts are real pathname-launched entrypoints; three World Lab files are a preserved unshipped HTML consumer. Fourteen reported terrain exports belong to that unreachable-in-the-production-graph lab. Preserve all of them. Wire actual supported entrypoints/package scripts when integrated; do not delete or suppress evidence to turn Fallow green.
- `workPositions`, `coverAt`, and `WALK_TICKS` are used within their own modules and appear to need only removal of an unnecessary public export, after caller check. Their implementations are not dead.
- Stipe is a required packed Caps peer; preserve it. Shared Caps source remains a separately coordinated Botanical boundary.
- The activity/routine cycle is real. Of 40 changed-file clone groups, 34 are proof-only and six are source groups (one in the unshipped lab). The current view pointer boilerplate and duplicated save transactions deserve ownership review; proof duplication does not justify a large test framework.

## Confirmed defects and extension hazards

| Finding                                                            | Source/evidence                                                                                                                                                                                                             | Disposition                                                                                                                                                                                                              |
| ------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Transparent construction padding intercepts clicks                 | `construction-view.js` gives only floors a hitArea; finished other sites enable Sprite input. Installed Pixi uses the complete texture rectangle, then site handlers stop propagation and select a fixed ID.                | Current defect. Use cached visible-shape hit data; preserve clickable tall bodies and ground fall-through. Exact screenshot state is not captured, so this is a confirmed cause available in source, not a replay claim. |
| Draft/Go cannot find an otherwise valid stair route                | Both `orders.ts` Go preflight and commit omit `state` from `route`; its optional default traverses only same-level neighbors. The diagnostic proves a valid one-edge stair route and current rejection for the same target. | Current defect. Required navigation context must prevent recurrence. `advanceDrafted` already checks actual topology. Cat planning also omits state; decide its intended level policy explicitly.                        |
| Single-anchor draw order cannot describe extended/vertical objects | `depthKey` and site zIndex use anchor sums plus constants; bed spans two cells and stair three. Bed cells also remain walkable, so some overlap is a contact-policy problem.                                                | Current render defect and missing render-part/occlusion contract; separate graphical order from movement/contact semantics.                                                                                              |
| Typed UI action whitelist does not type-check the actual handler   | `tsconfig` includes TS and disables checkJs. `ui-actions.ts:routeUiAction` exhaustively forwards every name to the JS/JSX callback; `hud.jsx:runAction` itself is not exhaustively checked.                                 | Extension hazard. Move actual transition/dispatch ownership into checked code as that boundary is extracted. Another forwarding whitelist is insufficient.                                                               |
| Command validation can silently omit a new kind                    | `orders.ts:commandProblem` is an if-chain ending in success; the applying switch is exhaustive, but a new command can lack its own validation.                                                                              | Extension hazard, not evidence an existing invalid command bypasses all checks. Give each actual command an exhaustive validation/apply path before new workstation commands.                                            |
| Geometry/support/path policy is scattered                          | `construction.footprint` and `world.siteCells` both encode footprints; work access, support, collision, picking and contact answer different questions from partially duplicated facts.                                     | Shared typed geometry/topology facts with distinct queries. Do not collapse those questions into a single `occupied` flag.                                                                                               |
| Hot paths repeatedly derive whole-world relations                  | `drawSites` recomputes enclosures and per-site scans each frame, assignment derives paths per candidate, snapshots/projections scan state.                                                                                  | Scale risk, not measured current slowness. Add revision-scoped derived indexes/caches to measured consumers; never persist competing truth.                                                                              |

Fallow cognitive scores for personally opened responsibilities: `commandProblem` 90, `checkHerbs` 77, `drawSites` 74, `orderWork` 69, `checkJobTargetsAndScope` 69, `assignWork` 63, `checkSiteTopology` 57, `Target` 50. `checkActorTaskTarget` is cyclomatic 66/cognitive 28. The remedy is to isolate decisions, not hide the same nesting in helpers called `utils`.

## Module design: own a decision, expose a small contract

These are proposed responsibilities/API sketches, not a directory-scaffolding assignment. Keep a useful facade during each migration, move its real consumer, then delete the superseded branch. Do not maintain old and new decision owners. Existing imperative simulation mutation is appropriate within its owner; declarative UI is a projection, not an alternative simulation.

### 1. Picking and input intent

Picking owns which currently visible selectable entity a pointer refers to. It consumes presentation geometry, active level and tool policy; it returns a typed target or ground. It does not mutate jobs, select actors internally, or manufacture a world from HUD facts.

```ts
type PickResult =
  | { kind: "entity"; target: InspectedTarget; point: ScreenPoint }
  | { kind: "ground"; cell: Cell; point: ScreenPoint }
  | { kind: "outside" };

pick(point, { camera, activeLevel, interactionMode, visibleParts }): PickResult;
intentFromInput(pointerEvent, pickResult, gestureSnapshot): UiAction;
```

First fix can keep Pixi's event tree and implement a small reusable local-coordinate hit-data object. Generate/copy alpha occupancy once per immutable baked texture or provide an authored silhouette; use it through the current texture's dimensions/anchor and Pixi inverse transform. Cache by texture identity, bound memory, and dispose with the art/scene lifecycle. No GPU readback or `getImageData` per pointer event/frame. Keep true visible wall body clicks; ground-cell diamonds alone are wrong for tall objects. Do not count transparent margins as touch padding. If touch tolerance is later added, make it small, explicit and resolved against foreground occlusion rather than intercepting distant ground.

The current floor diamond is a supported surface target policy; it need not be forced into a one-size-fits-all alpha rule. A stair has lower body and upper landing semantics: explicitly decide what can be inspected at each active level rather than blindly unioning all levels. Draw order determines visible selectable parts; cutaway/noninteractive context and shadows are not blanket targets. Each render part resolves to one owner ID. Use one camera/frame snapshot for render and pick transforms, with distinct screen/world/cell coordinate types at checked boundaries; camera movement must not mix a new inverse transform with stale projected hit facts.

The reviewed current execution recut keeps one resolved visual-geometry record as
the source for both Pixi hit testing and a noninteractive diagnostic overlay.
Existing plant, loose-bundle, actor and tree rectangles remain the truthful
clickable shapes until each caller is deliberately migrated; the overlay must
draw those actual rectangles rather than an aspirational silhouette. Display and
pick geometry remain separate from physical footprint, support and navigation.
Reuse the cached baked-alpha representation and Pixi Graphics/Text where it fits;
do not add an Excalibur dependency, global debug queue, ECS or second picker.

Input intent owns the single routing decision between an armed tool, selection, pan and drafted Go. XState owns gesture phase; Jotai owns selection/preferences/facts; neither independently decides physical legality. Preserve persistent tools and right-click cancellation. The alpha hotfix keeps the existing Pixi event path; do not add a competing stage picker. Later checked dispatch must cover the real `runAction`, `main.effect` and world/key input producer boundary, with any remaining unchecked JSX producers disclosed and guarded at ingress. A typed declaration alone does not establish that coverage. Root reviewed a native suggestion to use only logical footprint diamonds and rejected it because the visible upper wall would become unclickable.

### 2. Render geometry and occlusion

Rendering owns presentation parts, visible-level/cutaway policy, conservative full-pose ordering bounds and stable order. Reuse one immutable construction geometry definition for footprint/height metadata where appropriate, with separate collision, support, interaction and render queries.

```ts
describeSiteParts(site, art, geometry): RenderPart[];
describeActorParts(actor, pose, carriedAppearance): RenderPart[];
visibility(parts, viewPolicy): VisiblePart[];
orderVisibleParts(parts, changedBounds): OrderedPart[];
```

Split `drawSites` into lifecycle synchronization, state-derived appearance, visibility and geometry/order consumers. These must each have a real responsibility and useful input; four arbitrary wrappers around one mutable closure do not constitute the change. Cache static relations/enclosures by topology revision when invalidation is complete. Keep per-frame actor interpolation and actual transient rendering dynamic.

Use the detailed [ordering/support record](isometric-order-and-structural-support.md) for overlap broad phase, partial ordering, cycle handling, full actor volumes and bed-contact proof. No all-world O(n²) loop, magic extra z constant, second renderer or duplicated full sprite. Changed art partitions receive Astra's reserved review; unchanged hit metadata has no new art gate.

The bounded bed/floor result should later replace the existing scalar depth
callers with one measured, cached rank owner over visible candidates. Rendering
and Pixi picking consume that shared order, while cached baked-alpha visible hit
geometry remains the authority for selectable pixels; world AABBs or rank do not
replace it.

### 3. Construction geometry and navigation

Geometry describes a building once. Support, cover, work approach, collision and removal dependencies ask distinct questions of it. They return explicit reasons/evidence rather than unrelated UI strings reconstructed in multiple modules.

```ts
footprint(definition, placement): Cell[];
supportAt(worldQueries, placement): SupportResult;
workAccess(worldQueries, site, operation): WorkPosition[];
removalDependencies(worldQueries, site): Dependency[];
route(navigationContext, from, to, movementProfile): RouteResult;
```

Navigation context includes current topology and blockage, with revision identity for caches. There is no silent planar fallback on a live game call. Explicitly named planar navigation may remain in a lab if it has a real consumer. Preview, admission, job candidate cost and movement revalidation must use compatible topology/profile semantics. Bed walkability and sleep contact remain a reviewed gameplay decision, not a renderer side effect.

First post support uses the bounded 3×3 rule in the companion record; planned support and finished support are distinct. Do not implement collapse in this extraction. `world` query code must not import renderer/art or a construction module that calls navigation back into world; pure definitions/geometry are lower-level dependencies, with algorithms operating on an explicit read-only query context.

### 4. Commands, work and activity transitions

Commands own admission and its result; jobs own durable requested work; candidate selection chooses eligible work; claims own promises; activity transitions own progress and completion/interruption. One authoritative simulation step orchestrates them in the existing phase order. UI/LLMs call the same command boundary.

```ts
admit(state, command): CommandResult;
candidateFor(job, actor, queries): CandidateResult;
reserveCandidate(state, candidate): ReservationResult;
advanceActivity(state, actor): void;
interruptActivity(state, actor, cause): void;
```

Use exhaustive dispatch in the actual validators and handlers, with typed family-specific internals. Scope validation remains shared but does not substitute for target/phase checks. An empty success arm for `work`/`routine` must be deliberately represented, not accidental fall-through. Do not make preflight own resources; claim and commit still revalidate current facts. Keep actual libcolony matching and priority semantics while improving candidate generation. In the current browser, an applied admission result means the in-memory state changed; it is distinct from a completed IndexedDB save and from completed work. Do not label it a durable command receipt. Live boundary parsing must not accidentally broaden historical v1–v6 save schemas.

The activity/routine cycle is primarily caused by `activity` reading `isNight` from a module that imports `finishActivity`. Extract pure clock queries/constants into a lower-level time module used by both. Keep interruption/drop/claim cleanup at the activity/material boundary; do not invent a new general event bus merely to break the import cycle. Review all callers before removing the old export.

### 5. Materials and unattended processes

Before brewing becomes a third wood/herb copy, move the needed commodity path behind physical-lot/location/claim/transfer contracts from [simulation and content](simulation-and-content-contracts.md). Migrate one actual consumer with old-save conversion and deletion of its old ownership fields; do not add a universal inventory to every entity first.

```ts
reserveTransfer(state, sourceLot, destination, quantity, job): ClaimResult;
transferClaimed(state, claim, phase): TransferResult;
releaseClaim(state, claim, disposition): void;
startProcess(state, stagedInputs, pinnedRecipe): ProcessResult;
advanceProcess(state, process, knownConditions): void;
```

Ground, hands, shelf and vessel are physical custody. Claims are promises. Process input conversion and output settlement balance quantities and preserve batch/recipe identity. Do not refund transformed ingredients on cancel or conjure a portable keg. A working vessel remains occupied while a batch runs or output awaits collection; deconstruction is blocked by its contents until that lifecycle is supported. External storage being full is not loss of the batch.

A single material mutation seam owns quantity/location/claim changes. An actor's UI inventory is derived. Shelf UI is a mixed simple list/capacity; backpack grids remain a separate later presentation/capacity consumer.

### 6. Persistence and session coordination

Persistence owns schemas, migrations, relational validation, snapshot encoding and repository commit/revision semantics. Main's session coordinator owns pending saves, replacement intent, epoch and recovery UI. Moving that coordinator out of `startGame` should hide async races, not create another authoritative state store.

```ts
decodeAndMigrate(raw): RestoredSnapshot | RecoveryProblem;
validateReferences(snapshot, indexes): void;
validateActivityAndClaims(snapshot, indexes): void;
validateTopologyAndMaterials(snapshot, indexes): void;
saveRepository.commit(snapshot, expectedRevision): CommitResult;
```

Build one validation context per snapshot for identity and relation lookups. Split `checkHerbs` into plant-stage, herb-job/activity, bundle-location and conservation checks; keep the latter at the owning material boundary. Split `checkActorTaskTarget` by exhaustive activity family while retaining cross-family exclusivity rules. Never weaken unknown-key, missing-reference, capacity, support or material-sink rejection to simplify code.

Unify the genuinely repeated IndexedDB commit mechanics only after preserving the distinct `save` versus explicit replacement policies. Existing v1–v6 migration/recovery must remain legal through each behavior-neutral extraction. Loading an old valid save does not automatically rewrite the durable slot. New material/support semantics require schema-v7 migration for both wood and herb after the isolated helper; do not land an herb-only durable intermediate or call a semantic change a refactor.

## Dependency shape and concrete flows

```text
UI / keys / Pixi input -> checked intent dispatcher -> command admission
                                                   -> authoritative state
clock + pure geometry -> world/navigation queries -> work candidates
work candidates -> existing matcher -> claims -> activity/material transitions
authoritative state -> immutable display facts -> Jotai/Caps
authoritative state -> render descriptions -> ordering/picking -> Pixi
schema + migrations + domain invariants -> save repository
session coordinator -> repository + recovery presentation
```

The arrows describe dependency direction, not multiple schedulers. Persistent data has one owner. Pure geometry/time do not import workflows. New ecology, beliefs, knowledge and magic use their declared consumer ports in the larger plans rather than subscribing arbitrary callbacks to everything.

Example: a click on visible wall resolves to `site(id)`; inspector asks current deconstruction availability; command admission creates one job; candidate selection finds an eligible reachable actor; activity rechecks dependencies, removes the site and deposits salvage once; state revision invalidates geometry/support views; persistence records the result. If the click was on transparent padding, that chain never begins.

Example: a brewer requests a recipe; ordinary haul delivers claimed ingredients into a real vessel; preparation starts a pinned process; the actor can take another job; time/conditions advance the batch; one output appears in vessel custody; serving/storage transfers it through the same goods path. New recipes over these operations add definitions/assets, while a genuinely new operation requires an exhaustive implementation and invariants.

## Landing sequence and custody

1. **Current picking + Go correction.** Delivery assigns one clear owner per seam, checks immediate callers and lands short laws plus one physical pointer/level trace. Root authorized cached hit metadata over unchanged art. Empty padding, actual visible wall, pan/zoom, lower/upper filtering, persistent armed tools and stair Go are the exit. No new feature or full-home earning marathon.
2. **Bed/render first consumer.** Diagnose contact versus occlusion from an exact pose fixture, then migrate bed parts and depth policy. Native/game-scale stills and short walking/carry/sleep motion; both axes/levels and reverse insertion order. Reserved changed-art review stays with Astra. Unrelated Go/picking work does not wait for this art batch.
3. **Checked input and navigation boundary.** Move real intent dispatch/transition, effect execution and input normalization into TS (or explicitly checked scoped JS), replace the forwarding-whitelist illusion, and require topology context. Explicitly record any remaining unchecked JSX producer scope; validate its boundary. A new action without an actual handler must fail typecheck. Keep React mounted/focus stable and keep ordinary/drafted path outcomes identical except the intended Go fix.
4. **Historical work/save planning note, superseded by the unified-work recut.** One coupled writer keeps actual commands/claims/activity/schema consistent. Pure time can land alone; exhaustive admission lands before the new command; reshape only the validators/ownership touched by the actual goods migration. Prove the relevant interruption/reference and v1–v6 restoration outcomes. Changes must delete duplicated ownership and keep stage ordering. The earlier allowance to defer all-wood migration is superseded: [unified work algebra](unified-work-algebra-recut.md) now requires both construction wood and herb storage to converge on the shared transfer lifecycle, with duplicate owners deleted, before brewing is architecturally complete. No wholesale directory rewrite.
5. **First brew material/process consumer.** Integrate the chosen finite recipe through the new needed goods/process seam, migration and actual workstation. Two supported definitions using the same operations demonstrate config-driven content; do not manufacture an arbitrary second recipe for a test. Save during work/process, cancel, full destination and exact output custody are required.

Post-supported floors are an independent product follow-on but share geometry/support/save integration, so they cannot run a competing coupled writer through packets 3–5. Delivery can choose their insertion point once the concrete first shape is small. Collapse remains later. World Lab source/measurement and reviewed research can move independently with isolated files; map expansion is still gated by tiny-map playability.

Delivery retains sole Git/build/proof/deploy and ordinary source acceptance. Root owns these architectural decisions and original-art review. Every packet names what old path it removes, the first working consumer and one failure proof. Stop and recut if an extraction requires a global registry/event bus, doubles state, changes save semantics accidentally, or grows beyond its consumer. The purpose is to make the next behavior cheaper and safer, not to maximize module count.

Track this corrective review in existing #1 code health, #3 construction/rendering and #12 interaction issues; associate #6 scale and #7/#14 brewing where relevant. Preserve full raw Fallow JSON, screenshots, source probe and interrupted historic evidence. This audit has not fixed or redeployed the reported defects; Delivery's later exact-revision evidence owns that claim.
