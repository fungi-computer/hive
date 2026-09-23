# Devil study source review — source-observed 2026-09-07

Reviewed stable study hashes: `figures.js` `c9449aef`, `main.js` `f383e84d`, `prove.mjs` `6e118899`. The supplied proof-v1 records exit 0, stable hashes, native `80×80` sprites/`480×260` court, all eight observed walk frames, frozen pause pixels, facing 4/4, and `errors: []`. This review did not rerun it.

1. **Current geometry bug — imp offers a piece in every advertised pose.** `imp()` hard-codes its left arm as `"offer"` and creates a chess piece without a pose guard (`figures.js:262-264`). Therefore its `idle` and `walk` frames retain the raised offer gesture/piece, even though `demon()` bakes all three requested poses (`figures.js:351-363`, `main.js:19-37`). Small repair: pass `pose` to both arms and create the piece only for `pose === "offer"`, as the Devil already does (`figures.js:185-187`). Proof-v1’s padding/hash report does not make this semantic distinction, so it can pass with the bug. Milestone: the imp’s idle/walk sheets no longer show the offer piece; offer still does.

2. **Current control/report mismatch — pose and turn do not apply to both comparison figures.** The lineup title/control says “Turn the figures” and exposes idle/walk/offer, but Rowan and Bramble only have one baked idle comparison texture (`main.js:39-49`) and always fall back to it when selected pose/facing/frame changes (`main.js:112-120`). The demon trio does follow selection. This is not a reason to add fictional Rowan/Cat offer art: smallest repair is to label them as fixed idle references and scope the control copy to the demons, or, if parity comparison is the decision, bake only supported existing poses/facings. The scripted court is correct: it intentionally takes each demon’s `offer` frames (`main.js:84-99`) and the lineup controls do not alter it.

3. **Proof scope is honest about pause and walk, but not full pose motion.** `prove.mjs:74-100` proves all eight *walk* frames and freeze/resume after the click. It only clicks idle and offer then waits 140 ms (`prove.mjs:102-113`); `textureReport` records hashes/padding for all frames but asserts only padding (`prove.mjs:115-176`). If this becomes an animation acceptance gate, add a semantic assertion that each claimed animated pose advances through frames and that the intended pose-specific prop state differs. Until then, proof-v1 supports frame allocation, walk playback, pause, facing and error-free load, not expressive distinction of idle/offer.

## Strengths to retain

- The study keeps its intended boundary: original Three geometry → canvas texture → Pixi, with a single temporary Three renderer. `bake()` disposes per-scene geometries and the study disposes the renderer after texture creation (`src/art.js:24-38`, `main.js:50-52`); the retained Pixi textures are the live tableau/lineup data, not an accidental per-tick allocation.
- The 3×3×4×8 demon frame contract is direct and inspectable (`main.js:19-37`), with cooperative yielding once per facing. The proof’s native canvases and facing/phase sheets are proportionate art-review evidence, not game simulation scaffolding.
- Pause reporting is now truthful: ticker updates stop when `playing` is false (`main.js:137-145`) and proof samples after the pause click before comparing both frame and court pixels (`prove.mjs:87-100`).

No chess system, simulation loop, gameplay state, broad startup optimization, or additional renderer layer is warranted by this tableau review.

## Astra disposition for v2

Accepted the control-scope finding: Turn now names visitors and the surface
explicitly labels Rowan/Bramble as still scale references. The imp's arm now
uses its actual pose instead of hard-coding the offer motion. Keeping its chess
piece in idle/walk is intentional character design (a page carrying a piece),
so prop disappearance is not a required law. Root will inspect the changed
idle/walk/offer pixels and final source hashes in the v2 evidence. The v1 proof
is preserved; no uncut-video or hosted acceptance is inferred.
