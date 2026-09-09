import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { pail } from "./art/pail.js";
import { basinScene } from "./art/spring-basin.js";
import { stationScene } from "./art/brew-station.js";
import {
  stationProfileOptions,
  stationVisualProfile,
} from "./brew-station-profiles.js";
import { figure } from "./art/figures.js";
import {
  carriedActorFrame,
  carriedActorPose,
  herbGrowthProgress,
} from "./view.js";
import {
  dispatchUiAction,
  requiredToolLevel,
  singlePlacementTool,
} from "./ui-actions.ts";

const mainSource = readFileSync(new URL("./main.js", import.meta.url), "utf8");
const hudSource = readFileSync(new URL("./hud.jsx", import.meta.url), "utf8");

function named(scene, name) {
  let found = null;
  scene.traverse((node) => {
    if (node.name === name) found = node;
  });
  return found;
}

test("brew station is ground-only and uses one anchor for a 2x2 placement", () => {
  assert.equal(requiredToolLevel("brew-station"), 0);
  for (const tool of ["bed", "stair", "brew-station"])
    assert.equal(singlePlacementTool(tool), true);
  assert.equal(singlePlacementTool("wall"), false);
});

test("finite-source inspection uses the checked UI action dispatcher", () => {
  const forwarded = [];
  const action = {
    kind: "inspect-source",
    id: "feature:spring",
    point: { x: 12, y: 34 },
  };
  dispatchUiAction(action, {
    run: (received) => forwarded.push(received),
    level: null,
  });
  assert.deepEqual(forwarded, [action]);
});

test("Tap stays a shared station-only catalog command", () => {
  const forwarded = [];
  const action = {
    kind: "command",
    command: { kind: "tap", station: "site-brew", actors: null },
  };
  dispatchUiAction(action, {
    run: (received) => forwarded.push(received),
    level: null,
  });
  assert.deepEqual(forwarded, [action]);
});

test("Water mugwort stays a target-only catalog command", () => {
  const forwarded = [];
  const action = {
    kind: "command",
    command: { kind: "water-mugwort", herb: "herb-1" },
  };
  dispatchUiAction(action, {
    run: (received) => forwarded.push(received),
    level: null,
  });
  assert.deepEqual(forwarded, [action]);
});

test("unscoped Water stays shared through HUD normalization and request", () => {
  const normalizer = hudSource.slice(
    hudSource.indexOf('case "command":'),
    hudSource.indexOf('case "go":'),
  );
  assert.match(
    normalizer,
    /command\.kind === "fill-kettle" \|\|\s*command\.kind === "water-mugwort"/,
  );
  assert.match(normalizer, /command\.actors = null/);
  const water = mainSource.indexOf('command.kind === "water-mugwort"');
  const selected = mainSource.indexOf(
    "command.actors === undefined ? selectedIds() : command.actors",
  );
  assert.ok(water >= 0, "Water has a checked request branch");
  assert.ok(water < selected, "Water never inherits an unrelated selection");
  assert.match(
    mainSource.slice(water, selected),
    /scoped = \{ party: "home", actors: null, \.\.\.command \}/,
  );
});

test("finite-source and pail art states are caller-supplied geometry", () => {
  assert.equal(named(basinScene("dry"), "basin-liquid"), null);
  assert.ok(named(basinScene("low"), "basin-liquid"));
  assert.ok(named(basinScene("full"), "basin-liquid"));

  const empty = {
    children: [],
    add(node) {
      this.children.push(node);
    },
  };
  const filled = {
    children: [],
    add(node) {
      this.children.push(node);
    },
  };
  const emptyPail = pail(empty, 0);
  const filledPail = pail(filled, 2);
  assert.equal(named(emptyPail, "pail-water"), null);
  assert.ok(named(filledPail, "pail-water"));
});

test("station water is an optional full clear-water appearance at the accepted datum", () => {
  const empty = stationScene("finished", 0);
  const full = stationScene("finished", 1, { water: true });
  const datum = named(full, "station-datum");
  assert.deepEqual(datum.position.toArray(), [0.5, 0, 0.5]);
  assert.equal(named(empty, "kettle-contents"), null);
  assert.ok(named(full, "kettle-contents"));
});

