# Why original *RollerCoaster Tycoon* works — decisions for Hive

Date: 2026-09-07. This is a bounded product study, not an implementation plan or
an exhaustive history. It joins current control/building work to issue
[#12](https://github.com/fungi-computer/hive/issues/12) and later scale work to
[#6](https://github.com/fungi-computer/hive/issues/6). No source or tracked
document is changed by this note.

## Evidence boundary

Claims about original RCT behavior below come from the [original manual bundled
with the Deluxe Steam distribution](https://cdn.akamai.steamstatic.com/steam/apps/285310/manuals/rollercoaster_tycoon.pdf).
Claims about development choices come from Chris Sawyer's [developer
FAQ](https://www.chrissawyergames.com/faq3.htm), his [asset closeups](https://www.chrissawyergames.com/feature3.htm),
and an [interview with Sawyer](https://medium.com/atari-club/interview-with-rollercoaster-tycoons-creator-chris-sawyer-684a0efb0f13).
OpenRCT2 is deliberately not evidence here: it is a later RCT2 reimplementation,
not original RCT1 source. It may be useful later as a clearly labelled modern
reference, never as proof of RCT1 internals.

## What the original establishes

### A tool is a small conversation, not a one-shot command

- Construction arms a landscape cursor with the required footprint and an
  orientation arrow before placement; the tutorial then has the player position
  and click it. The construction window keeps only controls relevant to the
  current ride and stage. The manual also teaches repeated path placement by
  holding and moving the mouse. [Manual: placement, orientation and constrained
  choices](https://cdn.akamai.steamstatic.com/steam/apps/285310/manuals/rollercoaster_tycoon.pdf)
  (pp. 10–11 / 76–77).
- Right-click is consistently destructive/reversing in construction contexts:
  remove a misplaced object or path, select a track section to change, or
  demolish a prior section; removal exposes its refund consequence. It is not
  evidence that RCT used one universal right-click cancel rule. [Manual:
  removal and selection](https://cdn.akamai.steamstatic.com/steam/apps/285310/manuals/rollercoaster_tycoon.pdf)
  (pp. 12–13 / 50–53 / 76–77).
- Pause stops park time *and* prohibits building in the original. [Manual:
  toolbar pause](https://cdn.akamai.steamstatic.com/steam/apps/285310/manuals/rollercoaster_tycoon.pdf)
  (pp. 58–59). That is a coherent historical contract, but not automatically
  Hive's: our current source intentionally admits pending commands while paused
  without advancing the fixed simulation.

**Inference for Hive:** preserve a persistent selected tool across successful
placements, but treat each gesture as a bounded proposal with one clear exit:
right-click/Escape cancels the proposal/tool before terrain selection; a valid
release produces one command batch and one receipt. Do not borrow RCT's
right-click semantics piecemeal as a global delete action.

### Visibility is an authored construction aid

- RCT's construction marker shows footprint/orientation, continuously updates
  standard-design price, and withholds a price when the location is invalid.
  [Manual: live footprint/cost/invalid feedback](https://cdn.akamai.steamstatic.com/steam/apps/285310/manuals/rollercoaster_tycoon.pdf)
  (pp. 18–19).
- It provides see-through rides/scenery, underground and underwater views,
  invisible supports/people, gridlines, and height marks for land, tracks and
  paths. Height marks specifically assist joins and complicated ride alignment.
  [Manual: occlusion and height controls](https://cdn.akamai.steamstatic.com/steam/apps/285310/manuals/rollercoaster_tycoon.pdf)
  (pp. 60–61), [height use](https://cdn.akamai.steamstatic.com/steam/apps/285310/manuals/rollercoaster_tycoon.pdf)
  (pp. 54–55).

**Inference for Hive:** the current green/red ghost, footprint tint and
`RELEASE TO ORDER` caption are the correct immediate analogue. For floors, add
an explicit active storey plus reversible cutaway/roof/foliage presentation;
make height, support and blocked-site reasons visible at the proposal. These
remain presentation/query facts over the same physical world, not duplicate
floor state in the UI.

### Simulation earns trust by answering the player's last question

- The tutorial's loop is build → connect entrance/exit/path → test → inspect
  measurements → open. Test data is initially absent, then fills after a
  successful run, and explains excitement, intensity and nausea as information
  for revision and pricing. [Manual: test and measurements](https://cdn.akamai.steamstatic.com/steam/apps/285310/manuals/rollercoaster_tycoon.pdf)
  (pp. 14–15 / 54–57).
- The manual connects player action to observable system response: a placed
  path deducts money per piece; a worker receives a radio call on breakdown;
  recent messages can be opened for details. [Manual: tutorial feedback and
  worker response](https://cdn.akamai.steamstatic.com/steam/apps/285310/manuals/rollercoaster_tycoon.pdf)
  (pp. 10–15 / 62–63).
- Sawyer says the initial ambition was a set in which players could design,
  build and test coasters, and that he valued construction, tinkering and
  watching the little world run. [Sawyer interview: construction/test core](https://medium.com/atari-club/interview-with-rollercoaster-tycoons-creator-chris-sawyer-684a0efb0f13).

**Inference for Hive:** make the receipt answer the particular order: accepted
site/tree IDs and material reservation now; then visible actor task, delivery,
work and completion later. A generic success toast or an opaque activity icon
is weaker than a causal chain a player can inspect. Pacing should alternate
short, reversible plans with autonomous payoff, rather than make every action
an immediate state change or a long unexplained wait.

## Three Hive interaction traces

These are recommendations grounded in the current callers, not claims that the
behavior is already shipped.

1. **Repeat building now.** The player chooses Wall, sees the current
   `construction-view.js` ghost line, red/green validity and wood count, drags,
   and releases. `main.js` resolves the same `dragCells` result into build
   commands; the fixed command admission returns applied/rejected results; the
   HUD shows the accepted blueprints/sites and its tool remains armed. Right
   click or Escape before release clears the gesture and tool, with no command.
   Observable payoff: stakes/footprint then delivery/work changes, rather than
   an unexplained successful click.
2. **Shared clearing now.** With no actors selected, the player chooses Chop,
   drags an area, and sees the real unassigned standing-oak target count. On
   release, freeze that exact ID list, submit once, and render the receipt as
   shared jobs; Escape/right-click before release cancels without selecting
   terrain. With actors selected, `C` remains a direct order and `Shift+C` a
   queued one—both must show the actor's actual `task.job` or queued position.
   Observable payoff: the assigned actor walks/works, or the player sees an
   exact rejection rather than a stale preview.
3. **Floors later.** The player selects a storey, toggles cutaway, draws a room
   outline and gets an explicit support/occupancy/material preview. Commit
   creates fresh sites/jobs; a followable worker and build progress explain the
   delay. A saved blueprint is only a reusable relative proposal, never a
   copied world snapshot. Observable payoff: the same intended room remains
   understandable when roofs/front walls would otherwise occlude it.

## Transferable engineering choices vs. historical constraints

| Keep the principle | Do not copy the constraint |
| --- | --- |
| A bounded, data-shaped world and a visual representation that makes the active construction constraint legible. Sawyer describes building the data/display system around functioning, good-looking coasters and revising the isometric display as needs emerged. [Interview](https://medium.com/atari-club/interview-with-rollercoaster-tycoons-creator-chris-sawyer-684a0efb0f13) | RCT1's 99% x86 assembly implementation. Sawyer identifies old PC performance limits and later portability cost; this is evidence for measuring hot work, not for abandoning typed ownership or portability. [FAQ](https://www.chrissawyergames.com/faq3.htm), [interview](https://medium.com/atari-club/interview-with-rollercoaster-tycoons-creator-chris-sawyer-684a0efb0f13) |
| Consistent camera angles, lighting and silhouettes; assets composed for their displayed scale. Sawyer's asset page says most graphics were 3D models pre-rendered at game scale, often with detail intentionally not visible at that size. [Asset closeups](https://www.chrissawyergames.com/feature3.htm) | Fixed 8-bit palette, fixed isometric projection, and large bitmap inventory as a required platform strategy. This does **not** mean original RCT lacked quarter-turn camera rotation; the manual documents Rotate. These were tradeoffs of the era, even though some yielded useful color processing. [Interview](https://medium.com/atari-club/interview-with-rollercoaster-tycoons-creator-chris-sawyer-684a0efb0f13), [manual](https://cdn.akamai.steamstatic.com/steam/apps/285310/manuals/rollercoaster_tycoon.pdf) |
| Let display work be driven by concrete consumer needs. Use baked original art where the projected scale benefits, with source art retained and a clear bake boundary. | A premature renderer/ECS/pool framework, or claims about capacity. Issue #6's fixtures—not RCT mythology—decide which assignment, path, render or allocation cost needs a bounded optimization. |
| Explain simulation through visible consequences, keyed to stable commands/results and inspectable facts. | RCT's specific money economy, guest mood model, ride physics or rule set; Hive needs colony causality, not a theme-park reskin. |

## Prioritized recommendation

1. **Current controls/building (#12):** retain the existing persistent build
   tool and right-click/Escape cancellation precedence, but make one shared
   proposal derive preview count, submitted commands and post-admission receipt.
   The source already has a `dragCells` preview/submission seam and
   `CommandResult[]`; protect that seam rather than add a second planner. Make
   the accepted/rejected result name the ordered sites/trees and preserve the
   direct-versus-queued actor distinction.
2. **Next floors:** ship active-level, height/support reason and reversible
   cutaway as construction comprehension aids before elaborate room systems.
   Keep them outside command truth; a floor is not an excuse for UI-owned
   occupancy or a new controller.
3. **Later scale (#6):** measure fixed-step simulation, assignment/path work,
   render projection and input separately at rising population. Prefer
   data/query narrowing and event/topology revisions only where fixtures show
   a cost. The transferable lesson is responsiveness plus legibility under load,
   not a specific 1999 implementation technique.

### What not to copy

- Do not make pause prevent harmless planning merely because original RCT did;
  retain Hive's explicit “commands admit, world does not advance” contract if
  it remains clear in the UI.
- Do not overload right-click to mean both “cancel current tool” and
  “immediately destroy world state.” Cancellation must win while a proposal is
  active; deconstruction later needs an explicit job/confirmation contract.
- Do not turn every invalidity into hidden simulation or every preview into a
  render-only promise. The exact command result remains the authority.
- Do not copy low-level assembly, palette, resolution or fixed-isometric-projection
  limits,
  and do not infer performance numbers from RCT.

## Draft issue comments — do not publish

### #12 — Colony controls and Caps UI

> RCT's durable interaction lesson is a persistent construction mode with a
> pre-spend footprint/orientation/invalidity signal, followed by feedback that
> explains the placed thing. For Hive, keep the current XState tool lifetime
> and Caps/OpenTUI input ownership, but make a single derived proposal feed the
> ghost/count, submitted command batch and `CommandResult[]` receipt. While a
> proposal is active, right-click/Escape cancels before selection or future
> deconstruction. This supports repeat placement without treating a green
> preview as an accepted command; direct and queued work remain visibly
> distinct through actual actor task/job facts.

### #6 — Measure colony scale to 50–100 people

> RCT is evidence for the product requirement—busy simulations must remain
> readable and responsive—not for copying its x86/palette implementation.
> Measure the current fixed-step command/admission, assignment/path work,
> render projection and input independently as population rises. Prefer
> narrow derived data and revision-bounded caches only after fixtures expose a
> cost; preserve exact command results and replay before considering a new
> storage or ECS seam.

## Open choices deliberately left open

- The exact later storey model and room-outline vocabulary. This study only
  establishes the player need for legible height/occlusion and reversible
  planning aids.
- Which scale measurement first reveals a real cost. No performance estimate
  is asserted here.
