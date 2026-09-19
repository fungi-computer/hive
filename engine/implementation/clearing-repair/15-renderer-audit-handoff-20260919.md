# Renderer audit and new-chat handoff — September 19, 2026

## Latest implementation checkpoint — read first

Implementation has advanced on `engine/living-terrain-integration-20260917` in
`/home/levi/src/hive-worktrees/living-terrain-integration`. Terrain retention
was reviewed and integrated as `6a565625`. The current working tree implements
client-local four-turn camera geometry, a retained ordered voxel draw stream
shared by painting and picking, exact original-art terrain alpha, world-sorted
placement guides and ghosts, and corrected floor/bed selected-plane input.
The original living-terrain PNG bytes remain unchanged; the maintained static
art exporter has rebuilt its atlas with four bed, roof, shelf and brewing-station
views, including process animation banks. Source acceptance and preview status
are recorded in the integration commit and release receipt; historical paragraphs
below describe earlier checkpoints.

Focused source tests pass (`run-u2368`, `u2372`, `u2376`, `u2379`, `u2384`,
`u2395`, `u2401`); the production Vite build passed `run-u2396`. Connected
browser proofs passed selection/pan/zoom/cut/chunk demand (`run-u2374`), floor
rectangle and bed plane (`run-u2380`), camera turns 0→1→2→3→0 with selection
and no unknown chunks (`run-u2387`, rendered capture `run-u2392`), and the
world-sorted placement preview regression (`run-u2398`), actor-owner rotation
and loaded four-view furniture art (`run-u2402`, `run-u2407`), and active floor
placement through rotation (`run-u2411`). Browser proof uses the
existing host library bundle through `LD_LIBRARY_PATH`; do not repeat the
historical claim that browser checks are unavailable. The broad client test
run `run-u2400` passed 224/228; three failures are extensionless TypeScript
imports in direct Node execution, and its fourth stale cover-support assertion
was corrected and re-proved in `run-u2401`.

The actor Pixi lifecycle now lives in `actor-presentation-owner.js`, and the
static pack contains 1958 checked textures. The bed/end/side and stair-rail
overlap limits remain a recorded advisory for focused rendered proof beyond the
first playable slice. The existing release
script deploys the backend, so it cannot be run under the current
no-backend-deploy boundary; inspect an appropriate client-only preview path
against the unchanged compatible backend after acceptance.

### Historical checkpoint below

Levi has clarified that draw preparation must be a **deep client-side engine
module**, and has requested camera rotation. Packet 15's new “Binding execution
contract” and “Bounded implementation sequence” are authoritative: server world
facts + checked art pack + local camera produce one client-owned ordered list and
shared picking. No per-camera server draw list or server camera state. First
rotation delivery is four quarter-turn views with matching art/projection/input.

The implementation checkout is still
`/home/levi/src/hive-worktrees/living-terrain-integration`, currently based on
`b5245e18`. Local compiler/retained-owner/cover edits made after the audit are
**unfinished experiments**, not accepted repairs. Inspect the exact working diff
before continuing. An initial direct test run passed 12 of 14 compiler/owner tests;
the failures included signed-zero trace instability and obsolete pass-order
expectations. A subsequent signed-zero correction has not yet been re-proved.
Cover support changes also need updated independent acceptance evidence. Neither
geometry correctness nor the requested deep client boundary is complete.

The isolated terrain lane has committed `09d5ed631ee8b79e97575897e0c2d6b4f82787d6`
on `engine/terrain-retention-20260919` in
`/home/levi/src/hive-worktrees/terrain-retention-20260919`. It reports 14 focused
tests passing under `run-u2366`, covering bounded demand service, chunk retention,
batch reuse and water metadata. It is **not yet reviewed or integrated**. Its water
records require the new `liquid-surface` compiler contract; review/integrate that
coupled contract together. Preserve both worktrees and all existing audit evidence.

The browser recipe below works on this host. Historical statements that browser
checks are unavailable do not apply. No new source acceptance or preview release
is claimed by this checkpoint. The historical pasteable goal below must be read
with the current client/deep-module/rotation contract in packet 15.

## Resumed audit — source and ownership checkpoint

Resumed at `8f6e37443a22e184bc2c7f60dbb8cc2b7a8a3093`. The two unfinished
picking files still match the SHA-256 values below. Production source, original
art and studies remain unchanged by this audit. Only this packet, packet 15 and
diagnostic evidence are being written; no deployment or native rebuild occurred.

