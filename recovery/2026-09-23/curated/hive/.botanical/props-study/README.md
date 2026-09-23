# Original witch-workshop props study

Astra personally authored and reviewed this study on 2026-09-07. It is isolated
from the two-person home release and lives only under ignored `.botanical`.
Game-delivery retains tracked source, Git and deploy custody.

## Look and source

`props.js` builds original cauldron geometry with bubbles and steam, five potion
colors in three bottle profiles, a pouring beer keg and mug, a stocked bookshelf,
an open chest, and a belt with an axe, flask and pouch. `main.js` uses the actual
accepted `bake`, camera, geometry helpers and figures, then composes the resulting
low-resolution textures in Pixi. Rowan and Bramble show the intended relative
scale. No reference images, third-party meshes, or new dependencies enter it.

The camera remains a 32x16 tile diamond. Props are baked at 80x80 with a
ground-point anchor. Four static facings are exported for every prop. Cauldron,
keg and belt have eight front-facing animation samples. These are not four-facing
animated equipment sets. Belt placement on Rowan is a visual attachment study,
not an equipment/inventory implementation.

## Local review

Run the ordinary `npm run dev`, then open:

http://127.0.0.1:5187/.botanical/props-study/index.html

The existing dev server can serve this page; no separate server was launched.
The public game preview does not contain this study yet. Its future publication
is game-delivery's decision after the current release, without a new art gate
for these unchanged accepted pixels.

The ordinary proof command is:

```sh
node .botanical/props-study/prove.mjs .botanical/props-study/proof-next
```

On this host automated proof launches wrap that command in the established
`run-proof.sh` scope, with the existing headless-shell and browser library env.
No host-specific path belongs in future tracked game code.

## Reviewed evidence

Final evidence is `proof-v4/`: full-page game-2x pixels, native workshop and
individual-prop sheets, all four facings, eight-phase contact sheet, an actual
browser recording, and `proof.json` with the source hashes.

Astra personally opened the final native facing and motion sheets and the v2
game-2x workshop image (same final geometry/palette). The books are visible,
bottle colors separate, and the prop silhouettes fit the accepted small people.
Motion poses were inspected as frame strips. This does not claim an uncut video
was watched. Final browser proof observed phases 0–7, pause stability of the
phase, unchanged source hashes during capture and no page errors. Scope
`run-u440`, invocation `7fbf6d5a81f14ba896c641c60bed4605`, exited normally with 0.

Earlier evidence is retained:

- v1 (`run-u434`, exit0) exposed a visual caller defect: phase0 was passed as the
  bookcase contents flag. It also showed too little color through the stylized
  bottle body. Both were corrected before art acceptance.
- v2 (`run-u435`, exit0) contains the corrected stocked shelf and colored bottles.
- v3 (`run-u437`, exit1) caught readiness preceding the initial animation frame
  (the observed set contained -1 plus 0–7). Startup now draws frame0 and renders
  it before exposing ready. The final proof passed with that correction.

## Gameplay boundary

Bubbles, foam, a thin pour and a floor puddle here are visual poses. They do not
simulate volume, brewing, inventory, fluid flow, or material transfer. Later
gameplay should own vessel contents/capacity and conserved transfers between
vessel, cup and floor. Shelf displays should reflect actual occupied slots;
book identities remain distinct from a reader's learned knowledge. Assets must
not introduce a second material or job authority.

This is a first original art pass ready for a bounded study integration. It is
not a request to add brewing, storage, equipment or fluids to the home release.
