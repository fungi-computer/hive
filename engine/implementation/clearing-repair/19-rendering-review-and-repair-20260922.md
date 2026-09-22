# Rendering review and repair — September 22, 2026

Reviewed source: `337e1f03d226b9a173062cedf19c96638383988c`, owned
`living-terrain-integration` worktree. This is the current rendering repair plan.
It supersedes conflicting rendering instructions in packets 14–17. Packet 18's
accepted whole-picture approximation remains binding. Historical proofs remain
evidence at their recorded source, not claims about today's hosted preview.

## Decision

Keep Three authoring → checked low-resolution art → client scene owner → Pixi.
Keep native world authority and region delivery over WebSockets. The camera
requests world-space regions; the client prepares presentation. The DO retains a
shared physical world and disposable per-connection delivery state, never a
separate simulation or draw order for each camera.

The demonstrated problems are repeated computation and serialized startup.
Small camera pans already reuse prepared coverage and change the parent transform.
Preserve that path. Receiving a small patch or moving one actor still causes too
much whole-scene work. Fix those owners before changing representation.

Levi accepts roughly correct whole pictures where images genuinely interleave.
Do not restart universal exact splitting, baked per-pixel depth, a Three runtime,
or bed-specific rules. Preserve full upright grass and its supported short
variant. Packet 17/early packet 18 descriptions of flattened/clipped grass are
historical; they do not authorize clipping the restored blades.

## Actual end-to-end ownership

### September 22 priority correction: responsive live camera and cuts

Levi reports that camera movement remains unusably slow and cut behavior cannot
be assessed through the stalls. Startup improvement is not playable acceptance.
The next repair owns the complete interaction/frame path, before further native
sampling or initial-observation optimization.

At `5de88220`, pan/zoom synchronously invoke the full `draw()`; terrain `position()`
mixes parent transforms with demand and potentially large record preparation.
Recorded 104 ms preparation plus 22/34 ms topology steps establish a blocking-work
problem. Moving unchanged work into RAF would still block input.

One client scene-preparation owner must:

- Apply camera state/parent transforms without invoking full scene preparation
  from input handlers. Coalesce input, ticker and received-patch invalidations.
- Retain local geometry/relations as checkpoint B specifies. Give unavoidable
  preparation, topology and buffer work explicit per-turn budgets. Work that
  cannot yield at that budget must run in a client presentation worker. A worker
  owns disposable presentation only, never simulation or camera-dependent DO state.
- Stage bounded complete patches/cut snapshots, cancel obsolete view jobs, and
  prevent ongoing actor animation from starving a pending terrain rebuild.
- Keep the last coherent scene responsive until replacement publication. Commit
  displays, order, picking and presented cut together. Requested cut and displayed
  cut are distinct while pending; commands cannot silently use a different layer
  from the one shown. Pending terrain remains unknown.
- Prove input-to-painted movement, worst main-thread stalls and requested-cut-to-
  displayed-cut latency with working actors, arriving regions, continuous input
  and repeated cut supersession. Zero work in a paused small pan is insufficient.
  Separate received, prepared, submitted and painted coverage.

Target smooth 60 Hz camera motion on a hardware browser at normal viewport/zoom;
record actual frame/input latency and machine. Shared-host software rendering can
prove work bounds and correctness, not that hardware target. If rendering itself
dominates after preparation is bounded, measure draw/upload/fill costs before
accepting the repair. No startup-only milestone completes this interaction work.

| Stage | Existing owner | Finding |
| --- | --- | --- |
| Physical facts | `engine/kernel/src/terrain.rs`, `generation.rs`, committed Region/SessionResident | One physical authority; cold per-cell sampling repeats column generation. |
| World-space presentation | `runtime/terrain-presentation.ts`, `terrain-region-exposure.js` | Camera-independent exposed faces/support; buried reads preserve caves; any terrain revision clears all region cache entries. |
| Delivery | `runtime/terrain-region-stream.ts`, `terrain-region-client.ts`, `remote-client.ts`, `tools/public-engine-host/worker.ts` | Complete socket patches with cancellation and bounded credits already work. |
| Residency/demand | `client/terrain-region-cache.js`, `camera-coverage-owner.js`, `terrain-visibility.js` | Bounded cache and padded viewport; conservative full-height prisms over-request some regions; small-pan retention works. |
| Art | `scripts/export-static-art.mjs`, `src/art/static-pack.js`, `living-terrain-pack.js` | Checked anchors/bounds/silhouettes/parts; terrain then static packs load serially before runtime start. |
| Scene | `client/world-scene-owner.js`, `cut-terrain-layer.js`, `actor-presentation-owner.js` | One lifecycle; patch publication still walks resident terrain; actor preparation covers all supplied subjects. |
| Ordering/picking | `client/spatial-scene-owner.js`, `spatial-draw-order.js`, `voxel-draw-picking.js` | Local candidate comparisons; changed actors still merge statics, copy edges and sort the combined graph. |
| Pixi submission | `client/terrain-face-batches.js` | Correct consecutive-only batching; planning/signatures/uploads can revisit unchanged runs. |

