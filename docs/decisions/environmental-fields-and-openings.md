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

## Evidence and implication boundary

The reviewed ONI evidence now includes a Klei developer interview, official
historical patches covering energy/conductivity/phase change, crops/overlays and
automation, plus the narrow public `Grid.Mass` mod API. It supports coupled,
inspectable quantities and failure feedback; it does **not** establish ONI's
mixture solver, active-cell scheduling, update order, or deterministic replay.
Future Hive experiments and the separate 5/25/50/100-actor benchmark remain
independent of World Lab geography work.

Four water references stay distinct: Tikal's filtered Corriental reservoir;
Xochimilco raised-field/canal agriculture; Hawaiian `auwai`/loʻi gravity
allocation and maintenance; and Roman gravity conveyance/distribution through
routes, tanks, and branches. They support authored source/route/capacity,
storage, upkeep, and downstream consequences—not one generic ancient system.
Hive's product direction is early/middle gravity channels, cisterns, and
terraces, with later Dwarven pumps and controls as an efficiency/progression
choice rather than a gate on all water. Transfers must be actual source → route
→ capacity changes, never decorative timers.

The accepted shallow utility clarification remains: one buried pipe segment may
share a top-ground cell with its cover; Lay/Expose/Repair/Remove/Cover work must
preserve pipe contents and restore normal surface presentation. Current levels
are logical storeys, not volumetric diggable terrain. Keep upstairs first and
brewing next; no solver, plumbing framework, or runtime implementation is chosen
by this evidence record.

Future compost-air and Naturhus-inspired utility direction remains a typed,
finite composition: direct process air may pass through active compost,
biofilter, greenhouse and vent, while a sealed heat exchanger transfers energy
to a separate air/water circuit without exchanging gases, water, or nutrients.
Power, heat, water, feedstock, nutrients, and storage remain accounted balances;
separation, storage, pumping, and biological treatment are distinct owners.
Water quantity, nutrient inventory, and quality/contamination stay distinct, with
no automatic potable flag. Pumps and separators are supported future mechanisms.
For the specifically identified Torpadal house, the corroborated cutting pump
does supersede the earlier grinder-unverified wording; other Aquatron examples
remain separate evidence and do not inherit that machinery. This remains later
utility and hygiene direction after upstairs then brewing, not a current runtime
choice.

Deferred cute/gross goblin hospitality direction: inn piss, shit, and vomit
cleanup/collection can feed separated finite wastewater/compost treatment,
gardens, and more food for goblins without killing them. Collection, transport,
treatment, water, solids, nutrients, and contamination remain distinct facts
owned by ordinary shared jobs and their typed resource/environment owners; no
immunity or free-food conversion follows. The deployed generated Goblin
hospitality concept approves ROOM/environment/filth tone as inspiration, but its
generated CHARACTERS are not Hive art direction: retain the accepted figure style
and do not modify pinned HTML/PNG. This is future direction only.

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
