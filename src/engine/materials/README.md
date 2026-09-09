# Physical materials: first supported consumer contract

Import `createMaterialOwner` from `index.ts`. Supply checked material capabilities, call
`createState`, and keep that single state as the simulation's physical material record.
The Node-only example is `node scripts/ore-depot.mjs` from the repository root.
No Goblin scenario, renderer, DOM, model provider, scheduler or second inventory is loaded.

The supported entry owns finite lot admission, source availability, container occupancy,
reservation, split pickup, delivery, interruption, container release and embedding.
Endpoint providers supply current container definitions and access facts; this owner does
not decide routes or whether a removed endpoint is still present. Teardown calls
`releaseContainer` before retiring its endpoint. Source creation is a trusted authored
introduction operation, not an action exposed to arbitrary player/controller callers.

A reserved transfer stores its original source request plus the material resolved during
admission. Pickup may split a new physical lot, retaining that resolved obligation when
the original remainder is gone. A single phase predicate gates pickup, delivery,
interruption and restored custody. Failed preflights do not mutate stock or claims.
A reserved cancellation releases a claim; carrying cancellation requires a legal drop
and keeps the same physical lot. Delivery retires one transfer and cannot settle it twice.
These are physical transfer retry laws, not stored exact command-response replay.

`queries` provides derived supply/claim/capacity facts. `uses`, `recipes` and `recovery`
retain the existing material effects behind named operations, so Goblin does not reach
into private query/reservation/allocator helpers. Recipe IDs and role definitions remain
consumer inputs. Game recipe timing, needs effects, navigation and job policy remain
outside the material owner. The old Goblin `consumedWood` aggregate is explicitly a
legacy game accounting field; its adapter preflights that counter, calls the physical
recovery/removal operation, then credits only a successful result. It never edits lots.

`schema.ts` checks the physical snapshot wire. Snapshot callers provide their live
endpoint catalogue; game persistence separately checks actors, jobs, sources, recipes,
terrain and original production budgets. Game schema 16 persists resolved material.
Strict predecessor shape and relational validation run before a migration derives the
new field from surviving physical facts. Legacy validation does not authenticate
historical material that an old format never retained.

Private modules are split by responsibility: `owner.ts` mutates transfers/containers,
`queries.ts` owns derived availability and capacity, `held-use.ts` owns bound cargo and
sinks, `settlement.ts` owns resolved recipe accounting, `recovery.ts` owns removal and
embedding recovery, and `definitions.ts` derives portable interiors once. Their internal
helpers are not supported import paths for game features or independent consumers.

## Held-vessel boundary transfers

`uses.importVesselContents(state, {operation, material, quantity})` admits an exact
positive integer quantity into the operation's real held vessel and returns the new
`{lot, quantity}` portion. Its checked material definition and actual interior supply
the admission/capacity rules. The existing `introduceFiniteSourceLot` owner performs
lot validation, capacity admission, ID allocation and commitment together. Authored
source configuration may still provide its own `preferredId`; omitting it uses the
ordinary allocator. A vessel boundary caller never chooses the new ID: no caller-supplied
ID or temporary source container is needed. Failed admission leaves lots and allocator
unchanged. Repeated imports preserve separate physical lot identities.

`uses.exportVesselContents(state, {operation, material, quantity, portions})` checks
the same held custody and every exact portion before removing any stock. A partial
debit keeps the original remainder ID; an exhausted lot is removed. The returned frozen
`ExportedVesselContents` fact names the operation, vessel, interior, material, quantity
and exact debited portions. It owns its returned data rather than aliasing mutable lots
or caller input. This outward transfer appends no consumption sink or saved ledger.

These are trusted material-side operations, not permission to create resources through
player commands. They establish no outside source, receiver, physical-unit conversion,
reach or durable exactly-once effect. The composing consumer must resolve those facts,
perform both sides on a detached candidate, check its joined conservation law and
commit the candidate with its ordinary durable command receipt. Retrying import alone
may create another portion; a transfer fact is not an independent replay database.
An actual end-use consumer continues to use `sinkHeldPortion`, whose irreversible
consumption receipt has a different meaning from transfer to an outside receiver.

Focused material-side laws are in `vessel-boundary.test.js`; they do not prove the
outside counterpart, Region commitment, physical solver or a browser interaction.
