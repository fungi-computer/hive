# Porous water: next physical boundary, before a solver

2026-09-08. Root planning/source read only. No soil integration, new runtime or numerical pass is claimed. The surface-water author retains the independent Bender boundary comparison; gas authors retain their shared-projection cleanup. This directory does not alter either source.

## What the existing study really established

Read environment-round2-20260908/water/groundwater.mjs and its actual caller. It constructs two different vertical distributions with equal porous water totals and opposite surface Darcy tendencies. It explicitly does not integrate Richards flow. A bulk moisture bucket, cumulative infiltration total or biome label therefore cannot own this physical distribution.

That old counterexample's positive-pressure branch adds Ss*h to reference-density storage. It already distinguishes that extra stock from geometric pore volume. Before a real soil/gas join, we must decide what compression/deformation that term models; thetaS+Ss*h cannot be substituted into a voxel occupancy formula and allowed to exceed the pores. Saturated pressure, water mass, actual liquid-filled pore fraction and pore-air volume are related facts with different units.

## Checked primary sources

The USDA ARS Rosetta page and all three linked equation images were read directly. They distinguish residual/saturated water contents, a retention curve, and a conductivity relation; the empirical conductivity matching point need not equal measured saturated conductivity. Their published units are cm-based and must be converted explicitly. We will use metres/seconds and signed pressure head h<=0 (positive suction=-h) consistently. [USDA hydraulic functions](https://www.ars.usda.gov/pacific-west-area/riverside-ca/agricultural-water-efficiency-and-salinity-research-unit/docs/model/rosetta-hydraulic-functions/).

Celia/Bouloutas/Zarba's publisher abstract was read: conserving water through the mixed-form storage difference does not by itself establish accurate fronts; treatment of the time term also matters. The full paper was not obtained/read here. [Published abstract and source identity](https://agupubs.onlinelibrary.wiley.com/doi/abs/10.1029/WR026i007p01483).

The original van Genuchten1980 PDF was downloaded from USDA and hashed, but this environment's web screenshot surface did not expose a readable image and no local PDF renderer is installed. It is retained as an unread source, not fabricated full-text evidence. Two USGS page requests returned403. The readable Rosetta equation images and prior counterexample provide the actual constitutive anchors used here.

## Proposed first implementation boundary

One finite-volume vertical porous column; fixed bulk cell volumes, interface areas/distances and elevation in metres. Soil definitions own thetaR/thetaS, retention and conductivity parameters, valid head/temperature regime and provenance. No plant-name branches or additional soil-water inventory. The existing surface fluid owns its water separately; a later exchange must settle one shared face transfer, never rerun infiltration independently on both sides.

The mixed-form residual for an incompressible, vented unsaturated subcase is

    R_i = V_i * (theta(h_new_i)-theta(h_old_i))
          - dt * (Q_in_i(h_new)-Q_out_i(h_new)).

Elevation is positive upward, hydraulic head is H=h+z, and an oriented Darcy volume flux is Q=K_face*A*(H_i-H_j)/distance. Every internal face is evaluated once and debits/credits the same quantity. A nonlinear solve must drive these actual storage/flux residuals down, rather than integrate capacity*C*dh and relabel its result conserved water. Pressure head is a derived solver unknown when water content is invertible; saturated incompressibility creates a different pressure constraint and cannot be swept into that inverse.

Before coding, independently decide the smallest saturated/unsaturated state model that can support finite pond infiltration and reversed seepage without invented pore capacity. Alternatives to discriminate are a strict incompressible mixed pressure/saturation constraint versus a explicitly compressible water/porosity model. A head-storage coefficient without its physical storage meaning is not an answer. Fixed pore-air pressure is a declared first-case approximation; blocked gas displacement and non-isothermal evaporation are later coupled cases, not implicit support.

Only after that state decision should the first bounded implementation choose the nonlinear solver. Likely useful checks are no-flow hydrostatic rest, saturated Darcy pressure-diffusion or constraint limits appropriate to the actual state model, the retained opposite-flow case through a real finite interval, finite surface stock/soil conservation through pond exhaustion and reversed seepage, timestep/mesh refinement, and exact aligned save/reload/rejected request laws. Constitutive inversion alone is not completion. Soil coefficients initially demonstrate a stated model; they are not validated garden/biome calibration.

This is a next-outcome contract under the active water/gas/world goal, not a new sprint board or a declaration that soil, aquifers, roots, nutrients, erosion or regional physics is solved. The numerical method/source must be accepted before any game/lab binding. Root owns the physical decision; ordinary presentation and publishing remain Game Delivery's.