Runtime/client paths above are relative to `engine/src/`; sibling filenames share
the preceding directory. Follow real callers. These are existing responsibilities,
not a proposed layer of forwarding wrappers.

Colony Performance also observes a fixed 4,096-column terrain window before camera
delivery. The initial v6 observation is about 512 KB; regions repeat support facts.
Level range, placement, structure picking and cover consume those observations.
Removal requires migrating those consumers together, not dropping a field.

## Evidence and limits

Authoritative v6 artifact: `.botanical/terrain-loading-v6-composited/REPORT.json`;
context: [loading proof](../../../tools/public-engine-host/TERRAIN-LOADING-BROWSER-PROOF.md).
The stationary case still fails:

| Measure | Recorded result |
| --- | --- |
| Useful ground | Driver observes 5.092 s from navigation; page sample 5.040 s |
| Exact visible completion | Page clock 8.576 s; driver observes complete samples at 8.658 s |
| Useful/visible after assets and runtime ready | 1.045 s / 4.581 s; existing targets 1 s / 3 s |
| Padding complete | Page clock 11.272 s; 7.276 s after readiness |
| Delivery | 102 patches; 2,158,727 bytes; first patch 202.5 ms after request; zero HTTP terrain requests |
| Accumulated scene compilation / applying order | 3,340.9 ms / 407.1 ms; 33 topology builds |

Compilation overlaps loading; do not add these totals to elapsed time. Earlier
proof prose's 1.097 s useful latency mixed driver/page clocks. The report's
same-clock value is 1.045 s, still failing. Both observations remain evidence.

In `.botanical/camera-terrain-v6-far/REPORT.json`, one nine-dynamic update needs
93 face comparisons / 0.7 ms candidate work, followed by 6.3 ms preparation and
7.3 ms topology across 6,786 records. A zoomed publication adds seven statics to
16,767 but spends 104.2 ms preparing, 22.2 ms sorting statics and another 33.6 ms
sorting the combined scene. These are individual samples, not percentiles/FPS.

The exact 102-region native benchmark reads 508,313 material cells and 10,200
surface columns for 16,809 faces. Cold total is about 1.46 s, with 1.05–1.07 s in
native queries. `generator.sample()` recomputes bed level at each Y;
`sample_brick()` already demonstrates column reuse. The isolated `bf8de50f`
batch768 experiment reduces crossings 2,035 → 714 but paired runs do not improve
total time. Do not integrate it as a performance fix.

V6 camera artifacts prove small-pan zero-work counters, terrain beyond the old
64×64 window, cuts, minimum zoom, bounded residency and identical paused return
images. Earlier headless-shell measurements had disabled compositing and severe
browser readback cost. Use full Chromium and record enabled compositing; the
available renderer remains software. Hardware smoothness/population capacity is
unproven. Old v5 signature costs are partly fixed by `dd6d6e29`, not untouched bugs.

No current Fallow report for these rendering files was available; `fallow` is not
on PATH. Old whole-game reports do not establish a clean current audit. Startup
in `client.js` and the ordering compiler remain source-review hotspots.

## Laws owned by the implementation

1. Camera, interpolation, cache misses and painting never advance simulation,
   grant support, create stock or activate work. Visual bounds are not collision.
2. Stable subject/part identity survives redraw. Patches are complete for region,
   epoch, revision and cut. Empty differs from unknown. Late responses cannot
   publish into a newer view; cancellation cannot acknowledge an unfinished patch.
3. Anchors, physical facing, camera quarter-turn, projection, support and picking
   share coordinates. Rotation preserves world focus, selection and physical time.
4. Preserve established geometric comparison semantics and mandatory support
   precedence; acyclic relations remain satisfied. Whole-picture overlap/cycle
   recovery is explicit approximation and may leave visual constraints unsatisfied.
   Invalid contacts and support cycles remain errors; keep approximation diagnostics.
