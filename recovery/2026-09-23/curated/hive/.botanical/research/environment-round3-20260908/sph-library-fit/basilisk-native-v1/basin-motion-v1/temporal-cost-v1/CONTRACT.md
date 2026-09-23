# Same-accuracy temporal-cost discriminator

Root owns this new ignored sibling only. The accepted u3477 baseline remains
frozen. No runtime, tracked file, dependency or game accuracy policy changes.

The actual caller artificially caps DT at one period/1600. Native timestep
already applies face-velocity CFL, event endpoints and an increasing-step
smoother. This candidate changes only that cap to period/128; the native
CFL limiter and every physical equation/grid/initial condition stay intact.
The test asks whether the existing declared output accuracy can be achieved
with fewer updates. It does not assume a larger timestep is valid.

Both complete coarse/fine intervals must retain original profile, mode RMS,
period/phase, return amplitude, energy, fraction envelope, pressure tolerance
and signed water ledger gates. The comparator changes only its expected
cap. The previously declared 1ppm one-period transport budget is unchanged;
legacy 1e-10 stock flags remain. No oracle drives physics.

Independent source review precedes compile and one serial paired run. Combined
native ceiling60s is an observation budget, not a game-performance threshold.
No automatic retry, parameter sweep, altered accuracy threshold or grid.
Per-case process CPU deltas now exclude Python decoding; inherited RSS is
explicitly cumulative child high-water, not per-grid allocation. Timers inside
native observers overlap and remain labeled. Old baseline lacks matching CPU
so compare work counts and accuracy honestly, not an exact matched CPU speedup.

Compile retains installed qcc, -O2/-Wall and generated-event inspection.
All four observer/accounting source files remain byte-identical to accepted
source. Restart is independently owned elsewhere and is not claimed here.
