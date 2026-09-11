/** Content-owned visual choices. The renderer only consumes this checked shape. */
export const DEFAULT_VISUAL_BINDINGS = Object.freeze({
  crate: Object.freeze({
    kind: "static",
    path: ["props", "crate"],
    facing: false,
    anchor: "propAnchor",
  }),
  "goblin.worker": Object.freeze({ kind: "figure", key: "goblin-worker", motion: {kind:"foot",stride:0.65}, carryPoses: { bread: "carry-ration", wood: "carry" } }),
  "goblin.guest": Object.freeze({ kind: "figure", key: "goblin" }),
  "goblin.survivor": Object.freeze({ kind: "figure", key: "goblin-traveler", motion: {kind:"foot",stride:0.7}, carryPoses: { bread: "carry-ration" } }),
  "goblin.soldier": Object.freeze({ kind: "figure", key: "goblin", motion:{kind:"foot",stride:0.7} }),
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
