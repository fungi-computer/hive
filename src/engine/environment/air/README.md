# Bounded voxel air

`createAir` owns fixed-volume warm air, passive smoke and signed sensible-heat
anomaly. This is the retained qualified Boussinesq momentum/projection and
MC/SSPRK2 scalar method, with a current plain-data boundary and bounded stepping.
`provenance.json` pins the immutable research inputs; no runtime imports those
studies. There is one private geometry, velocity history and paired-flux owner.
The public module exports only `createAir`.

## Operations

```js
const air = createAir({
  version: 'voxel-air-definition-v1', regionId: 'brewhouse', revision: 0,
  origin: [0, 0, 0], size: [3, 4, 2], spacingM: [1, .54, 1],
  solidCells: [], closedFaces: [], openSides: [],
  model: {
    densityKgM3: 1.2, heatCapacityJKgK: 1005, referenceTemperatureK: 293.15,
    gravityMSS: 9.81, viscosityM2S: 1.5e-5,
    thermalDiffusivityM2S: 2.2e-5, tracerDiffusivityM2S: 1e-5,
  },
});
// Supply one explicit {cellId, smokeKg, heatJ} record per fluid cell.
const state = air.initial({ cells });
const next = air.advance(state, .2, {
  sources: [{ cellId: 'cell:1,1,0', smokeKgS: 1e-6, heatJS: 30 }],
});
const restored = createAir(air.definition).decode(air.encode(next.state));
const facts = air.read(restored);
```

Definitions bind all constants, metric, origin, region and revision. Sources use
stable global `cell:x,y,z` IDs. Walls name `axis:x,y,z` grid faces; open sides are
`x-`, `x+`, `y-`, `y+`, `z-`, `z+`, with closed face masks restricting a finite
aperture. Face IDs and physical orientation come from the same internal topology.
No boundary side becomes ambient merely because its storage chunk was evicted.
The caller supplies real building/material geometry; renderer and art supply none.

`read` gives stable cell/face IDs, physical volumes, temperature, smoke density,
velocity and balance facts. It exposes no mutable solver geometry or scratch.
`encode`/`decode` validate the exact current format and physical/relational laws.
Unknown fields, accessor properties, sparse/nonplain arrays, foreign identities
and unsupported old versions reject. Canonical arrays and returned definition
are copied/frozen. There are no legacy adapters or arbitrary callback plans.

`advance` returns uncommitted `{state, receipt, work}`. The receipt records source
quantities per cell and signed volume/smoke/heat transfers per face, accepted dt
values, boundary totals and reconstruction residuals. The caller must debit its
finite source and commit field, material/process changes, clock and command
receipt together. No fuel, species, ash, kettle or actor name appears here. A
failed operation changes no input stock, source ledger, velocity or clock; its
error exposes only uncommitted work progress. Cached work may be discarded.

## Limits and physical meaning

The supported domain is three-dimensional, nonperiodic and at most1024 total
cells at exactly1m x0.54m x1m. Requests cover at most6s, individual steps at most.2s
and at least1e-6s. Default limits are512 accepted steps,512 trials,12 halvings per
step and65536 total pressure iterations. Per-solve PCG is also capped at6*n+100.
Callers may reduce supported work limits; they cannot enlarge them. No future
scheduler or independent wall clock exists. Request-local compensated elapsed
time records only actual solved intervals; too-coarse absolute clocks reject.
This is a work bound, not a measured few-millisecond frame guarantee.

Each fluid cell and both scalar Euler stages must remain within
`abs(T-Tref)/Tref <= .05` and `smokeKg/(rho*volume) <= .01`. An out-of-envelope
stage rejects the whole operation. It is not clipped or hidden through a retry.
The fixed projected velocity scalar step is second order where the limiter is
inactive; coupled upwind momentum remains first order. Pressure potential is
specific pressure impulse in m²/s, not finite stored gas pressure or Pa·s.

Heat is relative to a fixed reference atmosphere; negative anomaly is valid.
Open inflow uses zero smoke and reference temperature, with explicit volume and
scalar receipts. Fixed carrier density/volume is an approximation, not finite
species inventory. The method does not resolve flames, oxygen/chemistry,
compression, flooded-cell displacement, radiation, solid heat storage, real
weather or total internal+kinetic+gravitational energy conservation. Its bulk
warm/dilute assumption must also describe the actual chosen source workload.

## Changing openings without changing volume

```js
const rebound = air.rebind(state, {
  ...air.definition, revision: 1, openSides: ['x-', 'x+'],
});
const newAir = createAir(rebound.definition);
newAir.read(rebound.state);
```

Only open sides/closed faces and a newer revision may change. Fluid-cell IDs,
volumes, region, origin and model constants remain identical. Scalar stocks,
source/boundary ledgers and time survive exactly; existing face velocities map
by global ID, new faces start at zero, and one shared projection restores each
component's continuity constraint. Opening/closing can split/rejoin pressure
components; compatibility and gauge-cell residual checks are retained.

The rebind reports kinetic energy before mapping, after mapping and after
projection, using `rho * faceArea * faceDistance` as each velocity degree's
physical metric. Any loss is declared boundary/projection dissipation; no heat
is invented to offset it. A passive change producing energy beyond roundoff
rejects. Changed solid/water volumes reject until a displacement law exists.
No silent reset or initialization of new room air is supported.

## Evidence boundary

The focused native laws compare an actual24-cell warm/dilute run against a
source-pinned retained result, exercise finite sources and exterior export,
moving internal split/rejoin, exact fresh-owner restart, strict admission,
intermediate-stage rejection,512-step clock handling and failed work/edit
preservation. `fixtures/qualified-warm-v1.json` is numerical evidence, not an old
implementation or runtime fallback. Its source capture is retained separately.

These laws do not prove actual brewhouse construction/fuel/actor integration,
Durable Object crash behavior, live rendering, browser performance or a hosted
release. Root owns those coupled consumer boundaries. Run the small affected
suite through the repository proof wrapper around `node --test air.test.js`.

Current source checkpoint: the eight main laws passed u4185 after extraction and
responsibility splits; a ninth actual-CFL budget law passed independently u4189.
Fallow u4187 found no import cycle, unresolved import, duplicate group or unused
export. The declared library entry leaves its separate test runner reported as
an unused file. Estimated-no-coverage CRAP advisories remain; no source or valid
entrypoint was deleted/suppressed. `facesOf` cognitive30→7, component discovery
16→6; scalar stage20 is split into stability, transfers and source application.
`transferFaces` remains cognitive14 and the momentum predictor15. This is source
qualification and actual small native evidence, not a room-performance claim.
