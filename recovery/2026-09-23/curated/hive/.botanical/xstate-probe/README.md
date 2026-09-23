# XState interaction probe

This isolated probe uses `xstate@5.32.6` (MIT), TypeScript 5.9.3, and the stable
v5 `setup`, type-bound `assign`/`emit`, `createActor`, `actor.on`, and
`getSnapshot` APIs. It does not use React, timers, invoked actors, or child
actors.

The local contract is a closed `InteractionEvent` union and one emitted
`InteractionOutput`:

```ts
type InteractionOutput = {
  type: "designation.commit";
  region: { minX: number; minZ: number; maxX: number; maxZ: number };
};
```

`probe.ts` proves the transition path `idle -> chopReady -> chopDragging ->
chopPreview -> idle`. Pointer release freezes a two-axis rectangle; preview
hover is ignored; cancel replaces all gesture coordinates with null; a second
gesture uses new bounds; and `actor.on("designation.commit", callback)` receives
one commit only. A commit event outside preview produces no second output.

Guarded command:

```text
run-u380.scope
npm run probe
exit 0
{"version":"5.32.6","states":["idle","chopReady","chopDragging","chopPreview"],"firstFrozen":{"minX":2,"minZ":3,"maxX":6,"maxZ":8},"secondCommitted":{"minX":4,"minZ":9,"maxX":9,"maxZ":12},"emitted":1,"final":"idle"}
```

## Fit against the current caller

Current ownership is split in concrete places: `src/main.js:newSelection`,
`send`, and the view-input callbacks mutate/reset `tool`, `drag`, and
`designationEnd`; `main.js:treeIdsInDrag`, `hud.jsx:hudModel`, and
`view.js:previewTreeIds` each resolve targets; all three depend on
`construction-view.js:dragCells`, whose axis choice deliberately describes a
wall row rather than a two-axis Chop region.

XState can consolidate those transitions and cleanup, and its typed emitted
event is a workable one-way commit seam. It does not reduce local ownership
more than a closed typed reducer for this graph. The probe needs four states,
nullable global context, an actor lifecycle/listener, and `assertEvent` calls to
recover event narrowing inside assign actions. The required behavior has no
parallel state, history, timer, invocation, or asynchronous cancellation for a
statechart to own.

The smaller current shape is one `Interaction` discriminated union and one pure
`transition(interaction, event) -> { interaction, commit? }`. Replacing the
union value clears stale gesture data automatically. One shared rectangle/target
selector can feed both HUD and view, while main alone turns the returned commit
region into game commands. That removes the repeated reset and target-resolution
ownership without introducing an actor runtime. Reconsider XState if this one
interaction owner later gains real orthogonal modes, history, or invoked async
lifecycles.

Primary API evidence:

- https://stately.ai/docs/setup
- https://stately.ai/docs/event-emitter
- installed `node_modules/xstate/dist/declarations/src/actions/emit.d.ts`
