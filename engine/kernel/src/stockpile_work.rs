//! Native stockpile demand and rehaul policy.
//!
//! A stockpile cell is policy painted onto a position. This module turns
//! available visible lots into ordinary supply requirements; it does not own
//! contents, capacity, or a second inventory/delivery lifecycle.
use crate::components::{Container, GroundStock, Lot, OwnedByParty, Position, SealedContainer, StockpileCell, WorkExecution};
use crate::supply_allocation::reserved_source;
use crate::world::Kernel;
use std::collections::{BTreeMap, BTreeSet};
use sha2::{Digest, Sha256};

const MAX_DEMAND_MATERIALS: usize = 64;
const MAX_SOURCE_LOTS: usize = 4096;
pub(crate) const DEFAULT_GROUND_STACK_CAPACITY: u32 = 3;

pub(crate) fn policy_generation(policy: &StockpileCell) -> u64 {
    let mut digest = Sha256::new();
    digest.update(policy.priority.to_le_bytes());
    digest.update((policy.filter_profile.len() as u64).to_le_bytes());
    digest.update(policy.filter_profile.as_bytes());
    let bytes = digest.finalize();
    let value = u64::from_le_bytes(bytes[..8].try_into().expect("sha256 prefix"));
    if value == 0 { 1 } else { value }
}

/// Resolve policy live from the painted entity at a physical position.
pub(crate) fn policy_at_position(kernel: &Kernel, position: &Position) -> Option<(String, StockpileCell)> {
    kernel.stockpile_policy_candidates_at(position).next()
}

/// Resolve the live painted policy for any physical destination at a position.
pub(crate) fn policy_for_destination(kernel: &Kernel, destination: &str) -> Option<(String, StockpileCell)> {
    let entity = kernel.entity(destination).ok()?;
    let position = kernel.ecs.get::<Position>(entity)?;
    policy_at_position(kernel, position)
}

fn eligible_provider_candidates(kernel: &Kernel, position: &Position, party: &str) -> Vec<(String, bevy_ecs::prelude::Entity)> {
    kernel.storage_provider_candidates_at(position).filter(|(_id, entity)| {
        kernel.ecs.get::<OwnedByParty>(*entity).map(|owner| owner.party.as_str()) == Some(party)
            && kernel.ecs.get::<Container>(*entity).is_some()
            && kernel.ecs.get::<SealedContainer>(*entity).is_none()
    }).collect()
}

fn eligible_ground_candidates(kernel: &Kernel, position: &Position, party: &str) -> Vec<(String, bevy_ecs::prelude::Entity)> {
    kernel.ground_stock_candidates_at(position).filter(|(_id, entity)| {
        kernel.ecs.get::<OwnedByParty>(*entity).map(|owner| owner.party.as_str()) == Some(party)
            && kernel.ecs.get::<Container>(*entity).is_some()
            && kernel.ecs.get::<SealedContainer>(*entity).is_none()
            && kernel.ecs.get::<GroundStock>(*entity).is_some()
    }).collect()
}

fn destination_at_position(kernel: &Kernel, position: &Position, party: &str, material: &str) -> Option<(String, bevy_ecs::prelude::Entity)> {
    // A positioned construction provider owns the floor contract while it is
    // present. A full provider blocks the floor beneath it; it never causes a
    // delivery to bypass the provider and create a competing ground stack.
    let positioned_providers = kernel.storage_provider_candidates_at(position).filter(|(_id, entity)| {
        kernel.ecs.get::<Container>(*entity).is_some()
            && kernel.ecs.get::<SealedContainer>(*entity).is_none()
    }).collect::<Vec<_>>();
    let candidates = if positioned_providers.is_empty() {
        eligible_ground_candidates(kernel, position, party).into_iter().filter(|(id, _entity)| {
            kernel.ground_stock_accepts(id, material)
        }).collect::<Vec<_>>()
    } else {
        eligible_provider_candidates(kernel, position, party)
    };
    candidates.into_iter().find(|(id, entity)| {
        let capacity = kernel.ecs.get::<Container>(*entity).map(|container| container.capacity).unwrap_or(0);
        let occupied = kernel.quantity_in_container(id)
            .saturating_add(crate::supply_allocation::reserved_destination(kernel, id, None));
        capacity.saturating_sub(occupied) > 0
    })
}

