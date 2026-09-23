# Independent finite low-Mach source and caller review

2026-09-08. **Accepted for the declared bounded numerical qualification, not yet numerically qualified or integrated.** The reviewer read the corrected source, frozen thermodynamic/geometry/transport dependencies and complete immediate qualification caller. No reviewer solver edits or numerical run were performed.

## Physical accounting and shared owner

`finite-gas.mjs` has one canonical finite mass and internal-energy array. Chamber pressure is derived from total U and fixed connected volume; density, temperature, gamma and enthalpy come from the frozen finite thermodynamic owner. The full thermodynamic definition, geometry and species are included in the state identity. A saved pressure field is explicitly rejected instead of becoming another authority.

The stage uses the correct integrated target

```
pDot = (gamma - 1) * sum(cellHeatW) / totalVolume
target_i = ((gamma - 1)*cellHeatW_i - pDot*cellVolume)/(gamma*p)
```

`target_i` is m³/s. A face transfers one donor's mass and the same donor's enthalpy, equal and opposite between the two cells, before adding external heat to U. This is the fixed-volume, uniform-pressure internal-energy equation with pressure work contained in enthalpy flux. There is no EOS overwrite, arbitrary uniform-U reset or extra `V*pDot` charge. Local EOS agreement therefore tests the transfers instead of being imposed after them. The outgoing enthalpy/cooling CFL is more restrictive than the positive-mass outflow bound for gamma>1.

The shared `projection.mjs` rebuilds face weights and numeric diagonal on every call, including the second RK stage. Its weight is `(1/rho_face)*area/distance`; `phi` is pressure impulse in Pa·s for the finite-density caller, and the velocity correction is `(1/rho_face)*delta(phi)/distance`. No dt is missing from a pressure-gradient equation: it has been absorbed into the impulse. The beta=1 Boussinesq caller retains its velocity-potential interpretation. Linear, compatibility and final constraint residuals concern integrated volume flux in m³/s, not a dimensionless divergence norm.

Every sealed component is checked for target compatibility before pinning. No mean subtraction hides an impossible source. Numeric residuals are checked at all cells, including the gauge cell, and numeric weights cannot remain stale when density changes. The finite model admits exactly one connected sealed component. The old matrix/project owner is removed from the derivative Boussinesq caller; its existing predictor and conservative transport call the shared projection. The last direct public transport export was corrected to bind geometry before invoking the same frozen implementation.

## Ownership, retries and restart

`geometry-owner.mjs` reconstructs an internal snapshot from the canonical descriptor through the existing frozen compiler and requires exact reproduced identity. Finite, projection and Boussinesq entry points use this snapshot. External face/cell/fluid/fixed/stencil mutations cannot silently change the cached numerical domain. Internal numerical modules borrow it without modifying it; the shallow outer freeze is not represented as typed-array immutability. Canonical descriptor changes require a new binding and separate state admission. This is not topology remapping or excavation.

The SSPRK2 update averages the old state with the second forward-Euler result, and averages the two face/source receipt sets with the same weights. Intermediate time is virtual: the reported last stage velocity is evaluated at its stated stage time, not asserted to be the final endpoint flow. Candidate arrays are separate from input stock arrays; rejected stages and an ultimately exhausted request do not publish physical state, time or source ledger changes. Work counters and temporary projection scratch may change on rejected attempts; they are diagnostics, not conserved state.

The corrected request rejects positive intervals that round to no time advance and applies the stated accepted-step and cell caps. Only the specifically identified candidate temperature-envelope failure is retriable, with bounded halving; invalid initial state, foreign identity, EOS/balance failure and pressure-solver failure remain fatal. This matters because a valid 590→599 K accepted RK endpoint has an unaccepted full second Euler endpoint above600 K. The global bulk-temperature preflight is a necessary early rejection, not proof that every local final cell stays within its envelope. Per-stage and accepted-state validation remain required. These conservative restrictions do not promise every mathematically admissible endpoint at exactly an envelope boundary is reachable with the bounded stage strategy.

The save has strict shape and full definition/geometry identity. It preserves finite stocks and cumulative source references, not solver scratch. The proposed exact restart cuts on the same dt=1 s schedule and resumes with the same prescribed heat; exact equality there is appropriate. It is not a promise of bitwise equality under arbitrary time partitioning, changed forcing, geometry or a different integration recipe. Per-call face receipts reconstruct physical changes with measured floating residuals; they are not an invented durable game-command protocol.

## Qualification caller assessment

The complete caller supplies meaningful independent checks:

- Unequal density at common pressure uses an independent one-dimensional impulse-jump relation. This detects wrong face mobility; the heated-strip velocity alone could not. A second coefficient set checks diagonal invalidation, and globally balanced but component-incompatible targets reject before a solve.
- The actual Boussinesq advance is compared against the frozen implementation, rather than calling only the new projection in isolation. External geometry mutation is exercised against both finite and Boussinesq consumers.
- The one-hot three-cell case checks each physical mass/enthalpy face transfer and each local U change. Uniform heating checks zero flow and fixed mass. The envelope/time/work cases include input preservation after rejection.
- The heated strip compares the full finite-volume mass distribution to the independently derived piecewise profile integrated over each cell. Its middle interval includes hot-origin inflow. The far-cold parcel relation is not incorrectly applied to the whole right compartment. Velocity is compared at the actual stage evaluation time.
- dt4/2/1 s use the same physical source, mesh and duration, with predeclared tolerances. The full-profile spatial error and far-cold temporal ratios are reported separately. Aggregate face/source receipts reconstruct the final stocks. A real file reopen tests aligned continuation and foreign identity rejection.

