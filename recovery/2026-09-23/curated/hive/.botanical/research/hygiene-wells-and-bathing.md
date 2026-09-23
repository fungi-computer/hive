# Hygiene, wells, and bathing

Future direction from Levi, 2026-09-07. This is a small, darkly comic medieval
home loop: people need a place to relieve themselves and wash; later they may
bathe, shower, shave, and receive barber service. It does not alter the active
upstairs runtime, select a plumbing engine, or require bodily-function art.

## Sources and evidence boundary

- Dubwise's current [Steam Workshop description](https://steamcommunity.com/sharedfiles/filedetails/?id=836308268)
  says *Dubs Bad Hygiene* adds sewage, toilets, bathing, hygiene needs/mood,
  water, irrigation, and a Lite mode. Its July 2025 [change notes](https://steamcommunity.com/sharedfiles/filedetails/changelog/836308268)
  include water-tank transfer; they do not document a simulation algorithm.
- Dubwise's public [repository](https://github.com/Dubwise56/Dubs-Bad-Hygiene)
  is real and includes versioned definitions/assets plus the author Wiki. The
  [Wiki home](https://github.com/Dubwise56/Dubs-Bad-Hygiene/wiki) identifies
  hygiene, bladders, optional thirst, fixtures, heating, irrigation and
  washing machines as accumulated features. This study reads author-published
  design documentation, not decompiled RimWorld code or compiled assemblies.
- The author [Hygiene guide](https://github.com/Dubwise56/Dubs-Bad-Hygiene/wiki/Hygiene)
  is the strongest mechanics source here, albeit last edited in 2019. The
  author [Water guide](https://github.com/Dubwise56/Dubs-Bad-Hygiene/wiki/Water)
  describes the later well/pump/tower capacity chain.

Claims below labelled **verified DBH** describe that mod's published mechanics.
Claims labelled **Hive proposal** are original direction, not DBH behavior.

## Verified DBH lessons

1. **A manual tier can stand on its own.** **Verified DBH:** the minimal
   landing setup is a latrine, water tub, and primitive well when no river or
   pond is available. Tub water becomes dirty, requires refilling, and the
   latrine requires emptying. The author calls later systems optional
   convenience, not a prerequisite.
2. **Water and waste create visible work loops.** **Verified DBH:** emptying a
   latrine produces sewage drums that can be hauled to a dump, stored, tipped,
   or burned in a burn pit. The guide associates sewage/waste handling with
   contamination risk. The valuable lesson is custody and a named destination,
   not the mod's disease numbers or burn-pit rule.
3. **Fixture placement has consequences.** **Verified DBH:** people outside a
   home area search only a small radius for a toilet, and nearby wash access can
   support handwashing after toilet use. This makes a bathroom or field latrine
   a practical layout decision instead of a decorative prop.
4. **Automation is a later chain, not free teleportation.** **Verified DBH:**
   its flushing-fixture path requires a non-primitive well, pump, storage tower,
   and a sewage outlet. The guide does not require that outlet for showers or
   baths. Hot water can use heating equipment; a low-tech bath can use an
   adjacent campfire. The water guide gives wells and pumps capacities.
   These are useful progression examples, not a specification for Hive pipes.
5. **Service/maintenance matters.** **Verified DBH:** its guide names drain
   clearing by a cleaner, manual cleaning in hospital, contaminated towers, and
   treatment as a later remedy. This supports treating sanitation as occasional
   inspectable service, not an invisible mood modifier.

## What not to inherit

- Do not copy DBH definitions, jobs, balance, contamination/disease rates,
  pipe topology, research tree, or RimWorld scheduler behavior.
- Do not infer its internal water, sewage, pathing, need-decay, or disease
  algorithm from the guides. No such algorithm was reviewed here.
- Keep the first loop focused on readable household service, with no need for
  constant bathroom micromanagement, anatomy, thirst, illness, hot water,
  irrigation, grey-water recycling, or pipes to prove that loop.
- The current Workshop page is broad and the Wiki mechanics page is older;
  version-specific tuning must be rechecked before using it as a product fact.

## Hive proposal: one manual household fixture

The first future hygiene proof is one tiny home fixture when this slice is
selected. It does not supersede brewing as the next planned gameplay outcome:

1. One explicit, finite water-source stock at a well/pond edge; one physical
   filled vessel has a declared capacity and holder/location.
2. An ordinary **fill vessel** job claims the vessel, takes water from that
   source, and deposits it in one wash basin. No player bucket-pouring puzzle.
3. One actor can use the basin to clear a modest hygiene condition. A latrine
   satisfies a separate relief condition and increments a small waste container.
4. An ordinary **empty latrine** job claims that container, carries its sealed
   waste to one player-designated midden/dump site, and frees the latrine.
5. One ordinary **clean/refill** service restores the basin when it is dirty or
   empty. A barber chair, shave, hot bath, shower, pumps, and pipes remain
   later authored services.

The proof is useful only if the player can inspect water remaining, vessel
location, basin state, latrine capacity, waste destination, and the reason a
person cannot wash or use relief. It should show one complete source → vessel
→ basin → use → dirty/refill cycle and one latrine → container → midden cycle
without duplication through pause/save/reload or interruption.

### Work, needs, and Draft/Go

- **Self-care activities** (wash, relieve, later bathe/shave) are actor-local
  need responses with a reserved, reachable fixture while in use. They are
  neither shared construction/cleaning jobs nor a new job framework.
- **Service jobs** (fill, clean, empty, later barber) are ordinary shared work:
  they use existing movement, reachable work positions, material custody,
  claims, priority, pause, cancellation, and persistence rules.
- A drafted actor follows Draft/Go and does not spontaneously abandon a direct
  order for routine hygiene. A safe interruption point is required before a
  vessel transfer or latrine empty completes; undrafting permits normal need
  admission again. Exact urgent-need precedence is a future product decision,
  not an excuse to bypass Draft.
- Need decay must be slow enough that one missed visit creates a readable warning
  and a recoverable service problem, rather than a compulsory chore loop. The
  player can prioritize the shared refill/empty work instead of clicking every
  person through a bathroom animation.

### Shared ownership and placement

- The world/resource owner holds water quantity, vessels, basin/latrine state,
  waste containers, claims, and their save representation. A fixture never
  creates water or deletes waste merely because its art is hidden or unloaded.
- Building/floor geometry provides a reachable work/use position. The household
  should make the chosen basin and latrine visibly close to beds/kitchen work,
  while the midden has an explicit separate site. These are authored local
  placement rules, not a room simulator.
- A later environmental owner may consume a named waste-location or water-quality
  input for odor/contamination; hygiene must not create a second gas, heat,
  weather, or smoke field. Sol's ONI-inspired heat/smoke direction remains
  separate and owns those shared environmental quantities.
- The water source/vessel quantities must compose with the existing finite-water
  direction. A well in this early fixture is a named source with accounted fills,
  not evidence that flowing-water, pressure, or a pipe network exists.
- Its clean-water budget and any recharge are Hive-authored choices. DBH's
  documented groundwater areas, well/pump capacities, and contamination rules
  are a reference for readable constraints, not adopted well hydrology.

## Progression and book discovery

Early play teaches well, vessel, basin, latrine, midden, and service work. A
discoverable book/knowledge gate can later unlock a Dwarven-technology pump,
pipe, cistern, boiler, bath/shower, treatment, or barber service. Each must
replace a demonstrated manual transfer or reduce a specific maintenance burden;
none may silently give infinite water, instant cross-map distribution, or remove
waste without a destination. Technology should improve the house the player has
already arranged, including its floor layout, rather than bypass it.

## Existing association and limits

- Associate this future slice with [issue 10](https://github.com/fungi-computer/hive/issues/10):
  it already owns finite conserved water, explicit sources/sinks, hauling work,
  reload accounting, and a later pump direction. The hygiene fixture must not
  block its pond proof or select its fluid representation.
- Link it to [issue 3](https://github.com/fungi-computer/hive/issues/3) for shared
  floor/work-position layout and the later barber-shop idea. It must not delay
  the upstairs bedroom.
- Link it to [issue 14](https://github.com/fungi-computer/hive/issues/14) when a later
  authored compost/fertilizer or water-quality consumer exists. No automatic
  crop benefit follows from waste.
- Keep the future [environmental-fields decision](../../docs/decisions/environmental-fields-and-openings.md)
  as the sole heat/smoke/weather owner. This note selects no ONI-style solver,
  plumbing library, backend, new controller, or runtime work.

The strongest portable lesson from DBH is a staged household loop: manual water,
washing, relief, and visible service establish why later plumbing is desirable.
That is enough dark comedy and home-layout consequence before a larger sanitation
or environmental simulation earns its complexity.
