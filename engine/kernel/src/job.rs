//! Durable, closed Job/Task composition.
//!
//! Jobs own player intent and task identity. Tasks own one schedulable typed
//! operation and its exact committed result bindings. Physical operations are
//! deliberately not executed here; their domain owners publish the physical
//! entity and then call `Task::complete` through the kernel boundary.

use bevy_ecs::prelude::Component;
use serde::{Deserialize, Serialize};
use std::collections::{BTreeMap, BTreeSet};

type Result<T> = std::result::Result<T, String>;

pub const CURRENT_VERSION: u8 = 1;
pub const MAX_STEPS: usize = 32;
pub const MAX_PLAN_BYTES: usize = 64 * 1024;

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "kebab-case")]
pub enum JobState { Active, Completed, Cancelled }

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", tag = "kind", content = "results", deny_unknown_fields)]
pub enum TaskState {
    Pending,
    Completed(Vec<TaskResultBinding>),
    Cancelled,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct TaskResultBinding {
    pub slot: String,
    pub entity: String,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "kebab-case", tag = "kind", content = "value", deny_unknown_fields)]
pub enum EntityBinding {
    Exact(String),
    Result { step: String, slot: String },
}

/// The initial closed operation set is enough for a future finite-input to
/// physical-item consumer. It contains no content-specific workflow.
#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", rename_all_fields = "camelCase", tag = "kind", deny_unknown_fields)]
pub enum TypedWorkOperation {
    FiniteToItem {
        source: EntityBinding,
        input_kind: String,
        input_quantity: u32,
        output_kind: String,
        output_quantity: u32,
        work_seconds: f64,
        result_slot: String,
    },
    ItemToItems {
        source: EntityBinding,
        input_kind: String,
        input_quantity: u32,
        output_kind: String,
        output_quantity: u32,
        work_seconds: f64,
        result_slot: String,
    },
}

impl TypedWorkOperation {
    pub fn result_slot(&self) -> &str {
        match self {
            Self::FiniteToItem { result_slot, .. } | Self::ItemToItems { result_slot, .. } => result_slot,
        }
    }

    fn source(&self) -> &EntityBinding {
        match self {
            Self::FiniteToItem { source, .. } | Self::ItemToItems { source, .. } => source,
        }
    }

    pub(crate) fn source_binding(&self) -> &EntityBinding { self.source() }

    pub(crate) fn validate_shape(&self) -> Result<()> {
        let (input_kind, input_quantity, output_kind, output_quantity, work_seconds) = match self {
            Self::FiniteToItem { input_kind, input_quantity, output_kind, output_quantity, work_seconds, .. }
            | Self::ItemToItems { input_kind, input_quantity, output_kind, output_quantity, work_seconds, .. } =>
                (input_kind, input_quantity, output_kind, output_quantity, work_seconds),
        };
        if !valid_id(input_kind) || *input_quantity == 0 || !valid_id(output_kind)
            || *output_quantity == 0 || !work_seconds.is_finite() || *work_seconds <= 0.0
            || *work_seconds > 86_400.0 || !valid_id(self.result_slot())
        {
            return Err("invalid typed work operation".into());
        }
        match self.source() {
            EntityBinding::Exact(entity) if valid_id(entity) => Ok(()),
            EntityBinding::Result { step, slot } if valid_id(step) && valid_id(slot) => Ok(()),
            _ => Err("invalid typed work source binding".into()),
        }
    }

    pub(crate) fn output(&self) -> (&str, u32) {
        match self {
            Self::FiniteToItem { output_kind, output_quantity, .. }
            | Self::ItemToItems { output_kind, output_quantity, .. } => (output_kind, *output_quantity),
        }
    }
}

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct StepSpec {
    pub key: String,
    pub after: Option<String>,
    pub operation: TypedWorkOperation,
    #[serde(default)]
    pub continuation: ContinuationPolicy,
}

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct JobPlan {
    pub definition: String,
    pub definition_version: u32,
    pub steps: Vec<StepSpec>,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "kebab-case")]
pub enum ContinuationPolicy { AnyEligible, PreferStarter, BindOnFirstProgress, AssignedActor(String) }

impl Default for ContinuationPolicy { fn default() -> Self { Self::AnyEligible } }

#[derive(Component, Clone, Debug, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct Job {
    pub version: u8,
    pub definition: String,
    pub definition_version: u32,
    pub task_ids: Vec<String>,
    pub state: JobState,
}

