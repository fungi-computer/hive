# Game/Botanical Caps custody, 2026-09-07

Direct source/status check in /home/levi/src/hive, feature branch at 765c3282.
Game-delivery owns all game integration/Git/deploy; active home-ui owns the dirty
coupled upstairs runtime. No game author is assigned a Botanical Caps/Stipe source
file. There is no game Caps fork or live link to Botanical's source checkout.

## Actual consumer and artifacts

- package.json uses file:vendor/caps/fungi.computer-caps-0.0.0.tgz and
  file:vendor/caps/fungi.computer-stipe-0.0.0.tgz; installed copies are under
  Hive/node_modules/@fungi.computer/{caps,stipe}, not symlinked shared source.
- Caps tarball SHA256 eac6ac2f5acf15a7d26448e300be1641c10e9fe003471f03406efe35c1caf670.
- Stipe tarball SHA256 8b984b698ee4d982cbb6da4909ae5af9e31b27fc70f013dcd440379a2cd1a977.
- src/hud.jsx imports public components/button, components/card,
  components/checkbox and compiled @fungi.computer/caps/styles.css.
- src/style.css and index.html own game composition and page theme; React is
  18.3.1. Game state/commands remain Hive-owned, outside Caps.
- Those files, package/lock and vendor/caps show no tracked dirty change at this
  check. scripts/prove-caps-style.mjs is an earlier preserved untracked proof,
  not a new shared source candidate. Current tracked dirty code is upstairs
  simulation/topology/persistence plus Delivery-owned docs and old prove.mjs.

## Next concrete menu/layout consumers

First: upstairs floor selection/cutaway controls, existing persistent Build
palette and contextual inspected-target actions with correct input/focus.
Next: mixed shelf grouped item/count list and brewery recipe/batch/status view.
The World Lab will need seed/layer/region controls and bounded diagnostic panels.
These are game compositions. Inspect the packed public DropdownMenu, Select,
DataList, Progress and related APIs against real needs before requesting changes;
their presence does not imply they are already used by the game.

## Shared boundary

Botanical's shared source is /home/levi/src/Botanical-next/packages/caps/src,
including components, blocks and styles.css, with Stipe alongside its package.
The game claims none of these paths and no retained MaoMao app-bar implementation.
Botanical can advance its nonoverlapping app-bar decision under its own custody.

Before either portfolio writes the same shared component, agree exact files and
one writer between peer CTOs. A shared repair includes its direct component/tests
and necessary styles in that boundary; no blanket whole-package reservation.
Game-specific menu policy, layout, world picking and command composition remain
Hive-owned. Each portfolio validates changed shared bytes in its real consumer;
Delivery alone adopts a reviewed packed artifact/update in Hive and proves focus,
keyboard/pointer input and narrow layout. Do not patch node_modules or fork shared
primitives into game-local substitutes. This coordination does not stop active
upstairs or ordinary game composition work.
