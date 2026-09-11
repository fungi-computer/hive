import { test } from "node:test";
import { strict as assert } from "node:assert";
import { physicalContactQuery } from "./physical-contact-query";

test("physical contact read validates the whole batch before native sampling", () => {
  let calls = 0;
  const read = () => { calls++; return "[]"; };
  assert.throws(() => physicalContactQuery(read, [[0, -20, 0], [0, 2147483648, 0]]));
  assert.throws(() => physicalContactQuery(read, []));
  assert.equal(calls, 0);
});
test("physical contact preserves thin floors separately from bulk and outside", () => {
  const facts = [{ solid: false, sealedTop: true, outside: false }, { solid: true, sealedTop: false, outside: false }, { solid: false, sealedTop: false, outside: true }];
  const result = physicalContactQuery(json => {
    assert.deepEqual(JSON.parse(json), [[-4, -20, 8], [-4, -19, 8], [-4, -21, 8]]);
    return JSON.stringify(facts);
  }, [[-4, -20, 8], [-4, -19, 8], [-4, -21, 8]]);
  assert.deepEqual(result, facts);
  assert.throws(() => physicalContactQuery(() => JSON.stringify([ { solid:true, sealedTop:false, outside:true } ]), [[0,0,0]]));
});
