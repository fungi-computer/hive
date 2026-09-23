# Independent point-query review

2026-09-09. Read the complete root-owned `worldgen/point-query-v1/voxel-world.mjs`,
its exact diff against `coordinate-hash-v1`, `DECISION.md`, `check.mjs` and the
actual `proof-v1.json`. Candidate world SHA256 is
`b3033ee3369a18600a6ef3dce8b9e83b6165bbaea86d253d59db5268c428e0ea`.

No correctness blocker found. A point read validates coordinates, consults an
already resident byte array, then the existing canonical sparse overlay, then
the same generated `baseMaterialAt` used by bricks and checkpoint validation.
Accepted edit mutation updates both canonical overlay and any resident byte;
external `readBrick` snapshots remain copies. Material zero is not mistaken for
absence because the overlay lookup returns an entry object. Signed brick/local
addressing, bounds and material generation are unchanged.

The new operation does not refresh bulk-cache LRU order. That is a diagnostic
residency policy difference; it cannot alter material, revision or a save. Edit
prevalidation now avoids populating bricks, while its complete transaction,
base-equal override removal and changed-brick receipt remain unchanged. The
unchanged recipe and codec identity are therefore appropriate. New counters
are diagnostics only. This is not a justification for calling uncached point
queries repeatedly when a consumer actually needs every voxel of a brick.

The root's recorded caller covers the real 72-question cold validation set,
13 signed/boundary probes, exact bulk snapshot equality, external snapshot
mutation, resident and evicted edits, fresh checkpoint and bad coordinates.
Its old-first/new-second timing is one observation, not controlled capacity.
The complete exact adapter-consumer comparison remains this directory's next
proof. Root retains all world-source custody; no world source was edited here.
