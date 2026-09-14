/** Content-owned visual choices. The renderer only consumes this checked shape. */
const constructionBindings = Object.fromEntries(["floor", "wall", "stair", "roof", "bed", "shelf", "brew-station"].flatMap(type =>
  ["stakes", "frame", "finished"].map(stage => [`colony.${type}.${stage}`, Object.freeze({
    kind: "static", path: type === "stair" || type === "bed" || type === "roof" || type === "shelf" ? ["buildings", type, stage] : ["buildings", type, stage, 0],
    facing: type === "stair" || type === "bed" || type === "roof" || type === "shelf", anchor: "propAnchor",
    worldRole: type === "floor" ? "floor" : "structure",
  })])));
const edgeWallBindings = Object.fromEntries(["stakes", "frame", "finished"].flatMap(stage =>
  ["end", "straight", "corner", "t", "cross"].flatMap(variant =>
    [["x", 0], ["z", 1]].map(([axis, facing]) => [`colony.wall.${stage}.${variant}.${axis}`, Object.freeze({
      kind: "static", path: ["edgeWalls", stage, variant, facing], facing: false, anchor: "propAnchor", worldRole: "structure",
    })]))));
const brewStationProfileBindings = Object.fromEntries([
  "empty", "stock-w0-b0-k0", "stock-w1-b0-k0", "stock-w0-b1-k0",
  "stock-w1-b1-k0", "stock-w0-b0-k1", "stock-w1-b0-k1", "stock-w0-b1-k1",
  "stock-w1-b1-k1", "prepare", "prepare-attended", "ferment",
  "ferment-burning", "keg", "settled",
].map(profile => [`colony.brew-station.profile.${profile}`, Object.freeze({
  kind: "static", path: ["buildings", "brew-station", "profiles", profile, 0],
  frames: true, facing: false, anchor: "propAnchor", worldRole: "structure",
})]));
export const DEFAULT_VISUAL_BINDINGS = Object.freeze({
  ...constructionBindings,
  ...edgeWallBindings,
  ...brewStationProfileBindings,
  soil: Object.freeze({ kind: "static", path: ["soil", 3], facing: false, anchor: "propAnchor", worldRole: "item" }),
  stone: Object.freeze({ kind: "static", path: ["stone", 3], facing: false, anchor: "propAnchor", worldRole: "item" }),
  // These bindings prepare the retained clearing scenery for native facts.
  // They are inert until Colony publishes a physical entity with this visual;
  // art never creates a tree, resource, or pick target by itself.
  "colony.tree": Object.freeze({
    kind: "static",
    path: ["tree", "standing"],
    facing: false,
    anchor: "propAnchor",
    worldRole: "structure",
  }),
  "colony.tree.notched": Object.freeze({
    kind: "static",
    path: ["tree", "notched"],
    facing: false,
    anchor: "propAnchor",
    worldRole: "structure",
  }),
  "colony.tree.felled": Object.freeze({
    kind: "static",
    path: ["tree", "felled"],
    facing: false,
    anchor: "propAnchor",
    worldRole: "structure",
  }),
  "colony.tree.stump": Object.freeze({
    kind: "static",
    path: ["tree", "stump"],
    facing: false,
    anchor: "propAnchor",
    worldRole: "structure",
  }),
  "colony.mugwort.planted": Object.freeze({
    kind: "static",
    path: ["herbs", "mugwort", "planted"],
    facing: false,
    anchor: "propAnchor",
    worldRole: "item",
  }),
  "colony.mugwort.growing": Object.freeze({
    kind: "static",
    path: ["herbs", "mugwort", "growing"],
    facing: false,
    anchor: "propAnchor",
    worldRole: "item",
  }),
  "colony.mugwort.ready": Object.freeze({
    kind: "static",
    path: ["herbs", "mugwort", "ready"],
    facing: false,
    anchor: "propAnchor",
    worldRole: "item",
  }),
  "colony.cat": Object.freeze({
    kind: "figure",
    key: "cat",
    worldRole: "actor",
    motion: { kind: "foot", stride: 0.42 },
  }),
  crate: Object.freeze({
    kind: "static",
    path: ["props", "crate"],
    facing: false,
    anchor: "propAnchor",
    worldRole: "item",
  }),
  "goblin.worker": Object.freeze({ kind: "figure", key: "goblin-worker", worldRole: "actor", motion: {kind:"foot",stride:0.65}, workPoses: { dig: "dig", build: "build", chop: "chop" }, carryPoses: { bread: "carry-ration", wood: "carry", "soil-spoil": "carry-soil", "stone-spoil": "carry-stone" } }),
  "goblin.guest": Object.freeze({ kind: "figure", key: "goblin", worldRole: "actor" }),
  "goblin.survivor": Object.freeze({ kind: "figure", key: "goblin-traveler", worldRole: "actor", motion: {kind:"foot",stride:0.7}, carryPoses: { bread: "carry-ration" } }),
  "goblin.soldier": Object.freeze({ kind: "figure", key: "goblin", worldRole: "actor", motion:{kind:"foot",stride:0.7} }),
});

