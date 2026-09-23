import vm from "node:vm";
import { readFileSync } from "node:fs";
import { createClearing, step } from "../../src/clearing.ts";
import { BUILDINGS } from "../../src/construction.js";
import { CHOP_TICKS } from "../../src/activity.ts";

const colony = await new Promise((resolve, reject) => {
  const context = {
    Module: {
      wasmBinary: readFileSync(
        new URL("../../public/vendor/libcolony/colony.wasm", import.meta.url),
      ),
      onRuntimeInitialized() {
        resolve(context.Module);
      },
      onAbort: reject,
    },
    window: {},
    console,
    TextDecoder,
    TextEncoder,
    WebAssembly,
    setTimeout,
    clearTimeout,
  };
  vm.runInNewContext(
    readFileSync(
      new URL("../../public/vendor/libcolony/colony.js", import.meta.url),
      "utf8",
    ),
    context,
  );
});

const state = createClearing();
state.parties.home.members.push("sedge");
state.felled = 8;
for (const tree of state.trees) {
  tree.work = CHOP_TICKS;
  tree.felledAt = 1;
}
state.nextId = 100;
state.actors.rowan.x = 3;
state.actors.rowan.z = 11;
state.actors.sedge.x = 10;
state.actors.sedge.z = 10;
state.cat.x = 2;
state.cat.z = 11;
state.cat.nextMove = 10_000;

function finished(type, x, z, level, direction = 0) {
  state.sites.push({
    id: `fixture-${state.nextId++}`,
    type,
    x,
    z,
    level,
    direction,
    delivered: BUILDINGS[type].wood,
    work: BUILDINGS[type].ticks,
    finishedAt: 1,
  });
}

for (let x = 6; x <= 9; x += 1)
  for (let z = 4; z <= 6; z += 1)
    if (!(x === 8 && z === 4)) finished("wall", x, z, 0);
for (let x = 6; x <= 9; x += 1)
  for (let z = 4; z <= 6; z += 1)
    if (!(x === 8 && z === 4)) finished("floor", x, z, 1);
finished("stair", 8, 2, 0);
state.piles.push({ id: "wood-fixture", x: 4, z: 10, level: 0, amount: 23 });

const commands = [];
for (let x = 6; x <= 9; x += 1)
  for (const z of [4, 6])
    if (!(x === 8 && z === 4))
      commands.push({ kind: "build", type: "wall", x, z, level: 1 });
for (const x of [6, 9])
  commands.push({ kind: "build", type: "wall", x, z: 5, level: 1 });
commands.push({ kind: "build", type: "door", x: 8, z: 4, level: 1 });

step(
  state,
  colony,
  commands.map((command) => ({
    party: "home",
    actors: null,
    direction: 0,
    ...command,
  })),
);
for (let i = 0; i < 1_500 && state.jobs.length; i += 1)
  step(state, colony, []);

console.log(
  JSON.stringify(
    {
      tick: state.tick,
      actors: Object.fromEntries(
        Object.entries(state.actors).map(([id, actor]) => [
          id,
          {
            x: actor.x,
            z: actor.z,
            level: actor.level,
            mode: actor.mode,
            task: actor.task,
            path: actor.path,
          },
        ]),
      ),
      unfinished: state.sites
        .filter((site) => site.finishedAt === null)
        .map((site) => ({
          id: site.id,
          type: site.type,
          x: site.x,
          z: site.z,
          level: site.level,
          delivered: site.delivered,
          work: site.work,
        })),
      jobs: state.jobs,
      piles: state.piles,
    },
    null,
    2,
  ),
);
