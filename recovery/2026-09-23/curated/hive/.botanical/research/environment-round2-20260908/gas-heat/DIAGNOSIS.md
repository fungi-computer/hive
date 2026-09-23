# Gas/heat, second Astra pass — 2026-09-08

**Disposition: needs correction.** Useful ventilation behavior is now demonstrated,
but the tested interior airflow closure is not selected for production. Keep
spatial control volumes for the actual source/opening/occupant consumer; a single
room value or horizontally uniform two-layer record loses relevant placement.
No game source, art, dependency, backend, release or first-round evidence changed.

## What failed previously

The first trial emitted only 3 kJ into 8 m³: 0.31 K whole-volume warming. Its
peak 0.00164 m³/s implies over 81 minutes for one ideal turnover, versus a
five-minute observation. Coefficients had no physical aperture calibration.
Adding an upstairs outlet then transported smoke towards the occupant before
appreciably exhausting it. A single incompressible exterior edge cannot provide
continuous exhaust without replacement air. These are physical/representation
failures; halving a numerically stable timestep cannot repair them.

## Controlled replacement

[Criteria](PREDECLARED.md) were written before execution: export at least 80% by
900 s and reduce upstairs integrated concentration at least 25% versus sealed;
dt differences ≤5%, spatial differences ≤15%, separately checked balances,
divergence and passive-scalar bounds. These are authored gameplay-fixture targets,
not health, tenability or fire-safety limits.

The 4×6×2 m house has two storeys, a right-hand stair aperture, fixed source and
breathing neighborhoods, and physically measured 0.5 m² exterior openings. A
120-second pulse supplies 1.2 g dilute tracer and 120 kJ sensible heat; vents open
at 120 s. Initial indoor warmth is 5 K above outside and fully ledgered. The
source is prescribed, not a combustion/fuel simulation.

One nonlinear pressure solve gives divergence-consistent carrier flow:

```text
internal q = A/(β length) [πa − πb + ρg Δz mean(ΔT)/Tref]
aperture q ≈ Cd A sign(Δπ) sqrt(2 |Δπ| / ρ), Cd = 0.7
Σ outward q = 0 per fixed-volume cell
```

