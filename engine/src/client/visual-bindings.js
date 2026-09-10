/** Content-owned visual choices. The renderer only consumes this checked shape. */
export const DEFAULT_VISUAL_BINDINGS = Object.freeze({
  crate: Object.freeze({ kind: "container", key: "shelf" }),
  "goblin.worker": Object.freeze({ kind: "figure", key: "goblin" }),
  "goblin.guest": Object.freeze({ kind: "figure", key: "goblin" }),
  "goblin.survivor": Object.freeze({ kind: "figure", key: "goblin" }),
  "goblin.soldier": Object.freeze({ kind: "figure", key: "goblin" }),
});

export const PIRATE_VISUAL_BINDINGS = Object.freeze({
  "pirate.ship": Object.freeze({ kind: "vehicle", key: "ship" }),
  "pirate.crew": Object.freeze({ kind: "figure", key: "goblin" }),
  "pirate.chest": Object.freeze({ kind: "container", key: "shelf" }),
  "pirate.hold": Object.freeze({ kind: "container", key: "shelf" }),
  "pirate.deck-obstacle": Object.freeze({ kind: "container", key: "shelf" }),
});
