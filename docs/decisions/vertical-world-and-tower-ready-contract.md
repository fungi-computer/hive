# Vertical world, companion towers and traversal contract

The settled [furniture contact and navigation decision](furniture-contact-and-navigation-decision.md)
is the newer bed/contact precedence for this vertical seam: preserve acyclic whole
sprites where valid, and split only a demonstrated interleaving or cycle.

Read-only native architecture study for Astra, 2026-09-08. Source was read at published HEAD `32cd4235e22a6f7d456c3100d87fa8abd89475cd` with Delivery's valuable current working tree intact. The current dirty `orders.ts` already passes state to Go preflight/commit; that repair remains Delivery-owned. This note does not reopen it, run tests, change production, select final planet dimensions or authorize a larger live map.

The immediate design need is a cat following a witch through a tower with more than one stair connection. Levi subsequently adds cats jumping onto wall tops and walking along them. Digging, perches, jumps and spiral stairs are consumers of the same surface/traversal contract. None should require replacing one hardcoded `Upper` branch with a large switch over every floor number.

## Eight exact source recommendations

| Source anchor, at read time                                                                                                                                                 | Current assumption                                                                                                                                                                      | Concrete replacement boundary                                                                                                                                                                                                                                                                         |
| --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `world.js:23 inside`, `:36 stairCells`, `:43 stairLanding`, `:48 stairHeadroom`, `:100 upperSurface`, `:109 topologyNeighbors`, `:121 blockedCells`                         | Legal levels are 0/1; stairs always originate 0 and land 1; only the first finished stair contributes an edge; every level 1 cell is scanned and blocked unless supported.              | Separate address validity, resident data availability and surface standability. Derive all explicit connections from providers indexed by endpoint. Query the requested surface/clearance rather than enumerate every possible air cell as blocked.                                                   |
| `movement.js:5 edgeTicks`, `:18 route`, `:61 walk`, `:81 visualPosition`                                                                                                    | Any level change costs 18 ticks, BFS optimizes edge count, an omitted state silently uses planar neighbors, and all motion is straight endpoint interpolation.                          | Required navigation context/profile; routes retain typed edge identities and their costs; nonnegative weighted shortest paths; traversal progress separate from stable supported landing identity; a curve sampler supplies actual rendered motion.                                                   |
| `construction.js:87 floorSupported`, `:109 crossLevelSurfaceConflict`, `:128 workPositions`, `:185 coverAt`, `:201 removalProblem`, `:285 placementProblem`, `:410 indoors` | Support/cover is 0↔1; one stair maximum; removal blocks on anything upstairs even if an alternative connection could exist; only upstairs gets special work approaches/enclosure logic. | Pure placed geometry plus distinct support, cover, clearance, work-access and removal queries at an arbitrary datum. Connectivity loss and structural support loss are different results. Preserve compatibility rules until explicitly migrated.                                                     |
| `clearing.ts:61 advanceCat`                                                                                                                                                 | Plans without topology; sleep proximity checks horizontal distance but not level; follows hardcoded Rowan; basic cat is separate from actor records.                                    | Give this existing body an explicit cat movement profile and target-body reference; plan through the same navigator. Sleep adjacency requires compatible supported elevation/contact, not merely matching x/z. No need to migrate every animal into a generic actor system to fix the companion.      |
| `model.ts:8 Cell`, `:99 Body`, `:154 Site`, `:166 Clearing.cat`                                                                                                             | `level:number` is physically a storey but unbranded; route is `Cell[]` without edge identity; `leg` cannot identify a particular link/curve when two links share endpoints.             | Named coordinate units and a migration descriptor; explicit `RouteStep`/active traversal carrying provider/edge identity, definition revision and bounded progress. Keep task, goods and companion identity separate from the navigation representation.                                              |
| `persistence.ts:795 checkGroundCell`, `:855 checkCellsAndTreeProgress`, `:884 checkSiteTopology`, `:1006 checkActorPaths`                                                   | Cat and its entire path must remain level 0; more than one stair is rejected; support/headroom floors are specifically 1; only actors receive topology-edge validation.                 | Reuse a body/path validator for human and cat with their actual profile and surface rules. Validate every link, endpoint, active traversal and occupancy obligation under the versioned world geometry. Migrate existing v1–v6 paths unambiguously; preserve no-rewrite-on-load behavior.             |
| `art/scale.js:5 STOREY_HEIGHT`, `:23 project`, `:33 projectCell`; `camera.js:35 project`, `:39 cell`                                                                        | Projection usefully separates 2.16 geometry units per storey, but derives horizontal origin from fixed SIZE and inverse picking assumes one selected plane.                             | One metric transform converts explicit simulation height to geometry; camera-local origin and selected-surface picking remain separate. Keep current accepted scale exactly through migration. A voxel is not silently 2.16 units tall merely because a storey currently is.                          |
| `hud.jsx:40 levelName`, `:1594 level-controls`, `:1844 tool action`; `keys.js:10 definitions`; `construction-view.js`/`view.js` level visibility callers                    | Ground/Upper labels and `[0,1]` controls; choosing floor forces 1, stair/herb/chop forces 0; no dedicated level key bindings; render context uses binary lower/upper predicates.        | Level navigation derives from bounded available/known layers; named up/down/focus-actor commands in the existing OpenTUI keymap; persistent tools follow an explicit working datum. Render/pick slice policy consumes arbitrary heights, with next/previous known layer and numeric elevation labels. |

