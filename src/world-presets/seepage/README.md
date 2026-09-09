# Generated-world water binding

This preset connects the reusable voxel world and finite soil/column owner.
The world checkpoint owns edited solids; the volume checkpoint owns water and
time; finite excavation records own removed pore water. Derived contacts,
capacity, geometry and read projections are rebuilt from those facts.

`createExcavationAdapter` accepts a generated-world identity and physical
definitions. Unknown inputs cross the full plain-data, geometry, stock and
cross-owner conservation checks. Returned checkpoints are immutable. A private
weak cache recognizes only checkpoints actually admitted by that adapter, never
a matching revision, an external frozen object or a mutable caller snapshot.

Water advancement retains the unchanged compiled geometry and private world
read projection. It still validates the new stock, total balance and the exact
encoded-data budget before returning. Excavation restores a separate candidate
world before any edit. Failure cannot alter a prior state's subsequent scene,
save or continuation. Shared read facts are frozen; scene arrays are detached.
Dropping the process drops only derived work: reopening a checkpoint revalidates
and reconstructs it through the same public entry.

This is a computation cache, not durable storage or a second authoritative
simulation. The existing Region transaction commits terrain, water, physical
material/work changes and command receipts. The browser consumer has its own
explicit local-save boundary. Neither a cache hit nor a numerical return is a
durable command acknowledgment.

The current connected scene owns32 porous cells and two-layer soil excavation
with real stone bottoms. This does not finish wider field coverage, digging
stone, roofed cavities, water displacement by backfill, or pail/field exchange.
The main game queries generated geometry beyond this bounded water ownership;
unmodeled soil is not implicitly dry.