test("station profiles expose only canonical phase and contents effects", () => {
  const slots = {
    kettle: { water: 2, malt: 2, mugwort: 1 },
    hearth: { wood: 1 },
    barm: { barm: 1 },
    keg: { keg: 1, ale: 0 },
    tray: { spentGrain: 0 },
  };
  assert.equal(
    stationVisualProfile({
      finished: true,
      slots,
      process: { phase: "prepare" },
      attending: false,
    }),
    "prepare",
  );
  assert.equal(
    stationVisualProfile({
      finished: true,
      slots,
      process: { phase: "prepare" },
      attending: true,
    }),
    "prepare-attended",
  );
  assert.equal(
    stationVisualProfile({
      finished: true,
      slots,
      process: { phase: "ferment" },
      attending: false,
    }),
    "ferment",
  );
  assert.equal(
    stationVisualProfile({
      finished: true,
      slots: { ...slots, keg: { keg: 1, ale: 4 }, tray: { spentGrain: 1 } },
      process: null,
      attending: false,
    }),
    "settled",
  );
  assert.deepEqual(stationProfileOptions("ferment"), {
    liquid: "wort",
    barm: true,
    keg: true,
    tray: false,
    stirring: false,
    fire: false,
    steam: false,
  });
});

test("only attended PREPARE bakes fire, steam, and stirring", () => {
  const prepare = stationScene("finished", 0, { profile: "prepare" });
  const attended = stationScene("finished", 0, {
    profile: "prepare-attended",
    phase: 0.25,
  });
  const ferment = stationScene("finished", 0, { profile: "ferment" });
  const settled = stationScene("finished", 0, { profile: "settled" });
  assert.equal(named(prepare, "kettle-fire"), null);
  assert.equal(named(prepare, "kettle-steam"), null);
  assert.ok(named(attended, "kettle-fire"));
  assert.ok(named(attended, "kettle-steam"));
  assert.ok(named(attended, "brew-keg"));
  assert.equal(named(ferment, "kettle-fire"), null);
  assert.equal(named(ferment, "kettle-steam"), null);
  assert.ok(named(settled, "brew-keg"));
  assert.ok(named(settled, "spent-grain-contents"));
});

test("carried pail art reads vessel water from the canonical lot container", () => {
  const pailLot = {
    id: "lot-pail",
    material: "pail",
    quantity: 1,
    location: { kind: "hand", actor: "rowan" },
  };
  for (const [water, pose] of [
    [0, "carry-pail-empty"],
    [1, "carry-pail-half"],
    [2, "carry-pail-full"],
  ]) {
    const materials = {
      lots: water
        ? [
            {
              id: `water-${water}`,
              material: "water",
              quantity: water,
              location: { kind: "container", container: "vessel:lot-pail" },
            },
          ]
        : [],
    };
    assert.equal(carriedActorPose(materials, pailLot, "transfer"), pose);
    assert.equal(carriedActorFrame(5, pose, "transfer", [0, 1, 2]), 0);
    assert.equal(carriedActorFrame(4, pose, "walk", [0, 1, 2]), 2);
  }
  assert.equal(
    carriedActorPose({ lots: [] }, { material: "wood" }, "walk"),
    "carry",
  );
  assert.equal(
    carriedActorPose({ lots: [] }, { material: "mugwort" }, "transfer"),
    "carry-herb",
  );
});

test("unestablished mugwort has no visual growth until canonical establishment", () => {
  const planted = { stage: "planted", work: 0, establishment: null };
  assert.equal(herbGrowthProgress(planted, 400), 0);
  assert.equal(
    herbGrowthProgress(
      { ...planted, establishment: { kind: "water", at: 300 } },
      400,
    ),
    100 / 240,
  );
});

test("Rowan and Sedge figure callers resolve each accepted pail pose and facing", () => {
  for (const kind of ["rowan", "witch-runner"])
    for (const pose of [
      "carry-pail-empty",
      "carry-pail-half",
      "carry-pail-full",
    ])
      for (let facing = 0; facing < 4; facing++) {
        const art = figure(kind, 0.25, (facing * Math.PI) / 2, pose);
        const pail = named(art, "carried-pail");
        assert.ok(pail, `${kind}/${pose}/${facing} includes its pail`);
      }
});
