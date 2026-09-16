//! Durable pickup, carry, and deposit transitions for admitted supply work.
//!
//! Planning chooses a worker and reserves an exact portion. This module then
//! advances only terminal operation outcomes. It never invents stock or treats
//! a reservation as physical custody.
use super::Kernel;
use crate::components::{Lot, Point, Position, Result, SupplyAllocation, SupplyAllocationState};
use crate::work_attempt::{ActivityRef, AttemptPhase, OperationKey, WorkAttempt, WorkOutcome};
use crate::world::TransferContactError;

impl Kernel {
    fn supply_carrier(&self, container: &str) -> Option<String> {
        let mut current = container.to_owned();
        for _ in 0..16 {
            let entity = self.entity(&current).ok()?;
            if self.ecs.get::<crate::components::PartyMember>(entity).is_some() { return Some(current); }
            current = self.ecs.get::<Lot>(entity)?.container.clone();
        }
        None
    }

    /// Contribute an authored allocation to the shared planner. Physical lot
    /// custody, carrier binding, and the source contact stay in this owner;
    /// the planner only receives a typed requirement.
    pub(crate) fn supply_work_requirement(&mut self, task: &str, party: &str) -> Result<Option<crate::work_planner::WorkRequirement>> {
        let entity = self.entity(task)?;
        let Some(allocation) = self.ecs.get::<SupplyAllocation>(entity).cloned() else { return Ok(None); };
        if allocation.state != SupplyAllocationState::Reserved || allocation.party != party || self.work_attempts.contains_key(task) { return Ok(None); }
        let policy = self.ecs.get::<crate::work_planner::WorkPolicy>(entity).cloned().ok_or("supply allocation has no work policy")?;
        if !policy.enabled || policy.party != party { return Ok(None); }
        let schedule = self.ecs.get::<crate::work_planner::WorkSchedule>(entity).cloned().ok_or("supply allocation has no work schedule")?;
        let lot = self.ecs.get::<Lot>(self.entity(&allocation.portion)?).cloned().ok_or("supply portion disappeared")?;
        let carrier = self.supply_carrier(&lot.container);
        let contacts = if let Some(worker) = carrier.as_deref() {
            self.destination_contacts(worker, &allocation.destination).map_err(TransferContactError::into_string)?
        } else {
            let source = self.entity(&lot.container)?;
            self.world_pose_entity(source, 0)?;
            self.transfer_contact_candidates(
                &lot.container,
                crate::terrain_traversal::TraversalConfig {
                    spacing: [0.0; 3],
                    clearance_cells: 1,
                    max_step_cells: 1,
                },
                self.support_id(source),
            ).map_err(TransferContactError::into_string)?
        };
        Ok(Some(crate::work_planner::WorkRequirement {
            task: task.to_owned(), party: party.to_owned(), priority: policy.priority, schedule,
            contacts,
            required_worker: carrier.clone(), free_capacity_required: if carrier.is_some() { 0 } else { allocation.quantity },
            operation: crate::work_planner::WorkOperation::SupplyAllocation { allocation: task.to_owned() },
        }))
    }

    /// Resolve an ordinary container through the typed standing-contact owner
    /// shared with the public transfer query.
    fn generic_destination_contacts(&mut self, worker: &str, destination: &str) -> std::result::Result<Vec<Point>, TransferContactError> {
        let contacts = self.transfer_contacts(worker, destination)?;
        if contacts.is_empty() { return Err(TransferContactError::NoContact); }
        Ok(contacts)
    }

    fn destination_contacts(&mut self, worker: &str, destination: &str) -> std::result::Result<Vec<Point>, TransferContactError> {
        let entity = self.entity(destination)?;
        // A container is a physical transfer boundary. Resolve its standing
        // contact through the same owner as the public transfer query. This
        // keeps ordinary containers (including generated process ports) free
        // of identifier-shape policy. Native construction/stockpile contact
        // discovery remains the owner for their requirements and callers.
        if self.ecs.get::<crate::components::Container>(entity).is_some() {
            self.generic_destination_contacts(worker, destination)
        } else {
            let contacts = self.native_supply_contacts(destination).map_err(TransferContactError::from)?;
            if contacts.is_empty() { return Err(TransferContactError::NoContact); }
            Ok(contacts)
        }
    }

