import { z } from "zod";
import { command, component, entity, query } from "../sdk/authoring";
import {
  Body,
  Destination,
  MaterialLot,
  Position,
  Support,
  Surface,
  encodeDefinition,
  move,
} from "../sdk/common";
import { DeliveryControl, DeliveryTask, deliverySystem } from "../sdk/delivery";
import type { EntityId, GamePack, ReadContext } from "../contracts";

export const PirateCrew = component<{ controlled: boolean }>("pirates.crew", {
  version: 1,
  fields: { controlled: "boolean" },
});
export const PirateShip = component<{ controlled: boolean }>("pirates.ship", {
  version: 1,
  fields: { controlled: "boolean" },
});

export const shipId = entity("pirates.ship");
export const crewOneId = entity("pirates.crew.1");
export const crewTwoId = entity("pirates.crew.2");
export const chestId = entity("pirates.chest");
const breadId = entity("pirates.bread");
const woodId = entity("pirates.wood");
const breadTaskId = entity("pirates.delivery.bread");
const woodTaskId = entity("pirates.delivery.wood");
const crewIds = [crewOneId, crewTwoId] as const;

const shipFrame = shipId;
const piratesInitial = [
  {
    id: shipId,
    components: {
      "hive.position": { x: 0, y: 0, z: 0, facing: 0 },
      "hive.body": { speed: 1.5 },
      "hive.surface": { minX: -3, maxX: 3, minZ: -2, maxZ: 2, height: 1 },
      "hive.visual": { sprite: "pirate.ship", label: "Timber ship" },
      "pirates.ship": { controlled: true },
    },
  },
  ...[
    { id: crewOneId, x: -1, z: 0, label: "Deckhand One" },
    { id: crewTwoId, x: -1, z: 1, label: "Deckhand Two" },
  ].map(({ id, x, z, label }) => ({
    id,
    components: {
      "hive.position": { x, y: 1, z, facing: 0 },
      "hive.body": { speed: 1 },
      "hive.container": { capacity: 2 },
      "hive.support": { entity: shipFrame },
      "hive.visual": { sprite: "pirate.crew", label },
      "pirates.crew": { controlled: true },
      "hive.delivery-control": { enabled: false, quantity: 1 },
    },
  })),
  {
    id: chestId,
    components: {
      "hive.position": { x: 2, y: 1, z: 0, facing: 0 },
      "hive.container": { capacity: 8 },
      "hive.support": { entity: shipFrame },
      "hive.visual": { sprite: "pirate.chest", label: "Cargo chest" },
    },
  },
  {
    id: entity("pirates.deck-obstacle"),
    components: {
      "hive.position": { x: 0, y: 1, z: 0, facing: 0 },
      "hive.obstacle": { occupied: true },
      "hive.support": { entity: shipFrame },
      "hive.visual": { sprite: "pirate.deck-obstacle", label: "Deck obstacle" },
    },
  },
  {
    id: breadId,
    components: {
      "hive.lot": { quantity: 4, kind: "bread", container: chestId },
    },
  },
  {
    id: woodId,
    components: {
      "hive.lot": { quantity: 3, kind: "wood", container: chestId },
    },
  },
  {
    id: breadTaskId,
    components: {
      "hive.delivery-task": {
        actor: null,
        sourceLot: breadId,
        source: chestId,
        destination: crewOneId,
        material: "bread",
        quantity: 1,
        phase: "idle",
      },
    },
  },
  {
    id: woodTaskId,
    components: {
      "hive.delivery-task": {
        actor: null,
        sourceLot: woodId,
        source: chestId,
        destination: crewTwoId,
        material: "wood",
        quantity: 1,
        phase: "idle",
      },
    },
  },
];

const pirateComponents = [
  Position,
  Body,
  Support,
  Surface,
  MaterialLot,
  Destination,
  PirateCrew,
  PirateShip,
  DeliveryTask,
  DeliveryControl,
] as const;

const moveInput = z
  .object({
    entities: z.array(z.string()).min(1).max(2),
    destination: z
      .object({
        x: z.number().finite(),
        y: z.number().finite(),
        z: z.number().finite(),
        frame: z.string().nullable(),
      })
      .strict(),
  })
  .strict();
const selectionInput = z
  .object({ entities: z.array(z.string()).min(1).max(2) })
  .strict();

