# Input and rendering: bounded module review

Independent source review for Game CTO, 2026-09-08. Read-only production inspection at HEAD `32cd4235e22a6f7d456c3100d87fa8abd89475cd`; no build, browser proof or mutation of tracked files. Delivery may begin a corrective writer after this read, so these are base-source findings rather than a claim about its next candidate. Reviewed `view.js`, `construction-view.js`, `camera.js`, `art/scale.js`, `art.js`, `art/home.js`, `main.js`, `hud.jsx`, `ui-actions.ts`, `tsconfig.json`, and the root isometric/support draft.

The missing primitive is not another state library. It is a checked presentation/input boundary which owns the interpretation of visible parts, pointer gestures and game intents. Current libraries already cover reactive UI facts and gesture state. The following six recommendations keep those owners and give each new module one decision to hide.

## 1. Texture silhouette picking should be a small reusable art/presentation adapter

Confirmed source defect: construction sprites use the entire baked 112×112 rectangle as the default hit shape, except floors, which install a diamond. Wall art uses only part of that canvas. `construction-view.js:105–116` therefore accepts a wall pointer event from transparent padding and stops it reaching ground. Most actor/tree/herb hit areas are also coarse hand-entered rectangles, although their exact tradeoff differs. A click at apparent empty ground can legitimately select a far wall under the current code; moving the inspector does not repair it.

Provide a small `spriteSilhouette(texture)`/`bindSelectableSprite(...)` adapter with a local-coordinate containment predicate, calculated once from the actual baked canvas and cached by texture identity. Convert through the sprite's anchor and transform; do not reimplement camera arithmetic inside it. Test the currently selected texture, including wall joint mask/stage, tree standing versus stump, and rotated bed/stair variants. Cache immutable mask data, not every sprite instance or pointer location. A 112² bit mask costs 1,568 bytes before metadata; a byte mask costs 12,544 bytes. Either is bounded; do not scan or read back GPU pixels on every move.

The initial hotfix can keep Pixi's event traversal, eventMode, front-to-back display order and existing callbacks as the only picker. Install the predicate on that path; do not simultaneously add a competing stage picker. Retain ground fallback through transparent pixels. Decorative ground shadows, label plates, progress bars and selection rings are not selectable body silhouette. Authored outlines can count as the visible body. If small figures later need a generous touch target, make that an explicit selection policy with controlled radius/tie resolution, rather than accepting an invisible rectangular wall.

Delete the construction fallback to full texture bounds. Centralize mask lookup for later consumers instead of adding new per-kind rectangle exceptions. Focused exit: click transparent padding versus opaque wall pixels on both axes and levels, zoom/pan, door opening, cutaway and tools armed. Verify that a wall/bed texture change updates its pick shape, and that one tap produces one inspected entity or ground outcome. The root's supplied screenshot is the regression intent, not a test coordinate until the actual saved scene is retained.

## 2. A presentation plan should decide what is visible, selectable and spatially occupied once

`drawSites` currently derives stage, wall joins, roof/wall cutaway, active level, texture, alpha, hit policy and depth inline. `drawActors` separately chooses the interpolated position, pose, frame and active level. Tree cutaway/selection policy is another branch. These decisions should be exposed as a small presentation description consumed by the Pixi adapter, not mixed with `Sprite` creation and input listeners.

Candidate API, evolved only for real consumers:

```ts
type PresentedPart = {
  partId: string;
  owner: SelectableTarget; // one entity may have several parts
  texture: TextureKey;
  transform: PartTransform;
  bounds: Bounds3;
  visibility: "hidden" | "context" | "solid";
  selectable: boolean;
  orderRole: "body" | "shadow" | "overlay";
};
function presentSite(
  site: Site,
  context: SiteViewContext,
): readonly PresentedPart[];
function presentActor(
  actor: Actor,
  pose: VisualPose,
  context: ActorViewContext,
): readonly PresentedPart[];
```

These are derived render facts, not another world model. The renderer applies them; the picker uses their actual visibility/selectability and owner; the order module consumes their bounds. Stage still comes from delivered/work/finished, shelf contents from the real stored bundle, and pose from actual activity/cargo. No presentation module changes a job, claim, position or save record. Scope context queries narrowly and let the caller share an indoor/occupancy lookup once per relevant revision; do not make every site query reconstruct all rooms or scan every bundle.

Delete the corresponding inline decisions from `drawSites`, then consume the first actor and tree cases before advertising a general scene module. Keep preview grid, HUD and decorative overlays outside body sorting. A rendered context wall must not independently remain an active ground target. A level/cutaway change should update one presentation result before draw and pick consume it.

## 3. Depth ordering needs full geometry relations and explicit contact, not two endpoints alone