Cat consequences must be joined: adding topology to its planner alone would create upstairs saves rejected by current validation. Removal must consider every relevant mobile body, including cat, plus active traversals and cargo/claims; current actor-only tests are insufficient once companions ascend. Existing helper/body reuse is enough initially; this is not a request for a new animal AI framework.

## Coordinates: address space is not the playable height

Hive's existing `x,z` are horizontal logical cells, Three uses geometric `y` for height, and `level` currently names a storey. Preserve those meanings explicitly until a versioned migration changes them. Choose descriptive types, not a new convention that calls horizontal z vertical in half the source.

```ts
type VoxelAddress = { space: SpaceId; x: CellX; z: CellZ; v: HeightStep };
type SurfaceRef = { space: SpaceId; id: SurfaceId };
type StandPoint = { surface: SurfaceRef; slot: StandSlotId };
type SurfaceGeometry = {
  support: EntityId | TerrainFeatureId;
  anchor: VoxelAddress;
  standingRegion: FootRegion;
  height: FixedGeometryHeight;
};
type VerticalMetric = {
  version: number;
  lattice: "storey" | "excavation";
  geometryUnitsPerStep: number;
  stepsPerStorey: number;
  origin: number;
};
// A voxel at v occupies the interval [v, v + 1).
// Its floor and a narrow wall top may be different surfaces at the same anchor.
```

These sketches express distinct surface/volume queries; they do not mandate dual authoritative positions for one actor. The actor owns a stand-point reference or an active traversal, and its visible/collision position is derived from that geometry. A surface ID is stable provider identity plus a defined face/section; it is not just `cellKey`. Floor and wall top can share a voxel anchor while remaining different navigation nodes. A narrow wall's standing region must not become the whole cell. First perch positions can be authored stable slots along a strip, joined by legal walk edges, without introducing free-form continuous navmesh locations everywhere.

Surface geometry is derived from canonical provider placement/definition, not a second mutable saved height/occupancy list. Its height uses canonical fixed-point geometry precision declared by the world metric, allowing fractional storey/voxel heights without float-equality IDs. Voxel indexing, surface identity, physical height and the working-level UI are distinct. Choose precision that preserves existing 2.16 art datums exactly and is adequate for authored wall tops; the draft does not pick a global precision constant before that check. A given height may align with a storey, but a perch need not. Queries and collision convert through the same metric rather than rounding a wall top down onto its floor.

