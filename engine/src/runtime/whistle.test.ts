import { strict as assert } from "node:assert";
import { test } from "node:test";
import { z } from "zod";
import { command, entity } from "../sdk/authoring";
import { encodeDefinition } from "../sdk/common";
import type { GamePack } from "../contracts";
import { createWhistleObservationProjector } from "./whistle";

test("session owned Whistle projection reuses unchanged rows and tracks dynamic state", () => {
  let available = true;
  const site = entity("colony.site.1");
  const pack: GamePack = {
    id: "whistle-test", version: 1, definition: encodeDefinition("whistle-test", []), components: [], systems: [],
    commands: {
      deconstruct: command({
        title: "Deconstruct", category: "Construction", description: "Remove a finished site.", input: z.object({ site: z.string() }).strict(),
        availability: () => available ? { status: "available" } : { status: "unavailable", reason: "Site is unfinished" },
        subjects: () => available ? [site] : [], writes: [], run: () => ({ actions: [], writes: [] }),
      }),
    },
  };
  const projector = createWhistleObservationProjector(pack);
  const context = { query: () => [] };
  const first = projector.project(context);
  const unchanged = projector.project(context);
  assert.equal(unchanged, first);
  assert.equal(first.agent[0].action?.inputSchema, unchanged.agent[0].action?.inputSchema);
  assert.equal(first.agent[0].action && Object.hasOwn(first.agent[0].action, "presentation"), false);
  available = false;
  const unavailable = projector.project(context);
  assert.equal(unavailable.agent[0].availability.status, "unavailable");
  assert.deepEqual(unavailable.targets, []);
  assert.equal(unavailable.revision, first.revision + 1);
});
