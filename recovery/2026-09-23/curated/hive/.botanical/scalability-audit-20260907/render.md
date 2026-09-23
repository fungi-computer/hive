# Render scalability audit — 2026-09-07

Read-only audit of the dirty two-person-home candidate at `016b1a0` on
`feat/goblin-bed-and-breakfast-mvp`. No browser/proof run was performed. Every
claim below is **source-observed**, unless it explicitly says inference.

Sources were live and dirty. End-of-read SHA-256: `view.js` `3992b971`,
`construction-view.js` `c4f6f174`, `camera.js` `67e9aed7`, `world.js`
`d96f036c`, `movement.js` `0fdba8ae`, `art.js` `07ca6653`, `art/scale.js`
`2de8ee96`, `art/clearing.js` `6ba42dbf`, `art/home.js` `4d4af1eb`, `main.js`
`0886d74b`, and `ARCHITECTURE.md` `2cc332ef`.

## Prioritized findings

1. **Current two-person correction — cutaway is hard-coded to Rowan.**
   Source-observed: `drawSites` derives `pawnIndoors` from
   `state.actors.rowan` and compares every front wall with Rowan's position
   (`construction-view.js:80, 100-108`). Sedge can be selected/recruited and
   rendered (`view.js:92-145`, `main.js:70-102`), but cannot become the
   cutaway subject. If Sedge sleeps indoors while Rowan remains outside, the
   front wall stays opaque around Sedge.

   Smallest current correction for lead inspection: pass the current displayed
   actor (selected/inspected actor, with the existing Rowan fallback) to the
   construction view and use that actor consistently for the indoors/front-wall
   test. Proof: keep Rowan outdoors, put Sedge in the finished home, select
   Sedge, and observe the same wall fade that Rowan receives. This changes only
   presentation choice; it does not change shelter, simulation, or selection
   authority.

2. **Required upstairs change — logical storeys are discarded at the view/input
   seam.** Source-observed: `project` accepts geometry height
   (`art/scale.js:22-30`), but `put` ignores `at.level` (`view.js:18-22`),
   construction sprites/ghosts call `project(x, z)`
   (`construction-view.js:87-96, 157-160`), and inverse picking always emits
   `level: 0` (`art/scale.js:32-40`; `camera.js:32-35`). `dragCells` also emits
   only level zero (`construction-view.js:10-21`). The finite single-level
   clearing currently intends that behavior; it will not support the next
   upstairs bed proof.

   Smallest slice-2 repair: a local view-projection seam with explicit selected
   storey and one shared `STOREY_HEIGHT`, supplying `worldToScreen(cell)` and
   `screenToCell(screen, selectedLevel)`. Route sprite placement, ghosts/grids,
   labels, box selection and cutaway through it while positions stay integer
   cells. Proof: put Rowan upstairs behind a front wall, select/place a level-1
   bed, switch selected storey/cutaway, and show screen position plus inverse
   pick resolve the same `{x,z,level}`. No general physics or render world is
   needed.

3. **Required chunk/dynamic-arrival change — the view has one baked finite
   clearing and boot-only object maps.** Source-observed: `bakeArt` bakes one
   `640×400` `clearing()` texture (`art.js:55-56`) and `view` adds one sprite
   (`view.js:65-73`). That art includes a 15×15 ground and initial `ROCKS`/
   `WATCHER` (`art/clearing.js:12-13, 30-102`), while mutable state owns cloned
   rocks/watcher (`clearing.ts:31-40`; `world.js:41-50`). Separately, `trees`
   and `actors` are created only from `initial` (`view.js:75-145`) but current
   state is later dereferenced through `trees.get(tree.id)` and
   `actors.get(person.id)` (`view.js:200-205, 251-260`). An arriving actor/tree
   therefore reaches an absent display object; an unloaded/departed one retains
   its body and stage label. The finite home does not exercise either path.

   Smallest slice-3 repair: keep the clearing as the authored home patch and
   extend the existing per-kind Pixi maps with create/update/dispose by stable
   ID for the **visible** objects. Stateful rocks/markers become their own
   keyed retained objects, like trees; they do not enter a generic renderer.
   A chunk's terrain patch may then be created/disposed by its coordinate while
   world data remains the sole owner. Extract a shared helper only if the
   actor/tree/pile/site maps demonstrably repeat the same lifecycle shape.
   Proof: pan from home to a third generated patch; let an actor and a tree
   enter/leave visibility; modify, save, evict and reload that unoccupied patch;
   verify the home worker continues and retained Pixi/label counts plateau after
   the return journey.

