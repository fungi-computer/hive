/** Declared game-content yields for one paid wood dose. These are room-directed
 * warmth and tracer, not wood chemistry or an independent material owner. */
export const ROOM_FUEL = Object.freeze({
  definition: "warm-room-wood-dose-v1",
  operation: "room-hearth-dose",
  initialLot: "room-firewood:1",
  durationS: 6,
  heatJ: 1800,
  smokeKg: 0.0002,
});
