import { actor, actorInput } from "../sdk/behavior";
import {
  Body,
  Container,
  MaterialLot,
  Position,
  Traversal,
  VesselCapability,
  Visual,
} from "../sdk/common";
import { GroundStock } from "../sdk/ground-stock";
import { OwnedByParty, Party, PartyMember } from "../sdk/party";
import { WorkParticipation } from "../sdk/work-control";
import { Worker } from "./colony-components";

export const ColonyPartyActor = actor("colony.party")
  .with(Party, { ownerPlayer: actorInput.string("owner-player") });

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
  .with(GroundStock, {})
  .with(OwnedByParty, { party: actorInput.reference("party") })
  .with(Visual, {
    sprite: actorInput.string("sprite"),
    label: actorInput.string("label"),
  });

export const ColonyPailActor = actor("colony.pail")
  .with(MaterialLot, {
    quantity: 1,
    kind: "pail",
    container: actorInput.reference("holder"),
  })
  .with(Container, { capacity: 7 })
  .with(VesselCapability, { acceptsWater: true })
  .with(OwnedByParty, { party: actorInput.reference("party") })
  .with(Visual, { sprite: "pail", label: "Pail" });

/** Game-owned templates available to native lifecycle operations. */
export const colonyActors = Object.freeze([
  ColonyPartyActor,
  ColonyWorkerActor,
  ColonyStoreActor,
  ColonyPailActor,
]);
