# Technology progression and Stronghold reference

Direct Levi direction, 2026-09-07: the game needs technology tiers, with RimWorld
and Civilization as references. This is planned progression, not a current tech
tree or permission to expand the controls release.

Connect tiers to the existing discovery → learning → recording/teaching/trade →
application pattern. Distinguish knowing a technique, having a trained practitioner,
and possessing its material/workspace/tool prerequisites. A traded dwarven
metallurgy book can be valuable before a colony can construct and operate its
furnace. Individual practice, accessible written knowledge and settlement
production capability are different facts.

Levi clarified that tiers are real advancement gates, not just labels over an
unrestricted graph. A starting tribal tier has several useful branches within it;
a deliberate advancement unlocks eligibility for the next tier. Owning a higher-tier
recipe/book does not alone bypass that gate. A dependency graph of authored techniques,
recipes and facilities operates inside/across those tiers. Exact graph, advancement
requirements, era labels, research work,
knowledge-sharing policy and balancing remain open. Nature, metalworking, husbandry,
alchemy, machinery and occult practice can progress differently; elves and dwarves
need not be globally ranked on one civilization score. Hybrid discoveries and
cross-cultural knowledge exchange remain possible. Buying a finished advanced
item need not grant its manufacturing technique. Loss of a facility can remove
production capability without erasing learned knowledge. Whether tier advancement belongs to
an individual, colony, faction or particular technical tradition needs a concrete
product decision; keep that scope explicit rather than conflating all four.

Candidate example, not a fixed tree: within Tribal, branch into basic shelter,
foraging/horticulture, fire/food, stone tools, hide/wool work and simple animal care.
A named breakthrough plus demonstrated prerequisites opens the next tier, which
adds new production methods/workspace capabilities. Unlocking the tier permits
learning its techniques; it does not instantly teach every recipe. The first future
proof should exercise both gates: advancement eligibility and one specific learned
technique, with a clear UI reason for each missing requirement.

Existing config-driven jobs, item/recipe definitions, physical books and knowledge
provenance should own the future facts. Avoid a second universal research engine
or a global unlock flag that duplicates what the actor/book/workshop already knows.
A useful first proof is learn one technique from a physical book, meet its concrete
workshop/material prerequisites, and produce one item; teach another person and
prove their knowledge persists. No implementation of that proof belongs to the
current source slice. Link existing #8/#14/#17 and the living-world ADR.

Levi recalled a childhood castle-building RTS with rotten cows thrown over walls
and ninja-like hired units with grappling hooks. Stronghold Crusader is the strong
match: official manual identifies Assassins using grappling hooks to capture walls/
gatehouses (printed pp36–37) and catapults/trebuchets firing diseased cattle
(printed pp46–48). This identifies the reference; it does not select those mechanics
for Hive. Relevant future study themes are visible production chains, settlement
provisioning, defensive construction, and siege interactions with physical walls.

Primary source personally opened by Astra:
https://shared.fastly.steamstatic.com/store_item_assets/steam/apps/40970/manuals/Stronghold_Crusader_HD_Manual_-_English.pdf?t=1758726250
Original release 2002, Firefly developer factsheet:
https://fireflyworlds.com/press/sheet.php?p=Stronghold+Crusader+HD

Levi confirmed Stronghold Crusader as the remembered game and requested a focused
study. Its economy/construction lessons are a separate inspiration source; it is
not evidence that Stronghold supplies this chosen tier progression system.

## What Levi specifically values in Stronghold

He clarified that the memorable part was building complicated wall arrangements
with fire traps: the environment changed how encounters played out. Prioritize
player-authored layouts and interacting local objects, rather than interpreting
this reference only as an economy or unit-production game.

The manual's Traps section (printed pp44–45) explicitly describes a nearby
brazier enabling an archer to ignite a pitch ditch with a burning arrow. Gate,
wall, stair and moat layouts affect traversable approaches and firing positions.
The concrete future design test is that changing geometry changes encounter
outcomes. Preserve shared physical facts for traversal, sight/projectiles,
openings and environmental transitions. Do not prebuild a general chemistry or
siege engine; prove one composed interaction once the relevant foundations exist.
The same approach should support useful peaceful arrangements such as irrigation
and greenhouses. This is a future direction, not a new combat source slice.
