# Environmental fields, openings, and horticulture

**Status:** direct Levi direction, 2026-09-07. This is a future environmental
proof boundary, not a current home/controls implementation or a selected solver.

## Direction

Player-authored layout must change available actions and outcomes: a wall, floor
opening, vent, source, shade, route or material has consequences because it is
part of the same physical setting as the person, plant, fire and room. The
verified original *Stronghold Crusader* brazier → archer → burning-arrow →
pitch-ditch chain is reference evidence for that legible spatial causality; it
does not select its fire traps, RTS combat, or a universal chemistry system for
Hive.

The deterministic simulation eventually owns shared gas/heat/weather quantities
and their outcomes on the authoritative fixed world clock. Geometry owns solids,
air spaces, roofs, doors, stairs and openings/connectivity; cutaway is
presentation only. Weather boundary conditions, fuel/heat sources and
opening/material properties are explicit inputs. People, animals and plants read
their relevant local condition and apply their own authored rules; none keeps a
second air, temperature or weather model.

The first useful proof is deliberately narrow: **fire → smoke → vertical opening
→ vent → measured exposure** in one small two-level structure, with visible
boundaries and ordinary commands to open/close the vent. It must account for
source, sink and transported quantities rather than apply a scripted whole-house
smoke timer. A greenhouse then reads the same heat/opening/weather fields:
sunlight can warm it, overheating changes one growing condition, and venting can
improve it. This does not select illness, death, seasons, breeding, every gas or
full weather content.

## Scale and boundary constraints

Only active environmental regions and changing boundaries earn detailed work;
measure environment separately from actor, path/assignment and rendering costs.
Untouched outside space may be implicit, while changed quantities and edits must
persist. Chunk borders are storage/streaming boundaries, never invisible airtight
walls: cross-border exchange is counted once, and eviction/reload cannot clean,
reset or duplicate sealed-room air, heat or fluid. Stable regions may advance
coarsely only when the named behavior and accounted quantities remain true.

No numerical method, cell resolution, mixture representation, update cadence,
room approximation, general combustion model, ECS, backend or physics framework
is selected. A room graph may support queries but cannot become a competing
environment owner; smoke visuals read quantities and never create or delete them.
