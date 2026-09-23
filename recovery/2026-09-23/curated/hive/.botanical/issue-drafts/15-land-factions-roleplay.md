# Land, factions, offices, and physical roleplay authority

Status: future multiplayer roleplay direction after persistent homelands; it does
not expand the active two-person home or authorize these systems now.

Explore interlocking scalable roleplay inspired by GTA RP: rulers and kings,
knights, land barons, land ownership, laws, arrests, relationships, and durable
history. Keep the foundations distinct:

- Character/account identity is not party or organization membership.
- A role or office belongs to an organization/realm; there is no global
  `isKing` flag.
- Property title, physical control, and use/build/access permission are separate.
- Parcels and territories may cross terrain chunks and simulation regions.
- Laws and recognized authority are local to a realm or organization.

Leasing, rent and fiefs are possibilities, not selected mechanics. Arrest must
eventually use actual reach, restraint, escort and confinement actions with one
owner for people/items; it is not a remote teleport or status button. Transfers,
arrests and relationships can become meaningful persistent history without
globally ticking every political record.

Levi wants arrest policy to be changeable and courts to be addable without
rewriting unrelated simulation. Legal policy and court cases therefore own
recognized law, charges, judgments and institutional procedure, while movement,
restraint/escort, confinement, inventory and physical outcomes remain separate
domain owners. A small typed feature interface can pass an arrest request through
territory/warrant rules and later court policy, returning an explicit accepted or
short-circuited result before the existing authorized escort activity. Each
feature module retains its state and transition ownership. This takes inspiration
from Elixir Plug's composable API shape; it does not select Elixir as a runtime or
service. Exact court, appeal, jurisdiction and abuse-prevention rules remain
later product decisions.

First useful proof, after persistent multiplayer identity and property exist:
two local organizations grant different access to one titled parcel; one actor
physically enters, restrains and escorts another to a reachable confinement
place, and release/escape preserves identity, possessions and authoritative
history across save/reload. Offline captivity, release/escape rules and abuse
limits are unresolved product decisions that must be designed before this proof.
No backend deployment, economy, global politics scheduler or current-game code
is authorized by this issue.
