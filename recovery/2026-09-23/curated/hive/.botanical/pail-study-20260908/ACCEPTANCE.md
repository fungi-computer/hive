# Original hollow pail and carried-pail art — accepted, held for its consumer

2026-09-08. Astra personally reviewed the source, retained proof, Rowan and Sedge all-eight-phase native sheets, and phase-0/2/6 galleries at native and 2× pixels. The wooden staves, iron bands, open mouth, water surface and one-handed grip fit the accepted figures. No tracked art, simulation, UI or build files were edited by this study. Delivery retains all production custody. This accepted future-vessel asset does not gate the active mixed-storage release.

## Geometry and caller contract

`pail.js` authors one hollow lathed vessel. Its wall profile includes the inner floor at y=.083 and leaves the mouth open. Half/full water planes are .235/.382. The bail is unrotated in the X–Y plane: its endpoints, rivets and X-aligned grip agree. A supporting reader confused the old brewhouse bucket's rotated handle with this source; that reported defect is rejected after direct source inspection, without changing accepted bytes.

`figures.study.js` extends the adjacent accepted figure baseline only with `carry-pail-empty`, `carry-pail-half` and `carry-pail-full`. The same pail geometry follows the right palm, with its grip at local y=.66. The free arm walks normally. These poses contain no axe, wood logs or herb bundle. Existing character geometry, hair and clothing remain the baseline.

Ground uses the existing 112×112 camera at scale1.1 and propAnchor. Carried figures use the existing 80×80 figure camera and pawnAnchor, two home appearances × four facings × eight phases × three fills. A future caller uses frame0 while stationary and animates only while walking through the existing simulation/view timing contract.

One future canonical vessel lot owns its physical location and interior contents. Display derives fill from those contents and draws either the ground pail or the carried figure, never a second pail alongside a carried/ground copy. Art creates no water. A stored-vessel representation, pickup/draw/pour actions, weight, fatigue, spilling and fluid simulation are outside this study.

Sedge's hair/body correctly hides the far-side pail in several phases. All ground fills differ in every facing; carried fill states are not required to remain distinguishable through an opaque character. The inspector can report the actual contents without forcing an x-ray water surface.

At the future production join, extract this pail into one shared art module and replace the old capped study-bucket provider where it is the same vessel. Adapt only the source imports/caller under explicit file custody. Do not replace the current figure file wholesale from this study copy: apply the narrow pose delta against the then-current source. No generic attachment system or per-live-vessel rebake is requested.

## Evidence and exact limits

- Local wrapped proof: run-u2072.scope, invocation28b869d0d9c34aa48ef7a25c3c2419a6, native session22265, normal exit0. `render-v1/proof.json` reports 12 ground images, 24 carried rows/192 frames, 20 adjacent-baseline pose comparisons, 192 grip checks, nine physical body clicks and errors[].
- Grip maximum error is 1.1102230246251565e-16 geometry units. Inner-floor ray and supplied fill heights, nonempty/unclipped alpha, carried motion, ticker advance/pause and disposal checks passed. Physical clicks cover the three ground fills plus two figures × three fills at facing0.
- Existing-pose parity covers ten modes per figure at phase.25/facing0. It is not an exhaustive comparison of every existing phase/facing.
- The recorded source map matches before/after for the enumerated inputs. Shared art.js as a whole was not frozen against unrelated Delivery bakeArt edits; the report separately retains the actual runtime bake and anchor function text. This is not a clean-production-build claim.
- Artifact assembly: run-u2090.scope, invocation03e2b965923242f9a1d6080e50cdc290, native session33150, normal exit0. It composed 192 retained PNGs into two native sheets with zero rebakes; `contact-sheet-inputs.json` records their exact hashes.
- Personal motion review used all-eight-phase sheets and captured gallery phases, with ticker/pause assertions. No video-playback, main-game integration, narrow-layout, hosted interaction or deployment result is claimed.

