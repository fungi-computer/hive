# Fiend full editor inspection and proposed Hive boundary

2026-09-09; read-only source and actual hosted browser inspection. No product source edits.

## Actual evidence

Owned browser u3872 (invocation fc7e23e8ab72403db19f843f57691713), exit 0, inspected the supplied public share and the latest user-supplied editable share. u3875 (dfb3537060e94f46b4ed03ec105665a7), exit 0, selected an existing group and opened Feedback without changing scene data or submitting notes. Both browsers closed normally. Initial u3871 failed before browser launch because the 921MB Session exceeded a single Node string; corrected to streaming user-message-only URL discovery. The private URL was held in memory, never printed or included in traces/HAR/source artifacts. No capability was requested from another user.

Personally viewed screenshots, relative to this directory:
- public-normal.png: read-only live viewport; scene hierarchy and properties; Reset view, Edit, Export GLB; realistic/solid/normals/wireframe selector.
- capability-normal.png and capability-390.png: full editor. File/Edit/Add/View/Render/Help; scene/project/settings sidebar; camera/render selectors; transform toolbar; animation timeline. At 390px the sidebar stacks below the canvas and top menus wrap.
- selected-properties.png: selected original shared-scene group, transform gizmo, UUID/name, local position/rotation/scale, shadows, visibility, frustum cull, render order, user data and object JSON export. Selection only; no transform was performed.
- feedback-panel.png: capture/live view, selected-object reference, scene revision r0, select/draw/arrow/box/circle tools, draft text and Leave note. No note was submitted. Existing scene displayed 1,086 objects / 36,528 vertices / 18,604 triangles; this is their actual scene, not a Hive capacity proof.

## Actual upstream reuse, with an immutable pin

Fiend's public `scene.js` chooses editor or viewer after its capability access check. Public `editor.js` imports and instantiates upstream Editor, Viewport, Toolbar, Sidebar, Menubar, Resizer and animation components. Its own integration adds patch diff/merge, WebSocket synchronization, private authorization and feedback.

Downloaded files are read-only research evidence, not adopted Fiend source:
- https://anoma.ly/labs/fiend/editor/js/Editor.js → fiend-editor.js
- https://anoma.ly/labs/fiend/editor/js/Viewport.js → fiend-viewport.js
- https://anoma.ly/labs/fiend/editor.js → fiend-integration.js
- https://anoma.ly/labs/fiend/scene.js → fiend-scene.js

Both Editor.js and Viewport.js are **byte-identical** to the inspected upstream dev files. Exact upstream commit resolved during inspection: `e69f76ed41069827b72550d9a4b1e3901ab61e3b`, dated 2026-09-09T08:21:46Z; package version 0.186.0. Fiend's served three.core.js also declares revision 186. Editor SHA256 is `124ac8bff971ec89f0eed5c1e0a9d1e9a178e66e35d4c5c4b02953f4e91a9fe3`; Viewport SHA256 `597f323c2b9c8c7e6f87bc92192baf5ecd940edb9533198b0c8dcbdcf706e196`.

Upstream source/license: https://github.com/mrdoob/three.js/tree/e69f76ed41069827b72550d9a4b1e3901ab61e3b/editor and https://github.com/mrdoob/three.js/blob/e69f76ed41069827b72550d9a4b1e3901ab61e3b/LICENSE . MIT permits reuse/modification/distribution with copyright and permission notice retained. Bundled third-party editor libraries need their own notices preserved; the root MIT is not a blanket license finding for Fiend custom code. No license to copy Fiend integration/feedback/art was established.

## Recommendation: host the full maintained editor, one session owner

Levi wants the full editor experience. Adopt the pinned upstream editor as the editing-session owner instead of rebuilding its widgets. The earlier controls-only suggestion would reduce first-cut fidelity and require recreating hierarchy, inspector, history, import/export, menus and rendering integrations. It is appropriate for a deliberately small constrained authoring tool, not the best fit for this request.

