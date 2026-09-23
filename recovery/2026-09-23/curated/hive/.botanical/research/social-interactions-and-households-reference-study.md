# Social interactions and households: bounded RimWorld reference

Read-only primary-source study, 2026-09-07. Sources describe RimWorld or
mod-authored mechanics; they are references, not compatibility claims or Hive
implementation requirements.

## Verified vanilla direction

Ludeon's 2016 development post describes generated family ties, changing
opinions, context-sensitive social interactions, social fights, lovers,
marriage ceremonies, divorce, heartbreak, multi-person beds and animal bonds.
It also says people who leave can later return as raiders, visitors or joiners.
[Ludeon, “Progress continues!”](https://ludeon.com/blog/2016/01/progress-continues/)

The Biotech preview confirms organic relationships plus player matchmaker
options, pregnancy, family support, mood swings and dangerous birth. These are
version/DLC-specific reference mechanics, not assumptions about base RimWorld
or current compatibility.
[Ludeon, Biotech preview #3](https://ludeon.com/blog/2022/10/biotech-preview-3-reproduction-children-genetic-modification-release-date/)

The useful design observation is the coupling: shared time, care, meals,
housing and ceremonies can alter relationships and mood, while relationships
change desired housing and social behavior. Marriage is a relationship/event
state; it is not ownership of either person, exclusive control of their work,
inventory or travel.

## Hospitality and presentation mods

The original Hospitality forum description says guests use guest beds,
socializing can improve faction relations, and high-social-skill recruitment is
required for a guest to join. That is a direct example of hospitality →
relationship → possible recruitment, with admission still distinct from
hosting. [Hospitality 1.3 forum thread](https://ludeon.com/forums/index.php?topic=11444.0)

The author repository shows the implementation is a deep integration with
guest comps, guest tabs, guest beds and facility injection, rather than a
generic relationship API. [OrionFive/Hospitality source](https://github.com/OrionFive/Hospitality)
The current continued Workshop page and issue history show active version and
compatibility uncertainty, including a report that Hospitality was no longer
actively maintained. Treat mechanics as historical/reference behavior, not a
claim that a specific 1.6 load order works.
[Hospitality (Continued)](https://steamcommunity.com/sharedfiles/filedetails/?id=3509486825),
[maintenance issue](https://github.com/OrionFive/Hospitality/issues/864)

Jaxe's Interaction Bubbles is presentation-only: it surfaces the text already
written to the social log, pauses its fade with game time, allows disabling,
and patches play settings, map GUI and `PlayLog.Add`. It does not author new
relationships or dialogue simulation. [Author README](https://github.com/Jaxe-Dev/Bubbles/blob/main/README.md)

## Deeper relationship references

Rational Romance (Continued) describes an overhaul of romance with options and
compatibility patches, and lists support across RimWorld 1.0–1.6 plus Harmony.
This establishes a mod boundary around romance rules, not a stable API or
current compatibility guarantee. [Workshop author description](https://steamcommunity.com/sharedfiles/filedetails/?id=2013144996)

SIC Co-Spousal Relations is a narrow example: co-spouses gain an implied
relationship, bed-sharing penalties can change, partner-nearby bed sorting is
altered, and it requires Harmony and Ideology. This illustrates that household
rules touch both relation facts and physical bed assignment, but should not be
copied as a universal polyamory policy. [Author repository](https://github.com/LordSicarious/sic-cospousal-relations)

## Hive design inferences

- Store sparse relationship edges and private memory/witness facts. A social
  encounter can record actor A, actor B, event kind, authoritative tick,
  witnesses, cause/provenance and a bounded sentiment/memory effect. Do not
  scan every actor pair every tick; schedule eligible encounters from shared
  work, dining, household, travel and explicit events.
- Keep opinion, relation labels, household membership, party membership, work
  authority and inventory ownership separate. Marriage can influence preferred
  bed/household and produce mood/event effects, while orders and custody still
  use the normal command authority.
- Let groups create sparse opportunity sets: coworkers at a station, residents
  of a household, travel companions, visitors sharing a room, or witnesses to
  a ceremony. Resolve one interaction through the fixed world clock, then emit
  a deterministic event and update only affected edges/memories.
- Recruitment is an explicit admission decision. Hospitality can improve
  relation and present a willing visitor; it must not silently convert a guest
  into a party member. Travel carries the same identities and relationship
  facts; departure does not clone or erase a person.
- Bubbles or Bramble-style text should project committed social events. They
  must not become a second social state store, an AI dialogue authority, or a
  per-frame scan.

## Minimal future proof shape

One household with two residents, one shared work location, one visitor, one
meal/room encounter, one disagreement, one repair/relationship outcome and one
explicit recruitment offer is enough to test the seam. Add marriage only after
the ordinary relationship/event path works: proposal/consent, ceremony event,
household preference and mood/witness records, then save/restore and travel
identity checks. Measure sparse candidate selection before choosing any broader
social scheduler. No social system belongs in the current home release.
