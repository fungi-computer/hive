# Physical geometry query review — Meitner

Read-only source review at `3d2609a8f58db5136fbc4ea4dff923d11b46c016`, physical-geometry-query. Six packet hashes match committed blobs; immediate air operator and prior structure laws also recorded in `physical-geometry-query-source.json`. The lane was clean at the first read. It is now being corrected by its existing writer; no reviewer source edit or test/type/Fallow/numerical/browser/native/build execution.

## Query owner

The private column index retains individual min/max intervals, so separate solids do not fill a gap between them. Axis-face indexing uses the two ordered tangent coordinates and includes normal faces at both half-open region boundaries. Solid volumes and face planes clip to the query domain only after all supplied primitives pass registered-terrain bounds admission. Every regional cell is queried against the terrain capability plus those intervals; no material name or old heightfield fallback is used. This depends on the registered terrain capability being immutable, as its real Goblin provider is; primitive inputs and exposed results are copied/frozen.

Sparse query envelope and1024-cell raster bounds are separate. Compilation does not call terrain.solidAt. Primitive count/index entries and bounded vertical/boundary scans limit work independently; these are count bounds, not an elapsed-time/capacity claim. Repeated overlapping primitive intervals can still increase comparison cost inside one point query. No performance result is inferred.

Exterior classification checks the actual separating face and both cell statuses. A solid neighbor is closed. An empty neighbor under an obstruction returns needs-neighbor, not closed. The upward proof checks voxel solids and zero-volume y faces through its explicit ambient plane, including a roof on the registered upper face. An unresolved/out-of-envelope neighbor never becomes outdoor except the deliberately declared upper ambient face itself. The engine accepts the caller's ambient plane as authority; the actual generated-room caller supplies the registered terrain maxY64 and a query collar reaching it, not room-raster maxY24. Thus an unmodeled roof above the504-cell raster can be observed and rejected rather than ignored. No open boundary above the declared ambient plane is asserted.

The structure translator uses actual BUILDINGS metadata and footprint once, then raster/exterior share the same index. The old terrainSolids/addStructure raster path is deleted. Completed wall/floor/roof semantics and explicit permeable stair/door semantics remain the current content contract. No additional solid/face omission or false-closure blocker found in the reviewed owner.

## Actual numerical caller blocker found

The first pin changes generated-room openSides from five sides excluding y- to all six, then masks the actual solid floor through closedFaces. This correctly prevents normal flow in air/geometry.mjs flowAllowed, but the same file's stencilsOf.outsideOpen uses only openSides. At a tangential velocity face on the floor, the exterior ghost becomes center=+1 rather than-1. air/momentum.mjs neighbor/predict uses that ghost directly, so it changes -u to+u; its viscous contribution differs by2νu/h², and momentumRate sees the same coefficient. Raster/normal-face parity therefore does not establish operator parity. This is a tangential momentum boundary mismatch, not a claim that normal smoke flux crosses the masked floor.

Root accepted the finding and routed a producer correction: preserve classified side information together with per-face masks so a wholly closed side, especially the supported room floor, remains absent from openSides. Existing writer owns the correction. Final source acceptance awaits that pinned delta and its actual law assertion.

Mixed open/closed patches on a single outer side retain a separate existing numerical limitation: side-wide outsideOpen cannot give local no-slip ghosts to masked portions while keeping other portions outdoor. Root owns any eventual per-face numerical correction/qualification. Current room has a fully supported closed floor; do not widen its claim to arbitrary partially masked outer walls from this producer fix. No solver edit or new scope is requested by this review.

## Authored-law scope

Three new engine laws specify large sparse compilation, owned primitive/result immutability and raster rejection; solid/face/outdoor versus roofed continuation; and zero-volume roof plus bounded unresolved clearance. Two room laws specify exact504-cell solid/interior-face geometry, actual physical floor masks and a roof outside the raster rejected through the actual boundary helper. Their5 count is correct; all are authored, unexecuted. The old eight structure laws are unchanged source specifications, not newly executed evidence. None proves numerical boundary equivalence, arbitrary main geometry membership, browser rendering, native recovery, field/body interaction or throughput.

## Final source acceptance — c951b0a

**Accepted for the bounded shared physical-query/current generated-room source scope.** Final clean pin `c951b0aa8af5165fa962bd98ddc090ac6c766746`: all six handoff hashes match committed blobs and actual working bytes. Manifest: `physical-geometry-query-final-source.json`. Read all four changed-file deltas from the reviewed predecessor; no repeated law execution.

`roomExteriorBoundary` now returns the classified openSides and closedFaces together after rejecting any needs-neighbor face. Only a side containing a proven outdoor face enters openSides; wholly closed y- is omitted. The caller uses this result directly, and the actual room law explicitly requires the prior five-side set and absence of y-. The engine boundary side type preserves the axis/sign union. Previous masks, real sky proof and exact504-cell raster are retained; no alternate caller or old exported name is left in the changed consumers. This closes the current floor-stencil regression found above.

The mixed open/closed outer-side tangential stencil limitation is now documented in the source README. Normal masked-face flux remains closed; this source packet does not qualify local no-slip behavior across arbitrary mixed boundary patches. Root retains that separate numerical decision. The declared ambient plane remains caller authority; the current room explicitly binds it to the actual registered upper face, with a query envelope reaching that face.

No remaining correctness blocker was found within this source scope. Five new laws and unchanged prior structure laws remain unexecuted in this packet. Source acceptance is not numerical refinement/operator proof, main-game air membership acceptance, browser/host evidence or a capacity benchmark. No tracked source edits or execution occurred in this review.
