//! Shared native planning for finite material requirements.
//!
//! Domain modules describe what material a durable task still requires. This
//! module alone narrows eligible workers and stock, prices real routes, reserves
//! exact portions, then hands them to the shared delivery lifecycle. Physical
//! custody remains owned by `Lot`, `Container`, and `Kernel` transfer laws.
use super::Kernel;
use super::route_query::SearchOutcome;
use crate::components::*;
use crate::work_planner::{MAX_ASSIGNMENTS, WorkParticipation};
use std::collections::BTreeMap;

const MAX_CARRY_PORTION: u32 = 3;

#[derive(Clone)]
struct SupplyRequirement {
    owner: String,
    role: String,
    generation: u64,
    party: String,
    material: String,
    destination: String,
    missing: u32,
}

#[derive(Clone)]
struct SupplySlot {
    task: String,
    requirement: SupplyRequirement,
    lot: String,
    source_position: Position,
    quantity: u32,
}

impl Kernel {
    /// Construction contributes requirements; it does not select workers or
    /// create a second delivery lifecycle.
    pub(crate) fn plan_construction_supply(
        &mut self,
        site: &str,
        party: &str,
    ) -> Result<Vec<String>> {
        self.ensure_ready()?;
        let site_entity = self.entity(site)?;
        let state = self
            .ecs
            .get::<ConstructionSite>(site_entity)
            .cloned()
            .ok_or("not a construction site")?;
        if state.phase != ConstructionPhase::Planned {
            return Err("construction supply requires a planned site".into());
        }
        if self
            .ecs
            .get::<OwnedByParty>(site_entity)
            .map(|owner| owner.party.as_str())
            != Some(party)
        {
            return Err("construction supply site is outside party".into());
        }
        self.ecs
            .get::<Container>(site_entity)
            .ok_or("construction supply site is not a container")?;
        self.ecs
            .get::<Position>(site_entity)
            .ok_or("construction supply requires a bound site contact")?;
        let definition = self
            .environment
            .as_ref()
            .ok_or("construction needs environment")?
            .structures
            .get(&state.catalog)
            .ok_or("construction catalog binding is missing")?
            .clone();
        let requirements = definition
            .materials
            .iter()
            .filter_map(|(material, required)| {
                let present = self
                    .contents
                    .get(site)
                    .into_iter()
                    .flatten()
                    .filter_map(|entity| {
                        let lot = self.ecs.get::<Lot>(*entity)?;
                        (lot.kind == *material
                            && lot.container == site
                            && !self
                                .ecs
                                .get::<LotWater>(*entity)
                                .is_some_and(|water| water.water_kg > 0.0))
                        .then_some(lot.quantity)
                    })
                    .sum::<u32>();
                let incoming = self
                    .supply_allocations()
                    .filter(|(_, allocation)| {
                        allocation.requirement_owner == site
                            && allocation.requirement_generation == 1
                            && allocation.material == *material
                            && allocation.destination == site
                            && allocation.state == SupplyAllocationState::Reserved
                    })
                    .map(|(_, allocation)| allocation.quantity)
                    .sum::<u32>();
                let missing = required.saturating_sub(present.saturating_add(incoming));
                (missing > 0).then(|| SupplyRequirement {
                    owner: site.into(),
                    role: material.clone(),
                    generation: 1,
                    party: party.into(),
                    material: material.clone(),
                    destination: site.into(),
                    missing,
                })
            })
            .collect::<Vec<_>>();
        self.plan_supply_requirements(&requirements)
    }

