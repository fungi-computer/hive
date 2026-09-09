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
