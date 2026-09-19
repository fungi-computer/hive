# Renderer audit and new-chat handoff — September 19, 2026

## Start here

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

## Remaining audit work before an implementation handoff

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
this audit checkpoint. The cache probe completed in owned scope `run-u2308`;
the independent renderer reviewer ran a read-only probe in `run-u2306`. Neither
is a rendered interaction or performance proof. Keep the audit goal unfinished
until the remaining requirements are met.

## Paste into the new chat

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