First tower extraction may retain the existing storey lattice with `stepsPerStorey=1`, geometry 2.16 and origin 0. It must permit integer negative/positive anchor addresses at the API boundary while the current world's configured legal/known bounds remain 0/1 until its actual follow-on fixture is accepted. Do not expand `inside` and assume that unknown levels became generated solid ground.

Before excavation, compare a small set of vertical resolutions against art, stairs, clearance and fluid memory: for example 2, 3 or 4 excavation steps per existing 2.16-unit storey. These are experiment candidates, not final sizes or real-world meters. They are anisotropic voxels if horizontal pitch remains 1 geometry unit. If cubic voxels are desired, that is a different explicit unit/art decision; do not claim an anisotropic lattice is cubic. The selected mapping must convert all old storey addresses, floor/roof datums, active traversal progress and carried locations exactly under one saved metric version.

For a tower proof, levels 0/1/2 are enough to defeat all current binary/single-link assumptions. A separate signed-address diagnostic can cover negative/zero/positive chunk boundaries; excavation gameplay can begin with a very small vertical band around one existing home. Neither says the planet is three storeys tall. Keep supported address integers within a documented safe range and reject overflow before hashing/allocation; configure generated/playable bounds separately. Final depth, sky height and eventual planet topology require measured storage, visibility and simulation results, not an arbitrarily huge constant here.

An atmosphere room, a navigation node and a solid voxel are different: floors can provide a thin walking/cover surface without filling the entire air cell; pipes and conduits can later occupy authored subcell geometry with excavation/backfill rules. Do not force every prop or floor into a full solid block just because terrain uses voxels.

## One surface graph, explicit connection providers

Navigation nodes are places a body can stand under its profile: a real supported region plus sufficient clearance. Ordinary adjacent movement is derived from neighboring compatible surfaces. Joined wall-top strips can expose narrow perches and connections; having the same cell anchor does not connect them to the floor. No navigation node is allocated for every empty vertical voxel. Stairs, ramps and bounded jumps contribute explicit edges; a site can contribute several directed edges. All providers at an endpoint are considered, not `find(firstStair)`.

```ts
type TraversalEdge = {
  id: EdgeId; provider: EntityId | TerrainFeatureId;
  from: StandPoint; to: StandPoint;
  kind: "walk" | "ramp" | "stairs" | "jump";
  definition: DefinitionRef;
  passage: PassageRef;                  // clearance/swept geometry
  requirements: TraversalRequirements;
};
type RouteStep = { edge: EdgeId; from: StandPoint; to: StandPoint };
type ActiveTraversal = {
  step: RouteStep;
  definition: DefinitionRef;
  profileRevision: ProfileRevision;
  elapsedTicks: number;
  durationTicks: number;
};
findRoute(navigationContext, from, to, movementProfile): RouteResult;
```

Persist site/terrain facts and active obligations; graph/index caches are derived under topology and profile revisions. A stable edge identity can be provider ID plus a connection slot, with compatible definition/version checks. Merely persisting endpoints is insufficient when two different connections share them or only one accepts a loaded animal. `RouteResult` distinguishes found, unreachable, needs-data and budget-exhausted/needs-work; an unloaded stair endpoint is not a proven dead end.

Active traversal pins the accepted profile/load envelope and its duration rule. Ordinary equipment/load changes that would invalidate clearance wait for landing; they do not reshape an airborne actor in place. Restore checks definition/profile availability, valid positive duration and bounded elapsed progress rather than trusting arbitrary saved timing. No client or visual pose chooses a shorter crossing duration.

Traversal cost depends on edge length/rise, chosen mode and the body's profile/load. Current 6-tick walk versus 18-tick stair already makes shortest edge count different from shortest time. First multi-link implementation can use Dijkstra or an A* whose heuristic is proved admissible for its actual edges; zero heuristic is the safe baseline. Do not retain Manhattan-only heuristics unchanged when a connection can move several cells cheaply. Existing optimizer receives actual summed route cost from the same edges movement later follows.

