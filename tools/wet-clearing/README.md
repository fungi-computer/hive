# Wet clearing study

This page uses the actual opaque voxel store, stepped height/cave generator,
finite soil-water owner and original Three camera/light → Pixi bake path.
It supports one generated soil excavation, finite groundwater seepage, camera
turning, a local checkpoint reopen and download. It has no running server world,
overflow, atmosphere, or population simulation.

The source is selected from environment checkpoint `25a3697` onto the existing
playable release `449e9b8`. The study build uses public packed Caps. Its assets
are namespaced so adding it does not rebuild the accepted gameplay bundle:

```sh
node node_modules/vite/bin/vite.js build --config tools/wet-clearing/vite.config.mjs
```

Join `.botanical/wet-clearing-output` into the verified `449e9b8` static artifact,
replacing only `study.html`; every other overlapping path must be byte-identical.
Normal full builds also include `wet-clearing.html` through the root Vite entry.
The deployment continues to use the existing game preview and its ordinary
Wrangler command. Source/unit, rendered interaction and hosted parity are
reported separately. The ongoing engine branch owns later connected flow.