function selectedEntities(input: unknown): EntityId[] {
  const parsed = selectionInput.parse(input);
  const selected = [...new Set(parsed.entities)] as EntityId[];
  if (selected.length !== parsed.entities.length)
    throw new Error("selection must contain distinct entities");
  return selected;
}
function selectedCrew(context: Pick<ReadContext, "query">, input: unknown) {
  const parsed = moveInput.parse(input);
  const selected = selectedEntities(input);
  if (selected.some((id) => !(crewIds as readonly EntityId[]).includes(id)))
    throw new Error("only crew can use this command");
  const crewRows = context.query(query(PirateCrew));
  if (selected.some((id) => !crewRows.some((row) => row.id === id)))
    throw new Error("only crew can use this command");
  const rows = context.query(query(Support));
  const supports = selected.map(
    (id) => rows.find((row) => row.id === id)?.get(Support).entity,
  );
  if (supports.some((support: unknown) => support !== shipFrame))
    throw new Error("crew must remain supported by the ship");
  return {
    selected,
    destination: {
      ...parsed.destination,
      frame: parsed.destination.frame as EntityId | null,
    },
  };
}

export const piratesPack: GamePack = {
  id: "pirates",
  version: 1,
  components: pirateComponents,
  systems: [deliverySystem],
  commands: {
    moveCrew: command({
      reads: [PirateCrew, Support],
      writes: [],
      run(context, input) {
        const { selected, destination } = selectedCrew(context, input);
        if (destination.frame !== shipFrame)
          throw new Error("crew destinations must name the ship frame");
        return {
          actions: selected.map((id) => move(id, destination, 0)),
          writes: [],
        };
      },
    }),
    moveShip: command({
      reads: [PirateShip],
      writes: [],
      run(context, input) {
        const parsed = moveInput.parse(input);
        if (parsed.entities.length !== 1 || parsed.entities[0] !== shipId)
          throw new Error("select only the ship");
        if (parsed.destination.frame !== null)
          throw new Error("ship destinations must be in the world frame");
        return {
          actions: [
            move(
              shipId,
              {
                ...parsed.destination,
                frame: parsed.destination.frame as EntityId | null,
              },
              0,
            ),
          ],
          writes: [],
        };
      },
    }),
    turnShip: command({
      reads: [PirateShip, Position],
      writes: [],
      run(context, input) {
        const facing = (input as { facing?: unknown } | null)?.facing;
        if (
          !Number.isInteger(facing) ||
          (facing as number) < 0 ||
          (facing as number) > 3
        )
          throw new Error("ship facing must be 0..3");
        const position = context
          .query(query(Position))
          .find((row) => row.id === shipId)
          ?.get(Position);
        if (!position) throw new Error("ship position is unavailable");
        return {
          actions: [
            move(shipId, { ...position, frame: null }, facing as number),
          ],
          writes: [],
        };
      },
    }),
    loadBread: command({
      reads: [PirateCrew],
      writes: [DeliveryControl],
      run(_context, input) {
        const selected = selectedEntities(input);
        if (selected.length !== 1 || selected[0] !== crewOneId)
          throw new Error("bread is assigned to deckhand one");
        return {
          actions: [],
          writes: [
            {
              component: DeliveryControl.id,
              entity: crewOneId,
              value: { enabled: true, quantity: 1 },
            },
          ],
        };
      },
    }),
    loadWood: command({
      reads: [PirateCrew],
      writes: [DeliveryControl],
      run(_context, input) {
        const selected = selectedEntities(input);
        if (selected.length !== 1 || selected[0] !== crewTwoId)
          throw new Error("wood is assigned to deckhand two");
        return {
          actions: [],
          writes: [
            {
              component: DeliveryControl.id,
              entity: crewTwoId,
              value: { enabled: true, quantity: 1 },
            },
          ],
        };
      },
    }),
  },
  definition: encodeDefinition("pirates", pirateComponents, piratesInitial),
  presentation: {
    controls: [
      {
        id: "load-bread",
        label: "Load bread",
        command: "loadBread",
        input: { entities: [crewOneId] },
      },
      {
        id: "load-wood",
        label: "Load wood",
        command: "loadWood",
        input: { entities: [crewTwoId] },
      },
      {
        id: "turn-east",
        label: "Turn ship east",
        command: "turnShip",
        input: { facing: 1 },
      },
    ],
    inspect: (context) => {
      const lots = context
        .query(query(MaterialLot))
        .map((row) => row.get(MaterialLot));
      return [
        {
          id: "bread-cargo",
          label: "Bread aboard",
          value: lots
            .filter((lot) => lot.kind === "bread")
            .reduce((sum, lot) => sum + lot.quantity, 0),
        },
        {
          id: "wood-cargo",
          label: "Wood aboard",
          value: lots
            .filter((lot) => lot.kind === "wood")
            .reduce((sum, lot) => sum + lot.quantity, 0),
        },
      ];
    },
  },
};
