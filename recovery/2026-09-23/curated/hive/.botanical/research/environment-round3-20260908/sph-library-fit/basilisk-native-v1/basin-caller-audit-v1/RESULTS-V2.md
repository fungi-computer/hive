# Corrected native aligned-basin result

The single source-v2 packet **passed every unchanged original physical and
numerical control**. The previous failure remains frozen in ../result-v1; it is
not overwritten or relabeled as a numerical-method failure. The only executable
correction deleted four prescribed normal face-velocity overrides which conflicted
with the native direct-gravity pressure boundary. AUDIT.md derives that conflict
from actual generated/native callers and independently predicts the failed result.

## Exact execution

- Compile-only: run-u3234.scope, invocation 5fe29c3bacff4c0d8aad77fdf5da2af3,
  terminal exit 0; 29.0376s including generated-C review output and compilation.
- One numerical packet: run-u3241.scope, invocation
  ae681f2583e84b7faca0e6e69df16865, terminal exit 0, no timeout.
- Same run-proof wrapper, native ceiling 28s. No extra diagnostic or rerun.
- Source 43e3273fdce3f677c47d8c576123a9b077ebb83aa4c7107d01a94848e52a8cda;
  binary 3cb77462bd37a59df9ed2b48514291e916fab57aecb58abc462d8e3b138871c0.
- Observer 0544aa933596eec97403d8df452a77a6dfea579fbe7eed987be10419f261e1d8
  is byte-identical to v1. SOURCE-V2-INVENTORY.json was checked after the packet;
  every candidate and preserved-v1 entry remained unchanged.

## Literal fixture and measured result

This is a 1m wide by 1.08m high **2D unit-depth** closed basin, fixed 0.02m full
cells (2700 active cells), initial water depth 0.54m. Water density remains
1000kg/m³, incompressible second-phase air 1.2kg/m³, gravity 9.81m/s². No
partial embedded cells, adaptive refinement, viscosity, surface tension, reduced
gravity, analytic pressure initialization or source-equation change was used.
The 0.02m mesh is a physical-method discriminator, not a game-resolution mandate.

111 ordinary native steps reached exactly 0.1s velocity time. Actual dt ranged
from 0.00009090909 to 0.00098569998s under the unchanged 0.001s cap; this is not
an assertion that every substep was fixed at the cap. The final staggered volume
fraction time is 0.09950715001s, explicitly distinguished from velocity time.

| Quantity across completed steps | Observed | Frozen acceptance |
| --- | ---: | ---: |
| Maximum cell speed | 9.89861e-8m/s | ≤1e-6m/s |
| Maximum all-face speed, including wall normals | 9.90207e-8m/s | ≤1e-6m/s |
| Maximum hydrostatic pressure error after removing gauge | 0.000517619Pa | ≤0.01Pa |
| Maximum relative net wall-support error | 2.98776e-8 | ≤1e-5 |
| Maximum water volume drift from initial | 2.27596e-14m³ per metre depth | ≤1e-10 |
| Maximum air volume drift from initial | 2.30926e-14m³ per metre depth | ≤1e-10 |
| Maximum water COM drift from initial | 1.16573e-14m | ≤1e-7m |
| Minimum/maximum volume fraction | −2.75209e-13 / 1 | [−1e-12,1+1e-12] |
| Maximum projection residual / actual target | 0.989361 | ≤1 |
| Projection iterations | 1–20 | <100 |

The tiny negative fraction is reported, not clamped or described as exactly
bounded by zero. Initial stocks are 0.5400000000000058m³ per metre for each
phase, already within summation roundoff of the physical 0.54m³. Drifts above
are relative to that initial measurement. Every native control independently
passed the original absolute physical limits.

Expected total support is (540+0.648)*9.81 = 5303.75688N per metre depth.
Final measured bottom traction is 5304.105896340216 and top traction
0.349018837483225N/m, giving **5303.756877502732N/m net support**. Subtracting
top from bottom removes the arbitrary pressure gauge. The final maximum
hydrostatic-pressure error is 1.07294478e-5Pa and cell/face speeds are
9.91983e-9 / 9.93757e-9m/s. These are actual wall-ghost traction and field
observations, not acceptance based on a Poisson residual alone.

No nonfinite records, JSON parsing errors or stderr output occurred. Every
reported interval is contiguous; one initial and one completed terminal record
are retained with all 111 completed-step rows.

## Cost and meaning

Native wall time **including passive observation** was 0.230665s for 0.1s
simulated time. The projection stage total was 0.107495s; VOF stage total
0.092114s. These stage times are nested in native wall time and must not be
added again. Outer capture wall was 0.266773s. Peak child RSS was 16,768KiB.
These are one shared-host, serial native, small-fixture measurements, not a
population/world-capacity benchmark or cross-method performance comparison.

This closes an aligned solid wall/rest-pressure-support discriminator that the
previous particle-boundary studies did not close. It establishes neither a
moving free surface nor a waterfall, three dimensions, exact save/restart,
terrain edit conservation, finite-gas coupling, a browser/WASM port or production
licensing fitness. The existing GPL source remains an isolated native reference.
The smallest next physics question is finite motion over an actual 0.54m ledge
with the same complete-cell wall owner, under a separately reviewed fixture and
independent mass/energy/front/support criteria. No such run is included here.
