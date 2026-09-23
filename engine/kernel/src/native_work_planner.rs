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
    /// Optional native-domain source restriction. Stockpile demand uses this
    /// to preserve strict priority rehaul while other supply consumers scan
    /// their ordinary eligible source set.
    source_lots: Option<BTreeSet<String>>,
}

#[derive(Clone)]
struct SupplySlot {
    task: String,
    requirement: SupplyRequirement,
    lot: String,
    source_position: Position,
    source_contacts: Arc<Vec<Point>>,
    delivery_lower_bound: f64,
    quantity: u32,
    policy: InputPolicy,
}

#[derive(Clone)]
struct FieldWaterSlot {
    task: String,
    requirement: SupplyRequirement,
    contacts: Arc<WaterContactIndex>,
    portions: u8,
}

struct WaterContactIndex {
    flat: Vec<(crate::generation::Cell, u8, Point)>,
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
        match self { Self::Supply(slot) => &slot.requirement.party, Self::FieldWater(slot) => &slot.requirement.party, Self::Labor(requirement) => &requirement.pool }
    }

    fn owner(&self) -> &str {
        match self { Self::Supply(slot) => &slot.requirement.owner, Self::FieldWater(slot) => &slot.task, Self::Labor(requirement) => &requirement.task }
    }
}

enum PlanningWitness {
    Supply { destination: Point, route: super::PreparedRoute },
    FieldWater { vessel: String, cell: crate::generation::Cell, available: u8, destination: Point, route: super::PreparedRoute },
    Labor(Point, super::PreparedRoute),
}

struct PlannerWorker {
    id: String,
    party: String,
    position: Position,
    free_capacity: u32,
}

struct PendingFieldWaterTask {
    id: String,
    owner: OwnedByParty,
    field_water: FieldWaterWork,
    policy: WorkPolicy,
    execution: WorkExecution,
    schedule: WorkSchedule,
    accounting: super::state_accounting::EntityWeightChange,
}

/// Saved computation owned by the native planner. No route, claim, or physical
/// resource is held here. Each slice reconstructs contributions and checks
/// participating facts before reusing the remaining Hungarian proposals.
#[derive(Clone, Debug, PartialEq, serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub(crate) struct NativeAssignmentContinuation {
    version: u8,
    generation: u64,
    source_window: crate::work_candidates::PlanningWindow,
    window: crate::work_candidates::PlanningWindow,
    dependencies: BTreeMap<String, String>,
    matching: crate::work_candidates::AssignmentEpisode,
}

impl NativeAssignmentContinuation {
    pub(crate) fn generation(&self) -> u64 { self.generation }

    pub(crate) fn validate(&self) -> std::result::Result<(), &'static str> {
        if self.version != 1 || self.generation == 0 || self.source_window.tasks.len() > MAX_TASK_REVIEWS
            || self.source_window.workers.len() > crate::work_planner::MAX_ELIGIBLE_WORKERS
            || self.window.tasks.len() > MAX_TASK_REVIEWS
            || self.window.workers.len() > crate::work_planner::MAX_ELIGIBLE_WORKERS
            || self.dependencies.len() > MAX_TASK_REVIEWS + crate::work_planner::MAX_ELIGIBLE_WORKERS + 1
            || self.dependencies.values().any(|digest| digest.len() != 64 || !digest.bytes().all(|byte| byte.is_ascii_hexdigit()))
        { return Err("invalid retained native assignment"); }
        for window in [&self.source_window, &self.window] {
            let mut workers = BTreeSet::new();
            let mut tasks = BTreeSet::new();
            if window.workers.iter().any(|worker| !valid_id(&worker.id) || !valid_id(&worker.party) || !workers.insert(&worker.id))
                || window.tasks.iter().any(|task| !valid_id(&task.id) || !valid_id(&task.party) || !tasks.insert(&task.id))
            { return Err("invalid retained assignment identities"); }
        }
        if serde_json::to_vec(self).map_err(|_| "invalid retained assignment encoding")?.len() > 2 * 1024 * 1024 {
            return Err("retained assignment capacity exceeded");
        }
        self.matching.validate(&self.window).map_err(|_| "invalid retained native matching")
    }
}

