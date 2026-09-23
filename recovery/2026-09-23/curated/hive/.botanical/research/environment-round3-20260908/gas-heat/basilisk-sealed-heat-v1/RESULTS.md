# First sealed-room heat packet: useful partial physics, failed run budget

2026-09-09. One numerical invocation only: `run-u3403.scope`,
`bf5efee0577b4cd1a15d6c9804b01bcc`. Wrapper exit 1, native exit 2.
All source/binary/upstream pins unchanged. No retry or changed threshold.
Full raw evidence is in `run-v1/receipt.json`, `stdout.log`, empty
`stderr.log`, and `failed-interval.csv`.

The 512-cell cube completed 30 steps and 0.31921030539942563 physical seconds
before the next heater hook rejected the existing 25-second wall budget.
The 100 J / 1 s source and 2 s horizon were NOT completed: no cutoff event,
no final observation. All 30 completed observations passed their fixed
physical and solver screens. No native warning or nonfinite record occurred.
This is a failed bounded packet with retained partial observations, not a
successful shortened experiment.

## What physically happened before the stop

| Quantity | Last completed observation |
|---|---:|
| Heat released from finite heater | 31.92103053994252 J |
| Actual summed fluid heat increment | 31.921030539975618 J |
| Heater energy still present | 68.07896946005748 J |
| Transfer rounding | +3.3097080631705467e-11 J |
| Fluid total energy | 258331.92103053987 J |
| Combined fluid + heater + outward boundary error | -5.820766091346741e-11 J |
| Largest absolute combined error over 30 steps | 2.9103830456733704e-10 J |
| Mass error, last / largest absolute | -1.55e-15 / 2.67e-15 kg |
| Outward pressure work / conductive heat | 0 / 0 J |
| Inspected wall area / wall normal face speed | 6 m² / exactly 0 |
| Mean EOS pressure increase | 12.768412214209093 Pa |
| Mean native solved pressure increase | 12.76840499447 Pa |
| Largest local solved/EOS pressure difference | 0.4138885623542592 Pa |
| Left / right mass-weighted temperature | 300.0638376208677 / 300.01031567382944 K |
| Whole-room mass-weighted temperature | 300.0370743676376 K |
| Mass moved from left half to right | approximately 0.00005111274 kg (0.0511 g) |
| Maximum cell / face speed | 0.0001366897 / 0.0001382243 m/s |
| Kinetic energy | 4.21094119576183e-9 J |

In game terms, a finite heater made its half of the room warmer, the sealed
room's pressure rose, and expanding warm air pushed a small amount of air
into the cooler half. The cooler half also warmed through compression. No
air or heat was silently borrowed from an outside environment.

The ideal-gas mean-pressure/energy identity predicts 12.768412214265126 Pa
from the observed energy and kinetic-energy change, matching the reported
EOS mean to 5.6e-11 Pa. This is an algebraic consistency check of observed
stocks, not an independent accuracy oracle for the native local flow.
Neither the approximately 0.414 Pa local EOS mismatch nor the full field
accuracy was qualified by refinement. The solved/derived temperature
difference peaked at 1.1755844298022566e-8 K; that does not establish spatial
accuracy either.

## Actual cost, without blaming or concealing host scheduling

- Wrapper elapsed: 25.443172854 s. Native elapsed: 25.416717129 s.
- Child user CPU: 6.090178 s; system CPU: 0.028224 s; total 6.118402 s.
- Peak child RSS reported by the OS: 18,816 KiB. This is process peak,
  including the native grid/solver/observer, not isolated field memory.
- Timed pressure/thermal region: 25.032976747 elapsed s, 98.49% of native
  elapsed. This clock includes scheduling delays; no per-region CPU clock
  was instrumented.
- 2,206 actual multigrid cycles. Per solve: 12–90 cycles; the reported final
  relaxation count ranges from 3 to 62 (last solve: 90 cycles / 61).
- The stored final `nrelax` is not the sum of relaxations actually applied:
  the native algorithm changes it inside a solve. Multiplying each cycle
  count by its final `nrelax` would invent a work count, so it is not claimed.

CPU was 24.05% of elapsed; these receipts do not identify whether scheduling,
quota or another cause explains the rest. Even CPU alone exceeds simulated
time by roughly 19 times in this one instrumented 512-cell case. That is a
case observation, not a benchmark throughput estimate or population limit.
Host delay did affect the wall guard, but it does not make the solver work
or CPU cost disappear.

## Failure-state and completion boundaries

`failed-interval.csv` was written in the next heater hook, after that step's
native VOF transport. It is a raw failure state, not the exact last completed
state and not a restart file. Its cell energy can already have been advected
without the later pressure/heat work; no incomplete step is promoted to an
accepted state. The scalar terminal reports 30 completed steps / 30 source
calls and zero cutoff events. The future host must continue to distinguish
those clocks. No atomic rollback, interrupted continuation or saved-game
receipt was established.

The compile review is still valid source evidence; the older CONTRACT and
source-checkpoint descriptions preserve their historical pre-run scope.
This RESULTS file and the physical handoff provide the current disposition.

No gravity, ventilation/opening, smoke species, interior obstacle, finite
water coupling, combustion, anisotropic voxel binding or production adoption
is claimed. No Fallow result is claimed for C/Basilisk source.
