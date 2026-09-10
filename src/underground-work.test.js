import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createClearing, step } from "./clearing.ts";
import { admitCommand } from "./orders.ts";
import { loadOptimizer } from "./engine/colony/loader.ts";
import {
  serializeClearing,
  parseLiveClearing,
  snapshotFor,
} from "./clearing-state.ts";
import { terrainEnvironment, terrainExcavatedVoxels } from "./terrain.ts";
import { createStructureGeometry } from "./structure-environment.ts";
import { waterEnvironmentFacts } from "./world-presets/goblin-environment/water-state.ts";
import { fieldWaterBalance } from "./field-water.ts";
import { terrainYieldBalance } from "./terrain-yields.ts";
import { knownFootings } from "./exploration.ts";
import { sourceIsOpen } from "./finite-sources.ts";

// Source-declared candidate, not evidence of successful excavation or timing.
const DESCENT = [
  { x: 0, z: 128, top: 14, foot: 14 },
  { x: 0, z: 127, top: 14, foot: 13 },
  { x: 1, z: 127, top: 14, foot: 12 },
  { x: 1, z: 128, top: 14, foot: 11 },
  { x: 1, z: 129, top: 14, foot: 10 },
  { x: 0, z: 129, top: 13, foot: 9 },
  { x: 0, z: 128, top: 12, foot: 8 },
  { x: 0, z: 127, top: 11, foot: 7 },
];
const UPPER_ROOM = [
  [2, 128],
  [3, 128],
  [2, 129],
  [3, 129],
];
const LOWER_ROOM = [
  [0, 127],
  [-1, 127],
  [-1, 126],
  [0, 126],
];
const LIMIT = Object.freeze({ totalTicks: 6000, jobTicks: 256, goTicks: 128 });
const scope = { party: "home", actors: ["rowan"] };
const same = (a, b) => a.x === b.x && a.y === b.y && a.z === b.z;
const at = (column) => ({ x: column.x, y: column.foot, z: column.z });
const source = (state) => ({
  terrain: terrainEnvironment(state.terrain),
  sites: state.sites,
});

