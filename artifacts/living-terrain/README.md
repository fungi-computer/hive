# Original living terrain art — September 17 study

This pack contains original editable Three.js artwork and baked PNGs. Reference
images remain outside the pack under `/home/levi/iso_tile_*.png`; no reference
pixels were used as textures. Nothing here changes the live renderer or simulation.

## Contents

- `living-terrain-atlas.png`: 198 transparent 64×64 frames, 16 columns.
- `manifest.json`: frame rectangles, pixel anchors, geometry bounds, footprint
  placement metadata, bake provenance and source/output SHA-256 hashes.
- `living-terrain-masks.png`: all masks, heights, conditions and seeded variants.
- `living-terrain-scene-native.png`: 512×320 review scene using existing goblins.
- `living-terrain-scene-3x.png`: nearest-neighbor enlargement for visual review.
- `living-terrain-pixi-2x.png`: the same baked scene displayed through ordinary Pixi.

Source: `src/art/living-terrain.js`, `src/art/living-terrain-authoring.js`.
Export: `node scripts/export-living-terrain-art.mjs [output-directory]` with the
existing project dependencies and a Playwright Chromium executable. Set
`CHROMIUM_PATH` when using a non-default browser. Use the repository proof wrapper
on the shared host. No package installation is required.

## Consumption

Bodies have their top at local y=0 and extend down 0.54 m. Grass has its roots at
y=0; it does not contain dirt. Short/full share the same seeds and clump layout;
short is 46% of full height. Green/dead reuse exactly the same vertex geometry,
with different material palettes baked into their textures. The dead variant is
straw/brown, not a separately generated plant. Variant is 0, 1 or 2.

Select `grass/{green|dead}/{short|full}/{variant}/{mask}`. Corner bits are NW=1,
NE=2, SE=4, SW=8. Mask 0 is intentionally transparent. The visual patch center
lies halfway between four physical cells: offset (+0.5,+0.5) from its northwest
cell center. Use same-height compatible surfaces for a top patch. Choose variants
from stable world identity. Do not select new random geometry each frame.

Create a nearest-sampled Pixi texture from the manifest frame and set normalized
anchor to (0.5,0.5). Place it at the projected patch root. Footprint and bounds are
art metadata only, with the existing footprint placement shape. This study
manifest is not a new production static-pack schema. An eventual pack integration
should register these definitions through the existing pack owner and ordinary
sprite sorter. This export does not prove gameplay occlusion, picking or growth.

The court includes full/short grass, a dry corner, exposed winding earth path,
stone slabs, raised ledge, shallow pit and three unchanged Goblin models. It is a
static authored scene baked with the shared camera and light. The whole-scene PNG
is a review artifact, not a proposal to flatten runtime terrain into one picture.

## Checks and limits

Export rejects clipped frame borders and unintended empty tiles. The geometry
law checks every green/dead pair across 16 masks × 3 seeds × 2 heights, proving
identical positions and changed materials. Native and enlarged renders are
personally reviewed. No per-blade runtime entities, special grass ordering,
front/back layers, new mushrooms, or new characters are included.

Grass and stone have deliberately small native silhouettes (one metre projects
about 32 pixels wide). These are an initial original art set, not the entire lush
garden: flowers, trees, water, lighting effects and playable integration remain
outside this pack. No game deployment was performed.
