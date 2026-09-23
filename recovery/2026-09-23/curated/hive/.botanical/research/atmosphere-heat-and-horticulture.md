# Atmosphere, heat, weather and horticulture

Direct Levi direction, 2026-09-07. Future environmental simulation; current
home/controls and optional art remain separate playable slices.

## Desired experience

Levi selects Oxygen Not Included as another reference: gas tracking, outdoor
weather, greenhouses, overheating, ventilation and indoor-fire smoke damage.
This extends his Stronghold interest in complicated wall layouts with fire traps:
the things a player builds should materially change what can happen there.

A greenhouse admits useful sunlight, retains warmth and can overheat. Opening a
vent or changing its shade changes growing conditions. A stove/fire changes heat
and atmosphere. Smoke can travel through an opening into an upper room, and a
ventilation route can reduce exposure. Plants respond to their actual local
conditions; a greenhouse label does not grant an unconditional growth bonus.

Klei's official page establishes ONI's linked oxygen, warmth and sustenance
survival focus: https://www.klei.com/games/oxygen-not-included . This note does
not claim to have inspected ONI's internal solver or to reproduce its rules.
Community claims about one-element-per-cell simulation are not an adopted Hive
constraint. Steam's publisher listing confirms the original title/date, not a
fluid solver implementation: https://store.steampowered.com/app/457140/Oxygen_Not_Included/ .

## Proposed source ownership

- The deterministic simulation owns environmental quantities and outcomes.
- World geometry owns solids, air spaces, roofs, doors, stairs/openings and their
  current connectivity. Camera cutaway never changes ventilation or insulation.
- Environmental updates consume weather boundary conditions, heat/fuel sources,
  and opening/material properties. Rendering reads the resulting fields.
- Plants/animals/people read relevant local conditions and apply their own authored
  growth, care, exposure or activity rules. They do not maintain independent air.
- Weather is seeded world state/events on the authoritative clock, not SSE arrival
  timing. Outdoor temperature, sunlight/shade, wind and precipitation are explicit
  inputs; crop conditions and indoor climate are derived from their local setting.
- A future AI steward issues the same valid vent/fire/work commands as a player.
  Neither an LLM response nor particle animation decides whether air is safe.

Current Hive is a small fixed-step scene, not a gas simulation. This note defines
what the next environmental experiment must show; it adds no solver, engine,
package, feature flag, backend or atmospheric state to current source.

## First representation to test

Use a small active volume grid aligned with actual world cells and Z levels as
the first experimental candidate. Store conserved gas constituent quantities and
thermal state; derive display temperature/composition from them. Smoke can begin
as an explicit transported exposure quantity, rather than an entire chemical
catalog. A room graph can support connectivity/queries and summaries without
becoming a competing atmospheric owner.

Flow is permitted across connected faces according to actual openings and authored
permeability. Compare a simple conservative local exchange model with the minimum
buoyancy/transport behavior required by the upstairs-smoke case. A full general
Navier–Stokes/combustion solver is not assumed. Exact cell resolution, numerical
method, mixture representation, update cadence and error bounds remain experiments.
A well-mixed-per-room approximation alone would miss local concentration and
vertical stratification; use the desired scene to decide whether any coarser model
is sufficient before choosing it for large areas.

Smoke particles/billboards visualize quantities; deleting an offscreen particle
must not delete smoke, and adding decorative particles must not create damage.
Gas volume, mass/constituents, energy/temperature, liquid amount and solid material
are distinct concepts. Finite water, evaporation/condensation and gases can connect
later through explicit exchanges with conserved quantities and named sources/sinks.
Do not conflate all of them into one occupancy/color flag.

## First useful experiment

1. One small two-level test structure with a closed lower room, an upper room,
   an opening between floors, and an exterior vent. Keep boundaries visible.
2. One explicitly fueled source changes heat and atmosphere while simulation runs.
   Opening geometry and source state determine the changes; there is no scripted
   timer that simply marks the whole house smoky.
3. Inspect smoke/temperature at the source, upper room and vent; show exposure on
   one simulated occupant. Low oxygen affects the authored fire rule if included
   in this slice. No comprehensive illness/death engine is needed.
4. Open the vent through an ordinary command. Show altered flow/concentration and
   occupant exposure. Close it and verify the new geometry is respected. Tests
   should account for sources, sinks and transported amounts, not promise perfect
   real-world physics.
5. Use the same heat/opening behavior in a separate greenhouse case with one plant:
   sunlight warms it, overheating changes its growing condition, venting improves
   that condition. The plant reads the field instead of owning a second weather
   or temperature model.

Split these into small iterations if needed. One fire/vent case precedes plant
variety, every gas, breeding and complete weather seasons. Play feedback should
establish warning readability and reversibility before tuning severe consequences.

## Scaling questions to measure

- Only active environmental regions and changing boundaries need detailed work;
  no full-world scan or LLM call each rendered frame. Separate actor, environment,
  path/assignment and rendering measurements.
- Seeded untouched outside space can be implicit. Do not allocate all empty air
  for an unlimited world or every Z level. Persist actual player/environment edits
  and the quantities required for correct continuation.
- Chunk borders are storage/streaming boundaries, not invisible airtight walls.
  Cross-border exchange must be counted once. Eviction/reload cannot reset a sealed
  room to clean air or duplicate fluid/heat.
- Stable/offscreen regions may be advanced more coarsely only if the approximation
  preserves the named behavior and accounted quantities. A burning, occupied or
  changing connected region cannot be marked dormant just because it is offscreen.
- DO hosting and offline time remain later integration; a render chunk does not
  automatically get an independent simulation clock or Durable Object.

## Player-facing requirements

Temperature/air overlays need clear active-floor navigation and concise local
readouts. A warning should identify cause and possible response, such as a hot
closed greenhouse or smoke entering through an upstairs opening. The normal view
stays charming and readable. Alerts and Bramble's tutorial can teach one mechanism
at a time. Basic shelter/ventilation behaviors must remain usable without paying
for an AI steward.

Link this direction to existing multi-floor #3, world/chunks #4, water #10,
lighting/nature #11 and horticulture #14. If a dedicated atmospheric owner is
needed, use one bounded future issue linked to those, not a parallel physics PM
or broad engine task. The current release order remains home → upstairs → caravan.
