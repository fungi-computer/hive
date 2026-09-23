# Full-period 2D standing wave and signed transport accounting pass

**Actual terminal: run-u3477.scope, invocation
3279babd7d294f94a0299e65c4f3eea3, exit 0.** The one authorized paired capture
completed normally; retained session 84453 was polled through terminal.
There was no physical retry, new fixture, changed pressure solve or fine-only rerun.
Compiler u3476 also completed cleanly with no mechanical correction.

This qualifies the maintained Basilisk reduced-gravity/conserving-VOF caller for
this small, closed, full-cell **2D linear-wave discriminator**. Both meshes
completed 1,611 ordinary timesteps to 1.171908997384657 seconds. The original
profile, signed mode, period, return, energy, fraction, projection and physical
pressure-record controls passed, as did independent signed transport accounting.
The matched completed-interval refinement criterion passed. No threshold or
physical parameter changed after this packet began.

## Actual motion and cost

| Grid | Cells | Delta | Native wall incl. observation | Mode RMS / amplitude | Period error | Max profile L2 / amplitude | Max staggered energy error / E0 |
|---|---:|---:|---:|---:|---:|---:|---:|
| coarse | 2,700 | 0.02 m | 11.920 s | 0.17063% | 0.07745% | 1.55758% | 0.68807% |
| fine | 10,800 | 0.01 m | 45.311 s | 0.05242% | 0.02252% | 0.88154% | 0.13343% |

The fine/coarse RMS ratio is about 0.307; this is the declared paired improvement
check, not a fitted convergence-order claim. The signed returned-amplitude error
is 0.192721% coarse and 0.0177859% fine. All values use the separately qualified
linear two-layer oracle, with the retained finite-amplitude/staggered-time limits.

The entire native capture stage took **60.825302431 s**, including per-case
subprocess overhead and capture parsing/writing; native terminal times sum to
57.230377358 s. The recorded maximum child RSS before the external comparator is
**121,152 KiB for the batch**, not a separately measured per-grid allocation.
Each physical fixture advances only 1.171909 seconds: these timings establish no
real-time game throughput, browser performance or whole-world capacity.

The longer **120-second** ceiling was explicitly authorized before this run so
both original periods could finish. Old 28-second evidence remains preserved.
Projection/VOF/observer component timers are nested and include the observation
work described in CONTRACT.md; they cannot be summed or treated as pure kernel
cost. Total native time includes all passive pre/post reads.

## The original failure remains a failure

The coarse original absolute 1e-10 m³/m stock diagnostic still first fails at
**step 202**, exactly as in the frozen u3386 result. The fine mesh remains within
that old stock threshold. The new active one-period budget is separately declared
as 5.4e-7 m³/m, one ppm of initial nominal stock. This report does not relabel the
old experiment or establish a gameplay vessel or long-term precision policy.

The first 203 coarse emitted observations were compared with the retained
predecessor: all shared fields match exactly, excluding only changed `valid`
and elapsed `projectionSeconds`/`vofSeconds`. This is an observation-prefix check,
not comparison of unrecorded internal solver arrays or proof of restart.

## Signed accounting, in m³ per metre of depth

| Grid | Final stock drift | Cumulative cc-div contribution | Cumulative VOF residual | Native signed clamp | Other signed stage residual | Absolute budget spent |
|---|---:|---:|---:|---:|---:|---:|
| coarse | -1.409598684854e-11 | -1.409598906725e-11 | +2.013779878163e-18 | +2.049367278238e-19 | -6.043925121299e-30 | 8.054831621379e-10 |
| fine | +2.530604995406e-12 | +2.530681912486e-12 | -1.600872837983e-18 | -7.530649275842e-17 | -9.714451472534e-21 | 5.317466780700e-11 |

The maximum absolute stock drift during the whole interval was
**4.07103670436e-10 coarse / 2.50985084045e-11 fine**, below the new budget.
For one metre of depth these are about **0.4071 / 0.02510 microlitres** out of
540 litres. The absolute ledger also records intermediate positive and negative
changes; a small final net difference cannot hide larger prior changes.

The largest one-step VOF closure residual was **4.62612e-19 / 1.82367e-19**.
The largest cumulative signed closure error was **4.96556e-26 / 1.60946e-27**.
The largest unexplained inter-stage difference was **1.69283e-30 / 4.90059e-21**.
The emitted two-word stock sums and independent math.fsum reader establish that
cc-weighted divergence explains the sign and magnitude of the stock drift;
this no longer rests on maximum-divergence bounds alone.

Native clamp corrections are now small but nonzero, and explicitly separate:
absolute totals **2.04937e-19 coarse / 7.55950e-17 fine**. They are measured native
iforce behavior within the original f envelope and unchanged clamp limit, not
new state repair. Post-clamp f stays in [0,1]; every actual pre-VOF boundary face
has zero normal speed, establishing zero geometric water boundary flux.

The summed actual full-domain divergence bounds are **1.209527039e-7 /
1.254941118e-7**, both within the new 5.4e-7 budget. The maximum transport-to-prior-
projection dt ratio is **1.9089923**, so the nominal 2.16e-7 planning product must
not be mislabeled an unconditional theorem for this adaptive event clock.
All native pressure solves met their unchanged per-step residual criterion;
maximum projection iterations were 35 coarse and 26 fine, below 100.

Final reconstructed physical bottom-minus-top support is approximately
5303.69785 / 5303.69806 N/m, against actual weights 5303.75688 / 5303.75688 N/m.
Those are dynamic pressure observations, not a new independent hydrostatic or
support-error acceptance claim. Raw q remains distinguished from physical p.

## What these retained data can show

Each ordinary row contains actual 50/100 column-integrated water heights and
explicit nominal-fraction/velocity/cumulative-VOF times. They can support an
honestly labeled **recorded 2D slosh playback** using nominal fraction time.
They do not contain full f, velocity or pressure fields; they cannot demonstrate
live browser integration, dye advection, overhangs, waterfalls or 3D interaction.
The nominal final f time is 1.1715430114570382 seconds, half a final step behind
velocity; the existing initial staggering limitation remains disclosed.

This result supports retaining the maintained C method. Physical voxel ledges,
3D corners, geometry edits, restart and game-facing performance remain unproved
by this fixture. No port, game source change, dependency adoption or new test
was performed as part of this acceptance packet.
