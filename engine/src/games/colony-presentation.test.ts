import assert from "node:assert/strict";
import test from "node:test";
import { colonyPack, constructionStatusLabel, treeWorkProgress } from "./colony.ts";
import { ExcavationWork, Position } from "../sdk/common";
import { ConstructionSite } from "../sdk/construction";

test("tree chopping presentation uses committed WorkAttempt progress", () => {
  assert.equal(treeWorkProgress({ seconds: 1, stage: "chop" }), 0.5);
  assert.equal(treeWorkProgress({ seconds: 20, stage: "chop" }), 1, "progress is bounded at completion");
});

test("construction presentation distinguishes support waiting from ordinary work waiting", () => {
  assert.equal(constructionStatusLabel("planned", "waitingForSupport"), "Waiting for structural support");
  assert.equal(constructionStatusLabel("planned", "ready"), "Waiting for materials or a free worker");
  assert.equal(constructionStatusLabel("working", "waitingForSupport"), "Building");
  assert.equal(constructionStatusLabel("finished", "unknown"), "Finished");
});

test("committed dig and build seconds project bounded progress and disappear when attendance clears", () => {
  const digger = "progress.digger", builder = "progress.builder";
  const rows = new Map<string, readonly { id: string; get: () => unknown }[]>([
    [Position.id, [
      { id: digger, get: () => ({ x: 1, y: 0, z: 1, facing: 0 }) },
      { id: builder, get: () => ({ x: 2, y: 0, z: 2, facing: 0 }) },
    ]],
    [ExcavationWork.id, [{ id: digger, get: () => ({ x: 1, y: 0, z: 1, expected: 1, replacement: 0, seconds: 1 }) }]],
    [ConstructionSite.id, [{ id: "progress.site", get: () => ({ catalog: "timber-floor", targetKind: "cell", targetX: 2, targetY: 0, targetZ: 2, targetDirection: "north", phase: "working", seconds: 1 }) }]],
  ]);
  const context = { query: ((spec: { components: readonly { id: string }[] }) => {
    const matching = spec.components.map(component => rows.get(component.id) ?? []);
    if (!matching.length) return [];
    const ids = matching[0].map(row => row.id).filter(id => matching.every(group => group.some(row => row.id === id)));
    return ids.map(id => ({ id, get: (component: { id: string }) => rows.get(component.id)?.find(row => row.id === id)?.get() }));
  }) as never };
  const activities = colonyPack.presentation?.activities?.(context) ?? [];
  assert.equal(activities.find(activity => activity.actor === digger)?.progress, 0.5);
  assert.equal(activities.find(activity => activity.actor === builder)?.progress, 0.5);
  assert(activities.every(activity => activity.progress === undefined || (activity.progress >= 0 && activity.progress <= 1)));
  rows.set(ExcavationWork.id, []);
  rows.set(ConstructionSite.id, []);
  assert.equal(colonyPack.presentation?.activities?.(context).some(activity => activity.actor === digger || activity.actor === builder), false);
});
