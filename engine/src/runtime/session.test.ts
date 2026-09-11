import { strict as assert } from "node:assert";
import { test } from "node:test";
import { GameSession } from "./session";
import { command, entity } from "../sdk/authoring";
import { Position, Support, Surface } from "../sdk/common";
import { checkedAction } from "./actions";
import type {
  AssignmentCandidate,
  ActionRequest,
  ActionResult,
  AdvanceResult,
  ComponentDefinition,
  GamePack,
  KernelPort,
  QuerySpec,
  QueryRow,
  RenderFact,
  WriteIntent,
  KernelSnapshot,
  SystemDefinition,
  WorldPose,
  Impact,
} from "../contracts";

const morale: ComponentDefinition<{ value: number }> = {
  id: "test.morale",
  version: 1,
  fields: { value: "number" },
  validate: (value): value is { value: number } =>
    typeof (value as { value?: unknown })?.value === "number",
};
const definition = new TextEncoder().encode(
  JSON.stringify({
    format: "hive-game",
    version: 1,
    game: "colony",
    components: [
      { id: "test.morale", version: 1, fields: { value: "number" } },
    ],
    initial: [],
  }),
);

class TestPort implements KernelPort {
  dispose(): void {}
  private entityJson = JSON.stringify({
    format: "hive-kernel",
    version: 7,
    revision: 0,
    time: 0,
    scene: {
      format: "hive-game",
      version: 1,
      game: "colony",
      initial: [],
      routes: [],
      impactQueue: [],
      components: [
        { id: "test.morale", version: 1, fields: { value: "number" } },
      ],
    },
  });
  private revision = 0;
  snapshotCalls = 0;
  throwOnSnapshot = false;
  impacts: Impact[] = [];
  failAdvance = false;
  writes: WriteIntent[] = [];
  committedWrites: WriteIntent[] = [];
  loaded = 0;
  acceptedConsumes = 0;
  acceptConsume = false;
  load(_definition: Uint8Array): void {
    this.loaded++;
  }
  loadEnvironment(_definition: Uint8Array): void {}
  environmentFacts(): unknown { return null; }
  terrainMaterials(_cells: readonly [number, number, number][]): readonly number[] { return []; }
  terrainSurfaces(_columns: readonly [number, number][]): readonly null[] { return []; }
  entityMembership(ids: readonly import("../contracts").EntityId[]): readonly boolean[] {
    return ids.map((id) => id === "actor");
  }
  query<T extends object>(_spec: QuerySpec<T>): readonly QueryRow<T>[] {
    return _spec.components.every((component) => [morale.id, "test.link"].includes(component.id))
      ? [{
          id: entity("actor"),
          get: <V extends object>(_definition: ComponentDefinition<V>) => ({ value: 0 } as V),
        }]
      : [];
  }
  advance(
    delta: number,
    writes: readonly WriteIntent[],
    actions: readonly ActionRequest[],
  ): AdvanceResult {
    this.revision++;
    if (this.failAdvance) throw new Error("native advance failed");
    this.writes.push(...structuredClone(writes));
    this.committedWrites.push(...structuredClone(writes));
    const state = JSON.parse(this.entityJson) as { revision: number; time: number; impactQueue: Impact[] };
    state.revision = this.revision;
    state.time += delta;
    const impacts = this.impacts;
    this.impacts = [];
    state.impactQueue = [];
    this.entityJson = JSON.stringify(state);
    const results = actions.map((action) => {
      if (action.kind === "consume") {
        if (this.acceptConsume) this.acceptedConsumes++;
        return this.acceptConsume
          ? { accepted: true, revision: this.revision }
          : { accepted: false, reason: "unavailable", revision: this.revision };
      }
      return { accepted: true, revision: this.revision };
    });
    return { revision: this.revision, results, impacts };
  }
  snapshot(): KernelSnapshot {
    this.snapshotCalls++;
    if (this.throwOnSnapshot) throw new Error("snapshot should not be used");
    const state = JSON.parse(this.entityJson) as { time: number; impactQueue: Impact[] };
    state.impactQueue = this.impacts;
    this.entityJson = JSON.stringify(state);
    const bytes = new TextEncoder().encode(this.entityJson);
    return {
      format: "hive-kernel-records",
      version: 1,
      revision: this.revision,
      time: state.time,
      records: [{ key: "kernel/header", bytes: new Uint8Array([1]) }, { key: "kernel/entities/0000", bytes }],
    };
  }
  restore(snapshot: KernelSnapshot): void {
    const record = snapshot.records.find(({ key }) => key === "kernel/entities/0000");
    if (!record) throw new Error("missing test entity record");
    this.entityJson = new TextDecoder().decode(record.bytes);
    this.revision = snapshot.revision;
    this.impacts = (JSON.parse(this.entityJson) as { impactQueue?: Impact[] }).impactQueue ?? [];
  }
  renderFacts(_limit?: number): readonly RenderFact[] {
    return [];
  }
  worldPoses(
    _entities: readonly import("../contracts").EntityId[],
  ): readonly WorldPose[] {
    return [];
  }
  assign(
    candidates: readonly AssignmentCandidate[],
  ): readonly AssignmentCandidate[] {
    return candidates.slice(0, 128);
  }
}

