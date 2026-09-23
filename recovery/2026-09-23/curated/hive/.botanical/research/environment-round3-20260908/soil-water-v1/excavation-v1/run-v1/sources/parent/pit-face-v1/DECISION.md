# An unlined pit needs wet and dry parts of each side face

Game CTO source decision, 2026-09-09. This extends the existing soil boundary,
not the interior Richards solver. No ordinary hole is replaced by lined sides.
The excavation transaction stays with its current independent author.

The established physical conditions are pressure continuity on submerged soil
and a seepage boundary on exposed soil: exposed soil can release water at
atmospheric pressure or remain unsaturated without drawing water from air.
The [ParFlow model equations](https://parflow.readthedocs.io/en/latest/models.html)
describe finite pond storage using positive surface head and a shared exchange
flux; its Richards approximation keeps air pressure passive. The
[seepage-boundary paper](https://arxiv.org/abs/2407.07865) describes the unilateral
pressure/normal-flux conditions. Neither reference supplies the specific
coarse-face formula below or proves this proposed Hive implementation.

## Reuse and scope

Keep volume-v1's soil constitutive owner, paired mass residual, backward Euler,
Jacobian assembly, linear solver, stock validation and save/restart approach.
Add a typed finite pit boundary with explicit base, rim, area and real contacts.
Its vertical sides can be partly submerged; their centers do not define the
pit floor. An excavation still exports the removed soil's water as wet spoil.

The pit's free surface is hydrostatic and vented. It is appropriate for slow
seepage/storage, not waves, fast inflow, sealed gas, erosion or overflowing
surface routing. Those remain the separate water/gas join. A full pit cannot
silently discard overflow. Side seepage enters the same finite pit stock once;
the film's fall/momentum/energy are not resolved by this isothermal model.

Use the existing surface-head representation: water mass is rho*A*max(psi,0).
Positive psi is depth above the explicit floor. Nonpositive psi is a dry-floor
pressure multiplier, not a negative water level. Exactly one horizontal porous
floor contact reuses the accepted column boundary and can absorb arriving side
seepage without inventing stored water. Independent exposed sides do not read
negative psi as atmospheric suction. Cases without that floor contact need an
explicit nonnegative-storage branch; do not silently generalize the multiplier.

## Integrated side-face law

For one rectangular vertical side, let height be H, width W, soil total head
relative to the pit floor be s = h_soil + y_soil - y_base, and physical pond
depth d=max(psi,0). The submerged height is w=min(H,d). Keep the existing
quarter-cell/quarter-cell series resistance along the normal direction:

    R = delta_soil/K(h_soil) + delta_trace/K_sat
    mobility = W/R

This is the existing approximate half-cell boundary resistance, not a new
calibrated permeability or a general subcell soil solution. Boundary pressure
on submerged parts is nonnegative, hence the existing constitutive law gives
K_sat there. Exposed seepage parts also have pressure head zero.

The signed volume rate, positive from soil into pit, is

    Q = mobility * [ w*(s-d) + integral(z=w..H, max(s-z,0) dz) ]

The wet term is bidirectional; the dry term can only add water to the pit.
Above the seepage line, the unsaturated boundary trace adjusts to zero flow.
Integrate the linear dry profile analytically rather than activating an entire
side only when water reaches its center. No soil quantity is clipped by max:
these positive parts select the established pressure/contact branches.

At hydrostatic rest s=d, both terms vanish. Empty pits with dry adjacent soil
cannot supply irrigation water. As the waterline rises over a side face, the
rate is continuous. One signed rate enters the existing residual with opposite
sign at its two endpoints, including simultaneous side inflow and floor uptake.

For Newton assembly, define l=max(0,min(H,s)-w). The derivative of the bracket
with respect to s is w+l, plus the ordinary mobility derivative from K(h_soil).
For 0<d<H, its depth derivative is -w+min(s-d,0); for d>=H it is -H. On the
negative-psi branch it is zero. At psi=0 use the right derivative, matching the
existing reservoir capacity convention. Contact-breakpoint derivatives are
one-sided choices in the semismooth equation, not claims of global smoothness.

## Before a physical run

Check the closed form against independent vertical quadrature, signed wet/dry
cases, hydrostatic rest, and finite-difference derivatives away from kinks.
Then the existing soil owner must consume it in a separately pinned candidate:
explicit pit geometry and capacities, floor/sides classification, dry-state
admission/initial guesses, conserved closure and strict checkpoint identity.
All former reservoir/column consumers must retain their original behavior.
The primitive alone does not accept an excavation or prove nonlinear stability.
