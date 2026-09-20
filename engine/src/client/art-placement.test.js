import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { Matrix4, Vector3 } from "three";
import { building } from "../../../src/art/home.js";
import { captureVisualVolume } from "../../../src/art/ordering-geometry.js";
import { parseStaticArtManifest, STATIC_ART_DIRECTORY } from "../../../src/art/static-manifest.js";
import { colonyConstructionVisuals } from "../games/colony-construction-visuals.ts";
import { resolveWorldArtPlacement, rotatePlacementPoint } from "./art-placement.js";

const manifest = parseStaticArtManifest(JSON.parse(readFileSync(`public/${STATIC_ART_DIRECTORY}/manifest.json`)));
const orientations = ["north", "east", "south", "west"];
const close = (actual, expected, label) => {
  assert.equal(actual.length, expected.length, label);
  actual.forEach((value, i) => assert(Math.abs(value - expected[i]) < 1e-7, `${label}: ${actual} != ${expected}`));
};
const xyz = p => [p.x, p.y, p.z];
const visualFor = (catalog, orientation) => colonyConstructionVisuals({ query: () => [{ id: catalog,
  get: () => ({ catalog, targetKind: "cell", targetX: 3, targetY: 14, targetZ: -2, targetDirection: orientation, phase: "finished", seconds: 4 }) }] })[0];
const entryFor = (type, facing) => manifest.entries.find(entry => JSON.stringify(entry.path) === JSON.stringify(["buildings", type, "finished", facing]));
const undoCamera = (point, turn) => new Vector3(...point).applyMatrix4(new Matrix4().makeRotationY(-turn * Math.PI / 2));
const placePoint = (point, facing, turn, pivot, offset) => {
  const p = new Vector3(...point).sub(new Vector3(...pivot));
  p.applyMatrix4(new Matrix4().makeRotationY((facing + turn) * Math.PI / 2)).add(new Vector3(...pivot));
  p.applyMatrix4(new Matrix4().makeRotationY(-turn * Math.PI / 2));
  return [p.x + offset[0], p.y, p.z + offset[1]];
};

test("bed and brewer actual source/baked frames align physical cells for every orientation and camera", () => {
  for (const [type, catalog] of [["bed", "timber-bed"], ["brew-station", "brew-station"]]) {
    for (const orientation of orientations) {
      const visual = visualFor(catalog, orientation), physicalFacing = visual.pose.facing;
      const expected = visual.placement.footprint.map(cell => rotatePlacementPoint(cell, orientation));
      let baseline;
      for (let cameraTurn = 0; cameraTurn < 4; cameraTurn++) {
        const viewFacing = (physicalFacing + cameraTurn) % 4;
        const entry = entryFor(type, viewFacing), source = building(type, "finished", viewFacing);
        try {
          assert.deepEqual(entry.placement, source.userData.staticPlacement);
          const captured = captureVisualVolume(source);
          close(xyz(captured.min), xyz(entry.ordering.min), `${type} source min`);
          close(xyz(captured.max), xyz(entry.ordering.max), `${type} source max`);
          const resolved = resolveWorldArtPlacement({ subjectPlacement: visual.placement, artPlacement: entry.placement, orientation, physicalFacing, cameraTurn });
          const [px, pz] = entry.placement.rotationPivot;
          for (const [x, z] of entry.placement.bakedFootprint) {
            const [wx, , wz] = placePoint([x, 0, z], physicalFacing, cameraTurn, [px, 0, pz], resolved.offset);
            assert(expected.some(cell => Math.abs(cell[0] - wx) < 1e-7 && Math.abs(cell[1] - wz) < 1e-7), `${type}:${orientation}:${cameraTurn} actual authored cell`);
          }
          const corners = [];
          for (const x of [captured.min.x, captured.max.x]) for (const z of [captured.min.z, captured.max.z]) {
            const world = undoCamera([x, 0, z], cameraTurn);
            corners.push([world.x + resolved.offset[0], world.z + resolved.offset[1]]);
          }
          const bounds = [Math.min(...corners.map(p=>p[0])), Math.max(...corners.map(p=>p[0])), Math.min(...corners.map(p=>p[1])), Math.max(...corners.map(p=>p[1]))];
          baseline ??= bounds;
          close(bounds, baseline, `${type}:${orientation} camera-invariant physical visual bounds`);
        } finally { source.traverse(object => object.geometry?.dispose()); }
      }
    }
  }
});

test("stair actual authored contact endpoints match physical direction for every camera", () => {
  for (const orientation of orientations) {
    const visual = visualFor("timber-stair", orientation), physicalFacing = visual.pose.facing;
    const physicalLanding = rotatePlacementPoint([0, -2], orientation);
    for (let cameraTurn = 0; cameraTurn < 4; cameraTurn++) {
      const viewFacing = (physicalFacing + cameraTurn) % 4, source = building("stair", "finished", viewFacing);
      try {
        const entry = entryFor("stair", viewFacing), authored = source.userData.staticParts.find(p=>p.id === "surface");
        assert.deepEqual(entry.placement, source.userData.staticPlacement);
        const end = authored.geometry.footprint.slice(2);
        const actualLanding = [0,1,2].map(axis => (end[0][axis] + end[1][axis]) / 2);
        assert.deepEqual(entry.placement.landing, actualLanding);
        const result = resolveWorldArtPlacement({ subjectPlacement: visual.placement, artPlacement: entry.placement, orientation, physicalFacing, cameraTurn });
        close(result.landing, [physicalLanding[0], 2.16, physicalLanding[1]], `${orientation} physical landing`);
        close(placePoint(actualLanding, physicalFacing, cameraTurn, [0,0,0], result.offset), result.landing, `${orientation} actual art landing`);
        close(result.entrance, [0,0,0], "entrance");
      } finally { source.traverse(object => object.geometry?.dispose()); }
    }
  }
});

test("placement rejects missing view coordinates, incompatible footprint and wrong stair facing", () => {
  const bed = visualFor("timber-bed", "east"), entry = entryFor("bed", 1);
  const input = { subjectPlacement: bed.placement, artPlacement: entry.placement, orientation: "east", physicalFacing: 1, cameraTurn: 0 };
  assert.throws(() => resolveWorldArtPlacement({...input, physicalFacing: undefined}), /orientation/);
  assert.throws(() => resolveWorldArtPlacement({...input, cameraTurn: undefined}), /orientation/);
  assert.throws(() => resolveWorldArtPlacement({...input, physicalFacing: 0}), /footprint does not match/);
  const stair = visualFor("timber-stair", "north");
  assert.throws(() => resolveWorldArtPlacement({subjectPlacement:stair.placement,artPlacement:entryFor("stair",0).placement,orientation:"north",physicalFacing:0,cameraTurn:0}), /endpoints do not match/);
});

test("edge placement stays at its authoritative midpoint without a facing datum", () => {
  for (const axis of ["x", "z"]) {
    const result = resolveWorldArtPlacement({subjectPlacement:{kind:"edge",edge:{axis}}});
    assert.deepEqual(result.offset,[0,0]);
    assert.deepEqual(result.endpoints,axis === "x" ? [[0,-.5],[0,.5]] : [[-.5,0],[.5,0]]);
  }
});
