//! Durable pickup, carry, and deposit transitions for admitted supply work.
//!
//! Planning chooses a worker and reserves an exact portion. This module then
//! advances only terminal operation outcomes. It never invents stock or treats
//! a reservation as physical custody.
use super::Kernel;
use crate::components::{Lot, Point, Position, Result, SupplyAllocation, SupplyAllocationState};
use crate::work_attempt::{ActivityRef, AttemptPhase, WorkAttempt, WorkOutcome};
use std::collections::BTreeSet;

impl Kernel {
    fn carrier_worker(&self, container: &str) -> Option<String> {
        let mut current = container.to_owned();
        for _ in 0..16 {
            let entity = self.entity(&current).ok()?;
            if self.ecs.get::<crate::components::PartyMember>(entity).is_some() {
                return Some(current);
            }
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
            .supply_allocations()
            .map(|(id, _)| id.to_owned())
            .collect::<Vec<_>>();
        let mut advanced = 0;
        let mut failed_this_pass = BTreeSet::new();
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
                failed_this_pass.insert(task);
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
                ActivityRef::MaterialTransfer { .. } => {
                    let lot = self
                        .ecs
                        .get::<Lot>(self.entity(&allocation.portion)?)
                        .ok_or("supply portion disappeared")?;
                    if lot.container != attempt.worker {
                        return Err("completed supply pickup has invalid custody".into());
                    }
                    let site = self.entity(&allocation.destination)?;
                    let destination_position = *self
                        .ecs
                        .get::<Position>(site)
                        .ok_or("supply destination lost its bound contact")?;
                    let destination = Point {
                        x: destination_position.x,
                        y: destination_position.y,
                        z: destination_position.z,
                        frame: None,
                    };
                    if !self
                        .native_supply_contacts(&allocation.destination)?
                        .contains(&destination)
                    {
                        return Err("supply destination contact is no longer valid".into());
                    }
                    let worker = self.entity(&attempt.worker)?;
                    let position = *self
                        .ecs
                        .get::<Position>(worker)
                        .ok_or("supply worker lost position")?;
                    let route = self.route_for(worker, position, &destination)?;
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
        let recoveries = self
            .supply_allocations()
            .filter(|(task, allocation)| {
                allocation.state == SupplyAllocationState::Reserved
                    && !self.work_attempts.contains_key(*task)
                    && !failed_this_pass.contains(*task)
            })
            .filter_map(|(task, allocation)| {
                let lot = self.ecs.get::<Lot>(self.entity(&allocation.portion).ok()?)?;
                let worker_id = self.carrier_worker(&lot.container)?;
                let worker = self.entity(&worker_id).ok()?;
                let member = self.ecs.get::<crate::components::PartyMember>(worker)?;
                (member.party == allocation.party
                    && lot.quantity == allocation.quantity
                    && self
                        .ecs
                        .get::<crate::work_planner::WorkParticipation>(worker)
                        .is_some_and(|participation| participation.automatic)
                    && self
                        .ecs
                        .get::<crate::components::Body>(worker)
                        .is_some_and(|body| body.speed.is_finite() && body.speed > 0.0)
                    && self.ecs.get::<crate::components::Traversal>(worker).is_some()
                    && self.ecs.get::<crate::components::Position>(worker).is_some()
                    && self.ecs.get::<crate::components::Container>(worker).is_some()
                    && !self.attempts_by_worker.contains_key(&worker_id)
                    && self.ecs.get::<crate::components::Destination>(worker).is_none()
                    && !self.direct.contains_key(&worker)
                    && self.ecs.get::<crate::components::Support>(worker).is_none()
                    && self.ecs.get::<crate::components::ExcavationWork>(worker).is_none())
                .then(|| (task.to_owned(), allocation.clone(), worker_id))
            })
            .take(crate::work_planner::MAX_ASSIGNMENTS)
            .collect::<Vec<_>>();
        for (task, allocation, worker_id) in recoveries {
            let destination_entity = self.entity(&allocation.destination)?;
            let position = *self
                .ecs
                .get::<Position>(destination_entity)
                .ok_or("supply recovery destination lost its bound contact")?;
            let destination = Point {
                x: position.x,
                y: position.y,
                z: position.z,
                frame: None,
            };
            if !self
                .native_supply_contacts(&allocation.destination)?
                .contains(&destination)
            {
                return Err("supply recovery destination contact is no longer valid".into());
            }
            let worker = self.entity(&worker_id)?;
            let position = *self
                .ecs
                .get::<Position>(worker)
                .ok_or("supply recovery worker lost position")?;
            match super::route_query::classify_route(self.route_for(
                worker,
                position,
                &destination,
            ))? {
                super::route_query::SearchOutcome::Reachable(route) => {
                    self.begin_work_attempt_with_prepared_route(
                        task,
                        worker_id,
                        allocation.party,
                        destination,
                        route,
                    )?;
                    advanced += 1;
                }
                super::route_query::SearchOutcome::NoPath(_)
                | super::route_query::SearchOutcome::Deferred(_) => {}
            }
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
            if self.ecs.get::<crate::components::GroundStock>(container).is_none()
                && self
                    .ecs
                    .get::<crate::components::StockpileCell>(container)
                    .is_none()
            {
                return Err("failed supply portion has invalid custody".into());
            }
        }
        self.acknowledge_work_attempt(task.to_owned(), generation, sequence)?;
        if carried {
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
        self.ecs.despawn(entity);
        self.refresh_state_weight();
        Ok(())
    }
}
