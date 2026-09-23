# Maintained reduced-gravity caller compiled; no fluid run

The isolated caller and passive accounting compiled once through the ordinary
proof wrapper: `run-u3364.scope`, invocation
`e63e878b4add411b957fca7d42e38aa9`, exit 0. Generated-source command took 4.20270 s;
binary compile took 13.99705 s; total 18.20012 s inside the 115 s inner ceiling.
Both command logs are empty. No native wave case or new numerical comparator was
executed for this candidate.

- `wave.c`: `5795db60c2296d4a0c6a561ddc913fe5ba41ea6edc33138542c72ff0df0c596f`
- `wave-reduced-observation.h`: `e0661b2e6abab24ba3a3f0ae940b7d24f21e8261faab7d2c5aedfcbb073254e0`
- Existing wave observer remains exact `8e018f7eaa26a536f7d8e5b3ba30ebff0ab903f950ace30a536bbb2cd7d9d3ea`.
- Binary `build-v1/wave`: `b36aa5ceea5e791257369c137eed1abab29cfccc9205e375c499598c248a3b5f`
- Generated `build-v1/_wave.c`: `1d26018e4ea1f41b4a9620be54453a58a5a9564abb775003fa842815b0160ea5`
- Frozen candidate pins: `3fd124f92e965a93decee238ac7bdec60fa7e2768d27dab9311bfee264432401`.

The generated C was emitted with `-events` for source inspection. The actual
binary was separately compiled without it; source event printouts are not a
claim of runtime event tracing.

## Actual inherited action order

Generated `event_register` at 5908 prepends a newer same-name action while keeping
its original event slot. `event_do` at 5959 walks every linked action. Registrations
at 75571 onward put `viscous_term` before `acceleration`, then `projection`, then
`end_timestep`. The acceleration registrations at 75573, 75603, 75605 and 75618
therefore execute in this actual order:

1. Native mutable acceleration reset: assignment to af at 50377, under the
   unchanged `viscous_term` owner. There is no constant direct-a assignment now.
2. Caller `acceleration_2` at 75436 calls only `observe_before_iforce`.
   Its actual loop at 74231 reads f and accumulates scalar expected clamp amounts;
   there is no canonical f assignment in that function.
3. Native reduced `acceleration_1` at 70120 computes `(rho2-rho1)*G`, calls the
   maintained interface `position` with Z, and associates its phi with f.
4. Native iforce `acceleration_0` at 64016 processes that phi. The real canonical
   f clamp is the assignment at 64161. Its face force uses the native shared
   alpha/pressure stencil, e.g. 64374/64666 depending on constant-field dispatch.
   It restores prolongation and releases phi/list in the unchanged native owner.
5. Centered acceleration at 50464 constructs provisional face velocity.
6. The projection slot calls the passive timer, then native `project`,
   `centered_gradient`, and `correction(dt)` at 53459–53465.
7. Only afterward does caller end-step at 75453 read actual wave f/u and reconstructed
   physical pressure, validate cleanup accounting, and emit both joined records.

The pre-force snapshot is before reduced position as well as before iforce.
Reduced position reads canonical f and computes derived geometry; the subsequent
native assignment at 64161 is the actual cleanup owner. There is no native f
transport between that cleanup and the end-step observations in this event chain.
The original conserving VOF owner and its suppression of the second VOF call stay
unchanged; no manual event invocation or duplicate fluid update was introduced.

This makes the predicted cleanup amount an observable native operation once a
future run captures the pre- and post-states. It is not already a measured result:
the compiled candidate has not been executed. Both original raw-stock controls
and the explicit cleanup-accounted balance remain present.

## Generated physical pressure and wall reads

The extra observer reads actual q at 74413's enclosing loop, computes
`q + rho_phase*G.y*(y-Z.y)` only for pure-phase cells, and subtracts the recorded
domain-mean q gauge. Mixed cells are counted and excluded from those pointwise
pressure extrema. This does not mistake reduced q for physical pressure or claim
an exact mixed-cell pressure average.

At 74518–74534 the generated bottom boundary loop finds the actual boundary ID,
returns point to its adjacent interior leaf and shifts y onto the physical face.
It checks pure water on both sides and uses `(q_inside+q_ghost)/2` plus
`rho1*G.y*(y-Z.y)`. The corresponding top loop uses pure air and rho2. At 74712 it
subtracts the same gauge times the respective measured wall lengths. Those lengths
are independently checked by the original wave observer. Net physical support
is gauge invariant; actual weight and centered vertical momentum are also emitted.

The observer imposes no wave-time support=Mg law. Restoring the known hydrostatic
term is a pressure-variable transformation, not independent numerical proof of
hydrostatic support. A later dynamic receipt must interpret the reduced traction
and momentum change together; no such result is claimed here.

## Evidence and cost boundaries

`caller-observer.patch` is the exact isolated change against the frozen wave.
All original source pins and the accepted archive/reference sources were checked
before compilation. `build-v1/receipt.json` retains command/output hashes. There
is no new run script or result directory for this candidate.

Total native wall time will include the extra pre-force scan and pressure scan.
The existing `observationSeconds` timer includes initial/end-step observations,
but the pre-force scan is outside that timer; do not treat it as a complete audit
overhead measure. `observerWorkspaceBytes` still describes the original fixed
column arrays, not all added stack/scalar records or total solver memory. No
performance qualification is being made from compilation.

Next numerical authorization and exact capture/consumer review remain with root.
The old failed direct-gravity raw and corrected reporting copy are preserved.
