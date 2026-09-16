use super::*;
use crate::job::{ContinuationPolicy, EntityBinding, JobPlan, JobState, StepSpec, TaskState, TaskResultBinding, TypedWorkOperation};
use crate::components::{ActionScope, Lot, Position};
use crate::work_planner::WorkPolicy;
use serde_json::json;

fn plan() -> JobPlan {
    JobPlan {
        definition: "finite-transform".into(), definition_version: 1, steps: vec![
            StepSpec {
                key: "prepare".into(), after: None,
                operation: TypedWorkOperation::FiniteToItem {
                    source: EntityBinding::Exact("source".into()), input_kind: "ore".into(), input_quantity: 1,
                    output_kind: "bar".into(), output_quantity: 1, work_seconds: 1.0, result_slot: "bar".into(),
                }, continuation: ContinuationPolicy::AnyEligible,
            },
            StepSpec {
                key: "refine".into(), after: Some("prepare".into()),
                operation: TypedWorkOperation::ItemToItems {
                    source: EntityBinding::Result { step: "prepare".into(), slot: "bar".into() }, input_kind: "bar".into(), input_quantity: 1,
                    output_kind: "plate".into(), output_quantity: 2, work_seconds: 1.0, result_slot: "plates".into(),
                }, continuation: ContinuationPolicy::BindOnFirstProgress,
            },
        ],
    }
}

fn world() -> Kernel {
    let mut kernel = Kernel::new();
    kernel.load(&json!({"format":"hive-game","version":3,"game":"jobs","components":[],"materialCatalog":[],"initial":[
        {"id":"party","components":{"hive.party":{"ownerPlayer":"player"}}},
        {"id":"ground","components":{"hive.container":{"capacity":16},"hive.position":{"x":0.0,"y":0.0,"z":0.0,"facing":0.0}}},
        {"id":"source","components":{"hive.finite-resource":{"kind":"ore","quantity":1},"hive.position":{"x":0.0,"y":0.0,"z":0.0,"facing":0.0}}},
        {"id":"worker","components":{"hive.party-member":{"party":"party"},"hive.body":{"speed":1.0},"hive.position":{"x":0.0,"y":0.0,"z":0.0,"facing":0.0}}}
    ]}).to_string()).unwrap();
    kernel
}

fn add_lot(kernel: &mut Kernel, id: &str, kind: &str) {
    let entity = kernel.ecs.spawn((ExternalId(id.into()), Lot { kind: kind.into(), quantity: 1, container: "ground".into() }, Position { x: 0.0, y: 0.0, z: 0.0, facing: 0.0 })).id();
    kernel.ids.insert(id.into(), entity); kernel.known.insert(id.into()); kernel.refresh_state_weight();
}

#[test]
fn admission_is_atomic_replayable_and_rebuilds_dependency_readiness_after_reload() {
    let mut kernel = world();
    let scope = ActionScope::Party { player: "player".into(), party: "party".into() };
    kernel.create_job("job-1".into(), plan(), &scope).unwrap();
    assert_eq!(kernel.ready_job_tasks().unwrap(), vec!["job-1:task:prepare"]);
    kernel.create_job("job-1".into(), plan(), &scope).unwrap();
    add_lot(&mut kernel, "bar-lot", "bar");
    assert!(kernel.complete_job_task("job-1:task:prepare", vec![TaskResultBinding { slot: "bar".into(), entity: "worker".into() }]).is_err());
    let result = vec![TaskResultBinding { slot: "bar".into(), entity: "bar-lot".into() }];
    kernel.complete_job_task("job-1:task:prepare", result.clone()).unwrap();
    kernel.complete_job_task("job-1:task:prepare", result).unwrap();
    kernel.create_job("job-1".into(), plan(), &scope).unwrap();
    assert_eq!(kernel.ready_job_tasks().unwrap(), vec!["job-1:task:refine"]);
    assert!(!kernel.ecs.get::<WorkPolicy>(kernel.entity("job-1:task:prepare").unwrap()).unwrap().enabled);
    assert!(kernel.ecs.get::<WorkPolicy>(kernel.entity("job-1:task:refine").unwrap()).unwrap().enabled);
    let saved = kernel.snapshot_json().unwrap();
    let mut restored = Kernel::new(); restored.restore_json(&saved).unwrap();
    assert_eq!(restored.ready_job_tasks().unwrap(), vec!["job-1:task:refine"]);
    let task = restored.ecs.get::<crate::job::Task>(restored.entity("job-1:task:prepare").unwrap()).unwrap();
    assert_eq!(task.state, TaskState::Completed(vec![TaskResultBinding { slot: "bar".into(), entity: "bar-lot".into() }]));
}

#[test]
fn cancellation_releases_attempt_and_preserves_completed_matter() {
    let mut kernel = world();
    let scope = ActionScope::Party { player: "player".into(), party: "party".into() };
    kernel.create_job("job-2".into(), plan(), &scope).unwrap();
    add_lot(&mut kernel, "bar-lot", "bar");
    kernel.complete_job_task("job-2:task:prepare", vec![TaskResultBinding { slot: "bar".into(), entity: "bar-lot".into() }]).unwrap();
    kernel.begin_work_attempt("job-2:task:refine".into(), "worker".into(), "party".into(), crate::work_attempt::ActivityRef::Route { destination: Point { x: 1.0, y: 0.0, z: 0.0, frame: None } }).unwrap();
    let job_entity = kernel.entity("job-2").unwrap();
    kernel.cancel_job("job-2").unwrap();
    let job = kernel.ecs.get::<crate::job::Job>(job_entity).unwrap();
    assert_eq!(job.state, JobState::Cancelled);
    assert!(matches!(kernel.ecs.get::<crate::job::Task>(kernel.entity("job-2:task:prepare").unwrap()).unwrap().state, TaskState::Completed(_)));
    assert!(matches!(kernel.ecs.get::<crate::job::Task>(kernel.entity("job-2:task:refine").unwrap()).unwrap().state, TaskState::Cancelled));
    assert!(kernel.work_attempt("job-2:task:refine").is_none(), "job cancellation owns terminal attempt cleanup");
    assert!(!kernel.attempts_by_worker.contains_key("worker"));
}

#[test]
fn invalid_late_plan_does_not_mutate_world() {
    let mut kernel = world();
    let before = kernel.snapshot_json().unwrap();
    let mut invalid = plan();
    invalid.steps[1].operation = TypedWorkOperation::ItemToItems {
        source: EntityBinding::Result { step: "prepare".into(), slot: "bar".into() },
        input_kind: "wrong-kind".into(), input_quantity: 1,
        output_kind: "plate".into(), output_quantity: 2, work_seconds: 1.0, result_slot: "plates".into(),
    };
    assert!(kernel.create_job("job-invalid".into(), invalid, &ActionScope::Party { player: "player".into(), party: "party".into() }).is_err());
    assert_eq!(kernel.snapshot_json().unwrap(), before);
}

#[test]
fn current_snapshot_without_job_arrays_restores_as_an_empty_job_set() {
    let kernel = world();
    let mut saved: serde_json::Value = serde_json::from_str(&kernel.snapshot_json().unwrap()).unwrap();
    let object = saved.as_object_mut().unwrap();
    object.remove("jobs");
    object.remove("tasks");

    let mut restored = Kernel::new();
    restored.restore_json(&saved.to_string()).unwrap();
    assert!(restored.ready_job_tasks().unwrap().is_empty());
}