5. One published order and current hit geometry serve painting and picking.
   Texture-only refresh does not imply resorting. A batch crosses no intervening
   piece that must paint between its members.
6. Four-cell dual-grid cover uses same-level facts/halo. Full/short grass remains
   data over one mechanism with upright pixels. Gameplay mowing must change
   native cover through work; a short-art fixture does not prove mowing exists.
7. Reset/reconnect/eviction rebuild disposable presentation from committed facts.
   Cleanup owns resources; no old scene references survive disposal.
8. Identical facts, projection and final resident set give identical order/pixels/
   picks after different arrival orders, full versus incremental rebuild and
   pan-away/return. Partial culling preserves needed occluder/support dependencies.
   Arbitrary cyclic art remains approximate; universal membership-independent
   exact visibility is not promised.

## Bounded implementation sequence

### A. Overlap independent startup work

One writer owns `client.js` startup and a narrow art lifetime operation if needed.
Load terrain/static packs concurrently. Once Pixi can safely host the scene,
subscribe before starting runtime; feed early facts into existing interpolation/
terrain owners and request camera regions while art loads. Install sprites only
after checked art is available. Keep assets ready, runtime ready and coverage
separate; interactive UI readiness may require both assets and runtime.

Own atomic pack handoff, failure and late completion in one operation. Successful
or late packs are disposed exactly once after failure/cancellation. Test early
cues, disposal during Pixi initialization and subscription cleanup. No second
observation cache or pause/resume trick to conceal startup.

Acceptance: independent delayed loaders overlap; either can fail; disposal before
and after initialization cannot leak or install into a dead scene. A real DO
browser shows a region request before art completion and records navigation-to-
ground. This removes a dependency; it alone does not promise latency gates pass.

### B. Retain relations and publish terrain changes once

One coupled writer owns spatial scene/compiler and its terrain record join.
Preserve current relation semantics initially, extending the existing owner.

First checkpoint: retain each dynamic piece and its incident relations. Recompute
only changed pieces' local candidates; remove old incident edges and update pairs
of changed dynamics once. Stage validation before commit. If identities, edge
sets and support precedence remain unchanged in an acyclic graph, refresh current
display/hit records without merging all statics or sorting topology. Geometry
changes need not change order. For approximate cycles, initially rerun the current
algorithm: moving center depths affect recovery even with identical edges.

On real edge changes, a full combined topology build is an acceptable first
checkpoint. Measure its frequency before adding local topology repair. Do not
freeze static total order and merely insert actors: independent statics can sort
`[a,b]`, while a new actor legally requires `b → actor → a`. No cycle is needed.
Current-source proof: guard `u3078`, invocation
`a3b9639980814c32a8dbf4bc5a86d01f`, exit 0.

Second checkpoint: `cut-terrain-layer` supplies added/removed/changed record
identities to that same owner. Retain unaffected proxies, spatial index and
adjacency. RAF coalescing already exists and does not bound the work in a callback.
Keep queued patch bytes within the residency budget; admit a bounded number of
records/preparation operations per turn, staging a large patch across turns if
needed. Publish only complete prepared patches, with visible-first progress.
Cancel staged obsolete work on epoch/cut/revision changes. Socket credit means
receipt into bounded cache, not completed rendering: report received coverage
and rendered coverage separately. Perform one
combined topology build when necessary; remove redundant static-only topology
from the production combined path. Keep the full compiler as a reference/query
consumer of the same relation rules, not another production policy.

The scene operation accepts facts/deltas and returns an ordered borrowed view,
changed display records and an apply-order decision. Callers never manipulate
internal maps/edges/reset flags. Rejected updates leave the last valid paint/pick
view intact. This includes display/hit changes: actor preparation currently
mutates shared Pixi objects before ordering validation, so staging only graph
maps is insufficient. Validate/stage the changed display state before committing
the published scene, and dispose rejected staging resources. Reset owns all
derived state.

Acceptance: crossing an occluder changes order; relation-preserving movement does
zero topology work; stationary pieces are not re-prepared; the bridging-static
case works; cycle policy is preserved; rejected deltas are atomic; terrain
publication sorts at most once. Require full-rebuild parity plus independent
original-art fixtures and real bed/bank/stair traversal. Parity alone is no oracle.

### C. Generate each column profile once per bounded read