Direction belongs to an edge. Create two directed edges when a passage is bidirectional; do not infer reverse legality from the existence of a forward edge. Requirements can differ for up/down traversal. A ladder/drop/teleport is not admitted under an arbitrary `level !== next.level` branch. Add each later kind through an exhaustive handler and explicit physical/time semantics.

This decomposition has established precedent in Recast/Detour's [explicit endpoint connections](https://recastnav.com/structdtOffMeshConnection.html) and [query eligibility/traversal cost interface](https://recastnav.com/classdtQueryFilter.html). Those primary API references were opened in this study. They support the separation of connectivity from filter/cost, not an adoption of Recast or any guarantee about Hive's jump clearance, motion, saving or collision. A small surface graph can use these ideas without replacing the existing game with a navmesh library.

## Cat, human and loaded-animal capabilities

Use a small immutable profile compiled from the body and actual carried/equipped load: supported movement kinds, clearance height/width, support footprint and balance requirements, maximum step/rise/run and jump/drop envelope, and costs. The profile must be applied at planning, command admission, work approach and movement revalidation. Cat and human initially both use ordinary accepted stairs; neither gains ladder climbing or flight implicitly. A cat may balance on a reviewed narrow top that cannot support the stance of a person or loaded donkey. A pack animal needs an authored width/turning/load envelope and ordinarily may accept a wide ramp while rejecting a narrow spiral. That rule belongs to measured/art-reviewed passage geometry, not a species-name string hidden in the pathfinder.

The cat can use the same surface graph with a smaller body profile while retaining its existing lightweight follow/rest policy. Its target's supported location matters. Sleep adjacency must account for compatible reachable surfaces/contact, not only cell level and x/z distance: a cat on a high wall above a sleeping person is not automatically beside the bed. The first fix follows the existing bound companion target; future generated familiar identity is a separate record migration. Narrow passages may permit a cat and refuse a laden person, but passage traffic/collision need only be modeled when the game actually supports it. Do not accidentally promise crowd physics from profile filtering.

Before assignment, haul candidates must query the current profile's route to the source and the proposed loaded profile's route from source to destination/work access. An empty-handed brewer reaching a pile does not prove a log or keg fits back through a narrow spiral. Revalidate the loaded route/clearance and destination at pickup before atomically moving the goods; failure leaves stock in its current location and returns the job to a named waiting/replan state. Later topology or load changes invalidate affected future steps and use the same interruption/material owner. The actual matched candidate cost sums these two profile-specific routes through existing libcolony matching, rather than calling a second cargo pathfinder.

### Bounded wall-top jumping

Candidate jumps come from a spatial query over nearby exposed support regions inside a conservative envelope containing every jump the current profile could make. Enumerate and validate that envelope in deterministic order under a resumable operation budget; persist or reconstruct the query cursor consistently and cache eligibility by source/target surface geometry revision and profile/load revision. A fast shortlist can prioritize checks, but cannot discard unexplored viable edges and then report unreachable. Until the relevant search frontier and candidate envelopes are exhausted, return explicit budget-exhausted/needs-work with continuation, or needs-data for unavailable geometry. A found route may be valid before an optimal-cost claim is established; state that distinction if the scheduler accepts a bounded approximation. Topology/profile changes invalidate affected continuation/results. There is no giant per-cell cat graph or all-to-all jump graph over every wall in the world. Generate candidates on demand in the resident navigation neighborhood.

