# Checked sources and evidence scope

2026-09-08. Source review only; no new simulation, symbolic-computation run or
compiler invocation. The identities in DECISION.md were derived directly from
the retained finite-momentum caller and signed face conventions. They are not
reported as a theorem copied from a different discretization.

1. [Nalu: Low Mach Number Derivation](https://nalu.readthedocs.io/en/latest/source/theory/lowMachNumberDerivation.html).
   Read the equations and asymptotic expansion, especially the scaled energy
   equation and resulting enthalpy/pressure split. Supports the declared
   reduced-energy approximation. It does not analyze our donor-gravity
   discretization or justify changing its energy by a residual.

2. [Latché and Saleh: A Convergent Staggered Scheme for Variable Density
   Incompressible Navier–Stokes](https://arxiv.org/html/1603.07221v3).
   Read the stated model and sections4.1–4.2, including primal/dual flux
   conditions. Supports sharing actual mass transfers with the kinetic
   momentum balance. The stated model excludes gravity; its implicit-time
   result is not a proof for the present SSPRK2/gravity implementation.

3. [Springel: E pur si muove: Galilean-invariant cosmological hydrodynamical
   simulations on a moving mesh](https://arxiv.org/pdf/0901.4107).
   Read sections5.2–5.4, especially the static external-potential conservation
   equation89 and mass-exchange work discussion. The paper distinguishes
   self-gravity from a prescribed potential and warns about thermal errors.
   Our outward-face source formula is independently signed and derived for a
   fixed grid/external potential; it does not use the self-gravity factor1/2.

4. [Taylor et al.: An Energy Consistent Discretization of the Nonhydrostatic
   Equations in Primitive Variables](https://arxiv.org/html/1908.04430).
   Read the energy exchanges and remapping caveats. Supports checking
   kinetic/internal/potential exchanges term by term rather than assuming a
   monotone remap conserves energy. The vertical-coordinate discretization is
   different; its special averages have not been copied into our MAC owner.

Checked local sources: finite-momentum-v1/{finite-gas,momentum,projection,
geometry-owner}.mjs; finite-energy-diagnostic-v1/{RESULTS.md,qualification-v1.json};
buoyancy-energy-review-v1/{AUDIT,DISCRIMINATOR}.md; root's
coupling-review-v1/DECISION.md. The source inventory records exact bytes.

The1-second diagnostic's signed integrals are previous measured evidence.
The central-SSPRK2 instability, face work identity, cell kinetic allocation and
proposed discrete hydrostatic recurrence are new algebraic findings, not new
measured outcomes. The conservative energy/all-Mach direction is a recommendation
accepted for further source fit, not an implemented pressure-energy method.

Next source-fit is the actual retained official Basilisk archive. Its GPL,
canonical representation, pressure/energy events, gravity-work gap, admissibility
and restart boundary must be read at the native caller before any compile/run.
