# Accepted-stage energy diagnostic, source checkpoint

Scope: one isolated instrumentation copy of the frozen finite-momentum-v1
owner. No new numerical method, heat term, force, boundary, topology or physics
qualification. Root owns source/caller review before the single numerical run.
The original momentum, buoyancy and independent oracle evidence stays unchanged.

## Actual source changes

- `momentum.mjs` retains every numerical update and original receipt expression.
  Added snapshots are observations of old/advected momentum. Diagnostic calls
  read actual donor transfers, body impulses and copied projection outputs.
- `finite-gas.mjs` retains all M/U/P, source, admission, retry, projection and
  receipt update statements. Extra diagnostics sit outside canonical state and
  original receipts. Accepted first/second stages are weighted one half each;
  final projection is weighted one. Rejected trial diagnostics are not included
  in physical integrals. The unchanged solver counters still count trial work.
- `energy-diagnostics.mjs` owns only algebraic observations. It calls the existing
  divergence query and consumes actual metrics/quantities, never updates them.
  No solver call, alternate projection, callback or second state owner is added.
- `projection.mjs` and `geometry-owner.mjs` are byte copies. The thermodynamics,
  metric compiler and oracle imports consume unchanged frozen sources.

The physical VERSION, canonical save identity and original output fields remain
unchanged. The only new advance output field is `energyDiagnostics`, containing
32 compact accepted-step records. They are not serialized as world state.
Body work is called body work. This fixture's independent gravity pairing must
agree with it; a nonzero external-body discrepancy would reject this diagnostic
claim, not be hidden as gravity. The identities assume the declared sealed,
zero-heat full box. They are not an open-flow or heated-total-energy model.

## Exact retained fixture

Same recipe as `finite-buoyancy-v1/qualify.mjs:makeFixture/runMoving`:

- 8×8×8 cells; physical lengths [4, 2.16, 4] m and spacing [.5, .27, .5] m.
- x/z periodic; y sealed, stationary free slip. Canonical domain
  `finite-buoyancy-8`; unchanged geometry defaults and revision.
- Inert air, initial 100000 Pa, reference 300 K. Density is the exact checked
  linear-buoyancy oracle's cell averages at epsilon .1; initial velocity zero.
- Actual gravity [0, −9.81, 0] m/s². Zero heat and zero external body forcing.
- Exactly one `advance(initial, 1, {dtMax: 1/32, maxSteps: 32})` call: 1 s,
  32 accepted SSPRK steps, 64 Euler stages, 96 pressure solves. No half-time
  restart, probe, coarse mesh, stable profile or repeated old suite.
- One guarded packet with a 30 s inner wall limit. Expected source-equivalent
  solve work is 6131 PCG iterations, 94208 primal face evaluations and 294912
  dual interface evaluations. These are equality checks, not capacity claims.

## Baseline counter provenance

The retained whole qualifier used a fresh geometry/model in each `makeFixture`.
`physicalLaws` reads the initial and final fields exactly once each before
capturing `gas.diagnostics()`. Thus the fine case's stored counters are local
to this model, not a sum of earlier meshes/probes. However the recorded
`thermodynamicCellReads: 133632` includes those two post-solve reads (1024 cells).
The expected immediate post-advance value is 132608; the initialization value
is 512. Projection topology/workspace values are gauges, not additive solve
counts. Other model counters are unaffected by those reads.

This caller records initialization, immediate post-solve and actual post-law
counters separately. It performs the same two meaningful reads to check mass,
U, EOS and K/PE; their final counters should equal the stored case. It also
compares the immediate solve count to the explicitly normalized stored count.
No dummy reads, original-suite rerun or inferred whole-host counter equality.
This covers model counters; diagnostics themselves add CPU/allocation work that
is reported by elapsed time, CPU and whole-process final RSS, not silently free.

## Independent algebra and fixed exits

The source derivation is `../buoyancy-energy-review-v1/AUDIT.md`. Every stage
records and checks:

1. Donor loss D≥0, explicit forward remainder E≥0, actual advection change
   −D+E, and the linear-face pairing residual. E≤D under the unchanged donor
   CFL, so advection does not increase the dual kinetic norm.
2. Actual finite body change = old-velocity work + cross/kick remainder;
   wall removal = negative fixed-node momentum norm. Neither is heat.
3. Gravity work + actual PE flux = the independent signed donor-density formula.
   Compare physical mass-derived PE change separately to avoid cancellation.
4. Projection change = target work + all-cell residual work − correction norm.
   Include the pinned cell, gradient/impulse pairing roundoff and direct finite
   impulse identity. Do not label the cancelled hydrostatic kick physical loss.
5. RK Jensen term from old/second-stage masses and velocities, actual weighted
   step mechanical balance, final projection separately.

Energy equality tolerance: absolute 1e−10 J plus 1e−10 times the sum of compared
term magnitudes. Every measured residual is saved. Pressure pin/constraint uses
the unchanged 1e−10 m³/s bound; pressure impulse metric residual is reported and
checked against 1e−10 kg·m/s plus 1e−10 times impulse magnitude. No post-run
relaxation. Finite stock/EOS/Mach bounds and the existing <30% mechanical screen
remain as before; passing the screen does not settle the known 5.39% defect.

The complete original advance output must equal the retained JSON output after
removing only the new top-level diagnostic field. This comparison preserves
all quantities, times, original receipts, last phase arrays and original quality
fields. JSON evidence cannot distinguish a lost negative-zero sign; no stronger
binary claim about the prior in-memory result is made. Canonical save JSON is
also compared exactly. No added diagnostic quantity enters physical admission.

Before any new diagnostic threshold assertion, write the complete returned
output and compact stage records. Each law records the current step in failure
evidence. An inherited solver rejection preserves the exception and unchanged
initial state but does not expose a new partial-state callback. Stop on first
failure; no automatic rerun. Check source pins before and after.

Return weighted D, signed gravity gap and time/split remainder; reconstruct the
unchanged −.06972509314857689 J whole mechanical change. This attributes one
existing field. It does not implement compatible gravity/energy, demonstrate
spatial convergence, couple water, or qualify digging/open rooms.
