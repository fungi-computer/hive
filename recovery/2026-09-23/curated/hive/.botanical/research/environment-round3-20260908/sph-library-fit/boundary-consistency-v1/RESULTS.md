# Cold oracle qualified; the sampled surface is not the physical solid

One approved static packet: `run-u2983.scope`, invocation
`0f1a81fc89404c4fa119fefa28729102`, terminal exit 0. Native execution plus
runner capture/parse took 0.06460 s. Clock stayed exactly zero, positions and
velocities stayed unchanged, all 600 fluid and 2722 boundary identities were
retained, and water mass remained 539.999999999994 kg. No solver step ran.

**Exit 0 qualifies this measurement's analytic/numerical oracle, not water
physics.** The prior hydrostatic failure stays unchanged. This result explains
why that physically specified initialization is incompatible with the tested
normalized single-surface boundary.

## Independent controls passed their predeclared thresholds

| Check | Actual maximum error | Declared bound |
| --- | --- | --- |
| GL24 versus GL48 density | 6.0913e-6 | 1e-4 |
| GL24 versus GL48 gradient times R | 1.0962e-4 | 5e-4 |
| Fluid + solid + air density partition | 5.1403e-8 | 1e-4 |
| Partition gradient times R | 5.7135e-6 | 5e-4 |
| Analytic plane/edge/corner density | 2.9763e-8 | 1e-4 |
| Analytic plane/edge/corner gradient times R | 1.8455e-6 | 5e-4 |
| Actual boundary-volume normalization, exact self term | 9.2833e-16 | 1e-10 |

The uncorrected self-table normalization error was 3.7915e-9, separately
reported. `computeBoundaryVolume` uses W_zero for self whereas generic table
W(0) differs slightly. The all-pairs check uses the actual search's strict
distance<R membership rule. This observation did not replace any boundary
weight or change the active kernel.

The independent union used disjoint solid regions, not sums of overlapping
faces. The zero-distance edge returned solid measure 3/4 and the corner 7/8,
as required. Air above the water was its own region.

## What the initial particles actually see

All values below are dimensionless contributions to normalized kernel density.
The expected combined value is physical fluid plus solid, leaving any air
support empty. It need not equal one at a free surface.

| Exact initial location | Sampled fluid | Continuous fluid | Sampled boundary | Continuous solid | Actual combined | Expected combined |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| Interior | 1.00315 | 1.00000 | 0 | 0 | 1.00315 | 1.00000 |
| Above floor | .80489 | .77782 | .76383 | .22218 | 1.56873 | 1.00000 |
| Beside wall | .83868 | .80272 | .71400 | .19728 | 1.55268 | 1.00000 |
| Vertical edge | .69836 | .64283 | 1.04337 | .35717 | 1.74173 | 1.00000 |
| Floor edge | .67031 | .62290 | 1.06232 | .37710 | 1.73263 | 1.00000 |
| Floor corner | .55615 | .49764 | 1.22473 | .50236 | 1.78088 | 1.00000 |
| Free surface | .80489 | .77782 | 0 | 0 | .80489 | .77782 |
| Surface beside wall | .67031 | .62290 | .71618 | .19728 | 1.38649 | .82017 |
| Surface beside two walls | .55615 | .49764 | 1.04540 | .35717 | 1.60155 | .85481 |

At the floor corner, fluid quadrature error is +.05851 but boundary error is
+.72237. At the floor, the respective errors are +.02707 and +.54165. The
boundary representation dominates; neither the 0.315% interior fluid error
nor the roughly 1e-4 kernel-table differences explains the explosive startup.

Actual native fluid sums at the nine real particle queries use W_zero for the
self term, matching the density caller. The prior tank's independently
reported density used generic W(0) even for self, differing here by only
7.64e-9. That reporting distinction is recorded; no old result was rewritten.

## It is more than a missing scalar factor or insufficient surface resolution

On a flat plane the measured boundary follows the independently derived
normalized *skin* limit, not the volume of solid within the kernel:

| d/R | Sampled boundary | Analytic skin | Analytic solid half-space |
| --- | ---: | ---: | ---: |
| 0 | 1.000000 | 1.000000 | .500000 |
| .125 | .914526 | .914481 | .330074 |
| .25 | .696792 | .696429 | .187760 |
| .5 | .214233 | .214286 | .033333 |
| .75 | .017849 | .017857 | .001302 |
| 1 | 0 | 0 | 0 |

