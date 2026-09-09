import test from "node:test";
import assert from "node:assert/strict";
import { createSceneDocument, parseSceneDocument } from "./scene-document.ts";
import { applySceneBatch } from "./scene-editor.ts";
const transform = {
  position: [0, 0, 0],
  rotation: [0, 0, 0],
  scale: [1, 1, 1],
};
const node = (id, parentId = null, group = false) => ({
  id,
  parentId,
  transform,
  geometry: group ? { kind: "group" } : { kind: "box", size: [1, 2, 3] },
  material: null,
});
const add = (...nodes) => ({
  expectedRevision: 0,
  operations: nodes.map((node) => ({ type: "add", node })),
});
test("ordered edits commit once and serialized input is detached", () => {
  const source = createSceneDocument("study");
  const input = add(node("group", null, true), node("child", "group"));
  const result = applySceneBatch(source, input);
  assert.equal(result.revision, 1);
  assert.deepEqual(source.nodes, []);
  assert.deepEqual(
    parseSceneDocument(JSON.parse(JSON.stringify(result))),
    result,
  );
  result.nodes[1].transform.position[0] = 4;
  assert.equal(transform.position[0], 0);
});
test("late failure and stale retry preserve original including revision", () => {
  const source = applySceneBatch(createSceneDocument("study"), add(node("a")));
  const before = JSON.stringify(source);
  assert.throws(() =>
    applySceneBatch(source, {
      expectedRevision: 1,
      operations: [
        { type: "material", id: "a", material: { color: "#123456" } },
        { type: "remove", id: "absent" },
      ],
    }),
  );
  assert.throws(() =>
    applySceneBatch(source, {
      expectedRevision: 0,
      operations: [{ type: "remove", id: "a" }],
    }),
  );
  assert.equal(JSON.stringify(source), before);
});
test("material edits are owned and subtree removal cleans unordered descendants", () => {
  const source = applySceneBatch(
    createSceneDocument("study"),
    add(
      node("group", null, true),
      node("nested", "group", true),
      node("child", "nested"),
      node("sibling"),
    ),
  );
  source.nodes.reverse();
  const edited = applySceneBatch(source, {
    expectedRevision: 1,
    operations: [
      { type: "material", id: "child", material: { color: "#123456" } },
    ],
  });
  assert.equal(edited.nodes.find((n) => n.id === "sibling").material, null);
  assert.equal(source.nodes.find((n) => n.id === "child").material, null);
  const removed = applySceneBatch(edited, {
    expectedRevision: 2,
    operations: [{ type: "remove", id: "group" }],
  });
  assert.deepEqual(
    removed.nodes.map((n) => n.id),
    ["sibling"],
  );
});
test("boundary rejects bad hierarchy, duplicate IDs, unknown data and nonfinite geometry", () => {
  for (const nodes of [
    [node("a"), node("a")],
    [node("a", "missing")],
    [node("a", "b", true), node("b", "a", true)],
    [node("a"), node("b", "a")],
    [{ ...node("a"), script: "arbitrary" }],
    [{ ...node("a"), geometry: { kind: "box", size: [Infinity, 1, 1] } }],
  ])
    assert.throws(() =>
      parseSceneDocument({ version: 1, revision: 0, name: "bad", nodes }),
    );
  assert.throws(() =>
    applySceneBatch(
      createSceneDocument("study"),
      add(...Array.from({ length: 25 }, (_, i) => node(`n${i}`))),
    ),
  );
});

test("depth counts path nodes: eight accepted, nine rejected", () => {
  const chain = (length) =>
    Array.from({ length }, (_, i) =>
      node(`n${i}`, i === 0 ? null : `n${i - 1}`, true),
    );
  const document = { version: 1, revision: 0, name: "depth", nodes: chain(8) };
  assert.equal(parseSceneDocument(document).nodes.length, 8);
  assert.throws(() => parseSceneDocument({ ...document, nodes: chain(9) }));
});

test("saved original and generic scene reproduces geometry and isolates shared materials", async () => {
  const { compileSceneDocument } = await import("./scene-geometry.js");
  const source = applySceneBatch(
    createSceneDocument("original study"),
    add(
      {
        ...node("bench"),
        geometry: {
          kind: "original",
          pack: "hive-brewhouse-v1",
          asset: {
            builder: "bench",
            parameters: { width: 1.8, depth: 0.75, height: 0.81 },
          },
        },
      },
      {
        ...node("bottle"),
        geometry: {
          kind: "original",
          pack: "hive-brewhouse-v1",
          asset: {
            builder: "bottle",
            parameters: { color: "#728e79", size: 1 },
          },
        },
      },
      {
        ...node("round"),
        geometry: {
          kind: "cylinder",
          radiusTop: 0.2,
          radiusBottom: 0.3,
          height: 1,
          segments: 8,
        },
      },
      node("box"),
    ),
  );
  const fingerprint = (root) => {
    const result = [];
    root.traverse((object) => {
      if (object.isMesh)
        result.push({
          positions: [...object.geometry.attributes.position.array],
          color: object.material.color.getHex(),
          matrix: [...object.matrixWorld.elements],
        });
    });
    return result;
  };
  const before = compileSceneDocument(source);
  const reload = compileSceneDocument(JSON.parse(JSON.stringify(source)));
  const changed = compileSceneDocument(
    applySceneBatch(source, {
      expectedRevision: 1,
      operations: [
        { type: "material", id: "bench", material: { color: "#ff0000" } },
      ],
    }),
  );
  const after = compileSceneDocument(source);
  try {
    assert.deepEqual(fingerprint(before.root), fingerprint(reload.root));
    assert.deepEqual(fingerprint(before.root), fingerprint(after.root));
    assert.notDeepEqual(fingerprint(before.root), fingerprint(changed.root));
    assert.deepEqual(before.bounds, reload.bounds);
  } finally {
    for (const value of [before, reload, changed, after]) {
      value.dispose();
      value.dispose();
    }
  }
});
