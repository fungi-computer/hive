# Lab navigation and Caps caller review

Read-only Sol review for Game CTO, 2026-09-08. This note is ignored research;
it does not transfer source custody or authorize a release. Game Delivery remains
the visible Git/build/proof/preview coordinator. Numerical owners retain the
water, gas/heat and world-generation candidates named below.

## Priority findings

1. `/study` is a character page with one inline “Optional studies” sentence.
   It is the only index, is hard to scan, and mixes `.html` and extensionless
   links. Seven leaf pages have no link to the index at all; five have no page
   navigation of any kind. The game menu labels `/study` “Character study,”
   while two public pages label the same route “All studies.”
2. No study page currently renders a Caps React component. Animal, fire and
   brewhouse import Caps styles or use Daisy classes, but native HTML buttons
   remain owned and mutated by imperative scripts. This does not satisfy the
   requirement to use Caps components.
3. The two `public/*-study.html` pages cannot simply import a JSX module with
   package imports: Vite copies `public` files without transforming them. Move
   their HTML entry points to the repository root, keep the same public URLs,
   and add them to `vite.config.js`; leave their images under `public/studies`.
4. The current world page is a real live browser generator, but it has no shared
   study navigation and uses plain controls. Water and gas have retained real
   numerical evidence but no product pages. Those pages must render pinned data
   or execute the actual solver; an attractive generated fluid/smoke animation
   would be false evidence.

## Small product contract

`/study.html` is the canonical catalog and `/study` remains a supported clean
URL. Put the catalog first, and retain the current People & Proportion workbench
below it at `#people-proportion` for the first migration. This preserves the old
route and content without a redirect or new router. Change the game menu label
to “Studies” once the catalog ships.

The catalog has four always-visible sections. Do not hide primary navigation
behind tabs or a command palette.

| Group / anchor | Entries, in order |
| --- | --- |
| Environment & world `#environment` | Water Lab `/water-lab.html`; Air, heat & smoke `/gas-heat-lab.html`; World Lab `/world-lab.html` |
| Game systems `#systems` | Clearing minimap `/clearing-minimap-study.html`; Mixed shelves `/mixed-shelf-study.html` |
| People & creatures `#people` | People & proportion `/study.html#people-proportion`; The Devil and demons `/devil-study.html`; Animals on the road `/animal-study.html` |
| Places & atmosphere `#places` | The Copper Familiar `/brewhouse-study.html`; Goblin hospitality `/goblin-den-study.html`; Floor details `/goblin-mess-study.html`; Fire and light `/fire-study.html`; Still roots, moving leaves `/foliage-wind-study.html` |

Every card shows a title, one-sentence scope, a Caps `Badge` for evidence mode,
and a Caps `Button asChild` containing its real anchor. Suggested evidence labels
are “Live browser study,” “Recorded native experiment,” “Recorded Node
qualification,” “Interactive art study,” “Static art study,” and “Concept.”
These labels describe how the page was produced, not gameplay readiness.

Every leaf starts with one shared `StudyChrome` region:

```
Studies / <group> / <current title>                 [Back to the clearing]
```

“Studies” is an anchor to `/study.html`; the group is an anchor to its catalog
section; the current title is text with `aria-current="page"`; and Back to the
clearing is `Button asChild` around `<a href="/">`. Include a “Skip to study”
anchor before it. On narrow screens the breadcrumb and action wrap in source
order. The page retains native link behavior, so open-in-new-tab, copy link,
browser history and no-JavaScript semantics remain available.

The shared definition is one data module, for example
`src/studies/catalog.js`. Both the catalog and `StudyChrome` consume it. HTML
must contain only the stable study id, not repeat titles/groups/routes.

## Caps decision

The current public primitives are sufficient:

- `@fungi.computer/caps/components/button`: all actions and `asChild` links.
- `components/card` or `blocks/section-card`: catalog cards and evidence panels.
- `components/badge` and `components/status`: evidence mode and running/result
  state.
- `components/tabs`: mutually exclusive pose/view/color choices. Its built-in
  Left/Right/Home/End behavior is useful here.
- `components/checkbox`: the animal pack toggle.
- `components/data-list` and `components/stat`: retained numerical results.
- `@fungi.computer/caps/styles.css`: the only shared style entry; it brings in
  Stipe. Keep `data-theme="mocha"` on each page unless Game CTO chooses another
  existing Stipe theme.

