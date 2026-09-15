//! Canonical Job/Task admission, validation, readiness, completion and cancellation.

use crate::components::{ActionScope, Container, ExternalId, FiniteResource, JobSnapshot, Lot, OwnedByParty, Party, Point, TaskSnapshot};
use crate::work_attempt::{AttemptPhase, InterruptCause, WorkAttempt};
use crate::world::Kernel;
use bevy_ecs::prelude::Entity;
use std::collections::BTreeSet;

use crate::job::valid_id;

type Result<T> = std::result::Result<T, String>;

#[derive(Clone, Debug, Default, PartialEq, Eq)]
pub(crate) struct JobIndex {
    pub(crate) ready_tasks: BTreeSet<String>,
}

impl Kernel {
    /// Resolve a dependent task's result binding to the exact committed
    /// physical entity. This is deliberately performed by the job owner at
    /// dispatch time, after the item may have been moved or stored.
    pub(crate) fn resolve_job_result_source(&self, task: &crate::job::Task, step: &str, slot: &str) -> Result<String> {
        let job = self.ecs.get::<crate::job::Job>(self.entity(&task.job)?).ok_or("job is missing")?;
        let producer = job.task_ids.iter().find_map(|id| self.ids.get(id).and_then(|entity| self.ecs.get::<crate::job::Task>(*entity)).filter(|candidate| candidate.step == step));
        let producer = producer.ok_or("job result producer is missing")?;
        match &producer.state {
            crate::job::TaskState::Completed(results) => results.iter().find(|result| result.slot == slot).map(|result| result.entity.clone()).ok_or("job result slot is missing".into()),
            _ => Err("job result is not complete".into()),
        }
    }

    pub(crate) fn job_work_contacts(&self, task: &crate::job::Task) -> Result<Vec<Point>> {
        let source = match task.operation.source_binding() {
            crate::job::EntityBinding::Exact(source) => source.clone(),
            crate::job::EntityBinding::Result { step, slot } => self.resolve_job_result_source(task, step, slot)?,
        };
        let source_entity = self.entity(&source)?;
        let contact_entity = if self.ecs.get::<FiniteResource>(source_entity).is_some() {
            source_entity
        } else {
            let lot = self.ecs.get::<Lot>(source_entity).ok_or("job source is not a material lot")?;
            self.entity(&lot.container)?
        };
        let pose = self.world_pose_entity(contact_entity, 0)?;
        let frame = self.support_id(contact_entity);
        let spacing = self.environment.as_ref().map(|environment| environment.world.cell_spacing_m()).unwrap_or([1.0, 1.0, 1.0]);
        Ok(vec![
            Point { x: pose.x + spacing[0], y: pose.y, z: pose.z, frame: frame.clone() },
            Point { x: pose.x - spacing[0], y: pose.y, z: pose.z, frame: frame.clone() },
            Point { x: pose.x, y: pose.y, z: pose.z + spacing[2], frame: frame.clone() },
            Point { x: pose.x, y: pose.y, z: pose.z - spacing[2], frame },
        ])
    }