Levi clarified the desired responsibility: retain useful metadata from the 3D
models, have the engine prepare an ordered world drawing list, and let Pixi paint
it. Packet 15 now explicitly owns that boundary. This is largely an existing
capability to finish: `parts.js`, `bakeMultipartStartup`, `static-authoring.js`
and `static-pack.js` already preserve placement, named part geometry, anchors and
alpha silhouettes. One engine presentation owner must consume them consistently.
It must run locally without giving the DO camera-specific work or putting Three in
gameplay. Physical capabilities still come from checked native/game definitions.

Additional independently reviewed findings:

- Water's unconditional final pass is contradicted by a same-camera-ray witness:
  water `(-.1,.27,.1)` and the nearer bank top `(.5613622305514584,.81,.7613622305514581)`
  project to the same pixel. The compiler emits bank then water. Blend mode must
  not override physical order. Packet 15 withdraws that pass requirement.
- Full compiler support admission is itself incomplete: shifting a stair occupant
  about 61.24 metres in each opposing horizontal axis preserves its traversal
  depth and is admitted. That is about 86.6 metres of lateral displacement, not
  an actual native simulation pose. Shared full/retained validation must check
  the actual support geometry, not only an interval in sorting keys.
- The current three-part stair is a bounded supported compound, not proof of a
  general multipart renderer. A bed's obstruction footprint likewise does not
  prove that last-contact insertion handles people outside both ends and sides.
- Real build guides and ghosts are in `transientLayer`, above the world;
  the synthetic stream guide fixture does not establish production integration.
- `prepareNewWorld()` destroys actor containers without calling multipart
  disposal. Parts are direct world-container children and survive the cache clear.
  Ordinary actor disappearance does dispose them. Audit this reset boundary in
  the renderer repair; do not claim a measured GPU leak from source alone.
- The checked version-1 creator document already exists. Join it to the existing
  bake/export owner. The native bed has construction/picking/reload consumers;
  no inspected Colony caller supplies sleeping/resting. Packet 15 now says what
  the first creator witness actually does.
- The existing `colony-performance.test.ts` already exercises productive tree
  work at 32/100/200 workers and measures step/save/observation. Extend its real
  scenarios for connected rendering and separated costs; do not recreate the
  native scheduler or claim every worker was simultaneously productive.

The water/support probe is preserved in
[20260919-water-and-support-probe.mjs](evidence/20260919-water-and-support-probe.mjs).
Original independent scopes were `run-u2311` and corrected `run-u2312`; the
consolidated receipt was reproduced under `run-u2329` with exit 0.

The own-support order error now has real pixels: the isolated two-record scene
uses the checked original art and production fixture/projection/batch owners.
Feet at `(.6,.27,.6)` emit before top `[1,0,1]`. Rendering the same records with
the independently required top-before-standing-actor relation changes 13 pixels
in the 80×98 image. Scope `run-u2334`, exit 0, no browser errors. Code:
[rendered-order probe](evidence/20260919-rendered-order-probe.mjs); original images
are retained under `.botanical/renderer-audit-20260919/own-top-{actual,expected}.png`.
This is a focused geometric/art witness, not acceptance of all furniture cases.

Direct surrounding-source comparison reaffirmed existing owners: the Rust work
planner jointly assigns current obligations; native whole-footprint support and
checked removal/replacement are installed. XYZ activity repair must include
`contracts.ts`, `work-activity.ts`, Colony producers and animation consumers.
Region/public-host transactions already commit and accept/discard resident work.
Botanical Watchdog has owner-transaction projections; Mycelium/Hub provide guarded
sandbox execution, cancellation and timeout. No new scheduler, event-sourcing
layer or sandbox follows from this renderer repair. Regional physical transfers
remain a later explicit contract, distinct from view coverage.

## Completed browser audit and recommendation

The requested audit/planning pass is complete. The implementation is not repaired
or accepted. Keep the historical checkpoint below as provenance; its pending-browser
section is superseded by this section. No broad implementation or deployment was
performed. The final recommendation is to proceed with packet 15's renderer-first
repair under one owner, keeping the existing Three bake → engine draw preparation
→ Pixi pipeline and the installed native support/work/durability owners.

### What the browser actually proved

[Compact receipt, sample counts and artifact hashes](evidence/20260919-browser-summary.json)
preserve the exact result boundaries. The executable browser probes beside it use
Playwright route instrumentation only; they do not edit application source or
replace hit predicates. The `head` mode serves the committed cover producer from
Git in that browser, leaving the unfinished working file untouched.

