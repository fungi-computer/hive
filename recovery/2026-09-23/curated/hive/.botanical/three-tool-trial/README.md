# Three tool trial

`brewhouse-kettle.r185.json` is a standard Three Object JSON export of the
current original Copper Familiar kettle. `export-brewhouse-kettle.mjs` creates
it before the usual bake path disposes geometry and verifies an r185
`ObjectLoader` round trip.

`retained-kettle.html` retains that artifact in a separate ignored Three
renderer. It is a safe target for a future loopback-bound devtools bridge; it
is not production gameplay or a second art pipeline.

The pinned `threejs-devtools-mcp@0.4.1` trial is blocked: its packaged bridge
uses `httpServer.listen(this.port)` without a host/bind option. Do not start it
on this host because Node will bind beyond loopback. No shim or global MCP
registration is approved. The official Three editor can consume the Object JSON
artifact, but editor changes cannot round-trip into the procedural factory or
Pixi bake.

When a bridge supports an explicit loopback bind, serve this ignored fixture at
`127.0.0.1` and limit the first session to `bridge_status`, `scene_tree`, and
`renderer_info`.
