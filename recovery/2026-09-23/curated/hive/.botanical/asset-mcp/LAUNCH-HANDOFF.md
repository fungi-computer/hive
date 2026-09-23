# Copper Familiar MCP handoff — September 9

Source commit **886d542807aa65815fe4003a315f30dc605b8339**, Hive feature branch
`feat/goblin-bed-and-breakfast-mvp`. Ordinary game preview is unchanged at runtime
449e9b8; this is source plus a separately built asset service/viewer. All retained
dirty needs/material source remains untouched; the only existing runtime file
changed is `src/art/scale.js`, extracting its byte-equivalent camera function.

## Ready for Botanical's exact deployment owner

- Entry: `/home/levi/src/hive/tools/asset-mcp/worker.mjs`.
- Config: adjacent `wrangler.jsonc`, service name `hive-asset-mcp`, compatibility
  2026-09-04, workers_dev/preview_urls false, no routes guessed or created.
- Target agreed by the two CTOs: `https://mcp.shiit.app/mcp`.
- Only variable: `ALLOWED_HOSTS=mcp.shiit.app,localhost,127.0.0.1`. Add the exact
  temporary deployment hostname if Root needs hosted testing before DNS.
- **No secrets, model/provider keys, DO, KV, R2, Browser or Node compatibility
  binding.** No persistence or scene sharing claimed in this first service.
- Pinned official `@modelcontextprotocol/server` and `client` 2.0.0; Zod 4.5.4.
  Root Three 0.185.1 and original art imports are needed. This is a repo tool,
  not an independently published npm package.
- `createMcpHandler(createAssetServer)` is maintained Streamable HTTP; stdio uses
  the same factory and operations. Current and default legacy clients passed.
- Work is bounded to one JSON-RPC message/32KiB and 24 configured props per call.
  Inputs cannot ask for code, files, URLs, textures or game actions. No model
  cost. Public traffic/rate policy remains Root's ordinary deployment boundary.
- First dry-run bundle: ~1.82MiB / 322KiB gzip. Local proof does not establish
  public capacity/latency. Root owns actual routing, deploy and remote acceptance.

From a clean checkout of the pinned commit:

```sh
npm ci
npm ci --prefix tools/asset-mcp --ignore-scripts
node node_modules/wrangler/bin/wrangler.js deploy --dry-run \
  --config tools/asset-mcp/wrangler.jsonc
```

Use the existing authorized Root credential/deploy mechanism in the deployment
subprocess; never put credentials into this config or client. Configure the
verified domain through Root's exact route owner. After actual deployment:

```sh
node tools/asset-mcp/client-proof.mjs \
  --url https://mcp.shiit.app/mcp --output <owned-evidence-directory>
```

That runs real discovery/build and artifact checks. The public URL is **not
claimed live by Game CTO**. Current Root route-read/access issue is separate.

## Source and result evidence

- u3659 stdio current protocol: listTools/catalog/build two scenes, actual
  material/geometry/rotation change, four input rejections; child closed.
- u3660 default legacy stdio client: actual kettle build; child closed.
- u3668 final local workerd HTTP: current and legacy clients, real exports,
  exact32KiB accepted/+1byte413, JSON-RPC batch400, public CORS204, no auth/Origin
  required; client/runtime errors empty, owned listener closed.
- `.botanical/asset-mcp/http-final-20260909/{http-receipt,mcp-receipt}.json`.
- u3662 actual Three browser render of the stdio results, hash parity, rotation,
  exact download and normal/390 screenshots. Personally viewed both layouts.
- u3667 built static viewer with its **default packaged artifact URLs**, same
  checks; `.botanical/asset-mcp/render-dist-20260909/proof.json`.
- `parsed-export-check.json`: independent ObjectLoader counts/bounds match
  metadata, 60 nodes/51 meshes/1220 triangles each.
- Earlier u3663 compatibility-date failure and u3665 canceled health-warmup
  warning remain preserved; neither is passed off as clean final evidence.
- Fallow u3666: zero clones/cycles. Entry/dependency findings reflect the real
  repo-tool/static/proof entrypoints; seven estimated-coverage advisories remain.
  Actual tested boundaries were reviewed; no suppressions/deletions for the score.

## Portable Caps viewer / exact artifacts

Archive:
`/home/levi/src/hive/.botanical/asset-mcp/copper-mcp-viewer-20260909.tar.gz`

SHA256: `4d471834d098337f57fa4e7ca5d31d94228b148f43c8f8527c019299ae0a33f3`

Manifest: adjacent `viewer-package-manifest.json`. Ten files: viewer.html,
compiled JS/CSS and seven actual MCP export/recipe/metadata/receipt files. No
research HTML, transcripts, credentials, node_modules or private state.
Expanded: `.botanical/asset-mcp/viewer-dist/`. Source is tools/asset-mcp viewer.

This is original geometry using current public Caps. It renders saved actual MCP
results and says so. Host may embed it or adapt the source into the workshop;
Root owns page/site composition. Its three navigation destinations currently
use game-route relative links (`/brewhouse-study.html`, `/study`, `/`); wire those
to the actual Copper/game routes before publishing on a different host.

Baseline export SHA ec33d735fff0bde5ba315a43eeb5bdb61f3ebdbad56fa1961a78955725c20e9a;
variant SHA 796cd995a5468f3e77b13213ed4a2a0001b09ca6ad2f2bc7b4a4a4613a49cc58.
The first scene has a purple bottle and narrower bench; the edit changes actual
bottle material and bench geometry/yaw. Kettle uses the accepted game primitive.
No asset design change, arbitrary-code agent or live model session is implied.

## Fiend parity and broader product

Actual remote Fiend MCP discovery succeeded u3658: 28 tools, no auth/browser
needed for discovery, no eval tool. Exact schemas/review in `fiend/` here.
The committed decision `docs/decisions/asset-mcp-demo-and-scene-editor.md`
accepts all tool families as the target and identifies the next shared scene
document/atomic editor, durable read/write viewer, GLB/capture and feedback cuts.
The current two-tool original-pack slice is **not full Fiend parity**.

The same transport-independent schema/handler boundary can enter current Mycelium
operations or Knapsack connections. Their existing execute/Forage path is the
agent calling owner. No pending generic MCP join is invented, and no new game
agent host was built. Later scoped human-vs-Shiitake play remains engine work.

## Custody / durable goal

Game CTO owns source/Git integration; native authors released exact files and
all owned local HTTP/browser processes are closed. Botanical owns remote
deployment/site/Caps. Retained Game Session is
01a0791e-7ac8-7cc0-90dd-48f8d164e526. Native saved water/gas/world goal is paused
and unfinished; preserved, not replaced. The owning sprint records the current
launch/engine amendment and continued environmental integration obligation.
