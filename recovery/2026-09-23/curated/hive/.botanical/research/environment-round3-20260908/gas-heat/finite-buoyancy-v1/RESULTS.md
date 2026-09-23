# Moving finite density under gravity: first result

The one authorized frozen packet passed **run-u3206.scope**, invocation `aa2adec7d0d845f186c250142afb5a3e`, exit0. Owned session40332 was retained and polled through terminal completion. The result contains309 checks across4 groups, **136 returned accepted SSPRK steps plus6 exposed forward-Euler stage probes**, at most512 physical cells per case. Whole-packet wall time was11.845833128s, process CPU8.878114s and final Node RSS304,037,888bytes. These include analytic sampling, assertions, file serialization/reads and retained raw fields; they are not solver-only throughput, peak memory or production capacity measurements.

`qualification-v1.json` SHA256 is `85becba337ee625c96c2d74004ea1138232a816607514ad6b9701d064a80c09d`; `run-source-inventory.json` is `3d4dec95d17fc5927766c22bbf86ff1386a17c695bf87d960f6c11e6e55c37c6`. Exact accepted momentum source/evidence and oracle hashes were checked before and after and remain unchanged. Pre-run inventory `b2f9a52fb497c887ad704302d842a161c5703d210c0a40d820866a0f28c4506b` and source archive `4c95164f023549a42bc1066767da2ede404ff4fd067a37eb229b4fee518c6248` preserve the first source packet. No numerical failure, threshold change, scene replacement or rerun preceded this result.

## Physical composition established

The actual finite-mass/internal-energy/momentum owner developed buoyant motion from a density field under gravity[0,−9.81,0]. No analytic acceleration was supplied as a body force, no Boussinesq temperature multiplier was introduced and no alternate density update ran. A zero-heater source remained zero. The solver used its same mass/enthalpy receipts, derived dual mass, conservative momentum path and density-weighted pressure projection.

All cases used the declared4×2.16×4m full box, periodic x/z and sealed free-slip y, inert-air constant-capacity definitions and100kPa initial thermodynamic pressure. Exact continuous **cell-average** density initialized canonical mass; U_i=p0*V_i/(gamma−1), and temperature was derived. The root oracle is independently qualified u3190, source3994179249750d872d478e16f9642019b345104211c91a611e849a53b4b7f9c8. It supplies the epsilon-leading initial reference and is never treated as an exact nonlinear time solution.

## Initial acceleration, amplitude and time are separate results

| Independent initial probe | Relative L2 acceleration error | Relative L2 perturbational-pressure error |
|---|---:|---:|
|4³, epsilon.005 |10.5010% |5.83992% |
|8³, epsilon.02 |2.74445% |2.50231% |
|8³, epsilon.01 |2.67347% |1.93264% |
|8³, epsilon.005 |2.65544% |1.66370% |
|8³, epsilon.001 short-time anchor |2.64965% |1.46141% |

The spatial comparison holds epsilon.005 fixed: refining4³→8³ reduces acceleration error by a factor0.25287. Fine component errors are1.18292% in x/z and3.07803% in y. Normalized acceleration-response differences between epsilon.02→.01 and.01→.005 have ratio2.00052945, consistent with the first nonlinear correction being O(epsilon) after division by epsilon. The remaining approximately2.65% error floor at small epsilon is primarily spatial, not evidence that the continuum linear formula is exact at finite density contrast.

Each initial probe is one exposed Euler stage of duration1/1024s from rest. Its density/U and mass receipts remain exactly unchanged while its finite gravity/projection produces momentum. Analytic momentum-rate comparison uses rho0 times the real dual volume and the leading acceleration, with the corresponding finite-epsilon limitation. The checked pressure is phi/dt at **initial** force time0; analytic hydrostatic background and the pressure gauge are removed before comparing the much smaller buoyant perturbation. This is not an instantaneous pressure measurement at a later moving endpoint.

These exposed Euler probes are not claimed as accepted SSPRK evolution or as mechanical energy conservation. An Euler kick from zero velocity leaves the first-order mass position update unchanged while adding O(dt²) kinetic energy; that local stage effect is expected and its operation receipts are retained. The uniform-density control remains effectively stationary: the gravity/pressure balance leaves velocity below the1e−9m/s bound and K approximately1.49e−26J.

For epsilon.001,8 accepted SSPRK steps per interval gave:

| Interval | Relative drift of u(T)/T from the discrete initial acceleration | Relative error against continuum leading acceleration | Max final velocity |
|---|---:|---:|---:|
|.25s |7.97137e−5 |2.65401% |.00134059m/s |
|.125s |1.99294e−5 |2.65074% |.000670324m/s |
|.0625s |4.98247e−6 |2.64992% |.000335165m/s |

The normalized evolution approaches its discrete initial acceleration by roughly a factor4 as the observation time halves, while its continuum mesh/amplitude floor remains visible. Because both observation horizon and dt change here, this is a **short-time consistency result**, not a separate claim of second-order temporal accuracy at fixed physical time. The previous manufactured-flow packet owns that narrower fixed-time temporal evidence. Physical mass changes in these tiny-amplitude/short-time runs are correspondingly small, approximately4.20e−8 down to2.63e−9 in normalized L1.

## Finite3-D circulation and the mechanical limitation

At epsilon.1 and1s, the fine8³/dt1/32 case gave:

