# Shelf firewood correction — accepted original art

Levi's 2026-09-08 feedback: the three-wood shelf reads as tiny sticks; it should look like stacked firewood. Astra personally authored this bounded correction and reviewed native, enlarged diagnostic and actual study-scale pixels in both directions. This supersedes only the wood-containing visual profiles of the previous accepted mixed-shelf study.

## Changed appearance

Wood has a fixed chunky diameter and short shelf-fitting length, dark faceted bark, a broad solid cut face and one restrained split mark. One/two/three wood are arranged as one log, a bottom pair, or two logs with a third resting above. Wood no longer shrinks as the number of contents rises. Mixed contents keep a clear wood stack beside the tied herbs. Herb-only arrangements and the approved shelf shell remain byte-identical in all eight corresponding frames.

The earlier reuse of the thin loose-pile meshes plus per-item shrinking caused the reported problem. The correction uses the existing shared mesh primitives/material cache to author a shelf-scale log inside `mixed-shelf.js`; it does not change the existing live loose-log or actor-carry art. No cloned materials, second renderer or geometry mutation of shared source scenes is introduced. Existing bake disposal remains the owner. Profile keys, two directions, camera/anchor and public API remain the same. Profiles are still shown representatives, never physical capacity or quantities inferred from artwork.

## Exact one-file patch

Apply `.botanical/mixed-shelf-firewood-20260908/art-integration.patch` only to `src/art/mixed-shelf.js`.

- Baseline SHA256: `e9652c323f9423b2508befcba434fdb675e83b9ead212aeb06722f19bfffbfbb`
- Candidate SHA256: `0cec741a743c0d4bf9498eba9d85b420376f351a2af2c0e78088c88a9fc52e3e`
- Patch SHA256: `f4c8b681f681af164a5881b3ab12a6f035461d25c3a457dd150089233627f0c6`

`candidate-mixed-shelf.js` contains exact production imports; `source-inventory.json` includes the baseline, candidate and changed/unchanged frame sets. Tracked baseline was still untouched when the handoff was written. No study markup/style/main startup, inventory or simulation changes belong in this patch.

## Proof and disposition

Preserve render-v1 and render-v2 as preliminary attempts. The rings in those attempts remained too noisy at native size; render-v3 has simplified solid end grain and is the accepted candidate.

Final owned asset-only proof: run-u1614.scope, invocation `8b54c63b08b04af38d36cf885371045b`, retained native handle 49759 through normal exit 0. `render-v3/proof.json` SHA256 `6cb1579246ff53ecb00311896d129a599b55a733493cfdade7ff3e0bc5c34f21`: twenty distinct/nonempty/unclipped frames, minimum alpha margin 28px, exact accepted single-herb references, physical Turn/return, 390px containment, errors empty, source unchanged during proof. Comparison against prior accepted render-v3 confirms exactly twelve wood-containing frames changed and all eight empty/herb-only frames stayed exact.

Personally viewed `all-profiles-native.png`, `three-wood-detail-6x.png` (nearest-neighbor diagnostic enlargement, not a different asset), and `normal-2x.png`; the earlier full turned page and final native sheet cover both directions. Static props need no motion proof.

Delivery accepts tracked integration and publishes the same `/mixed-shelf-study` consumer with ordinary build/served hash checks. No second Astra gate for unchanged candidate bytes and no gameplay/full-home rerun. This local dev-served evidence is not yet a hosted claim; Delivery reports the exact published revision when ready. The active wood/herb migration and World Lab work continue independently.
