# Literal solid density input: maintained DFSPH fit and remaining wall owner

Source/algorithm review only, after frozen Bender result-v2. No map authoring,
library edit, executable test, dynamic run or port accompanies this note.
Checked SPlisHSPlasH pin f3f677140761db7637b5443beb54f19f1f835ed4 and the same
frozen non-AVX, double-precision stable-order libraries.

## Decision

**The maintained Koschier density-map branch can consume the physical solid
kernel integral and its derivative without changing DFSPH's pressure algebra.**
Its native map-authoring function is not that integral and must not be used
unmodified. Supplying literal B is an explicit change of boundary input method,
not an assertion that the stock Koschier configuration is physically qualified.

This is the smallest useful remaining SPH pressure-support candidate because
the meaning of the supplied scalar and derivative matches every active DFSPH
consumer. It removes the Bender effective volume/representative-kernel mismatch.
It does **not** fix the maintained contact operation, contact/query sequencing,
map interpolation error or existing fluid quadrature error. Those are separate
real acceptance requirements, not details to defer until after a port.

Recommend qualifying this exact physical input through the maintained active
consumer before abandoning the pressure solver we already measured. Do not
run another default map or a dynamic tank first. If the project will not own
an explicit geometric contact mechanism and bounded geometry-cache lifecycle,
then this input-only route cannot complete the water system; choose a grid
free-surface owner instead. Root owns that engineering choice.

## One physical quantity

For the complete static solid union S and the fixed normalized cubic kernel:

```
B(x) = integral over y in S of W_R(x-y) dy       dimensionless
g(x) = gradient_x B(x)
     = integral over y in S of grad W_R(x-y) dy  1/metre
```

B lies in[0,1] for a normalized nonnegative kernel and literal indicator
geometry. It is missing *solid kernel support*, not fluid mass or a stored
water quantity. It is computed from the union, including corners exactly once.
It contains no empirical0.8, exterior gamma extension or wall displacement.

Physical fluid still owns its existing particle volumes/masses and positions.
Air remains genuinely missing kernel support at a free surface. Do not fill
air with B to make a free-surface density read1. The initial density predicted
for the discrete fluid is `sum_j V_j W(x_i-x_j) + B(x_i)`; any residual fluid
quadrature error remains visible. Replacing wall input does not license mass
normalization or moving the particle lattice.

The independent cold half-space/corner oracle already expresses B and g. Its
qualified mathematical identity is not proof that a newly interpolated map
or a live particle solve reproduces them.

## Exact maintained signs and callers

`TimeStep.cpp:375-447` interpolates field0 as physical signed distance and
field1 as a scalar with its interpolation gradient. For local-to-world
rotation Q, the caller stores:

```
boundaryDensity = field1(x_local) = B
gradRho         = -Q * grad(field1)(x_local) = -g_world
```

That minus sign is deliberate. At a floor B decreases upward, so g points
downward and the stored gradRho points upward into fluid. The supplied scalar
must be B itself; do not pre-negate its gradient or multiply B by rho0.

The checked non-AVX consumers have matching signs:

| Consumer | Native boundary operation | With literal B |
| --- | --- | --- |
| TimeStep.cpp:157-172, density |add rho, finally multiply total by rho0 |density/rho0 adds B |
| DFSPH.cpp:1158-1186, diagonal factor |self gradient subtracts gradRho |self gradient adds g; squared norm enters denominator |
| DFSPH.cpp:1224-1246, predicted density |delta subtracts(v_i-v_wall) dot gradRho |adds(v_i-v_wall) dot g, then dt*delta |
| DFSPH.cpp:1279-1297, divergence/density rate |same subtraction |same physical derivative of B |
| DFSPH.cpp:1346-1356, pressure acceleration |a += k_i*gradRho |a_boundary=-k_i*g |
| DFSPH.cpp:1416-1423, matrix product |response subtracts a_i dot gradRho |adds a_i dot g; outer solver supplies dt² or dt |

Here k_i names the actual pressure coefficient consumed by this solver, not a
new declaration that a warm array stores pascals. Density and divergence
solves share the same acceleration/matrix functions; their existing dt²/dt
warm scaling remains unchanged. Their final applied contributions both belong
in an impulse receipt, as in the previous two-pressure observer.

The factor denominator contains fluid-neighbor gradient squares plus the
squared *total self gradient*. It does not invent independent moving solid
degrees of freedom. The density-map loop in Simulation.h:63-74 is active only
when stored boundaryDensity is nonzero. Thus the density and force branches
share the same admitted map contribution.