| Check | Observed result |
|---|---|
| Local original picking | Actual alpha hit on Sedge at local point `(352,80.32955)` returns no selection before pan, after 12 left-arrow inputs, and after four wheel zooms. Ten nonpickable cover rectangles precede the actor at this point. |
| Local unfinished patch | The same ordinary mouse inputs select `party:1.person.1` in all three cases. This establishes its benefit, not acceptance of making all grass click-through. |
| Existing hosted frontend + DO | HTTP 200, join/connect/terrain responses 200, no browser errors. Sedge's current observed ID and camera transform determine the click, not hardcoded assumed coordinates. Selection remains empty in all three camera cases. [Rendered original hosted scene](evidence/20260919-hosted-selection.png). |
| Camera demand | Local pan leaves 19 demanded chunks unknown while `viewComplete` stays true; crossing the other way leaves 22 unknown. The browser reproduces the source cache-service defect. |
| Floor gesture | Palette says rectangle; hover locks `[7,13,1]` while displayed level is 14. Drag to another cell emits `build.target.cell`, no area, and leaves the area gesture idle. |
| Bed plane | Hover locks level 13 while displayed level is 14. Lowering the display to 13 leaves the bed armed but clears its plane/hover. |
| Real terrain edit | Ordinary Dig area input `[5,13,1]`, then Resume: terrain revision 0→1; that column's surface changes from `[5,13,1]` to `[5,12,1]`. No direct kernel edit or fabricated frame. |
| Original-art ordering | Own-support counterexample changes 13 pixels of an 80×98 bake. [Actual order](evidence/20260919-own-top-actual.png), [required support-before-actor order](evidence/20260919-own-top-expected.png). |

The hosted diagnostic adds references to existing client state/camera/app to the
served bundle in that isolated browser; its ordering, hit tests and commands are
unchanged. Pixi extraction captures rendered art without depending on the host's
slow compositor screenshot path. It produces a world-container image, not a full
HUD screenshot. The earlier [local full viewport](evidence/20260919-dirty-initial.png)
is retained separately. Initial diagnostic attempts with incomplete timing hooks,
wrong accessible button labels or cyclic XState serialization are not passing
receipts. One earlier Vite process terminated with exit 143; it was confirmed
stopped before restart. Those environment/diagnostic failures are not game crashes.

### Measured costs and practical limits

Context: shared Linux host, two logical AMD EPYC-Milan CPUs, about 7.6 GiB RAM;
Chromium 153.0.8010.12, ANGLE SwiftShader, 1440×1000 CSS viewport, scale 1. Local
development modules have timing wrappers. The scene begins with 5,774 records;
ordinary culling changes counts during camera movement. Keep these as attribution
measurements, not hardware capacity, a 60 FPS claim, or head-versus-patch speedup.
Nested intervals must not be summed. Sparse frame samples do not merit p95 claims.

| Real interaction | Preparation / compiler / batch evidence |
|---|---|
| 12 left-arrow pan inputs, dirty producer | Four whole-view regenerations. Face generation 1,066 ms median / 1,361 ms max; cover generation 139 / 201 ms; batch update 81 / 91 ms. Worst draw preparation 1,943 ms. |
| Same pan, original producer | Four whole-view regenerations. Face generation 663 / 697 ms; cover 108 / 115 ms; batch update 58 / 62 ms. Worst draw preparation 1,029 ms. Different host load precludes treating this difference as a patch regression. |
| Four zoom inputs, dirty producer | Four regenerations; face generation 867 / 1,058 ms; cover 173 / 212 ms; batch update 75 / 79 ms. Worst draw preparation 1,479 ms. |
| 24 opposite-arrow inputs | Eleven regenerations; face generation 781 / 1,208 ms; batch update 63 / 110 ms. Worst draw preparation 2,037 ms. |
| Cutaway + lower level | One regeneration: faces 648 ms, cover 232 ms, batch update 56 ms; worst draw preparation 1,139 ms. |
| Moving cat in ordinary running world | Native observations show Mallow move from `(0,7.29,2)` to `(-2,7.29,2)`. Two batch updates reach 55 ms; draw preparation reaches 65 ms. This is actor movement, not productive-worker capacity. |
| Completed one-cell dig | Faces regenerate in 555 ms, cover in 106 ms; worst draw preparation 809 ms. One chunk request/reply takes 200 ms including transport/scheduling/worker work. |
| Focused six-arrow upload attribution | One regeneration: faces 643 ms, cover 132 ms, compile max 129 ms, batch plan 9.2 ms, total batch update 67.5 ms. Five buffer-array builds total 5.3 ms; seven `bufferData` and fourteen `bufferSubData` CPU calls total about 0.6 ms. GPU completion is not measured. |

