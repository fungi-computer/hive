import assert from "node:assert/strict";
import test from "node:test";
import { createAtmosphere } from "../engine/environment/atmosphere/index.ts";
import {
  GOBLIN_ATMOSPHERE_AMBIENT,
  GOBLIN_ATMOSPHERE_MODEL,
  goblinAtmosphereFromGeometry,
} from "./goblin-atmosphere.ts";

const geometry = {
  identity: "actual-void-field:1",
  revision: 1,
  cells: [
    { id: "lower-a", x: 0, y: 0.5, z: 0, freeVolumeM3: 0.75 },
    { id: "lower-b", x: 1, y: 0.5, z: 0, freeVolumeM3: 1 },
    { id: "upper", x: 0, y: 1.5, z: 0, freeVolumeM3: 1 },
    { id: "cave", x: 3, y: -1.5, z: 0, freeVolumeM3: 0.5 },
  ],
  openFaces: [
    { id: "lower-link", a: "lower-a", b: "lower-b", areaM2: 1, distanceM: 1 },
    { id: "shaft", a: "lower-a", b: "upper", areaM2: 1, distanceM: 1 },
    { id: "outside", a: "upper", b: null, areaM2: 1, distanceM: 0.5 },
  ],
};

test("physical faces create height bands without crossing intact cave surfaces", () => {
  const field = goblinAtmosphereFromGeometry(geometry, {
    regionId: "clearing",
  });
  assert.equal(field.definition.geometryIdentity, geometry.identity);
  assert.equal(field.volumeAt("lower-a"), field.volumeAt("lower-b"));
  assert.notEqual(field.volumeAt("lower-a"), field.volumeAt("upper"));
  assert.notEqual(field.volumeAt("lower-a"), field.volumeAt("cave"));
  assert.equal(field.definition.openings.length, 2);
  assert.equal(
    field.definition.volumes
      .flatMap((entry) => entry.members)
      .find((entry) => entry.cellId === "lower-a").volumeM3,
    0.75,
  );
});

test("fresh stock is an explicit caller operation and source positions resolve by cell", () => {
  const field = goblinAtmosphereFromGeometry(geometry, {
      regionId: "clearing",
      separatingFaceIds: new Set(["lower-link"]),
    }),
    owner = createAtmosphere(field.definition),
    density =
      GOBLIN_ATMOSPHERE_AMBIENT.pressurePa /
      (GOBLIN_ATMOSPHERE_MODEL.specificGasConstantJKgK *
        GOBLIN_ATMOSPHERE_AMBIENT.temperatureK),
    parcels = owner.definition.volumes.map((volume) => ({
      volumeId: volume.id,
      carrierKg:
        density * volume.members.reduce((sum, cell) => sum + cell.volumeM3, 0),
      smokeKg: 0,
      heatJ: 0,
    })),
    state = owner.initial(parcels),
    source = field.volumeAt("lower-a");
  assert.notEqual(source, field.volumeAt("lower-b"));
  assert.equal("initial" in field, false);
  assert.equal(owner.read(state).balance.carrierKg, 0);
});

test("geometry admission rejects accessors before reading them", () => {
  let reads = 0;
  const malformed = { ...geometry };
  Object.defineProperty(malformed, "cells", {
    enumerable: true,
    get() {
      reads++;
      return geometry.cells;
    },
  });
  assert.throws(
    () => goblinAtmosphereFromGeometry(malformed, { regionId: "clearing" }),
    /record|data/i,
  );
  assert.equal(reads, 0);
});

test("large open floors split into bounded local mixing bands", () => {
  const cells = Array.from({ length: 10 }, (_, x) => ({
      id: `floor:${x}`,
      x: x + 0.5,
      y: 0.5,
      z: 0.5,
      freeVolumeM3: 1,
    })),
    openFaces = cells.slice(1).map((cell, index) => ({
      id: `x:${index + 1}`,
      a: cells[index].id,
      b: cell.id,
      areaM2: 1,
      distanceM: 1,
    })),
    field = goblinAtmosphereFromGeometry(
      { identity: "wide-floor", revision: 0, cells, openFaces },
      { regionId: "clearing" },
    );
  assert.equal(field.definition.volumes.length, 2);
  assert.equal(field.definition.openings.length, 1);
  assert.notEqual(field.volumeAt("floor:0"), field.volumeAt("floor:9"));
});
