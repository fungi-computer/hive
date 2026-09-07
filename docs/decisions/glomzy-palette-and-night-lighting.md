# Glomzy 07 and authored night lighting

Game CTO direction proposal, 2026-09-07. This records Levi's new palette reference and the actual LUT status. No production art, shared Caps source, game shader, dist or deployment changed for this review. Upstairs → brewing remains the delivery priority. A later bounded visual comparison can run independently under Astra's original-art custody.

## Recommendation

Use [Cactus Celery's Glomzy 07](https://lospec.com/palette-list/glomzy-07) as the proposed foundation for an authored game-world palette. Lospec lists 40 colors; the author's description combines gloomy and cozy. Astra opened the palette strip and the author's first example image. The muted greens, warm earth colors, plum shadows and blue/violet accents fit Hive's accepted cozy/dark direction. This is a proposal to test on actual game art, not acceptance of a full recolor or a requirement that every rendered frame contain exactly 40 RGB values.

The palette offers enough range for a serious baseline. Begin the comparison using its colors; add a justified small extension only when actual native-pixel evidence shows a missing skin, material or luminous accent. Do not casually expand back to unrelated colors for each asset. Color roles and their light-to-dark ramps matter more than the raw count.

Suggested roles, subject to the actual scene:

| Role                                | Candidate Glomzy colors                    |
| ----------------------------------- | ------------------------------------------ |
| Deep outlines and shared shadows    | `#2a202a`, `#473c47`, `#483355`            |
| Wood, earth and warm material ramps | `#694744`, `#865d56`, `#a7776b`, `#dc995d` |
| Living greens                       | `#3b6b58`, `#6f975e`, `#a8b164`            |
| Moonlight and cool environment      | `#524f73`, `#7e8aa7`, `#9db8c5`            |
| Occult accents                      | `#613661`, `#823e69`, `#b6607c`            |
| Warm highlights                     | `#dec575`, `#d9d3d9`                       |

Do not infer complete material ramps from this grouping or force all skin tones into one ramp. Our existing proportions, geometry, expressive hair, animations and accepted figure style stay the reference for the comparison. Apply disciplined background saturation/value separation so characters, work targets, water edges and doors remain legible. Small high-chroma potion/fire/portal accents should have room to stand out.

## Actual status and why the current picture can feel uneven

Source checked at local HEAD e7e26e3:

- `src/view.js` still creates a full-world rectangle in `0x252342` at alpha `0.3` and toggles it with `isNight`. This is a dusk overlay, not LUT lighting.
- `src/art/geometry.js` uses warm fixed Three lighting and Lambert materials; `src/art/clearing.js`, `figures.js` and prop geometry choose separate literal colors. `src/art.js` then bakes shaded RGB pixels and applies an outline color. The resulting textures are not palette-indexed simply because their source materials have named colors.
- `/fire-study` demonstrates original warm/green/purple fire geometry, animation and a baked court lit by Three PointLights. Its source does not implement the proposed runtime Pixi LUT/light field.
- The retained `.botanical/research/lutlight-notes.md` inspected upstream commit `fc346b267069ff7557d8bf0dd19f411beab064ba`, shader, generator, manifest and license. The Unity package has not been imported or ported into the playable game.

The source supports a likely contributor to the polish gap: independently chosen material colors are all shifted by a warm bake, then night adds one uniform tint. A palette alone cannot fix silhouettes, local contrast, aliasing or poor light separation. This is a diagnosis to test with the same rendered scene, not a claim that a recolor has already improved it.

## Palette and LUT are one art decision

LUT means lookup table. [NullTale's implementation](https://github.com/NullTale/LutLight2D#--how-it-works) gives colors authored shading ramps and selects from them according to a lighting texture. It is built for Unity URP/Shader Graph. We can adapt the technique to the existing original Three → low-resolution bake → Pixi path; it is not an npm lighting library to install.

The proposed pipeline is:

```text
authored material colors + fixed bake
  → one controlled bake-to-palette mapping, preserving shade structure
  → stored sprite color keys/shades
  → Pixi lookup using authored light ramps and a small world light field
  → emissive details and unaffected readable overlays/UI
```

This does not require baking the character again at every hour. Bake or classify the needed appearance once, then shade its pixels on the GPU. Resolve how palette keys/shades are encoded with an actual small study; avoid bolting a material-ID renderer onto the whole game before that evidence. A global nearest-color conversion can collapse two materials onto one color and lose information, so inspect ramp membership and silhouettes rather than assuming an automatic quantizer is sufficient. The existing sunny shading also cannot be physically relit from every direction without additional information; the first goal is convincing stylized color/light changes, not invented dynamic normal or shadow data.

Day, dusk and night should be authored relationships: shadows can move toward plum/blue while fire keeps nearby surfaces warm. Start with one warm hearth and one eerie green/violet light plus ambient moonlight. Upstream's scalar brightness input does not alone solve mixing arbitrary colored lights; choose an explicit small light-class/ramp policy, overlap behavior and emissive treatment. A purple realm can choose a different ambient treatment while recognizable materials and people retain their identity.

Strict palette membership and smooth interpolation are different output policies. Ramps sampled in discrete steps can retain a fixed set of colors. Blending lighting grades/time-of-day can intentionally introduce intermediate colors. Compare both for banding, flicker and readability; do not claim a 40-color screen while interpolating freely. Premultiplied alpha edges and color-space conversion need explicit handling so outlines do not halo or darken twice.

HUD/text/Caps theme, selection/placement affordances and simulation visibility remain separate. World grading must not retheme shared Caps components, hide blocked placement or decide whether a character can see a target. A luminous rune is not heat, smoke or gameplay vision unless its simulation definition separately says so. Physical environmental fields can drive a visual light source through a presentation adapter; pixel glow cannot mutate those fields.

## Small useful next art proof

One fixed actual-game composition: Rowan/Sedge/Bramble and a goblin, grass/tree, wood wall/door, shelf/herb, liquid/potion, filth decals, a warm fire and a magical light. Keep the existing geometry and camera. Compare:

1. Current daytime as the baseline.
2. Glomzy-based daytime with deliberate material/value separation.
3. The same Glomzy scene at dusk/night, with hearth and magic-light overlap.

Inspect native/game scale, dark/light character and material readability, short transition/moving-light footage, stable edges and the same unchanged UI. Record source/palette/ramp hashes and output dimensions. Measure the added render cost on the scene; no 100-person performance claim follows from this. Keep it isolated and publish a discoverable comparison on the authorized study preview when a real rendered candidate is ready. Replace the old dusk overlay only after the adapted effect passes its actual game caller review; do not stack it underneath a second unexplained darkness pass.

Delivery association: existing issue #11 and current art/night paragraphs in PROTOTYPE/ARCHITECTURE. Preserve prior LUT research and fire studies; label research, baked fire demonstration and unimplemented runtime lighting accurately. No new board or source assignment is implied by recording this note.

Review downloads are retained at `.botanical/research/glomzy-07-reference/{palette,example}.png` with their original URLs recorded above. They are reference images, not copied production art.
