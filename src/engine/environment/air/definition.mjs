import { array, assert, freeze, record, uniqueStrings } from "./data.mjs";
import { compileGeometry } from "./geometry.mjs";

const DEFINITION_VERSION = "voxel-air-definition-v1";
const MODEL_FIELDS = [
  "densityKgM3",
  "heatCapacityJKgK",
  "referenceTemperatureK",
  "gravityMSS",
  "viscosityM2S",
  "thermalDiffusivityM2S",
  "tracerDiffusivityM2S",
];
const AXES = ["x", "y", "z"];

function vector(value, predicate, label) {
  array(value, 3);
  assert(value.length === 3 && value.every(predicate), label);
  return [...value];
}

function modelDefinition(input) {
  record(input, MODEL_FIELDS);
  const model = Object.fromEntries(
    MODEL_FIELDS.map((key) => [key, input[key]]),
  );
  assert(
    MODEL_FIELDS.every((key) => Number.isFinite(model[key]) && model[key] >= 0),
    "finite nonnegative air coefficients",
  );
  assert(
    model.densityKgM3 > 0 &&
      model.heatCapacityJKgK > 0 &&
      model.referenceTemperatureK > 0,
    "positive air density, capacity and reference temperature",
  );
  assert(
    Number.isFinite(
      model.densityKgM3 * model.heatCapacityJKgK * model.referenceTemperatureK,
    ) &&
      model.densityKgM3 *
        model.heatCapacityJKgK *
        model.referenceTemperatureK *
        0.54 >
        0,
    "representable air reference heat",
  );
  return model;
}

export function admitDefinition(input) {
  record(input, [
    "version",
    "regionId",
    "revision",
    "origin",
    "size",
    "spacingM",
    "solidCells",
    "closedFaces",
    "openSides",
    "model",
  ]);
  assert(
    input.version === DEFINITION_VERSION,
    "unsupported air definition version",
  );
  assert(
    typeof input.regionId === "string" &&
      input.regionId.length > 0 &&
      input.regionId.length <= 160,
    "bounded air region identity",
  );
  assert(
    Number.isSafeInteger(input.revision) && input.revision >= 0,
    "air geometry revision",
  );
  const origin = vector(
    input.origin,
    Number.isSafeInteger,
    "signed air origin",
  );
  const size = vector(
    input.size,
    (n) => Number.isSafeInteger(n) && n >= 2,
    "3D air extents",
  );
  assert(
    size.reduce((n, v) => n * v, 1) <= 1024,
    "air domain exceeds1024 cells",
  );
  const spacingM = vector(input.spacingM, Number.isFinite, "air metric");
  assert(
    spacingM.every((n, i) => n === [1, 0.54, 1][i]),
    "qualified air voxel metric is1m x0.54m x1m",
  );
  for (let d = 0; d < 3; d++) {
    assert(Number.isSafeInteger(origin[d] + size[d]), "safe air extent");
    const base = origin[d] * spacingM[d],
      end = (origin[d] + size[d]) * spacingM[d];
    assert(
      Number.EPSILON * Math.max(1, Math.abs(base), Math.abs(end)) <=
        spacingM[d] / 1024,
      "physical air coordinate resolution",
    );
  }
  const solidCells = uniqueStrings(input.solidCells, 1024),
    closedFaces = uniqueStrings(input.closedFaces, 4096);
  const openSides = uniqueStrings(input.openSides, 6);
  assert(
    openSides.every((side) =>
      AXES.some((axis) => side === axis + "-" || side === axis + "+"),
    ),
    "known air open side",
  );
  return freeze({
    version: DEFINITION_VERSION,
    regionId: input.regionId,
    revision: input.revision,
    origin,
    size,
    spacingM,
    solidCells,
    closedFaces,
    openSides,
    model: modelDefinition(input.model),
  });
}

export function buildGeometry(definition) {
  const { origin, size, spacingM, model } = definition;
  const cellIds = [],
    lookup = new Map();
  for (let z = 0; z < size[2]; z++)
    for (let y = 0; y < size[1]; y++)
      for (let x = 0; x < size[0]; x++) {
        const id = `cell:${origin[0] + x},${origin[1] + y},${origin[2] + z}`;
        lookup.set(id, cellIds.length);
        cellIds.push(id);
      }
  assert(
    definition.solidCells.every((id) => lookup.has(id)),
    "solid air cell belongs to domain",
  );
  assert(
    definition.solidCells.length < cellIds.length,
    "air domain needs a fluid cell",
  );
  const topology = compileGeometry({
    size,
    origin,
    spacing: spacingM,
    open: definition.openSides,
    solid: definition.solidCells.map((id) => lookup.get(id)),
    walls: definition.closedFaces,
    viscosity: model.viscosityM2S,
    thermalDiffusivity: model.thermalDiffusivityM2S,
    tracerDiffusivity: model.tracerDiffusivityM2S,
    buoyancy: true,
  });
  return { ...topology, model, definition, cellIds, cellIndex: lookup };
}