A jump needs an actual supported takeoff slot, reachable landing region large enough for the body's footprint, permitted rise/gap/drop, headroom at both ends and a conservative collision-free swept passage. Use an authored bounded trajectory family/velocity constraint and its corresponding cost/time; avoid extrapolating a generic hop animation into an arbitrary jump. Check solid geometry via local broad phase and a bounded swept-volume method or conservative precomputed envelopes, not just empty endpoints. A thin ceiling or intervening wall must reject the jump. Immediately before entering the active edge, revalidate against current shared-body occupancy, load and topology, then atomically reserve this edge's landing/support and intersected corridor before motion begins. Whole-route planning or initial command admission does not reserve every future landing. Other bodies' movement and structural edits consult those active reservations under the same compatibility rules; arrival atomically replaces the reservation with ordinary supported occupancy and releases the traversed corridor. Two incompatible claims cannot both settle. An up-jump and a down-jump are separately validated.

Active traversal tick/progress and the chosen trajectory are authoritative simulation facts once collision and edit admission depend on them. Pixi samples that same trajectory for presentation; it cannot secretly adjust it to hide clipping. Voluntary build/deconstruct edits intersecting active corridor or landing wait until arrival; future unused route edges invalidate/replan. Do not lock an entire planned path forever. Forced collapse/combat changing the passage while airborne requires an explicit falling/rescue transition later; the initial contract makes no no-clipping guarantee for those unsupported destructive interactions.

First wall-top proof adds one low reachable wall, a joined narrow strip and a safe return route; a deliberately too-high wall, blocked ceiling and occupied landing reject. The cat can jump up, walk the actual top, return down and resume following while a loaded donkey/profile refuses the narrow route. Removal waits for occupied supports/active transit and is permitted after the cat reaches a safe surface. Save/reload preserves the exact surface ID or active jump and progress; it must never reinterpret the perch as a ground position. This is a separate small follow-on inside the companion/tower work, not an extra gate on the current picking/Go repair.

## Straight and spiral motion share endpoints, not shapes

A straight ramp definition provides its placed lower/upper landing, complete run footprint and swept headroom volume relative to `site.level`/height datum. The current 3-cell run and 18 ticks remain the legacy definition. A spiral definition provides landings, turning direction, central post/rail geometry, tread path and required openings. Its visual curve cannot be a linear interpolation between two cells: that would cut through the central column or appear to float outside the stairs.

Traversal sampling is deterministic from the same definition and authoritative progress, for example a parameterized polyline/helix with explicit endpoint corrections. Constant-speed sampling should use precomputed cumulative arc lengths or a defined authored timing table, not assume curve parameter t is uniform distance. Position and tangent drive the visual body and facing. A standing body references a stable supported landing/slot whose geometry may have fractional height; a moving body references its active edge/progress. The renderer never writes interpolated logical levels back into saved cells.

The curve is not merely decoration when its swept passage/clearance has physical meaning. Placement/removal checks and future projectile queries must not see an in-flight actor only at its stale origin cell. Expose active traversal occupancy under the navigation owner. A full 3D continuous rigid-body solver is unnecessary for this bounded case: an authored passage volume/segment envelope can conservatively reserve structural clearance.

Future interruption rule proposal: once a body enters a stair edge, ordinary cancel/Draft/reassignment requests finish that bounded edge to its safe landing before dropping cargo/releasing the work obligation. The body can then hold or replan; it never drops a duplicated bundle halfway into a wall. This is a visible future gameplay choice and must be explicitly accepted in that implementation brief, not silently changed during a render refactor. The current Draft contract remains unchanged by this plan or the immediate controls repair. At active edge entry immediately before motion, recheck landing/edge validity and shared-body occupancy and reserve only that traversal against incompatible movement or structural change. Deconstruction or planned construction waits for active transit to clear. Destructive collapse/fire breaking an occupied connection needs a separate forced-fall/rescue rule; it remains unsupported in the first tower/spiral packet.

Future path segments need not permanently reserve the entire tower. Topology changes invalidate/replan affected unentered edges. With multiple stairs, removing one should evaluate real support and alternative connectivity/obligations, not reject because any upstairs item exists. First safe rule can block removal if it would strand affected actors/cat or outstanding access obligations; it must allow a surviving alternative link after the active segment clears. Show the precise reason.

