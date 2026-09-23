# Ration art acceptance — 2026-09-09

Astra personally reviewed `static-v2/native.png` and `static-v2/scale.png`.
These are original Three geometry through the existing production bake/camera:
bread and cheese on folded linen, the same parcel held by Rowan and Sedge, and
an eating pose that raises the food toward the face. Existing hair and unrelated
work poses are preserved.

`run-u3597.scope` / invocation `24460684dd964b31a4ccf423da393da9` exited 0.
The 66 actual bakes cover both people, carry/eat, four facings, and phase extrema
0/2/4/6, plus one/three loose rations. Every bake retains a transparent one-pixel
border; browser errors are empty. This establishes those rendered samples at
native and 2x presentation. It is not an all-eight-phase or continuous-video
motion claim. Earlier failed full-recording attempts and v1 evidence are retained.

Accepted source SHA-256:

- `src/art/food.js`: `0dddf4a2fff74481426b2fa8bf3e99cb34f60557e524534cb83cf63bd76fb3c6`
- `src/art/figures.js`: `1fb2bc079c1717c997aeedf3a1b95cbdbd2eb6a3a14c2a7656d6eb761f8d7786`
- `src/art.js`: `2db6286f2efd33f5e0b5bc27c7400c509a38ecbe7a28ec265b5e6f995efc98e7`
- `src/view.js`: `722ecd609b9bdce92f79efb32a3c8a8ec5f1535596ce275d2e3e2f58012a526c`

The caller derives a parcel from the actual held ration lot; `consume` selects
eating, and stationary carry stays at frame zero. Ground goods retain persistent
lot identity and picking. No display-only food, inventory or clock is introduced.
The joined care/runtime/save/browser acceptance remains separate and pending.
