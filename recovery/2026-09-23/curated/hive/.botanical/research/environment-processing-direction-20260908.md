# Physical environmental processing — Levi's direction

Game CTO capture, 2026-09-08. Future direction for the small-world production loop; not an addition to the active schema-v7 migration or a claim of shipped mechanics.

## Direct request

Levi wants the environment to remain physically meaningful through several processing stages. Chopping should first fell a tree into a persistent fallen trunk; further work cuts that trunk into usable logs. A visible falling animation, possible impact/crushing consequences, and higher woodcutting skill allowing more control of the fall direction are desired. This is his example of the depth expected across environmental processing and crafting.

## Proposed coherent loop

Standing tree → stump plus fallen trunk → cut logs → split firewood or sawn timber. Each useful stage stays visible and has a purpose: a fallen trunk occupies space and can be processed in place; logs can be moved and allocated; firewood serves heat/fuel; timber serves appropriate construction/crafting. Exact dimensions, yields, costs, tools, skills, timings and first consumers are not settled by this note. Preserve current construction/fuel recipes until a coherent migration chooses their requirements.

The player should be able to designate **fell and process** once, or explicitly stop at felling when that intermediate state is useful. Jobs fulfill the designation as dependencies become ready. Do not require individual clicks for every log, add invisible waits merely to lengthen the chain, or require every ingredient to have an equally long production chain. Stage boundaries should earn their place through a choice, tool/skill, risk, useful intermediate, by-product or trade specialization.

## Shared ownership and laws

- Use a persistent physical workpiece with progress and material accounting. Felling changes the source lifecycle and produces the stump/fallen workpiece with provenance; it does not also create a second hidden pile of the same wood. Exact entity/part IDs must be settled against the real lifecycle/material schema at implementation.
- Processing consumes an accounted portion of that workpiece and emits portable goods exactly once through the common material owner. Cancel/retry/save cannot regrow the tree, refill the trunk or duplicate logs. A partially processed trunk remains partially processed.
- Work definitions name target stage/capability, tool/work requirements, supported transformation and result. Jobs claim work positions and request those operations. Logs, firewood, herbs and later brewery ingredients use the same custody/transfer owner; no new `treeCargo` or private processing inventory.
- Recipes over already-supported work/transform operations are configuration. A new physical event, such as a falling rigid body with a swept impact area, needs its own bounded typed primitive and proof. Do not hide physics in recipe callbacks or renderer animation.
- Every completed stage stays completed when downstream work is cancelled or blocked. Waiting for transport, a free station or storage cannot reverse earlier work or destroy its output. Preserve exact progress, ownership and raw save recovery when this eventually migrates the current instant six-wood yield.
- Retained decomposition/fungi direction connects to unprocessed wood later through shared organism/decomposition and environmental conditions. Avoid a separate corpse/log/compost timer implementation for each content type. No decomposition or mushroom simulation is added by this note.

## Directional felling and impact

A proposed first control is an intended fall direction with a visible fall/landing footprint. Woodcutting proficiency can improve control and yield/work quality; choose a legible skill rule rather than unexplained surprises. Shared **fell and process** uses an understood default policy, while direct control can select an aim.

The authoritative simulation owns chosen direction, fixed-tick fall progress, collision outcome and landed footprint. Animation reads those facts. Pause/reload mid-fall must preserve the phase; an impact must settle once. Future crushing checks the swept world-space volume and its targets, including relevant height, rather than a screen rectangle or sprite animation callback. This can begin with bounded geometric fall rules; a general rigid-body physics engine is not assumed. Injury, structure damage, warning/clearance behavior and accidental-impact policy remain separate explicit design choices before enabling harm.

## Placement in the sprint

First close the current wood/herb transport migration without changing its retained chop behavior. Mixed storage must withdraw into real construction, and first brewing establishes a useful finite staged process. Then use tree felling/processing as the environmental workpiece consumer of those shared mechanisms, with original falling-tree art under Astra review. It may move earlier only through a deliberate coherent sprint recut, not an incidental expansion of the current repair.

Future player-visible proof: designate a tree, see it fall and remain, interrupt partial log processing and reload paused, resume into real logs, choose firewood or timber for an actual use, and verify unique material custody and correct changed topology. Direction/impact gets its own short law/render proof when enabled. Associate this direction with existing material/crafting/knowledge and plant-lifecycle issues and PROTOTYPE/ARCHITECTURE; no new management framework is needed.
