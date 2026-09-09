# Living ground: grass, soil and water art direction

Game CTO review, 2026-09-08. Levi supplied the Isometric Jumpstart references and asked for durable inspiration notes while water/soil research continues. This is an original-art brief and future presentation contract. It does not replace the current playable sprint, implement crop ecology, or claim that the new fluid experiments are deployed.

## What was actually inspected

Astra personally opened `iso_tile_cover.png`, `iso_tile_export.png`, `iso_tile_scene2.png` and `iso_tile_scene3.png`. The supplied `iso_tile_master.aseprite` was inspected structurally: 512×320, RGBA, one timeline frame, with separate export, example-scene, grid and template layers. Its individual scene layers were not rendered. The export sheet contains multiple visual variants; the single Aseprite frame does not establish an authored animation sequence.

| Reference | Useful visual lesson |
| --- | --- |
| Cover scene | Dense grass clumps protrude above and beyond the ground diamond. Dark roots and brighter tips establish volume. Moss joins grass to stonework, and vegetation softens the water channel without hiding its course. |
| Export sheet | Ground tops, exposed sides, grass edges, stonework, water surfaces, bridge pieces and small accents form a reusable vocabulary. Dry and green treatments retain readable shapes. Top surfaces and vertical drops can be composed separately. |
| Scene 2 | Dry, straw-colored vegetation changes the mood using coverage, silhouette and value as well as hue. Strong dark rock masses leave the brightest accents for the lava. Lava is a contrast reference, not proposed ordinary water behavior. |
| Scene 3 | Stacked examples make top, side, underside and liquid boundary distinctions obvious. Water needs an intelligible body and edges rather than a floating blue diamond. |

Keep Hive's softer original forms, character proportions and readable work targets. The reference's individual-pixel detail is not a requirement to make our entire screen busier. Take the clustered silhouettes, material transitions and clear construction of volume; author new geometry, arrangement, colors and motion.

The five supplied files remain outside the repository, under `/home/levi/`. They are private references, not public study assets, texture inputs, distributable source, or material to crop/recolor into an atlas. Levi reports having checked the license and requests openly shared original work without selling these art assets. The complete license/creator record was not supplied with these five files, so this note does not certify additional redistribution rights. Our implementation route is original Three geometry and original baked output; retain the source so the new art can be shared under the project's applicable terms. Private file hashes are recorded separately, without copying the assets into Hive.

## Grass should have a readable body

Start with a small family of original clumps: short turf, broad lush grass, dry wiry grass, rushes/reeds, and moss around stones. These are asset families over a shared placement/rendering mechanism, not five vegetation simulations.

- Build a clump from curved blades or leaf ribbons with a dark, dense base and a few broad highlights. Group several blades into a readable shape at native pixels rather than attempting one independently animated sprite per blade.
- Let selected fringe pieces overlap a ledge or extend above a tile edge. Keep the walking surface and exposed earth face readable. Moss and roots can bridge materials without drawing a bright seam around every tile.
- Use a few stable, seeded differences in height, lean, density and silhouette. Choose placements from global cell/patch identity so regeneration, camera movement and chunk arrival do not reshuffle the grass.
- Use quiet areas deliberately: paths, workspaces, door approaches and inspection targets need visual breathing room. Dense grass should make a meadow feel lush without concealing all dropped goods.
- Anchor wind at the roots. A short baked loop can bend the upper clump with a small phase offset between nearby patches; avoid synchronized rows and whole-sprite sliding. Cosmetic wind cannot advance plant growth, consume water, or change collisions.
- Separate low ground cover from taller foreground clumps when actors must interleave with them. Do not flatten a whole raised patch into one image and then attempt to fix all overlap with one arbitrary z-index.

In our pipeline, the runtime billboard is the baked Pixi sprite. We do not need a second live Three renderer to obtain bushy grass. Author and bake the original clump geometry, then place and animate a bounded set of shared textures through the existing projection/depth/picking owners.

