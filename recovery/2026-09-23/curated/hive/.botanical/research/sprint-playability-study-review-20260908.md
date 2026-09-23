# Sprint playability study review — 2026-09-08

Read-only Game CTO synthesis. No new web research was needed. This review informs
sprint choices; it does not replace current source, ADRs, issues, Delivery
ownership, or Levi's play judgment.

## Sources actually read

- `rollercoaster-tycoon-study.md`, `diablo-design-lessons.md`,
  `runescape-progression-lessons.md`, `darkest-dungeon-design-lessons.md`,
  `stronghold-crusader-design-lessons.md`, and `dont-starve-systems-study.md`.
- `colony-controls-references.md`, `rimworld-right-click-references.md`,
  `colony-ux-caps.md`, `room-blueprint-seam.md`, and `rimworld-storage.md`.
- Tracked `docs/decisions/architecture-proof-sprint.md` current status and
  brewing boundary, plus `docs/decisions/home-expeditions-and-living-world.md`.
- Retained Dwarf Fortress/Prison Architect material in
  `latest-world-direction-20260907.md` and `a-home-between-realms.md`.

## Actionable principles

1. **Make every order an inspectable causal chain.** RCT's useful lesson is
   proposal, validity/cost, commitment, then observable response. One derived
   target/shape must feed Hive's preview and submitted intent; authoritative
   admission returns exact accepted/rejected targets, followed by visible
   assignment, carrying, work, waiting reason, and completion.

2. **Keep selection, designation, direct work, and drafting distinct.** The
   retained DF, RimWorld-mod, and Prison Architect evidence supports clear mode
   boundaries and visible release. Selection issues no work; shared Chop does
   not require a selected person; direct priority names its person and target;
   Draft gates Go and has an explicit Undraft. Pausing admits ordered intent
   while time and work stay frozen, per Hive's accepted contract.

3. **Let physical custody make production satisfying.** Stronghold, RuneScape,
   Diablo, and RimWorld storage all make inputs, location, capacity, conversion,
   and use legible. Wood and mugwort should share one lot/container/claim/transfer
   owner before brewing. A shelf is a destination with bounded capacity, not a
   second inventory, and claims never create quantity.

4. **Use one small completed chain to prove extensibility.** The first brew
   should visibly move finite ingredients through reservation, transfer,
   workstation work, unattended deterministic fermentation, one output, and
   storage/use. A second recipe over the same supported process should be data;
   a new behavior earns a typed primitive rather than another haul/activity
   branch.

5. **Make space explain possibility.** RCT and Stronghold support explicit
   level, footprint, support, access, capacity, and blocked reasons. Floor
   controls, geometry/picking/order fixes, cutaway, bed contact, and the actual
   clearing minimap should all present the same authoritative cells and actor
   facts. Presentation must not become occupancy, path, or simulation truth.

6. **Alternate short plans with autonomous payoff.** RCT's build/watch/inspect
   cadence and Darkest Dungeon/Diablo's preparation/return cadence favor a
   readable rhythm: designate or place, watch people solve it, inspect a
   shortage, adjust, then receive a useful home outcome. The small-world demo
   needs this loop before a longer expedition can amplify it.

7. **Add breadth only through a first useful consumer.** Don't Starve's seasons,
   machines, and thresholds and Stronghold's environmental combinations argue
   for a few deep interlocks, not a universal ecology engine. Farms, atmosphere,
   animals, realms, shops, knowledge, gear, and caves remain durable future
   direction until one concrete home or journey action needs their rule.

## Small-world consumers and dependency order

| Packet | First real consumers | Player-visible exit |
| --- | --- | --- |
| Current spatial/control correction | Ground/Upper controls, build/Chop gestures, bed contact, geometry/picking, clearing minimap | Choose the intended level without selecting stairs; preview and order the intended cells/targets; watch the correct person/site on the real clearing; cancellation changes no world fact. |
| Shared goods and mixed storage | Chopped wood, gathered mugwort, actor cargo, build sites, one shelf/container | Both goods use the same transfer/capacity laws; last-space competition, waiting, cancellation/drop, save/reload, and quantity conservation are visible and deterministic; superseded commodity branches are removed. |
| First brewing loop | Mixed shelf, one finite ingredient route, one workstation, one recipe/output | Gather/store ingredients, reserve and deliver them, perform work, leave fermentation running while another task proceeds, then store or use exactly one output. A second supported recipe is definition-only. |

The current atlas inspection/navigation packet can proceed independently under
its existing owner. It supports later world play but does not replace the tiny
clearing's fun gate. Room stamping waits for stable level-aware picking and the
existing placement owner; its first proof is a one-storey relative template
that creates fresh ordinary sites/jobs. Live caravan play waits for responsive
world coordinates, durable edit/residency proof, and a controlled adjacent-chunk
crossing with real actor/cargo identity while home work continues.

## Evidence limits and unresolved claims

- There is no retained comprehensive Dwarf Fortress or Prison Architect study.
  DF coverage is bounded to creator squad/work-order history plus a community
  labor manual; PA coverage is bounded to creator Quick Build/change-log notes,
  pause/cancel examples, and Levi-approved interaction direction. Neither game
  was run, and no current universal keymap is established.
- RimWorld right-click evidence comes from mod-author sources; vanilla behavior
  is not proven. Official storage notes establish shelf headline capacity and
  books, while detailed filters, priorities, linking, and rendering are
  secondary/unverified.
- RuneScape evidence separates current RS3 primary material from secondary OSRS
  mechanics. Darkest Dungeon's GDC abstract was read but the talk was not
  watched. Don't Starve editions/DLC are not mechanically interchangeable.
- No study proves Hive's fun, timing, recipe balance, storage capacity, actor
  count, or half-hour cadence. Those require a coherent preview, focused
  correctness/performance evidence, and Levi's play feedback before replanning
  the next sprint.
