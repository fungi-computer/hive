# Hollow copper kettle — accepted original art, 2026-09-08

Astra personally read the current brewhouse prop and its production bake/picking
callers, authored this bounded correction, and viewed the final native/desktop
2× sheet and all eight authored working phases in all four facings. Appearance
and the authored phase sequence are accepted. No live brewing, construction,
recipe, quantities, heat/gas simulation or hosted publication is claimed.

The existing kettle used a capped copper cylinder directly under permanent ale,
foam and fuel/flames. Removing the liquid therefore could not show an empty
vessel. The new original lathed cross-section has a real open mouth and inner
floor. The accepted palette, light rig, origin, 112×112 prop camera target1.1,
quarter-turn convention and 1.42×1.32 hearth size remain. The body deliberately
exceeds one cell; this is not a one-cell occupancy approval.

## Reusable art and actual caller contract

`kettleBody`, `kettleContents`, `kettlePaddle`, `kettleFire` and `kettleSteam`
are separately selectable geometry. They are not separately selectable game
entities: the body/content/paddle/fire bake resolves to the station's one target;
steam is a noninteractive sibling with exactly the same prop anchor. The current
production bake registers body alpha, and every animated body texture updates
its corresponding visible hit area. Steam never enlarges the click target.

The study's `empty/filled/working` adapter is illustration only. Production must
derive enabled parts from actual vessel/process/attendance facts. The visual
`level` parameter is not stored quantity or capacity. Staged solid ingredients
must not turn into liquid merely because the vessel is nonempty. Stirring follows
attended preparation, not unattended fermentation. Heat/steam may be a cosmetic
cue for selected kettle work; their appearance proves no thermal field. Current
`kettleFire` includes both logs and flame; cold staged fuel, if selected, needs
its actual goods presentation rather than automatically lighting the stove.

The existing closed fermentation tun already has reusable geometry and needs no
redesign solely to invent extra status pixels. Station footprint/access, finite
inputs, capacity, recipe, output and save-version policy remain Delivery's
ordinary brewing handoff decisions after v7 closure.

At the actual art integration handoff, give these primitives one shared art
module and make both the production kettle and original brewhouse study consume
it. Adapt imports and remove the old capped kettle implementation; do not ship
the ignored whole study as a second production art owner. The viewer wrappers
remain separate. Root has made no tracked art or runtime edit and supplies no
production patch before the actual station contract exists.

## Evidence and limits

Final owned run **run-u1880.scope**, invocation
`0ffdb3ea39b34ac0883e5e412f20c73c`, native session16567, normal **exit0**.
`render-v3/proof.json` records exact source hashes before/after, all unchanged:

- Ray through the empty mouth reaches the actual copper inner floor at
  Y=0.6200000048, below the former cap at1.27.
- Empty and liquid-present pixels differ in every facing. All body and steam
  phases have nonempty, contained alpha. Each facing has eight distinct body
  frames and eight distinct steam frames.
- Sixteen physical mouse checks select twelve visible bodies and reject four
  steam-only points to the background. Actual ticker advancement and Pause were
  observed; this is presentation animation, not a gameplay clock proof.
- Owner teardown removes the Pixi canvas and disposes shared textures once;
  repeated teardown produces no error. Errors are empty.

Final geometry SHA256:
`bbb117c06416d48d81e64f6096fe62c16890934f60af3bbb54fe281d8d7bb70d`.
Complete renderer/geometry/picking/study source inventory is in proof.json.

Earlier u1864 (`da08725fdf954942897ca688e2b9e2dd`, native81133) and u1871
(`acb98e886f7d43ff8bd0a66f645ec2b4`, native36108) also exited0. Their artifacts
are preserved; the final pass fixes annotation overlap, labels liquid honestly
and adds owner teardown. Kettle geometry stayed byte-identical across all three.
All native proof handles were retained/polled to terminal. No human server or
peer scope was stopped. No narrow-layout, whole-game, dynamic occlusion,
production contact or hosted proof is claimed by this isolated art acceptance.
