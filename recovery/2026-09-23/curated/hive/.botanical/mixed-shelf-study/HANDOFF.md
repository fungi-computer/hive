# Mixed shelf original-art handoff

Astra authored and personally reviewed, 2026-09-08. **Ignored-only preparation; no tracked source, gameplay capacity or inventory change.** Delivery retains tracked source/Git/build/publication custody. This does not gate the active v7 wood/herb migration.

## Accepted original pixels and API

Reuse the approved `shelf` shell, actual `woodPile(1)` meshes/end grain and `mugwortBundle` geometry. The new module only arranges those goods inside the existing open bay. It does not create another item definition, contents store, work path or geometry copy.

`mixedShelf(profileKey, direction)` returns a Three scene. Ten bounded visual profiles cover empty, single wood/herb, every two-item grouping and every three-item grouping, with directions 0/1. Unknown keys/directions reject. The one-herb profile calls the actual approved filled shelf and is **pixel-identical** in both directions. All other profiles have distinct native images. Current camera remains `camera(112,112,1.1)` with the existing prop anchor. No simulation state or animation lives here.

The profile array and every entry are frozen, so callers cannot expand the finite matrix through mutation. Independent Sol source/caller review found no mesh/light/lifecycle blocker. At the future live bake join, alias legacy shelf `finished`/`filled` to the equivalent `empty`/`herb` textures; do not bake identical legacy and new versions twice. Other construction stages remain unchanged.

The profile records describe **shown items, not shelf capacity**. The later canonical contents selector may choose at most three actual representatives from physical stored lots, retaining diversity and stable order, and show exact grouped inventory quantities plus explicit undisplayed count in its UI. Never draw a wood/herb representative that is absent, infer physical stock from a texture key, merge identity/provenance to make a thumbnail, or treat these ten examples as the eventual capacity policy. Current one-bundle live behavior remains until the mixed-storage slice is authorized for integration through its usual contract.

This study uses native bake canvases for asset comparison. Later live integration goes through the existing `bake` → registered silhouette → Pixi sprite path and derives the visual key from actual container contents. Do not build dynamic geometry every frame, preload a Cartesian product of future item kinds, replace the picking owner, or flatten the live world into a baked scene. The exact future main-bake hookup is not part of this patch.

## Evidence

Root personally viewed all ten profiles × two facings at native pixels, both enlarged turn views and the narrow layout. `render-v1` is preserved. `render-v2` changed only public key lookup/import preparation; final `render-v3` freezes that checked catalog. All twenty final pixel hashes equal the personally inspected v1 images; enlarged turned and narrow views were also personally reviewed from v2.

Final asset-only command used the mandatory proof runner and exact installed headless shell/library path. **run-u1592.scope**, invocation `e63c8bdc74a441dba0956a98646f6ac9`, **normal exit 0**. `render-v3/proof.json` SHA256 `1ec0568d1da4e0f1ef060615072c761ff56fcb75b02c7747884a882aa4659fb6` proves 20 nonempty/unclipped bakes (minimum alpha margin 28px), ten distinct profiles per facing, exact single-herb reference equality, physical Turn/return, 390px document containment, zero page/console errors, unchanged source hashes. The native strip intentionally has its own horizontal scroll area on narrow viewports.

This is local dev-served asset/interaction evidence, **not** a production build, hosted proof, changed gameplay or a new simulation law. No full-home suite or art motion run is needed for static unchanged poses.

## Exact patch custody

`art-integration.patch` SHA256 `cc718870e812779e9b649844536bc637b795f113cfdb42bb198fb39730824bad` adds exactly:

- `mixed-shelf-study.html`
- `src/art/mixed-shelf.js`
- `src/studies/mixed-shelf/main.js`
- `src/studies/mixed-shelf/style.css`

`source-inventory.json` records candidate hashes; `candidate/` holds the exact target files. Imports are remapped from the isolated caller to the existing source modules. No existing geometry/runtime file is modified. The proposed standalone entry reuses the brewhouse study's existing `bakeCanvas`, not another production bake owner.

Delivery may add the ordinary Vite entry and `/study` discovery link and publish this optional study when a coherent release slot is free. Its served join owns resolving the remapped imports and one short asset/turn check plus exact hosted bytes. No second Astra gate for unchanged accepted geometry. Live mixed-shelf rendering remains a later explicit caller join alongside real capacity/withdrawal; keep this study off main startup.
