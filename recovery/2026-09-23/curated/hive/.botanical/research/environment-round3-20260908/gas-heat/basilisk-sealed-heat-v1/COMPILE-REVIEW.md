# Compile-only checkpoint1: retained caller reduction failure

Guarded scope run-u3384.scope, invocation7e772d36ec844b69a0b15bda46cdd331,
terminal exit1. The first qcc `-events -source` command stopped after2.3782 s:
it does not know how to reduce the type `static double` of heater_volume.
The normal binary command was never attempted. No gas executable ran.
build-v1/receipt.json, source copies and command-1.log retain this exact failure.
All pinned upstream/qcc files remained unchanged. The water lane was notified
and its safe compile window released immediately after this terminal result.

The source-only correction sums the physical heater volume using a local
double reduction, then assigns the result to the existing retained scalar.
This preserves the exact cube, heater cells, source quantities, thresholds and
event order. It does not change an upstream header or introduce another owner.
The original source-checkpoint-v2 and build-v1 source remain preserved.

The generated event/rotation/scratch review is **not completed**: qcc stopped
before producing its reviewed translated caller. A corrected compile requires
root's next compile-only decision and another safe window with the water lane.
No physics run is authorized or claimed by this correction.

## Corrected compile-only checkpoint2 and generated-source review

Root accepted the mechanical reduction correction and routine compiler-only
fixes. Water released its window after its own terminal capture; no third-party
process was inspected. run-u3390.scope /ce5d8719e98e49bc9bc9797e603a3e5b then
completed exit0. Translation5.0926 s, binary compile21.6794 s, total26.7724 s.
Both compiler logs are empty. All upstream/qcc pins remained unchanged. The
window was returned to water after this terminal result. No gas binary ran.

Generated C SHA87381d4b1a6cd1dd6f3b12c5f333f16adfa83f3bc31c00edbb92605f597bf403;
binary SHA776a4d220893fcad7d87c7a86366c488e114318ebfaf768b00c6d11aa746d798.
Source caller4dfa8c6a and observer98d4c144 are exact reviewed corrected inputs.
The translated source uses `-events` instrumentation; the normal binary omits
that diagnostic flag. The event registrations/physical caller are the same;
this is generated-source evidence, not a dynamic event trace.

I personally read the actual registrations and checked them against native
event_register/event_do. generated-event-order.json retains a static extraction:

- Init: caller init_1 → two-phase init_0 → all-mach init, then the distinct
  initial_observation. This initializes f=0/M/E before property/uf reads.
- Ordinary cutoff/stop events precede the solver's last timestep handlers.
- VOF finishes before tracer_advection_1 (our heater), then
  tracer_advection_0 restores the native interface list. Properties_0 derives
  ps/rho/bulk, followed by properties' acceleration cleanup.
- acceleration_0 constructs the actual thermal T/p coefficients.
- pressure_0 starts timing, followed by the actual all-mach pressure action.
  Generated line25896 calls **poisson_thermal**, not the scalar poisson owner.
- end_timestep_2 reads our residual/boundary inputs; end_timestep_1 adds native
  thermal flux, end_timestep_0 adds native pressure work, and the original
  end_timestep is an empty hook. completed_observation is a later distinct
  registered event, after the entire chain (generated lines52095–52276).

Scratch lifetime was inspected in the generated code. The pressure action
aliases rhoc2/ps as lambda/RHS; thermal acceleration aliases Ts as its RHS.
The pre-energy observer calls the original residual_thermal with those exact
arrays and separate local rt/rp. Generated line51229 deletes both temporary
scalars. The observer reads conductivity before thermal end work aliases it as
gradTv and overwrites it. No second solve, hidden field reset or leaked residual
array was introduced by the observation.

The generated wall loops read face_position.x/y/z and matching uf.x/y/z,
kappa.x/y/z and their adjacent scalar offsets. Dynamic-conductivity variants
appear at lines50753,50823,50893, with the zero/one coordinate test on each
normal family. Thus all six faces and outward signs are represented; actual
measured area/zero flux still belong to the future physical result.

## Failure and future run acceptance

The generated completed observer requires finite mgp.resa below its native
target, no nonfinite residual entries, finite/admissible physical stocks and
the fixed conservation/wall screens. A failure writes the raw CSV, sets a
nonzero result and stops native events. Early stop does not set interval_complete;
main returns failure if the full scheduled interval was not reached. Native
nonconvergence warnings therefore cannot substitute for a passed solver record.
If an upstream floating exception aborts before a terminal report, the outer
run is also failure; no partial observation is a completed outcome.

The VOF owner independently warns on actual CFL violation. The future runner
must preserve stdout/stderr, reject any such native warning, require a zero
process exit plus an explicit completed terminal record, and reject malformed
or nonfinite numerical records. This is especially necessary because a raw C
NaN can appear in a failed diagnostic line. No successful numerical result is
inferred merely from executable creation or process silence. No run harness or
physics packet has been invoked at this checkpoint.

These are C/Basilisk source and generated-caller checks; no Fallow JavaScript
reachability result is claimed for them. The fixed physical contract and all
thresholds remain unchanged. Await root's physical-run decision.
