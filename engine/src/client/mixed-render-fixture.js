import { camera as artCamera } from "../../../src/art/prop-camera.js";
import { building } from "../../../src/art/home.js";
import { waterDrawRecord } from "./cut-terrain-layer.js";
import { createOrderingProjection } from "./ordering-projection.js";
import { transformBakedPartPoint, transformedPartGeometry } from "./multipart-visual-owner.js";
import { multipartSubjectDrawRecords, ordinarySubjectDrawRecord, subjectDrawGeometry } from "./subject-draw-records.js";
import { placementFootprintCells, placementGuideTiles } from "./placement-preview.js";
import { createTerrainFaceAppearance } from "./terrain-face-appearance.js";
import { materialCoverage, projectedBounds, terrainCoverRecords, terrainFaceRecords } from "./terrain-visibility.js";
import { DEFAULT_VISUAL_BINDINGS } from "./visual-bindings.js";
import { resolveStaticVisualParts } from "./visual-resolver.js";
import { visibleHitAreaFor } from "../../../src/visual-hit-geometry.js";

export const MIXED_FIXTURE_ORIENTATIONS = Object.freeze(["north", "east", "south", "west"]);
const ORIENTATION_TURNS = Object.freeze({ north: 0, east: 1, south: 2, west: 3 });
const VERTICAL_METRES = 0.54;
const BOUNDS = Object.freeze({ minX: -4, maxX: 5, minY: -3, maxY: 4, minZ: -4, maxZ: 5 });

function projectionFor(orientation) {
  const turns = ORIENTATION_TURNS[orientation];
  if (turns === undefined) throw new Error("unknown mixed fixture orientation");
  const camera = artCamera(640, 400, 1.03, 256);
  const radiusX = Math.abs(camera.position.x), radiusZ = Math.abs(camera.position.z);
  const signs = [[1, 1], [-1, 1], [-1, -1], [1, -1]][turns];
  camera.position.x = radiusX * signs[0];
  camera.position.z = radiusZ * signs[1];
  camera.lookAt(0, 1.03, 0);
  return createOrderingProjection(camera);
}

function terrainSnapshot() {
  const chunks = new Map();
  const materialAt = (x, y, z) => {
    if (x === -2 && z === -2) return y <= 2 ? 2 : 7; // solid above the cut: a cap
    if (x === 0 && z === 0) return y <= -2 ? 1 : 7; // exposed pit
    return y <= 0 ? (x >= 2 ? 2 : 1) : 7;
  };
  for (let x = BOUNDS.minX; x < BOUNDS.maxX; x++) for (let z = BOUNDS.minZ; z < BOUNDS.maxZ; z++)
    for (let y = BOUNDS.minY; y < BOUNDS.maxY; y++) {
      const chunkKey = [Math.floor(x / 8), Math.floor(y / 8), Math.floor(z / 8)], id = chunkKey.join(",");
      let chunk = chunks.get(id);
      if (!chunk) {
        chunk = { key: chunkKey, min: [Math.max(BOUNDS.minX, chunkKey[0] * 8), Math.max(BOUNDS.minY, chunkKey[1] * 8), Math.max(BOUNDS.minZ, chunkKey[2] * 8)],
          max: [Math.min(BOUNDS.maxX, (chunkKey[0] + 1) * 8), Math.min(BOUNDS.maxY, (chunkKey[1] + 1) * 8), Math.min(BOUNDS.maxZ, (chunkKey[2] + 1) * 8)], columns: [] };
        chunks.set(id, chunk);
      }
      let column = chunk.columns.find(candidate => candidate.x === x && candidate.z === z);
      if (!column) { column = { x, z, runs: [] }; chunk.columns.push(column); }
      const material = materialAt(x, y, z), previous = column.runs.at(-1);
      if (previous?.material === material) previous.maxY = y + 1;
      else column.runs.push({ minY: y, maxY: y + 1, material });
    }
  return { chunks: [...chunks.values()], palette: [
    { slot: 7, solid: false }, { slot: 1, solid: true, art: "earth" }, { slot: 2, solid: true, art: "stone" },
  ], bounds: BOUNDS, verticalMetres: VERTICAL_METRES, variantSeed: 41, epoch: 1, terrainRevision: 1 };
}

function terrainAppearance(pack) {
  if (pack) return createTerrainFaceAppearance({ pack });
  const batch = texture => ({ texture, uvs: [0,0,0,1,1,1,1,0], blendMode: "normal" });
  return createTerrainFaceAppearance({ pack: {
    body: ({ art, face }) => batch(`${art}.${face}`),
    cover: ({ kind, height, mask }) => batch(`${kind}.${height}.${mask}`),
  } });
}

