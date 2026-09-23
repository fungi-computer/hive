# Matched new two-dimensional house layouts

2026-09-08. Predeclared source/config/limits are in `MATCHED-LAYOUT-PLAN.md`;
label-only parity is in `matched-source-pin.json`. Kernel67ce0968… is unchanged.
Reversing the fixture's peak-temperature output label exactly reproduces the
retained local180 fixture hash. No old0.5 m² outcome is a baseline here.

| Layout /exterior | Export at180 s | Upstairs exposure kg·s/m³ | Change from new sealed180 | Wall /user CPU |
|---|---:|---:|---:|---:|
| Sealed /2 m | 0% | .0002452042 | baseline | 9.220 /3.539 s |
| Local /2 m (retained) | 86.40% | .0002419232 | 1.34% lower | 3.658 /3.087 s |
| Remote upstairs /2 m | 76.29% | .0004876142 | 98.86% higher | 3.497 /3.289 s |
| Local /4 m | 83.72% | .0002419188 | extent check | 9.387 /7.360 s |

Local exhaust exports smoke rapidly but only slightly reduces accumulated
upstairs exposure by180 s. That1.34% advantage is not a validated gameplay
guarantee: room spatial/timestep error is unmeasured. Remote-high exhaust draws
smoke through the upstairs breathing region in this declared model. This is
not a universal claim about high outlets. Lower breathing-region exposure falls
37.32% with local and41.24% with remote-high exhaust relative to sealed.

Doubling exterior changes local upstairs exposure by0.00185%, passing the
predeclared5% boundary-sensitivity bound. Final indoor tracer changes2.54%
(127.25 versus130.56 mg). Far-boundary export time changes because that
measurement boundary moves:80% export at163.85 versus171.55 s. Export timing
alone cannot diagnose indoor ventilation accuracy when the domain changes.

All cases passed finite/positive stock and physical/numerical screening:
mass error≤3.04e-17 kg, heat error≤5.08e-9 J, max divergence1.15e-11 m³/s,
max scalar Courant≤.1627. Peak anomaly10.6836 K gives ΔT/Tref=.03644, below
the predeclared.05 Boussinesq screen. No heat clamp or coefficient tuning.
This prerequisite does not validate3D entrainment or turbulence.

The first two new cases use256 cells; exterior4 uses480 cells and278,992 PCG
iterations. Shared-host contention appears in sealed wall9.220 s versus CPU
3.539 s; these times are not a scaling claim. All three cases ran serially and
finished within individual25 s caps. No retry or finer sweep occurred.

The original900-second80% export/25% exposure target remains incomplete.
The next numerical assignment must isolate timestep/spatial uncertainty on
this same physical fixture. Matching the game's proposed non-square voxels is
a separate metric task in `ANISOTROPIC-METRIC-PROPOSAL.md`; do not silently
resize this house or reinterpret the current evidence.