impl Kernel {
    /// Progress accepted work, then choose a bounded automatic labor slice.
    /// Domains contribute requirements; assignment alone selects workers and
    /// verifies routes. Retained physical outcomes have their own lifecycle
    /// and cannot wait behind an unrelated residual matching window.
    pub(crate) fn advance_native_work_planner(&mut self, tick: u64) -> Result<usize> {
        let mut progressed = self.reconcile_supply_allocations()?;
        progressed += self.reconcile_manual_attempts()?;
        progressed += self.reconcile_native_work_outcomes()?;
        if self.planner.continuation.is_none() && !self.planner_indexes.has_due_task(tick) {
            return Ok(progressed);
        }
        let competing_due_work = self.planner.continuation.as_ref().is_some_and(|continuation| {
            continuation.source_window.tasks.first().is_some_and(|retained| {
                self.planner_indexes.tasks_by_pool.get(&retained.party).into_iter().flatten()
                    .any(|task| task.due_tick <= tick && !self.work_attempts.contains_key(&task.id)
                        && (task.priority > retained.priority || (task.priority == retained.priority
                            && !continuation.source_window.tasks.iter().any(|held| held.id == task.id))))
            })
        });
        // A retained matrix is speculative computation, not a claim on the
        // party. Equal-priority due work outside that bounded view must get a
        // turn before residual expensive commutes are admitted. SearchBank
        // retains pending physical frontiers independently of this window.
        if competing_due_work { self.planner.continuation = None; }
        let mut window = if let Some(continuation) = &self.planner.continuation {
            continuation.source_window.clone()
        } else { self.next_native_planning_window(tick) };
        // Fresh capability membership admits newly idle/created workers. Already
        // dispatched workers filter out through the normal eligibility owner.
        if let Some(task) = window.tasks.first() {
            window.workers = crate::work_candidates::eligible_workers(&self.planner_indexes, &task.party, crate::work_planner::MAX_ELIGIBLE_WORKERS);
        }
        window.tasks.retain(|task| self.entity(&task.id).ok().is_some_and(|entity| {
            self.ecs.get::<WorkPolicy>(entity).is_some_and(|policy| policy.enabled && policy.pool == task.party)
        }));
        for task in &mut window.tasks {
            if let Ok(entity) = self.entity(&task.id) && let Some(policy) = self.ecs.get::<WorkPolicy>(entity) {
                task.priority = policy.priority;
            }
        }
        window.tasks.sort_by(|left, right| right.priority.cmp(&left.priority).then(left.last_considered.cmp(&right.last_considered)).then(left.id.cmp(&right.id)));
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
            self.planner.continuation = None;
            return Ok(progressed);
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
            if self.ecs.get::<SupplyAllocation>(entity).is_some() {
                if let Some(requirement) = self.supply_work_requirement(&task.id, &party)? { requirements.push(requirement); }
            } else if self.ecs.get::<ConstructionSite>(entity).is_some() {
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
            } else if self.ecs.get::<ResourceOrder>(entity).is_some()
                && let Some(requirement) = self.resource_work_requirement(&task.id, &party)?
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
            if self.ecs.get::<StockpileCell>(entity).is_some() {
                for demand in super::stockpile_work::collect(self, &task.id, &party)? {
                    let generation = super::stockpile_work::policy_generation(self.ecs.get::<StockpileCell>(entity).ok_or("stockpile policy disappeared")?);
                    let destination = if demand.destination == task.id {
                        self.ensure_stockpile_destination(&task.id, demand.quantity)?
                    } else {
                        demand.destination
                    };
                    supply_requirements.push(SupplyRequirement {
                        owner: task.id.clone(), role: demand.material.clone(), generation,
                        party: party.clone(), material: demand.material, policy: InputPolicy::Portion,
                        destination, missing: demand.quantity,
                        source_lots: Some(demand.source_lots),
                    });
                }
            }
        }
        if let Err(error) = self.ensure_field_water_tasks(&supply_requirements) {
            self.cleanup_empty_ground_stock();
            return Err(error);
        }
        let assigned = self.assign_native_obligations(&window, &supply_requirements, requirements);
        self.cleanup_empty_ground_stock();
        progressed += assigned?;
        Ok(progressed)
    }

    pub(super) fn install_field_water_allocation(&mut self, task: &str, work: FieldWaterWork, lot: String) -> Result<()> {
        let entity = self.entity(task)?;
        let execution = self.ecs.get::<WorkExecution>(entity).cloned().ok_or("field water task has no work execution")?;
        self.ecs.entity_mut(entity).remove::<FieldWaterWork>();
        self.ecs.entity_mut(entity).remove::<WorkPolicy>();
        self.ecs.entity_mut(entity).remove::<WorkSchedule>();
        self.ecs.entity_mut(entity).insert((
            WorkPolicy { pool: work.party.clone(), priority: 0, enabled: true },
            execution,
            WorkSchedule { next_review_tick: self.revision, last_considered: self.revision.saturating_sub(1) },
            SupplyAllocation {
            requirement_owner: work.process,
            requirement_role: work.role,
            requirement_generation: work.generation,
            party: work.party,
            material: work.material,
            portion: lot,
            destination: work.destination,
            quantity: u32::from(work.portions),
            state: SupplyAllocationState::Reserved,
            },
        ));
        self.refresh_planner_index(task);
        self.refresh_supply_index(task);
        Ok(())
    }

    /// Accrue saved generic task work and commit its transform exactly once
    /// when the authored duration is reached. This runs after movement and
    /// before planner admission in the same durable batch.
    pub(crate) fn advance_job_transform_work(&mut self, delta: f64) -> Result<()> {
        if !delta.is_finite() || delta < 0.0 { return Err("invalid job task work delta".into()); }
        let attempts = self.work_attempts.iter().filter_map(|(attempt_task, entity)| {
            let attempt = self.ecs.get::<crate::work_attempt::WorkAttempt>(*entity)?;
            let crate::work_attempt::AttemptPhase::Executing { operation, activity: crate::work_attempt::ActivityRef::JobTransform { task, contact } } = &attempt.phase else { return None; };
            Some((attempt_task.clone(), task.clone(), operation.clone(), attempt.execution.pool.clone(), attempt.worker.clone(), contact.clone()))
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
            self.replace_accounted_component(task_entity, "hive.job-task-work", updated)?;
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

    /// Derived once at the existing physical-index mutation/rebuild boundary;
    /// continuation steps compare a fixed-size key, not the world's blockers.
    pub(super) fn refresh_assignment_topology(&mut self) {
        let surfaces = self.blocked_by_frame.keys().flatten().filter_map(|id| {
            self.entity(id).ok().and_then(|entity| self.ecs.get::<Surface>(entity)).map(|surface| (id, surface))
        }).collect::<Vec<_>>();
        self.assignment_topology = Sha256::digest(serde_json::to_vec(&serde_json::json!([
            self.blocked_by_frame.iter().collect::<Vec<_>>(), surfaces,
        ])).expect("native navigation facts serialize")).into();
    }

    fn assignment_entity_facts(&self, id: &str) -> serde_json::Value {
        let Ok(entity) = self.entity(id) else { return serde_json::Value::Null; };
        serde_json::json!({
            "position": self.ecs.get::<Position>(entity),
            "body": self.ecs.get::<Body>(entity),
            "traversal": self.ecs.get::<Traversal>(entity),
            "support": self.ecs.get::<Support>(entity),
            "container": self.ecs.get::<Container>(entity),
            "lot": self.ecs.get::<Lot>(entity),
            "vessel": self.ecs.get::<VesselCapability>(entity),
            "party": self.ecs.get::<PartyMember>(entity),
            "owner": self.ecs.get::<OwnedByParty>(entity),
            "participation": self.ecs.get::<crate::work_planner::WorkParticipation>(entity),
            "policy": self.ecs.get::<WorkPolicy>(entity),
            "execution": self.ecs.get::<WorkExecution>(entity),
            "process": self.ecs.get::<StagedProcess>(entity),
            "construction": self.ecs.get::<ConstructionSite>(entity),
            "resource": self.ecs.get::<ResourceOrder>(entity),
            "excavation": self.ecs.get::<ExcavationOrder>(entity),
            "deconstruction": self.ecs.get::<DeconstructionOrder>(entity),
            "fieldWater": self.ecs.get::<FieldWaterWork>(entity),
            "supply": self.ecs.get::<SupplyAllocation>(entity),
            "task": self.ecs.get::<crate::job::Task>(entity),
            "stockpile": self.ecs.get::<StockpileCell>(entity),
        })
    }

    /// Fingerprints are bounded by the admitted worker/task set. Region revision,
    /// unrelated entities and cosmetic frame clocks are deliberately absent.
    /// Terrain/placement changes conservatively invalidate the retained graph.
    fn assignment_dependencies(&self, window: &crate::work_candidates::PlanningWindow, obligations: &[PlanningObligation]) -> Result<BTreeMap<String, String>> {
        let digest = |value: serde_json::Value| -> Result<String> {
            Ok(format!("{:x}", Sha256::digest(serde_json::to_vec(&value).map_err(|error| error.to_string())?)))
        };
        let mut dependencies = BTreeMap::new();
        dependencies.insert("topology".into(), digest(serde_json::json!([
            self.environment.as_ref().map(|environment| environment.world.terrain_revision()),
            self.assignment_topology,
        ]))?);
        for worker in &window.workers {
            let contents = self.contents.get(&worker.id).into_iter().flatten()
                .map(|entity| self.external_id(*entity).map(|id| (id.clone(), self.assignment_entity_facts(&id))))
                .collect::<Result<BTreeMap<_, _>>>()?;
            dependencies.insert(format!("worker:{}", worker.id), digest(serde_json::json!([self.assignment_entity_facts(&worker.id), contents]))?);
        }
        for obligation in obligations {
            let facts = match obligation {
                PlanningObligation::Labor(requirement) => {
                    let mut requirement = serde_json::to_value(requirement).map_err(|error| error.to_string())?;
                    requirement.as_object_mut().expect("work requirement object").remove("schedule");
                    serde_json::json!([self.assignment_entity_facts(obligation.owner()), requirement])
                }
                PlanningObligation::Supply(slot) => serde_json::json!([
                    self.assignment_entity_facts(obligation.owner()), self.assignment_entity_facts(&slot.lot),
                    self.assignment_entity_facts(&slot.requirement.destination),
                    slot.requirement.role, slot.requirement.generation, slot.requirement.material, slot.requirement.missing,
                    slot.quantity, slot.source_position, slot.source_contacts.as_ref(),
                ]),
                PlanningObligation::FieldWater(slot) => serde_json::json!([
                    self.assignment_entity_facts(obligation.owner()), self.assignment_entity_facts(&slot.requirement.owner),
                    self.assignment_entity_facts(&slot.requirement.destination), slot.portions, slot.contacts.flat,
                ]),
            };
            dependencies.insert(format!("task:{}", obligation.task()), digest(facts)?);
        }
        Ok(dependencies)
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
            (self.ecs.get::<PartyMember>(entity).is_some_and(|member| member.party == worker.party)
                && self.ecs.get::<crate::work_planner::WorkParticipation>(entity).is_some_and(|participation| participation.automatic)
                && self.ecs.get::<Body>(entity).is_some_and(|body| body.speed.is_finite() && body.speed > 0.0)
                && self.ecs.get::<Traversal>(entity).is_some()
                && !self.attempts_by_worker.contains_key(&worker.id)
                && self.ecs.get::<Destination>(entity).is_none()
                && !self.direct.contains_key(&entity)
                && self.ecs.get::<ExcavationWork>(entity).is_none())
                .then_some(PlannerWorker { id: worker.id.clone(), party: worker.party.clone(), position, free_capacity })
        }).collect::<Vec<_>>();
        if workers.is_empty() { self.planner.continuation = None; return Ok(0); }

        let carry_limit_by_party = workers.iter().filter(|worker| worker.free_capacity > 0).fold(
            BTreeMap::<String, u32>::new(),
            |mut limits, worker| {
                limits.entry(worker.party.clone())
                    .and_modify(|limit| *limit = (*limit).max(worker.free_capacity))
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
        let mut raw_slots = raw_slots;
        for slot in &mut raw_slots {
            let lot_entity = self.entity(&slot.lot)?;
            let source_id = self.ecs.get::<Lot>(lot_entity).ok_or("native supply lot disappeared")?.container.clone();
            let source_entity = self.entity(&source_id)?;
            let contacts = self.transfer_contact_candidates(
                &source_id,
                crate::terrain_traversal::TraversalConfig { spacing: [0.0; 3], clearance_cells: 1, max_step_cells: 1 },
                self.support_id(source_entity),
            ).map_err(crate::world::TransferContactError::into_string)?;
            slot.source_contacts = Arc::new(contacts);
        }
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
            workers.iter().filter(|worker| self.water_vessel_for_worker(&worker.id).is_some())
                .collect::<Vec<_>>().chunks(16).try_fold(Vec::new(), |mut contacts, batch| {
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
            targets: cells.iter().flat_map(|(_, _, approaches)| approaches.iter().cloned()).collect(),
            flat: cells.iter().flat_map(|(cell, level, approaches)| approaches.iter().map(move |approach| (*cell, *level, approach.clone()))).collect(),
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
                && field.vessel.is_none()
                && field.lot.is_none()
                && !contacts.targets.is_empty()
            {
                obligations.push(PlanningObligation::FieldWater(FieldWaterSlot {
                    task: task.id.clone(),
                    requirement: SupplyRequirement { owner: field.process, role: field.role, generation: field.generation, party: field.party, material: field.material, policy: InputPolicy::Portion, destination: field.destination, missing: u32::from(field.portions), source_lots: None },
                    contacts: contacts.clone(),
                    portions: field.portions,
                }));
            }
            if obligations.len() == MAX_TASK_REVIEWS { break; }
            if let Some(requirement) = labor_by_task.get(&task.id) {
                obligations.push(PlanningObligation::Labor(requirement.clone()));
            }
            if obligations.len() == MAX_TASK_REVIEWS { break; }
        }
        if obligations.is_empty() { self.planner.continuation = None; return Ok(0); }

        // The caller contributes one priority tier at a time. Lower tiers keep
        // their due schedule and enter the next fair window.

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
        let dependencies = self.assignment_dependencies(&planning_window, &obligations)?;
        let previous = self.planner.continuation.take();
        let mut matching = if let Some(previous) = previous.filter(|previous| {
            previous.dependencies == dependencies
                && previous.window.workers == planning_window.workers
                && previous.window.tasks.iter().map(|task| (&task.id, &task.party, task.priority)).eq(planning_window.tasks.iter().map(|task| (&task.id, &task.party, task.priority)))
        }) {
            previous.matching
        } else {
            let bound = |worker: &PlannerWorker, obligation: &PlanningObligation| -> Option<f64> {
                if worker.party != obligation.party() { return None; }
                match obligation {
                    PlanningObligation::Supply(slot) if slot.quantity <= worker.free_capacity => slot.source_contacts.iter().map(|contact| {
                        ((worker.position.x - contact.x).powi(2)
                            + (worker.position.y - contact.y).powi(2)
                            + (worker.position.z - contact.z).powi(2)).sqrt()
                    }).min_by(f64::total_cmp).map(|pickup| pickup + slot.delivery_lower_bound),
                    PlanningObligation::Supply(_) => None,
                    PlanningObligation::FieldWater(slot) => self.water_vessel_for_worker(&worker.id).and_then(|(_, free)| {
                        if free < u32::from(slot.portions) { return None; }
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

            let workers_per_obligation = (MAX_CANDIDATE_PAIRS / obligations.len()).max(1);
            let mut candidates = Vec::new();
            for obligation in &obligations {
                let mut nearby = workers.iter().filter_map(|worker| bound(worker, obligation).map(|cost| (worker, cost))).collect::<Vec<_>>();
                nearby.sort_by(|(left_worker, left_cost), (right_worker, right_cost)| left_cost.total_cmp(right_cost).then(left_worker.id.cmp(&right_worker.id)));
                candidates.extend(nearby.into_iter().take(workers_per_obligation).map(|(worker, cost)| crate::assign::Candidate {
                    worker: worker.id.clone(), task: obligation.task().to_owned(), cost,
                }));
            }
            if candidates.is_empty() { self.planner.continuation = None; return Ok(0); }

            self.planner.assignment_generation = self.planner.assignment_generation.checked_add(1).ok_or("assignment episode sequence exhausted")?;
            crate::work_candidates::AssignmentEpisode::new(&planning_window, &candidates)
                .map_err(|error| format!("native joint assignment failed: {error:?}"))?
        };
        let selected = matching.advance(&planning_window, |candidate| {
            let worker_entity = self.entity(&candidate.worker)?;
            let position = *self.ecs.get::<Position>(worker_entity).ok_or("native planner worker lost position")?;
            let obligation = obligations_by_task.get(&candidate.task).ok_or("native planner obligation disappeared")?;
            match obligation {
                PlanningObligation::Supply(slot) => {
                    match super::route_query::classify_route(self.route_for_any(worker_entity, position, &slot.source_contacts))? {
                        SearchOutcome::Reachable((index, route)) => {
                            let destination = slot.source_contacts.get(index).cloned().ok_or("native supply contact index is invalid")?;
                            if !super::interaction_contact::within_transfer_reach(
                                [slot.source_position.x, slot.source_position.y, slot.source_position.z],
                                [destination.x, destination.y, destination.z],
                            ) {
                                return Err("native supply contact is out of transfer reach".into());
                            }
                            let points = std::iter::once(crate::navigation::point(position)).chain(route.points.iter().cloned()).collect::<Vec<_>>();
                            let cost = crate::terrain_route::waypoint_cost_micrometres(points)? as f64 / 1_000_000.0;
                            Ok(SearchOutcome::Reachable((cost + slot.delivery_lower_bound, PlanningWitness::Supply { destination, route })))
                        }
                        SearchOutcome::NoPath(error) => Ok(SearchOutcome::NoPath(error)),
                        SearchOutcome::Deferred(error) => Ok(SearchOutcome::Deferred(error)),
                    }
                }
                PlanningObligation::FieldWater(slot) => {
                    let (vessel, _) = self.water_vessel_for_worker(&candidate.worker).ok_or("native water worker has no compatible vessel")?;
                    match super::route_query::classify_route(self.route_for_any(worker_entity, position, &slot.contacts.targets))? {
                        SearchOutcome::Reachable((index, route)) => {
                            let (cell, available, destination) = slot.contacts.flat.get(index).cloned().ok_or("native water contact index is invalid")?;
                            let points = std::iter::once(crate::navigation::point(position)).chain(route.points.iter().cloned()).collect::<Vec<_>>();
                            let cost = crate::terrain_route::waypoint_cost_micrometres(points)? as f64 / 1_000_000.0;
                            Ok(SearchOutcome::Reachable((cost, PlanningWitness::FieldWater { vessel, cell, available, destination, route })))
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

        // Keep the exact residual graph and proposal order; releasing one slice
        // is not a reason to solve the same worker/task matrix again.
        if !matching.is_empty() {
            let assigned_workers = selected.assignments.iter().map(|assignment| assignment.worker.as_str()).collect::<BTreeSet<_>>();
            let remaining_workers = planning_window.workers.iter().filter(|worker| !assigned_workers.contains(worker.id.as_str())).map(|worker| worker.id.as_str()).collect::<BTreeSet<_>>();
            let remaining_tasks = matching.candidates().iter().map(|pair| pair.task.as_str()).collect::<BTreeSet<_>>();
            let remaining_owners = remaining_tasks.iter().filter_map(|task| obligations_by_task.get(*task).map(PlanningObligation::owner)).collect::<BTreeSet<_>>();
            let mut source_window = source_window.clone();
            source_window.workers.retain(|worker| remaining_workers.contains(worker.id.as_str()));
            source_window.tasks.retain(|task| remaining_owners.contains(task.id.as_str()));
            let mut window = planning_window.clone();
            window.workers.retain(|worker| remaining_workers.contains(worker.id.as_str()));
            window.tasks.retain(|task| remaining_tasks.contains(task.id.as_str()));
            let mut dependencies = dependencies;
            dependencies.retain(|key, _| key == "topology" || key.strip_prefix("worker:").is_some_and(|id| remaining_workers.contains(id)) || key.strip_prefix("task:").is_some_and(|id| remaining_tasks.contains(id)));
            self.planner.continuation = Some(NativeAssignmentContinuation { version: 1, generation: self.planner.assignment_generation, source_window, window, dependencies, matching });
        }

        let mut supply = Vec::new();
        let mut field = Vec::new();
        let mut labor = Vec::new();
        for assignment in selected.assignments {
            let obligation = obligations_by_task.get(&assignment.task).ok_or("selected native obligation disappeared")?;
            match (obligation, assignment.witness) {
                (PlanningObligation::Supply(slot), PlanningWitness::Supply { destination, route }) => supply.push(SupplyAdmissionRequest {
                    requirement_owner: slot.requirement.owner.clone(), requirement_role: slot.requirement.role.clone(),
                    requirement_generation: slot.requirement.generation, party: slot.requirement.party.clone(),
                    material: slot.requirement.material.clone(), portion: slot.lot.clone(),
                    destination_container: slot.requirement.destination.clone(), quantity: slot.quantity,
                    worker: assignment.worker,
                    route_destination: destination, route,
                }),
                (PlanningObligation::FieldWater(slot), PlanningWitness::FieldWater { vessel, cell, available, destination, route }) => field.push((slot.clone(), assignment.worker, vessel, cell, available, destination, route)),
                (PlanningObligation::Labor(requirement), PlanningWitness::Labor(contact, route)) => labor.push((requirement.clone(), assignment.worker, contact, route)),
                _ => return Err("native planner witness kind mismatch".into()),
            }
        }
        let mut water_reserved = BTreeMap::<crate::generation::Cell, u8>::new();
        field.retain(|(slot, _, _, cell, available, _, _)| {
            let used = water_reserved.entry(*cell).or_default();
            let Some(next) = used.checked_add(slot.portions) else { return false; };
            if next > *available { return false; }
            *used = next;
            true
        });
        let generation_steps = supply.len().checked_mul(2).and_then(|count| count.checked_add(labor.len())).and_then(|count| count.checked_add(field.len().saturating_mul(2))).ok_or("native assignment batch is too large")?;
        self.next_work_generation.checked_add(u64::try_from(generation_steps).map_err(|_| "native assignment batch is too large")?).ok_or("native assignment generation exhausted")?;
        let mut selected_workers = BTreeSet::new();
        let mut selected_tasks = BTreeSet::new();
        for (requirement, worker, _, _) in &labor {
            if !valid_id(&requirement.task) || !valid_id(worker) || !valid_id(&requirement.pool)
                || !selected_workers.insert(worker.clone()) || !selected_tasks.insert(requirement.task.clone())
                || self.work_attempts.contains_key(&requirement.task) || self.attempts_by_worker.contains_key(worker)
            {
                return Err("native labor assignment preflight failed".into());
            }
            let party = self.entity(&requirement.pool)?;
            if self.ecs.get::<Party>(party).is_none() { return Err("native labor party is not a party".into()); }
            let worker_entity = self.entity(worker)?;
            if self.ecs.get::<PartyMember>(worker_entity).map(|member| member.party.as_str()) != Some(requirement.pool.as_str())
                || self.ecs.get::<Body>(worker_entity).is_none_or(|body| !body.speed.is_finite() || body.speed <= 0.0)
                || self.ecs.get::<Traversal>(worker_entity).is_none()
                || self.ecs.get::<Destination>(worker_entity).is_some()
                || self.direct.contains_key(&worker_entity)
            {
                return Err("native labor worker became unavailable".into());
            }
            let task_entity = self.entity(&requirement.task)?;
            if self.ecs.get::<OwnedByParty>(task_entity).is_some_and(|owner| owner.party != requirement.pool) {
                return Err("native labor task changed party".into());
            }
        }
        for request in &supply {
            if !selected_workers.insert(request.worker.clone()) {
                return Err("native joint assignment selected a worker twice".into());
            }
        }
        for (slot, worker, vessel, _, _, _, _) in &field {
            if !selected_workers.insert(worker.clone()) { return Err("native joint assignment selected a worker twice".into()); }
            let task_entity = self.entity(&slot.task)?;
            let work = self.ecs.get::<FieldWaterWork>(task_entity).ok_or("field water task disappeared")?;
            if work.vessel.is_some() || work.lot.is_some() || work.party != slot.requirement.party || work.portions != slot.portions || vessel == worker { return Err("native field water assignment preflight failed".into()); }
            let vessel_entity = self.entity(vessel)?;
            let vessel_lot = self.ecs.get::<Lot>(vessel_entity).ok_or("native water vessel is not a lot")?;
            if vessel_lot.container != *worker || !self.ecs.get::<VesselCapability>(vessel_entity).is_some_and(|capability| capability.accepts_water) { return Err("native field water vessel became unavailable".into()); }
        }
        let supply_count = self.admit_supply_assignments(supply)?.len();
        let labor_count = labor.len();
        let field_count = field.len();
        for (slot, worker, vessel, cell, _, destination, route) in field {
            let entity = self.entity(&slot.task)?;
            let mut work = crate::record_changes::edit::<FieldWaterWork>(entity, &mut self.ecs).ok_or("field water task disappeared")?;
            work.vessel = Some(vessel);
            work.cell_x = cell.x as i32;
            work.cell_y = cell.y;
            work.cell_z = cell.z as i32;
            drop(work);
            self.begin_work_attempt_with_prepared_route(slot.task, worker, destination, route)?;
        }
        for (requirement, worker, contact, route) in labor {
            self.begin_work_attempt_with_prepared_route(requirement.task, worker, contact, route)?;
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
            task: task_id.into(), pool: party.into(), priority: self.ecs.get::<WorkPolicy>(task_entity).map(|policy| policy.priority).unwrap_or(0),
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
                    .supply_index()
                    .ids_for_requirement(process, &input.role, generation, &destination, &input.material)
                    .filter_map(|id| self.supply_allocation(id))
                    .filter(|allocation| allocation.party == party)
                    .map(|allocation| allocation.quantity)
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
                    source_lots: None,
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
                && self.is_supply_source_container(container)
                && self.ecs.get::<SealedContainer>(container).is_none()
                && position.x.is_finite()
                && lot.quantity.saturating_sub(crate::supply_allocation::reserved_source(self, &lot_id, None)) > 0
        })
    }

    fn ensure_field_water_tasks(&mut self, requirements: &[SupplyRequirement]) -> Result<()> {
        let mut pending_tasks = Vec::new();
        let mut candidate_ids = BTreeSet::new();
        let mut projected_weight = self.state_weight;
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
                if self.known.contains(&id) || !candidate_ids.insert(id.clone()) { continue; }
                if self.ids.len().saturating_add(pending_tasks.len()) >= 16_384 { return Err("region entity capacity".into()); }
                let execution = self.ecs.get::<WorkExecution>(self.entity(&requirement.owner)?).cloned()
                    .ok_or("field water requirement owner has no work execution")?;
                let owner = OwnedByParty { party: requirement.party.clone() };
                let field_water = FieldWaterWork {
                    process: requirement.owner.clone(), role: requirement.role.clone(), generation: requirement.generation,
                    party: requirement.party.clone(), destination: requirement.destination.clone(), material: requirement.material.clone(), retain_in_vessel: false, portions: 1, vessel: None,
                    cell_x: 0, cell_y: 0, cell_z: 0, lot: None,
                };
                let policy = WorkPolicy { pool: requirement.party.clone(), priority: 0, enabled: true };
                let schedule = WorkSchedule { next_review_tick: self.revision, last_considered: self.revision.saturating_sub(1) };
                let accounting = self.prepare_entity_addition_after(projected_weight, &id, &[
                    ("hive.owned-by-party", crate::components::record(&owner)),
                    ("hive.field-water-work", crate::components::record(&field_water)),
                    ("hive.work-policy", crate::components::record(&policy)),
                    ("hive.work-execution", crate::components::record(&execution)),
                    ("hive.work-schedule", crate::components::record(&schedule)),
                ])?;
                projected_weight = Self::projected_entity_weight(accounting);
                pending_tasks.push(PendingFieldWaterTask { id, owner, field_water, policy, execution, schedule, accounting });
            }
        }
        for task in pending_tasks {
            let entity = self.ecs.spawn((
                ExternalId(task.id.clone()),
                task.owner,
                task.field_water,
                task.policy,
                task.execution,
                task.schedule,
            )).id();
            self.ids.insert(task.id.clone(), entity);
            self.known.insert(task.id.clone());
            self.refresh_planner_index(&task.id);
            self.apply_entity_weight_change(task.accounting);
        }
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
                    .supply_index()
                    .ids_for_requirement(site, material, 1, site, material)
                    .filter_map(|id| self.supply_allocation(id))
                    .map(|allocation| allocation.quantity)
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
                    source_lots: None,
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
    /// Callers contribute one authoritative priority tier: automatic planning
    /// filters the task window first; direct domain planning has one owner.
    /// Distance therefore ranks only equal-priority delivery requirements.
    fn prepare_supply_slots(
        &self,
        requirements: &[SupplyRequirement],
        limit: usize,
    ) -> Result<Vec<SupplySlot>> {
        let mut slots = Vec::new();
        let mut prospective_source = BTreeMap::<String, u32>::new();
        let per_requirement = (limit / requirements.len().max(1)).max(1);
        let mut edges = Vec::new();
        // Source selection is shared by all finite deliveries. Rank complete
        // source-to-destination legs before allocating provisional portions;
        // stable lot IDs must not ship one district's stock across another.
        for (requirement_index, requirement) in requirements.iter().enumerate() {
            let destination = self.world_pose(&requirement.destination)?;
            let source_ids = requirement.source_lots.as_ref()
                .map(|sources| sources.iter().cloned().collect::<Vec<_>>())
                .unwrap_or_else(|| self.visible_ground_lot_ids());
            let mut sources = source_ids.iter().filter_map(|lot_id| {
                let entity = *self.ids.get(lot_id)?;
                let lot = self.ecs.get::<Lot>(entity)?;
                if !lot_matches_material(lot, self.ecs.get::<LotWater>(entity), &requirement.material) { return None; }
                let container = self.entity(&lot.container).ok()?;
                let public_ground = self.ecs.get::<GroundStock>(container).is_some()
                    && self.ecs.get::<OwnedByParty>(container).is_none();
                let source_party_ok = self.ecs.get::<OwnedByParty>(container).map(|owner| owner.party.as_str()) == Some(requirement.party.as_str()) || public_ground;
                let lot_party_ok = self.ecs.get::<OwnedByParty>(entity).map(|owner| owner.party.as_str()) == Some(requirement.party.as_str()) || (public_ground && self.ecs.get::<OwnedByParty>(entity).is_none());
                if !source_party_ok || !lot_party_ok || !self.is_supply_source_container(container)
                    || self.ecs.get::<SealedContainer>(container).is_some() { return None; }
                let position = *self.ecs.get::<Position>(container)?;
                let free = lot.quantity.saturating_sub(crate::supply_allocation::reserved_source(self, lot_id, None));
                let eligible = match requirement.policy {
                    InputPolicy::Portion => free > 0,
                    InputPolicy::WholeLot => free == lot.quantity && lot.quantity == requirement.missing,
                };
                // Both contacts can be within the shared transfer reach of
                // their containers; this bound is not a reachability witness.
                let distance = ((position.x-destination.x).powi(2) + (position.y-destination.y).powi(2) + (position.z-destination.z).powi(2)).sqrt();
                eligible.then(|| (distance, lot_id.clone(), position, free))
            }).collect::<Vec<_>>();
            sources.sort_by(|a, b| a.0.total_cmp(&b.0).then(a.1.cmp(&b.1)));
            edges.extend(sources.into_iter().take(limit).map(|(distance, lot, position, free)| (distance, requirement_index, lot, position, free)));
        }
        edges.sort_by(|a, b| a.0.total_cmp(&b.0).then(a.1.cmp(&b.1)).then(a.2.cmp(&b.2)));
        let mut remaining = requirements.iter().map(|requirement| requirement.missing).collect::<Vec<_>>();
        let mut counts = vec![0; requirements.len()];
        for (distance, requirement_index, lot, source_position, free) in edges {
            let requirement = &requirements[requirement_index];
            let mut source_remaining = free.saturating_sub(*prospective_source.get(&lot).unwrap_or(&0));
            while remaining[requirement_index] > 0 && source_remaining > 0
                && slots.len() < limit && counts[requirement_index] < per_requirement
            {
                let quantity = match requirement.policy {
                    InputPolicy::Portion => remaining[requirement_index].min(source_remaining).min(MAX_CARRY_PORTION),
                    InputPolicy::WholeLot if source_remaining == remaining[requirement_index] => remaining[requirement_index],
                    InputPolicy::WholeLot => 0,
                };
                if quantity == 0 { break; }
                slots.push(SupplySlot {
                    task: format!("supply-slot-{}", slots.len()), requirement: requirement.clone(),
                    lot: lot.clone(), source_position, source_contacts: Arc::new(Vec::new()),
                    delivery_lower_bound: (distance - 2.0 * super::interaction_contact::TRANSFER_REACH_METRES).max(0.0), quantity, policy: requirement.policy,
                });
                *prospective_source.entry(lot.clone()).or_default() += quantity;
                remaining[requirement_index] -= quantity;
                source_remaining -= quantity;
                counts[requirement_index] += 1;
            }
            if slots.len() == limit { break; }
        }
        Ok(slots)
    }

    /// Read ordinary supply sources through the physical ground-container
    /// index. The material owner updates both this index and `contents` at the
    /// same mutations that create, move, or retire lots, so routine planning
    /// does not scan unrelated actors, structures, policies, or terrain.
    fn visible_ground_lot_ids(&self) -> Vec<String> {
        let mut lots = self.visible_source_containers.iter().flat_map(|container| {
            self.contents.get(container).into_iter().flatten().filter_map(|entity| {
                self.ecs.get::<ExternalId>(*entity).map(|id| id.0.clone())
            })
        }).collect::<Vec<_>>();
        lots.sort();
        lots.dedup();
        lots
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
                    && self.ecs.get::<ExcavationWork>(entity).is_none())
                .then(|| (candidate.id, candidate.party, position, free_capacity))
            })
            .collect::<Vec<_>>();
        if workers.is_empty() {
            return Ok(Vec::new());
        }

        // A batch needs at least one eligible carrier, not every carrier.
        // Use the largest currently free capacity; pair eligibility handles
        // smaller workers, which get smaller portions when larger carriers
        // are occupied. A partially full carrier cannot shrink every haul.
        let carry_limit_by_party = workers.iter().fold(
            BTreeMap::<String, u32>::new(),
            |mut limits, (_, party, _, capacity)| {
                limits
                    .entry(party.clone())
                    .and_modify(|limit| *limit = (*limit).max(*capacity))
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
                        .sqrt() + slot.delivery_lower_bound,
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
                    Ok(SearchOutcome::Reachable((cost + slot.delivery_lower_bound, route)))
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
    use crate::components::{ConstructionPlan, Lot, SupplyAllocation};
    use crate::generation::Cell;
    use crate::structure_geometry::Cardinal;
    use crate::work_attempt::{InterruptCause, WorkAttempt};
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

    fn field_water_accounting_fixture() -> (Kernel, SupplyRequirement) {
        let mut kernel = Kernel::new();
        kernel.load(&json!({
            "format":"hive-game", "version":3, "game":"field-water-accounting",
            "components":[], "materialCatalog":[{"kind":"water","unitVolume":1}],
            "stockpileProfiles":[{"id":"water-stock","allowedMaterials":["water"]}],
            "initial":[
                {"id":"party","components":{"hive.party":{},"hive.owned-by":{"player":"player"}}},
                {"id":"process","components":{
                    "hive.owned-by-party":{"party":"party"},
                    "hive.position":{"x":0.0,"y":0.0,"z":0.0,"facing":0.0},
                    "hive.container":{"capacity":8},
                    "hive.stockpile-cell":{"zone":"water-zone","priority":1,"filterProfile":"water-stock"},
                    "hive.work-execution":{"pool":"party","initiatingPlayer":null,"policyId":"test-water"}
                }}
            ]
        }).to_string()).unwrap();
        (kernel, SupplyRequirement {
            owner: "process".into(), role: "water".into(), generation: 3,
            party: "party".into(), material: "water".into(), policy: InputPolicy::Portion,
            destination: "process".into(), missing: 2, source_lots: None,
        })
    }

    fn assert_state_weight_matches_recount(kernel: &mut Kernel) {
        let accounted = kernel.state_weight;
        kernel.refresh_state_weight();
        assert_eq!(accounted, kernel.state_weight, "incremental accounting equals full recount");
    }

    #[test]
    fn field_water_accounting_covers_noop_pending_creation_capacity_and_restore() {
        let (mut kernel, mut requirement) = field_water_accounting_fixture();

        let source = kernel.ecs.spawn((
            ExternalId("water-source".into()), OwnedByParty { party: "party".into() },
            Position { x: 0.0, y: 0.0, z: 0.0, facing: 0.0 }, Container { capacity: 4 }, GroundStock {},
        )).id();
        let water = kernel.ecs.spawn((
            ExternalId("water-lot".into()), OwnedByParty { party: "party".into() },
            Lot { kind: "water".into(), quantity: 1, container: "water-source".into() }, LotWater { water_kg: 1.0 },
        )).id();
        kernel.ids.insert("water-source".into(), source);
        kernel.ids.insert("water-lot".into(), water);
        kernel.known.extend(["water-source".into(), "water-lot".into()]);
        kernel.refresh_state_weight();

        let exact_weight = kernel.state_weight;
        kernel.state_weight += 17;
        kernel.ensure_field_water_tasks(std::slice::from_ref(&requirement)).unwrap();
        assert_eq!(kernel.state_weight, exact_weight + 17, "available water takes the no-op path without a recount");
        assert_eq!(kernel.ids.values().filter(|entity| kernel.ecs.get::<FieldWaterWork>(**entity).is_some()).count(), 0);
        kernel.state_weight = exact_weight;
        assert_state_weight_matches_recount(&mut kernel);

        requirement.material = "grain".into();
        let before_noop = kernel.state_weight;
        kernel.ensure_field_water_tasks(std::slice::from_ref(&requirement)).unwrap();
        assert_eq!(kernel.state_weight, before_noop, "non-water requirements do not mutate accounting");
        assert_state_weight_matches_recount(&mut kernel);

        requirement.material = "water".into();
        kernel.ids.remove("water-lot");
        kernel.ids.remove("water-source");
        kernel.known.remove("water-lot");
        kernel.known.remove("water-source");
        kernel.ecs.despawn(water);
        kernel.ecs.despawn(source);
        kernel.refresh_state_weight();
        kernel.ensure_field_water_tasks(std::slice::from_ref(&requirement)).unwrap();
        assert_eq!(kernel.ids.values().filter(|entity| kernel.ecs.get::<FieldWaterWork>(**entity).is_some()).count(), 2);
        assert_state_weight_matches_recount(&mut kernel);

        let with_tasks = kernel.state_weight;
        kernel.ensure_field_water_tasks(std::slice::from_ref(&requirement)).unwrap();
        assert_eq!(kernel.state_weight, with_tasks, "pending tasks satisfy the requirement without a recount or extra charge");
        assert_state_weight_matches_recount(&mut kernel);

        let saved = kernel.save_records().unwrap();
        let mut restored = Kernel::new();
        restored.restore_records(&saved).unwrap();
        assert_eq!(restored.ids.values().filter(|entity| restored.ecs.get::<FieldWaterWork>(**entity).is_some()).count(), 2);
        assert_state_weight_matches_recount(&mut restored);

        let retired = restored.ids.iter().find_map(|(id, entity)|
            restored.ecs.get::<FieldWaterWork>(*entity).is_some().then(|| (id.clone(), *entity))
        ).unwrap();
        let accounting = restored.prepare_entity_removal(&retired.0, retired.1).unwrap();
        restored.ids.remove(&retired.0);
        restored.known.remove(&retired.0);
        restored.ecs.despawn(retired.1);
        restored.refresh_planner_index(&retired.0);
        restored.apply_entity_weight_change(accounting);
        assert_state_weight_matches_recount(&mut restored);
    }

    #[test]
    fn field_water_capacity_rejection_precedes_entity_commit() {
        let (mut kernel, requirement) = field_water_accounting_fixture();
        let before_ids = kernel.ids.len();
        let before_known = kernel.known.clone();
        let before_weight = kernel.state_weight;
        let task_id = field_water_task_id("process", "water", 3, 0);
        let owner = OwnedByParty { party: "party".into() };
        let field_water = FieldWaterWork {
            process: "process".into(), role: "water".into(), generation: 3,
            party: "party".into(), destination: "process".into(), material: "water".into(),
            retain_in_vessel: false, portions: 1, vessel: None, cell_x: 0, cell_y: 0, cell_z: 0, lot: None,
        };
        let policy = WorkPolicy { pool: "party".into(), priority: 0, enabled: true };
        let execution = kernel.ecs.get::<WorkExecution>(kernel.entity("process").unwrap()).unwrap().clone();
        let schedule = WorkSchedule { next_review_tick: kernel.revision, last_considered: kernel.revision.saturating_sub(1) };
        let added_weight = task_id.len().saturating_add(128)
            + kernel.registry.weight("hive.owned-by-party", &crate::components::record(&owner))
            + kernel.registry.weight("hive.field-water-work", &crate::components::record(&field_water))
            + kernel.registry.weight("hive.work-policy", &crate::components::record(&policy))
            + kernel.registry.weight("hive.work-execution", &crate::components::record(&execution))
            + kernel.registry.weight("hive.work-schedule", &crate::components::record(&schedule));
        kernel.state_weight = super::super::STATE_BYTES - added_weight;

        assert_eq!(kernel.ensure_field_water_tasks(std::slice::from_ref(&requirement)).unwrap_err(), "region canonical state capacity");
        assert_eq!(kernel.ids.len(), before_ids);
        assert_eq!(kernel.known, before_known);
        assert_eq!(kernel.state_weight, super::super::STATE_BYTES - added_weight);
        assert!(!kernel.ids.contains_key(&task_id), "the first fitting task remains uncommitted when the second exceeds capacity");

        kernel.state_weight = before_weight;
        assert_state_weight_matches_recount(&mut kernel);

        let committed = kernel.save_records().unwrap();
        let mut candidate = Kernel::new();
        candidate.restore_records(&committed).unwrap();
        candidate.state_weight = super::super::STATE_BYTES - 1;
        assert!(candidate.ensure_field_water_tasks(std::slice::from_ref(&requirement)).is_err());
        drop(candidate);
        assert_eq!(kernel.ids.len(), before_ids, "a rejected disposable candidate publishes no task");
        assert_eq!(kernel.state_weight, before_weight, "discard leaves the committed ledger unchanged");
        assert_state_weight_matches_recount(&mut kernel);
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
            json!({"id":"party","components":{"hive.party":{},"hive.owned-by":{"player":"player"}}}),
            json!({"id":"source","components":{"hive.owned-by-party":{"party":"party"},"hive.position":{"x":0.0,"y":0.0,"z":0.0,"facing":0.0},"hive.container":{"capacity":6},"hive.ground-stock":{}}}),
            json!({"id":"wood","components":{"hive.owned-by-party":{"party":"party"},"hive.lot":{"kind":"stone-spoil","quantity":6,"container":"source"}}}),
        ];
        initial.extend(workers);
        let mut kernel = Kernel::new();
        kernel.load(&json!({"format":"hive-game","version":3,"game":"native-supply","components":[],"materialCatalog":[],"initial":initial}).to_string()).unwrap();
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
            .plan_constructions("party".into(), vec![ConstructionPlan {
                catalog: "floor".into(),
                site: "site".into(),
                target: ConstructionTarget::Cell {
                    cell: surface,
                    orientation: Cardinal::North,
                },
            }], &ActionScope::Host)
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

    fn native_stockpile_world(worker_count: usize) -> Kernel {
        let workers = (1..=worker_count).map(|index| json!({
            "id": format!("worker-{index}"),
            "components": {
                "hive.party-member": { "party": "party" },
                "hive.position": { "x": 0.0, "y": 0.0, "z": 0.0, "facing": 0.0 },
                "hive.body": { "speed": 1.0 },
                "hive.traversal": { "clearanceCells": 1, "maxStepCells": 1 },
                "hive.container": { "capacity": 3 },
                "hive.work-participation": { "automatic": true }
            }
        })).collect::<Vec<_>>();
        let mut initial = vec![
            json!({"id":"party","components":{"hive.party":{},"hive.owned-by":{"player":"player"}}}),
            json!({"id":"source","components":{"hive.owned-by-party":{"party":"party"},"hive.position":{"x":0.0,"y":0.0,"z":0.0,"facing":0.0},"hive.container":{"capacity":8}}}),
        ];
        initial.extend(workers);
        let mut kernel = Kernel::new();
        kernel.load(&json!({
            "format":"hive-game", "version":3, "game":"native-stockpile",
            "components":[],
            "materialCatalog":[{"kind":"stone-spoil","unitVolume":1}],
            "stockpileProfiles":[{"id":"materials","allowedMaterials":["stone-spoil"]}],
            "initial":initial,
        }).to_string()).unwrap();
        kernel.load_environment(&crate::environment_definition::tests::fixture("construction")).unwrap();
        let surface = kernel.environment.as_mut().unwrap().world.surface_cells(&[(0, 0)]).unwrap().into_iter().next().flatten().unwrap().cell;
        let spacing = kernel.environment.as_ref().unwrap().world.cell_spacing_m();
        let contact = Position { x: (surface.x as f64 + 1.0) * spacing[0], y: (f64::from(surface.y) + 0.5) * spacing[1], z: surface.z as f64 * spacing[2], facing: 0.0 };
        let source_position = Position { x: contact.x + spacing[0], y: contact.y, z: contact.z, facing: 0.0 };
        kernel.ecs.entity_mut(kernel.entity("source").unwrap()).insert(source_position);
        let source_contacts = kernel.transfer_contact_candidates("source", crate::terrain_traversal::TraversalConfig { spacing: [0.0; 3], clearance_cells: 1, max_step_cells: 1 }, None).unwrap();
        let worker_position = Position {
            x: source_contacts[0].x,
            y: source_contacts[0].y,
            z: source_contacts[0].z,
            facing: 0.0,
        };
        for id in (1..=worker_count).map(|index| format!("worker-{index}")) {
            kernel.ecs.entity_mut(kernel.entity(&id).unwrap()).insert(worker_position);
        }
        let target = kernel.ecs.spawn((
            ExternalId("target".into()), contact,
            StockpileCell { zone: "target-zone".into(), priority: 2, filter_profile: "materials".into() },
            OwnedByParty { party: "party".into() },
        )).id();
        kernel.ids.insert("target".into(), target);
        kernel.known.insert("target".into());
        super::super::stockpile_work::install_planner_state(&mut kernel, "target", target, Some(WorkExecution {
            pool: "party".into(), initiating_player: None, policy_id: crate::work_planner::POLICY_STOCKPILE.into(),
        })).unwrap();
        kernel.rebuild_physical_indexes(true).unwrap();
        // Publish a fresh ownerless ground output after the last rebuild. The
        // live source index must expose it immediately, without a reload.
        let output = kernel.prepare_ground_output(source_position, "stone-spoil".into(), 3, None, Some("party".into())).unwrap();
        kernel.publish_material_output(output);
        kernel
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
    fn native_stockpile_delivery_uses_shared_lifecycle_with_draft_restore_and_single_claim() {
        let mut kernel = native_stockpile_world(2);
        assert_eq!(kernel.advance_native_work_planner(8).unwrap(), 1);
        assert_eq!(kernel.supply_allocations().count(), 1, "one exact lot/capacity demand has one claim");
        let allocation_id = kernel.supply_allocations().next().unwrap().0.to_owned();
        let allocation = kernel.ecs.get::<SupplyAllocation>(kernel.entity(&allocation_id).unwrap()).unwrap().clone();
        let source_pose = *kernel.ecs.get::<Position>(kernel.entity("source").unwrap()).unwrap();
        let source_contacts = kernel.transfer_contact_candidates("source", crate::terrain_traversal::TraversalConfig { spacing: [0.0; 3], clearance_cells: 1, max_step_cells: 1 }, None).unwrap();
        assert!(source_contacts.len() > 1, "pickup must expose standing contacts around the source");
        assert!(source_contacts.iter().any(|contact| [contact.x, contact.y, contact.z] != [source_pose.x, source_pose.y, source_pose.z]), "pickup must not route to the occupied source center");
        settle_routes(&mut kernel);
        assert_eq!(kernel.reconcile_supply_allocations().unwrap(), 1, "pickup commits custody");
        assert_eq!(kernel.reconcile_supply_allocations().unwrap(), 1, "carried lot starts destination route");
        let worker = kernel
            .ecs
            .get::<Lot>(kernel.entity(&allocation.portion).unwrap())
            .unwrap()
            .container
            .clone();
        assert_eq!(kernel.quantity_in_container(&worker), 3);
        assert_eq!(kernel.quantity_in_container("target"), 0);

        // Drafting the carrier interrupts the route while preserving carried
        // custody. The allocation remains the sole durable continuation.
        crate::record_changes::edit::<WorkParticipation>(kernel.entity(&worker).unwrap(), &mut kernel.ecs).unwrap().automatic = false;
        let task = kernel.work_attempts.iter().find_map(|(task, entity)| (kernel.ecs.get::<WorkAttempt>(*entity).is_some_and(|attempt| attempt.worker == worker)).then_some(task.clone())).expect("carrier task");
        let operation = kernel.work_attempt(&task).expect("stockpile attempt").current_operation().unwrap().clone();
        kernel.interrupt_work_attempt(task.clone(), operation.attempt.generation, operation.sequence, InterruptCause::WorkerUnavailable).unwrap();
        assert_eq!(kernel.reconcile_supply_allocations().unwrap(), 1);
        assert_eq!(kernel.quantity_in_container(&worker), 3);

        let saved = kernel.save_records().unwrap();
        let mut restored = Kernel::new();
        restored.restore_records(&saved).unwrap();
        crate::record_changes::edit::<WorkParticipation>(restored.entity(&worker).unwrap(), &mut restored.ecs).unwrap().automatic = true;
        restored.refresh_planner_index(&worker);
        crate::record_changes::edit::<Body>(restored.entity(&worker).unwrap(), &mut restored.ecs).unwrap().speed = 0.0;
        assert_eq!(restored.reconcile_supply_allocations().unwrap(), 0, "drafted carrier does not advance while stopped");
        crate::record_changes::edit::<Body>(restored.entity(&worker).unwrap(), &mut restored.ecs).unwrap().speed = 1.0;
        assert_eq!(restored.advance_native_work_planner(restored.revision).unwrap(), 1, "saved carried allocation resumes through the shared planner");
        settle_routes(&mut restored);
        assert_eq!(restored.reconcile_supply_allocations().unwrap(), 1, "deposit commits exact quantity");
        assert_eq!(restored.reconcile_supply_allocations().unwrap(), 1, "receipt retires once");
        assert_eq!(restored.quantity_in_container("stockpile-ground:target"), 3);
        assert_eq!(restored.quantity_in_container("source"), 0);
        assert_eq!(restored.quantity_in_container(&worker), 0);
        assert!(restored.supply_allocations().next().is_none());
        let lot = restored.ecs.get::<Lot>(restored.entity(&allocation.portion).unwrap()).unwrap();
        assert_eq!(lot.container, "stockpile-ground:target");
        assert_eq!(lot.quantity, 3);
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
    fn two_workers_claim_distinct_portions_from_public_ground() {
        let (mut kernel, _, _) = construction_world(2);
        let source = kernel.entity("source").unwrap();
        let wood = kernel.entity("wood").unwrap();
        kernel.ecs.entity_mut(source).remove::<OwnedByParty>();
        kernel.ecs.entity_mut(wood).remove::<OwnedByParty>();
        kernel.rebuild_physical_indexes(true).unwrap();

        let admitted = kernel.plan_construction_supply("site", "party").unwrap();
        assert_eq!(admitted.len(), 2);
        finish_active_deliveries(&mut kernel);

        assert_eq!(kernel.quantity_in_container("site"), 6);
        for lot in kernel.contents.get("site").into_iter().flatten() {
            assert_eq!(
                kernel.ecs.get::<OwnedByParty>(*lot).unwrap().party,
                "party",
                "pickup atomically claims each public portion for its carrier's party",
            );
        }
        kernel.save_records().unwrap();
    }

    #[test]
    fn ordinary_supply_sources_use_the_ground_contents_index() {
        let (mut kernel, _, _) = construction_world(1);
        let carried = kernel.complete_material_output(super::super::material_output::MaterialOutputSpec {
            container: "worker-1".into(),
            kind: "stone-spoil".into(),
            quantity: 1,
            water_kg: None,
        }).unwrap();

        assert_eq!(kernel.visible_ground_lot_ids(), vec!["wood"]);
        assert!(!kernel.visible_ground_lot_ids().contains(&carried));
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
        // Reconciliation materializes and acknowledges the typed Bind at the
        // exact reached contact, then admits ordinary supply in the same
        // planner pass. No completed bind remains to lock the worker or site.
        assert_eq!(kernel.advance_native_work_planner(16).unwrap(), 2);
        assert!(kernel.ecs.get::<Position>(site).is_some());
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
        let task = kernel.plan_deconstruction("site".into(), "party".into(), &ActionScope::Host).unwrap();
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
        let task = kernel.plan_deconstruction("site".into(), "party".into(), &ActionScope::Host).unwrap();
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
        kernel.plan_constructions("party".into(), vec![ConstructionPlan {
            catalog: "floor".into(), site: "site-2".into(),
            target: ConstructionTarget::Cell { cell: second_cell, orientation: Cardinal::North },
        }], &ActionScope::Host).unwrap();
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
            .plan_constructions("party".into(), vec![ConstructionPlan {
                catalog: "floor".into(),
                site: "site-2".into(),
                target: ConstructionTarget::Cell {
                    cell: second_cell,
                    orientation: Cardinal::North,
                },
            }], &ActionScope::Host)
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
            pool: "party".into(),
            priority: 9,
            enabled: true,
        });
        kernel.ecs.entity_mut(second).insert(crate::work_planner::WorkPolicy {
            pool: "party".into(),
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

    fn thirty_two_ready_construction_tasks() -> Kernel {
        let (mut kernel, _, _) = construction_world(32);
        let first = kernel.entity("site").unwrap();
        kernel.ecs.entity_mut(first).insert(WorkPolicy { pool: "party".into(), priority: 0, enabled: false });
        kernel.refresh_planner_index("site");
        let columns = (2..6).flat_map(|z| (-4..4).map(move |x| (x, z))).collect::<Vec<_>>();
        let surfaces = kernel.environment.as_mut().unwrap().world.surface_cells(&columns).unwrap();
        let plans = surfaces.into_iter().enumerate().map(|(index, surface)| ConstructionPlan {
            catalog: "floor".into(), site: format!("batch-{index:02}"),
            target: ConstructionTarget::Cell { cell: surface.unwrap().cell, orientation: Cardinal::North },
        }).collect();
        kernel.plan_constructions("party".into(), plans, &ActionScope::Host).unwrap();
        kernel
    }

    #[test]
    fn native_episode_dispatches_eight_per_step_and_resumes_records_without_rematching() {
        let mut kernel = thirty_two_ready_construction_tasks();
        for slice in 1..=4 {
            assert_eq!(kernel.advance_native_work_planner(slice).unwrap(), 8);
            assert_eq!(kernel.attempts_by_worker.len(), slice as usize * 8);
            assert_eq!(kernel.planner.assignment_generation, 1, "unchanged remaining work must reuse one matching");
            let saved = kernel.save_records().unwrap();
            let mut restored = Kernel::new();
            restored.restore_records(&saved).unwrap();
            assert_eq!(restored.planner, kernel.planner);
            kernel = restored;
        }
        assert!(kernel.planner.continuation.is_none());
    }

    #[test]
    fn accepted_arrivals_continue_outside_a_retained_assignment_window_after_restore() {
        let mut kernel = thirty_two_ready_construction_tasks();
        assert_eq!(kernel.advance_native_work_planner(1).unwrap(), 8);
        let dispatched = kernel.work_attempts.keys().cloned().collect::<Vec<_>>();
        let retained = kernel.planner.continuation.as_ref().unwrap();
        assert!(dispatched.iter().all(|task| !retained.source_window.tasks.iter().any(|candidate| &candidate.id == task)));
        kernel.advance_movement(60.0).unwrap();
        kernel.settle_arrived_work_attempts().unwrap();
        for task in &dispatched {
            let attempt = kernel.work_attempt(task).unwrap();
            assert!(matches!(attempt.phase, crate::work_attempt::AttemptPhase::Outcome {
                activity: crate::work_attempt::ActivityRef::Route { .. },
                result: crate::work_attempt::WorkOutcome::Completed, ..
            }));
            assert!(kernel.ecs.get::<Position>(kernel.entity(task).unwrap()).is_none());
        }
        let saved = kernel.save_records().unwrap();
        let mut recovered = Kernel::new();
        recovered.restore_records(&saved).unwrap();
        for world in [&mut kernel, &mut recovered] {
            world.advance_native_work_planner(2).unwrap();
            for task in &dispatched {
                assert!(world.work_attempt(task).is_none(),
                    "binding must continue and acknowledge its exact attempt without returning to candidate selection");
                assert!(world.ecs.get::<Position>(world.entity(task).unwrap()).is_some(),
                    "construction's physical bind owner must run after arrival");
            }
            assert!(world.planner.continuation.is_some(),
                "accepted outcomes and residual candidate work must both advance");
        }
        assert_eq!(kernel.save_records().unwrap().entities, recovered.save_records().unwrap().entities);
    }

    #[test]
    fn equal_priority_due_work_competes_with_retained_matching_after_restore() {
        let mut kernel = thirty_two_ready_construction_tasks();
        assert_eq!(kernel.advance_native_work_planner(1).unwrap(), 8);
        let entity = kernel.entity("site").unwrap();
        kernel.ecs.entity_mut(entity).insert(WorkPolicy { pool: "party".into(), priority: 0, enabled: true });
        kernel.ecs.entity_mut(entity).insert(WorkSchedule { next_review_tick: 2, last_considered: 0 });
        kernel.refresh_planner_index("site");
        let saved = kernel.save_records().unwrap();
        let mut recovered = Kernel::new();
        recovered.restore_records(&saved).unwrap();
        for world in [&mut kernel, &mut recovered] {
            assert_eq!(world.advance_native_work_planner(2).unwrap(), 2);
            assert_eq!(world.supply_allocations().filter(|(_, allocation)| allocation.requirement_owner == "site").count(), 2);
            assert_eq!(world.planner.assignment_generation, 2);
        }
        assert_eq!(kernel.save_records().unwrap().entities, recovered.save_records().unwrap().entities);
        assert_eq!(kernel.planner, recovered.planner);
    }

    #[test]
    fn supply_sources_compete_by_delivery_distance_before_stable_identity() {
        let mut kernel = Kernel::new();
        kernel.load(&json!({"format":"hive-game","version":3,"game":"supply-locality","components":[],"materialCatalog":[],"initial":[
            {"id":"party","components":{"hive.party":{}}},
            {"id":"near","components":{"hive.position":{"x":0,"y":0,"z":0,"facing":0},"hive.container":{"capacity":20},"hive.ground-stock":{},"hive.owned-by-party":{"party":"party"}}},
            {"id":"far","components":{"hive.position":{"x":100,"y":0,"z":0,"facing":0},"hive.container":{"capacity":20},"hive.ground-stock":{},"hive.owned-by-party":{"party":"party"}}},
            {"id":"a-far-lot","components":{"hive.lot":{"container":"far","kind":"wood","quantity":3},"hive.owned-by-party":{"party":"party"}}},
            {"id":"z-near-lot","components":{"hive.lot":{"container":"near","kind":"wood","quantity":3},"hive.owned-by-party":{"party":"party"}}}
        ]}).to_string()).unwrap();
        let requirements = ["near", "far"].map(|destination| SupplyRequirement {
            owner: destination.into(), role: "wood".into(), generation: 1, party: "party".into(),
            material: "wood".into(), policy: InputPolicy::Portion, destination: destination.into(), missing: 3, source_lots: None,
        });
        let slots = kernel.prepare_supply_slots(&requirements, 8).unwrap();
        assert_eq!(slots.len(), 2);
        assert_eq!(slots[0].lot, "z-near-lot");
        assert_eq!(slots[0].requirement.destination, "near");
        assert_eq!(slots[1].lot, "a-far-lot");
        assert_eq!(slots[1].requirement.destination, "far");
        assert_eq!(slots.iter().map(|slot| slot.quantity).sum::<u32>(), 6);
        assert!(kernel.supply_allocations().next().is_none(), "pricing cannot claim physical stock");
    }

    #[test]
    fn newly_higher_priority_task_preempts_retained_low_priority_window() {
        let mut kernel = thirty_two_ready_construction_tasks();
        assert_eq!(kernel.advance_native_work_planner(1).unwrap(), 8);
        let task = "site".to_owned(); // previously disabled and outside the admitted window
        let entity = kernel.entity(&task).unwrap();
        kernel.ecs.entity_mut(entity).insert(WorkPolicy { pool: "party".into(), priority: 9, enabled: true });
        kernel.ecs.entity_mut(entity).insert(WorkSchedule { next_review_tick: 2, last_considered: 1 });
        kernel.refresh_planner_index(&task);
        assert_eq!(kernel.advance_native_work_planner(2).unwrap(), 2);
        assert_eq!(kernel.supply_allocations().filter(|(_, allocation)| allocation.requirement_owner == task).count(), 2);
        assert_eq!(kernel.planner.assignment_generation, 2);
    }

    #[test]
    fn retained_episode_rechecks_changed_worker_and_ignores_unrelated_entity_motion() {
        let mut kernel = thirty_two_ready_construction_tasks();
        assert_eq!(kernel.advance_native_work_planner(1).unwrap(), 8);
        let source = kernel.entity("source").unwrap();
        crate::record_changes::edit::<Position>(source, &mut kernel.ecs).unwrap().x += 1.0;
        kernel.rebuild_physical_indexes(false).unwrap();
        assert_eq!(kernel.advance_native_work_planner(2).unwrap(), 8);
        assert_eq!(kernel.planner.assignment_generation, 1);
        let worker = kernel.planner.continuation.as_ref().unwrap().window.workers[0].id.clone();
        let entity = kernel.entity(&worker).unwrap();
        kernel.ecs.entity_mut(entity).insert(crate::work_planner::WorkParticipation { automatic: false });
        kernel.refresh_planner_index(&worker);
        assert_eq!(kernel.advance_native_work_planner(3).unwrap(), 8);
        assert_eq!(kernel.planner.assignment_generation, 2);
        assert!(!kernel.attempts_by_worker.contains_key(&worker));
    }

    #[test]
    fn cancelling_retained_task_replans_other_work_without_losing_it() {
        let mut kernel = thirty_two_ready_construction_tasks();
        assert_eq!(kernel.advance_native_work_planner(1).unwrap(), 8);
        let task = kernel.planner.continuation.as_ref().unwrap().source_window.tasks[0].id.clone();
        let entity = kernel.entity(&task).unwrap();
        kernel.ecs.entity_mut(entity).insert(WorkPolicy { pool: "party".into(), priority: 0, enabled: false });
        kernel.refresh_planner_index(&task);
        for (tick, expected) in [(2, 8), (3, 8), (4, 7)] {
            assert_eq!(kernel.advance_native_work_planner(tick).unwrap(), expected);
        }
        assert_eq!(kernel.attempts_by_worker.len(), 31);
        assert!(!kernel.work_attempts.contains_key(&task));
        assert!(kernel.planner.continuation.is_none());
    }

    #[test]
    fn failed_admission_restores_retained_episode_and_all_claims() {
        let mut kernel = thirty_two_ready_construction_tasks();
        assert_eq!(kernel.advance_native_work_planner(1).unwrap(), 8);
        kernel.next_work_generation = u64::MAX;
        let before = kernel.save_records().unwrap();
        assert!(kernel.advance_json(r#"{"delta":0,"writes":[],"actions":[]}"#).unwrap_err().contains("generation exhausted"));
        assert_eq!(kernel.save_records().unwrap().entities, before.entities);
        assert_eq!(kernel.attempts_by_worker.len(), 8);
        assert!(kernel.planner.continuation.is_some());
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
    fn one_small_carrier_does_not_shrink_every_delivery_portion() {
        let (mut kernel, _, _) = construction_world(2);
        let small = kernel.entity("worker-2").unwrap();
        kernel.ecs.entity_mut(small).insert(Container { capacity: 1 });
        let admitted = kernel.plan_construction_supply("site", "party").unwrap();
        assert_eq!(admitted.len(), 1);
        assert_eq!(kernel.supply_allocation(&admitted[0]).unwrap().quantity, 3);
        assert_eq!(kernel.work_attempt(&admitted[0]).unwrap().worker, "worker-1");
        let small_delivery = kernel.plan_construction_supply("site", "party").unwrap();
        assert_eq!(small_delivery.len(), 1, "small carrier stays eligible while larger carrier is occupied");
        assert_eq!(kernel.supply_allocation(&small_delivery[0]).unwrap().quantity, 1);
        assert_eq!(kernel.work_attempt(&small_delivery[0]).unwrap().worker, "worker-2");
        assert_eq!(crate::supply_allocation::reserved_source(&kernel, "wood", None), 4);
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
            source_lots: None,
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
        crate::record_changes::edit::<WorkParticipation>(worker, &mut kernel.ecs)
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
        crate::record_changes::edit::<WorkParticipation>(worker, &mut restored.ecs)
            .unwrap()
            .automatic = true;
        restored.refresh_planner_index("worker-1");
        crate::record_changes::edit::<Body>(worker, &mut restored.ecs).unwrap().speed = 0.0;
        assert_eq!(restored.reconcile_supply_allocations().unwrap(), 0);
        assert!(restored.work_attempt(&allocation).is_none());
        crate::record_changes::edit::<Body>(worker, &mut restored.ecs).unwrap().speed = 1.0;
        assert_eq!(restored.advance_native_work_planner(restored.revision).unwrap(), 1);
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
        assert_eq!(requirement.pool, "party");
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
        crate::record_changes::edit::<ConstructionSite>(site_entity, &mut kernel.ecs).unwrap().target = ConstructionTarget::Cell {
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
