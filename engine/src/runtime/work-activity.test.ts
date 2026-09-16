import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { initSync, WasmKernel } from "../../generated/hive_kernel.js";
import { colonyPack, ExcavationOrder, treeJob } from "../games/colony";
import { entity, query } from "../sdk/authoring";
import { ExcavationWork, FiniteResource, JobTaskWork, Position, SupplyAllocation } from "../sdk/common";
import { buildObservation } from "./observation";
import { GameSession } from "./session";
import { wasmKernelPort } from "./wasm-kernel";
import { decorateWorkActivity } from "./work-activity";
import type {
  EntityId,
  ReadContext,
  RenderFact,
  WorkAttempt,
} from "../contracts";

initSync({ module: readFileSync("engine/generated/hive_kernel_bg.wasm") });
test("actual Colony attendance projects work poses only while native work exists", () => {
  const port = wasmKernelPort(new WasmKernel());
  try {
    const session = new GameSession({ pack: colonyPack, port });
    session.start();
    session.command("dig", { area: { start: [1, 13, 0], end: [1, 13, 0] } });
    const observe = () => buildObservation(session, { epoch: 0, sequence: 0 });
    assert(
      !observe().facts.some((fact) => fact.activity),
      "queued intent does not animate earned work",
    );
    let sawWork = false;
    for (let tick = 0; tick < 240; tick++) {
      session.step(0.1);
      const work = session.query(query(ExcavationWork));
      if (work.length) {
        const before = session.save();
        const view = observe();
        assert.deepEqual(
          session.save(),
          before,
          "animation projection must not mutate work or custody",
        );
        for (const row of work) {
          const attempt = session.workAttempts([row.id])[0];
          assert(attempt, "native excavation work retains its attempt owner");
          const activity = view.facts.find(
            (fact) => fact.id === attempt.worker,
          )?.activity;
          assert.equal(activity?.kind, "dig");
          const progress = activity?.progress;
          assert.equal(typeof progress, "number");
          if (typeof progress !== "number")
            throw new Error("active dig must publish progress");
          assert(progress >= 0 && progress <= 1);
        }
        sawWork = true;
      }
      if (sawWork && !session.query(query(ExcavationOrder)).length) break;
    }
    assert(sawWork, "fixture must perform actual native excavation");
    assert.equal(session.query(query(ExcavationOrder)).length, 0);
    assert(
      !observe().facts.some((fact) => fact.activity?.kind === "dig"),
      "completed excavation clears its work pose and progress",
    );
  } finally {
    port.dispose();
  }
});

test("actual Colony tree attendance projects chop only during native task work and stays read-only across reload", () => {
  const port = wasmKernelPort(new WasmKernel());
  try {
    const session = new GameSession({ pack: colonyPack, port });
    session.start();
    const tree = entity("colony.tree.oak");
    const job = treeJob(tree);
    const fell = entity(`${job}:task:fell`), chop = entity(`${job}:task:chop`);
    session.command("designateTrees", { entities: [tree] });
    const observe = () => buildObservation(session, { epoch: 0, sequence: 0 });
    assert(!observe().facts.some((f) => f.activity?.kind === "chop"));
    let working = false,
      sawApproach = false;
    for (let i = 0; i < 80; i++) {
      session.step(0.25);
      const attempt = session.workAttempts([fell, chop])[0];
      if (attempt) {
        const view = observe(),
          activity = view.facts.find((f) => f.id === attempt.worker)?.activity;
        if (activity?.kind !== "chop") {
          sawApproach = true;
          continue;
        }
        const before = session.save();
        assert.deepEqual(session.save(), before);
        const work = session.query(query(JobTaskWork)).find(row => row.id === attempt.key.task)?.get(JobTaskWork).seconds ?? 0;
        const progress = work / (attempt.key.task === fell ? 3 : 2);
        assert.deepEqual(activity, { kind: "chop", target: [2, 2], progress });
        assert(progress >= 0 && progress <= 1);
        working = true;
        break;
      }
    }
    assert.equal(
      sawApproach,
      true,
      "approach travel has no chop activity or progress bar",
    );
    assert.equal(working, true);
    const saved = session.save();
    const beforeRestore = observe().facts;
    session.restore(saved);
    assert.deepEqual(
      observe().facts,
      beforeRestore,
      "activity projection is stable across restore",
    );
    for (let i = 0; i < 80; i++) {
      session.step(0.25);
      if (session.query(query(FiniteResource)).find(row => row.id === tree)?.get(FiniteResource).quantity === 0 && !session.workAttempts([fell, chop]).length) break;
    }
    assert(!observe().facts.some((f) => f.activity?.kind === "chop"));
  } finally {
    port.dispose();
  }
});

