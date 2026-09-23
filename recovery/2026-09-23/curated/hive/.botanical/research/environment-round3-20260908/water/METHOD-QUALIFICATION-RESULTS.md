# Water method qualification at a fixed 0.54 m ledge

2026-09-08. Isolated research only. The current SWE candidate remains a useful
allocation/workspace optimization of the retained dense reference, **not an
accepted arbitrary-ledge water solver**. No production source, language port,
game integration or performance sweep was performed in this packet.

## Decision from the actual face probe

Do not port the present hydrostatic reconstruction unchanged. At the fixed
0.54 m bottom jump, its reconstructed upstream depth becomes zero for the
0.27 m and 0.54 m moving cases. The actual committed numerical face flux goes
backwards although the independently solved mathematical steady pair has
positive discharge. Horizontal refinement from 1 m to 0.5 m does not change
that result because the physical vertical jump remains 0.54 m.

| Upstream depth | Intended discharge | Actual numerical discharge | Result |
| --- | ---: | ---: | --- |
| 0.27 m | 1.62 m²/s | -0.295509628 m²/s | Reversed; method failure |
| 0.54 m | 3.24 m²/s | -0.879962763 m²/s | Reversed; method failure |
| 0.81 m | 4.86 m²/s | 0.076426318 m²/s | Positive but 98.43% shortfall; diagnostic only |

Each row was evaluated at both horizontal spacings. The intended state is a
frictionless, supercritical Bernoulli bottom-transition path with constant
discharge. Energy/discharge residuals are below 1e-11. It is a mathematical
moving-equilibrium test, **not an experimental oracle for an exposed vertical
waterfall**. Side momentum fluxes were also inferred from the actual cell
impulse and adjacent uniform fluxes; they match the independently written
reconstruction. Dense/candidate agreement therefore locates the failure in the
retained method, rather than accepting it because two implementations agree.

This is consistent with the published limitation of hydrostatic reconstruction
when the reconstructed water depth clips at a bottom step. The original method
targets hydrostatic balance, not this moving equilibrium. Relevant primary
sources: [Delestre et al.](https://arxiv.org/pdf/1206.4986) and
[Audusse et al.](https://www.math.univ-paris13.fr/~audusse/articles/hydro.pdf).

## What the separate radial/rest packet does establish

Both meshes represent the same 32 m square. The radial reservoir starts with
radius 6 m and depth 0.27 m, using analytic disk–cell intersection areas; initial
volume is 30.5362805929 m³. The analytic area check matches πr² within
2.514e-16 relative error, and coarse/fine area partitions within 7.106e-15 m².
This avoids changing the initial physical circle with cell-center occupancy.

Observe 2 s, restart from a retained 1 s checkpoint, and independently test
maximum substeps of 0.02 s and 0.01 s. All twelve simulation cases completed:
four radial runs and eight still-water runs at bed heights 0/0.54 m with free
surfaces 0.81 m or 0.27 m. A separate identity check confirms all 4096 fine cells
retain the same side of the full ledge.

- The owner-selected stability bound agrees with the dense reference each
  interval. Final full state and restarted final state match exactly. This
  packet does not claim full-state serialization/comparison at every interval.
- Depth stays nonnegative at every interval. Maximum inventory discrepancy at
  retained 1 s/final 2 s checkpoints is 1.102e-13 m³. There are no sources or
  film cleanup.
- Still-water depth drift is zero, momentum drift is at most 8.605e-16 m²/s,
  and checkpoint inventory drift is zero.
- Complete quarter-turn volume, momentum and last-flux maps agree to at most
  3.331e-16 in their respective units.

The predeclared front result is **mixed and remains an overall failure**:

| Maximum interval | 1 cm interpolated axis/diagonal bias, coarse → fine | Historical cell-center bias, coarse → fine |
| --- | --- | --- |
| 0.02 s | 4.6301% → 2.9773%; passes | 13.3931% → 2.1479%; coarse fails |
| 0.01 s | 4.6432% → 2.9408%; passes | 13.3931% → 2.1479%; coarse fails |

The declared requirement was coarse bias below 10% and improvement for **both**
metrics. Passing interpolated contours does not erase the failed historical
criterion. All 64 rays have exactly one outward crossing at each of 1 mm, 1 cm
and 5 cm; missing/multiple crossings were not silently replaced. The metric is
a numerical directional-bias check, not an analytic solution of radial flow.

## Ownership correction and exact evidence

The first radial packet stopped at JSON checkpoint equality. A short diagnosis
showed deeply equal state values but different object insertion order: raw
fixture construction placed geometry earlier than the retained serializer.
The cold retained-copy operation now emits one canonical field order for the
state, geometry, faces and event record. It checks unknown keys before copying
so canonicalization cannot erase invalid input. The corrected boundary suite
includes reverse-insertion-order equality and all previous ownership/admission,
retry, stability and exact wet-reference continuation laws.

The numerical `candidate.mjs` is unchanged. The owned stepper still hides private
typed arrays; stability is selected inside that owner. Bulk checkpoints copy
state outside the hot loop. The optional lazy numeric inspection facade remains
study-only, not the intended production per-cell interface. `q` is the last
SWE flux report; deleting it does not alter continuation. `mx/my` are canonical
future-affecting momentum and must survive restoration.

| Guarded run | Invocation | Exit and scope |
| --- | --- | --- |
| u2700 | aa408005a6584af990369a8b850a7ddd | 1; circle areas pass, moving-step method failure retained |
| u2702 | 1f0d7495c025482c85e6e64b3e97c8dc | 1; initial radial/rest checkpoint encoding failure, preserved |
| u2706 | ed678464dd7a45f2b1b7f00cd3b8f91f | 0; isolates field-order difference, deeply equal values |
| u2708 | 95cb0306d43045d586fd142a3f7fb9d8 | 1; six boundary cases pass, thirteen radial/rest cases complete, original front criterion fails |

All owned sessions completed normally. Each invocation was below the declared
60 s budget, using the shared 10-minute/5-second guard. In u2708 the sum of
recorded boundary-case durations is 1.243 s and radial/rest-case durations is
8.495 s; these include proof work and are not isolated kernel timings or a
production speed claim. The earlier original timing evidence stays tied to its
own source pin and 0.1 m terrace fixture.

Evidence directories are `runs/area-and-step-first-method-probe/`,
`runs/radial-rest-first-radial-rest/`,
`runs/radial-rest-canonical2-boundary/` and
`runs/radial-rest-canonical2-radial-rest/`. Their manifests preserve source
hashes, per-case values and original failed outcomes. Current source inventory
is `method-handoff-inventory.json`; prior handoff inventories are not rewritten.

## Next method decision

The next investigation should compare a maintained three-dimensional liquid
reference against actual stepped and free-surface geometry, while retaining SWE
as a regional shallow-water candidate. See `SPH-METHOD-COMPARISON.md` for the
source-grounded family choice and fair fixture contract. There is no evidence
yet accepting waterfalls, vertically overlapping water, pressure pipes, soil
water, gas displacement, thermal exchange or arbitrary terrain edits. Root owns
the common units, topology and coupled material/energy admission decision.
