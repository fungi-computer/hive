# Preserve the world while reducing coordinate-hash allocation

Root source candidate, 2026-09-08; no performance result yet.

Both the retained height sampler and connected-cave sampler construct decimal
coordinate strings at every lattice corner. The new helper appends those same
UTF-16 characters to the same FNV-1a state without a temporary coordinate string
for integer coordinates in [-999999999,999999999]. Every other number uses
the existing JavaScript String representation, including exponent notation.
Negative zero retains the original `0` representation. Seed hashing, salts,
interpolation, octaves, amplitudes, rounding, cave membership, terrain edits and
save structure remain unchanged. No new noise distribution or world identity.

The two real consumers are terrain's hashLattice and the voxel world's
caveLattice. They share this helper. The connected feature source only changes
its terrain import so every internal height consumer exercises the candidate.
Its infrequent feature-ID/jitter hash is unchanged. Frozen predecessor sources
stay intact. The candidate directory is an isolated implementation comparison,
not a second production world or a tracked source fork.

Qualification must compare the independent old string construction, including
prefixes/separators/negative coordinates/digit boundaries/fallbacks; full terrain
facts and LOD outputs across fixed seeds; all bytes of fixed actual cave/surface
bricks; edited and regenerated material, both directions of save compatibility,
and fresh-file reload. A Node result establishes only that checked runtime.
Different browser engines and other-language ports are not inferred from it.

Performance packet: one warmup per implementation, then eight interleaved
old/new rounds on each of (a) 4096 exact terrain queries and (b) eight cold
connected-cave bricks. Equal workloads, fixed literal coordinates, fresh owners,
same seeds and resident limits. Result equality/digests occur outside timed
windows. Report every sample, medians, counted generation work, runtime/CPU
metadata and whole-process memory scope. This includes ordinary returned-object
allocation; it is not a microbenchmark solely of the hash or a world population
benchmark. Array residency is unchanged. Do not infer measured garbage bytes
from source allocation removal. Do not run a sweep to find a favorable result.

One packet uses the ordinary proof wrapper and 30-second inner ceiling. Failure
preserves completed results and exact source pins. No existing physical solver,
tracked game/world source, build, dependency or release is touched. A slowdown
is a valid comparison outcome and does not justify changing the world recipe.
