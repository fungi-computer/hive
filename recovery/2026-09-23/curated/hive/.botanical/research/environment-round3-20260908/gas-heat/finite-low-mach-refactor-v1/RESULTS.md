# Refactor qualification result

The one guarded numerical run passed: **u3023**, invocation `51bbb41f383e44a292992c740e9dd4e8`, exit 0, **10 groups / 211 checks**, measured wall 2.877545 s, CPU 1.708377 s, final RSS 94,056,448 bytes. The session was retained through terminal completion. No failed numerical attempt or repeat preceded this result.

`qualification-v1.json` and `source-inventory.json` pin the actual result and source. The main numerical deltas are `projection.mjs` SHA256 `6544aaef2b5fbe6ab667a0b199bb7f385c47603dfd4f6683baa02aa44ee17d09` and `finite-gas.mjs` `ae911a681b783965fc15df8c8c47b7f987972b50a1a128049179885c5a7eecf4`. The qualifier is `c9ce63703e29795f28e3916b5d795c5696ab05f78b055c38ae9421828ff74b63`. Geometry and the Boussinesq caller remain byte-equal to the accepted original.

## What remained exactly equal

All original seven physical-law groups passed unchanged. The full dt4/2/1 canonical states, aggregate face/cell receipts, exact reference profile and work counters equal the original saved evidence, with no tolerance used for that equality. The fixed-mesh density error is still about 0.2914%; far-cold errors remain 5.67883000e-7, 1.42249240e-7 and 3.55948231e-8. Mass residuals remain zero; the finest energy residual remains -4.65661e-10 J. The physical model and its limitations have not changed.

Active old/new calls also produce exactly equal complete results and diagnostics for rest, zero interval, the local Euler enthalpy law, the heated strip, actual CFL reductions, actual intermediate-temperature-envelope reductions and the existing helium definition path. This includes clocks, stocks, source/face receipts, stage fields, extrema, retry reasons and measured work counters. Cross-version encoded state restores exactly and produces the same continued result.

Nine finite failed requests have the same error class and message, unchanged caller input and equal work diagnostics: unsupported bulk temperature, accepted-step exhaustion after candidate work, nonrepresentable clock, oversized work request, nonfinite heat, negative interval, invalid dt, foreign identity and an extra derived pressure field. Shared projection also preserves malformed velocity/coefficient/target rejection and sealed compatibility behavior.

The actual Boussinesq `advance` and direct public `transport` outputs are exactly equal between old and new callers, including diagnostics. The original handoff inventory was verified around reference use; all frozen original evidence and numerical files remain unchanged. This is a finite regression qualification backed by independent source review, not exhaustive equivalence for every possible JavaScript input.

The larger overall wall time than the original numerical packet includes additional live old/new solves, repeated exact comparisons and file hashing. It is not a speedup or slowdown benchmark. The original physics step and solve counts stayed identical.

## Fallow disposition

Combined source audit **u3025**, invocation `c54090536e1b43a883cebda97f28c206`, exited 0. Focused file/caller inspections **u3027** (`9a57ba7a33ed4bdb908cbcecb2de55c7`) and **u3028** (`90b9b42f40f5481f936614cbcfe15aa7`) also exited 0. Outputs are `fallow.json` and `inspect-{projection,finite-gas}.mjs.json`. All used the ordinary proof guard and retained sessions. The missing local `node_modules` warning remains disclosed; no dependency installation occurred.

The previous `project` cognitive45, finite `advance` cognitive26 and workspace cognitive17 hotspots are decomposed into actual responsibilities. Current separated pressure functions reported by Fallow are target admission cognitive11, PCG10, correction7, numeric assembly6, residual initialization6 and connectivity6. Finite request admission is cognitive4 and bounded RK trial10. The public coordinators are below reported thresholds. One private geometry/pressure/thermodynamic owner remains; no alternate physical implementation was introduced.

This is **not an all-green Fallow result**. Total health findings rise from 13 to 19 because several newly separated functions individually cross the estimated-no-coverage CRAP threshold; no runtime coverage file was supplied. The two remaining cognitive-threshold findings are the unchanged Boussinesq `advance`21 and `predict`16. Finite validation (CC12/cognitive6), Euler (11/11), request admission (10/4), geometry admission (9/6), pressure validation (8/5) and several numerical loops retain advisories. Euler still has 52 lines; further decomposition must follow a concrete ownership need and preserve its local physical balance. The factory contains nested private methods, so its reported 202-line extent is not 202 sequential statements in one algorithm.

Ten exports remain unused from the declared proof entry: nine retained Boussinesq public compatibility exports and projection limits. VERSION/LIMITS now have a real equivalence consumer; no export was deleted or suppressed. There are no unused files, unresolved imports, cycles or duplicate groups within the five owned source files. That narrow result does not assert that the retained experimental family has no intentional frozen duplication.

## Scope retained

The same versioned ideal-gas definitions, 200–600 K envelope, one connected sealed component, finite cell mass/internal energy, first-order spatial donor transport, SSPRK2 source/enthalpy evolution, limits and arithmetic order remain. No complete 3D finite-mass momentum, gravity/vorticity, diffusion, mixture transport, open reservoirs, digging/topology remapping, water coupling, oxygen, combustion or production game performance was added. `../finite-low-mach-v1/RESULTS.md` remains the physical interpretation and independently checked oracle record.
