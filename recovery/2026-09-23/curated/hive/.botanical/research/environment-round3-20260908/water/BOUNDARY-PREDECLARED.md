# Water boundary checkpoint, before execution

The accepted optimization is pinned in `accepted-optimization-v1/`; earlier
numerical results and source hashes remain intact. This checkpoint changes cold
admission and ownership, not flux physics. No timing sweep or production port.

The version `water-round2-v1` means SI metres/seconds/cubic metres; constructor
units must equal the explicit SI record. It accepts only canonical Cartesian
face IDs/order/endpoints/stencils, consistent positive lengths/spacing/area,
finite bed/quantities/momenta/flux report, nonnegative stock, dry/solid history
laws and conserved initial inventory plus withdrawals. Current two fixture
edit flags/revision must agree; this is deliberately not a general geometry
decoder. Entire validation runs at construction/restoration/edit admission.

Inputs are copied into private state. Public geometry is a separate immutable
copy. Public fields/receipts are cached read-only numeric views, borrowed until
the next step/replace/edit invocation. They expose no mutable array/buffer or
callback receiving the private array. Retained checkpoints deeply copy fields,
events, geometry, faces and adjacency arrays; mutating a checkpoint/input cannot
mutate solver state or another checkpoint. A checkpoint remains mutable for
serialization/recovery handling; its mutation is never a simulation command.

`replace(checkpoint)` is explicitly restoration on the identical geometry,
solver settings and initial inventory ledger. It may restore time/fields from
that geometry's checkpoint. Resizing, arbitrary bed/opening/solid substitution,
changing units or replacing the initial finite supply is rejected even with
matching array lengths. To restore an older geometry revision, construct a new
owner from a validated complete checkpoint instead. No permission/auth system
is implied by this isolated numerical API.

`edit('gate-open'|'dig-pond')` owns exactly the retained diversion fixture edits:
open its authored gate or lower region4 by0.1m, preserving every volume while
dissipating explicitly affected momentum. Repeating an applied edit is a no-op;
unknown edits and non-diversion edits reject. There is no raising/filling,
displacement, solid insertion, arbitrary amount, real-game digging or conserved
energy claim. New physics needs a separately accepted operation.

One short proof runs corruption/reordering and ownership tests, excessive-step
rejection with unchanged state and exact retry, exact dense continuation from
the existing actual wet120s checkpoint with nonzero withdrawals/reload,
and exact owned edit comparisons. Retained canonical momenta must affect the
next step; discarding SWE last-flux q must not. The new read boundary must retain
zero public typed-array constructions within one already-created step. Limits
are demonstrated JS ownership, not a hostile-code security membrane or shared
concurrent memory API. There is no repeated numerical timing sweep.

After Game CTO's immediate-caller review, stability selection belongs to
`stepper.stableDt(maxDt)` over private typed arrays, with a validated positive
finite ceiling. The continuation caller obtains dt from the candidate owner and
checks equality to the dense reference; it does not scan inspection facades or
let the oracle choose the candidate's interval. Scalar `time` and receipt
intervals support the external authoritative schedule. The Proxy facade is
study-only diagnostic inspection and now lazy; intended integration uses copied
bulk exports/checkpoints. Constructor counts are not a full hot-loop speed claim.