## Signed vertical chunks and active work

Adopt the existing worldgen contract's immutable base plus durable patches and live state. For a candidate 16³ voxel brick:

```text
brickV = floorDiv(v,16)
localV = floorMod(v,16)       // always 0..15
v=-1 -> brickV=-1,localV=15; v=0 -> brickV=0,localV=0
```

The same signed treatment applies horizontally. A 16³ uint16 material brick is 8 KiB before metadata; optional active fields must be budgeted separately. Untouched uniform rock/air can remain procedural or compact runs until queries/edits justify decoding; edited sparse cells or a dense brick are chosen by measured occupancy/change density. A deeply dug shaft cannot allocate every field for the entire column above and below it. Generation recipe/version/metric binds every patch so restored edits do not refer to a different geology.

A material edit invalidates its local surface/clearance, connected room/flow neighborhood, relevant route edges and render parts. Keep explicit revision/dirty sets and spatial endpoint indexes; no global tick over all levels, cells, stairs or possible air. Active actors, processes, changing water/heat boundaries and unresolved transfers pin the required working set. Camera slicing can stop drawing a floor but does not pause its brewing job or unpin a cat in transit. Dormant unchanging rock has no simulation update.

Long paths search coarse connected surface/portal regions then refine the loaded corridor when scale requires it. Missing vertical neighbors return needs-data. Active traversals and dirty geometry cannot be evicted until their coherent region checkpoint is committed; unloading one endpoint cannot silently erase the connection. A chunk border is storage locality, not a movement portal or visible wall. Actual magical realm portals remain separately authorized transfer edges; do not let a local stair graph bypass realm/custody rules.

## Three bounded proof packets

### A. Companion tower and multiple ordinary links

First sub-checkpoint on current 0/1: cat plans the same real stair topology as humans, reaches Rowan's supported landing, sleeps only at compatible surface/contact, and restores the exact valid paused cat/path state. Human Go repair proceeds independently; changing cat validation is joined with cat behavior, not source-only half-migration.

Then use a compact three-datum tower at 0/1/2, at least two different stair connections, and an alternate path to one landing. Keep accepted straight art and current resource economics. All connections are discoverable regardless of site insertion order. Human work/haul and cat following cross them; actual route time matches edge costs; removing an unused redundant connection preserves access, removing an occupied/sole necessary connection waits with a reason. Save mid-edge and resume once at the same progress with the same carried ID/amount. Old v1–v6 ground/two-level saves remain valid under the explicit migration. A validated source fixture can isolate topology; one short physical UI trace demonstrates level switching and actual traversal. Do not claim the source fixture earned resources in gameplay. If the compact public-command fixture exceeds available wood, recut the fixture or record legitimate finite acquisition—never grant stock in the browser proof. The wall-top/jump micro-fixture above is a distinct subsequent sub-checkpoint; do not roll tower, airborne collision and all new art into one oversized proof.

### B. One useful excavation and signed restore

After a vertical metric and terrain-material unit decision, expose a tiny dig order with a legal adjacent work position and supported exit. Remove a finite amount from one identified terrain cell and create exactly the declared recoverable material plus any explicit waste sink. Repeating/resuming the same completion cannot mint another pile. Removing support under a body/connection is blocked in this first packet; collapse is not smuggled in through digging. Reveal the resulting open volume and valid standing surfaces, with headroom appropriate for cat versus human. A hole is not automatically a stair or a floor.

Prove a negative/zero vertical brick boundary through save, actual decoded eviction, regeneration and patch restore; a removed solid stays removed. Interrupt hauling and preserve output identity. Unknown neighboring terrain reports needs-data. A failed save preserves the previous checkpoint and does not clear newer edits. UI excavation slice/picking uses the chosen metric and cannot select an unrelated upper wall. Water ingress, gas pressure and cave-in consequences are separate later consumers, although the opening/face topology is ready for them.

