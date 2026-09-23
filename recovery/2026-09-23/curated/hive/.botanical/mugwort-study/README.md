# Mugwort original-art handoff

Current status: accepted art and gardening gameplay are shipped at feature head `3895bd13f0359e91394e7006755e980cd03ed7e2` (runtime `f707b1999db82b8c3e869ff60f0e2fdfffc15b6d`). Astra verified the remote ref, committed art, current proof script/dist hashes, read the hosted proof and render/input caller, and personally viewed ready/bundle/narrow frames. Bounded release acceptance and its limits are recorded in `source-inventory.json`.

Astra accepts these four static art stages on 2026-09-07: `planted`, `growing`, `ready`, `bundle`. I personally viewed `proof-v2/strip-native.png`, `field-native.png`, and `field-game2x.png`, read the actual proof and geometry/caller, and verified all nine before/after hashes still match disk. The seedling was strengthened after v1; that preliminary evidence remains intact.

The plant progresses from a small silvery-green sprout to a leafy clump and a taller seed-headed herb. The harvest bundle is tied and lies on the ground. All geometry is original Three code, baked through the existing `bake` helper into Pixi textures. Each texture is 112x112 through `camera(112,112,1.1)` and the existing `propAnchor`. The third camera argument is aim height, not zoom. There are no directions or animation frames.

## Integration custody

Delivery exclusively owns tracked source, Git and deployment. Astra staged this handoff without modifying tracked art or production; Delivery subsequently applied the exact patch as recorded above. `art-integration.patch` adds `src/art/herbs.js` and the small `bakeArt()` hookup for `art.herbs.mugwort.{planted,growing,ready,bundle}`. The module has exactly the study geometry with its browser-root import relocated to `./geometry.js`; no geometry substitution is required. Candidate files are also under `candidate/`. The patch passed `git apply --check` against art.js SHA256 `9951e1c7e8cf98e4a2fb03348070878588a5c869376229a9e4791fd85e33620b`.

Code owns ordered stakes/preview, stages, timing, progress, placement occupancy and draw order. The herb remains nonblocking to navigation. Use the current prop anchor and existing work poses; no new animation or simulation owner is part of this handoff.

## Evidence and limits

Native proof-worker scope `run-u876.scope`, native session `91661`, exited 0. `proof-v2/proof.json` asserts exact stage keys, four different textures, dimensions, alpha padding, actual displayed sprites' anchor and texture identity, both scale controls (640x400 and 1280x800), zero browser errors, and unchanged source hashes. Alpha padding is at least 31 pixels for these assets. Bounded Terra source/caller review accepted the geometry/disposal/anchor/API contract. Syntax checks passed for the study and candidate JS.

This proves static assets and the isolated actual-bake/Pixi caller. It does not claim a production build, hosted integration, planting command, growth clock, harvest yield or save behavior. Delivery retains those final integration/proof responsibilities. No animation or uncut-motion acceptance is claimed for static props.

Every source and handoff artifact hash is in `source-inventory.json`. Accepted production candidate hashes:

- `src/art.js`: `a3aa8bb4f558697146c5ef890ca3dfd2cc47bf747cef19c185c2780e9df5bbe6`
- `src/art/herbs.js`: `94a3768dd454f54a2bfa36a0e0f2ac8401c21d0f8e862d0286fdcdbf5a718ce7`
- patch: `dd81ce701dd678b8eed676c6039c53f4666ad50d5df67852b88a83b3bec2c8ba`

The existing development server serves `/.botanical/mugwort-study/index.html`. For a future justified proof, use a new output directory and the ordinary command under the required host runner:

```sh
/home/levi/src/Botanical-next/.agents/skills/orchestrate-multi-lane-work/scripts/run-proof.sh node .botanical/mugwort-study/prove.mjs .botanical/mugwort-study/proof-next .
```

No new server, monitor, or test framework is needed.

Delivery acknowledged custody of the exact patch and its production caller/proof responsibility. Production caller integration and bounded hosted planting acceptance are now complete as recorded above. No further art acknowledgment is needed for these unchanged bytes.
