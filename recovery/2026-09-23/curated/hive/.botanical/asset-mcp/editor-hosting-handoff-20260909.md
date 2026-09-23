# King Bolete → Shiitake: full editor static review packet

## Current accepted packet: Caps Latte correction

**Use this replacement for hosting.** Source revision
`5171299382909e5b368f4508286f8f7767a34798` changes only outer `index.html`,
`shell.css` and the isolated config output suffix from the original 512 editor.
The shell selects the existing Latte theme and consumes released
`--color-base-100`, `--color-base-content` and configured `--font-sans` with the
existing Nunito face. No custom palette, font-face, upstream internals, geometry,
settings, history or service changes entered this packet.

- Archive: `/home/levi/src/hive/.botanical/asset-mcp/hive-full-editor-latte-20260909.tar.gz`.
  SHA256 `783340f2e709845bae8695237b0606e3945080f02542057f54c5ed2cbc7d0713`;
  5,050,090 bytes.
- Static root: `/home/levi/src/hive/.botanical/asset-mcp/editor-theme-checkpoint-20260909`;
  273 files, 19,506,876 bytes. Same static-only hosting/license requirements below.
- Evidence: `/home/levi/src/hive/.botanical/asset-mcp/editor-readiness-20260909/theme/`.
  `root-acceptance.json`, `checkpoint.json`, `receipt.json`, source/static
  inventories, `normal.png`, `390.png`.
- Source inventory SHA256:
  `494636f519f64254270f5ceb69550c0f8c09b2f05a8a974fa592801da05dac02`.
  Static inventory SHA256:
  `c9ba3c88b7a7cc392aaf46615459b88d170a982fe0e99bcce4ead245a0134ca0`.
- Build `u3934` / `37004cfceec14de3b8e24963f1bf8bd8` and proof `u3935` /
  `36cde24c9fee46999b3a7e50aea70a0d` exited 0. Enabled outline labels measured
  7.062:1 contrast at both desktop and 390px. Original scene/project download and
  both released fonts remained working; 126 local resources, errors empty, owned
  browser/listener closed. King Bolete personally viewed both captures and verified
  all source/static/archive hashes. The original bcb9 packet below remains retained.

Botanical may host these accepted bytes on its dedicated review route, then
`editor.shiit.app`; Hive has not deployed or claimed that URL live. Settings/history/
GLB completeness and shared links remain separate from this visual correction.

## Original source/readiness packet (retained)

Accepted for a dedicated review host, September 9. This is the full pinned
upstream Three.js editor with original Hive asset import and a Caps shell.
It is not full Fiend parity or an accepted shared-project service. Source owner
released custody at this checkpoint; King Bolete personally viewed both captures
and checked every source/static inventory hash plus the archive hash.

- Source revision: `512c69817592d03e2de44ba3c4b1c09b8eb724da` on Hive's existing
  feature branch. Files: `tools/asset-mcp/editor/**`,
  `tools/asset-mcp/editor.config.mjs`, bounded parent README addition.
- Archive: `/home/levi/src/hive/.botanical/asset-mcp/hive-full-editor-checkpoint-20260909-v2.tar.gz`.
  SHA256 `bcb9db6c9dfc0495cf48c10ddd8caad9431e67261a5ca6f90887a8171c3fe033`;
  5,050,095 bytes. Extracted: 273 files, 19,506,854 bytes.
- Exact static root:
  `/home/levi/src/hive/.botanical/asset-mcp/editor-source-checkpoint-20260909-v2`.
- Proof/acceptance root:
  `/home/levi/src/hive/.botanical/asset-mcp/editor-readiness-20260909/run2`.
  `root-acceptance.json`, `checkpoint.json`, `receipt.json`,
  `source-inventory.json`, `static-inventory.json`, `normal.png`, `390.png`.
- Source inventory SHA256:
  `6cf364adf1c29a9f7f90fff44fd04397069c977f57b9e6216d3445f1299d452a`.
  Static inventory SHA256:
  `020ffdfa211b454adb58c6592391d230b91ee144844a52973fe9a9ce9ed75800`.

Build `u3918` / `723f0f7d324746c1812045a265cd4ea1` and focused static browser
`u3922` / `6316e3101b554c6fba00a20cb493a96a` exited 0. The browser loaded the
original kettle/bench/bottle, downloaded native project JSON, loaded Nunito and
Maple Mono in both frames, and saw 126 same-origin 200 resource responses with
errors empty. Normal and 390px captures contain the native hierarchy, viewport
and controls. Browser and listener closed. First font-path failure is retained
in run1; no independent physics/game proof was run for this editor.

## Hosting and license boundary

Serve the static root as an ordinary static application with its relative paths
intact, correct JS/CSS/font/Wasm MIME types and real missing-file 404s. It uses a
same-origin editor iframe and ordinary file downloads. No secrets, model provider,
DO, SQL, MCP server, server-side Three renderer or npm process is required for
this build. The source build uses the existing Hive dependencies and
`node node_modules/vite/bin/vite.js build --config tools/asset-mcp/editor.config.mjs`;
there is no need to rebuild for first hosting of these pinned bytes.

Botanical owns the dedicated stable workers.dev review deployment and later
`editor.shiit.app` when actual DNS authority works. Keep the playable game and
accepted 886 transport/402 viewer routes unchanged. Hive does not claim the new
editor URL live before Botanical's hosted check.

Preserve `vendor/LICENSE` (Three MIT),
`vendor/external/{bvh,pathtracer}-LICENSE` (MIT),
`vendor/external/draco-LICENSE` (Apache), upstream font notices/licenses under
`vendor/examples/fonts`, and `portable-fonts/stipe/fonts/{Nunito,MapleMono}-OFL.txt`
with both provenance READMEs. `resource-manifest.json` identifies the pinned
public upstream sources. No Fiend custom integration or private scene art is
included. The original Hive assets use the existing original asset/compiler
source; this packet does not change their license or geometry.

## Qualified behavior and next source work

This first host is a **reviewable editor preview**. Native project download and
original rendering are proved. Native geometry/transform/material/history UI and
Three/GLB export paths exist; complete edit/undo/reopen/GLB roundtrip is not yet
proved. Renderer/project settings are saved but not restored in this checkpoint;
the Open/export path records that limit. Post-clear native UI/renderer exceptions
are not transactional imports. Script execution, Play/Publish and video are
disabled. No shared links, hosted save or live MCP scene sync exists here.

Fallow `u3925` found a real import `load` hotspot (cognitive 26), slated for
admission/application separation with the next real roundtrip work. Its unused
session/export findings miss the raw iframe module entry; its unlisted Three
finding misses the iframe import map and root compiler dependency. Those actual
callers were inspected and retained; no audit-green or deleted-upstream claim.

This asset editor is distinct from Levi's requirement that all environmental
demos show actual Hive voxel-world actions. Water/soil/air publication still
requires their real world/simulation join; this editor result does not complete
the engine or hide the known water ledge limitation.
