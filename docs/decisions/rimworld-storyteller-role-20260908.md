# RimWorld's storyteller: incident direction, pacing and consequences

Game CTO research, 2026-09-08. This corrects the narration-only first loop in `shiitake-player-storyteller-interview-20260908.md`. Levi means the actual RimWorld role. Planning only; no game/server/tool implementation or current sprint expansion.

## What the role actually does

RimWorld's storyteller controls incidents presented to the colony: storms, raids and visiting traders are examples given by Ludeon. Its named personalities select different styles: Cassandra favors rising tension, Phoebe a more relaxed cadence, Randy unpredictability. These are behavior/pacing differences; a portrait or voice is their presentation. The official description separately describes colonist relationships, needs and combat as simulation systems. [Ludeon's game description](https://rimworldgame.com/).

In a direct developer interview, Tynan describes event selection from categorized content using colony statistics. He also explains the intended recovery arc: population losses can reduce pressure, and defeated colonies should sometimes suffer theft or kidnapping rather than immediate extermination. He deliberately lets incidents persist and overlap—for example, traders meeting a siege—so their interaction with gameplay produces stories. This is design intent from 2016, not a guarantee that every present storyteller rescues every losing colony. [Tynan's interview](https://www.gamedeveloper.com/design/how-i-rimworld-i-fleshes-out-the-i-dwarf-fortress-i-formula).

Difficulty is a distinct set of controls. Ludeon's 1.2 documentation separates overall threat scaling, wealth/population effects and adaptation after periods without losses; adaptation has independent growth/effect settings. Threat types, disease and other rules are configurable. Thus event timing, threat strength and recovery are related but separable policy dimensions. A leisurely cadence need not imply harmless incidents. Exact current equations, schedules and point coefficients were not verified from a licensed game build in this study. [Official 1.2 release](https://ludeon.com/blog/2020/08/1-2-update-with-new-quests-psycasts-gear-and-more/).

Content mixing is another director responsibility. In 2024, Ludeon reduced Anomaly's dominance after its events crowded out ordinary play, and added controls for its share of incidents. Its changelog also exposes concrete eligibility constraints: monolith conditions, earliest occurrence days and minimum threat points. A rich event catalog can still create a monotonous experience if one theme monopolizes the schedule. [Developer explanation](https://ludeon.com/blog/2024/04/integrating-anomaly-more-with-the-rest-of-the-game/).

Travel retains story continuity. The Alpha 17 changelog explicitly transfers story state, including incident cooldowns, between a caravan and its temporary map. That is a concrete precedent for carrying relevant event history across travel rather than restarting isolated map timers. This entry is Alpha 17 (2017), not the earlier Alpha 16 release that introduced caravans. [Official Alpha 17 release](https://ludeon.com/blog/2017/05/alpha-17-on-the-road-released/).

The architecture has long separated configured incident selection from effect code: Ludeon's 2014 hotfix shows an `IncidentDef` with a worker class, selection chance and minimum refire interval. This is historical evidence for composition, not a current mod API specification. [Official hotfix, reproduced on the development archive](https://ludeon.com/blog/page/19/).

Tynan's broader design argument also matters: simulated causes must become understandable to the player, and adding complexity alone does not create good stories. His plant example explicitly compares reusing existing state against adding another variable. [The Simulation Dream](https://tynansylvester.com/2013/06/the-simulation-dream/). For Hive this supports visible causes and recoverable consequences, not hiding an inscrutable director behind every misfortune.

## Correct translation to Hive — recommendations

Shiitake in the storyteller role should choose **what happens, to whom, when and at what scale**: a visitor, opportunity, raid, local complication or a decision to leave the settlement alone. Dialogue can explain or dramatize the event; it is not the effect. The familiar's tutorial and chess behavior are additional roles. A paid AI player pursues an account's interests through player powers; the world director shapes the play environment through event powers. One personality may appear in several roles without merging those authorities.

Use these narrow responsibilities:

1. **Observe actual play and recent history.** Supplies, population/capability, injuries/losses when implemented, current jobs, active incidents, recent threats, recovery and local conditions. Do not infer success from wealth alone or turn payment status into a difficulty input.
2. **Derive eligible opportunities in game code.** Definitions specify target requirements, supported effects, prerequisites, repeat limits, magnitude bounds, active-incident compatibility and content family. This query uses real world facts and the selected playstyle. A new supported variant is content configuration; a new physical behavior needs a reviewed primitive.
3. **Choose and schedule.** Shiitake selects among those opportunities, can defer, and can connect existing characters/factions/history. Cadence, pressure and content-mix constraints remain inspectable game state. Do not ask the model every work tick.
4. **Revalidate and apply once through the world owner.** Model answers arrive asynchronously; a target, route, capacity or phase may have changed. The game commits the eligible incident and its physical effects at its authoritative boundary. Retries cannot create another arrival or raid. Admission, active duration, resolution and recorded consequences are distinct.
5. **Let normal systems play it out.** Actors navigate and act, trade moves real goods, fire consumes fuel, and player responses determine the outcome. The director does not secretly overwrite those outcomes to force a prewritten ending. Real environmental consequences also continue during director recovery periods.

This is a proposed responsibility split, not a reconstruction of RimWorld source classes or a new game-agent protocol. It reuses Hive's single simulation/mutation authority and Botanical's existing Session/tools. External model work remains outside `clearing.step`.

## Smallest useful first director proof

After the present tiny-map material/work milestone, propose a **physical visiting-party incident with a defer option**. Read home readiness and recent visitor pressure; select a supported visitor profile and arrival window; admit exactly one arrival at a valid map entrance. That actor must visibly enter and use an ordinary visit behavior, then leave or remain according to actual outcomes. Choosing the incident changes the playable world even if all generated dialogue is disabled.

Use two controlled starting histories: a ready, quiet home can admit the visitor; an already occupied/recovering home defers or chooses a permitted smaller opportunity. Record the offered candidates, chosen timing/magnitude, rejection/defer reason and eventual event outcome. Reload/retry must preserve event identity and avoid a second party. A fixed scripted spawn proves an event executor; the differing decisions and enforced cadence prove the first director behavior.

This needs a real visitor-arrival/lifecycle primitive, which Hive currently lacks; recruitment of already-present Sedge is not arrival. The current `src/feed.js` demand/approval and `clearing.ts:136` are useful historical placeholders only. A text-only replacement does **not** satisfy the first director proof. Combat, weather manipulation and arbitrary spawning are later event families, not prerequisites for this first physical test.

For multiplayer, pressure must account for shared regional events and human/AI-originated conflict. Several directors cannot independently schedule a full crisis budget against the same settlement. Travel must retain relevant event history rather than reset the pressure on chunk crossing. One authoritative clock and game-owned event admission remain; model completion does not advance time. Offline protection/danger, the first visitor rules and later threat budgets need product tuning. Official paid AI play remains embraced, with no server/backend scope granted here.
