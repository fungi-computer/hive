# First-brew supplies — accepted original art

Astra authored and personally reviewed this small batch at native pixels and 2× in all four facings on 2026-09-08. The current accepted grain sack and closed keg remain reusable unchanged; this batch fills only the missing crock, station tray and source-cache geometry. No tracked source, simulation, inventory, brewing, repair or deployment change is claimed.

## Production caller contract

- `barmCrock(parent)` is a closed, cloth-covered reusable catalyst. It needs no yeast quantity, liquid interior or independent fermentation simulation in this slice. Its material lot owns identity and location.
- `spentGrainTray(parent, filled)` supplies a shallow fixed station tray. The separately named `spent-grain-contents` child is enabled only by actual spent-grain goods in the station's fifth destination. The empty tray has a physical floor; the filled appearance is a representation of the one-unit output, not a second lot.
- `brewerCache(parent, sealed)` occupies one ground cell. Its lid remains opaque in both states; the seal/brace marks unavailable versus repaired access without implying a quantity of supplies inside. It remains when depleted. Runtime derives the state from the real finite feature, and actual contents appear in the existing inspector. The figure is not a new player-placeable storage crate or a second source of stock.

All use the existing shared light rig, 112×112 prop bake, camera target1.1, `anchor(camera)` and quarter-turn convention. Base geometry fits within one cell in X/Z. The existing physical source footprint/path policy remains the simulation authority. These static props have no new animation, water or process owner.

At the real integration handoff, extract these primitives into one shared art module and adapt the original study/production consumers to it. `suppliesScene` and the viewer/report are ignored study wrappers, not a parallel production bake. The existing `grainSack` and `cask` in `src/studies/brewhouse/props.js` can be moved unchanged to the same relevant shared art seam when needed; do not copy their bodies into separate runtime and study owners. No second art gate is needed for unchanged accepted geometry. Production stage/content/anchor/picking and its focused joined proof remain Delivery's responsibility.

## Evidence

Final owned asset-only run **run-u2234.scope**, invocation **e56cb4cf59744aecaba3cf3ea2689fbe**, retained native session49992, normal **exit0**. `render-v2/proof.json` records:

- Twenty static bakes: five states × four facings, shown at native and 2×.
- Nonempty unclipped alpha for every frame and distinct supplied states in every facing.
- Actual ray contact with the tray's inner plank floor at Y≈0.0685; only `tray-spent` includes the named contents child.
- Twenty physical mouse clicks on visible bodies select the matching item; a blank point selects the background through the actual cached alpha-silhouette hit area.
- Owner disposal removes its Pixi canvas; repeated disposal is harmless. Source hashes before/after match, and page/console errors are empty.

Final hashes:

| Artifact | SHA256 |
| --- | --- |
| props.js | 615d7b596b225a36b577e48b58f55c5045fc4b735e25a0d06f5da80f85ef8563 |
| study.js | e05ab8eaffea8188e37656c3c4a9153c77e4a9b8681ac7aaad4b281a6b815bbe |
| index.html | c8bf37777977c073659d4e400a6238cceceb796437be6dfa6cdb138c481ad1e9 |
| capture.mjs | 66ea4b7a25afe9339a2416c9fb5ba9e3c0c39768b9e6c103417efbb316c650d8 |
| render-v2/proof.json | b5f2ce79aaf5c99f4d7586b7ec03d494e96bf724100c20772992f6a8cae92615 |
| render-v2/native-and-2x.png | 002bf66f2cd31edd49ead96100df98e3cd045291eaa3c130740fa54494112f13 |

V1 run-u2232.scope, invocation354e06a7416f4fc58efc0e7fc06e11bf, native81316 also exited0. Root requested a darker spent-grain fill after personal viewing; its exact four authored inputs are preserved under `render-v1/source`, along with its original output/proof. V2 changes only that contrast and its output destination. The current acceptance covers no main-game integration, carrying animation, narrow layout, gameplay action, hosted page or hosted interaction.
