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

Both are public art operations. They neither call a model nor accept scripts,
filesystem paths, external textures, credentials or game commands. The compatible
MCP recipe now resolves into the versioned scene document and shared original-pack
compiler in `src/asset-pipeline`. Its pure editor supports bounded atomic edits;
these two MCP tools do not yet expose shared scene editing or durable hosted IDs.
Current exports are independent immutable results.

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
Durable Object, KV, R2 or Browser binding is needed for these two tools. The local
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
and receipt; production output is `.botanical/asset-mcp/viewer-dist`. The viewer
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
records the full inspected Fiend capability target. This first demo does not yet
offer generic primitives, persisted collaborative editing, GLB or remote capture.
