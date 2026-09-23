# Radial/rest packet after the moving-step failure

The .54 m moving-equilibrium failure is retained. This small independent packet
delimits still-useful lake/front behavior; a passing radial/rest check cannot
accept the failed moving-step law. No solver source or physical parameter is
changed. Compare32²/64² over32 m with ceilings0.02/0.01 s, observing2 s with a
retained restart at1 s. Initial disk radius6 m/depth0.27 m uses the independently
checked analytic cell intersection areas. Step rest uses bed0/.54 and free
surfaces0.81 or0.27 m. Both horizontal refinements retain the entire .54 m ledge.

Interpolate cell-center depths bilinearly for64 uniform angular rays. Bracket
contour crossings with radial stride dx/16, then bisect40 times. Record every
crossing at1 mm/1 cm/5 cm; missing/multiple crossings cannot be silently replaced
by an outermost preferred result. Axis radius is the mean of four cardinal rays,
diagonal radius the mean of four diagonal rays. The historical1 cm cell-center
axis/diagonal measure is also retained independently.

For each timestep ceiling, both historical and interpolated1 cm metrics must
have coarse bias<10% and improve under refinement. Preserve any failure even
when the other metric or another threshold passes. Compare complete quarter-turn
volume/momentum/last-flux maps within1e-10. Exact candidate/dense final and
restart final are required; owner-selected stability is checked each interval.
The proof does not claim it serializes/compares every intermediate full state.

Rest requires maximum depth/momentum drift<=1e-11. Nonnegative depth is monitored
each interval; conservation is checked at retained1 s/final2 s checkpoints with
relative1e-10 tolerance. Initial/final total and source pins are retained. No
stock/film cleanup or boundary source exists. This packet is expected to finish
well under60 s and is not a performance sweep or production device budget.
