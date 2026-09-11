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
  offsetX: number;
  offsetY: number;
  offsetZ: number;
}>("hive.collider", {
  version: 1,
  fields: { shape: "string", radius: "number", halfX: "number", halfY: "number", halfZ: "number", yaw: "number", offsetX: "number", offsetY: "number", offsetZ: "number" },
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
  gravity: number;
  penetration: number;
}>("hive.launcher", {
  version: 1,
  fields: {
    ammoKind: "string", muzzleX: "number", muzzleY: "number", muzzleZ: "number",
    maxSpeed: "number", projectileRadius: "number", maxRange: "number", maxLifetime: "number",
    projectileSprite: "string", projectileLabel: "string", gravity: "number", penetration: "number",
  },
});

/** Contact policy supplied by a game; collision geometry remains independent. */
export const ImpactMaterial = component<{
  response: "stop" | "pierce" | "ground";
  resistance: number;
  restitution: number;
  friction: number;
  embedSpeed: number;
}>("hive.impact-material", {
  version: 1,
  fields: { response: "string", resistance: "number", restitution: "number", friction: "number", embedSpeed: "number" },
});

/** Velocity is in world axes, relative to the launcher's motion. */
export const launch = (launcher: EntityId, ammunition: EntityId, velocity: Vec3): ActionRequest => ({
  kind: "launch", launcher, ammunition, velocity: { ...velocity },
});

/** Bounded grounded knockback; the native owner checks obstacles and supports. */
export const displace = (entity: EntityId, delta: Vec3): ActionRequest => ({
  kind: "displace", entity, delta: { ...delta },
});
