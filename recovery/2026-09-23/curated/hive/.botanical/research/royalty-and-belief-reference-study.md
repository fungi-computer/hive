# Royalty and belief systems: bounded reference

Read-only primary-source study, 2026-09-07. These are RimWorld references and
design implications for Hive, not a clone specification or a compatibility
claim. Sources are Ludeon announcements/updates and the official DLC pages.

## Verified Royalty mechanics

Royalty adds nobles and titles, psychic powers, quests, rituals, luxurious
palaces and Imperial technology. [Royalty launch](https://ludeon.com/blog/2020/02/rimworld-free-update-1-1-and-royalty-expansion-released/)

Quests can award **honor**. Honor advances titles such as acolyte, knight and
baron. A title is bestowed by a visiting bestower in a qualifying throne room;
the ceremony grants the title and a psylink upgrade. [Official Royalty page](https://store.steampowered.com/app/1149640/RimWorld__R?l=english)
and [bestower/permit update](https://ludeon.com/blog/page/9/)

Titles expose selectable or upgradeable Imperial **permits**. Examples include
troops, transport shuttles, laborer teams, orbital strikes and orbital salvos;
some permits have minimum-title gates. A permit is a scoped service grant, not
ownership of the recipient or universal AI authority. [Permit update](https://ludeon.com/blog/page/9/)

Royal status is expressed through a throne room, formal/prestige apparel,
speeches and music. The official page describes grand throne rooms and finery;
the bestower post confirms room requirements. It does not provide a stable,
complete table of every title's work prohibition or apparel requirement, so
those details remain version-sensitive implementation references. [Royalty page](https://store.steampowered.com/app/1149640/RimWorld__R?l=english)

Psycasts consume **psyfocus**, which is restored through meditation. Meditation
spots, schedules and focus objects vary with backstory, traits and titles;
dignified focus uses meditation thrones and grand thronerooms. [Ludeon meditation update](https://ludeon.com/blog/2020/05/update-may-2020/)
Psycasts can also change mood, resistance, romance or mental breaks, so they are
actions with costs and social consequences rather than passive belief flags.
[Psycast update](https://ludeon.com/blog/2020/08/1-2-update-with-new-quests-psycasts-gear-and-more/)

## Verified Ideology mechanics

Ideology gives each person a belief system. A belief is assembled from one to
four **memes** and associated **precepts** that set preferences around food,
comfort, love, technology, violence, animals, apparel and buildings. [Official Ideology page](https://store.steampowered.com/app/1392840/RimWorld/)

Ideologies provide social roles such as leaders, moral guides and skill
specialists; they also provide rituals ranging from festivals to sacrifices.
Rituals are shared social events with outcomes, not merely dialogue. The same
page describes relic quests, reliquaries, wealthy pilgrims and conversion
effects.

Fluid ideologies can earn development points and reform memes, styles, precepts
and structure. Multi-ideology colonies can attend one another's rituals, gain,
change or remove roles through rituals, and recruit without converting everyone.
[Fluid development](https://ludeon.com/blog/2021/08/update-1-3-3101-adds-ideoligion-development-during-play-and-more/)
and [multi-ideology update](https://ludeon.com/blog/2021/09/update-1-3-3117-makes-multi-ideoligion-colonies-more-viable/)

Belief membership is distinct from faction membership. A meme/precept is not
an office, title, property right, inventory owner or automatic permission for
the scheduler/AI. A role is an appointment with duties and rituals, while a
faction is a diplomatic/world relationship. Relics are quest/item/world
objects; they should not become proof that one believer owns another person.

## Hive overlay implications

Keep one shared interface for jobs and work groups: belief precepts contribute
eligibility, preference, mood or refusal predicates to the existing scheduler.
Keep one room interface: throne/ritual quality, attendance and required items
are room queries, not parallel room systems. Keep one item/apparel interface:
prestige clothing, relics, instruments, food and symbols use normal inventory,
quality and ownership rules.

Represent title honor and permits as capability grants with explicit issuer,
scope, cost, cooldown and expiry. Represent psyfocus/meditation as a resource
and activity. Represent beliefs, roles and faction membership as separate
components that can all affect a shared social event. Knowledge/practice can
record a ritual, title ceremony or psycast as learned context without granting
control over another actor.

The smallest future proof should cover: two belief groups; one shared ritual
room with attendance and a precept outcome; one role appointment/removal; one
food or apparel precept affecting a job or admission; one honor-like title with
a room and apparel expectation; one scoped permit or psycast with a cost; and
save/reload of all relations. It should demonstrate that faction, office,
property and AI permissions remain separate, and that mixed-belief attendance
does not duplicate jobs or ownership.

## Limits

Royalty launched with 1.1 and Ideology with 1.3; later updates changed details,
including title expectations and multi-ideology behavior. Treat exact title
gates, work expectations, apparel lists, permit costs and conversion formulas
as data to verify against the target version. This study recommends interfaces
and invariants only; it authorizes no runtime scope or RimWorld clone.
