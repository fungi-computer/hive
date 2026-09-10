import { encode, decode } from "../../region/codec.ts";
import {
  assertWorldRecord as record,
  assertWorldArray as array,
} from "../../world/data-contract.mjs";

export const WATER_DENSITY = 1000;
export const WIRE_BYTES = 2 * 1024 * 1024;
export const check = (ok, message) => {
  if (!ok) throw new TypeError(message);
};
export const cellId = (at) => `cell:${at.join(",")}`;
export const copyData = (value) =>
  decode(encode(value, WIRE_BYTES), WIRE_BYTES);
export function freeze(value) {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    for (const child of Object.values(value)) freeze(child);
    Object.freeze(value);
  }
  return value;
}
const positive = (n) => Number.isFinite(n) && n > 0;
const rate = (n) => Number.isFinite(n) && n >= 0;
function coordinate(at) {
  array(at, 3, "water coordinate");
  check(
    at.length === 3 && at.every(Number.isSafeInteger),
    "signed voxel coordinate",
  );
}
function soilDefinitions(inputs) {
  array(inputs, 64, "soil definitions");
  const soils = new Map();
  for (const input of inputs) {
    record(
      input,
      ["id", "porosity", "retention", "absorbMPerS", "seepMPerS"],
      "soil rule",
    );
    check(
      typeof input.id === "string" &&
        input.id.length > 0 &&
        input.id.length <= 160 &&
        !soils.has(input.id),
      "unique soil rule ID",
    );
    check(
      positive(input.porosity) &&
        input.porosity <= 1 &&
        Number.isFinite(input.retention) &&
        input.retention >= 0 &&
        input.retention < input.porosity,
      "soil pore and retained fractions",
    );
    check(
      rate(input.absorbMPerS) && rate(input.seepMPerS),
      "finite soil flow rates",
    );
    soils.set(input.id, input);
  }
  return soils;
}
function compileCells(inputs, soils, spacing) {
  array(inputs, 2048, "water cells");
  check(inputs.length > 0, "nonempty declared field");
  const volumeM3 = spacing[0] * spacing[1] * spacing[2];
  check(positive(volumeM3 * WATER_DENSITY), "finite cell water capacity");
  const seen = new Set();
  return inputs
    .map((input) => {
      check(
        input.kind === "soil" || input.kind === "void",
        "soil or void water cell",
      );
      record(
        input,
        input.kind === "soil" ? ["at", "kind", "soilId"] : ["at", "kind"],
        "water cell",
      );
      coordinate(input.at);
      const id = cellId(input.at),
        soil = input.kind === "soil" ? soils.get(input.soilId) : null;
      check(
        !seen.has(id) && (input.kind !== "soil" || soil),
        "unique cell and registered soil",
      );
      seen.add(id);
      const capacityKg = WATER_DENSITY * volumeM3 * (soil?.porosity ?? 1),
        retainedKg = WATER_DENSITY * volumeM3 * (soil?.retention ?? 0),
        baseM = input.at[1] * spacing[1];
      check(
        positive(capacityKg) &&
          capacityKg > retainedKg &&
          Number.isFinite(baseM) &&
          Number.isFinite(baseM + spacing[1]) &&
          baseM + spacing[1] > baseM,
        "representable capacity and physical height",
      );
      return {
        id,
        at: input.at,
        kind: input.kind,
        soil,
        volumeM3,
        capacityKg,
        retainedKg,
        baseM,
      };
    })
    .sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
}
function compileFaces(inputs, nodes, spacing) {
  array(inputs, 6144, "water openings");
  const index = new Map(nodes.map((node, i) => [node.id, i])),
    seen = new Set();
  return inputs
    .map((input) => {
      record(input, ["a", "b", "openFraction"], "water face");
      coordinate(input.a);
      coordinate(input.b);
      const a = index.get(cellId(input.a)),
        b = index.get(cellId(input.b));
      check(
        a !== undefined && b !== undefined,
        "face endpoints belong to this field",
      );
      const distance = input.a.map((n, i) => Math.abs(n - input.b[i]));
      check(
        distance.reduce((sum, n) => sum + n, 0) === 1,
        "one actual voxel face, no diagonal or teleport edge",
      );
      check(
        positive(input.openFraction) && input.openFraction <= 1,
        "positive physical opening fraction",
      );
      const axis = distance.indexOf(1),
        anchor = input.a.map((n, i) => Math.max(n, input.b[i]));
      const id = `${"xyz"[axis]}:${anchor.join(",")}`;
      check(!seen.has(id), "one owner per physical face");
      seen.add(id);
      const areaM2 =
        (spacing.reduce((volume, n) => volume * n, 1) / spacing[axis]) *
        input.openFraction;
      check(positive(areaM2), "finite physical face area");
      return {
        id,
        a: Math.min(a, b),
        b: Math.max(a, b),
        axis,
        openFraction: input.openFraction,
        areaM2,
      };
    })
    .sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
}

/** Definitions contain actual 3D cells and admitted openings. No pit, map,
 * elevation whitelist, implied exterior or material-name interpretation. */
export function compileWater(raw) {
  const input = copyData(raw);
  record(
    input,
    [
      "id",
      "revision",
      "spacingM",
      "soils",
      "cells",
      "faces",
      "fallMPerS",
      "spreadMPerS",
    ],
    "water definition",
  );
  check(
    typeof input.id === "string" &&
      input.id.length > 0 &&
      input.id.length <= 160,
    "field definition ID",
  );
  check(
    Number.isSafeInteger(input.revision) && input.revision >= 0,
    "field geometry revision",
  );
  array(input.spacingM, 3, "field spacing");
  check(
    input.spacingM.length === 3 && input.spacingM.every(positive),
    "finite physical voxel spacing",
  );
  check(
    rate(input.fallMPerS) && rate(input.spreadMPerS),
    "declared game flow rates",
  );
  const soils = soilDefinitions(input.soils),
    nodes = compileCells(input.cells, soils, input.spacingM);
  const faces = compileFaces(input.faces, nodes, input.spacingM);
  const definition = freeze({
    ...input,
    soils: [...input.soils].sort((a, b) =>
      a.id < b.id ? -1 : a.id > b.id ? 1 : 0,
    ),
    cells: nodes.map((node) =>
      node.kind === "soil"
        ? { at: node.at, kind: "soil", soilId: node.soil.id }
        : { at: node.at, kind: "void" },
    ),
    faces: faces.map((face) => ({
      a: nodes[face.a].at,
      b: nodes[face.b].at,
      openFraction: face.openFraction,
    })),
  });
  const identity = encode(
    { version: "finite-voxel-water-v1", definition },
    WIRE_BYTES,
  );
  // The exact escaped identity dominates the wire. Every remaining state field
  // is a fixed key or finite IEEE number (well below32 UTF-8 bytes). This bound
  // admits ALL future valid stocks without serializing a static definition on
  // every field step. The actual encode still enforces its own byte budget.
  const identityBytes = new TextEncoder().encode(
    JSON.stringify(identity),
  ).length;
  check(
    identityBytes + nodes.length * 33 + 1024 <= WIRE_BYTES,
    "complete water state fits the wire budget",
  );
  return {
    definition,
    identity,
    nodes: freeze(nodes),
    faces: freeze(faces),
    index: new Map(nodes.map((node, i) => [node.id, i])),
  };
}
