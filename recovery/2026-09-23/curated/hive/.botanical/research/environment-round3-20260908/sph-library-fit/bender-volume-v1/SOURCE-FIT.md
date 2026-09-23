# Bender2019: actual source fit and one proposed static qualification

Source-first only. No harness build, map generation, contact call, dynamic tank,
upstream edit or library change has run in this directory. Earlier handoffs are
complete and frozen. The previous cold oracle and failed tank remain evidence,
not adjustable inputs.

## Fit decision

The **real maintained boundary model, map interpolation, quadrature and
contact caller can run using the frozen libraries**. They are suitable for a
bounded cold comparison. Physical fit to our literal voxel-wall/water-volume
contract is still unqualified. Bender2019 deliberately uses an effective
volume and displaced representative boundary point; it also has a penetration
repair that changes momentum and energy outside the pressure solve.

There is one concrete build boundary: `SimulatorBase::initVolumeMap` is part of
the Simulator target excluded by `SPH_LIBS_ONLY`, so it is not in the frozen
libraries. It would be false to say we can call that complete scene/cache
builder as-is. Its underlying maintained Discregrid and Gauss routines and
the runtime consumer are present. Do not build the GUI/simulator or replace
the consumer with an approximate translation to conceal this distinction.

Recommend authoring the input map in the isolated harness using the **exact
retained volume-function body**, real Discregrid and the already-built
GaussQuadrature function. Preserve the leaf verbatim with its source hash.
This is an explicit extraction of map-authoring code, not a new boundary
equation, nor a claim to execute the absent SimulatorBase cache/import layer.
The supplied-map path already exists in the maintained implementation.

## Exact map quantity and units

Let r be the library particle radius, R=4r its support radius and d(X) the
signed distance, positive in available fluid space and negative in solid.
For the 3D builder, with thickness=0 and factor=1:

```
gamma(d) = 1                         d <= 0
           CubicKernel::W(d)/W_zero   0 < d < R
           0                         d >= R

Veff(p) = 0.8 * integral(|u|<=R) gamma(d(p+u)) du
```

Veff has units of cubic metres. It measures a weighted neighborhood volume
including both solid and a soft exterior extension. It is **not** the actual
solid volume, missing kernel density B(p), a liquid stock, or a pressure. The
0.8 factor multiplies this proxy. Source alone does not establish a precise
physical calibration interpretation for that factor, so do not describe it
as losing 20% of the water or restoring mass conservation.

The integrand is not multiplied by W(u); the cubic factor uses *distance to
the solid* in the exterior extension. Conflating these would recreate the
wrong map with superficially plausible units. The builder skips queries with
d(p)>2R and uses `GaussQuadrature::integrate(...,30)`. Here 30 is the rule's
polynomial-order index: the checked table uses **16 nodes per axis**, 4096
integrand evaluations, not 30 cubed.

The checked SDF lambda is `sign*(meshSignedDistance-thickness)`. A nearby
comment mentions subtracting half a particle radius, but that subtraction is
not in the actual lambda. The displacement occurs in the runtime caller.

## Interpolation and force caller

`BoundaryModel_Bender2019::initModel` allocates per-fluid-index/per-particle
arrays for boundaryVolume and boundaryXj after fluid models exist. It owns
and deletes its Discregrid map. It adds no Akinci boundary point set.

`TimeStep::computeVolumeAndBoundaryX` transforms the query into the body's
local coordinates, derives 32 cubic shape functions from map field0, then
interpolates distance and its gradient. It uses that same cell index array
and shape-function array to interpolate field1, the effective volume.
Consequently the two fields must have identical node/cell topology; do not
independently reduce or reorder them. The builder's no-reduction path preserves
this. A sample-predicate can leave unused volume nodes as explicit sentinels,
but every node used by a tested query must exist.

For an Active particle with `0<d<R`, positive finite interpolated Veff and a
nondegenerate SDF normal, the caller normalizes n and writes:

```
L = max(d + 0.5*r, 2*r)
Xj = p - L*n
boundaryVolume = Veff(p)
```

