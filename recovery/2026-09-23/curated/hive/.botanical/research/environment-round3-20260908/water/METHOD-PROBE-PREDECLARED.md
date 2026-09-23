# Analytic area and .54 m moving-step probe: declaration before execution

Use the pinned accepted boundary owner and unchanged dense reference. This first
probe is a mathematical method diagnostic, not a waterfall benchmark or language
port. It has no production/game writes or long parameter search.

Analytic disk–rectangle integration evaluates the circle antiderivative and
combines signed quadrants. Completely inside/outside cells use exact geometric
predicates. At32² and64² over32 m, radius6 m centered at(16,16), summed area must
matchπr² within1e-10 relative, and each coarse cell must equal the four fine cells
within1e-10 m². Also verify quadrant/symmetry and an arbitrary offset partition.
Any Float64 cancellation bound applies to initial intersection geometry only;
it is not permission to delete an evolved film.

For the moving face use bed left0/right0.54 m, upstream depths0.27,0.54,0.81 m,
upstream velocity6 m/s. Solve the positive supercritical downstream depth from
the same constant discharge and specific energy. The critical-depth minimum
must admit that branch; both energy and discharge residuals must be<=1e-11.
This assumes a frictionless, no-hydraulic-jump, Bernoulli bottom-transition path.
It does not validate nonhydrostatic motion over an exposed vertical face.

Initialize that mathematical pair on a small Cartesian field and inspect one
actual committed solver interval at the interior bed face. Record actual mass
exchange/dt/width and infer side momentum fluxes from the interior adjacent-cell
impulses and known uniform-neighbor fluxes. Independently evaluate the published
hydrostatic/Rusanov reconstruction and compare to those actual solver values.
Repeat at1 m/0.5 m horizontal spacing, keeping the bed jump0.54 m exactly.

The physical/mathematical expected steady mass flux is the positive constant
discharge. Any clipped upstream reconstruction and blocked/reversed mass flux
is reported immediately as a method limitation, with process exit1. Exact
dense/optimized agreement does not make that steady-state requirement pass.
Magnitude error is also reported, with no tuned tolerance used to conceal sign
failure. Method observation failure and harness/algebra failure are distinct.
This case does not assert the selected path is the physically correct waterfall
or that ordinary subcritical pond overtopping must behave like this pair.
