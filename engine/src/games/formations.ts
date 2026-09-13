import { z } from "zod";
import { command, component, entity, query, system } from "../sdk/authoring";
import { Destination, Position, MaterialLot, encodeDefinition, move } from "../sdk/common";
import { Collider, Launcher, ImpactMaterial, launch, displace } from "../sdk/combat";
import type { EntityId, GamePack } from "../contracts";

export const FormationMember = component<{ group: EntityId; slot: number }>(
  "formations.member",
  { version: 1, fields: { group: "entity", slot: "number" } },
);
export const Morale = component<{ value: number }>("formations.morale", {
  version: 1,
  fields: { value: "number" },
});
export const Health = component<{ value: number }>("formations.health", {
  version: 1, fields: { value: "number" },
});
const cannonId = entity("formations.cannon");
const ammunitionId = entity("formations.ammunition");
export const cannonDamage = system({
  id: "formations.cannon-damage", version: 1, consumesImpacts: true,
  reads: [Health, Morale], writes: [Health, Morale],
  run(ctx) {
    const victims = new Map(ctx.query(query(Health, Morale)).map(row => [row.id, {
      health: row.get(Health).value, morale: row.get(Morale).value,
    }]));
    const changed = new Set<EntityId>();
    for (const impact of ctx.impacts) {
      const victim = victims.get(impact.targetId);
      if (!victim) continue;
      victim.health = Math.max(0, victim.health - 20);
      victim.morale = Math.max(0, victim.morale - 30);
      changed.add(impact.targetId);
      const speed = Math.hypot(impact.velocity.x, impact.velocity.z);
      if (speed > 0) ctx.action(displace(impact.targetId, {
        x: impact.velocity.x / speed * 0.75, y: 0, z: impact.velocity.z / speed * 0.75,
      }));
    }
    for (const id of changed) {
      const victim = victims.get(id)!;
      ctx.write(Health, id, { value: victim.health });
      ctx.write(Morale, id, { value: victim.morale });
    }
  },
});
export const FormationSettings = component<{
  facing: number;
  retreatBelow: number;
}>("formations.settings", {
  version: 1,
  fields: { facing: "number", retreatBelow: "number" },
});
export const formations = system({
  id: "formations.retreat",
  version: 1,
  reads: [FormationMember, Morale, Position, FormationSettings],
  run(ctx) {
    for (const unit of ctx.query(query(FormationMember, Morale, Position))) {
      const morale = unit.get(Morale);
      const settings = ctx
        .query(query(FormationSettings))[0]
        ?.get(FormationSettings);
      if (settings && morale.value < settings.retreatBelow)
        ctx.action(
          move(unit.id, { x: -4, y: 0, z: -4, frame: null }, settings.facing),
        );
    }
  },
});
const groupId = entity("formations.group.1");
const formationInitial = [
  { id: cannonId, components: {
    "hive.position": { x: -3, y: 0, z: 0, facing: 0 },
    "hive.container": { capacity: 6 },
    "hive.visual": { sprite: "formation.cannon", label: "Timber cannon" },
    "hive.launcher": { ammoKind: "iron-round", muzzleX: 1.435, muzzleY: 0.77, muzzleZ: 0,
      maxSpeed: 8, projectileRadius: 0.22, maxRange: 20, maxLifetime: 6, gravity: -2.5, penetration: 4,
      projectileSprite: "formation.cannonball", projectileLabel: "Iron round" },
  } },
  { id: ammunitionId, components: {
    "hive.lot": { kind: "iron-round", quantity: 6, container: cannonId },
  } },
  {
    id: groupId,
    components: {
      "formations.settings": { facing: 0, retreatBelow: 25 },
      "hive.obstacle": { occupied: true },
      "hive.position": { x: 2, y: 0, z: 1, facing: 0 },
      "hive.visual": { sprite: "crate", label: "Obstacle" },
    },
  },
  ...[
    { id: "formations.firm-ground", x: -2, halfX: 6, resistance: 0.2, restitution: 0.18, friction: 0.35, embedSpeed: 3 },
    { id: "formations.soft-ground", x: 8, halfX: 4, resistance: 1, restitution: 0, friction: 0.8, embedSpeed: 1 },
  ].map(ground => ({ id: entity(ground.id), components: {
    "hive.position": { x: ground.x, y: -0.5, z: 0, facing: 0 },
    "hive.collider": { shape: "cuboid", radius: 0, halfX: ground.halfX, halfY: 0.5, halfZ: 8, yaw: 0, offsetX: 0, offsetY: 0, offsetZ: 0 },
    "hive.impact-material": { response: "ground", resistance: ground.resistance, restitution: ground.restitution, friction: ground.friction, embedSpeed: ground.embedSpeed },
  }})),
  ...[1, 2, 3].map((slot) => ({
    id: entity(`formations.unit.${slot}`),
    components: {
      "hive.position": { x: slot, y: 0, z: 0, facing: 0 },
      "hive.body": { speed: 1.5 },
      "hive.visual": { sprite: "goblin.soldier", label: `Unit ${slot}` },
      "formations.member": { group: groupId, slot },
      "formations.morale": { value: 80 },
      "formations.health": { value: 100 },
      "hive.collider": { shape: "ball", radius: 0.4, halfX: 0, halfY: 0, halfZ: 0, yaw: 0, offsetX: 0, offsetY: 0.65, offsetZ: 0 },
      "hive.impact-material": { response: "pierce", resistance: 0.5, restitution: 0, friction: 0, embedSpeed: 0 },
    },
  })),
];
export const formationsPack: GamePack = {
  id: "formations",
  version: 1,
  components: [
    Position,
    Destination,
    FormationMember,
    Morale,
    FormationSettings, Health, Collider, Launcher, ImpactMaterial, MaterialLot,
  ],
  systems: [cannonDamage, formations],
  commands: {
    fire: command({ input: z.object({ velocity: z.object({ x: z.number().finite().min(-1000000).max(1000000), y: z.number().finite().min(-1000000).max(1000000), z: z.number().finite().min(-1000000).max(1000000) }).strict() }).strict(), reads: [Launcher, MaterialLot], writes: [], run(context, { velocity }) {
      if (velocity.y < 0 || velocity.y > 8 || Math.hypot(velocity.x, velocity.y, velocity.z) > 12)
        throw new Error("Aim within the cannon elevation and speed limits");
      const cannon = context.query(query(Launcher)).find(row => row.id === cannonId);
      const stock = context.query(query(MaterialLot)).find(row => row.id === ammunitionId)?.get(MaterialLot);
      if (!cannon || !stock || stock.quantity < 1) throw new Error("No cannon rounds remain");
      return { actions: [launch(cannonId, ammunitionId, velocity)], writes: [] };
    } }),
    march: command({
      input: z.object({
        entities: z.array(z.string().min(1).max(128)).min(1).max(128),
        destination: z.object({ x: z.number().finite().min(-1_000_000).max(1_000_000), y: z.number().finite().min(-1_000_000).max(1_000_000), z: z.number().finite().min(-1_000_000).max(1_000_000), frame: z.null() }).strict(),
        facing: z.number().int().min(0).max(3).optional(),
      }).strict(),
      reads: [FormationMember, FormationSettings],
      writes: [],
      run(context, order) {
        const requested = new Set(order.entities);
        const facing =
          order.facing ??
          context.query(query(FormationSettings))[0]?.get(FormationSettings)
            .facing ??
          0;
        const members = context
          .query(query(FormationMember))
          .filter((row) => requested.has(row.id))
          .sort(
            (a, b) =>
              a.get(FormationMember).slot - b.get(FormationMember).slot ||
              a.id.localeCompare(b.id),
          );
        if (members.length !== requested.size)
          throw new Error("Select formation members to march");
        const columns = Math.min(3, members.length);
        return {
          actions: members.map((member, index) =>
            (() => {
              const ox = (index % columns) - Math.floor(columns / 2);
              const oz = Math.floor(index / columns);
              const rotated =
                facing === 1
                  ? { x: -oz, z: ox }
                  : facing === 2
                    ? { x: -ox, z: -oz }
                    : facing === 3
                      ? { x: oz, z: -ox }
                      : { x: ox, z: oz };
              return move(
                member.id,
                {
                  x: order.destination.x + rotated.x,
                  y: order.destination.y,
                  z: order.destination.z + rotated.z,
                  frame: order.destination.frame,
                },
                facing,
              );
            })(),
          ),
          writes: [],
        };
      },
    }),
    setFacing: command({
      input: z.object({ facing: z.number().int().min(0).max(3) }).strict(),
      reads: [FormationSettings],
      writes: [FormationSettings],
      run: (context, { facing }) => {
        const current = context
          .query(query(FormationSettings))[0]
          ?.get(FormationSettings);
        return {
          actions: [],
          writes: [
            {
              component: FormationSettings.id,
              entity: groupId,
              value: { facing, retreatBelow: current?.retreatBelow ?? 25 },
            },
          ],
        };
      },
    }),
    setRetreatThreshold: command({
      input: z.object({ retreatBelow: z.union([z.literal(25), z.literal(90)]) }).strict(),
      reads: [FormationSettings],
      writes: [FormationSettings],
      run: (context, { retreatBelow }) => {
        const current = context
          .query(query(FormationSettings))[0]
          ?.get(FormationSettings);
        return {
          actions: [],
          writes: [
            {
              component: FormationSettings.id,
              entity: groupId,
              value: { facing: current?.facing ?? 0, retreatBelow },
            },
          ],
        };
      },
    }),
  },
  definition: encodeDefinition(
    "formations",
    [Position, Destination, FormationMember, Morale, FormationSettings, Health, Collider, Launcher, ImpactMaterial, MaterialLot],
    formationInitial,
  ),
  presentation: {
    feedback: true,
    controls: [
      { id: "fire-cannon", label: "Fire downrange", command: "fire", input: { velocity: { x: 8 * Math.cos(0.12), y: 8 * Math.sin(0.12), z: 0 } } },
      {
        id: "facing-0",
        label: "Formation north",
        command: "setFacing",
        input: { facing: 0 },
      },
      {
        id: "facing-1",
        label: "Formation east",
        command: "setFacing",
        input: { facing: 1 },
      },
      {
        id: "facing-2",
        label: "Formation south",
        command: "setFacing",
        input: { facing: 2 },
      },
      {
        id: "facing-3",
        label: "Formation west",
        command: "setFacing",
        input: { facing: 3 },
      },
      {
        id: "retreat-25",
        label: "Retreat at 25",
        command: "setRetreatThreshold",
        input: { retreatBelow: 25 },
      },
      {
        id: "retreat-90",
        label: "Retreat at 90",
        command: "setRetreatThreshold",
        input: { retreatBelow: 90 },
      },
    ],
    inspect: (context) => {
      const settings = context
        .query(query(FormationSettings))[0]
        ?.get(FormationSettings);
      const morale = context
        .query(query(Morale))
        .map((row) => row.get(Morale).value);
      return [
        { id: "cannon-rounds", label: "Cannon rounds", value: context.query(query(MaterialLot)).find(row => row.id === ammunitionId)?.get(MaterialLot).quantity ?? 0 },
        { id: "lowest-health", label: "Lowest health", value: Math.min(...context.query(query(Health)).map(row => row.get(Health).value)) },
        {
          id: "formation-facing",
          label: "Formation facing",
          value: settings?.facing ?? 0,
        },
        {
          id: "retreat-threshold",
          label: "Retreat threshold",
          value: settings?.retreatBelow ?? 25,
        },
        {
          id: "lowest-morale",
          label: "Lowest morale",
          value: morale.length ? Math.min(...morale) : 0,
        },
      ];
    },
  },
};