Existing restrictions remain: factor/pressure epsilon1e-5, scalar equal-fluid-
volume assumptions in predicted density/divergence/matrix products, unilateral
compression pressure and the neighbor-deficiency divergence rule. Map boundaries
add no pointset, so that neighbor count does not count the solid. No viscosity,
XSPH, moving-body or other-solver acceptance is inherited from this source read.

## What is being replaced in native authoring

SimulatorBase.cpp:2443-2472 currently builds approximately

```
0.8 * integral W_R(u) * max(1 - 5*d_mapped(x+u)/R, 0) du
```

The linear gamma is greater than1 inside the solid and extends R/5 outside it.
It uses mapped SDF inside the integrand and native rule50. It is not the literal
solid indicator. A previous stock map produced by that function cannot be
reused as physical B by relabeling it.

An explicit physical input would author field1 from the actual union integral,
with field0 retaining the true physical distance used for contact/admission.
The complete SimulatorBase importer is unnecessary: the existing supplied-map
path and BoundaryModel_Koschier2017::setMap already admit a real Discregrid map.
The frozen binary exports initModel, computeDensityAndGradient and all five
listed DFSPH operations; no library build or pressure-equation copy is needed.

Discregrid derives the field1 gradient from its32 scalar coefficients and their
shape-function derivatives, scaling by cell metrics. It does not consume an
independently stored gradient field. Consequently the qualification must check
both interpolated B and its *actual reconstructed derivative*. Merely accurate
node values do not establish accurate gradients. No clamp may independently
change B while leaving the derivative unchanged.

Field0 and field1 must preserve identical cell/node topology because the caller
uses field0's indices and shape functions for both. Missing cells return
max-double and suppress response. Sparse authoring must cover every possible
query in its declared support region, not only the18 study probes; the latter
was an intentionally bounded diagnostic, not a gameplay map.

## The unresolved contact operation is not an input detail

The maintained active density branch requires `0.1*r < d < R` and B>1e-6.
It also requires a usable SDF normal; otherwise it zeros B and g. The tiny-B
cutoff therefore removes a real tail of the physical integral, and its lost
gradient/error must be measured. Normal failures can erase a valid physical
kernel gradient even though pressure itself need not use a nearest-face normal.
For example, at the center of a symmetric narrow gap, a mapped nearest-wall
SDF can have zero gradient while B remains positive. Dropping B because a
representative force-point normal is unavailable would still be incorrect,
even when the two walls' physical g contributions cancel there.

For `d <= 0.1*r`, TimeStep.cpp:449-468 does:

```
delta = min(-d, 50*r*dt)
x'    = x + delta*n
v'    = v + (0.05 - dot(v,n))*n
B = 0; gradRho = 0
```

At our r=.0520020955763m and dt=.001s:

- Contact band reaches **positive** clearance.00520020956m.
- Deep penetration correction caps at.00260010478m per call.
- For0<d<=.1r, delta=-d: it moves a center inward onto the physical wall.
- Normal velocity becomes+.05m/s regardless of its previous magnitude;
  tangential velocity is retained.

For fixed unit normal and particle mass m, the exact changes are
`deltaP=m*(.05-v_n)*n`, `deltaK=.5*m*(.05²-v_n²)` and
`deltaU=m*g*delta*n_y`. A resting particle can gain kinetic energy; a particle
already moving outward faster than.05m/s loses energy. A small positive-
clearance particle can lose potential by being pulled onto a floor. These
changes are outside the pressure solve and static addForce does not receipt
them. The code also lacks the Active-state check present in the Bender contact
branch; bounded future fixed/animated-particle behavior needs its own review.

The representative point is `x_j=x-(d+.5R)*n`, placing it.5R behind the physical
plane. Unlike Bender, it does **not** select a kernel argument for pressure
support. It supplies a reaction-force point and other material consumers.
For static walls the pressure gradient can therefore be physical even though
this point is displaced. Dynamic torque, viscosity and contact cannot be
declared correct from that fact, especially where g is not parallel to n.

Most importantly, DFSPH.cpp:127 performs neighborhood search **before** the map
contact call at144. Any positional correction can invalidate the already-found
neighbor lists. Stable sorting gives a reproducible order, not a valid list
after a geometric move. A complete method must settle collision before the
relevant query or explicitly rebuild after movement. Changing only map values
does neither. This finding is source-derived; no contact test was run here.

## Whole voxel-union authoring and bounded cache ownership

For aligned disjoint solid voxels C_k, the physical input has a useful additive
definition:

```
B(x) = sum over occupied C_k intersecting support(x,R)
         integral over C_k of W_R(x-y) dy
g(x) = the corresponding sum of kernel derivatives
```

Voxel interiors are disjoint, so faces/corners have no double-counted solid
volume. For a room represented as the exterior of one closed box, retain the
previous disjoint complement partition; do not sum six overlapping halfspaces.
For partial collision solids, first define a non-overlapping physical union;
the rendered sprite silhouette is not that geometry.

