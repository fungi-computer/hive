# Native gas source-fit handoff

Actual archive/header/native caller read completed; source-only. No compile,
numerical run, archive/qcc edit or production source change. No new performance
or physical result is claimed. Root's four header and archive pins matched.

Chosen first reference: retained `test/shockwave.c`, pure ideal gas phase1,
two-phase+Mie-Gruneisen, documented multigrid1D path. Its conservative variables
and independent shock/jump reference are useful. It is open/inflow and strong
shock, so the existing output is not a sealed energy, low-Mach or temperature-
envelope proof. A bounded future caller must expose energy/positivity and
pressure/EOS observations before any broader adaptation.

Material findings in SOURCE-FIT.md:

- Native canonical momentum is cell-centered; projected uf has its own
  numerical lifetime. This is a representation change from the research MAC.
- One VOF owner transports phase M/P/E; one all-Mach pressure solve and shared
  end-step pressure-work flux update total energy. No gravity-energy work is
  included, and actual transport flux arrays are private to each VOF sweep.
- Pressure coefficient uses retained p; its end-step EOS agreement is a
  measured split-method concern. rhoc2 and ps are reused as scratch.
- Nonconvergence/CFL only warn; no atomic rejected advance. Snapshots exclude
  uf, omit model/EOS globals and mutate before full validation. Exact restart
  needs a specified numerical-state boundary and actual proof.
- Thermal NASG assumes gas phase2 for thermal expansion; phase1 gas is not an
  equivalent thermal caller. General NASG sound speed omits some coefficients.
- GPL, common-Delta geometry, finite phase disappearance, native event clock,
  failed steps and water/interface work remain explicit adoption boundaries.

The next action is root's source/caller choice. This handoff authorizes no
compile, kernel correction, centered comparator, new thermal case or room run.
