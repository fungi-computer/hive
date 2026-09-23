# Next surface-water method comparison

2026-09-08. Bounded Astra source review; no numerical run or production change. This proposes a next experiment, not a selected production solver or a new discovery.

## Decision and source reason

Lead with the existing **full shallow-water equations (SWE)** candidate; retain corrected LI `theta:1` as the cheaper comparison. Do not restore fixed-theta smoothing or invent a cell-by-cell hybrid. `solver.mjs:101-103` makes LI damping depend on the number of time steps; `study.md:29-33` records its timestep failure and the corrected variant's remaining front-orientation failure. More fundamentally, LI omits advective momentum, while SWE computes it at `solver.mjs:115-124`. The prior fixture already contains fronts outside LI's low-Froude approximation (`study.md:49`). SWE cost was only 6.89 versus 5.16 seconds in the bounded study (`study.md:55`), not evidence that its extra physics is unaffordable.

That is a defensible model preference for testing, not acceptance. First-order Rusanov is diffusive and hydrostatic reconstruction can behave poorly for some bed-step/depth/grid combinations. The next qualification must expose that interaction instead of smoothing the game's voxel terrain to conceal it. Primary sources: [Audusse et al.](https://www.math.univ-paris13.fr/~audusse/articles/hydro.pdf), [Delestre et al.](https://arxiv.org/abs/1206.4986).

## Smallest comparison that changes a gameplay decision

Use one finite source, a stepped channel, an operable diversion, a pond, and downstream capped demand. Freeze the intended voxel height separately from the numerical horizontal cell size; refinement subdivides the same physical terraces and never changes their elevations. Include submerged steps and wetting across a dry terrace. A free fall over an exposed vertical ledge is an explicitly unsupported geometry case, not a passing shallow-water fixture.

Reuse closed/open and dig/no-dig controls. Retain the original 600-second failure; the separately declared 1200-second fixture can test eventual shortage. Compare LI theta=1 and SWE with timestep ceilings .05/.025 seconds and horizontal refinement 2/1 metres. Preserve finite source accounting and report pond inventory, downstream delivery and arrival time, not just attractive water motion.

Separate numerical dry handling from observation. The source uses approximately 1e-12 m denominators, but reports fronts/Froude above 1 cm (`solver.mjs:100,116,175`; `API.md:22`). Observe fronts at 1 mm, 1 cm and 5 cm; use interpolated contours and a subcell-area-defined radial initial condition. Record the original cell-centre metric alongside them. Require the predeclared 1 cm bias to remain below 10% and improve under refinement; report all thresholds without selecting the nicest one. If only a different measurement passes, the old criterion remains failed.

## Performance improvement with a checkable boundary

First remove avoidable full-domain allocation and traversal, not physics. `solver.mjs:91-93,128,131,141,155` allocate scratch/next arrays or validate a complete face permutation every step. A reusable workspace and compact canonical active-face list can replace these in an isolated optimized candidate, with the current dense solver retained as oracle.

Initially skip **exactly dry, zero-history regions only**. Every wet cell, boundary face, forced/edited cell and required stencil halo stays active, even a nearly still pond. Include pressure terms: zero mass flux alone does not permit skipping a wet face (`solver.mjs:105-124`). Wake adjacent dry cells before the next accepted step, maintain canonical reduction order, and retain one common CFL-controlled interval. No asynchronous tile clocks or approximate wet-region sleeping in this comparison. Thin films remain physical stock; measure their active-work cost rather than deleting them below a display threshold.

## Falsifiable exit and honest budgets

Keep existing conservation, nonnegative depth, lake-rest, dry dam-break, refinement and mapped-rotation criteria. Dense versus active must match complete quantities, canonical history, receipts and restart continuation within the predeclared numerical tolerance; same implementation/restart remains exact. LI discharge `q` is canonical; SWE momenta `mx/my` are canonical and SWE's last-flux `q` is only a report (`API.md:16`). A save cannot discard whichever state affects the next step.

Report resident bytes, workspace bytes, allocations, active cells/faces, face evaluations per simulated second, rejected intervals and wall-clock p50/p95 separately. Compare sparse (10% wet) and fully wet equal-sized domains against the same dense method. Proposed optimization target: at least halve face work in the sparse case, no more than 10% wall-clock regression when fully wet, and zero size-proportional allocation per substep. These are proposed experiment targets, not measurements or a shipping device budget. Set the final browser budget against measured game headroom before integration.

This field is still depth over one bed. Stacked surfaces, caverns, waterfalls, pressure pipes and water-air displacement require explicit geometry and coupling. Active work does not supply those missing laws. No planetary, population or offscreen-simulation capacity follows from this comparison.
