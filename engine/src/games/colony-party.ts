import type { EntityId, EntityRecord } from "../contracts";
import { entity } from "../sdk/authoring";

export type ColonyPartySpawn = Readonly<{
  x: number;
  y: number;
  z: number;
}>;

export type ColonyPartyPlan = Readonly<{
  party: EntityId;
  people: readonly [EntityId, EntityId];
  records: readonly EntityRecord[];
}>;
export const colonyPartyFootprint = Object.freeze([[0, 0], [2, 0], [4, 0]] as const);

const workerLooks = [
  { sprite: "colony.rowan", label: "Rowan" },
  { sprite: "colony.sedge", label: "Sedge" },
] as const;

/**
 * Prepare the complete current Colony starter group. The host selects a safe
 * spawn and the native establish-party operation validates and commits this
 * detached plan as one group.
 */
export function createColonyPartyPlan(
  player: string,
  party: EntityId,
  spawn: ColonyPartySpawn,
): ColonyPartyPlan {
  if (!/^[A-Za-z0-9._:-]{1,96}$/.test(player))
    throw new Error("invalid Colony player identity");
  if (!/^[A-Za-z0-9._:-]{1,96}$/.test(party))
    throw new Error("invalid Colony party identity");
  if (![spawn.x, spawn.y, spawn.z].every(Number.isFinite))
    throw new Error("invalid Colony party spawn");

  const people = [
    entity(`${party}.person.0`),
    entity(`${party}.person.1`),
  ] as const;
  const store = entity(`${party}.starter-store`);
  const starterLots: readonly (readonly [string, number])[] = [
    ["wood", 48],
    ["bread", 6],
    ["malt", 4],
    ["barm", 1],
    ["keg", 1],
  ];
  const records: EntityRecord[] = [
    {
      id: party,
      components: { "hive.party": { ownerPlayer: player } },
    },
    ...people.map((id, index) => ({
      id,
      components: {
        "hive.position": {
          x: spawn.x + index * 2,
          y: spawn.y,
          z: spawn.z,
          facing: 0,
        },
        "hive.body": { speed: 2 },
        "hive.container": { capacity: 4 },
        "hive.traversal": { clearanceCells: 1, maxStepCells: 1 },
        "hive.visual": workerLooks[index],
        "hive.party-member": { party },
        "hive.owned-by-party": { party },
        "hive.work-participation": { automatic: true },
        "hive.delivery-control": { enabled: true, quantity: 3 },
        "colony.worker": { guest: false },
      },
    })),
    {
      id: store,
      components: {
        "hive.position": { x: spawn.x + 4, y: spawn.y, z: spawn.z, facing: 0 },
        "hive.container": { capacity: 64 },
        "hive.ground-stock": {},
        "hive.owned-by-party": { party },
        "hive.visual": { sprite: "crate", label: "Starter store" },
      },
    },
    ...people.map((holder, index) => {
      const id = entity(`${party}.pail.${index}`);
      return {
        id,
        components: {
          "hive.lot": { quantity: 1, kind: "pail", container: holder },
          "hive.container": { capacity: 7 },
          "hive.vessel-capability": { acceptsWater: true },
          "hive.owned-by-party": { party },
          "hive.visual": { sprite: "pail", label: "Pail" },
        },
      };
    }),
    ...starterLots.map(([kind, quantity]) => ({
      id: entity(`${party}.starter.${kind}`),
        components: {
          "hive.lot": { quantity, kind, container: store },
          "hive.owned-by-party": { party },
        ...(kind === "barm" || kind === "keg"
          ? { "hive.container": { capacity: kind === "keg" ? 4 : 1 } }
          : {}),
      },
    })),
  ];

  return Object.freeze({
    party,
    people: Object.freeze(people),
    records: Object.freeze(records.map((record) => Object.freeze(record))),
  });
}
