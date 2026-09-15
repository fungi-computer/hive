//! Shared native planning for finite material requirements.
//!
//! Domain modules describe what material a durable task still requires. This
//! module alone narrows eligible workers and stock, prices real routes, reserves
//! exact portions, then hands them to the shared delivery lifecycle. Physical
//! custody remains owned by `Lot`, `Container`, and `Kernel` transfer laws.
use super::Kernel;
use super::route_query::SearchOutcome;
use super::supply_admission::SupplyAdmissionRequest;
use crate::components::*;
use crate::staged_process::{InputPolicy, ProcessPhase, StagedProcess};
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
    policy: InputPolicy,
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
    policy: InputPolicy,
}

impl Kernel {
    /// Process inputs contribute ordinary finite supply requirements. The
    /// process owner remains responsible for binding them once they arrive;
    /// this method only joins the shared supply planner.
    pub(crate) fn plan_process_supply(&mut self, process: &str, party: &str) -> Result<Vec<String>> {
        self.ensure_ready()?;
        let process_entity = self.entity(process)?;
        let state = self
            .ecs
            .get::<StagedProcess>(process_entity)
            .cloned()
            .ok_or("not a staged process")?;
        if state.phase != ProcessPhase::Waiting {
            return Err("process supply requires a waiting process".into());
        }
        if self.ecs.get::<OwnedByParty>(process_entity).map(|owner| owner.party.as_str()) != Some(party) {
            return Err("process supply process is outside party".into());
        }
        let definition = self
            .environment
            .as_ref()
            .ok_or("process supply needs environment")?
            .processes
            .get(&state.definition)
            .ok_or("process definition is missing")?
            .definition()
            .clone();
        let station = self.entity(&state.station)?;
        let station_site = self.ecs.get::<ConstructionSite>(station).ok_or("process station is not a construction site")?;
        if station_site.phase != ConstructionPhase::Finished || station_site.catalog != definition.station_catalog
            || self.ecs.get::<SealedContainer>(station).is_none()
        {
            return Err("process station is not a completed sealed matching catalog".into());
        }
        let generation = u64::from(state.stage_index).saturating_add(1);
        let requirements = definition
            .inputs
            .iter()
            .filter_map(|input| {
                let destination = format!("{}:{}", state.station, input.port);
                if self.native_supply_contacts(&destination).is_err() {
                    return None;
                }
                let present = self
                    .contents
                    .get(&destination)
                    .into_iter()
                    .flatten()
                    .filter_map(|entity| {
                        let lot = self.ecs.get::<Lot>(*entity)?;
                        (lot.container == destination
                            && lot_matches_material(lot, self.ecs.get::<LotWater>(*entity), &input.material))
                            .then_some(lot.quantity)
                    })
                    .filter(|quantity| input.policy == InputPolicy::Portion || *quantity == input.quantity)
                    .fold(0_u32, |accepted, quantity| {
                        if input.policy == InputPolicy::WholeLot && accepted > 0 {
                            accepted
                        } else {
                            accepted.saturating_add(quantity)
                        }
                    });
                let incoming = self
                    .supply_allocations()
                    .filter(|(_, allocation)| {
                        allocation.requirement_owner == process
                            && allocation.requirement_role == input.role
                            && allocation.requirement_generation == generation
                            && allocation.party == party
                            && allocation.material == input.material
                            && allocation.destination == destination
                            && allocation.state == SupplyAllocationState::Reserved
                    })
                    .map(|(_, allocation)| allocation.quantity)
                    .sum::<u32>();
                let missing = input.quantity.saturating_sub(present.saturating_add(incoming));
                (missing > 0).then(|| SupplyRequirement {
                    owner: process.into(),
                    role: input.role.clone(),
                    generation,
                    party: party.into(),
                    material: input.material.clone(),
                    policy: input.policy,
                    destination,
                    missing,
                })
            })
            .collect::<Vec<_>>();
        self.plan_supply_requirements(&requirements)
    }

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
                    policy: InputPolicy::Portion,
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
        let mut prospective_source = BTreeMap::<String, u32>::new();
        for requirement in requirements {
            if slots.len() == MAX_ASSIGNMENTS {
                break;
            }
            let sources = self
                .ids
                .iter()
                .filter_map(|(lot_id, entity)| {
                    let lot = self.ecs.get::<Lot>(*entity)?;
                    if !lot_matches_material(lot, self.ecs.get::<LotWater>(*entity), &requirement.material) {
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
                    let free = lot
                        .quantity
                        .saturating_sub(crate::supply_allocation::reserved_source(
                            self, lot_id, None,
                        ))
                        .saturating_sub(*prospective_source.get(lot_id).unwrap_or(&0));
                    let eligible = match requirement.policy {
                        InputPolicy::Portion => free > 0,
                        InputPolicy::WholeLot => free == lot.quantity && lot.quantity == requirement.missing,
                    };
                    eligible.then(|| (lot_id.clone(), position, free))
                })
                .take(MAX_ASSIGNMENTS)
                .collect::<Vec<_>>();
            let mut remaining = requirement.missing;
            for (lot, source_position, free) in sources {
                let mut source_remaining = free;
                while remaining > 0 && source_remaining > 0 && slots.len() < MAX_ASSIGNMENTS {
                    let quantity = match requirement.policy {
                        InputPolicy::Portion => remaining.min(source_remaining).min(MAX_CARRY_PORTION),
                        InputPolicy::WholeLot if source_remaining == remaining => remaining,
                        InputPolicy::WholeLot => 0,
                    };
                    if quantity == 0 { break; }
                    let index = slots.len();
                    slots.push(SupplySlot {
                        task: format!("supply-slot-{index}"),
                        requirement: requirement.clone(),
                        lot: lot.clone(),
                        source_position,
                        quantity,
                        policy: requirement.policy,
                    });
                    *prospective_source.entry(lot.clone()).or_default() += quantity;
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

        // A batch size is an upper preference, never a required carrier
        // capability. Split the provisional source portions to the smallest
        // currently eligible carrier for their party so every generated slot
        // has at least one possible worker. Later reviews can admit the
        // remainder when this bounded window is full.
        let carry_limit_by_party = workers.iter().fold(
            BTreeMap::<String, u32>::new(),
            |mut limits, (_, party, _, capacity)| {
                limits
                    .entry(party.clone())
                    .and_modify(|limit| *limit = (*limit).min(*capacity))
                    .or_insert(*capacity);
                limits
            },
        );
        let mut carryable_slots = Vec::new();
        for slot in slots {
            let Some(limit) = carry_limit_by_party.get(&slot.requirement.party).copied() else {
                continue;
            };
            let limit = limit.min(MAX_CARRY_PORTION);
            let mut remaining = slot.quantity;
            while remaining > 0 && carryable_slots.len() < MAX_ASSIGNMENTS {
                let quantity = remaining.min(limit);
                if slot.policy == InputPolicy::WholeLot && quantity != remaining { break; }
                let mut carryable = slot.clone();
                carryable.task = format!("supply-slot-{}", carryable_slots.len());
                carryable.quantity = quantity;
                carryable_slots.push(carryable);
                remaining -= quantity;
            }
            if carryable_slots.len() == MAX_ASSIGNMENTS {
                break;
            }
        }
        let slots = carryable_slots;
        if slots.is_empty() {
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

        let requests = planned
            .assignments
            .into_iter()
            .map(|assignment| {
                let slot = slots_by_task
                    .get(&assignment.task)
                    .ok_or("native supply task identity is invalid")?;
                let destination = Point {
                    x: slot.source_position.x,
                    y: slot.source_position.y,
                    z: slot.source_position.z,
                    frame: None,
                };
                Ok(SupplyAdmissionRequest {
                    requirement_owner: slot.requirement.owner.clone(),
                    requirement_role: slot.requirement.role.clone(),
                    requirement_generation: slot.requirement.generation,
                    party: slot.requirement.party.clone(),
                    material: slot.requirement.material.clone(),
                    portion: slot.lot.clone(),
                    destination_container: slot.requirement.destination.clone(),
                    quantity: slot.quantity,
                    worker: assignment.worker,
                    route_destination: destination,
                    route: assignment.witness,
                })
            })
            .collect::<Result<Vec<_>>>()?;
        self.admit_supply_assignments(requests)
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::components::{Lot, SupplyAllocation};
    use crate::generation::Cell;
    use crate::structure_geometry::Cardinal;
    use crate::work_attempt::InterruptCause;
    use serde_json::json;

    fn construction_world_with_capacity(
        worker_count: usize,
        worker_capacity: u32,
    ) -> (Kernel, Cell, Point) {
        let workers = (1..=worker_count)
            .map(|index| {
                json!({
                    "id": format!("worker-{index}"),
                    "components": {
                        "hive.party-member": { "party": "party" },
                        "hive.position": { "x": 0.0, "y": 0.0, "z": 0.0, "facing": 0.0 },
                        "hive.body": { "speed": 1.0 },
                        "hive.traversal": { "clearanceCells": 1, "maxStepCells": 1 },
                        "hive.container": { "capacity": worker_capacity },
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

    fn construction_world(worker_count: usize) -> (Kernel, Cell, Point) {
        construction_world_with_capacity(worker_count, 3)
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

    #[test]
    fn carrier_capacity_splits_supply_without_starving_small_workers() {
        let (mut kernel, _, _) = construction_world_with_capacity(2, 1);
        for delivered in [2_u32, 4, 6] {
            let admitted = kernel.plan_construction_supply("site", "party").unwrap();
            assert_eq!(admitted.len(), 2);
            assert!(admitted.iter().all(|id| {
                kernel
                    .ecs
                    .get::<SupplyAllocation>(kernel.entity(id).unwrap())
                    .is_some_and(|allocation| allocation.quantity == 1)
            }));
            assert_eq!(
                crate::supply_allocation::reserved_source(&kernel, "wood", None),
                2
            );
            finish_active_deliveries(&mut kernel);
            assert_eq!(kernel.quantity_in_container("site"), delivered);
        }
        assert_eq!(kernel.quantity_in_container("worker-1"), 0);
        assert_eq!(kernel.quantity_in_container("worker-2"), 0);
        assert!(kernel.supply_allocations().next().is_none());
    }

    #[test]
    fn one_planning_window_never_promises_the_same_source_twice() {
        let (mut kernel, _, _) = construction_world(4);
        let base = SupplyRequirement {
            owner: "site".into(),
            role: "first".into(),
            generation: 1,
            party: "party".into(),
            material: "stone-spoil".into(),
            policy: InputPolicy::Portion,
            destination: "site".into(),
            missing: 4,
        };
        let admitted = kernel
            .plan_supply_requirements(&[
                base.clone(),
                SupplyRequirement {
                    role: "second".into(),
                    ..base
                },
            ])
            .unwrap();
        assert_eq!(admitted.len(), 3);
        assert_eq!(
            admitted
                .iter()
                .map(|id| {
                    kernel
                        .ecs
                        .get::<SupplyAllocation>(kernel.entity(id).unwrap())
                        .unwrap()
                        .quantity
                })
                .sum::<u32>(),
            6
        );
        assert_eq!(
            crate::supply_allocation::reserved_source(&kernel, "wood", None),
            6
        );
    }

    #[test]
    fn rejected_batch_publishes_no_allocation_or_worker_claim() {
        let (mut kernel, _, _) = construction_world(2);
        let generation = kernel.next_work_generation;
        kernel
            .known
            .insert(format!("allocation.{}", generation + 2));
        assert!(kernel
            .plan_construction_supply("site", "party")
            .is_err());
        assert!(kernel.supply_allocations().next().is_none());
        assert!(kernel.work_attempts.is_empty());
        assert!(kernel.attempts_by_worker.is_empty());
        assert_eq!(kernel.next_work_generation, generation);
        for worker in ["worker-1", "worker-2"] {
            assert!(kernel
                .ecs
                .get::<Destination>(kernel.entity(worker).unwrap())
                .is_none());
        }

        let (mut full, _, _) = construction_world(1);
        full.state_weight = super::super::STATE_BYTES;
        assert_eq!(
            full.plan_construction_supply("site", "party").unwrap_err(),
            "supply admission exceeds canonical state capacity"
        );
        assert!(full.supply_allocations().next().is_none());
        assert!(full.work_attempts.is_empty());
        assert!(full
            .ecs
            .get::<Destination>(full.entity("worker-1").unwrap())
            .is_none());
    }

    #[test]
    fn blocked_pickup_releases_only_transport_promise() {
        let (mut kernel, _, _) = construction_world(1);
        let allocation = kernel
            .plan_construction_supply("site", "party")
            .unwrap()
            .into_iter()
            .next()
            .unwrap();
        let attempt = kernel.work_attempt(&allocation).unwrap().clone();
        let operation = attempt.current_operation().unwrap().clone();
        let activity = match attempt.phase {
            crate::work_attempt::AttemptPhase::Executing { activity, .. } => activity,
            _ => panic!("new supply attempt must be executing"),
        };
        kernel
            .settle_attempt(
                &allocation,
                crate::work_attempt::AttemptPhase::Outcome {
                    operation,
                    activity,
                    result: crate::work_attempt::WorkOutcome::Blocked {
                        reason: crate::work_attempt::WorkBlockReason::AccessLost,
                    },
                },
            )
            .unwrap();
        assert_eq!(kernel.reconcile_supply_allocations().unwrap(), 1);
        assert!(kernel.entity(&allocation).is_err());
        assert_eq!(kernel.quantity_in_container("source"), 6);
        assert_eq!(kernel.quantity_in_container("worker-1"), 0);
        assert_eq!(kernel.quantity_in_container("site"), 0);
        assert_eq!(
            kernel
                .ecs
                .get::<ConstructionSite>(kernel.entity("site").unwrap())
                .unwrap()
                .phase,
            ConstructionPhase::Planned
        );
    }

    #[test]
    fn interrupted_carrier_keeps_material_and_resumes_after_undraft() {
        let (mut kernel, _, _) = construction_world(1);
        let allocation = kernel
            .plan_construction_supply("site", "party")
            .unwrap()
            .into_iter()
            .next()
            .unwrap();
        settle_routes(&mut kernel);
        assert_eq!(kernel.reconcile_supply_allocations().unwrap(), 1); // pickup
        let carried = kernel
            .ecs
            .get::<SupplyAllocation>(kernel.entity(&allocation).unwrap())
            .unwrap()
            .portion
            .clone();
        assert_eq!(kernel.quantity_in_container("worker-1"), 3);
        assert_eq!(kernel.reconcile_supply_allocations().unwrap(), 1); // route to site
        let worker = kernel.entity("worker-1").unwrap();
        kernel
            .ecs
            .get_mut::<WorkParticipation>(worker)
            .unwrap()
            .automatic = false;
        let operation = kernel
            .work_attempt(&allocation)
            .unwrap()
            .current_operation()
            .unwrap()
            .clone();
        kernel
            .interrupt_work_attempt(
                allocation.clone(),
                operation.attempt.generation,
                operation.sequence,
                InterruptCause::WorkerUnavailable,
            )
            .unwrap();
        assert_eq!(kernel.reconcile_supply_allocations().unwrap(), 1);

        assert!(kernel.entity(&allocation).is_ok());
        assert!(kernel.work_attempt(&allocation).is_none());
        assert_eq!(kernel.quantity_in_container("worker-1"), 3);
        let lot = kernel.ecs.get::<Lot>(kernel.entity(&carried).unwrap()).unwrap();
        assert_eq!(lot.container, "worker-1");
        assert_eq!(kernel.quantity_in_container("source"), 3);

        let saved = kernel.save_records().unwrap();
        let mut restored = Kernel::new();
        restored.restore_records(&saved).unwrap();
        let worker = restored.entity("worker-1").unwrap();
        restored
            .ecs
            .get_mut::<WorkParticipation>(worker)
            .unwrap()
            .automatic = true;
        restored.ecs.get_mut::<Body>(worker).unwrap().speed = 0.0;
        assert_eq!(restored.reconcile_supply_allocations().unwrap(), 0);
        assert!(restored.work_attempt(&allocation).is_none());
        restored.ecs.get_mut::<Body>(worker).unwrap().speed = 1.0;
        assert_eq!(restored.reconcile_supply_allocations().unwrap(), 1);
        settle_routes(&mut restored);
        assert_eq!(restored.reconcile_supply_allocations().unwrap(), 1); // deposit
        assert_eq!(restored.reconcile_supply_allocations().unwrap(), 1); // retire
        assert_eq!(restored.quantity_in_container("site"), 3);
        assert_eq!(restored.quantity_in_container("worker-1"), 0);
        assert!(restored.entity(&allocation).is_err());
    }

    #[test]
    fn construction_contributes_only_after_bound_support_materials_and_contact() {
        let (mut kernel, surface, _) = construction_world(1);
        assert!(kernel.construction_work_requirement("site", "party").unwrap().is_none());
        let _ = kernel.plan_construction_supply("site", "party").unwrap();
        finish_active_deliveries(&mut kernel);
        let _ = kernel.plan_construction_supply("site", "party").unwrap();
        finish_active_deliveries(&mut kernel);
        let requirement = kernel
            .construction_work_requirement("site", "party")
            .unwrap()
            .expect("complete construction demand should contribute labor");
        assert_eq!(requirement.task, "site");
        assert_eq!(requirement.party, "party");
        assert!(!requirement.contacts.is_empty());
        assert!(matches!(&requirement.operation, crate::work_planner::WorkOperation::Construction { site, mode: crate::work_attempt::ConstructionMode::Work } if site == "site"));
        assert!(requirement.contacts.len() > 1);
        let selected = requirement.contacts.last().cloned().unwrap();
        assert_ne!(selected, requirement.contacts[0]);
        let activity = requirement.operation.activity_for_contact(&selected);
        assert!(matches!(activity, crate::work_attempt::ActivityRef::Construction { ref site, ref contact, mode: crate::work_attempt::ConstructionMode::Work } if site == "site" && contact == &selected));

        let site_entity = kernel.entity("site").unwrap();
        kernel.ecs.entity_mut(site_entity).remove::<Position>();
        assert!(kernel.construction_work_requirement("site", "party").unwrap().is_none());

        kernel.ecs.entity_mut(site_entity).insert(Position { x: 0.0, y: 0.0, z: 0.0, facing: 0.0 });
        kernel.ecs.entity_mut(site_entity).get_mut::<ConstructionSite>().unwrap().target = ConstructionTarget::Cell {
            cell: Cell { x: surface.x, y: surface.y + 100, z: surface.z },
            orientation: Cardinal::North,
        };
        assert!(kernel.construction_work_requirement("site", "party").unwrap().is_none());
    }

    #[test]
    fn construction_requirement_is_stable_when_entity_iteration_order_changes() {
        let (mut kernel, _, _) = construction_world(1);
        let _ = kernel.plan_construction_supply("site", "party").unwrap();
        finish_active_deliveries(&mut kernel);
        let first = kernel.construction_work_requirement("site", "party").unwrap();
        kernel.ids = kernel.ids.iter().rev().map(|(id, entity)| (id.clone(), *entity)).collect();
        let second = kernel.construction_work_requirement("site", "party").unwrap();
        assert_eq!(first, second);
    }
}
