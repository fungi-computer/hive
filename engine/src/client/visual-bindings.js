/** Content-owned visual choices. The renderer only consumes this checked shape. */
const constructionBindings = Object.fromEntries(["floor", "wall", "stair"].flatMap(type =>
  ["stakes", "frame", "finished"].map(stage => [`colony.${type}.${stage}`, Object.freeze({
    kind: "static", path: type === "stair" ? ["buildings", type, stage] : ["buildings", type, stage, 0],
    facing: type === "stair", anchor: type === "stair" ? "vehicleAnchor" : "propAnchor",
  })])));
export const DEFAULT_VISUAL_BINDINGS = Object.freeze({
  ...constructionBindings,
  soil: Object.freeze({ kind: "static", path: ["soil", 3], facing: false, anchor: "propAnchor" }),
  stone: Object.freeze({ kind: "static", path: ["stone", 3], facing: false, anchor: "propAnchor" }),
  "colony.brew-station": Object.freeze({
    kind: "static", path: ["buildings", "brew-station", "finished", 0],
    facing: false, anchor: "propAnchor",
  }),
  // These bindings prepare the retained clearing scenery for native facts.
  // They are inert until Colony publishes a physical entity with this visual;
  // art never creates a tree, resource, or pick target by itself.
  "colony.tree": Object.freeze({
    kind: "static",
    path: ["tree", "standing"],
    facing: false,
    anchor: "propAnchor",
  }),
  "colony.tree.notched": Object.freeze({
    kind: "static",
    path: ["tree", "notched"],
    facing: false,
    anchor: "propAnchor",
  }),
  "colony.tree.felled": Object.freeze({
    kind: "static",
    path: ["tree", "felled"],
    facing: false,
    anchor: "propAnchor",
  }),
  "colony.tree.stump": Object.freeze({
    kind: "static",
    path: ["tree", "stump"],
    facing: false,
    anchor: "propAnchor",
  }),
  "colony.cat": Object.freeze({
    kind: "figure",
    key: "cat",
    motion: { kind: "foot", stride: 0.42 },
  }),
  crate: Object.freeze({
    kind: "static",
    path: ["props", "crate"],
    facing: false,
    anchor: "propAnchor",
  }),
  "goblin.worker": Object.freeze({ kind: "figure", key: "goblin-worker", motion: {kind:"foot",stride:0.65}, carryPoses: { bread: "carry-ration", wood: "carry", "soil-spoil": "carry-soil", "stone-spoil": "carry-stone" } }),
  "goblin.guest": Object.freeze({ kind: "figure", key: "goblin" }),
  "goblin.survivor": Object.freeze({ kind: "figure", key: "goblin-traveler", motion: {kind:"foot",stride:0.7}, carryPoses: { bread: "carry-ration" } }),
  "goblin.soldier": Object.freeze({ kind: "figure", key: "goblin", motion:{kind:"foot",stride:0.7} }),
});

const clearingWorker = Object.freeze({
  kind: "figure",
  motion: { kind: "foot", stride: 0.65 },
  workPoses: { dig: "dig", build: "build" },
  carryPoses: { bread: "carry-ration", wood: "carry", "soil-spoil": "carry-soil", "stone-spoil": "carry-stone" },
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
  }),
  "pirate.crew": Object.freeze({ kind: "figure", key: "goblin-sailor", carryPoses: { bread: "carry-ration", wood: "carry" } }),
  "pirate.chest": Object.freeze({
    kind: "static",
    path: ["props", "chest"],
    facing: false,
    anchor: "propAnchor",
  }),
  "pirate.hold": Object.freeze({
    kind: "static",
    path: ["props", "crate"],
    facing: false,
    anchor: "propAnchor",
  }),
  "pirate.deck-obstacle": Object.freeze({
    kind: "static",
    path: ["props", "barrel"],
    facing: false,
    anchor: "propAnchor",
  }),
});

/** Formation consumers may opt into these authored static visuals later. */
export const CANNON_VISUAL_BINDINGS = Object.freeze({
  "goblin.soldier": Object.freeze({kind: "figure", key: "goblin", motion:{kind:"foot",stride:0.7}, reactions: {impact: {path: ["figures", "goblin", "hit"], duration: 720}}}),
  "formation.cannon": Object.freeze({
    kind: "static",
    path: ["props", "cannon"],
    reactions: {launch: {path: ["props", "cannonRecoil"], duration: 480}},
    facing: true,
    anchor: "propAnchor",
  }),
  "formation.cannonball": Object.freeze({
    kind: "static",
    path: ["projectiles", "cannonball"],
    facing: false,
    anchor: "propAnchor",
  }),
});
