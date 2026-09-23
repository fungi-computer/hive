# Original foliage wind — accepted isolated study

Game CTO Astra, 2026-09-08. Personally authored and iterated original geometry, then viewed native 1×, desktop 2×, all eight authored canopy/grass poses and captured live-grove phases 0/2/6. The accepted change is gentle canopy drift and soft, unoutlined grass blades. It preserves the current tree style and palette; it is not a completed lighting/palette overhaul or an ecology simulation.

No tracked source, main runtime, Git, build or deploy was changed by this art work. Visible Game Delivery retains integration/publication custody; the v7 release remains independent. The supporting native Terra reader inspected actual bake/view/picking callers read-only and identified disposable geometry and whole-tree ordering boundaries before the study.

## Exact accepted source

- `wind.js` SHA256 `e07d36c977777d5df235281754f7d5af3b69bdda37e30887d2abd0eb714d51db`
- `study.js` `51f93600e605f2f080afe0e95f3f25fa44a56b043f5c9110372a0dc792947ad4`
- `index.html` `250a8b12833579ec29f2694ba2cffaa596adae2401d96113bd5dfae15d83524c`
- `capture.mjs` `e2a705584d1b556939b6dca17f9d3bd8c7a0348992c7a48b98ec109c641341bf`

The complete actual source dependency inventory, before/after equality, alpha bounds, frame hashes and mouse observations are in [render-v3/proof.json](render-v3/proof.json). Native/game-scale render: [render-v3/native.png](render-v3/native.png); additional live phases `phase-2.png`, `phase-4.png`, `phase-6.png`. Static contact strips and actual ticker/pose observations establish the local art-motion result; no video-playback review or joined gameplay motion is claimed.

## Proof and scope

All three invocations used the mandated `run-proof.sh` guard and exact installed headless shell against the existing human Vite server on :5187. Native sessions were retained through terminal completion; no server or peer scope was stopped.

| Evidence | Owned invocation | Result |
| --- | --- | --- |
| `render-v1` | run-u1972; `197a7a1e753347328e226db95f272488`; native 10631 | Exit 1 after 24 body clicks: the final harness background point was below the browser viewport and retained the last selection. Initial grass was also visually rejected as dark sticks. Preserved. |
| `render-v2` | run-u1976; `81c7ce672df64a3e805d63e6cfa9f90f`; native 19888 | Exit 0 after wider unoutlined grass and an actual transparent tree-corner click. |
| `render-v3` | run-u1984; `213170df526e4f3683f25ba21126bf7c`; native 99515 | Exit 0, final source and rendered page. Same geometry as v2; narrowed the explanatory label to “No live mesh baking.” |

Final scope: standing/notched/stump neutral pixels are byte-identical to the current accepted tree bake. All non-canopy wood geometry remains identical across wind poses. Standing/notched and grass each have seven distinct pixel images over eight authored phases; phases 0/4 intentionally pass through the same neutral shape. Stump remains static. Every subject is alpha-contained. All 24 actual tree-body clicks (three stages × eight phases) and one transparent-corner rejection passed. The real cosmetic ticker advanced, pause stopped it, repeated owner disposal was clean, and page/console errors were empty. No main selection, upper cutaway, chop integration, narrow layout or hosted proof is claimed.

The complete gallery holds 29 textures and 2,060,288 raw RGBA texel bytes, including the 640×400 clearing and three separate parity baselines. This is a texture inventory, not measured total CPU/GPU memory or a performance benchmark. Replacing two static tree stages with eight frames each and adding the eight 32×32 grass frames would add 735,232 raw RGBA bytes before CPU/GPU copies, silhouettes and driver overhead. Trees reuse these frames; there is no per-tree art bank.

## Art/caller contract at a future production join

1. Preserve the actual 112×112 prop camera at targetY 1.1 and `propAnchor` for whole-tree sprites. Grass uses the same pixels-per-world-unit, a 32×32 camera at targetY .25 and its separately derived anchor. Do not use the prop anchor for the smaller canvas or resize the grass to fake the scale. Grass is baked without ink, matching the painterly ground family.
2. Produce each wind pose from a fresh scene because `bake()` disposes its input geometry. The study wraps the current original `tree(stage)` and asserts its one six-clump crown; it does not copy tree geometry. A tracked join must pass the crown reference explicitly from its existing factory to the small posing helper, rather than introduce reflective runtime child discovery. Share the actual grass factory between study and main. Do not preserve a second copied tree owner.
3. The production view selects an existing texture and refreshes the existing visible-silhouette binding with the selected pose. Keep the current target ID, transform, depth, tool rules and selected-level alpha. This packet keeps each tree as one complete sprite; it does not solve separate canopy cutaway, foreground-floor ordering or furniture depth. Decorative grass never becomes an input target, job, item or saved organism merely because it has motion.
4. Wind and active chopping are separate cues. Pose only the crown in the baked wind frames; do not rotate the live tree container for breeze. The existing state-driven chop wobble remains the work cue. Ordinary stump art remains unchanged.
5. First production policy: derive a slow pose from the existing read-only fixed tick with a stable tree/placement-ID phase offset, following current body animation and pause semantics. Wind never advances the tick. Paused worlds therefore freeze it without a new clock, saved wind field or HUD updates. The standalone study uses its own cosmetic clock because it has no game state. If a later product decision asks for wind continuing during pause, make that a deliberate presentation-clock change then.
6. Create a small deterministic decorative grass placement list and its sprites once. Do not mutate or re-bake the whole static clearing texture every frame. Keep placement/depth/cutaway intentional for the actual ground-level consumer; avoid obstructing key ground targets or duplicating a second world-generation layer. Art texture ownership destroys each shared texture once; temporary grass materials are owned/disposed after baking. Runtime animation does no new mesh, canvas, sprite or texture construction.

## Ordinary handoff

This source is accepted for a standalone optional foliage study, with source-path/page-layout adaptation and short served input/parity proof owned by Delivery. It can be published at the next useful clean boundary without loading it into main startup or holding the common-transfer release. No second art gate is needed for unchanged geometry/pixels.

The eventual main-view join is a separate small consumer handoff after its files are free. It must include the actual pause/chop/selected-level/picking behavior above and normal art lifetime cleanup; the isolated gallery is not a claim those callers are already implemented. Keep the existing bed/contact and first-brew art batches held for their own consumers.
