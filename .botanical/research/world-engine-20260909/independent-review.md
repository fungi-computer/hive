# Independent world extraction source review — 2026-09-09

Reviewer: native Asset Product PM, bounded read-only assignment from Root.
Verdict: no extraction correctness blocker found. Root retains physical-world,
deep-geometry and final integration authority. I changed no world source and
ran no world tests, proofs, browser or simulation. The four current laws u3775
are Root-reported evidence; I read their source, not rerun them.

## Recipe and predecessor correspondence

Read all src/engine/world files, src/world-lab/terrain.js and immediate lab
main/worker/section and proof imports. Compared preserved baseline terrain.js
and lattice-hash.mjs, retained point-query-v1/voxel-world.mjs and its
HANDOFF/DECISION/proof, and coordinate-hash-v1 feature/hash source and contract.

Read-only syntax comparison (TypeScript parser/printer and in-memory formatting,
without importing/executing the world) finds all 23 height.js declarations
unchanged from baseline, allowing only WORLD_LAB_SPEC -> DEFAULT_WORLD_SPEC
renaming. This includes default seed, generatorVersion, physical quantization,
sea datum, coordinate identity/hash, every octave/amplitude/salt, coastline,
ridge/canyon formulas, footprint filtering, wet/dry equality and cardinal
boundary semantics. No baseline named declaration was lost across height+lab.

voxel-world.mjs is identical to retained point-query-v1 after formatting and
import relocation. features.mjs is likewise identical to coordinate-hash-v1;
lattice-hash.mjs matches the complete retained 2D/3D helper. Relative to the lab's
old hash file, the 3D operation is added from that same accepted helper, not a
new hash recipe. Decimal integer/FNV serialization and fallback meaning remain.

The full codec-2 identity remains unchanged: heightSource pin, height identity
and seed, height-sea-connected-caves-v3, units 1/.54 metres, finite bounds,
brick size/cap, noise namespaces/frequencies/weights/threshold/protected layers,
and pit-gallery capsule recipe. Reformatting/extraction does not rewrite the
meaning of an old saved overlay. Historical heightSource is retained provenance,
not asserted as the byte hash of the new reformatted height.js file.

## Ownership and caller boundary

The lab imports/re-exports the existing public height entrypoints through
engine/world/index.js. No missing import/export was found in lab main, worker,
section or scripts/prove-world-lab.mjs. No remaining source caller imports the
removed lab lattice-hash file. The engine runtime modules import only each
other: no live Clearing, UI, clock, world-lab, render or host imports.

Lab terrain.js retains labels, coordinate projections, map pixel encoding,
bounded overview sampling and disposable render residency. Its sole changed
retained function is namedFeatures: the former private coast/ridge/canyon
formulas are replaced with negative corresponding sampleTerrain distances at
z=0. Since those distances are z minus the same shared line, the label positions
preserve the old calculation. Lab does not acquire a solid-material, edit or
simulation mutation path. The public spec still carries unchanged overview and
local display defaults for caller compatibility; that is a remaining metadata
coupling, not a second geography generator. Those settings are not added to
physical identity or saved edits.

## Caches, point reads and saved changes

Sparse changes and byBrick remain private canonical/derived edit structures;
resident material arrays and cave descriptors are private bounded projections.
readPoint checks validated coordinates, resident bytes, sparse change, then the
same baseMaterialAt used by bulk decode and restore validation. It never calls
decodeOrigin. read/readBrick intentionally retain brick-allocation semantics;
readBrick returns a slice, not its resident array. Signed floor/mod addressing
and material index order are unchanged. Point cache hits do not refresh LRU,
matching retained semantics; this is not a new behavior regression.

Each edit validates the complete batch and all expected materials before
physical mutations, updates both sparse structures and any resident byte,
compacts base-equal changes, and advances revision once only for actual changes.
A rejected batch may affect query diagnostics/derived feature residency through
readPoint, but not the saved overlay. save returns cloned identity and cloned,
sorted changes; restore rejects identity/codec mismatch, duplicates, impossible
revisions, invalid coordinates/material and redundant base-equal overrides.
Cache eviction leaves sparse edits intact; evictAll also releases descriptors.
No query counters, cache arrays or descriptor residency become serialized truth.

## Limits of this verdict

The four law sources cover shared quantized surface/sea samples, signed vertical
brick boundaries, edit/eviction/reload, rejected overlays, caller-owned bulk
snapshots and incompatible checkpoints. They do not by themselves compare every
old/new cave byte or prove the whole inherited codec; source correspondence and
retained predecessor evidence support compatibility. I make no new performance,
capacity, water inventory, active-world simulation or playable deep-digging
claim. Sparse overlays still have no total admission cap (explicit in describe),
while batches and decoded residency are bounded; that retained policy was not
silently upgraded by extraction. Existing height/spec input policy is preserved,
not claimed as a newly hardened arbitrary-untrusted-spec API.
