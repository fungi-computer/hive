# Asset MCP demonstration and scene editing

Game CTO, September 9, 2026. This implements the corrected September 10 launch
direction: Copper Familiar plus a real asset MCP connection. Botanical owns the
site and remote routing; Hive owns original assets, operations, SDK server and
client/render evidence. The agreed remote address is `mcp.shiit.app/mcp`; the
game domain is `goblin.shiit.app`. Neither spelling establishes a live deployment.

## Portable hosting fit, September 9

Botanical's source review found that the frozen `886d542` viewer has host-relative
links to `/brewhouse-study.html`, `/study` and `/`, and lacks the current shared
font faces. Preserve that archive and its evidence. The existing asset PM owns
a new source-built portable artifact with public Caps/Stipe fonts and a supplied,
verified absolute game URL; omit destinations not established on the host.
Current Hive tarballs do not include the new font export. Botanical released
the exact read-only `packages/caps/src/fonts.css` and `packages/stipe/fonts.css`
plus adjacent Nunito/Maple Mono assets, both OFL licenses and README provenance
for this bundle. Preserve those sheets and relative font URLs through the
maintained bundler; no recreated font-face rules, shared source edits or package
rebuild are needed. The portable manifest owns exact released source hashes.
Installed public Caps controls stay unchanged; do not claim the old package
supplies these font assets or copy unrelated shared source.

The new handoff must identify source revision, file inventory and archive hash,
and include actual normal/narrow rendered proof, font loading and working
navigation/export. Marketing owns copying the accepted artifact under
`shiit.app/public/workshops/copper-assets` and its Astro project entry; Botanical
owns publication. This hosting correction is independent of vertical engine
acceptance and does not authorize copying engine source into the marketing site.

## Real first consumer

`tools/asset-mcp/assets.mjs` defines narrow, transport-independent art operations
with Zod input schemas. The original bench/bottle/kettle/bookcase factories
already used by Copper Familiar construct the geometry. The shared art camera
is extracted unchanged from `scale.js` into `prop-camera.js`, so an independent
renderer does not import the game terrain/world just to frame an asset.

`mcp-server.mjs` registers those operations once. `server.mjs` uses official SDK
2.0.0 stdio. `worker.mjs` uses its maintained Streamable HTTP handler over the
same factory. Neither has another asset state, agent host, game admin authority,
provider key or arbitrary code interface. Client-owned exported recipes/artifacts
are honest enough for this first authoring loop; shared editable scene IDs are
not fabricated by storing transient request state.

`client-proof.mjs` really lists and calls tools over the transport and verifies
geometry/material changes and exported digests. The browser separately imports
the resulting bytes, renders and rotates actual geometry, and downloads those
same bytes. Public Caps supplies viewer controls. Source and evidence are linked
from the [runnable README](../../tools/asset-mcp/README.md).

The initial stdio result is u3659, default legacy-client result u3660, browser
render/download u3662. Both exports contain 60 nodes/51 meshes/1220 triangles;
independent ObjectLoader bounds and counts match operation metadata. Changed
pixels were personally reviewed at native, normal and narrow scale. The first
Worker dry-run u3661 passes; it is not hosted evidence. Subsequent HTTP and
packaged-viewer evidence belongs to the launch handoff, not this historical
first-checkpoint paragraph. Existing dirty needs/material source is preserved.

Final local HTTP u3668 and packaged viewer u3667 passed. HTTP exercised current
and legacy clients, actual exports, input/batch/size limits and clean owned-host
shutdown. The packaged viewer's default relative exports, rotation and exact
downloads passed at normal/390 widths. These are local, not public-route claims.
Fallow u3666 exited 0 advisory: no clones/cycles; five real static/proof/Worker
entrypoints and seven dependencies supplied by the parent repository need the
documented repo-tool interpretation. Seven risk findings use estimated absent
coverage; actual request-boundary/browser checks are retained separately.
Nothing was deleted or suppressed to make the audit appear clean.

## Shared scene owner accepted, September 9

The compatible MCP operations now compile through `src/asset-pipeline`: one
versioned document, checked original-pack definitions, atomic ordered edits and
the original Three builders. The old recipe parser becomes a compatibility
adapter; its degrees convert once to the document's local Euler radians. The
compiler owns output limits, geometry cleanup and per-object material clones.
It does not dispose shared original palette materials. Catalog parameter types
and exhaustive builder dispatch prevent advertising a builder with a mismatched
schema. Node source execution requires Node 24 or later; Worker bundling uses
the existing maintained transport. No dependency version changed.

Independent source review accepted the corrected compiler/callers. Eleven
focused laws and strict types passed; after Fallow identified batch-edit
cognitive complexity, mutation of one edit and subtree removal were separated
from atomic batch admission. The six existing editor laws and focused types
passed again (`u3754`, `u3755`). Fallow `u3743` found no clones. Its unused-file
findings had zero discovered entrypoints because the scan root excluded the
actual MCP consumer. Its estimated-coverage warnings are advisory; the compiler
and relation checks remain explicit reviewed responsibilities. No source was
deleted or suppressed to hide those findings.

