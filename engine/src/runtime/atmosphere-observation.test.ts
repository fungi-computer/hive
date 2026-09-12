import { strict as assert } from "node:assert";
import { test } from "node:test";
import { wasmKernelPort, type WasmKernelBinding } from "./wasm-kernel";

function binding(response: unknown, calls: { count: number }): WasmKernelBinding {
  return {
    atmosphere_samples(json: string) {
      calls.count++;
      assert.deepEqual(JSON.parse(json), [[-2, 13, 4], [0, 13, 4]]);
      return JSON.stringify(response);
    },
  } as unknown as WasmKernelBinding;
}

test("atmosphere read context preserves modeled samples and unmodeled null", () => {
  const calls = { count: 0 };
  const port = wasmKernelPort(binding({
    revision: 7,
    geometryRevision: 3,
    samples: [
      { volumeId: "local.0.0.0", temperatureC: 21.5, smokeKgM3: 0.01 },
      null,
    ],
  }, calls));
  assert.deepEqual(port.atmosphereSamples([[-2, 13, 4], [0, 13, 4]]), {
    revision: 7,
    geometryRevision: 3,
    samples: [
      { volumeId: "local.0.0.0", temperatureC: 21.5, smokeKgM3: 0.01 },
      null,
    ],
  });
  assert.equal(calls.count, 1);
});

test("atmosphere query rejects empty or oversized input before native call", () => {
  const calls = { count: 0 };
  const port = wasmKernelPort(binding({ revision: 0, geometryRevision: 0, samples: [] }, calls));
  assert.throws(() => port.atmosphereSamples([]), /between 1 and 64/);
  assert.throws(
    () => port.atmosphereSamples(Array.from({ length: 65 }, () => [0, 0, 0] as [number, number, number])),
    /between 1 and 64/,
  );
  assert.equal(calls.count, 0);
});
