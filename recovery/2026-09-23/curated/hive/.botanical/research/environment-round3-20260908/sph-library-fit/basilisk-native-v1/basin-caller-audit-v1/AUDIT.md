# Source-backed cause: predictor face clamp conflicts with gravity pressure BC

The first failure is explained by an incompatible **caller boundary condition**.
We copied four prescribed uf.n=0 assignments from a maintained reduced-gravity
wave example into this direct-gravity basin. Those assignments clamp the
provisional wall flux before divergence, while the unchanged pressure boundary
still accounts for that wall acceleration. The source-derived equations predict
the observed doubled pressure slope and upward g*dt velocity. This is not
evidence that Basilisk cannot support hydrostatic water.

The failed u3233 bytes and observations remain frozen in ../result-v1 and
../RESULT-HANDOFF.json. This audit performs no numerical invocation. source-v2
contains only a proposed four-line caller deletion and an unchanged observer.

## Actual event and initialization path

The translated caller-build-v1/_basin.c registration block at68131–68243 and
grid/events.h:113–137,164–181 show same-name inheritance: newest handler chains
to the prior one, and every handler executes. No callback was silently replaced.

| Event | Executed chain / relevant effect |
| --- | --- |
| defaults | conserving sets stokes=true; phase defaults bind alpha/rho; VOF and centered defaults set field/refinement defaults and reset multigrid statistics. No solver is invoked here. |
| init | User mask/f/u/p-zero initialization, then native centered uf interpolation, properties and stability. Generated init is at48594–49062; the user constant a becomes one new_const_vector at68071, values(0,-9.81), not an accumulating field. |
| initial_observation | After the complete init chain, so mixture properties already exist. It may refresh native derived ghost caches but never assigns physical p. |
| stability | Conserving keeps the native CFL timestep even though it disables ordinary centered advection; VOF limits CFL; base dtnext chooses the actual step. |
| vof | Timer, conserving phase-momentum advection, default VOF suppressed by interfaces=NULL, base placeholder. Actual iteration parity reaches vof_advection. |
| tracer_advection | Timer, restore interfaces, optional phase filtering (off), base placeholder. |
| properties | Native mixture properties, base placeholder. |
| advection/viscosity | The alternative centered advection is off under conserving. Zero viscosity skips its force/solve path. Constant a is not cleared by the variable-acceleration cleanup. |
| acceleration | One native uf*=fm*(face_value(u)+dt*a), generated acceleration at50459 onward. |
| projection | Timer then exactly one native project, centered_gradient and correction(dt), generated53454–53467. |
| end_timestep | Observer then empty native placeholder. The physical rejection stops before the outer run counter advances. |

The normal stop event is before the last-step handlers; it is not reached in the
failed first step. There is no duplicate pressure projection or duplicate gravity
event in this caller.

## Exact boundary conflict

1. `grid/cartesian-common.h:702–711` initializes **normal face-vector boundary
   callbacks to NULL**. The centered velocity has its own normal antisymmetry/no-
   penetration rule. A missing provisional-face callback is not an open wall.
2. Our caller lines9–12 installed four uf normal callbacks returning zero.
   Translated assignments are at68178; generated boundary4–7 are zero-return
   functions. This overrides the normal NULL behavior at root and masked walls.
3. `centered.h:388–392` adds gravity to provisional uf on all faces. It expects
   its pressure Neumann rule (`centered.h:80–103`) to cancel the normal wall
   acceleration during projection.
4. `poisson.h:493–498` reads uf to construct div(uf*)/dt. Translated code at
   36297–36325 first performs check_stencil and boundary_stencil. For a dirty
   face field with prescribed normal BC, `grid/stencils.h:117–137` requests full
   BC treatment; `grid/stencils.h:260–295` and cartesian-common.h:539–589 route
   it to boundary_level. `grid/tree.h:1326–1338` then writes the boundary face
   from the prescribed callback. Its value becomes zero *before* RHS assembly.
5. Pressure still has its original nonzero gravity Neumann flux. The Poisson
   solve therefore balances an extra boundary divergence as well as the original
   wall acceleration. The resulting residual can be small for the wrong problem.