pub(crate) fn allocation_is_current(kernel: &Kernel, allocation: &crate::components::SupplyAllocation) -> bool {
    let Some((_, policy)) = policy_for_destination(kernel, &allocation.destination) else { return true; };
    kernel.stockpile_profile(&policy.filter_profile).is_some_and(|profile| {
        allocation.requirement_generation == policy_generation(&policy) && accepts(profile, &allocation.material)
    })
}

/// A domain contribution consumed by the shared native supply matcher.
#[derive(Clone, Debug)]
pub(crate) struct StockpileDemand {
    pub(crate) material: String,
    pub(crate) quantity: u32,
    pub(crate) source_lots: BTreeSet<String>,
    pub(crate) destination: String,
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
    if policy_at_position(kernel, kernel.ecs.get::<Position>(cell_entity).ok_or("stockpile policy has no position")?).is_some_and(|(id, _)| id != cell_id) {
        return Ok(Vec::new());
    }
    let Some(profile) = kernel.stockpile_profile(&policy.filter_profile) else { return Ok(Vec::new()); };
    if kernel.ecs.get::<OwnedByParty>(cell_entity).map(|owner| owner.party.as_str()) != Some(party)
        || kernel.ecs.get::<Position>(cell_entity).is_none()
        || kernel.ecs.get::<SealedContainer>(cell_entity).is_some()
    {
        return Ok(Vec::new());
    }
    let position = kernel.ecs.get::<Position>(cell_entity).ok_or("stockpile policy has no position")?;

