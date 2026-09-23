# Original work / idle / expressive hair study

Root Astra authored this isolated Three geometry study against the accepted
`src/art/figures.js` SHA256
`4620917b83f6967836045645d228fcac358ca9a3368f98945e8c90c4d0bf222b`.
The tracked art and simulation are untouched. Delivery owns the current input
fixes and serial integration/deploy; this folder does not change the preview.

Changes:

- Rowan and Sedge kneel with one working arm and an original wooden mallet.
- Rowan/Sedge breathe quietly; Bramble flicks her tail, twitches ears and blinks.
- Sedge has much fuller copper hair with separate tapered locks, delayed sway
  during work and a stronger trailing motion when walking/carrying. This follows
  Levi's explicit feedback and the supplied witch silhouette inspiration. No
  reference pixels or models are used.

`figures.js` is the isolated original-source candidate. Its only import-path
translation is `../../src/art/geometry.js`; the tracked version uses
`./geometry.js`. `main.js` uses the existing actual `bake`, camera and anchor,
then displays the old/new sequences in Pixi at 2x and exports native 80px frames.
No rig, simulation, state-store or animation framework is added.

## Run and evidence

Existing dev server: http://127.0.0.1:5187/.botanical/animation-study/index.html

From this clone, using the existing server:

```sh
CHROMIUM_PATH=/home/levi/.cache/ms-playwright/chromium_headless_shell-1234/chrome-headless-shell-linux64/chrome-headless-shell \
LD_LIBRARY_PATH=/home/levi/src/Botanical-next/.botanical/browser-libs/root/usr/lib/x86_64-linux-gnu \
/home/levi/src/Botanical-next/.agents/skills/orchestrate-multi-lane-work/scripts/run-proof.sh \
node .botanical/animation-study/prove.mjs .botanical/animation-study/proof-v4-contact
```

Use a new output directory for another run; retain earlier evidence.

Previous candidate: `proof-v3-hair`, owned runner `run-u469.scope`, invocation
`44e19521306f49acb2b5239e2064279d`, native returned exec session `67682`, polled to
normal exit0. Prior `proof-v2-hair` ran in u467, exit0; it preceded the separated
hair tips/streaks. `proof-v1` predates the hair request; its assertion JSON exists
but its original tool-return completion was lost at compaction, so no native
exit code is claimed for that run.

Final candidate: `proof-v4-contact`, owned runner `run-u479.scope`, invocation
`d87fa57bd3534aba8c99c5614149fab2`, exec session `37120`, polled to normal exit0.
This resolves Sol's v3 contact advisory: kneeling boots remain above the ground,
and sleeping hair spreads along the resting body rather than dropping through
it. Source-only Three bounds in u480, exit0, saved `contact.json`: all build phases
minY Rowan 0.0162 / Sedge 0.0030; Sedge sleep returns to its old -0.020 minimum.
These are geometry measurements, not an in-world bed/collision proof.

- `01-motion-study.png`: current/study displayed at game 2x and motion strips.
- `02-motion-native.png`: all eight front phases for seven studied subjects.
- `03-facings-native.png`: representative phase0 in four facings for those rows.
- `04-sedge-hair-all-modes-facings.png`: Sedge all eight modes, four facings,
  representative phases0/4 (sleep duplicates its one static frame).
- `page@d45add8ce0fa5d3200666a2b8048848c.webm`: actual browser recording.
- `proof.json`: stable source hashes; all eight frame indices observed for seven
  rows; pause freezes both frame and image; Sedge all animated modes have eight
  distinct baked images in each facing; all Sedge poses fit unchanged 80px canvas
  with at least 10px transparent padding; no browser errors. Distinct Sedge
  texture counts are recorded measurements; only phase counts and padding are
  asserted. No claim that every subtle idle frame must have unique pixels.

Astra personally viewed the native phase/facing sheets and current/study pixels.
That is frame/sequence art review, not a claim to have watched the uncut WebM or
proved an integrated in-world build at this revision. The source review and
joined game proof remain separately scoped.

## Integration disposition

See `../research/animation-caller-review.md` for the already-read actual callers.
The kneel/mallet/hair shape reuses existing build/work texture counts. Idle needs
eight frames for the two home figures and cat, adding 84 80px textures (about
2.05MiB raw RGBA before browser/GPU overhead). Keep the goblin/sleep single-frame.
Use 400ms per idle phase at normal simulation speed (8 fixed ticks), existing
100ms work phase (2 ticks). Game frames remain indexed by paused fixed world tick;
study wall time is separately stopped by its Play control. Update both study
render and its reported frame together; do not add a second claimed frame truth.
Measure art-ready cold start with the existing joined proof. The study's browser
phase loop and native sheets do not prove new idle frames have shipped.

**Astra art acceptance:** final v4 native phase/facing sheets and game-scale
comparison are accepted for this bounded animation/hair change. Sol's actual
source review is `source-review.md`; its v3 findings and the above v4 correction
remain distinguishable. Final isolated figures SHA256:
`ec69c39aa75b10a227b8e6f22673f2ac248a5d44e84a14b21e217dca8fc9e380`.
`figures.patch` is the reviewable tracked-source delta; the adjacent
`figures-for-integration.js` differs only in its corrected local import path.

Root retains personal art authority. Delivery may integrate the accepted source
delta when its current input build/proof snapshot is safe, updating the import
path and immediate callers together, and owns ordinary source review, build,
proof and same-preview publication. Do not discard or overwrite its dirty work.
