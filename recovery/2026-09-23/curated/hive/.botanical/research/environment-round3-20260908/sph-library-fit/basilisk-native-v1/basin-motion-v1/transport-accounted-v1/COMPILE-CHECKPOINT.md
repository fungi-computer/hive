# Clean compiler and actual generated caller checkpoint

Compile **run-u3476.scope**, invocation **c1f2880be9cb4826860c648087f7d860**,
terminal exit **0**; 19.217578357 s total. Both qcc commands exited 0; both logs
are empty. No mechanical compiler correction was needed. Retained unified
session 95526 was polled through terminal. No numerical call has run yet.

Pinned generated `_wave.c` is
`cb05d2ab63e0a20d72b5b9b2631bc5ee06d75cf1a8414534143fa1d0bd04861a`;
native binary is `676ea7d3ff7276541d2832155e5aca565b655420d156c35ed6ea4c8d0a53b9e1`.
Reviewed source pins remain
`a3593cdb4e03f2d0916cc1859b315df439a16aab6161c255f51cd4909c72d996`.
All compiled receipt/source hashes were rechecked before this note.

## Actual generated source read

- `event_register` 5908–5938 prepends same-name actions; `event_do` 5959 onward
  invokes that inherited list. Registration at 77454–77526 retains the existing
  event positions and newest caller actions.
- Caller `vof_2` 77310–77318 reads stock/cc/uf before native `vof_1` (63132)
  transports f once. Native conserving action sets interfaces null at 63495,
  so older default vof_0 cannot double-advance it.
- Caller `tracer_advection_2` 77319–77323 reads post-VOF stock before native
  interface-list restore at 63500 and properties preparation.
- Caller `acceleration_2` 77326–77330 performs both passive before-force reads;
  inherited reduced_1 70120 and iforce_0 64016 then precede centered acceleration
  50464. Native clamp remains inside iforce (64161), not the observer.
- Native projection 53457–53467 runs before `end_timestep_0` 77333. The latter
  reads actual post-state, closes the transport ledger, emits all three records,
  then advances only observer counters. Solver state is not repaired.
- Pre-VOF cc/divergence at 75136–75147 and 75301–75312 are mutually exclusive
  nonconstant/constant cm branches, not two executed cell scans. The real cc is
  `(fc > .5)` and dx/dy use x[1]/y[0,1] minus the same face at index zero.
- Rotated wall bodies are explicit: left 75902 uses -uf.x[0], right 76046
  uses uf.x[1], bottom 76190 uses -uf.y[0], top 76334 uses uf.y[0,1]. The generated
  tree boundary wrapper moves to the adjacent physical leaf; all four use the
  correct outward normal and sum inward volume with the opposite sign.
- Observer stencil declarations are reads; no canonical f/uf/u/p assignment or
  per-face flux override appears in the observer. Its allocations are bounded
  scalar metadata plus the unchanged column arrays. Wall closure is conditional
  on every actual face being exactly zero, checked during capture.

This generated-source review passes. The separately authorized next action is
one serial coarse/fine capture with the new 120-second combined native ceiling,
original physical/accuracy parameters and no automatic retry. Component timings
remain nested and include the passive scans as CONTRACT.md declares. This is
not game throughput or production acceptance. No gas process was inspected or
changed; its owner released the native window after terminal u3475.
