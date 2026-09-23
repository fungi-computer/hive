//! Durable job/task plan ownership primitives.
//!
//! This module deliberately contains no scheduler or physical mutation.  It
//! validates a closed serial plan and gives each step a stable task identity;
//! the world transaction will persist the returned records together with the
//! physical result owner in the follow-on integration seam.
use serde::{Deserialize, Serialize};
use bevy_ecs::prelude::Component;
use std::collections::{BTreeMap, BTreeSet};

pub const JOB_VERSION: u8 = 1;
pub const MAX_STEPS: usize = 32;
pub const MAX_PLAN_BYTES: usize = 64 * 1024;

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "kebab-case")]
pub enum JobState { Active, Completed, Cancelled }

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "kebab-case")]
pub enum TaskState { Waiting, Ready, Active, Completed, Cancelled }

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "kebab-case")]
pub enum ContinuationPolicy {
    AnyEligible,
    PreferStarter,
    BindOnFirstProgress,
    AssignedActor,
}

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", tag = "kind", deny_unknown_fields)]
pub enum JobOperation {
    ResourceToItem { source: String, source_kind: String, source_quantity: u32, output_kind: String, output_quantity: u32, work_seconds: f64, result_slot: String },
    ItemToItems { source: ResultBinding, input_kind: String, input_quantity: u32, output_kind: String, output_quantity: u32, work_seconds: f64, result_slot: String },
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct ResultBinding { pub step: String, pub slot: String }

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct StepSpec { pub key: String, pub after: Option<String>, pub operation: JobOperation }

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct JobPlan { pub definition: String, pub definition_version: u32, pub party: String, pub steps: Vec<StepSpec> }

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct TaskResult { pub task: String, pub slot: String, pub entity: String }

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct JobRecord { pub version: u8, pub id: String, pub plan: JobPlan, pub state: JobState, pub tasks: BTreeMap<String, TaskRecord>, pub results: Vec<TaskResult> }

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct TaskRecord { pub id: String, pub job: String, pub key: String, pub operation: JobOperation, pub state: TaskState }

fn valid_id(value: &str) -> bool { !value.is_empty() && value.len() <= 128 && value.bytes().all(|b| b.is_ascii_alphanumeric() || b"._:-".contains(&b)) }

pub fn admit(id: &str, plan: JobPlan) -> Result<JobRecord, String> {
    if !valid_id(id) || !valid_id(&plan.definition) || !valid_id(&plan.party) || plan.definition_version == 0 { return Err("invalid job identity or definition".into()); }
    if plan.steps.is_empty() || plan.steps.len() > MAX_STEPS { return Err("job plan step bound exceeded".into()); }
    let bytes = serde_json::to_vec(&plan).map_err(|e| e.to_string())?;
    if bytes.len() > MAX_PLAN_BYTES { return Err("job plan exceeds byte bound".into()); }
    let keys: BTreeSet<_> = plan.steps.iter().map(|step| step.key.as_str()).collect();
    if keys.len() != plan.steps.len() || keys.iter().any(|key| !valid_id(key)) { return Err("job step keys must be unique and valid".into()); }
    for (index, step) in plan.steps.iter().enumerate() {
        if let Some(after) = &step.after {
            if !valid_id(after) || !plan.steps[..index].iter().any(|prior| prior.key == *after) { return Err("job dependency must point backward".into()); }
        }
        validate_operation(&step.operation, &plan.steps[..index])?;
    }
    let tasks = plan.steps.iter().map(|step| {
        let state = if step.after.is_some() { TaskState::Waiting } else { TaskState::Ready };
        (step.key.clone(), TaskRecord { id: format!("{id}:task:{}", step.key), job: id.into(), key: step.key.clone(), operation: step.operation.clone(), state })
    }).collect();
    Ok(JobRecord { version: JOB_VERSION, id: id.into(), plan, state: JobState::Active, tasks, results: Vec::new() })
}

fn validate_operation(operation: &JobOperation, prior_steps: &[StepSpec]) -> Result<(), String> {
    match operation {
        JobOperation::ResourceToItem { source, source_kind, output_kind, source_quantity, output_quantity, work_seconds, result_slot } => {
            if !valid_id(source) || !valid_id(source_kind) || !valid_id(output_kind) || !valid_id(result_slot) || *source_quantity == 0 || *output_quantity == 0 || !work_seconds.is_finite() || *work_seconds <= 0.0 { return Err("invalid resource transformation".into()); }
        }
        JobOperation::ItemToItems { source, input_kind, output_kind, input_quantity, output_quantity, work_seconds, result_slot } => {
            let Some(StepSpec { operation: JobOperation::ResourceToItem { output_kind, output_quantity, result_slot, .. }, .. }) = prior_steps.iter().find(|step| step.key == source.step) else { return Err("item source must be an earlier resource result".into()); };
            if source.slot != *result_slot || *input_kind != *output_kind || *input_quantity > *output_quantity || !valid_id(&source.step) || !valid_id(&source.slot) || !valid_id(input_kind) || !valid_id(output_kind) || !valid_id(result_slot) || *input_quantity == 0 || *output_quantity == 0 || !work_seconds.is_finite() || *work_seconds <= 0.0 { return Err("invalid item transformation".into()); }
        }
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    fn resource() -> JobOperation { JobOperation::ResourceToItem { source: "resource".into(), source_kind: "standing-material".into(), source_quantity: 1, output_kind: "trunk".into(), output_quantity: 1, work_seconds: 3.0, result_slot: "trunk".into() } }
    #[test] fn stable_task_ids_are_distinct_from_targets() { let record = admit("job-1", JobPlan { definition: "make-logs".into(), definition_version: 1, party: "party".into(), steps: vec![StepSpec { key: "fell".into(), after: None, operation: resource() }] }).unwrap(); assert_eq!(record.tasks["fell"].id, "job-1:task:fell"); assert_ne!(record.tasks["fell"].id, "resource"); }
    #[test] fn rejects_duplicate_forward_and_oversized_plans() { let step = StepSpec { key: "fell".into(), after: None, operation: resource() }; assert!(admit("job", JobPlan { definition: "d".into(), definition_version: 1, party: "p".into(), steps: vec![step.clone(), step.clone()] }).is_err()); let forward = StepSpec { key: "chop".into(), after: Some("fell".into()), operation: JobOperation::ItemToItems { source: ResultBinding { step: "fell".into(), slot: "trunk".into() }, input_kind: "trunk".into(), input_quantity: 1, output_kind: "log".into(), output_quantity: 2, work_seconds: 2.0, result_slot: "logs".into() } }; assert!(admit("job", JobPlan { definition: "d".into(), definition_version: 1, party: "p".into(), steps: vec![forward, step] }).is_err()); }
    #[test] fn dependent_task_waits_until_exact_result_is_published() { let plan = JobPlan { definition: "make-logs".into(), definition_version: 1, party: "party".into(), steps: vec![StepSpec { key: "fell".into(), after: None, operation: resource() }, StepSpec { key: "chop".into(), after: Some("fell".into()), operation: JobOperation::ItemToItems { source: ResultBinding { step: "fell".into(), slot: "trunk".into() }, input_kind: "trunk".into(), input_quantity: 1, output_kind: "log".into(), output_quantity: 2, work_seconds: 2.0, result_slot: "logs".into() } }] }; let record = admit("job", plan).unwrap(); assert_eq!(record.tasks["fell"].state, TaskState::Ready); assert_eq!(record.tasks["chop"].state, TaskState::Waiting); assert!(record.results.is_empty()); }
    #[test] fn record_roundtrips_with_version_and_result_slot_identity() { let record = admit("job", JobPlan { definition: "d".into(), definition_version: 1, party: "p".into(), steps: vec![StepSpec { key: "fell".into(), after: None, operation: resource() }] }).unwrap(); let bytes = serde_json::to_string(&record).unwrap(); assert_eq!(serde_json::from_str::<JobRecord>(&bytes).unwrap(), record); }
}
use bevy_ecs::prelude::Component;
#[derive(Component, Clone, Debug, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct JobComponent {
    pub version: u8,
    pub definition: String,
    pub definition_version: u32,
    pub party: String,
    pub disposition: JobState,
    pub task_ids: Vec<String>,
}

#[derive(Component, Clone, Debug, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct TaskComponent {
    pub version: u8,
    pub job: String,
    pub key: String,
    pub after: Option<String>,
    pub operation: JobOperation,
    pub disposition: TaskState,
    pub continuation: ContinuationPolicy,
    pub bound_actor: Option<String>,
}
