# Scheduled expert pass: water, atmosphere and heat

Levi's latest direct correction, 2026-09-08: use **Astra on Ultra forks of Game CTO now** to tackle the difficult design. This supersedes the earlier scheduling-only interpretation. Three explicit `gpt-6-astra` / `ultra` conversation forks are active: `astra_water_dynamics`, `astra_gas_heat`, and `astra_environment_scale`. Each acknowledged its exact ignored-file custody and first numerical decision. Root personally owns their combined design and cross-review. This expert work does not interrupt the current material migration or add a solver to brewing.

Use the existing environmental-fields/openings, living-world system contracts and architecture-proof sprint. They already specify candidate finite-volume experiments and distinguish source-backed inspiration from unproven Hive solver choices. Associate this pass with existing #10 water/ecology, #6 performance, #4 terrain boundaries and #14 horticulture/brewing; no new planning framework or speculative issue per subsystem.

## Ownership and useful parallel questions

Astra owns the combined design, numerical-method choice, difficult tradeoffs and personal visual review. The current expert forks are bounded research/numerical experiments under the visible Game CTO, not new production PMs or writers. At the later runtime start, Delivery appoints one accountable visible Terra/Sol environment owner, with one writer for the coupled transport/state seam. Expert work reads the same retained contract and actual source; forks do not independently invent overlapping runtime authorities.

- **Water reviewer:** compare bounded surface transport, pooling/drainage and terrain openings; identify the smallest later soil/aquifer coupling needed for diversion to affect a garden. Trace every source, sink, overflow and stored amount. Generation-time water is distinct from editable persistent water.
- **Atmosphere reviewer:** define the first smoke/vent representation and its limits, then what true multigas/pressure exchange would require. A dilute-smoke experiment must not be advertised as complete oxygen/pressure/combustion simulation. Include vertical openings, sealed boundaries, room splitting and reopening.
- **Thermal reviewer:** make transported energy, conduction through solids, external heating and any later phase changes explicit. A sealed heat exchanger transfers energy without mixing the two material streams. Plants and actors consume the same authoritative conditions.
- **Independent correctness/performance reviewer:** challenge conservation, positivity, capacity, equilibrium, update-order bias, substep stability, topology edits, save/reload and cross-region ownership; measure active/idle work, edge count, scratch/resident memory and frame/tick costs separately.

These are bounded review responsibilities, not four permanent departments or four concurrent writers. Start implementations only after a common reviewed representation and first outcome exist; use smaller workers for contained execution and stronger reviewers for mathematical/state-boundary decisions.

## Shared foundations, explicit differences

Reuse world geometry/openings, authoritative fixed time, accounted quantities, deterministic proposal/limit/commit, dirty-region invalidation and save ownership. Domain-specific laws for water, gas transport and heat remain explicit; the goal is not to pretend all three are the same diffusion operation.

Every edge transfer debits its source and credits its destination once. Multiple outgoing edges cannot each spend the same water/gas/energy. Derived pressure, temperature or concentration cannot become a competing mutation authority. An edited wall, vent or buried pipe changes the appropriate connectivity; a camera cutaway does not. A chunk boundary cannot create a dam, erase smoke or duplicate a deferred transfer. Coarse sleeping regions need stated conversion/error bounds and a reason to wake.

First independent proof outcomes remain small and visible:

1. Divert a finite stream into a pond; fill, stop supply, drain and reload without resetting its water. Close the accounted balance before adding a groundwater/garden response.
2. In a two-level room, an explicit smoke/heat source plus a vertical opening and controllable vent changes measured local exposure. Shut/reopen the vent; pause/save/reload; preserve quantities and explain the change. Then let one greenhouse read the same conditions.

Before implementation, experts must settle units, cell/compartment resolution, boundary conditions, substeps, approximation limits and topology conversion. Benchmarks must compare the selected meaningful behavior, not idle empty grids. Neither toy pass proves Minecraft-scale fluids, ONI parity, multiplayer/offline behavior or a whole ecology.

The current tiny-map sequence remains unified wood/herb transport → mixed storage with withdrawal → first brewing → feedback-led first water/ecology consumer. The Astra/Ultra expert work has started now; runtime follows a concrete ready consumer. Owned outputs are `environment-expert-pass-20260908/water.md` and `water/`, `gas-heat.md` and `gas-heat/`, and `scale-consistency.md` and `scale/`. Root reconciles recommendations before Delivery receives any runtime brief. No fluid library, backend, resource purchase or production deployment is selected by launching the experts.