    fn plan_supply_requirements(
        &mut self,
        requirements: &[SupplyRequirement],
    ) -> Result<Vec<String>> {
        let mut slots = Vec::new();
        for requirement in requirements {
            if slots.len() == MAX_ASSIGNMENTS {
                break;
            }
            let sources = self
                .ids
                .iter()
                .filter_map(|(lot_id, entity)| {
                    let lot = self.ecs.get::<Lot>(*entity)?;
                    if lot.kind != requirement.material
                        || self
                            .ecs
                            .get::<LotWater>(*entity)
                            .is_some_and(|water| water.water_kg > 0.0)
                    {
                        return None;
                    }
                    let container = self.entity(&lot.container).ok()?;
                    if self
                        .ecs
                        .get::<OwnedByParty>(container)
                        .map(|owner| owner.party.as_str())
                        != Some(requirement.party.as_str())
                        || self
                            .ecs
                            .get::<OwnedByParty>(*entity)
                            .map(|owner| owner.party.as_str())
                            != Some(requirement.party.as_str())
                        || (self.ecs.get::<GroundStock>(container).is_none()
                            && self.ecs.get::<StockpileCell>(container).is_none())
                        || self.ecs.get::<SealedContainer>(container).is_some()
                    {
                        return None;
                    }
                    let position = *self.ecs.get::<Position>(container)?;
                    let free =
                        lot.quantity
                            .saturating_sub(crate::supply_allocation::reserved_source(
                                self, lot_id, None,
                            ));
                    (free > 0).then(|| (lot_id.clone(), position, free))
                })
                .take(MAX_ASSIGNMENTS)
                .collect::<Vec<_>>();
            let mut remaining = requirement.missing;
            for (lot, source_position, free) in sources {
                let mut source_remaining = free;
                while remaining > 0 && source_remaining > 0 && slots.len() < MAX_ASSIGNMENTS {
                    let quantity = remaining.min(source_remaining).min(MAX_CARRY_PORTION);
                    let index = slots.len();
                    slots.push(SupplySlot {
                        task: format!("supply-slot-{index}"),
                        requirement: requirement.clone(),
                        lot: lot.clone(),
                        source_position,
                        quantity,
                    });
                    remaining -= quantity;
                    source_remaining -= quantity;
                }
                if remaining == 0 || slots.len() == MAX_ASSIGNMENTS {
                    break;
                }
            }
        }
        if slots.is_empty() {
            return Ok(Vec::new());
        }

        let workers = self
            .ids
            .iter()
            .filter_map(|(id, entity)| {
                let member = self.ecs.get::<PartyMember>(*entity)?;
                let container = self.ecs.get::<Container>(*entity)?;
                let position = *self.ecs.get::<Position>(*entity)?;
                let free_capacity = container.capacity.saturating_sub(
                    u32::try_from(self.quantity_in_container(id)).unwrap_or(u32::MAX),
                );
                (requirements
                    .iter()
                    .any(|requirement| requirement.party == member.party)
                    && self
                        .ecs
                        .get::<WorkParticipation>(*entity)
                        .is_some_and(|participation| participation.automatic)
                    && free_capacity > 0
                    && self
                        .ecs
                        .get::<Body>(*entity)
                        .is_some_and(|body| body.speed.is_finite() && body.speed > 0.0)
                    && self.ecs.get::<Traversal>(*entity).is_some()
                    && !self.attempts_by_worker.contains_key(id)
                    && self.ecs.get::<Destination>(*entity).is_none()
                    && !self.direct.contains_key(entity)
                    && self.ecs.get::<Support>(*entity).is_none()
                    && self.ecs.get::<ExcavationWork>(*entity).is_none())
                .then(|| (id.clone(), member.party.clone(), position, free_capacity))
            })
            .take(crate::work_planner::MAX_ELIGIBLE_WORKERS)
            .collect::<Vec<_>>();
        if workers.is_empty() {
            return Ok(Vec::new());
        }

        let window = crate::work_candidates::PlanningWindow {
            workers: workers
                .iter()
                .map(
                    |(id, party, _, _)| crate::work_candidates::WorkerCandidate {
                        id: id.clone(),
                        party: party.clone(),
                    },
                )
                .collect(),
            tasks: slots
                .iter()
                .map(|slot| crate::work_candidates::TaskCandidate {
                    id: slot.task.clone(),
                    party: slot.requirement.party.clone(),
                    priority: 0,
                    last_considered: 0,
                    due_tick: 0,
                })
                .collect(),
        };
        let candidates = workers
            .iter()
            .flat_map(|(worker, party, position, capacity)| {
                slots
                    .iter()
                    .filter(move |slot| {
                        slot.requirement.party == *party && slot.quantity <= *capacity
                    })
                    .map(move |slot| crate::assign::Candidate {
                        worker: worker.clone(),
                        task: slot.task.clone(),
                        cost: ((position.x - slot.source_position.x).powi(2)
                            + (position.y - slot.source_position.y).powi(2)
                            + (position.z - slot.source_position.z).powi(2))
                        .sqrt(),
                    })
            })
            .collect::<Vec<_>>();
        if candidates.is_empty() {
            return Ok(Vec::new());
        }
        let slots_by_task = slots
            .iter()
            .map(|slot| (slot.task.clone(), slot.clone()))
            .collect::<BTreeMap<_, _>>();
        let planned = crate::work_candidates::assign_verified(&window, &candidates, |candidate| {
            let worker = self.entity(&candidate.worker)?;
            let position = *self
                .ecs
                .get::<Position>(worker)
                .ok_or("native supply worker has no position")?;
            let slot = slots_by_task
                .get(&candidate.task)
                .ok_or("native supply task identity is invalid")?;
            let destination = Point {
                x: slot.source_position.x,
                y: slot.source_position.y,
                z: slot.source_position.z,
                frame: None,
            };
            match super::route_query::classify_route(self.route_for(
                worker,
                position,
                &destination,
            ))? {
                SearchOutcome::Reachable(route) => {
                    let points = std::iter::once(crate::navigation::point(position))
                        .chain(route.points.iter().cloned())
                        .collect::<Vec<_>>();
                    let cost = crate::terrain_route::waypoint_cost_micrometres(points)? as f64
                        / 1_000_000.0;
                    Ok(SearchOutcome::Reachable((cost, route)))
                }
                SearchOutcome::NoPath(error) => Ok(SearchOutcome::NoPath(error)),
                SearchOutcome::Deferred(error) => Ok(SearchOutcome::Deferred(error)),
            }
        })
        .map_err(|error| format!("native supply assignment failed: {error:?}"))?;

        let mut admitted = Vec::new();
        for assignment in planned.assignments {
            let slot = slots_by_task
                .get(&assignment.task)
                .ok_or("native supply task identity is invalid")?;
            let allocation = self.reserve_supply_allocation(
                slot.requirement.owner.clone(),
                slot.requirement.role.clone(),
                slot.requirement.generation,
                slot.requirement.party.clone(),
                slot.requirement.material.clone(),
                slot.lot.clone(),
                slot.requirement.destination.clone(),
                slot.quantity,
            )?;
            let destination = Point {
                x: slot.source_position.x,
                y: slot.source_position.y,
                z: slot.source_position.z,
                frame: None,
            };
            if let Err(error) = self.begin_work_attempt_with_prepared_route(
                allocation.clone(),
                assignment.worker,
                slot.requirement.party.clone(),
                destination,
                assignment.witness,
            ) {
                self.cancel_supply_allocation(&allocation)?;
                return Err(error);
            }
            admitted.push(allocation);
        }
        self.refresh_state_weight();
        Ok(admitted)
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::generation::Cell;
    use crate::structure_geometry::Cardinal;
    use serde_json::json;

    fn construction_world(worker_count: usize) -> (Kernel, Cell, Point) {
        let workers = (1..=worker_count)
            .map(|index| {
                json!({
                    "id": format!("worker-{index}"),
                    "components": {
                        "hive.party-member": { "party": "party" },
                        "hive.position": { "x": 0.0, "y": 0.0, "z": 0.0, "facing": 0.0 },
                        "hive.body": { "speed": 1.0 },
                        "hive.traversal": { "clearanceCells": 1, "maxStepCells": 1 },
                        "hive.container": { "capacity": 3 },
                        "hive.work-participation": { "automatic": true }
                    }
                })
            })
            .collect::<Vec<_>>();
        let mut initial = vec![
            json!({"id":"party","components":{"hive.party":{"ownerPlayer":"player"}}}),
            json!({"id":"source","components":{"hive.owned-by-party":{"party":"party"},"hive.position":{"x":0.0,"y":0.0,"z":0.0,"facing":0.0},"hive.container":{"capacity":6},"hive.ground-stock":{}}}),
            json!({"id":"wood","components":{"hive.owned-by-party":{"party":"party"},"hive.lot":{"kind":"stone-spoil","quantity":6,"container":"source"}}}),
        ];
        initial.extend(workers);
        let mut kernel = Kernel::new();
        kernel.load(&json!({"format":"hive-game","version":1,"game":"native-supply","components":[],"initial":initial}).to_string()).unwrap();
        let mut definition: serde_json::Value = serde_json::from_str(
            &crate::environment_definition::tests::fixture("construction"),
        )
        .unwrap();
        definition["structures"]["catalog"][0]["materials"] =
            json!([{"kind":"stone-spoil","quantity":6}]);
        kernel.load_environment(&definition.to_string()).unwrap();
        let surface = kernel
            .environment
            .as_mut()
            .unwrap()
            .world
            .surface_cells(&[(0, 0)])
            .unwrap()
            .into_iter()
            .next()
            .flatten()
            .unwrap()
            .cell;
        let spacing = kernel.environment.as_ref().unwrap().world.cell_spacing_m();
        let contact = Point {
            x: (surface.x as f64 + 1.0) * spacing[0],
            y: (f64::from(surface.y) + 0.5) * spacing[1],
            z: surface.z as f64 * spacing[2],
            frame: None,
        };
        for index in 1..=worker_count {
            kernel
                .ecs
                .entity_mut(kernel.entity(&format!("worker-{index}")).unwrap())
                .insert(Position {
                    x: contact.x,
                    y: contact.y,
                    z: contact.z,
                    facing: 0.0,
                });
        }
        kernel
            .ecs
            .entity_mut(kernel.entity("source").unwrap())
            .insert(Position {
                x: contact.x,
                y: contact.y,
                z: contact.z,
                facing: 0.0,
            });
        kernel
            .plan_construction(
                "floor".into(),
                "site".into(),
                "party".into(),
                ConstructionTarget::Cell {
                    cell: surface,
                    orientation: Cardinal::North,
                },
            )
            .unwrap();
        kernel
            .bind_construction_stage("site", contact.clone())
            .unwrap();
        kernel.rebuild_physical_indexes(true).unwrap();
        (kernel, surface, contact)
    }

    fn settle_routes(kernel: &mut Kernel) {
        kernel
            .advance_json(&json!({"delta":0.0,"writes":[],"actions":[]}).to_string())
            .unwrap();
    }

    fn finish_active_deliveries(kernel: &mut Kernel) {
        settle_routes(kernel);
        assert!(kernel.reconcile_supply_allocations().unwrap() > 0); // pickup
        assert!(kernel.reconcile_supply_allocations().unwrap() > 0); // route to site
        settle_routes(kernel);
        assert!(kernel.reconcile_supply_allocations().unwrap() > 0); // deposit
        assert!(kernel.reconcile_supply_allocations().unwrap() > 0); // acknowledge and retire
    }

    #[test]
    fn one_worker_delivers_two_bounded_portions_with_mid_carry_restore() {
        let (mut kernel, _, _) = construction_world(1);
        let admitted = kernel.plan_construction_supply("site", "party").unwrap();
        assert_eq!(admitted.len(), 1);
        settle_routes(&mut kernel);
        assert_eq!(kernel.reconcile_supply_allocations().unwrap(), 1);
        let saved = kernel.save_records().unwrap();
        let mut restored = Kernel::new();
        restored.restore_records(&saved).unwrap();
        assert_eq!(restored.quantity_in_container("worker-1"), 3);
        assert_eq!(restored.reconcile_supply_allocations().unwrap(), 1);
        settle_routes(&mut restored);
        assert_eq!(restored.reconcile_supply_allocations().unwrap(), 1);
        assert_eq!(restored.reconcile_supply_allocations().unwrap(), 1);
        assert_eq!(restored.quantity_in_container("site"), 3);

        assert_eq!(
            restored
                .plan_construction_supply("site", "party")
                .unwrap()
                .len(),
            1
        );
        finish_active_deliveries(&mut restored);
        assert_eq!(restored.quantity_in_container("site"), 6);
        assert_eq!(restored.quantity_in_container("worker-1"), 0);
        assert!(restored.supply_allocations().next().is_none());
    }

    #[test]
    fn two_workers_reserve_and_deliver_distinct_portions_concurrently() {
        let (mut kernel, _, _) = construction_world(2);
        let admitted = kernel.plan_construction_supply("site", "party").unwrap();
        assert_eq!(admitted.len(), 2);
        assert_ne!(admitted[0], admitted[1]);
        assert_eq!(
            crate::supply_allocation::reserved_source(&kernel, "wood", None),
            6
        );
        finish_active_deliveries(&mut kernel);
        assert_eq!(kernel.quantity_in_container("site"), 6);
        assert_eq!(
            kernel.quantity_in_container("worker-1") + kernel.quantity_in_container("worker-2"),
            0
        );
        assert!(kernel.supply_allocations().next().is_none());
    }
}
