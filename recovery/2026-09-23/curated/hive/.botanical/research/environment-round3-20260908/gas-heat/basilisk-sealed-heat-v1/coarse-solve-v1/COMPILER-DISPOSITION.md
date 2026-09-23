# Symbolic compiler limitation, preserved and explicitly scoped

The first compile u3457 / 6559b5858c0c445587fcf6dd095f3ce2 exited 2 after
22.396 s with an empty C diagnostic log, while producing `build-v1/algebra`.
It was not executed or treated as accepted. Exact files/receipt remain.

The source-only diagnostic u3463 / dadbb9b432c94cf9bf5d663dc631cc1c exited
2 after 2.616 s. Its explicit `dimensions.log` contains:

    ./coarse-thermal.h:185: warning: 'pivot' is unset: assuming it has dimension [0]

Actual pinned qcc.c:527–538 sets exit 2 when the separate symbolic
dimensional interpreter returns failure after successful C compilation.
The interpreter documentation explains its reduced grid and unset-value
branch exploration. It did not mechanically qualify the heterogeneous
T/p dense inverse or this deliberate rejection caller. This is retained
as failed symbolic analysis, not an algebra or physical result.

Root explicitly authorized the installed documented `-disable-dimensions`
option only for this isolated candidate. `compile-v2.py` applies it to
the candidate qualifier/source translation/physical binary, preserving
`-O2 -Wall`, all equations, fixtures, thresholds, native warning gates and
the existing qcc binary/upstream. Units and original-stencil relationships
were reviewed from source; qcc dimensional verification is NOT claimed.

The actual native-field basis/known-solution checks remain required before
the single authorized physical packet. C diagnostics, algebra mismatch,
nonfinite state or native solve warnings are not suppressed by this
compiler disposition. No installed compiler or upstream file was edited.
