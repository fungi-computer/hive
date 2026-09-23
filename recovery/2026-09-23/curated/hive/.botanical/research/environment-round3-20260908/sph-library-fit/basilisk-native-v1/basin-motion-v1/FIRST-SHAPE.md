# Actual moving-wave source checkpoint

Source implementation now exists under the accepted proposal; no numerical wave
has run. Root read all five source/caller files and the native volume-centroid
and boundary-loop implementations. Its roundoff uncertainty correction is applied:
the independent comparator requires the reported nonnegative energy uncertainty
<=2e-6 of E0, without touching f. This follows from the existing raw fraction
bounds and closed finite volume; it does not relax a physical accuracy limit.
Root authorized compile-only after this freeze, with generated event/loop review.

## Entry and mutation owners

wave.c is 2D/serial only and accepts exactly `coarse` or `fine`; there is one
separate native process per case. It sets the same literal physical constants,
root64/128, masks, native fraction initialization, zero velocity and pressure
initial guess. The accepted oracle's fixed period only sets run duration and
DT cap, never pressure, force, velocity or phase fractions. Direct gravity and
native p/uf boundaries remain the qualified corrected-basin formulation.

`init` initializes only the candidate-owned simulation. Its inherited native init
fills face velocity/properties/stability. The separate initial_observation event
checks geometry, stocks and measured initial profile after that chain.

The new `vof` event only records time/count and starts a timer, then inherits the
unchanged conserving event which actually transports f and both momenta once.
Its inherited ordinary VOF invocation sees interfaces=NULL and does no second
transport; tracer_advection restores it. `projection` only starts a timer before
the native projection; end_timestep observes after the solver's real correction.
The same scheduled stop pattern as the accepted basin requires completion at T.
Generated ordering must be read before any numerical packet, not inferred from
matching event names. No native event is manually invoked by this caller.

Every step records outer begin, actual dt, previous dt, velocity time, explicitly
**nominal** fraction-stage time, VOF invocation count and cumulative VOF transport
duration. The latter equals the ordinary full-step advancement, not the nominal
half-step label. Startup/ramping limitations remain exactly as declared. There is
no fitted time origin, exact variable-step-clock claim or hidden startup solve.

## Observer owns only finite derived workspace

wave-observation.h has two reused static buffers: double heights[100] and int
counts[100]. Both are reset on every read; only 50 or100 entries are emitted.
Actual combined sizeof is emitted, rather than assuming an ABI's byte count.
A WaveObservation value has fixed scalar fields and two four-entry wall arrays.
There is no heap allocation, mesh copy or retained writable simulation buffer
in this observer. Emission borrows the column array only until the next read.

Canonical f owns stocks. Columns sum raw f*Delta; actual shared rho(f) and u
supply kinetic energy. For 0<f<1, the maintained interface_normal/plane_alpha/
plane_center chain supplies the volume centroid in local cell coordinates.
No surface centroid is confused with a volume centroid. A nonfinite or out-of-
cell native centroid is an explicit invalid-moment observation, not clamped.

Water first moment is f*Delta²*(y+Delta*centroid.y). The exact flat-interface
moment is subtracted per cell before the small perturbation sum is accumulated.
Full/empty cells have known moments. Raw f outside [0,1] retains its signed formal
cell-centre contribution and separate absolute-volume/signed-moment accounting;
it is never described as a physical negative parcel. The conservative bound
DeltaRho*g*H*sum(abs(roundoff volume)) is emitted. Its finite, nonnegative and
<=2e-6 E0 comparison is now enforced. Canonical f is never changed by observation.

Four actual normal-face measurements use left/bottom index0, right/top positive
index1, with each physical boundary coordinate/length validated. Interior face
motion is recorded but not rejected by the former rest criterion. The observer
also retains raw fraction extrema, actual phase volumes, centroid errors, maximum
face divergence, native solve residual/target/cap, and costs. No rest COM or
instantaneous Mg-only support gate is reused for this moving problem.

## Independent comparison and bounded execution

The accepted oracle is copied byte-identically under oracle/, source SHA
1b9ae075cc53816831945a0f9f8f023f6bf395da53352ac4dfe8ceeb02076c84.
Its326 mathematical checks are root evidence, not a candidate wave result.
compare-wave.mjs independently computes signed mode using exact cell-average
cosine weights, full profile errors, time-weighted RMS, signed zero crossings,
late return, and separate-time energy diagnostics. It does not normalize by
measured initial amplitude or fit frequency/phase. The fixed refinement rule
and all physical limits match PROPOSAL.md; the bounded roundoff check makes the
previously declared uncertainty explicit. Energy remains a staggered diagnostic.

compile-wave.py verifies all frozen local and upstream source pins and qcc hash,
then generates translated C plus one binary; it never runs the binary. Its115s
inner total build allowance sits inside the authorized120s wrapper guard.
run-wave.py is separate and remains unexecuted: two fixed fresh processes,
coarse then fine, combined28s native/capture ceiling, at most2000 completed rows
per case. It preserves raw logs/partial records and captured compile/source hashes.
The read-only Node comparison then has15s, outside the numerical budget. The
native batch peak RSS is captured before Node runs; stage times remain nested.
No run, build directory or result directory exists at this source freeze.