Static stationary draw preparation is small in these short windows (1.3 ms median
in the original-producer run), yet software-browser frame intervals remain hundreds
of milliseconds. The full receipt records each frame interval and its sample count;
CPU submission is not GPU execution or compositor cost. The measured camera stalls
also contain large synchronous preparation work independent of that distinction.
The priorities are exposed-face generation/retention, cache servicing, joined
ordering correctness, and run-signature/batch invalidation—not further optimizing
an already sub-millisecond four-actor insertion in isolation.

The moving-world run records 100 existing Worker `session.step` metrics: 0.6 ms
median, 1.9 ms p95, 4.5 ms max. These exclude subsequent snapshot capture/export;
the existing water/gas counters are null. This audit does not establish separate
solver costs or 32/100 productive-worker throughput. Those remain the explicitly
ordered stage-3 qualification, using the installed performance scenarios. No Rust
scheduler or native support checks were restarted. Browser phase/transport/native
samples now establish where this renderer repair should start.

### Repair contract and next playable milestone

Complete the existing model-to-pack metadata path and make one engine presentation
owner prepare the ordered list. Remove competing full/retained comparison and
admission rules; resolve support from physical facts regardless of visible support
records; make blending independent of depth order; join actual physical guides;
use exact alpha hits; dispose multipart children on world replacement. Pixi paints
the prepared list and owns its resources. Picking traverses that same list backward.
Keep static geometry/order and rebuild only affected chunks/parts as physical or
cut facts change; pan/zoom do not invalidate unchanged physical relationships.

For each exported unsplit drawable, prove that supported overlaps permit one
consistent insertion. Where existing bed/stair geometry needs interleaving, use
small meaningful parts from the original model through the existing exporter.
Footprint endpoints and a support-local scalar interval are not that proof. Keep
the three-part stair bounded until all required occupants and outside passersby
are qualified. There is no evidence requiring a new renderer or arbitrary live
3D/depth reconstruction.

Next independently playable milestone: pan, zoom, change cuts, click a person,
and walk around terrain, both bed ends and stair rails without missing coverage,
false grass hits or objects painting through their supports. Include bank/water
and production build-guide overlaps, plus clean world replacement. Building-plane
controls follow immediately; work/performance, continuity/regions and the existing
creator join retain their recorded order. Grass actor scale and new creator tools
do not block this first milestone.

Still unqualified as implementation acceptance: the complete furniture/orientation
matrix, actual pan-induced image popping distinct from the proved demand failure,
water GPU pixels beyond the independent same-ray counterexample, reset rendering,
hardware-GPU smoothness and productive-worker capacity. These are explicit repair
acceptance gates, not claims that the audit repaired or proved the whole renderer.
No current Fallow report for these renderer paths was found in the inspected
retained evidence; the available clearing-state report concerns an older owner.
Source review identifies the large client coordinator, duplicated compiler rules,
whole-view face scanning and run hashing as remaining responsibility/cost hotspots.

Browser reproduction on this host uses the cached headless shell and isolated
unpacked libraries; no host or repository dependencies were installed or changed:

```sh
/home/levi/src/Botanical-next/.agents/skills/orchestrate-multi-lane-work/scripts/run-proof.sh env LD_LIBRARY_PATH=/tmp/hive-renderer-audit-browser/root/usr/lib/x86_64-linux-gnu:/tmp/hive-proof-libs/root/usr/lib/x86_64-linux-gnu node engine/implementation/clearing-repair/evidence/20260919-browser-audit.mjs .botanical/renderer-audit-20260919 head
```

Other bounded modes are `controls`, `building`, `edit` and `uploads`; default
`dirty` includes the full local sequence. Local scripts expect the ordinary Vite
server on port 5187. The hosted selection and rendered-order probes are separate
files beside this script. Raw per-phase samples remain under the recorded
`.botanical/renderer-audit-20260919` root; the compact receipt preserves their
hashes, sample counts and summary. The maintained native scheduler/support suites
are not part of these diagnostics.

### Pasteable implementation goal

