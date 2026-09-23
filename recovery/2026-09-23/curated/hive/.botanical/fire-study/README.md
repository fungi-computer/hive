# Original fire art study

Astra authored `fires.js`, `main.js` and `index.html`: original Three geometry, twelve authored phases, fixed low-resolution bake, then Pixi display. The stone-ring campfire, iron brazier and stone hearth have three palettes: ordinary hearthfire, teal witchflame and violet omen. Sparks, translucent smoke and point-light spill are baked art. There is no fuel, fire-spread, heat, gas or damage simulation in this study.

## Scale and scope

- Props: 96 × 112 pixels. Court: 480 × 256 pixels. Shared ground tile: 32 × 16 pixels.
- 108 prop frames and 36 court frames. The court is a composed lighting demonstration; baking a whole animated map is not the proposed game lighting architecture.
- Optional study only, independent of main game startup. Existing shared `bake`, camera and geometry remain owners. No shipped reference pictures.
- Local URL: http://127.0.0.1:5187/.botanical/fire-study/index.html

## Art review

Astra personally read the original geometry/caller and proof script and viewed `proof-v1/01-intended-scale.png`, the complete twelve-phase hearthfire sheet, native witch court and native violet prop strip. The fire silhouettes, rising embers, smoke and colored light are accepted as a first prop direction. Review covers still pixels and authored phase progression; it does not claim watching the uncut five-second WebM.

Proof v1 completed normally (run-u627.scope, native session 21207, exit 0) with original source hashes matching afterward. A proof review found that moving animation could confound palette screenshot comparisons. Proof v2 freezes the same phase for those comparisons; v1 remains recoverable. No art/caller change is required by that evidence correction.

## Repeatable local proof

With the existing Hive dev server running:

```sh
bash /home/levi/src/Botanical-next/.agents/skills/orchestrate-multi-lane-work/scripts/run-proof.sh node .botanical/fire-study/prove.mjs .botanical/fire-study/proof-new
```

The proof uses the installed Chromium headless shell and the ordinary browser library path. Its WebM is canvas motion with timed programmatic palette controls; actual Playwright palette and pause interactions are checked separately. Each evidence directory retains source hashes, native images, phase sheet and results. Delivery owns any tracked-page adaptation, served proof and publication. Local-save delivery has priority over this optional study.

Final evidence: proof-v2 completed normally under run-u658.scope (native session 81227, exit 0). It compares both palette court and strip at paused frame 0, verifies actual canvas dimensions, pause/resume, 108 prop frames, 36 court frames, alpha margins and zero browser errors. All six original/shared source hashes match after recording. Original art/caller bytes are unchanged from the personally reviewed v1 images.
