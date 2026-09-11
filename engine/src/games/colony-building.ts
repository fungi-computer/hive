import { command, entity, query } from "../sdk/authoring";
import { ConstructionSite, planConstruction } from "../sdk/construction";
import type { CardinalOrientation } from "../contracts";
import { colonyEnvironment } from "./colony-environment";

/** Player placement chooses content; native admission owns cost and geometry. */
export const colonyBuildCommand = command({
  reads: [ConstructionSite], writes: [],
  run(context, input) {
    if (!input || typeof input !== "object" || Array.isArray(input)) throw new Error("Choose a building and a cell");
    const request = input as { catalog?: unknown; orientation?: unknown; target?: { cell?: unknown } };
    const definition = colonyEnvironment.structures.catalog.find(item => item.id === request.catalog);
    if (!definition) throw new Error("Unknown building");
    const orientation = request.orientation;
    if (orientation !== "north" && orientation !== "east" && orientation !== "south" && orientation !== "west")
      throw new Error("Choose a cardinal building orientation");
    const cell = request.target?.cell;
    if (!Array.isArray(cell) || cell.length !== 3 || cell.some(value => !Number.isSafeInteger(value) || Math.abs(value) > 1_000_000))
      throw new Error("Choose a valid building cell");
    const [x, supportY, z] = cell as [number, number, number];
    const y = supportY + (definition.shape.kind === "wall" ? 1 : 0);
    const id = entity(`colony.build.${definition.id}.${x}.${y}.${z}.${orientation}`);
    const sites = context.query(query(ConstructionSite));
    if (sites.some(site => site.id === id)) return { actions: [], writes: [] };
    if (sites.length >= 128) throw new Error("Construction site limit reached");
    const supports: [number, number, number][] = [];
    for (const [dx, dz] of [[-1, 0], [1, 0], [0, -1], [0, 1]])
      for (const dy of [0, -1, 1]) supports.push([x + dx, supportY + dy, z + dz]);
    const facts = context.physicalContacts(supports.flatMap(([cx, cy, cz]) => [[cx, cy, cz], [cx, cy + 1, cz]] as [number, number, number][]));
    const index = supports.findIndex((_, i) => {
      const foot = facts[i * 2], head = facts[i * 2 + 1];
      return !foot.outside && (foot.solid || foot.sealedTop) && !head.outside && !head.solid && !head.sealedTop;
    });
    if (index < 0) throw new Error("No clear working surface beside this building");
    const [cx, cy, cz] = supports[index];
    return { writes: [], actions: [planConstruction(id, definition.id, { x, y, z }, orientation as CardinalOrientation,
      { x: cx, y: (cy + 0.5) * colonyEnvironment.world.verticalMetres, z: cz })] };
  },
});
