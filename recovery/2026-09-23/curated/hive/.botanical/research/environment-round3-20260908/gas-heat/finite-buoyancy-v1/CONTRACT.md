# Finite density motion under gravity — first caller contract

Status: proposed fixed qualification; no dynamics run. Owned files are only this new directory. Import the frozen `../finite-momentum-v1/finite-gas.mjs` and its unchanged geometry/momentum/projection/thermodynamic dependencies. No alternate gas equations, force provider, Boussinesq scalar, density update, source switch or saved pressure is introduced.

The independent continuous oracle is root-owned `../linear-buoyancy-oracle-v1/oracle.mjs`, SHA256 `3994179249750d872d478e16f9642019b345104211c91a611e849a53b4b7f9c8`. Its independent95-check quadrature/PDE/amplitude packet u3190 passed in52.70ms; the actual proof SHA256 is `6787123a8cabd3b979fe77d5b5a55284639c22471bdd24c108e506f6f895e2c7`. I independently read its derivation, averages and check before root ran it. The caller verifies both accepted hashes. It is a reference sampler, never an external acceleration supplied to the solver. All solver cases have zero heater, gravity[0,-9.81,0], no viscosity/diffusion and no body-force callback.

## Physical question and actual owners

The accepted momentum fixture proved density translation, hydrostatic rest, nonlinear constant-density velocity and1-D thermal expansion separately. The missing composition is a nonuniform density field that **moves under actual gravity**. The frozen finite owner already derives face mass from physical cells, applies gravity to that mass, projects with its reciprocal density and transports cell mass/U through the resulting motion. We exercise this existing path; we do not implement another buoyancy owner.

Use a4×2.16×4m full rectangular domain, periodic x/z and sealed free-slip y. Initial thermodynamic pressure100000Pa, reference temperature300K, one inert-air definition and U_i=p0*V_i/(gamma−1). Initial density is the exact cell average of:

```text
rho = rho0 * (1 − epsilon*q)
q = cos(2*pi*x/Lx) * sin(pi*y/Ly) * cos(2*pi*z/Lz)
u = 0
```

The mean density perturbation vanishes horizontally, while positive q denotes lighter gas. The positive/negative density columns need to rise/sink, establish horizontal return flow and change the physical density field. Initial temperature follows U/m and is not a separately advected anomaly. The approximation remains uniform thermodynamic pressure plus small dynamic/hydrostatic pressure, not an exact compressible atmosphere.

Root's oracle supplies the leading epsilon→0 initial acceleration and pressure. We must distinguish three errors: finite-grid spatial error, higher-order epsilon terms in the nonlinear density-weighted projection, and change over actual time. A pretty moving field alone qualifies none of them.

## Fixed first matrix and budgets

| Case | Mesh, amplitude and interval | Returned steps |
|---|---|---:|
| Initial spatial acceleration |4³ and8³ over the same physical domain, epsilon.005; one forward Euler interval1/1024s from rest |2 |
| Initial amplitude discrimination |Additional8³ epsilon.02 and.01, same one Euler interval; compare normalized responses with the existing.005 case |2 |
| Short-time initial anchor |8³ epsilon.001; one Euler interval1/1024s from rest |1 |
| Uniform-density control |8³ epsilon0, same gravity, one Euler interval1/1024s |1 |
| Short-time evolution |8³ epsilon.001; intervals.25,.125,.0625s, exactly8 RK steps in each |24 |
| Finite moving density |epsilon.1;4³ atdt1/32s,8³ atdt1/16 and1/32s; each interval1s |80 |
| Actual file continuation |Finest finite case dt1/32s, save at.5s and fresh-model continuation to1s |32 |

Nominal total136 returned SSPRK steps plus6 exposed forward-Euler stage probes. Hard proof-wide180 combined steps/probes,512 physical cells,30-second inner wall limit within the ordinary proof guard. Individual advances carry exact accepted-step limits. The exposed Euler response is a valid checked stage with its own time/receipts, and is never labeled an accepted SSPRK step. Bounded work in rejected requests is reported separately. No numerical invocation until parent reads the source/caller and actual oracle pin. Preserve the first failure unchanged; no automatic rerun, threshold tuning or fixture substitution.

## Independent checks fixed before execution

