# Clearing playable browser proof

This is a source-prepared, bounded driver for the accepted Clearing repair
artifact. It consumes an already-built frontend and an already-running local
`public-engine-host`; it does not start either service, build the engine, run
Wrangler, or mutate game source.

Run it only after the frontend has been built with the local public-engine-host
origin compiled into `VITE_HIVE_PUBLIC_HOST`:

```sh
/home/levi/src/Botanical-next/.agents/skills/orchestrate-multi-lane-work/scripts/run-proof.sh \
  node tools/public-engine-host/playable-browser-proof.mjs \
  http://127.0.0.1:5187/engine/colony.html \
  .botanical/playable-browser-proof
```

`CHROMIUM_PATH` must point at the provisioned Chromium used by the existing
browser proofs. The driver creates a fresh invitation token and browser
context, observes the real two-person party join, and records HTTP command
receipts while using the public UI. It checks selection/Draft/Undraft/Go,
rectangle digging, shared floor/wall/furniture placement, a floor replacement
attempt on an occupied support, stair and voxel-layer controls, and desktop plus
390px screenshots. It records `REPORT.json` and `source-inventory.json` under
the supplied output directory.

The script intentionally preserves honest limits: it cannot claim native
completion from a click receipt, and if the built artifact cannot expose a
visible support surface for a placement it records the failure and screenshot.
The separate native/DO, party-recovery, and depth qualification commands own
those proofs.

Before deriving any world click it performs one ordinary one-pixel viewport
resize. This lets the client's existing `ResizeObserver` run its camera reset;
the driver then uses the actual canvas box rather than assuming that the
initial camera focus was centered. Structure clicks use the public static-art
manifest's placement, anchor, silhouette, and the client's shared
`resolveWorldArtPlacement` datum. They choose an opaque manifest pixel, rather
than clicking a raw pose center. Command assertions associate the first
 request after each recorded boundary with its response ID.

Terrain gestures choose distinct material-1 surfaces from the current
authoritative observation, excluding current fact positions, structure surfaces,
and already reserved cells. Dig endpoints and wall strokes are same-level
neighbors. Before construction it finds one clear same-level 3x2 rectangle,
places six floors with ordinary Build floor gestures, then places the north
2x2 brewer and north 1x2 bed on separate origins in that rectangle. The wall
is queued after those floors and fixtures so this bounded proof does not spend
starter materials before the required support and replacement checks.

The exact source inventory is embedded in
`tools/public-engine-host/playable-browser-proof.mjs` and includes the driver,
the shared client gesture/action-bar/placement binders and art-placement owner,
the checked static-art manifest, Colony definitions and party plan, the remote
runtime, and the public host protocol/worker.