```text
/goal Deliver packet 15's first playable rendering/interaction milestone in
/home/levi/src/hive-worktrees/living-terrain-integration. Read packet 15 and the
completed 15-renderer-audit-handoff-20260919.md before editing. Preserve the two
unaccepted picking files, original art, studies and all audit evidence.

Take ownership of the existing Three model -> baked art plus geometry metadata ->
engine-prepared ordered drawing list -> dumb Pixi pipeline. Complete the existing
exporter/pack contract and one engine presentation owner, rather than patching
several sorters or introducing a new renderer. Fix own-support/footprint/part order,
water order, actual guide integration, alpha picking, current camera-demand service,
retained terrain/batch invalidation and multipart reset cleanup together. Keep native
world/support/work/durability authority. No live Three or runtime per-pixel depth.

Use the recorded original-art and same-ray counterexamples as independent expected
results before retained/full parity. Prove normal mouse clicks after pan/zoom,
support-tile quadrants, both ends/sides of the bed, stair entrance/middle/landing
and outside rails, pits/cuts, water/banks, actual guides, chunk crossings, terrain
edits and clean world replacement. Measure preparation, ordering, batching/uploads,
render/frame intervals and native/transport costs separately. Do not claim productive
population capacity from idle actors or software-browser numbers.

Use isolated writing lanes with one owner for the coupled exporter/draw stack,
review its first working shape, then finish and qualify the playable milestone.
Publish only its coherent accepted interim to the existing feature preview under
the established release rules; no main merge or production/backend deployment.
Preserve packet 15's subsequent order: building/support callers, productive work
and performance, continuity/regions, then the existing creator-tool join. Give
short plain-language updates and tell Levi exactly what is playable.
```

## Original handoff — historical starting state

This is an unfinished source audit and handoff, not implementation acceptance.
The user requested an audit/planning pass and intends to resume in a new chat.
Do not launch a broad fix or deployment from this document alone. Finish the
remaining audit, then supply a concrete implementation goal. Packet 15 remains
the combined sprint; this document is its current evidence/checkpoint.

- Integration checkout: `/home/levi/src/hive-worktrees/living-terrain-integration`.
- Branch: `engine/living-terrain-integration-20260917`.
- Audited source: `950bea93862ddc8cf1ef23c6a640326cdd7bd65d`.
- Remote: `https://github.com/fungi-computer/hive.git`.
- The primary `/home/levi/src/hive` checkout is not this implementation root.
- Read this checkout's `AGENTS.md`, `.agents/skills/game-cto/SKILL.md`, packet 15,
  and the current-status section of `docs/decisions/architecture-proof-sprint.md`.
  Older extraction queues are historical; inspect actual consumers.
- Existing session: `01a0791e-7ac8-7cc0-90dd-48f8d164e526`. Do not require its
  conversation or old agents to reconstruct the task.

Current task: trace Three bake → native facts → observation/transport → client
records/cuts/order/batches → Pixi → picking/commands. Reproduce failed selection
and camera hitching, measure real interactions and review connected systems.
Separate confirmed behavior, source risk and unmeasured hypotheses. Challenge
both the implementation and the packet. Give brief, candid bro updates.

Immediate priorities, in order: drawing/interaction; building/support; everyday
work and productive performance; durable continuity/regions; existing creator
tool join. The Edmund authoring API progresses through those seams, not as a
later rewrite. Character customization, marketplaces, Set integration and new art
are outside this audit. No live Three gameplay, second simulation or grass-only
sorting machinery. Grass is intended to have ordinary actor identity/capabilities;
selecting grass is not a prerequisite to restoring people selection.

Original local request files, for provenance only (this handoff is self-contained):
`/home/levi/.codex/attachments/22449110-4c2f-41b6-8f12-4e640d7a4748/pasted-text-1.txt`
and `/home/levi/.codex/attachments/2b73f3ea-e1cf-4cab-a9cc-556724bc2795/pasted-text-1.txt`.

## Custody: preserve the unfinished patch

Two source files were dirty on entry and remain unaccepted:

| File | SHA-256 of working file |
|---|---|
| `engine/src/client/terrain-visibility.js` | `84e77b3b143362ac7bc47a3f2f7fd2ff306a96637990e0faa20fd9aa089d34ba` |
| `engine/src/client/voxel-draw-picking.test.js` | `0305d8787c2cd6d1f7af6ce73141535225d286fb24e1724a6fb9623ecbf022fd` |

Exact recovery bytes are in [the unaccepted patch](evidence/20260919-unaccepted-picking.patch),
SHA-256 `4c59221dd6e9fd7d493beec9b25b79257c46f265c60a38d3b8fee34cb75b64cc`.
It removes every cover `contains` predicate and adds a synthetic picking test.
It prevents rectangular cover quads swallowing clicks, but also makes visible
grass pointer-transparent. Its comment calls cover decorative, which is not the
agreed long-term identity contract. The test uses an always-true actor hit and
substituted support cells; it does not prove an actual click at an authored pixel.
Do not silently accept, revert, or deploy it. Do not apply the recovery patch on
top of already-dirty files. Preserve existing `.botanical` evidence and studies.