- Mean upward velocity in initially lighter columns+.178533m/s; mean in initially heavier columns−.178533m/s. Correlation uses the **initial** lightness field, so it is not selected afterward to match the answer.
- x/y/z velocity RMS[.0972884,.2195001,.0972884]m/s; maximum velocity.501479m/s. This is three-component circulation, not a vertical-only kick.
- Normalized L1 change in the physical cell mass field.00620796, or0.620796%. This is a field redistribution measure, not the fraction of uniquely tracked air parcels traveled.
- K gain+1.22350885J and gravity PE change−1.29323394J. No heat was admitted and no energy adjustment was applied to U.

The mechanical residual is−.0697250931J, or**5.39153%** of the larger of K gain/PE release. It passed the predeclared30% first quality bound. That bound is deliberately a first-method screen, **not final physical acceptance or an exact-conservation claim**.

| Finite case at1s | K gain | PE change | Relative mechanical residual |
|---|---:|---:|---:|
|4³,dt1/32 |.731942J |−.761267J |3.85210% |
|8³,dt1/16 |1.223557J |−1.293561J |5.41173% |
|8³,dt1/32 |1.223509J |−1.293234J |5.39153% |

The mechanical residual **did not improve with spatial refinement** over this pair. Finer cells also resolve a stronger initial density variation and larger motion from the same continuous cell-average input, so comparing one residual ratio is not an independent continuum-error estimate. The result still cannot establish convergent mechanical accuracy. Halving fine-grid dt changes the ratio only slightly and gives a final-velocity RMS difference1.45336e−5m/s; that points to a significant spatial/transport contribution but does not identify it by itself. Donor mass/momentum transport remains a likely numerical-dissipation contributor, and no reconstruction or energy fix was silently added. This is the clearest remaining quality issue in this packet.

The fine kinetic operation receipts were−.0908141J advection,+61.6780084J provisional gravity forcing,−7.54469024J wall constraint,−52.7803147J pressure correction and−.0386805J RK averaging. Large provisional gravity/pressure/wall terms cancel. They are split-operation bookkeeping, not independent physical sources of heating or physical wall work. Their algebraic reconstruction of deltaK passed separately from the genuine K+PE quality check.

## Conservation, restart, approximation and actual cost

Canonical compensated mass and U residuals were zero in all reported cases; independent naive total-U sums differed by up to9.31e−9J. Those distinct floating reductions are reported honestly. Paired primal mass/enthalpy and dual momentum receipts reconstruct local final stocks, including wall half-volume reactions; PE reconstructs from the same physical mass transfers. Local energy reconstruction errors were at most3.20e−10J. No duplicated mass reservoir, saved derived density or final EOS/temperature reset was involved.

The largest observed accepted-stage integrated divergence residual was6.77e−13m³/s and largest observed local EOS relative deviation8.40e−13, both inside the declared method limits. Fine finite motion had maximum stage Mach.00143277; the coarser fine-grid timestep reached.00146759. Fine final temperatures were279.379–323.603K, inside the retained200–600K definition. Pressure impulse-rate range/background ratios stayed near0.00022, below.001. These are small-domain low-Mach approximation checks, not a validated atmospheric model or room ventilation result.

A real moving field was saved to `moving-restart.json` at.5s. Fresh-model continuation to1s exactly matched the uninterrupted M/U/P, time and impulse histories. Changed gravity/domain and invalid work admission rejected, leaving the caller's saved state unchanged. Source inventories matched before/after. Each returned case's raw initial/state/receipt packet is retained in `case-*.json`; `initial-*.json` and `moving-*.json` include computed measures. This output ordering preserves a first failed case if future explicitly authorized experiments fail; no failure occurred here.

The fine32-step moving case used96 coefficient rebuilds/projections,6,131 PCG iterations/matrix products,94,208 primal-face evaluations,294,912 dual-interface evaluations and133,632 thermodynamic cell reads. Its pressure workspace reported68,096bytes, excluding derived topology, finite stocks, copied receipts, retained proof arrays and JS runtime overhead. The full box has512 physical cells,1,472 active faces,1,600 component dual nodes and4,608 dual interfaces. Wall half-volumes are component partitions, not extra physical air.

Whole-group wall times were1.266s initial probes,2.240s short-time evolution,3.568s finite movement and4.746s moving file continuation/rejection. These contain file output and independent checks and are not isolated solver benchmarks. `FALLOW-FIRST-SHAPE.md` retains syntax u3204 and actual declared-caller Fallow u3205: three estimated-no-coverage advisories, no cognitive-threshold finding, and no dead/cycle/clone findings in the one owned caller. The numerical dependency's previous advisories remain unchanged outside that scope.

## Boundary of the conclusion

Moving3-D variable-density buoyancy through the finite owner is now evidenced in this small sealed/free-slip periodic box, alongside an independently qualified initial limit and exact persistence/receipt checks. A nonlinear moving bubble has no exact all-time oracle here. Mechanical accuracy needs further work. Obstacles, no-slip walls, finite openings/reservoirs, ventilation, viscosity, diffusion, species, changing sources, water displacement, excavation/remapping, oxygen and combustion remain unqualified. No prior numerical/world/viewer source, tracked game file, dependency, port, backend or deployed page changed. Parent owns the next physical decision.
