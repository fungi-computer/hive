## Current needs, hospitality and social decision — 2026-09-09

Levi explicitly requires shared hunger, thirst, tiredness and later social needs
for player characters and other residents, not a thirsty-customer special case.
He requested RimWorld, Hospitality, prisoner-management and social-mod research.
Astra personally read the primary material below and the immediate Hive callers.
This expands the architecture of the planned inn release, not the current runtime.
The earlier opinion/bond/knowledge sections remain applicable.

### Findings from the actual sources

- **Hospitality** composes guest services with ordinary pawn needs. Its
  `Pawn_NeedsTracker_Patch.ShouldHaveNeed` enables joy, comfort, beauty and room-size
  needs for guests. `JobGiver_BuyFood` consults `pawn.needs.food` to determine
  priority and delegates acquisition to a job. Its author describes beds,
  entertainment, trade, relationships and recruitment. We adopt shared personal
  state plus service/access policy; we do not need runtime Harmony patching.
  [Author description](https://github.com/OrionFive/Hospitality/blob/develop/Steam%20description%20EN.txt),
  [needs caller](https://github.com/OrionFive/Hospitality/blob/6b6769769e8ed556d18f4a67606e1a1eb5d4fb30/Source/Source/Patches/Pawn_NeedsTracker_Patch.cs),
  [food caller](https://github.com/OrionFive/Hospitality/blob/6b6769769e8ed556d18f4a67606e1a1eb5d4fb30/Source/Source/JobGiver_BuyFood.cs).
- **Prison Labor** extends work assignment, schedules, supervision and prisoner
  access. Its `Need_Motivation` reads existing food/rest categories, and its food
  delivery patch skips warden delivery when the prisoner can obtain food. Those
  are separable nutrition, assistance and access decisions. In Hive, confinement
  must not create another hunger or haul implementation. Prison Labor is a useful
  candidate for Levi's remembered mod, not a confirmed identification of it.
  [Author description](https://github.com/Aviuz/PrisonLabor),
  [motivation](https://github.com/Aviuz/PrisonLabor/blob/f75a4dbcbb7d967062bf21901099484754eba88c/Source/Core/Needs/Need_Motivation.cs),
  [food access caller](https://github.com/Aviuz/PrisonLabor/blob/f75a4dbcbb7d967062bf21901099484754eba88c/Source/HarmonyPatches/Patches_Food/StopIfPrisonerCanGetFoodByHimself.cs).
- **Locks** was created to let prisoners use doors without leaving them open
  and losing indoor temperature. The important distinction for Hive is permission
  to operate a door versus the door's current physical opening. An allowed zone
  is not a wall and a room label is not ventilation geometry.
  [Author repository](https://github.com/Aviuz/Locks).
- **Dubs Bad Hygiene** explicitly adds hygiene-related needs and infrastructure;
  its thirst add-on provides drinking-water consumers. Author options support
  selecting which bodies have needs. That supports a needs applicability contract
  and shared water services; it does not mean every being must eat or drink, or
  that vanilla thirst behavior has been established by this study.
  [Thirst author page](https://steamcommunity.com/sharedfiles/filedetails/?id=2582878800),
  [author options](https://github.com/Dubwise56/Dubs-Bad-Hygiene/wiki/Mod-Options).
- **RimWorld social direction** explicitly separates changing opinions,
  relationships, context-dependent interactions, fights, marriage/divorce and
  returning people. That is a richer model than a single friendship bar.
  [Tynan's developer account](https://ludeon.com/blog/2016/01/progress-continues/).
- **Vanilla Social Interactions Expanded** has a concrete meal-together caller
  which checks appropriate food and distinct usable nearby seats, including
  reservation, danger and access. Its teaching worker weights opportunities using
  opinion and a relevant skill gap, then changes skill on actual interaction.
  This is a useful connection between social life and Hive's discover/learn/share
  direction. Readability can use **Interaction Bubbles**, whose documented purpose
  is presenting social interactions. Speech must project a settled event.
  [Meal caller](https://github.com/Vanilla-Expanded/VanillaSocialInteractionsExpanded/blob/d6541b905d28f633c8e1ac232a6e9e6a0ff434f3/1.6/Source/VanillaSocialInteractionsExpanded/GatheringWorkers/GatheringWorker_MealTogether.cs),
  [teaching caller](https://github.com/Vanilla-Expanded/VanillaSocialInteractionsExpanded/blob/d6541b905d28f633c8e1ac232a6e9e6a0ff434f3/1.6/Source/VanillaSocialInteractionsExpanded/Interactions/InteractionWorker_Teaching.cs),
  [Interaction Bubbles](https://github.com/Jaxe-Dev/Bubbles).

Read scope: selected public source/callers and author descriptions, not a running
RimWorld installation, complete game decompilation, mod compatibility test or a
promise to clone their balancing. GitHub trees were pinned at Hospitality
`6b676976`, Prison Labor `f75a4dbc`, and VSIE `d6541b90`. Some author README wording
is historical; the recommendations above rely on the named behavior, not a claim
about every current workshop release.

### Five facts with five owners

| Fact | Owner and rule | First consumers |
| --- | --- | --- |
| Hunger, thirst, rest | Needs owner: applicable definitions, current amount, rate/threshold state and advancement tick | Residents, player characters, guests; later prisoners/animals where applicable |
| Physical means of care | Materials and contact: actual food/water quantities, container access, bed/seat reservation and use | Eat, drink, sleep, assisted delivery, service |
| Mood | Derived current needs/conditions plus applicable memories; never another food quantity | Readable discomfort, satisfaction and later behavior weights |
| Social history | Bounded memories with cause/participants/witnesses; directed opinions derived from them and durable bonds | Chat, shared meals, disagreements, trust and invitations |
| Status and permissions | Membership, visitor terms, allowed areas, control grants and later custody remain separate | Resident/guest/prisoner access, self-service, work policy, AI/human controls |

A guest joining the colony preserves the same person, needs and memories. An AI
controller changes decision authority, not metabolism. An incarcerated person
still needs the same food; a lock changes the available means of reaching it.
Food preferences/physiology are definitions or traits, not hard-coded actor names.
Goblins may enjoy a mess that humans dislike without being universally immune to
smoke, bad water or every disease.

### First implementation boundary

Migrate existing `Actor.rest`, `clearing.step` rest decrement, sleep recovery and
`routine.updateRoutine` decisions together. The new need state cannot coexist
indefinitely with an independently mutable rest meter. Keep need advancement
separate from choosing a response and executing physical work.

Initial definitions cover nourishment, hydration and rest, with a small closed set
of supported rate/effect primitives. Definitions select applicable bodies and
authored thresholds. Finite current values and last advanced tick are canonical;
UI percentages and urgency labels are derived. Comfort/recreation/hygiene can
join later without changing every actor caller. Do not build arbitrary saved
callbacks or an unrestricted needs scripting language.

Self-care is ordinary intent over the existing scheduler and movement owner.
Accessible, permitted, suitable, unclaimed food/water/contact is selected using
those owners. The same condition can be satisfied by self-service or by a caregiver
bringing the actual lot. A failed route, reserved cup or denied pantry means the
need remains unmet and the reason is visible. Work priorities do not authorize
stealing, teleporting food or bypassing locks.

The future contract is conceptually:

```text
fixed tick advances a person's applicable needs
  -> policy chooses work or one self-care intent
  -> ordinary assignment/reservations/movement execute it
  -> actual eating/drinking/contact produces a checked outcome
  -> needs apply that outcome once
  -> witnessed social/mood consequences are recorded
  -> hospitality evaluates this visit using those facts
```

This is an ownership sketch, not an invented runtime API. Item removal and need
gain must settle atomically or through one durable pending receipt; there can be
no crash/reload gap that eats a meal without credit or credits it twice. Shared
meal participants each consume their own portion. Bed rest accrues only while
the reserved contact is genuinely in use. Consumption and visit settlement have
different receipt identities and rules.

The ordinary clock is sufficient: stagger needs/social opportunity checks and
integrate changes over known ticks, with no per-agent timers. Preserve changed
rate boundaries rather than retroactively applying a new modifier to elapsed time.
Pause freezes physiology, thought decay and interaction time; admitted plans can
still change. Continue resumes paused with no offline advancement today.

Use enter/recover thresholds and minimum commitment to avoid oscillation. Normal
needs interrupt at a safe activity/edge boundary and reconcile cargo via its owner.
Draft suppresses routine self-care but not need depletion, with visible warnings;
automatic emergency undrafting or collapse is a separate design choice. Start
with forgiving, reversible consequences. Needs should create reasons to build a
working kitchen/water/bed arrangement, not require repeated manual feeding clicks.

### First social slice and later depth

Keep current mood, A's opinion of B, reciprocal bonds and organizational membership
separate. Evaluate a bounded set of nearby, awake, eligible participants. Persist
randomness and cooldowns so reload cannot reroll every exchange. A friendly chat,
an insult or a shared meal produces a memory with its actual cause and witnesses.
An attempted meal that was cancelled is not a successful communal dinner.

A Needs panel shows levels, rates and actionable causes. A Social panel shows
known relationships and reasons, with speech bubbles for actual interactions.
The guest inspector adds bed/food/service permissions and visit outcome to that
same person display. It must not hide special guest nutrition behind an inn menu.

First playable social payoff: Rowan and a goblin share food or drink, have one
conversation, remember it and carry that relationship into the next visit.
Disagreement and repair use the same memory path. Later friendship, romance,
marriage and separation add durable bond transitions; belief, titles and customs
modify expectations; teaching records actual learning; recruitment changes
membership explicitly. No meal instantly creates a marriage or transfers control.
Prisons and wardens later reuse care, access, work and social rules; arrest,
captivity/escape and court authority do not enter this first release.

### Acceptance and initial provisioning

One focused scenario must show a resident and guest using the same applicable
needs and food/water owner. Two people cannot consume the same final portion.
Blocked access requests care or reports failure; freeing it lets the existing
intent proceed. Paused reload during service, interrupted carrying, occupied
beds, a cancelled shared meal and repeated outcome delivery preserve resources,
need levels and memories. Changing guest to member never resets them.

Provide a real edible initial lot and finite water adequate for the first learning
period; budget food, drinking, plant establishment and brewing together. Current
eight-water/two-batch provisioning predates thirst. A schema migration cannot
silently invent refills; if extra starter provisions are granted, record their
explicit one-time cause. Guest barter or a real crop then supplies replenishment.
Keep unmet needs legible without imposing starvation before the player can act.

Two residents plus one guest is the first workload. Validate bounded updates and
nearby social candidates under useful work before extrapolating to 100 people.
Relations caches are derived: rebuild after load and invalidate relevant committed
changes, rather than making cached opinions a second persistent truth.

