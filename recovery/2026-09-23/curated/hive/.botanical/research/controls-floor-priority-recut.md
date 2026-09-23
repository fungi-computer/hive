# Controls first: floor navigation and the maintained command boundary

Independent read-only recut for root, 2026-09-08. HEAD remained `32cd4235`; the tree includes Delivery's active picking/Go corrections and preserved work. I did not edit production, run a build/proof, or contact Delivery. This note supersedes any implication that bed rendering or large module extraction must precede usable floor controls.

## What actually exists and what is wrong

Ground and Upper buttons already exist in `hud.jsx:1594–1606`. They are children of `.level-controls` inside the bottom `.command-bar`, after Build/Work/Orders. The defect is discoverability/reachability and incomplete shared control ownership, not a wholly missing button.

The supplied wall inspector can cover those controls under current source rules. `.target-window` has `z-index: 3`; `.command-bar` has no explicit stacking priority. `Target` positions four different cards with guessed fixed heights: the structure card clamps `top` to `innerHeight - 190`, while its real height depends on title wrapping, content, button and theme metrics. It reserves neither command-bar nor level-control bounds. At narrow width the bar becomes a two-row grid; at short height other panels use unrelated bottom constants. Source therefore explains how a content-height change covers the navigation. Exact current screenshot coordinates were not replayed in this read.

`keys.js` has no view-level commands. OpenTUI is already used for matching and formatted hints, but its catalog covers only a subset of visible controls. Work, level selection, pan mode, zoom and menu actions are authored separately in JSX. The installed package recognizes `PageUp` as `pageup` and `PageDown` as `pagedown` (`node_modules/@opentui/keymap/src/html.js:22–23` and named keys in `src/addons/index.js`), so no new key library is needed.

Finally, `hud.jsx:1844–1855` changes level as a side effect of selecting a tool: Floor sets Upper, while Stair/Chop/Plant set Ground. Wall/door/roof/bed/shelf leave level unchanged. A player who cannot reach or discover the view buttons learns tools as the floor navigator. The current manual `level` action already clears the stroke/inspection while preserving the armed tool; the problem is not that manual switching fundamentally requires a stair.

## First playable outcome

Expose a persistent **view-level control**, visually associated with zoom/cutaway and outside the crowded build/action row. Show `Ground · 0` / `Upper · 1` or a two-choice segmented control with an unmistakable current state, and accessible names such as “View Ground level” and “View Upper level.” Both must remain reachable whether a character, structure, build menu or no object is selected. It must work paused, without a pawn selection, and without issuing a simulation command.

Use the actual Caps buttons and house styling. This is game composition, not a shared Caps component change. Reserve a compact stable control region in the HUD layout and give persistent navigation an explicit layer above transient cards. Also place transient cards inside the remaining usable viewport: raising the toolbar z-index alone merely hides card actions behind it. Replace repeated guessed target-card heights with one measured placement helper (actual card size plus safe-area/control rectangles), clamping and choosing above/beside the click; at narrow/short sizes, a bounded docked inspector above the reserved toolbar can be simpler. Keep the popover's click anchor as an immutable point, not a live Pixi event reference.

Do not introduce a whole draggable window manager to solve this. The minimum reusable primitive is `placeInspector(anchor, measuredSize, usableRect, avoidRects)` plus a documented HUD layer order. Update on relevant resize/content-size/control-layout changes, not by measuring every animation frame. All four existing Target branches should consume it and delete their inline `innerHeight - N` calculations.

Add PageUp = higher level and PageDown = lower level, clamped to the current supported 0/1 range. On-screen buttons remain the primary alternative for laptops/touch. Render the bindings in the level control or its hint and Help from the same catalog; do not hardcode “PgUp” in one JSX branch and a different key in `keys.js`. A key at the current boundary can do nothing without a new notice every repeat. Choose non-repeating level commands for this two-level slice. Future available surface levels come from the world query described by the tower plan; do not expand the present range or hardcode a new height limit in every consumer.

## Tool and view policy must be one explicit decision

Settled product rule: **manual view changes are always allowed within the available view-level range, independently of the selected tool**. A level change cancels any active stroke with zero build/Go/order effects, clears stale target/hover data, and preserves actor selection. Compatible tools remain armed. Wall, door, roof, bed and shelf therefore remain armed when switching between Ground and Upper; their existing core placement rules still decide whether a particular cell is legal.

Floor is an Upper-only tool; Stair is a Ground-anchored tool; current Chop and Plant target Ground only. Keep those compatibility constraints in typed tool definitions and derive them from `{tool, viewLevel}`. A manual move to an incompatible level disarms that tool once and shows a clear reason, such as “Floor tool ended: floors are placed on Upper” or “Stair tool ended: stairs start on Ground.” No wrong-plane ghost or order survives. There is no suspended tool state and no automatic resumption when returning to the old level; the player explicitly activates the tool again.

Explicit tool activation may select its only valid level when the destination is stated in its label and catalog: “Floor (Upper),” “Stairs (Ground),” “Plant (Ground)” and “Chop (Ground).” The checked combined action selects the level and then arms that tool. This is a deliberate activation action, not a hidden assignment repeated by rendering or a generic preference setter. Manual view commands never change the level back because an earlier tool preferred another level. Multi-level tools such as Wall activate on the current level.

