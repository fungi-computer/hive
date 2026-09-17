# Retained voxel draw stream proof

The browser-local Colony route rendered the same 5,774-record scene used for the full-compile baseline in headless software Chromium at 1440×1000.

After five seconds of stable presentation, 70 ordinary-frame samples measured retained dynamic insertion at 0.10 ms p50, 1.5 ms p95 and 6 ms max. Startup performed two static rebuilds and two Pixi order applications; subsequent animation frames performed neither. The browser reported no page, request or response errors.

The JSON receipt records exact cumulative counters and timings. The screenshot is `retained-voxel-stream-playable.png`. Guarded focused proof `run-u2196` passed 31/31; guarded production build `run-u2197` passed; guarded browser proof `run-u2201` passed.

The first slice still rebuilds the complete retained static stream on terrain, cover, water, cut, viewport-demand or static-structure revision. Per-chunk invalidation remains Stage 1C work.