The R/2 probe is the native block builder's full-diameter standoff. Querying
there does not change the original distribution; it is a static witness of
the field shape. Multiplying all weights by 1/2 would fix only the value at
the plane. It would not fix the distance profile, gradient or corner union.

At the exact corner, the sampled boundary measure is .75358 versus the
physical .875. Its gradient is approximately `(+5.521,+5.744,+5.521)/m`,
whereas the solid gradient is approximately `(-1.683,-1.683,-1.683)/m`.
At the actual nearby floor-corner particle the measured gradient is
`(-.836,-.194,-.836)/m`, versus `(-2.987,-3.280,-2.987)/m`. Thus even the
direction near contact cannot be repaired with a positive scalar multiplier.
The exact-corner diagnostic is not an assertion that a valid water particle
should be placed inside solid; it exposes the field's behavior where a
collision/contact owner would need a coherent response.

This does not condemn every Akinci simulation. It establishes that this
normalized single-surface realization does not directly represent our literal
voxel solid with a mass-matched water quadrature. Native initialization uses
reduced volumes and geometric standoffs; accepting such an effective boundary
would need a separate declared physical contract and convergence evidence.
Finer samples on the same plane approach the wrong target field for the
literal-solid interpretation, as the analytic skin limit already shows.

## Smallest physical recommendation

**Keep DFSPH under investigation, but do not port this single-skin boundary
as the voxel-water boundary.** The next cold comparison should use the
maintained default Bender2019 volume-map path on the same physical box/edge/
corner contract, accounting explicitly for its map and contact semantics.
Do not try smaller timesteps, hide escaped particles, alter water mass or
shift walls to repair the frozen hydrostatic receipt.

The pinned native default selects Bender2019 (`Simulation.cpp:92`). Its actual
map builder (`SimulatorBase.cpp:2630-2674`) owns a signed-distance field and
integrates a solid indicator plus an exterior cubic extension, multiplied by
0.8. Its caller (`TimeStep.cpp:274-345`) places an effective boundary point at
`max(distance + .5*radius, 2*radius)` and can move penetrated particles outward
and zero velocity. This is not simply our analytic solid convolution, and
these contact effects require their own geometry/impulse accounting.

Koschier2017 is another maintained owner, but its builder uses a factor5
signed-distance gamma, an R/5 exterior band and an overall0.8 multiplier;
its caller also has penetration position/velocity corrections. Neither map
is an innocent enum switch or already qualified replacement. The smallest
next decision is whether the maintained volume-map owner can meet our fixed
physical mass/wall contract, with an explicit effective contact offset and
bounded error as resolution changes. Test that before writing a custom
boundary solver or resuming tank dynamics.

A future voxel adapter must provide one actual solid union, including corners
and openings. It cannot create independent overlapping face contributions
and call their sum the volume. Keep geometry revisions and the boundary
representation's cached map lifecycle at that owner. This is a physical
boundary requirement, not a proposed new ECS or game protocol.

## Cost and preserved artifacts

Native initialization including state export: 9.51 ms; independent all-pairs
normalization: 14.05 ms; native 17 probe sums: .159 ms; independent GL oracle:
36.32 ms. Native elapsed including probe output: 60.45 ms. Peak child RSS
21,944 KiB. These are static checks, not solver throughput or world-capacity
claims. The runner's .06460 s interval excludes pre-run source hashing/copy
and final receipt serialization.

`result-v1/initialization.csv` retains the actual fluid positions/volumes/mass
and initialized boundary positions/pseudo-volumes, all at round-trip decimal
precision. Its SHA256 is
`79eb55f7355639d261e02067c46352ba87737625a7931f44da1419860f47e7ad`.
Exact probe values, both quadrature orders, gradients, raw/direct-kernel sums,
decomposed errors and source hashes are in `result-v1/result.json` and its
frozen `source/` directory.

Harness-only compile `run-u2981.scope`, invocation
`19314b7148a74d139f4308df291b0dba`, exited 0. No upstream/library edits,
dynamic run, threshold changes or automatic second static packet occurred.