The prospective shared bank is 12×112×112×4 + 192×80×80×4 = 5,517,312 raw RGBA bytes, approximately5.26MiB. This is image arithmetic, not measured CPU/GPU residency or a runtime performance claim. Reuse the bank across matching appearances/fills; do not allocate it per item. The study's separate baseline parity textures are additional diagnostic allocations.

## Source and evidence hashes

| File | SHA256 |
| --- | --- |
| pail.js | fd66ef82fadff4f4768ad0cfbdfcc98a7389a368296a21c6b24903b2e2cd07b6 |
| figures.study.js | be2933dde621bf8de3a80ec7a419540a46a848441c65415cc06b97b4774c84ba |
| figures.baseline.js | f6e9743dad6aec1b166e6482d775d5e0a83583c84ed1ce5a3914af6014fac0f1 |
| figures.baseline-study.js | e3b19a82f8940fa05b4721bbe877f8ef44612388dbd6d0849c93016629866165 |
| study.js | 39d51c892a540cd17830317d0a75740bd6cb5d54ac9151f7eb60039633dc455c |
| index.html | 222d0913b1afb0ecad5d548d887fc062e9db35b57b5bc47a81c15e499fe6d409 |
| capture.mjs | efc04d3566075c816743bf088ad41bcf55261d29b8e6e16ebfaeb9b4ca91faed |
| assemble.mjs | d74396851b1c49d07b1e78030babe5f2a24449121abf3f9ac975efcee831c536 |
| render-v1/proof.json | 0f1c0a14174e508fee61c99724187429971e56d30b4c7d9aa025c824422a5a2c |
| render-v1/contact-sheet-inputs.json | f400e3974103db307c58cc81e448bd86495070d3c30371c582f79713eaae40c9 |
| render-v1/rowan-all-phases-native.png | cc256df057eb0c7b4d9cc4cde4090d77794f9d90a5c436807ef3b1870b4e86c8 |
| render-v1/witch-runner-all-phases-native.png | c0b6fca1bf0d5702997c15eac111e49f83b91eb4b1c61d860c739e0835453b97 |

Disposition: accepted held original art. Production extraction and joined physical-vessel proof belong to Delivery when that consumer is ready. Current mixed storage continues without this integration or another art approval gate.

## Current Fill Kettle consumer handoff

Later2026-09-08: root re-read the joined `drawActors` and `bakeArt` caller. The
source/cache/ground-pail join still lacks the accepted carried-pail poses, so a
physical held pail falls back to the ordinary mode/idle figure. Current figures
SHA f6e9743dad6aec1b166e6482d775d5e0a83583c84ed1ce5a3914af6014fac0f1
matches the accepted study baseline exactly. The shared `src/art/pail.js` already
exports the same accepted `pail` and `PAIL_GRIP` geometry.

Root prepared `carry-art-integration.patch` against only `src/art/figures.js`:
SHA fc96880418dd8254940081a2895de4098cdab1977ad9e629f2411b5c0bba7588.
Resulting candidate SHA ce1b5a30aa0c165c83573495506f4c643c95f0bf3bcb7b801a43ea4a582bb718.
It is the accepted pose delta with study imports relocated and ordinary formatting;
no original geometry correction or new art gate. `carry-integration-inventory.json`
records baseline, accepted study, candidate and patch. A wrapped Prettier API call
u2556/c2c7a0cfe0bb491cbec2a21b33809989 exited0. Earlier relative and absolute
`.bin/prettier` launches failed before execution with Permission denied; no file
permission was changed, and neither failure is claimed as formatting evidence.

Delivery owns serial application. Add the supported carry-pail poses to the
existing bank; choose empty/half/full from water inside the actual carried lot's
vessel container, frame0 when stationary and ordinary frames while walking.
Current draw/pour is an atomic material effect, not a new animation entitlement.
The held pail must remain visible through its corresponding carried pose;
ground rendering already filters physical ground location. Ordinary idle/motion
must not display an axe while this vessel is in hand. Preserve paused geometry
and the one physical ID. Joined input/served proof stays with Delivery; unchanged
accepted art does not need a repeat of the old192-frame study.
