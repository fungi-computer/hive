# Actual voxel-to-gas caller qualification

2026-09-08. **The frozen 3D gas candidate now consumes actual canonical voxel
geometry through a checked caller.** World edits invalidate the caller before
another gas step. No topology remap, post-edit gas initialization or gameplay
digging physics was implemented.

## Evidence

One guarded command, no replacement run:

```
run-proof.sh node .botanical/research/environment-round3-20260908/gas-heat/voxel-binding-v1/qualify.mjs qualification-v1.json
```

Scope `run-u2862.scope`, invocation `4f583aff03ff46e89a420d5d7bcfae58`, retained
session `43642`, observed terminal exit 0. All six groups passed in **5.512 s
wall / 1.922 s CPU**, with process RSS 111.3 MB. `qualification-v1.json` records
the exact source pins, values and work. No old source or evidence changed.

## Geometry is derived from the real owner

The 8³ window at global voxel origin `[16,-50,-66]` uses exactly `[1,.54,1]` m
spacing and the corrected height-sea/cave/overlay world owner. It contains 439
geometric void cells and 73 solid cells. The retained generated 3×4×3 pocket
contributed 36 verified void cells; no broad cave search or preparatory dig was
performed. This is a clipped cave window with deliberately sealed boundaries,
not a naturally enclosed room or an accessible entrance.

All 512 cells were checked against `world.read`, their physical centers and
gas indices. Every face has the correct global axis/coordinates, area and
distance. Domain identity binds the full world/space/recipe, window and policy;
revision binds the authoritative world revision. Constructor window inputs
were copied. No separate material save is written.

The gas and brick array orders were tested with an actual material difference,
not merely different formula names. Filling world cell `[19,-47,-62]` changed
**gas index283**, while transposing y/z would select index227, which remained
air. Its world brick slot is291; the wrong axis order gives531, which also
remained air. Negative x/z boundaries at -1/0 and y at -17/-16 matched actual
brick snapshots and physical coordinates.

## Geometry query cost is not just compiled cell count

| Query | Point reads | Cold bricks | Base cells decoded | Column queries | Cave metric evaluations |
| --- | ---: | ---: | ---: | ---: | ---: |
| Main 8³ compilation | 512 | 4 | 16,384 | 1,024 | 16,384 |
| Separate 4³ negative-boundary compilation | 64 | 8 | 32,768 | 2,048 | 32,768 |
| Main compilation after eviction | 512 | 4 | 16,384 | 1,024 | 16,384 |

The main world retained at most two bricks /8192 bytes of decoded material;
the negative-boundary case used eight /32768 bytes. These numbers exclude
geometry, edits, state, checkpoints and JS overhead. The current frozen
`columnAt` calls `sampleCell` once per reported column query; that API also
derives display-neighbor terrain facts. Root's separate physical-height query
optimization was deliberately not folded into this proof.

Eviction changed neither world revision nor rebuilt gas geometry identity.
Canonical terrain overrides remained empty. Thus residency changes are not
physical edits or gas initialization triggers.

## Actual nonzero gas and exact restart

A fresh-study ambient fill was explicitly declared once, before any edits.
The geometric void label alone does not prove gas occupancy. At the current
fixed reference density this initial fixture implies 284.472 kg of carrier
air; that mass is not a saved finite-air inventory.

An actual source at `[19,-47,-62]` supplied 30 W and 1e-5 kg/s tracer for two
seconds. The first second was saved using the real world checkpoint and gas
state; a fresh world, point-read geometry and caches restored the exact same
second-second result and receipts.

| Result | Value |
| --- | ---: |
| Applied tracer source | 2e-5 kg |
| Applied heat source | 60 J |
| Tracer conservation error | 6.78e-21 kg |
| Heat conservation error | 3.55e-14 J |
| Final maximum face speed | .000905593 m/s |
| Final maximum temperature | 293.242031 K |
| Maximum substep cell flux imbalance | 9.94e-12 m³/s |
| Main-path pressure calls / iterations | 40 /2734 |
| Main-path scalar stages / face evaluations | 80 /90,560 |

The source/reload group took1.36 s, including cold world regeneration, file
round-trip, geometry and both continuations. It is not a numerical-only gas
runtime measurement. Pressure and scalar caches each built once on the main
path. All solid-cell quantities remained zero.

`world-checkpoint.json` contains ordinary world identity/revision/changes;
`gas-state.json` contains the existing method's canonical saved state. The
frozen gas format embeds a full geometry-identity descriptor for validation.
That descriptor is never used as terrain truth: restore rebuilds geometry from
the actual world and validates it. No extra terrain representation is admitted.

## Edits reject without quantity loss

Foreign world and realm bindings rejected before pressure calls. Then the
test filled the source cell with stone at revision1 and reopened it at
revision2. Both are real world edit receipts in `edit-receipts.json`.

- After filling, the old caller rejected before advancing gas.
- Rebuilt changed geometry rejected the old saved field.
- Reopening restored the original solid mask but not the old revision. The
  old field still rejected, including when called against the rebuilt shape.
- No extra solver call occurred. The old gas state remained byte-identical,
  retaining59.9341 J and1.99806e-5 kg tracer in the edited source cell.
- No new gas was initialized, no stock was remapped and no quantity was
  discarded. The world edit and old gas field are deliberately an invalidated
  pair; this is not an atomic, physically accepted gameplay edit.

## Physical decision still required

`DECISION.md` gives the caller's immediate source findings. The independent
[topology model review](../TOPOLOGY-MODEL-DECISION.md) agrees: fixed-density
Boussinesq cannot conserve implicit air while changing a sealed gas volume.
Opening one new .54 m³ cell cannot simply manufacture .648 kg of ambient air;
filling a cell cannot discard its heat/tracer/reference contents.

A zero-volume barrier change at rest is a narrower possible first physical
edit. Finite species/thermodynamics with a declared expansion/displacement law
is the recommended later direction; it has not been implemented here. The
current correct behavior remains a stale-geometry rejection, preserving the
old quantities until a supported joint world/physical transaction exists.

## Pins and scope

- Binding: `ee4be4b9e68e97a4a442d3bf51e02255efecc7ba43620538e54f6fe36ae44ef6`
- Qualification: `1e89e79f588033070d81e9db91961fea19f4eccaea7b2d1353bab8e62522d8d9`
- Voxel owner: `6aae7b83f71d95f30157f78603de9cc2f90a1d4bf0aab8818e03aebe355e6e3f`
- Height/sea owner: `530464448725cacb73836f34c2c48ddbf3e4a8c0d8a353498e7fe6da03f45bdf`

The global revision fence is coarse and may invalidate unaffected windows.
Geometry remains a borrowed research object, not a deeply frozen public API.
No viewer, production source, long suite, natural entrance, gas displacement,
water transfer, combustion, oxygen or world-capacity claim belongs to this
checkpoint.
