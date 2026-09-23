# Woolly herd — accepted original art

Levi requested woolly cows, woolly animals and a cow with a fuzzy pom-pom on its
head. The existing lumpy cow is deliberately preserved. This adds a shaggy
russet cow with a long fringe, a cream cloud cow with a rounded forelock, and a
dark woolly yak with a shoulder hump, long coat and upswept horns.

## Acceptance and evidence

Astra personally authored `woolly.js` and viewed `proof-v1/pasture-native.png`,
`lineup-game2x.png`, both native contact sheets, and all eight decoded native
motion samples. The forelock was enlarged after the preserved `first-render`
capture. These final woolly pixels and motions are accepted for the optional
animal study. This is sampled motion review, not a claim of uncut playback.

The single asset proof ran through the standard 10-minute guarded runner:

- `run-u1180.scope`, invocation `150900e0908c41de8be19702a6a9e74d`, native
  session `46912`, normal exit 0. The worker retained/polled its session.
- 288 new 80×80 frames: three animals × idle/walk/graze × four facings × eight
  phases. Minimum transparent edge clearance is 4 pixels. All cycles have eight
  distinct baked frames. Pose/turn/pause/resume were exercised.
- 96 original-cow frames match the candidate dispatch against the pinned
  original module pixel for pixel. The old sculpting and posing functions are
  unchanged. Baseline geometry, figures and herbs are pinned; the actual bake
  and camera helpers were copied without changing their rendering behavior.
- All imported study source hashes match before/after; page/console errors 0.
- Actual pasture Canvas recording is `proof-v1/motion.webm` (3.6 seconds).
  `run-u1181.scope` decoded eight native frames, normal exit 0; exact receipt is
  `proof-v1/motion-frames/receipt.json`. Some adjacent sampled frames repeat.
- Pause frame/state equality is asserted. The WebGL canvas data-URL equality is
  secondary evidence; the visible scene is evidenced by screenshots and video.

## Exact Delivery handoff

Apply only `art-integration.patch`, with candidate hashes in
`source-inventory.json`. It touches four root animal-study paths:

1. New `animal-study-woolly.js`: the proved geometry, with only its geometry
   import path changed from the pinned study to production.
2. `animal-study-animals.js`: import, metadata and new-kind dispatch; existing
   models and poses preserved, plus import formatting.
3. `animal-study.js`: House herd / Woolly herd selection, current-group cast and
   lineup, existing texture/pose controls. House positions remain unchanged;
   woolly positions match the reviewed study. Switching clears the previous
   cast without destroying reusable textures. Pack sprites remain House-only.
4. `animal-study.html`: herd buttons and descriptions; an explicit hidden
   pack-label rule prevents the existing flex style from exposing that control.

Astra read the candidate and immediate texture/visibility callers and returned
the pack-label CSS correction before acceptance. The production caller still
needs Delivery's short joined served check: switch herds both ways, turn and
change pose, pause, confirm packs only in House, inspect normal/narrow pixels
and preserve the game/other studies. No additional full animal or gameplay
suite is required for unchanged art. Delivery retains tracked source, Git and
deployment custody. This patch is not a claim of a hosted release.

No main-game imports, new Vite entry, animal simulation, milking, breeding,
inventory or generated naming are introduced. The biblical/Joseph/skinny-cow
ideas are separate, explicitly deferred direction already recorded by Delivery.
