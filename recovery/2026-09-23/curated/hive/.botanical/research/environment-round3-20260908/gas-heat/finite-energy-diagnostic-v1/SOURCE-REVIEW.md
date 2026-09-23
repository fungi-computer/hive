# First source shape and static inspection

Owner: `/root/sim_study_status_check`, exclusively this ignored directory.
Root owns method/source/run acceptance. No numerical run has occurred.

Personally compared both touched owners to the frozen source. All physical
update expressions and original receipt accumulation order are retained.
`instrumentation.patch` contains only observations/additional diagnostic output.
`energy-diagnostics.mjs` consumes exact old/advected arrays and current-stage
projection copies; it neither writes them nor calls the solver. Accepted RK
weights are applied at accepted composition, not attached to the exposed Euler
result. Compact returned stages are written before diagnostic law assertions.

Work provenance is traced in CONTRACT: stored per-model diagnostics are not
whole-suite counts. Two actual post-solve validation reads explain the 1024-cell
read difference. The caller separately captures solve counters and uses those
same meaningful reads for physical quantities. It does not manufacture reads
just to make counters agree. Prior JSON evidence has no negative-zero bit
provenance; equality is exact in the retained saved representation.

Static check u3262 / invocation912c3076a07a418497d5a51171e848fc exited0 under
run-proof.sh with a20-second inner guard. It ran node --check on six sources,
then Fallow3.20.0 with the actual qualify.mjs entry. No model import/execution.

I read the actual fallow-v1.json. It has22 health findings, all estimated-coverage
advisories in inherited physical owners. The existing real responsibility
hotspots remain validate cognitive13 and momentumGeometry15; source code was
not refactored during instrumentation. transportMomentum remains10 and
acceptTrial9. Newly added diagnostic functions and the focused caller have no
threshold findings. Fallow reports four public exports unused by this narrow
caller: VERSION, MOMENTUM_LIMITS, dualTransfers and PROJECTION_LIMITS. They are
valid retained physical/basis interfaces and are preserved. No unused file,
unresolved import, cycle or clone finding. The local directory lacks its own
node_modules; Fallow warns dependency resolution may be incomplete, and no
installation was attempted. No suppression or export deletion was applied.

Next permitted checkpoint is root source/caller review. The fixed numerical
packet in CONTRACT remains unrun until that review authorizes it.
