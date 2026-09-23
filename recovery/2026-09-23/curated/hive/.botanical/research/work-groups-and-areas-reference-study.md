# Work groups and areas: RimWorld reference, Hive direction

**Scope.** Future organization research for a possible 100-person nation. This
does not add a worker system, copy mod code, or claim that group policies exist
in current Hive or vanilla RimWorld.

## What the sources actually establish

### Official RimWorld / Ludeon boundary

- Ludeon describes RimWorld as individual colonists with backgrounds that can
  enable or rule out kinds of work, and as a game where people, animals and
  prisoners can form caravans. It also describes taming/training animals and
  farm animals that can be worked, milked and sheared. This establishes a useful
  **person/animal/party** distinction, not a group-policy implementation.
  [Official game page](https://rimworldgame.com/)
- A Ludeon 1.6 update notes a new fishing category in the work tab and a change
  that prevents farm animals roaming away under a particular condition. That is
  current official evidence that work categories and animal movement controls
  exist in the product surface; it does not document animal areas, saved teams,
  or spatial job filters. [Ludeon update, 2025-08-28](https://store.steampowered.com/oldnews/?appgroupname=RimWorld&appids=294100&feed=steam_community_announcements&l=english)
- No available official Ludeon description in this check establishes that vanilla
  has player-defined colony groups, group work templates, or policy-bound work
  areas. Do not attribute those features to vanilla from the mod examples below.

### Author-owned / Workshop references

- Fluffy’s [Work Tab source repository](https://github.com/fluffy-mods/WorkTab)
  says it expands work types into individual tasks, supports a time scheduler,
  and offers up to nine configurable priority levels. It also says it intercepts
  vanilla priority reads/writes, warns that fine task priorities can deadlock,
  and rejects an automatic labor allocator as impractical with RimWorld’s
  pawn-seeks-work model. The original repository release listed is 2022; this is
  a design reference, **not evidence of current RimWorld 1.6 support**.
- The original [Work Tab Workshop page](https://steamcommunity.com/sharedfiles/filedetails/?id=725219116)
  is marked removed and last updated in 2022. A later “Continued” listing is a
  separate fork, not Fluffy’s current author release. Version claims therefore
  belong to the specific fork, not to this source.
- [LTO Colony Groups’ Workshop page](https://steamcommunity.com/sharedfiles/filedetails/?id=2345493945)
  describes pawn grouping and optional management of work, priorities,
  preferences and colors; it says players can hide the group mechanic. Its page
  shows version tags through 1.6 but is also currently marked incompatible and
  removed. Treat it as a feature example, not a compatibility recommendation.
- VouLT’s [Better Pawn Control README](https://github.com/voult2/BetterPawnControl/blob/master/README.md)
  describes saving a colonist/animal policy and applying areas, outfits, food,
  drugs and work in one action, including an emergency policy toggle. Its README
  does not itself establish a current game-version guarantee. Its useful lesson
  is a named, inspectable preset with an explicit bulk activation.

## Proposed Hive vocabulary and authority

| Term | Future meaning | Must not silently mean |
| --- | --- | --- |
| **Organization** | Named social/administrative membership, display/filter and possibly permissions or roles. A realm, household, guild or castle court may outlive travel. | A party, a route leash, or a job-priority override. |
| **Party** | Temporary travel/draft scope with members, destination, supplies/cargo and explicit departure/return state. | A permanent employer, work template, or ownership shortcut. |
| **Work group** | A named saved set of people plus an activated ordinary-work policy: eligible work categories, preference order, and named permitted/forbidden work zones. | A new scheduler, a global faction reputation, or permission to erase individual limits. |
| **Work zone** | A named spatial predicate for a declared kind of routine work: for example castle service, garden, staging yard or remote forestry. | Ownership, discovery permission, a physical barrier, or a guarantee that a worker can reach every cell. |
| **Travel restriction** | A route/admission constraint for routine travel or a party journey, with an explicit crossing exception. | A substitute for work-zone filtering or an invisible hard trap during danger. |

This permits Levi’s desired policy: the King remains in a **castle activities**
work group whose routine policy permits court/inn/administration inside castle
zones and excludes remote forestry. A forestry group can take ordinary field
work. The King’s organization/role remains true even when drafted, travelling,
recovering, or removed from that group.

## Policy contract before scale

1. A policy filters **routine job offers**; it does not mutate jobs, actors,
   claims, materials or zone geometry. Existing typed job/claim admission still
   decides target validity and custody.
2. Every multi-stage job names its work site, pickup source, delivery/staging
   destination and route. Policy evaluation must say which stages are permitted.
   Otherwise a “castle-only” actor can be accidentally assigned remote hauling
   through a local workbench, or a forester can cross a forbidden boundary just
   to fetch an input.
3. Use explicit precedence, recorded in the receipt: safety/passability/custody
   validation first; then direct Draft/Go and declared emergency/escape; then
   party travel; then an actor’s ability/availability; then active work-group
   policy. Organization is informational unless a concrete permission check
   names it. A direct order must report whether it temporarily suspends or
   cancels routine policy.
4. Escape, medical recovery and fire/life-safety egress may leave a work or
   travel zone. They must preserve carried-item custody, make job/claim
   disposition explicit, and either resume/reoffer work or state why it cannot
   resume. They are not a covert way to bypass routine policy.
5. Conflicting groups require a declared rule before implementation: one active
   policy, or an ordered merge with a visible winning rule. “All groups match”
   can deadlock a large colony; “any group matches” silently widens access.
   Zone edits/reassignment need revisioned receipts so a queued offer cannot use
   a stale policy.

## Smallest eventual proof

On one small map, give a King and a forester one shared ordinary-work list,
one castle zone, one remote forest zone, and a named staging store. Activate a
court policy that accepts one castle service job and rejects a forestry job;
activate a forestry policy that does the converse. Verify the offer reason,
actual pickup/work/delivery stage, and no duplicate claim/cargo. Then direct the
King to Go outside the castle and trigger one escape/recovery interruption;
prove the direct order’s policy disposition and later ordinary-work recovery.

This proves filtering, staging and interruption semantics. It proves neither
100 actors, countries, automated policy design, remote streaming, animal-area
behavior, or broad faction/party systems.

## Practical limits carried forward

- Start with a few named policy groups and zones that serve an observable
  player decision. Do not make all new arrivals inherit a complex template by
  default; an explicit default is itself a policy decision.
- Show the first rejected stage and policy name in inspection. A color on a pawn
  bar is insufficient when a task was rejected because of source, destination,
  travel or safety.
- Keep animal husbandry areas, people’s work zones, party travel, and emergency
  flight as separate future consumers sharing only declared movement/claim
  facts. Their similar UI does not make them one generic area framework.