1. **Initial leading acceleration.** Because first-step initial velocity is zero, the physical mass/U update is zero before applying gravity/projection. Compare actual u/dt and momentum/dt against root's analytic dual-volume acceleration and rho0*dual-volume acceleration at the same position/metric. Normalize by epsilon to expose the spatial floor. Require coarse relative L2 acceleration error<35%, fine<15%, and fine/coarse<0.7 at epsilon.005. Report component errors separately. Density must remain unchanged in this first Euler state, with no nonzero mass receipt silently introduced.
2. **Nonlinear amplitude discrimination.** On the fixed fine grid compare A(epsilon)=u/(dt*epsilon) for.02,.01,.005. The ratio of successive L2 differences should lie in[1.6,2.5], consistent with the first correction to the leading acceleration being O(epsilon). Report all errors against the independent continuum reference as well; this ratio is not spatial convergence or proof that the finite epsilon field is exactly linear.
3. **Initial pressure.** Remove both pressure gauge and analytic hydrostatic background from the first Euler phi/dt, then compare the remaining perturbation with the oracle's cell-volume average. Report coarse/fine component and range errors; fine relative L2 perturbation-pressure error<25%. This is an initial acceleration/impulse check: it is not a pressure measurement at a later moving endpoint.
4. **Short-time discrimination.** For epsilon.001, compare u(T)/T with the independently sampled leading continuum acceleration and separately with the actual discrete initial acceleration. The latter isolates time evolution from the fixed spatial/amplitude floor. Require each halved time to reduce this normalized discrete drift by at least a factor0.7; report actual ratios rather than declaring an exact nonlinear analytic solution. At the shortest interval require relative drift<2%. Record nonzero accepted movement and density-change magnitude without overstating its practical size.
5. **Finite movement and energy directions.** At epsilon.1 and1s require vertical velocity positively correlated with the **initial** lightness pattern; mean v_y in initially lighter columns>0.01m/s and in heavier columns<−0.01m/s. Require RMS of each horizontal component>0.005m/s, max final velocity>0.05m/s, normalized L1 physical mass-field change>1e−4, positive K gain>1e−4J and PE loss>1e−4J. These fixed measurable directions qualify genuine circulation/density transport, not an animation.
6. **Mechanical quality.** The zero-heater incompressible inviscid limiting equations have S=0, so K+PE should conserve in the continuum. Report absolute and relative mechanical residual `abs(deltaK+deltaPE)/max(abs(deltaK),abs(deltaPE))`, separating numerical advection, gravity, wall, pressure and RK averaging operation receipts. On the fine dt1/32 case require relative residual<30%; also report the coarse and fine/time comparisons without relabeling an adverse trend. No energy correction is allowed. This is a first explicit quality bound, not exact conservation or a final game accuracy target.
7. **Stocks and receipts.** Paired primal mass/enthalpy and dual momentum receipts independently reconstruct all final cell/face stocks, including stationary wall half-volume reaction. Use the frozen canonical mass/U/impulse tolerances, integrated divergence<=1e−10m³/s, EOS<=5e−10, kinetic operation reconstruction<=1e−10J plus1e−10 of operation scale and gravity PE reconstruction<=1e−9J. The actual heat receipt must be zero. Initial and final U are physically unchanged in this S=0,zero-heater case within existing floating limits; no reset is performed.
8. **Restart and rejected authority.** Save a real moving finite-density state to an actual JSON file at.5s. Same frozen model/geometry/gravity continuation must equal the uninterrupted final canonical state including M/U/P, time and all impulse references. Changed domain or gravity rejects unchanged input. Any exception or budget remains atomic; it never becomes a partial successful time advance. Read-only source inventories must remain equal before and after all cases.
9. **Approximation and work.** Record temperature min/max, Mach, stage pressure/hydrostatic range to p0, pressure residual/work, per-case cells/faces/dual nodes, actual steps/retries and whole-packet wall/CPU/final RSS. All temperatures must stay200–600K, Mach<=.01 and phase pressure ratio<.001. No claim of solver-only memory, optimized throughput, broad stability or exact nonlinear buoyancy follows from this packet.

## Scope after the result

This first consumer cannot qualify obstacles, finite open apertures, ventilation, viscosity, multiple species, source changes, water displacement, excavation/remapping or combustion. The fixed canonical owner remains unchanged even if a physical law fails. Root chooses whether a failure requires a method correction or a different independently justified reference, and accepts the final physical interpretation.
