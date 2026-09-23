# Real occlusion disposition — 2026-09-08

This extends the existing HANDOFF and tracked `19b324b` disposition with observed geometry, not a runtime patch. Root authored the isolated oracle and personally viewed its normal ID render. Existing game source, baked art, live writers and preview remain unchanged.

## Why the new evidence changes the next action

Aggregate AABB overlap cannot distinguish conservative bounds from genuine interleaving. The oracle renders original opaque subjects separately and together using one actual orthographic camera. Every mesh uses an unlit subject ID while preserving original geometry/transforms/front-face coverage. Explicit mesh `renderOrder` is reversed for a second combined pass, with depth testing/writing still enabled; changed-owner pixels are excluded. A one-pixel erosion of both isolated masks distinguishes interior evidence from edge/contact noise.

For a pair whose shared interior rays have both stable owners, drawing either whole sprite last cannot reproduce those sampled geometry interiors. That is a positive limitation witness, not an inference from bounding boxes. Single-owner evidence applies only to the sampled pose/camera and does not prove all animation phases.

| Real case | Stable shared interior samples | Disposition |
| --- | --- | --- |
| Tree / Rowan | Tree wins 241; Rowan 0 | Earlier ambiguity was conservative for this static pose. Preserve existing foreground tree behavior; an alphabetical fallback was visibly wrong. No tree-part requirement follows from this case. |
| Bed / sleeper, direction 0 | Bed 56; sleeper 161 | Genuine two-way sampled occlusion. Whole-sprite ordering cannot exactly match. |
| Bed / sleeper, direction 1 | Bed 51; sleeper 156 | Same limitation in the other facing. |
| Ramp / actor, entrance | Ramp 19; actor 16 | Genuine two-way sampled occlusion. |
| Ramp / actor, midpoint | Ramp 16; actor 5 | Genuine two-way sampled occlusion. |
| Ramp / actor, landing | Ramp 3; actor 4 | Both owners remain, though the witness is small. No full-motion claim. |
| Floor / bed, both directions | Bed wins all shared interior samples | Supports the bounded semantic floor-before-bed rule. One edge pixel on each foot-floor pair favored the floor before erosion; do not claim exact continuous/depth-buffer equality at that contact. |

No paired sample changed owner under the explicit draw-priority reversal in this run. All 12 cases fit the common 320×224 view without clipping. Original subjects are opaque front-sided Lambert geometry; the oracle rejects unsupported material assumptions. It is not a general transparent/material shader oracle.

## Delivery direction

Keep the already-reviewed small shared-depth integration bounded to the actual floor/support/bed consumers after safe caller custody releases. Preserve existing tree behavior. Do not promise that this will solve sleeper/rail interleaving, and do not ship the prototype's arbitrary unresolved order.

The difficult follow-on now has a concrete consumer: a ramp occupant must appear between its far structure and near rail. Candidate treatments are narrowly authored render parts or a depth-bearing sprite representation. Root is inspecting installed renderer support/cost before selecting that change. Neither choice is authorized as an unreviewed broad renderer rewrite. The physical bed-contact/navigation problem remains separate. The oracle also cannot decide whether an authored intersection is visually desirable: feet penetrating a sloped deck may need pose/contact correction, while a blanket covering a sleeper may be intentional. Inspect that intent before treating exact geometry visibility as the required art result.

The oracle is diagnostic Three rendering only. It does not replace the actual Three → low-resolution bake → Pixi game pipeline. It excludes sprite crops/anchors/rounding/ink, tree rocking, alpha blending, full animation matrices and population/per-frame cost. Original cached materials are not disposed or changed; only fresh subject references and diagnostic materials/geometry are released.

## Evidence

- `run-u1648.scope`, invocation `55f4725931c741db8feb3f58cd107239`, retained native session 48754, normal exit 0. All 12 cases captured; source inventory unchanged; errors empty.
- `oracle-v2/proof.json` SHA256 `2e798cd1db6216999a15cc1dfe4c8f31bb7fe358de6f5779bfacba014d142d71` contains source hashes, isolated/shared counts and witness coordinates.
- `oracle-v2/normal.png` SHA256 `f58cfea6271e88bb8ec59cebb4d917a8879081baf73ea437127061d53431cac9` personally viewed.
- `u1645` was an initial proof-script syntax failure before any browser; `u1646` / `oracle-v1` is preserved preliminary output without eroded-interior classification. Neither is final evidence.
- Independent review: `.botanical/research/render-occlusion-oracle-review-20260908.md`. Root applied its required explicit draw-order control and material/coverage checks.

No deploy, live gameplay fix, full-depth solver or performance acceptance follows. All owned scopes ended normally.