One writer owns native sampling, WASM/KernelPort binding and the current
`TerrainPresentationOwner` consumer. Add a bounded spatial sample operation that
reuses generation per column and overlays edits through canonical terrain. Keep
face exposure at its present owner initially. No camera, artwork, whole-world
generation or heightfield-only shortcut; caves and overhangs remain supported.

Compare region/column sampling with existing page sampling on the same 102 keys.
Whole 16³ pages can overgenerate around 8×8 regions/halos. Require exact material/
face hashes, measured paired cold-total improvement and bounded temporary storage/
per-read work. Batch-constant changes alone already failed.

Localize producer invalidation from canonical changed-column history: invalidate
affected cores/halos and retain unrelated content. Reset/epoch/history loss clears
everything. Preserve response identity when serving unchanged content at a new
revision. Warm cache performs zero sampling; two clients share world facts with
independent delivery handles. Include signed/clipped boundaries, cuts and edits.

### D. Retire fixed-window startup projection through actual consumers

After A/B qualification, one writer owns observation schema/producer and all
consumers of initial terrain surfaces. Initial observations carry small demand
inputs: identity, bounds, materials, actors and required structure facts. Regional
delivery owns resident terrain support/cover. Move level range, picker and
placement together, explicitly distinguishing structure surfaces from terrain.

Version/reject unsupported formats as required; no legacy or parallel fast API.
Prove empty-world and occupied-world focus, DO/Worker parity and current-format
recovery. This changes read projection, not durable physical transaction ownership.

### E. Only measured residual cost justifies more changes

Bound actor presentation by viewport plus authored overhang and support/attachment
closure. Keep a maintained candidate index rather than scanning all world actors
every frame. This does not drop authoritative observations or pause offscreen work.

If run planning/uploads remain costly after B, retain unchanged consecutive runs
and rebuild affected runs. Regions cannot be flattened when actors interleave
with their banks/grass. Keep the painter small.

If full-height demand remains costly after C/D, expose inexpensive conservative
native bounds. Unknown bounds retain conservative demand; metadata cannot secretly
scan all fine cells. Map LOD is separate future work.

Startup and native sampling may be separate isolated lanes. Graph/delta and
schema/consumer changes each need one writer; integration/proof/release remain
serial. Review each first working shape before expanding it.

## Invalidation contract

| Change | Owned work | Reuse |
| --- | --- | --- |
| Pan inside margin | Parent transform | Facts, geometry, relations, order, buffers |
| Coverage crossing | Missing requests/cancellation and membership | Unchanged regions and local relations |
| Actor movement | Pose/hit geometry, incident candidates/edges | Unaffected static proxies/index/edges |
| Animation texture | Display/alpha-hit refresh | Order unless declared geometry changes |
| Terrain/cover edit | Changed columns, halo, cover/order dependencies | Unaffected regions/records |
| Quarter-turn | Client projection/view-art/order/demand | Physical state and reusable world-space patches |
| Cut change | Cut-keyed demand/faces/order | Physical state and facts valid across cut |
| Reset/load/epoch | Cancel reads, rebuild derived state | Checked immutable art |
| Dispose | Unsubscribe/cancel/release owned resources | No per-scene references |

## Actual reference source

Preserved OpenRCT2/OpenTTD clones were read at the immutable commits below. They
are mechanism comparisons, not dependencies or equivalent-workload benchmarks.

