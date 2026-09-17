import { command, entity, query } from "../sdk/authoring";
import { OwnedBy, Party } from "../sdk/party";
import { colonyPartyForPlayer } from "./colony-player-party";
import { ConstructionSite, FloorReplacement, constructionCandidates, constructionPlanActions, constructionProposalInput, planConstructions } from "../sdk/construction";
import { colonyPlacement } from "./colony-placement";
import { colonyEnvironment } from "./colony-environment";
import type { EntityId, PlacementCandidate } from "../contracts";

/** Build copy is composed once beside the authoritative Goblin definition. */
export function colonyBuildBindingDetail(catalog: string, orientation?: string, environment = colonyEnvironment, placement = colonyPlacement): string {
  const definition = environment.structures.catalog.find(item => item.id === catalog);
  const policy = placement[catalog];
  if (!definition || !policy) throw new Error(`Unknown building presentation ${catalog}`);
  const cost = definition.materials.map(material => `${material.quantity} ${material.kind}`).join(" + ");
  const shape = definition.shape;
  const footprint = shape.kind === "fixture" && shape.footprint.length
    ? `${Math.max(...shape.footprint.map(([x]) => x)) - Math.min(...shape.footprint.map(([x]) => x)) + 1}×${Math.max(...shape.footprint.map(([, z]) => z)) - Math.min(...shape.footprint.map(([, z]) => z)) + 1}`
    : shape.kind === "stair" ? `${shape.run}×${shape.rise} stair` : shape.kind;
  const gesture = policy.alignment === "stroke"
    ? "drag line"
    : shape.kind === "floor" || shape.kind === "cover" ? "drag rectangle" : "click point";
  const facing = orientation ?? (policy.alignment === "stroke" ? "auto-facing" : "cardinal");
  return `${cost} · ${footprint} · ${gesture} · ${facing}`;
}

function colonyBuildBinding(catalog: string, orientation?: CardinalOrientation) {
  const definition = colonyEnvironment.structures.catalog.find(item => item.id === catalog);
  if (!definition) throw new Error(`Unknown building ${catalog}`);
  const boundary = definition.shape.kind === "wall" || definition.shape.kind === "aperture";
  const area = definition.shape.kind === "floor" || definition.shape.kind === "cover";
  return {
    id: orientation ? `${catalog.replace("timber-", "")}-${orientation}` : catalog,
    label: orientation ? `${catalog.replace("timber-", "")} ${orientation}` : `Build ${catalog.replace("timber-", "")}`,
    target: (boundary ? "world-edge" : "world-surface") as "world-edge" | "world-surface",
    designation: (boundary ? ["edge-line"] : area ? ["point", "rectangle"] : ["point"]) as ("point" | "rectangle" | "edge-line")[],
    detail: colonyBuildBindingDetail(catalog, orientation ?? (area || definition.shape.kind === "fixture" ? "north" : undefined)),
    preset: { catalog, ...((orientation ?? (area || definition.shape.kind === "fixture" ? "north" : undefined)) ? { orientation: orientation ?? "north" } : {}) },
    ...(definition.shape.kind === "fixture" ? { footprint: definition.shape.footprint } : {}),
  };
}

/** One Goblin target projection shared by the preview and committing command. */
export function colonyPlacementCandidates(value: unknown): readonly PlacementCandidate[] {
  const input = constructionProposalInput.parse(value);
  const definition = colonyEnvironment.structures.catalog.find(item => item.id === input.catalog);
  if (!definition) throw new Error("Unknown building");
  return constructionCandidates(definition, colonyPlacement[input.catalog]?.alignment ?? "fixed", input, "colony.build");
}

/** Player placement chooses content; native admission owns cost and geometry. */
export const colonyBuildCommand = command({
  title: "Build structure", category: "Construction", description: "Place a construction plan on a visible world surface.",
  localPresentation: { bindings: [
    ...["timber-floor", "timber-wall", "timber-door", "timber-roof", "timber-bed", "timber-shelf", "brew-station"].map(catalog => colonyBuildBinding(catalog)),
    ...(["north", "east", "south", "west"] as const).map(orientation => colonyBuildBinding("timber-stair", orientation)),
  ] },
  input: constructionProposalInput,
  reads: [ConstructionSite, FloorReplacement, Party, OwnedBy], writes: [],
  run(context, input) {
    if (context.scope.kind !== "player")
      throw new Error("building requires a player party");
    const definition = colonyEnvironment.structures.catalog.find(item => item.id === input.catalog);
    if (!definition) throw new Error("Unknown building");
    const sites = context.query(query(ConstructionSite));
    const replacements = context.query(query(FloorReplacement));
    if ("edges" in input.target) {
      const candidates = colonyPlacementCandidates(input);
      if (sites.length + candidates.length > 128) throw new Error("Construction site limit reached");
      const plans = candidates.filter(candidate => !sites.some(site => site.id === candidate.site));
      return { writes: [], actions: plans.length ? [planConstructions(colonyPartyForPlayer(context), plans)] : [] };
    }
    if (definition.shape.kind === "wall" || definition.shape.kind === "aperture") throw new Error("Boundary structures require edge placement");
    const candidates = colonyPlacementCandidates(input);
    if (sites.length + candidates.length > 128) throw new Error("Construction site limit reached");
    const replacementGenerations = new Map<EntityId, number>();
    for (const row of replacements) {
      const floor = row.get(FloorReplacement).targetFloor;
      replacementGenerations.set(floor, (replacementGenerations.get(floor) ?? 0) + 1);
    }
    return { writes: [], actions: constructionPlanActions({
      party: colonyPartyForPlayer(context), definition, candidates,
      existingSites: sites.map(site => site.id),
      floorOperations: requests => context.floorOperations(requests),
      replacementGenerations,
      replacementId: (floor, generation) => entity(`colony.replace.${floor}.${generation}`),
    }) };
  },
});