The catalog and breadcrumb do not request a shared component. Botanical source now has
`packages/caps/src/blocks/app-bar.tsx` and publicly exports it, but its
`AppBarItem`/`AppBarAction` APIs expose callback buttons, its labels say
“Workbench app bar” and “Running items,” and it owns a mobile launcher. It is not
a breadcrumb or link catalog and would discard ordinary anchor semantics. The
Caps tarball currently installed in Hive also predates that export. A
game-local flex wrapper around Caps buttons is the correct composition.

The retained water/gas exports now establish one separate shared primitive:
timeline samples need a scrubber for intermediate states. Caps has no Slider or
range export. Its `components/input` explicitly describes and styles a text
input with `input input-bordered w-full`; passing `type="range"` would apply the
wrong component contract and styling. Stipe's Daisy plugin provides the native
`range` house recipe, which Caps can emit by referencing its classes from
source. The currently packed Stipe and Caps CSS do not contain those selectors;
the released Caps rebuild must be checked for them.

The first justified shared delta is therefore a small
`@fungi.computer/caps/components/slider`:

- render one native `<input type="range">` with a forwarded ref;
- accept ordinary native range input attributes except caller override of
  `type`;
- add only existing `range`, tone and size classes through Caps `cn`/`cva`;
- leave `value`/`defaultValue`, `min`, `max`, `step`, `onChange`, selected time,
  playback and accessible labeling to the caller;
- preserve native arrow/PageUp/PageDown/Home/End and pointer behavior; do not
  add a timeline state machine or custom drag implementation.
- assert the rebuilt/packed Caps `dist/styles.css` contains the range selectors;
  the existing Hive tarball does not.

Exact Botanical source boundary is `packages/caps/src/components/slider.tsx`,
its focused component test, package export, registry source/entry and workbench
coverage; generated dist/docs/registry artifacts follow Botanical's existing
build. Botanical Delivery owns that source/build/pack. Game Delivery consumes
the released Caps/Stipe tarballs and lockfile. The catalog/chrome work can land
using existing Caps while this small control proceeds independently; environment
timeline pages use Slider after the pack handoff rather than a local substitute.

## One UI owner per interactive study

Do not leave React rendering a Caps toolbar while the old module mutates its
labels, `aria-pressed`, `checked`, disabled state or classes. For each page,
React owns the control DOM and its small display state. The existing renderer
continues to own Three/Pixi/canvas resources and exposes narrow commands such as
`setPose`, `turn`, `setPlaying`, `setMode`, `pan`, `zoom` and `dispose`. It never
queries a control element. The React entry invokes those commands and renders
the returned/current snapshot through Caps. Canvas picking remains with the
world renderer because it is a spatial input, not menu state.

This is a serial migration, not a generic event bus or framework. The affected
imperative callers are:

- `src/study.js`: pose, play, turn, zoom, lineup and current-game actor controls.
- `devil-study.js`: play, pose and facing.
- `animal-study.js`: play, pose, facing and pack checkbox.
- `fire-study.js`: play and color.
- `foliage-wind-study.js`: play/pause.
- `src/studies/brewhouse/main.js`: view mode and facing.
- `src/studies/mixed-shelf/main.js`: facing.
- `src/world-lab/main.js`: named locations, pan and zoom; retain worker lifecycle
  and canvas selection in this module.
- `src/studies/clearing-minimap/main.jsx`: already React; replace its two native
  buttons with Caps `Button` or `Tabs` and add the shared chrome directly.

Static goblin-den and goblin-mess pages need only the common React chrome and
Caps cards/buttons around their existing content.

## Environment pages: honest evidence contract

### Water Lab `/water-lab.html`

First page reads a tracked, curated copy of the retained output, with source
path/hash metadata visible. Label the main evidence “Recorded native DFSPH
experiment — SPlisHSPlasH commit f3f6771; one thread; fixed clock; not browser
simulation or game water.” Render the actual freefall, compression and tank rows
from `sph-library-fit/reference-v2.json`, including particle/boundary counts,
steps, simulated time, wall time, mass error, iteration caps and penetration.

Show the restart experiment as a separate warning/result card from
`sph-library-fit/restart-v1/result.json`: immediate restore was byte-exact, but
the continued final state failed the declared tolerance and `pass` is false.
Do not turn that result green or omit it. A chart may plot only retained numeric
fields. A fluid frame requires an owner-produced export from the native particle
checkpoint with a source checksum; do not draw substitute particles.

### Air, heat & smoke `/gas-heat-lab.html`

Label this “Recorded Node qualification — shared 3D JS MAC solver; not a live
room plume or game simulation.” Read the pinned qualification records rather
than embedding invented sample arrays. The initial view should show:

- `nd-checkpoint/qualification-v1.json`: real 3D metric/global identity,
  hydrostatic rest, ABC refinement, projection, scalar receipts and exact domain
  reload.
