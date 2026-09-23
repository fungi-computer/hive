# Home demo — final source and evidence

Commit: `cb80c55fe9932c2e01c7570ed855266d03cb9695`. Feature branch: `feat/goblin-bed-and-breakfast-mvp`.
Preview: https://goblin-mvp-fungi-goblin-bnb.levi-fe0.workers.dev/ ; study: /study.

## Final bounded acceptance — 2026-09-07

CTO accepted commit `cb80c55fe9932c2e01c7570ed855266d03cb9695` for the authorized home demo on the existing feature preview. This slice is complete.

CTO independently checked clean HEAD and origin feature-ref equality, verified all 35 source inventory hashes, read final dist/hosted/study proof results and the seven-test log, inspected final hosted roof/sleep/mobile PNGs, and checked the integrity report contains exactly 21 entries, all HTTP 200 with matching hashes. CTO read the mobile overflow assertion: acceptance covers that viewport/layout check, not a new full touch-gameplay claim. CTO did not replay the uncut video or independently rerun the full browser suite. Existing scoped Sol review and CTO inspection of render/command source support this bounded acceptance.

The 27 complexity advisories, 3 clone groups, drawSites hotspot and shared art bundle warning remain disclosed with the disposition below. Live Shiitake/storyteller integration remains outside this slice. Current preview, study, source and all earlier/final evidence are preserved. No further correction, proof rerun, source expansion, main merge, deployment or cleanup is requested; work is settled until Levi gives the next direction.

## Actual caller and ownership
- index.html -> main.js request -> fixed-step pending commands -> clearing.js command admission/state.
- jobs.js offers activities for the first ready authorized order to actual libcolony compute_cost/optimize; the simulation owns travel, work and outcomes.
- resources.js moves wood between piles, hands and sites. Construction consumes delivered wood; unfinished cancellations return material. No global wood counter.
- construction.js shares footprint rules, indoor flood and exterior-door/bed reachability; a bedroll covers two indoor roofed cells. world.js/movement.js retain a finite level-zero grid, logical cell positions and render interpolation.
- Original art/figures.js plus art/home.js -> shared fixed camera/bake -> Pixi view and construction-view. Wall joints share geometry at neighboring edges. No reference pixels are shipped.
- One rest need, manual rest and optional day-work/night-sleep standing order. Eight-minute demo day at 1x; 4x repeats the same fixed steps. The explicit seeded fake feed remains separate from movement/resources.
- Old single-task clearing, numeric wood counter, fixed solid shelter art and former pawn art are replaced; accepted versions remain in Git. No generic ECS, optimizer substitute, multiplayer/chunk/Z-path engine or live SSE integration.

