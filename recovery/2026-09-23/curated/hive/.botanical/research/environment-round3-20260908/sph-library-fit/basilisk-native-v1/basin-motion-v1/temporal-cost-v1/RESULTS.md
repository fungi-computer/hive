# Temporal-cost result: same declared accuracy with139updates

Root source and independent review retained; generated C diff is exactly the
DT cap change. Native u3484/0db25be8426c40fbaa6daf31bc59a0b2 exited0.
Both2D meshes completed the same1.171909s physical interval using139updates,
versus1611in u3477. No equations/grid/pressure/accuracy threshold changed.
Compile u3481/2e3c2c425318446b972bbc81c582ba0f passed; both compiler logs empty.

|Case|Observed wall|Native process CPU|RMS mode error|Max energy error|
|---|---:|---:|---:|---:|
|Coarse|1.8569s|1.7895s|0.2130%|0.8587%|
|Fine|10.6225s|7.9556s|0.2512%|0.7525%|

All existing shape, phase, period, return, energy, native pressure, fractional
state and signed budget gates pass. Both also meet the old1e-10stock diagnostic
in this different timestep experiment; previous coarse failure stays failed.
The refinement comparator passes its preexisting BOTH-BELOW-1% alternative.
Fine RMS is slightly worse at this temporal resolution; this is NOT evidence
of monotonic grid convergence. Temporal error now materially contributes.

This demonstrates unnecessary updates in the deliberately tight reference
cap and retains an explicit accuracy tradeoff within predeclared limits.
The old12/45s timings and new1.9/10.6s were separate shared-host observations;
only the1611to139update counts are exact comparable work. New child CPU
is separately captured, but old baseline did not capture matching CPU.
No percent allocation, matched CPU speedup,3D capacity or real-time claim.
Native projection/VOF/observer times remain nested. This candidate still
needs concrete geometry, restart and game-scope workload qualification.

Fallow u3480/1af3fa82db6f4a3ea76cbbcbc9ac8ad0 exited0 with six inherited
static health advisories in the comparator, no dead/cycle/clone in scope.
The two comparator edits only update expected numerical cap. Existing
boolean-law/nativeControls and temporalMetrics complexity remains disclosed;
no gates or valid entrypoints were deleted for a cleaner audit.

Prior source and evidence remain frozen; this directory is root-owned ignored
work. COST-ACCURACY.json contains actual per-case ledgers, costs and limits.
Accepted public lab handoff remains u3477, not silently replaced by this run.
