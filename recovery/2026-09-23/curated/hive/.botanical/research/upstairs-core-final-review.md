# Upstairs core final review

Read-only review of the current dirty core/test checkpoint against the corrected
upstairs contract. Two actionable v6 validation gaps remain:

- **P1 — stair-ramp lower blocking ignores unfinished site blueprints.**
  `src/persistence.ts:906-919` rejects only `other.finishedAt !== null` walls,
  doors, and roofs on the three lower ramp cells. A v6 slot can therefore retain
  an unfinished lower wall/door/roof overlapping L, M, or N even though placement
  rejects that overlap and the ramp blueprint is meant to reserve all three
  cells. Smallest correction: remove the `finishedAt !== null` filter for those
  lower standing/cover conflicts (and add a malformed-v6 blueprint overlap case).

- **P1 — saved actor paths can enter unsupported upper cells.**
  `src/persistence.ts:1007-1027` checks the current upper actor surface, leg
  bounds, and each edge through `topologyNeighbors`, but it never requires a
  level-1 path node to satisfy `upperSurface`. Since `topologyNeighbors` exposes
  ordinary same-level neighbors without consulting `blockedCells`, malformed v6
  paths can traverse a missing-floor upper cell. Preserve the contract’s
  acceptance of ordinary transiently blocked saved paths, but reject level-1
  path nodes lacking `upperSurface` (with a focused malformed-path case).

The rest of this pass found no additional concrete blocker: floor-from-below
delivery uses lower work positions and real hauling; cross-level floor/roof/door
conflicts are symmetric; finished-only stair topology exposes only L↔U and walk
revalidates edges with the 18-tick cost; removal preflight and completion guard
upper occupancy/support; lower shelter treats an upper floor as cover; optimizer
travel uses `pathTicks`; upper piles/bundles and actor legs are checked; and the
three-cell blocked-stair test preserves cargo, job, and wood conservation through
the actual handlers.
