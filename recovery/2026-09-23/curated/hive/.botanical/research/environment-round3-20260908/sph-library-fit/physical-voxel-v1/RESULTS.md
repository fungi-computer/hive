# The first metric hydrostatic fixture fails

One approved native run, no tuning or repeat. The failure is preserved at
`result-v1/result.json` with exact source, binary and frozen-library hashes.
The `result-v1/source/` directory retains the actual harness and proposal used.

The 600-particle, 540 kg water column was **not hydrostatically stable** under
the tested mass-matched initialization and Akinci sampled walls. Exact restart
of the earlier falling-block fixture remains valid for its separate trajectory;
it never implied this new pressure/boundary qualification.

## What failed and what the observer established

The fixed physical geometry was one 1 m square basin, 1.08 m high, containing
water initially 0.54 m deep. All six exact faces were sampled with 2722
deduplicated static points. Particle volume was 0.0009000000000000002 m3,
mass 0.9000000000000002 kg, radius 0.0520020955763 m and support radius
0.208008382305 m. The actual summed mass was 539.999999999994 kg.

Initial bulk density was close to the intended rest density: 72 interior
particles all measured 1.0031451313 times rho0. The wall region instead reached
1.7808772766 times rho0. Thus this was not the previous uniformly overpacked
compression block, but the boundary quadrature was incompatible with the
near-wall physical initialization.

The first 0.001 s step already produced 2,159,400.74 J of kinetic energy,
215.24 m/s maximum speed, and 0.09527 m center penetration beyond a wall.
The fluid's upward boundary force that step was 24,597,155.36 N; expected
hydrostatic support is only 5297.4 N. This is a failure at startup, not merely
insufficient time for a column to settle.

Over the entire 1 s packet:

| Criterion | Result |
| --- | --- |
| Mass drift <=1e-9 kg | Pass: exactly zero relative to initial sum |
| Pressure/divergence cap hits =0 | Fail: one pressure cap at 100 iterations; no divergence cap |
| Center penetration <=1e-6 m | Fail: 213.5505 m maximum |
| Both-pressure impulse closure <=1e-7 normalized | Pass: 1.2496e-11 worst normalized error (6.6195e-11 kg m/s absolute) |
| Late support within 5% of Mg | Fail: 20.4393% error |
| Late horizontal force <=2% Mg | Fail: 2.1510% |
| Late RMS speed <=0.05 m/s | Fail: 70.7970 m/s |
| Late vertical COM error <=0.027 m | Fail: 0.85675 m |
| Late horizontal COM error <=0.01 m | Pass: 0.003908 m |
| Mechanical-energy overshoot <=2% | Fail: 1693.7686 times initial potential energy |
| Final bulk mean absolute density error <=3% | Fail: 20.5619%, 38 remaining sampled bulk particles |

The observer separately reads the density and divergence warm coefficients,
undoes their dt scaling, and uses the retained pre-advection positions and the
completed actual neighbor lists. Its agreement with momentum change minus
gravity establishes that it is measuring the actual solver impulses in this
fixture. It does **not** establish a good fluid pressure law. Raw warm fields
remain labeled as raw coefficients, not pascals.

The initial minimum center clearance was 0.045 m. The nominal-radius sphere
already intruded by 0.007002 m, and the equivalent-volume sphere by 0.014894 m.
These initial sphere overlaps are explicit SPH representation observations;
they were not counted as initial center leakage or used to move a wall. The
subsequent actual center crossings are unambiguous failure.

## Actual bounded cost

- Guard: `run-u2956.scope`, invocation
  `5228c2f4baea444e8273991634f85d65`, terminal exit 1.
- Native execution plus runner capture/parse interval 9.6418 s; 1000 fixed
  0.001 s steps; numerical stepping
  9349.15 ms, ordinary observer 259.10 ms, initial/final all-pairs density
  observation 15.46 ms, initialization 5.20 ms.
- Native query **including** stable sorting: 4367.71 ms. Its nested sorting
  component: 513.44 ms. Do not add those two as separate costs.
- Pressure solve 1876.42 ms; divergence solve 2127.26 ms. Maximum iterations
  100 and 20 respectively.
- Stable sorting processed 1,200,000 lists, 23,333,652 neighbor entries and
  140,086,576 comparisons. Process peak RSS 21,952 KiB.
- `periodicOutputMs` is periodic stdout only. The recorded 9.6418 s interval
  also includes final native CSV/export and runner capture/parse, but excludes
  the earlier source-copy/hash work and final receipt serialization. There
  was no allocation trace and there is no allocation-free claim.

This escaped, sparse cloud is not a representative steady-liquid performance
benchmark. Its cost cannot establish how many game water particles are viable.

## Smallest next boundary decision, before more dynamics

The native author's fluid-block builder starts centers at `boxMin + 2*radius`
(`Simulator/SimulatorBase.cpp:1467`). Our approved finite-volume quadrature
instead begins at half a sampling cell from the exact wall. The library's
default 0.8 volume reduction and this geometric standoff are material parts of
its standard initialization. Simply copying a block's nominal dimensions into
a water-volume contract is therefore insufficient.

Recommend a **cold planar-wall density/gradient qualification** next. Keep the
same physical wall plane, mass rule and failed evidence. Compare its Akinci
boundary contribution against the independently integrated cubic-kernel solid
half-space at declared distances. For radial kernel W with support R, fluid
distance d>=0 from a plane has continuum missing-solid kernel contribution:

```
B(d) = 2*pi * integral(r=d..R) r*(r-d)*W(r) dr
dB/dd = -2*pi * integral(r=d..R) r*W(r) dr
B(0)=1/2; B(R)=0
```

The analytic comparison can distinguish an intended effective standoff from
sampling error before another expensive tank run. A reduction of dt alone is
not a repair for an initially compressed projection: the density-correction
coefficient scales with inverse dt squared. Do not change mass, rho0, wall
location, threshold or repair escaping positions merely to make this receipt
pass. Any alternate initialized distribution must bind the same 540 kg and
account for its initial gravitational energy and different free surface.

The maintained Koschier2017 density-map and Bender2019 volume-map alternatives
are present in the frozen library, but require real Discregrid map construction
and their own physical qualification. They are not an innocent enum change:
`TimeStep.cpp:309-346` and `:449` contain penetration position/velocity
corrections. Switching to them would require an observer that accounts for
those extra impulses and the changed position phase. No map implementation,
solver replacement, refinement or ledge run has begun.

## Source/build receipts

The first harness compile (`run-u2954`, invocation
`35e4416aae5a4497badd810059abb33d`) failed only because the parameter API takes
a mutable pointer for its gravity setter. Exact source/command/log are retained
in `compile-v1-failed/`. The correction made that local input non-const;
`run-u2955`, invocation `a49dcdf597664df9a2372022dfbd209d`, compiled successfully.
Neither compilation rebuilt or modified the frozen libraries.

No production, upstream, prior source, viewer dataset, tracked game file or
old test threshold was changed. No broad proof or second numerical run remains
active.
