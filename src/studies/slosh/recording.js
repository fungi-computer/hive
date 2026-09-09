const PATH = "/study-evidence/slosh/surface-v1.json";
const EXPECTED = Object.freeze({
  schema: "recorded-2d-slosh-surface-v1",
  results: "08dffba97befad55d190028b2ad9eb2030986984725419c9bf0a3fb95686f394",
  handoff: "d2cf0d646005bd5652bcb519350c46a862df843a874f539860951a44a3b49dd5",
  sourcePins:
    "a3593cdb4e03f2d0916cc1859b315df439a16aab6161c255f51cd4909c72d996",
  captures: Object.freeze({
    coarse: "5af1eb20e84b48a4f30e0957da7036397f6f8847caedc34a5c6207e66365197a",
    fine: "449e7c2def95012cbceb23f0b2cd70ee8071e78ffcdd6cd6d591b82d04d47abd",
  }),
  tiers: Object.freeze({
    coarse: Object.freeze({
      deltaM: 0.02,
      nativeWallSeconds: 11.91953775001457,
    }),
    fine: Object.freeze({ deltaM: 0.01, nativeWallSeconds: 45.31083960796241 }),
  }),
});

export const SLOSH_TIERS = Object.freeze([
  { id: "coarse", label: "Coarse · 50 columns" },
  { id: "fine", label: "Fine · 100 columns" },
]);

function finite(value, label) {
  if (!Number.isFinite(value))
    throw new Error(`Slosh recording ${label} is not finite`);
  return value;
}

export function selectedObservationIndices(count, sampleCount = 101) {
  if (
    !Number.isInteger(count) ||
    !Number.isInteger(sampleCount) ||
    sampleCount < 2
  ) {
    throw new Error("Slosh sample counts must be bounded integers");
  }
  return Object.freeze(
    Array.from({ length: sampleCount }, (_, i) =>
      Math.round((i * (count - 1)) / (sampleCount - 1)),
    ),
  );
}

function same(left, right) {
  return (
    Array.isArray(left) &&
    left.length === right.length &&
    left.every((value, i) => value === right[i])
  );
}

function decodeTier(id, tier, reference) {
  const columns = id === "coarse" ? 50 : 100;
  if (
    !tier ||
    tier.captureSha256 !== EXPECTED.captures[id] ||
    tier.columns !== columns ||
    tier.deltaM !== EXPECTED.tiers[id].deltaM ||
    tier.deltaM !== reference.widthM / tier.columns ||
    tier.rawObservationCount !== 1612 ||
    !Array.isArray(tier.samples) ||
    tier.samples.length !== 101 ||
    !same(
      tier.sampleIndices,
      selectedObservationIndices(tier.rawObservationCount),
    )
  )
    throw new Error(`Slosh ${id} sample provenance is invalid`);
  let priorStep = -1;
  let priorTime = -1;
  for (const sample of tier.samples) {
    if (
      !Number.isInteger(sample.step) ||
      sample.step <= priorStep ||
      finite(sample.nominalFractionTimeSeconds, `${id} nominal time`) <
        priorTime ||
      finite(sample.velocityTimeSeconds, `${id} velocity time`) < 0 ||
      !Array.isArray(sample.columnHeightsM) ||
      sample.columnHeightsM.length !== columns
    )
      throw new Error(`Slosh ${id} sample shape is invalid`);
    for (const height of sample.columnHeightsM)
      finite(height, `${id} column height`);
    priorStep = sample.step;
    priorTime = sample.nominalFractionTimeSeconds;
  }
  if (
    tier.samples[0].nominalFractionTimeSeconds !== 0 ||
    tier.completedSeconds !== reference.periodSeconds ||
    tier.samples.at(-1).nominalFractionTimeSeconds >= tier.completedSeconds ||
    tier.nativeWallSeconds !== EXPECTED.tiers[id].nativeWallSeconds
  )
    throw new Error(`Slosh ${id} period/staggering facts are invalid`);
  return Object.freeze({
    ...tier,
    id,
    samples: Object.freeze(
      tier.samples.map((sample) =>
        Object.freeze({
          ...sample,
          columnHeightsM: Object.freeze([...sample.columnHeightsM]),
        }),
      ),
    ),
  });
}

export function decodeRecording(raw) {
  if (
    raw?.schema !== EXPECTED.schema ||
    raw.provenance?.resultsSha256 !== EXPECTED.results ||
    raw.provenance?.handoffSha256 !== EXPECTED.handoff ||
    raw.provenance?.sourcePinsSha256 !== EXPECTED.sourcePins ||
    raw.reference?.dimension !== 2 ||
    raw.reference?.widthM !== 1 ||
    raw.reference?.heightM !== 1.08 ||
    raw.reference?.waterDepthM !== 0.54 ||
    raw.reference?.periodSeconds !== 1.171908997384657 ||
    raw.reference?.amplitudeM !== 0.002 ||
    raw.reference?.visualVerticalExaggeration !== 40 ||
    raw.reference?.legacyDiagnostic?.passed !== false ||
    raw.reference.legacyDiagnostic?.coarseFirstFailureStep !== 202
  )
    throw new Error("Expected the accepted recorded 2D slosh reference");
  for (const [label, value] of Object.entries({
    widthM: raw.reference.widthM,
    heightM: raw.reference.heightM,
    waterDepthM: raw.reference.waterDepthM,
    periodSeconds: raw.reference.periodSeconds,
  })) {
    if (finite(value, label) <= 0)
      throw new Error(`Slosh ${label} must be positive`);
  }
  return Object.freeze({
    ...raw,
    tiers: Object.freeze({
      coarse: decodeTier("coarse", raw.tiers?.coarse, raw.reference),
      fine: decodeTier("fine", raw.tiers?.fine, raw.reference),
    }),
  });
}

export async function loadRecording() {
  const response = await fetch(PATH);
  if (!response.ok) throw new Error("Could not load recorded slosh samples");
  return decodeRecording(await response.json());
}

export function surfacePoints(recording, tierId, frameIndex) {
  const tier = recording.tiers[tierId];
  const sample = tier?.samples[frameIndex];
  if (!sample) throw new Error("No recorded slosh surface sample");
  return Object.freeze(
    sample.columnHeightsM.map((heightM, index) =>
      Object.freeze({
        xM: (index + 0.5) * tier.deltaM,
        heightM,
      }),
    ),
  );
}

export function frameFacts(recording, tierId, frameIndex) {
  const tier = recording.tiers[tierId];
  const sample = tier?.samples[frameIndex];
  if (!sample) throw new Error("No recorded slosh frame facts");
  return Object.freeze({
    tier,
    sample,
    isFinalSavedSurface: frameIndex === tier.samples.length - 1,
  });
}
