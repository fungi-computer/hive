import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { fileURLToPath } from "node:url";
import {
  changeScale,
  decodeRecording,
  decodeExcavationRecording,
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

function readExcavationRecording() {
  const root = new URL(
    "../../../public/study-evidence/soil-water/excavation/",
    import.meta.url,
  );
  return Object.fromEntries(
    [
      ["excavated", "excavated"],
      ["moving", "moving-frames"],
      ["proof", "proof"],
    ].map(([name, fileName]) => [
      name,
      JSON.parse(
        readFileSync(fileURLToPath(new URL(`${fileName}.json`, root)), "utf8"),
      ),
    ]),
  );
}

test("the public excavation packet is byte-identical to the accepted evidence", () => {
  const sourceRoot = new URL(
    "../../../.botanical/research/environment-round3-20260908/soil-water-v1/excavation-v1/run-v1/",
    import.meta.url,
  );
  const publicRoot = new URL(
    "../../../public/study-evidence/soil-water/excavation/",
    import.meta.url,
  );
  for (const file of ["excavated.json", "moving-frames.json", "proof.json"]) {
    assert.deepEqual(
      readFileSync(fileURLToPath(new URL(file, publicRoot))),
      readFileSync(fileURLToPath(new URL(file, sourceRoot))),
      `${file} must retain accepted bytes`,
    );
  }
});

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
    "data-soil-case",
    "First excavated frame",
    "Recorded seepage and restart evidence",
  ]) {
    assert.ok(
      source.includes(fragment),
      `missing component contract: ${fragment}`,
    );
  }
});

test("normalizes the accepted zero-pit excavation plus 100 saved moving frames", () => {
  const recording = decodeExcavationRecording(readExcavationRecording());
  assert.equal(recording.kind, "excavation");
  assert.equal(recording.frames.length, 101);
  assert.equal(recording.frames[0].timeS, 0);
  assert.equal(recording.frames.at(-1).timeS, 600);
  assert.equal(
    recording.frames[0].cells.find((cell) => cell.id === recording.pitId)
      .massKg,
    0,
  );
  assert.equal(recording.wetSpoilKg, 237.03565722779186);
  assert.equal(
    recording.frames.at(-1).cells.find((cell) => cell.id === recording.pitId)
      .massKg,
    12.565428851627985,
  );
  assert.equal(
    recording.evidence.flow.values.filter((entry) => entry.role === "side")
      .length,
    4,
  );
  assert.equal(recording.evidence.flow.floorKg, 9.300728934574245);
  assert.equal(recording.evidence.restartPitKg, 6.693430939792961);
  assert.equal(recording.evidence.work.matrixUpdates, 357000);
  assert.equal(
    recording.evidence.residualMaxima.mixedKg,
    1.691003934101154e-10,
  );
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

for (const [label, corrupt] of [
  [
    "missing excavated zero frame",
    (raw) =>
      (raw.excavated.soilState.massKg[
        raw.excavated.soilState.massKg.length - 1
      ] = 1),
  ],
  [
    "nonconsecutive excavation clock",
    (raw) => (raw.moving.frames[3].timeS = 25),
  ],
  [
    "missing excavation side evidence",
    (raw) => raw.proof.groups[3].flow.values.pop(),
  ],
]) {
  test(`rejects ${label}`, () => {
    const raw = readExcavationRecording();
    corrupt(raw);
    assert.throws(() => decodeExcavationRecording(raw));
  });
}
