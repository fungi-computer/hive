import { fixtureTerrainFaces } from "./terrain-fixture-coverage.js";
import { camera as artCamera } from "../../../src/art/prop-camera.js";
import { captureVisualVolume, translateVisualVolume } from "../../../src/art/ordering-geometry.js";
import { figure } from "../../../src/art/figures.js";
import { uprightDrawGeometry } from "./upright-draw-geometry.js";
import { worldVisualVolume, uprightTextureGeometry } from "./asset-draw-geometry.js";
import { building } from "../../../src/art/home.js";
import { waterDrawRecord } from "./cut-terrain-layer.js";
import { createOrderingProjection } from "./ordering-projection.js";
import { transformBakedPartPoint, transformedPartGeometry } from "./multipart-visual-owner.js";
import { multipartSubjectDrawRecords, ordinarySubjectDrawRecord, subjectDrawGeometry } from "./subject-draw-records.js";
import { placementFootprintCells, placementGuideTiles } from "./placement-preview.js";
import { createTerrainFaceAppearance } from "./terrain-face-appearance.js";
import { projectedBounds, terrainCoverRecords, terrainFaceRecords } from "./terrain-visibility.js";
import { DEFAULT_VISUAL_BINDINGS } from "./visual-bindings.js";
import { resolveStaticVisualParts } from "./visual-resolver.js";
import { createVisibleHitArea, visibleHitAreaFor } from "../../../src/visual-hit-geometry.js";

export const MIXED_FIXTURE_ORIENTATIONS = Object.freeze(["north", "east", "south", "west"]);
const ORIENTATION_TURNS = Object.freeze({ north: 0, east: 1, south: 2, west: 3 });
const VERTICAL_METRES = 0.54;
const BOUNDS = Object.freeze({ minX: -4, maxX: 5, minY: -3, maxY: 4, minZ: -4, maxZ: 5 });

function projectionFor(orientation) {
  const turns = ORIENTATION_TURNS[orientation];
  if (turns === undefined) throw new Error("unknown mixed fixture orientation");
  const camera = artCamera(640, 400, 1.03, 256);
  const radiusX = Math.abs(camera.position.x),
    radiusZ = Math.abs(camera.position.z);
  const signs = [
    [1, 1],
    [-1, 1],
    [-1, -1],
    [1, -1],
  ][turns];
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
  for (let x = BOUNDS.minX; x < BOUNDS.maxX; x++)
    for (let z = BOUNDS.minZ; z < BOUNDS.maxZ; z++)
      for (let y = BOUNDS.minY; y < BOUNDS.maxY; y++) {
        const chunkKey = [Math.floor(x / 8), Math.floor(y / 8), Math.floor(z / 8)],
          id = chunkKey.join(",");
        let chunk = chunks.get(id);
        if (!chunk) {
          chunk = {
            key: chunkKey,
            min: [Math.max(BOUNDS.minX, chunkKey[0] * 8), Math.max(BOUNDS.minY, chunkKey[1] * 8), Math.max(BOUNDS.minZ, chunkKey[2] * 8)],
            max: [
              Math.min(BOUNDS.maxX, (chunkKey[0] + 1) * 8),
              Math.min(BOUNDS.maxY, (chunkKey[1] + 1) * 8),
              Math.min(BOUNDS.maxZ, (chunkKey[2] + 1) * 8),
            ],
            columns: [],
          };
          chunks.set(id, chunk);
        }
        let column = chunk.columns.find((candidate) => candidate.x === x && candidate.z === z);
        if (!column) {
          column = { x, z, runs: [] };
          chunk.columns.push(column);
        }
        const material = materialAt(x, y, z),
          previous = column.runs.at(-1);
        if (previous?.material === material) previous.maxY = y + 1;
        else column.runs.push({ minY: y, maxY: y + 1, material });
      }
  return {
    chunks: [...chunks.values()],
    palette: [
      { slot: 7, solid: false },
      { slot: 1, solid: true, art: "earth" },
      { slot: 2, solid: true, art: "stone" },
    ],
    bounds: BOUNDS,
    verticalMetres: VERTICAL_METRES,
    variantSeed: 41,
    epoch: 1,
    terrainRevision: 1,
  };
}