function actorRecord(id, point, projection, fixturePosition, { visual = "goblin.worker", support = null, art } = {}) {
  const at = projection.project(point);
  const subject = { id, ...point, screen: at, support };
  const display = { x: at.x, y: at.y }, sprite = { x: 0, y: 0 };
  const binding = DEFAULT_VISUAL_BINDINGS[visual];
  const texture = art?.figures?.[binding.key]?.idle?.[0]?.[0] ?? { width: 16, height: 32 };
  const anchor = art?.pawnAnchor ?? { x: 0.5, y: 1 };
  const hitArea = art ? visibleHitAreaFor(texture, anchor) : undefined;
  const geometry = subjectDrawGeometry({ subject, binding, texture, anchor, hitArea, verticalMetres: VERTICAL_METRES });
  return Object.freeze({ ...ordinarySubjectDrawRecord({ subject, binding: DEFAULT_VISUAL_BINDINGS[visual], geometry, display, sprite }),
    fixturePosition, visual, support, ...(art ? { texture, anchor, displayPoint: geometry.screen } : {}) });
}

function structureRecord(id, footprint, projection, extra = {}) {
  const projected = footprint.map(point => projection.project(point));
  return Object.freeze({ id, role: "structure", orderingKind: footprint.length > 1 ? "line" : "compact",
    footprint: Object.freeze(footprint), screenBounds: Object.freeze(projectedBounds(projected)), pickable: true, visible: true, ...extra });
}

function stairRecords(orientation, projection, art) {
  const facing = ORIENTATION_TURNS[orientation], origin = { x: -1, y: VERTICAL_METRES / 2, z: 1 };
  const resolved = art && resolveStaticVisualParts(art, DEFAULT_VISUAL_BINDINGS["colony.stair.finished"], facing);
  const source = resolved?.parts?.length ? null : building("stair", "finished", facing);
  try {
    const parts = resolved?.parts ?? source.userData.staticParts;
    const displayPoint = projection.project(origin);
    return multipartSubjectDrawRecords(parts.map(part => structureRecord("fixture:stair", transformedPartGeometry(part,
      point => transformBakedPartPoint(point, facing, origin)), projection,
    { part: part.id, role: part.role, target: "fixture:stair", ...(art ? { texture: part.texture, anchor: resolved.anchor,
      hitArea: visibleHitAreaFor(part.texture, resolved.anchor), displayPoint } : {}) })));
  } finally {
    source?.traverse(object => object.geometry?.dispose());
  }
}

function bedRecord(orientation, projection, art) {
  const facing = ORIENTATION_TURNS[orientation], origin = { x: 2, y: 1.5 * VERTICAL_METRES, z: -1 };
  const source = building("bed", "finished", facing);
  try {
    const binding = DEFAULT_VISUAL_BINDINGS["colony.bed.finished"];
    // Bed art is rotationally symmetric and the checked bank owns two views.
    const resolved = art && resolveStaticVisualParts(art, binding, facing % 2);
    const screen = projection.project(origin);
    const subject = { id: "fixture:bed", ...origin, screen,
      // This is the same two-cell footprint compiled by TimberBedActor. The
      // authored bake datum below must agree or resolution rejects the fixture.
      placement: { kind: "footprint", footprint: [[0, 0], [0, 1]], orientation } };
    const geometry = subjectDrawGeometry({
      subject, binding, texture: resolved?.texture ?? { width: 32, height: 32 }, anchor: resolved?.anchor ?? { x: 0.5, y: 1 },
      artPlacement: source.userData.staticPlacement, verticalMetres: VERTICAL_METRES,
      project: (x, y, z) => projection.project({ x, y, z }),
      ...(resolved ? { hitArea: visibleHitAreaFor(resolved.texture, resolved.anchor) } : {}),
    });
    return Object.freeze({ ...ordinarySubjectDrawRecord({ subject, binding, geometry, display: { x: screen.x, y: screen.y }, sprite: { x: geometry.screenOffset[0], y: geometry.screenOffset[1] } }),
      placement: geometry.resolvedPlacement, visual: "colony.bed.finished",
      ...(resolved ? { texture: resolved.texture, anchor: resolved.anchor, displayPoint: geometry.screen } : {}) });
  } finally {
    source.traverse(object => object.geometry?.dispose());
  }
}

function guideFixture(orientation, projection) {
  const cells = placementFootprintCells({ footprint: [[0, 0], [0, 1]], input: { orientation } }, [2, 1, -1]);
  const tiles = placementGuideTiles({ hoveredCell: [2, 1, -1], planeY: 1, footprintCells: cells, radius: 3,
    verticalMetres: VERTICAL_METRES, project: (x, y, z) => projection.project({ x, y, z }) });
  return Object.freeze({ kind: "build-guide", cells: Object.freeze(cells), tiles });
}