    let mut lots_by_material = BTreeMap::<String, (u32, BTreeSet<String>)>::new();
    // `contents` is the canonical container-to-lot index maintained by the
    // physical custody owner. Iterate only visible physical sources and sort
    // their stable IDs before applying policy, rather than scanning every ECS
    // entity for every destination.
    let mut visible_lots = Vec::new();
    for source_container in &kernel.visible_source_containers {
        let Some(entries) = kernel.contents.get(source_container) else { continue; };
        let Some(source_entity) = kernel.entity(source_container).ok() else { continue; };
        if kernel.ecs.get::<SealedContainer>(source_entity).is_some()
            || kernel.ecs.get::<GroundStock>(source_entity).is_none()
            || kernel.ecs.get::<Position>(source_entity).is_none()
        { continue; }
        let source_cell = kernel.ecs.get::<Position>(source_entity).and_then(|position| policy_at_position(kernel, position).map(|(_, policy)| policy));
        for lot_entity in entries {
            let Some(lot_id) = kernel.ecs.get::<crate::components::ExternalId>(*lot_entity).map(|id| id.0.clone()) else { continue; };
            visible_lots.push((lot_id, *lot_entity, source_container.clone(), source_cell.clone()));
        }
    }
    visible_lots.sort_by(|left, right| left.0.cmp(&right.0));
    for (lot_id, lot_entity, source_container, source_cell) in visible_lots {
        let Some(lot) = kernel.ecs.get::<Lot>(lot_entity) else { continue; };
        if lot.quantity == 0 || !accepts(profile, &lot.kind) { continue; }
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

    let mut free_by_destination = BTreeMap::<String, u32>::new();
    let physical_provider = kernel.storage_provider_candidates_at(position).any(|(_id, entity)| {
        kernel.ecs.get::<Container>(entity).is_some()
            && kernel.ecs.get::<SealedContainer>(entity).is_none()
    });
    let physical_ground = !eligible_ground_candidates(kernel, position, party).is_empty();
    let mut demands = Vec::new();
    for (material, (available, source_lots)) in lots_by_material {
        if demands.len() == MAX_DEMAND_MATERIALS { break; }
        let destination = match destination_at_position(kernel, position, party, &material).map(|(id, _)| id) {
            Some(id) => id,
            None if physical_provider || physical_ground => continue,
            None => cell_id.to_owned(),
        };
        let free = *free_by_destination.entry(destination.clone()).or_insert_with(|| {
            kernel.entity(&destination).ok()
                .and_then(|entity| kernel.ecs.get::<Container>(entity).map(|container| container.capacity.saturating_sub(
                    kernel.quantity_in_container(&destination).saturating_add(crate::supply_allocation::reserved_destination(kernel, &destination, None)))))
                .unwrap_or(DEFAULT_GROUND_STACK_CAPACITY)
        });
        if free == 0 { continue; }
        let quantity = available.min(free);
        if quantity == 0 { continue; }
        free_by_destination.insert(destination.clone(), free - quantity);
        demands.push(StockpileDemand { material, quantity, source_lots, destination: destination.clone() });
    }
    Ok(demands)
}

/// Install the shared scheduler records at each stockpile creation/load
/// boundary. The planner tick consumes its existing indexed task set and does
/// not discover cells by crawling the whole ECS.
pub(super) fn install_planner_state(kernel: &mut Kernel, id: &str, entity: bevy_ecs::prelude::Entity, execution: Option<WorkExecution>) -> crate::components::Result<()> {
    let Some(owner) = kernel.ecs.get::<OwnedByParty>(entity).cloned() else { return Ok(()); };
    let execution = execution.or_else(|| kernel.ecs.get::<WorkExecution>(entity).cloned()).ok_or("stockpile has no work execution")?;
    if execution.pool != owner.party { return Err("stockpile execution pool mismatch".into()); }
    let schedule = kernel.ecs.get::<crate::work_planner::WorkSchedule>(entity).cloned().unwrap_or(crate::work_planner::WorkSchedule { next_review_tick: kernel.revision, last_considered: kernel.revision.saturating_sub(1) });
    kernel.ecs.entity_mut(entity).insert((crate::work_planner::WorkPolicy { pool: owner.party, priority: 0, enabled: true }, execution, schedule));
    kernel.refresh_planner_index(id);
    Ok(())
}

/// Release allocations invalidated by a zone policy change. A carried lot is
/// returned to ordinary ground custody before its allocation is retired, so a
/// policy edit cannot strand a worker or lose the lot's identity.
pub(crate) fn cancel_unpicked_for_zone(kernel: &mut Kernel, zone: &str) -> crate::components::Result<()> {
    cancel_unpicked_where(kernel, |_, cell| cell.zone == zone)
}

pub(crate) fn cancel_unpicked_for_cells(kernel: &mut Kernel, cells: &BTreeSet<String>) -> crate::components::Result<()> {
    cancel_unpicked_where(kernel, |id, _| cells.contains(id))
}

fn cancel_unpicked_where<F>(kernel: &mut Kernel, matches_policy: F) -> crate::components::Result<()>
where
    F: Fn(&str, &StockpileCell) -> bool,
{
    let allocations = kernel.supply_index().active_ids().filter_map(|id| {
        let allocation = kernel.supply_allocation(id)?;
        let source_policy = kernel.entity(&allocation.portion).ok()
            .and_then(|lot_entity| kernel.ecs.get::<Lot>(lot_entity))
            .and_then(|lot| policy_for_destination(kernel, &lot.container));
        let source_matches = source_policy.as_ref().is_some_and(|(id, cell)| matches_policy(id, cell));
        let destination_matches = policy_for_destination(kernel, &allocation.destination)
            .is_some_and(|(id, cell)| matches_policy(&id, &cell));
        (allocation.state == crate::components::SupplyAllocationState::Reserved
            && (source_matches || destination_matches))
        .then_some((id.to_owned(), allocation.clone()))
    }).collect::<Vec<_>>();
    for (id, allocation) in allocations {
        let lot = kernel.ecs.get::<Lot>(kernel.entity(&allocation.portion)?).cloned().ok_or("stockpile allocation portion is missing")?;
        let carried_by = kernel.entity(&lot.container).ok().and_then(|container| kernel.ecs.get::<crate::components::PartyMember>(container).map(|_| lot.container.clone()));
        if let Some(attempt) = kernel.work_attempt(&id).cloned() {
            match attempt.phase {
                crate::work_attempt::AttemptPhase::Executing { operation, .. } => {
                    kernel.interrupt_work_attempt(id.clone(), operation.attempt.generation, operation.sequence, crate::work_attempt::InterruptCause::Cancelled)?;
                    kernel.acknowledge_work_attempt(id.clone(), operation.attempt.generation, operation.sequence)?;
                }
                crate::work_attempt::AttemptPhase::Outcome { operation, .. } => kernel.acknowledge_work_attempt(id.clone(), operation.attempt.generation, operation.sequence)?,
                crate::work_attempt::AttemptPhase::Ready | crate::work_attempt::AttemptPhase::Settling { .. } => {
                    let attempt_entity = kernel.work_attempts.remove(&id).ok_or("supply attempt index is missing")?;
                    kernel.attempts_by_worker.remove(&attempt.worker);
                    kernel.ecs.entity_mut(attempt_entity).remove::<crate::work_attempt::WorkAttempt>();
                }
            }
        }
        if let Some(worker) = carried_by {
            kernel.drop_lot(&worker, &allocation.portion)?;
        }
        if kernel.supply_allocation(&id).is_some() {
            kernel.cancel_and_retire_supply_allocation(&id)?;
        }
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::components::{Body, PartyMember};
    use serde_json::json;

    fn kernel() -> Kernel {
        let mut kernel = Kernel::new();
        kernel.load(&json!({
            "format": "hive-game", "version": 3, "game": "stockpile",
            "components": [], "materialCatalog": [{"kind":"bread","unitVolume":1},{"kind":"wood","unitVolume":1}],
            "stockpileProfiles": [
                {"id":"wood", "materialCategories":{"wood":"building"}, "allowedCategories":["building"]},
                {"id":"food", "materialCategories":{"bread":"food"}, "allowedCategories":["food"]}
            ],
            "initial": [
                {"id":"party", "components":{"hive.party":{"ownerPlayer":"p"}}},
                {"id":"source", "components":{"hive.position":{"x":0,"y":0,"z":0,"facing":0},"hive.container":{"capacity":8},"hive.ground-stock":{},"hive.owned-by-party":{"party":"party"}}},
                {"id":"source-policy", "components":{"hive.position":{"x":0,"y":0,"z":0,"facing":0},"hive.stockpile-cell":{"zone":"low","priority":1,"filterProfile":"wood"},"hive.owned-by-party":{"party":"party"},"hive.work-execution":{"pool":"party","initiatingPlayer":null,"policyId":"stockpile"}}},
                {"id":"target", "components":{"hive.position":{"x":1,"y":0,"z":0,"facing":0},"hive.stockpile-cell":{"zone":"high","priority":2,"filterProfile":"wood"},"hive.owned-by-party":{"party":"party"},"hive.work-execution":{"pool":"party","initiatingPlayer":null,"policyId":"stockpile"}}},
                {"id":"target-ground", "components":{"hive.position":{"x":1,"y":0,"z":0,"facing":0},"hive.container":{"capacity":4},"hive.ground-stock":{},"hive.owned-by-party":{"party":"party"}}},
                {"id":"target-shelf", "components":{"hive.position":{"x":1,"y":0,"z":0,"facing":0},"hive.container":{"capacity":4},"hive.storage-provider":{},"hive.owned-by-party":{"party":"party"}}},
                {"id":"invalid", "components":{"hive.position":{"x":2,"y":0,"z":0,"facing":0},"hive.stockpile-cell":{"zone":"bad","priority":1,"filterProfile":"food"},"hive.owned-by-party":{"party":"party"},"hive.work-execution":{"pool":"party","initiatingPlayer":null,"policyId":"stockpile"}}},
                {"id":"invalid-ground", "components":{"hive.position":{"x":2,"y":0,"z":0,"facing":0},"hive.container":{"capacity":4},"hive.ground-stock":{},"hive.owned-by-party":{"party":"party"}}},
                {"id":"ground", "components":{"hive.position":{"x":3,"y":0,"z":0,"facing":0},"hive.container":{"capacity":8},"hive.ground-stock":{},"hive.owned-by-party":{"party":"party"}}},
                {"id":"lot-low", "components":{"hive.lot":{"kind":"wood","quantity":2,"container":"source"},"hive.owned-by-party":{"party":"party"}}},
                {"id":"lot-invalid", "components":{"hive.lot":{"kind":"wood","quantity":1,"container":"invalid-ground"},"hive.owned-by-party":{"party":"party"}}},
                {"id":"lot-ground", "components":{"hive.lot":{"kind":"wood","quantity":1,"container":"ground"}}}
            ]
        }).to_string()).unwrap();
        kernel
    }

    fn insert_lot(kernel: &mut Kernel, id: &str, kind: &str, quantity: u32, container: &str) {
        let entity = kernel.ecs.spawn((crate::components::ExternalId(id.into()), Lot { kind: kind.into(), quantity, container: container.into() })).id();
        kernel.ids.insert(id.into(), entity);
        kernel.known.insert(id.into());
        kernel.contents.entry(container.into()).or_default().insert(entity);
    }

    #[test]
    fn profile_table_is_content_owned_and_rehaul_is_strict_only_for_valid_storage() {
        let kernel = kernel();
        let demands = collect(&kernel, "target", "party").unwrap();
        assert_eq!(demands.len(), 1);
        assert_eq!(demands[0].material, "wood");
        assert_eq!(demands[0].quantity, 4);
        assert_eq!(demands[0].destination, "target-shelf");
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
        kernel.ecs.get_mut::<StockpileCell>(kernel.entity("source-policy").unwrap()).unwrap().filter_profile = "food".into();
        assert!(collect(&kernel, "target", "party").unwrap().iter().any(|demand| demand.source_lots.contains("lot-low")));
    }

    #[test]
    fn source_policy_change_cancels_unpicked_rehaul() {
        let mut kernel = kernel();
        let generation = policy_generation(kernel.ecs.get::<StockpileCell>(kernel.entity("target").unwrap()).unwrap());
        let allocation = kernel.reserve_supply_allocation(
            "target".into(), "wood".into(), generation, "party".into(),
            "wood".into(), "lot-low".into(), "target-shelf".into(), 1,
        ).unwrap();
        kernel.update_stockpile("party".into(), "low".into(), "food".into(), 1).unwrap();
        assert!(kernel.entity(&allocation).is_err(), "source policy changes retire stale unpicked rehaul");
    }

    #[test]
    fn full_provider_blocks_floor_underneath() {
        let mut kernel = kernel();
        insert_lot(&mut kernel, "shelf-lot", "wood", 4, "target-shelf");
        assert!(collect(&kernel, "target", "party").unwrap().is_empty());
    }

    #[test]
    fn incompatible_partially_free_ground_stack_blocks_delivery() {
        let mut kernel = kernel();
        let shelf = kernel.entity("target-shelf").unwrap();
        kernel.ecs.entity_mut(shelf).insert(crate::components::SealedContainer {});
        insert_lot(&mut kernel, "ground-bread", "bread", 1, "target-ground");
        assert!(collect(&kernel, "target", "party").unwrap().is_empty());
    }

    #[test]
    fn carried_policy_change_returns_same_lot_to_ground_and_retires_allocation() {
        let mut kernel = kernel();
        let worker = kernel.ecs.spawn((
            crate::components::ExternalId("worker".into()),
            PartyMember { party: "party".into() },
            Body { speed: 1.0 },
            Position { x: 0.0, y: 0.0, z: 0.0, facing: 0.0 },
            Container { capacity: 4 },
            crate::components::OwnedByParty { party: "party".into() },
        )).id();
        kernel.ids.insert("worker".into(), worker);
        kernel.known.insert("worker".into());
        let lot_entity = kernel.entity("lot-low").unwrap();
        kernel.contents.get_mut("source").unwrap().remove(&lot_entity);
        kernel.contents.entry("worker".into()).or_default().insert(lot_entity);
        kernel.ecs.get_mut::<Lot>(lot_entity).unwrap().container = "worker".into();
        let generation = policy_generation(kernel.ecs.get::<StockpileCell>(kernel.entity("target").unwrap()).unwrap());
        let allocation = kernel.reserve_supply_allocation(
            "target".into(), "wood".into(), generation, "party".into(),
            "wood".into(), "lot-low".into(), "target-shelf".into(), 1,
        ).unwrap();
        kernel.update_stockpile("party".into(), "low".into(), "food".into(), 1).unwrap();
        let lot = kernel.ecs.get::<Lot>(kernel.entity("lot-low").unwrap()).unwrap();
        assert_ne!(lot.container, "worker");
        assert!(kernel.ecs.get::<GroundStock>(kernel.entity(&lot.container).unwrap()).is_some());
        assert!(kernel.entity(&allocation).is_err());
    }

}
