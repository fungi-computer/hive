# Proposed source/caller contract, not an executed implementation

Keep the same fixed native archive/qcc and accepted corrected caller provenance
recorded in SOURCE-INVENTORY.json. No upstream header, old basin, binary or result
changes. Proposed new implementation files remain inside this directory:

- wave.c: the single fixture/lifecycle owner, accepting only the fixed coarse/fine
  case IDs; identical physical definitions and native event composition.
- wave-observation.h: passive columns/mode/moments/wall/solver observations.
- compare-wave.mjs: consume root's exact accepted oracle, raw native records and
  the fixed criteria; no fitted wave, hidden resampling or fluid update.
- compile-wave.py / run-wave.py: frozen source/bin pins and bounded serial run,
  raw stdout/stderr, exact invocation and terminal on success/failure/timeout.

This is a contract for root review, not permission to add those executable files
or invoke a simulation. Root's oracle is currently source-reviewed and awaiting
its independent mathematical check and explicit consumption handoff.

## Native ownership and immediate callers

Include grid/quadtree.h, navier-stokes/centered.h, two-phase.h and
navier-stokes/conserving.h in the accepted order. Reuse corrected u normal
Dirichlet-zero/tangential Neumann-zero conditions, native direct a={0,-9.81},
and native pressure Neumann. No explicit uf-normal callbacks or reduced.h.

`conserving.h:37-74` disables the default velocity-advection path and overloads
stability. Its `vof:117-193` allocates q1/q2, attaches both to f and transports
phase fraction and momenta using the one ordinary vof_advection. It temporarily
sets interfaces=NULL so inherited VOF does not advance f twice; tracer_advection
restores the list. The observer must not call either event manually. Review the
new translated event chain to confirm each inherited owner executes once.

Pseudocode of configuration and initialization (not an alternate solver):

    physical = fixed_wave_definition
    root_size = 1.28; N = case == coarse ? 64 : 128
    rho1 = 1000; rho2 = 1.2; mu1 = mu2 = 0
    DT = independent_T / 1600; TOLERANCE = 1e-10; NITERMAX = 100
    init:
        mask(x > 1 ? right : y > 1.08 ? top : none)
        fraction(f, .54 + .002*cos(pi*x) - y)
        u = 0; p = 0  // pressure guess only
        a = (0,-9.81)
    inherited init:
        native face initialization -> properties -> stability
    ordinary steps:
        native stability -> shared VOF/momentum -> properties
        -> native acceleration/projection -> passive observation
    stop:
        require actual completed velocity interval == one analytic period

`fractions.h:101-116,121 onward` initializes fractions from vertex samples,
inside Phi>0. It approximates the cosine by its ordinary geometric construction;
it does not produce mathematically exact continuous cosine cell volumes.
Both actual initial column profile and exact analytic cell-average profile must
be emitted and compared before motion. Do not relabel measured initial amplitude
as the requested physical a or tune the mass/amplitude after initialization.
Zero u is the intended maximum-displacement standing-wave initial condition;
there is no missing nonzero travelling-wave field to fill in. Root's field oracle
is used for comparison only, with y_oracle=y_physical-.54.

## Field times and observer responsibilities

Native centered.h:235-239 documents fraction at a staggered half timestep, while
end_timestep follows projection at velocity time t+dt. Keep explicit records of
outer t, dt, prior dt, completed velocity time, native nominal fraction-stage time
t+dt/2 and cumulative actual VOF transport durations. No output event may change
the step calendar merely to hit convenient reference samples.

`timestep.h:4-18` ramps dt even from rest. Therefore the nominal stage label is
not a claim that the initial f is an exactly initialized negative-half-step wave
or that varying-step integration samples an exact continuous trajectory. The
startup is the ordinary maintained centered initialization at maximum displacement
(u=0); the omitted initial half-step displacement is second order for this phase.
The maximum half-step phase-label scale under DT=T/1600 is pi/1600 radians.
Preserve that temporal discretization scale separately from spatial and linear-
model errors. Never fit a time shift to make the observed period agree. Root may
recut the time contract before execution if this native limitation is too large.

Signed-mode/profile sums use canonical f, never a rendered mesh or max crest.
Snapshots can be emitted every few steps for compact shape inspection, but the
scalar mode/stock/solver record remains per step for crossings and time weighting.
Column arrays are one bounded reused observer workspace of 50 or 100 entries;
no solver-owned field is retained as an independently writable cache.

For physical potential moment, `fractions.h:452-476` and
`geometry.h:508-555,562` supply the actual interface normal/plane intercept and
water-volume centroid. The intended observer uses interface_normal, plane_alpha
and plane_center for 0<f<1; empty/full cells have known first moments. Subtract
the same cell's exact flat water moment before global accumulation. This measures
PLIC geometry, which has its own representation error; retain the raw f stock
and raw fraction extrema independently. Any out-of-[0,1] roundoff contribution
needs an explicit signed moment/error bound, not a silent observation clamp.

The old all-face maximum is no longer a no-motion assertion. Query actual wall
normal faces using existing full-cell boundary traversal: left/bottom face at
index0 and right/top positive face at index1, with generated-loop coverage read
before first run. Interior speeds are physical signal. Keep native projection
residual/target/cap counters, both phase stocks and literal mask dimensions.

Potential energy and velocity are staggered; do not compare their mixed-time sum
to an exact simultaneous constant E0 without accounting for that difference.
Record kinetic and potential separately and query the handed-off pure oracle at
their declared times. The passive PLIC observer never changes f, u, p, face fluxes,
forcing, time, solver tolerances or the native event schedule.

## Costs and incompletion

Record active cells, columns, actual step counts/intervals, complete total wall,
VOF and projection stage totals, observation time, native RSS, raw record size,
compiler/native source hashes and the oracle source hash. Timings nested within
total wall must not be added twice. A timeout is incomplete evidence. A coarse
or fine physical failure stays visible; never convert it into a graphics-only
success, change the requested waveform, or claim the whole water goal is solved.
