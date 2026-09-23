# Proposed smallest next discrimination

**Proposal only; no instrumentation or solver run has been performed.** Root retains method/source/run approval. The existing finite buoyancy evidence and numerical owner remain frozen.

Run only the already qualified fine moving case:8³ physical cells,4×2.16×4m, metric[.5,.27,.5], periodic x/z and sealed free-slip y, inert-air density from the same epsilon.1 oracle,100kPa,zero velocity,gravity[0,−9.81,0],zero heat. Exactly1s with dt1/32 and32 accepted SSPRK steps. Do not add a stable-gradient fixture, change the density pattern, replace gravity, relax the30% screen or run the whole previous matrix. The algebraic stable-circulation counterexample in AUDIT already establishes that a gain is possible; this single existing case answers how its recorded net loss is composed.

## Instrument actual owners, without new numerical rules

Use an explicitly isolated instrumentation copy of the accepted numerical owner only after root reviews its small source diff. Two immediate seams need scalar diagnostics: `transportMomentum`/`projectMomentum` in momentum, and actual accepted-stage weighting in finite-gas. Keep the existing geometry, pressure solve, physical version/identity, arithmetic/reduction order, canonical state, limits and receipts unchanged. No alternate integrator, replay assembled from public Euler calls, second simulation clock, callback protocol or output-residual-as-heat owner.

The useful scalar values are already available at those seams:

1. After dual transport, before body/wall modification: Ddonor and Eforward from actual transferred masses, old velocities, net increments and new dual masses. Independently compare `deltaK_advection` with `-Ddonor+Eforward`; check non-increase under the actual accepted donor CFL.
2. Before/after body impulse: old-velocity gravity work and the finite gravity time remainder. Compute its explicit cross/kick expression and independently compare their sum with the old `bodyKChangeJ`. Do not call either term heating.
3. In the same Euler receipt: Gstage from old gravity work plus the actual mass-derived deltaPE, and separately from `dt*g*V/2*sum(abs(v)*(rho_lower-rho_upper))`. This is the missing correlated quantity, not the product of whole-run summed impulse and final velocity.
4. At each stage projection: `sum(phi*target)`, residual/gradient work, the negative correction norm `-sum(deltaP²/(2*M))`, and the actual pressure deltaK. Use copied current-stage arrays before shared scratch is reused. The zero-target identity must close including the pressure pin.
5. At accepted SSPRK averaging: the mass-weighted Jensen expression from old and second-Euler states, compared with the existing RK kinetic-change receipt. Keep final projection separate. Accumulate only accepted first/second-stage diagnostics with weights1/2, then final correction with weight1; exclude abandoned trial work from the physical integral and count it separately if any.

The diagnostics can be scalar receipts computed from existing variables. They must not change physical stock arrays or determine an admission/force. Avoid dumping an entire parallel copy of the evolving world merely to report a handful of correlated integrals. The exact bookkeeping equations and units are in AUDIT.

## Fixed observable exit

- Complete canonical final state must exactly equal saved `../finite-buoyancy-v1/moving-8-32.json` including M/U/P,time,steps,identity and impulse histories. All pre-existing scalar/array receipts and work counters must also remain equal; compare only the newly added diagnostic fields separately. Freeze the prior inventories before/after. A changed physical result is an instrumentation/source failure and stops the packet.
- Per accepted stage/step, verify the algebraic identities with absolute1e−10J plus relative1e−10 of the sum of term magnitudes; report the largest actual residual and scope rather than declaring bit-exact energy arithmetic. Reuse the existing physical constraint/EOS/CFL bounds without relaxing them. The pressure dot-product residual must agree with its measured all-cell constraint/gradient roundoff, not merely a zeroed gauge row.
- Return the weighted integrals Ddonor,Gstage,Tsplit and their reconstructed `delta(K+PE)`, with gravity/PE gap sign and donor dissipation stated separately. Reconcile with the unchanged−.0697250931J net loss and existing operation totals. This directly answers whether signed PE mixing partially hides donor dissipation and how much finite-step splitting contributes in this case.
- Retain every admitted step's compact scalar decomposition and failing active step before any assertion can discard it. No dynamic source change, new boundary geometry, arbitrary heat term or corrected-force experiment occurs in this diagnostic packet.
- One guarded invocation, maximum512cells/32 accepted steps/30s whole wall, expected only a few seconds of existing solves plus diagnostics. Record actual pressure iterations, work, CPU/wall and whole-process final RSS. If a bound or physical/algebraic law fails, preserve and stop; no automatic repeat.

After this exit root can choose a source method that addresses gravity/PE compatibility, reduced donor mixing and physical energy ownership, or explicitly retain the limitation while pursuing the separately required connected voxel-room geometry. The diagnostic does not itself solve either requirement.
