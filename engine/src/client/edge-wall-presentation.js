import { edgeJunctions } from "../sdk/edge-connections.ts";
import { canonicalEdges } from "./edge-gesture.js";

const STAGE_RANK = Object.freeze({ stakes: 0, frame: 1, finished: 2 });

function edgeSubject(subject, bindings) {
  const placement = subject?.placement;
  const edgeWall = bindings?.[subject?.visual]?.edgeWall;
  if (placement?.kind !== "edge" || edgeWall?.kind !== "segment") return null;
  if (edgeWall.axis !== placement.edge.axis || !(edgeWall.stage in STAGE_RANK))
    throw new Error("edge wall visual disagrees with its physical placement");
  return { id: subject.id, edge: placement.edge, stage: edgeWall.stage };
}

/** Client-only post sprites derived from visible canonical wall edges. */
export function edgeWallJunctionSubjects(subjects, bindings, verticalMetres) {
  if (!Number.isFinite(verticalMetres) || verticalMetres <= 0) throw new Error("edge wall presentation requires vertical metres");
  const rows = subjects.map(subject => edgeSubject(subject, bindings)).filter(Boolean);
  const byId = new Map(rows.map(row => [row.id, row]));
  return edgeJunctions(rows).map(junction => {
    const stage = junction.incident.map(id => byId.get(id)?.stage).filter(Boolean)
      .sort((left, right) => STAGE_RANK[right] - STAGE_RANK[left])[0];
    if (!stage) throw new Error("edge wall junction has no visible incident segment");
    return {
      id: junction.id,
      name: "Wall junction",
      x: junction.point[0],
      y: (junction.point[1] - 0.5) * verticalMetres,
      z: junction.point[2],
      facing: 0,
      visual: `colony.wall.junction.${stage}.${junction.mask}`,
      pickable: false,
      screen: { x: 0, y: 0 },
    };
  });
}

/** Finished connected art for the currently acquired edge stroke. */
export function edgeWallGhostSpec(edges, subjects, bindings, verticalMetres) {
  if (!Number.isFinite(verticalMetres) || verticalMetres <= 0) throw new Error("edge wall preview requires vertical metres");
  const proposed = canonicalEdges(edges).map((edge, index) => ({
    id: `preview.wall:${index}`,
    edge: { cell: [edge.cell[0], edge.cell[1] + 1, edge.cell[2]], axis: edge.axis },
  }));
  const observed = subjects.map(subject => edgeSubject(subject, bindings)).filter(Boolean);
  const proposedIds = new Set(proposed.map(row => row.id));
  const segmentItems = proposed.map(({ edge }) => ({
    visual: `colony.wall.segment.finished.${edge.axis}`,
    point: [
      edge.cell[0] + (edge.axis === "x" ? 0.5 : 0),
      (edge.cell[1] - 0.5) * verticalMetres,
      edge.cell[2] + (edge.axis === "z" ? 0.5 : 0),
    ],
  }));
  const junctionItems = edgeJunctions([...observed, ...proposed])
    .filter(junction => junction.incident.some(id => proposedIds.has(id)))
    .map(junction => ({
      visual: `colony.wall.junction.finished.${junction.mask}`,
      point: [junction.point[0], (junction.point[1] - 0.5) * verticalMetres, junction.point[2]],
    }));
  return { items: [...segmentItems, ...junctionItems] };
}