    fn carrier_worker(&self, container: &str) -> Option<String> {
        let mut current = container.to_owned();
        for _ in 0..16 {
            let entity = self.entity(&current).ok()?;
            if self.ecs.get::<crate::components::PartyMember>(entity).is_some() { return Some(current); }
            current = self.ecs.get::<Lot>(entity)?.container.clone();
        }
        None
    }

    /// Advance each terminal supply operation by one durable transition.
    /// A failed route or transfer releases labor and any unused reservation.
    /// Material already picked up remains in its actual carrier with the
    /// allocation retained, so interruption cannot erase or duplicate it.
    pub(crate) fn reconcile_supply_allocations(&mut self) -> Result<usize> {
        let tasks = self
            .work_attempts
            .iter()
            .filter(|(_, entity)| self.ecs.get::<SupplyAllocation>(**entity).is_some())
            .map(|(id, _)| id.to_owned())
            .collect::<Vec<_>>();
        let mut advanced = 0;
        for task in tasks {
            let Some(attempt_entity) = self.work_attempts.get(&task).copied() else {
                continue;
            };
            let attempt = self
                .ecs
                .get::<WorkAttempt>(attempt_entity)
                .cloned()
                .ok_or("supply attempt component is missing")?;
            let AttemptPhase::Outcome {
                operation,
                activity,
                result,
            } = attempt.phase
            else {
                continue;
            };
            let allocation = self
                .ecs
                .get::<SupplyAllocation>(attempt_entity)
                .cloned()
                .ok_or("supply allocation disappeared")?;
            if !matches!(result, WorkOutcome::Completed) {
                self.settle_failed_supply_attempt(
                    &task,
                    &attempt.worker,
                    &allocation,
                    operation.attempt.generation,
                    operation.sequence,
                )?;
                advanced += 1;
                continue;
            }
            match activity {
                ActivityRef::Route { .. } => {
                    let lot = self
                        .ecs
                        .get::<Lot>(self.entity(&allocation.portion)?)
                        .cloned()
                        .ok_or("supply portion disappeared")?;
                    let next = if lot.container == attempt.worker {
                        ActivityRef::MaterialTransfer {
                            lot: allocation.portion,
                            from: attempt.worker.clone(),
                            to: allocation.destination,
                            quantity: allocation.quantity,
                        }
                    } else {
                        ActivityRef::MaterialTransfer {
                            lot: allocation.portion,
                            from: lot.container,
                            to: attempt.worker.clone(),
                            quantity: allocation.quantity,
                        }
                    };
                    self.continue_work_attempt(
                        task,
                        operation.attempt.generation,
                        operation.sequence,
                        next,
                    )?;
                }
                ActivityRef::MaterialTransfer { .. }
                    if allocation.state == SupplyAllocationState::Delivered =>
                {
                    self.acknowledge_work_attempt(
                        task.clone(),
                        operation.attempt.generation,
                        operation.sequence,
                    )?;
                    self.retire_terminal_supply_allocation(&task)?;
                }
                ActivityRef::MaterialDrop { lot } if lot == allocation.portion => {
                    self.acknowledge_work_attempt(task.clone(), operation.attempt.generation, operation.sequence)?;
                    self.cancel_supply_allocation(&task)?;
                    self.retire_terminal_supply_allocation(&task)?;
                }
                ActivityRef::MaterialTransfer { .. } => {
                    let lot = self
                        .ecs
                        .get::<Lot>(self.entity(&allocation.portion)?)
                        .ok_or("supply portion disappeared")?;
                    if lot.container != attempt.worker {
                        return Err("completed supply pickup has invalid custody".into());
                    }
                    let destinations = match self.destination_contacts(&attempt.worker, &allocation.destination) {
                        Ok(destinations) => destinations,
                        Err(TransferContactError::Sealed | TransferContactError::UnavailableFrame | TransferContactError::NoContact) => {
                            self.continue_work_attempt(task.clone(), operation.attempt.generation, operation.sequence, ActivityRef::MaterialDrop { lot: allocation.portion.clone() })?;
                            advanced += 1;
                            continue;
                        }
                        Err(TransferContactError::Internal(reason)) => return Err(reason),
                    };
                    let worker = self.entity(&attempt.worker)?;
                    let position = *self
                        .ecs
                        .get::<Position>(worker)
                        .ok_or("supply worker lost position")?;
                    let next_operation = operation.sequence.saturating_add(1);
                    let (target_index, route) = match super::route_query::classify_route(self.route_for_any(worker, position, &destinations))? {
                        super::route_query::SearchOutcome::Reachable(route) => route,
                        super::route_query::SearchOutcome::NoPath(_) => {
                            self.continue_work_attempt(task.clone(), operation.attempt.generation, operation.sequence, ActivityRef::MaterialDrop { lot: allocation.portion.clone() })?;
                            advanced += 1;
                            continue;
                        }
                        super::route_query::SearchOutcome::Deferred(_) => {
                            self.settle_attempt(&task, AttemptPhase::Outcome {
                                operation: OperationKey { attempt: attempt.key.clone(), sequence: next_operation },
                                activity: ActivityRef::MaterialTransfer { lot: allocation.portion.clone(), from: attempt.worker.clone(), to: allocation.destination.clone(), quantity: allocation.quantity },
                                result: WorkOutcome::Blocked { reason: crate::work_attempt::WorkBlockReason::AccessLost },
                            })?;
                            advanced += 1;
                            continue;
                        }
                    };
                    let destination = destinations.get(target_index).cloned().ok_or("supply destination route target disappeared")?;
                    self.continue_work_attempt_with_prepared_route(
                        &task,
                        operation.attempt.generation,
                        operation.sequence,
                        destination,
                        route,
                    )?;
                }
                _ => return Err("supply attempt completed an unsupported activity".into()),
            }
            advanced += 1;
        }
        Ok(advanced)
    }

