import { component } from "./authoring";
import type { ActionRequest, EntityId, Vec3 } from "../contracts";

/** Physical collision dimensions are independent of a sprite's bounds. */
export const Collider = component<{
  shape: "ball" | "cuboid";
  radius: number;
  halfX: number;
  halfY: number;
  halfZ: number;
  yaw: number;
}>("hive.collider", {
  version: 1,
  fields: { shape: "string", radius: "number", halfX: "number", halfY: "number", halfZ: "number", yaw: "number" },
});

export const Launcher = component<{
  ammoKind: string;
  muzzleX: number;
  muzzleY: number;
  muzzleZ: number;
  maxSpeed: number;
  projectileRadius: number;
  maxRange: number;
  maxLifetime: number;
  projectileSprite: string;
  projectileLabel: string;
}>("hive.launcher", {
  version: 1,
  fields: {
    ammoKind: "string", muzzleX: "number", muzzleY: "number", muzzleZ: "number",
    maxSpeed: "number", projectileRadius: "number", maxRange: "number", maxLifetime: "number",
    projectileSprite: "string", projectileLabel: "string",
  },
});

/** Velocity is in world axes, relative to the launcher's motion. */
export const launch = (launcher: EntityId, ammunition: EntityId, velocity: Vec3): ActionRequest => ({
  kind: "launch", launcher, ammunition, velocity: { ...velocity },
});

/** Bounded grounded knockback; the native owner checks obstacles and supports. */
export const displace = (entity: EntityId, delta: Vec3): ActionRequest => ({
  kind: "displace", entity, delta: { ...delta },
});
