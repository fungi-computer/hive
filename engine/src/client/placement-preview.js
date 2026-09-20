import { placementOrientation } from "../sdk/placement.ts";
import { evaluateDesignation } from "./spatial-designation.js";
import { rotatePlacementPoint } from "./art-placement.js";

/** Own one advisory preview generation so an older async reply cannot repaint a newer gesture. */
export function createPlacementAdvisory(decide, publish) {
  let generation = 0;
  let currentKey = null;
  return {
    clear() { generation++; currentKey = null; publish(null); },
    request(key, query, count) {
      if (currentKey === key) return;
      currentKey = key;
      const requestGeneration = ++generation;
      publish({ key, status: "checking", count });
      Promise.resolve(decide(query)).then((result) => {
        if (requestGeneration !== generation || currentKey !== key) return;
        const rejected = result.decisions.find((decision) => decision.status === "rejected");
        publish(rejected
          ? { key, status: "rejected", reason: rejected.reason, count, revision: result.observationRevision, placementRevision: result.placementRevision }
          : { key, status: "ready", count, revision: result.observationRevision, placementRevision: result.placementRevision });
      }, (error) => {
        if (requestGeneration !== generation || currentKey !== key) return;
        publish({ key, status: "rejected", reason: error instanceof Error ? error.message : String(error), count });
      });
    },
  };
}


/** Build the exact cells a placement gesture owns. No admission is inferred. */
export function placementCells({ area, target }) {
  if (area?.start && area.current) {
    const result = evaluateDesignation(area.mode, area.start, area.current, 256);
    return result.accepted ? result.designation.cells : [];
  }
  return target ? [target] : [];
}

/** Expand one object origin for display without creating extra construction targets. */
export function placementFootprintCells(control, origin) {
  if (!origin) return [];
  const footprint = control?.footprint;
  if (!Array.isArray(footprint) || footprint.length === 0) return [origin];
  const orientation = control?.input?.orientation ?? "north";
  return footprint.map(point => {
    const [dx, dz] = rotatePlacementPoint(point, orientation);
    return [origin[0] + dx, origin[1], origin[2] + dz];
  });
}

/** Canonical selected-plane guide tiles. Drawing may change; their world cells do not. */
export function placementGuideTiles({ hoveredCell, planeY, footprintCells = [], radius = 3, verticalMetres, project }) {
  if (!Array.isArray(hoveredCell) || hoveredCell.length !== 3 || !hoveredCell.every(Number.isFinite)) return [];
  if (!Number.isSafeInteger(planeY) || !Number.isSafeInteger(radius) || radius < 0 || !(verticalMetres > 0) || typeof project !== "function")
    throw new Error("invalid placement guide");
  const footprint = new Set(footprintCells.map(cell => cell.join(",")));
  const result = [];
  for (let dz = -radius; dz <= radius; dz++) for (let dx = -radius; dx <= radius; dx++) {
    const cell = [hoveredCell[0] + dx, planeY, hoveredCell[2] + dz];
    const height = (planeY + 0.5) * verticalMetres;
    const worldCorners = [
      { x: cell[0] - 0.5, y: height, z: cell[2] - 0.5 },
      { x: cell[0] + 0.5, y: height, z: cell[2] - 0.5 },
      { x: cell[0] + 0.5, y: height, z: cell[2] + 0.5 },
      { x: cell[0] - 0.5, y: height, z: cell[2] + 0.5 },
    ];
    const projected = worldCorners.map(point => Object.freeze(project(point.x, point.y, point.z)));
    result.push(Object.freeze({
      id: `placement-guide:${cell.join(":")}`,
      part: "tile",
      role: "build-guide",
      renderPass: "opaque",
      attachment: Object.freeze({ kind: "surface-mark", cell: Object.freeze([...cell]) }),
      cell: Object.freeze(cell),
      worldCorners: Object.freeze(worldCorners),
      orderGeometry: { kind: "face", points: worldCorners },
      surfaceOrder: 2,
      footprint: Object.freeze(worldCorners),
      projected: Object.freeze(projected),
      screenBounds: Object.freeze({ left: Math.min(...projected.map(point => point.x)), right: Math.max(...projected.map(point => point.x)),
        top: Math.min(...projected.map(point => point.y)), bottom: Math.max(...projected.map(point => point.y)) }),
      pickable: false,
      visible: true,
      hovered: hoveredCell.every((value, index) => value === cell[index]),
      isFootprint: footprint.has(cell.join(",")),
    }));
  }
  return Object.freeze(result);
}

/** Draw one already-projected guide tile. The world cell remains owned by the
 * placement record; this helper only owns the established Pixi appearance. */
export function drawPlacementGuideTile(graphic, tile, { transform = point => point, status } = {}) {
  const points = tile.projected.flatMap(point => {
    const next = transform(point);
    return [next.x, next.y];
  });
  const rejected = tile.isFootprint && status === "rejected";
  const color = rejected ? 0xe47c72 : tile.isFootprint || tile.hovered ? 0xe8c779 : 0x9fd8ff;
  graphic.poly(points).fill({ color, alpha: tile.isFootprint || tile.hovered ? 0.3 : 0.12 })
    .stroke({ color, width: tile.isFootprint ? 2 : 1, alpha: 0.9 });
  return graphic;
}

/**
 * Resolve ordinary cell-placement art. Edge placement owns a different
 * acquisition shape and never reconstructs physical edges from visual names.
 */
export function placementVisualSpec(control, cells, placementVisuals, area) {
  const catalog = control?.input?.catalog;
  const definition = catalog === undefined ? undefined : placementVisuals?.[catalog];
  const orientation = placementOrientation(definition?.alignment ?? "fixed", area, control?.input?.orientation);
  const facing = definition?.facing[orientation] ?? 0;
  return { visual: definition?.visual, facing, cells,
    ...(definition?.datum ? { placement: { ...definition.datum, orientation } } : {}) };
}