## Verification and review scope
- .botanical/home-tests-final.txt: 7/7 real-WASM tests, including conservation at every tested tick, cancel/requeue, route blockage, usable room/rest, replay, pause/reset and dawn/disable handling.
- .botanical/home-final-dist/proof.json: actual input -> waiting/canceled/reissued blueprint -> chop/carry/deliver/build, then 17 manually placed home elements funded by 19 of 24 harvested wood; bed visit, pause, resumed fifth tree, standing night routine, dawn and reset. Snapshot material sums checked.
- Dist images: 10-home-roof.png, 12-sleep-paused.png, 15-morning.png, 17-mobile.png; video page@b4f22acb3df2df376a5dbc7521627ff4.webm. Owner personally viewed normal/home/bed/mobile pixels.
- .botanical/home-study-dist/proof.json: four facings, five animated figures, native/fitted desktop/mobile, pause and Back-link actual libcolony chop. Approved silhouette ranges unchanged.
- CTO accepted first-loop stills and complete home/cutaway stills. Those verdicts do not assert uncut motion viewing or final hosted acceptance.
- Scoped Sol review found no remaining source/scope blocker after routine-at-dawn, inaccessible-home classification and bed-drag corrections. Partial-sleep status now says Rowan has slept rather than claiming full recovery; REST remains visible.
- .botanical/home-fallow-final.txt: 0 dead files/exports, 27 complexity findings, 3 clone groups (52 lines / 1.3%). drawSites is a real hotspot: cyclomatic 25, cognitive 41. Retained disposition: its site lifetime, art stage, cutaway visibility and progress are cohesive but costly to read; no metric-driven extraction or blanket clean-quality claim. Owner disposition is to revisit those concepts when this responsibility next changes; Sol found the current split proportionate and advised no metric-driven extraction. No broad refactor is part of this handoff.
- Three/Pixi shared art bundle ~795 kB minified warning remains visible. No warning suppressions.
- Earlier failed/preliminary runs preserved: home-checkpoint (pawn hit), home-checkpoint-v2 (decorative sprite hit), home-full-dist (missing indoors import during art iteration), home-full-dist-v2 (full gameplay passed; final mobile overflow failed). home-checkpoint-v3 is the accepted first art/input proof.
- Hosted gameplay, deployment receipt and independent asset hashes are recorded separately in home-hosted-proof/, home-deploy.txt and home-hosted-integrity.json after upload. Hosted home and study both passed with zero recorded errors; 21/21 HTML/JS/CSS/WASM hashes match. Hosted video: home-hosted-proof/page@fb2aa8fc43c95613923577435b6f8f2e.webm. Owner personally inspected hosted normal, sleeping and mobile stills.

The three new witch references are preserved as ignored .botanical/references/06-witch-lineup-reference.png, 07-witch-run-reference.png and 08-witch-cast-reference.png. They are inspiration only.

## Source inventory (committed bytes)

