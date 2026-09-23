import assert from "node:assert/strict";
import test from "node:test";
import { restoreSearchRecords, SEARCH_RECORD_PREFIX } from "./search-records";

const id = "a".repeat(64);
const bytes = (value: unknown) => new TextEncoder().encode(JSON.stringify(value));
const record = (part: string, value: unknown) => ({ key: `${SEARCH_RECORD_PREFIX}${id}.${part}`, bytes: bytes(value) });
const root = () => ({ planner: { routeSearches: { entries: {} as Record<string, any> } } });
function fixture() {
  return [record("head", { nodeCount: 257, frontierCount: 2, request: { actor: "worker", search: { nodes: [], frontier: [] } } }),
    record("nodes.0000", Array.from({ length: 256 }, (_, i) => [[i, 0, 0], i, i ? i - 1 : null])),
    record("nodes.0001", [[[256, 0, 0], 256, 255]]),
    record("frontier.0000", [[20, 10, 0]]), record("frontier.0001", [[10, 5, 256]])];
}
test("recovery restores frontier priority across stable node buckets", () => {
  const state = root(); restoreSearchRecords(state, fixture());
  assert.equal(state.planner.routeSearches.entries[id].search.nodes.length, 257);
  assert.deepEqual(state.planner.routeSearches.entries[id].search.frontier, [[10, 5, 256], [20, 10, 0]]);
});
test("recovery rejects missing and misbound pages", () => {
  assert.throws(() => restoreSearchRecords(root(), fixture().filter(row => !row.key.endsWith("nodes.0001"))), /incomplete/);
  const broken = fixture(); broken[3] = record("frontier.0000", [[10, 5, 256]]);
  assert.throws(() => restoreSearchRecords(root(), broken), /identity mismatch/);
});