function terrainAppearance(pack, turn) {
  if (pack) return createTerrainFaceAppearance({ pack, turn });
  // Synthetic ink belongs only to this no-art fixture pack.
  const hitArea = createVisibleHitArea({ width: 64, height: 64,
    rows: Array.from({ length: 65 }, (_, y) => y),
    spans: Array.from({ length: 64 }, () => [24, 39]).flat() }, { x: .5, y: .5 });
  const batch = (texture) => ({ texture, uvs: [0, 0, 0, 1, 1, 1, 1, 0], blendMode: "normal" });
  return createTerrainFaceAppearance({
    pack: { body: ({ art, face }) => batch(`${art}.${face}`), cover: ({ kind, height, mask }) => ({ ...batch(`${kind}.${height}.${mask}`), hitArea }) },
    turn,
  });
}

function actorRecord(id, point, projection, fixturePosition, { visual = "goblin.worker", support = null, art, turn = 0 } = {}) {
  const at = projection.project(point);
  const subject = { id, ...point, screen: at, support };
  const display = { x: at.x, y: at.y },
    sprite = { x: 0, y: 0 };
  const binding = DEFAULT_VISUAL_BINDINGS[visual];
  const texture = art?.figures?.[binding.key]?.idle?.[turn]?.[0] ?? { width: 16, height: 32 };
  const anchor = art?.pawnAnchor ?? { x: 0.5, y: 1 };
  const hitArea = art ? visibleHitAreaFor(texture, anchor) : undefined;
  const geometry = subjectDrawGeometry({ subject, binding, texture, anchor, hitArea, verticalMetres: VERTICAL_METRES });
  return Object.freeze({
    ...ordinarySubjectDrawRecord({ subject, binding: DEFAULT_VISUAL_BINDINGS[visual], geometry, display, sprite }),
    fixturePosition,
    visual,
    support: support ? { id: support, part: "surface", point } : undefined,
    supportY: point.y,
    orderGeometry: art ? uprightTextureGeometry(texture, anchor, at, point, projection) : sourceActorGeometry(point, projection),
    ...(art ? { texture, anchor, displayPoint: geometry.screen } : {}),
  });
}

function sourceActorGeometry(point, projection) {
  const source = figure("goblin-worker", 0, 0, "idle");
  try {
    return uprightDrawGeometry(translateVisualVolume(captureVisualVolume(source, { silhouette: true }), point), point, projection);
  } finally {
    source.traverse((node) => node.geometry?.dispose());
  }
}

function structureRecord(id, footprint, projection, extra = {}) {
  const projected = footprint.map((point) => projection.project(point));
  return Object.freeze({
    id,
    role: "structure",
    orderingKind: footprint.length > 1 ? "line" : "compact",
    footprint: Object.freeze(footprint),
    screenBounds: Object.freeze(projectedBounds(projected)),
    pickable: true,
    visible: true,
    ...extra,
  });
}

function stairRecords(orientation, projection, art, turn) {
  const facing = ORIENTATION_TURNS[orientation],
    origin = { x: -3, y: VERTICAL_METRES / 2, z: 2 };
  const resolved = art && resolveStaticVisualParts(art, DEFAULT_VISUAL_BINDINGS["colony.stair.finished"], (facing + turn) % 4);
  const source = building("stair", "finished", facing);
  try {
    const parts = resolved?.parts ?? source.userData.staticParts;
    const displayPoint = projection.project(origin);
    return multipartSubjectDrawRecords(
      parts.map((part) =>
        structureRecord(
          "fixture:stair",
          transformedPartGeometry(part, (point) => transformBakedPartPoint(point, facing, origin)),
          projection,
          {
            part: part.id,
            role: part.role,
            target: "fixture:stair",
            compositePartition: "fixture:stair",
            supportY: origin.y,
            orderGeometry: art
              ? worldVisualVolume(art.orderingByTexture.get(part.texture), origin, turn)
              : translateVisualVolume(captureVisualVolume(source.userData.staticParts.find((p) => p.id === part.id).group), origin),
            ...(part.role === "supporting-surface"
              ? { contactSurface: part.geometry.footprint.map(([x, y, z]) => transformBakedPartPoint({ x, y, z }, facing, origin)) }
              : {}),
            ...(art
              ? { texture: part.texture, anchor: resolved.anchor, hitArea: visibleHitAreaFor(part.texture, resolved.anchor), displayPoint }
              : {}),
          },
        ),
      ),
    );
  } finally {
    source?.traverse((object) => object.geometry?.dispose());
  }
}

