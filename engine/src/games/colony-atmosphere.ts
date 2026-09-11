import type { ReadContext } from "../contracts";
import type { EnvironmentVisual } from "../presentation";
import { query } from "../sdk/authoring";
import { Emitter, Position } from "../sdk/common";
import { colonyEnvironment } from "./colony-environment";

type Context = Pick<ReadContext, "query" | "atmosphereSamples" | "environmentFacts">;

/** Authored display coverage, not air geometry or a second simulation. */
export function colonyAtmosphereVisuals(context: Context): readonly EnvironmentVisual[] {
  const station = context.query(query(Emitter)).find(row => row.id === "colony.hearth");
  if (!station) return [];
  const pose = context.query(query(Position)).find(row => row.id === station.id)?.get(Position);
  if (!pose) return [];
  const vertical = colonyEnvironment.world.verticalMetres;
  const cx = Math.floor(pose.x + 0.5);
  const cy = Math.floor(pose.y / vertical + 0.5);
  const cz = Math.floor(pose.z + 0.5);
  const cells: [number, number, number][] = [];
  for (const level of [0, 4, 8]) {
    for (let x = -1; x <= 2; x++) for (let z = -1; z <= 2; z++) {
      cells.push([cx + x, cy + level, cz + z]);
    }
  }
  const observed = context.atmosphereSamples(cells);
  const result: EnvironmentVisual[] = observed.samples.flatMap((sample, index) => {
    if (sample === null || sample.smokeKgM3 <= 0) return [];
    const [x, y, z] = cells[index];
    return [{ id: `smoke:${x}:${y}:${z}`, kind: "smoke" as const,
      position: { x, y: y * vertical, z },
      intensity: Math.min(1, Math.log1p(sample.smokeKgM3 / 0.00001) / 4),
    }];
  });
  const facts = context.environmentFacts();
  if (!facts || typeof facts !== "object" || !Array.isArray((facts as { emissions?: unknown }).emissions))
    throw new Error("Missing native emission observation");
  const emissions = (facts as { emissions: readonly { source: string }[] }).emissions;
  if (emissions.length > 64) throw new Error("Native emission observation exceeds bound");
  if (emissions.some(source => source.source === station.id)) {
    result.push({ id: `fire:${station.id}`, kind: "fire", position: { x: pose.x, y: pose.y + 0.08, z: pose.z }, intensity: 1 });
  }
  return result;
}
