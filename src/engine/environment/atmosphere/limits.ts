/** Raw admission, compiled work and save budgets are deliberately separate.
 * These cover the named 17x17x128 Clearing envelope; they are not a claim that
 * every such field is cheap enough for a host tick. */
export const ATMOSPHERE_LIMITS = Object.freeze({
  rawCells: 40_000,
  rawFaces: 120_000,
  volumes: 2_048,
  members: 40_000,
  // A fully open 17x17x128 field produces 36,703 vertical faces, 8,704
  // eight-metre band seams and at most 9,282 exterior faces (54,689 total).
  openings: 56_000,
  bandCells: 256,
  bandSpanM: 8,
  sources: 32,
  encodedStateBytes: 32 * 1024 * 1024,
  dataNodes: 2_000_000,
  intervalS: 6,
  minIntervalS: 1e-6,
  steps: 128,
});