#[derive(Component, Clone, Debug, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct Task {
    pub version: u8,
    pub job: String,
    pub step: String,
    pub after: Option<String>,
    pub operation: TypedWorkOperation,
    pub state: TaskState,
    pub continuation: ContinuationPolicy,
    pub bound_actor: Option<String>,
}

/// Durable earned work for one generic task. It is owned by the Task entity,
/// while the WorkAttempt remains only the temporary worker lease.
#[derive(Component, Clone, Debug, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct JobTaskWork {
    pub seconds: f64,
}

impl Task {
    pub fn operation_work_seconds(&self) -> f64 {
        match &self.operation {
            TypedWorkOperation::FiniteToItem { work_seconds, .. } | TypedWorkOperation::ItemToItems { work_seconds, .. } => *work_seconds,
        }
    }
    pub(crate) fn operation_source(&self) -> Option<&EntityBinding> { Some(self.operation.source_binding()) }

    pub fn is_ready(&self, completed_after: bool, result_ready: bool) -> bool {
        matches!(&self.state, TaskState::Pending)
            && self.after.as_ref().is_none_or(|_| completed_after)
            && result_ready
    }

    pub fn complete(&mut self, results: Vec<TaskResultBinding>) -> Result<()> {
        match &self.state {
            TaskState::Completed(existing) if *existing == results => return Ok(()),
            TaskState::Completed(_) => return Err("task completion replay has different results".into()),
            TaskState::Cancelled => return Err("cancelled task cannot complete".into()),
            TaskState::Pending => {}
        }
        if results.len() != 1 || results[0].slot != self.operation.result_slot()
            || !valid_id(&results[0].entity)
        {
            return Err("task result binding does not match operation".into());
        }
        self.state = TaskState::Completed(results);
        Ok(())
    }

    pub fn bind_first_progress(&mut self, actor: &str) -> Result<()> {
        if !self.admits_actor(actor) { return Err("task is bound to another actor".into()); }
        if matches!(&self.continuation, ContinuationPolicy::BindOnFirstProgress) && self.bound_actor.is_none() {
            if !valid_id(actor) { return Err("invalid bound actor".into()); }
            self.bound_actor = Some(actor.into());
        }
        Ok(())
    }

    pub fn admits_actor(&self, actor: &str) -> bool {
        match &self.continuation {
            ContinuationPolicy::AssignedActor(expected) => expected == actor && self.bound_actor.as_deref() == Some(expected.as_str()),
            ContinuationPolicy::BindOnFirstProgress => self.bound_actor.as_deref().is_none_or(|bound| bound == actor),
            ContinuationPolicy::AnyEligible | ContinuationPolicy::PreferStarter => true,
        }
    }
}

pub fn task_id(job: &str, step: &str) -> Result<String> {
    let id = format!("{job}:task:{step}");
    if valid_id(&id) { Ok(id) } else { Err("derived task identity exceeds limit".into()) }
}

pub fn validate_plan(id: &str, plan: &JobPlan) -> Result<()> {
    if !valid_id(id) || !valid_id(&plan.definition) || plan.definition_version == 0 {
        return Err("invalid job identity or definition".into());
    }
    if plan.steps.is_empty() || plan.steps.len() > MAX_STEPS { return Err("job plan step bound exceeded".into()); }
    if serde_json::to_vec(plan).map_err(|e| e.to_string())?.len() > MAX_PLAN_BYTES { return Err("job plan exceeds byte bound".into()); }
    let mut keys = BTreeSet::new();
    let mut outputs: BTreeMap<&str, (&str, u32)> = BTreeMap::new();
    for (index, step) in plan.steps.iter().enumerate() {
        if !valid_id(&step.key) || !keys.insert(step.key.as_str()) { return Err("job step keys must be unique and valid".into()); }
        if let Some(after) = &step.after {
            if !valid_id(after) || !plan.steps[..index].iter().any(|candidate| candidate.key == *after) { return Err("job dependency must point backward".into()); }
        }
        step.operation.validate_shape()?;
        if let ContinuationPolicy::AssignedActor(actor) = &step.continuation {
            if !valid_id(actor) { return Err("assigned task actor is invalid".into()); }
        }
        if let EntityBinding::Result { step: producer, slot } = step.operation.source() {
            if matches!(&step.operation, TypedWorkOperation::FiniteToItem { .. }) { return Err("finite operation must name an exact source".into()); }
            let Some((kind, quantity)) = outputs.get(producer.as_str()) else { return Err("result binding must name an earlier producer".into()); };
            if step.after.as_deref() != Some(producer.as_str()) { return Err("result binding dependency is missing".into()); }
            let (input_kind, input_quantity) = match &step.operation {
                TypedWorkOperation::FiniteToItem { input_kind, input_quantity, .. }
                | TypedWorkOperation::ItemToItems { input_kind, input_quantity, .. } => (input_kind, input_quantity),
            };
            if !valid_id(slot) || *kind != input_kind || *quantity < *input_quantity {
                return Err("incompatible result binding".into());
            }
        }
        let output = step.operation.output();
        if outputs.insert(step.key.as_str(), output).is_some() { return Err("duplicate step output".into()); }
    }
    Ok(())
}

