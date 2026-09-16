import type { ActorArgument, ActorInstantiationPlan } from "../contracts";

export type ColonyPartySpawn = Readonly<{ x: number; y: number; z: number }>;
export const colonyPartyFootprint = Object.freeze([[0, 0], [2, 0], [4, 0]] as const);

const value = (literal: string | number | boolean | null): ActorArgument => ({ kind: "value", value: literal });
const spawned = (slot: string): ActorArgument => ({ kind: "spawned", slot });
const joiningPlayer: ActorArgument = Object.freeze({ kind: "joining-player" });
const workerLooks = [
  { sprite: "colony.rowan", label: "Rowan" },
  { sprite: "colony.sedge", label: "Sedge" },
] as const;

/** Game content chooses templates and arguments; Rust owns IDs and publication. */
export function createColonyPartyPlan(
  spawn: ColonyPartySpawn,
  options: { readonly cat?: boolean } = {},
): ActorInstantiationPlan {
  if (![spawn.x, spawn.y, spawn.z].every(Number.isFinite))
    throw new Error("invalid Colony party spawn");
  const partySlot = "party";
  const peopleSlots = ["person.0", "person.1"] as const;
  return Object.freeze({
    partySlot,
    peopleSlots: Object.freeze(peopleSlots),
    actors: Object.freeze([
      { slot: partySlot, definition: "colony.party", arguments: { "owner-player": joiningPlayer } },
      ...peopleSlots.map((slot, index) => ({
        slot,
        definition: "colony.worker",
        surfaceColumn: [spawn.x + index * 2, spawn.z] as const,
        arguments: {
          "spawn-x": value(spawn.x + index * 2),
          "spawn-y": value(spawn.y),
          "spawn-z": value(spawn.z),
          sprite: value(workerLooks[index].sprite),
          label: value(workerLooks[index].label),
          party: spawned(partySlot),
        },
      })),
      {
        slot: "starter-store",
        definition: "colony.store",
        surfaceColumn: [spawn.x + 4, spawn.z] as const,
        arguments: {
          "spawn-x": value(spawn.x + 4),
          "spawn-y": value(spawn.y),
          "spawn-z": value(spawn.z),
          capacity: value(64),
          sprite: value("crate"),
          label: value("Starter store"),
          party: spawned(partySlot),
        },
      },
      ...(options.cat ? [{
        slot: "cat.0",
        definition: "colony.cat",
        surfaceColumn: [spawn.x + 1, spawn.z + 1] as const,
        arguments: {
          "spawn-x": value(spawn.x + 1),
          "spawn-y": value(spawn.y),
          "spawn-z": value(spawn.z + 1),
          home: spawned(peopleSlots[0]),
        },
      }] : []),
    ]),
    initialMaterials: Object.freeze([
      ...peopleSlots.map(holder => ({
        container: spawned(holder),
        kind: "pail",
        quantity: 1,
        actorDefinition: "colony.pail",
        arguments: {},
      })),
      ...([ ["wood", 48], ["bread", 6], ["malt", 4] ] as const).map(([kind, quantity]) => ({
        container: spawned("starter-store"), kind, quantity,
      })),
      {
        container: spawned("starter-store"), kind: "barm", quantity: 1,
        actorDefinition: "colony.barm", arguments: {},
      },
      {
        container: spawned("starter-store"), kind: "keg", quantity: 1,
        actorDefinition: "colony.keg", arguments: {},
      },
    ].map(grant => Object.freeze(grant))),
  });
}
