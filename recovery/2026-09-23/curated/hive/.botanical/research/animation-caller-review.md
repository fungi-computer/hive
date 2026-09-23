# Animation caller review — `1704e9b`

Reviewed tracked bytes:

- `src/art.js` `07ca6653ae4d5095d3f6b2d6b6e49b622026b6e47ab769ca273c864f5fbcb785`
- `src/art/figures.js` `4620917b83f6967836045645d228fcac358ca9a3368f98945e8c90c4d0bf222b`
- `src/view.js` `aaf048a9eeef6528632fb9fbfbbbf68d1b5df5d83c0ddec73a55aa1651d4adb0`
- `src/study.js` `d7178adc5b22984dc2710bdd757b91793b464db26fbdc0c6a06b960eb9b31d26`

## Eight-frame build

No caller or simulation-state change is required. `bakeArt` already bakes eight
frames for every pose except idle and sleep (`src/art.js:65-98`), and the game
selects any pose sequence generically from `person.mode` and its length
(`src/view.js:236-240`). Replacing the geometry produced for `build` therefore
retains the existing activity kind, timing and state. The current symmetric look
comes from assigning both arms the same build rotation in the loop
(`src/art/figures.js:27-53`); crouched legs and one active arm belong wholly in
the authored figure geometry.

The study already expects and plays eight build frames (`src/study.js:395-407`,
`scripts/prove-study.mjs:18-20,222-228`). Build replacement adds no texture or
cold-start cost because those 64 textures already exist: 2 people × 4 facings ×
8 frames.

## Slow idle for Rowan, Sedge and Bramble

The minimum game-side change is:

1. In `bakeArt`, bake eight idle frames for `rowan`, `witch-runner` and `cat`,
   while leaving sleep and the goblin's idle at one frame. This adds 84 textures:
   3 figures × 4 facings × 7 additional frames (`src/art.js:75-98`).
2. In `view.js`, put the frame-index calculation behind one small helper with a
   larger tick divisor for idle and the current divisor 2 for work/walk. Use it
   for both controlled actors (`src/view.js:236-240`) and Bramble
   (`src/view.js:289-291`). A divisor such as 10 gives one idle phase per 500 ms
   at normal speed because fixed simulation steps are 50 ms; the final cadence
   is an art choice.

Keep this indexed by `state.tick`. `main.js` renders continuously while paused,
but advances `state.tick` only inside the unpaused fixed-step branch
(`src/main.js:421-469`), so an idle or build frame freezes and resumes exactly.
It also means animations follow the 1×/4× simulation speed. If that is intended
world-time behavior, no visual clock is needed. Wall-time animation independent
of game speed would require a separate elapsed clock that is explicitly gated
by pause and is a larger ownership change.

The static construction of actor sprites and HUD portraits from idle frame zero
is safe (`src/view.js:66-72,122-123`; `src/hud.jsx:1037-1039`): the world sprites
are replaced on the next render, while portraits can remain representative
stills.

For the study, use the same sequence-length helper in both `renderHome` and the
exported `__STUDY.state.home.frame`; those calculations are currently duplicated
at `src/study.js:395-399,494-497`. Give idle a slower wall-time divisor than the
current 125 ms, while continuing to increment `homeElapsed` only when the study
Play control is active (`src/study.js:457-465`). Bramble is only in the separate
lineup bake, whose idle count and render gate are currently hard-coded to one at
`src/study.js:141-163,236-244`; an isolated cat-idle review must make that
sequence multi-frame and index it by its actual length. It need not animate all
visitor figures.

## Proof assumptions to update

- `scripts/prove-study.mjs:18-20` declares both idle and sleep as one frame;
  change only idle to eight for the two home actors.
- Its metrics and sheet checks consume that table at lines 141-167 and 173-187,
  so they will then cover all idle facings and padding automatically.
- The explicit single-frame block at lines 207-219 must become sleep-only.
  Exercise idle through the existing motion collector and add the same stopped
  frame/image check used by the visitor pause proof at lines 294-300.
- The existing motion list at lines 222-228 omits idle; include it. Build is
  already covered for all eight phases.
- `scripts/export-study-art.mjs` deliberately selects frame zero and labels it
  `representativePhase: 0`; extra idle phases do not break it, but it will not
  prove the idle cycle.

The 84 added 80×80 RGBA canvases contain about 2.05 MiB of raw pixel storage
before browser/GPU overhead, and increase the current `bakeArt` figure count
from 444 to 528. Including the current ground/props/building textures, this is
roughly a 16% increase in synchronous WebGL bakes during cold start. The yield
still occurs once after each pose, not between frames (`src/art.js:82-99`), so
the new idle bake extends those synchronous bursts. This is bounded and should
be measured in the existing art-ready load proof rather than prompting a new
animation or rig framework.
