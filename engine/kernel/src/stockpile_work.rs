//! Native stockpile demand and rehaul policy.
//!
//! A stockpile cell is a policy over a positioned physical container.  This
//! module turns available visible lots into ordinary supply requirements; it
//! does not own a second inventory or delivery lifecycle.
use crate::components::{Container, GroundStock, Lot, OwnedByParty, Position, SealedContainer, StockpileCell};
use crate::supply_allocation::reserved_source;
use crate::world::Kernel;
use std::collections::{BTreeMap, BTreeSet};
use sha2::{Digest, Sha256};

const MAX_DEMAND_MATERIALS: usize = 64;
const MAX_SOURCE_LOTS: usize = 4096;

pub(crate) fn policy_generation(policy: &StockpileCell) -> u64 {
    let mut digest = Sha256::new();
    digest.update(policy.priority.to_le_bytes());
    digest.update((policy.filter_profile.len() as u64).to_le_bytes());
    digest.update(policy.filter_profile.as_bytes());
    let bytes = digest.finalize();
    let value = u64::from_le_bytes(bytes[..8].try_into().expect("sha256 prefix"));
    if value == 0 { 1 } else { value }
}

pub(crate) fn allocation_is_current(kernel: &Kernel, allocation: &crate::components::SupplyAllocation) -> bool {
    let Ok(destination) = kernel.entity(&allocation.destination) else { return true; };
    let Some(policy) = kernel.ecs.get::<StockpileCell>(destination) else { return true; };
    kernel.stockpile_profile(&policy.filter_profile).is_some_and(|profile| {
        allocation.requirement_generation == policy_generation(policy) && accepts(profile, &allocation.material)
    })
}

/// A domain contribution consumed by the shared native supply matcher.
#[derive(Clone, Debug)]
pub(crate) struct StockpileDemand {
    pub(crate) material: String,
    pub(crate) quantity: u32,
    pub(crate) source_lots: BTreeSet<String>,
}

fn accepts(profile: &crate::stockpile_definition::StockpileProfileDefinition, material: &str) -> bool {
    if profile.denied_materials.iter().any(|denied| denied == material) { return false; }
    profile.allowed_materials.iter().any(|allowed| allowed == material)
        || profile.material_categories.get(material).is_some_and(|category| profile.allowed_categories.iter().any(|allowed| allowed == category))
}

fn source_is_public_ground(kernel: &Kernel, source: &str) -> bool {
    kernel.entity(source).ok().is_some_and(|entity| kernel.ecs.get::<GroundStock>(entity).is_some())
}

