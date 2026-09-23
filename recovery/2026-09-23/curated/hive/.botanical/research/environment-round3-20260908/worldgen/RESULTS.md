# World generation: generated base and voxel-change checkpoint

2026-09-08. Game CTO personally authored and reviewed this isolated source.
The existing lab already has deterministic landforms, signed chunk identities,
integer surface display levels and a footprint-filtered overview. Its returned
chunk buffers are a render cache, with no durable terrain-edit owner. The
executable baseline probe demonstrates an altered cached surface reverting after
eviction; this is an explicit missing feature, not an unintended production
mutation introduced by this study.

## What is now executable

`voxel-world.mjs` composes the pinned actual terrain generator with sparse
three-dimensional cell overrides. It owns edit preconditions, one world revision,
private decoded-brick residency, a rebuilt per-brick change index, and a checked
checkpoint codec. It never imports the Clearing, actor, job or field clock.

The generated base is deliberately a simple two-soil-layer extrusion of the
existing surface over stone. That base is sufficient to prove excavation under
an intact roof of terrain; it is not a cave, strata, biome or watershed generator.
Future cave geometry must replace the explicit versioned base recipe rather than
appearing as a decorative surface-height trick.

World identity includes a separate save/space ID, seed, generator source hash,
voxel recipe, surface quantization policy, finite bounds and unit conversion.
The proposed study lattice has 1m horizontal cells and 0.54m vertical cells:
four vertical voxels equal the accepted 2.16 art-unit storey if one geometry unit
represents one metre. This is a stated integration proposal, not a migration of
the live game's logical levels or evidence that existing physics fixtures use it.
The prototype domain is [-2048,2048) in x/z and [-64,64) vertically; these are
bounded study settings, not the final world/depth limit.

`edit` preflights a bounded batch before changing canonical overrides. It checks
expected revision and current material. Failed/stale batches do not partially
alter terrain. An all-no-op batch changes neither revision nor overlay. A real
edit returning to the generated base removes its override and advances revision.
Thus a compacted overlay can be empty at a nonzero revision: it is current state,
not an event log or command receipt. Restore rejects redundant base-equal patches.

## Evidence and independent correction

- u2616 / a4543c5b7f8e4763823625c22969bf51, normal exit0: first9 groups,
  276.6ms internal wall time. Exact tested source retained in run-v1.
- u2622 / d86ef3733e1d4f62aba6ef075af0522c, normal exit0:9 groups with initial
  corruption guards,427.7ms. Exact source/results retained in run-v2.
- Independent Astra review accepted signed indexing/atomic mutation and found
  the no-op representation ambiguity. Root chose sparse state normalization.
  The initial latest-patch-revision==world-revision guard was removed because it
  incorrectly treated compacted state as a full event history. Prior evidence
  remains preserved rather than being relabeled under the corrected policy.
- u2634 / d1718e9e81c14d7a833ec5170a167d2c, native87493 normal exit0:
  **10 groups, zero errors**,1,165.1ms internal wall time on the shared host.
  `run-v3/proof.json` records exact hashes and copies both current source files.
  The independent reader rechecked the frozen correction and outcome law and
  found no regression in that bounded scope.

The final proof covers signed chunk/local round trips at negative and domain
edge cells; full decoded-array equality under reversed request order; actual
generator integer surface levels; fixed32x32 map sampling over1024 and4096-cell
extents; cancellation in the actual worker helper before a second row batch;
underground edits spanning the negative/zero chunk seam; atomic conflicting
batch rejection; actual decoded-data eviction; regeneration; file checkpoint
write/rename/reopen; restored changes under intact surface; different-world,
different-base and different-unit rejection; no-op/return-to-base normalization;
and protection against aliases through checkpoint/identity objects.

Two16³ uint8 bricks occupy8,192 measured payload bytes in the tested resident
cache. The traversal generated16 bricks, evicted14, and restored the same two
changed cells; the checkpoint was669 UTF-8 bytes. These figures exclude JS/Map
overhead, generator scratch, retained checkpoints and renderer resources.
The two32² overview calls each sample1,024 footprint-filtered values into4,096
typed-array bytes; they do not enumerate the millions of fine cells beneath.
Timing differences across runs are not optimization results or device budgets.

## Fallow and remaining boundaries

Root ran and read scoped Fallow health reports u2623 and u2635 (both exit1).
The factory originally mixed checkpoint validation with cache lifetime;
extracting the checked codec reduced its cyclomatic/cognitive scores18/18 to8/4.
Decode decreased10/19 to8/10. Edit admission/commit is now14/18 and remains the
next cognitive hotspot. Retained source copies/reference files also appear in
the scan. Estimated uncovered/CRAP findings are not measured test coverage;
the isolated root has no node_modules, so Fallow warned about dependency analysis.
No dependency was installed, no finding suppressed, and no clean-audit claim is
made. Future edits should keep preflight and canonical installation responsibilities
clear rather than adding more branches to the factory.

This is a single-owner, synchronous numeric prototype. Disk durability exists
only after the host writes its checkpoint; in-memory acceptance is not a saved
command. Two separately restored instances are not coordinated writers. Browser
IndexedDB/page reload, failed-write recovery, stale asynchronous worker results,
feature tombstones and revisioned map overlays remain actual next integration
work. The current probe uses a real Node file round trip, not a browser claim.
No support collapse, actor navigation, generated water inventory or gas-volume
change is implied by excavating a material voxel in this prototype.

The next world-generation work is (1) a bounded host checkpoint/edited-map
consumer at the existing lab boundary, and (2) coherent drainage/climate and
volumetric cave recipes over this versioned base/override contract. Numerical
water initialization must occur once with saved field state; regeneration must
not refill a pond. Root owns the common geometry/unit decision with water/gas;
Game Delivery remains sole tracked-source/build/proof/deploy owner.
