# Native build and physical caller, before numerical execution

The complete official source is pinned and the qcc toolchain/caller compile.
**The basin binary has not been executed.** Root review precedes the prepared
single 28-second-ceiling physical packet. Geometry, material, interval and
physical thresholds are those declared in the preceding SOURCE-FIT.md.

Build receipts:

- `u3202 / 4328c73137c14a599cb1405ba15a4409`: exit2 in9.714s. Directly targeting
  libast.a bypassed the interpreter submake's include path, so ast.h was not
  found. The exact recipe, partial build and log remain in toolchain-build-v1.
- `u3203 / 28c1e055e1054fb1a2aaf45d824f6d2c`: exit0 in6.755s. Build the required
  interpreter.o in its own subdirectory, then libast.a and qcc. Existing good
  objects from the prior attempt were reused, so this is incremental elapsed
  time, not a clean-build benchmark. At most two compiler jobs throughout.
- `u3210 / 7ae6c1976eeb4d01bcd4e1514078578b`: exit0 in15.047s. qcc generated C
  for source review, then compiled the native basin with -O2/-Wall and ordinary
  dimensional checking enabled. No compiler warnings; no binary execution.

qcc SHA256 `b7429c88f8e39253015d549bfdbd18ce6253833992ff08e3bf738cb1a3521828`.
Native basin SHA256 `08bfb3585a886a4cf1f78b7e5ae3b87a9a4c36f5155adb34d0a1c778779fcc6b`.
Archive/read comparison is in ARCHIVE-COMPARISON.md; all numerical/core files
match the earlier reviewed bytes. No package, viewer, MPI/GPU or shell-startup
work. Configuration/generated Makefile metadata belongs to this build only.

## Actual caller and observation

`basin.c` uses quadtree → centered → two-phase → conserving with the maintained
event inheritance. `basin-observation.h` reads the actual fields and ordinary
ghost pressures. There is no external pressure solve, analytical pressure
assignment, mass correction, wall offset, embedded cell or new equation.

The 1.28m/N64 grid is masked at literal x=1 and y=1.08. Initial water occupies
y<.54, with f exactly one or zero at the aligned cell centres. Water density1000,
air1.2kg/m³, gravity9.81m/s²; mu=0, no surface tension/filtering/adaptation. All
normal face velocities are zero at the closed walls; centered velocity has
no penetration and free slip. Pressure keeps the original solver's gravity-
balanced Neumann boundary conditions. All f/u/p initialization occurs only at
startup; the initial pressure guess is zero.

The initial observation is a separate i=0 event **after** inherited centered
initialization has populated uf and mixture properties. It validates geometry,
fraction bounds, both phase stocks and actual bottom/top boundary lengths and
coordinates. It does not demand hydrostatics before the first projection.

After each completed numerical timestep the caller rejects nonfinite values,
unconverged/cap-hit projection, timestep/CFL violations or failed physical
criteria. It measures both cell and actual face speeds, both stocks, water COM,
the full gauge-adjusted pressure profile and bottom-minus-top wall traction.
That traction is computed from adjacent interior/ghost pressure pairs at the
actual wall faces, not from Mg substituted into the answer. The analytical
piecewise water/air pressure exists only in the observer and the independent
expected support is5303.75688N per metre depth.

The observer asks for actual native stencils; their ordinary derived ghost
caches may be refreshed. It does not write canonical f/u/p/uf or call another
projection. Timing hooks inherit existing vof/tracer/projection chains and only
read a monotonic wall clock. Per-row projectionSeconds is that projection
stage's elapsed time; per-row vofSeconds is cumulative VOF time. Terminal stage
totals must not be added to wallSecondsIncludingObservation. These include
small event-hook overhead and do not isolate every allocation or every helper.

## Checked generated event/time shape

`caller-build-v1/_basin.c` preserves the translated source. Its event registration
block was personally read: user init chains before native init; the independent
initial observation and ordinary scheduled stop precede the last timestep
handlers. Ordinary stage chain order remains set_dtmax/stability/vof/tracers/
properties/advection/viscosity/acceleration/projection/end_timestep. Timing hooks
chain ahead of their existing same-name handlers. In particular, VOF's actual
iteration argument reaches the existing sweep owner unchanged.

One ordinary run advances until the scheduled .1s stop. DT=.001 is a maximum;
the existing CFL/growth limiter and dtnext choose actual substeps. The end hook
records `t+dt` for completed velocity, `t+dt/2` for staggered f, and the exact
interval; rest expectations do not depend on that timestamp difference. The
normal stop event runs before another last-handler step and verifies the last
completed interval is .1s. No run-per-tick or named-event pseudo-step API.

`run-basin.py` pins the actual compiled caller, preserves stdout/stderr, reports
native exit/timeout/RSS and checks complete, contiguous recorded intervals. C
nonfinite tokens, if any, are retained as diagnostic strings rather than
clamped. The ordinary upstream performance footer stays in stdout.log. This
runner is prepared only; result-v1 does not exist at this checkpoint.

No exact restart, moving water, 3D corner, ledge, finite-gas coupling, dynamic
mask/unmask or world-performance claim is made. Earlier SPH failures and their
accepted exact-restart evidence remain untouched.
