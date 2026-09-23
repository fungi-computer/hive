# Sparse world queries reuse the canonical material owner

Root-owned isolated candidate, 2026-09-09. No tracked world/game source changes.
The measured excavation adapter asks roughly72 individual material questions,
but its old point-read API decodes seven complete16³ bricks on each fresh world
owner. The accepted cost packet identifies that work separately from soil flow.

Add `readPoint` to the existing owner: validate a coordinate, reuse a resident
projection if present, otherwise consult canonical sparse changes and the same
`baseMaterialAt`. It never allocates a brick to answer a single query. Existing
`read`/`readBrick` keep their bulk-cache behavior. Edit prevalidation uses the
point operation; actual mutation still updates the same sparse maps and any
already resident bytes. Geometry, cave recipe, codec, IDs and revision semantics
are unchanged. Point counters are diagnostics, never saved or physical state.

The candidate imports the unchanged hash/terrain/cave-feature modules directly.
The copied world owner is a separately pinned development revision; its accepted
predecessor stays immutable as comparison evidence, not a second world owner in
one runtime. A later adapter consumer must use this same owner rather than
reproducing generated-material logic in its validator.

One bounded check compares the exact excavation query set and fixed signed/cave
probes, then actual edit/undo, brick snapshots, external snapshot mutation,
eviction, checkpoint restore and invalid-input rejection. Report generation
counts as well as elapsed/CPU observations. It is neither a broad new physics
suite nor a claim that every point workload beats a predecoded brick. Results
and independent review remain required before adapter integration.