## Last recorded deployment, and what its proof actually establishes

Source `80e39fd966483f51b227d8d0d3783ea1d62c2b14`:
[Clearing preview](https://clearing-80e39fd9-fungi-goblin-bnb.levi-fe0.workers.dev/engine/colony?game=colony).
Immutable frontend: `https://48d64c39-fungi-goblin-bnb.levi-fe0.workers.dev`.
Backend: `https://hive-public-engine-demo.levi-fe0.workers.dev`.
Local release receipt: `.botanical/clearing-releases/20260917T083013Z-80e39fd9/RESULT.md`.
Both frontend readbacks matched 224 assets and live join/observe returned revision
2 with two party members. This audit did not reverify current hosted availability.

The retained-stream measurement in `evidence/retained-voxel-stream-receipt.json`
sampled 5,774 visible records for five seconds at a stationary viewport. Its
0.10ms median / 1.5ms p95 measures dynamic insertion, not total frame time or
productive workers. It did not drive camera motion or click selection. Claims
that this qualified a playable renderer were too strong.

## Confirmed findings and remaining hypotheses

Source anchors below refer to the audited revision; use symbol names after edits.
Independent read-only reviewers checked rendering and surrounding systems; root
read the compiler, cache, cut-layer, picking and actual placement callers.
The renderer review's [exact probe and output](evidence/20260919-renderer-contract-probe.md)
are preserved so a new chat does not need the reviewer session.

1. **Actors and supporting tops use different ordering contexts.**
   `engine/src/client/voxel-draw-stream.js:45,134` compares global
   `-dot(cameraDirection, position)` before slot priority. Tops use a cell center;
   actors use their exact feet. The real mixed fixture with top `terrain:1,0,1:top`
   and actor feet `(0.6,0.27,0.6)` emits the actor before its own top. Slot priority
   cannot fix different primary keys. This is a demonstrated order error; the
   corresponding real-art pixel loss still needs a screenshot.

2. **Support representation changes cover order.** Compiler support record IDs
   become dependencies; equivalent cell tuples do not (`:106`). Emission waits
   for those dependencies (`:208–238`). Eight fixture covers emit away from their
   declared anchor; a root at `(0.5,0.27,0.5)` emits at support `(1,0.27,1)`.
   `terrain-visibility.js:133` chooses IDs versus cells based on visible support
   records. A read-only probe confirmed identical physical facts can produce a
   different order. Actual pan-induced image popping has not been captured.

3. **Footprints still collapse to the last contact.** Registering all contacts
   then emitting once the last arrives is mathematically the maximum traversal
   contact. Keeping the others in diagnostics does not satisfy packet 15's
   footprint rule. Multipart support currently requires exactly one surface and
   two boundaries (`voxel-draw-stream.js:164`). No general multi-footprint
   solution has been established by these tests. Do not merely replace max with
   min, rename the key, or declare canonical-cell sorting universally sufficient.

4. **Retained and full compilation admit different inputs.**
   `voxel-draw-stream-owner.js:111,138` compiles statics and actors separately.
   An actor claiming `fixture:stair` with feet `(100,0.27,100)` is accepted by the
   retained owner but rejected by the full compiler. This demonstrates missing
   joined validation, not that the simulation currently produces that pose.
   Comparator/slot rules are duplicated between the two modules.

5. **New terrain demand can stop being serviced.**
   `terrain-chunk-cache.js:snapshot` reports `viewComplete` for the last drawable
   complete view, even when current demand contains unknown chunks.
   `cut-terrain-layer.js:position` services only when that flag is false.
   [Probe](evidence/20260919-cache-demand-probe.mjs) and
   [receipt](evidence/20260919-cache-demand-receipt.json) reproduce this mismatch:
   old chunk `(0,0,0)` remains complete, demanded `(1,0,0)` is unknown, service
   gate is false. This explains a coverage failure; it does not measure hitch cost.

6. **Camera/actor/water changes invalidate too much.** `position()` redoes visible
   chunk planning each call; demand change or leaving a 64-world-pixel margin
   regenerates all visible face/cover records. Water refresh scans/maps all water
   and includes physical volume in a record signature even if visual level is
   unchanged. Any published change invalidates the global static revision.
   Crossing an actor insertion rank merges the static stream and replans all
   mesh runs (`voxel-draw-stream-owner.js:145`; `terrain-face-batches.js`). Run
   identity/signatures allocate strings over records and geometry. These are
   confirmed work paths; how much each contributes to user-visible lag is pending.
   Budget refusal calls `onCoverage` synchronously; client wires that to `draw()`
   (`client.js:285`): investigate re-entry before changing that path.

7. **Picking uses a draw rectangle as cover hit geometry at HEAD.**
   `terrain-visibility.js:146` installs a polygon from the padded cover quad.
   `voxel-draw-picking.js` stops at any first nonpickable hit. Transparent padding
   can therefore occlude a selectable actor; the dirty patch removes that
   interception wholesale. Actual alpha-hit support already exists in
   `src/visual-hit-geometry.js`; the living-terrain pack lacks that metadata.
   Camera transform/inverse pointer transform appear consistent. Browser selection
   before/after camera movement still needs reproduction.

8. **Build plane and gesture dispatch are incorrectly joined.**
   `client.js:1301` locks the first hovered surface as plane; `:1207` submits a
   point on a locked plane before line/rectangle dispatch at `:1239`.
   `changeViewLevel` clears placement without selecting a build plane. This is a
   concrete control-flow defect; prove its actual floor/bed interaction. Native
   whole-footprint support exists in `structure_support.rs:289,339`; checked
   removal in `terrain_water.rs:515,536`; floor replacement in
   `construction_work.rs:806`. Fix their callers, not another support subsystem.

9. **Observation bounds are applied too late for more actors.**
   `runtime/observation.ts:67` calls `renderFacts(512)`; `wasm-kernel.ts:791`
   exports/parses the complete native JSON before slicing; `world.rs:4352` scans
   Position identities. Grass is still `generatedCover` in
   `runtime/terrain-presentation.ts:294` / `games/colony-terrain-presentation.ts`.
   Repair bounded native selection before adding thousands of grass identities;
   truncation can hide other actors as well as waste bridge work.

10. **Work, environment and durability owners are already installed.**
    `native_work_planner.rs:110,380–457,538` reconciles attempts and collects
    construction/process/dig/deconstruction/resource/stockpile obligations for
    shared assignment. Lot/Container transfer owns material custody. Do not
    restart the Rust migration. `runtime/work-activity.ts:17,26,67` drops target
    Y into 2-tuples; include that projection in multi-storey work repair.
    `environment_runtime.rs:91–147` shares edit invalidation, water, paid emissions
    and air; every positive kernel step advances environment. Water/gas relative
    efficiency and productive 32/100-worker throughput remain unmeasured here.
    `src/engine/region/index.ts:421–558`, `runtime/region-program.ts:174–219` and
    `tools/public-engine-host/worker.ts:595–811` implement real transactional
    commitment, replay, resident acceptance and alarms. No cross-region
    actor/item/fluid recovery handoff was found in the inspected public caller;
    terrain paging is not simulation residency or regional transfer.

11. **Creator tools need one join, not another editor.** Shared scene-document
    export exists in `tools/asset-mcp/assets.mjs:34`; `src/art/static-authoring.js:97`
    still uses fixed `bakeArt`. `src/asset-pipeline/original-pack.ts:46–72` lists
    kettle/bench/bottle/bookcase, not a bed. Missing witness: checked authored
    document → existing raster pack → Visual on existing native bed → build/use/save.
    Physical footprint must come from checked definitions, not inferred mesh bounds.

## Recommendation and repair boundaries

Keep the current product/runtime architecture. We have demonstrated defects, not
evidence that Pixi cannot meet the target. We also have no evidence yet to promise
100 productive workers with responsive rendering. Measure before making that claim.

| Stage | Coupled ownership / removal | Acceptance | Relative lift and uncertainty |
|---|---|---|---|
| Finish audit | compiler, producer attachments, retained owner; no implementation yet | independent geometric counterexamples and real interaction cost breakdown | Medium; browser environment and geometric contract unresolved |
| Drawing + clicks | same three ordering owners; cut-layer/cache; existing batch and hit owners | actor quadrants, both furniture ends, stairs/rails, pits/cuts, pan/zoom/seams and actual alpha clicks | High; primary design risk, not a one-line comparator patch |
| Building + surfaces | selected-plane gestures + existing placement/support queries; remove alternate upper-placement routing; bounded native observation before cover actor scale | full bed support, one selected floor, rectangle floors, rejection/removal/replacement; shared rug/grass attachment rules | Medium/high; native support already installed, caller and cover joins remain |
| Everyday work | existing native planner/material owners and XYZ activity projection; remove superseded presentations only as callers move | connected dig/build/haul/store/brew + cancel/restart, measured productive 32/100 loads, water/gas costs separated | Medium; unknown bottleneck until workload measured |
| Continuity | existing Region/participant owners; explicit regional transfer contract before another region | two participants, reconnect, lost acknowledgement/retry, restart, conservation | Medium/high; do not confuse terrain demand with active residency |
| Creator witness | shared document/export/pack owner and existing bed definition | authored variation build/use/save through real creator API | Medium; no wardrobe or new editor required |

Ordering repair must first state the supported geometric assumptions. XYZ supplies
positions; it does not by itself say where every pixel in one large baked quad
belongs. Use existing authored parts where objects require interleaving; do not
invent per-blade layers. Establish a physically independent expected ordering for
the joined fixture before using full compiler parity to optimize it. If the
accepted asset-part contract cannot express a counterexample, explain that exact
conflict before changing architecture or expanding part generation.

One writer owns compiler/retained owner/record attachments together. Another
writer may take an independent bounded seam only with isolated worktree and agreed
files. Review first working shape before broad rollout. Query/command definitions
and real consumers must move together. Conversation examples of new APIs are not
evidence of installed with/where/do operations; inspect exports and callers.

Next independently playable milestone: the existing Clearing can be panned,
zoomed, cut, clicked and walked around without coverage starvation or objects
drawing through their supporting terrain. Include long furniture and stairs.
Grass selection/growth, creator work and regional expansion must not delay it.

## Original remaining audit work — superseded by completed audit above

1. Resolve browser dependencies using an existing supported proof environment.
   The cached Chromium 1243 binary currently fails `ldd` for `libnspr4.so`, NSS,
   ATK, X extensions, GBM and ALSA. No host install was performed. Existing ignored
   `.botanical/pan-baseline.mjs` is only a preliminary diagnostics script, not a
   sufficient final workload. Temporary browser dependency directories under
   `/tmp` contained some packages but no complete environment was established.
2. Reproduce selection with the deployed baseline and local dirty patch separately.
   Exercise ordinary input, not only injected `contains` predicates. Record actual
   screenshot/pixel and selected-ID evidence before/after camera transforms.
3. Instrument bounded diagnostics for record generation, compiler/retained merge,
   batch planning/buffer upload, drawing/frame interval, transport and native
   simulation separately. Run stationary, moving actor, sustained pan/zoom, chunk
   crossing, cuts and terrain edits. Record hardware/headless/software-GPU context;
   software Chromium numbers are not a browser capacity guarantee.
4. Recheck plan assumptions on multipart/large footprint visibility, water pass
   ordering, runtime build-guide integration, disposal and camera cache servicing.
   The mixed fixture's guide records do not establish that production screen-space
   overlays use the same stream. Finish direct Botanical capability comparison
   from actual source if changing a shared boundary; do not contact peers merely
   to fill a checklist.
5. Update this checkpoint with actual findings/measurements and propose the
   smallest complete ordering contract. Explain a changed architectural choice
   before codifying it. Then supply the implementation goal with evidence gates.

Automated diagnostics/tests use the existing guard (no invented flags):

```sh
cd /home/levi/src/hive-worktrees/living-terrain-integration
/home/levi/src/Botanical-next/.agents/skills/orchestrate-multi-lane-work/scripts/run-proof.sh node engine/implementation/clearing-repair/evidence/20260919-cache-demand-probe.mjs
```

No broad tests, source acceptance, implementation or new deployment occurred in
the original checkpoint. The cache probe completed in owned scope `run-u2308`;
the independent renderer reviewer ran a read-only probe in `run-u2306`. Neither
is a rendered interaction or performance proof. The audit was unfinished at that
checkpoint; the resumed browser and geometric evidence above completes the audit.

## Original resume prompt — superseded by implementation goal above

```text
/goal Resume the renderer-first Vishnu audit from
/home/levi/src/hive-worktrees/living-terrain-integration/engine/implementation/clearing-repair/15-renderer-audit-handoff-20260919.md
and packet 15 beside it. Use that integration checkout and inspect Git first.
Preserve the two unaccepted picking changes and existing art/studies. Finish the
pending real camera/selection reproductions, frame-cost measurements and geometric
contract review. Challenge the full compiler as well as its retained optimization.
Audit surrounding owners enough to keep the recorded repair order coherent;
do not rebuild the installed native planner or support checks. Planning/audit
only: no broad implementation or deployment. Refine packet 15, explain any changed
architecture before recording it, and finish with a candid bro summary, the next
playable milestone and a pasteable implementation goal. Give brief periodic updates.
```
