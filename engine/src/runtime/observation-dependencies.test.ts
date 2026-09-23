import test from "node:test";
import assert from "node:assert/strict";
import { createObservationDependencies } from "./observation-dependencies.ts";

test("projection follows actual query values, membership and dynamic branches rather than revision", () => {
  const a: any = { id: "a" }, b: any = { id: "b" };
  let value = 1, other = 7, include = true, branch = false, calls = 0;
  const context: any = { query(spec: any) {
    return include ? [{ id: "entity", get: (component: any) => ({ value: component === a ? value : other }) }] : [];
  }, environmentFacts: () => ({ branch }) };
  const memo = createObservationDependencies<any>();
  const project = (read: any) => {
    calls++;
    const component = read.environmentFacts().branch ? b : a;
    return read.query({ components: [component] }).map((row: any) => row.get(component).value);
  };
  assert.deepEqual(memo(context, project), [1]);
  other = 8;
  assert.deepEqual(memo(context, project), [1]); assert.equal(calls, 1);
  value = 2;
  assert.deepEqual(memo(context, project), [2]); assert.equal(calls, 2);
  branch = true;
  assert.deepEqual(memo(context, project), [8]); assert.equal(calls, 3);
  value = 3;
  assert.deepEqual(memo(context, project), [8]); assert.equal(calls, 3);
  include = false;
  assert.deepEqual(memo(context, project), []); assert.equal(calls, 4);
});

test("failed dependency read is never accepted as an unchanged projection", () => {
  let fail = false;
  const context: any = { environmentFacts() { if (fail) throw new Error("bad read"); return { water: 1 }; } };
  const memo = createObservationDependencies<any>();
  const project = (read: any) => read.environmentFacts();
  const first = memo(context, project);
  fail = true;
  assert.throws(() => memo(context, project), /bad read/);
  fail = false;
  assert.equal(memo(context, project), first);
});

test("permission-filtered committed reads invalidate when the principal changes", () => {
  const component: any = { id: "owner" };
  const records = [
    { id: "private:a", owner: "a", value: 1 },
    { id: "private:b", owner: "b", value: 2 },
  ];
  let principal = "a", calls = 0;
  const context: any = {
    query() {
      return records.filter(record => record.owner === principal).map(record => ({
        id: record.id,
        get: () => ({ owner: record.owner, value: record.value }),
      }));
    },
  };
  const memo = createObservationDependencies<any>();
  const project = (read: any) => {
    calls++;
    return read.query({ components: [component] }).map((row: any) => [row.id, row.get(component).value]);
  };
  assert.deepEqual(memo(context, project), [["private:a", 1]]);
  principal = "b";
  assert.deepEqual(memo(context, project), [["private:b", 2]]);
  assert.equal(calls, 2, "permission-filtered facts cannot reuse another principal's projection");
});