The pressure/metric values expected from the actual source are not free fitting
parameters. Full-cell masks have constant cm=fm=1. Native properties uses
alpha=1/rho((fL+fR)/2). Ordinary scalar f symmetry gives bottom alpha=.001,
top alpha=1/1.2, and interface alpha=1/500.6. Centered rho is1000 or1.2.
The non-embedded pressure BC uses a/fm/alpha directly, not a second rho factor.
At top it gives p_ghost=p_cell−9.81*1.2*Delta; at bottom
p_ghost=p_cell+9.81*1000*Delta. Side acceleration is zero. These fine-face values
are source deductions; the frozen v1 rows did not individually log them.

## The observed failure follows from the discrete equations

Let g=9.81>0, a_y=−g, and F=alpha*dp/dy. Initially u=0. Before the clamp,
uf*=−g*dt everywhere. Our explicit BC changes only wall uf to zero. Consequently
the first bottom-cell Poisson RHS is −g/Delta and the top-cell RHS is +g/Delta.
Meanwhile the retained Neumann pressure BC sets F_wall=−g at both walls.

At the bottom, `(F_inside−(−g))/Delta=−g/Delta`, hence F_inside=−2g. Interior
RHS is zero, so that pressure flux persists through the column. At the top it
also satisfies `((−g)−(−2g))/Delta=+g/Delta`. Thus native centered correction
uses `a−F=+g` in the interior: predicted upward speed is g*dt.

The pressure slope is twice hydrostatic between cell centres, while each wall
ghost relation retains the single hydrostatic half-cell contribution. Therefore
the **independent discrete prediction** for the net wall traction is

`2*(540+.648)*9.81 − (.02/2)*9.81*(1000+1.2) = 10509.29604 N/m`.

Actual is10509.296137357798, difference.0000973578N/m. Predicted speed is
.0008918181818181818m/s; actual max cell speed.000891824836717474 differs by
relative7.46217e-6. The wrong interior pressure slope also predicts that the
gauge-adjusted pressure error repeats the spread of the initial analytic
hydrostatic profile: initial3876.5392199999346Pa versus actual first-step
3876.539780100062Pa. This agreement distinguishes the caller conflict from a
generic boundary-method guess. Direction/profile and individual face values are
not additional runtime observations; no diagnostic simulation was run.

## The maintained caller we misapplied

`test/gravity.c:10–24,40` includes reduced.h and uses G.y, not a uniform direct
body acceleration. `reduced.h:1–16,36–51` moves gravity into an interfacial
potential, applied through iforce.h. Away from its interface, at the outer walls,
there is no uniform provisional −g*dt wall flux requiring the direct-gravity
pressure correction. Its explicit uf.n=0 cannot be transplanted independently
of that formulation.

The simpler `test/hydrostatic.c:1–17` uses direct a[] and native centered pressure
boundaries, without the extra prescribed uf callbacks. Our intended correction
keeps that native boundary balance while retaining the two-phase/conserving
composition. We are not switching to reduced gravity or seeding analytic p.

## Source-v2 change and boundary-face coverage

`source-v2.patch` deletes **only four uf.n=0 lines**. The ordinary no-penetration
centered u, native p BC, gravity, zero initial pressure, mask, densities, clock,
thresholds, timers and observer are unchanged. This leaves provisional normal
faces under the native pressure-correction owner; it does not permit a physical
normal wall flow after projection. No upstream file changes.

The existing observer's faceSpeedMps already bounds the actual normal faces on
every wall, in addition to all interior faces. This is verified in the generated
loop at67096–67277, which iterates tree->faces with both face_x and face_y flags.
`grid/tree.h:607–620` adds a leaf's negative-side face when the neighbor is a
boundary, and separately appends the positive-side boundary face. `foreach_face`
uses that exact cache (`tree.h:690–708`). Thus its ≤1e-6m/s criterion covers both
root and masked wall normals. It is an all-face maximum, **not a separately
reported wall-only maximum**. With the four explicit clamping callbacks removed,
the observation no longer forces the measured wall face to zero.

For a future debug packet only if still needed, instrument the native project
boundary at the existing stencil application: raw provisional normal uf before
full BC, RHS after BC, alpha/fm/a and p-gradient at bottom/interface/top, then
the corrected normal uf. Read the raw cached face slots to avoid triggering an
extra BC while attempting to observe the pre-BC state. That instrumentation
would need its own inspected source; none is inserted here. The proposed next
packet is simply the unchanged original physical qualification on source-v2.

The unchanged source comment about matching the gravity-wave caller is historical
and misleading for direct gravity, as diagnosed above. It remains in this exact
four-line candidate only to preserve the reviewed executable delta; it is not a
claim that reduced-gravity face conditions are appropriate here.
