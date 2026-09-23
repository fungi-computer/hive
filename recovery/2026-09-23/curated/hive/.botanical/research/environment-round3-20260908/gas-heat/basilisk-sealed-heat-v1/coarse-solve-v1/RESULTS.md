# Coarse correction: large work reduction, one unresolved backward-error rejection

2026-09-09. Preserved first compile, compiler diagnostic, accepted compile,
one algebra packet, and one physical packet. No physical retry or threshold
change. The current physical candidate is not accepted to complete a room.

## Algebra and compile evidence

The source/compiled-code chain and qcc dimensional-check limitation are
recorded in GENERATED-REVIEW.md and COMPILER-DISPOSITION.md. Normal C
`-O2 -Wall` builds passed with empty logs at u3468. Qcc's symbolic units
analysis did not pass; root explicitly allowed its documented bypass for
this isolated heterogeneous dense-algebra candidate. Upstream untouched.

Native-field algebra u3469, invocation 98fa8042b5f540eba06b550a5d6d3431:
1,008 laws and all six rejection cases passed in 0.029649 s elapsed /
0.012533 child CPU seconds. Basis columns and constant modes matched the
original native field/ghost stencil; three fixed changing coefficient
fixtures and known signed/constant solutions were used. Largest relative
known-solution error 2.3093e-14. Full values are in algebra-run-v1/receipt.json.

## Physical result: failed at the new dense-solve guard

u3475, invocation f1d71e4a13654f1491bdd206e44e8e9a, wrapper exit 1/native exit 3.
The run completed 25 native steps at exactly 0.24735390459260645 physical
seconds, then exited with:

    HIVE_COARSE_REJECT: original-unit coarse stencil backward error

All 25 completed physical and fine-grid native residual screens passed.
The rejected next step did not become a completed record. No terminal,
heater cutoff or 2 s completion exists. The coarse helper's rejection
does not establish a physical-equation failure, but it is a real failed
linear-algebra acceptance check and cannot be ignored.

This rejection path printed its law but not its particular row, matrix,
RHS, solution, residual or roundoff bound. The exact numerical cause is
therefore unresolved from retained evidence. No inference that it was
"only a tolerance issue" is justified. Raw stdout/stderr are preserved;
no failure-state or restart CSV was produced by this low-level exit.

## Matched completed work and physical aggregates

The old and new first 25 dt values and completed times match exactly.
At this same prefix the old solve used 1,758 multigrid cycles; the new one
used 124 (about 14.18 times fewer). Per new solve: 3–7 cycles; at step 25,
old 88 cycles versus new 5. These are actual completed cycle counts.
Adaptive within-cycle relaxation work was not fully instrumented, and
the failing next coarse invocation is not part of these completed counts.

At the last completed step:

- 24.73539045926063 J left the finite heater; 75.26460954073937 J remained.
- Combined energy error 1.7462e-10 J; maximum across all completed steps
  2.9104e-10 J. Maximum mass error 2.6646e-15 kg; both outward wall
  pressure work and heat remained zero.
- Mean EOS pressure rose 9.894156182 Pa. Left/right mass-weighted
  temperatures were 300.049517874 / 300.007942199 K.
- Left/right masses were 0.599960740194 / 0.600039259806 kg. Warm-side
  expansion and colder-side compression retained the same direction.
- Last maximum local solved/EOS pressure difference was 0.398192852 Pa;
  full field accuracy remains unqualified.

Across the 25 matched records, the new and old observed aggregate values
differed by at most 2.91e-10 J in total fluid energy, 8.12e-12 kg in left
mass, 1.73e-9 K in half-room mass-weighted temperatures, 7.85e-6 Pa in mean
native solved pressure, and 5.55e-10 m/s in reported maximum speeds.
This supports a linear-solver correction of the same equations rather
than a changed heat source, but it is not exact field/restart equivalence.
The complete aggregate comparison is MATCHED-PARTIAL.json.

## Cost and decision

Candidate whole-process elapsed 0.473150428 s, child user CPU 0.129064 s +
system CPU 0.004710 s = 0.133774 s; peak child RSS 19,072 KiB. The baseline
whole process took 25.443 s / 6.118402 child CPU seconds to complete 30
steps and then hit its wall cap. These endpoints differ, so do not turn
their quotient into an equal-duration speedup. The matched-prefix native
cycle reduction above is the directly comparable work evidence.

The original coarse-mode diagnosis is now supported by a large measured
work reduction at unchanged physical settings/tolerance. The candidate
still needs to satisfy its original-unit backward check on the actual
remaining trajectory before acceptance. Keep this exact failed result;
do not relax the guard, add a heat/pressure reset, or start a new physics
survey. The concrete next diagnostic, if root selects it, is to preserve
the offending dense-system inputs/output and per-row backward terms at
the existing guard, then decide whether native inversion needs standard
iterative refinement or whether the assembly/check has a defect. Nothing
in this handoff implements or runs that next step.

No ventilation, gravity, obstacles, anisotropic game grid, restart,
water-gas coupling or production adoption claim. Water received the
released native window immediately after u3475 terminated.