Density then receives `Veff*W(p-Xj)`. DFSPH factor/density-change/pressure
consumers use the maintained volume-map branches. Per unit pressure
coefficient, the boundary acceleration is `-Veff*gradW(p-Xj)`. This operator
does not differentiate the query dependence of Veff and Xj; therefore it must
not be advertised as the exact gradient of `Veff(p)*W(p-Xj(p))`.

The active build uses the interpolated SDF gradient. The alternative
finite-difference-normal define is commented out. At an exact edge/corner,
signed distance itself has no unique classical normal. Compare the resulting
force operator with the smooth *solid-kernel* gradient and report reflection
symmetry and resolution changes; do not compare against an arbitrarily chosen
nearest face and call that exact.

## Exact offsets at the approved fixture radius

r=0.0520020955763 m, R=0.208008382305 m. The physical SDF wall is still at d=0.
The virtual representative point lies `L-d` inside that wall:

| Query | d | L | Virtual depth below/behind physical plane |
| --- | ---: | ---: | ---: |
| Actual first floor row | .045000 m | .104004191 m | .059004191 m |
| Actual first side row | .050000 m | .104004191 m | .054004191 m |
| d >= 1.5r = .078003143 m | variable | d+.026001048 m | .026001048 m |

This is an effective quadrature point, not permission to move the mesh or
shrink the water's physical footprint. Initial fluid mass remains 540 kg.

## Contact operations outside pressure accounting

For d<=0 and a usable normal, the same routine performs:

```
delta = min(2*r - d, 0.1*r)
position += delta*n
velocity = 0  // all components, including tangential velocity
boundaryVolume = 0
```

At our radius the outward correction is capped at 0.005200210 m per call. It
is a position operation, not integration using dt. For this branch d<=0,
the cap is active. It can require many calls to repair deep penetration.

This changes momentum by `-m*v_old`, removes kinetic energy
`0.5*m*|v_old|^2`, and changes gravitational potential by `m*g*delta*n_y`.
A stationary particle on a floor can gain potential energy solely from this
repair. Tangential velocity is removed as well as normal velocity. These
effects cannot be hidden in a pressure-force receipt or called an elastic
collision. Static bodies do not retain reaction impulses through addForce.

`determineShapeFunctions` returns false outside the map domain; missing nodes
produce a max-double sentinel. The caller then leaves zero boundary volume.
An unpopulated required node or map-domain miss must therefore be an explicit
fixture error, not an apparently successful empty boundary. A zero/invalid
normal can likewise suppress the boundary response.

## Concrete frozen API path

Binary symbol inspection confirmed these definitions in existing libraries:

- libSPlisHSPlasH: BoundaryModel_Bender2019::initModel;
  TimeStep::computeVolumeAndBoundaryX (both overloads);
  GaussQuadrature::integrate.
- libDiscregrid: CubicLagrangeDiscreteGrid::addFunction,
  determineShapeFunctions and both interpolation paths.

TimeStep's contact routine is protected. A study-only access subclass can
expose it with `using`, implementing the abstract interface with a `step()`
that throws if called. This invokes the real linked method; it does not copy
its force/contact logic or replace the simulation's DFSPH owner. No public
production API or library patch is needed for that observation.

Proposed construction shape:

```
real Discregrid field0 <- one watertight, inverted box SDF, thickness0
real Discregrid field1 <- exact retained native volume-function body, rule30
real Bender2019 model <- owns that map and particle-indexed output fields
access-only probe -> real protected volume/contact routine
read Veff, Xj, original/result position+velocity
compare with independent union integral and exact physical geometry
```

## One proposed bounded static box/edge/corner packet

This is a proposal for the next authorization, not an executed test.

1. Retain the exact 1 x 1.08 x 1 m closed basin, 0.54 m water depth and the
   600-particle physical quadrature. One inverted watertight box mesh defines
   the complete exterior solid union. Check its sign against the analytic
   box SDF. Do not make a separate map for each overlapping face.
