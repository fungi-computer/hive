import { strict as assert } from "node:assert";
import { test } from "node:test";
import { GameSession } from "./session";
import type { ActionRequest, ActionResult, ComponentDefinition, GamePack, KernelPort, QuerySpec, QueryRow, RenderFact, WriteIntent, KernelSnapshot, SystemDefinition } from "../contracts";

const morale: ComponentDefinition<{ value: number }> = { id: "test.morale", version: 1, fields: { value: "number" }, validate: (value): value is { value: number } => typeof (value as { value?: unknown })?.value === "number" };
const definition = new TextEncoder().encode(JSON.stringify({ format: "hive-game", version: 1, game: "colony", components: [{ id: "test.morale", version: 1, fields: { value: "number" } }], initial: [] }));

class TestPort implements KernelPort {
  private json = JSON.stringify({ format: "hive-kernel", version: 1, revision: 0, time: 0, scene: { game: "colony", components: [{ id: "test.morale", version: 1, fields: { value: "number" } }] } });
  private revision = 0;
  writes: WriteIntent[] = [];
  loaded = 0;
  load(_definition: Uint8Array): void { this.loaded++; }
  query<T extends object>(_spec: QuerySpec<T>): readonly QueryRow<T>[] { return []; }
  advance(delta: number, writes: readonly WriteIntent[], actions: readonly ActionRequest[]): ActionResult[] {
    this.writes.push(...structuredClone(writes)); this.revision++;
    const state = JSON.parse(this.json) as { revision: number; time: number }; state.revision = this.revision; state.time += delta; this.json = JSON.stringify(state);
    return actions.map(action => action.kind === "consume" ? { accepted: false, reason: "unavailable", revision: this.revision } : { accepted: true, revision: this.revision });
  }
  snapshot(): KernelSnapshot { return { format: "hive-kernel", version: 1, revision: this.revision, time: JSON.parse(this.json).time, json: this.json }; }
  restore(snapshot: KernelSnapshot): void { this.json = snapshot.json; this.revision = snapshot.revision; }
  renderFacts(_limit?: number): readonly RenderFact[] { return []; }
}

function pack(port: KernelPort, system: GamePack["systems"][number] | undefined, initialActions?: readonly ActionRequest[]): GamePack { return { id: "colony", version: 1, definition, components: [morale], systems: system ? [system] : [], initialActions }; }
function session(port = new TestPort(), system?: GamePack["systems"][number], seed = 7, initialActions?: readonly ActionRequest[]) { const value = new GameSession({ port, pack: pack(port, system, initialActions), seed }); value.start(); return { value, port }; }

test("a rejected action returns its result while the simulation step advances", () => {
  const action = { kind: "consume", entity: "actor", lot: "lot", quantity: 1 } as ActionRequest;
  const { value, port } = session(undefined, undefined, 7, [action]);
  const results = value.step(0.25);
  assert.deepEqual(results, [{ accepted: false, reason: "unavailable", revision: 1 }]);
  assert.equal(value.save().now, 0.25); assert.equal(value.save().tick, 1); assert.equal(port.snapshot().revision, 1);
});

test("invalid restores do not mutate queued actions, game time, or the port", () => {
  const queued = { kind: "move", entity: "actor", destination: { x: 1, y: 0, z: 0 } } as ActionRequest;
  const { value, port } = session(undefined, undefined, 7, [queued]); const before = value.save(); const portBefore = port.snapshot();
  const cases = [
    { ...before, game: "survival" as const },
    { ...before, now: 2 },
    { ...before, pendingActions: [{ kind: "bogus" } as never] },
    { ...before, kernel: { ...before.kernel, json: "{}" } },
  ];
  for (const invalid of cases) { assert.throws(() => value.restore(invalid)); assert.deepEqual(value.save(), before); assert.deepEqual(port.snapshot(), portBefore); }
});

test("fractional seeded random state is deterministic across save and reload", () => {
  const draws: number[] = [];
  const system: SystemDefinition = { id: "test.random", version: 1, reads: [], writes: [], run: context => { draws.push(context.random.next()); } };
  const first = session(new TestPort(), system, 123); first.value.step(0.1); const saved = first.value.save(); first.value.step(0.1); const expected = draws[1];
  const restoredDraws: number[] = []; const secondSystem: SystemDefinition = { ...system, run: context => { restoredDraws.push(context.random.next()); } }; const second = session(new TestPort(), secondSystem, 123); second.value.restore(saved); second.value.step(0.1);
  assert.equal(restoredDraws[0], expected);
  assert.equal(Number.isInteger(saved.random), true); assert.notEqual(saved.random, 123);
});

test("reset restores the original random seed", () => {
  const draws: number[] = []; const system: SystemDefinition = { id: "test.random", version: 1, reads: [], writes: [], run: context => { draws.push(context.random.next()); } };
  const { value } = session(undefined, system, 99); value.step(0.1); value.reset(); value.step(0.1); assert.equal(draws[0], draws[1]);
});

test("queued input is cloned when requested", () => {
  const { value } = session(); const request = { kind: "move", entity: "actor", destination: { x: 1, y: 2, z: 3 } } as Extract<ActionRequest, { kind: "move" }>;
  value.request(request); (request.destination as { x: number }).x = 99;
  assert.equal((value.save().pendingActions[0] as Extract<ActionRequest, { kind: "move" }>).destination.x, 1);
});
