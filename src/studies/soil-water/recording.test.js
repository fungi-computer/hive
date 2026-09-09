import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { fileURLToPath } from "node:url";
import {
  changeScale,
  decodeRecording,
  depthCenterSliceEntry,
  depthSlice,
  frameFacts,
  voxelKey,
} from "./recording.js";

function readRecording() {
  const file = fileURLToPath(
    new URL(
      "../../../public/study-evidence/soil-water/dt3-cells.json",
      import.meta.url,
    ),
  );
  return JSON.parse(readFileSync(file, "utf8"));
}

test("accepts the 201-frame physical soil recording and exposes exact endpoints", () => {
  const recording = decodeRecording(readRecording());
  const initial = frameFacts(recording, 0);
  const final = frameFacts(recording, 200);
  assert.equal(initial.timeS, 0);
  assert.equal(final.timeS, 600);
  assert.equal(initial.pondMassKg, 1);
  assert.equal(final.pondMassKg, 0);
  assert.deepEqual(recording.topCenter.voxel, [0, -1, 0]);
  assert.equal(final.center.massChangeKg, 0.9949265023284966);
  assert.equal(depthSlice(recording, 200, -1).length, 9);
  assert.equal(depthSlice(recording, 200, -2).length, 9);
  assert.equal(depthSlice(recording, 200, -3).length, 9);
  assert.ok(changeScale(recording) >= final.center.massChangeKg);
});

test("every visible depth has a deterministic selectable centre cell", () => {
  const recording = decodeRecording(readRecording());
  for (const voxelY of [-1, -2, -3]) {
    const centre = depthCenterSliceEntry(recording, 100, voxelY);
    assert.deepEqual(centre.cell.voxel, [0, voxelY, 0]);
    assert.equal(voxelKey(centre.cell.voxel), `0,${voxelY},0`);
  }
});

test("the playback component keeps bounded cell selection in its React owner", () => {
  const source = readFileSync(
    fileURLToPath(new URL("./SoilWaterLab.jsx", import.meta.url)),
    "utf8",
  );
  for (const fragment of [
    "const [selectedVoxelKey, setSelectedVoxelKey]",
    "function selectDepth(nextDepthId)",
    "<button",
    "aria-pressed={selected}",
    "Exact selected cell facts",
    "Water mass",
    "poreAirM3",
  ]) {
    assert.ok(
      source.includes(fragment),
      `missing component contract: ${fragment}`,
    );
  }
});

for (const [label, corrupt] of [
  ["clock sequence", (raw) => (raw.frames[3].timeS = 10)],
  ["cell vector length", (raw) => raw.frames[5].massKg.pop()],
  ["duplicate voxel", (raw) => (raw.cells[2].voxel = raw.cells[1].voxel)],
  ["negative pond", (raw) => (raw.frames[0].pondMassKg = -1)],
  [
    "non-finite pore capacity",
    (raw) => (raw.frames[0].poreAirM3[0] = Infinity),
  ],
]) {
  test(`rejects ${label}`, () => {
    const raw = readRecording();
    corrupt(raw);
    assert.throws(() => decodeRecording(raw));
  });
}
