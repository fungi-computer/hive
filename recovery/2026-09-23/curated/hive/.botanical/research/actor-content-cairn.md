# Actor content and Cairn identity audit

Read-only source audit, 2026-09-07. No Hive or Botanical source was changed.

## Current Hive facts

`src/clearing.ts:19-53` creates the opening scenario directly: actor records
with IDs `rowan`/`sedge`, names Rowan/Sedge, figures `rowan`/`witch-runner`,
fixed positions, and home membership containing only Rowan. The cat is an
unnamed `Body` at a fixed position. This is legitimate authored starting
content, but the scenario factory currently also acts as the creation boundary
for identity.

`src/actors.ts:3-25` has a generic `body` and `actor` constructor. Actor IDs,
names and figure keys are data passed to it; no actor policy is encoded there.
`src/model.ts:3-4,75-93` treats `ActorId` as a string and stores actor records
by ID; jobs, scopes, parties, assignments, cargo and rest targets all refer to
those IDs. This is the real identity seam.

The remaining name/key-specific behavior is small but real:

- `src/clearing.ts:55-78` makes the cat follow `state.actors.rowan`, including
  the sleep-near-Rowan condition. This is companion behavior tied to the
  authored protagonist key, rather than a requirement that every actor be
  named Rowan.
- `src/hud.jsx:350-365` falls back to `facts.actors.rowan` for focus/routine;
  `:404`, `:414`, `:524-526` contain Sedge/Rowan product copy and controls.
  The fixed names are content, while the fallback is a removable key-specific
  default: use the first home member or an explicit focused actor.
- `src/construction-view.js:80-82` defaults site follow-up to `['rowan']`.
  That is another presentation default that should derive from current home
  selection/leader content rather than an engine-wide Rowan rule.
- `src/main.js:54-56` has an authored aria sentence naming Sedge; `src/feed.js:30-35`
  has a seeded story-name vocabulary including Bramble. These are content
  strings, not actor identity lookup.
- `src/view.js:67-122` creates actor display entries from each record's `id`,
  `name`, and `figure`, so ordinary actor rendering is already data-driven.
  The separately created cat/goblin at `:124-127` are fixed non-roster world
  content. `src/art.js:75-83` and `src/art/figures.js:507-516` select authored
  figure archetypes; those keys are art assets, not durable actor IDs.
- `src/clearing.test.js` intentionally uses `rowan` and `sedge` throughout as
  scenario fixtures and asserts deterministic replay. These references should
  remain in tests that describe the authored opening slice until the fixture
  itself is renamed/generated; they are not evidence of a general identity
  requirement.

## Cairn status and API

The maintained local Cairn source is at
`/home/levi/src/Botanical-next-hypha/packages/cairn`; its built consumable
artifact exists in `packages/cairn/dist` (`index.js`, `identifier.js`,
`words.js` and declarations). Hive currently has no Cairn package entry in
`package.json`/`package-lock.json` and no local `node_modules/@fungi.computer/cairn`.
No pack, install, or build was run.

In `packages/cairn/src/words.ts:1-12`, the contract says names use
`crypto.getRandomValues`, never `Math.random`, rejection sampling, and no
global registry or collision retry. `words()` at `:438-466` returns a random
adjective plus noun by default and explicitly says new durable identifiers
should use `defineIdFamily`.

`packages/cairn/src/identifier.ts:82-114` exposes an `IdCodec` with
`generate()`, `parse()`, and `is()`; `generate()` creates a fresh canonical ID
with a 21-character base36 suffix. `defineIdFamily()` at `:210-247` validates a
trusted family/kind declaration and returns readonly codecs. It is an identity
family/codec boundary, not a seeded name generator, actor factory, registry,
or replay store.

## Smallest useful direction

Keep Rowan/Sedge/Bramble and their figures as authored opening content, but
create them through one scenario content record/factory that returns actor
records, party membership, companion relationship, and display copy together.
The first safe cleanup is replacing the three Rowan fallback/default lookups
with a home-member/content reference. Leave the authored figure functions and
the opening test fixture intact until the content factory has a caller.

If Cairn is adopted, call `words()` and the typed ID codec exactly once at
creation/import time, then persist the resulting name and ID in the world
snapshot/content record. Do not call either during fixed-step replay, reset, or
render: CSPRNG output would make otherwise identical replays differ, and a new
ID would invalidate command/job/party references. Deterministic replay can keep
the current seeded world simulation while treating generated actor content as
an input captured before tick 0. A reset must reuse that captured roster, or an
explicit seedable content generator must be designed separately; Cairn itself
does not provide that seed API.

This is a content/identity seam, not a reason to add an ECS, actor registry,
generic selector, or second state owner.
