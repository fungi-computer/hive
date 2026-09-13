import { entity, query } from "./authoring";
import { DeliveryTask } from "./delivery";
import { SealedContainer } from "./construction";
import { Container, MaterialLot } from "./common";
import type { EntityId, EntityRecord, WriteContext } from "../contracts";

const MAX_REQUIREMENTS = 64;
const MAX_SOURCE_CONTAINERS = 128;
const MAX_QUANTITY = 0xffffffff;
const TASK_PREFIX = "site-supply.";

export type SiteSupplyRequirement = {
  readonly destination: EntityId;
  readonly material: string;
  readonly quantity: number;
};

export type SiteSupplyOptions = {
  readonly requirements: readonly SiteSupplyRequirement[];
  readonly sourceContainers: readonly EntityId[];
  /** One finite ordinary haul; the delivery control remains the worker authority. */
  readonly batchQuantity?: number;
};

function validQuantity(value: number): boolean {
  return Number.isSafeInteger(value) && value > 0 && value <= MAX_QUANTITY;
}
function validLotQuantity(value: number): boolean {
  return Number.isSafeInteger(value) && value >= 0 && value <= MAX_QUANTITY;
}

function validMaterial(value: string): boolean {
  return (
    value.length > 0 && value.length <= 128 && /^[A-Za-z0-9._:-]+$/.test(value)
  );
}

function compareId(left: EntityId, right: EntityId): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function compareRequirement(
  left: SiteSupplyRequirement,
  right: SiteSupplyRequirement,
): number {
  const destination = compareId(left.destination, right.destination);
  if (destination !== 0) return destination;
  return left.material < right.material
    ? -1
    : left.material > right.material
      ? 1
      : 0;
}

function taskId(
  destination: EntityId,
  material: string,
  sourceLot: EntityId,
  leg = 0,
): EntityId {
  const suffix = leg === 0 ? "" : `.${leg}`;
  const id = `${TASK_PREFIX}${destination.length}:${destination}${material.length}:${material}${sourceLot.length}:${sourceLot}${suffix}`;
  if (id.length > 128)
    throw new Error("site supply task identity exceeds bound");
  return entity(id);
}

function addChecked<K>(map: Map<K, number>, key: K, quantity: number): void {
  const next = (map.get(key) ?? 0) + quantity;
  if (!validQuantity(next)) throw new Error("site supply quantity overflow");
  map.set(key, next);
}

/**
 * Admit ordinary delivery tasks for finite site stock requirements.
 *
 * This planner owns no movement or material mutation. Existing DeliveryTask
 * state and native deliveryProvider remain the assignment and transfer owner.
 */
