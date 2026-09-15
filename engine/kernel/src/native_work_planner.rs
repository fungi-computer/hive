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
use crate::work_planner::{MAX_ASSIGNMENTS, MAX_CANDIDATE_PAIRS, MAX_TASK_REVIEWS, WorkOperation, WorkPolicy, WorkRequirement, WorkSchedule};
use sha2::{Digest, Sha256};
use std::collections::{BTreeMap, BTreeSet};
use std::sync::Arc;

const MAX_CARRY_PORTION: u32 = 3;

fn field_water_task_id(owner: &str, role: &str, generation: u64, ordinal: u32) -> String {
    let mut digest = Sha256::new();
    for value in [owner.as_bytes(), role.as_bytes()] {
        digest.update((value.len() as u64).to_le_bytes());
        digest.update(value);
    }
    digest.update(8_u64.to_le_bytes());
    digest.update(generation.to_le_bytes());
    format!("field-water:{:x}:{ordinal}", digest.finalize())
}
const MAX_SUPPLY_EXPANSIONS: usize = 64;

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

#[derive(Clone)]
struct FieldWaterSlot {
    task: String,
    requirement: SupplyRequirement,
    contacts: Arc<WaterContactIndex>,
}

struct WaterContactIndex {
    flat: Vec<(crate::generation::Cell, Point)>,
    targets: Vec<Point>,
}

#[derive(Clone)]
enum PlanningObligation {
    Supply(SupplySlot),
    FieldWater(FieldWaterSlot),
    Labor(WorkRequirement),
}

impl PlanningObligation {
    fn task(&self) -> &str {
        match self { Self::Supply(slot) => &slot.task, Self::FieldWater(slot) => &slot.task, Self::Labor(requirement) => &requirement.task }
    }

    fn party(&self) -> &str {
        match self { Self::Supply(slot) => &slot.requirement.party, Self::FieldWater(slot) => &slot.requirement.party, Self::Labor(requirement) => &requirement.party }
    }

    fn owner(&self) -> &str {
        match self { Self::Supply(slot) => &slot.requirement.owner, Self::FieldWater(slot) => &slot.task, Self::Labor(requirement) => &requirement.task }
    }
}

enum PlanningWitness {
    Supply(super::PreparedRoute),
    FieldWater { vessel: String, cell: crate::generation::Cell, destination: Point, route: super::PreparedRoute },
    Labor(Point, super::PreparedRoute),
}

struct PlannerWorker {
    id: String,
    party: String,
    position: Position,
    free_capacity: u32,
}

