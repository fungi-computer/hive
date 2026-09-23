# One-period transport accounting over the maintained reduced-gravity caller

This is a separately pinned **source candidate**, not a passing wave result.
No compiler, translated caller, binary or numerical packet has been invoked.
`BASELINE.json` retains exact predecessor source and failed result hashes.
The physical wave, grid pair, DT, pressure tolerance and all original shape,
energy, phase, physical-pressure and fraction controls remain unchanged.

The predecessor `u3386.scope` remains failed at step 202: its original absolute
stock limit was 1e-10 m³/m. The new source reports that same limit independently
for every ordinary row, carries a sticky combined stock/clamp-adjusted failure,
and repeats the frozen predecessor failure in the final readers. It cannot
retroactively make the old test pass. The original initial-stock gate also remains at 1e-10 m³/m. The native clamp's separate cumulative
absolute 1e-10 m³/m limit remains unchanged.

## New bounded precision decision

Root declared a one-period total transport budget of **5.4e-7 m³/m**, one ppm of
the nominal initial 0.54 m³/m. The horizon is exactly the original
1.171908997384657-second wave packet. This is neither a game-vessel conversion
nor a 30-minute or unlimited-world budget.

The nominal conservative estimate is

```
2000 steps * 1.08 m³/m * 1e-10 = 2.16e-7 m³/m < 5.4e-7 m³/m.
```

The direction of this inequality matters: that estimate is WITHIN the budget.
It assumes matching transport/projection intervals. Native VOF uses previously
projected uf and the current transport dt, so the actual receipt records both
intervals, their ratio, pre-VOF divergence and
`dt_transport * 1.08 * max(abs(div(uf_transport)))` each step. An increasing dt
can invalidate treating the nominal product as a rigorous actual-run bound.
Acceptance uses the measured ledger, not a claim that this estimate must hold.

The active budget checks both absolute stock drift and cumulative absolute
numerical changes: absolute signed cc contributions per step + absolute VOF
closure residuals + native absolute clamp changes + absolute inter-stage gaps.
Thus positive and negative changes cannot cancel to hide budget spending.
All such quantities are numerical accounting, never physical sinks or credits.

## Native identity and exact observation stages

Pinned `vof.h:278–286` updates f with shared face flux plus cc compression.
At 355, native cc is `(f > .5)` before the directional sweeps at 370–375.
`conserving.h:117–185` is the actual VOF caller; it adds momentum tracers,
performs this same transport once, and suppresses the default second advection.

On this fixed full-cell cm=fm=1 grid and unit depth:

```
C_step = dt * sum_cells( (f_before > .5) * Delta² * div(uf_before) )
V_postVOF - V_preVOF = C_step + boundary_water_step + R_vof_step
```

`wave.c` adds only passive actions at existing stages:

1. Before inherited VOF: compensate raw stock sum; integrate cc-divergence;
   inspect all actual boundary faces, metrics and pre-VOF f; compare with the
   preceding completed stock.
2. At the newest inherited `tracer_advection` action: read stock immediately
   after native VOF and before properties, force or projection.
3. At the existing newest `acceleration` action: read stock before native
   reduced/iforce, predict the actual existing clamp using local arithmetic only,
   and record any gap since post-VOF. Existing force observer remains separate.
4. After native projection at `end_timestep`: read stock after the native clamp;
   separate its predicted signed change from any remaining stage difference.

The expected inherited order is source-backed by the predecessor translated
caller. It must be rechecked in this candidate's generated C after a separately
authorized compiler checkpoint; there is no generated-source claim yet.

## Boundary flux scope

For each real boundary face the observer records outward normal speed, signed
net inward total volume and absolute total volume. It additionally requires
every normal to be **exactly zero**, not merely a cancelling net flux. Then the
native `cf * uf` geometric WATER boundary flux is exactly zero, including mixed
interface cells at side walls. A nonzero face emits unknown water flux (`null`),
fails this fixture's accounting and remains in the raw receipt. No f*uf estimate
or second geometric flux implementation is substituted. This is not an open
boundary accounting API. Existing all-face post-projection wall checks remain.

## Signed closure and residual controls

New finite native metadata uses compensated two-word double sums; each stock
pair is emitted, allowing Python `math.fsum` to independently recover the tiny
differences rather than subtract two rounded 0.54 values. No field-sized saved
cc array, persistent simulation stock or separate transport history is created.
The native numerical state remains the unchanged library's state.

The independent reader checks per-step VOF closure, before-VOF continuity,
post-VOF to pre-force continuity, clamp closure, and this cumulative signed law:

```
V_end - V_initial = sum(C_step) + sum(R_vof_step)
                  + sum(native_clamp_step) + sum(stage_gaps)
```

The final signed closure is checked separately from the cumulative absolute
budget. Proposed instrumentation allowances, fixed before any execution:

- `abs(R_vof_step) <= 64 * DBL_EPSILON * (1.08 + swept_volume_scale)` m³/m,
  where the scale is `dt * sum_faces(abs(uf) * Delta)` from this actual step.
  Near still water this is about 1.53e-14 m³/m, far smaller than the budget.
- Each stage gap and final signed-closure error is at most
  `8 * DBL_EPSILON * 1.08`, about 1.92e-15 m³/m.
- Reader comparison of final cumulative sums allows eight final-sum epsilons
  (absolute floor 1e-24); it does not change either physical stock budget.

These are explicit floating-arithmetic instrumentation checks, **not a theorem
that every VOF residual must be roundoff**. The measured signed and absolute
residuals are the result. A failure is preserved; no f repair or tolerance tune
follows automatically. The independently accumulated compression and residual
must explain the sign and magnitude of stock change, not only fit under a loose
maximum-divergence envelope.

## Unchanged acceptance and honest cost

The copied corrected wave comparator preserves the original profile, mode,
period, return, staggered-energy and f-roundoff-energy gates. Full refinement
still requires both complete matching intervals. Root authorized a new combined 120-second native observation ceiling so both
original periods can complete. Any actual timeout remains unqualified. The old
28-second results stay frozen. This larger observation window is not a
game-performance acceptance or a changed physical/accuracy parameter.

There is additional passive work: pre-VOF cell/face/wall scans, post-VOF stock,
pre-iforce stock/clamp, and end-step stock scans, all bounded by the same grid.
Only finite scalar metadata and existing 100-column arrays are retained.
The legacy `observerWorkspaceBytes` reports those column arrays only, not the
new struct; no zero-allocation or hot-loop speed claim is made. Total native
wall time includes all observers. The VOF timer now includes pre/post VOF
observations; the ordinary observer component still excludes pre-force scans.
These nested component timers must not be added or compared as pure solver cost.

No upstream code, equation, wall, fluid stock, initial condition, force, viscosity,
solver tolerance, fine-grid size or authoritative clock was changed. No result
from this staged source has been obtained.

## Compile and capture authorization

After reading the entire source shape, root authorized compile/generated event
and rotated-wall review, then one paired wave packet after that review passes.
The reviewed first source is preserved byte-for-byte in `reviewed-source-v1/`.
Mechanical compiler corrections may preserve diagnostics and proceed; a real
accounting/source discrepancy must stop. The shared gas window finishes first.