    pub(crate) fn rebuild_job_index(&mut self) -> Result<()> {
        let mut ready = BTreeSet::new();
        let job_ids = self.ids.iter().filter_map(|(id, entity)| self.ecs.get::<crate::job::Job>(*entity).map(|_| id.clone())).collect::<Vec<_>>();
        for job_id in job_ids {
            let job_entity = self.entity(&job_id)?;
            let job = self.ecs.get::<crate::job::Job>(job_entity).ok_or("job index references missing component")?.clone();
            if job.state != crate::job::JobState::Active { continue; }
            for task_id in &job.task_ids {
                let task_entity = self.entity(task_id)?;
                let task = self.ecs.get::<crate::job::Task>(task_entity).ok_or("job task is missing")?;
                let dependency_done = if let Some(after) = task.after.as_ref() {
                    job.task_ids.iter().find_map(|candidate_id| self.ids.get(candidate_id).and_then(|entity| self.ecs.get::<crate::job::Task>(*entity)).filter(|candidate| candidate.step == *after)).is_some_and(|candidate| matches!(&candidate.state, crate::job::TaskState::Completed(_)))
                } else { true };
                let result_ready = match task.operation_source() {
                    None => true,
                    Some(crate::job::EntityBinding::Exact(entity)) => self.ids.contains_key(entity),
                    Some(crate::job::EntityBinding::Result { step, slot }) => job.task_ids.iter().find_map(|candidate_id| self.ecs.get::<crate::job::Task>(self.ids.get(candidate_id).copied()?).filter(|candidate| candidate.step == *step)).and_then(|candidate| match &candidate.state { crate::job::TaskState::Completed(results) => results.iter().find(|result| result.slot == *slot).map(|result| self.task_result_matches_operation(&candidate.operation, &result.entity).unwrap_or(false)), _ => None }).unwrap_or(false),
                };
                if task.is_ready(dependency_done, result_ready) { ready.insert(task_id.clone()); }
            }
        }
        self.job_index.ready_tasks = ready;
        Ok(())
    }
    #[cfg(test)]
    pub(crate) fn ready_job_tasks(&mut self) -> Result<Vec<String>> { self.rebuild_job_index()?; Ok(self.job_index.ready_tasks.iter().cloned().collect()) }

