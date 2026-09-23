# Isolated animation study source review

Reviewed against tracked `src/art/figures.js` at `1704e9b`:

- study figures: `6460939057fbbf7565af7e4390b6d3cfd0207ce8c3cbff206e35ce978fc8032a`
- study caller: `93157cd682d2132f22f0c508fe9c50468184d295fb98190275b61c6f9ed8a32a`
- study proof: `181d1d793eaad11795cc74994cb395aa4016ea1af17fdd38653c29164ab3f66e`
- passing evidence: `proof-v3-hair/proof.json`, runner `u469`, exit 0

No integration-blocking source defect found.

## Small concrete advisory: build contact sits slightly below the authored origin

The build body is lowered by `0.36` at `figures.js:638-639`, while its fixed
kneeling leg rotations are set at lines 20-42. A source-level Three `Box3` check
puts the build minimum y at `-0.062` for Rowan and `-0.054` for Sedge; their
tracked standing/build geometry minima are `0.043` and `0.044`. At the accepted
camera scale this is about one projected pixel below the ground origin.

This offset is constant across all eight phases, so it does not create foot
jitter and the sprite anchor remains stable. It is only a correction candidate
if the intended boot/knee contact must stop at y=0. The current proof places a
floor diamond under the sprite but does not assert contact with that origin.

## Scope and preservation checks

- Build leg action is passed only by Rowan and Sedge (`figures.js:114-142,
  493-516`), and the body lowering is explicitly kind-gated. Other visitors keep
  their old legs and poses.
- The active build arm is `side < 0`; `hands[0]` is produced by that same first
  side and receives the mallet (`figures.js:52-75,145-176`). The build branch
  returns before the old axe is attached. Pickup/deliver/chop/carry behavior is
  otherwise unchanged.
- Build knees and body height do not depend on phase; only the authored mallet
  stroke changes. There is therefore no frame-to-frame foot-pivot drift.
- Cat idle changes stay inside `cat`, while the cat sleep geometry is the
  separate early branch at `figures.js:644-649`; cat sleep is unchanged. Rowan
  sleep is also unchanged because its new head turn is idle-only.
- Sedge's larger hair intentionally changes every Sedge pose, including sleep.
  The sleeping Sedge world-space minimum y is now `-0.226` rather than the
  tracked `-0.020`, although the proof establishes at least seven transparent
  canvas pixels around every Sedge mode/facing/phase. This is a visible
  silhouette/ground-contact review item, not clipping or a caller defect. The
  proof's all-mode sheet includes the sleep facing for the art decision.

## Cadence and pause evidence

The isolated caller advances all eight work frames every 100 ms and idle every
400 ms (`main.js` ticker block). Its Play control stops the sole `elapsed`
counter; proof v3 verifies both frame indices and the rendered canvas data URL
remain unchanged for 350 ms while paused. This validates the study boundary.

Production integration still needs the previously identified tick-based caller
change in `animation-caller-review.md`: idle frame selection should use the
frozen simulation tick in both the controlled-actor and Bramble paths. The
isolated wall-clock ticker is not itself suitable for the game because it is
independent of game pause and speed.

## Evidence limits for final integration

- `prove.mjs` proves that each row's logical frame index visits 0 through 7, but
  it does not assert that all eight row textures have distinct pixels. The
  native front-facing sheet is the evidence for Rowan build/idle and cat idle.
  Sedge `uniqueFrames` is recorded as eight in every facing/mode in proof v3,
  but the script does not fail if that count later falls.
- The row sheet covers all eight phases only from the front, while its facing
  sheet covers only phase zero. Only Sedge hair receives automated alpha-padding
  coverage over every phase and facing. Rowan's animated mallet/build silhouette
  and Bramble's tail extremes therefore still rely on the displayed sheets
  until the normal integrated study proof checks their per-frame padding.
- The isolated study does not exercise `bakeArt`'s frame-count policy or the real
  `view.js` tick cadence. Those are the known integration deltas; the geometry
  itself introduces no simulation state, timer, or new pose kind.

No rig, movement, or animation framework is justified by these findings.
