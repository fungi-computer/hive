# Local air geometry repair — September 11

This is an implemented second performance repair, not a deployed release or a
claim that the full performance plan is complete. King Bolete owns the source.

Actual physical proposals query only affected 8×8×1 gas tiles and recompute their
incident openings. Unchanged tile geometry is shared in a rebuildable cache.
Water has an owned coordinate lookup; air reuses its admitted member and incident
opening indexes during conservative remap. The terrain-air record format is 3;
unsupported formats are rejected. No solver constants or clock rates changed.

## Same actual Colony workload

| Measurement | First repair | Local geometry | Plus remap index reuse |
| --- | ---: | ---: | ---: |
| Full digging step p95 | 18.18 ms | 18.96 ms | 16.22 ms |
| Full digging step maximum | 432.74 ms | 175.86 ms | 172.46 ms |
| Save median | 0.43 ms | 0.53 ms | 0.39 ms |

The major measured benefit is local geometry sampling/partitioning. The later
index cleanup did not materially remove the remaining worst hitch; do not market
the small final timing difference as a guaranteed speedup. These samples run on a
shared host and are not DO/browser capacity figures. Actual observers still show
an 85.70 ms maximum in the last run. Two full dig orders completed; exact saved
next-state recovery matched in both measurements. The 160-step wall fixture in
the first measurement remained planned: it proves absence of the earlier panic,
not a completed wall. Separate native construction laws prove blocked/completed
settlement behavior, and still do not replace the public game workload.

The first local-geometry field sample remained 7.39 ms p95 for coupled water/air.
Final index changes were qualified through the whole Colony and its actual hearth,
not another isolated field matrix. Raw measurements are in the adjacent JSON.

## Evidence

- local-v1: compile failed on a duplicated Face.neighbor helper; corrected by
  consolidating the existing owner. Failure retained.
- u6017: 29 atmosphere laws passed.
- local-v3: 31 atmosphere laws passed, including first local/full comparisons.
- u6019: compile failed on a test mutability mistake; no passing run claimed.
- u6021 and local-v6: 31 atmosphere, 3 air query, 3 terrain-water and 8 construction
  laws passed. The second batch includes changed remap indexes and real partial
  water movement. All are terminal.
- u6023: maintained release-WASM build plus the same 40-step field and 160-step
  Colony dig/wall measurements passed, including recovery.
- A separate CPU profile of the same WASM dig workload identified repeated member
  map rebuilding and definition hashing. It is diagnostic, not another capacity
  measurement. Original timing JSON was preserved before that run.
- Final v2 WASM build, 160-step Colony dig, actual two-cell dig/recovery test and
  ordinary hearth fuel debit/smoke/restore test passed. No field disable was used.

Detailed logs, exact source inventories, intermediate generated WASM, final raw
outputs and CPU profile remain in `.botanical/gas-local` and `.botanical/gas-repair`.
Fallow was not available on this shell's PATH or tool catalog; no Fallow pass is
claimed. Existing compiler advisories are retained in the logs.

## Remaining work

Gas definition assembly/validation/hash and conservative remap remain global.
The derived tile map is also shallow-cloned during preparation. This is bounded
terrain sampling, not a finished sparse gas graph. Quiet exchange, actual server
cost/command recovery and two-client playability remain unaccepted. The client
chunk/picking source has a separate visual/input qualification. Nothing here
claims a new hosted game release.

## Client and recovery follow-through

The joined terrain renderer updates affected chunks and keeps one shared physical
face definition for rendering and indexed picking. u6029 compared its full canvas
against the original full render at initial state, after two earned Colony digs,
and after reset: all three had zero differing RGBA pixels. The software-rendered
dig update took 59.1 ms; this is not a player GPU or hosted frame-rate claim.
The first launch failed on an executable filename and is retained. The passing
fixture emitted an unrelated retained-page dependency-scan warning; no clean
production build is claimed. Browser/server cleanup completed and port 5198 was
free. The screenshot shows only the top of the large canvas; numerical pixel
parity is not a claim of personally inspecting the dug hole in that screenshot.

u6032 passed 21 client/art tests and five SQLite recovery tests. Its first SQLite
test failed because it combined current Colony actors with an unrelated terrain
fixture. The corrected test uses the actual Colony definition. u6033 reran that
failed test only, then strict engine TypeScript and diff checks; all passed.
Both scopes are inactive/dead with empty control groups. Current-format failed
commit recovery and cleanup-error handling retain their explicit laws.

The changed-column observer implementation is committed separately as daa114f
and awaits source review and affected qualification. It is not accepted by these
results. No new public deployment or two-client playability is claimed here.
