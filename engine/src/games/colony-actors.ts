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

/** Game-owned templates available to native lifecycle operations. */
export const colonyActors = Object.freeze([
  ColonyPartyActor,
  ColonyWorkerActor,
  ColonyStoreActor,
  ColonyPailActor,
  ColonyKegActor,
  ColonyBarmActor,
  ColonyCatActor,
]);