pub fn valid_id(value: &str) -> bool {
    !value.is_empty() && value.len() <= 128 && value.bytes().all(|byte| byte.is_ascii_alphanumeric() || b"._:-".contains(&byte))
}

#[cfg(test)]
mod tests {
    use super::*;

    fn operation() -> TypedWorkOperation {
        TypedWorkOperation::FiniteToItem { source: EntityBinding::Exact("source".into()), input_kind: "ore".into(), input_quantity: 1, output_kind: "bar".into(), output_quantity: 1, work_seconds: 2.0, result_slot: "bar".into() }
    }
    fn plan() -> JobPlan {
        JobPlan { definition: "smelt".into(), definition_version: 1, steps: vec![StepSpec { key: "melt".into(), after: None, operation: operation(), continuation: ContinuationPolicy::AnyEligible }] }
    }

    #[test]
    fn public_plan_wire_uses_camel_case_for_tagged_operation_fields() {
        let value = serde_json::to_value(plan()).unwrap();
        assert_eq!(value["steps"][0]["operation"]["inputKind"], "ore");
        assert!(value["steps"][0]["operation"].get("input_kind").is_none());
        let decoded: JobPlan = serde_json::from_value(value).unwrap();
        assert_eq!(decoded, plan());
    }

    #[test] fn rejects_duplicate_and_forward_dependencies() {
        let mut invalid = plan();
        invalid.steps.push(StepSpec { key: "melt".into(), after: None, operation: operation(), continuation: ContinuationPolicy::AnyEligible });
        assert!(validate_plan("job", &invalid).is_err());
        invalid.steps[0].after = Some("later".into());
        assert!(validate_plan("job", &invalid).is_err());
    }

    #[test] fn dependency_readiness_requires_committed_result() {
        let task = Task { version: CURRENT_VERSION, job: "job".into(), step: "melt".into(), after: None, operation: operation(), state: TaskState::Pending, continuation: ContinuationPolicy::AnyEligible, bound_actor: None };
        assert!(task.is_ready(false, true));
        assert!(!task.is_ready(false, false));
        let dependent = Task { after: Some("melt".into()), ..task };
        assert!(!dependent.is_ready(false, true));
        assert!(dependent.is_ready(true, true));
    }

    #[test] fn exact_result_binding_is_idempotent_and_rejects_replay_drift() {
        let mut task = Task { version: CURRENT_VERSION, job: "job".into(), step: "melt".into(), after: None, operation: operation(), state: TaskState::Pending, continuation: ContinuationPolicy::AnyEligible, bound_actor: None };
        let result = vec![TaskResultBinding { slot: "bar".into(), entity: "lot.1".into() }];
        task.complete(result.clone()).unwrap();
        task.complete(result).unwrap();
        assert!(task.complete(vec![TaskResultBinding { slot: "bar".into(), entity: "lot.2".into() }]).is_err());
    }

    #[test] fn cancellation_preserves_completed_task_and_releases_future_intent() {
        let mut completed = Task { version: CURRENT_VERSION, job: "job".into(), step: "melt".into(), after: None, operation: operation(), state: TaskState::Pending, continuation: ContinuationPolicy::AnyEligible, bound_actor: None };
        completed.complete(vec![TaskResultBinding { slot: "bar".into(), entity: "lot.1".into() }]).unwrap();
        let pending = Task { state: TaskState::Pending, ..completed.clone() };
        assert!(matches!(completed.state, TaskState::Completed(_)));
        assert!(matches!(pending.state, TaskState::Pending));
    }

    #[test] fn bind_on_first_progress_rejects_a_different_actor() {
        let mut task = Task { version: CURRENT_VERSION, job: "job".into(), step: "melt".into(), after: None, operation: operation(), state: TaskState::Pending, continuation: ContinuationPolicy::BindOnFirstProgress, bound_actor: None };
        task.bind_first_progress("worker-a").unwrap();
        assert!(!task.admits_actor("worker-b"));
        assert!(task.bind_first_progress("worker-b").is_err());
    }
}
