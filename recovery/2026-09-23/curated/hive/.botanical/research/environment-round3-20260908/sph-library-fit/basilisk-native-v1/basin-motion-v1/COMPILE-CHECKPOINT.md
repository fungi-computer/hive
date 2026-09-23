# Wave source compiled; numerical pair remains unrun

The root-reviewed source, including the explicit nonnegative <=2e-6 E0 roundoff
uncertainty control, is frozen. One compile-only invocation completed normally:

- run-u3292.scope, invocation a007c1869b394f47bdcbf12ee29091df, exit0.
- Ordinary run-proof wrapper with120s outer guard; recipe115s inner allowance.
- Generated C command2.77680s; actual binary compile11.48149s; total14.25842s.
- Both qcc command logs empty; ordinary dimensional checking was enabled.
- Native binary b51fc305dcf1047c2fb49120d9ee8e373b956ae64f129a059027f3f1f9a4885b.
- Generated _wave.c654c190f8ace5d281c48a461b2171e027a0b8238e3fb6bf57fe42a30953e0544.
- wave.c8358ae268ec83b239d4ddeffbbea14828582dddc9d263be67142858749a85426.
- wave-observation.h8e018f7eaa26a536f7d8e5b3ba30ebff0ab903f950ace30a536bbb2cd7d9d3ea.
- Frozen source-pins.json7e5ddf9b809ff75dd79bbca859fe40e3446873f203ff61e1ebe54041f42646f3.

Separate parser-only check run-u3293.scope /60801c47c9484c058c7e78ecacd92d35
exited0 for node --check compare-wave.mjs. It did not import the oracle, compare
invented measurements or run any fluid. Python sources were AST-parsed before
freeze. None of these are numerical wave acceptance.

## Actual translated caller inspection

The retained generated source uses -events for source review; the compiled binary
was built separately without that flag. Do not expect source-review event printouts
on numerical stderr or claim that a runtime event trace was executed.

The generated event_register at5905-5930 prepends newer same-name actions to the
existing event slot. event_do at5956-5975 executes that inherited chain. Actual
registration at68145-68159 therefore places user init_0 before native init, then
the separate initial_observation, with stop an ordinary event before the later
step slots. This confirms initialization is not called twice manually.

For each step the actual slots at68183-68251 order set_dtmax/stability, vof,
tracer_advection/diffusion, properties, advection/viscosity, acceleration,
projection, end_timestep and adapt. Inside vof, the chain is new passive vof_2
at68070 -> conserving vof_1 at63129 -> ordinary vof_0 at60760 -> empty centered
hook. Conserving calls vof_advection({f},i) at63343, then interfaces=NULL at63491;
the ordinary downstream call therefore has no interface to advance again.
tracer_advection runs our timing hook, restores interfaces at63498, then native
properties-related work. No caller reset or second simulation is introduced.

projection_0 at68079 starts the timer, native projection53454-53466 performs
project -> centered_gradient -> correction(dt), and only then the end_timestep
slot runs our observer at68081. Its nominal f-stage timestamp, actual VOF duration,
prior dt, solved velocity time and strict interval checks remain distinct fields.
No source inspection removes the declared native startup/stagger limitations.

## Actual geometry and wall reads

Generated observer moment code at66518 calls line_center(normal,intercept,fc,
&centroid), the 2D native volume-centroid implementation. At66526-66541 it uses
the returned local y in f*Delta²*(y+Delta*centroid.y), subtracting the per-cell
flat moment before the small perturbation accumulation. Raw roundoff and invalid
centroid branches are retained as written; no post-compile source patch occurred.

The four translated foreach_boundary loops match physical root/masked walls:

- left66882-66905 reads val(uf.x,0,0,0) at x=0;
- right67024-67047 reads val(uf.x,1,0,0) at x=1;
- bottom67166-67189 reads val(uf.y,0,0,0) at y=0;
- top67308-67331 reads val(uf.y,0,1,0) at y=1.08.

Each loop first finds the proper boundary ID and neighboring interior leaf, then
moves point back to that leaf and shifts displayed coordinates to the boundary
face. Length and coordinate checks use that same loop. No explicit uf-normal
callback was added; these read the native projected wall velocities.

All source and compile-output hashes were rechecked after inspection. The old
failed basin, accepted corrected-rest result, native archive and oracle are
unchanged. **No result-v1 directory exists here and neither coarse nor fine wave
binary was invoked.** The next numerical decision remains with root after this
generated-source checkpoint; the already-written runner retains the same fixed
pair and combined28s ceiling, with no automatic compile or extra scenes.
