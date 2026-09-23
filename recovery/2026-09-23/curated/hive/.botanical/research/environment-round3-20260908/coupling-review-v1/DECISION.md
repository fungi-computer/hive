# Root review: water, gas, soil and excavation must share physical boundaries

Current evidence, 2026-09-09: the historical source-fit statements below are not
the current run status. The generated-world/unlined-soil excavation now passes
in `../soil-water-v1/excavation-v1` (u3421), including finite spoil, four sides,
floor seepage and exact moving restart. It explicitly assumes vented air and
does not join finite gas or general free-water momentum. The native thermal
caller has compiled and produced a conserved partial heating response, but
failed its cost limit (`../gas-heat/basilisk-sealed-heat-v1/run-v1`). The current
queue and limits are in `../GOAL.md`. Preserve the shared-authority decisions
below; do not repeat the completed source-fit or infer full coupling.

2026-09-08. Source/reasoning only, owned by Game CTO. No solver invocation,
production code, new backend, package adoption or source-owner reassignment.
Existing water/soil/gas authors keep their current isolated checkpoints.

## Decision for the actual candidates

The accepted soil column owns finite pore-water mass under a rigid, vented,
isothermal approximation. The new graph extends that owner. Finite gas owns
cell mass/internal energy and face momentum in a fixed full box. The present
Basilisk basin tests two incompressible phases. None is yet a joined flooded
excavation. A water-volume receipt is insufficient to join incompatible
pressure and available-volume assumptions.

When water advances into a room, the remaining gas volume changes. Its species
masses, energy and pressure must be evaluated on that remaining volume. A
fixed-density air phase in the water reference cannot also be the finite gas
inventory. Likewise, two independent projections cannot each decide the same
interface velocity/normal pressure. Geometry, interface motion and pressure
coupling need one mutually consistent numerical treatment, whether monolithic
or converged partitioned. This is a mathematical authority requirement, not a
proposal for a generic message bus or another game clock.

The next water result remains its corrected aligned-wall reference. The next
soil result remains bounded 3D finite flow. The gas owner first attributes its
signed mechanical-energy defect. Preserve their independent oracles rather than
silently changing them into an unqualified combined solver.

## Reduced gas energy is a deliberate model choice

The independently read [Nalu low-Mach derivation](https://nalu.readthedocs.io/en/latest/source/theory/lowMachNumberDerivation.html)
separates thermodynamic and dynamic pressure. Its asymptotic energy equation
omits kinetic, viscous and gravitational work at the stated order; thermodynamic
pressure may still vary with time. This supports describing our current sealed
gas result as finite mass/internal-energy conservation, not full energy
conservation. Restoring a numerical mechanical residual to internal energy
would change the thermodynamic/divergence model and needs a derived closure.

Our donor-density/gravity compatibility defect is separately a discrete issue,
not excused by the low-Mach approximation. The source audit derives a positive
mechanical-energy contribution for a small circulation in stable stratification.
The current net loss hides that contribution. Its integrated magnitude and
separation from projection/RK dissipation are not in the earlier recordings.

The linked current PeleLMeX model URL and LBL paper PDF returned404 during this
read; search snippets are not treated as checked derivations or current APIs.

## A relevant maintained coupled reference exists, with concrete gaps

Root read the complete pinned `all-mach.h`, `compressible/two-phase.h`,
`compressible/thermal.h` and `compressible/NASG.h` in the official archive already
owned by the water study. This is a source fit only. The archive has not been
modified and these solvers have not been compiled or exercised here.

The [all-Mach solver](https://basilisk.fr/src/all-mach.h) uses a pressure
Poisson–Helmholtz equation with finite bulk compressibility, reducing to its
incompressible case through an explicit branch. It expects another owner to
advect momentum. This is a useful mathematical reference for avoiding separate
gas/liquid pressure owners, not evidence that its lifecycle fits Hive.

The local compressible two-phase source carries separate phase masses and total
energies, one mixture momentum and a volume fraction. Its VOF advection moves
the related phase quantities together; properties feeds the EOS into the
all-Mach solve, and the end hook adds pressure work. Important actual limits:
phase disappearance zeroes phase mass/energy; gravity work is absent from this
energy hook despite acceleration in the momentum owner; some viscous terms are
explicitly missing. Thus the header's total-energy description alone does not
prove our gravitational energy laws. Its web page fetch returned500; this read
used the complete pinned local source, lines1–570.

The [thermal extension](https://basilisk.fr/src/compressible/thermal.h) solves
temperature and pressure together and distributes an actual heat-flux update
between phases. This is stronger coupling than exchanging two independently
updated temperatures. It adds neither soil Darcy flow nor our species/oxygen
inventory. Its convergence scaling, finite-stock admissibility and actual
energy balance would require their own fixed tests.

The local NASG implementation exposes pressure, internal energy and bulk
compressibility from phase state. Its thermal-expansion expression is specific
to the gas-phase contribution, while its sound-speed implementation does not
use all NASG coefficients. These are source-fit cautions, not a claim that the
published restricted cases are invalid or that defaults are calibrated water.
No new EOS is selected for Hive by this read.

The existing cubic-cell metric, mask/edit, exact restart, inactive-region cost
and GPL adoption boundaries still apply. A compiled basin does not settle them.
Do not port either standalone candidate or launch another solver comparison
before its concrete physical question and source boundary are accepted.

## Excavation is a physical operation, not an occupancy toggle

Removing a wet soil voxel must account for dry solid, its pore water and the
new open volume. Soil carried away as wet spoil carries some water with it;
water retained in the hole must be explicitly accounted for. Creating an empty
void must not convert its removed soil water into both spoil moisture and loose
water, or seed air from a material label without an admitted boundary supply.

The first useful later test should name this cause: excavate one cell and
record where its initial solid/water went, then observe finite neighbouring
soil seep into the exposed cavity. Compare the sum of soil water, free water,
wet-spoil export and named external receipts before and after. A successful
test must also preserve gas volume/species ownership or explicitly use a
vented-atmosphere approximation with recorded boundary exchange. These are
different supported experiments, not interchangeable claims.

For backfilling, displaced fluid must find valid capacity or cause the edit to
wait/reject under its declared policy. Rebuilding derived faces/pressure guesses
and changing a geometry revision does not settle displaced water or gas. The
same laws apply when a neighbouring region activates; a cache edge is not a
drain or ambient-air source. Exact save/reload must retain accepted physical
state and edit receipts, then rebuild derived geometry consistently.

## Source pins

Official archive SHA256:
`a629017cabad6626d71c782510f1d70b078eae44cc1c594c3e6b6fbb808164ae`.

| Relative to `basilisk-native-v1/basilisk/src` | SHA256 |
| --- | --- |
| all-mach.h | ea6dd43da175fd056ed7775f7ca2dad11b2b363f0997bbdd841ee6abcdfde785 |
| compressible/two-phase.h | 6111af5eb899222c320a316cedbb569670ae0a4c31318399c13f49bba4e2f231 |
| compressible/thermal.h | 1b685f1279634a6adb4f88da70e3d48c4f7cbc29bcc831db79711bba727f0f47 |
| compressible/NASG.h | c45057c628ddcfe52422fb1964bea00162ed95bc412c78662d9e0f8068415f8b |

This note provides the next physical coupling decision and preserves limits.
It is not an implemented excavation transaction, an accepted package migration,
an energy correction, a new benchmark result or completed foundational goal.