- `nd-boundaries/qualification-v2.json`: solid-wall rectangular duct refinement
  and finite open straight-duct scalar/heat transport.

Charts use the actual refinement rows. Keep the measured diffusion limitation
visible: the open transport result conserves stock but its finest reported
relative L1 field error remains 31.71%. Do not call the duct a room, aperture,
plume, combustion or cave-ventilation result.

### World Lab `/world-lab.html`

Keep the existing browser worker/local/section interaction and label it “Live
browser generator.” The current source join must be performed by its existing
source/Delivery owners from `worldgen/height-sea`; the review does not copy it.
The live page must report the exact height-authoritative bed, 0.54 m vertical
metric, datum 12, wet-below/dry-equal classification, exact cardinal wet/dry
boundary, request lifecycle and bounded residency. Surface-water remains
initialization metadata, not live water stock.

Add a distinct “Recorded Node volume/codec qualification” card from
`worldgen/volume-v2/run-v1/proof.json`: generated 3×4×3 empty pocket, signed
brick agreement, edits/eviction/checkpoint reload and measured bounded scan. Its
label and copy must say geometric pocket only: no natural entrance, traversal,
pathfinding, live fluid/gas or gameplay integration. Do not imply the volume is
running in the browser until the real volume source and caller are integrated.

The product evidence files should be small immutable snapshots owned by the
numeric/source handoff, placed under a stable public study-evidence path with
their source relative path, SHA-256 and run scope. The browser treats them as
recorded evidence; it never becomes a second solver or canonical physics owner.

## Exact implementation boundary for visible Game Delivery

After explicit custody checks with active page authors, one visible Game
Delivery writer owns the coupled navigation landing:

- Add `src/studies/catalog.js`, `src/studies/StudyChrome.jsx`,
  `src/studies/study-chrome.css`, and a React catalog entry under
  `src/studies/catalog/`.
- Modify `study.html`, all eight existing root leaf HTML files,
  `vite.config.js`, and `src/hud.jsx` for the catalog label/link.
- Relocate the two HTML entry points from `public/goblin-den-study.html` and
  `public/goblin-mess-study.html` to same-named root entry files, remove only the
  superseded public HTML copies, and add both Vite inputs. Keep all public image
  paths unchanged.
- Add `water-lab.html`, `gas-heat-lab.html` and their page-local React entries
  only after their source owners provide/approve pinned product evidence
  snapshots. Add both Vite inputs.
- Migrate each control caller listed above only after its current writer hands
  over that file, or leave that page with its current writer for the same
  controller/React boundary. Do not have the catalog writer and active study
  writer edit the same page/module concurrently.

No Botanical Caps source, vendor tarball, lockfile, backend, router, framework,
deployment or numerical source belongs in this landing. A later Caps refresh is
unnecessary for the components listed above.

## Bounded acceptance

Use the ordinary guarded proof wrapper required by `AGENTS.md` for automated
commands. One focused browser pass at 1280×800 and 390×844 is enough:

1. `/study` and `/study.html` show all 13 entries in the four groups. Every card
   reaches its stable URL; every leaf returns to the catalog section and `/`.
2. Tab from the skip link through breadcrumb, Back to clearing and each control.
   Enter/Space works; Tabs also accept Left/Right/Home/End; Escape is not stolen.
   Focus stays visible. At 390px the document has no horizontal overflow except
   an explicitly labeled scroll region for fixed-resolution art.
3. Exercise one action on every interactive page and assert the existing proof
   global/snapshot changes while its renderer still reaches ready. Preserve the
   current study-specific proof scripts; add only a short navigation/component
   check, not a new full-game trace.
4. Assert each interactive control is rendered by the imported Caps component,
   not merely a `.btn`/`.card` class, and that each page loads Caps styles/Stipe.
   For the new Slider, verify native ArrowLeft/ArrowRight/Home/End behavior,
   caller-controlled value, forwarded ref, disabled behavior and an external
   associated label at both viewports.
5. For water and gas, compare the displayed dataset hash and selected displayed
   values against the shipped evidence JSON. Assert the water restart card says
   failed tolerance and the gas card displays the 31.71% finest L1 error.
6. For World Lab, retain the generator identity, signed-coordinate, request
   cancellation/stale rejection, bounded residency and selected-cell/local/
   section agreement checks. Assert its live versus recorded labels independently.
7. Run `npm run build` and HTTP-smoke every HTML artifact from the built preview.
   Confirm the moved goblin pages load their transformed common module and all
   existing explicit `.html` URLs remain 200.

The local preview was not running during this review, so no hosted or rendered
claim is made here.
