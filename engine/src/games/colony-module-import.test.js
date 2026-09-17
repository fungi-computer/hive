import assert from "node:assert/strict";
import test from "node:test";
import { createServer } from "vite";

test("Colony actor catalog and compiled environment initialize without a module cycle", async () => {
  const server = await createServer({ server: { middlewareMode: true }, appType: "custom", logLevel: "silent" });
  try {
    const [{ colonyActors }, { colonyEnvironment }] = await Promise.all([
      server.ssrLoadModule("/engine/src/games/colony-actors.ts"),
      server.ssrLoadModule("/engine/src/games/colony-environment.ts"),
    ]);
    assert(colonyActors.length > 0);
    assert.equal(colonyEnvironment.world.verticalMetres, 0.54);
  } finally {
    await server.close();
  }
});