### C. One original spiral stair

After Astra's original geometry/passages review, add one spiral connection definition over the existing traversal API. Review native/game-scale endpoints, tangents, swept headroom and both climbing directions. No copied straight-line motion or generic all-species permission. A human and cat ascend/descend with correct facing and contact; a deliberately oversized loaded profile rejects it and uses an available wider alternative. Closing headroom rejects construction/admission rather than clipping a body. Save at several representative progress points, resume the same edge, and show bounded interruption at the safe landing with exact cargo custody. Two spirals and a straight ramp coexist without a single-stair branch or insertion-order dependence. No combat, crowd traffic, free climbing or infinite tower claim.

## Delivery boundary

This is readiness architecture, not a demand to interrupt the current picking/Go repair, brewing preparation or serial publication. Required navigation context and pure geometry boundaries in the current module plan should accommodate these future consumers now. A tower follow-on is one coupled world/movement/construction/save/caller owner; isolated spiral art and signed-brick research may proceed separately when useful. Root reviews actual product/unit conflicts and original art. Delivery retains ordinary implementation review, exact file custody and sole Git/dist/proof/deploy ownership.

Stop and recut if the first tower requires a universal physics engine, a floor record for every possible air cell, a whole-world route rebuild each tick, or a second mutable graph that competes with sites/terrain. The success criterion is a cat and worker reliably using several real connections with recoverable state—not the number of newly named modules or the largest declared height constant.

## Root disposition and cross-system constraints

Astra personally read the full source study, its corrected jump-search/reservation contract, and the immediate world/movement/body/cat/construction-removal/save/art-scale callers. Accepted as future architecture direction. The source findings describe the read-time two-level implementation; Delivery has since published the independent Go/picking correction at `d57d02e`. No cat, digging, jump or spiral runtime is claimed here. Controls remain the immediate playable priority, and the unified work recut remains the required completion contract before brewing.

Do not bake a final world height into the navigation API. The first three-storey fixture tests topology; the later tiny excavation band tests negative addresses. Before committing a digging wire schema, choose the vertical metric by comparing actual door/headroom, stair geometry, dig effort and active-field memory at the candidate resolutions. Record finite per-space bounds with that metric. A large supported integer address range is neither an allocation instruction nor evidence that every depth has fun content. New view controls should consume known/available layers without requiring all the terrain in a column to be generated, and selecting a higher slice must not reveal unexplored caves through fog of war.

Share placed world geometry, then derive purpose-specific queries. Navigation asks whether a particular body and payload fit a supported passage; structural support asks what bears a load; water/smoke ask about openings, free volume and permeability; visibility asks about occlusion. These do not share a universal `blocked` boolean or one mutable graph. A floor can support feet while sealing the space below, a narrow opening can pass smoke while refusing a person, and a wall can block movement below while supporting a cat above. All derived results identify the provider geometry revision so a dig/build/remove invalidates the appropriate consumers once.

Movement eligibility caches should be shareable by equivalent geometry/ability/load profiles, rather than rebuilt per named cat or person. Keep actor-specific condition, policy and cost decisions distinct where they do not alter geometric eligibility. Spend route/jump work only for active demands and changed topology, with bounded resumable searches; do not run fresh three-dimensional searches for every creature on every rendered frame. The eventual scale proof must exercise active routes, narrow passages and edits at several floors, not merely spawn idle actors.

Keep the presentation faithful to the same placed surfaces and traversal progress. Existing wall geometry reaches the accepted 2.16 datum, but its narrow top is not the whole tile. A perch declaration and any jump pose need Astra's native/game-scale review through the established Three bake and Pixi caller. This reserves original art review for an actual changed-art packet; it does not create another approval gate for unrelated controls, source cleanup or ordinary Delivery fixes.