test("direct input admission is bounded, strict, and detached", () => {
  const action = checkedAction({
    kind: "direct-input",
    entity: "survival.survivor.1",
    stream: "survivor-main",
    inputs: [{ sequence: 1, x: 0.5, z: -1 }],
  });
  assert.equal(action.kind, "direct-input");
  const batched = Array.from({length:50},(_,i)=>({sequence:i+1,x:1,z:0}));
  assert.equal(checkedAction({...action,inputs:batched}).kind,"direct-input");
  assert.throws(()=>checkedAction({...action,inputs:[batched[0],batched[2]]}),/invalid action/);
  assert.throws(()=>checkedAction({...action,inputs:[...batched,{sequence:51,x:1,z:0}]}),/invalid action/);
  assert.throws(() => checkedAction({ ...action, stream: "" }), /invalid action/);
  assert.throws(() => checkedAction({ ...action, inputs: [{ sequence: 0, x: 0, z: 0 }] }), /invalid action/);
  assert.throws(() => checkedAction({ ...action, inputs: [{ sequence: 1, x: 2, z: 0 }] }), /invalid action/);
  assert.throws(() => checkedAction({ ...action, extra: true }), /invalid action fields/);
});

function pack(
  port: KernelPort,
  system: GamePack["systems"][number] | undefined,
  initialActions?: readonly ActionRequest[],
  systems?: readonly SystemDefinition[],
): GamePack {
  return {
    id: "colony",
    version: 1,
    definition,
    components: [morale],
    systems: systems ?? (system ? [system] : []),
    initialActions,
  };
}
function session(
  port = new TestPort(),
  system?: GamePack["systems"][number],
  seed = 7,
  initialActions?: readonly ActionRequest[],
) {
  const value = new GameSession({
    port,
    pack: pack(port, system, initialActions),
    seed,
  });
  value.start();
  return { value, port };
}

test("a rejected action returns its result while the simulation step advances", () => {
  const action = {
    kind: "consume",
    entity: "actor",
    lot: "lot",
    quantity: 1,
  } as ActionRequest;
  const { value, port } = session(undefined, undefined, 7, [action]);
  const results = value.step(0.25);
  assert.deepEqual(results, [
    { accepted: false, reason: "unavailable", revision: 1 },
  ]);
  assert.equal(value.save().now, 0.25);
  assert.equal(value.save().tick, 1);
  assert.equal(port.snapshot().revision, 1);
});

test("authored entity references use native membership without snapshot capture", () => {
  const Link = {
    id: "test.link",
    version: 1,
    fields: { target: "entity" },
    validate: (value: unknown): value is { target: string } =>
      Boolean(value) && typeof (value as { target?: unknown }).target === "string",
  } as ComponentDefinition<{ target: string }>;
  const actor = entity("actor");
  const port = new TestPort();
  let calls = 0;
  const membership = port.entityMembership.bind(port);
  port.entityMembership = (ids) => { calls++; return membership(ids); };
  const value = new GameSession({
    port,
    pack: {
      ...pack(port, undefined),
      components: [morale, Link],
      systems: [],
      commands: {
        setLink: {
          reads: [],
          writes: [Link],
          run: (_context, input) => ({
            actions: [],
            writes: [{ component: Link.id, entity: actor, value: input }],
          }),
        },
        setMorale: {
          reads: [],
          writes: [morale],
          run: (_context, input) => ({
            actions: [],
            writes: [{ component: morale.id, entity: actor, value: input }],
          }),
        },
      },
    },
  });
  value.start();
  port.throwOnSnapshot = true;
  value.command("setLink", { target: "actor" });
  assert.equal(calls, 1);
  assert.throws(() => value.command("setLink", { target: "missing" }), /unknown entity reference/);
  assert.equal(calls, 2);
  value.command("setMorale", { value: 3 });
  assert.equal(calls, 2);
  assert.equal(port.snapshotCalls, 0);
});

