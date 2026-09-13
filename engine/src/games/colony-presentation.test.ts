import assert from "node:assert/strict";
import test from "node:test";
import { colonyPack, treeWorkerAtApproach, treeWorkProgress } from "./colony.ts";
import { ExcavationWork, Position } from "../sdk/common";
import { ConstructionSite } from "../sdk/construction";

test("tree chopping presentation waits for the committed approach point", () => {
  const order = { approachX: 2, approachY: 0, approachZ: 3 };
  assert.equal(treeWorkerAtApproach({ x: 1, y: 0, z: 3 }, order), false, "approach travel keeps walk/carry animation");
  assert.equal(treeWorkerAtApproach({ x: 2.04, y: 0, z: 3 }, order), true, "contact tolerance permits authored chop pose");
  assert.equal(treeWorkerAtApproach({ x: 2, y: 0.051, z: 3 }, order), false, "vertical separation is not contact");
  assert.equal(treeWorkProgress({ seconds: 1, stage: "chop" }), 0.5);
  assert.equal(treeWorkProgress({ seconds: 20, stage: "chop" }), 1, "progress is bounded at completion");
});

test("committed dig and build seconds project bounded progress and disappear when attendance clears", () => {
  const digger = "progress.digger", builder = "progress.builder";
  const rows = new Map<string, readonly { id: string; get: () => unknown }[]>([
    [Position.id, [
      { id: digger, get: () => ({ x: 1, y: 0, z: 1, facing: 0 }) },
      { id: builder, get: () => ({ x: 2, y: 0, z: 2, facing: 0 }) },
    ]],
    [ExcavationWork.id, [{ id: digger, get: () => ({ x: 1, y: 0, z: 1, expected: 1, replacement: 0, seconds: 1 }) }]],
    [ConstructionSite.id, [{ id: "progress.site", get: () => ({ catalog: "timber-floor", x: 2, y: 0, z: 2, worker: builder, phase: "working", seconds: 1 }) }]],
  ]);
  const context = { query: ((spec: { id: string }) => rows.get(spec.id) ?? []) as never };
  const activities = colonyPack.presentation?.activities?.(context) ?? [];
  assert.equal(activities.find(activity => activity.actor === digger)?.progress, 0.5);
  assert.equal(activities.find(activity => activity.actor === builder)?.progress, 0.5);
  assert(activities.every(activity => activity.progress === undefined || (activity.progress >= 0 && activity.progress <= 1)));
  rows.set(ExcavationWork.id, []);
  rows.set(ConstructionSite.id, []);
  assert.equal(colonyPack.presentation?.activities?.(context).some(activity => activity.actor === digger || activity.actor === builder), false);
});
