import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { decodeRecording } from "./recording.js";

function readRecording(caseId) {
  const path = fileURLToPath(
    new URL(
      `../../../public/study-evidence/gas-heat/${caseId}.json`,
      import.meta.url,
    ),
  );
  return JSON.parse(readFileSync(path, "utf8"));
}

for (const caseId of ["sealed", "ports"]) {
  test(`accepts the complete ${caseId} recording`, () => {
    const recording = decodeRecording(readRecording(caseId), caseId);
    assert.equal(recording.case, caseId);
    assert.deepEqual(
      recording.frames.map((frame) => frame.timeSeconds),
      Array.from({ length: 46 }, (_, index) => index),
    );
    assert.deepEqual(
      recording.cellsByIndex.map((cell) => cell.i),
      Array.from({ length: 480 }, (_, index) => index),
    );
    assert.ok(
      recording.geometry.solidCellIndices.every(
        (index) => Number.isInteger(index) && index >= 0 && index < 480,
      ),
    );
    assert.ok(
      recording.frames.every(
        (frame) =>
          frame.faceVelocityMS.length === recording.geometry.faces.length,
      ),
    );
  });
}

const corruptions = [
  ["case mismatch", (raw) => (raw.case = "ports")],
  ["clock sequence", (raw) => (raw.frames[4].timeSeconds = 9)],
  ["duplicate cell index", (raw) => (raw.geometry.cells[2].i = 1)],
  ["invalid solid index", (raw) => (raw.geometry.solidCellIndices[0] = 480)],
  ["wrong face velocity length", (raw) => raw.frames[0].faceVelocityMS.pop()],
  ["non-finite scalar", (raw) => (raw.frames[0].heatJ[0] = Infinity)],
];

for (const [label, corrupt] of corruptions) {
  test(`rejects ${label}`, () => {
    const raw = readRecording("sealed");
    corrupt(raw);
    assert.throws(() => decodeRecording(raw, "sealed"));
  });
}

for (const [label, corrupt] of [
  ["zero cell volume", (raw) => (raw.geometry.metric.volume = 0)],
  ["non-finite density", (raw) => (raw.constants.rhoKgM3 = Infinity)],
  ["non-positive specific heat", (raw) => (raw.constants.cpJKgK = -1)],
]) {
  test(`rejects ${label}`, () => {
    const raw = readRecording("sealed");
    corrupt(raw);
    assert.throws(() => decodeRecording(raw, "sealed"));
  });
}