test("authored references span bounded membership calls without a new total limit", () => {
  const Link: ComponentDefinition<{ target: string; peer: string }> = {
    id: "test.link", version: 1,
    fields: { target: "entity", peer: "entity" },
    validate: (value: unknown): value is { target: string; peer: string } =>
      typeof (value as { target?: unknown })?.target === "string" &&
      typeof (value as { peer?: unknown })?.peer === "string",
  };
  const port = new TestPort();
  const batches: number[] = [];
  port.entityMembership = ids => { batches.push(ids.length); return ids.map(() => true); };
  const session = new GameSession({ port, pack: {
    ...pack(port, undefined), components: [morale, Link], systems: [],
    commands: { links: { reads: [], writes: [Link], run: () => ({ actions: [],
      writes: Array.from({ length: 65 }, (_, index) => ({
        entity: entity("actor"), component: Link.id,
        value: { target: `target-${index}`, peer: `peer-${index}` },
      })),
    }) } },
  } });
  session.start();
  port.throwOnSnapshot = true;
  session.command("links", null);
  assert.deepEqual(batches, [128, 2]);
  assert.equal(port.snapshotCalls, 0);
});

const impact: Impact = {
  id: "impact.1",
  sequence: 1,
  projectileId: entity("projectile.1"),
  sourceId: entity("source.1"),
  targetId: entity("target.1"),
  time: 0.1,
  point: { x: 1, y: 0, z: 0 },
  normal: { x: -1, y: 0, z: 0 },
  velocity: { x: 4, y: 0, z: 0 },
};

test("physical impacts arrive on the following eligible step exactly once", () => {
  const observed: string[][] = [];
  const system: SystemDefinition = {
    id: "test.impact",
    version: 1,
    consumesImpacts: true,
    reads: [],
    writes: [],
    run: (context) => observed.push(context.impacts.map((event) => event.id)),
  };
  const port = new TestPort();
  port.impacts = [impact];
  const value = session(port, system).value;
  value.step(0.1);
  assert.deepEqual(observed, [[]]);
  value.step(0.1);
  assert.deepEqual(observed, [[], ["impact.1"]]);
  value.step(0.1);
  assert.deepEqual(observed, [[], ["impact.1"], []]);
  assert.deepEqual(value.save().pendingImpacts, []);
});

test("pending impacts survive save and a failed consumer step", () => {
  let fail = false;
  const observed: string[][] = [];
  const system: SystemDefinition = {
    id: "test.impact-retry",
    version: 1,
    consumesImpacts: true,
    reads: [],
    writes: [],
    run: (context) => {
      observed.push(context.impacts.map((event) => event.id));
      if (fail) throw new Error("consumer failed");
    },
  };
  const port = new TestPort();
  port.impacts = [impact];
  const first = session(port, system);
  first.value.step(0.1);
  const saved = first.value.save();
  fail = true;
  assert.throws(() => first.value.step(0.1), /consumer failed/);
  assert.throws(() => first.value.save(), /session-poisoned/);
  fail = false;
  first.value.restore(saved);
  first.value.step(0.1);
  assert.deepEqual(observed, [[], ["impact.1"], ["impact.1"]]);

  const restoredObserved: string[][] = [];
  const restoredSystem: SystemDefinition = {
    ...system,
    run: (context) => restoredObserved.push(context.impacts.map((event) => event.id)),
  };
  const restored = session(new TestPort(), restoredSystem);
  restored.value.restore(saved);
  restored.value.step(0.1);
  assert.deepEqual(restoredObserved, [["impact.1"]]);
});

test("native advance failure preserves the queued physical impact for retry", () => {
  const observed: number[][] = [];
  const system: SystemDefinition = {
    id: "test.native-impact-retry",
    version: 1,
    consumesImpacts: true,
    reads: [],
    writes: [],
    run: (context) => observed.push(context.impacts.map((event) => event.sequence)),
  };
  const port = new TestPort();
  port.impacts = [impact];
  port.failAdvance = true;
  const { value } = session(port, system);
  const saved = value.save();
  assert.throws(() => value.step(0.1), /native advance failed/);
  port.failAdvance = false;
  assert.throws(() => value.step(0.1), /session-poisoned/);
  value.restore(saved);
  value.step(0.1);
  value.step(0.1);
  assert.deepEqual(observed, [[], [], [1]]);
});

