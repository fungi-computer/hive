import type { GamePack } from "../contracts";
import { createColonyFrameworkProofV2Pack } from "./colony-performance";

/** New qualification fixture. V2 remains an immutable, dry-region baseline. */
export const colonyFrameworkProofV3GameId =
  "colony-framework-proof-256-100-v3" as const;
export const colonyFrameworkProofV3WaterCells = [
  [-89, 14, -102],
  [75, 14, -92],
] as const;
/** Exhaustive v2 surface inspection found these eleven starts below the new
 * water surface. Every replacement is an unoccupied, dry support at y=14. */
export const colonyFrameworkProofV3Relocations = [
  { entity: "colony.worker.51", from: [82, -94], to: [75, -91] },
  { entity: "colony.worker.52", from: [85, -94], to: [92, -92] },
  { entity: "colony.worker.53", from: [88, -94], to: [92, -91] },
  { entity: "colony.worker.54", from: [91, -94], to: [93, -94] },
  { entity: "colony.worker.56", from: [82, -91], to: [82, -86] },
  { entity: "colony.worker.57", from: [85, -91], to: [85, -86] },
  { entity: "colony.worker.58", from: [88, -91], to: [92, -90] },
  { entity: "colony.worker.59", from: [91, -91], to: [93, -91] },
  { entity: "colony.worker.61", from: [82, -88], to: [81, -86] },
  { entity: "colony.worker.62", from: [85, -88], to: [84, -86] },
  { entity: "colony.worker.63", from: [88, -88], to: [88, -86] },
] as const;

export function createColonyFrameworkProofV3Pack(): GamePack {
  const base = createColonyFrameworkProofV2Pack();
  const definition = JSON.parse(new TextDecoder().decode(base.definition));
  const environment = JSON.parse(
    new TextDecoder().decode(base.environmentDefinition),
  );
  // Preserve v2's generator identity and seed, hence its exact solid geometry.
  // Sea level affects finite generated water, not the height generator recipe.
  definition.game = colonyFrameworkProofV3GameId;
  environment.world.seaLevel = 15;
  environment.water.cells.push(...colonyFrameworkProofV3WaterCells);
  const place = (id: string, column: readonly [number, number]) => {
    const placement = environment.initialPlacements.find(
      (row: { entity: string }) => row.entity === id,
    );
    const entity = definition.initial.find(
      (row: { id: string }) => row.id === id,
    );
    if (!placement || !entity)
      throw new Error(`framework v3 relocation lost ${id}`);
    placement.column = column;
    entity.components["hive.position"] = {
      x: column[0],
      y: 0,
      z: column[1],
      facing: 0,
    };
  };
  for (const relocation of colonyFrameworkProofV3Relocations)
    place(relocation.entity, relocation.to);
  // Keep the relocated fuel tender adjacent to its original finite hearth.
  place("framework-v2.hearth.2", [74, -91]);
  return {
    ...base,
    id: colonyFrameworkProofV3GameId,
    definition: new TextEncoder().encode(JSON.stringify(definition)),
    environmentDefinition: new TextEncoder().encode(
      JSON.stringify(environment),
    ),
  };
}
