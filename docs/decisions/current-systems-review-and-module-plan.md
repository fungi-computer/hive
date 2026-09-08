# Current systems review and module migration plan

Game CTO personal source review, 2026-09-08, anchored to published `32cd4235e22a6f7d456c3100d87fa8abd89475cd` plus the preserved working tree. Levi requested a deeper audit after false wall picking and bed overlap, followed by a concrete module plan. This is a current repair/migration contract. The larger [architecture plan](architecture-implementation-plan.md) and its simulation/world/living-system records describe later consumers.

The newer [controls floor-priority recut](controls-floor-priority-recut.md) now
owns ordering: controls first, then one deleted-old-branch wood+herb transfer
owner before brewing completion. [Unified work algebra](unified-work-algebra-recut.md)
is the source-of-truth recut; vertical/tower and cat-surface work remain future.
The settled [furniture contact and navigation decision](furniture-contact-and-navigation-decision.md)
now supplies the bed contact/exit policy and its caller boundary; its supporting
bed-contact review remains ignored evidence.
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

Unify the genuinely repeated IndexedDB commit mechanics only after preserving the distinct `save` versus explicit replacement policies. Existing v1–v6 migration/recovery must remain legal through each behavior-neutral extraction. Loading an old valid save does not automatically rewrite the durable slot. New material/support semantics require an explicit next schema and migration; do not call a semantic change a refactor.

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
