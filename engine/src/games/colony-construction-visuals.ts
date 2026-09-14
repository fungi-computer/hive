import type { ReadContext } from "../contracts";
import { query } from "../sdk/authoring";
import { ConstructionSite, constructionTarget } from "../sdk/construction";
import { edgeJunctions } from "../sdk/edge-connections";
import { colonyEnvironment } from "./colony-environment";
import { colonyPlacement } from "./colony-placement";

type Shape = (typeof colonyEnvironment.structures.catalog)[number]["shape"];

function visualGeometry(shape: Shape, y: number) {
  switch (shape.kind) {
    case "wall": return { top: y + shape.height - 1, surface: y - 0.5 };
    case "fixture": return { top: y, surface: y - 0.5 };
    case "stair": return { top: y + shape.rise, surface: y + 0.5 };
    default: return { top: y, surface: y + 0.5 };
  }
}

/** Original building art follows canonical sites; visual joints grant no support. */
export function colonyConstructionVisuals(context: Pick<ReadContext, "query">) {
  const sites = context.query(query(ConstructionSite)).map(row => {
    const site = row.get(ConstructionSite);
    const definition = colonyEnvironment.structures.catalog.find(item => item.id === site.catalog);
    if (!definition) throw new Error("Missing construction visual definition");
    const stage = site.phase === "finished" ? "finished" as const : site.seconds > 0 ? "frame" as const : "stakes" as const;
    return { id: row.id, site, target: constructionTarget(site), shape: definition.shape, stage };
  });
  const wallEdges = sites.flatMap(({ id, target, shape, stage }) => (shape.kind === "wall" || shape.kind === "aperture") && target.kind === "edge"
    ? [{ id, stage, height: shape.height, edge: { cell: [target.edge.cell.x, target.edge.cell.y, target.edge.cell.z] as const, axis: target.edge.axis } }]
    : []);
  const byWall = new Map(wallEdges.map(row => [row.id, row]));
  const stageRank = { stakes: 0, frame: 1, finished: 2 } as const;
  const structures = sites.map(({ id, site, target, shape, stage }) => {
    if (shape.kind === "wall" || shape.kind === "aperture") {
      if (target.kind !== "edge") throw new Error("Wall visual requires an edge target");
      const { cell, axis } = target.edge;
      const visualRoot = colonyPlacement[site.catalog]?.visual.replace(/\.finished$/, "");
      if (!visualRoot) throw new Error("Missing edge structure placement policy");
      return { id, cutawayTop: cell.y + shape.height - 1, visual: `${visualRoot}.segment.${stage}.${axis}`, label: `${site.catalog} · ${site.phase}`, pickable: true,
        pose: { position: { x: cell.x + (axis === "x" ? 0.5 : 0), y: (cell.y - 0.5) * colonyEnvironment.world.verticalMetres, z: cell.z + (axis === "z" ? 0.5 : 0) }, facing: 0 } };
    }
    if (target.kind !== "cell") throw new Error("Cell structure visual requires a cell target");
    const { cell, orientation } = target;
    const facing = colonyPlacement[site.catalog].facing[orientation];
    const geometry = visualGeometry(shape, cell.y);
    const visual = colonyPlacement[site.catalog].visual.replace(".finished", `.${stage}`);
    const placement = shape.kind === "fixture"
      ? { kind: "footprint" as const, footprint: shape.footprint, orientation }
      : shape.kind === "stair"
        ? { kind: "stair" as const, entrance: [0, 0, 0] as const, landing: [0, shape.rise * colonyEnvironment.world.verticalMetres, -shape.run] as const, orientation }
        : undefined;
    return { id, cutawayTop: geometry.top, visual, label: `${site.catalog} · ${site.phase}`, pickable: true, ...(placement ? { placement } : {}),
      pose: { position: { x: cell.x, y: geometry.surface * colonyEnvironment.world.verticalMetres, z: cell.z }, facing } };
  });
  const junctions = edgeJunctions(wallEdges).map(junction => {
    const walls = junction.incident.map(id => byWall.get(id)).filter((wall): wall is NonNullable<typeof wall> => wall !== undefined);
    const stage = walls.map(wall => wall.stage).sort((left, right) => stageRank[right] - stageRank[left])[0];
    if (!stage) throw new Error("Wall junction has no incident construction site");
    const y = junction.point[1];
    return {
      id: junction.id,
      cutawayTop: Math.max(...walls.map(wall => wall.edge.cell[1] + wall.height - 1)),
      visual: `colony.wall.junction.${stage}.${junction.mask}`,
      label: "Wall junction",
      pickable: false,
      pose: { position: { x: junction.point[0], y: (y - 0.5) * colonyEnvironment.world.verticalMetres, z: junction.point[2] }, facing: 0 },
    };
  });
  return [...structures, ...junctions];
}
