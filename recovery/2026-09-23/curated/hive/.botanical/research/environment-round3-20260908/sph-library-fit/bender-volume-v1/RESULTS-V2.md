# Fixed Bender packet v2: complete observations, controls fail

The approved capture correction completed all18 probes on both unchanged grids
in one run. No dynamic step, library rebuild, geometry/stock change or tuning.

- Unit `run-u3096.scope`; invocation `8b7440cf0b73406a95d53fc8b4abbff4`.
- Wrapper and native terminal exit1: the declared numerical controls failed.
- Native/capture/parse1.166293252s; native total1.138498526s, below28s ceiling.
-600 physical fluid rows remain byte-equal to the prior fixture; mass540kg.
- Contact source-formula check, positive physical-distance no-motion, exact
  temporary-state restoration and no time advancement all passed.
- v1 failure/source/binary and all earlier evidence remain unchanged.

## Numerical controls, separately from physics

| Control | Observation | Bound / disposition |
| --- | ---: | --- |
| Mesh vs exact box SDF |5.7222e-14m maximum |1e-12m: pass |
| Fine off-surface mapped SDF error |.00674813m |.00208008m: fail |
| Fine volume interpolation vs direct same mapped-SDF/rule30 |1.34085e-5m³ |9e-5m³: pass |
| Rule30 vs rule50 direct volume |.00102491m³ maximum |9e-5m³: fail |
| Nonnegative volume, all fixed queries |one coarse negative |fail, unchanged criterion |

The sole negative is now identified: coarse free-surface point
(.45,.495,.45)m; interpolated volume=-4.157879213e-9m³. Its exact distance is
.45m, mapped distance.428499997m and support radius.208008382m. The maintained
consumer takes its **outside-active-support** branch and does not accept this
volume. Coefficients range0 to6.78968e-8m³, while interpolation weights range
-.361465 to.285180. This supports the cubic-undershoot explanation. Fine-grid
volume there is exactly0. No tested active-boundary query had a negative volume.
The global nonnegative control stays false; this result does not erase v1.

## Physical boundary discrepancy remains on active planar walls

These are the *boundary contribution* to density/rho0, not total water stock:

| Fine-grid physical query | Native boundary | Literal solid integral |
| --- | ---: | ---: |
| First floor row |1.340890 |.222181 |
| First side row |1.346827 |.197277 |
| Vertical edge |1.816928 |.357173 |
| Floor edge |1.818987 |.377103 |
| Floor corner |2.016955 |.502360 |
| Surface next to wall |1.304527 |.197277 |

At the planar floor the native combined fluid+boundary density is2.145782
versus the independent expected1.000000. Its normal gradient operator is
-38.677949/m versus the physical solid-kernel derivative-5.139486/m.

This planar discrepancy is not explained by mesh/SDF geometry: mapped SDF
matches exact distance to roundoff; mapped-SDF versus direct-mesh volume error
is about1.4e-17m³. Field1 interpolation error is-2.09237e-6m³. The native
rule30/rule50 volume difference at the same point is.000592516m³, and remains
unqualified; do not pretend quadrature has converged. Even the directly
observed rule50 integral differs only a few percent from rule30, while the
native density contribution is about6.035 times the independent solid value.
The actual maintained proxy is not our literal wall-support operator as-is.

Near edges, additional SDF/normal problems are visible and stay separate from
that planar finding. The fine vertical-edge distance is.043251873m versus
.05m. At the floor corner the gradient changes markedly between grids:
coarse(-32.716,-35.941,-32.716)/m; fine(-3.484,-57.970,-3.484)/m. The physical
solid gradient is approximately(-2.987,-3.280,-2.987)/m. A nearer exact SDF
surface alone does not supply the kernel-integrated union gradient.

## Contact changes were measured, not folded into pressure

All temporary query states were restored after recording. At the synthetic
floor penetration query, both grids moved the particle outward.005200210m
and set velocity(1,-2,.5)m/s to zero. For its.9kg mass this produces:

- Momentum change(-.9,+1.8,-.45)kg·m/s.
- Kinetic-energy change-2.3625J.
- Gravitational-potential change+.045912650J.

Exact-distance-zero cases reveal branch sensitivity. Planar zero has mapped
distance+1.34e-15m on coarse (volume accepted, no movement), versus-2.49e-15m
on fine (fallback correction, potential+.045912650J). Both zero-edge probes
are treated as penetrating and move diagonally; vertical potential changes
are roundoff-scale. Zero-corner fallback adds potential+.036993895J coarse
and+.032076110J fine from initially stationary probes. Every displacement,
normal, before/after velocity and energy receipt is in result-v2/result.json.

These are observed kinematic repairs, not pressure impulses or an elastic
collision. No actual DFSPH pressure solve ran. Static boundary force storage
does not account for their reaction.

## Actual static cost

| Grid | Full nodes per field | Expensive volume nodes | Field-array payload | SDF authoring | Volume authoring |18 actual contact calls |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
|18×19×18 |48298 |372 |2397952bytes |11.697ms |62.246ms |.06524ms |
|36×38×36 |365227 |455 |18845104bytes |365.646ms |372.488ms |.08648ms |

Volume-node quadrature upper bounds are1523712 and1863680 sample evaluations;
query-only direct witnesses took46.252ms and114.430ms respectively. Payload
counts include both fields' coefficient/cell/index arrays but exclude allocator
and mesh overhead. Maximum child RSS26240KiB. Authoring includes the diagnostic
coefficient-copy table; contact timings are tiny shared-host observations.
These figures do not establish dynamic water cost or world-scale suitability.

## Decision boundary

Do not proceed to a dynamic Bender tank, port, scalar tuning or another default
boundary sweep. The ignored negative is not the physical problem; the active
flat-wall operator is already incompatible with the stated literal solid/water
contract. Further source work must identify who owns the actual solid-kernel
integral and gradient, rather than replacing it with another unqualified proxy.
Root owns that choice and has requested a source-only maintained density-map
consumer fit investigation. No next physics action has run.