/**
 * Real producer fixture for Stage 1A.  It deliberately returns unsorted facts:
 * Stage 1B must derive traversal from their XYZ/footprint/part facts and must
 * produce the same result when `input` is reversed.
 */
export function createMixedRenderFixture(cameraOrientation = "north", objectOrientation = "north", { art, terrainPack } = {}) {
  const projection = projectionFor(cameraOrientation), appearance = terrainAppearance(terrainPack);
  const coverage = materialCoverage(terrainSnapshot());
  const terrain = terrainFaceRecords(coverage, { level: 1, projection, appearance });
  // This names the current production seam honestly. Stage 2 migrates these
  // legacy surface cover inputs to ordinary grass actors without changing the
  // dual-grid visual records exercised here.
  const grassSurfaces = [[1,0,1,"full"],[2,0,1,"full"],[1,0,2,"full"],[2,0,2,"full"],[3,0,2,"short"]].map(([x,y,z,height]) =>
    ({ cell: [x,y,z], material: x === 2 ? 2 : 1, cover: { kind: "grass", condition: "green", height } }));
  const grass = terrainCoverRecords(grassSurfaces, { level: 1, projection, appearance, verticalMetres: VERTICAL_METRES, variantSeed: 41 });
  const stairs = stairRecords(objectOrientation, projection, art), bed = bedRecord(objectOrientation, projection, art);
  const stairSurface = stairs.find(record => record.part === "surface");
  const [entrance, landing] = [stairSurface.footprint[0], stairSurface.footprint[2]];
  const middle = { x: (entrance.x + landing.x) / 2, y: (entrance.y + landing.y) / 2, z: (entrance.z + landing.z) / 2 };
  const [bedStart, bedEnd] = bed.footprint;
  const bedDx = bedEnd.x - bedStart.x, bedDz = bedEnd.z - bedStart.z;
  const bedLength = Math.hypot(bedDx, bedDz) || 1;
  const along = { x: bedDx / bedLength, z: bedDz / bedLength };
  const across = { x: -along.z, z: along.x };
  const bedMiddle = { x: (bedStart.x + bedEnd.x) / 2, y: bedStart.y, z: (bedStart.z + bedEnd.z) / 2 };
  const actors = [
    actorRecord("fixture:goblin", { x: 1, y: VERTICAL_METRES / 2, z: -1 }, projection, "ground", { art }),
    actorRecord("fixture:goblin:stair-entrance", entrance, projection, "stair-entrance", { support: "fixture:stair", art }),
    actorRecord("fixture:goblin:stair-middle", middle, projection, "stair-middle", { support: "fixture:stair", art }),
    actorRecord("fixture:goblin:stair-landing", landing, projection, "stair-landing", { support: "fixture:stair", art }),
    actorRecord("fixture:goblin:bed-end-start", { x: bedStart.x - along.x * 0.6, y: bedStart.y, z: bedStart.z - along.z * 0.6 }, projection, "bed-end-start", { art }),
    actorRecord("fixture:goblin:bed-end-finish", { x: bedEnd.x + along.x * 0.6, y: bedEnd.y, z: bedEnd.z + along.z * 0.6 }, projection, "bed-end-finish", { art }),
    actorRecord("fixture:goblin:bed-side-left", { x: bedMiddle.x + across.x * 0.6, y: bedMiddle.y, z: bedMiddle.z + across.z * 0.6 }, projection, "bed-side-left", { art }),
    actorRecord("fixture:goblin:bed-side-right", { x: bedMiddle.x - across.x * 0.6, y: bedMiddle.y, z: bedMiddle.z - across.z * 0.6 }, projection, "bed-side-right", { art }),
  ];
  const water = [waterDrawRecord({ at: [1, -1, 0], level: 7, liquidVolumeM3: 1 }, { projection: (x, y, z) => projection.project({ x, y, z }), verticalMetres: VERTICAL_METRES })];
  const guide = guideFixture(objectOrientation, projection);
  const input = Object.freeze([...terrain, ...grass, ...stairs, bed, ...actors, ...water, ...guide.tiles]);
  return Object.freeze({ cameraOrientation, objectOrientation, projection, verticalMetres: VERTICAL_METRES, terrain, grassSurfaces: Object.freeze(grassSurfaces), grass,
    stairs, bed, actors: Object.freeze(actors), water: Object.freeze(water), guide,
    input, reversedInput: Object.freeze([...input].reverse()) });
}