The root's partial-order direction is sound, with a necessary limit: bounds can prove order for separated volumes but do not define the desired image when those volumes genuinely intersect. Two footprint endpoints are useful for a long axis-aligned bed/fence; they are not a complete rule for raised floors, bent wall joints, tools or lying bodies. `view.js:19` and `construction-view.js:159` currently use incompatible-looking scalar offsets around the same anchor sum, so neither encodes those cases.

Introduce `orderVisibleParts(parts, cameraBasis, previousOrder)` as a pure, checked module after presentation parts exist. Projected-overlap broad phase limits candidate pairs; separation relations give a stable partial order; stable topological order resolves it. Cache static relations and update the affected screen neighborhood for moving actors/parts. The tiny current map can begin with a bounded visible set and measurements; do not perform an all-world quadratic rebuild or add a generic ECS to obtain this primitive. Tie stability is required, but an arbitrary tie or cycle fallback must remain a diagnostic, never be called a solved occlusion case.

The [Isometric Blocks reference](https://shaunlebron.github.io/IsometricBlocks/) demonstrates the separation/topological approach and the need to split some cyclic arrangements. Calibrate signs and axes to Hive's actual orthographic camera. Three geometry bounds in world units, not the alpha canvas rectangle, provide conservative ordering volume. Actor bounds cover the current body/tool/carry pose anchored at its feet. A zero-height foot box is insufficient for an actor's head below an upper floor or a carried bundle across an edge.

For the first bed case, record the physical contact meaning before changing geometry. Beds are walkable in `blockedCells`, and rest routes to their anchor. A standing actor may physically intersect the mattress. Sorting alone cannot turn walking through a bed into sleeping in it. If a visual-only fixture requires parts, partition real visible geometry into frame/mattress/cover pieces and retain one site/cost/selection ID. Root's requirement to avoid painting the full bed twice, arbitrary PNG strips or newly exposed hidden faces is correct. A sleep contact adapter should derive from actual bed target/direction and sleep mode; it cannot silently add an actor z-height or change pathing globally.

Delete scalar per-kind depth adjustments only for the consumers covered by the new module; do not strand half of an overlapping scene under an unrelated ordering convention. A bounded mixed-mode transition must define how old unsplit parts participate as one coarse part. First proof is bed plus two actors, both axes/levels, near/far and equal-sum positions, reversed insertion order and a short walk/carry/sleep trace. Stairs/upper floor follow as the next actual consumer. These are compact geometry fixtures; they do not require earning 48 wood through a long browser session.

## 4. Gesture interpretation belongs in one checked controller; adapters only normalize events

The XState machine already has useful phases and persistent-tool cleanup, but the meaning of a release is in `main.js:608–672`: Chop rectangle, herb cell, selection box, bed/stair single cell or wall run. Repeated guards in object callbacks and independent DOM pan listeners complete the behavior outside that owner. Bugs can recur when a new gesture interprets pointerup/right-click differently from the machine.

Extract the actual joined input callbacks into a checked `world-input.ts` controller, keeping one XState actor for gesture lifecycle. It takes normalized immutable pointer events, one camera/query adapter, the current selection/tool preferences and a typed intent sink. It decides ownership before inspecting targets: active pan/captured gesture; armed world tool; idle inspection/selection; idle drafted Go. Cancel-stroke preserves a tool, explicit Done/Escape/right-click exits it, and level/camera changes have explicit existing transitions. Carry pointer identity through a drag and match its release/cancellation; do not let a second touch or stale outside release complete the first stroke.

The Pixi adapter copies event global x/y and modifiers, identifies a visible hit through the existing traversal, and calls the controller. DOM camera capture remains a thin adapter for its captured pointer; it must not also issue game commands or reinterpret the final contextmenu. The existing contextmenu handler can continue suppressing the browser menu. Avoid two listeners both owning a right-click gameplay decision. Choose the exact current behavior as the migration contract before relocating listeners.

The controller owns the canonical immutable stroke description and one `deriveStroke` result for preview and commit. Camera transforms produce selected-level ground cells; inspection uses visible entity parts. These are different queries. Do not “fix” wall hits by inspecting the inverse ground cell, which would make tall visible walls unclickable. Delete duplicated rectangle/drag endpoint and action-selection branches from `main.js` after the controller is the actual caller. Retain existing `rectangleTargetIds` and `dragCells` as pure geometry/target queries, moving ownership rather than adding another stored rectangle.

## 5. Typecheck the real dispatch and effect bodies, and remove the nominal whitelist

`ui-actions.ts:109` has an exhaustive switch, but every accepted case does only `run(action)`. The real handler is unchecked `hud.jsx:runAction`, whose default forwards to unchecked `main.js:effect`. `tsconfig.json` has `checkJs: false` and includes TS files only. Thus the comment that every action is owned by a typed router overstates what is checked. Adding an action to the union and whitelist can still omit its real handler; malformed payloads created by unchecked JS can still arrive. No typecheck was run in this review; this conclusion follows from the actual source/check configuration.

Move the actual controller/store action implementation and actual UI-effect translation into checked TS, with closed `UiAction`/`UiEffect` switches and `assertNever` at the real final handlers. Delete `routeUiAction`'s pass-through whitelist rather than retaining two switches that merely approve each other. Keep Jotai as selection/preferences/immutable display fact storage and XState as gesture lifecycle; another state library would not address the hole.

Separate UI requests from authoritative commands. The current `UiCommand | Command` plus `delete command.actors`/insertion in HUD allows scope semantics to leak across presentation and command construction. A checked `resolveUiIntent(intent, selection, facts): UiEffect[]` should produce exact legal command shapes with shared/personal/drafted scope explicit. The core remains authoritative and revalidates current permissions/material/path state on admission. UI facts provide affordances, not a shadow simulation or a `displayToState` reconstruction.

Moving only a type declaration is insufficient. Move the real world-input producers and effect switch into checked files in the same slice. Mark each remaining unchecked JSX/key producer honestly, then include or migrate its actual action-producing callbacks into the checked boundary before claiming end-to-end coverage. Per-file `@ts-check` is acceptable only when that real file is included and errors are resolved; a declaration file with `any` casts is not. An internal UI callback does not need a Zod parse on every click; Zod belongs at untrusted save/network/config ingress. The union catches development mistakes only where the actual code is checked.

Useful compiler proof is a temporary deliberately unhandled union member and malformed payload in the real producer/handler, each causing the ordinary typecheck to fail, followed by removing the probes. Runtime proof covers actual button, hotkey and world-click paths so a typed but unused replacement cannot pass. No committed test should merely mirror the exhaustive switch list.

## 6. Keep camera and frame lifetime as explicit inputs to all three consumers

`camera.cell` and `camera.project` are already a sensible home for presentation transforms; preserve them rather than introducing a second projection in picking. `art/scale.js` currently couples the world camera to map `SIZE`, rounds projection to pixels, and converts logical level through `STOREY_HEIGHT`. Any future larger world should replace the origin input deliberately; it should not give every input/render consumer its own coordinate convention.

A small immutable `FrameView` snapshot can carry camera transform/revision, selected level, cutaway policy and interpolation point used by drawing and picking for that frame. Use distinct type names for screen point, projected local point and world cell; do not pass an unbranded `{x,y}` as if it were a simulation `{x,z,level}`. Use the same transform snapshot for a gesture observation, and retain exact copied pointer values across asynchronous UI updates. Body render interpolation can be fractional along stairs while authoritative simulation endpoints remain integers; no rounding of the actor's actual state is needed to draw it.

This is not permission to cache entire mutable world frames. Static geometry cache keys include asset/topology and camera orientation; dynamic presentation keys include pose/frame/contact and position. Level/cutaway changes invalidate visibility/picking immediately. A full-camera rotation is future work, and new orientations need matching bake/geometry data before the ordering module can claim them. The current two facing art variants are not arbitrary world rotation.

## Landing order and ownership

1. **Immediate repair:** silhouette predicate on the existing construction/Pixi path, exact visible click versus transparent ground proof, preserve persistent tools/level policy. This does not wait for the broader controller or geometry work and does not change the accepted art pixels.
2. **First deep input seam:** move real gesture interpretation and actual action/effect handlers into checked modules, delete old branches/whitelist, preserve current behavior in focused physical pointer/hotkey tests. One source writer owns this coupled input/HUD/main change.
3. **First deep rendering seam:** extract presentation parts/visibility and apply a bounded order module to the bed/actor fixture, with root review if the actual baked parts or contact pixels change. One render writer owns its coupled adapter/caller; independent readers can prepare fixtures/critique.
4. **Next consumer:** stair/floor/actor overlap and one shared frame transform; measure visible-set candidate pairs and update costs. Do not promise generalized occlusion before these consumers work.
5. Structural 3×3 post support and later collapse remain separate core/persistence outcomes from these presentation repairs. None of this requires a new renderer, ECS library, universal plugin/event bus or a whole-codebase TS migration before the first fixes ship.

Delivery retains source/Git/proof/deploy ownership. This review author wrote only this ignored note and did not issue Delivery instructions. Root may fold these contracts into the accepted tracked plan; source anchors should be refreshed against the writer's candidate at handoff. No current screenshot is claimed fixed here.