test("activity projection rejects competing native and game attendance", () => {
  const actor = entity("worker.activity");
  const row = {
    id: actor as never,
    get: () => ({ x: 1, y: 0, z: 2, expected: 1, replacement: 0, seconds: 1 }),
  };
  const attempt: WorkAttempt = {
    key: { task: actor, generation: 1 },
    worker: actor,
    execution: { pool: entity("party.activity"), initiatingPlayer: null, policyId: "test" },
    phase: {
      kind: "executing",
      operation: { attempt: { task: actor, generation: 1 }, sequence: 1 },
      activity: { kind: "excavation", cell: [1, 0, 2], expectedMaterial: 1, replacementMaterial: 0 },
    },
  };
  const context = {
    query: (() => [row]) as unknown as ReadContext["query"],
    workAttempts: () => [attempt],
  };
  assert.throws(
    () =>
      decorateWorkActivity([], context, [
        { actor, kind: "chop", target: [3, 4] },
      ]),
    /competing work attendance/,
  );
});

test("native delivery operations project without a client-owned phase", () => {
  const actor = entity("delivery.worker"),
    task = entity("delivery.task");
  const values = new Map<string, Map<EntityId, unknown>>([
    [
      Position.id,
      new Map<EntityId, unknown>([[actor, { x: 0, y: 0, z: 0, facing: 0 }]]),
    ],
    [
      SupplyAllocation.id,
      new Map<EntityId, unknown>([
        [
          task,
          {
            requirementOwner: entity("delivery.task"),
            requirementRole: "cargo",
            requirementGeneration: 1,
            party: entity("delivery.party"),
            portion: entity("delivery.lot"),
            destination: entity("delivery.destination"),
            material: "wood",
            quantity: 1,
            state: "reserved",
          },
        ],
      ]),
    ],
  ]);
  const queryRows = ((spec: { components: readonly { id: string }[] }) => {
    const groups = spec.components.map(
      (component) => values.get(component.id) ?? new Map<EntityId, unknown>(),
    );
    const ids = [...(groups[0]?.keys() ?? [])].filter((id) =>
      groups.every((group) => group.has(id)),
    );
    return ids.map((id) => ({
      id,
      get: (component: { id: string }) => values.get(component.id)?.get(id),
    }));
  }) as unknown as ReadContext["query"];
  const facts = [
    { id: actor, pose: { position: { x: 0, y: 0, z: 0 }, facing: 0 } },
  ] as unknown as RenderFact[];
  const attempts: WorkAttempt[] = [
    {
      key: { task, generation: 1 },
      worker: actor,
      execution: { pool: entity("delivery.party"), initiatingPlayer: null, policyId: "test" },
      phase: {
        kind: "executing",
        operation: { attempt: { task, generation: 1 }, sequence: 1 },
        activity: {
          kind: "route",
          destination: { x: 3, y: 0, z: 0, frame: null },
        },
      },
    },
  ];
  const context: Pick<ReadContext, "query" | "workAttempts"> = {
    query: queryRows,
    workAttempts: () => attempts,
  };
  assert.deepEqual(decorateWorkActivity(facts, context)[0].activity, {
    kind: "delivery",
    phase: "carrying",
    material: "wood",
    target: [3, 0],
  });
});
