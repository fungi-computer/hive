# One bounded coarse residual refinement

New isolated candidate only; prior source, failures and offline evidence
remain unchanged. Root accepted the exact captured-system diagnosis and
requested the smallest standard correction, not an altered physical
method or tolerance.

The original stencil evaluation is now one function, coarse_residual:
it returns signed residuals, the same original term scales, finite/pass
status and diagnostic maxima. Its scale and 512*DBL_EPSILON bounds remain
unchanged. Both the pre-check, correction RHS and post-check consume this
one evaluation owner. No duplicate acceptance equation exists.

The same native row-scaled smatrix_inverse is retained. The caller keeps
the row scales and inverse. Its initial matrix-vector product uses the
same arithmetic/order through a shared coarse_inverse_product function.
If the initial original-stencil check is finite and fails, divide all
16 signed residuals by the original row scales, compute all 16 delta
components from that one saved residual vector, then form all 16 corrected
values before changing the local solution. Exactly one correction is
allowed. Invalid/nonfinite inputs reject; no until-pass loop exists.

Run the same original-stencil guard again before assigning any native
coarse correction field. A remaining failure still rejects the batch.
The finite masses/energy/heat sources, dt/events, finer solver, pressure
work and full native residual tolerance are unchanged. Pre/post residual
and guard-ratio maxima plus correction count are reported. Final rejected
refinement prints those diagnostics before the unchanged failure policy.

## Executable captured-system regression

captured-system.h is generated mechanically from the exact hex data in
failure-capture-v1/run-capture-v1/coarse-failure.json and the one offline
refinement vector in OFFLINE-RESULT.json. No fixture values are guessed.
The native regression begins with the actual matrix/RHS and calls the
same inverse owner. Its initial pivot and all solution bits must match
the failed captured solve. Its row-6 residual and bound must match exactly.

Then the new owner must make exactly one correction, pass the unchanged
guard, keep worst guard ratio below .01 (the already measured offline
result is .001184), and match all 16 offline corrected components exactly.
Calling it again on the accepted solution must leave bits and count
unchanged. Separate processes check that a zeroed inverse still rejects
after exactly one correction and that nonfinite input rejects without a
correction. All raw outputs are preserved; no physical step is run.

Regression budget: 10 s total under ordinary retained proof guard; no
threshold or fixture adjustment after a numerical mismatch. The existing
qcc dimensional-interpreter bypass remains explicitly local/unqualified;
normal C diagnostics are retained. Source patch and captured regression
go to root before any broader physical packet. Root has not yet accepted
this source for the next 100 J / 2 s run.