test("public work earns a descending route and two separately covered spaces with cold recovery", async (t) => {
  const colony = await loadOptimizer(
    await WebAssembly.compile(
      readFileSync(new URL("./engine/colony/colony.wasm", import.meta.url)),
    ),
  );
  const evidence = process.env.HIVE_UNDERGROUND_EVIDENCE_DIR;
  const output = evidence
    ? (mkdirSync(evidence), evidence)
    : mkdtempSync(join(tmpdir(), "hive-underground-work-"));
  t.diagnostic(`Retained earned checkpoints: ${output}`);
  let state = createClearing(),
    used = 0,
    phase = "fresh",
    movementTicks = 0;
  const progress = [],
    removed = new Set();
  // Pausing is the existing host control. No physical/body/job/stock field is authored.
  state.paused = true;
  function failureFacts() {
    const rowan = state.actors.rowan;
    return {
      phase,
      used,
      tick: state.tick,
      notice: state.notice,
      rowan: {
        x: rowan.x,
        y: rowan.y,
        z: rowan.z,
        mode: rowan.mode,
        task: rowan.task,
        work: rowan.work,
        traversal: rowan.traversal,
        assignment: rowan.assignment,
      },
      jobs: state.jobs.slice(0, 12),
      removals: state.terrainRemovals.length,
      held: state.materials.lots
        .filter((lot) => lot.location.kind === "hand")
        .slice(0, 12),
      recent: progress.slice(-8),
    };
  }
  function require(condition, message) {
    assert(
      condition,
      `${message}\n${JSON.stringify(failureFacts()).slice(0, 14000)}`,
    );
  }
  function command(value) {
    state.paused = true;
    const before = state.tick;
    const result = admitCommand(state, value);
    require(result.status ===
      "applied", `Command refused: ${JSON.stringify(value)} -> ${JSON.stringify(result)}`);
    assert.equal(state.tick, before, "admission never advances time");
    return result.createdJobs;
  }
  function until(done, budget) {
    state.paused = false;
    for (let ticks = 0; !done() && ticks < budget; ticks++) {
      require(used < LIMIT.totalTicks, "total physical work budget exhausted");
      const before = state.actors.rowan;
      const position = { x: before.x, y: before.y, z: before.z };
      const elapsed = before.traversal?.elapsed;
      step(state, colony, []);
      used++;
      const after = state.actors.rowan;
      if (!same(position, after) || after.traversal?.elapsed !== elapsed)
        movementTicks++;
    }
    state.paused = true;
    require(done(), "phase physical work budget exhausted");
  }
  function job(value) {
    const ids = command(value);
    require(ids.length > 0, "expected actual owner-created job identity");
    until(
      () => ids.every((id) => !state.jobs.some((job) => job.id === id)),
      LIMIT.jobTicks,
    );
    return ids;
  }
  function go(target) {
    phase = `walk:${target.x},${target.y},${target.z}`;
    command({ kind: "draft", party: "home", actor: "rowan" });
    command({ kind: "go", party: "home", actor: "rowan", target });
    until(
      () =>
        same(state.actors.rowan, target) &&
        state.actors.rowan.traversal === null,
      LIMIT.goTicks,
    );
    command({ kind: "undraft", party: "home", actor: "rowan" });
    require(knownFootings(state)(target), "arrival is actually known");
    progress.push({ phase, tick: state.tick, removals: removed.size });
  }
  function dig(voxel) {
    phase = `dig:${voxel.join()}`;
    const old = new Map(
      state.terrainRemovals.map((record) => [
        record.id,
        JSON.stringify(record),
      ]),
    );
    job({ kind: "dig", voxel, ...scope });
    const added = state.terrainRemovals.filter((record) => !old.has(record.id));
    require(added.length === 1, "completion must add exactly one removal");
    assert.deepEqual(added[0].at, voxel);
    for (const record of state.terrainRemovals)
      if (old.has(record.id))
        assert.equal(JSON.stringify(record), old.get(record.id));
    assert(!removed.has(voxel.join()), "no repeated physical cut");
    removed.add(voxel.join());
    progress.push({
      phase,
      tick: state.tick,
      materialId: added[0].materialId,
      waterKg: added[0].waterKg,
    });
  }
  function column(value) {
    for (let y = value.top; y >= value.foot; y--) dig([value.x, y, value.z]);
    go(at(value));
  }
  function conservation() {
    const yields = terrainYieldBalance(
      state.terrainRemovals,
      state.materials.lots,
    );
    assert.deepEqual(yields.actual, yields.expected);
    const water = fieldWaterBalance(state);
    assert(Math.abs(water.residualKg) <= water.toleranceKg);
    const facts = waterEnvironmentFacts(state.water, source(state));
    assert(
      Math.abs(facts.totalKg - facts.initialTotalKg - facts.boundaryKg) <=
        water.toleranceKg,
    );
    assert.equal(terrainExcavatedVoxels(state.terrain).length, removed.size);
    return {
      yields,
      water,
      fieldTotalKg: facts.totalKg,
      fieldBoundaryKg: facts.boundaryKg,
    };
  }
  function coldCheckpoint(label) {
    phase = label;
    const balance = conservation(),
      envelope = snapshotFor(state),
      wire = envelope.savedState;
    writeFileSync(join(output, `${label}.json`), JSON.stringify(envelope), {
      flag: "wx",
    });
    state = parseLiveClearing(JSON.parse(JSON.stringify(wire)));
    assert.equal(state.paused, true);
    assert.deepEqual(serializeClearing(state), wire);
    assert.deepEqual(conservation(), balance);
    progress.push({ phase, tick: state.tick, removals: removed.size });
    writeFileSync(
      join(output, `${label}-facts.json`),
      JSON.stringify(
        { phase, used, movementTicks, progress, balance },
        null,
        2,
      ),
      { flag: "wx" },
    );
  }
  // Supported connected covered space, not the game indoors/perimeter classification.
  function room(cells, y) {
    const geometry = createStructureGeometry(
      { terrain: source(state).terrain.terrain, sites: state.sites },
      source(state).terrain.terrain.bounds,
    );
    for (const [x, z] of cells) {
      require(geometry.point([x, y - 1, z]) === "solid" ||
        geometry.face("y", [x, y, z]) ===
          "closed", "chamber floor must have real support");
      for (let h = 0; h < 4; h++)
        assert.equal(geometry.point([x, y + h, z]), "empty");
      // Upper room uses paid roof at y15; lower columns retain original rock cover.
      const cover = [y + 4, y + 5].some(
        (top) =>
          geometry.point([x, top, z]) === "solid" ||
          geometry.face("y", [x, top, z]) === "closed",
      );
      require(cover, "each chamber cell must have actual separate cover");
    }
  }
  try {
    phase = "earn-timber";
    const tree = state.trees.find((tree) => tree.felledAt === null);
    require(tree, "fresh finite tree exists");
    job({ kind: "chop", tree: tree.id, ...scope });
    require(state.trees.some(
      (candidate) => candidate.id === tree.id && candidate.felledAt !== null,
    ), "timber must come from an actually felled tree");
    phase = "earn-cache-access";
    job({ kind: "repair-cache", ...scope });
    const cache = state.sources.find(
      (candidate) => candidate.kind === "reclaimed-timber-cache",
    );
    require(cache &&
      sourceIsOpen(cache), "paid repair must open the actual cache");
    coldCheckpoint("earned-timber-access");
    for (let i = 0; i < DESCENT.length; i++) {
      column(DESCENT[i]);
      if (i === 3) {
        for (const [x, z] of UPPER_ROOM) column({ x, z, top: 14, foot: 11 });
        for (const [x, z] of UPPER_ROOM) {
          phase = `paid-roof:${x},${z}`;
          job({
            kind: "build",
            type: "roof",
            x: x + 7,
            z: z - 119,
            level: 0,
            direction: 0,
            ...scope,
          });
          require(state.sites.some(
            (site) =>
              site.type === "roof" &&
              site.x === x + 7 &&
              site.z === z - 119 &&
              site.level === 0 &&
              site.finishedAt !== null,
          ), "roof must be earned finished construction");
        }
        room(UPPER_ROOM, 11);
        coldCheckpoint("first-chamber");
        go(at(DESCENT[i]));
      }
      if (i === 5) coldCheckpoint("first-roofed-descent");
    }
    for (const [x, z] of LOWER_ROOM.slice(1))
      column({ x, z, top: 10, foot: 7 });
    assert.equal(removed.size, 58);
    room(UPPER_ROOM, 11);
    room(LOWER_ROOM, 7);
    coldCheckpoint("second-chamber");
    for (const [x, z] of LOWER_ROOM) go({ x, y: 7, z });
    for (const [x, z] of UPPER_ROOM) go({ x, y: 11, z });
    go({ x: 0, y: 15, z: 129 });
    require(movementTicks > 0, "real admitted movement must have advanced");
    coldCheckpoint("returned-surface");
    t.diagnostic(
      JSON.stringify({
        scope:
          "earned58-cut route and two covered2x2 destinations, not rendered rooms or timing",
        usedTicks: used,
        movementTicks,
        progress,
        balance: conservation(),
      }),
    );
  } catch (error) {
    // Preserve primary refusal; diagnostic reads must not replace it.
    try {
      const failure = {
        ...failureFacts(),
        error: String(error?.message ?? error).slice(0, 16000),
      };
      try {
        failure.localWater = waterEnvironmentFacts(state.water, source(state))
          .cells.filter(
            (cell) =>
              cell.kind === "void" &&
              Math.abs(cell.at[0] - state.actors.rowan.x) <= 1 &&
              Math.abs(cell.at[2] - state.actors.rowan.z) <= 1 &&
              cell.at[1] >= state.actors.rowan.y &&
              cell.at[1] < state.actors.rowan.y + 4,
          )
          .map(({ id, massKg, liquidVolumeM3 }) => ({
            id,
            massKg,
            liquidVolumeM3,
          }));
      } catch (diagnosticError) {
        failure.waterReadError = String(diagnosticError.message);
      }
      writeFileSync(
        join(output, "failure.json"),
        JSON.stringify(failure, null, 2),
        { flag: "wx" },
      );
      t.diagnostic(JSON.stringify(failure).slice(0, 14000));
      try {
        writeFileSync(
          join(output, "failure-save.json"),
          JSON.stringify(snapshotFor(state)),
          { flag: "wx" },
        );
      } catch (saveError) {
        t.diagnostic(`Failure-state save refused: ${saveError.message}`);
      }
    } catch {}
    throw error;
  }
});
