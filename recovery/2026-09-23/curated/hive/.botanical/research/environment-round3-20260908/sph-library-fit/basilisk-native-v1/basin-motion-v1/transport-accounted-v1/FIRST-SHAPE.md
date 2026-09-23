# Source-only handoff

Read `caller.patch` for the small changes to the prior accepted caller, force
observer and corrected comparator. Then read the new
`wave-transport-observation.h` and `transport_accounting.py` for the complete
signed accounting. `CONTRACT.md` declares the new one-period budget, residual
checks, exact-zero closed-wall requirement and unchanged physical gates.

The finite observer is called before VOF, after VOF, before native iforce and
after projection. Two-word compensated stock pairs let the independent reader
close the signed stock difference against actual cc-weighted divergence,
separately measured native clamp and tightly checked inter-stage residuals.
Canonical f, uf, u and p are never assigned by this observer.

`source-pins.json` pins all new source/readers, immutable oracle, contract and
baseline. Compiler and runner are staged against their own new output folders.
**No compile, syntax-proof invocation or numerical run occurred.** Generated
event and boundary-loop verification remains the next compiler-stage check,
only after root reads this source. Frozen u3386 remains a failed legacy result.