/// Collect demand for one due destination. Lots are visible physical stock,
/// ordered by stable ID. A lot accepted by its current stockpile may rehaul
/// only into a strictly higher-priority destination; invalid current storage
/// is repairable at any accepting destination.
pub(crate) fn collect(kernel: &Kernel, cell_id: &str, party: &str) -> Result<Vec<StockpileDemand>, String> {
    let cell_entity = kernel.entity(cell_id)?;
    let policy = kernel.ecs.get::<StockpileCell>(cell_entity).ok_or("stockpile demand target is not a cell")?.clone();
    let Some(profile) = kernel.stockpile_profile(&policy.filter_profile) else { return Ok(Vec::new()); };
    if kernel.ecs.get::<OwnedByParty>(cell_entity).map(|owner| owner.party.as_str()) != Some(party)
        || kernel.ecs.get::<Container>(cell_entity).is_none()
        || kernel.ecs.get::<Position>(cell_entity).is_none()
        || kernel.ecs.get::<SealedContainer>(cell_entity).is_some()
    {
        return Ok(Vec::new());
    }
    let capacity = kernel.ecs.get::<Container>(cell_entity).ok_or("stockpile demand target is not a container")?.capacity;
    let occupied = kernel.quantity_in_container(cell_id)
        .saturating_add(crate::supply_allocation::reserved_destination(kernel, cell_id, None));
    let mut free = capacity.saturating_sub(occupied);
    if free == 0 { return Ok(Vec::new()); }

    let mut lots_by_material = BTreeMap::<String, (u32, BTreeSet<String>)>::new();
    // `contents` is the canonical container-to-lot index maintained by the
    // physical custody owner. Iterate only visible physical sources and sort
    // their stable IDs before applying policy, rather than scanning every ECS
    // entity for every destination.
    let mut visible_lots = Vec::new();
    for source_container in &kernel.visible_source_containers {
        let Some(entries) = kernel.contents.get(source_container) else { continue; };
        let Some(source_entity) = kernel.entity(source_container).ok() else { continue; };
        let source_cell = kernel.ecs.get::<StockpileCell>(source_entity).cloned();
        if kernel.ecs.get::<SealedContainer>(source_entity).is_some()
            || (source_cell.is_none() && kernel.ecs.get::<GroundStock>(source_entity).is_none())
            || kernel.ecs.get::<Position>(source_entity).is_none()
        { continue; }
        for lot_entity in entries {
            let Some(lot_id) = kernel.ecs.get::<crate::components::ExternalId>(*lot_entity).map(|id| id.0.clone()) else { continue; };
            visible_lots.push((lot_id, *lot_entity, source_container.clone(), source_cell.clone()));
        }
    }
    visible_lots.sort_by(|left, right| left.0.cmp(&right.0));
    for (lot_id, lot_entity, source_container, source_cell) in visible_lots {
        let Some(lot) = kernel.ecs.get::<Lot>(lot_entity) else { continue; };
        if lot.quantity == 0 || lot.container == cell_id || !accepts(profile, &lot.kind) { continue; }
        let Some(source_entity) = kernel.entity(&source_container).ok() else { continue; };
        let public_ground = source_is_public_ground(kernel, &source_container);
        let source_party_ok = kernel.ecs.get::<OwnedByParty>(source_entity).map(|owner| owner.party.as_str()) == Some(party) || (public_ground && kernel.ecs.get::<OwnedByParty>(source_entity).is_none());
        let lot_party_ok = kernel.ecs.get::<OwnedByParty>(lot_entity).map(|owner| owner.party.as_str()) == Some(party) || (public_ground && kernel.ecs.get::<OwnedByParty>(lot_entity).is_none());
        if !source_party_ok || !lot_party_ok { continue; }
        if let Some(source_policy) = source_cell {
            // A lot already accepted by its source storage is moved only to a
            // strictly higher priority destination. Invalid current storage
            // is repairable at any accepting destination.
            if kernel.stockpile_profile(&source_policy.filter_profile).is_some_and(|source_profile| accepts(source_profile, &lot.kind))
                && policy.priority <= source_policy.priority { continue; }
        }
        let available = lot.quantity.saturating_sub(reserved_source(kernel, &lot_id, None));
        if available == 0 { continue; }
        let entry = lots_by_material.entry(lot.kind.clone()).or_default();
        if !entry.1.contains(&lot_id) && entry.1.len() >= MAX_SOURCE_LOTS { continue; }
        entry.0 = entry.0.saturating_add(available);
        entry.1.insert(lot_id);
    }

    let mut demands = Vec::new();
    for (material, (available, source_lots)) in lots_by_material {
        if free == 0 || demands.len() == MAX_DEMAND_MATERIALS { break; }
        let quantity = available.min(free);
        if quantity == 0 { continue; }
        free -= quantity;
        demands.push(StockpileDemand { material, quantity, source_lots });
    }
    Ok(demands)
}

/// Install the shared scheduler records at each stockpile creation/load
/// boundary. The planner tick consumes its existing indexed task set and does
/// not discover cells by crawling the whole ECS.
pub(super) fn install_planner_state(kernel: &mut Kernel, id: &str, entity: bevy_ecs::prelude::Entity) -> crate::components::Result<()> {
    let Some(owner) = kernel.ecs.get::<OwnedByParty>(entity).cloned() else { return Ok(()); };
    let schedule = kernel.ecs.get::<crate::work_planner::WorkSchedule>(entity).cloned().unwrap_or(crate::work_planner::WorkSchedule { next_review_tick: kernel.revision, last_considered: kernel.revision.saturating_sub(1) });
    kernel.ecs.entity_mut(entity).insert((crate::work_planner::WorkPolicy { party: owner.party, priority: 0, enabled: true }, schedule));
    kernel.refresh_planner_index(id);
    Ok(())
}

