//! Reconcile already accepted native work independently of speculative matching.
//! Completed travel, physical outcomes, claims and acknowledgements belong to
//! this lifecycle, not to the next candidate window. Supply keeps its own
//! pickup/carry/deposit owner; manual worker-owned attempts stay with theirs.
use super::Kernel;
use crate::components::*;
use crate::staged_process::StagedProcess;
use crate::work_attempt::WorkAttempt;
use crate::work_planner::{MAX_TASK_REVIEWS, WorkPolicy};

struct OutcomeTask {
    id: String,
    pool: String,
    priority: u8,
}

impl Kernel {
    pub(super) fn reconcile_native_work_outcomes(&mut self) -> Result<usize> {
        // The task-to-attempt index is the canonical accepted-work membership.
        // A disabled assignment policy cannot strand an already published
        // terminal result. Current priority and stable task IDs order a bounded
        // slice; unfinished outcomes remain saved for the next occurrence.
        let mut tasks = self.work_attempts.iter().filter_map(|(id, entity)| {
            let attempt = self.ecs.get::<WorkAttempt>(*entity)?;
            if attempt.continuation_owner != crate::work_attempt::ContinuationOwner::Native
                || !matches!(attempt.phase, crate::work_attempt::AttemptPhase::Outcome { .. })
                || self.ecs.get::<SupplyAllocation>(*entity).is_some() { return None; }
            let policy = self.ecs.get::<WorkPolicy>(*entity)?;
            Some(OutcomeTask { id: id.clone(), pool: attempt.execution.pool.clone(), priority: policy.priority })
        }).collect::<Vec<_>>();
        tasks.sort_by(|left, right| right.priority.cmp(&left.priority).then(left.id.cmp(&right.id)));
        tasks.truncate(MAX_TASK_REVIEWS);
        let mut progressed = 0;
        for task in &tasks {
            // Pickup, carry, deposit, acknowledgement, and retirement belong
            // to the supply reconciler. A deposit can become terminal at the
            // top of this same planning pass; the generic outcome path must
            // not remove only its WorkAttempt and orphan the allocation.
            if self
                .entity(&task.id)
                .ok()
                .is_some_and(|entity| self.ecs.get::<SupplyAllocation>(entity).is_some())
            {
                continue;
            }
            let Some(attempt) = self.work_attempt(&task.id).cloned() else { continue; };
            let attempt_worker = attempt.worker.clone();
            let crate::work_attempt::AttemptPhase::Outcome { operation, activity, result } = attempt.phase else { continue; };
            match (activity, result) {
                (crate::work_attempt::ActivityRef::Route { destination }, crate::work_attempt::WorkOutcome::Completed) => {
                    let worker_is_automatic = self.entity(&attempt_worker).ok()
                        .and_then(|entity| self.ecs.get::<crate::work_planner::WorkParticipation>(entity))
                        .is_some_and(|participation| participation.automatic);
                    if !worker_is_automatic
                        && (self.ecs.get::<FieldWaterWork>(self.entity(&task.id)?).is_some()
                            || self.ecs.get::<ResourceOrder>(self.entity(&task.id)?).is_some())
                    {
                        if let Some(mut work) = crate::record_changes::edit::<FieldWaterWork>(self.entity(&task.id)?, &mut self.ecs) {
                            work.vessel = None;
                        }
                        self.acknowledge_work_attempt(task.id.clone(), operation.attempt.generation, operation.sequence)?;
                        self.refresh_planner_index(&task.id);
                        progressed += 1;
                        continue;
                    }
                    if let Some(field) = self.ecs.get::<FieldWaterWork>(self.entity(&task.id)?).cloned()
                        && let Some(vessel) = field.vessel
                    {
                        self.continue_work_attempt(task.id.clone(), operation.attempt.generation, operation.sequence, crate::work_attempt::ActivityRef::FieldWater {
                            vessel, cell: [field.cell_x, field.cell_y, field.cell_z], direction: crate::work_attempt::WaterDirection::Withdraw, portions: field.portions,
                        })?;
                        progressed += 1;
                        continue;
                    }
                    let next = if self.ecs.get::<ConstructionSite>(self.entity(&task.id)?).is_some() {
                        let mode = if self.ecs.get::<Position>(self.entity(&task.id)?).is_some() {
                            crate::work_attempt::ConstructionMode::Work
                        } else {
                            crate::work_attempt::ConstructionMode::Bind
                        };
                        crate::work_planner::WorkOperation::Construction {
                            site: task.id.clone(),
                            mode,
                        }
                    } else if self.ecs.get::<StagedProcess>(self.entity(&task.id)?).is_some() {
                        crate::work_planner::WorkOperation::ProcessAttendance { process: task.id.clone() }
                    } else if let Some(order) = self.ecs.get::<DeconstructionOrder>(self.entity(&task.id)?).cloned() {
                        crate::work_planner::WorkOperation::Deconstruction { site: order.site }
                    } else if let Some(order) = self.ecs.get::<ExcavationOrder>(self.entity(&task.id)?).cloned() {
                        crate::work_planner::WorkOperation::Excavation { cell: [order.cell_x, order.cell_y, order.cell_z], expected: order.expected, replacement: 0 }
                    } else if self.ecs.get::<ResourceOrder>(self.entity(&task.id)?).is_some() {
                        let Some((next_operation, _)) = self.resource_work_operation(&task.id, &task.pool, Some(&attempt_worker))? else {
                            self.acknowledge_work_attempt(task.id.clone(), operation.attempt.generation, operation.sequence)?;
                            self.refresh_planner_index(&task.id);
                            progressed += 1;
                            continue;
                        };
                        next_operation
                    } else if self.ecs.get::<crate::job::Task>(self.entity(&task.id)?).is_some() {
                        crate::work_planner::WorkOperation::JobTransform { task: task.id.clone() }
                    } else {
                        continue;
                    };
                    self.continue_work_attempt(
                        task.id.clone(),
                        operation.attempt.generation,
                        operation.sequence,
                        next.activity_for_contact(&destination),
                    )?;
                    progressed += 1;
                }
                (activity, result) => {
                    if let Some(work) = self.ecs.get::<FieldWaterWork>(self.entity(&task.id)?).cloned()
                        && work.vessel.is_some()
                        && matches!(activity, crate::work_attempt::ActivityRef::Route { .. })
                        && !matches!(result, crate::work_attempt::WorkOutcome::Completed)
                    {
                        // Route loss happens before any field mutation. The
                        // field task is the single owner of the selected
                        // vessel, so clear that claim before releasing the
                        // durable attempt for retry.
                        crate::record_changes::edit::<FieldWaterWork>(self.entity(&task.id)?, &mut self.ecs).ok_or("field water task disappeared")?.vessel = None;
                        self.acknowledge_work_attempt(task.id.clone(), operation.attempt.generation, operation.sequence)?;
                        progressed += 1;
                        continue;
                    } else if let crate::work_attempt::ActivityRef::FieldWater { .. } = &activity {
                        let work = self.ecs.get::<FieldWaterWork>(self.entity(&task.id)?).cloned().ok_or("field water outcome lost its task state")?;
                        if matches!(result, crate::work_attempt::WorkOutcome::Completed) {
                            let lot = work.lot.clone().ok_or("field water withdrawal produced no lot")?;
                            if work.retain_in_vessel {
                                self.acknowledge_work_attempt(task.id.clone(), operation.attempt.generation, operation.sequence)?;
                                let entity = self.ids.remove(&task.id).ok_or("completed field water task disappeared")?;
                                self.known.remove(&task.id);
                                self.contents.remove(&task.id);
                                self.ecs.despawn(entity);
                                self.refresh_planner_index(&task.id);
                                self.refresh_state_weight();
                                progressed += 1;
                                continue;
                            }
                            let destination = self.entity(&work.destination)?;
                            let capacity = self.ecs.get::<Container>(destination).ok_or("field water destination is not a container")?.capacity;
                            let occupied = self.quantity_in_container(&work.destination).saturating_add(crate::supply_allocation::reserved_destination(self, &work.destination, None));
                            if occupied.saturating_add(u32::from(work.portions)) > capacity {
                                self.acknowledge_work_attempt(task.id.clone(), operation.attempt.generation, operation.sequence)?;
                            } else {
                                self.install_field_water_allocation(&task.id, work, lot)?;
                                let destination_position = *self.ecs.get::<Position>(destination).ok_or("field water destination has no contact")?;
                                self.continue_work_attempt(task.id.clone(), operation.attempt.generation, operation.sequence, crate::work_attempt::ActivityRef::Route { destination: Point { x: destination_position.x, y: destination_position.y, z: destination_position.z, frame: None } })?;
                            }
                        } else {
                            crate::record_changes::edit::<FieldWaterWork>(self.entity(&task.id)?, &mut self.ecs).ok_or("field water task disappeared")?.vessel = None;
                            self.acknowledge_work_attempt(task.id.clone(), operation.attempt.generation, operation.sequence)?;
                        }
                        progressed += 1;
                        continue;
                    } else if let crate::work_attempt::ActivityRef::JobTransform { .. } = &activity {
                        // Physical publication and Task completion were
                        // committed together when the executing activity was
                        // advanced. A retained outcome is acknowledgement
                        // only; re-executing here would duplicate matter.
                    } else if let Some(mut order) = self.ecs.get::<ResourceOrder>(self.entity(&task.id)?).cloned() {
                        match (&activity, &result) {
                            (crate::work_attempt::ActivityRef::ResourceExtract { .. }, crate::work_attempt::WorkOutcome::Completed) => {
                                order.status = "complete".into();
                                order.progress_seconds = 0.0;
                                if let Some(policy) = self.ecs.get::<WorkPolicy>(self.entity(&task.id)?).cloned() {
                                    self.ecs.entity_mut(self.entity(&task.id)?).insert(WorkPolicy { enabled: false, ..policy });
                                }
                            }
                            (crate::work_attempt::ActivityRef::ResourceEstablish { .. } | crate::work_attempt::ActivityRef::ResourceTend { .. }, crate::work_attempt::WorkOutcome::Completed) => {
                                order.status = "queued".into();
                                order.progress_seconds = 0.0;
                            }
                            (_, crate::work_attempt::WorkOutcome::Blocked { reason }) => { order.status = "blocked".into(); order.reason = format!("{reason:?}"); }
                            (_, crate::work_attempt::WorkOutcome::Interrupted { .. }) => order.status = "queued".into(),
                            _ => {}
                        }
                        if order.status != "blocked" { order.reason.clear(); }
                        self.ecs.entity_mut(self.entity(&task.id)?).insert(order); self.refresh_planner_index(&task.id);
                    } else if let Some(mut order) = self.ecs.get::<DeconstructionOrder>(self.entity(&task.id)?).cloned() {
                        match (&activity, &result) {
                            (crate::work_attempt::ActivityRef::Deconstruction { contact, .. }, crate::work_attempt::WorkOutcome::Completed) => {
                                order.contact_x = contact.x; order.contact_y = contact.y; order.contact_z = contact.z;
                                order.status = "complete".into(); order.reason.clear(); order.retry_key.clear();
                                self.ecs.entity_mut(self.entity(&task.id)?).insert(order);
                                if let Some(policy) = self.ecs.get::<crate::work_planner::WorkPolicy>(self.entity(&task.id)?).cloned() {
                                    self.ecs.entity_mut(self.entity(&task.id)?).insert(crate::work_planner::WorkPolicy { enabled: false, ..policy });
                                }
                                self.refresh_planner_index(&task.id);
                            }
                            (_, crate::work_attempt::WorkOutcome::Blocked { reason }) => {
                                order.status = "blocked".into(); order.reason = format!("{reason:?}");
                                self.ecs.entity_mut(self.entity(&task.id)?).insert(order);
                            }
                            _ => {}
                        }
                    } else if let Some(order) = self.ecs.get::<ExcavationOrder>(self.entity(&task.id)?).cloned() {
                        match (&activity, &result) {
                            (crate::work_attempt::ActivityRef::Excavation { .. }, crate::work_attempt::WorkOutcome::Completed) => {
                                self.acknowledge_work_attempt(task.id.clone(), operation.attempt.generation, operation.sequence)?;
                                self.remove_excavation_order(&task.id)?;
                                progressed += 1;
                                continue;
                            }
                            (_, crate::work_attempt::WorkOutcome::Interrupted { cause: crate::work_attempt::InterruptCause::Cancelled }) if order.status == "cancelling" => {
                                self.acknowledge_work_attempt(task.id.clone(), operation.attempt.generation, operation.sequence)?;
                                self.remove_excavation_order(&task.id)?;
                                progressed += 1;
                                continue;
                            }
                            (_, crate::work_attempt::WorkOutcome::Blocked { reason }) => {
                                self.ecs.entity_mut(self.entity(&task.id)?).insert(ExcavationOrder { status: "blocked".into(), reason: format!("{reason:?}"), ..order });
                                self.refresh_planner_index(&task.id);
                            }
                            (_, crate::work_attempt::WorkOutcome::Interrupted { .. }) => {
                                self.ecs.entity_mut(self.entity(&task.id)?).insert(ExcavationOrder { status: "queued".into(), reason: String::new(), ..order });
                                self.refresh_planner_index(&task.id);
                            }
                            _ => {}
                        }
                    }
                    self.acknowledge_work_attempt(
                        task.id.clone(),
                        operation.attempt.generation,
                        operation.sequence,
                    )?;
                    progressed += 1;
                }
            }
        }

        Ok(progressed)
    }
}