const clearingWorker = Object.freeze({
  kind: "figure",
  worldRole: "actor",
  motion: { kind: "foot", stride: 0.65 },
  workPoses: { dig: "dig", build: "build", chop: "chop" },
  deliveryPoses: { pickup: "pickup", "putting-down": "deliver" },
  carryPoses: { bread: "carry-ration", wood: "carry", mugwort: "carry-herb", "soil-spoil": "carry-soil", "stone-spoil": "carry-stone", pail: { contentKind: "water", empty: "carry-pail-empty", partial: "carry-pail-half", full: "carry-pail-full" } },
});
export const COLONY_VISUAL_BINDINGS = Object.freeze({
  "colony.rowan": Object.freeze({ ...clearingWorker, key: "rowan" }),
  "colony.sedge": Object.freeze({ ...clearingWorker, key: "witch-runner" }),
});

export const PIRATE_VISUAL_BINDINGS = Object.freeze({
  "pirate.ship": Object.freeze({
    kind: "static",
    path: ["vehicles", "ship"],
    motion: {kind:"wake",stride:0.65,localOffset:{x:-3.7,y:0.04,z:0}},
    facing: true,
    anchor: "vehicleAnchor",
    worldRole: "structure",
  }),
  "pirate.crew": Object.freeze({ kind: "figure", key: "goblin-sailor", worldRole: "actor", carryPoses: { bread: "carry-ration", wood: "carry" } }),
  "pirate.chest": Object.freeze({
    kind: "static",
    path: ["props", "chest"],
    facing: false,
    anchor: "propAnchor",
    worldRole: "item",
  }),
  "pirate.hold": Object.freeze({
    kind: "static",
    path: ["props", "crate"],
    facing: false,
    anchor: "propAnchor",
    worldRole: "structure",
  }),
  "pirate.deck-obstacle": Object.freeze({
    kind: "static",
    path: ["props", "barrel"],
    facing: false,
    anchor: "propAnchor",
    worldRole: "structure",
  }),
});

/** Formation consumers may opt into these authored static visuals later. */
export const CANNON_VISUAL_BINDINGS = Object.freeze({
  "goblin.soldier": Object.freeze({kind: "figure", key: "goblin", worldRole: "actor", motion:{kind:"foot",stride:0.7}, reactions: {impact: {path: ["figures", "goblin", "hit"], duration: 720}}}),
  "formation.cannon": Object.freeze({
    kind: "static",
    path: ["props", "cannon"],
    reactions: {launch: {path: ["props", "cannonRecoil"], duration: 480}},
    facing: true,
    anchor: "propAnchor",
    worldRole: "structure",
  }),
  "formation.cannonball": Object.freeze({
    kind: "static",
    path: ["projectiles", "cannonball"],
    facing: false,
    anchor: "propAnchor",
    worldRole: "item",
  }),
});
