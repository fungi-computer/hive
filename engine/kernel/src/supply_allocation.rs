//! Native ownership of finite supply portions and incoming capacity.
//!
//! Allocations are ordinary ECS records. Their physical effects still go
//! through `Kernel::transfer`; the rebuildable reservation index derives
//! accounting so save/reload cannot lose or duplicate the reservation.

use crate::components::{Container, Lot, SupplyAllocation, SupplyAllocationState};
use bevy_ecs::prelude::Entity;
use std::collections::{BTreeMap, BTreeSet};

/// Rebuildable reservation index. Physical custody remains on Lot; this index
/// only narrows active reservation accounting by source and destination.
#[derive(Default)]
pub(crate) struct SupplyAllocationIndex {
    by_source: BTreeMap<String, BTreeSet<String>>,
    by_destination: BTreeMap<String, BTreeSet<String>>,
    by_requirement: BTreeMap<(String, String, u64, String, String), BTreeSet<String>>,
    by_id: BTreeMap<String, (String, String, (String, String, u64, String, String))>,
    active: BTreeSet<String>,
}

impl SupplyAllocationIndex {
    pub(crate) fn rebuild(&mut self, ids: &BTreeMap<String, Entity>, world: &bevy_ecs::prelude::World) {
        self.by_source.clear(); self.by_destination.clear(); self.by_requirement.clear(); self.by_id.clear(); self.active.clear();
        for (id, entity) in ids {
            if let Some(allocation) = world.get::<SupplyAllocation>(*entity).filter(|allocation| allocation.state == SupplyAllocationState::Reserved) { self.insert(id, allocation); }
        }
    }
    pub(crate) fn refresh(&mut self, id: &str, allocation: Option<&SupplyAllocation>) {
        if let Some((source, destination, requirement)) = self.by_id.remove(id) {
            let empty = self.by_source.get_mut(&source).map(|ids| { ids.remove(id); ids.is_empty() }).unwrap_or(false);
            if empty { self.by_source.remove(&source); }
            let empty = self.by_destination.get_mut(&destination).map(|ids| { ids.remove(id); ids.is_empty() }).unwrap_or(false);
            if empty { self.by_destination.remove(&destination); }
            let empty = self.by_requirement.get_mut(&requirement).map(|ids| { ids.remove(id); ids.is_empty() }).unwrap_or(false);
            if empty { self.by_requirement.remove(&requirement); }
        }
        self.active.remove(id);
        if let Some(allocation) = allocation.filter(|allocation| allocation.state == SupplyAllocationState::Reserved) { self.insert(id, allocation); }
    }
    fn insert(&mut self, id: &str, allocation: &SupplyAllocation) {
        self.by_source.entry(allocation.portion.clone()).or_default().insert(id.to_owned());
        self.by_destination.entry(allocation.destination.clone()).or_default().insert(id.to_owned());
        let requirement = (allocation.requirement_owner.clone(), allocation.requirement_role.clone(), allocation.requirement_generation, allocation.destination.clone(), allocation.material.clone());
        self.by_requirement.entry(requirement.clone()).or_default().insert(id.to_owned());
        self.by_id.insert(id.to_owned(), (allocation.portion.clone(), allocation.destination.clone(), requirement));
        self.active.insert(id.to_owned());
    }
    pub(crate) fn ids_for_source(&self, source: &str) -> impl Iterator<Item = &String> { self.by_source.get(source).into_iter().flatten() }
    pub(crate) fn ids_for_destination(&self, destination: &str) -> impl Iterator<Item = &String> { self.by_destination.get(destination).into_iter().flatten() }
    pub(crate) fn active_ids(&self) -> impl Iterator<Item = &String> { self.active.iter() }
    pub(crate) fn ids_for_requirement(&self, owner: &str, role: &str, generation: u64, destination: &str, material: &str) -> impl Iterator<Item = &String> {
        self.by_requirement.get(&(owner.to_owned(), role.to_owned(), generation, destination.to_owned(), material.to_owned())).into_iter().flatten()
    }
}