function bedRecord(orientation, projection, art, turn) {
  const facing = ORIENTATION_TURNS[orientation],
    origin = { x: 2, y: 0.5 * VERTICAL_METRES, z: -1 };
  const source = building("bed", "finished", facing);
  try {
    const binding = DEFAULT_VISUAL_BINDINGS["colony.bed.finished"];
    // Texture facing includes the camera; physical placement remains world-local.
    const resolved = art && resolveStaticVisualParts(art, binding, (facing + turn) % 4);
    const screen = projection.project(origin);
    const subject = {
      id: "fixture:bed",
      ...origin,
      screen,
      facing,
      // This is the same two-cell footprint compiled by TimberBedActor. The
      // authored bake datum below must agree or resolution rejects the fixture.
      placement: {
        kind: "footprint",
        footprint: [
          [0, 0],
          [0, 1],
        ],
        orientation,
      },
    };
    const geometry = subjectDrawGeometry({
      subject,
      binding,
      texture: resolved?.texture ?? { width: 32, height: 32 },
      anchor: resolved?.anchor ?? { x: 0.5, y: 1 },
      artPlacement: art ? art.placementByTexture.get(resolved.texture) : source.userData.staticPlacement,
      cameraTurn: art ? turn : 0,
      verticalMetres: VERTICAL_METRES,
      project: (x, y, z) => projection.project({ x, y, z }),
      ...(resolved ? { hitArea: visibleHitAreaFor(resolved.texture, resolved.anchor) } : {}),
    });
    return Object.freeze({
      ...ordinarySubjectDrawRecord({
        subject,
        binding,
        geometry,
        display: { x: screen.x, y: screen.y },
        sprite: { x: geometry.screenOffset[0], y: geometry.screenOffset[1] },
      }),
      orderGeometry: art
        ? worldVisualVolume(
            art.orderingByTexture.get(resolved.texture),
            { x: origin.x + geometry.offset[0], y: origin.y, z: origin.z + geometry.offset[1] },
            turn,
          )
        : translateVisualVolume(captureVisualVolume(source), {
            x: origin.x + geometry.offset[0],
            y: origin.y,
            z: origin.z + geometry.offset[1],
          }),
      supportY: origin.y,
      placement: geometry.resolvedPlacement,
      visual: "colony.bed.finished",
      ...(resolved ? { texture: resolved.texture, anchor: resolved.anchor, displayPoint: geometry.screen } : {}),
    });
  } finally {
    source.traverse((object) => object.geometry?.dispose());
  }
}

function guideFixture(orientation, projection) {
  const cells = placementFootprintCells(
    {
      footprint: [
        [0, 0],
        [0, 1],
      ],
      input: { orientation },
    },
    [2, 0, -1],
  );
  const tiles = placementGuideTiles({
    hoveredCell: [2, 0, -1],
    planeY: 0,
    footprintCells: cells,
    radius: 3,
    verticalMetres: VERTICAL_METRES,
    project: (x, y, z) => projection.project({ x, y, z }),
  });
  return Object.freeze({ kind: "build-guide", cells: Object.freeze(cells), tiles });
}

/**
 * Real producer fixture for spatial ordering. It returns unsorted geometry,
 * original-art identity and canonical support facts; no labelled depth answer.
 */