The orifice equation is smoothly regularized only within 10⁻⁵ Pa of zero.
Vertical opening subfaces admit different flow directions. [NIST CFAST's vent
chapter](https://nvlpubs.nist.gov/nistpubs/TechnicalNotes/NIST.TN.1889v1.pdf)
supports integrating an opening across pressure reversals and using a discharge
coefficient; this experiment is not CFAST. [NIST CONTAM](https://www.nist.gov/publications/contam-user-guide-and-program-documentation-version-32)
supports pressure-network airflow and transported contaminant/exposure analysis.

Interior β=1 Pa·s/m² is an **unvalidated Darcy drag closure**, not a derivation of
empty-room momentum. Symmetric tracer/thermal mixing uses explicit D=0.01 m²/s.
Their geometric length/area scaling is preserved on refinement. Conservative
upwind transport uses the same solved carrier for smoke and signed thermal
anomaly. Aggregate outgoing carrier plus mixing selects substeps ≤0.4; nothing
independently clips or rounds pressure-solved faces.

## Observed layout effects

At 1 m cells, 900 s observation:

| Opening layout | Smoke exported | Upstairs exposure versus sealed | Time reaching 80% export |
|---|---:|---:|---:|
| Sealed / single unresolved port | ~0% | same | never |
| Low inlet / low opposite outlet | 7.9% | 7.5% lower | never |
| Low inlet / upstairs high outlet | 91.0% | **45.5% higher** | 474 s |
| Low inlet / lower ceiling, opposite source | 88.0% | 47.5% lower | 467 s |
| Low inlet / lower ceiling, beside source | **90.4%** | **58.1% lower** | **352 s** |
| One tall opening, resolved counterflow | 79.7% | 42.0% lower | never |

Times begin at source ignition, not vent opening. Keeping height equal, the
source-side outlet reduces upstairs exposure another 20.2% versus the opposite
wall. Moving exhaust upstairs can clear the building while pulling smoke through
the occupied space. This is an actionable layout distinction, not universal
"high vent good" behavior.

A warm-house tall-aperture probe supplies equal real inflow/outflow: 0.07820 m³/s
at 0.5 m resolution and 0.07690 at 0.25 m (1.7% difference), with nearly zero net
carrier. No external tracer sink or fictional suction is present. An initially
ambient house slows local-exhaust 80% clearing to 864 s and exports 80.4%; the
initial warm reservoir therefore matters.

## Numerical/model rejection remains necessary

dt 1→0.5→0.25 s changes high-outlet exposure under 0.46%, local exposure under
0.11%, and export under 0.06%. Save/restart plus reversed input edges reproduces
the full state exactly. A step crossing the 120 s forcing boundary matches two
explicit boundary-aligned steps. Closed floors yield exactly zero upstairs
smoke; open/close events preserve stocks and alter subsequent flux.

Spatial refinement is harder. Local exposure rises from 0.001558 to 0.002361
kg·s/m³ at 1→0.5 m: a **34.0% error relative to the finer result**, exceeding
15%. Its benefit survives against resolution-matched sealed exposure
(58.1%→53.6% lower). The remote-high outlet changes from 45.5% worse to 1.66%
worse. The one-cell stair cannot resolve opposing advective streams; added
subfaces, first-order numerical diffusion and interior closure all matter.
The 1.66% remote-high difference is smaller than the observed spatial uncertainty;
its exact sign is not a robust player guarantee.
At 0.25 m, local exhaust exports **86.6%**, reaches 80% at **431.5 s**, and cuts
upstairs exposure **51.8%** versus its matched sealed baseline. The 0.5→0.25 m
exposure difference is **11.2%**, within the declared 15%; export differs 1.23%.
Thus the source-local benefit survives both refinements, while the 1 m default
fails. No finest remote-high result or fine-grid timestep convergence is claimed.
Largest measured errors are 1.18×10⁻¹⁷ kg smoke, 2.33×10⁻⁹ J signed thermal
anomaly and 2.00×10⁻¹⁰ m³/s cell divergence.

Changing β from 0.1 to 10 changes high-outlet export from 96.6% to 47.3% and
reverses whether it improves upstairs exposure.
Local export at β=10 fails the unchanged target (78.5%). Changing D from 0 to
0.05 changes local export from 97.7% to 82.3% and strongly changes upstairs
exposure. A zero-mixing coarse stair can falsely protect upstairs completely.
These sweeps expose uncertainty, not calibrated physical confidence intervals.

Choose **bounded spatial volumes with resolved physical openings** for this
consumer. Two states with identical room/two-layer totals but tracer beside
versus opposite the vent export 86.7 mg versus zero in their first second.
Uniform layers alone cannot preserve that information. A stratified compartment
model remains a possible cheaper approximation only with explicit local
source/plume/capture zones and demonstrated equivalence for supported layouts;
this counterexample does not evaluate CFAST's complete submodels.

Before integration, replace or independently validate the interior transport
closure against a bounded low-speed momentum/projection reference. Preserve
horizontal source/occupant/vent gradients and sub-aperture counterflow; require
spatial convergence for the same exposure decision. Do not select another drag
number merely because it passes the clearing target.

## Thermal and coupling limits

Stored H=ρVcp(T−Tref) is **signed thermal anomaly**, neither positive stock nor gas
internal energy. A −5…+5 K passive fixture remains bounded and conserves heat.
A four-neighbor thermal star conserves heat under pair clamps but drives its
center to −1 from initial [1,0,0,0,0]; aggregate stable substeps reach [0.2,…].
Conduction stability requires dt·ΣG/C bounds independently of total balance.

A sealed air/water exchanger transfers 7.49 kJ with zero material transfer and
balanced energy. A separate rigid-gas counterexample shows why withdrawing
internal energy instead of enthalpy misses pressure work. A frozen-temperature
80% enthalpy withdrawal leaves negative energy even though its mass donor limit
passes: reject/subdivide/couple that proposal. [FDS's energy formulation](https://raw.githubusercontent.com/firemodels/fds/master/Manuals/FDS_Technical_Reference_Guide/Equation_Chapter.tex)
distinguishes enthalpy, internal energy, pressure and mixture state.

Oxygen/fire require finite constituent masses, finite fuel/reaction extent,
declared products and chemical-energy accounting. Sealed pressure requires free
volume, internal energy, equation of state and a coupled admissible solve.
Water occupying 0.2 m³ of a 1 m³ air cell cannot erase 0.24 kg background air:
reject unsupported displacement or execute explicit vented-displacement/
compression and work accounting. The current solver's volume is fixed;
research API callers need admission checks. Evaporation/condensation requires
water/vapor ownership, saturation, compatible phase energy and latent heat once.
None follows from dilute smoke. No oxygen depletion, flooding, steam, acoustic
waves, realistic flames, radiation or outdoor plume recirculation is claimed.

[Executable/API](experiment.py), [probes](probes.py), [aperture probes](aperture-probes.py),
[raw results](results.json), [comparison](decision-results.json) and
[native run evidence](RUNS.md) are retained. Performance is confined to these
Python fixtures; no actor, browser, production or population capacity claim.
The 384-cell local run took 568.7 wall seconds for 900 simulated seconds,
2,192 substeps and 1.37 million linear iterations; process peak RSS was 19.4 MiB
and its JSON state 16,896 bytes. This bounded unoptimized reference is expensive.