pub(crate) fn reserved_source(kernel: &crate::world::Kernel, lot: &str, ignore: Option<&str>) -> u32 {
    kernel.supply_index().ids_for_source(lot).filter(|id| Some(id.as_str()) != ignore).filter_map(|id| kernel.supply_allocation(id)).map(|a| a.quantity).sum()
}

pub(crate) fn reserved_destination(kernel: &crate::world::Kernel, destination: &str, ignore: Option<&str>) -> u32 {
    kernel.supply_index().ids_for_destination(destination).filter(|id| Some(id.as_str()) != ignore).filter_map(|id| kernel.supply_allocation(id)).map(|a| a.quantity).sum()
}

pub(crate) fn validate_capacity(kernel: &crate::world::Kernel, source: Entity, destination: Entity, quantity: u32, ignore: Option<&str>) -> Result<(), String> {
    let lot = kernel.ecs().get::<Lot>(source).ok_or("supply portion is missing")?;
    let target = kernel.ecs().get::<Container>(destination).ok_or("supply destination is not a container")?;
    let source_reserved = reserved_source(kernel, &kernel.external_id(source)?, ignore);
    if quantity > lot.quantity.saturating_sub(source_reserved) { return Err("supply source portion is overbooked".into()); }
    let present = kernel.quantity_in_container(&kernel.external_id(destination)?);
    let incoming = reserved_destination(kernel, &kernel.external_id(destination)?, ignore);
    if u64::from(present).saturating_add(u64::from(incoming)).saturating_add(u64::from(quantity)) > u64::from(target.capacity) { return Err("supply destination capacity is overbooked".into()); }
    Ok(())
}