impl Kernel {
    /// Run the first native automatic labor slice. Domain modules contribute
    /// requirements; this owner alone chooses workers, verifies routes and
    /// advances the keyed attempt lifecycle. The current checkpoint keeps the
    /// older party field on the policy until the access/work-pool conversion.
    pub(crate) fn advance_native_work_planner(&mut self, tick: u64) -> Result<usize> {
        let mut progressed = self.reconcile_supply_allocations()?;
        progressed += self.promote_pending_field_water()?;
        // Physical completion disables a construction site's assignment
        // policy immediately. Reap its completed attempt independently of
        // the candidate index so the worker is released even though the
        // finished site is no longer eligible for another assignment.
        let finished_construction = self.work_attempts.iter().filter_map(|(task, entity)| {
            let site = self.ecs.get::<ConstructionSite>(*entity)?;
            let attempt = self.ecs.get::<crate::work_attempt::WorkAttempt>(*entity)?;
            (site.phase == ConstructionPhase::Finished
                && matches!(
                    attempt.phase,
                    crate::work_attempt::AttemptPhase::Outcome {
                        activity: crate::work_attempt::ActivityRef::Construction { .. },
                        result: crate::work_attempt::WorkOutcome::Completed,
                        ..
                    }
                ))
                .then(|| (task.clone(), attempt.clone()))
        }).collect::<Vec<_>>();
        for (task, attempt) in finished_construction {
            let operation = attempt.current_operation().ok_or("finished construction attempt has no operation")?.clone();
            self.acknowledge_work_attempt(task, operation.attempt.generation, operation.sequence)?;
            progressed += 1;
        }
        if !self.planner_indexes.has_due_task(tick) {
            return Ok(progressed);
        }
        let mut window = self.next_native_planning_window(tick);
        // Priority is authoritative for admission, while lower tiers remain due
        // for a later window. Advancing every reviewed schedule here would let a
        // continuously replenished high tier starve lower-priority work.
        if let Some(priority) = window.tasks.first().map(|task| task.priority) {
            window.tasks.retain(|task| task.priority == priority);
        }
        // Persist review progress before any early return. A witnessed
        // no-path/deferred route therefore waits for the normal retry window,
        // while accepted mutations can wake it by updating its schedule.
        for task in &window.tasks {
            if let Ok(entity) = self.entity(&task.id) {
                if self.ecs.get::<crate::work_planner::WorkSchedule>(entity).is_some() {
                    let next_review_tick = tick.checked_add(crate::work_planner::DEFAULT_REVIEW_INTERVAL).ok_or("native work review tick exhausted")?;
                    self.ecs.entity_mut(entity).insert(crate::work_planner::WorkSchedule { next_review_tick, last_considered: tick });
                    self.refresh_planner_index(&task.id);
                }
            }
        }
        if window.tasks.is_empty() {
            return Ok(0);
        }

        // Reconcile already-delivered process inputs before taking the
        // read-only contribution view. Newly admitted deliveries cannot arrive
        // in this planning pass, so collection observes one coherent state.
        for task in &window.tasks {
            let entity = self.entity(&task.id)?;
            if let Some(state) = self.ecs.get::<StagedProcess>(entity).cloned()
                && state.phase == ProcessPhase::Waiting
                && state.stage_index == 0
                && self.process_bindings(&task.id).is_empty()
            {
                let _ = self.try_admit_process(&task.id, &state.definition, &state.station)?;
            }
        }

        // First consume retained outcomes from the selected bounded window.
        // A completed route is continued into the domain operation using the
        // exact contact it reached; terminal domain outcomes are acknowledged
        // only after their physical owner has published them.
        for task in &window.tasks {
            let Some(attempt) = self.work_attempt(&task.id).cloned() else { continue; };
            let crate::work_attempt::AttemptPhase::Outcome { operation, activity, result } = attempt.phase else { continue; };
            match (activity, result) {
                (crate::work_attempt::ActivityRef::Route { destination }, crate::work_attempt::WorkOutcome::Completed) => {
                    if let Some(field) = self.ecs.get::<FieldWaterWork>(self.entity(&task.id)?).cloned()
                        && let Some(vessel) = field.vessel
                    {
                        self.continue_work_attempt(task.id.clone(), operation.attempt.generation, operation.sequence, crate::work_attempt::ActivityRef::FieldWater {
                            vessel, cell: [field.cell_x, field.cell_y, field.cell_z], direction: crate::work_attempt::WaterDirection::Withdraw, portions: 1,
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
                        self.ecs.get_mut::<FieldWaterWork>(self.entity(&task.id)?).ok_or("field water task disappeared")?.vessel = None;
                        self.acknowledge_work_attempt(task.id.clone(), operation.attempt.generation, operation.sequence)?;
                        progressed += 1;
                        continue;
                    } else if let crate::work_attempt::ActivityRef::FieldWater { .. } = &activity {
                        if let Some(work) = self.ecs.get::<FieldWaterWork>(self.entity(&task.id)?).cloned() {
                            if matches!(result, crate::work_attempt::WorkOutcome::Completed) {
                                let lot = work.lot.clone().ok_or("field water withdrawal produced no lot")?;
                                let destination = self.entity(&work.destination)?;
                                let capacity = self.ecs.get::<Container>(destination).ok_or("field water destination is not a container")?.capacity;
                                let occupied = self.quantity_in_container(&work.destination).saturating_add(crate::supply_allocation::reserved_destination(self, &work.destination, None));
                                if occupied.saturating_add(1) > capacity {
                                    self.acknowledge_work_attempt(task.id.clone(), operation.attempt.generation, operation.sequence)?;
                                    progressed += 1;
                                    continue;
                                }
                                self.ecs.entity_mut(self.entity(&task.id)?).remove::<FieldWaterWork>();
                                self.ecs.entity_mut(self.entity(&task.id)?).insert(SupplyAllocation {
                                    requirement_owner: work.process, requirement_role: work.role, requirement_generation: work.generation,
                                    party: work.party, material: "water".into(), portion: lot, destination: work.destination,
                                    quantity: 1, state: SupplyAllocationState::Reserved,
                                });
                                let destination_position = *self.ecs.get::<Position>(destination).ok_or("field water destination has no contact")?;
                                self.continue_work_attempt(task.id.clone(), operation.attempt.generation, operation.sequence, crate::work_attempt::ActivityRef::Route { destination: Point { x: destination_position.x, y: destination_position.y, z: destination_position.z, frame: None } })?;
                            } else {
                                self.ecs.get_mut::<FieldWaterWork>(self.entity(&task.id)?).ok_or("field water task disappeared")?.vessel = None;
                                self.acknowledge_work_attempt(task.id.clone(), operation.attempt.generation, operation.sequence)?;
                            }
                        }
                    } else if let crate::work_attempt::ActivityRef::JobTransform { .. } = &activity {
                        // Physical publication and Task completion were
                        // committed together when the executing activity was
                        // advanced. A retained outcome is acknowledgement
                        // only; re-executing here would duplicate matter.
                        self.acknowledge_work_attempt(task.id.clone(), operation.attempt.generation, operation.sequence)?;
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

        let mut supply_requirements = Vec::new();
        let mut requirements = Vec::new();
        let indexed_task_ids = self.planner_indexes.task_ids().map(str::to_owned).collect::<Vec<_>>();
        let designated_excavation_cells = indexed_task_ids.iter().filter_map(|task| {
            let entity = self.entity(task).ok()?;
            let order = self.ecs.get::<ExcavationOrder>(entity)?;
            Some((order.cell_x, order.cell_y, order.cell_z))
        }).collect::<BTreeSet<_>>();
        for task in &window.tasks {
            // Outcome reconciliation may lawfully retire a completed or
            // cancelled task from this same captured review window.
            let Ok(entity) = self.entity(&task.id) else { continue; };
            let party = task.party.clone();
            // Supply discovery is deliberately behind the same task review
            // window. Its owner accounts for existing reservations, so calling
            // both domains in one pass cannot duplicate an allocation.
            if self.ecs.get::<ConstructionSite>(entity).is_some() {
                let phase = self.ecs.get::<ConstructionSite>(entity).ok_or("construction site disappeared")?.phase;
                if phase == ConstructionPhase::Planned {
                    supply_requirements.extend(self.construction_supply_requirements(&task.id, &party)?);
                    if let Some(requirement) = self.construction_work_requirement(&task.id, &party)? {
                        requirements.push(requirement);
                    }
                }
            } else if self.ecs.get::<StagedProcess>(entity).is_some() {
                let state = self.ecs.get::<StagedProcess>(entity).ok_or("staged process disappeared")?.clone();
                if state.phase == ProcessPhase::Waiting {
                    if state.stage_index == 0 && self.process_bindings(&task.id).is_empty() {
                        supply_requirements.extend(self.process_supply_requirements(&task.id, &party)?);
                    }
                    if let Some(requirement) = self.process_work_requirement(&task.id, &party)? {
                        requirements.push(requirement);
                    }
                }
            } else if self.ecs.get::<DeconstructionOrder>(entity).is_some()
                && let Some(requirement) = self.deconstruction_work_requirement(&task.id, &party)?
            {
                requirements.push(requirement);
            } else if self.ecs.get::<ExcavationOrder>(entity).is_some()
                && let Some(requirement) = self.excavation_work_requirement(&task.id, &party, &designated_excavation_cells)?
            {
                requirements.push(requirement);
            } else if self.ecs.get::<FieldWaterWork>(entity).is_some() {
                // Field-water tasks are converted to ordinary supply delivery
                // after their exact generated lot exists.
            } else if self.ecs.get::<crate::job::Task>(entity).is_some()
                && let Some(requirement) = self.job_work_requirement(&task.id, &party)?
            {
                requirements.push(requirement);
            }
        }
        self.ensure_field_water_tasks(&supply_requirements)?;
        progressed += self.assign_native_obligations(&window, &supply_requirements, requirements)?;
        Ok(progressed)
    }

    fn promote_pending_field_water(&mut self) -> Result<usize> {
        let tasks = self.ids.iter().filter_map(|(id, entity)| {
            let work = self.ecs.get::<FieldWaterWork>(*entity)?.clone();
            (work.lot.is_some() && !self.work_attempts.contains_key(id)).then_some((id.clone(), work))
        }).collect::<Vec<_>>();
        let mut progressed = 0;
        for (task, work) in tasks {
            let lot_id = work.lot.clone().ok_or("field water lot is missing")?;
            let lot_entity = self.entity(&lot_id)?;
            self.ecs.get::<Lot>(lot_entity).ok_or("field water lot disappeared")?;
            let vessel_id = work.vessel.clone().ok_or("field water vessel is missing")?;
            let vessel_entity = self.entity(&vessel_id)?;
            let worker_id = self.ecs.get::<Lot>(vessel_entity).ok_or("field water vessel is not a lot")?.container.clone();
            let destination_entity = self.entity(&work.destination)?;
            let capacity = self.ecs.get::<Container>(destination_entity).ok_or("field water destination is not a container")?.capacity;
            let occupied = self.quantity_in_container(&work.destination).saturating_add(crate::supply_allocation::reserved_destination(self, &work.destination, None));
            if occupied.saturating_add(1) > capacity { continue; }
            let worker = self.entity(&worker_id)?;
            if self.ecs.get::<PartyMember>(worker).map(|member| member.party.as_str()) != Some(work.party.as_str())
                || !self.ecs.get::<VesselCapability>(vessel_entity).is_some_and(|capability| capability.accepts_water)
                || self.ecs.get::<Body>(worker).is_none_or(|body| !body.speed.is_finite() || body.speed <= 0.0)
                || self.ecs.get::<Traversal>(worker).is_none() || self.ecs.get::<Position>(worker).is_none()
                || !self.ecs.get::<WorkParticipation>(worker).is_some_and(|participation| participation.automatic)
                || self.attempts_by_worker.contains_key(&worker_id) || self.ecs.get::<Destination>(worker).is_some()
            { continue; }
            let position = *self.ecs.get::<Position>(worker).ok_or("field water worker has no position")?;
            let destination_position = *self.ecs.get::<Position>(destination_entity).ok_or("field water destination has no position")?;
            let destination = Point { x: destination_position.x, y: destination_position.y, z: destination_position.z, frame: None };
            let route = match super::route_query::classify_route(self.route_for(worker, position, &destination))? {
                SearchOutcome::Reachable(route) => route,
                SearchOutcome::NoPath(_) | SearchOutcome::Deferred(_) => continue,
            };
            self.ecs.entity_mut(self.entity(&task)?).remove::<FieldWaterWork>();
            self.ecs.entity_mut(self.entity(&task)?).insert(SupplyAllocation {
                requirement_owner: work.process, requirement_role: work.role, requirement_generation: work.generation,
                party: work.party.clone(), material: "water".into(), portion: lot_id, destination: work.destination,
                quantity: 1, state: SupplyAllocationState::Reserved,
            });
            self.begin_work_attempt_with_prepared_route(task, worker_id, work.party, destination, route)?;
            progressed += 1;
        }
        Ok(progressed)
    }

    /// Accrue saved generic task work and commit its transform exactly once
    /// when the authored duration is reached. This runs after movement and
    /// before planner admission in the same durable batch.
    pub(crate) fn advance_job_transform_work(&mut self, delta: f64) -> Result<()> {
        if !delta.is_finite() || delta < 0.0 { return Err("invalid job task work delta".into()); }
        let attempts = self.work_attempts.iter().filter_map(|(attempt_task, entity)| {
            let attempt = self.ecs.get::<crate::work_attempt::WorkAttempt>(*entity)?;
            let crate::work_attempt::AttemptPhase::Executing { operation, activity: crate::work_attempt::ActivityRef::JobTransform { task, contact } } = &attempt.phase else { return None; };
            Some((attempt_task.clone(), task.clone(), operation.clone(), attempt.party.clone(), attempt.worker.clone(), contact.clone()))
        }).collect::<Vec<_>>();
        for (attempt_task, task_id, operation_key, party, worker, contact) in attempts {
            let task_entity = self.entity(&task_id)?;
            let task = self.ecs.get::<crate::job::Task>(task_entity).cloned().ok_or("job task is missing")?;
            let worker_entity = self.entity(&worker)?;
            let worker_pose = self.world_pose_entity(worker_entity, 0)?;
            let worker_frame = self.support_id(worker_entity);
            let at_contact = (worker_pose.x - contact.x).abs() <= f64::EPSILON
                && (worker_pose.y - contact.y).abs() <= f64::EPSILON
                && (worker_pose.z - contact.z).abs() <= f64::EPSILON
                && worker_frame == contact.frame;
            if !at_contact || !self.job_work_contacts(&task)?.iter().any(|candidate| candidate == &contact) {
                self.settle_attempt(&attempt_task, crate::work_attempt::AttemptPhase::Outcome {
                    operation: operation_key,
                    activity: crate::work_attempt::ActivityRef::JobTransform { task: task_id, contact },
                    result: crate::work_attempt::WorkOutcome::Blocked { reason: crate::work_attempt::WorkBlockReason::AccessLost },
                })?;
                continue;
            }
            let work = self.ecs.get::<crate::job::JobTaskWork>(task_entity).cloned().ok_or("job task work is missing")?;
            let seconds = super::earned_work_seconds(work.seconds, delta, task.operation_work_seconds())?;
            let mut updated = work;
            updated.seconds = seconds;
            self.ecs.entity_mut(task_entity).insert(updated);
            self.refresh_state_weight();
            if seconds + f64::EPSILON < task.operation_work_seconds() { continue; }
            let mut operation = task.operation.clone();
            if let crate::job::TypedWorkOperation::ItemToItems { source: crate::job::EntityBinding::Result { step, slot }, input_kind, input_quantity, output_kind, output_quantity, work_seconds, result_slot } = operation {
                let source = self.resolve_job_result_source(&task, &step, &slot)?;
                operation = crate::job::TypedWorkOperation::ItemToItems { source: crate::job::EntityBinding::Exact(source), input_kind, input_quantity, output_kind, output_quantity, work_seconds, result_slot };
            }
            let output = self.execute_job_transform(&operation, &party)?;
            self.complete_job_task(&task_id, vec![crate::job::TaskResultBinding { slot: operation.result_slot().to_owned(), entity: output }])?;
            self.settle_attempt(&attempt_task, crate::work_attempt::AttemptPhase::Outcome { operation: operation_key.clone(), activity: crate::work_attempt::ActivityRef::JobTransform { task: task_id, contact }, result: crate::work_attempt::WorkOutcome::Completed })?;
            self.acknowledge_work_attempt(attempt_task.clone(), operation_key.attempt.generation, operation_key.sequence)?;
        }
        Ok(())
    }

    /// Match finite-material deliveries and ready labor in one bounded solver
    /// invocation. Domain contributors describe obligations; this owner alone
    /// narrows workers, prices real routes and publishes the selected work.
    fn assign_native_obligations(
        &mut self,
        source_window: &crate::work_candidates::PlanningWindow,
        supply_requirements: &[SupplyRequirement],
        labor_requirements: Vec<WorkRequirement>,
    ) -> Result<usize> {
        let workers = source_window.workers.iter().filter_map(|worker| {
            let entity = self.entity(&worker.id).ok()?;
            let position = *self.ecs.get::<Position>(entity)?;
            let free_capacity = self.ecs.get::<Container>(entity).map(|container| {
                container.capacity.saturating_sub(
                    u32::try_from(self.quantity_in_container(&worker.id)).unwrap_or(u32::MAX),
                )
            }).unwrap_or(0);
            (self.ecs.get::<Body>(entity).is_some_and(|body| body.speed.is_finite() && body.speed > 0.0)
                && self.ecs.get::<Traversal>(entity).is_some()
                && !self.attempts_by_worker.contains_key(&worker.id)
                && self.ecs.get::<Destination>(entity).is_none()
                && !self.direct.contains_key(&entity)
                && self.ecs.get::<Support>(entity).is_none()
                && self.ecs.get::<ExcavationWork>(entity).is_none())
                .then_some(PlannerWorker { id: worker.id.clone(), party: worker.party.clone(), position, free_capacity })
        }).collect::<Vec<_>>();
        if workers.is_empty() { return Ok(0); }

        let carry_limit_by_party = workers.iter().filter(|worker| worker.free_capacity > 0).fold(
            BTreeMap::<String, u32>::new(),
            |mut limits, worker| {
                limits.entry(worker.party.clone())
                    .and_modify(|limit| *limit = (*limit).min(worker.free_capacity))
                    .or_insert(worker.free_capacity);
                limits
            },
        );
        let mut ordered_supply = supply_requirements.to_vec();
        ordered_supply.sort_by(|left, right| {
            (&left.owner, &left.role, &left.party, &left.material, &left.destination)
                .cmp(&(&right.owner, &right.role, &right.party, &right.material, &right.destination))
        });
        let raw_slots = self.prepare_supply_slots(&ordered_supply, MAX_SUPPLY_EXPANSIONS)?;
        let mut supply_slots = Vec::new();
        for slot in raw_slots {
            let Some(limit) = carry_limit_by_party.get(&slot.requirement.party).copied() else { continue; };
            let limit = limit.min(MAX_CARRY_PORTION);
            let mut remaining = slot.quantity;
            while remaining > 0 && supply_slots.len() < MAX_TASK_REVIEWS {
                let quantity = remaining.min(limit);
                if slot.policy == InputPolicy::WholeLot && quantity != remaining { break; }
                let mut portion = slot.clone();
                portion.task = format!("native:supply-slot:{}", supply_slots.len());
                portion.quantity = quantity;
                supply_slots.push(portion);
                remaining -= quantity;
            }
            if supply_slots.len() == MAX_TASK_REVIEWS { break; }
        }

        let needs_water_contacts = source_window.tasks.iter().any(|task| {
            self.entity(&task.id).ok().and_then(|entity| self.ecs.get::<FieldWaterWork>(entity)).is_some_and(|work| work.lot.is_none())
        });
        let water_contacts = if needs_water_contacts {
            workers.chunks(16).try_fold(Vec::new(), |mut contacts, batch| {
                if contacts.len() < 8 {
                    let remaining = 8 - contacts.len();
                    contacts.extend(self.native_water_contacts(&batch.iter().map(|worker| worker.position).collect::<Vec<_>>())?.into_iter().take(remaining));
                }
                Ok::<_, String>(contacts)
            })?
        } else {
            Vec::new()
        };
        let cells = water_contacts;
        let contacts = Arc::new(WaterContactIndex {
            targets: cells.iter().flat_map(|(_, approaches)| approaches.iter().cloned()).collect(),
            flat: cells.iter().flat_map(|(cell, approaches)| approaches.iter().map(move |approach| (*cell, approach.clone()))).collect(),
        });

        // Preserve the source task window's priority/fairness order. Multiple
        // portions for one task stay adjacent and the global cap remains 32.
        let labor_by_task = labor_requirements.into_iter()
            .map(|requirement| (requirement.task.clone(), requirement))
            .collect::<BTreeMap<_, _>>();
        let mut obligations = Vec::new();
        for task in &source_window.tasks {
            for slot in supply_slots.iter().filter(|slot| slot.requirement.owner == task.id) {
                if obligations.len() == MAX_TASK_REVIEWS { break; }
                obligations.push(PlanningObligation::Supply(slot.clone()));
            }
            if obligations.len() == MAX_TASK_REVIEWS { break; }
            if let Ok(entity) = self.entity(&task.id)
                && let Some(field) = self.ecs.get::<FieldWaterWork>(entity).cloned()
                && field.lot.is_none()
                && !contacts.targets.is_empty()
            {
                obligations.push(PlanningObligation::FieldWater(FieldWaterSlot {
                    task: task.id.clone(),
                    requirement: SupplyRequirement { owner: field.process, role: field.role, generation: field.generation, party: field.party, material: "water".into(), policy: InputPolicy::Portion, destination: field.destination, missing: 1 },
                    contacts: contacts.clone(),
                }));
            }
            if obligations.len() == MAX_TASK_REVIEWS { break; }
            if let Some(requirement) = labor_by_task.get(&task.id) {
                obligations.push(PlanningObligation::Labor(requirement.clone()));
            }
            if obligations.len() == MAX_TASK_REVIEWS { break; }
        }
        if obligations.is_empty() { return Ok(0); }

        // The caller contributes one priority tier at a time. Lower tiers keep
        // their due schedule and enter the next fair window.

        let bound = |worker: &PlannerWorker, obligation: &PlanningObligation| -> Option<f64> {
            if worker.party != obligation.party() { return None; }
            match obligation {
                PlanningObligation::Supply(slot) if slot.quantity <= worker.free_capacity => Some(
                    ((worker.position.x - slot.source_position.x).powi(2)
                        + (worker.position.y - slot.source_position.y).powi(2)
                        + (worker.position.z - slot.source_position.z).powi(2)).sqrt(),
                ),
                PlanningObligation::Supply(_) => None,
                PlanningObligation::FieldWater(slot) => self.water_vessel_for_worker(&worker.id).and_then(|(_, free)| {
                    if free == 0 { return None; }
                    slot.contacts.targets.iter().map(|contact| {
                        ((worker.position.x - contact.x).powi(2)
                            + (worker.position.y - contact.y).powi(2)
                            + (worker.position.z - contact.z).powi(2)).sqrt()
                    }).min_by(f64::total_cmp)
                }),
                PlanningObligation::Labor(requirement) if requirement.free_capacity_required <= worker.free_capacity
                    && requirement.required_worker.as_deref().is_none_or(|required| required == worker.id) => requirement.contacts.iter().map(|contact| {
                    ((worker.position.x - contact.x).powi(2)
                        + (worker.position.y - contact.y).powi(2)
                        + (worker.position.z - contact.z).powi(2)).sqrt()
                }).min_by(f64::total_cmp),
                PlanningObligation::Labor(_) => None,
            }
        };

        let task_metadata = source_window.tasks.iter().map(|task| (task.id.as_str(), task)).collect::<BTreeMap<_, _>>();
        let planning_window = crate::work_candidates::PlanningWindow {
            workers: workers.iter().map(|worker| crate::work_candidates::WorkerCandidate { id: worker.id.clone(), party: worker.party.clone() }).collect(),
            tasks: obligations.iter().map(|obligation| {
                let metadata = task_metadata.get(obligation.owner()).expect("obligation owner came from planning window");
                crate::work_candidates::TaskCandidate {
                    id: obligation.task().to_owned(), party: obligation.party().to_owned(),
                    priority: metadata.priority, last_considered: metadata.last_considered, due_tick: metadata.due_tick,
                }
            }).collect(),
        };
        let obligations_by_task = obligations.iter().map(|obligation| (obligation.task().to_owned(), obligation.clone())).collect::<BTreeMap<_, _>>();
        if obligations_by_task.len() != obligations.len()
            || obligations.iter().any(|obligation| {
                matches!(obligation, PlanningObligation::Supply(_))
                    && (self.ids.contains_key(obligation.task()) || labor_by_task.contains_key(obligation.task()))
            })
        {
            return Err("native planning obligation identity collision".into());
        }
        let workers_per_obligation = (MAX_CANDIDATE_PAIRS / obligations.len()).max(1);
        let mut candidates = Vec::new();
        for obligation in &obligations {
            let mut nearby = workers.iter().filter_map(|worker| bound(worker, obligation).map(|cost| (worker, cost))).collect::<Vec<_>>();
            nearby.sort_by(|(left_worker, left_cost), (right_worker, right_cost)| left_cost.total_cmp(right_cost).then(left_worker.id.cmp(&right_worker.id)));
            candidates.extend(nearby.into_iter().take(workers_per_obligation).map(|(worker, cost)| crate::assign::Candidate {
                worker: worker.id.clone(), task: obligation.task().to_owned(), cost,
            }));
        }
        if candidates.is_empty() { return Ok(0); }

        let selected = crate::work_candidates::assign_verified(&planning_window, &candidates, |candidate| {
            let worker_entity = self.entity(&candidate.worker)?;
            let position = *self.ecs.get::<Position>(worker_entity).ok_or("native planner worker lost position")?;
            let obligation = obligations_by_task.get(&candidate.task).ok_or("native planner obligation disappeared")?;
            match obligation {
                PlanningObligation::Supply(slot) => {
                    let destination = Point { x: slot.source_position.x, y: slot.source_position.y, z: slot.source_position.z, frame: None };
                    match super::route_query::classify_route(self.route_for(worker_entity, position, &destination))? {
                        SearchOutcome::Reachable(route) => {
                            let points = std::iter::once(crate::navigation::point(position)).chain(route.points.iter().cloned()).collect::<Vec<_>>();
                            let cost = crate::terrain_route::waypoint_cost_micrometres(points)? as f64 / 1_000_000.0;
                            Ok(SearchOutcome::Reachable((cost, PlanningWitness::Supply(route))))
                        }
                        SearchOutcome::NoPath(error) => Ok(SearchOutcome::NoPath(error)),
                        SearchOutcome::Deferred(error) => Ok(SearchOutcome::Deferred(error)),
                    }
                }
                PlanningObligation::FieldWater(slot) => {
                    let (vessel, _) = self.water_vessel_for_worker(&candidate.worker).ok_or("native water worker has no compatible vessel")?;
                    match super::route_query::classify_route(self.route_for_any(worker_entity, position, &slot.contacts.targets))? {
                        SearchOutcome::Reachable((index, route)) => {
                            let (cell, destination) = slot.contacts.flat.get(index).cloned().ok_or("native water contact index is invalid")?;
                            let points = std::iter::once(crate::navigation::point(position)).chain(route.points.iter().cloned()).collect::<Vec<_>>();
                            let cost = crate::terrain_route::waypoint_cost_micrometres(points)? as f64 / 1_000_000.0;
                            Ok(SearchOutcome::Reachable((cost, PlanningWitness::FieldWater { vessel, cell, destination, route })))
                        }
                        SearchOutcome::NoPath(error) => Ok(SearchOutcome::NoPath(error)),
                        SearchOutcome::Deferred(error) => Ok(SearchOutcome::Deferred(error)),
                    }
                }
                PlanningObligation::Labor(requirement) => match super::route_query::classify_route(self.route_for_any(worker_entity, position, &requirement.contacts))? {
                    SearchOutcome::Reachable((index, route)) => {
                        let contact = requirement.contacts.get(index).ok_or("native planner contact index is invalid")?.clone();
                        let points = std::iter::once(crate::navigation::point(position)).chain(route.points.iter().cloned()).collect::<Vec<_>>();
                        let cost = crate::terrain_route::waypoint_cost_micrometres(points)? as f64 / 1_000_000.0;
                        Ok(SearchOutcome::Reachable((cost, PlanningWitness::Labor(contact, route))))
                    }
                    SearchOutcome::NoPath(error) => Ok(SearchOutcome::NoPath(error)),
                    SearchOutcome::Deferred(error) => Ok(SearchOutcome::Deferred(error)),
                },
            }
        }).map_err(|error| format!("native joint assignment failed: {error:?}"))?;

        let mut supply = Vec::new();
        let mut field = Vec::new();
        let mut labor = Vec::new();
        for assignment in selected.assignments {
            let obligation = obligations_by_task.get(&assignment.task).ok_or("selected native obligation disappeared")?;
            match (obligation, assignment.witness) {
                (PlanningObligation::Supply(slot), PlanningWitness::Supply(route)) => supply.push(SupplyAdmissionRequest {
                    requirement_owner: slot.requirement.owner.clone(), requirement_role: slot.requirement.role.clone(),
                    requirement_generation: slot.requirement.generation, party: slot.requirement.party.clone(),
                    material: slot.requirement.material.clone(), portion: slot.lot.clone(),
                    destination_container: slot.requirement.destination.clone(), quantity: slot.quantity,
                    worker: assignment.worker,
                    route_destination: Point { x: slot.source_position.x, y: slot.source_position.y, z: slot.source_position.z, frame: None }, route,
                }),
                (PlanningObligation::FieldWater(slot), PlanningWitness::FieldWater { vessel, cell, destination, route }) => field.push((slot.clone(), assignment.worker, vessel, cell, destination, route)),
                (PlanningObligation::Labor(requirement), PlanningWitness::Labor(contact, route)) => labor.push((requirement.clone(), assignment.worker, contact, route)),
                _ => return Err("native planner witness kind mismatch".into()),
            }
        }
        let generation_steps = supply.len().checked_mul(2).and_then(|count| count.checked_add(labor.len())).and_then(|count| count.checked_add(field.len().saturating_mul(2))).ok_or("native assignment batch is too large")?;
        self.next_work_generation.checked_add(u64::try_from(generation_steps).map_err(|_| "native assignment batch is too large")?).ok_or("native assignment generation exhausted")?;
        let mut selected_workers = BTreeSet::new();
        let mut selected_tasks = BTreeSet::new();
        for (requirement, worker, _, _) in &labor {
            if !valid_id(&requirement.task) || !valid_id(worker) || !valid_id(&requirement.party)
                || !selected_workers.insert(worker.clone()) || !selected_tasks.insert(requirement.task.clone())
                || self.work_attempts.contains_key(&requirement.task) || self.attempts_by_worker.contains_key(worker)
            {
                return Err("native labor assignment preflight failed".into());
            }
            let party = self.entity(&requirement.party)?;
            if self.ecs.get::<Party>(party).is_none() { return Err("native labor party is not a party".into()); }
            let worker_entity = self.entity(worker)?;
            if self.ecs.get::<PartyMember>(worker_entity).map(|member| member.party.as_str()) != Some(requirement.party.as_str())
                || self.ecs.get::<Body>(worker_entity).is_none_or(|body| !body.speed.is_finite() || body.speed <= 0.0)
                || self.ecs.get::<Traversal>(worker_entity).is_none()
                || self.ecs.get::<Destination>(worker_entity).is_some()
                || self.direct.contains_key(&worker_entity)
            {
                return Err("native labor worker became unavailable".into());
            }
            let task_entity = self.entity(&requirement.task)?;
            if self.ecs.get::<OwnedByParty>(task_entity).is_some_and(|owner| owner.party != requirement.party) {
                return Err("native labor task changed party".into());
            }
        }
        for request in &supply {
            if !selected_workers.insert(request.worker.clone()) {
                return Err("native joint assignment selected a worker twice".into());
            }
        }
        for (slot, worker, vessel, _, _, _) in &field {
            if !selected_workers.insert(worker.clone()) { return Err("native joint assignment selected a worker twice".into()); }
            let task_entity = self.entity(&slot.task)?;
            let work = self.ecs.get::<FieldWaterWork>(task_entity).ok_or("field water task disappeared")?;
            if work.vessel.is_some() || work.lot.is_some() || work.party != slot.requirement.party || vessel == worker { return Err("native field water assignment preflight failed".into()); }
            let vessel_entity = self.entity(vessel)?;
            let vessel_lot = self.ecs.get::<Lot>(vessel_entity).ok_or("native water vessel is not a lot")?;
            if vessel_lot.container != *worker || !self.ecs.get::<VesselCapability>(vessel_entity).is_some_and(|capability| capability.accepts_water) { return Err("native field water vessel became unavailable".into()); }
        }
        let supply_count = self.admit_supply_assignments(supply)?.len();
        let labor_count = labor.len();
        let field_count = field.len();
        for (slot, worker, vessel, cell, destination, route) in field {
            let entity = self.entity(&slot.task)?;
            let mut work = self.ecs.get_mut::<FieldWaterWork>(entity).ok_or("field water task disappeared")?;
            work.vessel = Some(vessel);
            work.cell_x = cell.x as i32;
            work.cell_y = cell.y;
            work.cell_z = cell.z as i32;
            self.begin_work_attempt_with_prepared_route(slot.task, worker, slot.requirement.party, destination, route)?;
        }
        for (requirement, worker, contact, route) in labor {
            self.begin_work_attempt_with_prepared_route(requirement.task, worker, requirement.party, contact, route)?;
        }
        Ok(supply_count + labor_count + field_count)
    }

    /// Contribute a ready Job Task to the same assignment window as every
    /// other work family. The source location is queried from canonical
    /// finite/lot custody on every review, so a result item can be moved or
    /// stored between its two tasks.
    fn job_work_requirement(&self, task_id: &str, party: &str) -> Result<Option<WorkRequirement>> {
        if !self.job_index.ready_tasks.contains(task_id) { return Ok(None); }
        if self.work_attempts.contains_key(task_id) { return Ok(None); }
        let task_entity = self.entity(task_id)?;
        let task = self.ecs.get::<crate::job::Task>(task_entity).cloned().ok_or("job task is missing")?;
        if !matches!(task.state, crate::job::TaskState::Pending) { return Ok(None); }
        let source_id = match task.operation.source_binding() {
            crate::job::EntityBinding::Exact(source) => source.clone(),
            crate::job::EntityBinding::Result { step, slot } => self.resolve_job_result_source(&task, step, slot)?,
        };
        let source_entity = self.entity(&source_id)?;
        if !self.task_source_matches_operation(&task.operation, source_entity) { return Ok(None); }
        let schedule = self.ecs.get::<WorkSchedule>(task_entity).cloned().ok_or("job task has no schedule")?;
        let required_worker = match &task.continuation {
            crate::job::ContinuationPolicy::AssignedActor(actor) => Some(actor.clone()),
            crate::job::ContinuationPolicy::BindOnFirstProgress => task.bound_actor.clone(),
            crate::job::ContinuationPolicy::AnyEligible | crate::job::ContinuationPolicy::PreferStarter => None,
        };
        Ok(Some(WorkRequirement {
            task: task_id.into(), party: party.into(), priority: self.ecs.get::<WorkPolicy>(task_entity).map(|policy| policy.priority).unwrap_or(0),
            schedule, contacts: self.job_work_contacts(&task)?,
            required_worker, free_capacity_required: 0,
            operation: WorkOperation::JobTransform { task: task_id.into() },
        }))
    }

    /// Process inputs contribute ordinary finite supply requirements. The
    /// process owner remains responsible for binding them once they arrive;
    /// this method only joins the shared supply planner.
    pub(crate) fn plan_process_supply(&mut self, process: &str, party: &str) -> Result<Vec<String>> {
        let requirements = self.process_supply_requirements(process, party)?;
        self.plan_supply_requirements(&requirements)
    }

    /// Describe process inputs without selecting workers or mutating custody.
    /// The tick planner uses this query to combine every domain contribution
    /// into one bounded assignment window.
    fn process_supply_requirements(&self, process: &str, party: &str) -> Result<Vec<SupplyRequirement>> {
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
        let Some(station_site) = self.ecs.get::<ConstructionSite>(station) else {
            return Ok(Vec::new());
        };
        if station_site.phase != ConstructionPhase::Finished || station_site.catalog != definition.station_catalog
            || self.ecs.get::<SealedContainer>(station).is_none()
        {
            return Ok(Vec::new());
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
                    .sum::<u32>()
                    .saturating_add(self.ids.values().filter_map(|entity| {
                        let work = self.ecs.get::<FieldWaterWork>(*entity)?;
                        (work.process == process && work.role == input.role && work.generation == generation
                            && work.party == party && work.destination == destination).then_some(1)
                    }).sum::<u32>());
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
        Ok(requirements)
    }

    fn water_vessel_for_worker(&self, worker: &str) -> Option<(String, u32)> {
        let worker_contents = self.contents.get(worker)?;
        worker_contents.iter().filter_map(|entity| {
            let lot = self.ecs.get::<Lot>(*entity)?;
            let vessel = self.ecs.get::<VesselCapability>(*entity)?;
            if !vessel.accepts_water || lot.quantity == 0 || lot.container != worker { return None; }
            let capacity = self.ecs.get::<Container>(*entity)?.capacity;
            let id = self.external_id(*entity).ok()?;
            let occupied = self.quantity_in_container(&id);
            let free = capacity.saturating_sub(occupied);
            (free > 0).then(|| (id, free))
        }).min_by(|left, right| left.0.cmp(&right.0))
    }

    fn process_has_ordinary_water_source(&self, requirement: &SupplyRequirement) -> bool {
        self.ids.iter().any(|(_, entity)| {
            let Some(lot) = self.ecs.get::<Lot>(*entity) else { return false; };
            let Some(lot_id) = self.external_id(*entity).ok() else { return false; };
            let Some(container) = self.entity(&lot.container).ok() else { return false; };
            let Some(position) = self.ecs.get::<Position>(container) else { return false; };
            lot_matches_material(lot, self.ecs.get::<LotWater>(*entity), &requirement.material)
                && self.ecs.get::<OwnedByParty>(container).is_some_and(|owner| owner.party == requirement.party)
                && self.ecs.get::<OwnedByParty>(*entity).is_some_and(|owner| owner.party == requirement.party)
                && (self.ecs.get::<GroundStock>(container).is_some() || self.ecs.get::<StockpileCell>(container).is_some())
                && self.ecs.get::<SealedContainer>(container).is_none()
                && position.x.is_finite()
                && lot.quantity.saturating_sub(crate::supply_allocation::reserved_source(self, &lot_id, None)) > 0
        })
    }

    fn ensure_field_water_tasks(&mut self, requirements: &[SupplyRequirement]) -> Result<()> {
        for requirement in requirements.iter().filter(|requirement| requirement.material == "water") {
            if self.process_has_ordinary_water_source(requirement) { continue; }
            let pending = self.ids.values().filter_map(|entity| {
                let work = self.ecs.get::<FieldWaterWork>(*entity)?;
                (work.process == requirement.owner && work.role == requirement.role
                    && work.generation == requirement.generation && work.party == requirement.party
                    && work.destination == requirement.destination).then_some(())
            }).count() as u32;
            let target = requirement.missing.saturating_sub(pending).min(u32::try_from(MAX_ASSIGNMENTS).unwrap_or(u32::MAX));
            for ordinal in pending..pending.saturating_add(target) {
                let id = field_water_task_id(&requirement.owner, &requirement.role, requirement.generation, ordinal);
                if self.known.contains(&id) { continue; }
                if self.ids.len() >= 16_384 { return Err("region entity capacity".into()); }
                let entity = self.ecs.spawn((
                    ExternalId(id.clone()),
                    OwnedByParty { party: requirement.party.clone() },
                    FieldWaterWork {
                        process: requirement.owner.clone(), role: requirement.role.clone(), generation: requirement.generation,
                        party: requirement.party.clone(), destination: requirement.destination.clone(), vessel: None,
                        cell_x: 0, cell_y: 0, cell_z: 0, lot: None,
                    },
                    WorkPolicy { party: requirement.party.clone(), priority: 0, enabled: true },
                    WorkSchedule { next_review_tick: self.revision, last_considered: self.revision.saturating_sub(1) },
                )).id();
                self.ids.insert(id.clone(), entity);
                self.known.insert(id.clone());
                self.refresh_planner_index(&id);
            }
        }
        self.refresh_state_weight();
        Ok(())
    }

    /// Construction contributes requirements; it does not select workers or
    /// create a second delivery lifecycle.
    pub(crate) fn plan_construction_supply(
        &mut self,
        site: &str,
        party: &str,
    ) -> Result<Vec<String>> {
        let requirements = self.construction_supply_requirements(site, party)?;
        self.plan_supply_requirements(&requirements)
    }

    /// Describe construction inputs without reserving a lot or claiming a
    /// worker. Supply discovery is a domain query; the shared planner remains
    /// the only automatic assignment owner.
    fn construction_supply_requirements(&self, site: &str, party: &str) -> Result<Vec<SupplyRequirement>> {
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
        if self.ecs.get::<Position>(site_entity).is_none() {
            // Placement may lawfully exist before its work contact is bound.
            // That is waiting work, not a planner invariant failure.
            return Ok(Vec::new());
        }
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
        Ok(requirements)
    }

    fn plan_supply_requirements(
        &mut self,
        requirements: &[SupplyRequirement],
    ) -> Result<Vec<String>> {
        let slots = self.prepare_supply_slots(requirements, MAX_ASSIGNMENTS)?;
        if slots.is_empty() {
            return Ok(Vec::new());
        }

        self.assign_supply_slots(requirements, slots)
    }

    /// Expand finite requirements into deterministic, unclaimed source
    /// portions. This is a pure planning query: it accounts for canonical
    /// reservations plus earlier slots in this window, but publishes neither.
    fn prepare_supply_slots(
        &self,
        requirements: &[SupplyRequirement],
        limit: usize,
    ) -> Result<Vec<SupplySlot>> {
        let mut slots = Vec::new();
        let mut prospective_source = BTreeMap::<String, u32>::new();
        let per_requirement = (limit / requirements.len().max(1)).max(1);
        for requirement in requirements {
            if slots.len() == limit {
                break;
            }
            let requirement_start = slots.len();
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
                .take(limit)
                .collect::<Vec<_>>();
            let mut remaining = requirement.missing;
            for (lot, source_position, free) in sources {
                let mut source_remaining = free;
                while remaining > 0
                    && source_remaining > 0
                    && slots.len() < limit
                    && slots.len() - requirement_start < per_requirement
                {
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
                if remaining == 0 || slots.len() == limit || slots.len() - requirement_start == per_requirement {
                    break;
                }
            }
        }
        Ok(slots)
    }

    fn assign_supply_slots(
        &mut self,
        requirements: &[SupplyRequirement],
        slots: Vec<SupplySlot>,
    ) -> Result<Vec<String>> {
        let parties = requirements
            .iter()
            .map(|requirement| requirement.party.as_str())
            .collect::<BTreeSet<_>>();
        let indexed_workers = parties
            .into_iter()
            .flat_map(|party| {
                crate::work_candidates::eligible_workers(
                    &self.planner_indexes,
                    party,
                    crate::work_planner::MAX_ELIGIBLE_WORKERS,
                )
            })
            .collect::<Vec<_>>();
        let workers = indexed_workers
            .into_iter()
            .filter_map(|candidate| {
                let entity = self.entity(&candidate.id).ok()?;
                let container = self.ecs.get::<Container>(entity)?;
                let position = *self.ecs.get::<Position>(entity)?;
                let free_capacity = container.capacity.saturating_sub(
                    u32::try_from(self.quantity_in_container(&candidate.id)).unwrap_or(u32::MAX),
                );
                (requirements
                    .iter()
                    .any(|requirement| requirement.party == candidate.party)
                    && free_capacity > 0
                    && self
                        .ecs
                        .get::<Body>(entity)
                        .is_some_and(|body| body.speed.is_finite() && body.speed > 0.0)
                    && !self.attempts_by_worker.contains_key(&candidate.id)
                    && self.ecs.get::<Destination>(entity).is_none()
                    && !self.direct.contains_key(&entity)
                    && self.ecs.get::<Support>(entity).is_none()
                    && self.ecs.get::<ExcavationWork>(entity).is_none())
                .then(|| (candidate.id, candidate.party, position, free_capacity))
            })
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
    use crate::work_planner::WorkParticipation;
    use serde_json::json;

    #[test]
    fn field_water_task_identity_keeps_arbitrary_owner_and_role_boundaries() {
        assert_ne!(
            field_water_task_id("owner", "role\0generation", 7, 0),
            field_water_task_id("owner\0role", "generation", 7, 0),
        );
        assert_ne!(
            field_water_task_id("owner", "role", 7, 0),
            field_water_task_id("owner", "role", 7, 1),
        );
    }

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
        kernel.load(&json!({"format":"hive-game","version":2,"game":"native-supply","components":[],"materialCatalog":[],"initial":initial}).to_string()).unwrap();
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
        kernel.advance_movement(0.0).unwrap();
        kernel.settle_arrived_work_attempts().unwrap();
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
    fn native_tick_hook_reviews_supplied_construction_and_starts_labor() {
        let (mut kernel, _, contact) = construction_world(2);
        assert_eq!(kernel.advance_native_work_planner(8).unwrap(), 2);
        finish_active_deliveries(&mut kernel);
        if kernel.work_attempt("site").is_none() {
            assert_eq!(kernel.advance_native_work_planner(64).unwrap(), 1);
        }
        let attempt = kernel.work_attempt("site").expect("native hook must admit site labor");
        assert!(matches!(
            &attempt.phase,
            crate::work_attempt::AttemptPhase::Executing {
                activity: crate::work_attempt::ActivityRef::Route { destination }, ..
            } if destination == &contact
        ));
        assert_eq!(kernel.attempts_by_worker.len(), 1);
    }

    #[test]
    fn native_tick_binds_unbound_construction_before_admitting_supply() {
        let (mut kernel, _, contact) = construction_world(1);
        let site = kernel.entity("site").unwrap();
        kernel.ecs.entity_mut(site).remove::<Position>();
        kernel.refresh_planner_index("site");

        // An unbound planned site contributes the initial contact route even
        // though its material destination is not yet eligible for supply.
        assert_eq!(kernel.advance_native_work_planner(8).unwrap(), 1);
        assert!(matches!(
            &kernel.work_attempt("site").expect("bind route").phase,
            crate::work_attempt::AttemptPhase::Executing {
                activity: crate::work_attempt::ActivityRef::Route { destination }, ..
            } if destination == &contact
        ));

        settle_routes(&mut kernel);
        // Reconciliation must materialize the typed Bind operation at the
        // exact reached contact, then expose the site for ordinary supply.
        assert_eq!(kernel.advance_native_work_planner(16).unwrap(), 1);
        assert!(kernel.ecs.get::<Position>(site).is_some());
        assert!(kernel.supply_allocations().next().is_none());
        // One unit reconciles the completed bind and one admits the delivery.
        assert_eq!(kernel.advance_native_work_planner(24).unwrap(), 2);
        assert_eq!(kernel.supply_allocations().count(), 1);
    }

    #[test]
    fn finished_construction_releases_its_worker_after_leaving_the_candidate_index() {
        let (mut kernel, _, _) = construction_world(1);
        assert_eq!(kernel.plan_construction_supply("site", "party").unwrap().len(), 1);
        finish_active_deliveries(&mut kernel);
        assert_eq!(kernel.plan_construction_supply("site", "party").unwrap().len(), 1);
        finish_active_deliveries(&mut kernel);
        assert_eq!(kernel.advance_native_work_planner(8).unwrap(), 1);
        settle_routes(&mut kernel);
        assert_eq!(kernel.advance_native_work_planner(16).unwrap(), 1);
        kernel.advance_construction(100.0).unwrap();
        assert_eq!(
            kernel.ecs.get::<ConstructionSite>(kernel.entity("site").unwrap()).unwrap().phase,
            ConstructionPhase::Finished,
        );
        assert!(kernel.work_attempt("site").is_some(), "physical completion remains receipted until planner reconciliation");
        assert_eq!(kernel.advance_native_work_planner(17).unwrap(), 1);
        assert!(kernel.work_attempt("site").is_none());
        assert!(kernel.attempts_by_worker.is_empty());
    }

    #[test]
    fn native_tick_hook_treats_finished_construction_as_idle_and_is_repeatable() {
        let (mut kernel, _, _) = construction_world(1);
        let site = kernel.entity("site").unwrap();
        let state = kernel.ecs.get::<ConstructionSite>(site).unwrap().clone();
        kernel.ecs.entity_mut(site).insert(ConstructionSite {
            phase: ConstructionPhase::Finished,
            ..state
        });
        assert_eq!(kernel.advance_native_work_planner(8).unwrap(), 0);
        assert_eq!(kernel.advance_native_work_planner(16).unwrap(), 0);
        assert!(kernel.work_attempt("site").is_none());
        assert!(kernel.supply_allocations().next().is_none());
    }

    #[test]
    fn deconstruction_order_uses_native_assignment_and_capacity() {
        let (mut kernel, _, _) = construction_world_with_capacity(1, 8);
        let site = kernel.entity("site").unwrap();
        let state = kernel.ecs.get::<ConstructionSite>(site).unwrap().clone();
        kernel.ecs.entity_mut(site).insert(ConstructionSite { phase: ConstructionPhase::Finished, ..state });
        kernel.ecs.entity_mut(site).insert(SealedContainer {});
        kernel.environment.as_mut().unwrap().structures.get_mut("floor").unwrap().on_remove.salvage.insert("stone-spoil".into(), 6);
        let task = kernel.plan_deconstruction("site".into(), "party".into()).unwrap();
        assert_eq!(kernel.advance_native_work_planner(8).unwrap(), 1);
        assert!(matches!(
            &kernel.work_attempt(&task).expect("native planner must assign deconstruction").phase,
            crate::work_attempt::AttemptPhase::Executing { activity: crate::work_attempt::ActivityRef::Route { .. }, .. }
        ));

        let worker = kernel.entity("worker-1").unwrap();
        kernel.ecs.entity_mut(worker).insert(Container { capacity: 0 });
        let operation = kernel.work_attempt(&task).unwrap().current_operation().unwrap().clone();
        kernel.interrupt_work_attempt(task.clone(), operation.attempt.generation, operation.sequence, InterruptCause::Cancelled).unwrap();
        kernel.acknowledge_work_attempt(task.clone(), operation.attempt.generation, operation.sequence).unwrap();
        kernel.ecs.entity_mut(kernel.entity(&task).unwrap()).insert(crate::work_planner::WorkSchedule { next_review_tick: 16, last_considered: 8 });
        kernel.refresh_planner_index(&task);
        assert_eq!(kernel.advance_native_work_planner(16).unwrap(), 0, "salvage capacity is part of eligibility");
        assert!(kernel.work_attempt(&task).is_none());
    }

    #[test]
    fn native_deconstruction_completion_publishes_salvage_once() {
        let (mut kernel, _, _) = construction_world_with_capacity(1, 8);
        let site = kernel.entity("site").unwrap();
        let state = kernel.ecs.get::<ConstructionSite>(site).unwrap().clone();
        kernel.ecs.entity_mut(site).insert(ConstructionSite { phase: ConstructionPhase::Finished, ..state });
        kernel.ecs.entity_mut(site).insert(SealedContainer {});
        kernel.environment.as_mut().unwrap().structures.get_mut("floor").unwrap().on_remove.salvage.insert("stone-spoil".into(), 6);
        let task = kernel.plan_deconstruction("site".into(), "party".into()).unwrap();
        assert_eq!(kernel.advance_native_work_planner(8).unwrap(), 1);
        settle_routes(&mut kernel);
        assert_eq!(kernel.advance_native_work_planner(16).unwrap(), 1);
        kernel.advance_deconstruction(100.0).unwrap();
        assert_eq!(kernel.advance_native_work_planner(24).unwrap(), 1);
        assert!(!kernel.known.contains("site"));
        let task_entity = kernel.entity(&task).unwrap();
        assert_eq!(kernel.ecs.get::<DeconstructionOrder>(task_entity).unwrap().status, "complete");
        assert_eq!(kernel.ecs.get::<crate::work_planner::WorkPolicy>(task_entity).unwrap().enabled, false);
        assert_eq!(kernel.quantity_in_container("worker-1"), 6);
        assert_eq!(kernel.advance_native_work_planner(32).unwrap(), 0);
        assert_eq!(kernel.quantity_in_container("worker-1"), 6);
    }

    #[test]
    fn one_native_window_assigns_ready_labor_and_supply_together() {
        let (mut kernel, surface, contact) = construction_world(4);
        assert_eq!(kernel.plan_construction_supply("site", "party").unwrap().len(), 2);
        finish_active_deliveries(&mut kernel);

        let second_cell = Cell { x: surface.x + 1, ..surface };
        let second_contact = Point { x: contact.x + kernel.environment.as_ref().unwrap().world.cell_spacing_m()[0], ..contact.clone() };
        kernel.plan_construction(
            "floor".into(), "site-2".into(), "party".into(),
            ConstructionTarget::Cell { cell: second_cell, orientation: Cardinal::North },
        ).unwrap();
        kernel.bind_construction_stage("site-2", second_contact).unwrap();
        let source = kernel.entity("source").unwrap();
        let lot = kernel.ecs.spawn((
            ExternalId("wood-2".into()),
            OwnedByParty { party: "party".into() },
            Lot { kind: "stone-spoil".into(), quantity: 6, container: "source".into() },
        )).id();
        kernel.ids.insert("wood-2".into(), lot);
        kernel.known.insert("wood-2".into());
        kernel.contents.entry("source".into()).or_default().insert(lot);
        kernel.refresh_planner_index("site");
        kernel.refresh_planner_index("site-2");
        kernel.rebuild_physical_indexes(true).unwrap();
        assert_eq!(kernel.ecs.get::<Container>(source).unwrap().capacity, 6);

        let admitted = kernel.advance_native_work_planner(64).unwrap();
        assert_eq!(admitted, 3);
        assert!(kernel.work_attempt("site").is_some(), "ready labor must share the window");
        assert_eq!(kernel.supply_allocations().count(), 2);
        assert!(kernel.attempts_by_worker.len() <= MAX_ASSIGNMENTS);
    }

    #[test]
    fn priority_tiers_remain_due_until_each_receives_a_window() {
        let (mut kernel, surface, contact) = construction_world(2);
        let second_cell = Cell {
            x: surface.x + 1,
            ..surface
        };
        kernel
            .plan_construction(
                "floor".into(),
                "site-2".into(),
                "party".into(),
                ConstructionTarget::Cell {
                    cell: second_cell,
                    orientation: Cardinal::North,
                },
            )
            .unwrap();
        kernel
            .bind_construction_stage(
                "site-2",
                Point {
                    x: contact.x
                        + kernel
                            .environment
                            .as_ref()
                            .unwrap()
                            .world
                            .cell_spacing_m()[0],
                    ..contact
                },
            )
            .unwrap();
        let first = kernel.entity("site").unwrap();
        let second = kernel.entity("site-2").unwrap();
        kernel.ecs.entity_mut(first).insert(crate::work_planner::WorkPolicy {
            party: "party".into(),
            priority: 9,
            enabled: true,
        });
        kernel.ecs.entity_mut(second).insert(crate::work_planner::WorkPolicy {
            party: "party".into(),
            priority: 1,
            enabled: true,
        });
        kernel.refresh_planner_index("site");
        kernel.refresh_planner_index("site-2");

        kernel.advance_native_work_planner(8).unwrap();
        assert_eq!(
            kernel.ecs.get::<crate::work_planner::WorkSchedule>(second).unwrap().last_considered,
            0,
            "a lower tier must stay due while the higher tier is considered",
        );
        kernel.advance_native_work_planner(9).unwrap();
        assert_eq!(
            kernel.ecs.get::<crate::work_planner::WorkSchedule>(second).unwrap().last_considered,
            9,
            "the still-due lower tier must receive the following window",
        );
    }

    #[test]
    fn automatic_planner_failure_rolls_back_the_whole_kernel_candidate() {
        let (mut kernel, _, _) = construction_world(1);
        let collision = kernel
            .ecs
            .spawn(ExternalId("native:supply-slot:0".into()))
            .id();
        kernel.ids.insert("native:supply-slot:0".into(), collision);
        kernel.known.insert("native:supply-slot:0".into());
        let before = kernel.save_records().unwrap();
        let before_revision = kernel.revision;

        let result = kernel.advance_json(r#"{"delta":0,"writes":[],"actions":[]}"#);

        assert_eq!(result.unwrap_err(), "native planning obligation identity collision");
        assert_eq!(kernel.save_records().unwrap().entities, before.entities);
        assert_eq!(kernel.revision, before_revision);
        assert!(!kernel.discard_required);
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
        let bind = kernel.construction_work_requirement("site", "party").unwrap().expect("unbound supported site contributes its bind step");
        assert!(matches!(bind.operation, crate::work_planner::WorkOperation::Construction { mode: crate::work_attempt::ConstructionMode::Bind, .. }));

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
