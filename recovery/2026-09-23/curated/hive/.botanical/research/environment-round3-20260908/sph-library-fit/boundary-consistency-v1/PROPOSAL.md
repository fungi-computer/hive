# Cold boundary consistency check — proposed before execution

Own only this new directory. The failed `physical-voxel-v1` tank, its source,
thresholds and evidence stay frozen. Reuse the same native stable-order library
and exact 600-fluid/2722-boundary initialization, without a single time step.
Do not change physical walls, represented mass, rest density, radius, sampling
or boundary normalization. Static probes are queries, not moved particles.

## Exact kernel and independent planar integral

The checked `SPHKernels.h:16-108` cubic kernel has support radius R, where
`Simulation.cpp:291` sets R=4*particleRadius. Define q=r/R and

```
W(r) = 8/(pi*R^3) f(q)
f(q) = 1 - 6*q^2 + 6*q^3       0 <= q <= 1/2
       2*(1-q)^3               1/2 < q <= 1
       0                      q > 1
```

For a fluid query distance d>=0 above a solid half-space, its solid kernel
contribution is the spherical-cap integral, not a sum of face weights:

```
I1(q) = integral(q..1) s*f(s) ds
I2(q) = integral(q..1) s^2*f(s) ds
B(d) = 16 * (I2(d/R) - (d/R)*I1(d/R))
dB/dd = -16/R * I1(d/R)
```

Piecewise polynomial primitives, evaluated with an explicit split at 1/2:

| Integrand | q<=1/2 primitive | q>=1/2 primitive |
| --- | --- | --- |
| s*f(s) | 6*s^5/5 - 3*s^4/2 + s^2/2 | s^2 - 2*s^3 + 3*s^4/2 - 2*s^5/5 |
| s^2*f(s) | s^6 - 6*s^5/5 + s^3/3 | 2*s^3/3 - 3*s^4/2 + 6*s^5/5 - s^6/3 |

Independent checks: B(0)=1/2, B(R)=0, B'(0)=-1.4/R, B'(R)=0. Gradient points
into the solid; scalar d increases away from it.

## What Akinci's surface normalization actually represents

`BoundaryModel_Akinci2012.cpp:50` defines each static sample pseudo-volume as
`Vb = 1 / sum_boundary W(Xb-Xj)`, with its self contribution included. It
normalizes a *surface sample distribution*, not a volume filling the solid.

For an infinitely sampled uniform plane, let
`J(d)=2*pi*integral(d..R) r*W(r) dr = (16/R)*I1(d/R)`.
The limit of this normalized surface field is

```
Skin(d) = J(d)/J(0) = I1(d/R)/(7/80)
Skin'(d) = -(d/R)*f(d/R) / (R*(7/80))
Skin(0)=1; Skin'(0)=0
```

It differs intrinsically from the literal missing-solid volume field B(d),
which starts at 1/2 with a nonzero gradient. That is a source-derived
representation distinction; the upcoming finite-sample check measures its
size at our real query positions. It does not declare all Akinci applications
invalid: upstream also initializes fluid blocks with a full-diameter standoff
and a reduced particle volume. Neither convention may silently replace Hive's
specified physical volume and wall plane.

The active library uses its precomputed cubic table, whose W implementation
averages neighboring table values rather than evaluating the polynomial
exactly. Record both actual table-based W/gradient sums and direct polynomial
W/gradient sums with the same actual boundary volumes. This separates lookup
error from fluid quadrature and boundary representation error.

## Corners: integrate a union, never add overlapping half-spaces

For the unchanged basin, solid is the complement of
`D=[0,1]x[0,1.08]x[0,1]`. Partition it into six disjoint regions:

1. x<0, all y,z; 2. x>1, all y,z;
3. 0<=x<=1 and y<0, all z; 4. same x interval and y>1.08;
5. x,y inside D and z<0; 6. x,y inside D and z>1.

Clip every interval to the query's radius-R support cube before integration.
The radial kernel itself is zero outside the support sphere. Face seams have
zero volume and cannot duplicate the edge/corner solid. Equivalently,
`S(p)=1-integral_D W(p-X)dX`, but the disjoint union also makes gradient and
error accounting explicit without cancellation of two nearly equal values.

Independently integrate physical water
`F=[0,1]x[0,0.54]x[0,1]` and air
`A=[0,1]x[0.54,1.08]x[0,1]`. Their kernel measures must satisfy
`F(p)+S(p)+A(p)=1`, and their gradients must sum to zero. Air's missing kernel
support at the free surface is not mistaken for a solid boundary defect.