/// Validate reservation accounting against the one physical lot/container owner.
pub(crate) fn validate_relations(kernel: &crate::world::Kernel) -> Result<(), String> {
    use crate::components::{GroundStock, OwnedByParty, Party};
    for (id, allocation) in kernel.supply_allocations() {
        let allocation_entity = kernel.entity(id)?;
        let party = kernel.entity(&allocation.party)?;
        if kernel.ecs().get::<Party>(party).is_none() || kernel.ecs().get::<OwnedByParty>(allocation_entity).map(|owner| owner.party.as_str()) != Some(allocation.party.as_str()) { return Err("supply allocation party relationship is invalid".into()); }
        kernel.entity(&allocation.requirement_owner)?;
        let destination = kernel.entity(&allocation.destination)?;
        if kernel.ecs().get::<Container>(destination).is_none() || kernel.ecs().get::<OwnedByParty>(destination).map(|owner| owner.party.as_str()) != Some(allocation.party.as_str()) { return Err("supply allocation destination relationship is invalid".into()); }
        let portion = kernel.entity(&allocation.portion)?;
        let lot = kernel.ecs().get::<Lot>(portion).ok_or("supply allocation portion is not a lot")?;
        let source_entity = kernel.entity(&lot.container)?;
        let public_ground = kernel.ecs().get::<GroundStock>(source_entity).is_some() && kernel.ecs().get::<OwnedByParty>(source_entity).is_none();
        let lot_party_ok = kernel.ecs().get::<OwnedByParty>(portion).map(|owner| owner.party.as_str()) == Some(allocation.party.as_str()) || (public_ground && kernel.ecs().get::<OwnedByParty>(portion).is_none());
        if lot.kind != allocation.material || lot.quantity < allocation.quantity || !lot_party_ok { return Err("supply allocation portion relationship is invalid".into()); }
        match allocation.state {
            SupplyAllocationState::Delivered => if lot.container != allocation.destination || lot.quantity != allocation.quantity { return Err("delivered supply allocation has invalid custody".into()); },
            SupplyAllocationState::Cancelled => if kernel.work_attempt(id).is_some() { return Err("cancelled supply allocation still owns work".into()); },
            SupplyAllocationState::Reserved => {
                let carrier_worker = {
                    let mut carrier = lot.container.clone();
                    let mut worker = None;
                    for _ in 0..16 {
                        let Ok(entity) = kernel.entity(&carrier) else { break; };
                        if kernel.ecs().get::<crate::components::PartyMember>(entity).is_some() {
                            worker = Some(carrier);
                            break;
                        }
                        let Some(nested) = kernel.ecs().get::<Lot>(entity) else { break; };
                        carrier = nested.container.clone();
                    }
                    worker
                };
                let at_worker = carrier_worker.as_deref().and_then(|id| kernel.entity(id).ok()).is_some_and(|worker| {
                    kernel.ecs().get::<crate::components::PartyMember>(worker).is_some_and(|member| member.party == allocation.party)
                        && kernel.ecs().get::<crate::components::Container>(worker).is_some()
                        && kernel.ecs().get::<crate::components::Traversal>(worker).is_some()
                        && kernel.ecs().get::<crate::components::Position>(worker).is_some()
                        && kernel.ecs().get::<crate::components::Body>(worker).is_some_and(|body| body.speed.is_finite() && body.speed > 0.0)
                        && kernel.ecs().get::<crate::work_planner::WorkParticipation>(worker).is_some()
                        && lot.quantity == allocation.quantity
                        && kernel.work_attempt(id).is_none_or(|attempt| attempt.party == allocation.party && Some(attempt.worker.as_str()) == carrier_worker.as_deref())
                });
                let at_source = kernel.entity(&lot.container).ok().is_some_and(|container| {
                    let public_ground = kernel.ecs().get::<GroundStock>(container).is_some() && kernel.ecs().get::<OwnedByParty>(container).is_none();
                    kernel.ecs().get::<GroundStock>(container).is_some()
                        && (kernel.ecs().get::<OwnedByParty>(container).map(|owner| owner.party.as_str()) == Some(allocation.party.as_str()) || public_ground)
                });
                if !at_worker && !at_source { return Err("reserved supply allocation has invalid custody".into()); }
                validate_capacity(kernel, portion, destination, allocation.quantity, Some(id))?;
            }
        }
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::components::SupplyAllocation;
    use crate::world::Kernel;
    use serde_json::{json, Value};

    fn kernel() -> Kernel {
        let mut kernel = Kernel::new();
        kernel.load(&json!({"format":"hive-game","version":2,"game":"supplies","components":[],"materialCatalog":[],"initial":[
            {"id":"party","components":{"hive.party":{"ownerPlayer":"p"}}},
            {"id":"w1","components":{"hive.party-member":{"party":"party"},"hive.position":{"x":0,"y":0,"z":0,"facing":0},"hive.container":{"capacity":4}}},
            {"id":"w2","components":{"hive.party-member":{"party":"party"},"hive.position":{"x":0,"y":0,"z":0,"facing":0},"hive.container":{"capacity":4}}},
            {"id":"source","components":{"hive.owned-by-party":{"party":"party"},"hive.position":{"x":0,"y":0,"z":0,"facing":0},"hive.container":{"capacity":8},"hive.ground-stock":{}}},
            {"id":"destination","components":{"hive.owned-by-party":{"party":"party"},"hive.position":{"x":0,"y":0,"z":0,"facing":0},"hive.container":{"capacity":8}}},
            {"id":"wood","components":{"hive.owned-by-party":{"party":"party"},"hive.lot":{"kind":"wood","quantity":6,"container":"source"}}}
        ]}).to_string()).unwrap();
        let source = kernel.entity("source").unwrap();
        let lot = kernel.entity("wood").unwrap();
        assert!(kernel.ecs().get::<Lot>(lot).is_some() && kernel.ecs().get::<Container>(source).is_some());
        kernel
    }

    #[test]
    fn two_partial_allocations_are_independent_and_overbooking_is_rejected() {
        let mut kernel = kernel();
        let a = kernel.reserve_supply_allocation("party".into(), "wood".into(), 1, "party".into(), "wood".into(), "wood".into(), "destination".into(), 3).unwrap();
        let b = kernel.reserve_supply_allocation("party".into(), "wood".into(), 1, "party".into(), "wood".into(), "wood".into(), "destination".into(), 3).unwrap();
        assert_ne!(a, b);
        assert!(kernel.reserve_supply_allocation("party".into(), "wood".into(), 1, "party".into(), "wood".into(), "wood".into(), "destination".into(), 1).is_err());
        assert_eq!(kernel.ecs().get::<Lot>(kernel.entity("wood").unwrap()).unwrap().quantity, 6);
        let rows: Value = serde_json::from_str(&kernel.query_json("[\"hive.supply-allocation\"]").unwrap()).unwrap();
        assert_eq!(rows.as_array().unwrap().len(), 2);
        for request in [
            json!({"kind":"consume","entity":"source","lot":"wood","quantity":1}),
            json!({"kind":"transfer","lot":"wood","from":"source","to":"destination","quantity":1}),
        ] {
            let result: Value = serde_json::from_str(&kernel.advance_json(&json!({"delta":0,"writes":[],"actions":[{"scope":{"kind":"host"},"request":request}]}).to_string()).unwrap()).unwrap();
            assert_eq!(result["results"][0]["accepted"], false);
        }
        assert_eq!(kernel.ecs().get::<Lot>(kernel.entity("wood").unwrap()).unwrap().quantity, 6);
    }

    #[test]
    fn cancellation_releases_capacity_and_delivery_preserves_custody() {
        let mut kernel = kernel();
        let a = kernel.reserve_supply_allocation("party".into(), "wood".into(), 1, "party".into(), "wood".into(), "wood".into(), "destination".into(), 3).unwrap();
        kernel.cancel_supply_allocation(&a).unwrap();
        let b = kernel.reserve_supply_allocation("party".into(), "wood".into(), 1, "party".into(), "wood".into(), "wood".into(), "destination".into(), 3).unwrap();
        let wood = kernel.ecs().get::<Lot>(kernel.entity("wood").unwrap()).unwrap();
        assert_eq!((wood.container.as_str(), wood.quantity), ("source", 6));
        assert_eq!(kernel.quantity_in_container("destination"), 0);
        let saved = kernel.snapshot_json().unwrap();
        let mut restored = Kernel::new(); restored.restore_json(&saved).unwrap();
        assert_eq!(restored.quantity_in_container("destination"), 0);
        assert_eq!(restored.ecs().get::<SupplyAllocation>(restored.entity(&b).unwrap()).unwrap().state, SupplyAllocationState::Reserved);
        let mut invalid: Value = serde_json::from_str(&saved).unwrap();
        invalid["scene"]["initial"].as_array_mut().unwrap().iter_mut().find(|record| record["id"] == b).unwrap()["components"]["hive.supply-allocation"]["destination"] = json!("w1");
        assert_eq!(Kernel::new().restore_json(&invalid.to_string()).unwrap_err(), "supply allocation destination relationship is invalid");

        let mut invalid_carrier: Value = serde_json::from_str(&saved).unwrap();
        let lot = invalid_carrier["scene"]["initial"]
            .as_array_mut()
            .unwrap()
            .iter_mut()
            .find(|record| record["id"] == "wood")
            .unwrap();
        lot["components"]["hive.lot"]["container"] = json!("w1");
        lot["components"]["hive.lot"]["quantity"] = json!(3);
        assert_eq!(
            Kernel::new()
                .restore_json(&invalid_carrier.to_string())
                .unwrap_err(),
            "reserved supply allocation has invalid custody"
        );
    }
}