Right-click, Escape and Done cancel the armed tool through its current XState owner without changing view level. `pointerupoutside` cancels only a stroke, retaining the armed tool. Pan and wheel retain their explicitly accepted cancellation behavior for this slice; do not opportunistically change it while adding floor navigation. A manual level command during a live pointer stroke cancels that stroke once, so a later pointerup cannot place it on either level. All these transitions use the same checked controller.

## One maintained control catalog, with actual checked execution

The existing `keys.js` definitions are a useful starting point, but they are keyboard-local. Promote that ownership to a small typed game-control catalog consumed by buttons, OpenTUI and Help. It hides label, binding, availability and invocation policy. It does not own simulation state, another event bus, a global plugin loader or a parallel command admission system.

```ts
type ControlArgs = {
  "view.level.up": undefined;
  "view.level.down": undefined;
  "view.level.set": { level: 0 | 1 };
  "view.cutaway": undefined;
  "build.arm": { tool: ToolKind };
  "ui.cancel": undefined;
  // Add current real controls as their callers migrate.
};
type Availability = { enabled: true } | { enabled: false; reason: string };

function describeControl<K extends keyof ControlArgs>(
  id: K,
  args: ControlArgs[K],
  facts: ControlFacts,
): { label: string; binding: BindingHint; availability: Availability };

function invokeControl<K extends keyof ControlArgs>(
  id: K,
  args: ControlArgs[K],
  facts: ControlFacts,
): readonly UiAction[];
```

The exact implementation can be a typed handler map or exhaustive switch. It must contain the real implementation and fail typechecking if an actual control lacks a handler or uses an invalid payload. Do not retain the current string-only forwarding whitelist as the claimed safety boundary. The checked controller executes its returned actions through the actual Jotai/XState/typed effect handlers. Use one projection of current facts per invocation so enablement and action construction do not read several mutually different snapshots.

Button consumers ask for the descriptor and invoke the same control; OpenTUI registers that binding/description/invocation; Help renders the same metadata even when an action is currently unavailable, with its reason where useful. Dynamic actor/site actions are parameterized, not a new global registration per spawned entity. Affordance availability is not authorization: authoritative core commands still validate current state on admission.

Migrate level controls first, then the already existing camera/pause/pan/cutaway/panel/tool actions in bounded caller groups. Do not leave one keyboard definition list and another button list maintained indefinitely. The catalog is a feature-entry rule: a new player-facing command must supply its typed invocation, label, availability/reason and optional binding, and use those through its actual UI caller. Not every command needs a shortcut, but its UI and shortcut may not implement different behavior.

## Focus and input boundaries

Keep OpenTUI's focus-within game layer and composition/repeat checks. PageUp/PageDown must not commandeer typing, selects/comboboxes, contenteditable, active Caps menu widgets or a scrollable panel that is intentionally handling those keys. Native widget-handled/default-prevented events do not fall through into game control. On canvas/game-root focus, PageUp/PageDown change the level. The persistent on-screen selector works from any ordinary game panel, so reserving native widget behavior never makes a floor unreachable.

Buttons remain native keyboard-operable; Space/Enter on the focused level button activates that button exactly once, not pause plus level. The existing pause guard for focused button/link is relevant and must survive the refactor. Arrow keys belong to focused Caps widgets when those widgets use them; camera panning is not allowed to override their navigation. Keep ordinary global shortcuts from firing in inputs, composition or browser focus outside the game. Restoring focus after target close or level switch goes to a still-existing control/game root rather than an element removed by the transition.

The precise event-boundary contract needs one short actual-key test against the installed OpenTUI/Caps caller, especially `defaultPrevented`/propagation ownership. Do not assert that merely defining these metadata fields proves interception behavior.

## Minimal source/proof handoff

Priority order is now: **persistent usable controls and transparent-picking/Go repairs**, then deeper bed rendering, then future feature consumers. Delivery's existing picking writer continues; controls may have a separate writer only under an exact HUD/keys/style ownership boundary and with the shared main/controller seam coordinated. Git/deploy remain Delivery-owned. Do not interrupt working authors or merge two controller owners.

First source checkpoint: visible persistent level selector, one typed view-control implementation consumed by button/key/help, explicit tool-level compatibility, and one measured inspector placement primitive replacing all four guessed heights. No simulation/save schema change is necessary for view preferences. Broader old controls can migrate in a following small checkpoint if moving them would delay this first usable repair; mark that boundary honestly.

Focused exit at normal, 390×844 and a short landscape viewport: open the tall wall inspector near the bottom; both level controls and its action remain clickable; click Upper then Ground without selecting a tool or actor; PageUp/PageDown match buttons; paused tick/actors/jobs remain unchanged; Wall stays armed across levels; a pending stroke cannot commit after a level change; Floor/Stair/Chop/Plant disarm once with a reason when manually moved to an incompatible level and do not resume on return; explicit labelled activation selects the stated valid level and arms the tool; Space/Enter on selector does not pause; typing/native widget scrolling is not hijacked; right-click cancels once; no horizontal overflow. One focused trace and exact served parity suffice, not a full-home browser marathon. Source review must open real checked invocation and immediate key/button/gesture callers.

This note diagnoses source and supplies a ready recut. It does not claim the current control overlap has been repaired or deployed.
