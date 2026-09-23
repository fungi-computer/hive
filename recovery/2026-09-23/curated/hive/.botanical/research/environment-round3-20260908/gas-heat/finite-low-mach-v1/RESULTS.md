# Finite sealed gas: first spatial closure result

The fixed-volume single-species expansion reference passed its first guarded numerical qualification: **u2995**, invocation `b29b42f1ef7f45c8b3f4ee77e537ecbd`, exit 0, 7 groups / 87 checks. In-process wall time was 0.842308 s, CPU 0.884779 s and final RSS 94,048,256 bytes. These include the measured proof work and file outputs, exclude Node startup/imports, and are not a production throughput claim. The numerical sources and dependencies are pinned in `source-inventory.json`; full values and assertions are in `qualification-v1.json`. No failed numerical run preceded this result.

## Physical result

The sealed strip is 8 × 1.08 × 1 m: 32 × 2 cells at `[0.25, 0.54]` m, extrusion 1 m, 64 fluid cells and 94 faces. Initially inert air is at 100,000 Pa and 300 K. Heating is 1,000 W/m³ in the fixed left half for 100 s, totaling 432,000 J. Walls are impermeable and insulating; this inviscid expansion reference has no gravity, viscosity or diffusion. Uniform chamber pressure is derived from cell internal energy, never saved or imposed by resetting each cell's energy.

Independent conservation and material-parcel analysis predicts 120,000 Pa after 100 s, a hot-origin front at 4.48842491954 m, and far-cold density 1.32297332706927 kg/m³. The comparison uses exact piecewise cell-average density across the front from `../LOW-MACH-HEATING-ORACLE.md`, plus the independent integrated velocity law. The cold probe is x ≥ 7 m; its error still includes numerical diffusion.

| Maximum dt (s) | 4 | 2 | 1 |
|---|---:|---:|---:|
| Accepted steps | 25 | 50 | 100 |
| Relative full-profile L1 mass error | 0.00291208208 | 0.00291391983 | 0.00291436433 |
| Far-cold relative density error | 5.67883000e-7 | 1.42249240e-7 | 3.55948231e-8 |
| Maximum local EOS relative residual | 3.64341e-11 | 3.60944e-11 | 3.58906e-11 |
| Maximum all-cell volume-flux residual (m³/s) | 9.92436e-14 | 9.94071e-14 | 9.94238e-14 |
| Global mass residual (kg) | 0 | 0 | 0 |
| Global internal-energy residual (J) | 0 | 0 | -4.65661e-10 |
| Pressure coefficient builds / solves | 50 | 100 | 200 |
| PCG iterations / matrix products | 2,982 | 5,962 | 11,924 |
| Actual face-transfer evaluations | 4,700 | 9,400 | 18,800 |
| Measured case wall time (s) | 0.198193 | 0.151079 | 0.212337 |

Pressure error is below 6e-11 Pa. The stage-time velocity error is below 8.7e-14 m/s; maximum Mach is 1.65e-5. Maximum accepted temperature is 410.073 K. Every main case has zero retries, exact 100 s elapsed and 432,000 J source receipt. Face mass/enthalpy and cell heat receipts reconstruct final stocks within the fixed contract tolerances. Pressure scratch storage is 6,352 typed-array bytes per strip; this is not total process or JavaScript memory.

Far-cold error ratios are 3.99217 and 3.99635 when dt halves, consistent with the SSPRK2 temporal limit. Full-profile error instead approaches a **0.2914% spatial-error plateau** at this fixed grid. This is first-order donor-cell spatial transport; no spatial convergence or second-order coupled-flow claim follows from this run.

## Independent laws and real callers

- **Density-weighted projection:** a three-cell unequal-density provisional flow gives independently predicted pressure-impulse jumps and zero corrected flow. Changing face coefficients changes the jumps correctly; topology builds once and numeric coefficients rebuild twice. A globally balanced but individually incompatible pair of sealed components rejects before solving. The gauge cell participates in the final residual check.
- **One shared projection:** the actual isolated Boussinesq `advance` caller uses the extracted operator. A periodic 4³ source-driven case agrees with the preserved solver's velocity, smoke and heat to 1e-9, with identical clock/steps. This checks the existing consumer, not just the new heating calculation.
- **Owned geometry:** the bound solver rebuilds private geometry from its canonical descriptor. Mutation of the caller's exposed face, cell, fluid, fixed and stencil data leaves both finite and Boussinesq results unchanged, including direct transport. Different origin/species identities and forged descriptors reject. No assertion that freezing an outer object freezes typed arrays is made.
- **Local energy law:** 540 J deposited in the first of three cells yields 360 J and 180 J face enthalpy transfers and 180 J internal-energy gain in each fluid cell. Those paired receipts, rather than an EOS overwrite, produce the pressure rise. Solids keep zero mass and energy.
- **Rest and uniform heat:** rest preserves stocks exactly; uniform heating produces 301.2 K with zero flow and unchanged mass.
- **Bounded retry and atomic rejection:** a 590→599 K endpoint succeeds with 5 accepted steps and 4 specifically identified virtual-stage envelope reductions. Its requested heat is 6,177.966101694916 J and stored change is 6,177.9661016949685 J; the floating residual is retained. A genuinely above-600 K bulk endpoint, nonrepresentable positive clock interval, malformed heat and work-budget exhaustion reject without mutating the input. Structural or linear-solver errors are not blanket-retried.
- **Actual file restore:** a saved 50 s JSON state loaded by a fresh numerical owner and advanced to 100 s equals the uninterrupted final canonical state exactly. Saved derived pressure is rejected.

## Source review and Fallow

Independent source and final-evidence acceptance are recorded in `REVIEW.md`. Fallow **u3000**, invocation `343fb5d1a52647b7bc509ceae56c1dd9`, exited 0 after 939 ms, inspecting the five owned `.mjs` files with `qualify.mjs` declared as entry. Its missing local `node_modules` warning did not trigger an installation; dependencies are builtins and retained relative owners.

`fallow.json` contains zero unused files, unresolved imports, cycles or duplicate groups in that narrow scope; it is not a clean-health claim. Twelve public exports appear unused from this entry: nine retained Boussinesq compatibility exports plus the finite version/limits and projection limits. They remain valid public surface and are retained. Thirteen health findings include real cognitive hotspots: `project` CC34/cognitive45, `advance` CC20/cognitive26 and projection workspace CC12/cognitive17. The inherited Boussinesq advance/predict and several admission loops also appear; CRAP estimates have no imported runtime coverage and are not proof of missing checks.

The approved follow-up is a separate behavior-neutral sibling that decomposes projection admission, coefficients, PCG and correction, and finite request admission, bounded RK trial and accepted receipt accumulation. This passing candidate remains the frozen physical oracle.

## Limits

This establishes finite mass/internal-energy ownership and a qualified fixed-volume, one-component, single-gas 1D expansion closure on a multi-cell strip. It does not establish complete 3D finite-mass momentum, gravity, vorticity, species mixing, real-gas accuracy, open reservoirs, topology remapping, digging displacement, combustion, oxygen use, water coupling or game performance. The 200–600 K ideal-gas definition envelope is an explicit approximation. Floating receipts disclose residuals; they are not exact compensated finite-donor/receiver transactions.
