import { actor, actorInput } from "../sdk/behavior";
import {
  Body,
  Container,
  Position,
  Traversal,
  VesselCapability,
  Visual,
} from "../sdk/common";
import { OwnedBy, OwnedByParty, Party, PartyMember } from "../sdk/party";
import { WorkParticipation } from "../sdk/work-control";
import { StorageProvider } from "../sdk/stockpile";
import { Worker } from "./colony-components";
import { Cat } from "./colony-cat";
import { Buildable } from "../sdk/construction";

export const ColonyPartyActor = actor("colony.party")
  .with(Party, {})
  .with(OwnedBy, { player: actorInput.string("owner-player") });

export const ColonyWorkerActor = actor("colony.worker")
  .with(Position, {
    x: actorInput.number("spawn-x"),
    y: actorInput.number("spawn-y"),
    z: actorInput.number("spawn-z"),
    facing: 0,
  })
  .with(Body, { speed: 2 })
  .with(Container, { capacity: 4 })
  .with(Traversal, { clearanceCells: 1, maxStepCells: 1 })
  .with(Visual, {
    sprite: actorInput.string("sprite"),
    label: actorInput.string("label"),
  })
  .with(PartyMember, { party: actorInput.reference("party") })
  .with(OwnedBy, { player: actorInput.string("owner-player") })
  .with(OwnedByParty, { party: actorInput.reference("party") })
  .with(WorkParticipation, { automatic: true })
  .with(Worker, { guest: false });

export const ColonyStoreActor = actor("colony.store")
  .with(Position, {
    x: actorInput.number("spawn-x"),
    y: actorInput.number("spawn-y"),
    z: actorInput.number("spawn-z"),
    facing: 0,
  })
  .with(Container, { capacity: actorInput.number("capacity") })
  .with(StorageProvider, {})
  .with(OwnedBy, { player: actorInput.string("owner-player") })
  .with(OwnedByParty, { party: actorInput.reference("party") })
  .with(Visual, {
    sprite: actorInput.string("sprite"),
    label: actorInput.string("label"),
  });

export const ColonyPailActor = actor("colony.pail")
  .with(Container, { capacity: 7 })
  .with(VesselCapability, { acceptsWater: true })
  .with(Visual, { sprite: "pail", label: "Pail" });

export const ColonyKegActor = actor("colony.keg")
  .with(Container, { capacity: 4 });

export const ColonyBarmActor = actor("colony.barm")
  .with(Container, { capacity: 1 });

export const ColonyCatActor = actor("colony.cat")
  .with(Position, {
    x: actorInput.number("spawn-x"),
    y: actorInput.number("spawn-y"),
    z: actorInput.number("spawn-z"),
    facing: 0,
  })
  .with(Body, { speed: 0.9 })
  .with(Traversal, { clearanceCells: 1, maxStepCells: 1 })
  .with(Cat, {
    home: actorInput.reference("home"),
    nextAt: 0,
    seed: 1,
    blockedUntil: 0,
  })
  .with(Visual, { sprite: "colony.cat", label: "Mallow" });

/** One real furniture consumer of the actor-to-native-construction compiler. */
export const TimberBedActor = actor("timber-bed")
  .with(Buildable, {
    shape: { kind: "fixture", footprint: [[0, 0], [0, 1]] },
    materials: [{ kind: "wood", quantity: 2 }],
    workSeconds: 3,
    workReachBelowCells: 0,
    placement: { alignment: "fixed", facing: { south: 0, east: 1, north: 0, west: 1 } },
    onRemove: { salvage: [{ kind: "wood", quantity: 2 }] },
  })
  .with(Visual, { sprite: "colony.bed.finished", label: "Timber bed" });

export const TimberFloorActor = actor("timber-floor")
  .with(Buildable, {
    shape: { kind: "floor" },
    materials: [{ kind: "wood", quantity: 2 }],
    workSeconds: 2,
    workReachBelowCells: 4,
    placement: { alignment: "fixed", facing: { south: 0, east: 1, north: 2, west: 3 } },
    onRemove: { salvage: [{ kind: "wood", quantity: 2 }] },
  })
  .with(Visual, { sprite: "colony.floor.finished", label: "Timber floor" });

export const TimberWallActor = actor("timber-wall")
  .with(Buildable, {
    shape: { kind: "wall", height: 4 },
    materials: [{ kind: "wood", quantity: 4 }],
    workSeconds: 4,
    workReachBelowCells: 0,
    placement: { alignment: "stroke", facing: { south: 0, east: 1, north: 2, west: 3 } },
    onRemove: { salvage: [{ kind: "wood", quantity: 4 }] },
  })
  .with(Visual, { sprite: "colony.wall.finished", label: "Timber wall" });

/** Game-owned templates available to native lifecycle operations. */
export const colonyActors = Object.freeze([
  ColonyPartyActor,
  ColonyWorkerActor,
  ColonyStoreActor,
  ColonyPailActor,
  ColonyKegActor,
  ColonyBarmActor,
  ColonyCatActor,
  TimberBedActor,
  TimberFloorActor,
  TimberWallActor,
]);
