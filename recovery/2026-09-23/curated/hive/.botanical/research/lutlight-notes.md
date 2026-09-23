# LutLight2D reference inspection

Inspected 2026-09-07 by Astra at `fc346b267069ff7557d8bf0dd19f411beab064ba`.
Primary source: https://github.com/NullTale/LutLight2D/tree/fc346b267069ff7557d8bf0dd19f411beab064ba .
Read README, package manifest, MIT license, Runtime/Shaders/LutLight.hlsl and the relevant GenerateIndex/Bake/material setup in Runtime/LutGenerator.cs. Tree receipt: lutlight-tree.json; generator read saved alongside this note. No code/assets copied into shipped source.

The generator assigns the RGB lookup volume to authored palette keys, then creates a LUT table for each lighting grade from PNG color ramps. The shader samples by sprite RGB plus scalar light brightness; its smooth path blends neighboring grades. Runtime color-space conversion and point sampling are explicit. The package relies on Unity URP 2D lighting/Shader Graph; it is not an npm/Pixi lighting engine. Ramps can include alpha, permitting darkness-only accents.

Useful adaptation to our actual source: src/art.js already bakes original Three geometry through a fixed nearest-neighbor texture, while src/view.js currently draws a simple translucent dusk rectangle. A small future night study can replace that presentation overlay with an authored palette/LUT pass and a small light field, using Pixi's existing Filter/GlProgram owner. Do not add another renderer or per-frame JavaScript pixel recoloring loop. Inspect actual palette matches from the current bake before choosing a lookup resolution; shaded RGB output is not already an indexed palette.

First visible proposal: one clearing patch, Rowan/Bramble, one warm hearth and an eerie lantern. Compare daylight, violet-blue night and local magic light at intended scale, keeping the current label/UI pass unaffected. A hand-authored emissive mask permits bright runes/eyes; glow should remain restrained enough to read silhouettes. The scalar brightness interface does not by itself mix arbitrary colored lights: choose a small explicit light-color/ramp treatment in that study, rather than claiming the Unity implementation already supplies it. Wall/floor occlusion and gameplay vision remain separate owners and are not proved by a colored circle.

Source deletion test: replace the existing dusk presentation where the study earns adoption; do not layer a lighting scene graph, material editor, shader framework or simulation scheduler over the game. No new lighting implementation is part of the controls release.
