# Full upstream editor: native project boundary

This is an isolated, pinned Three.js r186 editor inside a public Caps shell. The
upstream Editor and History own scene, selection, transforms, geometry/material
edits and undo/redo. The surrounding shell compiles original recipes through the
existing Hive asset owner, then transfers JSON bytes into the editor. It retains
no mutable recipe alongside an editing session.

Pin: `e69f76ed41069827b72550d9a4b1e3901ab61e3b`. `resource-manifest.json` records
source URLs, byte sizes and SHA256 for every vendored file. `vendor.mjs` reproduces
that closure from public upstream sources. It preserves upstream LICENSE and
bundled license comments/files, plus pathtracer/BVH MIT and Draco Apache notices.
No Fiend integration code or art is included. The complete editor source subtree
is preserved for audit; its original HTML/service-worker entry is excluded from
the portable build so it cannot establish a second executable app entry.

The runtime maps Three/build/addons, pathtracer 0.0.23, BVH 0.7.4 and Draco 1.5.7
locally. Native Vite serving is bypassed only for that isolated raw module graph,
so it cannot silently mix the parent app's installed Three r185 with r186. The
manifest's remaining external module is MP4Box 2.3.0, used by upstream video export;
video/player is not enabled in this checkpoint. Optional Rhino loading also uses
an upstream external library path; native file routes are not enabled here.

The released Caps/Stipe font sources are reused by the shell and copied without
alteration into the frame's portable output, including OFL/provenance files. The
inner inspector/menu widgets remain **upstream UI**, not Caps-migrated controls.

## Byte boundary and files

Parent and frame verify exact origin, window source, channel and bounded request
ID. Operations are load-asset, load-project, export-project, export-three,
export-glb and dispose. Payloads and results are transferred ArrayBuffers, with no
live Three references or arbitrary editor commands crossing the boundary.

- Initial source is the approved baseline recipe, freshly compiled by
  `exportSceneDocument`; its scene is baked, and recipe/metadata provenance is kept
  separately as immutable JSON text. Imported original materials become independent
  per mesh without changing their appearance.
- Open admits recipe-v1/document-v1 or this pinned full editor project JSON, with a
  32 MiB byte boundary. It does not silently reverse-convert arbitrary editor
  changes into a constrained recipe. External image URLs and executable project
  scripts/history are rejected before ObjectLoader.
- Save Project preserves the native scene/camera/controls/history in an explicitly
  named `hive-editor-project` envelope plus original provenance. Three JSON and GLB
  are distinct artifact outputs; GLB omits editor-preview cameras/lights.
- Runtime project scripts, Script UI, Play/Publish, demo apps and video/player are
  disabled. Native File Open/Import/Save route to the shell boundary. No Player,
  Script, service worker, hosted persistence, shared link or live MCP sync starts.
- Scene replacement and frame disposal release the session's geometries/materials/
  textures; renderer animation loop and context are stopped when the frame closes.

The interaction candidate restores renderer type, antialias, shadows, shadow type,
tone mapping and exposure through the native renderer panel's controls/configuration
writer. `upstream-patches.mjs` verifies the pristine resource SHA before each exact
replacement; dev and static build apply the same changes. `runtime-patches.json`
records pristine/result hashes. The vendored pin and notices remain unchanged.
The small owner patch also includes antialias in Editor.toJSON and preserves scene
background/environment rotations and environment intensity in Editor.setScene.
Renderer creation is serialized through its retained native Promise; frame readiness,
imports and exports await completion. A failed creation rejects its caller, disposes
the unpublished candidate and retains the current renderer; a later native selection
or project restore may retry. Project restore resolves renderer recovery before
clearing the scene and reapplies settings after native clear resets them.

Original admission attaches detached directional/spot light targets to the native
scene graph with Object3D.attach, preserving their world transform. Each normalized
target records `original-detached-light-target-v1` in userData; immutable recipe
provenance remains unchanged. Native ObjectLoader can then restore the serialized
light-to-target UUID relationship. This does not repair arbitrary older projects
whose detached target data was never serialized.

Admission (`project-admission.js`) validates/decode/parses a detached candidate;
application (`project-application.js`) calls native renderer/scene/camera/History
owners; `scene-resources.js` closes candidate/session resources. Session retains
only immutable source-provenance bytes alongside the sole native editor owner.

Native `Sidebar.Settings.Shortcuts` already installs W/E/R, Ctrl/Cmd-Z and
Shift-Ctrl/Cmd-Z handlers, plus configurable focus/camera keys. The frame uses those
handlers directly. Native text/number inputs stop key propagation while editing;
viewport/outliner focus resumes editor shortcuts. No parallel keyboard dispatcher
was added. History admission checks known non-script command records before native
History.fromJSON; arbitrary historical replay validity remains a separate limit.

Parsing/admission failures occur before replacement. Native clear/setScene/history
signals are not a transactional host API: an unexpected renderer/UI failure after
clear may interrupt replacement. The first checkpoint does not claim an unconditional
"bad file never clears the scene" guarantee before runtime interaction verification.

Current project imports require explicit renderer settings (including antialias),
camera, controls, background and environment types. There is no legacy project
settings migration. Original scene imports receive their actual initial view
and renderer defaults instead of pretending to be saved editor projects.

Lightweight native laws run with `node --test tools/asset-mcp/editor-native-laws.mjs`
through the required run-proof wrapper. They use the frame's pinned r186 mapping,
real ObjectLoader/resources and current admission; no mocked Editor or renderer.
They cover required settings, scene/camera serialization, original material
isolation, transformed light target identity, failed camera admission disposal,
and malformed/executable history rejection. This is not native UI/history replay
or GPU renderer recovery evidence. Browser runs before target closure reached
transform/undo/redo and nondefault settings save/reopen, then exposed detached
target identity. That source defect is closed by the native target law. Subsequent
browser readiness timed out; full corrected history/GLB interaction remains
unproved. Levi stopped further expensive browser testing. No full Fiend parity
or unconditional transactional import claim is made.

Build/config: `../editor.config.mjs`; NEW portable output:
`.botanical/asset-mcp/editor-native-checkpoint-20260909`. It cannot empty or replace
the accepted portable viewer directory or frozen hosting archive. Root owns builds,
proof acceptance and publication coordination for this source checkpoint.
