# Proposed method qualification: radial fronts and0.54 m terrain steps

2026-09-08. Proposed next bounded numerical work, **not executed** by the
ownership checkpoint. Root owns the common production unit/geometry decision.
The earlier0.1 m terraced results are preserved unchanged; no scale conversion
turns those runs into0.54 m evidence.

## Why this can change the solver decision

The hydrostatic reconstruction clips a reconstructed side to zero when the bed
jump exceeds its local depth. The published analysis documents resulting depth
and velocity errors for certain slopes/resolutions/depths. Its original
well-balanced construction preserves lake rest but reconstructs hydrostatic
rather than moving Bernoulli equilibrium. Sources re-read for this proposal:
[Delestre et al., sections2.2–3](https://arxiv.org/pdf/1206.4986) and
[Audusse et al., equations2.8–2.16](https://www.math.univ-paris13.fr/~audusse/articles/hydro.pdf).

**Inference for Hive:** on a smooth slope, refinement reduces the per-face bed
jump. On an actual0.54 m voxel ledge, refinement of horizontal spacing leaves
that physical jump unchanged. We must not assume finer horizontal cells remove
the threshold limitation, or round the terrain into ramps to obtain a passing
test. This could require a different moving-water face law or an explicit
transition outside the hydrostatic shallow-water approximation.

## First small declared packet

1. **Analytic radial cell averages and fronts.** Flat32×32 m square, finite
   circular reservoir radius6 m centered at(16,16), initial depth0.27 m, dry
   exterior, no friction or external source; observe2 s before wall interaction.
   Compare1 m and0.5 m horizontal cells with maximum intervals0.02/0.01 s.
   Compute circle–cell intersection areas from a deterministic analytic integral,
   separately checking total area againstπr²; do not change the represented
   circle with a cell-center occupancy test. Record1 mm,1 cm and5 cm fronts,
   axis/diagonal/all-angle radii and the historical cell-center measure.
   Interpolate the declared depth contour; report missing/multiple crossings
   rather than selecting the best-looking radius. Original1 cm bias criterion
   remains<10% and improves under refinement; a failed criterion remains failed
   even if another threshold passes. Also compare quarter-turn mapped complete
   fields and exact restart. Proposed physical case and observation schedule are
   separate from the earlier64 m/25 s radial study.

2. **Actual voxel-step lake controls.** Bed0 below x=16 and0.54 m above x=16,
   same32 m square and1/0.5 m grids. Rest free surfaces0.81 m (submerged step)
   and0.27 m (upper terrace dry), no sources/friction; observe2 s. Require
   depth and momentum drift<=1e-11, nonnegative water and the existing relative
   conservation tolerance. Every refined cell must retain the same physical
   side/bed; the0.54 m jump is never subdivided into smaller vertical steps.
   These controls test hydrostatic balance; they do not validate moving ledge
   or waterfall flow.

3. **Moving-step limitation probe before a longer demonstration.** Evaluate the
   existing face reconstruction at0.54 m bed jumps with water shallower than,
   equal to and deeper than the step, including moving supercritical states.
   Report the reconstructed depths, complete mass/momentum flux and clipping
   fraction. An independently computed positive-depth Bernoulli steady pair is
   useful as a *mathematical moving-equilibrium diagnostic*, not as proof that an
   exposed vertical waterfall conserves mechanical energy. First solve/check
   both specific-energy and constant-discharge residuals before comparing the
   numerical flux; disclose the chosen bottom-jump path assumption. If the
   current method blocks or reverses that steady discharge, report the method
   failure and stop the plan to port it unchanged. Mere dense/optimized agreement
   is insufficient. A later validated moving-submerged-step reference is needed
   before accepting arbitrary voxel ledges for gameplay.

Conservation, positivity and retained momentum remain required throughout.
Neither front averaging nor reporting thresholds may discard films. The ordinary
owner selects the CFL interval internally; the external authorized schedule clips
only at its declared observation/edit boundaries. Compare timestep and spatial
error separately. Exact optimized-versus-dense comparison verifies the code path,
while analytic rest/radial geometry and the independently checked moving state
address different numerical questions.

## Budget and decision

Start with the analytic geometry/one-face probe (milliseconds to seconds), then
the small radial/rest packet. Each guarded invocation targets<60 s wall time;
report actual duration, iterations/cells and source pin. No timing sweep,
parameter search, browser or larger domain is included. Coordinate with root
before an expensive refinement or a separate method implementation.

If the fronts/rest pass but moving0.54 m steps fail, preserve both outcomes. The
next decision is a targeted method/geometry comparison, not a language port of
known incorrect moving-water behavior. Stacked water, pressure pipes, soil water,
waterfall trajectories, gas displacement and thermal closure remain separate
unresolved consumers even after this packet passes.