- `PROTOTYPE.md` — 13133 bytes; SHA-256 `2d467fa8aab052467233b12d84348a0fa351a0e815a30ed0faab56e3133cecb6`
- `index.html` — 4038 bytes; SHA-256 `6e60a48b42a05fcfed8de7713c87d904c27fe8330ee01550dec0145558190b63`
- `package.json` — 665 bytes; SHA-256 `800009e0d07f12cd899d60f1a1aa5e56ea4a75406e71f1cbf2ce837a031ef179`
- `public/vendor/libcolony/LICENSE` — 1071 bytes; SHA-256 `14f0c63001b1459bf523d737c0ab224e62b2a9c7b2eddf5372a38ea2a9de620e`
- `public/vendor/libcolony/PROVENANCE.md` — 907 bytes; SHA-256 `c72462f11d6e8d81af4bfe82b14c829ac92e02adddf2df218744057c25bef8d5`
- `public/vendor/libcolony/colony.js` — 55391 bytes; SHA-256 `2f31c9b940595268842c30eb02a5249227b4c3c93467c5f19d23d438b75c5fd6`
- `public/vendor/libcolony/colony.wasm` — 26799 bytes; SHA-256 `08a46ee9b5c6135ae165bdd4f5983a8ce28ad70d6da63cac0a53e79067077ef1`
- `scripts/prove-study.mjs` — 6311 bytes; SHA-256 `63b43cd6bb7597298c5153f9c774fbaea113040c7a340a04ef1a915ad31ba2f3`
- `scripts/prove.mjs` — 9049 bytes; SHA-256 `35a10a55022dc0bd412f050d547f7ce6246384f6d4cbd9dd7beca37ce65c1c1b`
- `src/art.js` — 3790 bytes; SHA-256 `021ffb1b5afaf106c7a2034072df2fc4f1306572e9de594365fd0c88ad5517f1`
- `src/art/clearing.js` — 4739 bytes; SHA-256 `6ba42dbfc4de7d5cc0bdc85f8a01c04e7a602bcdaebe658267b126bd2cdfee2e`
- `src/art/figures.js` — 11711 bytes; SHA-256 `edb93c4176b0cb49e2608cc5d684814144feb9e24e8d146d6a01a70848402b37`
- `src/art/geometry.js` — 2120 bytes; SHA-256 `3f435fed1c9414281c79e54ada5eb6cc6788d33cab8bd83e95a24da0a2008264`
- `src/art/home.js` — 3919 bytes; SHA-256 `4d4af1eb23b695318c0def911e14685fc1d4b8a7bf7d48a489b1cfbcdac17eb9`
- `src/art/scale.js` — 1188 bytes; SHA-256 `2de8ee96e89614e02c1c55bf5bfe34fb22cfb67143a88c650b9a7e8c5e128552`
- `src/clearing.js` — 5470 bytes; SHA-256 `b3723227d7dd8b4e1af39ac66dd336a8d506322fda9c33a31be1388f4fbe43f5`
- `src/clearing.test.js` — 9376 bytes; SHA-256 `4b935d496e4d25bba4785d20b614ccb134066fc6e7e86366cfd1208ac0ec40e1`
- `src/colony.js` — 655 bytes; SHA-256 `a08e2fa55394ac7c27a6f27b965a991f45b130105dc55acd17cfb85f852c474d`
- `src/construction-view.js` — 5671 bytes; SHA-256 `351afe4a4d9ba050a929b060b23399befc061ea25b514b83d4cae3fa1b746e35`
- `src/construction.js` — 3981 bytes; SHA-256 `8caa37eb781215b51a0f6b0cd934106fb1e638e517f6f0eaef9fe215b7fdf965`
- `src/feed.js` — 1290 bytes; SHA-256 `d8158d73ebb28b29d9be80abc6ecc71542e595c2c7f14b10374fcab753a09718`
- `src/hud.js` — 5330 bytes; SHA-256 `a2671257f9d206682defe2c853350a2ca4afe0984c572d69806ddf6402474831`
- `src/jobs.js` — 8872 bytes; SHA-256 `4ca6c2235895a76bd571633731a1e294482bf2f67770cb5bbdfcc1702178a8f5`
- `src/main.js` — 6105 bytes; SHA-256 `2c22321a94b4bde89468ca79b3fb8823392b885021d8930b91954c7a5c097b3b`
- `src/movement.js` — 2061 bytes; SHA-256 `0fdba8ae06d9f14a9e0d9bb6ed9e54f796a1283836e809c0d91cdf94a006d370`
- `src/resources.js` — 710 bytes; SHA-256 `e66793c5571b5c76df8a64af890b7ae7750e3baa3fd7ab448798eac440a38af5`
- `src/study.css` — 3121 bytes; SHA-256 `39c4c45c8632e0ad348d637a357539a373ce03cc4b4f9e6a4e71185b3b8560fa`
- `src/study.js` — 7370 bytes; SHA-256 `915c92f77d29060bd9927ac250ae662b22397b757f9729961f60f2b459fe64cc`
- `src/style.css` — 8106 bytes; SHA-256 `92345f9b337fb8b11a93523aee0836a51f4a76904a27c2475b4bc1de56ff7dbc`
- `src/ticker.js` — 591 bytes; SHA-256 `8d51c213581a150884b5ef9b2cea0ec87ea8b98eec78e9ae1b8e19b3901df0bb`
- `src/view.js` — 7427 bytes; SHA-256 `1b1b14f8551a565aa1c87a1296c5830e07c47c17a06b88aa7670c59f4b8c219f`
- `src/world.js` — 1214 bytes; SHA-256 `24b4c3a835159ad3606a41c3e9cef1cb244ab5dc0e4973e7e3da01a9a85fb145`
- `study.html` — 2714 bytes; SHA-256 `971a8b94dbf0945891070bcc6698a167e093410540a7174c27f33dae858eca57`
- `vite.config.js` — 225 bytes; SHA-256 `45660e07667165581a66f1dc019aa8fd2a3618ff4b4228d7015e445fecfeabfd`
- `wrangler.jsonc` — 216 bytes; SHA-256 `8fb12f1f66e06b42d7ef75b837a6aaf63004feeed41b118497f066c148e39fa8`