    fn settle_failed_supply_attempt(
        &mut self,
        task: &str,
        worker: &str,
        allocation: &SupplyAllocation,
        generation: u64,
        sequence: u32,
    ) -> Result<()> {
        if allocation.state != SupplyAllocationState::Reserved {
            return Err("failed supply work is not reserved".into());
        }
        let lot_entity = self.entity(&allocation.portion)?;
        let lot = self
            .ecs
            .get::<Lot>(lot_entity)
            .cloned()
            .ok_or("failed supply portion disappeared")?;
        let carried = self.carrier_worker(&lot.container).as_deref() == Some(worker);
        if !carried {
            let container = self.entity(&lot.container)?;
            if !self.is_supply_source_container(container) {
                return Err("failed supply portion has invalid custody".into());
            }
        }
        self.acknowledge_work_attempt(task.to_owned(), generation, sequence)?;
        if carried {
            // Physical custody survived the interruption, so this allocation
            // is the only lawful continuation. Make it eligible immediately;
            // waiting for its old review deadline can strand a drafted then
            // restored carrier while unrelated work keeps winning windows.
            let entity = self.entity(task)?;
            let schedule = self.ecs.get::<crate::work_planner::WorkSchedule>(entity).cloned().ok_or("carried supply allocation has no schedule")?;
            self.ecs.entity_mut(entity).insert(crate::work_planner::WorkSchedule {
                next_review_tick: self.revision,
                ..schedule
            });
            self.refresh_planner_index(task);
            return Ok(());
        }
        self.cancel_supply_allocation(task)?;
        self.retire_terminal_supply_allocation(task)
    }

    fn retire_terminal_supply_allocation(&mut self, task: &str) -> Result<()> {
        if self.work_attempts.contains_key(task) {
            return Err("supply allocation still owns a work attempt".into());
        }
        let entity = self.entity(task)?;
        if self
            .ecs
            .get::<SupplyAllocation>(entity)
            .is_none_or(|allocation| {
                !matches!(
                    allocation.state,
                    SupplyAllocationState::Delivered | SupplyAllocationState::Cancelled
                )
            })
        {
            return Err("only a terminal supply allocation can retire".into());
        }
        self.ids.remove(task);
        self.known.remove(task);
        self.planner_indexes.refresh_entity(&self.ecs, task, None);
        self.supply_index.refresh(task, None);
        self.ecs.despawn(entity);
        Ok(())
    }

    pub(crate) fn cancel_and_retire_supply_allocation(&mut self, task: &str) -> Result<()> {
        let entity = self.entity(task)?;
        if self.ecs.get::<SupplyAllocation>(entity).is_some_and(|allocation| allocation.state == SupplyAllocationState::Reserved) {
            self.cancel_supply_allocation(task)?;
        }
        self.retire_terminal_supply_allocation(task)
    }
}
