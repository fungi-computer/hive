# Original Hive assets over MCP

A real MCP server over the original Copper Familiar Three builders. An agent can
discover supported assets, configure and arrange them, and receive a portable
Three Object JSON scene plus its editable recipe. The game and this tool import
the same original geometry; the server does not duplicate the game simulation.

Current tools:

- `hive_asset_catalog`: schemas/defaults for kettle, bench, bottle and bookcase.
- `hive_build_scene`: 1–24 configured props, unique IDs, bounded positions and yaw.
  Benches have dimensions; bottles have six house colors and a size control.
  Returns `{recipe, scene, metadata}`. `metadata.sha256` hashes the UTF-8 bytes of
  `JSON.stringify(scene)` without a newline. It is an artifact digest, not a
  promise of stable Three UUIDs between independently generated exports.

The document API adds four tools over the same scene owner:

- `hive_scene_create({name})` returns `{document}` at revision 0 with no nodes.
- `hive_scene_edit({document, expectedRevision, operations})` returns a new
  `{document}` after one atomic ordered batch. Operations are `add` (a complete
  node), `transform` (ID and complete local transform), `material` (ID and color
  override or null), and `remove` (ID, including its descendants).
- `hive_scene_inspect({document})` returns `{document, bounds, stats}` from actual
  compiled geometry. Bounds are world coordinates, or null for empty geometry.
- `hive_scene_export({document})` returns `{document, scene, metadata}` with the
  same Three Object JSON and exact-byte SHA256 semantics as the legacy export.

The client retains and sends the full version-1 document on every call. Its node
geometry can be an original `hive-brewhouse-v1` builder, `group`, `box` or
`cylinder`. Local transforms explicitly contain position (meters, Y up), rotation
(XYZ Euler radians) and scale. Only groups can be parents. Inspect the advertised
MCP input schemas for all required node fields and bounded dimensions.

Edits require the supplied document's exact revision, advance it once on success,
and validate every intermediate operation. A failed batch returns a tool error;
the client keeps its previous document. `expectedRevision` checks only the
supplied document: it is not a server-side concurrency lock, replay service or
shared scene ID. Documents allow 24 nodes, eight nodes per hierarchy path and
1–100 operations per batch; HTTP additionally retains its 32 KiB request limit.

All six tools are public art operations. They neither call a model nor accept
scripts, filesystem paths, external textures, credentials or game commands.
The legacy recipe and document API use the shared original-pack compiler and
pure editor in `src/asset-pipeline`. There is no retained server scene, hosted
viewer link, database, undo service or durable hosted ID. Current exports are
independent immutable results.

## Run from the repository

This is currently a **repository tool**, not an independently published npm
package. It imports `src/studies/brewhouse/props.js` and its original art modules.
Use the feature branch containing this directory and Node 24 or newer. This
source tool uses Node's native erasable TypeScript support; it needs no loader:

```sh
npm ci
npm ci --prefix tools/asset-mcp --ignore-scripts
node tools/asset-mcp/server.mjs
```

The last command speaks MCP on stdin/stdout; it is not a web server. Configure an
MCP host with executable `node` and the absolute path to `server.mjs` as its sole
argument. Server logging goes to stderr. The maintained SDK owns framing,
protocol negotiation and lifecycle.

The SDK client proof opens a real child connection, lists/calls tools, writes
baseline and edited scenes, verifies actual material/geometry changes and input
rejections, then closes the child:

```sh
node tools/asset-mcp/client-proof.mjs --output .botanical/asset-mcp/stdio
```

The document client proof calls all six tools, verifies a rejected batch and
stale revision preserve the supplied document, then exports changed original and
generic geometry through Three ObjectLoader:

```sh
node tools/asset-mcp/scene-client-proof.mjs .botanical/asset-mcp/document-stdio
```

## Streamable HTTP

`worker.mjs` uses the official SDK's `createMcpHandler` and the **same**
`createAssetServer()` factory as stdio. It supports current and legacy clients.
One request carries one MCP message, at most 32 KiB; schema limits bound each
scene. There is no persistent scene, subscription, database or background job.

```sh
node node_modules/wrangler/bin/wrangler.js dev --local \
  --config tools/asset-mcp/wrangler.jsonc --ip 127.0.0.1 --port 5196
node tools/asset-mcp/client-proof.mjs --url http://127.0.0.1:5196/mcp \
  --output .botanical/asset-mcp/http
```

Deployment target agreed with Botanical: `https://mcp.shiit.app/mcp`. **This README
does not assert that URL is deployed.** Botanical owns routing/deployment and the
first real remote invocation. The Worker requires only `ALLOWED_HOSTS`, currently
`mcp.shiit.app,localhost,127.0.0.1`. No provider key, Node compatibility flag,
Durable Object, KV, R2 or Browser binding is needed for these document operations. The local
config uses compatibility date 2026-09-04, supported by the retained workerd.

The initial dry-run bundle was about 1.82 MiB / 322 KiB gzip. This is a bundle
measurement, not a request latency/load claim. Root may apply ordinary public
endpoint rate limits in its deployment boundary; there is no fake process-local
accounting system here.

## Render and download the actual results

```sh
node node_modules/vite/bin/vite.js --config tools/asset-mcp/vite.config.mjs
node node_modules/vite/bin/vite.js build --config tools/asset-mcp/vite.config.mjs
```

Open `/viewer.html`. `examples/exports` contains the actual checked stdio results
and receipt; current portable output is
`.botanical/asset-mcp/viewer-portable-20260909`. The earlier `viewer-dist` and
frozen launch archive remain preserved. The portable bundle includes the
released Caps/Stipe font sheets, local Nunito/Maple assets and OFL licenses;
see `portable-fonts/README.md` for exact shared-source provenance. The viewer
uses public packed Caps and `THREE.ObjectLoader`, with the original art camera
extracted to `src/art/prop-camera.js`. It contains no game state or Node MCP code.
It renders saved results, rotates the real geometry and downloads exact export
bytes. It does not present playback as a live agent tool call.

`browser-proof.mjs` accepts artifact directory, output directory, and optional
built viewer directory. On the shared host use the ordinary `run-proof.sh`
wrapper and the documented headless browser environment, as required by AGENTS.

## Maintained dependencies and provenance

- Official [MCP TypeScript SDK](https://github.com/modelcontextprotocol/typescript-sdk),
  pinned server/client 2.0.0, MIT; Zod 4.5.4 validates the operation boundary.
- Existing root Three 0.185.1, MIT; standard Object JSON export/import.
- Original Hive geometry in `src/art` and `src/studies/brewhouse/props.js`; no
  Fiend meshes, source, reference artwork or third-party inspiration images are
  included. This demonstration does not grant a new license over third-party
  references or claim a separately licensed commercial asset pack.

The next [scene-editor contract](../../docs/decisions/asset-mcp-demo-and-scene-editor.md)
records the full inspected Fiend capability target. The document API supports the bounded geometry above; persisted collaborative
editing, GLB and remote capture remain future work.

### Full editor source candidate

`editor/` contains a pinned upstream Three.js editor with a Caps shell. The existing
scene compiler supplies original asset inputs; upstream Editor/History owns the
subsequent baked editing session. Full editor projects, Three JSON and GLB are
separate outputs, with the original document retained as provenance. Arbitrary
mesh edits are not silently converted back into recipe-v1. This local file workflow
is distinct from hosted scene links or live MCP synchronization. The inner editor
controls remain upstream UI using the released fonts. Scripts and app publishing
are disabled; source/readiness review is still pending. See `editor/README.md` for
the exact pin, resource manifest and isolated build boundary.
