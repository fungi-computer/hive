# Generated-world water binding

This preset connects the reusable voxel world and finite soil/column owner.
The world checkpoint owns edited solids; the volume checkpoint owns water and
time; finite excavation records own removed pore water. Derived contacts,
capacity, geometry and read projections are rebuilt from those facts.

`createExcavationAdapter` accepts a generated-world identity and physical
definitions. Unknown inputs cross the full plain-data, geometry, stock and
physical conservation and removal-provenance checks. Returned checkpoints are immutable. A private
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

The current connected scene starts with32 porous cells. A cut removes actual
generated soil, or deepens an existing vented shaft into actual generated stone.
The preset owns interpreting those numeric material IDs; the soil owner knows
only its explicit porous cells, sealed/porous bottoms and physical contacts.
Canonical world edits derive the column runs. An arbitrary cave, overhang,
unowned lateral outlet or detached underground cut is rejected rather than
flattened into a surface column.

Current checkpoint version is `height-caves-connected-excavation-v7`. Every
removed voxel has exactly one record, sorted by its stable
`excavation:cell:x,y,z` ID. Both kinds own `at`, canonical numeric `materialId`,
`quantity:1` (one removed voxel), `waterKg`, and `sourceVoxelM3`. A `porous`
record additionally names the actual `nodeId` and `soilId`, and exports that
node's actual finite water. An `impermeable` record has no pore-node fields and
exports exactly0kg of water. No unknown material defaults to dry soil or rock.
Record fields, provenance, capacities and physical water balance are checked
on current-format reopen; old formats are rejected without migration.

Deepening stone adds empty capacity and lowers the column base. The same water
ID, water quantity, solver time and accepted-step count survive exactly. Upper
porous side contacts stay at their real heights, and the stone floor has no
fictional soil node or bottom flux. This is the existing instantaneous
hydrostatic column approximation: it does not resolve falling momentum, waves
or gravitational energy.

The focused fixed-seed consumer excavates17 cells down through y=0, retaining
29 porous nodes and two columns. Its18 removal records describe3 soil and15
stone voxels. Six-second comparisons at three-/17-cell depths use the same
owner with dt ceiling6s versus0.1s, a predeclared5.4mm water-height tolerance and
2e-9kg paired/constitutive residual bound. It also tests exact current reopen,
nonzero water preservation, invalid source records and SQLite Region rollback/
retry without duplicate removal. This is not a browser, native DO or hosted
proof.32 cells is the bounded per-column admission limit, not the tested
hydraulic depth; it allows at most256 column air voxels across the existing
eight-reservoir limit without adding a pressure unknown per depth cell.

The main game still admits only its existing soil targets and rejects imported
stone-source checkpoints until its actual material/yield owner joins them.
The independent Region consumer owns deep-stone commands and finite source
records now; it does not create game inventory. Existing finite removed pore
water and future physical lots cannot both spend the same source stock.

## One original mass and one physical boundary

The canonical physical state alone owns fixed `soilState.initialTotalKg` and
signed `soilState.boundaryKg`. The former outer `initialWaterKg` field is gone.
Removing a porous voxel preserves the original reference and subtracts its
actual pore water from boundaryKg, while putting that exact water in the
existing removal record. Removing impermeable stone changes neither water nor
boundary. Remap copies surviving stable-ID stocks to the new checked geometry;
it does not call an initializer that silently rebases the original mass.

`adapter.exchange(state, {nodeId, direction, massKg})` delegates to the same
volume's detached finite free-water transfer. It leaves world, removal records,
geometry, time and accepted-step count unchanged. The immutable admission cache
retains compiled topology but still checks physical state and the exact encoded
byte budget before remembering the new checkpoint. Unknown wire still fully
revalidates. No mutable projection is shared across an actual excavation.

Read facts expose physical `boundaryKg`, `residualKg`, exact summed
`exportWaterKg`, and **derived** `exchangeWaterKg = boundaryKg + exportWaterKg`.
The latter excludes spoil and represents net other boundary transfers into the
field; it is not saved as another ledger. `totalWaterKg` remains the clearly
defined current field plus recorded spoil quantity, which now changes when an
outside counterpart supplies/withdraws water. Physical residual comes from the
volume owner; this adapter does not duplicate its conservation validator.

The adapter alone cannot certify that external material water paid for an
exchange. Its parser accepts physically coherent supplied-boundary states and
checks removal records against source provenance/capacity, not an unavailable
history of material transfers. The composed game/Region must validate
`exchangeWaterKg + kgPerUnit*(materialWater - initialMaterialWater) == 0` in one
candidate. Until that join, current game admission must require zero external
exchange (within its stated arithmetic allowance) and keep its existing closed
material-water budget. A physical receipt is not authority to mint a pail lot.

New focused laws deposit into a real generated column, run same-owner side
infiltration, remove a further actual porous voxel, deepen to stone, and reopen
before further flow. Fixed original mass, exact exported pore water, zero stone
transfer, column identity and clock survive. These are source/JS laws only;
the native wet proof receives a current field-name update, not a new native run.

Wider field coverage, zero-port/disconnected columns, roofed cavities, water
displacement by backfill, gas coupling and the paired pail/material join remain separate
work. The main game queries generated geometry beyond this bounded water
ownership; unmodeled soil is not implicitly dry.
