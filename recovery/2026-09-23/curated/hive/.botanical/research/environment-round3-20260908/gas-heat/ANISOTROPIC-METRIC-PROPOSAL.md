# Narrow rectangular-cell support — proposal only

2026-09-08. Root proposes1 m horizontal and.54 m vertical voxels, four per
2.16 m storey. Gas evidence currently uses a separate square-grid physical
house at0.5 m spacing. Do not resize it to pretend the world already matches.

## One metric owner

Extend the immutable geometry descriptor with `hx`, `hz`, extrusion depth `b`
and a checked `hx=hz=dx` compatibility constructor. This reference's `z` means
vertical; Hive's world `z` means a horizontal ground axis. An explicit section
placement must map horizontal distance and vertical height into the world.
Keep positive local array indices separate from signed world origins/IDs.
Bind metric and mapping to saved-state identity before game use.

```text
volume = hx*hz*b
u-face area = hz*b; center distance = hx
w-face area = hx*b; center distance = hz
pressure weight = face.area / face.distance
scalar diffusion conductance = D*face.area / face.distance
gradient = directional difference / corresponding spacing
viscous Laplacian = dxx/hx² + dzz/hz²
vertical buoyancy = g*thermalAnomaly/Tref
```

At1×.54 m with declared1 m section depth, volume=.54 m³, horizontal-face
area=.54 m² and vertical-face area=1 m². A2 m extrusion doubles them; choose
depth explicitly. A2D slice still does not exchange with adjacent world slices.

Regular staggered four-sample cross-velocity interpolation can remain for
uniform rectangular cells. No-slip ghosts use the corresponding distance;
boundary half distances are hx/2 or hz/2. Face IDs/history, conservative
receipts, pressure pins and operator invalidation keep their existing owner.

## Stability in the existing step owner

Scalar transport already bounds outgoing carrier plus diffusion by cell
volume. Momentum must bound the sum of advection and viscosity:

```text
dt*(abs(u)/hx + abs(w)/hz + 2*nu*(1/hx² + 1/hz²)) <= safety
```

This reveals a generality gap in the current square-grid reference:
`advance` bounds advection and viscosity separately. Current house cases have
tiny molecular viscosity and small combined rates, but separate ceilings do
not guarantee stability for arbitrary high-viscosity/high-speed input. Correct
that owner and add an adversarial combined-rate case before claiming arbitrary
metric/coefficient support. This does not invalidate the reported fixture.

## Narrow implementation and checks

Replace implicit dx assumptions in `geometry`, face metrics and `predict`/
`advance`; no second solver/scheduler. Retain the old house through square
compatibility and add a separate game-metric fixture at0/2.16 m storey datums.

Qualify square compatibility, then rectangular Taylor–Green with amplitudes
that preserve divergence, using kx and kz for the two domain wavelengths:

```text
u = U*sin(kx*x)*cos(kz*z)*exp(-nu*(kx²+kz²)*t)
w = -U*kx/kz*cos(kx*x)*sin(kz*z)*exp(-nu*(kx²+kz²)*t)
p = rho*U²/4*[cos(2*kx*x)+(kx/kz)²*cos(2*kz*z)]
    *exp(-2*nu*(kx²+kz²)*t)
```

Also check hydrostatic rest, no-slip walls, directional scalar translation/
diffusion, receipt units/conservation, exact-metric restart and same-revision
metric mismatch rejection. Numerical refinement subdivides the same physical
geometry; it does not redefine world voxel height. No3D, pressure-pipe,
displacement or narrow-throat claim follows from rectangular-cell support.
