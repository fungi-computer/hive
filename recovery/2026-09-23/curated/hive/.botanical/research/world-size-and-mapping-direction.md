# Follow-on direction: seamless chunks, mapping and a finite planet

Game CTO reviewed note, 2026-09-07. This supplements the handed-off architecture
sprint; it does not silently change its current implementation or rewrite the
upstairs/World Lab authors' files.

## Direct Levi requests

Normal movement should feel continuous across invisible chunk boundaries. He
requests a parallel study of local minimaps, multiple maps, craftable Minecraft-
like charts and exploration/fog, plus a RimWorld-like planetary overview. He
suggests generating a globe in Three and using the original pixel-art pipeline.
He correctly notes that Minecraft is practically finite and asks for a sensible
Hive size target rather than a literal infinity requirement.

## Chunk presentation

A chunk is a data/render unit, not a mandatory room transition. Normal travel
has no planned chunk loading screen. Prefetch along camera/travel direction and
retain a bounded margin; render enough outside the viewport for overlapping
canopies, roofs and props. Camera visibility is independent from active-world
work. Unknown data never becomes fake walkable ground. Cold loads or distant
jumps may visibly wait with an honest loading state; do not promise zero stalls
on all devices or stop a future shared world for one slow client.

Cross-and-return is an engineering proof of identities, cargo and modifications
surviving loading/eviction, not a proposed player-facing travel ceremony.

## Requested cartography study

Reviewed input: .botanical/research/cartography-and-globe-study.md (Terra
primary-reference research plus Astra corrections). Separate local visibility,
durable permitted discovery, and information recorded on a physical chart.
A chart is future physical item custody, not a second terrain database. Snapshot
copying, chart ageing and explicit study/sharing are proposals, not fixed rules.
The World Lab may reveal its own diagnostic terrain; this grants no player
knowledge or hidden actor positions in later gameplay.

For a freely rotating globe, prefer a measured Three render into a small pixel
render target with nearest-neighbour display. Fixed sprite views remain a valid
alternative; separate markers/fog can overlay them. Do not bake the Cartesian
product of every heading, light state, territory and discovery mask. All local,
atlas and globe views must refer to the same generated geography and feature IDs.

An attractive independently generated globe is not a world-topology proof.
A finite sphere requires an explicit surface address/projection/adjacency contract,
including seam/pole behavior and bidirectional picking. Flat square cells cannot
be mapped onto an entire sphere without distortion or special boundaries. The
mapping study must compare a finite surface layout before it becomes gameplay;
normal local isometric construction can keep its consistent tile scale. This
study must not force a premature second generator into the current planar lab.

## Size proposals, explicitly not measured capacity

Assumption for physical comparisons only: one ground tile approximately one
metre. World extent, currently decoded terrain, rendered terrain and active
simulation workload are four separate budgets.

- Keep current fun testing at 15×15.
- First World Lab overview samples 512×512, then a 1024×1024 diagnostic only
  after measurement, with bounded chunk detail. These are viewport/measurement
  regions, not a world ceiling or a million live entities.
- After the tiny-map fun and actual caravan/streaming proofs, target a first
  persistent exploration region around 4096×4096 tiles (about 4.1 km across and
  16.8 km² under the scale assumption), generated on demand.
- A useful eventual **planet design target** is approximately 1000 km around:
  sphere surface area C²/pi ≈318,310 km². This is a proposed scale setting for a
  finite world, not a promised populated server capacity or a topology decision.
  Tune against travel time, encounter/settlement density and geographic variety;
  commit extent/generator version per created world rather than rescaling saves.

Do not pre-generate detailed planetary terrain or tick every cell. A coarse globe
summary can be small while local details are deterministic and generated where
needed. Saved player deltas still cost storage, and persistent active colonies,
AI calls, fluids and travel need measured simulation budgets. Increasing the
addressable surface is not proof that arbitrary concurrent populations fit.

## Comparison sources and arithmetic

Java's familiar world limit is approximately 60 million blocks across (about
30 million in each signed direction). With a one-metre block assumption:
60,000 km squared =3.6 billion km², roughly7.06 times Earth's total surface area.
This compares horizontal footprint with planetary surface, not volumes or only
Earth's dry land. The Far Lands were an older generation defect distinct from
the standard spatial boundary; Mojang records their removal with Beta1.8.

Sources read:
- https://docs.papermc.io/paper/reference/server-properties/#max-world-size
  (current first-party server documentation for 29,999,984-block radius).
- https://bugs-legacy.mojang.com/browse/MC-70076
  (historical firsthand border observation, not by itself a current-version spec).
- https://www.minecraft.net/de-de/article/block-week-mushroom
  (Mojang's Far Lands/Beta1.8 history).
- https://science.nasa.gov/earth/earth-observatory/looking-into-the-eye-of-yutu-144178/
  (NASA: Earth's surface area510 million km²).

Delivery owns adding the accepted user direction and clearly labelled size/
rendering proposals to #4 and a bounded cartography association (#7/#17 for future
item/discovery consumers). This does not add map crafting, globe gameplay,
world streaming or remote hosting to the committed first lab page.