Reuse the already accepted original foliage work recorded in `.botanical/foliage-wind-study-20260908/ACCEPTANCE.md`. Its eight authored poses include gentle crown drift and soft, unoutlined 32×32 grass, with a separately derived grass anchor; 112×112 whole-tree art retains `propAnchor`. This new reference should deepen that vocabulary, not discard the accepted source or reset its review. The accepted isolated study does not establish a main-game foliage join. Its main-view contract freezes wind with the existing fixed tick while paused, refreshes silhouette bindings when tree poses change, and allocates no new geometry/textures during animation. Preserve those decisions unless a later explicit caller change replaces them.

## Soil type, wetness and fertility are different facts

Levi wants soil differences to matter and to be visible. Plan separate mineral/organic substrate, current water, nutrient availability, surface cover and plant condition. A fertile bed can be dry; a wet bed can be nutrient-poor or waterlogged. Wetting does not turn one geological soil type into another.

For many crops the desirable condition is moist soil with room for air. More water is not an unlimited growth bonus: persistent waterlogging can deprive roots of oxygen. Crop definitions should describe tolerable conditions and stress duration, with wetland species responding differently. This follows the distinctions between saturation, available water and drainage in [University of Minnesota Extension's soil-water guide](https://blog-crop-news.extension.umn.edu/2019/01/soil-water-basics-for-irrigation.html), and the root-oxygen consequences described by [University of Maryland Extension](https://www.extension.umd.edu/resource/wilting-vegetable-plants). Those sources support the direction, not calibrated Hive growth coefficients.

| Condition to communicate | Original visual treatment | What must own the fact |
| --- | --- | --- |
| Dry surface | Lighter earth, sparse straw-colored tips, exposed soil; cracking only for a suitable material | Soil/surface state and vegetation condition |
| Moist, aerated garden | Darker matte earth, healthy established leaves; no automatic instant grass growth | Root-zone water suitability plus organism growth |
| Waterlogged ground | Dark wet patches, occasional surface sheen where water is actually present; stressed ordinary crops after exposure | Soil water and plant response; later oxygen transport where implemented |
| Marsh edge | Rush/reed silhouettes, interrupted open-water patches, softer organic bank material | Habitat, established plants and physical water surface |
| Fertilized/mulched bed | Visible mulch/compost amendment and later crop response | Finite applied material and nutrient/process owner |
| Worn ground | Flattened/sparse cover and exposed earth | A future wear/vegetation state, not the camera or render frequency |

Surface color reports surface conditions; crop suitability reads its root zone. A damp top layer must not imply that all deeper roots have water. Fertilizer is finite material applied through ordinary work/material ownership. Any later nutrient release, uptake or leaching belongs to explicit nutrient/organism transport rules; it is not a decorative green multiplier or a second water quantity. No new fertilizer or recurring gardening runtime is authorized by this art note.

The current isolated soil reference owns finite water stocks in rigid pores. Its `poreAirM3` diagnostic is available **vented pore volume**, not measured oxygen, finite air mass or gas pressure. The latest 27-cell moving test establishes small lateral/vertical exchanges and restart, not a coupled root oxygen model. Do not label that diagnostic “oxygen available” in a study UI.

## Water needs several appearances over shared physics

Use composable visual properties rather than a separate solver or a giant texture family for every water name. Depth, motion, bed material, suspended matter, surface cover and lighting can affect the presentation independently. Derive supported properties from the actual solver/state; label authored visual examples where the corresponding physical property does not yet exist.

| Example | Appearance to study | Important distinction |
| --- | --- | --- |
| Clear shallows | Readable sand/stone bed, restrained blue-green tint, a few moving highlights | Seeing the bed depends on depth and clarity; blue is not proof of clean drinking water |
| Quiet deep pool | Darker body, broader reflection patches, limited shoreline motion | Depth comes from geometry/water, not the chosen shade |
| Flowing channel | Surface marks aligned to real velocity; brighter disturbance at genuine falls/obstacles | Animated foam alone does not prove current, discharge or energy loss |
| Silty runoff | Muted brown/ochre body and reduced bed visibility | Suspended sediment, if simulated, is distinct from dissolved nutrients or contamination |
| Organic pond/bog | Dark tea-colored water, patchy plant cover, softened margins | Organic color is neither a safety indicator nor a universal stagnant-water rule |
| Flooded ground/puddle | Shallow irregular water over the existing ground, readable inundation edge | Actual free water is distinct from moisture inside soil pores |

Keep shore masks and transitions tied to the shared world geometry and surface location. Render exposed sides only where there is a real drop, bank or cutaway; ordinary water does not form a freestanding cube just because the source sheet has stackable examples. Solid terrain remains stepped, while a liquid free surface may move continuously inside that volume.

Use the [Glomzy/night-lighting decision](glomzy-palette-and-night-lighting.md) for coordinated material ramps, muted backgrounds and sparse bright accents. Water hue, wet earth, selection rings and figures must remain distinguishable at dusk. No independent blue wash or brightness shader should erase the night palette or the depth cues.

## Actual caller and ownership fit

Source inspected for this brief: `src/art/clearing.js` authors the static clearing ground, sparse edge vegetation and tree geometry; `src/art.js` bakes the whole clearing into `art.ground` and separately bakes props with the existing camera/anchor. `src/view.js` places that ground image, then separate ordered bodies; `src/art/scale.js` owns projection. There is not yet a dynamic grass-and-soil presentation module merely because these reference tiles exist.

The useful eventual extraction is a ground-cover presentation owner: it receives a bounded visible geometry/condition snapshot, derives stable appearance choices, and updates only changed patches. The simulation retains water, substrate, nutrients and organisms. The existing visual-geometry owner retains positions, silhouette picking and depth relations. Decorative blades should not intercept clicks intended for a plant, bundle or tile.

Illustrative future composition, not current API names:

```text
world geometry + soil water + established vegetation + amendments
    -> read-only visible-patch snapshot
    -> material/cover/wetness appearance selection
    -> shared original atlas + stable clump placement + cosmetic wind
    -> existing projection, depth, picking and authored lighting

watering/fertilizing/harvesting command
    -> existing work + material/process admission
    -> authoritative physical/ecological change
    -> changed snapshot above
```

Keep atlas size and variation bounded; avoid multiplying soil × wetness × season × every wind phase into a full Cartesian set of baked tiles. Combine compatible low ground patches into cached draws and retain separate tall pieces where ordering requires them. Release cached textures/containers according to their actual ownership, and record draw/texture/overdraw costs before claiming this scales to a large world. Offscreen plants do not stop existing or grow differently because fewer sprites were drawn.

## First useful original-art study

After the current heavy simulation outcomes, extend the accepted original foliage vocabulary into one small comparison court with a dry path, moist garden, overwatered ordinary crop, reed-lined shallow channel, dark pond, exposed bank and mossy stone. Place the same accepted witch/cat and a loose bundle in it to judge scale, overlap and target readability. Compare a sparse and a bushier treatment. No supplied reference pixels enter this page or its public downloads.

Show static condition labels and an optional wind loop through the ordinary Caps study navigation. This first court is an **authored appearance study**. A later playback can consume the actual soil recording, showing its subtle measured changes rather than inventing a dramatic flood. A physical crop/water/gas claim needs a separately accepted joined simulation.

Acceptance: inspect native and game scale, short motion, day/night material separation, tile-edge joins, actual alpha bounds, click-through of decorative cover, and disposal/reset. Keep current characters unchanged. Record original source and bake hashes; publish only the original assets and study through Game Delivery's same-preview ownership. Link existing issue #11 (art/grass/lighting), #14 (horticulture) and the environmental/world-generation decisions rather than creating another planning framework.
