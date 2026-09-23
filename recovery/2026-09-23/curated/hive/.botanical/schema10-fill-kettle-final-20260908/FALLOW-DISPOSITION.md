# Schema 10 fill-kettle Fallow disposition

2026-09-08. The first scan (`fallow.json`, SHA-256
`3c1609ed1a81ad382c2943b1d6652b2824c4cb55768f4b264dcf7e4bd72a70e0`;
run-u2581, exit 1) found 27 dead/dependency/cycle issues, 107 complexity
findings and 93 clone groups against dirty HEAD `9f78aa3`. It correctly exposed
new responsibility hotspots in `brewWater` (cyclomatic 37/cognitive 41) and
`validateOperations` (38/30). The same core owner split phase transitions into
acquire/draw/pour helpers and split endpoint, executor/binding and phase-water
validation without changing authority or save laws. Same-module-only
`sourcePailLot` and `consumeGroundPortion` exports became private.

The post-recut scan (`fallow-after-recut.json`, SHA-256
`8214feec4d92228b67f0e3ff7e78986f6a26d9be8034ce7de84173803a04a306`;
run-u2590, exit 1) reports 25 dead/dependency/cycle issues, 110 function-level
complexity findings and 93 clone groups. The higher function count reflects the
new named helpers; the former hotspots fell to `brewWater` 20/11, phase helpers
at or below 11/11, and operation validation helpers at or below 14/10. The
remaining `assignWork` 26/56 and activity/routine cycle are known broader seams,
not expanded for this release after their existing joint-frontier and actual-WASM
laws remained green.

The 14 introduced dead-code findings are three intentionally reusable exports in
the accepted spring-basin art provider plus eleven retained standalone proof
scripts. They are valid art/study or proof entrypoints and were not deleted or
suppressed to make the audit green. Most introduced clone groups likewise come
from preserved browser-proof harnesses. Production clone advisories remain in
the existing presentation/material/source callers; this release does not claim
zero duplication. Independent read-only source/caller review found no reachable
P0/P1 lifecycle, migration or presentation blocker.

Joined post-recut evidence is run-u2589 (95/95 focused laws, typecheck and diff
check, exit 0). Fallow is a static estimated audit over the dirty worktree, not a
coverage or runtime-performance result.

The first local browser run then exposed a real missing finite-container source
join that static analysis did not: cache repair succeeded, but construction could
only withdraw from ground/shelves. The same writer added one checked open-source
container resolver used by planning and reserved-origin activity, plus an
actual-WASM repair-to-station law. Joined run-u2607 passed 96/96, typecheck and
diff check. The final scan (`fallow-release.json`, SHA-256
`1d15df068e24771bd68ce45ad2d987ddef1985d9b95566e1f2365a73bdf0f2f6`;
run-u2615, exit 1) reports 26 dead/dependency/cycle issues, 110 complexity
findings and 100 clone groups against base `399873b`. The new proof script
accounts for one dead-file report and most additional proof-harness clone noise.
The provider join raises `constructionTransferOption` to 21/29; `assignWork`
remains 26/56. Both remain disclosed next-boundary advisories rather than grounds
for another release-delaying abstraction pass. The kernel still receives a
resolved generic transfer and has no finite-cache branch.

Final local interaction run-u2612 completed cache repair, a normal 2×2 station
using four ground plus two finite-cache wood, exact two-water pail carry and
kettle settlement with no page/console/request errors. Earlier failed runs u2595
(missing provider join) and u2610 (incorrect proof-only cache remainder) remain
retained and are not reclassified as passing evidence.

Hosted parity run-u2619 is HTTP byte-parity evidence only. Its copied
`wrapper.scope` label, `fresh-v8 mixed storage`, is stale helper metadata and does
not describe a hosted browser interaction. The actual interaction claims belong
to local run-u2612; no rerun or evidence rewrite was performed for this label
correction.
