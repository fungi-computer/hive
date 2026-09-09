import test from "node:test";
import assert from "node:assert/strict";
import { parseCommand } from "./command-schema.ts";
import { createClearing } from "./clearing.ts";
import { admitCommand, admitCommands } from "./orders.ts";
const scope = { party: "home", actors: null };
test("all current command variants round-trip; unsupported direction and malformed scope reject", () => {
  const cell = { x: 7, z: 9, level: 0 };
  const examples = [
    { kind: "chop", tree: "tree-a" },
    { kind: "dig", voxel: [0, 14, 128] },
    { kind: "sow", ...cell },
    { kind: "build", ...cell, type: "wall", direction: 1 },
    { kind: "deconstruct", site: "site-a" },
    ...["harvest", "water-mugwort"].map((kind) => ({ kind, herb: "herb-a" })),
    { kind: "rest", actors: ["rowan"] },
    { kind: "store", lot: "lot-a", shelf: "shelf-a" },
    { kind: "repair-cache" },
    ...["fill-kettle", "brew", "tap", "clear-spent-grain"].map((kind) => ({
      kind,
      station: "station-a",
    })),
    ...["cancel", "next"].map((kind) => ({ kind, job: "job-a" })),
    { kind: "routine", enabled: true },
    { kind: "work", work: "garden", enabled: false },
  ].map((c) => ({ ...scope, ...c }));
  examples.push(
    ...["draft", "undraft", "recruit"].map((kind) => ({
      kind,
      party: "home",
      actor: "rowan",
    })),
    { kind: "go", party: "home", actor: "rowan", target: cell },
  );
  for (const command of examples)
    assert.deepEqual(parseCommand(command), command);
  for (const direction of [-1, 2, 0.5])
    assert.throws(() =>
      parseCommand({
        ...scope,
        kind: "build",
        ...cell,
        type: "wall",
        direction,
      }),
    );
  assert.throws(() =>
    parseCommand({ ...scope, kind: "dig", ...cell, actors: "rowan" }),
  );
  assert.throws(() =>
    parseCommand({ ...scope, kind: "dig", ...cell, extra: true }),
  );
});
test("admission returns actual multi-rest IDs without time or diagnostic mutation; batch result stays compatible", () => {
  const s = createClearing();
  s.paused = true;
  s.parties.home.members.push("sedge");
  const command = {
    kind: "rest",
    party: "home",
    actors: ["rowan", "sedge", "rowan"],
  };
  const result = admitCommand(s, command);
  assert.equal(result.status, "applied");
  assert.deepEqual(
    result.createdJobs,
    s.jobs.map((j) => j.id),
  );
  assert.equal(result.createdJobs.length, 2);
  assert.equal(s.tick, 0);
  assert.deepEqual(s.commands, []);
  assert.deepEqual(admitCommand(s, command), {
    status: "applied",
    createdJobs: [],
  });
  assert.deepEqual(
    admitCommands(s, [{ kind: "routine", ...scope, enabled: false }]),
    [{ status: "applied" }],
  );
  assert.equal(s.commands.length, 1);
});
