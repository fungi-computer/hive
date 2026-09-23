# Recorded gas dataset handoff

2026-09-08. Ready for the existing visible lab owner to render. This lane owns
only ignored numerical data; no UI, game source, asset publication or deployment
was changed.

## Files to consume

| File | Bytes | SHA256 |
| --- | ---: | --- |
| `sealed.json` | 1,089,753 | `6c57ce852695bcdfc9f5263ee1b350fe988a29d8459ff20f13fe091bee1d892e` |
| `ports.json` | 1,101,227 | `eb0af363f13b4524a5797dbe3b368a8b17ec43766928b710c067c01c547ae174` |

`manifest.json` lists both cases, exact numerical source pins, fixture and
measurements. Each case is independently loadable with its full geometry,
units, algorithm version and 46 time samples. Source paths inside the metadata
are provenance, not browser assets to fetch. The viewer does not need any
solver module to play these recordings.

Required presentation meaning: **recorded native Node solver experiment**.
Playback/scrubbing changes the displayed saved sample, not simulation time.
These are two separate exploratory observations, not a validated ventilation
comparison. No ambient exterior domain, oxygen or combustion is simulated.

## Coordinate and field contract

- `geometry.size=[8,10,6]`, axes `[x,y,z]`, world y vertical; x is the fastest
  cell index, then y, then z. Cell/face `center` is already in metres.
- Origin `[-4,0,-3]` is in global voxel indices; spacing `[1,.54,1]` is metres
  per voxel. Prefer each saved cell's `at`, `world` and `center` over deriving
  another coordinate convention. The solid shell is explicit.
- The sealed case has 192 air cells. The port case has 194 because two solid
  wall cells become actual air throats, not decorative cutouts.
- `frames[n].timeSeconds` is the exact authoritative recorded clock; samples
  span 0…45 s. The source runs only during [0,20). Its cutoff was admitted to
  `advance` as a simulation event, not attached to rendering.
- `tracerKg[i]` is kg in cell i. Concentration in mg/m³ is
  `tracerKg[i] / geometry.metric.volume * 1e6`.
- `heatJ[i]` is signed thermal anomaly in J in cell i. Kelvin is
  `constants.referenceKelvin + heatJ[i] / (rhoKgM3 * cpJKgK * cellVolume)`.
  It is not degrees and must not be colored as such without this conversion.
- `faceVelocityMS[k]` is canonical velocity along the positive `faces[k].axis`
  direction. Negative means reversed flow. A missing solid/closed face carries
  zero flux. For a derived cell-center arrow, average the two incident faces
  for each axis, including zero for a closed face; do not create another
  independently simulated velocity. Face area and distance are saved.
- Displaying a slice should preserve the solid mask and exact local slice
  index. Do not blend solids into tracer stock or stretch y from .54 m to 1 m
  without an explicit display-only vertical exaggeration label.

The source is 60 W plus 1e-5 kg/s passive tracer at the saved source cell. It
produces a gentle warm plume, with sampled maximum temperature about 294.074 K
(20.924 °C). Fixed scales across time help distinguish dissipation from changing
color normalization. Any color/opacity is a display mapping, not emitted mass.

## Actual proof

One ordinary guarded command:

```
run-proof.sh node .botanical/research/environment-round3-20260908/gas-heat/visual-dataset/export.mjs
```

`run-u2799.scope`, invocation `0382d8c800284f2696dfe597eabc25d1`, retained session
`90671`, observed terminal exit 0. Both cases completed in **1.311 s wall /
1.444 s CPU**, including observation/export work. Process RSS was 117.2 MB.
CPU can exceed wall time because runtime/GC work may use other threads. No
browser or rendered-image proof occurred in this lane.

| Measurement | Sealed | Two explicit openings |
| --- | ---: | ---: |
| Recorded samples | 46 | 46 |
| Recorded final clock | 45 s | 45 s |
| Sampled maximum temperature | 294.073829 K | 294.073820 K |
| Sampled maximum face speed | .147031 m/s | .147989 m/s |
| Sampled max ΔT/Tref | .00315139 | .00315136 |
| Maximum substep cell flux imbalance | 1.354e-11 m³/s | 9.999e-12 m³/s |
| Maximum sampled tracer ledger error | 3.253e-19 kg | 5.421e-19 kg |
| Maximum sampled heat ledger error | 1.364e-12 J | 1.819e-12 J |
| Pressure calls | 463 | 463 |
| Pressure iterations | 25,688 | 26,420 |
| Scalar Euler stages | 926 | 926 |

Temperature and speed extrema in the file's aggregate `measurements` are
**maxima over exported one-second samples**, not unobserved intermediate
substep extrema. The volume-imbalance maximum comes from `advance`'s actual
substep maximum. The source's Boussinesq screen is checked at observation times.
No interpretation should silently strengthen this evidence.

Every sample passed finite-field, solid-stock, method/domain identity,
positive-temperature, source-integral and conservation checks. Observation
and array emission left the caller's state/clock/ledgers byte-identical.
Geometry/solver/transport/constants came directly from the frozen
`transport-v2/checkpoint`; no equations were forked for the visual fixture.
Its full source pins are in each JSON and the manifest.

These coarse cells support qualitative visual exploration only. They do not
establish quantitative room exposure, opening pressure-loss accuracy,
production throughput, combustion, oxygen use, solid heat transfer or gas
behavior after digging. The existing analytic qualifications own their
separate evidence; neither playback nor a visually appealing plume replaces
those checks.
