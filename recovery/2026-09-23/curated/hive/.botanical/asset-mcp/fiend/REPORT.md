# Fiend real remote MCP capability inspection

Checked 2026-09-09 at 06:01 UTC against https://anoma.ly/labs/fiend/mcp.

## Observed result

The installed maintained official `@modelcontextprotocol/client@2.0.0` successfully performed **real Streamable HTTP initialize and tools/list**, without an account, bearer token, provider key, or browser viewer. Server identifies as `fiend` version `0.1.0`; negotiated protocol is `2025-11-25`. Initialize returned HTTP 200 JSON, initialized notification HTTP 202, and tools/list HTTP 200 JSON. The server advertised only `{tools:{listChanged:true}}`. It did not issue an MCP session ID. Resources/prompts were therefore not requested or claimed as supported.

The successful owned diagnostic was `run-u3658.scope`, invocation `cb14989851024ed98482884549532c61`, exit 0. An earlier `run-u3657` failed locally before any connection because the diagnostic's SDK import had one extra `..`; that import was corrected. The successful run closed its client normally. The optional background GET was aborted by normal close after the list response; this is recorded, not an endpoint failure. No process or server was left running.

Exact unmodified server tool definitions/input schemas/instructions and HTTP metadata are in `capabilities.json`; reduced inventory is `tool-summary.json`. `manifest.json` hashes retained artifacts. Read-only public HTML and client landing/mascot scripts are retained for provenance and **are not licensed Hive source or publishable asset inputs**.

## Actual advertised tools (28)

| Purpose | Tools |
| --- | --- |
| Scene lifecycle | `create_scene`, `inspect_scene`, `inspect_object`, `get_scene_link` |
| Atomic editing | `edit_scene` |
| Geometry and hierarchy | `add_mesh`, `add_extrusion`, `add_lathe`, `add_tube`, `add_group`, `duplicate_object`, `rename_object`, `remove_object`, `reparent_object` |
| Object/material changes | `update_object`, `set_material` |
| Lighting and framing | `add_light`, `set_light`, `frame_object`, `set_background`, `set_camera` |
| History | `undo_scene`, `redo_scene` |
| Human feedback | `get_feedback`, `resolve_feedback` |
| Output | `export_scene`, `capture_scene`, `export_asset` |

Read-only annotations exist for inspect_scene/object, get_scene_link, get_feedback, export_scene, capture_scene and export_asset. No arbitrary JavaScript/eval tool was present in the actual list.

Every scene read tool requires a public scene UUID. The landing page exposes a static mascot GLB rather than a public editable scene UUID. I did not invent/enumerate IDs, create a scene, perform edits, call capture/export against an unknown asset, or use private scene secrets. Consequently, **listing is live protocol evidence; actual scene creation/edit/GLB/capture behavior remains advertised contract rather than exercised behavior**. There was no authorization rejection; those calls were intentionally outside this read-only task or lacked a supplied public scene.

## Important contract details

- `create_scene` advertises a persistent scene with public ID, one-time private edit secret, read URL, edit URL with secret in fragment, and GLB URL. Optional copy from a public source scene; no account required.
- Reads require the public scene ID. All editing/history/feedback resolution require a scene edit secret, with an optional expected revision on edits. This application authorization is distinct from the MCP transport session, which was absent in this run.
- `edit_scene` accepts 1–100 typed operations in one atomic batch, one broadcast and one undo step. Later operations can name objects created earlier in the same batch. The same primitives exist as individual convenience tools. A failed operation is advertised to leave the scene unchanged.
- Shapes are box, sphere, cylinder, cone, torus, plane, icosahedron, capsule, torus knot, dodecahedron; extrusion has 3–128 2D points, lathe 2–128 radius/height points with 3–64 segments, tube 2–128 3D Catmull-Rom control points.
- Transform convention is meters, Y-up, XYZ Euler radians. Reparent preserves **local** transform. Object lookup accepts UUID or unique name. Bounds inspection and camera fitting are first-class tools.
- Materials expose color, metalness, roughness, opacity, emissive/intensity and wireframe; editing clones shared material ownership so unrelated meshes should remain unchanged. Duplicate claims new object UUIDs and independently editable materials.
- Undo/redo advertises the last 20 shared edits, including browser edits and MCP batches.
- Human feedback retains object identity, originating camera/render mode, scene revision, optional drawing points, screenshots and stable feedback IDs. Reads do not clear notes; resolution clears only addressed IDs, preserving notes added meanwhile. Read page limit is 1–10, default 5. This is a useful revision-aware human/agent review loop, separate from scene history.
- `export_scene` advertises full Three Object JSON plus camera and a direct download URL.
- `export_asset` returns a public GLB URL for scene or chosen object/group. The advertised export strips preview cameras/lights while preserving names/hierarchy/pivots/PBR materials. URL follows latest scene revision; download bytes to pin an asset. It is not a fixed historical artifact reference by itself.
- `capture_scene` advertises PNG plus labeled screen positions rendered using a Cloudflare browser, **without a connected human viewer**. Width 256–1600, height 256–1200. That implies an actual server browser/runtime capability for equivalent remote capture, not merely a static site or Node ObjectLoader.

## Implications for Hive parity

Levi asked to expose what Fiend exposes. Treat this inventory as a concrete capability target; do not call the first original-prop export proof full Fiend parity.

1. Preserve the existing same-builder original-asset proof as a useful first result: discover our pack, create a chosen original prop, inspect, export, render. Our original art definitions/pixel bake add value beyond a generic scene editor.
2. Add generic authoring over **one serializable asset scene owner**: typed geometry/transform/material/hierarchy/framing operations. Individual MCP tools and batch API must call the same operation handlers. Our original builders populate that same scene; a second scene/asset truth is unnecessary.
3. Retained collaborative editing adds real product work: scene ownership, durable state, expected revisions, atomic operations, bounded undo history, viewer links and private write authority. Stateless Streamable HTTP does not by itself provide any of those guarantees.
4. Remote PNG capture needs the actual Cloudflare browser binding or another existing approved rendering worker. JSON and GLB generation are separate from browser rendering. No provider key is required for deterministic Three tools, but Cloudflare browser/service usage is still a deployment dependency.
5. A frame/annotation feedback loop is worth adopting from their design after core editing; it should carry original revision/view/object references so an agent cannot mistakenly fix stale screenshots.
6. Do not expose game admin commands or arbitrary server code to approximate generic modeling. None is needed by their current advertised API. Keep asset scene editing separate from physical inventory/world authority.

For tomorrow, Root can publish the real stdio and remote original-asset tool result while accurately naming the subset. The remaining parity target must be recorded and implemented in reviewable cuts rather than a claim that 28 advertised names are already supported.
