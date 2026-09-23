# Naturhus wastewater: technical source check

**Scope.** A narrow check of the remembered Swedish greenhouse-house treatment
system. This records what the available designer, owner, and equipment-maker
documents actually say; it is not a construction, safety, or regulatory guide.

## Three strongest technical records

1. [SLU Report 244: _Faecal separation and urine diversion_](https://www.aquatron.se/wp-content/uploads/2019/11/Rapport-SLU.pdf)
   is Björn Vinnerås's 2001 Swedish University of Agricultural Sciences
   licentiate thesis. It evaluates short-transport Aquatron separation and an
   apartment installation; it is the best source for what a separator can and
   cannot retain.
2. [Jordforsk Report 53/05](https://www.aquatron.se/wp-content/uploads/2019/12/jordforsk.pdf)
   describes the Aquatron 4×200 component chain and evaluates selected Swedish
   and Norwegian installations. It explicitly says the solid-compost hygiene
   outcome was not fully documented.
3. [Sundby Naturhus: `Kretslopp och växtbäddar`](https://www.sundbynaturhus.se/sundby-naturhus/kretslopp/)
   is the best published physical description of a Wallentinus-family Naturhus
   cycle designed by Anders Solvarm/Ecorelief: tanks, float pump, serial
   planted beds, return/outlet, and layered bed construction. Sundby is
   **not** Solvarm's own Sikhall home.

The likely Marie Granmar / Charles Sacilotto case is identified by
[Aquatron's manufacturer reference](https://www.aquatron.se/reference/5614/):
Aquatron 4×200, urine-separating toilet, cisterns, grow beds, and ponds. That
page establishes the family/equipment association, not safety certification.
[Greenhouse Living's Naturhus concept](https://www.greenhouseliving.se/naturhus)
is a designer explanation of a general blackwater + greywater tank-and-bed
option, including a greywater-only variant and separate rainwater stores.

## What those records support

| Stage     | Supported finding                                                                                                                                                                                                                                                                                     | Boundary on the claim                                                                                                                                                 |
| --------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Inflow    | Greenhouse Living describes a complete local system receiving both greywater (shower, kitchen, laundry) and blackwater (WC); it also describes a smaller greywater-only form.                                                                                                                         | It does not specify a universal process train or potable reuse.                                                                                                       |
| Solids    | Sundby documents a conventional three-chamber sludge separator before its beds. The Granmar/Sacilotto case instead names a urine-separating toilet and Aquatron. SLU/Jordforsk describe Aquatron's gravity/cyclone separation, solid-compost chamber, liquid path, and optional downstream treatment. | These are distinct systems and people; do not merge their equipment into one Solvarm design.                                                                          |
| Bed train | Sundby documents a float-controlled pump sending a batch to bed 1, return to a tank, then pumping through beds 2 and 3. Its construction notes drainage collection, gravel/substrate, peat/lime/char, perforated distribution, and inspection/flush pipes.                                            | This supports a staged, pumped planted filter. None of these documents classifies its microbial regime as an engineered _aerobic_ reactor.                            |
| End point | Sundby describes a greenhouse water feature, irrigation use, an overflow to stone infiltration, and optional summer return to the first pump well. Greenhouse Living says treated water is sent to plant beds as irrigation.                                                                          | Neither establishes drinking-water use. Seasonal storage, evaporation, reuse, and release are part of the site-specific account, not a general performance guarantee. |

## Correcting the remembered detail

- A **pump** is directly documented at Sundby; a waste **macerator/grinder** is
  not. Aquatron supplies a gravity/cyclone separator rather than a grinder.
  The SLU thesis finds that greater particle disintegration during long or
  vertical transport reduces particle-separation recovery. The evidence
  therefore establishes separation/settling and pumping in these documented
  cases. The remembered grinder remains unverified; this does not rule out a
  different installation using one.
- Natural bacteria, planted beds, and composting are described, but a measured
  oxygen regime, loading rate, pathogen treatment sequence, or universal
  outflow specification is absent from these first-party pages. Do not infer
  any of those from the word “biological.”
- [A Politecnico di Torino thesis abstract](https://webthesis.biblio.polito.it/6763/8/Antolloni_abstract_EN.pdf)
  is useful secondary academic context: it says Sacilotto's water is not
  drinkable and distinguishes greywater for edible plants from blackwater for
  non-edible plants. The full methods/results must be read before treating its
  summary as a performance study.
- A 2021 [Kjerstadius evaluation](https://karvling.com/wp-content/uploads/2021/05/kjerstadius-2021-utvacc88rdering-av-naturhus-sikhall-2019-2020.pdf)
  reports laboratory samples and flow measurements for Solvarm's Sikhall
  Ecocycle System Two, but was prepared at the owner's request and is hosted
  by a third-party blog. It is a lead for its explicit mass-balance warning,
  not independent certification of every Naturhus claim.

## Useful distinction for later fiction/design reference

The credible shared pattern is **wastewater → separation/settling → controlled
pump → planted treatment stages → explicit site outlet/return**, with a
separate solids-management path where the Aquatron system is used. Treat
blackwater, greywater, rainwater, solids, and treated liquid as separate
materials until a particular documented installation joins them. That is a
source-grounded inspiration, not a claimed Hive implementation or a claim that
all Naturhus systems have the same process.

## Game CTO disposition

Accepted as a future hygiene/horticulture/Dwarven technology reference. It connects
the already-planned wells, waste, pipes, soil, greenhouse, and knowledge systems.
It does not establish current runtime or change upstairs → brewing priority.

Compose treatment functions: separation retains selected solids, storage holds a
finite amount, pumping changes location/elevation, biological treatment changes
selected material/quality quantities over time, and plants consume available water
and nutrients. A grinder, if authored later, changes particle form and pumping or
separation compatibility; it cannot mark sewage as treated. Multiple biological
beds and inspection points can make design and upkeep visible in the utility view.

Water quantity, nutrient inventory, and modeled contamination/quality are distinct.
Splitting/mixing water carries its constituent loads; filtering assigns captured
material to an actual residue/media store or declared transformation. Safe use is
an explicit game rule for each consumer, not a global clean-water tag gained by
passing any plant. Storage, ponding, and irrigation are different possible ends;
the word recycling does not imply a lossless or drinkable loop.

The useful future proof is one small household waste input, one separator and
finite storage/pump, one planted treatment bed, and one restricted-use outlet.
Prove power loss/overflow, full media or excess load, material/quality accounting,
ordinary service jobs, and save/reload. Reuse the shared environmental and resource
owners and the [compost-air addendum](dwarven-compost-air-heat-recovery.md) for heat
and air; the water and exhaust paths must remain distinguishable. No full sewage
chemistry, housing population, or universal treatment framework is required.

Delivery: associate existing water #10, horticulture #14, knowledge/technology #17,
and the hygiene/utility notes at the next safe editorial batch. The original
accepted ecology handoff bytes remain unchanged.
