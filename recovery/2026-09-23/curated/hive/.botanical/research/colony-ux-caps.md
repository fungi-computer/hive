# Colony UX and Caps seam discovery

Inspected 2026-09-07. This is source and interaction research only. No Caps,
Hive source, dependency, or control behavior was changed.

## Verified Caps surface

The maintained package is `/home/levi/src/Botanical-next/packages/caps`.
`package.json` names it `@fungi.computer/caps` and exports explicit subpaths;
there is deliberately no root runtime export. Its README says Caps owns
product-neutral React primitives and blocks while the host owns state, effects,
copy, routes, and policy. The package's actual public controls include
`Button`, `IconButton`, `Checkbox`, `Dialog`, `DropdownMenu`, `Select`,
`Listbox`, `Tabs`, and `Switch`; its blocks include `CommandMenu` and
`ResourceSelect`.

The source confirms the useful behavior for a future HUD seam:

- `Button` forwards native button props and refs, sets a default `type`, and
  exposes only presentation options (`variant`, `size`, `loading`).
- `Checkbox` is a forwarded native input. `Dialog` and `DropdownMenu` expose
  controlled/uncontrolled open state, cancellable open-change details, and
  local/host focus ownership; both recognize Escape as an interaction reason.
- The workbench is a real React caller using the explicit subpaths, and
  `packages/parakeet/src/` is another maintained caller. No product caller in
  Botanical-next exposes a world canvas, box selection, drag designation, or
  game command policy through Caps.

The exact package exports and implementation are visible in
[`packages/caps/package.json`](</home/levi/src/Botanical-next/packages/caps/package.json>),
[`button.tsx`](</home/levi/src/Botanical-next/packages/caps/src/components/button.tsx>),
[`dialog.tsx`](</home/levi/src/Botanical-next/packages/caps/src/components/dialog.tsx>),
[`dropdown-menu.tsx`](</home/levi/src/Botanical-next/packages/caps/src/components/dropdown-menu.tsx>),
and [`README.md`](</home/levi/src/Botanical-next/packages/caps/README.md>).

There is an immediate runtime integration mismatch: Hive uses React and
React-DOM `19.2.8`, while Caps declares a React `^18.2.0` peer and develops
against React `18.3.1`. Hive has no `@fungi.computer/caps`, `@fungi.computer/stipe`,
or Caps stylesheet dependency. Caps also expects Daisy/Stipe classes, whereas
Hive currently owns its own game CSS. Importing Caps into Hive would therefore
be a dependency and CSS/runtime integration decision, not a drop-in import.
No package build, install, or compatibility experiment was run.

## Verified Hive seam and mismatch

`src/main.js` owns the action boundary. `send` switches on flat UI actions;
`request` checks `commandProblem`, pushes a command into `pending`, clears the
context, and records the notice. The React HUD is created by `createHud(host,
art, send)` in `src/hud.jsx`, renders a read-only `hudModel`, and sends those
same flat actions from native buttons, links, and inputs. `src/keys.js` owns the
`@opentui/keymap/html` 0.5.10 layer, binding definitions, enablement, repeat
policy, and displayed hints.

The current world input is narrower than the requested colony flow:

- A world tree click sets one `ui.tree` and one `ui.context`; a person click
  selects only `"rowan"` and opens the character panel.
- The contextual `Chop oak` button and `c` binding emit one existing
  `{ kind: "chop", tree }` command. There is no selection set, shift modifier,
  box selection, designation mode, or queued input modifier.
- Pointer drag is currently owned by construction placement. `view.down` and
  `view.up` collect `dragCells` only when `ui.tool` is active and submit one
  build request per cell. `view.tree` is suppressed while a tool or pan mode is
  active. Middle-button/pan-mode gestures are captured by `main.js` before the
  Pixi view.
- Escape is already routed through the keymap to the host's `close` action;
  close precedence is context, then build tool, then panel. This is a useful
  cancel convention to retain for a designation mode.

The smallest real seam is to keep Caps limited to HUD primitives once its
React 18/19 and Stipe/CSS compatibility is explicitly resolved. The host
should retain game-specific state and policy: selected actor IDs, selected tree
IDs, designation mode, modifier interpretation, preview, and the command sent
to `main.js`. Canvas pointer capture and world-to-cell/tree picking stay in the
Pixi/view owner. Caps does not supply an interface that can replace them.

## Input evidence from other colony/life builders

The exact patterns below are verified references, with source quality called
out explicitly:

