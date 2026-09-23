# One MAC implementation for 2-D references and 3-D voxel fields

2026-09-08. First working source shape, not numerically accepted yet. Prior
metric/domain/square checkpoints and all room results remain unchanged.

`geometry.mjs` owns rectilinear cell metrics, three-dimensional world origin,
domain identity, solid occupancy, face construction, pressure components and
staggered neighbor/cross-velocity stencils. `solver.mjs` is the shared pressure,
momentum, scalar transport and interval owner for both supported dimensions.
Historical 2-D code is an oracle, not a second production path in this candidate.

Three-dimensional construction uses:

```js
geometry({
  size: [nx, ny, nz], spacing: [1, .54, 1],
  origin: [worldX, worldY, worldZ], domainId, revision,
  solid: occupiedCellIndices,
})
```

World y is always the gravity axis. Cell index is x-fastest, then y, then z.
Each face has one global identity, correct family area and center distance,
including half distance at exterior pressure boundaries. Periodic end faces
alias one canonical owner. Solid/closed faces never carry mass. Explicit open
sides are `x-`, `x+`, `y-`, `y+`, `z-`, `z+`; no opening is inferred from an
unloaded region. Two-dimensional references use two selected axes including y
and an explicit extrusion thickness. They consume the same numerical functions.

Staggered cross-velocity interpolation uses four neighboring component faces
in the relevant component plane. Tangential wall relations are cached, including
partially blocked dual faces at corners; the predictor and combined stability
bound share those coefficients. A geometry cache changes neither canonical
velocity nor stock. The constructor creates no quantities and performs no edit
reconciliation. Numerical workspace is private per geometry in a WeakMap.
Projection returns borrowed scratch vectors for internal stepping/short research
queries; persistent canonical state is copied only on accepted transitions.

First qualification will compare the shared 2-D path with the preserved metric
oracle, then independently test 3-D rest/hydrostatic balance, gradient/random
projection, a true 3-D periodic ABC/Beltrami velocity field and its pressure,
three-axis scalar conservation, global identity and exact reload. The first
analytical proof is bounded below30 seconds. No room/900-second/renderer run,
post-edit gas creation, displaced air or 3D fire claim is included.
