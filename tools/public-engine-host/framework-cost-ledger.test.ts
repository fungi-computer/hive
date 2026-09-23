import assert from "node:assert/strict";
import test from "node:test";
import { createFrameworkCostLedger } from "./framework-cost-ledger";

test("the proof ledger retains only bounded committed windows and separates failed occurrences", () => {
  const lines: Array<Record<string, unknown>> = [];
  const ledger = createFrameworkCostLedger("a".repeat(64), line => lines.push(JSON.parse(line)));
  for (let sequence = 0; sequence < 51; sequence++) ledger.step({
    sequence, revision: sequence + 1, advanceWallMs: 2, captureWallMs: 3,
    recordPuts: 4, recordRemoves: 0, changedRecordBytes: 100,
    sqlWallMs: 1, rowsRead: 5, rowsWritten: 6, statements: 7,
    alarmLatenessMs: 0, dispatchWallMs: 7, transactionWallMs: 8,
  });
  assert.equal(lines.length, 1);
  assert.equal(lines[0].kind, "committed-steps");
  assert.equal(lines[0].count, 50);
  assert.equal(lines[0].lastSequence, 49);
  ledger.failure(51, new Error("region-record-change-bytes"));
  assert.deepEqual(lines.slice(1).map(line => line.kind), ["committed-steps", "failure"]);
  assert.equal(lines[1].count, 1);
  assert.equal(lines[2].sequence, 51);
  assert.equal(lines[2].error, "region-record-change-bytes");
  for (let repeat = 0; repeat < 49; repeat++) ledger.failure(51, new Error("region-record-change-bytes"));
  assert.equal(lines.length, 4);
  assert.equal(lines[3].repeatedAttempts, 50);
});
