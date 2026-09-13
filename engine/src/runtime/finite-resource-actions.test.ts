import { strict as assert } from "node:assert";
import { test } from "node:test";
import { checkedAction } from "./actions";
import { extractResource } from "../sdk/common";
import type { EntityId } from "../contracts";

const entity = (value: string) => value as EntityId;

test("finite resource extraction serializes only native identities", () => {
  const request = extractResource("test:extract:1", entity("worker"), entity("tree"));
  assert.deepEqual(checkedAction(request), {
    kind: "extract-resource", operation: "test:extract:1", worker: "worker", source: "tree",
  });
  assert.throws(() => checkedAction({ ...request, container: "satchel" }), /invalid action fields/);
});
