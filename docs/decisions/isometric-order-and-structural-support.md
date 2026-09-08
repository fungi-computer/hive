# Isometric ordering and structural support

Game CTO source/design disposition, 2026-09-08. Direct Levi feedback after upstairs publication: Rowan/bed overlaps look wrong; long isometric objects need footprint-aware ordering; a post should support roughly a 3×3 upper platform; eventual unsupported-roof collapse is desirable. This separates a current render defect from a support extension and later destructive simulation. No runtime or proof ran in this review.

## Confirmed renderer weakness

At published `32cd4235`, `view.js:depthKey` uses `x + z + level * .35 + layer`. Actor layer is .1 on ground; construction uses anchor sum with .15 or another constant. A bed has a two-cell footprint, a stair spans three cells and a raised landing, but each is one anchored image. This does not express how their different portions lie in front of or behind a person. Changing a constant is not a general fix.

The screenshot establishes an objectionable overlap, but not the exact actor/site coordinates or intended contact pose. There is also a separate source fact: `world.js:blockedCells` does not block ordinary bed cells, and the sleep route targets the bed. A standing actor can intersect the bed's physical volume. A painter sort for non-intersecting boxes cannot decide the intended meaning of that intersection. First record the actual or representative state, distinguish walking beside/through/onto the bed from sleeping, and define the intended contact rendering. Do not silently change movement rules while calling the fix visual-only.

