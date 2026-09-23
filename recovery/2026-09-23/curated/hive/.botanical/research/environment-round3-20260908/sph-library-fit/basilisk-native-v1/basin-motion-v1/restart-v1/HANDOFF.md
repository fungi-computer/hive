# Preserved restart source checkpoint — implementation paused

Levi's game-scale correction supersedes further reference restart implementation.
Root is prioritizing conservative game-scale flow and explicit real-time budgets.
**No codec, integrated restart caller, compiler or restart simulation was begun.**
No process is live in this lane. The last water native process was u3477, which
reached terminal exit0 and released retained session84453. Gas owns its independent
processes; this handoff makes no claim about them.

## Exact useful findings

- Native output.h:1031–1045 excludes all face fields from dump, including uf.
  centered.h:143–147 also marks p/pf nodump. A native dump does not preserve the
  complete moving pressure/transport state.
- centered.h:203–221 always rebuilds uf from u and runs properties/stability.
  Installing a moving face field before this init would overwrite it.
- timestep.h keeps an inaccessible function-static previous value for its
  timestep growth limiter. Resetting it silently changes the adaptive clock.
- output.h:1411–1417 advances schedules through events(false). Those calls
  mutate event counters even without actions; they are not a harmless query.
- Native end_timestep runs while global t is still the current interval's
  beginning. A completed-step checkpoint needs an explicit phase; native dump's
  current t/iter alone is ambiguous for a moving-state continuation.
- tree.h:1432–1455 stores the literal mask in negative cell.pid boundary IDs;
  dump records leaf flags and scalars, not those IDs. The fixed mask must be
  rebuilt and validated, rather than inferred from dump's field shapes.
- Pressure initial guess, g and mgp.nrelax need explicit preservation/decisions.
  Ghosts and native derived properties must be reconstructed at their existing
  owner with clear timing; their numerical influence cannot be assumed absent.

## Preserved working source shape

`native-owner.patch` is the complete small proposed overlay:

1. `run.h` keeps the existing integrator loop. Optional completed_boundary runs
   after iter=inext/t=tnext. An optional restart entry initializes via the native
   defaults/init action chains, then installs a validated completed-boundary
   checkpoint before the ordinary events(true) loop. It does not use native
   restore catch-up as a substitute for saved calendar state.
2. `timestep.h` exposes the existing previous value through get/install helpers;
   normal timestep arithmetic is textually unchanged apart from the variable
   being moved to the same module's scope.

These hooks were proposed to avoid mid-dispatch calendar surgery. They are
**uncompiled and unqualified**. No claim of correct initialization, bitwise
restart, persistence or a usable integration API follows from this patch.
Original native header bytes are in `upstream-original/`; upstream is unchanged.

`wave.c`, its three observer headers, `compile-wave.py` and
`SOURCE-INVENTORY.json` were copied from the accepted transport reference as
preparation only. **They are not wired to these hooks**; the copied compiler
recipe/pins are not a runnable restart checkpoint. There is no native field/face
codec, restart runner, or new physics result.

`BASELINE.json` pins the accepted u3477 source/build/result handoff and original
native headers. All prior rest/wave/SPH failure and acceptance evidence remains
untouched. Resume this source only if a later game-scale integration needs this
exact lifecycle knowledge; 2cm/2mm restart qualification is not the current gate.
