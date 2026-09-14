# Clearing terrain artwork

Original Three.js geometry in `terrain-patches.js`, using the maintained
`geometry.js` lights/materials, `prop-camera.js` camera and `bake.js` rasterizer.
No AI bitmap generator, copied tiles, runtime depth texture or new simulation.

The art-only exporter is `scripts/export-terrain-art.mjs`. It creates an atlas,
frame/anchor manifest, contact sheet and a landscape assembled from those exact
packed frames. Run it through the maintained proof wrapper with provisioned
Chromium/libraries and strict port 5187. It closes its own browser/server.

## Layout contract

- 64×64 frames, anchor (32,32), nearest sampling, transparent padding.
- World X projects right/down, Z left/down; one metre steps (16,8) pixels.
- Surface top is local y=0. A display patch is centered on the common corner
  of four physical cells, spanning one metre. It does not replace voxel identity.
- Bits 1,2,4,8 select NW, NE, SE, SW cover. All 16 masks are exported for each
  of grass, exposed rock and damp earth, with three deterministic fleck variants.
- Diagonal-only cover stays disconnected. Separate base earth fills every patch; no
  hidden physical connection follows from a rounded painted edge.
- Cliff frames are vertical faces centered at local y=0 at their top. Normal
  +Z is facing 0; quarter turns give +X, -Z, -X. Each stratum is .54 m deep.
  Earth/stone strata can repeat; rooted grass lips belong only at grassy tops.
- Every facing is rendered with the same world light. Do not rotate baked
  images to manufacture missing facings.

## Integration limits

The manifest is an authoring handoff, not a second installed game loader or
accepted game save format. Move accepted frames into the maintained art bank
through its owner when integrating the terrain consumer. Its existing versioned
manifest/parser owns runtime loading. Do not regenerate the entire old bank to
view these assets.

The preview deliberately authors a path and patches to judge artwork. It does
not implement the Rust generation changes, traffic wear or encampments. It does
not qualify live digging, cutaways, tree occlusion or three-material junctions.
The binary sets have transparent backgrounds. Draw earth first, then grass,
damp ground and rock masks from the same four authoritative samples. General
world-consumer integration and its three-material cases stay in packet section I.

Cliff art keeps geometry extents small; it supplies no new collision/picking
shape. Actual exposed faces, height and cutaways remain authoritative. Palette
choices do not alter mineral yield or moisture state.

Reference for the dual-grid arrangement (independent original implementation):
https://github.com/jess-hammer/dual-grid-tilemap-system-godot
