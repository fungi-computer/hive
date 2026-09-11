/** Content-owned visual choices. The renderer only consumes this checked shape. */
export const DEFAULT_VISUAL_BINDINGS = Object.freeze({
  crate: Object.freeze({
    kind: "static",
    path: ["buildings", "shelf", "finished", 0],
    facing: false,
    anchor: "propAnchor",
  }),
  "goblin.worker": Object.freeze({ kind: "figure", key: "goblin" }),
  "goblin.guest": Object.freeze({ kind: "figure", key: "goblin" }),
  "goblin.survivor": Object.freeze({ kind: "figure", key: "goblin" }),
  "goblin.soldier": Object.freeze({ kind: "figure", key: "goblin" }),
});

export const PIRATE_VISUAL_BINDINGS = Object.freeze({
  "pirate.ship": Object.freeze({
    kind: "static",
    path: ["vehicles", "ship"],
    facing: true,
    anchor: "vehicleAnchor",
  }),
  "pirate.crew": Object.freeze({ kind: "figure", key: "goblin" }),
  "pirate.chest": Object.freeze({
    kind: "static",
    path: ["buildings", "shelf", "finished", 0],
    facing: false,
    anchor: "propAnchor",
  }),
  "pirate.hold": Object.freeze({
    kind: "static",
    path: ["buildings", "shelf", "finished", 0],
    facing: false,
    anchor: "propAnchor",
  }),
  "pirate.deck-obstacle": Object.freeze({
    kind: "static",
    path: ["buildings", "shelf", "finished", 0],
    facing: false,
    anchor: "propAnchor",
  }),
});

/** Formation consumers may opt into these authored static visuals later. */
export const CANNON_VISUAL_BINDINGS = Object.freeze({
  "goblin.soldier": Object.freeze({kind: "figure", key: "goblin", reactions: {impact: {path: ["figures", "goblin", "hit"], duration: 720}}}),
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
