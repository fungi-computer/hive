# Initial maintained WASM boundary

Root owns this boundary and its Rust implementation. The generated web target
exports `WasmKernel` plus ordinary wasm-bindgen `initSync`/default initialization.
The host may supply a precompiled WebAssembly.Module (DO) or load bytes (browser).
All methods below are synchronous, use one JSON string per batch, and throw on
invalid input. No closures cross this boundary.

- `load(json)` accepts `{format:"hive-game",version:1,game,components,initial}`.
  Components are `{id,version,fields:{field:"number"|"boolean"|"string"|"entity"|"nullable-entity"}}`.
  Initial entities are `{id,components:{componentId:{field:value}}}`. IDs are
  nonempty bounded strings. All references must resolve in the initial world.
- `query(json)` accepts an array of component IDs and returns a JSON array of
  `{id,components:{requestedId:record}}`. Component records stay separate. The
  SDK supplies typed row access rather than merging colliding field names.
- `advance(json)` accepts `{delta,writes,actions}`. Writes are
  `{entity,component,value}` and may only target authored components. Physical
  actions are the three forms below. A malformed batch throws before publication;
  a valid but unavailable action reports rejection without poisoning unrelated
  work. Returns `{revision,results:[{accepted,reason?,revision}]}`.
- `snapshot()` returns complete current JSON; `restore(json)` validates a new
  world before replacing the current world. Schema, game, revision and time are
  included. SDK separately owns saved system/RNG/pending-input state.
- `render_facts()` returns JSON `{id,pose?,visual?,label?}[]`.

Reserved physical components are registered by the kernel, never game-writable:

| Component | Fields |
| --- | --- |
| `hive.position` | x, y, z, facing (finite numbers) |
| `hive.body` | speed (positive number) |
| `hive.container` | capacity (nonnegative integer units) |
| `hive.lot` | kind (string), quantity (positive integer), container (entity) |
| `hive.destination` | x, y, z, facing (finite numbers; produced by move) |
| `hive.obstacle` | occupied (boolean; blocks its voxel) |
| `hive.visual` | sprite, label (strings, initialized by content) |

Actions:

```ts
{kind:"move",entity,destination:{x,y,z},facing?:number}
{kind:"transfer",lot,from,to,quantity}
{kind:"consume",entity,lot,quantity}
```

Movement sets intent and advances by speed/time over a bounded grid path; it
does not teleport. Transfers require current ownership, capacity and contact;
whole transfers retain lot ID, partial transfers conserve units and create an
explicit remainder identity. Consumption requires the actor's own custody.
Game-side selection stays client state. Group orders and delivery plans are
shared SDK/game rules composed from these operations, not kernel branches on
colony/survival/formations names. First examples use level ground; coordinates
retain y and do not impose a shallow global-world envelope.
