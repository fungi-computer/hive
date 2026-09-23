# Render-depth architecture checkpoint — 2026-09-08

Root personally authored and reviewed this ignored-only study. It changes no tracked game source or original geometry. Delivery retains Git/build/deploy and the current coupled v7 writer. This is evidence for the existing spatial-presentation outcome, not permission to replace the renderer with an unreviewed prototype.

## What is established

The actual `building`, `wallJoint`, `tree` and `figure` Three builders feed numeric envelope capture, then the existing exported `bake`/`anchor` and ordinary Pixi sprites. The local browser fixture compares current anchor ordering with proposed constraints. Root personally viewed `render-v2/native.png` and the preceding full-size local rendered sheet.

- Both real bed facings reproduce the reported floor-over-foot failure. Two finished upper floor surfaces ordered before their supported bed remove that visible failure.
- Both sides of the bed, the lower actor / upper floor / upper actor chain, and a wall corner have actual separated-envelope constraints.
- Sleeping bodies, the foreground tree and all three ramp traversal samples remain explicitly unresolved. The tree fallback visibly puts Rowan in front of its canopy. **Do not ship that fallback.** Ambiguous aggregate bounds do not prove meshes interleave or that parts are always necessary.
- Floor/bed mesh coordinates differ from their intended shared datum by float32 error (~7e-11 world units). A named support contact supplies that tie. Increasing geometric epsilon to invent separation is rejected. A support producer must establish a finished surface and its actual occupant from the existing footprint/support facts; this fixture supplies explicit known contacts.

The proposed owner should combine conservative candidate discovery, proved world-space constraints and narrowly typed semantic contacts. One rank result is shared by rendering and Pixi picking. Capture matching texture metadata before bake disposal, select it with the actual pose/facing/stage/joint mask, translate by `visualPosition` including fractional storey traversal, and remove both existing independent scalar-depth owners at integration.

## Limits that shape the production recut

1. This prototype compares all pairs, uses projected **AABB** hulls and creates scratch arrays. It is a bounded feasibility fixture, not the final hot path or a population benchmark. Actual integration must use visible screen candidates and cached bake metadata, with measured counts/cost and lifecycle invalidation.
2. Raster outline, actual texture anchor, sprite rounding and screen-space tree rocking must be included at the actual caller. World AABBs alone are not the complete rendered silhouette. The existing alpha picking owner remains authoritative for hit pixels.
3. Near-contact without an explicit semantic fact stays uncertain. The support exception assumes the current above-surface camera and rejects non-datum geometry; stakes and penetrating poses cannot silently acquire the finished-floor rule.
4. Sleeping contact and stair rail overlap need focused actual pixel inspection. Keep the existing behavior for unresolved cases until a reviewed relation/part treatment exists. Do not solve bed transit permissions by sorting or add a global bed/level zIndex bonus.
5. Cyclic/blocked graph reporting exists but this fixture does not exercise a true cycle. Whole-scene insertion independence is checked for settled order, not as a promise of identical diagnostic-array serialization.

Useful next production exit after the safe view/art caller handoff: the two upper bed footprints remain correctly visible from both directions, foreground tree behavior is preserved, active floor/picking metadata agree, and existing sleep/stair behavior does not regress. A later finer treatment must be justified by an unresolved real case rather than broad rendering expansion.

## Evidence and preserved attempts

- Numeric actual-builder proof: `run-u1640.scope`, invocation `8762ddecd3ad40caa03f91bceffdbb23`, normal exit 0. Twelve cases, explicit expected edges/uncertainty, insertion and signed translation laws. `proof-v2.json` SHA256 `0adc0972b27a1208399da4d6d1e209c8639609a535a1d6fa1795703ae8e9ac6b`. ~219ms including original mesh creation on the shared host; no capacity claim.
- Local actual-bake/Pixi browser: `run-u1641.scope`, invocation `3558ba829d8b4fa4b816ebfec61045e2`, retained native session 83612, normal exit 0. Twelve rendered fixtures, envelope toggle, 390 containment, source hashes unchanged, errors empty. `render-v2/proof.json` SHA256 `bcac00d7f2b9850fdc87eb2dc529eefa368f5799f99bcaa501bb8b46ccabed80`.
- Native rendered sheet SHA256 `b6940dd0ce6cc6185ef2fade2d3b37e9a57f375cd6c1c421bcc409270f8e7c38`.
- `u1634`/`u1635` exit 1 exposed numeric datum overlap; `u1636` exit 1 rejected the incorrect assumption that aggregate tree/actor envelopes separate. `u1637` was preliminary relation exit 0. Tool output is retained; no claim the first attempt passed.
- `u1639` browser exit 0 established real screenshots/control checks, but its `render-v1/native.png` read the cleared WebGL framebuffer and is blank. Preserve it as failed native readback. Final capture renders and copies in the same browser turn and verifies non-background pixels. No v1 native-pixel acceptance.
- Independent native reader supplied `.botanical/research/render-depth-math-review-20260908.md`; root applied its strict-separation, ancestor visibility and expected-unresolved corrections.

No gameplay, hosted interaction, deployment, complete occlusion solver or renderer-performance acceptance is claimed. All root-owned proof scopes above ended normally; no live writer/server was stopped.
