## Picking geometry and diagnostic drawing: current execution recut

Game CTO direction, 2026-09-08. This is an implementation recut for the existing picking/module plan and issue #12, not a new geometry framework or a second renderer. Levi requested visible clickboxes after repeated mugwort misselection and correctly identified missing shared geometry ownership. Game Delivery acknowledged recutting its existing `debug_picking_overlay` lane before the first edit; it retains sole integration/Git/deploy custody. The independent atlas lane continues.

### What is confirmed

The earlier structure repair landed cached alpha-silhouette hit testing in `art.js` and `construction-view.js`. The wider picking migration did not reach all consumers. `view.js` still assigns plants `Rectangle(-18,-34,36,38)` and loose bundles `Rectangle(-18,-30,36,34)`. Plant textures change with stage while their hit rectangles remain fixed. Actors/trees have further bespoke rectangles.

Levi's reproduction: clicking the visible farther standing mugwort selects the nearer diagonal object/loose bundle; only clicking above the farther plant selects it. Preserved screenshot: `.botanical/research/picking-debug/mugwort-click-repro.png`, SHA256 `3e53f0b8f3d180f823a6e1437d591f83f1e316c36e1c94839bbf6db853dc6b33`. Source diagnosis, not a completed browser reproduction: both the sprite and hit rectangle share the same projected parent. A foreground bundle rectangle reaches 30 native pixels upward while a (+1,+1) neighbor's anchor differs by 16 pixels vertically, so transparent hit padding can overlap the rear plant. The existing Pixi event order can therefore pick that foreground rectangle. The herb/bundle handlers pass captured object IDs directly through main to HUD; no inverse-cell error is established by this read.

Do not move the art or alter world coordinates to compensate. Keep this open until real visible-body clicks identify the correct objects.

### Required owner and caller simplification

One visual geometry/picking module owns a resolved local hit shape, anchor/texture-orientation identity, semantic target ID/kind/level, refresh/invalidation and disposal. It supplies the actual Pixi hit predicate and its diagnostic geometry from the **same record**. The caller supplies the render object's current appearance/transform and target; it must not separately remember to update another rectangle after a stage or facing change.

- Reuse/extract the existing baked-silhouette representation and cache; do not add repeated GPU readbacks or rebuild alpha masks on pointer movement.
- Keep actual Pixi display transforms and the established event path. No second global picker, hand-coded camera inverse or independent event dispatch.
- Migrate construction, herbs and bundles, and audit/migrate the remaining object-picking definitions under explicit policies. A deliberate target extension is distinct from opaque sprite pixels and must be diagnosed as such. Do not silently preserve accidental foreground click theft as an accessibility feature.
- The debug view must show the **actual current** hit shape, including any remaining rectangle; drawing an ideal silhouette that the picker does not use would conceal this bug.
- Display geometry, pick geometry and physical footprint/support/navigation are related but distinct queries. Alpha pixels never become walking obstacles. Depth order remains the established rendering owner; debug can display its value without changing the sort.

### Excalibur decision