test("consumer failure rolls back authored writes and retries the impact once", () => {
  let fail = true;
  const system: SystemDefinition = {
    id: "test.impact-write",
    version: 1,
    consumesImpacts: true,
    reads: [],
    writes: [morale],
    run: (context) => {
      if (context.impacts.length > 0) {
        context.write(morale, entity("actor"), { value: 9 });
        if (fail) throw new Error("authored consumer failed");
      }
    },
  };
  const port = new TestPort();
  port.impacts = [impact];
  const { value } = session(port, system);
  value.step(0.1);
  const saved = value.save();
  fail = true;
  assert.throws(() => value.step(0.1), /authored consumer failed/);
  assert.equal(port.committedWrites.length, 0);
  fail = false;
  value.restore(saved);
  value.step(0.1);
  assert.deepEqual(port.committedWrites, [
    { component: morale.id, entity: "actor", value: { value: 9 } },
  ]);
  assert.deepEqual(value.save().pendingImpacts, []);
});

test("a pack without impact consumers discards committed impacts", () => {
  const port = new TestPort();
  port.impacts = [impact];
  const { value } = session(port);
  value.step(0.1);
  assert.deepEqual(value.save().pendingImpacts, []);
  assert.deepEqual(value.save().impactFrontiers, []);
});

test("a replayed sequence is rejected after its event was compacted", () => {
  const system: SystemDefinition = {
    id: "test.impact-replay",
    version: 1,
    consumesImpacts: true,
    reads: [],
    writes: [],
    run: () => undefined,
  };
  const port = new TestPort();
  const { value } = session(port, system);
  port.impacts = [impact];
  value.step(0.1);
  value.step(0.1);
  assert.equal(value.save().impactHighWater, 1);
  port.impacts = [impact];
  const beforeFailure = value.save();
  assert.throws(() => value.step(0.1), /duplicate physical impact sequence/);
  assert.throws(() => value.save(), /session-poisoned/);
  value.restore(beforeFailure);
  assert.equal(value.save().impactHighWater, 1);
});

test("a live consumer compacts a sustained impact stream", () => {
  const seen: number[] = [];
  const system: SystemDefinition = {
    id: "test.impact-stream",
    version: 1,
    consumesImpacts: true,
    reads: [],
    writes: [],
    run: (context) => seen.push(...context.impacts.map((event) => event.sequence)),
  };
  const port = new TestPort();
  const { value } = session(port, system);
  for (let sequence = 1; sequence <= 1100; sequence++) {
    port.impacts = [{ ...impact, id: `impact.${sequence}`, sequence, time: sequence * 0.1 }];
    value.step(0.1);
  }
  value.step(0.1);
  assert.equal(seen.length, 1100);
  assert.equal(value.save().pendingImpacts.length, 0);
  assert.equal(value.save().impactHighWater, 1100);
});

test("an unconsumed impact backlog rejects the whole step at its bound", () => {
  const system: SystemDefinition = {
    id: "test.impact-overflow",
    version: 1,
    consumesImpacts: true,
    every: 100_000,
    reads: [],
    writes: [],
    run: () => undefined,
  };
  const port = new TestPort();
  const { value } = session(port, system);
  for (let sequence = 1; sequence <= 1024; sequence++) {
    port.impacts = [{ ...impact, id: `impact.${sequence}`, sequence, time: sequence * 0.1 }];
    value.step(0.1);
  }
  const before = value.save();
  port.impacts = [{ ...impact, id: "impact.1025", sequence: 1025, time: 102.5 }];
  assert.throws(() => value.step(0.1), /physical impact backlog limit reached/);
  assert.throws(() => value.save(), /session-poisoned/);
  value.restore(before);
  assert.deepEqual(value.save().pendingImpacts, before.pendingImpacts);
  assert.equal(value.save().impactHighWater, before.impactHighWater);
  assert.equal(value.save().tick, before.tick);
});

test("different impact cadences retain one event until both consumers acknowledge", () => {
  const first: number[] = [];
  const second: number[] = [];
  const systems: SystemDefinition[] = [
    {
      id: "test.fast-impact",
      version: 1,
      consumesImpacts: true,
      reads: [],
      writes: [],
      run: (context) => first.push(...context.impacts.map((event) => event.sequence)),
    },
    {
      id: "test.slow-impact",
      version: 1,
      consumesImpacts: true,
      every: 2,
      reads: [],
      writes: [],
      run: (context) => second.push(...context.impacts.map((event) => event.sequence)),
    },
  ];
  const port = new TestPort();
  const value = new GameSession({
    port,
    pack: pack(port, undefined, undefined, systems),
  });
  value.start();
  port.impacts = [impact];
  value.step(0.1);
  assert.deepEqual(first, []);
  assert.deepEqual(second, []);
  value.step(0.1);
  assert.deepEqual(first, [1]);
  assert.deepEqual(second, []);
  value.step(0.1);
  assert.deepEqual(first, [1]);
  assert.deepEqual(second, [1]);
  assert.equal(value.save().pendingImpacts.length, 0);
});


