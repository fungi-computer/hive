# Independent drainage-v2 source/caller review

2026-09-08. Read-only acceptance review. Only this review directory was written. Root retains `drainage.mjs`, `qualify.mjs` and the height owner.

**Disposition:** the priority-flood result and narrowed height caller are coherent for the recorded bounded world fixtures. Accept the mathematical analysis under its declared perimeter and sampling assumptions. Close the two admitted-input guards and correct the retained-memory figure before describing the module as a generally bounded reusable API. No broad numerical rerun is justified by those corrections.

Reviewed source pins:

- `../drainage.mjs`: `0908179fea4059d870f8810e0c0bffae0a3e46cb5f60f88d67983debce61dd94`
- `../qualify.mjs`: `4d02955bcbdd3756db6f23a727483dd5ad21d8a28760059fd6b666b4773379a1`
- `../../height-sea/terrain.js`: `530464448725cacb73836f34c2c48ddbf3e4a8c0d8a353498e7fe6da03f45bdf`

Read both implementation and actual immediate caller, plus run-v2's six-check report. I did not rerun world sampling. Its frozen exports are checked byte-for-byte against run-v1 by the actual caller, including every query, component and descriptor. The recorded 3.076 s versus earlier roughly 15.1 s is one shared-host observation, not a stable benchmark or a changed quality result.

## Actual issues

1. **Finite admission does not guarantee finite outputs.** A 3×3 bed with boundary `1e308` and center `-1e308` passes every current input guard. Its depth and prism capacity become Infinity; JSON serializes them as `null`. This is an API correctness failure, although impossible under the current generated height envelope of 0–17.28 m. Validate representable bed differences, depth accumulation and final capacity for the stated stride. A finite span alone is insufficient if summing many depths or multiplying by area can overflow. Reject before exposing a partial result.

2. **Root-list validation is not bounded by the cell limit.** `marineRoots.every(...)` accepts arbitrarily many duplicate valid indices. The queue itself is safe because `marine` deduplicates before insertion, but the validation/root loop can exceed the advertised input-work bound by an arbitrary factor. Bound entries by cell count before traversal, or define another explicit bounded admission rule. Rejecting duplicate-heavy oversize input is sufficient; no new collection abstraction is needed.

3. **The returned owner directly retains its work arrays.** `describe` reads `heap.byteLength + queue.byteLength`, closing over both arrays. The source therefore keeps them reachable with the returned object. `retainedArrayBytes` currently counts 38 bytes/cell and excludes these 8 bytes/cell. The two figures together are correct, and the proof discloses possible retention, but an unqualified retained-memory figure should be **46 bytes/cell**: 753,664 bytes for 128², or 3,014,656 bytes at 65,536 cells. JavaScript component objects, closures, input-validation copies and caller evidence are additional. Alternatively precompute their byte count and release the arrays from the returned closure; do not claim that release without changing the actual source.

One guarded tiny probe, `probe.mjs`, confirmed findings 1 and 2 at the source hash above. Command used the required `run-proof.sh`; **run-u2869.scope**, invocation **5df30931e15d417db903e76262ccd3e6**, exit 0. `probe.json` records admitted overflow and a 10-entry root list on 9 cells. The probe is diagnostic, so exit 0 means it completed and recorded the defect, not that the implementation passed a finite-output requirement.

Root acknowledged these findings and plans to preserve v2 evidence before a narrow correction. No corrected-source acceptance is claimed here.

## What reads correctly

The minimax escape elevation is the least possible maximum bed height along a D4 path to any perimeter cell. The heap is ordered by that elevation and then stable index. Discovering a cell when its parent is popped is valid here: any future popped parent has no smaller spill, and applying `max(childBed, parentSpill)` cannot improve the already discovered value. Each index is inserted once, so the heap and shared queue stay within cell count. Boundary roots are initialized exactly once even at corners.

The independent oracle is substantively different: synchronous relaxation of the minimax recurrence, without heap ordering or ancestry. Twenty varied small fixtures compare every escape elevation. At most the number of vertices is a sufficient relaxation bound because a minimax path need not repeat vertices; the error message's phrase “graph diameter” is less precise than that argument. These tests do not prove every input, but the source argument supports the algorithm they exercise.

Parent rank strictly decreases on traversal, including equal-height flats. Reverse rank accumulation therefore terminates and assigns each sample's unit contribution to exactly one perimeter root. A maximum contribution of 65,536 is safe in Uint32. Integer indices fit the selected signed/unsigned 32-bit arrays. Parent coordinates differ by one declared sample stride, not by a diagonal.

Marine connectivity is a separate D4 flood from explicitly admitted perimeter roots with `bed < seaMetres`. Exact-datum cells remain dry barriers. This matches the height owner's strict comparison and excludes diagonal point contact. `outletKind` describes the selected ancestry root; `oceanConnected` describes reachability to any admitted marine root. General callers must not treat these as interchangeable, especially when only some below-sea perimeter cells are designated marine.

The caller now obtains each bed from `sampleTerrain(spec,x,z,1)`. `sampleCell` calls that exact owner and adds four-neighbor display facts; it does not alter the bed. Coordinates are integers, height is still quantized in 0.54 m increments, and the sea datum is 12 increments = 6.48 m. The caller's periodic sampleCell cross-check and full exported-byte comparison preserve the existing outcome while avoiding most redundant sampling. The comparison calls add a small amount of extra sampling, so “once per bed” describes the primary production query, not the literal full proof call count.

Input bed/origin/size are copied. Scalar query objects and nested parent coordinates are frozen; component/descriptor outputs are copies. External mutations cannot rewrite the analysis. No dispose API is necessary for this pure JavaScript owner: collection requires callers to release it. There is no global cap on how many independent owners or exported query objects a caller retains. Current qualification deliberately retains large evidence arrays; array-byte counters do not measure that whole process.