2. Use the same 17 diagnostic locations from boundary-consistency-v1. Add
   one clearly synthetic floor penetration probe at y=-r/20, x=z=.5 with
   velocity `(1,-2,.5) m/s` solely to account for contact changes. The latter
   is a temporary probe state, not a new initial water arrangement. Restore
   its harness-owned position/velocity after observation; no time progresses.
3. Build distance and volume fields with the same grid topology. Bound the
   map region to the box plus a declared 2R halo, with maximum cell spacing
   approximately R/2 and R/4 (18x19x18 and 36x38x36 cells over this domain).
   This is a bounded study cache domain, not the native scene builder's 8R
   padding. It leaves every required query/interpolation node and its full
   radius-R SDF integration support inside the map; assert that property.
   Geometry and physical units never change between the two grids.
4. Populate SDF nodes normally. Compute expensive volume values only at the
   32 nodes required by the fixed query cells using the existing addFunction
   sample predicate. Preserve identical full cell/node numbering in both
   fields; do not call reduceField. Report allocations for the whole grids,
   evaluated node counts, cache-miss sentinels and map construction work.
5. At the fixed queries, separately compare: mesh SDF vs analytic box SDF;
   interpolated SDF vs that exact distance; map Veff vs the direct *native*
   volume integrand; and native Bender density/force operator vs the already
   qualified continuous solid integral/gradient. Those are separate errors.
6. Retain native rule30 for map authoring. At query points only, compare its
   direct integral with native rule50 (26 nodes per axis) as a quadrature
   sensitivity witness. Do not replace map values or silently raise order.
7. Invoke only the actual cold boundary/contact routine, never step().
   Positive-distance inputs must remain unmoved. For boundary/penetration
   inputs, record and analytically account for the exact momentum, kinetic
   energy and potential-energy changes. A successful projection cannot erase
   an impulse from the report.

Suggested numerical controls fixed before that packet: no missing required
node/domain result, finite positive required map values; fine-grid signed
distance error <=0.01R at fixed off-surface points; direct rule30/50 volume
difference <=0.01R^3; fine-grid versus direct-native volume difference <=0.01R^3;
report actual kernel-weighted density and gradient errors rather than treating
those volume tolerances as physical accuracy. Verify exact positive-branch
no-mutation and contact update against source formulas. Keep tie-normal
ambiguity and coarse/fine symmetry explicit. The original hydrostatic
criteria remain unchanged and no static success upgrades them to passing.

The initial source/count budget is at most two small maps, at most
18*32=576 evaluated volume nodes per map before shared-node deduplication,
4096 native quadrature samples per evaluated node, plus the fixed direct
rule50 witnesses. No whole-map dense integration sweep. A guarded 30 s
static ceiling is a proposed upper bound; ask the CTO to approve that concrete
work bound before launching. If it proves too large, preserve the partial
failure instead of changing the sampling policy invisibly.

## Source/provenance boundaries

Checked pin: SPlisHSPlasH f3f677140761db7637b5443beb54f19f1f835ed4 and the
frozen stable-order libraries. Key anchors:

- SimulatorBase.cpp:2524-2740: input-map path, geometry/SDF, exact volume
  function, resolution/cache construction.
- BoundaryModel_Bender2019.cpp:14-75: map ownership and per-particle arrays.
- TimeStep.cpp:181-350: immediate map/contact caller; TimeStep.h:25 for
  protected access. TimeStep.cpp:113 and DFSPH's volume-map branches consume
  its outputs. Simulation.h's volume-map iteration keeps that boundary owner.
- Discregrid cubic_lagrange_discrete_grid.cpp:781-1000: coefficients, shared
  indexing, shape functions, sentinel behavior and interpolation gradients.
- GaussQuadrature.cpp:100 and :5930: rule30 uses16 nodes and actual integration.
- Top CMakeLists.txt:61 and Simulator/CMakeLists.txt:80: missing full-builder
  target under SPH_LIBS_ONLY; frozen library symbol reads confirm the smaller
  callable path.

No new custom boundary has been implemented. A later game adapter must bind
map contents to physical union geometry, radius, construction recipe, version
and topology revision, with explicit invalidation. This note does not start
that adapter or a new saved protocol.
