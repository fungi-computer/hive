# Hair trim / tool grip source review

Reviewed baseline `1993508` and isolated hashes: `before.js` `ec69c39a`,
`figures.js` `4489f7c`, `main.js` `3074bf26`, `prove.mjs` `4e53654a`.
`before.js` matches tracked `src/art/figures.js` except for its necessary relative
geometry import.

## Disposition

No material source blocker found.

- The shared human `workGear` change is geometrically connected. The palm mesh is
  centered at local `y=-0.025` (`figures.js:85-87`), and both tool groups now use
  that center (`:181`, `:187`). The mallet shaft spans approximately local
  `y=+0.08..-0.28`; its head spans `-0.1925..-0.3075`, so shaft and head overlap.
  The axe shaft spans `+0.08..-0.36`; its head spans `-0.27..-0.39`, and its
  x extent includes the shaft. The copper cap also overlaps the mallet head edge.
  Negative local Y continues beyond the fist along the arm chain, so build/chop
  animation inherits one connected tool from the working palm instead of placing
  the head at the palm. Rowan and Sedge use the same helper (`:155`, `:530`); no
  visitor geometry changed.

- The hair delta is confined to `copperHair`: root width/depth become 90%, height
  86%, base tilt and phase sway are reduced (`:535-543`). Sleep retains its
  special single-frame flattening by multiplying the trimmed Z scale by 0.28
  (`:544-547`), rather than overwriting the new root scale. It is intentionally
  smaller than the baseline sleep silhouette, but preserves the same flattening
  ratio and fixed orientation. Rowan, visitors, and cat do not call this helper.

- The production contract is unchanged: `figure(kind, phase, direction, pose)`
  still returns one Three scene (`:647-676`), while the study imports the actual
  `bake`/`anchor` and 80 px camera (`main.js:3-35`). Production likewise bakes
  eight frames for all Rowan/Sedge modes and one sleep frame into the same nested
  Pixi texture shape (`src/art.js:65-100`). There are no pose names, counts,
  directions, anchors, textures, or wall-clock owners added by this delta.

## Evidence limits / advisory

- Existing `proof-v2-grip/proof.json` matches the reviewed hashes, reports 10 px
  minimum alpha padding for every Sedge pose/facing, eight distinct non-sleep
  frames, one sleep frame, and stable paused pixels. The numeric padding loop is
  over Sedge's all-mode matrix (`prove.mjs:107-150`). Rowan build/chop/idle are
  baked across phases and facings by the immediate study caller, but Rowan's
  padding is not separately asserted. Because the tool helper and bake camera are
  shared and those closest Rowan modes are present, this is an evidence boundary,
  not a source defect.

- Inherited behavior remains: `workGear` supplies the axe for every pose other
  than carry, sleep, and build (`figures.js:158-190`), including idle, walk,
  pickup, and deliver. This change fixes that tool's grip; it does not decide
  whether wood-handling poses should display an axe. Treat that as an art/product
  choice if it is visible, not an integration regression from this delta.

