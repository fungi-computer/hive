# Static Bender comparison: first executable source shape

No numerical packet has run yet. The first compile-only check found an Eigen
storage-type mismatch at the inspection normal output (`Vector3r*` versus
`Eigen::Vector3d*`). That harness-only correction uses the actual API type and
copies into the report. The failed source and log remain in compile-v1-failed.

## Authoring provenance clarified

The actual SimulatorBase leaf uses **mapped field0 SDF**, both for its cutoff
and every quadrature sample. It never queries TriangleMeshDistance directly
inside that integral. `native-volume-leaf.inc` is an exact extracted substring
plus final newline, with pin/line/hash evidence in leaf-provenance.json. Its
rule30, factor0.8, support radius and exterior cubic extension are unchanged.

`map-input.h` supplies the missing scene-authoring context around that leaf:
one watertight outward-oriented box mesh, inverted mesh signed distance,
thickness0, real Discregrid field0 and field1. It authorizes only the fixed
query cells' actual corner/edge nodes through SamplePredicate, retaining full
node/cell numbering. The library's field0/field1 shape-function indices and
required interpolation values are checked for all queries. This is not a
complete saved map and cannot serve arbitrary query cells.

Every required volume node must have its entire support-radius integration
domain inside field0. Thus a max-double miss cannot silently become vacuum
inside the native leaf. Positive effective volumes are required where the
kernel intersects the extended solid; exactly zero remains legal in the bulk.

The diagnostic `directVolume` is explicitly separate from the unchanged leaf.
It evaluates the same scalar integral with three separately labeled distance
sources: mapped SDF, direct inverted mesh SDF, independent analytic box SDF.
Each uses rule30 and direct-query-only rule50. The report separates:

- Mesh geometry/sign error: direct mesh distance minus analytic distance.
- SDF authoring error: mapped versus direct mesh distances, and their volume
  integrals at the same quadrature order.
- Volume-field interpolation error: interpolated field1 versus direct rule30
  integral over that same mapped field0.
- Quadrature sensitivity: rule30 versus rule50, without changing field1.
- Native total density/gradient-operator error versus the already-qualified
  independent solid-union integral. Numerical errors above remain visible;
  their values are not assumed zero when attributing the physical discrepancy.

## Actual consumer and custody

`reference.cpp` initializes the same 600 physical particle positions, masses,
volumes and IDs, with one fluid pointset registration. Bender is one non-pointset
boundary owner. The runner checks initialization CSV against the exact retained
cold fixture's fluid rows. No neighborhood query or time step is required.

`ContactAccess` is an access-only subclass calling the **real linked** protected
TimeStep routine. `step()`/`resize()` throw if called; it never replaces the
Simulation's ordinary time-step owner. The same boundary model owns each map
in turn; replacing the study map explicitly deletes the previous map.

For each of the 18 fixed queries, `observeContact` temporarily lends particle0
to the probe. It snapshots position, velocity, state and boundary scratch,
calls the real routine, reports all changes, then restores those exact values.
This does not add water mass, save a diagnostic particle or advance time.

The three exact-distance-zero probes are retained, not omitted: planar zero,
zero edge and zero corner. Their interpolated distance may select a different
branch, which the report exposes. The additional negative-floor probe starts
with velocity(1,-2,.5) m/s; all others start at rest. Every probe reports before/
after position and velocity, momentum change, kinetic-energy change and
gravitational-potential change. Separate checks require source-formula agreement,
no movement for positive *mapped* distance, and no movement for positive
*physical* distance. Those distinctions prevent a wrongly interpolated sign
from being treated as a valid positive-distance contact.

## Fixed packet and execution boundary

The approved grids remain18x19x18 and36x38x36 with2R map halo, literal box
1x1.08x1m and water depth.54m. The same17 continuum probes plus one synthetic
contact probe run once on each grid. No dynamic tank, full dense volume-map
construction, library change or refinement search is present.

Limits remain mesh-distance1e-12m, fine off-surface distance .01R, volume
interpolation and rule30/50 differences .01R^3, contact-position1e-14m,
exact positive-state/no-time/restoration laws. They are numerical controls,
not new hydrostatic acceptance criteria. The independent GL48 solid-union
oracle is copied byte-for-byte from the previously qualified packet.

The runner captures source, binary, compile recipe, native stdout/stderr,
initial physical state and library hashes before launch; native timeout28s
leaves room inside the approved30s envelope. It never retries. Compilation
uses the shared proof guard; the numerical run will use that guard too.

Counts expose full field array payload (excluding allocator/mesh overhead),
SDF samples, expensive volume nodes, quadrature upper bounds, authoring time,
direct-witness time, actual contact-call time and process maximum RSS. These
are static study costs, not a per-frame solver or world-capacity claim.
