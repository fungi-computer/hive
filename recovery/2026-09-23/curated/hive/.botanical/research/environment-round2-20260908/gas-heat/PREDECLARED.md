# Gas/heat second-round criteria, recorded before execution

The physical question is whether opening placement can improve a two-level
occupant's exposure and clear finite smoke without removing it by fiat.

Fixture: 4 m wide × 6 m high × 2 m deep, floor at 3 m with a 1 m wide stair
opening on the right. Source occupies a fixed 1×1×2 m lower-left volume and
emits 10 mg/s tracer plus 1000 W sensible heat for 120 s. Initial house is
5 K warmer than the outside; this initial heat is ledgered. Exterior has zero
tracer and 293.15 K. This is deliberately dilute/warm air, not a flame core.
Observe 900 s; vents open at 120 s. Compare sealed, one unresolved port,
low inlet/high exhaust, low inlet/low exhaust, source-local exhaust, a single
tall opening resolved into vertical subfaces, and stair closed/reopened.

Useful ventilation requires ≥80% of total emitted smoke exported by 900 s,
first 80% clearing time ≤900 s, and ≥25% lower integrated upstairs breathing-
height exposure than sealed. Source-local exhaust should discriminate against
remote exhaust for upstairs protection. These are declared game-fixture goals,
not calibrated tenability or safety criteria. No requirement is lowered after a
failure. A useful layout may fail one goal and remains explicitly partial.

Numerics: smoke balance ≤1e-10 kg; signed thermal-anomaly balance ≤1e-5 J;
cell divergence ≤1e-8 m³/s; no negative tracer below -1e-14 kg; passive scalar
maximum principle in a source-free test; aggregate outgoing fraction ≤0.4.
No independent face clipping or rounding. dt 1/.5/.25 s differences ≤5% and
dx 1/.5/.25 m differences ≤15% for export/exposure (relative to finer result,
with an absolute floor of 1% of sealed exposure for near-zero denominators).
Exact save/restart and canonical input permutation on the supported Python
runtime. Close/open topology must change flux, preserve quantities and leave
zero upstairs smoke when the floor stays closed.

Candidate: finite-volume, Boussinesq pressure-balanced overdamped circulation;
interior Darcy resistance scales as length/area; real exterior apertures use a
regularized square-root orifice law (Cd .7) with vertically resolved area.
Interior drag 1 Pa·s/m² and diffusivity .01 m²/s are explicit *unvalidated*
closures. Compare drag .1/1/10 and diffusivity 0/.01/.05 rather than silently
tuning them. Strong sensitivity or failed spatial convergence blocks solver
selection even if one layout clears. This model is neither Navier–Stokes nor
CFAST; the latter is an alternative requiring plume/layer/vent ownership.

Thermal probes separately test aggregate conduction stability, negative thermal
anomaly, sealed heat exchange, and internal-energy versus enthalpy outflow.
Proofs are bounded research, not game/actor/browser/scale evidence.