One reporting-only correction was returned before execution: the saved report's check count was captured before the final wall-budget assertion incremented it. This does not affect the numerical equations but should be corrected before freezing proof evidence.

## Scope and performance limits

This is a constant-gamma, single inert gas, sealed fixed-volume, prescribed-heating **kinematic expansion and transport reference**. Zero provisional velocity is intentional here. It does not implement finite-density momentum, general three-dimensional circulation, buoyancy, diffusion, oxygen consumption, combustion, open reservoirs, phase changes or changing solid volumes. The abstract ND projection and a Boussinesq 3D comparison do not establish those missing finite-gas behaviors.

Donor transport remains first-order in space; SSPRK2 time behavior is a separate claim. Numerical diffusion can reach the far-cold probe even when the physical material front does not, so geometric separation alone does not prove the temporal oracle is uncontaminated. The proposed measured ratios must pass rather than be assumed. The low-Mach envelope is diagnosed for the fixed fixture; the implementation is not a universal high-speed admission model.

Projected workspace bytes are typed-array scratch, not all geometry, JS arrays, temporary copies or process memory. `thermodynamicCellReads` counts the outer read calls, not each internal validation/derivation invoked by create+read; successful Euler-stage counts do not count every failed trial. CPU/wall measurements and explicit solve/coefficient counters should retain their actual meaning. No runtime-capacity, WASM-speedup or controlled benchmark claim follows from this source review. Fallow and numerical results have not yet been read by this reviewer.

## Source inventory at first acceptance

| Source | SHA256 |
|---|---|
| geometry-owner.mjs | `0b63271b7c2b8961f75f5e843a1919b60c94b690590d5f3eae7be98d6fac2f77` |
| projection.mjs | `b9738878223108d1cd096f8587a696f0cb3a918ff8a9b66164c6a61d20b167a5` |
| finite-gas.mjs | `545bab96eb210c36bd98fb84efa4afd16d8f2b2c2150c36cf07fa4a30d8e0762` |
| boussinesq-reference.mjs | `fe464e909b134ea87d6e76688585a862d35e593bc7c23a6b70ba92b871fb753a` |
| qualify.mjs, before returned count correction | `af1e05296181c26e2b1d68daa1bbb1ce93d38a6bbe22d0313ebdba119447e03b` |
| CONTRACT.md | `d226e242faaafb0ff61ba3f1db396b0f228e359350b22e121d084c938cf6b86f` |

The independent mathematical note is `../LOW-MACH-HEATING-ORACLE.md`. The author owns the fixed proof and any correction; frozen earlier studies remain unchanged.

## Numerical evidence and Fallow read after the fixed run

The owner reports guarded scope `run-u2995.scope`, invocation `b29b42f1ef7f45c8b3f4ee77e537ecbd`, exit0. I read the actual `qualification-v1.json` (SHA256 `47f0403f83349f7c00bb9e74b6680aadd639919e381b4f03f1fae8ab710b79e5`): seven groups,87 checks,0.842308 s wall and0.884779 CPU seconds. Every recorded source pin matches the corresponding current file. Before execution the author fixed the report count and distinguished Euler attempts/successful stages/actual face-transfer evaluation counters; finite source is now `409c333a6b9b482388cbd836f7aad3c4faca47ac937eacfb7ed3b014e25476ed`, caller `fa3bf3316fec1aa407ca8640527a29bac31e137c29d60438948794935c10f030`. Those changes do not alter physical equations.

The heated strip reaches120 kPa from100 kPa with432,000 J prescribed heat. At dt4/2/1 s the far-cold relative-density errors are `5.67883e-7`, `1.42249e-7`, `3.55948e-8`; ratios `3.99217` and `3.99635` pass the fixed temporal thresholds. Whole-profile relative L1 mass error stays around `0.002912–0.002914` (about0.291%), so it is correctly retained as spatial error rather than claimed to improve with time refinement. Maximum measured constraint error stays below `9.943e-14 m³/s`, local EOS error below `3.644e-11` relative, velocity-oracle error below `8.620e-14 m/s`, and Mach number below `1.646e-5`. The finest total-energy residual is `-4.65661e-10 J`, not forced to zero. The exact aligned file restart, mobility invalidation, per-component rejection, private-geometry isolation, local receipts and atomic admission groups all passed. Uniform590→599 K used five accepted steps and four narrowly identified envelope retries.

**The declared finite sealed-strip physics result is accepted.** This does not widen the model or qualify another geometry, mixed gases, excavation or finite-density momentum. The single short-host timing is not a controlled benchmark or population-capacity estimate.

I also read actual `fallow.json` (SHA256 `e146f39bd3c011328232948b5dcb697e3250722e3d6211b0168bd94364252477`), reported scope `run-u3000.scope`, invocation `343fb5d1a52647b7bc509ceae56c1dd9`, exit0. It has12 public-export advisories, no unused files, no cycles and no detected clones. The13 health findings include real cognitive/cyclomatic hotspots: project45/34, finite advance26/20 and projection workspace17/12. CRAP values use estimated coverage; they do not negate the executed laws or establish imported coverage. The parent's approved sibling refactor should split those actual responsibilities while preserving this accepted source/evidence, exact arithmetic and rejection semantics. No exports or valid old entrypoints should be removed merely to lower the report count.

No reviewer numerical rerun was performed. This file's earlier pending statements describe the first source checkpoint; this section records its subsequent evidence disposition.
