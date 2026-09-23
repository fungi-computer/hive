# Reduced-gravity caller and passive accounting, before native compilation

This new isolated caller applies the maintained `reduced.h` path identified in
`../reduced-gravity-fit-v1/SOURCE-FIT.md`. No upstream source or old candidate is
edited. The old `wave-observation.h` is copied byte-for-byte. Physical geometry,
density, amplitude, fixed grids, DT, projection tolerance, native ceilings and
original stock/profile/energy criteria remain unchanged. No fluid run is part
of this checkpoint.

`wave.c` includes `reduced.h`, gives it G.y=-9.81 and Z.y=.54, and removes the
constant a assignment. Initial p=0 is expressly a *reduced-pressure guess*.
Ordinary no-penetration/slip u conditions and native p/uf ownership remain.

The added `wave-reduced-observation.h` owns only finite passive scalar records:
pre-force statistics/counters and separate post-force physical pressure facts.
It adds no particle/grid workspace and never writes f, u, p, a, boundaries,
prolongation functions or native time. The original column/moment observer and
its finite 100-column buffers remain unchanged.

The caller adds the newest inherited `acceleration` action to read raw f before
the native `reduced` and `iforce` actions. It records min/max, finite count, raw
water stock, sum V*clamp(f), signed sum V*(clamp(f)-f) and its absolute sum. These
clamp calls are local arithmetic only. It also accumulates signed and absolute
correction magnitudes. The actual native `iforce` remains the sole f-cleanup owner.

End-step observations join those pre-force facts to actual post-native f, water
stock, pressure and velocity. Controls keep the original pre-f envelope 1e-12 and
water tolerance 1e-10; actual post-f must be in [0,1]. Post-stock must match the
predicted cleanup stock within 1e-12. Cumulative absolute native cleanup and
clamp-accounted water drift must also stay within the original 1e-10 stock
allowance; this does not replace the original unadjusted stock gate. All values
and both unadjusted/cleanup-accounted balances are emitted. A bad pre-force
envelope causes failed acceptance even if native cleanup subsequently bounds f.

The second record kind `reduced_force` uses the same case, step and solved time
as the ordinary observation. It explicitly labels native gravity formulation,
pressure meaning, reference datum and gauge. A future reader must consume/check
both record kinds; the frozen original comparator cannot establish these new
accounting laws by ignoring them.

For pressure, physical p = q + rho*G.(x-Z). The observer reports actual q's mean
as its gauge, pure-phase physical min/max with that gauge removed, and excludes
mixed cells from pointwise physical-pressure reporting. Pure bottom/top wall
traces use native q interior/ghost values at actual face coordinates plus each
phase's hydrostatic term. Wall purity is checked. Equal wall lengths make net
support gauge independent. It reports support, actual weight and centered total
vertical momentum; it does not impose static support=Mg on a moving wave or
claim an exact substep traction/momentum budget from one end-step reading.

The generated-source check must establish this actual order, not infer it only
from header names: native mutable-a reset -> passive pre-force read -> reduced
position/potential -> iforce canonical clamp + face force -> centered provisional
face velocity -> native projection/centered gradient/correction -> ordinary wave
and extra physical-pressure/post-clamp observation. No numerical execution is
authorized at this compile checkpoint.

`compile-wave.py` verifies local and retained source pins, uses the unchanged
qcc, copies only candidate files into `build-v1`, emits generated C for inspection,
then compiles one serial binary. It has a shared 115 s inner compile ceiling and
is run once through the ordinary proof wrapper. Neither binary case is invoked.
