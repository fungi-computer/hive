# Bed contact rendering — personal art disposition, 2026-09-08

I read the actual `src/art/home.js:96` bed builder, `src/art/figures.js:670` figure/sleep caller, the shared camera/bake comparison and its source-bound results. I personally viewed both native comparisons, including `render-v2/native.png`. These are isolated original-art studies; tracked art and the active v7 writer remain untouched.

## Findings and decision

The actual sleeping geometry intersects the bed: Rowan reaches y=.04 and Sedge approximately y=−.02, while the blanket/fold reaches .3275. Shared-camera depth probes retain bed-in-front and actor-in-front interior pixels in both directions. This is separate from the already diagnosed supporting-floor-before-bed ordering bug. Changing one scalar z value cannot faithfully reproduce both ownership directions for these whole sprites.

Lifting the whole figure by .2885 for Rowan and .3485 for Sedge puts its minimum above the entire bedding and removes the measured two-way overlap. **Reject that lift as a finished art correction.** It makes the clothed body lie on top of the blanket and loses the cozy sleeping read. A passing geometric statistic is not art acceptance.

The third comparison draws bed base/mattress/pillow, then the occupant, then blanket/fold/stitches. It is visually promising, particularly with the head exposed. **Select this as the next bounded art/caller direction, not accepted production bytes.** The current prototype hides parts by mesh index against the hashed builder; that is diagnostic code and must never become production structure. It also deliberately changes the overlap composition and is not claimed identical to the shared 3D reference.

## Small next art/caller boundary

Author named bed parts and an explicit covered-sleep presentation. Keep ordinary empty-bed/stakes/frame art and the existing Three → low-resolution bake → Pixi pipeline. Do not alter all walking, work or floor-sleep figures to accommodate this bed. Clothing and hidden limbs under bedding need not be rendered as an exposed rigid body; visible head/hair must retain the accepted character style and rest against the authored pillow.

The contact system, when implemented, remains the one source of provider/slot/phase. The view derives its occupied-bed presentation from that fact. During settled use, one composed bed/occupant representation can own its internal order. Do not clone a person, save a render relation or create a second movement/contact state. The actual sleeper remains selectable through the visible occupant; exposed bedding remains the site target, using the same geometry/picking contract and stable actor/site identities.

A composed contact representation still needs correct external ordering against its actual support floors and foreground objects. Do not fix it by putting all beds above every floor or tree. Entry/exit must return the same actor to ordinary rendering without a duplicate, ghost frame or selection change. The exact pose/part placement and transitions need a compact actual-bake comparison in both bed directions at native and game scale before an accepted patch exists.

This does not solve stair/rail traversal, an ordinary person crossing arbitrary geometry, or a cat sharing the bed top. Those have different support/contact relations and need their own demonstrated interleaving. Retain the depth-sidecar feasibility evidence, but do not convert the world's sprites to unbatched custom meshes for this bounded contact case.

## Evidence limits

`run-u1744` and `run-u1762` completed normally; `render-v1/proof.json` and `render-v2/proof.json` bind the actual source hashes before/after, eight Rowan/Sedge × direction × placement rows and empty browser error lists. Their `passed` field means the capture/assertion command passed, not that these pixels are accepted. The v2 ownership counts still describe the full shared-geometry probe, not a quantitative multipart-vs-reference match. These studies prove no live contact, transition, picking, save behavior or performance budget. No full-home rerun or tracked art transfer is requested.