The [Isometric Blocks explanation and source](https://shaunlebron.github.io/IsometricBlocks/) supports the useful general technique: projected-overlap broad phase, camera-calibrated separation relations between non-intersecting world volumes, then a topological draw order. It also demonstrates cycles requiring geometry splitting/clipping. Its axis signs and box assumptions are not copied as Hive camera/collision rules.

## Render contract

Keep one simulation site, cost, construction state, target ID and save record. It may expose several **render parts**:

```ts
type RenderPart = {
  id: PartId;
  ownerEntity: EntityId;
  display: DisplayHandle;
  worldBounds: Bounds3;
  screenBounds: Bounds2;
  role: "solid" | "shadow" | "overlay";
};
```

World footprint and vertical extent establish possible before/after relations. An actor's foot position anchors its body, but a point/zero-height foot box alone is insufficient for heads, tools or upper-floor overlap. Ordering bounds/parts must conservatively cover the full visible pose volume, including carried props. A narrower measured optimization is acceptable only after proving the same ordering cases. Collision and footprint bounds remain separate. Actual geometry and sprite alpha extents are related but not identical; padding is not collision.

Broad phase compares only overlapping projected bounds in visible/resident space. Stable partial-order edges are created where geometry proves a relation. Stable topological sorting gives draw order; unrelated items use a deterministic tie rule. Recompute the affected relation neighborhood when actors, camera orientation, parts or topology change; static relations can be cached. Do not introduce an every-frame all-world O(n²) sort to fix one bed.

Report cycles/ambiguous intersections in development. A deterministic fallback is a fallback, not proof of correct pixels. Long/wide or interleaving objects can be divided into depth-relevant geometry parts or a deliberately clipped pass. Baked parts must partition the original visible pixels without double painting, seams or newly exposed hidden faces. Simply drawing the full bed twice or cutting a PNG vertically is not a geometric solution. Retain the original Three→bake→Pixi path and unchanged accepted geometry/colors unless an actual art correction is needed.

For a sleeping occupant, define the relationship of mattress/frame, body, cover and pillow through a bounded contact-pose composition. For ordinary movement inside bed cells, first choose a consistent visual contact policy or a separately reviewed movement/approach correction. Do not hide this semantic problem inside arbitrary z offsets. Picking resolves visible selectable parts to the same site/actor under the existing armed-tool/right-click ownership.

The bounded actual-builder/Pixi study now proves both bed facings: finished
supporting upper-floor surfaces must order before their supported bed, and that
relation removes the observed floor-over-foot failure with unchanged pixels.
The foreground tree, sleeping contact, all stair traversal samples, a true
ordering cycle and hot-path performance remain unresolved; retain current
behavior for those cases until each has focused evidence. Do not ship the
study's all-pairs projected-AABB prototype or its scratch-array work. A later
integration should replace the existing scalar-depth callers with one measured
rank owner over visible candidates, using cached bake metadata and sharing the
result with picking. Unchanged art needs no second art gate; split parts only for
a demonstrated interleaving or cycle.

## First corrective outcome

One focused bed/actor renderer checkpoint, both bed axes and levels, with a canonical overlap fixture. Prove near/far sides, equal-anchor-sum diagonal cases, two actors around one bed, walking/carrying transitions and the actual sleep contact. Reversed insertion order must not change the result. Keep click/inspection and persistent tool behavior. Use a compact contact sheet/short motion trace; no full-home harness or material-earning marathon.

If those cases require split bed parts, a writer can stage exact geometry partition metadata/bakes in ignored files; Astra personally reviews native/game-scale recomposition and motion before tracked integration. This is a reserved changed-art check, not a new approval gate for unrelated source fixes. Stairs/raised floors become the next consumer of the same contract before claiming a generally solved multi-level renderer.

## What supports floors today

`construction.js:floorSupported` currently accepts a level-1 floor when its lower cell is enclosed by `indoors(state, 0)` or contains a finished wall. A lower roof/door or stair headroom conflict disallows it. Thus the current rule is broader than strictly “wall directly below,” but still ties platforms to the lower enclosure layout. `roofSupported` separately uses enclosure or a same-cell wall/door. Neither models structural spans or collapse.

The post extension is worthwhile and can stay small. Proposed rule: a finished ground post provides a support domain with horizontal Chebyshev radius one, `max(abs(dx), abs(dz)) <= 1`, exactly a centered 3×3. A bounded connected platform must reach the floor over that post through finished orthogonally adjacent floor cells within that same domain. This permits all nine cells but does not permit an isolated floating corner. Planned cells can preview a future path; actual construction waits until the supporting path is finished.

Floors do not become fresh unlimited-radius supports. A chain cannot walk support across the whole map. Multiple posts can supply overlapping domains; removal tests each remaining post-supported floor against candidate surviving posts, requiring the entire path to stay inside that one candidate post's 3×3 domain and terminate over its center. Paths cannot relay through a union of post domains. An independently valid legacy enclosed/wall support can also satisfy the query. Stair headroom, lower cover conflicts, legal bounds and upper-surface rules remain explicit. The first post has one ground footprint and its own typed support meaning, not a decorative flag on a generic prop.

Legacy enclosed-ground/wall support remains a compatibility rule in the first extension. It is not a physical load calculation. A later conversion to bounded beams/spans must migrate or grandfather old structures explicitly; it cannot make every saved room collapse on first load. Support queries return a reason/source/path, allowing preview and inspector to explain support without persisting a competing support map.

The visual post/joist treatment should make the supported platform plausible at actual game scale. Post material cost/build time and whether a post blocks pathing are declared construction data; a conservative initial post blocks its occupied ground cell. Do not assume one post can carry arbitrary stacked towers or that a 3×3 floor span also defines the roof span. Only the current two levels are involved initially.

## Support changes touch real obligations

One support query serves placement, work readiness, prospective removal, persistence validation and the overlay. Deconstruction must evaluate the prospective support graph before removal. First extension retains safe blocked removal while dependents remain, with a visible waiting reason. Alternative surviving support can allow removal. Actors, paths, goods and upper structures still obey the existing clear-surface checks.

Focused proof: finish one post/anchor floor, complete all nine connected tiles through real supported ordering, reject/wait on the tenth outside span and an isolated corner, place an upper bed, save/reload, and exercise blocked post removal plus a second valid support. No fabricated load rating or four-tile radius. New post definitions and support semantics require strict save compatibility/version handling.

## Collapse is feasible, but its consequences are the substantial work

Support detection over a dirty roof component is a manageable graph/query problem. Destructive resolution also affects pathfinding, occupants, stored/carried materials, reservations, jobs, salvage, debris and save validity. Current persistence rejects unsupported structures and removal waits for dependents; adding collapse requires a valid pending-collapse transition rather than bypassing those invariants.

First future collapse consumer should be roof cover, separately from walkable upper floors. Select a bounded support-span rule, recompute affected components after actual structural changes, mark unsupported cells, then resolve a deterministic collapse event with authored material disposition. Later floor collapse needs falling actors/goods, impact and multi-level propagation—substantially more scope. A roof rule is not proof of that.

The build preview can show unsupported/at-risk cells and allow a deliberate risky roof order under the chosen gameplay policy. Collapse can teach through visible causes and aftermath; it does not need hidden rules or a surprise unsupported-state save rejection. The initial post extension keeps safe admission/removal. Risky construction is a later explicit behavior, not silently introduced by adding support radius.

Ludeon's [roof discussion](https://ludeon.com/blog/2013/08/sun-shadows/) confirms support/collapse direction historically, but no current exact six-tile distance/metric is assumed here. We choose and explain Hive's rule. No real-world structural safety claim follows from a cartoon post.

## Delivery disposition

Advance the actual bed-depth diagnosis/corrective first shape as the current defect. Keep core/save unchanged for a render-only correction; if movement/contact semantics need change, expose that in the brief. The post/platform extension is a bounded follow-on after its art/data/support contract, and roof collapse remains planned separately. Preserve 32cd4235 and stopped evidence. Source review plus compact exact-pose evidence is appropriate; no long browser rerun is requested.

Associate existing upstairs/rendering issue #3, architecture/performance #6 and relevant construction direction. Link this record from the architecture implementation plan, with the direct screenshot retained as ignored reference. This source/design review does not claim the screenshot has been fixed or the post implemented.