Do not use an independently interpolated SDF as a substitute indicator inside
this physical B integral. Use the actual solid-cell classification/geometry.
Keep the numerical kernel/support/version bound to that geometry. Smooth-kernel
integration over clipped solid boxes, with fixed order/refinement error checks,
can supply cached scalar values and an independent derivative witness. A
previous qualification of GL24/48 on17 points does not qualify arbitrary cells.

The spatial index narrows relevant solid cells to the support neighborhood.
At the current R=.208m and1m horizontal/.54m vertical voxel dimensions, a
support AABB has extent2R=.416m, smaller than each voxel dimension; it intersects
at most two cell intervals per axis (eight candidate cells). This is a geometric
bound for full aligned voxels at this radius, not a claim about arbitrary thin
objects, different radii or the cost of integrating each candidate.

Runtime should not loop one boundary model per world voxel: forall_density_maps
loops every boundary model for every particle. A physical world-union boundary
must query its own local geometry/cache. Bounded active maps need halo samples
and a stable global node lattice across cache/chunk boundaries. Cache eviction
cannot change fields; rebuilt values need deterministic cell/reduction order
if exact-restart semantics are retained.

An edit to one voxel affects B only within that voxel expanded by R, plus the
interpolation stencil needed by those affected queries. Invalidate those nodes
at the geometry owner. Pin physical units, geometry revision, kernel/radius,
integration recipe and node lattice. That invalidation does not settle water
displacement or work caused by construction: coupled edit admission remains a
separate physical operation.

Cache cost is not free. The previous fine Discregrid box used365227 nodes per
field and18.85MB of field-array payload while only455 volume nodes were actually
authored for fixed probes. Full arbitrary-query coverage would require many
more integrals. Literal B may be smoother than SDF at corners, but its derivative
accuracy and a viable map spacing still need measurement. Do not extrapolate
the18-query contact timings into a whole-world cost claim. At the retained
particle volume.0009m³, one cubic metre of water corresponds to about1111
particles; a large regional-water budget remains an independent decision.

## Compare with a grid free-surface owner

| Boundary/ownership question | Physical-B input with maintained DFSPH | Grid free surface, e.g. conservative volume fractions and face velocities |
| --- | --- | --- |
| Literal solid wall |B and g provide pressure support; geometric contact still needed |Closed solid faces impose impermeability directly |
| Water quantity |Existing particle masses/volumes |Cell water volume/fraction with conservative face transfer |
| Waterfall and disconnected water |Particles can represent them, still requiring collision qualification |Full3D free surface can represent them; advection/interface reconstruction must be qualified |
| Voxel edits |Geometry-cache invalidation plus particle displacement/contact work |Face/volume remap plus displaced-water/momentum/work accounting |
| Extra numerical ownership |Solid integral map, gradient accuracy, contact sequencing, neighbor lifecycle |Free-surface transport/reconstruction, liquid pressure domain, thin films and small cut-cell policy |
| Useful existing code |Measured maintained DFSPH and exact-order/restart work |Some gas face/metric/projection concepts may inform it; gas advection or SWE is not already a liquid free-surface solver |

A grid owner fits fixed voxel walls and regional inventories naturally, but
switching is a substantial method change, not turning the gas solver's scalar
into water. It still needs volume-conserving interface advection, pressure at
the liquid/air surface, a gravity/rest law and appropriate open boundaries.
It can use cells finer than the game voxel with explicit axis metrics; storage
chunks must not become impermeable faces. No grid capacity or performance
claim has been measured in this comparison.

## Smallest decision-producing next step, proposed only

If retaining SPH, make **literal B and its reconstructed gradient** the explicit
next input-method hypothesis. A bounded static test should first compare the
real active density-map consumer against the existing planar/edge/corner oracle
and verify all five DFSPH sign/response operations without advancing time.
Separate near-contact cutoffs and the exact native repair from that active
test. Reject map/sign/gradient inconsistencies before running another tank.

A later dynamic qualification must either have an explicitly reviewed contact
owner or fail immediately if the stock kinematic repair is invoked; accepting
unreported repair would repeat the earlier mistake. Keeping the stock repair
does not become acceptable by decreasing dt or moving the wall. Preserve fixed
mass/geometry and the existing hydrostatic requirements.

If that pressure-input qualification still requires empirical density factors
or if contact/cache work exceeds the useful retained solver, stop this branch
and select a grid free-surface implementation. Do not add a third authority or
hide the decision behind a generic plugin interface. Root should choose which
one method owns finite moving water after reviewing this scope/cost boundary.
