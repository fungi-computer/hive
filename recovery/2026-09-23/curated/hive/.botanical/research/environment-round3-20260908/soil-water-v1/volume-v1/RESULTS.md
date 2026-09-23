# Connected porous-volume result

The first fixed packet passed: **six groups, 3,484 checks**, on the source frozen in `run-v1/sources`. This extends the accepted rigid-pore soil laws to one connected x/y/z face graph in the actual `[1,.54,1]` metre voxel metric. The shared retention owner is still the unchanged `column-v1/source-v2/soil.mjs`; no independent column is instantiated for each horizontal coordinate. The column is a comparison consumer in the qualifier.

Execution and hashes are in [RUN.md](RUN.md); exact fixtures, limits and accepted equations are in the frozen [CONTRACT.md](run-v1/sources/CONTRACT.md). Full successful face ledgers, every accepted head/mass, residual maxima, work counters and normalization diagnostics are retained in30 graph result files. The frozen-column comparison results are separate files.

## Actual physical outcomes

| Discriminator | Observed result |
| --- | --- |
| Full 3D Jacobian | Central finite differences passed for all169 entries at a13-unknown,24-face nonuniform negative-head state. The independent two-by-two linear fixture exercised a real row swap, exact counted single trailing update and zero original-Jacobian residual. |
| Same-metric column reference | Hydrostatic masses matched exactly. Top exhaustion/lower wetting differed by at most2.1308821374e-10 kg; lower finite supply differed by1.7053025658e-13 kg from the unchanged column owner. These are same-discretization comparisons, not an independent continuum reference. |
| Finite top and lower boundaries | In the four-cell2.16 m line, the1 kg top pond became dry at the first accepted endpoint11 s; the initially dry lower reservoir was wet at1 s and held5.784500324188741 kg at60 s. Its extra water came from desaturating the finite soil, with the paired ledger and total balance checked. In the opposite initially unsaturated case, the lower1 kg supply became dry at87 s and stayed dry at300 s. These are actual endpoint observations, not exact continuous transition times. |
| True 3D hydrostatic water table | The signed2×3×2 region has12 soil cells, one finite lower reservoir,24 active faces and12 chords. H=-.6 m held stock at rest through3600 s; all three directional faces participated. |
| True 3D ponded rest | The same soil plus finite upper/lower reservoirs has14 unknowns,28 faces and15 chords. H=.1 m held saturated stock at rest through3600 s. Both rest requests used zero Newton iterations; this is not a dynamic14-unknown performance result. |
| Layered series/parallel flow | Three-cell paths on x, y and z, with Ks1e-6 middle layer and Ks1e-4 ends, matched independently derived finite-reservoir BE resistance laws and refined toward their continuous exponential. Two parallel paths doubled conductance while each shared reservoir retained one finite stock. Moving cyclic cases preserved nonzero Darcy chord transfers exactly. All reservoir ports stayed wet in these cases. |
| Lateral dry-sink wetting | A horizontal three-cell saturated path transferred0.053940752088247335 kg from a50 kg finite source into an initially dry single-port sink over60 s. Source ended49.94605924791177 kg; no terrain flag or infinite head supplied water. |
| Persistence and rejection | Actual file save at60 s followed by a fresh owner and aligned continuation to120 s matched the unsplit canonical encoding exactly. Input/definition/port insertion permutations preserved all outputs and work. Twelve rejection cases passed; an evaluation budget deliberately failed after one local10 s step, preserving the input and marking the retained partial evidence uncommitted. |

Independent saturated conductance is `G=paths/[width/area*(2/Khigh+1/Kmiddle)]`. For one layered path, x/z G=5.294117647058824e-7 m²/s; y G=1.8155410312273058e-6 m²/s, with the expected1/.54² ratio. At600 s, continuous head-difference errors for x/z dt60/30/15 were8.0665e-9,4.0333e-9,2.0167e-9 m. The uniform-K x path produced9.1188e-6,4.5626e-6,2.2821e-6 m. These give the expected first-order backward-Euler refinement at fixed spatial resolution. Synthetic Ks values are test definitions, not measured soil calibration.