4. **Scale measurement is needed before an invalidation/index change.**
   Source-observed: `main.js:509-527` calls `view.render` every Pixi ticker
   frame, including frames with no fixed simulation step. `drawTrees` loops all
   trees and scans all actors/jobs per tree (`view.js:200-248`); chop preview
   repeats tree×job work (`view.js:44-62`). Pile reconciliation is
   retained-piles×all-piles plus an all-piles filter (`view.js:175-197`), while
   construction has sites×sites membership/mask work and redraws the full grid
   (`construction-view.js:38-50, 74-163`). Runtime cost at 50/100 actors and
   multi-chunk visibility is an inference, not measured evidence.

   First prove the need with a 100-actor/multi-patch fixture that records
   visible/resident counts, frame time and retained display count during an
   outward-and-return camera journey. If it misses the product target, add only
   a derived visual index for the observed hot queries (for example active job
   targets and topology/selection invalidation), while retaining direct Pixi
   animation updates. Do not add an ECS or general event bus. The proof must
   show resident-but-invisible data is not scanned on unchanged frames and the
   cache remains bounded.

5. **Art startup has a source-observed eager cost; choose the existing offline
   art route before a client runtime loader.** `main.js:31-43` awaits all of
   `bakeArt` before creating Pixi. Its current loops construct 526
   canvas-backed textures by source count (444 figure frames, 3 trees, 24
   building variants, 48 wall joints, 6 piles and ground) at `art.js:55-116`;
   `actorFrames` assumes `art.figures[person.figure]` already exists
   (`view.js:39-42`). Fifty actors using the same kind reuse those Pixi textures,
   so no 50-person runtime failure has been demonstrated. Additional figure
   kinds, poses and future views would expand the bootstrap set; an unbaked kind
   would fail at that lookup.

   Preserve the study and the original Three → fixed low-resolution → Pixi path
   (`art.js:1-2`; `ARCHITECTURE.md:489-495`). The preferred follow-up is an
   offline/build-time original-geometry sprite or atlas output with provenance
   and native-pixel parity, not default client bake/load machinery. Measure boot
   time and GPU texture count at intended hardware first. If the measurement
   justifies a choice, compare (a) pre-baking the declared manifest into those
   assets with (b) an on-demand batch for a real dynamic-archetype caller.
   Proof for either choice: intended-scale/motion pixel parity with the study,
   provenance for each generated asset, shared textures across 100 same-kind
   actors, and bounded release of an unused variant.

## Pooling, batching and culling addendum

This addendum observed later live `view.js` bytes (`fbdfbdec`).
Source-observed allocation/churn is narrower than the retained-object finding:
`drawTrees` assigns a fresh `Rectangle` hit area for every tree on every render
(`view.js:192-195`), while `marks`, `route`, every actor progress graphic and
the selection box are cleared and rebuilt in the frame path (`view.js:200-298`;
`construction-view.js:127-163`). Pooling is useful when a bounded set of
short-lived, interchangeable objects is repeatedly created/destroyed; it is not
the cure for durable actors, trees, piles or sites. Those retain one keyed Pixi
object per visible stable ID and are removed through the lifecycle in finding 3.
Visible culling decides which of those retained objects exist/render; it avoids
both traversal and allocation for resident-but-offscreen world data.

Pixi 8.19.0 has a default sprite batch path: `BatchableSprite` names the
`default` batcher (`node_modules/pixi.js/lib/scene/sprite/BatchableSprite.js:6`),
and the installed `Batcher` groups batchable elements by texture while breaking
for blend/topology changes or its texture limit
(`node_modules/pixi.js/lib/rendering/batcher/shared/Batcher.js:128-222`; its
declaration describes batching same-texture objects at `Batcher.d.ts:202-203`).
This is a capability, not a source-observed draw-call count for Hive. An atlas
can increase shared texture-source opportunities; it does not replace visible
culling, keyed display lifetime, or a runtime draw-call/frame measurement.

For the later arrow experiment in `ARCHITECTURE.md:615-632`, a projectile pool
would be a bounded set of reusable storage/display slots only after a real
projectile caller exists. Every launch still receives a fresh logical shot ID
and resets all transient position, velocity, collision-sweep and trail state;
authoritative ammo consumption and hit settlement remain in the world state.
It is not a current-home prerequisite and does not authorize projectile code.

## Strengths to retain

- Simulation is the sole writer and Pixi reads it (`clearing.ts:83-101`,
  `ARCHITECTURE.md:239-261`); visible caches do not become world owners.
- Stable actor IDs and the shared `bodies.sortableChildren` layer
  (`view.js:70-73`) are the correct basis for retained objects and cross-object
  depth interleaving.
- The original geometry → low-resolution sprite → Pixi pipeline remains the
  right current path. These findings require coordinate/lifetime seams, not a
  renderer rewrite.