At a zero-distance perpendicular edge, S=3/4; at a trihedral inside corner,
S=7/8. The gradient components along the two or three inward distances are
B'(0)/2 and B'(0)/4 respectively. These symmetry values provide independent
corner controls. Adding two or three planar B values would incorrectly give
1 or 1.5 at those same locations.

Use independent tensor Gauss-Legendre quadrature at fixed orders 24 and 48
on each clipped rectangular region. For normalized displacement
`u=(X-p)/R`, integrate `(8/pi)*f(|u|)` and
`-(8/pi)/R * f'(|u|)*u/|u|`. The latter is gradient with respect to the query
position, not X. This is an independent implementation of the continuous
cubic kernel, not another call into the SPH library. No discontinuous
inside-solid indicator is placed inside a large unpartitioned quadrature box.

## Fixed query set and comparison

Nine queries are exact initial fluid positions already in the failed tank:

| Name | x,y,z metres |
| --- | --- |
| bulk | .45,.225,.45 |
| floor | .45,.045,.45 |
| side | .05,.225,.45 |
| vertical edge | .05,.225,.05 |
| floor edge | .05,.045,.45 |
| floor corner | .05,.045,.05 |
| free surface | .45,.495,.45 |
| free surface beside wall | .05,.495,.45 |
| free surface beside two walls | .05,.495,.05 |

Add six flat-floor diagnostic queries at `(.5,q*R,.5)`, for fixed
`q in {0,1/8,1/4,1/2,3/4,1}`. Here q=1/2 is the native author's full-diameter
standoff. No opposite wall or ceiling reaches these support neighborhoods.
Add zero-distance edge `(0,.3,0)` and corner `(0,0,0)` controls. Seventeen
queries total; there is no adaptive sampling sweep.

For each query export its actual fluid sum and gradient, actual normalized
boundary sum and gradient, independent F/S/A, and all of these differences:

```
fluidQuadratureError = fluidSum - F
boundaryRepresentationError = boundarySum - S
combinedDensityError = fluidQuadratureError + boundaryRepresentationError
expectedCombinedDensity = F+S = 1-A
```

Use the corresponding vector differences for gradients. Keep fluid, solid,
free-surface deficiency and kernel-table error separate. Report actual
standoffs/radius/support and unchanged spacings `(0.1,.09,.1)` for fluid,
`(.05,.045,.05)` for boundary samples.

The native cold harness must export the actual 2722 initialized boundary
volumes and their positions, not reconstructed weights from a formula. Recheck
`Vb*sum_j W(Xb-Xj)=1` by an independent all-pairs boundary query, accounting
for the pinned W_zero versus W(0) lookup distinction. Retain the 600 physical
positions/volumes and initialization fingerprint. Clock stays exactly zero,
all velocities remain zero, no public or private step/solve is called.

## Declared numerical interpretation and budget

One static packet under 10 s wall, single solver thread. Compilation is a
separate guarded harness-only command against the frozen libraries. No new
tank, smaller-dt retry, library build, port, grid refinement or runtime edit.

Oracle checks before interpreting representation differences:

- Polynomial plane endpoint/symmetry checks within 1e-12 dimensionless.
- Orders 24/48 agree within 1e-4 for each F/S/A measure and within 5e-4 for
  each component of R times their gradients.
- At order48, analytic plane and zero-edge/zero-corner controls obey those
  same bounds; F+S+A differs from one by at most 1e-4 and R times the summed
  gradient has each component magnitude at most 5e-4.
- Native volume normalization error at most 1e-10 after explicitly replacing
  that query's table W(0) with the source's exact W_zero self term. Raw
  uncorrected lookup difference is also reported, not concealed.
- Source pins, 600/2722 counts, unique boundary positions/IDs, unchanged mass,
  zero clock and zero velocity all hold.

If the oracle checks fail, the integral comparison is unqualified and retained;
do not silently increase quadrature order. Native-vs-continuum mismatch is a
measured outcome, not a failed harness that should be tuned away. No new
hydrostatic pass threshold replaces the failed tank's original criteria.

## Maintained alternative is a separate owner contract

Koschier2017's checked `SimulatorBase.cpp:2453-2484` map builder integrates a
signed-distance gamma, with factor5, a nonzero region extending R/5 outside
the surface, and an overall0.8 factor. It is not simply B(d). It owns a real
Discregrid distance/density map, gradient and interpolation errors, thickness,
normal convention, bounds and cache lifecycle. `TimeStep.cpp:413-466` also
owns boundary-point displacement and penetration position/velocity changes.
The maintained Bender2019 path likewise requires its own map and contact
semantics. A voxel-to-boundary adapter must understand these actual consumers;
an enum switch or one independently summed map per face does not prove union
geometry or conservation. This packet reads these paths but implements none.