export function planSiteSupplies(
  context: WriteContext,
  options: SiteSupplyOptions,
): readonly EntityId[] {
  if (
    !Array.isArray(options.requirements) ||
    options.requirements.length > MAX_REQUIREMENTS
  )
    throw new Error("site supply requirement bound exceeded");
  if (
    !Array.isArray(options.sourceContainers) ||
    options.sourceContainers.length > MAX_SOURCE_CONTAINERS
  )
    throw new Error("site supply source bound exceeded");
  const batchQuantity = options.batchQuantity ?? 1;
  if (!validQuantity(batchQuantity))
    throw new Error("invalid site supply batch quantity");

  for (const requirement of options.requirements) {
    if (!requirement || typeof requirement !== "object")
      throw new Error("invalid site supply requirement");
    entity(requirement.destination);
    if (
      !validMaterial(requirement.material) ||
      !validQuantity(requirement.quantity)
    )
      throw new Error("invalid site supply requirement");
  }
  const requirements = [...options.requirements].sort(compareRequirement);
  const seenRequirements = new Set<string>();
  for (const requirement of requirements) {
    const key = `${requirement.destination}\0${requirement.material}`;
    if (seenRequirements.has(key))
      throw new Error("duplicate site supply requirement");
    seenRequirements.add(key);
    // The source lot is part of the task identity so one demand can be
    // fulfilled by several independent carriers in the same planning pass.
  }
  const sourceIds = [...new Set(options.sourceContainers)].sort(compareId);
  for (const source of sourceIds) entity(source);

  const materialFacts = context.workMaterialFacts();
  const sealed = new Set(materialFacts.containers.filter((row) => row.sealed).map((row) => row.id));
  const containers = new Map(materialFacts.containers.map((container) => [container.id, container]));
  const lots = materialFacts.lots;
  const tasks = context.query(query(DeliveryTask));
  const invalidContainers = new Set<EntityId>();
  const quantityByContainer = new Map<EntityId, number>();
  const quantityByDestinationMaterial = new Map<string, number>();
  for (const lot of lots) {
    if (!validLotQuantity(lot.quantity)) {
      invalidContainers.add(lot.container);
      continue;
    }
    if (lot.quantity === 0) continue;
    const total = (quantityByContainer.get(lot.container) ?? 0) + lot.quantity;
    if (!Number.isSafeInteger(total) || total > MAX_QUANTITY)
      invalidContainers.add(lot.container);
    else quantityByContainer.set(lot.container, total);
    const key = `${lot.container}\0${lot.kind}`;
    const materialTotal =
      (quantityByDestinationMaterial.get(key) ?? 0) + lot.quantity;
    if (!Number.isSafeInteger(materialTotal) || materialTotal > MAX_QUANTITY)
      invalidContainers.add(lot.container);
    else quantityByDestinationMaterial.set(key, materialTotal);
  }

  const reservedByLot = new Map<EntityId, number>();
  const reservedBySourceMaterial = new Map<string, number>();
  const sourceMaterialTotals = new Map<string, number>();
  for (const lot of lots) {
    if (!validLotQuantity(lot.quantity)) continue;
    const key = `${lot.container}\0${lot.kind}`;
    if (lot.quantity > 0) addChecked(sourceMaterialTotals, key, lot.quantity);
  }
  const nextLegByLot = new Map<string, number>();
  const promisedByDestinationMaterial = new Map<string, number>();
  const promisedByDestination = new Map<EntityId, number>();
  const removals: EntityId[] = [];
  for (const row of tasks) {
    const task = row.get(DeliveryTask);
    if (task.phase === "complete") {
      // Delivery already observed the committed deposit before it published
      // complete. Construction may consume that lot in the following phase,
      // so this planner must retire its receipt without requiring the lot to
      // remain in the destination.
      if (row.id.startsWith(TASK_PREFIX)) removals.push(row.id);
      continue;
    }
    if (
      !entity(task.sourceLot) ||
      !entity(task.source) ||
      !entity(task.destination) ||
      !validMaterial(task.material) ||
      !validQuantity(task.quantity) ||
      typeof task.phase !== "string"
    )
      throw new Error("invalid active site supply task");
    addChecked(reservedByLot, task.sourceLot, task.quantity);
    addChecked(reservedBySourceMaterial, `${task.source}\0${task.material}`, task.quantity);
    if (validQuantity(task.quantity) && validMaterial(task.material)) {
      addChecked(
        promisedByDestinationMaterial,
        `${task.destination}\0${task.material}`,
        task.quantity,
      );
      addChecked(promisedByDestination, task.destination, task.quantity);
    }
  }

  const availableSources = sourceIds.filter(
    (source) =>
      containers.has(source) &&
      !sealed.has(source) &&
      !invalidContainers.has(source),
  );
  const sourceLots = lots
    .map((lot) => ({ id: lot.id, lot }))
    .filter(({ lot }) => availableSources.includes(lot.container))
    .sort((left, right) => compareId(left.id, right.id));
  const created: EntityId[] = [];
  const plannedIds = new Set(tasks.map((row) => row.id));
  const plannedRecords: EntityRecord[] = [];
  for (const requirement of requirements) {
    const destinationContainer = containers.get(requirement.destination);
    if (
      !destinationContainer ||
      sealed.has(requirement.destination) ||
      invalidContainers.has(requirement.destination) ||
      !validQuantity(destinationContainer.capacity)
    )
      continue;
    const destinationQuantity =
      quantityByContainer.get(requirement.destination) ?? 0;
    const key = `${requirement.destination}\0${requirement.material}`;
    const stocked = quantityByDestinationMaterial.get(key) ?? 0;
    let promised = promisedByDestinationMaterial.get(key) ?? 0;
    let remaining = requirement.quantity - stocked - promised;
    let freeCapacity =
      destinationContainer.capacity -
      destinationQuantity -
      (promisedByDestination.get(requirement.destination) ?? 0);
    if (remaining < 1 || freeCapacity < 1) continue;
    for (const source of sourceLots) {
      if (remaining < 1 || freeCapacity < 1) break;
      if (
        source.lot.kind !== requirement.material ||
        invalidContainers.has(source.lot.container) ||
        source.lot.container === requirement.destination
      )
        continue;
      let available = source.lot.quantity - (reservedByLot.get(source.id) ?? 0);
      const sourceKey = `${source.lot.container}\0${source.lot.kind}`;
      available = Math.min(available, (sourceMaterialTotals.get(sourceKey) ?? 0) - (reservedBySourceMaterial.get(sourceKey) ?? 0));
      if (available <= 0) continue;
      const legKey = `${requirement.destination}\0${requirement.material}\0${source.id}`;
      let leg = nextLegByLot.get(legKey) ?? 0;
      while (available > 0 && remaining > 0 && freeCapacity > 0) {
        const quantity = Math.min(batchQuantity, remaining, freeCapacity, available);
        if (!validQuantity(quantity)) break;
        let id = taskId(requirement.destination, requirement.material, source.id, leg);
        while (plannedIds.has(id)) { leg++; id = taskId(requirement.destination, requirement.material, source.id, leg); }
      const record: EntityRecord = {
        id,
        components: {
          [DeliveryTask.id]: {
            actor: null,
            sourceLot: source.id,
            source: source.lot.container,
            destination: requirement.destination,
            material: requirement.material,
            // This is a finite planning cap. The delivery provider must preserve
            // it when applying a worker's DeliveryControl quantity.
            quantity,
            phase: "idle",
          },
        },
      };
      plannedRecords.push(record);
      plannedIds.add(id);
      created.push(id);
      reservedByLot.set(source.id, (reservedByLot.get(source.id) ?? 0) + quantity);
      reservedBySourceMaterial.set(sourceKey, (reservedBySourceMaterial.get(sourceKey) ?? 0) + quantity);
      remaining -= quantity;
      freeCapacity -= quantity;
      available -= quantity;
      leg++;
      promised += quantity;
      promisedByDestinationMaterial.set(key, promised);
      promisedByDestination.set(
        requirement.destination,
        (promisedByDestination.get(requirement.destination) ?? 0) + quantity,
      );
      }
      nextLegByLot.set(legKey, leg);
    }
  }
  for (const id of removals) context.removeAuthoredEntity(id);
  for (const record of plannedRecords) context.createAuthoredEntity(record);
  return created;
}