test("invalid restores do not mutate queued actions, game time, or the port", () => {
  const queued = {
    kind: "move",
    entity: "actor",
    destination: { x: 1, y: 0, z: 0, frame: null },
  } as ActionRequest;
  const { value, port } = session(undefined, undefined, 7, [queued]);
  const before = value.save();
  const portBefore = port.snapshot();
  const cases = [
    { ...before, game: "survival" as const },
    { ...before, now: 2 },
    { ...before, pendingActions: [{ kind: "bogus" } as never] },
    {
      ...before,
      kernel: {
        ...before.kernel,
        records: [{ ...before.kernel.records[0], bytes: new Uint8Array([123]) }],
      },
    },
  ];
  for (const invalid of cases) {
    assert.throws(() => value.restore(invalid));
    assert.deepEqual(value.save(), before);
    assert.deepEqual(port.snapshot(), portBefore);
  }
});

test("fractional seeded random state is deterministic across save and reload", () => {
  const draws: number[] = [];
  const system: SystemDefinition = {
    id: "test.random",
    version: 1,
    reads: [],
    writes: [],
    run: (context) => {
      draws.push(context.random.next());
    },
  };
  const first = session(new TestPort(), system, 123);
  first.value.step(0.1);
  const saved = first.value.save();
  first.value.step(0.1);
  const expected = draws[1];
  const restoredDraws: number[] = [];
  const secondSystem: SystemDefinition = {
    ...system,
    run: (context) => {
      restoredDraws.push(context.random.next());
    },
  };
  const second = session(new TestPort(), secondSystem, 123);
  second.value.restore(saved);
  second.value.step(0.1);
  assert.equal(restoredDraws[0], expected);
  assert.equal(Number.isInteger(saved.random), true);
  assert.notEqual(saved.random, 123);
});

test("reset restores the original random seed", () => {
  const draws: number[] = [];
  const system: SystemDefinition = {
    id: "test.random",
    version: 1,
    reads: [],
    writes: [],
    run: (context) => {
      draws.push(context.random.next());
    },
  };
  const { value } = session(undefined, system, 99);
  value.step(0.1);
  value.reset();
  value.step(0.1);
  assert.equal(draws[0], draws[1]);
});

test("queued input is cloned when requested", () => {
  const { value } = session();
  const request = {
    kind: "move",
    entity: "actor",
    destination: { x: 1, y: 2, z: 3, frame: null },
  } as Extract<ActionRequest, { kind: "move" }>;
  value.request(request);
  (request.destination as { x: number }).x = 99;
  assert.equal(
    (value.save().pendingActions[0] as Extract<ActionRequest, { kind: "move" }>)
      .destination.x,
    1,
  );
});

test("command writes are rejected atomically when undeclared or untargeted", () => {
  const port = new TestPort();
  const value = new GameSession({
    port,
    pack: {
      ...pack(port, undefined),
      commands: {
        bad: command({
          writes: [morale],
          run: () => ({
            actions: [],
            writes: [
              {
                entity: "missing" as never,
                component: morale.id,
                value: { value: 4 },
              },
            ],
          }),
        }),
      },
    },
    seed: 3,
  });
  value.start();
  const before = value.save();
  assert.throws(() => value.command("bad", null));
  assert.deepEqual(value.save().pendingActions, before.pendingActions);
  assert.deepEqual(value.save().pendingWrites, []);
  assert.equal(value.save().version, 7);
});

