# Original animal study

Astra-authored donkey, llama, cow, sheep and hen geometry/poses in `animals.js`.
Existing Three primitives, fixed camera, outline bake and Pixi are the actual
pipeline. `main.js` shows original pasture plus Rowan/Bramble scale comparison;
`index.html` uses the compiled Caps/Mocha house styling for study controls.

Four facings and eight frames each for idle, walking and grazing/pecking.
Donkey/llama also have an authored loaded walk, with blankets, panniers and a
bedroll. The pack checkbox is an art switch, not a cargo or equipment mechanic.
No farm/animal simulation, material production, breed system or runtime agent
has been added to the game. Models and images are original, not reference assets.

Astra personally reviewed v1 intended-scale scene, native facings, bare/loaded
comparisons and walk/graze phases. V2 improves quadruped walking to a four-beat
cycle, lowers the cow's grazing head, and deepens hen pecking/head idle motion.
Astra personally reviewed v2 loaded game-scale scene and the complete native
walk/graze phase sheet. Eight-frame sequences support the motion direction;
this is not a claim of watching the entire uncut video. Art accepted for the
optional study and later animal gameplay.

Final bounded proof: `proof-v2`, run-u576.scope, native session 63400, normal
exit 0. UI assertions use real Playwright clicks/checks; the separate eight-second
canvas WebM uses timed programmatic controls. All 544 frames have >=2px alpha
padding; all pose/facing cycles have distinct rendered frames. Pause/resume,
pose/facing controls and visible bare/loaded changes pass, with no page errors
and stable source hashes through recording. This is dev-study proof, not hosted
or gameplay acceptance. The v1 native WebGL toDataURL capture was transparent;
v2 captures the actual rendered intrinsic canvas and preserves the earlier files.

Final source SHA256:
- animals.js: 56aa4b1f020ee39295b764c80dc2fb5d5929b22fd0f97eeafc1d28b6fbd4c233
- main.js: 3d9f972b1f0bd8f9e7dec32319f60a22d8e764b344439da1667434021040e74e
- index.html: 847db73bd4c10be0b13d23ba20485aab6db35ee0bd1fc609beb2380debc39ff5
Shared source/proof detail: `proof-v2/proof.json`.

Use the existing `npm run dev` from this clone and open:
http://127.0.0.1:5187/.botanical/animal-study/index.html

One focused proof command, with a new evidence directory each time:

```sh
bash /home/levi/src/Botanical-next/.agents/skills/orchestrate-multi-lane-work/scripts/run-proof.sh \
  node .botanical/animal-study/prove.mjs .botanical/animal-study/proof-new
```

Game-delivery exclusively owns tracked integration/build/commit/push/deploy. Keep
this an optional study linked from the existing study, with its animals unloaded
by the main game until actually needed. Future husbandry/carrying is issue #18.