## Scientific and caller limits to preserve

- All perimeter cells are discharge boundaries. This is a declared finite-domain analysis, not a rule for generated chunk borders. A local-window spill can underestimate the escape elevation of the larger surrounding landscape. Crossing/expanding a window needs upstream boundary information or recomputation; a cache edge must not become a river outlet.
- The stride-32 grid samples exact beds at sparse points. It does not resolve terrain in between, and its perimeter consists of sample locations rather than every true world-edge cell. It cannot certify an actual ocean connection, river corridor or saddle through those gaps. Keep coarse connectivity visibly approximate.
- Geometric escape elevation is not water surface elevation or pressure head. In particular a marine root starts at its bed, not at sea level. This is correct for the stated topographic minimax result, but the result must not initialize ocean depth or become a hydraulic boundary condition by itself.
- Ocean flags are relative to caller-designated roots. The local fixture explicitly assumes below-sea perimeter contact with the sea. An arbitrary inland window cannot infer that assumption merely because its perimeter lies below the datum. The existing report says this; retain that wording in the lab.
- Components comprise connected cells with positive depth below one equal spill elevation. Saddles exactly at the level are excluded. This is a geometric sublevel grouping, not a nested depression/fill-and-spill hierarchy, lake-merging simulation or unique watershed decomposition. The reported volume is potential prism capacity and creates no liquid.
- `depth * stride²` assumes the declared one-metre horizontal unit and piecewise constant rectangular sample footprints. It is exact for the synthetic one-cell basin under that representation, approximate for coarse terrain. A future differing horizontal metric must enter the formula explicitly.
- Contributions are counts under unit weight per sampled location. They are neither rainfall volume nor measured discharge. The deterministic index tie-break on flat terrain chooses one ancestry among many; visible channel generation should not mistake that arbitrary choice for a physically preferred direction.
- The source identity is adequate for this immutable generated base. An analysis over future edited beds needs the relevant edit/boundary revision in its identity or caller ownership. Reusing this object after canonical terrain changes would serve stale data; the current module does not watch terrain or mutate itself.
- Caves, groundwater, rain, erosion, river carving, finite water, gas and active-world simulation are outside this analysis. Those omissions are already explicit and do not invalidate the bounded result.

After the narrow guards/reporting correction, the next useful evidence is visual inspection of the two existing exact/coarse outputs in the lab, with these labels intact. No additional generic framework or broad qualification suite is indicated by this review.

## Corrected-source acceptance — run-v3

I read the final corrected `drainage.mjs` at SHA256 **`55f4d221491c927f05ca42240ffd20718b815db24fac6856aa90facd0c860d00`**, its immediate `qualify.mjs` caller at **`9c59f5173f7b6c3f0343cda15b0ea0f14873c1a6af9ea8aaf38a962fdd220585`**, and the recorded run-v3 result. **The three issues above are closed for this analysis contract.** No new source defect or reason to rerun a proof was found.

- `marineRoots.length <= count` is checked before traversing the entries.
- The finite bed-span and conservative `span * count * stride²` admission bounds precede graph analysis. They reject both overflow of one depth and overflow of total possible prism capacity. This deliberately rejects some extreme inputs whose actual small depression capacity might be representable; that conservative envelope is an acceptable bounded API decision and has no effect on the stated generated heights/strides.
- `typedArrayAllocationBytes` now includes all 46N bytes, with its 8N scratch portion explicitly included and no garbage-collection discount. It is correctly described as allocation accounting rather than a complete live-heap or process-memory measurement. The refactor no longer returns a closure over the heap itself; the accounting remains conservatively inclusive.

The extraction into `marineConnectivity`, `spillForest` and `fillComponents` follows three different responsibilities. The shared queue is reused only after each consumer has finished. The minimax ordering, boundary initialization, parent/rank rule and reverse accumulation remain unchanged. Query construction still hides mutable arrays and returns copied/frozen facts.

Recorded **run-u2891.scope**, invocation prefix **25393fb**, completed seven checks with `errors: []` in **1.198 s**. Its new admission check covers excessive roots, overflowing differences, overflowing aggregate capacity and the 46N allocation count. The actual caller compares **all sample records and all component records** to the retained original exports, and both grids match. Full JSON bytes appropriately differ because the memory descriptor changed. No claim of a new algorithmic performance improvement follows from this single shorter host run.

I also read `fallow-final.json` rather than relying on the summary. It recognizes two actual proof entrypoints, reports **zero dead-code issues and zero clone groups**, and sees the public `drainage` export through both callers. Its `drainage` finding is cognitive **9**, cyclomatic **15**, **52 lines**. CRAP advisories remain for this and several helpers because `coverage_source` is **estimated** and `coverage_tier` is **none**; the scanner did not ingest the numerical proof coverage. This is a disclosed advisory, not evidence that the seven laws never executed. No valid entrypoint or algorithm was removed to obtain the result; the unused `METHOD` export became an internal constant while the method remains reported.

Evidence hashes: run-v3 `proof.json` **`06cc4010efdc9470c46675f865aaa357b16edb18826eab4016300cf2a9adc3b8`**; final Fallow inspection **`00a3414c3c87d18bd3b4d9c6b9459e00eaf38ecf577822801b54546c374fd8af`**. The frozen height source is unchanged.

**Accepted outcome:** a bounded, height-authoritative D4 escape/ancestry/connectivity analysis with clear geometric capacity metadata. Every scientific limitation listed above remains: this is not finite water, a fine river-path proof, hydraulic sea head, a depression hierarchy or cave hydrology. Proceed to the actual lab viewer with those distinctions intact.