/// Release reservations that have not entered physical custody when a zone
/// policy changes. A carried lot remains owned by its existing allocation and
/// is allowed to finish through the ordinary custody/recovery path.
pub(crate) fn cancel_unpicked_for_zone(kernel: &mut Kernel, zone: &str) -> crate::components::Result<()> {
    let allocations = kernel.supply_allocations().filter_map(|(id, allocation)| {
        let destination = kernel.entity(&allocation.destination).ok()?;
        let source_zone = kernel.entity(&allocation.portion).ok()
            .and_then(|lot_entity| {
                let lot = kernel.ecs.get::<Lot>(lot_entity)?;
                let source = kernel.entity(&lot.container).ok()?;
                kernel.ecs.get::<StockpileCell>(source)
            })
            .is_some_and(|cell| cell.zone == zone);
        (allocation.state == crate::components::SupplyAllocationState::Reserved
            && (source_zone || kernel.ecs.get::<StockpileCell>(destination).is_some_and(|cell| cell.zone == zone)))
            .then_some((id.to_owned(), allocation.clone()))
    }).collect::<Vec<_>>();
    for (id, allocation) in allocations {
        let lot = kernel.ecs.get::<Lot>(kernel.entity(&allocation.portion)?).ok_or("stockpile allocation portion is missing")?;
        let carried = kernel.entity(&lot.container).ok().is_some_and(|container| kernel.ecs.get::<crate::components::PartyMember>(container).is_some());
        if carried { continue; }
        if let Some(attempt) = kernel.work_attempt(&id).cloned() {
            match attempt.phase {
                crate::work_attempt::AttemptPhase::Executing { operation, .. } => kernel.interrupt_work_attempt(id.clone(), operation.attempt.generation, operation.sequence, crate::work_attempt::InterruptCause::Cancelled)?,
                crate::work_attempt::AttemptPhase::Outcome { operation, .. } => kernel.acknowledge_work_attempt(id.clone(), operation.attempt.generation, operation.sequence)?,
                _ => {}
            }
        }
        if kernel.supply_allocations().any(|(candidate, _)| candidate == id) {
            kernel.cancel_and_retire_supply_allocation(&id)?;
        }
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    fn kernel() -> Kernel {
        let mut kernel = Kernel::new();
        kernel.load(&json!({
            "format": "hive-game", "version": 2, "game": "stockpile",
            "components": [], "materialCatalog": [{"kind":"bread","unitVolume":1},{"kind":"wood","unitVolume":1}],
            "stockpileProfiles": [
                {"id":"wood", "materialCategories":{"wood":"building"}, "allowedCategories":["building"]},
                {"id":"food", "materialCategories":{"bread":"food"}, "allowedCategories":["food"]}
            ],
            "initial": [
                {"id":"party", "components":{"hive.party":{"ownerPlayer":"p"}}},
                {"id":"source", "components":{"hive.position":{"x":0,"y":0,"z":0,"facing":0},"hive.container":{"capacity":8},"hive.stockpile-cell":{"zone":"low","priority":1,"filterProfile":"wood"},"hive.owned-by-party":{"party":"party"}}},
                {"id":"target", "components":{"hive.position":{"x":1,"y":0,"z":0,"facing":0},"hive.container":{"capacity":4},"hive.stockpile-cell":{"zone":"high","priority":2,"filterProfile":"wood"},"hive.owned-by-party":{"party":"party"}}},
                {"id":"invalid", "components":{"hive.position":{"x":2,"y":0,"z":0,"facing":0},"hive.container":{"capacity":4},"hive.stockpile-cell":{"zone":"bad","priority":1,"filterProfile":"food"},"hive.owned-by-party":{"party":"party"}}},
                {"id":"ground", "components":{"hive.position":{"x":3,"y":0,"z":0,"facing":0},"hive.container":{"capacity":8},"hive.ground-stock":{},"hive.owned-by-party":{"party":"party"}}},
                {"id":"lot-low", "components":{"hive.lot":{"kind":"wood","quantity":2,"container":"source"},"hive.owned-by-party":{"party":"party"}}},
                {"id":"lot-invalid", "components":{"hive.lot":{"kind":"wood","quantity":1,"container":"invalid"},"hive.owned-by-party":{"party":"party"}}},
                {"id":"lot-ground", "components":{"hive.lot":{"kind":"wood","quantity":1,"container":"ground"}}}
            ]
        }).to_string()).unwrap();
        kernel
    }

    #[test]
    fn profile_table_is_content_owned_and_rehaul_is_strict_only_for_valid_storage() {
        let kernel = kernel();
        let demands = collect(&kernel, "target", "party").unwrap();
        assert_eq!(demands.len(), 1);
        assert_eq!(demands[0].material, "wood");
        assert_eq!(demands[0].quantity, 4);
        assert_eq!(demands[0].source_lots.clone().into_iter().collect::<Vec<_>>(), vec!["lot-ground", "lot-invalid", "lot-low"]);

        let invalid_target = collect(&kernel, "invalid", "party").unwrap();
        assert!(invalid_target.is_empty(), "food policy must reject wood");
    }

    #[test]
    fn equal_priority_valid_storage_does_not_oscillate() {
        let mut kernel = kernel();
        let target = kernel.entity("target").unwrap();
        kernel.ecs.get_mut::<StockpileCell>(target).unwrap().priority = 1;
        assert!(collect(&kernel, "target", "party").unwrap().iter().all(|demand| !demand.source_lots.contains("lot-low")));

        // A source policy change makes its existing contents invalid. The
        // repair path is then allowed at equal priority and does not oscillate.
        kernel.ecs.get_mut::<StockpileCell>(kernel.entity("source").unwrap()).unwrap().filter_profile = "food".into();
        assert!(collect(&kernel, "target", "party").unwrap().iter().any(|demand| demand.source_lots.contains("lot-low")));
    }

    #[test]
    fn source_policy_change_cancels_unpicked_rehaul() {
        let mut kernel = kernel();
        let generation = policy_generation(kernel.ecs.get::<StockpileCell>(kernel.entity("target").unwrap()).unwrap());
        let allocation = kernel.reserve_supply_allocation(
            "target".into(), "wood".into(), generation, "party".into(),
            "wood".into(), "lot-low".into(), "target".into(), 1,
        ).unwrap();
        kernel.update_stockpile("party".into(), "low".into(), "food".into(), 1).unwrap();
        assert!(kernel.entity(&allocation).is_err(), "source policy changes retire stale unpicked rehaul");
    }
}