test("an accepted consume is observed on exactly the next step and survives restore", () => {
  const observed: number[] = [];
  const system: SystemDefinition = {
    id: "test.observe",
    version: 1,
    reads: [],
    writes: [],
    run: (context) => {
      observed.push(
        context.outcomes.filter(
          (outcome) =>
            outcome.action.kind === "consume" && outcome.result.accepted,
        ).length,
      );
    },
  };
  const port = new TestPort();
  port.acceptConsume = true;
  const consume = {
    kind: "consume",
    entity: "actor",
    lot: "lot",
    quantity: 1,
  } as ActionRequest;
  const first = session(port, system, 5, [consume]);
  first.value.step(0.1);
  assert.deepEqual(observed, [0]);
  assert.equal(port.acceptedConsumes, 1);
  const saved = first.value.save();
  first.value.step(0.1);
  assert.deepEqual(observed, [0, 1]);
  assert.equal(port.acceptedConsumes, 1);

  const restoredObserved: number[] = [];
  const restoredSystem: SystemDefinition = {
    ...system,
    run: (context) => {
      restoredObserved.push(
        context.outcomes.filter(
          (outcome) =>
            outcome.action.kind === "consume" && outcome.result.accepted,
        ).length,
      );
    },
  };
  const restored = session(new TestPort(), restoredSystem, 5);
  restored.value.restore(saved);
  restored.value.step(0.1);
  assert.deepEqual(restoredObserved, [1]);
  assert.equal(
    restored.value
      .save()
      .outcomes.filter((outcome) => outcome.action.kind === "consume").length,
    0,
  );
  restored.value.step(0.1);
  assert.deepEqual(restoredObserved, [1, 0]);
});

test("a rejected consume produces no physical effect", () => {
  const port = new TestPort();
  port.acceptConsume = false;
  const consume = {
    kind: "consume",
    entity: "actor",
    lot: "lot",
    quantity: 1,
  } as ActionRequest;
  const { value } = session(port, undefined, 5, [consume]);
  const results = value.step(0.1);
  assert.equal(results[0].accepted, false);
  assert.equal(port.acceptedConsumes, 0);
  assert.equal(value.save().outcomes[0].result.accepted, false);
});

test("world pose access is limited to declared physical reads", () => {
  let requested = 0;
  const port = new TestPort();
  port.worldPoses = (entities) => {
    requested += entities.length;
    return [];
  };
  const forbidden: SystemDefinition = {
    id: "test.pose-forbidden",
    version: 1,
    reads: [Position],
    writes: [],
    run: (context) => {
      context.worldPoses(["actor" as import("../contracts").EntityId]);
    },
  };
  const value = session(port, forbidden, 5).value;
  assert.throws(() => value.step(0.1), /world poses require/);
  assert.equal(requested, 0);

  const allowed: SystemDefinition = {
    ...forbidden,
    id: "test.pose-allowed",
    reads: [Position, Support, Surface],
  };
  const allowedValue = session(port, allowed, 5).value;
  allowedValue.step(0.1);
  assert.equal(requested, 1);
});

test("authored orders are visible to paused commands and survive pending reload", () => {
  const port = new TestPort();
  const authoredPack: GamePack = {
    ...pack(port, undefined),
    commands: {
      designate: command({ writes: [morale], run: () => ({actions:[],writes:[],creates:[{
        id:entity("order.1"),components:{"test.morale":{value:1}},
      }]}) }),
      revise: command({reads:[morale],writes:[morale],run: context => {
        const row = context.query({components:[morale]}).find(row => row.id === "order.1");
        assert.ok(row);
        return {actions:[],writes:[{entity:row.id,component:morale.id,value:{value:row.get(morale).value+1}}]};
      }}),
    },
  };
  const value = new GameSession({port,pack:authoredPack});
  value.start(); value.pause();
  value.command("designate", {});
  value.command("revise", {});
  const saved = value.save();
  assert.equal(saved.pendingCreates.length,1);
  assert.deepEqual(saved.pendingWrites[0].value,{value:2});
  const restored = new GameSession({port:new TestPort(),pack:authoredPack});
  restored.start(); restored.restore(saved);
  restored.command("revise",{});
  assert.deepEqual(restored.save().pendingWrites[0].value,{value:3});
  assert.throws(()=>restored.command("designate",{}),/conflicting|already exists/);
});

test("authored orders reject unowned removals and conflicting pending writes", () => {
  const port = new TestPort();
  const value = new GameSession({port,pack:{...pack(port,undefined),commands:{
    remove:command({writes:[],run:()=>({actions:[],writes:[],removes:[entity("actor")]})}),
    conflict:command({writes:[morale],run:()=>({actions:[],writes:[{entity:entity("actor"),component:morale.id,value:{value:1}}],removes:[entity("actor")]})}),
  }}});
  value.start(); value.pause();
  const before = value.save();
  assert.throws(()=>value.command("remove",{}),/ownership/);
  assert.throws(()=>value.command("conflict",{}),/removed/);
  assert.deepEqual(value.save(),before);
});
