# RimWorld storage reference

Read-only research, 2026-09-07. Primary sources are Ludeon’s official Steam
announcements; the wiki and Steam discussions below are secondary descriptions.

## Verified from Ludeon

- The official 1.4 announcement says shelves hold “up to 3 stacks of most
  items” and that a one-tile mini-shelf exists. Ludeon describes the purpose as
  tidier, organized, protected storage: [Update 1.4](https://store.steampowered.com/news/posts/?appids=294100&enddate=1665179782&feed=steam_community_announcements#119).
- The official 1.5 announcement says books are readable items and bookcases
  store them. It names distinct book outcomes: textbooks raise a skill,
  schematics advance research, novels improve recreation faster, and tomes
  advance Anomaly research. It also says bookcase storage increases room
  beauty, speeds nearby research benches, and improves reading XP and
  recreation: [Update 1.5](https://store.steampowered.com/news/posts/?appids=294100&enddate=1711219601&feed=steam_community_announcements#84).
- The same announcement says the search UI finds items and structures and
  defaults to `Z`; this is useful precedent for finding stored objects without
  turning storage into an inspector-only interaction.

The official announcements do not specify the full storage filter/priority
algorithm, exact per-cell stack rules beyond the shelf headline, linked-shelf
semantics, or whether every book is rendered as a separately distinguishable
spine. Those details should not be treated as primary evidence.

## Secondary mechanics reports

The community-maintained [Shelf reference](https://rimworldwiki.com/wiki/Shelf)
reports that a normal two-cell shelf holds six stacks (three per tile), acts as
a stockpile with item filters and priority, protects contents from deterioration,
and allows pawns to place or retrieve items without standing on the shelf tile.
It also reports linked shelves sharing settings and named shelf groups usable by
bills. The page labels itself an unverified article; use these as mechanics to
check against the game, not as requirements copied into Hive.

The same page says the 1.4 change made shelves three stacks per tile and added
linked groups, while 1.5 added named storage groups. This aligns with the dated
official capacity headline, but the detailed limits and UI behavior remain
secondary. Steam player discussions independently describe storage filters,
five priority levels, shift-selection and linking, but are anecdotal rather
than developer documentation: [shelf settings discussion](https://steamcommunity.com/app/294100/discussions/0/677328983116763328/).

## Implications for Hive

The useful pattern is a physical storage object with explicit capacity and
filters, where a claim reserves a particular free slot/quantity and hauling
transfers the item into that owner. A shelf should not mint material or create a
second inventory: its capacity is a destination constraint alongside piles,
actor cargo, work sites, and later chests. If linked settings are ever useful,
linking should share policy only; each shelf still owns its physical slots and
claims.

For the requested cozier presentation, make stocked shelves visibly communicate
contents while preserving item identity in state. “Individually visible books”
is a Hive design choice inspired by the official bookcase feature, not a verified
claim about RimWorld’s renderer. A small number of authored book/spine variants
can show occupancy without requiring a general inventory UI. Keep this separate
from the first two-person home proof and from any broad storage framework.

Pitfalls are overloading a cell with an abstract count while drawing a full
shelf, allowing two haulers to reserve the same slot, treating filters as
material ownership, and making linked shelves duplicate capacity. The first
useful Hive proof would be one chest or shelf receiving a real carried item,
rejecting a filtered item, showing the occupied slot, and preserving the claim
through interruption/cancellation.
