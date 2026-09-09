# Full upstream editor: first source checkpoint

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

Renderer/project display settings are included in native project JSON but are not
restored in this checkpoint. The project envelope and Open status disclose that
limitation. Scene loading sets background/environment types before setScene and
preserves the incoming camera UUID in the native camera registry. History admission
checks known non-script command types, IDs, nested records, transforms and references
before mutation; it does not prove arbitrary historical command replay validity.

Parsing/admission failures occur before replacement. Native clear/setScene/history
signals are not a transactional host API: an unexpected renderer/UI failure after
clear may interrupt replacement. The first checkpoint does not claim an unconditional
"bad file never clears the scene" guarantee or complete project-settings round-trip.

This is a source checkpoint, not rendered art acceptance or full Fiend parity.
The pending first readiness proof must validate native menu startup, actual original
scene display and request round-trip. Renderer/environment/project-setting fidelity,
malformed import cleanup, complete object-history round-trip and native export
resource paths require source review and focused proof before claiming coverage.

Build/config: `../editor.config.mjs`; NEW portable output:
`.botanical/asset-mcp/editor-source-checkpoint-20260909-v2`. It cannot empty or replace
the accepted portable viewer directory or frozen hosting archive. Root owns builds,
proof acceptance and publication coordination for this source checkpoint.
