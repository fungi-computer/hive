# Actual voxel geometry to gas: current boundary

2026-09-08. Ignored caller proof only. Existing voxel, height/sea, gas, visual
recordings and production source remain unchanged.

## Owners and indexing

`worldgen/volume-v2/voxel-world.mjs` owns base material from the corrected
height-sea bed, protected upper strata, the 3D cave field and sparse edits.
`world.read({x,y,z})` is the canonical material query. Decoded 16³ brick arrays
are disposable projections. Their order is x-fastest, **z-next, y-last**.
The gas solver uses x-fastest, **y-next, z-last**. The binding deliberately uses
point reads and its own explicit loop over local z/y/x; it never interprets
a brick array as a gas array. No second terrain snapshot is persisted.

`compileVoxelGas` queries <=512 cells and gives the frozen gas geometry owner
the solid mask, exact [1,.54,1] metre metric and global signed origin. Canonical
domain identity includes world ID, space/realm ID, complete height/cave recipe,
window, axes and sealed boundary policy; world revision is included in gas
geometry identity. Identity serialization sorts keys to preserve equivalent
world descriptions across a JSON reload.

Every window boundary is explicitly sealed, including a window edge inside
otherwise open terrain. A cache/brick boundary is not an ambient reservoir.
The current caller exposes no opening option; a later opening must specify
an actual physical boundary and its source/sink, never infer it from residency.

The retained generated pocket at [18,-48,-64], size3×4×3, is consumed directly
inside window origin [16,-50,-66], size8³. There is no repeated million-cell
cave search or natural-entrance claim. Initial gas is a declared fresh-study
ambient fill of geometrically non-solid cells, not a claim that this cave has
known atmospheric contents.

`advanceBound` checks world identity/revision before calling the frozen solver
and again before admitting its result. It stores no quantities, owns no clock
and introduces no loop. Any subsequent world edit rejects the old binding
before a gas step; caller state and ledgers remain unchanged. The global
revision fence is deliberately coarse and can reject an unaffected window.

## Missing physical contract after topology changes

The current material named `air` means **void of solid**. It does not tell us
whether that volume holds gas, water, vacuum or a mixture. The height/sea owner
describes water initialization potential, explicitly not live water stock or
connectivity. A phase/fill authority must eventually reconcile those facts.

The Boussinesq solver assumes reference air density 1.2 kg/m³ in every fluid
cell; it stores passive tracer and thermal anomaly, not bulk gas mass or an
equation of state. Turning one .54 m³ solid cell into fluid implicitly adds
.648 kg reference air if `initial()` is called blindly. A geometry rebuild is
therefore not a valid post-dig initialization operation.

Three edit cases need a physical decision before remapping exists:

1. **Opening solid into void.** In a sealed region, expansion cannot create
   reference air for free. An incompressible fixed-density model requires a
   specified supply or volume-preserving displacement; modeling pressure drop
   and variable density/vacuum needs a different declared closure. If connected
   to an ambient reservoir, import must pass through explicit boundary volume,
   mass/species and energy receipts rather than making the new cell ambient
   instantaneously.
2. **Filling a fluid cell with solid or water.** Existing tracer and energy
   cannot disappear. Admission needs a bounded displacement/redistribution
   operation with destination capacity and boundary exports, or it must reject
   the edit. Reference enthalpy and bulk mass matter too: preserving only heat
   anomaly is not a complete energy/mass account. Velocity/momentum and work
   done by the changing boundary also require a stated policy.
3. **Opening connectivity without changing fluid volume.** Removing an
   impermeable interface may join pressure components without adding volume,
   but still needs a declared velocity/projection/energy treatment. This may
   be a smaller first physical edit than digging out an occupied voxel.

The useful near-term behavior is explicit rejection and preservation until a
physical transition is accepted. Do not revive stale arrays by deleting their
identity field, zero quantities in newly solid cells, copy the old gas into a
newly initialized room, or claim a successful cache rebuild conserves air.
No remap, vacuum model, water displacement or gas initialization after edits is
implemented by this caller proof. A separate read-only model review owns the
deeper choice; this note supplies its actual source constraints.

## Focused qualification

One guarded proof below30 seconds: actual generated pocket and point mappings,
negative origins/brick boundaries, cache eviction, nonzero buoyant tracer/heat,
conservation, same-domain JSON world+gas reload, and stale/foreign binding
rejection before solver mutation. Cold brick generation, point-read count and
numeric work are reported separately. Gas geometry is a borrowed research
object as documented by its owner, not a deeply frozen public capability.
