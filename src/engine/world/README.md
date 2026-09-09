# Opaque voxel storage

`createVoxelStore` from `index.js` is a headless owner of finite signed cells,
generated base reads, sparse edits, disposable resident bricks and checkpoints.
It imports no game recipe, Three, Pixi, React, DOM, model provider or clock.
The caller supplies a JSON world identity, a versioned generator ID and a
deterministic `column(x, z)` function returning a `sampleY(y)` function. Sampling
a column can share expensive height/feature work across its brick's Y cells.
That is an evaluation optimization, not a restriction to one surface per column:
the sampler can return any sequence of solids and voids at different heights.

Material IDs are opaque integers, `0..65535`. There is no special air ID and no
diggable, liquid, soil, ore or support table in the store. One-byte projections
are used when every ID fits, otherwise two-byte projections; both return the
actual material IDs. The game supplies material meaning, excavation permission
and physical properties to the relevant systems. The store's edit operation is
a trusted primitive, not a player/AI permission boundary or a worker executor.

The original `world-presets/height-caves.mjs` composes this owner with the
unchanged height/sea/cave recipe. World Lab uses that same height recipe through
`world-presets/height.js`. `scripts/opaque-quarry.mjs` configures different IDs,
vertical distribution, bounds and brick size through the public engine entry.
It proves reuse without importing the default preset. Main Clearing still uses
its shipped shallow terrain implementation; this source checkpoint does not
claim the later deep excavation, traversal or environmental gameplay join.

## Ownership and limits

- Bounds are half-open safe integer coordinates, aligned to whole bricks.
  Brick side is configurable from 1 to 32. No metric or Ground/Upper union is
  built into the owner; the default world recipe keeps 1 m / 0.54 m units.
- Resident projections have a caller-selected count (default 8), constrained by
  a private 64 MiB allocation ceiling. Edits have a caller-selected aggregate
  count (default 65,536, never beyond world cell count), with a private ceiling
  of 1,048,576. One edit batch contains at most one brick's cell count.
  These are declared admission limits, not measured browser capacity claims.
- A batch validates expected world revision, each expected material, all
  coordinates/IDs and the final aggregate edit count before any physical change.
  Restoring a cell to generated base removes its override. Failed batches and
  sampler exceptions leave the overlay and revision unchanged; diagnostic
  counters and disposable recipe caches may change during preflight.
- Saving includes world identity, generator ID and normalized layout/palette.
  Loading validates these, bounded counts and every retained relation before
  admitting edits. Only the current engine envelope is read; unsupported old
  formats reject without migration. Six frozen material brick hashes preserve
  geography evidence. Current edits/save/reopen are tested through the same
  owner; predecessor data remains reference evidence, not a live reader.
- `readPoint` never allocates a brick. `readBrick`, `save`, `describe` and
  `inspect` return detached values. `inspect` reports actual generated versus
  edited material and revision. It is a developer/internal read: the future
  player/controller observation owner must apply knowledge and grants.
- Default `stats()` reads counts without serializing the overlay. Explicit
  `stats({measureSerializedBytes: true})` measures snapshot bytes and has work
  proportional to the edited-cell count. No observer subscriptions or runtime
  timers are installed by this module.

The registered generator is trusted deterministic code. Its ID and world
identity must change when its meaning changes; callbacks are never saved or
accepted as client executable strings. A generator must not mutate this or
another simulation owner while answering a query. This store does not prove an
untrusted plugin safe, consume spoil, displace water, move actors, advance time,
reserve future quarry work or commit controller receipts.

Run the focused laws through the repository's prescribed proof wrapper around
`node --test src/engine/world/*.test.js`, and the independent consumer around
`node scripts/opaque-quarry.mjs`. The ordinary World Lab proof retains its own
map/LOD and surface-only claims. Do not infer deep playable excavation or a
large-population performance result from these headless checks.