Real stdio `u3722` and local HTTP `u3742` both exported through this owner. HTTP
also checked current/legacy clients, byte limits, batch rejection and public
CORS; its owned server closed with no runtime errors. Browser `u3740` loaded the
exact exports, rotated them, downloaded identical bytes and fit normal/390px
layouts with no errors. Astra personally accepted the two native renders and
both viewer screenshots. Earlier browser attempts failed before page launch on
missing full-Chrome host libraries; the existing headless-shell runtime passed.
Receipts and failed attempts remain under `.botanical/asset-mcp/`.

This is a source/local transport/render milestone. The two public tools retain
their compatible contract; they do not yet expose shared editable scene IDs,
history, GLB or server capture. Botanical's earlier hosting handoff remains
pinned to `886d542` and its viewer archive until Botanical explicitly selects
this source update. No new remote deployment or completed engine is claimed.

## Fiend: checked reference, not a guessed feature list

An official SDK client connected to
[Fiend's MCP endpoint](https://anoma.ly/labs/fiend) on September 9. Server
`fiend` 0.1.0 negotiated protocol 2025-11-25 and advertised 28 tools without
requiring an account or open browser for discovery. We did not create or edit
someone else's scene. Initialization/listing is exercised evidence; the listed
scene/edit/capture behavior below is its advertised schema contract.

The exact catalog and review remain in `.botanical/asset-mcp/fiend/`. Public site
HTML/client assets retained for research are not part of our original asset pack.
Levi's request to expose these capabilities is accepted. Two original-builder
tools are the first implemented slice, not a claim of feature parity.

| Capability family | Actual Fiend tool names | Hive owner and sequence |
| --- | --- | --- |
| Scene lifecycle and inspection | create_scene, inspect_scene, inspect_object, get_scene_link | One versioned scene document; durable hosted IDs/read/write authority when persistence lands |
| Atomic editing | edit_scene | One validated operation batch, one revision and undo entry; individual tools use these same handlers |
| Geometry/hierarchy | add_mesh, add_extrusion, add_lathe, add_tube, add_group, duplicate_object, rename_object, remove_object, reparent_object | Three geometry definitions alongside original-pack nodes in the same document |
| Object/material | update_object, set_material | Typed transforms and owned material edits; one edited object cannot recolor siblings |
| Light/camera | add_light, set_light, frame_object, set_background, set_camera | Asset-scene presentation, independent of game picking/simulation |
| History | undo_scene, redo_scene | Bounded history at the scene mutation owner, including browser and MCP edits |
| Human review | get_feedback, resolve_feedback | Stable note/object IDs plus revision and camera; resolve addressed notes only |
| Export/capture | export_scene, capture_scene, export_asset | Object JSON, maintained GLB export, and genuine headless render; pinned artifact results |

Fiend has no arbitrary JavaScript execution tool in this catalog. Its editing
uses a public scene UUID and private edit secret, optional expected revision,
atomic 1–100-operation batches and 20 undo steps. Capture advertises a Cloudflare
browser even without an open human viewer. GLB links follow the current revision;
Hive should preserve downloaded artifact hashes when presenting reviewed output.

## Next implementation cuts

1. **One scene document and editing owner.** Extend the current recipe with a
   version and nodes: original builder, group, and generic geometry. Start with
   box/cylinder plus add/transform/material/remove; the geometry vocabulary then
   expands to the inspected shape families without a new scene owner. A batch
   applies to a candidate document and commits atomically. Node IDs are unique,
   parent references valid, hierarchy acyclic, and dimensions/counts bounded.
   Preserve local-versus-world transform semantics explicitly. Prove rejected
   batches leave the original unchanged, material edits do not mutate siblings,
   deleted subtree cleanup is complete, and a saved document reproduces its
   geometry. MCP tools and UI call the same operations.
2. **Persistent shared viewer.** Agree an ordinary host storage binding and
   public-read/private-write contract with Botanical. A scene revision check,
   mutation and bounded undo entry settle together. Stdio can use supplied
   documents; it must not gain a competing undocumented in-memory scene store.
   Viewer links refer to an actual retained scene and exports to a revision.
3. **Export and image result.** Add maintained Three GLB export, then server
   capture through an explicit rendering host binding. Separate generation from
   rendering: no WebGL/browser inside an ordinary Worker fetch is assumed.
   Return pinned bytes/hash/revision and useful camera/object framing facts.
4. **Human/agent feedback.** Notes retain object ID, scene revision and view.
   Resolving one reviewed note cannot erase newer ones. An agent can see the
   actual captured image and address its objects through the existing editor.

Each cut must retain original reusable art, deterministic geometry conventions
and disposal rules. Add useful tooling without widening game authority or
creating another simulation. Full collaborative editing/capture is accepted
direction; runtime bindings and exact launch scope are coordinated with Root.

## Mycelium and the engine

Botanical's checked handoff establishes the actual path: Mycelium authored
operations/modules or Knapsack `getCapabilities`/`call` providers, acquired into
the one `execute` tool with Forage discovery. Knapsack already preserves output
schemas. Its current source does not supply MCP transport. That is why this
independent MCP demo uses a maintained SDK, rather than pretending Mycelium is a
transport or building a new agent framework.

The operation schema/handler is the reusable boundary. A later Botanical host
can expose it through its existing connection/tool machinery. Asset authoring
and the engine's scoped game commands remain different grants even when both
are callable through the same execute door. The engine's first-class Shiitake
roles and finite-world authority in [Vishnu's many faces](vishnus-many-faces.md)
remain core direction; this asset launch does not assert that AI gameplay exists.