| Reference | Observed input pattern | Source status |
| --- | --- | --- |
| RimWorld | Left click selects a pawn/item/object; left-drag box-selects; Shift-left adds selection; right click opens the contextual order menu; Shift-right queues successive orders. The Chop Wood order itself supports click individual trees or click-drag multiple trees. Escape cancels/closes. | The [official Ludeon forum](https://ludeon.com/forums/index.php?topic=37668.0) confirms Shift+right-click queue behavior; the maintained community [Controls](https://rimworldwiki.com/wiki/Controls) and [Orders](https://rimworldwiki.com/wiki/Orders) pages provide the exact selection and multi-tree designation details. RimWorld's proprietary game source/manual was not available as an official primary input reference in this inspection, so the latter details are observed behavior rather than vendor-source claims. |
| The Sims 4 | EA's Sims 4 controls page documents Esc cancel, click a Sim portrait to switch, right-click a portrait to lock the camera, Shift while moving the camera, and build tools where Shift modifies floor fill or wall room construction. It does not establish the floor/visibility keys listed for another Sims edition. | Primary vendor documentation: [EA Tips & Tricks](https://www.ea.com/games/the-sims/tips-and-tricks?isLocalized=true). The separate [EA Legacy controls](https://help.ea.com/en/articles/the-sims/the-sims-legacy-collection/the-sims-legacy-controls/) page is excluded from Sims 4 floor-control evidence. |
| Banished | The maintained controls reference separates simulation speed/tools from world selection and exposes an assign-jobs tool; structure placement is a mode with rotation controls. | Colony-builder behavior is recorded by the maintained [Banished controls reference](https://banished-wiki.com/wiki/Controls), with the developer's [official game page](https://shiningrocksoftware.com/game/) as product provenance. No vendor control manual was found during this inspection, so this row is secondary evidence. |
| Panzer Claws II (adjacent builder/strategy reference) | The official manual documents click-drag group selection, selecting a construction tool then marking a start/end line, a second click confirming construction, and right click aborting the order. | Primary publisher manual: [Panzer Claws II manual](https://cdn.akamai.steamstatic.com/steam/apps/254100/manuals/Manual_ENG.pdf?t=1577595502), pp. 21–27. This is an adjacent strategy/building reference, not a claim that Hive should copy its military UI. |

The shared lesson is a mode boundary: person selection and work designation
are different gestures. Box/Shift selection changes *who* receives a command;
the Chop tool's click-drag changes *which trees are designated*. Right click
is a contextual order surface, while Shift+right-click is a queue modifier in
RimWorld. Build/floor/cutaway controls remain explicit modes, and Escape
cancels the active mode without silently issuing a world command.

## Recommended next interaction flow

1. Keep neutral left click for selecting a person or inspecting one target.
   Add a host-owned selected-actor set later: Shift+left-click toggles a person
   into the set, and empty-ground left-drag box-selects people only. A normal
   person click can preserve the current Rowan panel behavior for compatibility.

2. Add a visible `Chop` designation mode beside Build. While it is active,
   left-click or click-drag over trees gathers stable tree IDs and shows a
   preview. Release confirms the designation; empty drag produces no command.
   This is the requested multi-tree flow and must use tree picking, not the
   existing build `dragCells` helper. The simulation owner decides whether the
   host submits one bounded designation command or explicit existing chop
   commands; the UI must not invent a second job owner.

3. Keep right click as the contextual order path for the selected actor set.
   A target menu can offer Chop/Move/Rest when the host says the action is
   legal. Shift held during that order queues it; without Shift it is direct.
   Releasing or canceling a drag, pressing Escape, or right-clicking during an
   active designation should clear the preview according to the host's explicit
   cancel rule. Do not make Caps interpret Shift, selection, or simulation
   policy.

4. Preserve current build/floor/cutaway separation. Build remains a placement
   mode with its existing straight-row drag; floor/cutaway are view controls.
   When a future upstairs mode arrives, it should share the same Escape and
   focus-return behavior rather than adding a desktop/window framework.

The first falsifying proof should be a narrow browser interaction trace: select
two visible people with Shift, box-select only people, enter Chop, drag across
several trees, cancel once with Escape, then designate again and use a
right-click contextual order with Shift held to queue a follow-up. Verify the
preview never builds under the pointer, tree IDs remain stable after a render,
and a paused HUD does not mutate simulation state. This proof needs a source
seam decision from the simulation owner before implementation; it does not
justify changing Caps or adding a generic selection framework.