## Measured balances and work

Across the30 stored successful graph requests, every physical step was accepted without halving/retry. The numerical retry path therefore remains source-reviewed but was not exercised by this packet. Hard input/work failures were exercised separately and did not enter the retry path.

| Maximum actually observed | Value |
| --- | --- |
| Mixed residual, Darcy transfer residual and tree-edge correction | 1.0223046020829685e-10 kg |
| Eliminated mobile-stock correction | 1.0221423707434951e-10 kg |
| Constitutive mass residual | 5.684341886080802e-14 kg |
| Per-step and aggregate paired-ledger residual | 9.379164112033322e-13 kg |
| Root compatibility residual | 9.094947017729282e-13 kg |
| Computed per-step/aggregate total residual | 0 kg in these sums |
| Darcy chord change; boundary complementarity product | 0 kg;0 m² |
| Accepted steps in a request | 300 |
| Dense trailing matrix updates in a request | 33,110 |
| Allocated LU matrix in an actual solve | 512 bytes, eight unknowns |

Zero computed total residual is a floating-point observation, not an exact-arithmetic conservation theorem. Accepted stocks satisfy strict pore capacity and boundary bounds; tree closure uses the existing Darcy flows and changes no chord. Every positive boundary head is derived from canonical mass; saved data contains no pressure or iteration state.

The heaviest recorded nonlinear request was the300 s lower-supply line:1,202 residual calls,6,010 face evaluations,602 Newton iterations/line trials and33,110 completed trailing matrix updates. The top-wetting line used296 residual calls,169 Newton iterations and176 line trials. These are actual counter observations, not estimates for a large field. The72-unknown41,472-byte matrix bound and30-million-update limit were not reached; the matrix-budget rejection did prove refusal after exactly one allowed update.

The whole qualifier measured606.442856 ms between source pinning and final proof assembly, with whole-process CPU delta246,377 µs and final RSS78,516,224 bytes. Module loading, source pinning and final proof write are outside that elapsed window; filesystem receipts, comparison-column execution and the qualifier are inside. RSS is process-wide; matrix byte counts are separately reported. This is one shared-host observation, not a controlled benchmark or evidence for world-scale capacity.

## Limits and next source decision

The current reference is isothermal, constant-density and rigid-pore, with finite negative-head envelope and vented soil-air assumption. It has no compressible saturated storage, saturation clamp, implicit terrain water, full free-water surface, heat or gas coupling. Multi-port dry reservoirs and disconnected/unanchored saturated regions reject. Singular LU is a fatal unsupported numerical condition, not a demonstrated halving recovery.

Transient nonlinear unsaturated behavior is exercised on the four-cell line. All-axis transient flow is saturated and has an independent network resistance reference. The true3D wet/unsaturated region is tested at hydrostatic rest plus its full nonuniform Jacobian; **this packet does not prove arbitrary nonlinear3D fronts, heterogeneous three-dimensional mesh convergence, excavation or a scalable world solve**. The unchanged column's finer explicit infiltration reference remains scoped to that earlier column packet.

Fallow has zero dead code/cycles/clones, but31 health advisories remain. `compileFaces` has cognitive46; its unique-face enumeration, exterior/interior admission and endpoint construction should be separated with order-preserving equivalence before this owner is widened. The fixture path constructor is cognitive16. Remaining CRAP scores are static estimated/no imported coverage. No source refactor occurred after the physical pin and no suppressions conceal these findings.

Root retains the next cross-system decision. Actual excavation must conserve removed pore water into the shared free-water owner and admit changed gas/solid volume; merely converting soil to an air label would violate this result's finite-stock boundary. Nothing here changes live world generation, water/gas authors or production.
