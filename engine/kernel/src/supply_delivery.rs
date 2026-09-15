//! Durable pickup, carry, and deposit transitions for admitted supply work.
//!
//! Planning chooses a worker and reserves an exact portion. This module then
//! advances only terminal operation outcomes. It never invents stock or treats
//! a reservation as physical custody.
use super::Kernel;
use crate::components::{Lot, Point, Position, Result, SupplyAllocation, SupplyAllocationState};
use crate::work_attempt::{ActivityRef, AttemptPhase, WorkAttempt, WorkOutcome};

impl Kernel {
    /// Advance each completed supply operation by one durable transition.
    /// Executing, blocked, and interrupted attempts remain explicit facts for
    /// their normal recovery/cancellation owners.
    pub(crate) fn reconcile_supply_allocations(&mut self) -> Result<usize> {
        let tasks = self
            .supply_allocations()
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
                result: WorkOutcome::Completed,
            } = attempt.phase
            else {
                continue;
            };
            let allocation = self
                .ecs
                .get::<SupplyAllocation>(attempt_entity)
                .cloned()
                .ok_or("supply allocation disappeared")?;
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
                    self.retire_delivered_supply_allocation(&task)?;
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
        Ok(advanced)
    }

    fn retire_delivered_supply_allocation(&mut self, task: &str) -> Result<()> {
        if self.work_attempts.contains_key(task) {
            return Err("supply allocation still owns a work attempt".into());
        }
        let entity = self.entity(task)?;
        if self
            .ecs
            .get::<SupplyAllocation>(entity)
            .is_none_or(|allocation| allocation.state != SupplyAllocationState::Delivered)
        {
            return Err("only a delivered supply allocation can retire".into());
        }
        self.ids.remove(task);
        self.known.remove(task);
        self.ecs.despawn(entity);
        self.refresh_state_weight();
        Ok(())
    }
}
