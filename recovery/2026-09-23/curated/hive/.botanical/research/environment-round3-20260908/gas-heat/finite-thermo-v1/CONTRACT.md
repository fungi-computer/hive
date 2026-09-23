# Finite inert-gas thermodynamics: first source shape

2026-09-08. Isolated ignored research, not a spatial gas join, excavation rule,
production module or a measured result. All prior gas/voxel sources remain frozen.

## One quantity owner

`thermodynamics.mjs` owns species masses (kg), volume (m³), and **internal energy**
(J). A model is built from versioned constant-volume heat capacities, molar masses,
and explicit temperature envelopes. Another supported inert gas is data. No
species-name branch changes the equations. The full canonical definition content,
universal gas constant, energy convention and owner version bind every saved state.

All species present in a chamber have positive mass; absence represents zero.
The chamber itself is nonempty. Vacuum, condensed phases, chemical formation
energies, dissociation and reactions are not admitted. The example air and helium
are calorically perfect **study definitions**, with a declared 200–600 K envelope;
that envelope is a model restriction, not a real-gas error qualification.

For fixed composition, with species masses `m_i`, molar masses `M_i`, and capacities
`cv_i`, the model uses

```
M = sum(m_i)                      n = sum(m_i / M_i)
C_v = sum(m_i * cv_i)             T = U / C_v
p = n R_u T / V                  rho = M / V
R_mix = n R_u / M                cv_mix = C_v / M
cp_mix = cv_mix + R_mix           gamma = 1 + n R_u / C_v
H = U + p V
```

`U=0` at `T=0` is the chosen algebraic energy convention, not permission to run the
model at absolute zero. `H` is derived and never a second saved energy. The current
Boussinesq anomaly is neither this `U` nor this finite gas inventory. No old-state
conversion occurs here. Thermodynamic `p` is not the projection solver's pressure
correction or gauge.

## Explicit operations and receipts

- Constant-volume heat changes `U` by requested signed `Q`. A receipt records the
  joules entering the gas and floating first-law residual; rejected heat leaves
  its input untouched. There is no heat bath whose finite stock is silently spent.
- Isolated free expansion into an initially empty volume retains every mass and
  `U`, hence `T`. Boundary work and heat are both zero; pressure falls inversely
  with volume. This is a final uniform-equilibrium operation, not its transient.
  Compression cannot call this operation.
- A reversible adiabatic piston retains composition, uses `p V^gamma = constant`,
  and exchanges work with an explicit external-work receipt: work **by gas** is
  `U_before - U_after`; heat is zero. Expansion cools and compression heats. No
  piston mechanics, momentum or trajectory is simulated.

Every operation constructs and validates a new frozen state and frozen receipt;
there is no mutation, simulation clock, scheduler, event store or hidden energy
reservoir. The caller commits by retaining the returned state. Discarding a
candidate is cancellation **before commit**. Applying heat twice intentionally
heats twice; durable retry/idempotency belongs to the existing eventual command
owner, not to this numeric primitive. A later inverse heat is a new physical
exchange, not deletion of the first receipt. An irreversible free expansion does
not have a free-compression inverse. Reversible piston out/back should restore
the initial thermodynamic state to floating precision.

Heat additions commute when every intermediate state is admissible; heat and
piston work generally do not. A sequence that leaves the supported temperature
envelope rejects at that step, even if a later operation could have brought it
back. No clamping discards energy or hides an unsupported state.

## Reserved next exchange contract — not implemented

A material stream into or out of a control volume carries **source enthalpy**,
including pressure flow work, rather than an arbitrary fraction of stored `U`.
For the selected inert convention `h_i(T_source) = cp_i * T_source`. A finite donor
and finite receiver must be preflighted and committed together, retaining each
species and the declared total energy/work balance. A prescribed exterior is a
different approximation and needs external mass/enthalpy receipts.

The source temperature changes as a finite reservoir discharges, so using one
initial enthalpy for a large finite transfer is not automatically the exact
process. Direction/rate, pressure relation, volume constraints, mixing, reversible
versus dissipative effects and any unresolved kinetic energy need an explicit
physical choice before this is implemented. No finite reservoir exchange,
pressure equilibration, topology remap, solid displacement or air initialization
is being added in this first checkpoint.

## First qualification planned after source review

One guarded Node invocation, under 10 s, with actual file JSON roundtrip. Independent
analytic checks cover a one-mole gas, a two-species mole mixture, `cp-cv=R_mix`,
heat, free expansion, piston work and its independent integral, reversible return,
operation ordering, frozen input/result and rejected operations/codec, full
definition mismatch including same-version altered constants, and finite derived
quantities/envelope admission. Source pins and actual errors/work/time are recorded;
this tiny algebraic test is not a throughput benchmark.

Physical basis: [NASA specific-heat and first-law relationships](https://www1.grc.nasa.gov/beginners-guide-to-aeronautics/specific-heat-cp-cv/)
and [NASA calorically perfect isentropic derivation](https://www.grc.nasa.gov/www/k-12/rocket/isndrv.html).
The separate frozen [topology decision](../TOPOLOGY-MODEL-DECISION.md) owns why these
operations cannot yet be presented as digging physics.