export function createMixedRenderFixture(cameraOrientation = "north", objectOrientation = "north", { art, terrainPack } = {}) {
  const projection = projectionFor(cameraOrientation),
    appearance = terrainAppearance(terrainPack, ORIENTATION_TURNS[cameraOrientation]);
  const coverage = fixtureTerrainFaces(terrainSnapshot(), 1);
  const terrain = terrainFaceRecords(coverage, { projection, appearance }).map((record) => ({
    ...record,
    orderGeometry: { kind: "face", points: record.planarCorners },
  }));
  const grassSurfaces = [
    [1, 0, 1, "full"],
    [2, 0, 1, "full"],
    [1, 0, 2, "full"],
    [2, 0, 2, "full"],
    [3, 0, 2, "short"],
  ].map(([x, y, z, height]) => ({ cell: [x, y, z], material: x === 2 ? 2 : 1, cover: { kind: "grass", condition: "green", height } }));
  const patches = terrainCoverRecords(grassSurfaces, {
    level: 1,
    projection,
    appearance,
    verticalMetres: VERTICAL_METRES,
    variantSeed: 41,
  });
  const grass = patches;
  const turn = ORIENTATION_TURNS[cameraOrientation];
  const stairs = stairRecords(objectOrientation, projection, art, turn),
    bed = bedRecord(objectOrientation, projection, art, turn);
  const stairSurface = stairs.find((record) => record.part === "surface");
  const midpoint = (a, b) => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2, z: (a.z + b.z) / 2 });
  const [entrance, landing] = [
    midpoint(stairSurface.footprint[0], stairSurface.footprint[1]),
    midpoint(stairSurface.footprint[2], stairSurface.footprint[3]),
  ];
  const middle = { x: (entrance.x + landing.x) / 2, y: (entrance.y + landing.y) / 2, z: (entrance.z + landing.z) / 2 };
  const [bedStart, bedEnd] = bed.footprint;
  const bedDx = bedEnd.x - bedStart.x,
    bedDz = bedEnd.z - bedStart.z;
  const bedLength = Math.hypot(bedDx, bedDz) || 1;
  const along = { x: bedDx / bedLength, z: bedDz / bedLength };
  const across = { x: -along.z, z: along.x };
  const bedMiddle = { x: (bedStart.x + bedEnd.x) / 2, y: bedStart.y, z: (bedStart.z + bedEnd.z) / 2 };
  const actors = [
    actorRecord("fixture:goblin", { x: 0, y: VERTICAL_METRES / 2, z: -3 }, projection, "ground", { art, turn }),
    actorRecord("fixture:goblin:stair-entrance", entrance, projection, "stair-entrance", { support: "fixture:stair", art, turn }),
    actorRecord("fixture:goblin:stair-middle", middle, projection, "stair-middle", { support: "fixture:stair", art, turn }),
    actorRecord("fixture:goblin:stair-landing", landing, projection, "stair-landing", { support: "fixture:stair", art, turn }),
    actorRecord(
      "fixture:goblin:bed-end-start",
      { x: bedStart.x - along.x * 1.2, y: bedStart.y, z: bedStart.z - along.z * 1.2 },
      projection,
      "bed-end-start",
      { art, turn },
    ),
    actorRecord(
      "fixture:goblin:bed-end-finish",
      { x: bedEnd.x + along.x * 1.2, y: bedEnd.y, z: bedEnd.z + along.z * 1.2 },
      projection,
      "bed-end-finish",
      { art, turn },
    ),
    actorRecord(
      "fixture:goblin:bed-side-left",
      { x: bedMiddle.x + across.x * 1.2, y: bedMiddle.y, z: bedMiddle.z + across.z * 1.2 },
      projection,
      "bed-side-left",
      { art, turn },
    ),
    actorRecord(
      "fixture:goblin:bed-side-right",
      { x: bedMiddle.x - across.x * 1.2, y: bedMiddle.y, z: bedMiddle.z - across.z * 1.2 },
      projection,
      "bed-side-right",
      { art, turn },
    ),
  ];
  const water = [
    waterDrawRecord(
      { at: [0, -1, 0], level: 7, liquidVolumeM3: 1 },
      { projection: (x, y, z) => projection.project({ x, y, z }), verticalMetres: VERTICAL_METRES },
    ),
  ];
  const rawGuide = guideFixture(objectOrientation, projection);
  const guide = {
    ...rawGuide,
    tiles: rawGuide.tiles.map((record) => ({ ...record, orderGeometry: { kind: "face", points: record.worldCorners }, surfaceOrder: 2 })),
  };
  for (let i = 0; i < water.length; i++)
    water[i] = {
      ...water[i],
      orderGeometry: {
        kind: "face",
        points: [
          [-0.5, -0.5],
          [-0.5, 0.5],
          [0.5, 0.5],
          [0.5, -0.5],
        ].map(([dx, dz]) => ({ x: water[i].footprint[0].x + dx, y: water[i].footprint[0].y, z: water[i].footprint[0].z + dz })),
      },
      surfaceOrder: 1,
    };
  const input = Object.freeze([...terrain, ...grass, ...stairs, bed, ...actors, ...water, ...guide.tiles]);
  return Object.freeze({
    cameraOrientation,
    objectOrientation,
    projection,
    verticalMetres: VERTICAL_METRES,
    terrain,
    grassSurfaces: Object.freeze(grassSurfaces),
    grass,
    stairs,
    bed,
    actors: Object.freeze(actors),
    water: Object.freeze(water),
    guide,
    input,
    reversedInput: Object.freeze([...input].reverse()),
  });
}