| Choice | Fidelity and ownership | Cost/tradeoff |
| --- | --- | --- |
| Full upstream Editor + explicit baked-scene boundary (recommended) | Real hierarchy/selection, transforms, geometry/material inspectors, lights/background/fog, import/export, undo/redo and camera tools use one Editor/History mutation owner. | Edits beyond recipe-v1 cannot round-trip into recipe-v1. Preserve a full editor project as the editable result. Pin and host the complete runtime/library closure. |
| Individual controls over recipe-v1 | Existing MCP batch schema remains directly editable; original builder identity stays parametric. | Many advertised editor behaviors are absent or need rebuilding/schema expansion. Does not meet the desired full editor first cut. |

Smallest honest first cut: a full editor workspace loaded with our actual approved original asset export, with Caps surrounding import/save/download/navigation and the exact shared fonts. A new isolated editor frame prevents upstream UI CSS and its pinned Three r186 runtime from mixing with our installed r185 app. Use the same pin for its editor/build/addons/libraries, and exchange JSON bytes rather than live Three objects across that boundary. No root Three upgrade is implied. Verify the complete pin's dependency/resource closure before packaging; realistic path tracing and third-party loaders are real dependencies, not assumed present from the npm Three package alone.

The upstream editor's *internal* menus/inspector remain upstream UI in this cut. Load the released fonts there and a small maintained theme sheet if appropriate; all surrounding Hive UI is public Caps. Do not claim the internal widgets have been migrated to Caps. A later internal UI migration is separate work and should preserve Editor commands/history.

## Import/export contract: avoid silent parallel mutation

1. Recipe/MCP generation continues to use `createSceneDocument`, `applySceneBatch` and `exportSceneDocument`. Opening it in the full editor bakes one explicit input artifact via that same owner. Preserve original recipe/document and its export digest as immutable provenance, outside mutable scene userData.
2. Once opened, Editor.scene and Editor.history alone own that editing session. No simultaneous applySceneBatch updates to a hidden copy; no reverse reconstruction of the recipe after arbitrary mesh/material/geometry edits.
3. Save the full editor project (`Editor.toJSON` / `fromJSON` boundary, with admitted project data). It carries camera/controls/scene/project settings and supported history. Export standalone Three JSON/GLB from the editor scene. Label these full scene/project files distinctly from the original recipe/document.
4. Original hierarchy/names/materials/transforms and geometry should survive bake → editor project save/reload → Three/GLB export semantically. Original builder parameters are provenance only once baked: editing a child mesh cannot honestly regenerate the original bench/bottle recipe. Explicitly report this limitation; never silently drop unsupported scene nodes or camera/material properties to force recipe-v1 output.
5. First cut is local client-owned editing and file round-trip. Existing MCP tools produce imports, not a claim of live shared browser/MCP editing. Shared links, authority, history synchronization and feedback persistence require a later common durable *full scene* boundary. Fiend solves that with custom service state/patch sync; do not copy it or pretend current stateless tools already provide it.
6. Upstream includes script/Play/Publish surfaces, unlike our data-only asset contract. Source acceptance must decide their inert/execution boundary explicitly before enabling imported scripts. Full modeling UI reuse does not require arbitrary code on an MCP server. Do not accidentally enable upstream publishing as a Hive deployment action.

## Exact proposed custody for the implementation checkpoint

NEW `tools/asset-mcp/editor/**` for pinned upstream vendor inventory/notices, isolated entry, narrowly owned import/export bridge, theme and Caps shell; NEW `tools/asset-mcp/editor-proof.mjs` for one real original-asset edit/save/reload/export proof. A separate new editor Vite config/output path avoids mutating the existing portable archive. `tools/asset-mcp/README.md` only for honest API/product boundary paragraphs. Existing scene owner remains unchanged unless source review discovers one specific missing export/admission operation. Existing frozen viewer/transport archives, six-tool packet, engine source, root deps, shared Caps/Botanical and hosting all remain Root/peer custody.

Before broad packaging: first source checkpoint must show the complete pinned editor resource manifest, one actual original scene import, sole Editor ownership, typed byte-message bridge, and exact project versus recipe export labels. Then focused normal/390 render, select/transform/material edit, undo/redo, save/reload, actual exported ObjectLoader/GLB validation, disposal and original-material isolation. Root personally accepts original art and decides publication. No claim of all 28 Fiend tools or shared hosting parity in this first cut.