    pub(crate) fn restore_job_components(&mut self, jobs: Vec<JobSnapshot>, tasks: Vec<TaskSnapshot>) -> Result<()> {
        if jobs.len() > crate::job::MAX_STEPS.saturating_mul(1024) || tasks.len() > crate::job::MAX_STEPS.saturating_mul(1024) { return Err("job snapshot bound exceeded".into()); }
        if jobs.iter().any(|saved| !valid_id(&saved.id) || !self.ids.contains_key(&saved.id)) || tasks.iter().any(|saved| !valid_id(&saved.id) || !self.ids.contains_key(&saved.id)) { return Err("job snapshot references unknown entity".into()); }
        for saved in jobs { if self.ecs.get::<crate::job::Job>(self.entity(&saved.id)?).is_some() { return Err("duplicate saved job component".into()); } self.ecs.entity_mut(self.entity(&saved.id)?).insert(saved.job); }
        for saved in tasks { if self.ecs.get::<crate::job::Task>(self.entity(&saved.id)?).is_some() { return Err("duplicate saved task component".into()); } self.ecs.entity_mut(self.entity(&saved.id)?).insert(saved.task); }
        self.validate_jobs()?;
        self.rebuild_job_index()?;
        self.refresh_state_weight();
        Ok(())
    }
    pub(crate) fn validate_jobs(&self) -> Result<()> {
        for (job_id, job_entity) in &self.ids {
            let Some(job) = self.ecs.get::<crate::job::Job>(*job_entity) else { continue; };
            if job.version != crate::job::CURRENT_VERSION || !valid_id(&job.definition) || job.definition_version == 0 || job.task_ids.is_empty() || job.task_ids.len() > crate::job::MAX_STEPS { return Err("invalid saved job component".into()); }
            let mut keys = BTreeSet::new();
            let mut steps = BTreeSet::new();
            let job_owner = self.ecs.get::<OwnedByParty>(*job_entity).map(|owned| owned.party.as_str());
            for (index, task_id) in job.task_ids.iter().enumerate() {
                if !valid_id(task_id) || !keys.insert(task_id.clone()) { return Err("saved job task identities are not unique".into()); }
                let task_entity = self.entity(task_id)?;
                let task = self.ecs.get::<crate::job::Task>(task_entity).ok_or("saved job task is missing")?;
                let work = self.ecs.get::<crate::job::JobTaskWork>(task_entity).ok_or("saved job task work is missing")?;
                if !work.seconds.is_finite() || work.seconds < 0.0 || work.seconds > task.operation_work_seconds() { return Err("saved job task work is invalid".into()); }
                if task.version != crate::job::CURRENT_VERSION || task.job != *job_id || !valid_id(&task.step) || !steps.insert(task.step.clone()) { return Err("saved job task relationship is invalid".into()); }
                if self.ecs.get::<OwnedByParty>(task_entity).map(|owned| owned.party.as_str()) != job_owner { return Err("saved job task authority is invalid".into()); }
                if task.after.as_ref().is_some_and(|after| !job.task_ids[..index].iter().any(|candidate_id| self.ids.get(candidate_id).and_then(|entity| self.ecs.get::<crate::job::Task>(*entity)).is_some_and(|candidate| candidate.step == *after))) { return Err("saved job dependency is invalid".into()); }
                task.operation.validate_shape()?;
                if matches!(&task.state, crate::job::TaskState::Pending) && let crate::job::EntityBinding::Exact(source) = task.operation.source_binding() {
                    let source_entity = self.entity(source)?;
                    if !self.task_source_matches_operation(&task.operation, source_entity) { return Err("saved job operation source type or quantity is invalid".into()); }
                }
                if let crate::job::EntityBinding::Result { step, slot } = task.operation.source_binding() {
                    let producer = job.task_ids[..index].iter().find_map(|candidate_id| self.ids.get(candidate_id).and_then(|entity| self.ecs.get::<crate::job::Task>(*entity)).filter(|candidate| candidate.step == *step));
                    let Some(producer) = producer else { return Err("saved job result dependency is invalid".into()); };
                    let (input_kind, input_quantity) = match &task.operation { crate::job::TypedWorkOperation::FiniteToItem { input_kind, input_quantity, .. } | crate::job::TypedWorkOperation::ItemToItems { input_kind, input_quantity, .. } => (input_kind, input_quantity) };
                    let (output_kind, output_quantity) = producer.operation.output();
                    if task.after.as_deref() != Some(step) || producer.operation.result_slot() != slot || output_kind != input_kind || output_quantity < *input_quantity { return Err("saved job result slot is invalid".into()); }
                }
                if let Some(actor) = &task.bound_actor { self.entity(actor)?; }
                if matches!(&task.continuation, crate::job::ContinuationPolicy::AssignedActor(_)) && task.bound_actor.is_none() { return Err("assigned task has no actor".into()); }
                if let crate::job::TaskState::Completed(results) = &task.state {
                    if results.len() != 1 || results[0].slot != task.operation.result_slot() || !valid_id(&results[0].entity) { return Err("saved task result binding is invalid".into()); }
                    for dependent in job.task_ids.iter().filter_map(|candidate_id| self.ids.get(candidate_id).and_then(|entity| self.ecs.get::<crate::job::Task>(*entity))).filter(|candidate| matches!(&candidate.state, crate::job::TaskState::Pending)) {
                        if matches!(dependent.operation.source_binding(), crate::job::EntityBinding::Result { step, slot } if step == &task.step && slot == &results[0].slot) && !self.task_result_matches_operation(&task.operation, &results[0].entity)? { return Err("saved pending dependency has no compatible result lot".into()); }
                    }
                }
            }
            let states = job.task_ids.iter().filter_map(|task_id| self.ids.get(task_id).and_then(|entity| self.ecs.get::<crate::job::Task>(*entity))).map(|task| &task.state).collect::<Vec<_>>();
            if (job.state == crate::job::JobState::Completed && states.iter().any(|state| !matches!(state, crate::job::TaskState::Completed(_)))) || (job.state == crate::job::JobState::Cancelled && states.iter().any(|state| matches!(state, crate::job::TaskState::Pending))) { return Err("saved job state is inconsistent".into()); }
        }
        let listed = self.ids.values().filter_map(|entity| self.ecs.get::<crate::job::Job>(*entity)).flat_map(|job| job.task_ids.iter().cloned()).collect::<BTreeSet<_>>();
        for (id, entity) in &self.ids { if self.ecs.get::<crate::job::Task>(*entity).is_some() && !listed.contains(id) { return Err("saved task is not listed by a job".into()); } }
        Ok(())
    }
    fn task_result_matches_operation(&self, operation: &crate::job::TypedWorkOperation, id: &str) -> Result<bool> {
        let entity = self.entity(id)?;
        let Some(lot) = self.ecs.get::<Lot>(entity) else { return Ok(false); };
        let (kind, quantity) = operation.output();
        if lot.kind != kind || lot.quantity != quantity { return Ok(false); }
        let container = self.entity(&lot.container)?;
        if self.ecs.get::<Container>(container).is_none() { return Ok(false); }
        self.world_pose_entity(container, 0).map(|_| true).or(Ok(false))
    }
    pub(crate) fn task_source_matches_operation(&self, operation: &crate::job::TypedWorkOperation, entity: Entity) -> bool {
        match operation {
            crate::job::TypedWorkOperation::FiniteToItem { input_kind, input_quantity, .. } => self.ecs.get::<FiniteResource>(entity).is_some_and(|source| source.kind == *input_kind && source.quantity >= *input_quantity),
            crate::job::TypedWorkOperation::ItemToItems { input_kind, input_quantity, .. } => self.ecs.get::<Lot>(entity).is_some_and(|source| source.kind == *input_kind && source.quantity >= *input_quantity),
        }
    }
    pub(crate) fn create_job(&mut self, id: String, plan: crate::job::JobPlan, scope: &ActionScope) -> Result<String> {
        crate::job::validate_plan(&id, &plan)?;
        let owner = match scope {
            ActionScope::Party { party } => { self.ecs.get::<Party>(self.entity(party)?).ok_or("job scope is not a party")?; Some(party.clone()) },
            ActionScope::Host => plan.steps.iter().find_map(|step| match step.operation.source_binding() {
                crate::job::EntityBinding::Exact(source) => self.ids.get(source).and_then(|entity| self.ecs.get::<OwnedByParty>(*entity)).map(|owner| owner.party.clone()),
                crate::job::EntityBinding::Result { .. } => None,
            }),
        };
        if self.ids.contains_key(&id) {
            let entity = self.entity(&id)?;
            let existing = self.ecs.get::<crate::job::Job>(entity).ok_or("job identity is already in use")?;
            if existing.definition != plan.definition || existing.definition_version != plan.definition_version || existing.task_ids.len() != plan.steps.len() { return Err("job replay identity conflicts with committed plan".into()); }
            if let ActionScope::Party { party } = scope
                && self.ecs.get::<OwnedByParty>(entity).map(|owned| owned.party.as_str()) != Some(party.as_str())
            {
                return Err("job replay authority conflicts with committed plan".into());
            }
            for (step, task_id) in plan.steps.iter().zip(&existing.task_ids) {
                let task = self.ecs.get::<crate::job::Task>(self.entity(task_id)?).ok_or("job replay task is missing")?;
                if task.step != step.key || task.after != step.after || task.operation != step.operation || task.continuation != step.continuation { return Err("job replay identity conflicts with committed plan".into()); }
            }
            return Ok(id);
        }
        for step in &plan.steps {
            let source = step.operation.source_binding();
            if let crate::job::EntityBinding::Exact(entity) = source {
                let source_entity = self.entity(entity)?;
                if !self.task_source_matches_operation(&step.operation, source_entity) { return Err("job operation target has the wrong type, kind, or quantity".into()); }
                if owner.as_deref().is_some_and(|party| self.ecs.get::<OwnedByParty>(source_entity).is_some_and(|owned| owned.party != party)) { return Err("job operation target is outside scope".into()); }
            }
            if let crate::job::ContinuationPolicy::AssignedActor(actor) = &step.continuation { self.entity(actor)?; }
        }
        let task_ids = plan.steps.iter().map(|step| crate::job::task_id(&id, &step.key)).collect::<Result<Vec<_>>>()?;
        if self.known.contains(&id) || task_ids.iter().any(|task_id| self.known.contains(task_id) || task_id == &id) { return Err("job identity collides with live state".into()); }
        if self.ids.len().saturating_add(task_ids.len()).saturating_add(1) > 16_384 { return Err("job entity capacity exceeded".into()); }
        let projected_job_bytes = serde_json::to_vec(&plan).map_err(|error| error.to_string())?.len().saturating_add((task_ids.len() + 1).saturating_mul(256));
        if self.state_weight.saturating_add(projected_job_bytes) > super::STATE_BYTES { return Err("job state exceeds canonical capacity".into()); }
        let job_entity = self.ecs.spawn((ExternalId(id.clone()), crate::job::Job { version: crate::job::CURRENT_VERSION, definition: plan.definition.clone(), definition_version: plan.definition_version, task_ids: task_ids.clone(), state: crate::job::JobState::Active })).id();
        self.ids.insert(id.clone(), job_entity); self.known.insert(id.clone());
        if let Some(party) = owner.clone() { self.ecs.entity_mut(job_entity).insert(OwnedByParty { party }); }
        for (step, task_id) in plan.steps.into_iter().zip(task_ids.iter()) {
            let task_entity = self.ecs.spawn((ExternalId(task_id.clone()), crate::job::Task { version: crate::job::CURRENT_VERSION, job: id.clone(), step: step.key, after: step.after, operation: step.operation, state: crate::job::TaskState::Pending, continuation: step.continuation.clone(), bound_actor: match step.continuation { crate::job::ContinuationPolicy::AssignedActor(actor) => Some(actor), _ => None } }, crate::job::JobTaskWork { seconds: 0.0 })).id();
            self.ids.insert(task_id.clone(), task_entity); self.known.insert(task_id.clone());
            if let Some(party) = owner.clone() {
                self.ecs.entity_mut(task_entity).insert((OwnedByParty { party: party.clone() }, crate::work_planner::WorkPolicy { party, priority: 0, enabled: true }, crate::work_planner::WorkSchedule { next_review_tick: self.revision, last_considered: self.revision }));
            }
            self.refresh_planner_index(task_id);
        }
        self.rebuild_job_index()?; self.refresh_state_weight(); Ok(id)
    }
    pub(crate) fn resume_job(&mut self, id: &str, plan: crate::job::JobPlan, scope: &ActionScope) -> Result<()> {
        if !self.ids.contains_key(id) {
            self.create_job(id.to_owned(), plan, scope)?;
            return Ok(());
        }
        crate::job::validate_plan(id, &plan)?;
        let job_entity = self.entity(id)?;
        let job = self.ecs.get::<crate::job::Job>(job_entity).cloned().ok_or("job is missing")?;
        if job.definition != plan.definition || job.definition_version != plan.definition_version || job.task_ids.len() != plan.steps.len() { return Err("job replay identity conflicts with committed plan".into()); }
        for (step, task_id) in plan.steps.iter().zip(&job.task_ids) {
            let task = self.ecs.get::<crate::job::Task>(self.entity(task_id)?).ok_or("job replay task is missing")?;
            if task.step != step.key || task.after != step.after || task.operation != step.operation || task.continuation != step.continuation { return Err("job replay identity conflicts with committed plan".into()); }
        }
        if job.state != crate::job::JobState::Cancelled { return Err("only a cancelled job can resume".into()); }
        if let ActionScope::Party { party } = scope
            && self.ecs.get::<OwnedByParty>(job_entity).map(|value| value.party.as_str()) != Some(party.as_str())
        {
            return Err("job scope authority mismatch".into());
        }
        self.ecs.get_mut::<crate::job::Job>(job_entity).ok_or("job is missing")?.state = crate::job::JobState::Active;
        for task_id in job.task_ids {
            let task_entity = self.entity(&task_id)?;
            if let Some(mut task) = self.ecs.get_mut::<crate::job::Task>(task_entity) {
                if matches!(&task.state, crate::job::TaskState::Cancelled) { task.state = crate::job::TaskState::Pending; }
            }
            if let Some(policy) = self.ecs.get::<crate::work_planner::WorkPolicy>(task_entity).cloned() {
                self.ecs.entity_mut(task_entity).insert(crate::work_planner::WorkPolicy { enabled: true, ..policy });
            }
            self.refresh_planner_index(&task_id);
        }
        self.rebuild_job_index()?; self.refresh_state_weight(); Ok(())
    }
    pub(crate) fn cancel_job(&mut self, id: &str) -> Result<()> {
        let job_entity = self.entity(id)?;
        let job = self.ecs.get::<crate::job::Job>(job_entity).ok_or("job is missing")?;
        if job.state == crate::job::JobState::Completed { return Err("completed job cannot be cancelled".into()); }
        if job.state == crate::job::JobState::Cancelled { return Ok(()); }
        let task_ids = job.task_ids.clone();
        for task_id in &task_ids {
            let allocations = self.supply_index().active_ids().filter(|allocation_id| self.supply_allocation(allocation_id).is_some_and(|allocation| allocation.requirement_owner == *task_id)).cloned().collect::<Vec<_>>();
            for allocation_id in allocations { self.cancel_supply_allocation(&allocation_id)?; }
            if let Some(attempt_entity) = self.work_attempts.get(task_id).copied() {
                let attempt = self.ecs.get::<WorkAttempt>(attempt_entity).cloned().ok_or("job attempt is missing")?;
                let sequence = attempt.current_operation().map(|operation| operation.sequence).ok_or("job attempt has no current operation")?;
                if matches!(attempt.phase, AttemptPhase::Executing { .. }) { self.interrupt_work_attempt(task_id.clone(), attempt.key.generation, sequence, InterruptCause::Cancelled)?; }
                if matches!(self.work_attempt(task_id).map(|current| &current.phase), Some(AttemptPhase::Outcome { .. })) {
                    self.acknowledge_work_attempt(task_id.clone(), attempt.key.generation, sequence)?;
                }
            }
        }
        self.ecs.get_mut::<crate::job::Job>(job_entity).ok_or("job is missing")?.state = crate::job::JobState::Cancelled;
        for task_id in task_ids { let task_entity = self.entity(&task_id)?; if let Some(mut task) = self.ecs.get_mut::<crate::job::Task>(task_entity) { if matches!(&task.state, crate::job::TaskState::Pending) { task.state = crate::job::TaskState::Cancelled; } } if let Some(policy) = self.ecs.get::<crate::work_planner::WorkPolicy>(task_entity).cloned() { self.ecs.entity_mut(task_entity).insert(crate::work_planner::WorkPolicy { enabled: false, ..policy }); } self.refresh_planner_index(&task_id); }
        self.rebuild_job_index()?; self.refresh_state_weight(); Ok(())
    }
    pub(crate) fn complete_job_task(&mut self, id: &str, results: Vec<crate::job::TaskResultBinding>) -> Result<()> {
        let task_entity = self.entity(id)?;
        let existing = self.ecs.get::<crate::job::Task>(task_entity).cloned().ok_or("task is missing")?;
        if matches!(&existing.state, crate::job::TaskState::Completed(_)) {
            let mut replay = existing;
            replay.complete(results)?;
            return Ok(());
        }
        let admitted_transform = self.work_attempt(id).is_some_and(|attempt| matches!(
            &attempt.phase,
            AttemptPhase::Executing { activity: crate::work_attempt::ActivityRef::JobTransform { task, .. }, .. } if task == id
        ));
        self.rebuild_job_index()?;
        if !admitted_transform && !self.job_index.ready_tasks.contains(id) { return Err("task dependencies or result bindings are not ready".into()); }
        for result in &results { if !self.task_result_matches_operation(&existing.operation, &result.entity)? { return Err("task result must bind a matching physical lot".into()); } }
        let mut task = existing;
        task.complete(results)?;
        self.ecs.entity_mut(task_entity).insert(task);
        if let Some(policy) = self.ecs.get::<crate::work_planner::WorkPolicy>(task_entity).cloned() {
            self.ecs.entity_mut(task_entity).insert(crate::work_planner::WorkPolicy { enabled: false, ..policy });
        }
        self.refresh_planner_index(id);
        let job_id = self.ecs.get::<crate::job::Task>(task_entity).ok_or("task is missing")?.job.clone();
        let job_entity = self.entity(&job_id)?;
        let all_completed = self.ecs.get::<crate::job::Job>(job_entity).ok_or("job is missing")?.task_ids.iter().all(|task_id| self.ids.get(task_id).and_then(|entity| self.ecs.get::<crate::job::Task>(*entity)).is_some_and(|task| matches!(&task.state, crate::job::TaskState::Completed(_))));
        if all_completed {
            self.ecs.get_mut::<crate::job::Job>(job_entity).ok_or("job is missing")?.state = crate::job::JobState::Completed;
        }
        self.rebuild_job_index()?; self.refresh_state_weight(); Ok(())
    }

}
