# Connected water in the voxel world

King Bolete, 2026-09-09. Source-grounded next implementation decision after the
live excavation/seepage consumer at `25a3697`. This is a design qualification,
not a passing implementation or a full engine/environment acceptance.

The current finite soil owner already owns one mass vector, pressure solve,
paired face ledger, bounded work, time and checkpoint identity. Extend that
owner with surface connections between actual open columns. Do not introduce a
second surface-water stock, clock or browser simulation. The first public pit
remains explicitly a local consumer; the environment still needs the real
Region/DO transaction, request-free wake and restart join.

## Physical approximation

For voxel-scale filling and drainage, use a broad-crested overflow relation.
This deliberately omits momentum, waves, ballistic falling-water travel and
impact. The retained SWE moving-water result across 0.54 m ledges was not
accepted; this different model must qualify its own stated behavior.

USACE distinguishes overflow relations from momentum-resolving 2D equations:
https://www.hec.usace.army.mil/confluence/rasdocs/hgt/latest/guides/modeling-weirs-in-2d-areas

The independent numerical source review found the CMS submerged-flow fit in
equations 6-10–6-12, printed page 58:
https://erdc-library.erdc.dren.mil/server/api/core/bitstreams/465be97e-91c2-4fdd-8827-ab31cd518c8d/content
The review read this source; Root's subsequent direct web fetch returned403.

For each actual adjacent pair, derive crest height and the length perpendicular
to flow from the admitted voxel geometry. Free surface is
`baseY + max(pressureHead, 0)`; a dry-floor negative pressure multiplier is not a
below-ground free surface. Choose the higher surface as upstream:

```text
hu = max(upstreamSurface - crest, 0)
hd = max(downstreamSurface - crest, 0)
r = hd / hu
phi = 1                                      if r <= 0.67
    = 1 - ((r - 0.67) / 0.33)^3              otherwise
Q = direction * Cprime * sqrt(g) * length * hu^(3/2) * phi
```

Dry upstream or equal surfaces give exact zero. The normalized cubic explicitly
adjusts the rounded CMS coefficient27.8 to vanish at equal heads; name/version
this approximation. The dimensionless coefficient is an explicit content
definition, not a universal calibration. For `K=Cprime*sqrt(g)*length`, analytic
derivatives are `K*sqrt(hu)*(1.5*phi-r*phi')` upstream and
`K*sqrt(hu)*phi'` downstream. They have the paired Jacobian signs needed by the
current solver. This does not prove convergence of the combined nonlinear solve.

## Geometry and conservation

- A column's capacity must describe actual empty voxels. A lower single-voxel
  pit reaches capacity exactly at a one-voxel-higher bed. Further filling needs
  real upper storage or another overflow edge; silently increasing the pit's
  capacity would fabricate space.
- Each open face must represent an unobstructed connection. Soil side contact
  uses that individual voxel face's height interval, not the whole column's
  height. Opaque world materials remain consumer-owned meanings.
- Surface edges participate in the existing residual and equal/opposite mass
  ledger. No dry donor or blocked crest may receive a numerical cleanup flow.
  For the first connected porous-floor graph, build the closure tree from Darcy
  faces and retain surface edges as chords. Disconnected or solid-floor cases
  need explicit component/closure handling before admission.
- Include column geometry, coefficients and the exchange-law version in the
  existing identity. Failed solves leave the input uncommitted. Finite capacity
  rejection must not clip stocks or discard overflow.

## First implementation evidence

Qualify a real0.54m drop with donor depth0.27m and a dry receiver; downhill flow
must begin. Independently compare free drainage refinement to
`h(t)=[h0^(-1/2)+K*t/(2*A)]^(-2)` while tailwater is below the crest. Check dry,
subcrest, equal-level, reversed and submerged cases and derivative continuity.
Then require actual stacked receiving capacity, spill onward, sealed overflow
rejection, coupled pore-water balance, unchanged closed-edge transfers and exact
restart/replay. Freeze these workloads and tolerances before claiming numerical
or performance acceptance. A coplanar two-cell example alone cannot close the
ledge or deep-world requirement.