The inspected source pin is `4a23dd1674b1771a88bbbf9e7f20bcd772e264c4`. Its [debug helpers](https://github.com/excaliburjs/Excalibur/blob/4a23dd1674b1771a88bbbf9e7f20bcd772e264c4/src/engine/graphics/debug.ts) provide points, lines, shapes and text with a frame-scoped queue. Its [DebugGraphicsComponent](https://github.com/excaliburjs/Excalibur/blob/4a23dd1674b1771a88bbbf9e7f20bcd772e264c4/src/engine/graphics/debug-graphics-component.ts) accepts a draw callback and transform policy. The [DebugSystem](https://github.com/excaliburjs/Excalibur/blob/4a23dd1674b1771a88bbbf9e7f20bcd772e264c4/src/engine/debug/debug-system.ts) depends on its engine, scene, component and graphics systems.

Adapt the small drawing interface using existing Pixi Graphics/Text. Do not import Excalibur, its shaders, static global queue or ECS for this. No source is copied in this recut; any later literal reuse retains the upstream BSD notices. This is source inspection, not an Excalibur runtime benchmark.

### First debug consumer

One scene-owned noninteractive overlay, default off, controlled by a typed action in the existing key/help catalog and an accessible Caps menu control. It shows actual clickable geometry in one color, visual sprite bounds in another, an origin marker, and the resolved/dispatched target ID/type/level. Copy retained pointer coordinates; never retain Pixi's mutable event point as evidence. Optional footprint/depth displays may follow only through existing geometry owners.

The overlay receives no pointer events and cannot alter selection, gestures, simulation or saves. Reuse graphics/text; bound displayed records/labels; disabled mode has a fast path. Clear stale targets on removal/reset and dispose handles with the view. If paused, diagnostics still update with camera/input and accepted presentation changes.

### Focused acceptance

Review the first shared record plus immediate construction/herb/bundle callers before expansion. Show which duplicate shape/update code disappeared. Independent source review checks transformed coordinates, mask parity, stage/facing refresh, lifetime, event ownership and touched Fallow findings.

Use a short diagonal plant/bundle fixture: exact visible-body selection for planted/growing/ready and foreground loose bundle, transparent padding rejection, legitimate front-object occlusion, a structure silhouette, pan/zoom and selected-level behavior. Compare overlay on/off at identical pointers; same target/command outcome and no paused tick advance. Include one real armed-tool gesture to establish that diagnostics do not intercept input. A stage/texture transition must update both hit testing and overlay from the same geometry record. No full-home harness or new original-art approval gate.

Delivery may append this reviewed recut to `docs/decisions/current-systems-review-and-module-plan.md` and associate the existing #12 report at its next safe checkpoint. Keep scope/status explicit: shared geometry and debug are now active work; the mugwort correction is not shipped merely because the cause is understood.

## Current co-located goods follow-up,2026-09-08

The shared silhouette module is present in current38c8928. Root personally viewed `.botanical/mixed-storage-v8-final-20260908/local-final/failure.png` and read the exact source with one bounded independent reader. The trace earned six wood, completed a shelf/three walls and harvested two herbs, then missed lot-1 through seven physical probes. This is incomplete storage interaction evidence, not a completed shelf loop. It does not prove every wood pixel is inaccessible: the probes mainly sample above the low pile, and their saved selection field omits the actual competing target.

There is nevertheless a real ordinary-player weakness. `activity.ts` creates wood at the felled tree's cell; `view.js` draws wood at depth offset.22 and the still-interactive stump at.95. Two logs sit around height.12 while stump/roots/chips occupy the same origin up to about.44, using the same prop bake/anchor. Pixi's reverse draw hit order favors overlapping stump pixels. Correct opaque silhouette handling therefore does not solve access to visually obscured co-located goods. Do not relabel this as the earlier transparent-padding error or globally raise all piles above foreground objects.

The bounded player correction is a small reusable current-ground-goods query/list inside the existing stump inspector. Show actual lots at the stump's exact x/z/level, e.g. “Wood ×2”; each row targets its real lot ID through existing `inspect-lot`, then the existing material inspector and Store command. Derive rows from current display facts, retain one `inspectedTarget` and copied point, and leave resource admission with materials. The list disappears or updates when goods move. It provides an explicit choice instead of a hidden through-opaque picking rule. Later stockpile/cell inspectors can reuse that same small list; a global target-cycling framework is not required now. Factor the component rather than adding more material policy to the already large Target function.

A separate lifecycle defect is confirmed: wood display removal destroys its container without `picking.remove`, while herb/bundle removal unregisters first. The visual geometry owner retains destroyed wood records in a strong Map. Unregister before destruction; preserve all other view/reset cleanup. This is a real lifetime correction, not the explanation for the still-present lot's failed selection.

Delivery owns the visible UI writer, focused source/input correction and publication. A short check of the actual stump→current-goods row→material inspector→Store path and disappearance after movement is sufficient; no new art geometry or full home-building run follows from this disposition. Preserve the prior failed trace and distinguish subsequent source/unit/interaction claims.