- [OpenRCT2 bounds sorting](https://github.com/OpenRCT2/OpenRCT2/blob/252987e921fa07587f8192d3a72ac17719938c20/src/openrct2/paint/Paint.cpp#L338-L374)
  uses [neighboring quadrants](https://github.com/OpenRCT2/OpenRCT2/blob/252987e921fa07587f8192d3a72ac17719938c20/src/openrct2/paint/Paint.cpp#L398-L424)
  to narrow comparisons; [its viewport warning](https://github.com/OpenRCT2/OpenRCT2/blob/252987e921fa07587f8192d3a72ac17719938c20/src/openrct2/interface/Viewport.cpp#L933-L962)
  explains sorting glitches from culling membership. Borrow bounded candidates
  and stable reconstruction, not a universal exact-geometry claim.
- [OpenTTD combined sprites](https://github.com/OpenTTD/OpenTTD/blob/c56e08d5c35a137cda2e063b05fbf7895d3cf554/src/viewport.cpp#L747-L778)
  prohibit internal interleaving. [Its sorter](https://github.com/OpenTTD/OpenTTD/blob/c56e08d5c35a137cda2e063b05fbf7895d3cf554/src/viewport.cpp#L1598-L1679)
  exploits near-order/spatial bounds with known ambiguous cases. Group inseparable
  attachments, not a bed plus occupant or all terrain/grass for convenience.
- [OpenRCT2 GPU depth](https://github.com/OpenRCT2/OpenRCT2/blob/252987e921fa07587f8192d3a72ac17719938c20/data/shaders/drawrect.vert#L37-L65)
  comes from [draw-command order](https://github.com/OpenRCT2/OpenRCT2/blob/252987e921fa07587f8192d3a72ac17719938c20/src/openrct2-ui/drawing/engines/opengl/OpenGLDrawingEngine.cpp#L970-L995),
  not recovered per-pixel source-model depth.
- [Minecraft Java networking](https://www.minecraft.net/en-us/article/minecraft-java-edition-1-20-2#network-optimizations)
  uses bounded chunk batches within client render distance, permitting play during
  loading. Borrow relevant incremental delivery. [Cloudflare's WebSocket path](https://developers.cloudflare.com/durable-objects/best-practices/websockets/)
  already supports our browser/DO use; transport replacement is not this repair.

Botanical's actual Watchdog (`packages/watchdog/src/index.ts` and
`internal/sqlite-store.ts` in Botanical-next) owns durable queued obligations and
transaction participation. Disposable camera/terrain reads are different. Preserve
Hive's committed resident read boundary; do not create a durable camera-job queue.

## Acceptance and stop rules

Use tests beside touched source: spatial scene/order, terrain cache/exposure,
camera coverage, batcher and remote/Worker wire laws. Guard automated proofs with
the prescribed 10-minute wrapper; retain failures. No dependency installation or
unrelated full-home traces.

Each checkpoint records source/build/backend identity and actual DO browser
navigation: assets ready, runtime ready, first request/patch, useful ground, exact
visible completion, padding. Retain 1 s/3 s readiness gates and navigation timing.
Never move readiness later or substitute a prewarmed socket test. Overlapping
startup may honestly expose greater post-ready latency while navigation improves.

Record preparation, changed candidates/relations, topology counts, apply time,
upload bytes, draw/mesh counts and heap/GPU residency separately. Preserve small-
pan zero-work checks. Exercise moving actors around original beds/banks/stairs;
unfinished/completed construction; four turns; cuts; full/short grass; matching
picking; rapid cold pan/cut supersession; eviction/return; reconnect/duplicate/
conflicting patches, slow receiver and cancellation. Two different client views
share physical facts and isolate delivery state.

Qualify 64/256 worlds with identical viewport/zoom and comparable content. Visible
work must not scale with total map area. Use 8 then 100 actually working actors;
separate server tick/path/state from client rendering. Idle actors do not prove
population capacity. 512/maximum-height stress follows the bounded viewport law;
caves/vertical edits remain included. Hardware smoothness still needs an actual
hardware run, separate from software-rendered correctness evidence.

Keep explicit existing caps: 256 requested/client-cached regions; 32 MiB client
serialized payload; 128 server patches / 4 MiB server payload; 512 KiB event;
eight outstanding patches; current mesh/spare caps. These are not total memory or
frame-time guarantees. Measure repeated travel/disposal and supported zoom/height;
report budget-limited coverage as such, not complete.

Accept A–D with their laws and relevant measured improvements. If B meets targets,
stop before speculative topology/buffer redesign. If C does not improve cold
production, do not ship it as a performance fix. Art changes, transport rewrites
and new frameworks do not replace passing the user-visible checks.

## Delivery status

The review/plan is source-grounded; the full camera/cut repair is not shipped.
Startup overlap is integrated as `5de88220` (lane `fe1fa714`): 15 lifecycle laws
and the build pass. A selected suite is 64/65; the sole tree-binding expectation
failure was independently reproduced on the unchanged baseline. Real-DO browser
evidence is recorded in the loading proof. One matched pair shows useful ground
7.754 → 5.798 s, but visible completion 9.817 → 10.029 s; both fail loading gates.
This is a removed startup dependency, not an interaction/performance completion.
Frontend files were locally served at the authorized origin; backend traffic was
real. No updated public preview was published; the old temporary tunnel expired.

Two independent source reviewers checked the plan. Their corrections are included:
the actual receiver path, explicit preparation/queue budgets, atomic display/hit
publication, the cycle approximation law and the stale README alpha instruction.
