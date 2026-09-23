#[cfg(test)]
#[path = "fuel_emission_tests.rs"]
mod fuel_emission_tests;
#[path = "fuel_emission.rs"]
mod fuel_emission;
#[path = "environment_runtime.rs"]
mod environment_runtime;
use crate::{collision, combat, components::*, navigation, registry::Registry};
use crate::staged_process::{ProcessPhase, StagedProcess, StageMode};
use crate::work_attempt::WorkBlockReason;
#[path = "material_output.rs"]
mod material_output;
#[path = "material_consumption.rs"]
mod material_consumption;
#[path = "excavation_work.rs"]
mod excavation_work;
#[path = "initial_placement.rs"]
mod initial_placement;
#[path = "authored_entities.rs"]
mod authored_entities;
#[path = "relation_mutation.rs"]
mod relation_mutation;
#[path = "access_roles.rs"]
mod access_roles;
#[path = "structure_contact.rs"]
mod structure_contact;
#[path = "interaction_contact.rs"]
mod interaction_contact;
#[path = "surface_contacts.rs"]
mod surface_contacts;
#[cfg(test)]
#[path = "aperture_tests.rs"]
mod aperture_tests;
#[path = "construction_work.rs"]
mod construction_work;
#[path = "deconstruction_work.rs"]
mod deconstruction_work;
#[path = "native_work_planner.rs"]
pub(crate) mod native_work_planner;
#[path = "native_work_outcomes.rs"]
mod native_work_outcomes;
#[path = "state_accounting.rs"]
mod state_accounting;
#[path = "world_records.rs"]
mod world_records;
pub(crate) use world_records::JournalToken;
#[path = "resource_work.rs"]
mod resource_work;
#[path = "job_owner.rs"]
mod job_owner;
#[path = "job_transform.rs"]
mod job_transform;
#[path = "supply_admission.rs"]
mod supply_admission;
#[path = "supply_delivery.rs"]
mod supply_delivery;
#[path = "manual_work.rs"]
mod manual_work;
#[path = "stockpile_work.rs"]
mod stockpile_work;
#[path = "route_query.rs"]
pub(crate) mod route_query;
#[path = "process_transition.rs"]
mod process_transition;
#[cfg(test)]
#[path = "process_transition_tests.rs"]
mod process_transition_tests;
#[cfg(test)]
#[path = "terrain_movement_tests.rs"]
mod terrain_movement_tests;
use material_output::{MaterialOutputSpec, PreparedMaterialOutput};
use material_consumption::{MaterialPortion, PreparedConsumption, ConsumedMaterial};
use bevy_ecs::{
    prelude::{Entity, World},
    query::{QueryBuilder, QueryState},
};
use serde::Serialize;
use serde_json::json;
use std::collections::{BTreeMap, BTreeSet, VecDeque};
use std::sync::Arc;
use crate::terrain_water::WaterExchangeDirection;
use crate::work_attempt::{AttemptKey, AttemptPhase, InterruptCause, WorkAttempt, WorkOutcome, OperationKey};
use crate::work_planner::PlannerState;
use crate::work_candidates::NativeIndexes;
use crate::relations::RelationIndex;
#[cfg(test)]
#[path = "party_tests.rs"]
mod party_tests;
#[path = "lifecycle.rs"]
mod lifecycle;
#[cfg(test)]
#[path = "job_tests.rs"]
mod job_tests;

enum PreparedProcessBindings {
    Waiting,
    Ready(Vec<crate::staged_process::ProcessBinding>),
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub(crate) enum TransferContactError {
    Sealed,
    UnavailableFrame,
    NoContact,
    Internal(String),
}

impl From<String> for TransferContactError {
    fn from(reason: String) -> Self {
        match reason.as_str() {
            "sealed" => Self::Sealed,
            "unavailable-frame" => Self::UnavailableFrame,
            "no-contact" => Self::NoContact,
            _ => Self::Internal(reason),
        }
    }
}

impl From<&str> for TransferContactError {
    fn from(reason: &str) -> Self { Self::from(reason.to_owned()) }
}

impl TransferContactError {
    fn reason(&self) -> Option<&str> {
        match self {
            Self::Sealed => Some("sealed"),
            Self::UnavailableFrame => Some("unavailable-frame"),
            Self::NoContact => Some("no-contact"),
            Self::Internal(_) => None,
        }
    }
    fn into_result<T>(self) -> Result<T> {
        match self {
            Self::Sealed => Err("sealed".into()),
            Self::UnavailableFrame => Err("unavailable-frame".into()),
            Self::NoContact => Err("no-contact".into()),
            Self::Internal(reason) => Err(reason),
        }
    }

    pub(crate) fn into_string(self) -> String {
        match self {
            Self::Sealed => "sealed".into(),
            Self::UnavailableFrame => "unavailable-frame".into(),
            Self::NoContact => "no-contact".into(),
            Self::Internal(reason) => reason,
        }
    }
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct ImpactEvent {
    id: String,
    sequence: u64,
    projectile_id: String,
    source_id: String,
    target_id: String,
    time: f64,
    point: Vector3,
    normal: Vector3,
    velocity: Vector3,
}

#[cfg(test)]
mod native_planner_snapshot_tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn every_work_policy_keeps_one_valid_execution_even_while_disabled() {
        let scene = |task: serde_json::Value| json!({
            "format":"hive-game", "version":3, "game":"planner", "components":[], "materialCatalog":[],
            "initial":[
                {"id":"party","components":{"hive.party":{},"hive.owned-by":{"player":"player"}}},
                task,
            ],
        });
        let mut missing = Kernel::new();
        assert_eq!(missing.load(&scene(json!({"id":"task","components":{"hive.work-policy":{"pool":"party","priority":0,"enabled":false}}})).to_string()).unwrap_err(), "work policy task has no work execution");

        let mut foreign_player = Kernel::new();
        assert_eq!(foreign_player.load(&scene(json!({"id":"task","components":{
            "hive.work-policy":{"pool":"party","priority":0,"enabled":true},
            "hive.work-execution":{"pool":"party","initiatingPlayer":"other-player","policyId":"job"}
        }})).to_string()).unwrap_err(), "work execution player does not own pool for task");
    }

    #[test]
    fn planner_cursor_roundtrips_and_invalid_width_is_rejected() {
        let mut kernel = Kernel::new();
        kernel.load(&json!({"format":"hive-game","version":3,"game":"planner","components":[],"materialCatalog":[],"initial":[
            {"id":"party","components":{"hive.party":{},"hive.owned-by":{"player":"player"}}},
            {"id":"worker","components":{"hive.party-member":{"party":"party"},"hive.position":{"x":0.0,"y":0.0,"z":0.0,"facing":0.0},"hive.body":{"speed":1.0},"hive.traversal":{"clearanceCells":1,"maxStepCells":1},"hive.work-participation":{"automatic":true}}},
            {"id":"task","components":{"hive.work-policy":{"pool":"party","priority":3,"enabled":true},"hive.work-execution":{"pool":"party","initiatingPlayer":null,"policyId":"job"},"hive.work-schedule":{"nextReviewTick":0,"lastConsidered":0}}}
        ]}).to_string()).unwrap();
        let worker_record: serde_json::Value = serde_json::from_str(&kernel.query_json("[\"hive.work-participation\"]").unwrap()).unwrap();
        let task_records: serde_json::Value = serde_json::from_str(&kernel.query_json("[\"hive.work-policy\",\"hive.work-schedule\"]").unwrap()).unwrap();
        assert_eq!(worker_record[0]["id"], "worker");
        assert_eq!(worker_record[0]["components"]["hive.work-participation"]["automatic"], true);
        assert_eq!(task_records[0]["id"], "task");
        assert_eq!(task_records[0]["components"]["hive.work-policy"]["priority"], 3);
        assert_eq!(task_records[0]["components"]["hive.work-schedule"]["nextReviewTick"], 0);
        assert_eq!(kernel.next_native_planning_window(0).workers.iter().map(|worker| worker.id.as_str()).collect::<Vec<_>>(), vec!["worker"]);
        assert_eq!(kernel.next_native_planning_window(0).tasks.iter().map(|task| task.id.as_str()).collect::<Vec<_>>(), vec!["task"]);
        let rebuilds = kernel.planner_index_rebuilds();
        kernel.advance_json(&json!({"delta":0,"writes":[{"entity":"worker","component":"hive.work-participation","value":{"automatic":false}}],"actions":[]}).to_string()).unwrap();
        assert!(kernel.next_native_planning_window(0).workers.is_empty());
        kernel.advance_json(&json!({"delta":0,"writes":[{"entity":"worker","component":"hive.work-participation","value":{"automatic":true}}],"actions":[]}).to_string()).unwrap();
        assert_eq!(kernel.next_native_planning_window(0).workers.len(), 1);
        assert_eq!(kernel.planner_index_rebuilds(), rebuilds);
        kernel.planner.party_cursor = 17;
        kernel.planner.task_cursor = 29;
        kernel.planner.review_tick = 41;
        let saved = kernel.snapshot_json().unwrap();
        let mut restored = Kernel::new();
        restored.restore_json(&saved).unwrap();
        assert_eq!(restored.planner, kernel.planner);
        let mut invalid: serde_json::Value = serde_json::from_str(&saved).unwrap();
        invalid["planner"]["reviewTick"] = json!(u64::MAX);
        assert_eq!(Kernel::new().restore_json(&invalid.to_string()).unwrap_err(), "planner tick overflow");
    }
}

#[cfg(test)]
mod work_attempt_laws {
    use super::*;
    use serde_json::{json, Value};

    fn world() -> Kernel {
        let mut kernel = Kernel::new();
        kernel.load(&json!({"format":"hive-game","version":3,"game":"attempts","components":[
            {"id":"game.task-state","version":1,"fields":{"phase":"string"}}
        ],"materialCatalog":[], "initial":[
            {"id":"task","components":{"hive.owned-by-party":{"party":"party"},"hive.work-execution":{"pool":"party","initiatingPlayer":null,"policyId":"test"},"game.task-state":{"phase":"queued"}}},{"id":"task2","components":{"hive.owned-by-party":{"party":"party"},"hive.work-execution":{"pool":"party","initiatingPlayer":null,"policyId":"test"}}},{"id":"worker","components":{"hive.party-member":{"party":"party"},"hive.body":{"speed":1.0},"hive.position":{"x":0.0,"y":0.0,"z":0.0,"facing":0.0}}},{"id":"party","components":{"hive.party":{},"hive.owned-by":{"player":"player"}}}
        ]}).to_string()).unwrap();
        kernel
    }

    #[test]
    fn invalid_attempt_transition_rolls_back_its_authored_task_transition() {
        let mut kernel = world();
        let before = kernel.snapshot_json().unwrap();
        let result = kernel.advance_json(&json!({
            "delta": 0,
            "writes": [{"component":"game.task-state","entity":"task","value":{"phase":"cancelled"}}],
            "actions": [{"scope":{"kind":"host"},"request":{
                "kind":"acknowledge-work-attempt","task":"task","generation":1,"sequence":1
            }}]
        }).to_string());
        assert_eq!(result.unwrap_err(), "work attempt is not current");
        assert_eq!(kernel.snapshot_json().unwrap(), before);
    }

    #[test]
    fn begin_rejects_a_task_owned_by_another_party() {
        let mut kernel = world();
        kernel.load(&json!({"format":"hive-game","version":3,"game":"attempts","components":[],"materialCatalog":[],"initial":[
            {"id":"task","components":{"hive.owned-by-party":{"party":"other"},"hive.work-execution":{"pool":"party","initiatingPlayer":null,"policyId":"test"}}},
            {"id":"worker","components":{"hive.party-member":{"party":"party"},"hive.body":{"speed":1.0},"hive.position":{"x":0.0,"y":0.0,"z":0.0,"facing":0.0}}},
            {"id":"party","components":{"hive.party":{},"hive.owned-by":{"player":"player"}}},
            {"id":"other","components":{"hive.party":{},"hive.owned-by":{"player":"other-player"}}}
        ]}).to_string()).unwrap();
        let result = kernel.advance_json(&json!({"delta":0,"writes":[],"actions":[{"scope":{"kind":"host"},"request":{"kind":"begin-work-attempt","task":"task","worker":"worker","operation":{"kind":"route","destination":{"x":1.0,"y":0.0,"z":0.0,"frame":null}}}}]}).to_string());
        assert_eq!(result.unwrap_err(), "work attempt task is outside pool");
        assert_eq!(kernel.work_attempts_json("[\"task\"]").unwrap(), "[]");
        assert_eq!(kernel.query_json("[\"hive.destination\"]").unwrap(), "[]");
    }

    #[test]
    fn begin_allows_a_party_worker_to_claim_an_unowned_world_task() {
        let mut kernel = world();
        let mut unowned: Snapshot = serde_json::from_str(&kernel.snapshot_json().unwrap()).unwrap();
        unowned.scene.initial.iter_mut().find(|record| record.id == "task").unwrap().components.remove("hive.owned-by-party");
        kernel.restore_json(&serde_json::to_string(&unowned).unwrap()).unwrap();
        let result: Value = serde_json::from_str(&kernel.advance_json(&json!({"delta":0,"writes":[],"actions":[{"scope":{"kind":"player","player":"player"},"request":{"kind":"begin-work-attempt","task":"task","worker":"worker","operation":{"kind":"route","destination":{"x":1.0,"y":0.0,"z":0.0,"frame":null}}}}]}).to_string()).unwrap()).unwrap();
        assert_eq!(result["results"][0]["accepted"], true, "{result}");
        assert_eq!(kernel.work_attempts_json("[\"task\"]").unwrap().contains("worker"), true);
    }

    #[test]
    fn exact_attempt_survives_restore_and_stale_key_cannot_touch_new_attempt() {
        let mut kernel = world();
        let begin = kernel.advance_json(&json!({"delta":0,"writes":[],"actions":[{"scope":{"kind":"host"},"request":{"kind":"begin-work-attempt","task":"task","worker":"worker","operation":{"kind":"route","destination":{"x":1.0,"y":0.0,"z":0.0,"frame":null}}}}]}).to_string()).unwrap();
        let saved = kernel.snapshot_json().unwrap();
        let mut restored = Kernel::new();
        restored.restore_json(&saved).unwrap();
        assert_eq!(restored.work_attempts_json("[\"task\"]").unwrap(), kernel.work_attempts_json("[\"task\"]").unwrap());
        let key = serde_json::from_str::<Value>(&begin).unwrap()["results"][0]["attempt"].clone();
        restored.advance_json(&json!({"delta":1,"writes":[],"actions":[]}).to_string()).unwrap();
        let retained: Value = serde_json::from_str(&restored.work_attempts_json("[\"task\"]").unwrap()).unwrap();
        assert_eq!(retained[0]["phase"]["kind"], "outcome");
        assert_eq!(restored.attempts_by_worker.get("worker").map(|key| key.task.as_str()), Some("task"));
        restored.advance_json(&json!({"delta":0,"writes":[],"actions":[{"scope":{"kind":"host"},"request":{"kind":"acknowledge-work-attempt","task":"task","generation":key["generation"],"sequence":1}}]}).to_string()).unwrap();
        let reassigned: Value = serde_json::from_str(&restored.advance_json(&json!({"delta":0,"writes":[],"actions":[{"scope":{"kind":"host"},"request":{"kind":"begin-work-attempt","task":"task2","worker":"worker","operation":{"kind":"route","destination":{"x":2.0,"y":0.0,"z":0.0,"frame":null}}}}]}).to_string()).unwrap()).unwrap();
        assert_eq!(reassigned["results"][0]["accepted"], true);
        let task2_key = reassigned["results"][0]["attempt"]["generation"].as_u64().unwrap();
        restored.advance_json(&json!({"delta":0,"writes":[],"actions":[{"scope":{"kind":"host"},"request":{"kind":"interrupt-work-attempt","task":"task2","generation":task2_key,"sequence":1,"cause":"cancelled"}}]}).to_string()).unwrap();
        let replacement = restored.advance_json(&json!({"delta":0,"writes":[],"actions":[{"scope":{"kind":"host"},"request":{"kind":"begin-work-attempt","task":"task","worker":"worker","operation":{"kind":"route","destination":{"x":2.0,"y":0.0,"z":0.0,"frame":null}}}}]}).to_string()).unwrap();
        let new_generation = serde_json::from_str::<Value>(&replacement).unwrap()["results"][0]["attempt"]["generation"].as_u64().unwrap();
        assert!(new_generation > key["generation"].as_u64().unwrap());
        assert!(restored.advance_json(&json!({"delta":0,"writes":[],"actions":[{"scope":{"kind":"host"},"request":{"kind":"interrupt-work-attempt","task":"task","generation":key["generation"],"sequence":1,"cause":"cancelled"}}]}).to_string()).is_err());
        assert!(restored.advance_json(&json!({"delta":0,"writes":[],"actions":[{"scope":{"kind":"host"},"request":{"kind":"acknowledge-work-attempt","task":"task","generation":key["generation"],"sequence":1}}]}).to_string()).is_err());
        assert_eq!(restored.work_attempts_json("[\"task\"]").unwrap().contains(&new_generation.to_string()), true);
    }

    #[test]
    fn restore_accepts_unowned_world_tasks_but_rejects_foreign_tasks_and_invalid_frames() {
        let mut kernel = world();
        kernel.advance_json(&json!({"delta":0,"writes":[],"actions":[{"scope":{"kind":"host"},"request":{"kind":"begin-work-attempt","task":"task","worker":"worker","operation":{"kind":"route","destination":{"x":1.0,"y":0.0,"z":0.0,"frame":null}}}}]}).to_string()).unwrap();

        let mut unowned: Snapshot = serde_json::from_str(&kernel.snapshot_json().unwrap()).unwrap();
        unowned.scene.initial.iter_mut().find(|record| record.id == "task").unwrap().components.remove("hive.owned-by-party");
        Kernel::new().restore_json(&serde_json::to_string(&unowned).unwrap()).unwrap();

        let mut foreign: Value = serde_json::from_str(&kernel.snapshot_json().unwrap()).unwrap();
        foreign["scene"]["initial"].as_array_mut().unwrap().push(json!({"id":"other","components":{"hive.party":{},"hive.owned-by":{"player":"other"}}}));
        foreign["scene"]["initial"].as_array_mut().unwrap().iter_mut().find(|record| record["id"] == "task").unwrap()["components"]["hive.owned-by-party"] = json!({"party":"other"});
        assert_eq!(Kernel::new().restore_json(&serde_json::to_string(&foreign).unwrap()).unwrap_err(), "work attempt reference is outside party");

        let mut missing_frame: Snapshot = serde_json::from_str(&kernel.snapshot_json().unwrap()).unwrap();
        let AttemptPhase::Executing { activity: crate::work_attempt::ActivityRef::Route { destination }, .. } = &mut missing_frame.work_attempts[0].phase else { panic!("expected route attempt") };
        destination.frame = Some("missing-frame".into());
        assert_eq!(Kernel::new().restore_json(&serde_json::to_string(&missing_frame).unwrap()).unwrap_err(), "unknown entity missing-frame");
    }

    #[test]
    fn interrupt_clears_owned_route_and_releases_worker_without_ack() {
        let mut kernel = world();
        let begin: Value = serde_json::from_str(&kernel.advance_json(&json!({"delta":0,"writes":[],"actions":[{"scope":{"kind":"host"},"request":{"kind":"begin-work-attempt","task":"task","worker":"worker","operation":{"kind":"route","destination":{"x":10.0,"y":0.0,"z":0.0,"frame":null}}}}]}).to_string()).unwrap()).unwrap();
        let key = &begin["results"][0]["attempt"];
        let interrupted: Value = serde_json::from_str(&kernel.advance_json(&json!({"delta":0,"writes":[],"actions":[{"scope":{"kind":"host"},"request":{"kind":"interrupt-work-attempt","task":"task","generation":key["generation"],"sequence":1,"cause":"cancelled"}}]}).to_string()).unwrap()).unwrap();
        assert_eq!(interrupted["results"][0]["accepted"], true);
        let position: Value = serde_json::from_str(&kernel.query_json("[\"hive.position\"]").unwrap()).unwrap();
        assert_eq!(position[0]["components"]["hive.position"]["x"], 0.0);
        assert!(kernel.query_json("[\"hive.destination\"]").unwrap().contains("[]"));
        kernel.advance_json(&json!({"delta":1,"writes":[],"actions":[]}).to_string()).unwrap();
        let after: Value = serde_json::from_str(&kernel.query_json("[\"hive.position\"]").unwrap()).unwrap();
        assert_eq!(after[0]["components"]["hive.position"]["x"], 0.0);
        let next: Value = serde_json::from_str(&kernel.advance_json(&json!({"delta":0,"writes":[],"actions":[{"scope":{"kind":"host"},"request":{"kind":"begin-work-attempt","task":"task2","worker":"worker","operation":{"kind":"route","destination":{"x":1.0,"y":0.0,"z":0.0,"frame":null}}}}]}).to_string()).unwrap()).unwrap();
        assert_eq!(next["results"][0]["accepted"], true);
    }

    #[test]
    fn acknowledging_old_outcome_cannot_erase_new_worker_attempt_index() {
        let mut kernel = world();
        let first: Value = serde_json::from_str(&kernel.advance_json(&json!({"delta":0,"writes":[],"actions":[{"scope":{"kind":"host"},"request":{"kind":"begin-work-attempt","task":"task","worker":"worker","operation":{"kind":"route","destination":{"x":1.0,"y":0.0,"z":0.0,"frame":null}}}}]}).to_string()).unwrap()).unwrap();
        let first_key = first["results"][0]["attempt"].clone();
        kernel.advance_json(&json!({"delta":0,"writes":[],"actions":[{"scope":{"kind":"host"},"request":{"kind":"interrupt-work-attempt","task":"task","generation":first_key["generation"],"sequence":1,"cause":"cancelled"}}]}).to_string()).unwrap();
        let second: Value = serde_json::from_str(&kernel.advance_json(&json!({"delta":0,"writes":[],"actions":[{"scope":{"kind":"host"},"request":{"kind":"begin-work-attempt","task":"task2","worker":"worker","operation":{"kind":"route","destination":{"x":2.0,"y":0.0,"z":0.0,"frame":null}}}}]}).to_string()).unwrap()).unwrap();
        assert_eq!(second["results"][0]["accepted"], true);
        kernel.advance_json(&json!({"delta":0,"writes":[],"actions":[{"scope":{"kind":"host"},"request":{"kind":"acknowledge-work-attempt","task":"task","generation":first_key["generation"],"sequence":1}}]}).to_string()).unwrap();
        assert_eq!(kernel.attempts_by_worker.get("worker").map(|key| key.task.as_str()), Some("task2"));
        assert!(kernel.advance_json(&json!({"delta":0,"writes":[],"actions":[{"scope":{"kind":"host"},"request":{"kind":"begin-work-attempt","task":"task","worker":"worker","operation":{"kind":"route","destination":{"x":3.0,"y":0.0,"z":0.0,"frame":null}}}}]}).to_string()).is_err());
    }

    fn material_kernel(destination_capacity: u32, destination_x: f64, quantity: u32) -> (Kernel, u64) {
        let mut kernel = Kernel::new();
        kernel.load(&json!({"format":"hive-game","version":3,"game":"attempts","components":[],"materialCatalog":[],"initial":[
            {"id":"task","components":{"hive.owned-by-party":{"party":"party"},"hive.work-execution":{"pool":"party","initiatingPlayer":null,"policyId":"test"}}},
            {"id":"worker","components":{"hive.party-member":{"party":"party"},"hive.body":{"speed":1.0},"hive.position":{"x":0.0,"y":0.0,"z":0.0,"facing":0.0},"hive.container":{"capacity":8}}},
            {"id":"party","components":{"hive.party":{},"hive.owned-by":{"player":"player"}}},
            {"id":"destination","components":{"hive.owned-by-party":{"party":"party"},"hive.container":{"capacity":destination_capacity},"hive.position":{"x":destination_x,"y":0.0,"z":0.0,"facing":0.0}}},
            {"id":"lot","components":{"hive.owned-by-party":{"party":"party"},"hive.lot":{"kind":"wood","quantity":quantity,"container":"worker"}}}
        ]}).to_string()).unwrap();
        let begin: Value = serde_json::from_str(&kernel.advance_json(&json!({"delta":0,"writes":[],"actions":[{"scope":{"kind":"host"},"request":{"kind":"begin-work-attempt","task":"task","worker":"worker","operation":{"kind":"route","destination":{"x":0.0,"y":0.0,"z":0.0,"frame":null}}}}]}).to_string()).unwrap()).unwrap();
        let generation = begin["results"][0]["attempt"]["generation"].as_u64().unwrap();
        kernel.advance_json(&json!({"delta":1,"writes":[],"actions":[]}).to_string()).unwrap();
        (kernel, generation)
    }

    #[test]
    fn material_transfer_blocks_without_mutating_cargo_for_typed_availability_failures() {
        for (capacity, destination_x, quantity, requested, reason) in [(0_u32, 0.0, 2_u32, 2_u32, "capacityUnavailable"), (8, 0.0, 1, 2, "missingInputs"), (8, 99.0, 2, 1, "accessLost"), (8, 0.0, 0, 0, "invalid")] {
            let (mut kernel, generation) = material_kernel(capacity, destination_x, quantity);
            let before = kernel.ecs.get::<Lot>(kernel.entity("lot").unwrap()).unwrap().clone();
            let result = kernel.advance_json(&json!({"delta":0,"writes":[],"actions":[{"scope":{"kind":"host"},"request":{"kind":"continue-work-attempt","task":"task","generation":generation,"sequence":1,"nextActivity":{"kind":"material-transfer","lot":"lot","from":"worker","to":"destination","quantity":requested}}}]}).to_string());
            if reason == "invalid" { assert_eq!(result.unwrap_err(), "invalid material transfer quantity"); }
            else {
                let value: Value = serde_json::from_str(&result.unwrap()).unwrap();
                assert_eq!(value["results"][0]["accepted"], true, "{value}");
                assert!(kernel.work_attempts_json("[\"task\"]").unwrap().contains(reason), "reason={reason} attempt={}", kernel.work_attempts_json("[\"task\"]").unwrap());
            }
            assert_eq!(kernel.ecs.get::<Lot>(kernel.entity("lot").unwrap()).unwrap().container, before.container);
            assert_eq!(kernel.ecs.get::<Lot>(kernel.entity("lot").unwrap()).unwrap().quantity, before.quantity);
        }
    }

    #[test]
    fn material_transfer_continuation_is_party_owned_and_exactly_once() {
        let mut kernel = Kernel::new();
        kernel.load(&json!({"format":"hive-game","version":3,"game":"attempts","components":[],"materialCatalog":[],"initial":[
            {"id":"task","components":{"hive.owned-by-party":{"party":"party"},"hive.work-execution":{"pool":"party","initiatingPlayer":null,"policyId":"test"}}},
            {"id":"worker","components":{"hive.party-member":{"party":"party"},"hive.body":{"speed":1.0},"hive.position":{"x":0.0,"y":0.0,"z":0.0,"facing":0.0},"hive.container":{"capacity":8}}},
            {"id":"party","components":{"hive.party":{},"hive.owned-by":{"player":"player"}}},
            {"id":"source","components":{"hive.owned-by-party":{"party":"party"},"hive.container":{"capacity":8},"hive.position":{"x":0.0,"y":0.0,"z":0.0,"facing":0.0}}},
            {"id":"destination","components":{"hive.owned-by-party":{"party":"party"},"hive.container":{"capacity":8},"hive.position":{"x":0.0,"y":0.0,"z":0.0,"facing":0.0}}},
            {"id":"lot","components":{"hive.owned-by-party":{"party":"party"},"hive.lot":{"kind":"wood","quantity":2,"container":"worker"}}}
        ]}).to_string()).unwrap();
        let begin: Value = serde_json::from_str(&kernel.advance_json(&json!({"delta":0,"writes":[],"actions":[{"scope":{"kind":"host"},"request":{"kind":"begin-work-attempt","task":"task","worker":"worker","operation":{"kind":"route","destination":{"x":0.0,"y":0.0,"z":0.0,"frame":null}}}}]}).to_string()).unwrap()).unwrap();
        let generation = begin["results"][0]["attempt"]["generation"].as_u64().unwrap();
        kernel.advance_json(&json!({"delta":1,"writes":[],"actions":[]}).to_string()).unwrap();
        let transfer = kernel.advance_json(&json!({"delta":0,"writes":[],"actions":[{"scope":{"kind":"host"},"request":{"kind":"continue-work-attempt","task":"task","generation":generation,"sequence":1,"nextActivity":{"kind":"material-transfer","lot":"lot","from":"worker","to":"destination","quantity":1}}}]}).to_string()).unwrap();
        assert!(serde_json::from_str::<Value>(&transfer).unwrap()["results"][0]["accepted"].as_bool().unwrap(), "{transfer}");
        assert_eq!(kernel.ecs.get::<Lot>(kernel.entity("lot").unwrap()).unwrap().container, "destination");
        assert!(kernel.advance_json(&json!({"delta":0,"writes":[],"actions":[{"scope":{"kind":"host"},"request":{"kind":"continue-work-attempt","task":"task","generation":generation,"sequence":1,"nextActivity":{"kind":"material-transfer","lot":"lot","from":"worker","to":"destination","quantity":1}}}]}).to_string()).is_err());
    }

    #[test]
    fn player_owned_lot_split_preserves_both_owners_through_restore_and_rejects_foreign_player() {
        let mut kernel = Kernel::new();
        kernel.load(&json!({"format":"hive-game","version":3,"game":"attempts","components":[],"materialCatalog":[],"initial":[
            {"id":"task","components":{"hive.owned-by-party":{"party":"party"},"hive.work-execution":{"pool":"party","initiatingPlayer":null,"policyId":"test"}}},
            {"id":"worker","components":{"hive.party-member":{"party":"party"},"hive.body":{"speed":1.0},"hive.position":{"x":0.0,"y":0.0,"z":0.0,"facing":0.0},"hive.container":{"capacity":8}}},
            {"id":"party","components":{"hive.party":{},"hive.owned-by":{"player":"player"}}},
            {"id":"other-party","components":{"hive.party":{},"hive.owned-by":{"player":"other-player"}}},
            {"id":"destination","components":{"hive.owned-by-party":{"party":"party"},"hive.container":{"capacity":8},"hive.position":{"x":0.0,"y":0.0,"z":0.0,"facing":0.0}}},
            {"id":"lot","components":{"hive.owned-by":{"player":"player"},"hive.owned-by-party":{"party":"party"},"hive.lot":{"kind":"wood","quantity":8,"container":"worker"}}}
        ]}).to_string()).unwrap();
        let begin: Value = serde_json::from_str(&kernel.advance_json(&json!({"delta":0,"writes":[],"actions":[{"scope":{"kind":"host"},"request":{"kind":"begin-work-attempt","task":"task","worker":"worker","operation":{"kind":"route","destination":{"x":0.0,"y":0.0,"z":0.0,"frame":null}}}}]}).to_string()).unwrap()).unwrap();
        let generation = begin["results"][0]["attempt"]["generation"].as_u64().unwrap();
        kernel.advance_json(&json!({"delta":1,"writes":[],"actions":[]}).to_string()).unwrap();

        let transfer = json!({"delta":0,"writes":[],"actions":[{"scope":{"kind":"player","player":"other-player"},"request":{"kind":"continue-work-attempt","task":"task","generation":generation,"sequence":1,"nextActivity":{"kind":"material-transfer","lot":"lot","from":"worker","to":"destination","quantity":1}}}]});
        let before_attempts = kernel.work_attempts_json("[\"task\"]").unwrap();
        let rejected: Value = serde_json::from_str(&kernel.advance_json(&transfer.to_string()).unwrap()).unwrap();
        assert_eq!(rejected["results"][0]["accepted"], false);
        assert_eq!(kernel.ecs.get::<Lot>(kernel.entity("lot").unwrap()).unwrap().quantity, 8);
        assert_eq!(kernel.ecs.get::<Lot>(kernel.entity("lot").unwrap()).unwrap().container, "worker");
        assert_eq!(kernel.work_attempts_json("[\"task\"]").unwrap(), before_attempts);

        let transfer = json!({"delta":0,"writes":[],"actions":[{"scope":{"kind":"player","player":"player"},"request":{"kind":"continue-work-attempt","task":"task","generation":generation,"sequence":1,"nextActivity":{"kind":"material-transfer","lot":"lot","from":"worker","to":"destination","quantity":1}}}]});
        let accepted: Value = serde_json::from_str(&kernel.advance_json(&transfer.to_string()).unwrap()).unwrap();
        assert_eq!(accepted["results"][0]["accepted"], true, "{accepted}");
        let lots: Vec<_> = kernel.ecs.query::<(&ExternalId, &Lot, &OwnedBy, &OwnedByParty)>().iter(&kernel.ecs)
            .map(|(id, lot, player, party)| (id.0.clone(), lot.clone(), player.clone(), party.clone())).collect();
        assert_eq!(lots.iter().map(|(_, lot, _, _)| u64::from(lot.quantity)).sum::<u64>(), 8);
        assert_eq!(lots.len(), 2);
        assert!(lots.iter().all(|(_, _, owner, party)| owner.player == "player" && party.party == "party"));
        assert_eq!(lots.iter().find(|(_, lot, _, _)| lot.container == "destination").unwrap().1.quantity, 1);
        assert_eq!(lots.iter().find(|(_, lot, _, _)| lot.container == "worker").unwrap().1.quantity, 7);

        let saved = kernel.save_records().unwrap();
        let mut restored = Kernel::new();
        restored.restore_records(&saved).unwrap();
        assert_eq!(restored.state_weight, kernel.state_weight);
        let restored_lots: Vec<_> = restored.ecs.query::<(&Lot, &OwnedBy, &OwnedByParty)>().iter(&restored.ecs).collect();
        assert_eq!(restored_lots.iter().map(|(lot, _, _)| u64::from(lot.quantity)).sum::<u64>(), 8);
        assert_eq!(restored_lots.len(), 2);
        assert!(restored_lots.iter().all(|(_, owner, party)| owner.player == "player" && party.party == "party"));
        assert_eq!(restored.work_attempts_json("[\"task\"]").unwrap(), kernel.work_attempts_json("[\"task\"]").unwrap());
    }

    #[test]
    fn material_drop_is_exactly_once_and_stale_replay_cannot_duplicate_ground_custody() {
        let (mut kernel, generation) = material_kernel(8, 0.0, 1);
        let result = kernel.advance_json(&json!({"delta":0,"writes":[],"actions":[{"scope":{"kind":"host"},"request":{"kind":"continue-work-attempt","task":"task","generation":generation,"sequence":1,"nextActivity":{"kind":"material-drop","lot":"lot"}}}]}).to_string()).unwrap();
        let value: Value = serde_json::from_str(&result).unwrap();
        assert_eq!(value["results"][0]["accepted"], true, "{value}");
        let lot = kernel.ecs.get::<Lot>(kernel.entity("lot").unwrap()).unwrap();
        assert!(lot.container.starts_with("ground."));
        assert!(kernel.advance_json(&json!({"delta":0,"writes":[],"actions":[{"scope":{"kind":"host"},"request":{"kind":"continue-work-attempt","task":"task","generation":generation,"sequence":1,"nextActivity":{"kind":"material-drop","lot":"lot"}}}]}).to_string()).is_err());
    }

    #[test]
    fn material_transfer_allows_source_to_worker_pickup_only() {
        let mut kernel = Kernel::new();
        kernel.load(&json!({"format":"hive-game","version":3,"game":"pickup","components":[],"materialCatalog":[],"initial":[
            {"id":"task","components":{"hive.owned-by-party":{"party":"party"},"hive.work-execution":{"pool":"party","initiatingPlayer":null,"policyId":"test"}}},
            {"id":"party","components":{"hive.party":{},"hive.owned-by":{"player":"player"}}},
            {"id":"worker","components":{"hive.party-member":{"party":"party"},"hive.body":{"speed":1.0},"hive.position":{"x":0.0,"y":0.0,"z":0.0,"facing":0.0},"hive.container":{"capacity":8}}},
            {"id":"source","components":{"hive.owned-by-party":{"party":"party"},"hive.container":{"capacity":8},"hive.position":{"x":0.0,"y":0.0,"z":0.0,"facing":0.0}}},
            {"id":"destination","components":{"hive.owned-by-party":{"party":"party"},"hive.container":{"capacity":8},"hive.position":{"x":0.0,"y":0.0,"z":0.0,"facing":0.0}}},
            {"id":"lot","components":{"hive.owned-by-party":{"party":"party"},"hive.lot":{"kind":"wood","quantity":2,"container":"source"}}}
        ]}).to_string()).unwrap();
        let begin: Value = serde_json::from_str(&kernel.advance_json(&json!({"delta":0,"writes":[],"actions":[{"scope":{"kind":"host"},"request":{"kind":"begin-work-attempt","task":"task","worker":"worker","operation":{"kind":"route","destination":{"x":0.0,"y":0.0,"z":0.0,"frame":null}}}}]}).to_string()).unwrap()).unwrap();
        let generation = begin["results"][0]["attempt"]["generation"].as_u64().unwrap();
        kernel.advance_json(&json!({"delta":1,"writes":[],"actions":[]}).to_string()).unwrap();
        let pickup = kernel.advance_json(&json!({"delta":0,"writes":[],"actions":[{"scope":{"kind":"host"},"request":{"kind":"continue-work-attempt","task":"task","generation":generation,"sequence":1,"nextActivity":{"kind":"material-transfer","lot":"lot","from":"source","to":"worker","quantity":1}}}]}).to_string()).unwrap();
        assert_eq!(serde_json::from_str::<Value>(&pickup).unwrap()["results"][0]["accepted"], true, "{pickup}");
        let source_lot = kernel.ecs.get::<Lot>(kernel.entity("lot").unwrap()).unwrap();
        assert_eq!((source_lot.container.as_str(), source_lot.quantity), ("source", 1));
        let carried: Vec<_> = kernel.ecs.query::<(&ExternalId, &Lot)>().iter(&kernel.ecs)
            .filter(|(_, lot)| lot.container == "worker").collect();
        assert_eq!(carried.len(), 1);
        assert_ne!(carried[0].0.0, "lot");
        assert_eq!(carried[0].1.quantity, 1);
    }
}
enum ActionEffect { None, Entity(String), Projectile(String, Vector3), Attempt(AttemptKey) }
enum PreparedWaterMaterial { Output(PreparedMaterialOutput), Consumption(PreparedConsumption) }

#[cfg(test)]
mod ground_stock_cleanup_tests {
    use super::*;

    #[test]
    fn work_material_snapshot_compacts_native_custody_and_capacity_facts() {
        let mut kernel = Kernel::new();
        kernel.load(&json!({
            "format":"hive-game", "version":3, "game":"work-material-facts",
            "components":[], "materialCatalog":[], "initial":[
                {"id":"source","components":{"hive.position":{"x":0.0,"y":0.0,"z":0.0,"facing":0.0},"hive.container":{"capacity":8}}},
                {"id":"sealed","components":{"hive.position":{"x":1.0,"y":0.0,"z":0.0,"facing":0.0},"hive.container":{"capacity":4},"hive.sealed-container":{}}},
                {"id":"lot.1","components":{"hive.lot":{"kind":"wood","quantity":3,"container":"source"}}}
            ]
        }).to_string()).unwrap();
        let facts: serde_json::Value = serde_json::from_str(&kernel.work_material_snapshot_json().unwrap()).unwrap();
        assert_eq!(facts["version"], 1);
        assert_eq!(facts["containers"].as_array().unwrap().len(), 2);
        assert_eq!(facts["containers"].as_array().unwrap().iter().find(|row| row["id"] == "sealed").unwrap()["sealed"], true);
        assert_eq!(facts["lots"][0]["container"], "source");
    }

    #[test]
    fn authored_reference_retains_ground_stock_until_removal_then_cleanup_releases_it() {
        let mut kernel = Kernel::new();
        kernel.load(&json!({
            "format":"hive-game", "version":3, "game":"ground-cleanup",
            "components":[{"id":"game.delivery","version":1,"fields":{"source":"entity"}}],
            "materialCatalog":[], "initial":[
                {"id":"ground.1","components":{"hive.position":{"x":0.0,"y":0.0,"z":0.0,"facing":0.0},"hive.container":{"capacity":3},"hive.ground-stock":{}}},
                {"id":"haul.1","components":{"game.delivery":{"source":"ground.1"}}}
            ]
        }).to_string()).unwrap();
        kernel.ground_stock_cleanup_pending = true;
        kernel.cleanup_empty_ground_stock();
        assert!(kernel.known.contains("ground.1"));
        kernel.advance_json(&json!({"delta":0.0,"creates":[],"removes":[{"scope":{"kind":"host"},"entity":"haul.1"}],"writes":[],"actions":[]}).to_string()).unwrap();
        assert!(!kernel.known.contains("ground.1"));
    }

    #[test]
    fn actor_drop_keeps_lot_at_supported_pose_across_recovery() {
        let mut kernel = Kernel::new();
        kernel.load(&json!({
            "format":"hive-game", "version":3, "game":"ground-drop",
            "components":[],
            "materialCatalog":[], "initial":[
                {"id":"platform","components":{"hive.position":{"x":0.0,"y":0.0,"z":0.0,"facing":0.0},"hive.surface":{"minX":0.0,"maxX":4.0,"minZ":0.0,"maxZ":4.0,"height":1.0}}},
                {"id":"actor","components":{"hive.position":{"x":2.0,"y":1.0,"z":2.0,"facing":1.0},"hive.support":{"entity":"platform"},"hive.body":{"speed":1.0},"hive.container":{"capacity":3}}},
                {"id":"lot.1","components":{"hive.lot":{"kind":"soil-spoil","quantity":2,"container":"actor"}}}
            ]
        }).to_string()).unwrap();
        kernel.advance_json(&json!({"delta":0.0,"creates":[],"removes":[],"writes":[],"actions":[{"scope":{"kind":"host"},"request":{"kind":"drop-lot","entity":"actor","lot":"lot.1"}}]}).to_string()).unwrap();
        let ground = kernel.known.iter().find(|id| id.starts_with("ground.")).cloned().expect("drop creates ground stock");
        let lot = kernel.ecs.get::<Lot>(kernel.entity("lot.1").unwrap()).unwrap();
        assert_eq!(lot.container, ground);
        let position = kernel.ecs.get::<Position>(kernel.entity(&ground).unwrap()).unwrap();
        assert_eq!((position.x, position.y, position.z, position.facing), (2.0, 1.0, 2.0, 1.0));
        assert_eq!(kernel.ecs.get::<Support>(kernel.entity(&ground).unwrap()).unwrap().entity, "platform");
        let saved = kernel.snapshot_json().unwrap();
        let mut restored = Kernel::new();
        restored.restore_json(&saved).unwrap();
        assert_eq!(restored.snapshot_json().unwrap(), saved);
        assert!(restored.known.contains(&ground));
        let restored_position = restored.ecs.get::<Position>(restored.entity(&ground).unwrap()).unwrap();
        assert_eq!((restored_position.x, restored_position.y, restored_position.z), (2.0, 1.0, 2.0));
        assert_eq!(restored.ecs.get::<Support>(restored.entity(&ground).unwrap()).unwrap().entity, "platform");
    }
}

#[cfg(test)]
mod process_request_tests {
    use super::*;
    use crate::environment_definition::{CompletionRecipe, PortDefinition};
    use crate::staged_process::{InputDisposition, InputPolicy, ProcessCatalog, ProcessDefinition, ProcessInput, ProcessPhase, ProcessStage, ProcessTransition, StagedProcess, StageMode};
    use serde_json::json;

    pub(super) fn kernel_with_slot() -> Kernel {
        let mut kernel = Kernel::new();
        kernel.load(&json!({"format":"hive-game","version":3,"game":"process-request","components":[],"materialCatalog":[],"initial":[]}).to_string()).unwrap();
        kernel.load_environment(&crate::environment_definition::tests::fixture("process-request")).unwrap();
        let station = kernel.ecs.spawn((ExternalId("station".into()), Position { x: 0.0, y: 0.0, z: 0.0, facing: 0.0 }, Container { capacity: 8 }, SealedContainer {}, ConstructionSite { catalog: "floor".into(), target: ConstructionTarget::Cell { cell: crate::generation::Cell { x: 0, y: 0, z: 0 }, orientation: crate::structure_geometry::Cardinal::North }, seconds: 1.0, phase: ConstructionPhase::Finished })).id();
        kernel.ids.insert("station".into(), station); kernel.known.insert("station".into());
        let structure = kernel.environment.as_mut().unwrap().structures.get_mut("floor").unwrap();
        structure.on_complete = CompletionRecipe { components: vec![], ports: vec![PortDefinition { key: "input".into(), components: vec![("hive.container".into(), record(&Container { capacity: 4 }))], at_site_contact: false }] };
        let port = kernel.ecs.spawn((ExternalId("station:input".into()), Position { x: 0.0, y: 0.0, z: 0.0, facing: 0.0 }, Container { capacity: 4 })).id();
        kernel.ids.insert("station:input".into(), port); kernel.known.insert("station:input".into()); kernel.contents.insert("station:input".into(), BTreeSet::new());
        let definition = ProcessDefinition { id: "process-v1".into(), version: 1, station_catalog: "floor".into(), inputs: vec![ProcessInput { role: "grain".into(), port: "input".into(), material: "grain".into(), quantity: 1, policy: InputPolicy::Portion, disposition: InputDisposition::Consume }], stages: vec![ProcessStage { id: "work".into(), mode: StageMode::Attended, duration_seconds: 1.0, transition: ProcessTransition { consume_roles: vec!["grain".into()], emission: None, outputs: vec![] } }] };
        let structures = kernel.environment.as_ref().unwrap().structures.clone();
        let emissions = kernel.environment.as_ref().unwrap().emissions.clone();
        kernel.environment.as_mut().unwrap().processes = ProcessCatalog::from_definitions(vec![definition], &structures, &emissions).unwrap();
        kernel
    }

    #[test]
    fn request_is_workerless_idempotent_and_restarts_completed_slot() {
        let mut kernel = kernel_with_slot();
        let id = kernel.request_process("process-v1", "station", &ActionScope::Host).unwrap();
        let entity = kernel.entity(&id).unwrap();
        assert_eq!(kernel.ecs.get::<StagedProcess>(entity).unwrap().phase, ProcessPhase::Waiting);
        assert_eq!(kernel.request_process("process-v1", "station", &ActionScope::Host).unwrap(), id);
        crate::record_changes::edit::<StagedProcess>(entity, &mut kernel.ecs).unwrap().phase = ProcessPhase::Complete;
        kernel.revision = 7;
        assert_eq!(kernel.request_process("process-v1", "station", &ActionScope::Host).unwrap(), id);
        let process = kernel.ecs.get::<StagedProcess>(entity).unwrap();
        assert_eq!((process.phase, process.stage_index, process.progress_seconds, process.entered_tick), (ProcessPhase::Waiting, 0, 0.0, 7));
    }

    #[test]
    fn request_restore_rejects_stale_station_or_definition_version() {
        let mut kernel = kernel_with_slot();
        let id = kernel.request_process("process-v1", "station", &ActionScope::Host).unwrap();
        let entity = kernel.entity(&id).unwrap();
        crate::record_changes::edit::<StagedProcess>(entity, &mut kernel.ecs).unwrap().definition_version = 2;
        assert!(kernel.validate_process_records().is_err());
        crate::record_changes::edit::<StagedProcess>(entity, &mut kernel.ecs).unwrap().definition_version = 1;
        let station = kernel.entity("station").unwrap();
        crate::record_changes::edit::<ConstructionSite>(station, &mut kernel.ecs).unwrap().phase = ConstructionPhase::Planned;
        assert!(kernel.validate_process_records().is_err());
    }

    #[test]
    fn admission_waits_for_all_port_lots_and_is_retry_idempotent() {
        let mut kernel = kernel_with_slot();
        let process = kernel.request_process("process-v1", "station", &ActionScope::Host).unwrap();
        assert!(kernel.admit_process(&process, "process-v1", "station").is_err());
        assert!(!kernel.try_admit_process(&process, "process-v1", "station").unwrap());
        let lot = kernel.ecs.spawn((ExternalId("grain.1".into()), Lot { kind: "grain".into(), quantity: 1, container: "station:input".into() })).id();
        kernel.ids.insert("grain.1".into(), lot);
        kernel.known.insert("grain.1".into());
        kernel.refresh_state_weight();
        kernel.admit_process(&process, "process-v1", "station").unwrap();
        assert!(kernel.try_admit_process(&process, "process-v1", "station").unwrap());
        assert_eq!(kernel.ecs.query::<&crate::staged_process::ProcessBinding>().iter(&kernel.ecs).count(), 1);
        let before = kernel.query_json(r#"["hive.lot","hive.process-binding","hive.staged-process"]"#).unwrap();
        kernel.admit_process(&process, "process-v1", "station").unwrap();
        assert_eq!(kernel.query_json(r#"["hive.lot","hive.process-binding","hive.staged-process"]"#).unwrap(), before);
        assert_eq!(kernel.ecs.get::<StagedProcess>(kernel.entity(&process).unwrap()).unwrap().phase, ProcessPhase::Waiting);
        kernel.validate_process_records().unwrap();
    }

    #[test]
    fn admission_collision_preflight_leaves_canonical_state_unchanged() {
        let mut kernel = kernel_with_slot();
        let process = kernel.request_process("process-v1", "station", &ActionScope::Host).unwrap();
        let lot = kernel.ecs.spawn((ExternalId("grain.collision".into()), Lot { kind: "grain".into(), quantity: 1, container: "station:input".into() })).id();
        kernel.ids.insert("grain.collision".into(), lot);
        kernel.known.insert("grain.collision".into());
        let collision_id = format!("binding:{process}:grain:grain.collision");
        let collision = kernel.ecs.spawn(ExternalId(collision_id.clone())).id();
        kernel.ids.insert(collision_id.clone(), collision);
        kernel.known.insert(collision_id);
        kernel.refresh_state_weight();
        let placement_revision = kernel.placement_revision;
        assert!(kernel.admit_process(&process, "process-v1", "station").is_err());
        assert!(kernel.entity("unsupported-floor").is_err());
        assert_eq!(kernel.placement_revision, placement_revision, "rejected admission cannot invalidate geometry");
    }

    #[test]
    fn admitted_binding_reserves_lot_from_ordinary_transfer() {
        let mut kernel = kernel_with_slot();
        let process = kernel.request_process("process-v1", "station", &ActionScope::Host).unwrap();
        let lot = kernel.ecs.spawn((ExternalId("grain.1".into()), Lot { kind: "grain".into(), quantity: 1, container: "station:input".into() })).id();
        kernel.ids.insert("grain.1".into(), lot); kernel.known.insert("grain.1".into());
        let destination = kernel.ecs.spawn((ExternalId("destination".into()), Position { x: 0.0, y: 0.0, z: 0.0, facing: 0.0 }, Container { capacity: 4 })).id();
        kernel.ids.insert("destination".into(), destination); kernel.known.insert("destination".into()); kernel.contents.insert("destination".into(), BTreeSet::new());
        kernel.refresh_state_weight();
        kernel.admit_process(&process, "process-v1", "station").unwrap();
        assert!(kernel.transfer("grain.1", "station:input", "destination", 1).is_err());
        assert_eq!(kernel.ecs.get::<Lot>(lot).unwrap().container, "station:input");
    }

    pub(super) fn empty_process_kernel() -> (Kernel, String) {
        let mut kernel = kernel_with_slot();
        let definition = ProcessDefinition { id: "empty-v1".into(), version: 1, station_catalog: "floor".into(), inputs: vec![ProcessInput { role: "grain".into(), port: "input".into(), material: "grain".into(), quantity: 1, policy: InputPolicy::WholeLot, disposition: InputDisposition::Retain }], stages: vec![ProcessStage { id: "attend".into(), mode: StageMode::Attended, duration_seconds: 2.0, transition: ProcessTransition::default() }, ProcessStage { id: "wait".into(), mode: StageMode::Elapsed, duration_seconds: 2.0, transition: ProcessTransition::default() }, ProcessStage { id: "finish".into(), mode: StageMode::Attended, duration_seconds: 1.0, transition: ProcessTransition::default() }] };
        let structures = kernel.environment.as_ref().unwrap().structures.clone(); let emissions = kernel.environment.as_ref().unwrap().emissions.clone();
        kernel.environment.as_mut().unwrap().processes = ProcessCatalog::from_definitions(vec![definition], &structures, &emissions).unwrap();
        let lot = kernel.ecs.spawn((ExternalId("grain.empty".into()), Lot { kind: "grain".into(), quantity: 1, container: "station:input".into() })).id(); kernel.ids.insert("grain.empty".into(), lot); kernel.known.insert("grain.empty".into()); kernel.refresh_state_weight();
        let worker = kernel.ecs.spawn((ExternalId("worker".into()), Position { x: 0.0, y: 0.0, z: 0.0, facing: 0.0 }, Body { speed: 1.0 }, Traversal { clearance_cells: 1, max_step_cells: 1 }, Container { capacity: 4 })).id(); kernel.ids.insert("worker".into(), worker); kernel.known.insert("worker".into()); kernel.rebuild_physical_indexes(true).unwrap();
        let process = kernel.request_process("empty-v1", "station", &ActionScope::Host).unwrap(); kernel.admit_process(&process, "empty-v1", "station").unwrap(); (kernel, process)
    }

    #[test] fn attendance_requires_contact_and_authoritative_delta() { let (mut kernel, process) = empty_process_kernel(); let contact = kernel.native_supply_contacts("station").unwrap().into_iter().next().unwrap(); let worker = kernel.entity("worker").unwrap(); kernel.ecs.entity_mut(worker).insert(Position { x: 99.0, y: 0.0, z: 0.0, facing: 0.0 }); assert!(kernel.attend_process("worker", &process, &contact, 1.0).is_err()); kernel.ecs.entity_mut(worker).insert(Position { x: contact.x, y: contact.y, z: contact.z, facing: 0.0 }); kernel.attend_process("worker", &process, &contact, 1.0).unwrap(); assert_eq!(kernel.ecs.get::<StagedProcess>(kernel.entity(&process).unwrap()).unwrap().progress_seconds, 1.0); }
    #[test] fn zero_delta_pause_and_repeated_attend_do_not_cross_twice() { let (mut kernel, process) = empty_process_kernel(); let contact = kernel.native_supply_contacts("station").unwrap().into_iter().next().unwrap(); kernel.ecs.entity_mut(kernel.entity("worker").unwrap()).insert(Position { x: contact.x, y: contact.y, z: contact.z, facing: 0.0 }); kernel.attend_process("worker", &process, &contact, 0.0).unwrap(); assert_eq!(kernel.ecs.get::<StagedProcess>(kernel.entity(&process).unwrap()).unwrap().progress_seconds, 0.0); kernel.attend_process("worker", &process, &contact, 2.0).unwrap(); let state = kernel.ecs.get::<StagedProcess>(kernel.entity(&process).unwrap()).unwrap().clone(); assert_eq!((state.stage_index, state.phase), (1, ProcessPhase::Waiting)); kernel.attend_process("worker", &process, &contact, 0.0).unwrap_err(); assert_eq!(kernel.ecs.get::<StagedProcess>(kernel.entity(&process).unwrap()).unwrap().stage_index, 1); }
    #[test] fn elapsed_stage_has_no_same_tick_credit_and_survives_worker_release() { let (mut kernel, process) = empty_process_kernel(); let contact = kernel.native_supply_contacts("station").unwrap().into_iter().next().unwrap(); kernel.ecs.entity_mut(kernel.entity("worker").unwrap()).insert(Position { x: contact.x, y: contact.y, z: contact.z, facing: 0.0 }); kernel.attend_process("worker", &process, &contact, 2.0).unwrap(); kernel.advance_staged_processes(1.0).unwrap(); assert_eq!(kernel.ecs.get::<StagedProcess>(kernel.entity(&process).unwrap()).unwrap().progress_seconds, 0.0); kernel.revision += 1; kernel.advance_staged_processes(1.0).unwrap(); assert_eq!(kernel.ecs.get::<StagedProcess>(kernel.entity(&process).unwrap()).unwrap().progress_seconds, 1.0); }
    #[test] fn worker_release_allows_replacement_and_save_reload_preserves_process() { let (mut kernel, process) = empty_process_kernel(); let contact = kernel.native_supply_contacts("station").unwrap().into_iter().next().unwrap(); kernel.ecs.entity_mut(kernel.entity("worker").unwrap()).insert(Position { x: contact.x, y: contact.y, z: contact.z, facing: 0.0 }); kernel.attend_process("worker", &process, &contact, 1.0).unwrap(); let worker = kernel.entity("worker").unwrap(); kernel.ecs.entity_mut(worker).insert(Position { x: 99.0, y: 0.0, z: 0.0, facing: 0.0 }); assert!(kernel.validate_process_records().is_err()); }
    #[test] fn process_transition_consumes_exact_bound_portion() { let mut kernel = kernel_with_slot(); let process = kernel.request_process("process-v1", "station", &ActionScope::Host).unwrap(); let lot = kernel.ecs.spawn((ExternalId("grain.blocked".into()), Lot { kind: "grain".into(), quantity: 1, container: "station:input".into() })).id(); kernel.ids.insert("grain.blocked".into(), lot); kernel.known.insert("grain.blocked".into()); kernel.refresh_state_weight(); kernel.admit_process(&process, "process-v1", "station").unwrap(); let worker = kernel.ecs.spawn((ExternalId("worker.blocked".into()), Position { x: 0.0,y:0.0,z:0.0,facing:0.0 }, Body { speed:1.0 }, Traversal { clearance_cells:1,max_step_cells:1 }, Container { capacity:4 })).id(); kernel.ids.insert("worker.blocked".into(), worker); kernel.known.insert("worker.blocked".into()); let contact = kernel.native_supply_contacts("station").unwrap().into_iter().next().unwrap(); kernel.ecs.entity_mut(kernel.entity("worker.blocked").unwrap()).insert(Position { x: contact.x, y: contact.y, z: contact.z, facing: 0.0 }); kernel.attend_process("worker.blocked", &process, &contact, 1.0).unwrap(); let state = kernel.ecs.get::<StagedProcess>(kernel.entity(&process).unwrap()).unwrap(); assert_eq!(state.phase, ProcessPhase::Complete); assert_eq!(kernel.ecs.get::<Lot>(lot).unwrap().quantity, 0); }

    #[test]
    fn process_station_rejects_different_active_definition() {
        let mut kernel = kernel_with_slot();
        let first = kernel.request_process("process-v1", "station", &ActionScope::Host).unwrap();
        let mut second = kernel.environment.as_ref().unwrap().processes.get("process-v1").unwrap().definition().clone();
        second.id = "process-v2".into();
        let first_definition = kernel.environment.as_ref().unwrap().processes.get("process-v1").unwrap().definition().clone();
        let structures = kernel.environment.as_ref().unwrap().structures.clone();
        let emissions = kernel.environment.as_ref().unwrap().emissions.clone();
        kernel.environment.as_mut().unwrap().processes = ProcessCatalog::from_definitions(vec![first_definition, second], &structures, &emissions).unwrap();
        assert_eq!(kernel.request_process("process-v1", "station", &ActionScope::Host).unwrap(), first);
        assert!(kernel.request_process("process-v2", "station", &ActionScope::Host).is_err());
    }
}

#[cfg(test)]
mod process_attempt_tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn restore_rejects_orphan_working_process_without_executing_attendance() {
        let (mut kernel, process) = process_request_tests::empty_process_kernel();
        let process_entity = kernel.entity(&process).unwrap();
        let mut state = kernel.ecs.get::<StagedProcess>(process_entity).unwrap().clone();
        state.phase = ProcessPhase::Working;
        kernel.ecs.entity_mut(process_entity).insert(state);
        assert!(kernel.validate_process_records().is_err());
    }

    #[test]
    fn scoped_attendance_keeps_worker_reserved_until_terminal_process_outcome() {
        let mut kernel = process_request_tests::kernel_with_slot();
        let party = kernel.ecs.spawn((ExternalId("party:1".into()), Party {}, OwnedBy { player: "player:1".into() })).id();
        kernel.ids.insert("party:1".into(), party); kernel.known.insert("party:1".into());
        let station = kernel.entity("station").unwrap();
        kernel.ecs.entity_mut(station).insert(OwnedByParty { party: "party:1".into() });
        let grain = kernel.ecs.spawn((ExternalId("grain:1".into()), Lot { kind: "grain".into(), quantity: 1, container: "station:input".into() })).id();
        kernel.ids.insert("grain:1".into(), grain); kernel.known.insert("grain:1".into()); kernel.refresh_state_weight();
        let worker = kernel.ecs.spawn((ExternalId("worker:1".into()), PartyMember { party: "party:1".into() }, Position { x: 0.0, y: 0.0, z: 0.0, facing: 0.0 }, Body { speed: 1.0 }, Traversal { clearance_cells: 1, max_step_cells: 1 }, Container { capacity: 4 })).id();
        kernel.ids.insert("worker:1".into(), worker); kernel.known.insert("worker:1".into());
        kernel.rebuild_physical_indexes(true).unwrap();
        kernel.rebuild_relation_index().unwrap();
        kernel.rebuild_planner_index();
        let request = json!({"delta":0,"writes":[],"actions":[{"scope":{"kind":"player","player":"player:1"},"request":{"kind":"request-process","definition":"process-v1","station":"station"}}]});
        let result: serde_json::Value = serde_json::from_str(&kernel.advance_json(&request.to_string()).unwrap()).unwrap();
        assert_eq!(result["results"][0]["accepted"], true, "{result}");
        let process = "process:station:process-v1";
        kernel.admit_process(process, "process-v1", "station").unwrap();
        let contact = kernel.native_supply_contacts("station").unwrap().into_iter().next().unwrap();
        let begin = json!({"delta":0,"writes":[],"actions":[{"scope":{"kind":"player","player":"player:1"},"request":{"kind":"begin-work-attempt","task":process,"worker":"worker:1","operation":{"kind":"process-attendance","process":process,"contact":contact}}}]});
        let result: serde_json::Value = serde_json::from_str(&kernel.advance_json(&begin.to_string()).unwrap()).unwrap();
        assert_eq!(result["results"][0]["accepted"], true, "{result}");
        let attempt = kernel.work_attempt_for_worker_json("\"worker:1\"").unwrap();
        assert!(attempt.contains("worker:1"));

        kernel.ecs.entity_mut(kernel.entity("worker:1").unwrap()).remove::<Body>();
        kernel.advance_json(&json!({"delta":0.5,"writes":[],"actions":[]}).to_string()).unwrap();
        let waiting = kernel.ecs.get::<StagedProcess>(kernel.entity(process).unwrap()).unwrap();
        assert_eq!(waiting.phase, ProcessPhase::Waiting);
        assert!(kernel.work_attempts_json(&format!("[\"{process}\"]")).unwrap().contains("workerUnavailable"));
        let saved = kernel.snapshot_entities_json().unwrap();
        let mut restored = Kernel::new();
        restored.restore_json(&saved).unwrap();
        let restored_state = restored.ecs.get::<StagedProcess>(restored.entity(process).unwrap()).unwrap();
        assert_eq!(restored_state.phase, ProcessPhase::Waiting);
        assert_eq!(restored_state.progress_seconds, waiting.progress_seconds);
        assert!(!restored.query_json(r#"["hive.process-binding"]"#).unwrap().is_empty());
        assert!(restored.work_attempts_json(&format!("[\"{process}\"]")).unwrap().contains("workerUnavailable"));
        kernel.advance_json(&json!({"delta":0,"writes":[],"actions":[{"scope":{"kind":"player","player":"player:1"},"request":{"kind":"acknowledge-work-attempt","task":process,"generation":1,"sequence":1}}]}).to_string()).unwrap();
        kernel.ecs.entity_mut(kernel.entity("worker:1").unwrap()).insert(Body { speed: 1.0 });
        let rebegin = kernel.advance_json(&begin.to_string()).unwrap();
        assert_eq!(serde_json::from_str::<serde_json::Value>(&rebegin).unwrap()["results"][0]["accepted"], true, "{rebegin}");

        let wrong_party = kernel.advance_json(&json!({"delta":0,"writes":[],"actions":[{"scope":{"kind":"player","player":"player:2"},"request":{"kind":"request-process","definition":"process-v1","station":"station"}}]}).to_string()).unwrap();
        assert_eq!(serde_json::from_str::<serde_json::Value>(&wrong_party).unwrap()["results"][0]["accepted"], false);
        let half = kernel.advance_json(&json!({"delta":0.5,"writes":[],"actions":[]}).to_string()).unwrap();
        assert_eq!(serde_json::from_str::<serde_json::Value>(&half).unwrap()["results"].as_array().unwrap().len(), 0);
        let mid = kernel.work_attempt_for_worker_json("\"worker:1\"").unwrap();
        assert!(mid.contains("executing"), "{mid}");
        kernel.advance_json(&json!({"delta":0.5,"writes":[],"actions":[]}).to_string()).unwrap();
        let process_state = kernel.ecs.get::<StagedProcess>(kernel.entity(process).unwrap()).unwrap();
        assert_eq!(process_state.phase, ProcessPhase::Complete);
        let completed = kernel.work_attempt_for_worker_json("\"worker:1\"").unwrap();
        assert!(completed.contains("completed"), "{completed}");
    }
}

#[cfg(test)]
mod water_exchange_action_tests {
    use super::*;
    use serde_json::json;

    fn kernel() -> Kernel {
        let mut kernel = Kernel::new();
        kernel.load(&json!({"format":"hive-game","version":3,"game":"water-action-laws","components":[],"materialCatalog":[],"initial":[
            {"id":"worker","components":{"hive.position":{"x":0.0,"y":0.0,"z":0.0,"facing":0.0},"hive.body":{"speed":1.0},"hive.container":{"capacity":8}}},
            {"id":"pail","components":{"hive.position":{"x":0.0,"y":0.0,"z":0.0,"facing":0.0},"hive.container":{"capacity":8},"hive.vessel-capability":{"acceptsWater":true},"hive.lot":{"kind":"pail","quantity":1,"container":"worker"}}}
        ]}).to_string()).unwrap();
        kernel
    }

    #[test]
    fn rejected_field_water_action_keeps_snapshot_and_rejects_wrong_custody() {
        let mut kernel = kernel();
        let before = kernel.query_json(r#"["hive.lot","hive.lot-water"]"#).unwrap();
        let result = kernel.advance_json(&json!({"delta":0,"writes":[],"actions":[{"scope":{"kind":"host"},"request":
            {"kind":"exchange-field-water","operation":"test-withdraw","worker":"worker","vessel":"pail","x":0,"y":0,"z":0,"direction":"withdraw","portions":1}
        }]}).to_string()).unwrap();
        let result: serde_json::Value = serde_json::from_str(&result).unwrap();
        assert_eq!(result["results"][0]["accepted"], false);
        assert_eq!(kernel.query_json(r#"["hive.lot","hive.lot-water"]"#).unwrap(), before);

        let mut wrong = kernel;
        let before = wrong.query_json(r#"["hive.lot","hive.lot-water"]"#).unwrap();
        let result = wrong.advance_json(&json!({"delta":0,"writes":[],"actions":[{"scope":{"kind":"host"},"request":
            {"kind":"exchange-field-water","operation":"test-invalid-deposit","worker":"pail","vessel":"pail","x":0,"y":0,"z":0,"direction":"deposit","portions":1}
        }]}).to_string()).unwrap();
        let result: serde_json::Value = serde_json::from_str(&result).unwrap();
        assert_eq!(result["results"][0]["accepted"], false);
        assert_eq!(wrong.query_json(r#"["hive.lot","hive.lot-water"]"#).unwrap(), before);
    }

    #[test]
    fn generated_field_water_draw_and_pour_preserve_exact_mass_across_restore() {
        let mut kernel = kernel();
        kernel.load_environment(&crate::environment_definition::tests::fixture("construction")).unwrap();
        let facts: serde_json::Value = serde_json::from_str(&kernel.environment_facts_json().unwrap()).unwrap();
        let cell = facts["cells"].as_array().unwrap().iter().find(|cell| cell["kind"] == "void").expect("construction fixture must expose an open field cell");
        let at = (cell["at"][0].as_i64().unwrap() as i32, cell["at"][1].as_i64().unwrap() as i32, cell["at"][2].as_i64().unwrap() as i32);
        let target = crate::generation::Cell { x: i64::from(at.0), y: at.1, z: i64::from(at.2) };
        let setup = kernel.environment.as_mut().unwrap().world.prepare_water_exchange(target, WaterExchangeDirection::Deposit, 3).unwrap();
        kernel.environment.as_mut().unwrap().world.apply_water_exchange(setup).unwrap();
        let spacing = kernel.environment.as_ref().unwrap().world.cell_spacing_m();
        let worker = kernel.entity("worker").unwrap();
        let pose = Position { x: f64::from(at.0 + 1) * spacing[0], y: (f64::from(at.1) + 0.5) * spacing[1], z: f64::from(at.2) * spacing[2], facing: 0.0 };
        kernel.ecs.entity_mut(worker).insert(pose);
        kernel.ecs.entity_mut(kernel.entity("pail").unwrap()).insert(pose);
        kernel.rebuild_physical_indexes(true).unwrap();
        let portions = 1;
        let before = kernel.environment_facts_json().unwrap();
        let draw = kernel.advance_json(&json!({"delta":0,"writes":[],"actions":[{"scope":{"kind":"host"},"request":{"kind":"exchange-field-water","operation":"roundtrip-withdraw","worker":"worker","vessel":"pail","x":at.0,"y":at.1,"z":at.2,"direction":"withdraw","portions":portions}}]}).to_string()).unwrap();
        assert_eq!(serde_json::from_str::<serde_json::Value>(&draw).unwrap()["results"][0]["accepted"], true);
        let water_lot = kernel.ids.values().copied().find(|entity| kernel.ecs.get::<Lot>(*entity).is_some_and(|lot| lot.kind == "water" && lot.container == "pail")).unwrap();
        assert_eq!(kernel.ecs.get::<Lot>(water_lot).unwrap().quantity, portions);
        let mass = kernel.ecs.get::<LotWater>(water_lot).unwrap().water_kg;
        let after: serde_json::Value = serde_json::from_str(&kernel.environment_facts_json().unwrap()).unwrap();
        let before_mass = before.parse::<serde_json::Value>().unwrap()["totalKg"].as_f64().unwrap();
        assert!((before_mass - after["totalKg"].as_f64().unwrap() - mass).abs() < 1e-9);
        let saved = kernel.save_records().unwrap();
        let mut restored = Kernel::new();
        restored.restore_records(&saved).unwrap();
        let pour = restored.advance_json(&json!({"delta":0,"writes":[],"actions":[{"scope":{"kind":"host"},"request":{"kind":"exchange-field-water","operation":"roundtrip-deposit","worker":"worker","vessel":"pail","x":at.0,"y":at.1,"z":at.2,"direction":"deposit","portions":portions}}]}).to_string()).unwrap();
        assert_eq!(serde_json::from_str::<serde_json::Value>(&pour).unwrap()["results"][0]["accepted"], true);
        assert_eq!(restored.environment_facts_json().unwrap().parse::<serde_json::Value>().unwrap()["totalKg"], before.parse::<serde_json::Value>().unwrap()["totalKg"]);
    }
}


#[cfg(test)]
mod field_water_recovery_tests {
    use super::*;
    use crate::work_attempt::{ActivityRef, WaterDirection};

    fn kernel() -> Kernel {
        let mut kernel = Kernel::new();
        kernel.load(&json!({"format":"hive-game","version":3,"game":"water-recovery","components":[],"materialCatalog":[{"kind":"water","unitVolume":1}],"stockpileProfiles":[{"id":"water-stock","allowedMaterials":["water"]}],"initial":[
            {"id":"party","components":{"hive.party":{},"hive.owned-by":{"player":"player"}}},
            {"id":"worker","components":{"hive.party-member":{"party":"party"},"hive.position":{"x":0.0,"y":0.0,"z":0.0,"facing":0.0},"hive.body":{"speed":1.0},"hive.container":{"capacity":8},"hive.work-participation":{"automatic":true}}},
            {"id":"pail","components":{"hive.owned-by-party":{"party":"party"},"hive.container":{"capacity":8},"hive.vessel-capability":{"acceptsWater":true},"hive.lot":{"kind":"pail","quantity":1,"container":"worker"}}}
        ]}).to_string()).unwrap();
        kernel
    }

    fn request(kernel: &mut Kernel, material: &str, portions: u8) -> String {
        let result: serde_json::Value = serde_json::from_str(&kernel.advance_json(&json!({
            "delta":0,"writes":[],"actions":[{"scope":{"kind":"player","player":"player"},"request":{
                "kind":"request-field-water","party":"party","material":material,"portions":portions
            }}]
        }).to_string()).unwrap()).unwrap();
        assert_eq!(result["results"][0]["accepted"], true, "{result}");
        result["results"][0]["entityId"].as_str().unwrap().into()
    }

    fn restore(kernel: &Kernel) -> Kernel {
        let records = kernel.save_records().unwrap();
        let mut restored = Kernel::new();
        restored.restore_records(&records).unwrap();
        assert_eq!(restored.save_records().unwrap().entities, records.entities);
        restored
    }

    #[test]
    fn accepted_manual_water_request_restores_and_rejects_forged_bindings() {
        let mut kernel = kernel();
        let task = request(&mut kernel, "water", 1);
        let entity = kernel.entity(&task).unwrap();
        let work = kernel.ecs.get::<FieldWaterWork>(entity).unwrap().clone();
        restore(&kernel);
        for invalid in [
            FieldWaterWork { retain_in_vessel: false, ..work.clone() },
            FieldWaterWork { destination: "pail".into(), ..work.clone() },
            FieldWaterWork { process: "pail".into(), destination: "pail".into(), ..work.clone() },
            FieldWaterWork { generation: 2, ..work.clone() },
            FieldWaterWork { role: "tend".into(), ..work.clone() },
            FieldWaterWork { lot: Some("pail".into()), ..work.clone() },
        ] {
            kernel.ecs.entity_mut(entity).insert(invalid);
            assert!(Kernel::new().restore_records(&kernel.save_records().unwrap()).is_err());
        }
        kernel.ecs.entity_mut(entity).insert(work);
        restore(&kernel);
    }

    #[test]
    fn resource_water_created_by_tending_owner_restores() {
        let mut kernel = kernel();
        let mut environment: serde_json::Value = serde_json::from_str(&crate::environment_definition::tests::fixture("resource")).unwrap();
        environment["resourceSites"] = json!([{
            "id":"herb", "outputKind":"herb", "outputQuantity":1, "waterKind":"fresh-water",
            "sowSeconds":1.0, "tendSeconds":1.0, "harvestSeconds":1.0,
            "stages":[{"delaySeconds":1.0,"waterPortions":2}]
        }]);
        kernel.load_environment(&environment.to_string()).unwrap();
        let cell = kernel.environment.as_mut().unwrap().world.surface_cells(&[(0, 0)]).unwrap()[0].unwrap().cell;
        kernel.designate_resource("herb-site".into(), "party".into(), "herb".into(), cell.x as i32, cell.y, cell.z as i32, &ActionScope::Player { player: "player".into() }).unwrap();
        let site = kernel.entity("herb-site").unwrap();
        let spacing = kernel.environment.as_ref().unwrap().world.cell_spacing_m();
        kernel.ecs.entity_mut(site).insert((
            ResourceSite { definition: "herb".into(), stage: 0, next_due: 0.0 },
            FiniteResource { kind: "herb".into(), quantity: 0 },
            Position { x: 0.0, y: (f64::from(cell.y) + 0.5) * spacing[1], z: 0.0, facing: 0.0 },
        ));
        assert!(kernel.resource_work_operation("herb-site", "party", None).unwrap().is_none());
        let task = "resource-water:herb-site:1";
        let work_entity = kernel.entity(task).unwrap();
        let work = kernel.ecs.get::<FieldWaterWork>(work_entity).unwrap().clone();
        assert_eq!(work.portions, 2);
        assert_eq!(work.material, "fresh-water");
        restore(&kernel);
        for invalid in [
            FieldWaterWork { process: "pail".into(), destination: "pail".into(), ..work.clone() },
            FieldWaterWork { role: "manual".into(), ..work.clone() },
            FieldWaterWork { generation: 2, ..work.clone() },
        ] {
            kernel.ecs.entity_mut(work_entity).insert(invalid);
            assert!(Kernel::new().restore_records(&kernel.save_records().unwrap()).is_err());
        }
    }

    #[test]
    fn authored_construction_water_demand_restores() {
        let mut kernel = kernel();
        let mut environment: serde_json::Value = serde_json::from_str(&crate::environment_definition::tests::fixture("construction")).unwrap();
        environment["structures"]["catalog"][0]["materials"] = json!([{"kind":"water","quantity":1}]);
        kernel.load_environment(&environment.to_string()).unwrap();
        let surface = kernel.environment.as_mut().unwrap().world.surface_cells(&[(0, 0)]).unwrap()[0].unwrap().cell;
        kernel.plan_constructions("party".into(), vec![ConstructionPlan {
            catalog: "floor".into(), site: "water-site".into(),
            target: ConstructionTarget::Cell { cell: surface, orientation: crate::structure_geometry::Cardinal::North },
        }], &ActionScope::Host).unwrap();
        let spacing = kernel.environment.as_ref().unwrap().world.cell_spacing_m();
        kernel.bind_construction_stage("water-site", Point {
            x: (surface.x + 1) as f64 * spacing[0], y: (f64::from(surface.y) + 0.5) * spacing[1], z: surface.z as f64 * spacing[2], frame: None,
        }).unwrap();
        // No worker is admitted; the ordinary planner still persists demand.
        kernel.ecs.entity_mut(kernel.entity("worker").unwrap()).insert(crate::work_planner::WorkParticipation { automatic: false });
        kernel.refresh_planner_index("worker");
        kernel.advance_native_work_planner(kernel.revision + 1).unwrap();
        let work = kernel.ids.values().find_map(|entity| kernel.ecs.get::<FieldWaterWork>(*entity)).unwrap();
        assert_eq!(work.process, "water-site");
        assert!(!work.retain_in_vessel);
        restore(&kernel);
    }

    #[test]
    fn public_ground_stockpile_water_demand_restores() {
        let mut kernel = kernel();
        kernel.load_environment(&crate::environment_definition::tests::fixture("construction")).unwrap();
        let surface = kernel.environment.as_mut().unwrap().world.surface_cells(&[(0, 0)]).unwrap()[0].unwrap().cell;
        kernel.designate_stockpile("party".into(), "water-zone".into(), vec![StockpileDesignation {
            x: surface.x as i32, y: surface.y, z: surface.z as i32, priority: 1, filter_profile: "water-stock".into(),
        }], &ActionScope::Host).unwrap();
        let spacing = kernel.environment.as_ref().unwrap().world.cell_spacing_m();
        let stock = kernel.prepare_ground_output(Position {
            x: (surface.x + 2) as f64 * spacing[0], y: (f64::from(surface.y) + 0.5) * spacing[1], z: surface.z as f64 * spacing[2], facing: 0.0,
        }, "water".into(), 1, Some(1.0), None).unwrap();
        kernel.publish_material_output(stock);
        kernel.ecs.entity_mut(kernel.entity("worker").unwrap()).insert(crate::work_planner::WorkParticipation { automatic: false });
        kernel.refresh_planner_index("worker");
        kernel.advance_native_work_planner(kernel.revision + 1).unwrap();
        let work = kernel.ids.values().find_map(|entity| kernel.ecs.get::<FieldWaterWork>(*entity)).unwrap();
        assert!(kernel.ecs.get::<StockpileCell>(kernel.entity(&work.process).unwrap()).is_some());
        assert!(!work.retain_in_vessel);
        restore(&kernel);
    }

    #[test]
    fn process_water_still_requires_active_process_and_owned_destination() {
        let mut kernel = kernel();
        let process = kernel.ecs.spawn((
            ExternalId("process".into()), OwnedByParty { party: "party".into() },
            StagedProcess { version: crate::staged_process::CURRENT_VERSION, definition: "recipe".into(), definition_version: 1, station: "pail".into(), stage_index: 0, progress_seconds: 0.0, entered_tick: 0, phase: ProcessPhase::Waiting, blocked_reason: String::new() },
        )).id();
        kernel.ids.insert("process".into(), process);
        kernel.known.insert("process".into());
        let task = request(&mut kernel, "water", 1);
        let entity = kernel.entity(&task).unwrap();
        let work = kernel.ecs.get::<FieldWaterWork>(entity).unwrap().clone();
        let work = FieldWaterWork { process: "process".into(), destination: "pail".into(), role: "input".into(), retain_in_vessel: false, ..work };
        kernel.ecs.entity_mut(entity).insert(work.clone());
        restore(&kernel);
        for invalid in [
            FieldWaterWork { process: "pail".into(), ..work.clone() },
            FieldWaterWork { destination: "worker".into(), ..work.clone() },
            FieldWaterWork { retain_in_vessel: true, ..work.clone() },
        ] {
            kernel.ecs.entity_mut(entity).insert(invalid);
            assert!(Kernel::new().restore_records(&kernel.save_records().unwrap()).is_err());
        }
        kernel.ecs.entity_mut(entity).insert(work);
        let state = kernel.ecs.get::<StagedProcess>(process).unwrap().clone();
        kernel.ecs.entity_mut(process).insert(StagedProcess { phase: ProcessPhase::Complete, ..state });
        assert!(Kernel::new().restore_records(&kernel.save_records().unwrap()).is_err());
    }

    #[test]
    fn retained_water_route_and_committed_outcome_recover_without_second_withdrawal() {
        let mut kernel = kernel();
        kernel.load_environment(&crate::environment_definition::tests::fixture("construction")).unwrap();
        let facts: serde_json::Value = serde_json::from_str(&kernel.environment_facts_json().unwrap()).unwrap();
        let cell = facts["cells"].as_array().unwrap().iter().find(|cell| cell["kind"] == "void").unwrap();
        let at = crate::generation::Cell { x: cell["at"][0].as_i64().unwrap(), y: cell["at"][1].as_i64().unwrap() as i32, z: cell["at"][2].as_i64().unwrap() };
        let token = kernel.environment.as_mut().unwrap().world.prepare_water_exchange(at, WaterExchangeDirection::Deposit, 3).unwrap();
        kernel.environment.as_mut().unwrap().world.apply_water_exchange(token).unwrap();
        let spacing = kernel.environment.as_ref().unwrap().world.cell_spacing_m();
        let pose = Position { x: (at.x + 1) as f64 * spacing[0], y: (f64::from(at.y) + 0.5) * spacing[1], z: at.z as f64 * spacing[2], facing: 0.0 };
        let worker = kernel.entity("worker").unwrap();
        kernel.ecs.entity_mut(worker).insert(pose);
        kernel.rebuild_physical_indexes(true).unwrap();
        let task = request(&mut kernel, "fresh-water", 2);
        let task_entity = kernel.entity(&task).unwrap();
        let work = kernel.ecs.get::<FieldWaterWork>(task_entity).unwrap().clone();
        kernel.ecs.entity_mut(task_entity).insert(FieldWaterWork { vessel: Some("pail".into()), cell_x: at.x as i32, cell_y: at.y, cell_z: at.z as i32, ..work });
        let destination = navigation::point(pose);
        let route = kernel.route_for(worker, pose, &destination).unwrap();
        let key = kernel.begin_work_attempt_with_prepared_route(task.clone(), "worker".into(), destination.clone(), route).unwrap();
        let mut kernel = restore(&kernel);
        // The worker is already at this contact; retain the route-completed
        // checkpoint so the real continuation owner performs the withdrawal.
        kernel.clear_destination(kernel.entity("worker").unwrap());
        kernel.settle_attempt(&task, AttemptPhase::Outcome {
            operation: OperationKey { attempt: key.clone(), sequence: 1 },
            activity: ActivityRef::Route { destination }, result: WorkOutcome::Completed,
        }).unwrap();
        let before: serde_json::Value = serde_json::from_str(&kernel.environment_facts_json().unwrap()).unwrap();
        let activity = ActivityRef::FieldWater { vessel: "pail".into(), cell: [at.x as i32, at.y, at.z as i32], direction: WaterDirection::Withdraw, portions: 2 };
        kernel.continue_work_attempt(task.clone(), key.generation, 1, activity.clone()).unwrap();
        let mut restored = restore(&kernel);
        let lot_id = restored.ecs.get::<FieldWaterWork>(restored.entity(&task).unwrap()).unwrap().lot.clone().unwrap();
        let lot_entity = restored.entity(&lot_id).unwrap();
        let mass = restored.ecs.get::<LotWater>(lot_entity).unwrap().water_kg;
        let after: serde_json::Value = serde_json::from_str(&restored.environment_facts_json().unwrap()).unwrap();
        assert!((before["totalKg"].as_f64().unwrap() - after["totalKg"].as_f64().unwrap() - mass).abs() < 1e-9);
        // A valid committed outcome must still reject forged material,
        // quantity, mass and vessel custody before any recovery work runs.
        let saved = restored.save_records().unwrap();
        let task_entity = restored.entity(&task).unwrap();
        let work = restored.ecs.get::<FieldWaterWork>(task_entity).unwrap().clone();
        for invalid in [
            FieldWaterWork { material: "water".into(), ..work.clone() },
            FieldWaterWork { portions: 1, ..work.clone() },
            FieldWaterWork { vessel: None, ..work.clone() },
        ] {
            restored.ecs.entity_mut(task_entity).insert(invalid);
            assert!(Kernel::new().restore_records(&restored.save_records().unwrap()).is_err());
        }
        restored.restore_records(&saved).unwrap();
        let vessel = restored.entity("pail").unwrap();
        restored.ecs.entity_mut(vessel).remove::<OwnedByParty>();
        assert!(Kernel::new().restore_records(&restored.save_records().unwrap()).is_err());
        restored.restore_records(&saved).unwrap();
        restored.ecs.entity_mut(restored.entity(&lot_id).unwrap()).remove::<LotWater>();
        assert!(Kernel::new().restore_records(&restored.save_records().unwrap()).is_err());
        restored.restore_records(&saved).unwrap();
        let lots = restored.query_json(r#"["hive.lot"]"#).unwrap();
        assert!(restored.continue_work_attempt(task.clone(), key.generation, 1, activity).is_err());
        assert_eq!(restored.query_json(r#"["hive.lot"]"#).unwrap(), lots);
        // Reaping a restored completed outcome removes demand, not matter.
        restored.advance_native_work_planner(restored.revision + 100).unwrap();
        assert!(restored.entity(&task).is_err());
        restored.advance_native_work_planner(restored.revision + 101).unwrap();
        assert_eq!(restored.query_json(r#"["hive.lot"]"#).unwrap(), lots);
        let reaped: serde_json::Value = serde_json::from_str(&restored.environment_facts_json().unwrap()).unwrap();
        for conserved in ["totalKg", "cells", "boundaryKg", "residualKg"] {
            assert_eq!(reaped[conserved], after[conserved], "{conserved}");
        }
        let restored = restore(&restored);
        let lot = restored.ecs.get::<Lot>(restored.entity(&lot_id).unwrap()).unwrap();
        assert_eq!((lot.kind.as_str(), lot.quantity, lot.container.as_str()), ("fresh-water", 2, "pail"));
        assert_eq!(restored.ecs.get::<LotWater>(restored.entity(&lot_id).unwrap()).unwrap().water_kg, mass);
    }
}


#[cfg(test)]
mod construction_tests {
    use super::*;
    use serde_json::json;

    fn world() -> (Kernel, crate::generation::Cell, Point) {
        let mut kernel = Kernel::new();
        kernel.load(&json!({
            "format":"hive-game", "version":3, "game":"construction",
            "components":[], "materialCatalog":[{"kind":"wood","unitVolume":1},{"kind":"stone-spoil","unitVolume":1}], "stockpileProfiles":[{"id":"materials","allowedMaterials":["wood","stone-spoil"]}], "initial":[
                {"id":"party","components":{"hive.party":{},"hive.owned-by":{"player":"player"}}},
                {"id":"worker-1","components":{"hive.party-member":{"party":"party"},"hive.position":{"x":0.0,"y":0.0,"z":0.0,"facing":0.0},"hive.body":{"speed":1.0},"hive.traversal":{"clearanceCells":1,"maxStepCells":1},"hive.container":{"capacity":10}}},
                {"id":"worker-2","components":{"hive.party-member":{"party":"party"},"hive.position":{"x":0.0,"y":0.0,"z":0.0,"facing":0.0},"hive.body":{"speed":1.0},"hive.traversal":{"clearanceCells":1,"maxStepCells":1},"hive.container":{"capacity":10}}},
                {"id":"worker-3","components":{"hive.party-member":{"party":"party"},"hive.position":{"x":0.0,"y":0.0,"z":0.0,"facing":0.0},"hive.body":{"speed":1.0},"hive.traversal":{"clearanceCells":1,"maxStepCells":1},"hive.container":{"capacity":10}}},
                {"id":"source","components":{"hive.position":{"x":0.0,"y":0.0,"z":0.0,"facing":0.0},"hive.container":{"capacity":64}}},
                {"id":"lot.1","components":{"hive.lot":{"kind":"stone-spoil","quantity":1,"container":"source"}}},
                {"id":"lot.2","components":{"hive.lot":{"kind":"stone-spoil","quantity":32,"container":"source"}}}
            ]
        }).to_string().as_str()).unwrap();
        kernel.load_environment(&crate::environment_definition::tests::fixture("construction")).unwrap();
        let surface = kernel.environment.as_mut().unwrap().world.surface_cells(&[(0, 0)]).unwrap().into_iter().next().flatten().unwrap().cell;
        let spacing = kernel.environment.as_ref().unwrap().world.cell_spacing_m();
        let contact = Point { x: (surface.x as f64 + 1.0) * spacing[0], y: (f64::from(surface.y) + 0.5) * spacing[1], z: surface.z as f64 * spacing[2], frame: None };
        for id in ["worker-1", "worker-2", "worker-3", "source"] {
            let entity = kernel.entity(id).unwrap();
            kernel.ecs.entity_mut(entity).insert(Position { x: contact.x, y: contact.y, z: contact.z, facing: 0.0 });
        }
        kernel.rebuild_physical_indexes(true).unwrap();
        (kernel, surface, contact)
    }

    #[test]
    fn construction_updates_the_native_task_index_without_a_rebuild() {
        let (mut kernel, surface, _) = world();
        let rebuilds = kernel.planner_index_rebuilds();
        finish_test_structure(&mut kernel, "indexed-floor", "floor", surface, "worker-1");
        assert!(crate::work_candidates::due_tasks_from_index(
            &kernel.planner_indexes,
            "party",
            u64::MAX,
            usize::MAX,
        )
        .iter()
        .all(|task| task.id != "indexed-floor"));
        assert_eq!(kernel.planner_index_rebuilds(), rebuilds);
    }

    fn install_placement_law_structures(kernel: &mut Kernel) {
        use crate::environment_definition::{StructureDefinition, StructureShape};
        let base = kernel.environment.as_ref().unwrap().structures.get("floor").unwrap().clone();
        for (id, shape) in [
            ("law-wall", StructureShape::Wall { height: 2 }),
            ("law-fixture", StructureShape::Fixture { footprint: vec![[0, 0]] }),
            ("law-stair", StructureShape::Stair { run: 1, rise: 1 }),
        ] {
            kernel.environment.as_mut().unwrap().structures.insert(id.into(), StructureDefinition { id: id.into(), shape, ..base.clone() });
        }
    }

    fn placement_row(kernel: &mut Kernel, party: &str, candidate: serde_json::Value) -> serde_json::Value {
        serde_json::from_str::<serde_json::Value>(&kernel.placement_decisions_json(&json!({"party":party,"candidates":[candidate]}).to_string()).unwrap()).unwrap()["decisions"][0].clone()
    }

    fn assert_ready_then_admitted(mut kernel: Kernel, candidate: serde_json::Value) {
        assert_eq!(placement_row(&mut kernel, "party", candidate.clone())["status"], "ready");
        let response: serde_json::Value = serde_json::from_str(&kernel.advance_json(&json!({"delta":0,"writes":[],"actions":[{"scope":{"kind":"host"},"request":{"kind":"plan-constructions","party":"party","plans":[candidate]}}]}).to_string()).unwrap()).unwrap();
        assert_eq!(response["results"][0]["accepted"], true, "{response}");
    }

    #[test]
    fn placement_preview_and_atomic_admission_share_geometry_laws() {
        for kind in ["floor", "fixture", "wall", "stair"] {
            let (mut kernel, surface, _) = world();
            install_placement_law_structures(&mut kernel);
            let candidate = match kind {
                "floor" => json!({"site":"preview-floor","catalog":"floor","target":{"kind":"cell","cell":{"x":surface.x,"y":surface.y,"z":surface.z},"orientation":"north"}}),
                "fixture" => json!({"site":"preview-fixture","catalog":"law-fixture","target":{"kind":"cell","cell":{"x":surface.x,"y":surface.y+1,"z":surface.z},"orientation":"north"}}),
                "wall" => json!({"site":"preview-wall","catalog":"law-wall","target":{"kind":"edge","edge":{"cell":{"x":surface.x,"y":surface.y+1,"z":surface.z},"axis":"x"}}}),
                "stair" => json!({"site":"preview-stair","catalog":"law-stair","target":{"kind":"cell","cell":{"x":surface.x,"y":surface.y,"z":surface.z},"orientation":"north"}}),
                _ => unreachable!(),
            };
            assert_ready_then_admitted(kernel, candidate);
        }

        let (mut kernel, surface, _) = world();
        let impossible = json!({"site":"unsupported-floor","catalog":"floor","target":{"kind":"cell","cell":{"x":surface.x,"y":surface.y+50,"z":surface.z},"orientation":"north"}});
        let placement_revision = kernel.placement_revision;
        let preview = placement_row(&mut kernel, "party", impossible.clone());
        assert_eq!(preview["status"], "rejected");
        assert!(preview["reason"].as_str().is_some_and(|reason| !reason.is_empty()));
        let response: serde_json::Value = serde_json::from_str(&kernel.advance_json(&json!({"delta":0,"writes":[],"actions":[{"scope":{"kind":"host"},"request":{"kind":"plan-constructions","party":"party","plans":[impossible]}}]}).to_string()).unwrap()).unwrap();
        assert_eq!(response["results"][0]["accepted"], false, "{response}");
        assert!(kernel.entity("unsupported-floor").is_err());
        assert_eq!(kernel.placement_revision, placement_revision, "rejected admission cannot invalidate geometry");
    }

    #[test]
    fn placement_batches_are_permutation_stable_and_never_cross_party() {
        let (mut kernel, surface, _) = world();
        let cells = kernel.environment.as_mut().unwrap().world.surface_cells(&[(surface.x, surface.z), (surface.x + 1, surface.z)]).unwrap();
        let right = cells[1].as_ref().expect("fixture has adjacent surface").cell;
        let left = json!({"site":"batch-a","catalog":"floor","target":{"kind":"cell","cell":{"x":surface.x,"y":surface.y,"z":surface.z},"orientation":"north"}});
        let right = json!({"site":"batch-b","catalog":"floor","target":{"kind":"cell","cell":{"x":right.x,"y":right.y,"z":right.z},"orientation":"north"}});
        let mut reversed = world().0;
        let forward: serde_json::Value = serde_json::from_str(&kernel.placement_decisions_json(&json!({"party":"party","candidates":[left.clone(),right.clone()]}).to_string()).unwrap()).unwrap();
        let backward: serde_json::Value = serde_json::from_str(&reversed.placement_decisions_json(&json!({"party":"party","candidates":[right.clone(),left.clone()]}).to_string()).unwrap()).unwrap();
        assert!(forward["decisions"].as_array().unwrap().iter().all(|row| row["status"] == "ready"));
        assert!(backward["decisions"].as_array().unwrap().iter().all(|row| row["status"] == "ready"));
        kernel.plan_constructions("party".into(), vec![
            serde_json::from_value(left.clone()).unwrap(), serde_json::from_value(right).unwrap(),
        ], &ActionScope::Host).unwrap();
        let entity = kernel.entity("batch-a").unwrap();
        kernel.ecs.entity_mut(entity).insert(OwnedByParty { party: "other-party".into() });
        let other = kernel.ecs.spawn((ExternalId("other-party".into()), Party {}, OwnedBy { player: "other-player".into() })).id();
        kernel.ids.insert("other-party".into(), other); kernel.known.insert("other-party".into());
        let cross = placement_row(&mut kernel, "party", left);
        assert_eq!(cross["status"], "rejected");
        assert_eq!(cross["reason"], "construction site belongs to another party");
    }

    #[test]
    fn placement_revision_changes_only_with_canonical_placement_geometry() {
        let (mut kernel, surface, _) = world();
        let initial = kernel.placement_revision;
        kernel.advance_json(r#"{"delta":0,"writes":[],"actions":[]}"#).unwrap();
        assert_eq!(kernel.placement_revision, initial, "an unchanged tick is not placement invalidation");
        kernel.plan_constructions("party".into(), vec![ConstructionPlan {
            site: "revision-floor".into(), catalog: "floor".into(),
            target: ConstructionTarget::Cell { cell: surface, orientation: crate::structure_geometry::Cardinal::North },
        }], &ActionScope::Host).unwrap();
        assert_eq!(kernel.placement_revision, initial + 1, "pending occupancy invalidates previews");

        let before_excavation = kernel.placement_revision;
        let excavation_cell = kernel.environment.as_mut().unwrap().world.surface_cells(&[(surface.x + 2, surface.z)]).unwrap()[0].as_ref().unwrap().cell;
        let expected = kernel.environment.as_mut().unwrap().world.surface_cells(&[(excavation_cell.x, excavation_cell.z)]).unwrap()[0].as_ref().unwrap().material;
        kernel.environment.as_mut().unwrap().excavation_rules.insert(expected, crate::environment_definition::ExcavationRule {
            work_seconds: 1.0, output_kind: "stone-spoil".into(), units_per_cell: 1,
        });
        let crate::terrain_water::ExcavationResult::Prepared(prepared) = kernel.environment.as_mut().unwrap().world.prepare_excavation(excavation_cell, expected, 0).unwrap() else { panic!("fixture excavation must prepare"); };
        kernel.complete_excavation(prepared, "source".into()).unwrap();
        assert_eq!(kernel.placement_revision, before_excavation + 1, "support terrain edits invalidate previews");

        let saved = kernel.save_records().unwrap();
        let mut restored = Kernel::new(); restored.restore_records(&saved).unwrap();
        assert_eq!(restored.placement_revision, 1, "restore initializes a fresh runtime invalidation frontier");
    }

    #[test]
    fn water_contacts_are_bounded_three_dimensional_and_stable() {
        let (mut kernel, _, _) = world();
        assert!(kernel.water_contacts_json("[]").is_err());
        let too_many = serde_json::to_string(&vec![[0.0_f64, 0.0, 0.0]; 17]).unwrap();
        assert!(kernel.water_contacts_json(&too_many).is_err());
        let facts = kernel.environment.as_ref().unwrap().world.facts().unwrap();
        let dry = facts.cells.iter().find(|cell| cell.level == 0).expect("fixture has dry cell");
        let spacing = kernel.environment.as_ref().unwrap().world.cell_spacing_m();
        let center = |at: [i32; 3]| [at[0] as f64 * spacing[0], (at[1] as f64 + 0.5) * spacing[1], at[2] as f64 * spacing[2]];
        let dry_center = center(dry.at);
        let first: serde_json::Value = serde_json::from_str(&kernel.water_contacts_json(&serde_json::to_string(&[dry_center]).unwrap()).unwrap()).unwrap();
        let second = kernel.water_contacts_json(&serde_json::to_string(&[dry_center]).unwrap()).unwrap();
        assert_eq!(first.to_string(), serde_json::from_str::<serde_json::Value>(&second).unwrap().to_string());
        let contacts = first.as_array().unwrap();
        assert!(contacts.iter().all(|contact| contact["at"] != serde_json::json!(dry.at)));
        let far = [dry_center[0], dry_center[1] + 100.0, dry_center[2]];
        assert!(serde_json::from_str::<serde_json::Value>(&kernel.water_contacts_json(&serde_json::to_string(&[far]).unwrap()).unwrap()).unwrap().as_array().unwrap().is_empty());
    }

    #[test]
    fn transfer_contacts_enumerate_traversable_targets_and_report_custody_states() {
        let (mut kernel, surface, contact) = world();
        let destination = kernel.ecs.spawn((ExternalId("transfer-destination".into()), Position { x: contact.x, y: contact.y, z: contact.z, facing: 0.0 }, Container { capacity: 4 })).id();
        kernel.ids.insert("transfer-destination".into(), destination);
        kernel.known.insert("transfer-destination".into());
        kernel.rebuild_physical_indexes(true).unwrap();
        let ready: serde_json::Value = serde_json::from_str(&kernel.transfer_contacts_json(r#"{"worker":"worker-1","container":"transfer-destination"}"#).unwrap()).unwrap();
        assert_eq!(ready["kind"], "ready");
        assert!(!ready["targets"].as_array().unwrap().is_empty());
        assert!(ready["targets"].as_array().unwrap().iter().all(|target| target["frame"].is_null()));

        kernel.ecs.entity_mut(destination).insert(SealedContainer {});
        let sealed: serde_json::Value = serde_json::from_str(&kernel.transfer_contacts_json(r#"{"worker":"worker-1","container":"transfer-destination"}"#).unwrap()).unwrap();
        assert_eq!(sealed, json!({"kind":"blocked","reason":"sealed"}));

        kernel.ecs.entity_mut(destination).remove::<SealedContainer>();
        kernel.ecs.entity_mut(kernel.entity("worker-1").unwrap()).insert(Position { x: contact.x + 100.0, y: contact.y, z: contact.z, facing: 0.0 });
        let remote: serde_json::Value = serde_json::from_str(&kernel.transfer_contacts_json(r#"{"worker":"worker-1","container":"transfer-destination"}"#).unwrap()).unwrap();
        assert_eq!(remote["kind"], "ready");
        assert_eq!(remote["targets"], ready["targets"]);
        let _ = surface;
    }

    #[test]
    fn transfer_contacts_reject_container_custody_cycles() {
        let (mut kernel, _, _) = world();
        let a = kernel.ecs.spawn((ExternalId("cycle-a".into()), Container { capacity: 1 }, Lot { kind: "wood".into(), quantity: 1, container: "cycle-b".into() })).id();
        let b = kernel.ecs.spawn((ExternalId("cycle-b".into()), Container { capacity: 1 }, Lot { kind: "wood".into(), quantity: 1, container: "cycle-a".into() })).id();
        kernel.ids.insert("cycle-a".into(), a); kernel.ids.insert("cycle-b".into(), b);
        kernel.known.insert("cycle-a".into()); kernel.known.insert("cycle-b".into());
        assert_eq!(kernel.transfer_contacts_json(r#"{"worker":"worker-1","container":"cycle-a"}"#).unwrap_err(), "container custody cycle");
    }

    fn setup(kernel: &mut Kernel, surface: crate::generation::Cell, contact: &Point) {
        let batch = json!({"delta":0.0,"writes":[],"actions":[{"scope":{"kind":"host"},"request":
            {"kind":"plan-constructions","party":"party","plans":[{"catalog":"floor","site":"site-1","target":{"kind":"cell","cell":{"x":surface.x,"y":surface.y,"z":surface.z},"orientation":"north"}}]}},{"scope":{"kind":"host"},"request":
            {"kind":"bind-construction-stage","site":"site-1","contact":contact}},{"scope":{"kind":"host"},"request":
            {"kind":"transfer","lot":"lot.1","from":"source","to":"site-1","quantity":1}
        }]});
        let response: serde_json::Value = serde_json::from_str(&kernel.advance_json(&batch.to_string()).unwrap()).unwrap();
        assert!(response["results"].as_array().unwrap().iter().all(|result| result["accepted"] == true));
        let route = json!({"delta":0.0,"writes":[],"actions":[{"scope":{"kind":"host"},"request":{"kind":"begin-work-attempt","task":"site-1","worker":"worker-1","operation":{"kind":"route","destination":contact}}}]});
        let result: serde_json::Value = serde_json::from_str(&kernel.advance_json(&route.to_string()).unwrap()).unwrap();
        let generation = result["results"][0]["attempt"]["generation"].as_u64().unwrap();
        let continue_action = json!({"delta":0.0,"writes":[],"actions":[{"scope":{"kind":"host"},"request":{"kind":"continue-work-attempt","task":"site-1","generation":generation,"sequence":1,"nextActivity":{"kind":"construction","site":"site-1","contact":contact,"mode":"work"}}}]});
        let continued: serde_json::Value = serde_json::from_str(&kernel.advance_json(&continue_action.to_string()).unwrap()).unwrap();
        assert!(continued["results"][0]["accepted"] == true, "{continued}");
    }

    fn begin_construction(kernel: &mut Kernel, worker: &str, site: &str, contact: &Point) {
        let route = json!({"delta":0,"writes":[],"actions":[{"scope":{"kind":"host"},"request":{"kind":"begin-work-attempt","task":site,"worker":worker,"operation":{"kind":"route","destination":contact}}}]});
        let result: serde_json::Value = serde_json::from_str(&kernel.advance_json(&route.to_string()).unwrap()).unwrap();
        assert!(result["results"][0]["accepted"] == true, "{result}");
        let generation = result["results"][0]["attempt"]["generation"].as_u64().unwrap();
        let next = json!({"delta":0,"writes":[],"actions":[{"scope":{"kind":"host"},"request":{"kind":"continue-work-attempt","task":site,"generation":generation,"sequence":1,"nextActivity":{"kind":"construction","site":site,"contact":contact,"mode":"work"}}}]});
        let result: serde_json::Value = serde_json::from_str(&kernel.advance_json(&next.to_string()).unwrap()).unwrap();
        assert!(result["results"][0]["accepted"] == true, "{result}");
    }

    fn acknowledge_attempt(kernel: &mut Kernel, task: &str) {
        let entity = kernel.work_attempts.get(task).copied().unwrap();
        let attempt = kernel.ecs.get::<WorkAttempt>(entity).cloned().unwrap();
        let sequence = attempt.current_operation().unwrap().sequence;
        if matches!(attempt.phase, AttemptPhase::Executing { .. }) {
            kernel.interrupt_work_attempt(task.to_string(), attempt.key.generation, sequence, InterruptCause::Cancelled).unwrap();
        }
        kernel.acknowledge_work_attempt(task.to_string(), attempt.key.generation, sequence).unwrap();
    }

    fn install_floor_alt_and_furniture(kernel: &mut Kernel) {
        use crate::environment_definition::{CompletionRecipe, PortDefinition, StructureDefinition, StructureShape};
        let base = kernel.environment.as_ref().unwrap().structures.get("floor").unwrap().clone();
        let bed = StructureDefinition { id: "timber-bed".into(), shape: StructureShape::Fixture { footprint: vec![[0, 0], [0, 1]] }, on_complete: CompletionRecipe { components: vec![], ports: vec![PortDefinition { key: "sleep".into(), components: vec![("hive.container".into(), record(&Container { capacity: 1 }))], at_site_contact: true }] }, ..base.clone() };
        let brewer = StructureDefinition { id: "brew-station".into(), shape: StructureShape::Fixture { footprint: vec![[0, 0], [1, 0], [0, 1], [1, 1]] }, on_complete: CompletionRecipe { components: vec![], ports: vec![PortDefinition { key: "kettle".into(), components: vec![("hive.container".into(), record(&Container { capacity: 2 }))], at_site_contact: true }] }, ..base.clone() };
        let alt = StructureDefinition { id: "floor-alt".into(), ..base };
        let environment = kernel.environment.as_mut().unwrap();
        environment.structures.insert("floor-alt".into(), alt);
        environment.structures.insert("timber-bed".into(), bed);
        environment.structures.insert("brew-station".into(), brewer);
        let mut source: serde_json::Value = serde_json::from_str(&environment.definition).unwrap();
        let base = source["structures"]["catalog"][0].clone();
        let mut alternate = base.clone();
        alternate["id"] = json!("floor-alt");
        let mut bed = base.clone();
        bed["id"] = json!("timber-bed");
        bed["shape"] = json!({"kind":"fixture","footprint":[[0,0],[0,1]]});
        bed["onComplete"] = json!({"ports":[{"key":"sleep","at":"site-contact","components":[{"name":"hive.container","value":{"capacity":1}}]}]});
        let mut brewer = base;
        brewer["id"] = json!("brew-station");
        brewer["shape"] = json!({"kind":"fixture","footprint":[[0,0],[1,0],[0,1],[1,1]]});
        brewer["onComplete"] = json!({"ports":[{"key":"kettle","at":"site-contact","components":[{"name":"hive.container","value":{"capacity":2}}]}]});
        let catalog = source["structures"]["catalog"].as_array_mut().unwrap();
        catalog.extend([alternate, bed, brewer]);
        environment.definition = source.to_string();
    }

    fn finish_test_structure(kernel: &mut Kernel, site: &str, catalog: &str, at: crate::generation::Cell, worker: &str) {
        let planned: serde_json::Value = serde_json::from_str(&kernel.advance_json(&json!({"delta":0,"writes":[],"actions":[{"scope":{"kind":"host"},"request":{
            "kind":"plan-constructions","party":"party","plans":[{"catalog":catalog,"site":site,"target":{"kind":"cell","cell":{"x":at.x,"y":at.y,"z":at.z},"orientation":"north"}
        }]}}]}).to_string()).unwrap()).unwrap();
        assert_eq!(planned["results"][0]["accepted"], true, "{planned}");
        assert!(crate::work_candidates::due_tasks_from_index(
            &kernel.planner_indexes,
            "party",
            u64::MAX,
            usize::MAX,
        )
        .iter()
        .any(|task| task.id == site));
        let access: serde_json::Value = serde_json::from_str(&kernel.construction_access_json(&serde_json::to_string(&[site]).unwrap()).unwrap()).unwrap();
        let selected = &access[0]["contacts"][0];
        let contact = Point {
            x: selected["x"].as_f64().expect("contact x"),
            y: selected["y"].as_f64().expect("contact y"),
            z: selected["z"].as_f64().expect("contact z"),
            frame: selected["frame"].as_str().map(str::to_owned),
        };
        kernel.ecs.entity_mut(kernel.entity(worker).unwrap()).insert(Position { x: contact.x, y: contact.y, z: contact.z, facing: 0.0 });
        kernel.ecs.entity_mut(kernel.entity("source").unwrap()).insert(Position { x: contact.x, y: contact.y, z: contact.z, facing: 0.0 });
        let material_lot = source_stone_lot(kernel);
        let staged: serde_json::Value = serde_json::from_str(&kernel.advance_json(&json!({"delta":0,"writes":[],"actions":[{"scope":{"kind":"host"},"request":
            {"kind":"bind-construction-stage","site":site,"contact":contact}},{"scope":{"kind":"host"},"request":
            {"kind":"transfer","lot":material_lot,"from":"source","to":site,"quantity":1}},
        ]}).to_string()).unwrap()).unwrap();
        assert!(staged["results"].as_array().unwrap().iter().all(|entry| entry["accepted"] == true), "{site}: {staged}");
        begin_construction(kernel, worker, site, &contact);
        for _ in 0..16 {
            if kernel.ecs.get::<ConstructionSite>(kernel.entity(site).unwrap()).unwrap().phase == ConstructionPhase::Finished { break; }
            kernel.advance_json(r#"{"delta":1,"writes":[],"actions":[]}"#).unwrap();
        }
        let phase = kernel.ecs.get::<ConstructionSite>(kernel.entity(site).unwrap()).unwrap().phase;
        let final_access = kernel.construction_access_json(&serde_json::to_string(&[site]).unwrap()).unwrap();
        assert_eq!(phase, ConstructionPhase::Finished, "{site}: {final_access}");
        // The fixture's finished operation has been observed; acknowledge it
        // so later fixture construction can reuse the worker through the same
        // durable terminal boundary as the provider.
        if let Some(attempt_entity) = kernel.work_attempts.get(site).copied() {
            if let Some(attempt) = kernel.ecs.get::<WorkAttempt>(attempt_entity).cloned() {
                if let (AttemptPhase::Outcome { operation, .. }, true) = (&attempt.phase, attempt.key.task == site) {
                    kernel.acknowledge_work_attempt(site.to_string(), attempt.key.generation, operation.sequence).expect("fixture terminal acknowledgement");
                }
            }
        }
    }

    fn source_stone_lot(kernel: &Kernel) -> String {
        kernel.ids.iter().find_map(|(id, entity)| kernel.ecs.get::<Lot>(*entity)
            .filter(|lot| lot.container == "source" && lot.kind == "stone-spoil" && lot.quantity > 0)
            .map(|_| id.clone())).expect("source retains construction stock")
    }

    fn construct_brew_fixture(kernel: &mut Kernel, excluded: crate::generation::Cell) -> (crate::generation::Cell, String) {
        let mut origin = None;
        let bounds = kernel.environment.as_ref().unwrap().world.bounds();
        'search: for x in bounds.min_x + 2..bounds.max_x - 3 {
            for z in bounds.min_z + 2..bounds.max_z - 3 {
                if x == excluded.x && z == excluded.z { continue; }
                let columns = [(x, z), (x + 1, z), (x, z + 1), (x + 1, z + 1)];
                let cells = kernel.environment.as_mut().unwrap().world.surface_cells(&columns).unwrap();
                let Some(first) = cells[0].as_ref().map(|surface| surface.cell) else { continue; };
                if cells.iter().all(|surface| surface.as_ref().is_some_and(|value| value.cell.y == first.y)) {
                    origin = Some(first); break 'search;
                }
            }
        }
        let origin = origin.expect("fixture terrain contains a flat 2x2 surface");
        for (index, (dx, dz)) in [(0, 0), (1, 0), (0, 1), (1, 1)].into_iter().enumerate() {
            finish_test_structure(kernel, &format!("floor-brew-{index}"), "floor", crate::generation::Cell { x: origin.x + dx, y: origin.y, z: origin.z + dz }, if index % 2 == 0 { "worker-2" } else { "worker-3" });
        }
        let parking = {
            let world = &mut kernel.environment.as_mut().unwrap().world;
            let mut parking = None;
            'parking: for x in bounds.min_x..bounds.max_x {
                for z in bounds.min_z..bounds.max_z {
                    if (x >= origin.x - 1 && x <= origin.x + 2) || (z >= origin.z - 1 && z <= origin.z + 2) { continue; }
                    if let Some(surface) = world.surface_cells(&[(x, z)]).unwrap().into_iter().next().flatten() {
                        parking = Some(surface.cell);
                        break 'parking;
                    }
                }
            }
            parking.expect("fixture terrain contains parking outside the brewer footprint")
        };
        let spacing = kernel.environment.as_ref().unwrap().world.cell_spacing_m();
        let parked = Position {
            x: parking.x as f64 * spacing[0],
            y: (f64::from(parking.y) + 0.5) * spacing[1],
            z: parking.z as f64 * spacing[2],
            facing: 0.0,
        };
        for worker in ["worker-1", "worker-2", "worker-3"] {
            kernel.ecs.entity_mut(kernel.entity(worker).unwrap()).insert(parked.clone());
        }
        kernel.rebuild_physical_indexes(true).unwrap();
        finish_test_structure(kernel, "brew-1", "brew-station", crate::generation::Cell { x: origin.x, y: origin.y + 1, z: origin.z }, "worker-2");
        let lot = kernel.complete_material_output(MaterialOutputSpec { container: "brew-1:kettle".into(), kind: "stone-spoil".into(), quantity: 1, water_kg: None }).unwrap();
        (origin, lot)
    }

    fn install_floor_storage_recipe(kernel: &mut Kernel) {
        use crate::environment_definition::{CompletionRecipe, PortDefinition};
        let environment = kernel.environment.as_mut().unwrap();
        environment.structures.get_mut("floor").unwrap().on_remove = crate::environment_definition::RemovalRecipe { salvage: [("stone-spoil".into(), 1)].into_iter().collect(), empty_ports: ["storage".into()].into_iter().collect() };
        environment.structures.get_mut("floor").unwrap().on_complete = CompletionRecipe {
            components: vec![],
            ports: vec![PortDefinition {
                key: "storage".into(),
                at_site_contact: true,
                components: vec![
                    ("hive.container".into(), record(&Container { capacity: 6 })),
                    ("hive.storage-provider".into(), record(&StorageProvider {})),
                ],
            }],
        };
        let mut definition: serde_json::Value = serde_json::from_str(&environment.definition).unwrap();
        definition["structures"]["catalog"][0]["onComplete"] = json!({
            "ports":[{"key":"storage","at":"site-contact","components":[
                {"name":"hive.container","value":{"capacity":6}},
                {"name":"hive.storage-provider","value":{}}
            ]}]
        });
        environment.definition = definition.to_string();
    }

    fn install_test_wall_catalog(kernel: &mut Kernel) {
        use crate::environment_definition::{RemovalRecipe, StructureDefinition, StructureShape};
        kernel.environment.as_mut().unwrap().structures.insert("test-wall".into(), StructureDefinition {
            id: "test-wall".into(), shape: StructureShape::Wall { height: 4 },
            materials: BTreeMap::new(), work_seconds: 1.0, work_reach_below_cells: 0,
            on_complete: Default::default(), on_remove: RemovalRecipe::default(),
        });
    }

    fn install_committed_test_wall(kernel: &mut Kernel, id: &str, edge: crate::structure_geometry::Face, contact: &Point) {
        let state = ConstructionSite {
            catalog: "test-wall".into(), target: ConstructionTarget::Edge { edge },
            seconds: 1.0, phase: ConstructionPhase::Finished,
        };
        let entity = kernel.ecs.spawn((ExternalId(id.into()), Container { capacity: 0 }, SealedContainer {}, state,
            Position { x: contact.x, y: contact.y, z: contact.z, facing: 0.0 }, OwnedByParty { party: "party".into() })).id();
        kernel.ids.insert(id.into(), entity); kernel.known.insert(id.into()); kernel.contents.insert(id.into(), BTreeSet::new());
    }

    fn apply_test_walls(kernel: &mut Kernel, walls: Vec<crate::structure_geometry::StaticInstance>) {
        let prepared = kernel.environment.as_mut().unwrap().world.prepare_structures(walls).unwrap().unwrap();
        kernel.environment.as_mut().unwrap().world.apply_structures(prepared).unwrap();
        kernel.refresh_state_weight();
        kernel.rebuild_physical_indexes(true).unwrap();
    }

    fn move_worker_to_deconstruction_contact(kernel: &mut Kernel, worker: &str, site: &str) {
        let rows: serde_json::Value = serde_json::from_str(&kernel.deconstruction_access_json(&serde_json::to_string(&[site]).unwrap()).unwrap()).unwrap();
        let contact = &rows[0]["contacts"][0];
        let entity = kernel.entity(worker).unwrap();
        kernel.ecs.entity_mut(entity).insert(Position {
            x: contact["x"].as_f64().unwrap(), y: contact["y"].as_f64().unwrap(), z: contact["z"].as_f64().unwrap(), facing: 0.0,
        });
        kernel.rebuild_physical_indexes(true).unwrap();
    }

    #[test]
    fn floor_operation_query_reports_invalid_and_waiting_without_inventing_support() {
        let (mut kernel, surface, contact) = world();
        let invalid: serde_json::Value = serde_json::from_str(&kernel.floor_operations_json(r#"[{"cell":[0,0,0],"desiredCatalog":"missing"}]"#).unwrap()).unwrap();
        assert_eq!(invalid[0]["kind"], "invalid");
        let far = json!([{"cell":[31,39,31],"desiredCatalog":"floor"}]).to_string();
        let waiting: serde_json::Value = serde_json::from_str(&kernel.floor_operations_json(&far).unwrap()).unwrap();
        assert_eq!(waiting[0]["kind"], "waiting-for-support");
        setup(&mut kernel, surface, &contact);
        kernel.advance_json(r#"{"delta":1,"writes":[],"actions":[]}"#).unwrap();
        let same: serde_json::Value = serde_json::from_str(&kernel.floor_operations_json(&json!([{"cell":[surface.x,surface.y,surface.z],"desiredCatalog":"floor"}]).to_string()).unwrap()).unwrap();
        assert_eq!(same[0]["kind"], "unchanged");
    }

    #[test]
    fn floor_same_finish_is_explicitly_unchanged_and_conflicting_designation_is_reported() {
        let (mut kernel, surface, contact) = world();
        setup(&mut kernel, surface, &contact);
        kernel.advance_json(r#"{"delta":1,"writes":[],"actions":[]}"#).unwrap();
        let request = json!([{"cell":[surface.x,surface.y,surface.z],"desiredCatalog":"floor"}]).to_string();
        let result: serde_json::Value = serde_json::from_str(&kernel.floor_operations_json(&request).unwrap()).unwrap();
        assert_eq!(result[0]["kind"], "unchanged");
        let alternate = kernel.environment.as_ref().unwrap().structures.get("floor").unwrap().clone();
        kernel.environment.as_mut().unwrap().structures.insert("floor-alt".into(), crate::environment_definition::StructureDefinition { id: "floor-alt".into(), ..alternate });
        kernel.advance_json(r#"{"delta":0,"writes":[],"actions":[{"scope":{"kind":"host"},"request":{"kind":"replace-floor","orderId":"replace-conflict","existingFloorId":"site-1","desiredCatalog":"floor-alt"}}]}"#).unwrap();
        let conflict: serde_json::Value = serde_json::from_str(&kernel.floor_operations_json(&json!([{"cell":[surface.x,surface.y,surface.z],"desiredCatalog":"floor-alt"}]).to_string()).unwrap()).unwrap();
        assert_eq!(conflict[0]["kind"], "conflict");
    }

    #[test]
    fn floor_replacement_cancel_and_target_mutation_are_terminal_without_publication() {
        let (mut kernel, surface, contact) = world();
        setup(&mut kernel, surface, &contact);
        kernel.advance_json(r#"{"delta":1,"writes":[],"actions":[]}"#).unwrap();
        let alternate = kernel.environment.as_ref().unwrap().structures.get("floor").unwrap().clone();
        kernel.environment.as_mut().unwrap().structures.insert("floor-alt".into(), crate::environment_definition::StructureDefinition { id: "floor-alt".into(), ..alternate });
        kernel.advance_json(r#"{"delta":0,"writes":[],"actions":[{"scope":{"kind":"host"},"request":{"kind":"replace-floor","orderId":"replace-cancel","existingFloorId":"site-1","desiredCatalog":"floor-alt"}}]}"#).unwrap();
        let material_lot = source_stone_lot(&kernel);
        kernel.advance_json(&json!({"delta":0,"writes":[],"actions":[{"scope":{"kind":"host"},"request":{"kind":"bind-construction-stage","site":"replace-cancel","contact":contact}},{"scope":{"kind":"host"},"request":{"kind":"transfer","lot":material_lot,"from":"source","to":"replace-cancel","quantity":1}}]}).to_string()).unwrap();
        begin_construction(&mut kernel, "worker-2", "replace-cancel", &contact);
        let target_entity = kernel.entity("site-1").unwrap();
        let mut target_state = kernel.ecs.get::<ConstructionSite>(target_entity).unwrap().clone();
        target_state.catalog = "floor-alt".into();
        kernel.ecs.entity_mut(target_entity).insert(target_state);
        let mut rejected = None;
        for _ in 0..16 {
            match kernel.advance_json(r#"{"delta":1,"writes":[],"actions":[]}"#) {
                Ok(_) => {}
                Err(reason) => { rejected = Some(reason); break; }
            }
        }
        assert_eq!(rejected.as_deref(), Some("floor replacement target changed"));
        assert!(kernel.ecs.get::<FloorReplacement>(kernel.entity("replace-cancel").unwrap()).is_some_and(|replacement| replacement.phase == FloorReplacementPhase::Working));
        assert!(kernel.contents.get("replace-cancel").is_some_and(|lots| !lots.is_empty()));

        let (mut cancelled, surface, contact) = world();
        setup(&mut cancelled, surface, &contact);
        cancelled.advance_json(r#"{"delta":1,"writes":[],"actions":[]}"#).unwrap();
        let alternate = cancelled.environment.as_ref().unwrap().structures.get("floor").unwrap().clone();
        cancelled.environment.as_mut().unwrap().structures.insert("floor-alt".into(), crate::environment_definition::StructureDefinition { id: "floor-alt".into(), ..alternate });
        cancelled.advance_json(r#"{"delta":0,"writes":[],"actions":[{"scope":{"kind":"host"},"request":{"kind":"replace-floor","orderId":"replace-cancel","existingFloorId":"site-1","desiredCatalog":"floor-alt"}}]}"#).unwrap();
        let material_lot = source_stone_lot(&cancelled);
        cancelled.advance_json(&json!({"delta":0,"writes":[],"actions":[{"scope":{"kind":"host"},"request":{"kind":"bind-construction-stage","site":"replace-cancel","contact":contact}},{"scope":{"kind":"host"},"request":{"kind":"transfer","lot":material_lot,"from":"source","to":"replace-cancel","quantity":1}}]}).to_string()).unwrap();
        begin_construction(&mut cancelled, "worker-2", "replace-cancel", &contact);
        let staged_lot = cancelled.contents["replace-cancel"].iter().next().and_then(|entity| cancelled.ecs.get::<ExternalId>(*entity)).unwrap().0.clone();
        let cancelled_result: serde_json::Value = serde_json::from_str(&cancelled.advance_json(r#"{"delta":0,"writes":[],"actions":[{"scope":{"kind":"host"},"request":{"kind":"cancel-work","entity":"worker-2"}}]}"#).unwrap()).unwrap();
        assert_eq!(cancelled_result["results"][0]["accepted"], true);
        assert!(cancelled.ecs.get::<FloorReplacement>(cancelled.entity("replace-cancel").unwrap()).is_some_and(|replacement| replacement.phase == FloorReplacementPhase::Queued));
        let recovered: serde_json::Value = serde_json::from_str(&cancelled.advance_json(&json!({"delta":0,"writes":[],"actions":[{"scope":{"kind":"host"},"request":{"kind":"transfer","lot":staged_lot,"from":"replace-cancel","to":"source","quantity":1}}]}).to_string()).unwrap()).unwrap();
        assert_eq!(recovered["results"][0]["accepted"], true, "{recovered}");
        assert!(cancelled.contents["replace-cancel"].is_empty());
    }

    #[test]
    fn floor_replacement_preserves_brewer_identity_port_contents_and_support() {
        let (mut kernel, surface, contact) = world();
        install_floor_alt_and_furniture(&mut kernel);
        setup(&mut kernel, surface, &contact);
        kernel.advance_json(r#"{"delta":1,"writes":[],"actions":[]}"#).unwrap();
        let (brew_support, kettle_lot) = construct_brew_fixture(&mut kernel, surface);
        let fixture_before: Vec<_> = kernel.environment.as_ref().unwrap().world.structure_instances().into_iter()
            .filter(|instance| matches!(instance, crate::structure_geometry::StaticInstance::Fixture { id, .. } if id == "brew-1"))
            .collect();
        let brew_entity = kernel.entity("brew-1").unwrap();
        let brew_site_before = record(kernel.ecs.get::<ConstructionSite>(brew_entity).unwrap());
        let brew_position_before = record(kernel.ecs.get::<Position>(brew_entity).unwrap());
        let port_entity = kernel.entity("brew-1:kettle").unwrap();
        let port_before = record(kernel.ecs.get::<Container>(port_entity).unwrap());
        let port_position_before = record(kernel.ecs.get::<Position>(port_entity).unwrap());
        let floor_before = kernel.ecs.get::<ConstructionSite>(kernel.entity("floor-brew-0").unwrap()).unwrap().clone();
        let kettle_before = kernel.ecs.get::<Lot>(kernel.entity(&kettle_lot).unwrap()).unwrap().clone();
        let alternate = kernel.environment.as_ref().unwrap().structures.get("floor").unwrap().clone();
        kernel.environment.as_mut().unwrap().structures.insert("floor-alt".into(), crate::environment_definition::StructureDefinition { id: "floor-alt".into(), ..alternate });
        let preview = json!({"site":"replace-1","catalog":"floor-alt","target":{"kind":"cell","cell":{"x":brew_support.x,"y":brew_support.y,"z":brew_support.z},"orientation":"north"}});
        assert_eq!(placement_row(&mut kernel, "party", preview)["status"], "ready", "floor replacement preview must remain lawful beneath furniture");
        let queued: serde_json::Value = serde_json::from_str(&kernel.advance_json(r#"{"delta":0,"writes":[],"actions":[{"scope":{"kind":"host"},"request":{"kind":"replace-floor","orderId":"replace-1","existingFloorId":"floor-brew-0","desiredCatalog":"floor-alt"}}]}"#).unwrap()).unwrap();
        assert_eq!(queued["results"][0]["accepted"], true);
        let access: serde_json::Value = serde_json::from_str(&kernel.construction_access_json(r#"["replace-1"]"#).unwrap()).unwrap();
        let selected = &access[0]["contacts"][0];
        let bed_contact = Point {
            x: selected["x"].as_f64().unwrap(), y: selected["y"].as_f64().unwrap(), z: selected["z"].as_f64().unwrap(),
            frame: selected["frame"].as_str().map(str::to_owned),
        };
        kernel.ecs.entity_mut(kernel.entity("worker-2").unwrap()).insert(Position { x: bed_contact.x, y: bed_contact.y, z: bed_contact.z, facing: 0.0 });
        let material_lot = source_stone_lot(&kernel);
        kernel.advance_json(&json!({"delta":0,"writes":[],"actions":[{"scope":{"kind":"host"},"request":{"kind":"bind-construction-stage","site":"replace-1","contact":bed_contact}},{"scope":{"kind":"host"},"request":{"kind":"transfer","lot":material_lot,"from":"source","to":"replace-1","quantity":1}}]}).to_string()).unwrap();
        begin_construction(&mut kernel, "worker-2", "replace-1", &bed_contact);
        let staged_lots: serde_json::Value = serde_json::from_str(&kernel.query_json(r#"["hive.lot"]"#).unwrap()).unwrap();
        for _ in 0..16 {
            if kernel.ecs.get::<FloorReplacement>(kernel.entity("replace-1").unwrap()).unwrap().phase == FloorReplacementPhase::Completed { break; }
            kernel.advance_json(r#"{"delta":1,"writes":[],"actions":[]}"#).unwrap();
        }
        let replaced = kernel.ecs.get::<ConstructionSite>(kernel.entity("floor-brew-0").unwrap()).unwrap();
        assert_eq!(replaced.catalog, "floor-alt");
        assert_eq!((replaced.target, replaced.seconds, replaced.phase), (floor_before.target, floor_before.seconds, floor_before.phase));
        let replacement = kernel.ecs.get::<FloorReplacement>(kernel.entity("replace-1").unwrap()).unwrap();
        assert!(replacement.phase == FloorReplacementPhase::Completed);
        assert_eq!(kernel.environment.as_ref().unwrap().world.structure_instances().iter().filter(|instance| matches!(instance, crate::structure_geometry::StaticInstance::Floor { id, support } if id == "floor-brew-0" && *support == brew_support)).count(), 1);
        let fixture_after: Vec<_> = kernel.environment.as_ref().unwrap().world.structure_instances().into_iter()
            .filter(|instance| matches!(instance, crate::structure_geometry::StaticInstance::Fixture { id, .. } if id == "brew-1"))
            .collect();
        assert_eq!(fixture_after, fixture_before);
        assert_eq!(record(kernel.ecs.get::<ConstructionSite>(brew_entity).unwrap()), brew_site_before);
        assert_eq!(record(kernel.ecs.get::<Position>(brew_entity).unwrap()), brew_position_before);
        assert_eq!(record(kernel.ecs.get::<Container>(port_entity).unwrap()), port_before);
        assert_eq!(record(kernel.ecs.get::<Position>(port_entity).unwrap()), port_position_before);
        let kettle_after = kernel.ecs.get::<Lot>(kernel.entity(&kettle_lot).unwrap()).unwrap();
        assert_eq!(kettle_after.kind, kettle_before.kind);
        assert_eq!(kettle_after.quantity, kettle_before.quantity);
        assert_eq!(kettle_after.container, kettle_before.container);
        let finished_lots: serde_json::Value = serde_json::from_str(&kernel.query_json(r#"["hive.lot"]"#).unwrap()).unwrap();
        assert!(finished_lots != staged_lots);
        let second: serde_json::Value = serde_json::from_str(&kernel.floor_operations_json(&json!([{"cell":[brew_support.x,brew_support.y,brew_support.z],"desiredCatalog":"floor-alt"}]).to_string()).unwrap()).unwrap();
        assert_eq!(second[0]["kind"], "unchanged");
        let saved = kernel.save_records().unwrap();
        let mut restored = Kernel::new(); restored.restore_records(&saved).unwrap();
        assert_eq!(restored.query_json(r#"["hive.floor-replacement"]"#).unwrap(), kernel.query_json(r#"["hive.floor-replacement"]"#).unwrap());
    }

    #[test]
    fn floor_replacement_preserves_bed_identity_port_and_support() {
        let (mut kernel, surface, contact) = world();
        install_floor_alt_and_furniture(&mut kernel);
        setup(&mut kernel, surface, &contact);
        kernel.advance_json(r#"{"delta":1,"writes":[],"actions":[]}"#).unwrap();

        let bounds = kernel.environment.as_ref().unwrap().world.bounds();
        let mut bed_origin = None;
        'search: for x in bounds.min_x + 2..bounds.max_x - 2 {
            for z in bounds.min_z + 2..bounds.max_z - 3 {
                let cells = kernel.environment.as_mut().unwrap().world.surface_cells(&[(x, z), (x, z + 1)]).unwrap();
                let Some(first) = cells[0].as_ref().map(|surface| surface.cell) else { continue; };
                if cells[1].as_ref().is_some_and(|value| value.cell.y == first.y) {
                    bed_origin = Some(first);
                    break 'search;
                }
            }
        }
        let bed_origin = bed_origin.expect("fixture terrain contains a flat bed surface");
        finish_test_structure(&mut kernel, "floor-bed-0", "floor", bed_origin, "worker-2");
        finish_test_structure(&mut kernel, "floor-bed-1", "floor", crate::generation::Cell { x: bed_origin.x, y: bed_origin.y, z: bed_origin.z + 1 }, "worker-3");
        finish_test_structure(&mut kernel, "bed-1", "timber-bed", crate::generation::Cell { x: bed_origin.x, y: bed_origin.y + 1, z: bed_origin.z }, "worker-2");

        let bed_entity = kernel.entity("bed-1").unwrap();
        let bed_before = record(kernel.ecs.get::<ConstructionSite>(bed_entity).unwrap());
        let position_before = record(kernel.ecs.get::<Position>(bed_entity).unwrap());
        let sleep_before = record(kernel.ecs.get::<Container>(kernel.entity("bed-1:sleep").unwrap()).unwrap());
        let sleep_lot_id = kernel.complete_material_output(MaterialOutputSpec {
            container: "bed-1:sleep".into(), kind: "blanket".into(), quantity: 1, water_kg: None,
        }).unwrap();
        let sleep_lot_before = kernel.ecs.get::<Lot>(kernel.entity(&sleep_lot_id).unwrap()).unwrap().clone();
        let bed_instances_before: Vec<_> = kernel.environment.as_ref().unwrap().world.structure_instances().into_iter()
            .filter(|instance| matches!(instance, crate::structure_geometry::StaticInstance::Fixture { id, .. } if id == "bed-1"))
            .collect();
        let material_total_before: u64 = kernel.ids.values().filter_map(|entity| kernel.ecs.get::<Lot>(*entity)).map(|lot| u64::from(lot.quantity)).sum();
        let floor_id = "floor-bed-0";
        let support = crate::generation::Cell { x: bed_origin.x, y: bed_origin.y, z: bed_origin.z };
        let original_floor = kernel.ecs.get::<ConstructionSite>(kernel.entity(floor_id).unwrap()).unwrap().clone();
        let replacement_cost: u64 = kernel.environment.as_ref().unwrap().structures.get("floor-alt").unwrap().materials.values().map(|quantity| u64::from(*quantity)).sum();
        let queued: serde_json::Value = serde_json::from_str(&kernel.advance_json(r#"{"delta":0,"writes":[],"actions":[{"scope":{"kind":"host"},"request":{"kind":"replace-floor","orderId":"replace-bed-floor","existingFloorId":"floor-bed-0","desiredCatalog":"floor-alt"}}]}"#).unwrap()).unwrap();
        assert_eq!(queued["results"][0]["accepted"], true, "{queued}");
        let access: serde_json::Value = serde_json::from_str(&kernel.construction_access_json(r#"["replace-bed-floor"]"#).unwrap()).unwrap();
        let selected = &access[0]["contacts"][0];
        let replacement_contact = Point { x: selected["x"].as_f64().unwrap(), y: selected["y"].as_f64().unwrap(), z: selected["z"].as_f64().unwrap(), frame: selected["frame"].as_str().map(str::to_owned) };
        kernel.ecs.entity_mut(kernel.entity("worker-2").unwrap()).insert(Position { x: replacement_contact.x, y: replacement_contact.y, z: replacement_contact.z, facing: 0.0 });
        let material_lot = source_stone_lot(&kernel);
        kernel.advance_json(&json!({"delta":0,"writes":[],"actions":[
            {"scope":{"kind":"host"},"request":{"kind":"bind-construction-stage","site":"replace-bed-floor","contact":replacement_contact}},
            {"scope":{"kind":"host"},"request":{"kind":"transfer","lot":material_lot,"from":"source","to":"replace-bed-floor","quantity":1}}
        ]}).to_string()).unwrap();
        begin_construction(&mut kernel, "worker-2", "replace-bed-floor", &replacement_contact);
        let staged_save = kernel.save_records().unwrap();
        let mut resumed = Kernel::new();
        resumed.restore_records(&staged_save).unwrap();
        assert_eq!(resumed.ecs.get::<FloorReplacement>(resumed.entity("replace-bed-floor").unwrap()).unwrap().phase, FloorReplacementPhase::Working);
        assert!(!resumed.contents.get("replace-bed-floor").unwrap().is_empty(), "staged material must survive restore");
        kernel = resumed;
        for _ in 0..16 {
            if kernel.ecs.get::<FloorReplacement>(kernel.entity("replace-bed-floor").unwrap()).unwrap().phase == FloorReplacementPhase::Completed { break; }
            kernel.advance_json(r#"{"delta":1,"writes":[],"actions":[]}"#).unwrap();
        }
        let replaced = kernel.ecs.get::<ConstructionSite>(kernel.entity(floor_id).unwrap()).unwrap();
        let resumed_bed_entity = kernel.entity("bed-1").unwrap();
        assert_eq!(replaced.catalog, "floor-alt");
        assert_eq!(replaced.target, original_floor.target);
        assert_eq!(kernel.environment.as_ref().unwrap().world.structure_instances().iter().filter(|instance| matches!(instance, crate::structure_geometry::StaticInstance::Floor { id, support: actual } if id == floor_id && *actual == support)).count(), 1);
        assert_eq!(record(kernel.ecs.get::<ConstructionSite>(resumed_bed_entity).unwrap()), bed_before);
        assert_eq!(record(kernel.ecs.get::<Position>(resumed_bed_entity).unwrap()), position_before);
        assert_eq!(record(kernel.ecs.get::<Container>(kernel.entity("bed-1:sleep").unwrap()).unwrap()), sleep_before);
        let sleep_lot_after = kernel.ecs.get::<Lot>(kernel.entity(&sleep_lot_id).unwrap()).unwrap();
        assert_eq!((&sleep_lot_after.kind, sleep_lot_after.quantity, &sleep_lot_after.container), (&sleep_lot_before.kind, sleep_lot_before.quantity, &sleep_lot_before.container));
        let bed_instances_after: Vec<_> = kernel.environment.as_ref().unwrap().world.structure_instances().into_iter()
            .filter(|instance| matches!(instance, crate::structure_geometry::StaticInstance::Fixture { id, .. } if id == "bed-1"))
            .collect();
        assert_eq!(bed_instances_after, bed_instances_before);
        let material_total_after: u64 = kernel.ids.values().filter_map(|entity| kernel.ecs.get::<Lot>(*entity)).map(|lot| u64::from(lot.quantity)).sum();
        assert_eq!(material_total_before - material_total_after, replacement_cost, "replacement consumes only its declared finish cost");
        let saved = kernel.save_records().unwrap();
        let mut restored = Kernel::new();
        restored.restore_records(&saved).unwrap();
        assert_eq!(record(restored.ecs.get::<ConstructionSite>(restored.entity("bed-1").unwrap()).unwrap()), bed_before);
        let restored_sleep_lot = restored.ecs.get::<Lot>(restored.entity(&sleep_lot_id).unwrap()).unwrap();
        assert_eq!((&restored_sleep_lot.kind, restored_sleep_lot.quantity, &restored_sleep_lot.container), (&sleep_lot_before.kind, sleep_lot_before.quantity, &sleep_lot_before.container));
        let restored_bed_instances: Vec<_> = restored.environment.as_ref().unwrap().world.structure_instances().into_iter()
            .filter(|instance| matches!(instance, crate::structure_geometry::StaticInstance::Fixture { id, .. } if id == "bed-1"))
            .collect();
        assert_eq!(restored_bed_instances, bed_instances_before);
        assert_eq!(restored.query_json(r#"["hive.floor-replacement"]"#).unwrap(), kernel.query_json(r#"["hive.floor-replacement"]"#).unwrap());
    }

    #[test]
    fn deconstruction_removes_storage_and_publishes_one_salvage_lot() {
        let (mut kernel, surface, contact) = world();
        install_floor_storage_recipe(&mut kernel);
        setup(&mut kernel, surface, &contact);
        kernel.advance_json(r#"{"delta":1.0,"writes":[],"actions":[]}"#).unwrap();
        let storage_position = kernel.ecs.get::<Position>(kernel.entity("site-1:storage").unwrap()).unwrap().clone();
        assert_eq!(kernel.storage_provider_candidates_at(&storage_position).map(|(id, _)| id).collect::<Vec<_>>(), vec!["site-1:storage"]);
        assert_eq!(kernel.stockpile_policy_candidates_at(&storage_position).count(), 0);

        let stored = kernel.complete_material_output(MaterialOutputSpec {
            container: "site-1:storage".into(), kind: "stone-spoil".into(), quantity: 1, water_kg: None,
        }).unwrap();
        let occupied = kernel.save_records().unwrap();
        let rejected: serde_json::Value = serde_json::from_str(&kernel.advance_json(&json!({
            "delta":0.0,"writes":[],"actions":[{"scope":{"kind":"host"},"request":{"kind":"deconstruct","site":"site-1","worker":"worker-1"}}]
        }).to_string()).unwrap()).unwrap();
        assert_eq!(rejected["results"][0]["accepted"], false);
        let after_rejection = kernel.save_records().unwrap();
        let mut before_entities: serde_json::Value = serde_json::from_str(&occupied.entities).unwrap();
        let mut after_entities: serde_json::Value = serde_json::from_str(&after_rejection.entities).unwrap();
        before_entities.as_object_mut().unwrap().remove("revision");
        after_entities.as_object_mut().unwrap().remove("revision");
        assert_eq!(after_entities, before_entities);
        assert_eq!(after_rejection.environment.as_ref().unwrap().1.terrain, occupied.environment.as_ref().unwrap().1.terrain);
        let consumed = kernel.prepare_material_consumption(&[MaterialPortion { lot: stored.clone(), quantity: 1 }]).unwrap();
        kernel.publish_material_consumption(consumed).unwrap();
        assert_eq!(kernel.ecs.get::<Lot>(kernel.entity(&stored).unwrap()).unwrap().quantity, 0);

        kernel.advance_json(&json!({"delta":0.0,"writes":[],"actions":[{"scope":{"kind":"host"},"request":{"kind":"deconstruct","site":"site-1","worker":"worker-1"}}]}).to_string()).unwrap();
        assert!(!kernel.known.contains("site-1"));
        assert!(!kernel.known.contains("site-1:storage"));
        assert!(!kernel.known.contains(&stored));
        assert_eq!(kernel.storage_provider_candidates_at(&storage_position).count(), 0, "deconstruction must remove the physical provider index before despawn");
        assert_eq!(kernel.stockpile_policy_candidates_at(&storage_position).count(), 0, "deconstruction must not leave a stale policy lookup");
        assert_eq!(kernel.quantity("worker-1"), 1);
        let saved = kernel.save_records().unwrap();
        let mut restored = Kernel::new(); restored.restore_records(&saved).unwrap();
        assert_eq!(restored.save_records().unwrap().entities, saved.entities);
    }

    #[test]
    fn deconstruction_rejects_removing_a_supporting_wall_without_mutation() {
        use crate::environment_definition::{RemovalRecipe, StructureDefinition, StructureShape};
        use crate::structure_geometry::StaticInstance;
        let (mut kernel, surface, contact) = world();
        kernel.environment.as_mut().unwrap().structures.insert("wall".into(), StructureDefinition {
            id: "wall".into(), shape: StructureShape::Wall { height: 4 },
            materials: [("stone-spoil".into(), 1)].into_iter().collect(),
            work_seconds: 1.0, work_reach_below_cells: 0,
            on_complete: Default::default(), on_remove: RemovalRecipe::default(),
        });
        let wall = StaticInstance::Wall {
            id: "support-wall".into(),
            edge: crate::structure_geometry::Face { cell: crate::generation::Cell { x: surface.x, y: surface.y + 1, z: surface.z }, axis: crate::structure_geometry::FaceAxis::X },
            height: 4,
        };
        let upper = StaticInstance::Floor {
            id: "dependent-floor".into(),
            support: crate::generation::Cell { x: surface.x, y: surface.y + 4, z: surface.z },
        };
        let prepared = kernel.environment.as_mut().unwrap().world.prepare_structures(vec![wall, upper]).unwrap().unwrap();
        kernel.environment.as_mut().unwrap().world.apply_structures(prepared).unwrap();
        let state = ConstructionSite {
            catalog: "wall".into(),
            target: ConstructionTarget::Edge { edge: crate::structure_geometry::Face { cell: crate::generation::Cell { x: surface.x, y: surface.y + 1, z: surface.z }, axis: crate::structure_geometry::FaceAxis::X } },
            seconds: 1.0, phase: ConstructionPhase::Finished,
        };
        let entity = kernel.ecs.spawn((ExternalId("support-wall".into()), Container { capacity: 1 }, SealedContainer {}, state,
            Position { x: contact.x, y: contact.y, z: contact.z, facing: 0.0 })).id();
        kernel.ids.insert("support-wall".into(), entity);
        kernel.known.insert("support-wall".into());
        kernel.contents.insert("support-wall".into(), BTreeSet::new());
        kernel.refresh_state_weight();
        let before = kernel.save_records().unwrap();

        assert!(kernel.deconstruct_construction("worker-1", "support-wall").unwrap_err().contains("geometry"));
        let after = kernel.save_records().unwrap();
        assert_eq!(after.entities, before.entities);
        assert_eq!(after.environment.unwrap().1.terrain, before.environment.unwrap().1.terrain);
    }

    #[test]
    fn deconstruction_cancels_only_the_pending_support_cascade_and_preserves_delivered_material() {
        use crate::environment_definition::{StructureDefinition, StructureShape};
        use crate::structure_geometry::{Face, FaceAxis, StaticInstance};
        let (mut kernel, surface, contact) = world();
        install_test_wall_catalog(&mut kernel);
        let fixture = kernel.environment.as_ref().unwrap().structures.get("floor").unwrap().clone();
        kernel.environment.as_mut().unwrap().structures.insert("test-fixture".into(), StructureDefinition {
            id: "test-fixture".into(), shape: StructureShape::Fixture { footprint: vec![[0, 0]] },
            materials: BTreeMap::new(), ..fixture
        });
        let mut floor_two = kernel.environment.as_ref().unwrap().structures.get("floor").unwrap().clone();
        floor_two.id = "floor-two".into();
        floor_two.materials = [("stone-spoil".into(), 2)].into_iter().collect();
        kernel.environment.as_mut().unwrap().structures.insert("floor-two".into(), floor_two);
        let edge = Face { cell: crate::generation::Cell { y: surface.y + 1, ..surface }, axis: FaceAxis::X };
        let wall = StaticInstance::Wall { id: "root-wall".into(), edge, height: 4 };
        apply_test_walls(&mut kernel, vec![wall]);
        install_committed_test_wall(&mut kernel, "root-wall", edge, &contact);

        let upper = crate::generation::Cell { x: surface.x, y: surface.y + 4, z: surface.z };
        kernel.plan_constructions("party".into(), vec![
            ConstructionPlan { catalog: "floor-two".into(), site: "upper-floor".into(), target: ConstructionTarget::Cell { cell: upper, orientation: crate::structure_geometry::Cardinal::North } },
            ConstructionPlan { catalog: "test-fixture".into(), site: "upper-fixture".into(), target: ConstructionTarget::Cell { cell: crate::generation::Cell { y: upper.y + 1, ..upper }, orientation: crate::structure_geometry::Cardinal::North } },
        ], &ActionScope::Host).unwrap();
        kernel.ecs.entity_mut(kernel.entity("upper-floor").unwrap()).insert(Position { x: contact.x, y: contact.y, z: contact.z, facing: 0.0 });
        kernel.transfer("lot.2", "source", "upper-floor", 1).unwrap();
        let delivered_lot = kernel.contents["upper-floor"].iter().next().copied().unwrap();
        let carried_source = kernel.prepare_ground_output(Position { x: contact.x, y: contact.y, z: contact.z, facing: 0.0 }, "stone-spoil".into(), 1, None, Some("party".into())).unwrap();
        let carried_ground = carried_source.container.clone();
        let carried_lot = kernel.publish_material_output(carried_source);
        let allocation = kernel.reserve_supply_allocation("upper-floor".into(), "material".into(), 1, "party".into(), "stone-spoil".into(), carried_lot.clone(), "upper-floor".into(), 1).unwrap();
        let moved = kernel.transfer_with_identity_excluding(&carried_lot, &carried_ground, "worker-2", 1, false, Some(&allocation)).unwrap();
        crate::record_changes::edit::<SupplyAllocation>(kernel.entity(&allocation).unwrap(), &mut kernel.ecs).unwrap().portion = moved.clone();
        let material_total = kernel.ids.values().filter_map(|entity| kernel.ecs.get::<Lot>(*entity)).map(|lot| u64::from(lot.quantity)).sum::<u64>();

        move_worker_to_deconstruction_contact(&mut kernel, "worker-1", "root-wall");
        kernel.deconstruct_construction("worker-1", "root-wall").unwrap();

        assert!(!kernel.known.contains("upper-fixture"), "dependent intent must cascade");
        let retained = kernel.entity("upper-floor").unwrap();
        assert!(kernel.ecs.get::<ConstructionSite>(retained).is_none());
        assert!(kernel.ecs.get::<GroundStock>(retained).is_some(), "delivered material becomes ordinary ground stock");
        assert_eq!(kernel.ecs.get::<Lot>(delivered_lot).unwrap().container, "upper-floor");
        assert!(!kernel.known.contains(&allocation), "carried reservation is released");
        assert_eq!(kernel.ecs.get::<Lot>(kernel.entity(&moved).unwrap()).unwrap().container, "worker-2", "carried material remains with its carrier");
        assert_eq!(kernel.ids.values().filter_map(|entity| kernel.ecs.get::<Lot>(*entity)).map(|lot| u64::from(lot.quantity)).sum::<u64>(), material_total);
        assert!(!kernel.work_attempts.contains_key("upper-floor"));
        kernel.validate_construction_sites().unwrap();
    }

    #[test]
    fn deconstruction_preserves_pending_floor_with_alternative_root_support() {
        use crate::structure_geometry::{Face, FaceAxis, StaticInstance};
        let (mut kernel, surface, contact) = world();
        install_test_wall_catalog(&mut kernel);
        let first_edge = Face { cell: crate::generation::Cell { y: surface.y + 1, ..surface }, axis: FaceAxis::X };
        let second_edge = Face { cell: crate::generation::Cell { x: surface.x - 1, y: surface.y + 1, z: surface.z }, axis: FaceAxis::X };
        apply_test_walls(&mut kernel, vec![
            StaticInstance::Wall { id: "wall-a".into(), edge: first_edge, height: 4 },
            StaticInstance::Wall { id: "wall-b".into(), edge: second_edge, height: 4 },
        ]);
        install_committed_test_wall(&mut kernel, "wall-a", first_edge, &contact);
        install_committed_test_wall(&mut kernel, "wall-b", second_edge, &contact);
        let upper = crate::generation::Cell { x: surface.x, y: surface.y + 4, z: surface.z };
        kernel.plan_constructions("party".into(), vec![ConstructionPlan { catalog: "floor".into(), site: "alternative-floor".into(), target: ConstructionTarget::Cell { cell: upper, orientation: crate::structure_geometry::Cardinal::North } }], &ActionScope::Host).unwrap();

        move_worker_to_deconstruction_contact(&mut kernel, "worker-1", "wall-a");
        kernel.deconstruct_construction("worker-1", "wall-a").unwrap();

        assert!(kernel.ecs.get::<ConstructionSite>(kernel.entity("alternative-floor").unwrap()).is_some());
        let access: serde_json::Value = serde_json::from_str(&kernel.construction_access_json(r#"["alternative-floor"]"#).unwrap()).unwrap();
        assert_eq!(access[0]["support"], "ready");
    }

    #[test]
    fn terrain_excavation_cancels_pending_intent_that_loses_its_root() {
        use crate::structure_geometry::{Face, FaceAxis};
        let (mut kernel, surface, contact) = world();
        install_test_wall_catalog(&mut kernel);
        let adjacent = crate::generation::Cell { x: surface.x + 1, ..surface };
        let adjacent_material = kernel.environment.as_mut().unwrap().world.material(adjacent).unwrap();
        let opened = match kernel.environment.as_mut().unwrap().world.prepare_excavation(adjacent, adjacent_material, 0).unwrap() {
            crate::terrain_water::ExcavationResult::Prepared(prepared) => prepared,
            _ => panic!("expected adjacent setup excavation"),
        };
        kernel.environment.as_mut().unwrap().world.apply_excavation(opened).unwrap();
        let edge = Face { cell: crate::generation::Cell { y: surface.y + 1, ..surface }, axis: FaceAxis::X };
        kernel.plan_constructions("party".into(), vec![ConstructionPlan { catalog: "test-wall".into(), site: "terrain-wall".into(), target: ConstructionTarget::Edge { edge } }], &ActionScope::Host).unwrap();
        let expected = kernel.environment.as_mut().unwrap().world.material(surface).unwrap();
        kernel.environment.as_mut().unwrap().excavation_rules.insert(expected, crate::environment_definition::ExcavationRule {
            work_seconds: 1.0, output_kind: "stone-spoil".into(), units_per_cell: 1,
        });
        let prepared = match kernel.environment.as_mut().unwrap().world.prepare_excavation(surface, expected, 0).unwrap() {
            crate::terrain_water::ExcavationResult::Prepared(prepared) => prepared,
            _ => panic!("expected prepared excavation"),
        };
        kernel.complete_excavation_at(prepared, material_output::MaterialOutputLocation::Ground {
            position: Position { x: contact.x, y: contact.y, z: contact.z, facing: 0.0 }, owner_party: Some("party".into()),
        }).unwrap();
        assert!(!kernel.known.contains("terrain-wall"));
        kernel.validate_construction_sites().unwrap();
    }

    #[test]
    fn working_construction_losing_material_returns_to_waiting_and_releases_labor() {
        let (mut kernel, surface, contact) = world();
        setup(&mut kernel, surface, &contact);
        let staged_lot = kernel.contents["site-1"].iter().next().and_then(|entity| kernel.ecs.get::<ExternalId>(*entity)).unwrap().0.clone();
        let consumption = kernel.prepare_material_consumption(&[MaterialPortion { lot: staged_lot, quantity: 1 }]).unwrap();
        kernel.publish_material_consumption(consumption).unwrap();

        kernel.advance_json(r#"{"delta":1,"writes":[],"actions":[]}"#).unwrap();
        assert_eq!(kernel.ecs.get::<ConstructionSite>(kernel.entity("site-1").unwrap()).unwrap().phase, ConstructionPhase::Planned);
        let attempt = kernel.work_attempt("site-1").unwrap();
        assert!(matches!(attempt.phase, AttemptPhase::Outcome { result: crate::work_attempt::WorkOutcome::Blocked { reason: crate::work_attempt::WorkBlockReason::MissingInputs }, .. }));
        acknowledge_attempt(&mut kernel, "site-1");
        assert!(!kernel.work_attempts.contains_key("site-1"));
        assert!(!kernel.attempts_by_worker.contains_key("worker-1"));
        assert!(kernel.construction_work_requirement("site-1", "party").unwrap().is_none(), "missing material is waiting, not cancelled");
        assert!(kernel.ecs.get::<ConstructionSite>(kernel.entity("site-1").unwrap()).is_some());
    }

    #[test]
    fn deconstruction_contact_rejects_remote_worker_and_accepts_another_valid_contact() {
        let (mut kernel, surface, contact) = world();
        setup(&mut kernel, surface, &contact);
        kernel.advance_json(r#"{"delta":1.0,"writes":[],"actions":[]}"#).unwrap();
        let rows: serde_json::Value = serde_json::from_str(&kernel.deconstruction_access_json("[\"site-1\"]").unwrap()).unwrap();
        assert_eq!(rows[0].as_object().unwrap().len(), 5);
        assert!(rows[0].get("support").is_none());
        assert!(rows[0].get("materialsReady").is_none());
        let alternate = rows[0]["contacts"].as_array().unwrap().iter().find(|row| row["x"] != contact.x || row["z"] != contact.z).unwrap();
        let worker = kernel.entity("worker-1").unwrap();
        kernel.ecs.entity_mut(worker).insert(Position { x: contact.x + 0.25, y: contact.y, z: contact.z, facing: 0.0 });
        kernel.rebuild_physical_indexes(true).unwrap();
        let rejected: serde_json::Value = serde_json::from_str(&kernel.advance_json(r#"{"delta":0.0,"writes":[],"actions":[{"scope":{"kind":"host"},"request":{"kind":"deconstruct","site":"site-1","worker":"worker-1"}}]}"#).unwrap()).unwrap();
        assert_eq!(rejected["results"][0]["accepted"], false);
        assert!(kernel.known.contains("site-1"));
        kernel.ecs.entity_mut(worker).insert(Position { x: alternate["x"].as_f64().unwrap(), y: alternate["y"].as_f64().unwrap(), z: alternate["z"].as_f64().unwrap(), facing: 0.0 });
        kernel.rebuild_physical_indexes(true).unwrap();
        let accepted: serde_json::Value = serde_json::from_str(&kernel.advance_json(r#"{"delta":0.0,"writes":[],"actions":[{"scope":{"kind":"host"},"request":{"kind":"deconstruct","site":"site-1","worker":"worker-1"}}]}"#).unwrap()).unwrap();
        assert_eq!(accepted["results"][0]["accepted"], true);
        assert!(!kernel.known.contains("site-1"));
    }

    #[test]
    fn deconstruction_access_reports_occupied_port_without_construction_fields() {
        let (mut kernel, surface, contact) = world();
        install_floor_storage_recipe(&mut kernel);
        setup(&mut kernel, surface, &contact);
        kernel.advance_json(r#"{"delta":1.0,"writes":[],"actions":[]}"#).unwrap();
        kernel.complete_material_output(MaterialOutputSpec { container: "site-1:storage".into(), kind: "stone-spoil".into(), quantity: 1, water_kg: None }).unwrap();
        let rows: serde_json::Value = serde_json::from_str(&kernel.deconstruction_access_json("[\"site-1\"]").unwrap()).unwrap();
        assert_eq!(rows[0]["removal"], "occupiedPort");
        assert!(rows[0].get("support").is_none());
        assert!(rows[0].get("materialsReady").is_none());
    }

    #[test]
    fn deconstruction_access_reports_dependent_floor_structural_dependency() {
        use crate::environment_definition::{RemovalRecipe, StructureDefinition, StructureShape};
        use crate::structure_geometry::StaticInstance;
        let (mut kernel, surface, contact) = world();
        kernel.environment.as_mut().unwrap().structures.insert("wall".into(), StructureDefinition {
            id: "wall".into(), shape: StructureShape::Wall { height: 4 }, materials: BTreeMap::new(), work_seconds: 1.0,
            work_reach_below_cells: 0, on_complete: Default::default(), on_remove: RemovalRecipe::default(),
        });
        let wall = StaticInstance::Wall { id: "support-wall".into(), edge: crate::structure_geometry::Face { cell: crate::generation::Cell { x: surface.x, y: surface.y + 1, z: surface.z }, axis: crate::structure_geometry::FaceAxis::X }, height: 4 };
        let upper = StaticInstance::Floor { id: "dependent-floor".into(), support: crate::generation::Cell { x: surface.x, y: surface.y + 4, z: surface.z } };
        let prepared = kernel.environment.as_mut().unwrap().world.prepare_structures(vec![wall, upper]).unwrap().unwrap();
        kernel.environment.as_mut().unwrap().world.apply_structures(prepared).unwrap();
        let state = ConstructionSite { catalog: "wall".into(), target: ConstructionTarget::Edge { edge: crate::structure_geometry::Face { cell: crate::generation::Cell { x: surface.x, y: surface.y + 1, z: surface.z }, axis: crate::structure_geometry::FaceAxis::X } }, seconds: 1.0, phase: ConstructionPhase::Finished };
        let wall_entity = kernel.ecs.spawn((ExternalId("support-wall".into()), Container { capacity: 1 }, SealedContainer {}, state, Position { x: contact.x, y: contact.y, z: contact.z, facing: 0.0 })).id();
        kernel.ids.insert("support-wall".into(), wall_entity); kernel.known.insert("support-wall".into()); kernel.contents.insert("support-wall".into(), BTreeSet::new());
        let dependent_entity = kernel.ecs.spawn((ExternalId("dependent-floor".into()), Support { entity: "support-wall".into() })).id();
        kernel.ids.insert("dependent-floor".into(), dependent_entity); kernel.known.insert("dependent-floor".into());
        kernel.refresh_state_weight();
        let rows: serde_json::Value = serde_json::from_str(&kernel.deconstruction_access_json("[\"support-wall\"]").unwrap()).unwrap();
        assert_eq!(rows[0]["removal"], "structuralDependency");
    }

    #[test]
    fn construction_completion_consumes_inputs_and_installs_one_reloadable_storage_port() {
        let (mut kernel, surface, contact) = world();
        install_floor_storage_recipe(&mut kernel);
        setup(&mut kernel, surface, &contact);
        kernel.advance_json(r#"{"delta":1.0,"writes":[],"actions":[]}"#).unwrap();

        let site = kernel.entity("site-1").unwrap();
        let port = kernel.entity("site-1:storage").unwrap();
        assert_eq!(kernel.ecs.get::<ConstructionSite>(site).unwrap().phase, ConstructionPhase::Finished);
        assert_eq!(kernel.ecs.get::<Container>(port).unwrap().capacity, 6);
        assert_eq!(kernel.ecs.get::<Position>(port), kernel.ecs.get::<Position>(site));
        assert!(kernel.ecs.get::<StockpileCell>(port).is_none(), "a physical shelf provider does not own painted policy");
        assert!(kernel.ecs.get::<StorageProvider>(port).is_some());
        assert_eq!(kernel.ecs.get::<Lot>(kernel.entity("lot.1").unwrap()).unwrap().quantity, 0);

        kernel.advance_json(r#"{"delta":1.0,"writes":[],"actions":[]}"#).unwrap();
        assert_eq!(kernel.ids.keys().filter(|id| id.as_str() == "site-1:storage").count(), 1);
        let saved = kernel.save_records().unwrap();
        let mut restored = Kernel::new();
        restored.restore_records(&saved).unwrap();
        assert_eq!(restored.save_records().unwrap().entities, saved.entities);
        assert_eq!(restored.ecs.get::<Position>(restored.entity("site-1:storage").unwrap()), restored.ecs.get::<Position>(restored.entity("site-1").unwrap()));
    }

    #[test]
    fn environment_rejects_completion_recipes_that_seize_physical_ownership() {
        let mut kernel = Kernel::new();
        kernel.load(&json!({
            "format":"hive-game", "version":3, "game":"construction-recipe",
            "components":[], "materialCatalog":[], "initial":[]
        }).to_string()).unwrap();
        let mut definition: serde_json::Value = serde_json::from_str(&crate::environment_definition::tests::fixture("construction-recipe")).unwrap();
        definition["structures"]["catalog"][0]["onComplete"] = json!({
            "components":[{"name":"hive.lot","value":{"kind":"wood","quantity":1,"container":"anything"}}]
        });
        assert!(kernel.load_environment(&definition.to_string()).unwrap_err().contains("cannot be installed"));
    }

    #[test]
    fn native_stockpile_designation_creates_surface_cell_and_rejects_mixed_batch() {
        let (mut kernel, surface, _) = world();
        let action = json!({"delta":0.0,"writes":[],"actions":[{"scope":{"kind":"host"},"request":{"kind":"designate-stockpile","party":"party","zone":"zone-a","cells":[{"x":surface.x,"y":surface.y,"z":surface.z,"priority":2,"filterProfile":"materials"}]}}]});
        let result: serde_json::Value = serde_json::from_str(&kernel.advance_json(&action.to_string()).unwrap()).unwrap();
        assert_eq!(result["results"][0]["accepted"], true);
        assert_eq!(kernel.query_json("[\"hive.stockpile-cell\"]").unwrap().contains("zone-a"), true);
        let before = kernel.query_json("[\"hive.stockpile-cell\"]").unwrap();
        let bad = json!({"delta":0.0,"writes":[],"actions":[{"scope":{"kind":"host"},"request":{"kind":"designate-stockpile","party":"party","zone":"zone-a","cells":[{"x":surface.x,"y":surface.y+10,"z":surface.z,"priority":2,"filterProfile":"materials"}]}}]});
        let rejected: serde_json::Value = serde_json::from_str(&kernel.advance_json(&bad.to_string()).unwrap()).unwrap();
        assert_eq!(rejected["results"][0]["accepted"], false);
        assert_eq!(kernel.query_json("[\"hive.stockpile-cell\"]").unwrap(), before);
        let spacing = kernel.environment.as_ref().unwrap().world.cell_spacing_m();
        let position = Position { x: surface.x as f64 * spacing[0], y: (f64::from(surface.y) + 0.5) * spacing[1], z: surface.z as f64 * spacing[2], facing: 0.0 };
        let ground = kernel.ecs.spawn((ExternalId("clear-ground".into()), position, Container { capacity: 3 }, GroundStock {}, OwnedByParty { party: "party".into() })).id();
        kernel.ids.insert("clear-ground".into(), ground); kernel.known.insert("clear-ground".into()); kernel.contents.insert("clear-ground".into(), BTreeSet::new()); kernel.index_ground_stock("clear-ground", ground);
        let lot = kernel.ecs.spawn((ExternalId("clear-lot".into()), Lot { kind: "wood".into(), quantity: 1, container: "clear-ground".into() })).id();
        kernel.ids.insert("clear-lot".into(), lot); kernel.known.insert("clear-lot".into()); kernel.contents.get_mut("clear-ground").unwrap().insert(lot);
        let clear = json!({"delta":0.0,"writes":[],"actions":[{"scope":{"kind":"host"},"request":{"kind":"clear-stockpile","party":"party","zone":"zone-a","cells":[{"x":surface.x,"y":surface.y,"z":surface.z}]}}]});
        let cleared: serde_json::Value = serde_json::from_str(&kernel.advance_json(&clear.to_string()).unwrap()).unwrap();
        assert_eq!(cleared["results"][0]["accepted"], true);
        assert!(!kernel.query_json("[\"hive.stockpile-cell\"]").unwrap().contains("zone-a"));
        assert_eq!(kernel.ecs.get::<Lot>(lot).unwrap().container, "clear-ground");
        assert_eq!(kernel.quantity_in_container("clear-ground"), 1);
    }

    #[test]
    fn native_stockpile_transfer_shrink_and_restore_are_atomic() {
        let (mut kernel, surface, contact) = world();
        setup(&mut kernel, surface, &contact);
        kernel.advance_json(&json!({"delta":1.0,"writes":[],"actions":[]}).to_string()).unwrap();
        let designation = |zone: &str, cell: crate::generation::Cell| json!({"delta":0.0,"writes":[],"actions":[{"scope":{"kind":"host"},"request":{"kind":"designate-stockpile","party":"party","zone":zone,"cells":[{"x":cell.x,"y":cell.y,"z":cell.z,"priority":2,"filterProfile":"materials"}]}}]});
        let ground = serde_json::from_str::<serde_json::Value>(&kernel.advance_json(&designation("ground-zone", surface).to_string()).unwrap()).unwrap();
        assert_eq!(ground["results"][0]["accepted"], true);
        let stockpile_id = ground["results"][0]["entityId"].as_str().unwrap();
        let spacing = kernel.environment.as_ref().unwrap().world.cell_spacing_m();
        let position = Position { x: surface.x as f64 * spacing[0], y: (f64::from(surface.y) + 0.5) * spacing[1], z: surface.z as f64 * spacing[2], facing: 0.0 };
        let ground_entity = kernel.ecs.spawn((ExternalId("ground.1".into()), position, Container { capacity: 4 }, GroundStock {}, OwnedByParty { party: "party".into() })).id();
        kernel.ids.insert("ground.1".into(), ground_entity); kernel.known.insert("ground.1".into()); kernel.contents.insert("ground.1".into(), BTreeSet::new()); kernel.index_ground_stock("ground.1", ground_entity);
        let containers: serde_json::Value = serde_json::from_str(&kernel.query_json("[\"hive.container\"]").unwrap()).unwrap();
        assert!(containers.as_array().unwrap().iter().all(|row| row["id"] != stockpile_id), "designation capacity must not create a container");
        let transfer = json!({"delta":0.0,"writes":[],"actions":[{"scope":{"kind":"host"},"request":{"kind":"transfer","lot":"lot.2","from":"source","to":"ground.1","quantity":4}}]});
        let moved = serde_json::from_str::<serde_json::Value>(&kernel.advance_json(&transfer.to_string()).unwrap()).unwrap();
        assert_eq!(moved["results"][0]["accepted"], true);
        let cells: serde_json::Value = serde_json::from_str(&kernel.query_json("[\"hive.stockpile-cell\"]").unwrap()).unwrap();
        assert_eq!(cells[0]["components"]["hive.stockpile-cell"]["zone"], "ground-zone");
        let lots: serde_json::Value = serde_json::from_str(&kernel.query_json("[\"hive.lot\"]").unwrap()).unwrap();
        assert_eq!(lots.as_array().unwrap().iter().find(|row| row["id"] == "lot.2").unwrap()["components"]["hive.lot"]["quantity"], 4);
        assert_eq!(lots.as_array().unwrap().iter().find(|row| row["id"] == "lot.2").unwrap()["components"]["hive.lot"]["container"], "ground.1");
        let before_shrink = kernel.save_records().unwrap();
        let shrink = serde_json::from_str::<serde_json::Value>(&kernel.advance_json(&designation("ground-zone", surface).to_string()).unwrap()).unwrap();
        assert_eq!(shrink["results"][0]["accepted"], true);
        let after_shrink = kernel.save_records().unwrap();
        let mut before_entities: serde_json::Value = serde_json::from_str(&before_shrink.entities).unwrap();
        let mut after_entities: serde_json::Value = serde_json::from_str(&after_shrink.entities).unwrap();
        before_entities.as_object_mut().unwrap().remove("revision");
        after_entities.as_object_mut().unwrap().remove("revision");
        assert_eq!(after_entities, before_entities);
        assert_eq!(after_shrink.environment.as_ref().map(|(_, records)| (&records.header, &records.terrain, &records.water, &records.structures)), before_shrink.environment.as_ref().map(|(_, records)| (&records.header, &records.terrain, &records.water, &records.structures)));
        let before = kernel.query_json("[\"hive.stockpile-cell\"]").unwrap();
        let mixed = json!({"delta":0.0,"writes":[],"actions":[{"scope":{"kind":"host"},"request":{"kind":"designate-stockpile","party":"party","zone":"ground-zone","cells":[{"x":surface.x,"y":surface.y,"z":surface.z,"priority":4,"filterProfile":"materials"},{"x":surface.x,"y":surface.y+10,"z":surface.z,"priority":4,"filterProfile":"materials"}]}}]});
        let rejected = serde_json::from_str::<serde_json::Value>(&kernel.advance_json(&mixed.to_string()).unwrap()).unwrap();
        assert_eq!(rejected["results"][0]["accepted"], false);
        assert_eq!(kernel.query_json("[\"hive.stockpile-cell\"]").unwrap(), before);
        let saved = kernel.save_records().unwrap();
        let mut restored = Kernel::new(); restored.restore_records(&saved).unwrap();
        let restored_records = restored.save_records().unwrap();
        assert_eq!(restored_records.entities, saved.entities);
        assert_eq!(restored.query_json("[\"hive.stockpile-cell\"]").unwrap(), kernel.query_json("[\"hive.stockpile-cell\"]").unwrap());
    }

    fn wall_catalog(kernel: &mut Kernel) {
        let environment = kernel.environment.as_mut().unwrap();
        environment.structures.insert("wall".into(), crate::environment_definition::StructureDefinition {
            id: "wall".into(), shape: crate::environment_definition::StructureShape::Wall { height: 1 },
            materials: [("stone-spoil".into(), 1)].into_iter().collect(), work_seconds: 1.0, work_reach_below_cells: 0, on_complete: Default::default(), on_remove: Default::default(),
        });
        let mut definition: serde_json::Value = serde_json::from_str(&environment.definition).unwrap();
        definition["structures"]["catalog"].as_array_mut().unwrap().push(json!({
            "id":"wall", "shape":{"kind":"wall","height":1},
            "materials":[{"kind":"stone-spoil","quantity":1}], "workSeconds":1, "workReachBelowCells":0
        }));
        environment.definition = serde_json::to_string(&definition).unwrap();
    }

    #[test]
    fn staged_materials_and_worker_replacement_finish_once_and_restore() {
        let (mut kernel, surface, contact) = world();
        setup(&mut kernel, surface, &contact);
        kernel.advance_json(r#"{"delta":0.5,"writes":[],"actions":[]}"#).unwrap();
        kernel.advance_json(r#"{"delta":0,"writes":[],"actions":[{"scope":{"kind":"host"},"request":{"kind":"cancel-work","entity":"worker-1"}}]}"#).unwrap();
        let released = kernel.save_records().unwrap();
        let mut resumed = Kernel::new();
        resumed.restore_records(&released).unwrap();
        acknowledge_attempt(&mut resumed, "site-1");
        begin_construction(&mut resumed, "worker-2", "site-1", &contact);
        resumed.advance_json(r#"{"delta":0.5,"writes":[],"actions":[]}"#).unwrap();
        let finished = resumed.query_json(r#"["hive.construction-site","hive.sealed-container"]"#).unwrap();
        assert!(finished.contains("finished"));
        let saved = resumed.save_records().unwrap();
        let mut restored = Kernel::new();
        restored.restore_records(&saved).unwrap();
        let before_site = restored.query_json(r#"["hive.construction-site","hive.sealed-container"]"#).unwrap();
        let before_lot = restored.query_json(r#"["hive.lot"]"#).unwrap();
        restored.advance_json(r#"{"delta":1,"writes":[],"actions":[]}"#).unwrap();
        assert_eq!(restored.query_json(r#"["hive.construction-site","hive.sealed-container"]"#).unwrap(), before_site);
        assert_eq!(restored.query_json(r#"["hive.lot"]"#).unwrap(), before_lot);
    }

    #[test]
    fn construction_waits_without_staged_material_and_repeated_attend_is_idempotent() {
        let (mut kernel, surface, contact) = world();
        let response: serde_json::Value = serde_json::from_str(&kernel.advance_json(&json!({"delta":0.0,"writes":[],"actions":[{"scope":{"kind":"host"},"request":
            {"kind":"plan-constructions","party":"party","plans":[{"catalog":"floor","site":"site-1","target":{"kind":"cell","cell":{"x":surface.x,"y":surface.y,"z":surface.z},"orientation":"north"}}]}},{"scope":{"kind":"host"},"request":
            {"kind":"bind-construction-stage","site":"site-1","contact":contact}},
        ]}).to_string()).unwrap()).unwrap();
        assert_eq!(response["results"].as_array().unwrap().len(), 2);
        assert!(response["results"].as_array().unwrap().iter().all(|result| result["accepted"] == true));
        begin_construction(&mut kernel, "worker-1", "site-1", &contact);
        kernel.advance_json(r#"{"delta":1,"writes":[],"actions":[]}"#).unwrap();
        let state = kernel.query_json(r#"["hive.construction-site"]"#).unwrap();
        assert!(state.contains("\"seconds\":0.0"));
    }

    #[test]
    fn conflicting_plan_creates_no_site_or_container() {
        let (mut kernel, surface, _) = world();
        let plan = json!({"delta":0.0,"writes":[],"actions":[{"scope":{"kind":"host"},"request":
            {"kind":"plan-constructions","party":"party","plans":[{"catalog":"floor","site":"site-1","target":{"kind":"cell","cell":{"x":surface.x,"y":surface.y,"z":surface.z},"orientation":"north"}}]}}]});
        let accepted: serde_json::Value = serde_json::from_str(&kernel.advance_json(&plan.to_string()).unwrap()).unwrap();
        assert_eq!(accepted["results"][0]["accepted"], true);
        let before_sites = kernel.query_json(r#"["hive.construction-site","hive.container"]"#).unwrap();
        let conflict = json!({"delta":0.0,"writes":[],"actions":[{"scope":{"kind":"host"},"request":
            {"kind":"plan-constructions","party":"party","plans":[{"catalog":"floor","site":"site-2","target":{"kind":"cell","cell":{"x":surface.x,"y":surface.y,"z":surface.z},"orientation":"north"}}]}}]});
        let rejected: serde_json::Value = serde_json::from_str(&kernel.advance_json(&conflict.to_string()).unwrap()).unwrap();
        assert_eq!(rejected["results"][0]["accepted"], false);
        assert_eq!(kernel.query_json(r#"["hive.construction-site","hive.container"]"#).unwrap(), before_sites);
        assert!(!kernel.known.contains("site-2"));
    }

    #[test]
    fn valid_pending_construction_survives_save_restore_validation() {
        let (mut kernel, surface, _) = world();
        let plan = json!({"delta":0.0,"writes":[],"actions":[{"scope":{"kind":"host"},"request":
            {"kind":"plan-constructions","party":"party","plans":[{"catalog":"floor","site":"pending-floor","target":{"kind":"cell","cell":{"x":surface.x,"y":surface.y,"z":surface.z},"orientation":"north"}}]}}]});
        let result: serde_json::Value = serde_json::from_str(&kernel.advance_json(&plan.to_string()).unwrap()).unwrap();
        assert_eq!(result["results"][0]["accepted"], true);
        let saved = kernel.save_records().unwrap();
        let mut restored = Kernel::new();
        restored.restore_records(&saved).unwrap();
        assert!(restored.known.contains("pending-floor"));
    }

    #[test]
    fn standing_wall_obstruction_preserves_progress_and_material() {
        let (mut kernel, surface, contact) = world();
        wall_catalog(&mut kernel);
        let spacing = kernel.environment.as_ref().unwrap().world.cell_spacing_m();
        let bystander = kernel.entity("worker-2").unwrap();
        kernel.ecs.entity_mut(bystander).insert(Position { x: (surface.x as f64 + 0.5) * spacing[0], y: (f64::from(surface.y) + 0.5) * spacing[1], z: surface.z as f64 * spacing[2], facing: 0.0 });
        kernel.rebuild_physical_indexes(true).unwrap();
        let response: serde_json::Value = serde_json::from_str(&kernel.advance_json(&json!({"delta":0.0,"writes":[],"actions":[{"scope":{"kind":"host"},"request":
            {"kind":"plan-constructions","party":"party","plans":[{"catalog":"wall","site":"site-wall","target":{"kind":"edge","edge":{"cell":{"x":surface.x,"y":surface.y+1,"z":surface.z},"axis":"x"}}}]}},{"scope":{"kind":"host"},"request":
            {"kind":"bind-construction-stage","site":"site-wall","contact":contact}},{"scope":{"kind":"host"},"request":
            {"kind":"transfer","lot":"lot.1","from":"source","to":"site-wall","quantity":1}},
        ]}).to_string()).unwrap()).unwrap();
        assert_eq!(response["results"].as_array().unwrap().len(), 3);
        assert!(response["results"].as_array().unwrap().iter().all(|result| result["accepted"] == true));
        begin_construction(&mut kernel, "worker-1", "site-wall", &contact);

        kernel.advance_json(r#"{"delta":1,"writes":[],"actions":[]}"#).unwrap();
        let site = kernel.query_json(r#"["hive.construction-site"]"#).unwrap();
        let lots = kernel.query_json(r#"["hive.lot"]"#).unwrap();
        let sealed = kernel.query_json(r#"["hive.sealed-container"]"#).unwrap();
        assert!(site.contains("\"seconds\":1.0"));
        assert!(site.contains("\"phase\":\"planned\""));
        assert!(lots.contains("\"container\":\"site-wall\""));
        assert!(lots.contains("\"quantity\":1"));
        assert_eq!(sealed, "[]");
        assert!(kernel.environment.as_ref().unwrap().world.structure_instances().is_empty());
        let attempt: serde_json::Value = serde_json::from_str(&kernel.work_attempts_json(r#"["site-wall"]"#).unwrap()).unwrap();
        assert!(attempt[0]["phase"]["kind"] == "outcome");
        assert_eq!(attempt[0]["phase"]["result"]["kind"], "blocked");
        assert!(!kernel.attempts_by_worker.contains_key("worker-1"));

        // Once the physical obstruction is removed, the retained designation
        // and staged lot can be acquired by another worker.
        let bystander = kernel.entity("worker-2").unwrap();
        kernel.ecs.entity_mut(bystander).insert(Position { x: contact.x + 2.0 * spacing[0], y: contact.y, z: contact.z, facing: 0.0 });
        let replacement_worker = kernel.entity("worker-3").unwrap();
        kernel.ecs.entity_mut(replacement_worker).insert(Position { x: contact.x, y: contact.y, z: contact.z, facing: 0.0 });
        kernel.rebuild_physical_indexes(true).unwrap();
        acknowledge_attempt(&mut kernel, "site-wall");
        begin_construction(&mut kernel, "worker-3", "site-wall", &contact);
        kernel.advance_json(r#"{"delta":1,"writes":[],"actions":[]}"#).unwrap();
        assert!(kernel.query_json(r#"["hive.sealed-container"]"#).unwrap().contains("site-wall"));
    }

    #[test]
    fn ordinary_air_does_not_block_wall_completion() {
        let (mut kernel, surface, mut contact) = world();
        // Keep workers beside the future wall, not inside its occupied cell.
        // The shared construction contact is already the adjacent ground cell.
        for id in ["worker-1", "worker-2", "source"] {
            let entity=kernel.entity(id).unwrap();
            kernel.ecs.entity_mut(entity).insert(Position{x:contact.x,y:contact.y,z:contact.z,facing:0.0});
        }
        kernel.rebuild_physical_indexes(true).unwrap();
        wall_catalog(&mut kernel);
        let cell = crate::generation::Cell { y: surface.y + 1, ..surface };
        let config_value = json!({
            "regionId":"construction-trapped-air",
            "min":cell,"max":{"x":cell.x+1,"y":cell.y+1,"z":cell.z+1},
        "ambientTemperatureC":20.0,"spreadPerSecond":1.0,"riseBias":2.0,"wind":[0.0,0.0,0.0],
        "outdoorLossPerSecond":2.0,"heatCapacityJPerM3K":1200.0,
        "exterior":"Closed"
        });
        let config = serde_json::from_value(config_value.clone()).unwrap();
        let environment = kernel.environment.as_mut().unwrap();
        environment.atmosphere = Some(crate::terrain_atmosphere::TerrainAtmosphere::fresh(&mut environment.world, config).unwrap());
        let mut definition: serde_json::Value = serde_json::from_str(&environment.definition).unwrap();
        definition["atmosphere"] = config_value;
        environment.definition = definition.to_string();

        let response: serde_json::Value = serde_json::from_str(&kernel.advance_json(&json!({"delta":0.0,"writes":[],"actions":[{"scope":{"kind":"host"},"request":
            {"kind":"plan-constructions","party":"party","plans":[{"catalog":"wall","site":"site-air-wall","target":{"kind":"edge","edge":{"cell":{"x":surface.x,"y":surface.y+1,"z":surface.z},"axis":"x"}}}]}},{"scope":{"kind":"host"},"request":
            {"kind":"bind-construction-stage","site":"site-air-wall","contact":contact}},{"scope":{"kind":"host"},"request":
            {"kind":"transfer","lot":"lot.1","from":"source","to":"site-air-wall","quantity":1}},
        ]}).to_string()).unwrap()).unwrap();
        assert!(response["results"].as_array().unwrap().iter().all(|result| result["accepted"] == true));
        begin_construction(&mut kernel, "worker-1", "site-air-wall", &contact);

        kernel.advance_json(r#"{"delta":1,"writes":[],"actions":[]}"#).unwrap();
        let site = kernel.query_json(r#"["hive.construction-site"]"#).unwrap();
        let lots = kernel.query_json(r#"["hive.lot"]"#).unwrap();
        let sealed = kernel.query_json(r#"["hive.sealed-container"]"#).unwrap();
        assert!(site.contains("\"phase\":\"finished\""));
        assert!(lots.contains("\"container\":\"site-air-wall\""));
        assert!(sealed.contains("site-air-wall"));
        assert!(!kernel.environment.as_ref().unwrap().world.structure_instances().is_empty());
    }

    #[test]
    fn active_bystander_edge_blocks_wall_completion() {
        let (mut kernel, surface, contact) = world();
        wall_catalog(&mut kernel);
        let spacing = kernel.environment.as_ref().unwrap().world.cell_spacing_m();
        let target = Point { x: contact.x - 2.0 * spacing[0], y: contact.y, z: contact.z, frame: None };
        let response: serde_json::Value = serde_json::from_str(&kernel.advance_json(&json!({"delta":0.0,"writes":[],"actions":[{"scope":{"kind":"host"},"request":
            {"kind":"plan-constructions","party":"party","plans":[{"catalog":"wall","site":"site-edge","target":{"kind":"edge","edge":{"cell":{"x":surface.x,"y":surface.y+1,"z":surface.z},"axis":"x"}}}]}},{"scope":{"kind":"host"},"request":
            {"kind":"bind-construction-stage","site":"site-edge","contact":contact}},{"scope":{"kind":"host"},"request":
            {"kind":"transfer","lot":"lot.1","from":"source","to":"site-edge","quantity":1}},{"scope":{"kind":"host"},"request":
            {"kind":"move","entity":"worker-2","destination":target}
        }]}).to_string()).unwrap()).unwrap();
        assert!(response["results"].as_array().unwrap().iter().all(|result| result["accepted"] == true));
        begin_construction(&mut kernel, "worker-1", "site-edge", &contact);
        kernel.advance_json(r#"{"delta":1,"writes":[],"actions":[]}"#).unwrap();
        assert!(kernel.query_json(r#"["hive.construction-site"]"#).unwrap().contains("\"phase\":\"planned\""));
    }

    #[test]
    fn future_route_obstruction_allows_current_completion_and_invalidates_route() {
        let (mut kernel, surface, contact) = world();
        wall_catalog(&mut kernel);
        let spacing = kernel.environment.as_ref().unwrap().world.cell_spacing_m();
        let next_contact = contact.clone();
        let bystander = kernel.entity("worker-2").unwrap();
        kernel.ecs.entity_mut(bystander).insert(Position { x: (surface.x as f64) * spacing[0], y: contact.y, z: contact.z, facing: 0.0 });
        kernel.rebuild_physical_indexes(true).unwrap();
        let target = Point { x: contact.x + 2.0 * spacing[0], y: contact.y, z: contact.z, frame: None };
        let response: serde_json::Value = serde_json::from_str(&kernel.advance_json(&json!({"delta":0.0,"writes":[],"actions":[{"scope":{"kind":"host"},"request":
            {"kind":"plan-constructions","party":"party","plans":[{"catalog":"wall","site":"site-future","target":{"kind":"edge","edge":{"cell":{"x":surface.x+1,"y":surface.y+1,"z":surface.z},"axis":"x"}}}]}},{"scope":{"kind":"host"},"request":
            {"kind":"bind-construction-stage","site":"site-future","contact":next_contact}},{"scope":{"kind":"host"},"request":
            {"kind":"transfer","lot":"lot.1","from":"source","to":"site-future","quantity":1}},{"scope":{"kind":"host"},"request":
            {"kind":"move","entity":"worker-2","destination":target}
        }]}).to_string()).unwrap()).unwrap();
        assert!(response["results"].as_array().unwrap().iter().all(|result| result["accepted"] == true));
        begin_construction(&mut kernel, "worker-1", "site-future", &next_contact);
        kernel.advance_json(r#"{"delta":1,"writes":[],"actions":[]}"#).unwrap();
        assert!(kernel.query_json(r#"["hive.sealed-container"]"#).unwrap().contains("site-future"));
    }

    #[test]
    fn restore_rejects_out_of_bounds_construction_footprint() {
        let (mut kernel, surface, contact) = world();
        setup(&mut kernel, surface, &contact);
        let mut records = kernel.save_records().unwrap();
        let mut entities: serde_json::Value = serde_json::from_str(&records.entities).unwrap();
        let site = entities["scene"]["initial"].as_array_mut().unwrap().iter_mut().find(|entity| entity["id"] == "site-1").unwrap();
        site["components"]["hive.construction-site"]["targetX"] = serde_json::Value::from(i64::MAX);
        records.entities = serde_json::to_string(&entities).unwrap();
        let mut restored = Kernel::new();
        assert!(restored.restore_records(&records).is_err());
    }

    #[test]
    fn construction_access_wall_is_ordered_and_binding_is_stable() {
        let (mut kernel, surface, contact) = world();
        wall_catalog(&mut kernel);
        let planned: serde_json::Value = serde_json::from_str(&kernel.advance_json(&json!({"delta":0.0,"writes":[],"actions":[{"scope":{"kind":"host"},"request":
            {"kind":"plan-constructions","party":"party","plans":[{"catalog":"wall","site":"access-wall","target":{"kind":"edge","edge":{"cell":{"x":surface.x,"y":surface.y+1,"z":surface.z},"axis":"x"}}}]}
        }]}).to_string()).unwrap()).unwrap();
        assert_eq!(planned["results"][0]["accepted"], true);
        let site_entity = kernel.entity("access-wall").unwrap();
        assert!(kernel.ecs.get::<Position>(site_entity).is_none());
        let rows: serde_json::Value = serde_json::from_str(&kernel.construction_access_json("[\"access-wall\"]").unwrap()).unwrap();
        assert_eq!(rows[0]["support"], "ready");
        let spacing = kernel.environment.as_ref().unwrap().world.cell_spacing_m();
        assert_eq!(rows[0]["contacts"], json!([
            {"x":surface.x as f64 * spacing[0], "y":contact.y, "z":surface.z as f64 * spacing[2], "frame":null, "kind":"origin"},
            {"x":(surface.x as f64 + 1.0) * spacing[0], "y":contact.y, "z":surface.z as f64 * spacing[2], "frame":null, "kind":"origin"}
        ]));
        let bad = Point { x: contact.x + 0.25, ..contact.clone() };
        let rejected: serde_json::Value = serde_json::from_str(&kernel.advance_json(&json!({"delta":0.0,"writes":[],"actions":[{"scope":{"kind":"host"},"request":{"kind":"bind-construction-stage","site":"access-wall","contact":bad}}]}).to_string()).unwrap()).unwrap();
        assert_eq!(rejected["results"][0]["accepted"], false);
        assert!(kernel.ecs.get::<Position>(site_entity).is_none());
        let bound: serde_json::Value = serde_json::from_str(&kernel.advance_json(&json!({"delta":0.0,"writes":[],"actions":[{"scope":{"kind":"host"},"request":{"kind":"bind-construction-stage","site":"access-wall","contact":contact}}]}).to_string()).unwrap()).unwrap();
        assert_eq!(bound["results"][0]["accepted"], true);
        let saved = kernel.save_records().unwrap();
        let saved_entities: serde_json::Value = serde_json::from_str(&saved.entities).unwrap();
        let saved_site = saved_entities["scene"]["initial"].as_array().unwrap().iter()
            .find(|entity| entity["id"] == "access-wall").unwrap();
        let saved_target = &saved_site["components"]["hive.construction-site"];
        assert_eq!(saved_target["targetKind"], "edge");
        assert_eq!(saved_target["targetX"], surface.x);
        assert_eq!(saved_target["targetY"], surface.y + 1);
        assert_eq!(saved_target["targetZ"], surface.z);
        assert_eq!(saved_target["targetDirection"], "x");
        assert!(saved_target.get("orientation").is_none());
        let mut restored = Kernel::new();
        restored.restore_records(&saved).unwrap();
        assert_eq!(restored.save_records().unwrap().entities, saved.entities);
        let before_duplicate = restored.query_json(r#"["hive.position","hive.construction-site"]"#).unwrap();
        let duplicate: serde_json::Value = serde_json::from_str(&restored.advance_json(&json!({"delta":0.0,"writes":[],"actions":[{"scope":{"kind":"host"},"request":{"kind":"bind-construction-stage","site":"access-wall","contact":contact}}]}).to_string()).unwrap()).unwrap();
        assert_eq!(duplicate["results"][0]["accepted"], false);
        assert_eq!(restored.query_json(r#"["hive.position","hive.construction-site"]"#).unwrap(), before_duplicate);
    }

    #[test]
    fn construction_access_attendance_can_choose_other_contact() {
        let (mut kernel, surface, contact) = world();
        kernel.advance_json(&json!({"delta":0.0,"writes":[],"actions":[{"scope":{"kind":"host"},"request":
            {"kind":"plan-constructions","party":"party","plans":[{"catalog":"floor","site":"access-floor","target":{"kind":"cell","cell":{"x":surface.x,"y":surface.y,"z":surface.z},"orientation":"north"}}]}},{"scope":{"kind":"host"},"request":
            {"kind":"bind-construction-stage","site":"access-floor","contact":contact}
        }]}).to_string()).unwrap();
        let spacing = kernel.environment.as_ref().unwrap().world.cell_spacing_m();
        let selected = Point { x: (surface.x as f64 - 1.0) * spacing[0], ..contact.clone() };
        let worker = kernel.entity("worker-1").unwrap();
        kernel.ecs.entity_mut(worker).insert(Position { x:selected.x, y:selected.y, z:selected.z, facing:0.0 });
        kernel.rebuild_physical_indexes(true).unwrap();
        begin_construction(&mut kernel, "worker-1", "access-floor", &selected);
        let state = kernel.ecs.get::<ConstructionSite>(kernel.entity("access-floor").unwrap()).unwrap();
        assert_eq!(state.phase, ConstructionPhase::Working);
        assert_eq!(kernel.ecs.get::<Position>(kernel.entity("access-floor").unwrap()).unwrap().x, contact.x);
    }

    #[test]
    fn upper_floor_rejects_without_support_then_binds_from_ground() {
        let (mut kernel, surface, _) = world();
        let environment = kernel.environment.as_mut().unwrap();
        environment.structures.get_mut("floor").unwrap().work_reach_below_cells = 4;
        let mut definition: serde_json::Value = serde_json::from_str(&environment.definition).unwrap();
        let floor = definition["structures"]["catalog"].as_array_mut().unwrap()
            .iter_mut().find(|entry| entry["id"] == "floor").unwrap();
        floor["workReachBelowCells"] = json!(4);
        environment.definition = serde_json::to_string(&definition).unwrap();

        let floor_y = surface.y + 4;
        let unsupported_before = kernel.query_json(r#"["hive.construction-site","hive.container"]"#).unwrap();
        let unsupported: serde_json::Value = serde_json::from_str(&kernel.advance_json(&json!({
            "delta":0.0,"writes":[],"actions":[{"scope":{"kind":"host"},"request":{
                "kind":"plan-constructions","party":"party","plans":[{"catalog":"floor","site":"wall-top-floor",
                "target":{"kind":"cell","cell":{"x":surface.x,"y":floor_y,"z":surface.z},"orientation":"north"}
            }]}}]
        }).to_string()).unwrap()).unwrap();
        assert_eq!(unsupported["results"][0]["accepted"], false);
        assert_eq!(kernel.query_json(r#"["hive.construction-site","hive.container"]"#).unwrap(), unsupported_before);
        assert!(!kernel.known.contains("wall-top-floor"));

        // A floor four voxels above ground requires a declared physical wall
        // support. Establish that completed support before admitting it.
        let wall = crate::structure_geometry::StaticInstance::Wall {
            id: "completed-wall".into(),
            edge: crate::structure_geometry::Face { cell: crate::generation::Cell { x: surface.x, y: surface.y + 1, z: surface.z }, axis: crate::structure_geometry::FaceAxis::X },
            height: 4,
        };
        let prepared = kernel.environment.as_mut().unwrap().world
            .prepare_structures(vec![wall]).unwrap().unwrap();
        kernel.environment.as_mut().unwrap().world.apply_structures(prepared).unwrap();

        let planned: serde_json::Value = serde_json::from_str(&kernel.advance_json(&json!({
            "delta":0.0,"writes":[],"actions":[{"scope":{"kind":"host"},"request":{
                "kind":"plan-constructions","party":"party","plans":[{"catalog":"floor","site":"wall-top-floor",
                "target":{"kind":"cell","cell":{"x":surface.x,"y":floor_y,"z":surface.z},"orientation":"north"}
            }]}}]
        }).to_string()).unwrap()).unwrap();
        assert_eq!(planned["results"][0]["accepted"], true);
        let before: serde_json::Value = serde_json::from_str(
            &kernel.construction_access_json("[\"wall-top-floor\"]").unwrap(),
        ).unwrap();
        assert_eq!(before[0]["support"], "ready");

        let after: serde_json::Value = serde_json::from_str(
            &kernel.construction_access_json("[\"wall-top-floor\"]").unwrap(),
        ).unwrap();
        assert_eq!(after[0]["support"], "ready");
        let spacing = kernel.environment.as_ref().unwrap().world.cell_spacing_m();
        let ground_y = (f64::from(surface.y) + 0.5) * spacing[1];
        let contacts = after[0]["contacts"].as_array().unwrap();
        assert_eq!(contacts, &vec![
            json!({"x":(surface.x as f64 - 1.0) * spacing[0], "y":ground_y, "z":surface.z as f64 * spacing[2], "frame":null, "kind":"origin"}),
            json!({"x":surface.x as f64 * spacing[0], "y":ground_y, "z":(surface.z as f64 - 1.0) * spacing[2], "frame":null, "kind":"origin"}),
            json!({"x":surface.x as f64 * spacing[0], "y":ground_y, "z":surface.z as f64 * spacing[2], "frame":null, "kind":"origin"}),
            json!({"x":surface.x as f64 * spacing[0], "y":ground_y, "z":(surface.z as f64 + 1.0) * spacing[2], "frame":null, "kind":"origin"}),
            json!({"x":(surface.x as f64 + 1.0) * spacing[0], "y":ground_y, "z":surface.z as f64 * spacing[2], "frame":null, "kind":"origin"}),
        ]);
        let contact = Point {
            x: contacts[0]["x"].as_f64().unwrap(),
            y: contacts[0]["y"].as_f64().unwrap(),
            z: contacts[0]["z"].as_f64().unwrap(),
            frame: None,
        };
        let bound: serde_json::Value = serde_json::from_str(&kernel.advance_json(&json!({
            "delta":0.0,"writes":[],"actions":[{"scope":{"kind":"host"},"request":{
                "kind":"bind-construction-stage","site":"wall-top-floor","contact":contact
            }}]
        }).to_string()).unwrap()).unwrap();
        assert_eq!(bound["results"][0]["accepted"], true);

        let saved = kernel.save_records().unwrap();
        let mut restored = Kernel::new();
        restored.restore_records(&saved).unwrap();
        assert_eq!(restored.save_records().unwrap().entities, saved.entities);
    }

    #[test]
    fn construction_access_stair_groups_origin_and_landing() {
        let (mut kernel, surface, _) = world();
        kernel.environment.as_mut().unwrap().structures.insert("stair".into(), crate::environment_definition::StructureDefinition {
            id: "stair".into(), shape: crate::environment_definition::StructureShape::Stair { run: 2, rise: 2 },
            materials: BTreeMap::new(), work_seconds: 1.0, work_reach_below_cells: 0, on_complete: Default::default(), on_remove: Default::default(),
        });
        kernel.advance_json(&json!({"delta":0.0,"writes":[],"actions":[{"scope":{"kind":"host"},"request":{"kind":"plan-constructions","party":"party","plans":[{"catalog":"stair","site":"access-stair","target":{"kind":"cell","cell":{"x":surface.x,"y":surface.y,"z":surface.z},"orientation":"east"}}]}}]}).to_string()).unwrap();
        let rows: serde_json::Value = serde_json::from_str(&kernel.construction_access_json("[\"access-stair\"]").unwrap()).unwrap();
        let contacts = rows[0]["contacts"].as_array().unwrap();
        assert_eq!(contacts.len(), 4);
        assert!(contacts.iter().all(|row| row["kind"] == "origin" && row["y"] == (f64::from(surface.y) + 0.5) * kernel.environment.as_ref().unwrap().world.cell_spacing_m()[1]));
    }

    #[test]
    fn construction_access_uses_the_rotated_fixture_perimeter() {
        let (mut kernel, surface, _) = world();
        kernel.environment.as_mut().unwrap().structures.insert("bed".into(), crate::environment_definition::StructureDefinition {
            id: "bed".into(), shape: crate::environment_definition::StructureShape::Fixture { footprint: vec![[0, 0], [0, 1]] },
            materials: BTreeMap::new(), work_seconds: 1.0, work_reach_below_cells: 0, on_complete: Default::default(), on_remove: Default::default(),
        });
        kernel.advance_json(&json!({"delta":0.0,"writes":[],"actions":[{"scope":{"kind":"host"},"request":{"kind":"plan-constructions","party":"party","plans":[{"catalog":"bed","site":"access-bed","target":{"kind":"cell","cell":{"x":surface.x,"y":surface.y+1,"z":surface.z},"orientation":"east"}}]}}]}).to_string()).unwrap();
        let rows: serde_json::Value = serde_json::from_str(&kernel.construction_access_json("[\"access-bed\"]").unwrap()).unwrap();
        let spacing = kernel.environment.as_ref().unwrap().world.cell_spacing_m();
        let occupied = [
            (surface.x as f64 * spacing[0], surface.z as f64 * spacing[2]),
            ((surface.x - 1) as f64 * spacing[0], surface.z as f64 * spacing[2]),
        ];
        let contacts = rows[0]["contacts"].as_array().unwrap();
        assert!(!contacts.is_empty());
        assert!(contacts.iter().all(|row| matches!(row["kind"].as_str(), Some("origin") | Some("landing"))));
        assert!(contacts.iter().all(|row| row["kind"] == "origin"));
        assert!(contacts.iter().all(|row| !occupied.contains(&(row["x"].as_f64().unwrap(), row["z"].as_f64().unwrap()))));
        assert!(contacts.iter().any(|row| row["x"] == (surface.x - 2) as f64 * spacing[0]));
    }

    #[test]
    fn physical_contacts_compose_floor_seal_wall_bulk_and_outside() {
        let (mut kernel, surface, _) = world();
        let structures = vec![
            crate::structure_geometry::StaticInstance::Floor { id: "floor-contact".into(), support: crate::generation::Cell { x: surface.x + 1, y: surface.y + 1, ..surface } },
            crate::structure_geometry::StaticInstance::Wall { id: "wall-contact".into(), edge: crate::structure_geometry::Face { cell: crate::generation::Cell { y: surface.y + 1, ..surface }, axis: crate::structure_geometry::FaceAxis::X }, height: 1 },
        ];
        let prepared = kernel.environment.as_mut().unwrap().world.prepare_structures(structures).unwrap().unwrap();
        kernel.environment.as_mut().unwrap().world.apply_structures(prepared).unwrap();
        let outside = kernel.environment.as_ref().unwrap().world.bounds().max_x + 1;
        let facts: serde_json::Value = serde_json::from_str(&kernel.physical_contacts_json(&json!([
            [surface.x + 1, surface.y + 1, surface.z], [surface.x, surface.y + 1, surface.z], [outside, surface.y, surface.z]
        ]).to_string()).unwrap()).unwrap();
        assert_eq!(facts[0], json!({"solid":false,"sealedTop":true,"outside":false}));
        assert_eq!(facts[1], json!({"solid":false,"sealedTop":false,"outside":false}));
        let projection = kernel.environment.as_ref().unwrap().world.structure_projection_snapshot();
        assert!(projection.blocks_crossing(
            crate::generation::Cell { x: surface.x, y: surface.y + 1, z: surface.z },
            crate::generation::Cell { x: surface.x + 1, y: surface.y + 1, z: surface.z },
        ).unwrap());
        assert_eq!(facts[2], json!({"solid":false,"sealedTop":false,"outside":true}));
        assert!(kernel.physical_contacts_json(&json!([[surface.x, i64::from(i32::MAX) + 1, surface.z]]).to_string()).is_err());
    }
}

fn segment_intersects_cell(start: &Point, end: &Point, cell: navigation::Cell) -> bool {
    let bounds = [
        (cell.0 as f64 - 0.5, cell.0 as f64 + 0.5),
        (cell.2 as f64 - 0.5, cell.2 as f64 + 0.5),
    ];
    let coordinates = [(start.x, end.x), (start.z, end.z)];
    let mut minimum: f64 = 0.0;
    let mut maximum: f64 = 1.0;
    for (axis, (from, to)) in coordinates.into_iter().enumerate() {
        let delta = to - from;
        if delta.abs() <= f64::EPSILON {
            if from < bounds[axis].0 || from > bounds[axis].1 {
                return false;
            }
            continue;
        }
        let mut entry = (bounds[axis].0 - from) / delta;
        let mut exit = (bounds[axis].1 - from) / delta;
        if entry > exit {
            std::mem::swap(&mut entry, &mut exit);
        }
        minimum = minimum.max(entry);
        maximum = maximum.min(exit);
        if minimum > maximum {
            return false;
        }
    }
    true
}

/// Check only the segments this movement budget could consume. This avoids
/// both tunnelling through a later corner and scanning an entire future route.
fn terrain_motion_blocked(position: Position, path: &navigation::RouteProgress, mut budget: f64,
    blocked: &BTreeSet<navigation::Cell>) -> bool {
    if blocked.is_empty() || budget <= 0.0 { return false; }
    let mut from = navigation::point(position);
    for target in path.iter() {
        if budget <= 0.0 { break; }
        let distance = ((target.x-from.x).powi(2)+(target.y-from.y).powi(2)+(target.z-from.z).powi(2)).sqrt();
        let fraction = if distance == 0.0 { 1.0 } else { (budget/distance).min(1.0) };
        let end = Point { x:from.x+(target.x-from.x)*fraction, y:from.y+(target.y-from.y)*fraction,
            z:from.z+(target.z-from.z)*fraction, frame:None };
        let ranges = [(from.x,end.x),(from.y,end.y),(from.z,end.z)].map(|(a,b)| (a.min(b).round() as i32,a.max(b).round() as i32));
        for x in ranges[0].0..=ranges[0].1 {
            for y in ranges[1].0..=ranges[1].1 {
                for z in ranges[2].0..=ranges[2].1 {
                    if blocked.contains(&(x,y,z)) && segment_intersects_cell(&from,&end,(x,y,z)) { return true; }
                }
            }
        }
        budget = (budget-distance).max(0.0);
        from = target.clone();
    }
    false
}

pub struct KernelRecords {
    pub entities: String,
    pub atmosphere: Option<Vec<u8>>,
    pub environment: Option<(String, crate::terrain_water::TerrainWaterRecords)>,
}
struct KernelEnvironment {
    paid_emissions: BTreeMap<String, environment_runtime::PaidEmission>,
    emissions: crate::emission_definition::EmissionCatalog,
    processes: crate::staged_process::ProcessCatalog,
    atmosphere: Option<crate::terrain_atmosphere::TerrainAtmosphere>,
    definition: String,
    world: crate::terrain_water::TerrainWater,
    excavation_rules: BTreeMap<u16, crate::environment_definition::ExcavationRule>,
    structures: BTreeMap<String, crate::environment_definition::StructureDefinition>,
    resources: BTreeMap<String, crate::environment_definition::ResourceDefinition>,
}
struct PreparedRoute {
    points: VecDeque<Point>,
    terrain: Option<TerrainRouteState>,
}
#[derive(Clone)]
struct TerrainRouteState {
    path: Vec<crate::generation::Cell>,
    revision: Option<u64>,
    waiting: bool,
    pending: bool,
    suspended: bool,
    origin: Point,
    target: Option<Point>,
}

pub struct Kernel {
    ecs: World,
    material_catalog: crate::material_catalog::Catalog,
    stockpile_profiles: BTreeMap<String, crate::stockpile_definition::StockpileProfileDefinition>,
    environment: Option<KernelEnvironment>,
    discard_required: bool,
    registry: Registry,
    ids: BTreeMap<String, Entity>,
    known: BTreeSet<String>,
    queries: BTreeMap<Vec<String>, QueryState<Entity>>,
    contents: BTreeMap<String, BTreeSet<Entity>>,
    visible_source_containers: BTreeSet<String>,
    stockpile_policies_by_position: BTreeMap<(u64, u64, u64), BTreeSet<String>>,
    ground_stocks_by_position: BTreeMap<(u64, u64, u64), BTreeSet<String>>,
    storage_providers_by_position: BTreeMap<(u64, u64, u64), BTreeSet<String>>,
    blocked_by_frame: BTreeMap<Option<String>, BTreeSet<navigation::Cell>>,
    assignment_topology: [u8; 32],
    route_cost_failures: route_query::FailureCache,
    routes: crate::record_changes::RecordMap<Entity, navigation::RouteProgress>,
    terrain_routes: crate::record_changes::RecordMap<Entity, TerrainRouteState>,
    direct: crate::record_changes::RecordMap<Entity, DirectState>,
    game: String,
    revision: u64,
    placement_revision: u64,
    time: f64,
    next_lot: u64,
    next_projectile: u64,
    next_impact: u64,
    projectile_count: usize,
    projectile_contacts: crate::record_changes::RecordMap<String, BTreeSet<String>>,
    collider_ids: BTreeSet<String>,
    state_weight: usize,
    material_consumption_owner: Arc<()>,
    ground_stock_cleanup_pending: bool,
    bound_process_lots: BTreeSet<String>,
    next_work_generation: u64,
    next_party_sequence: u64,
    party_bindings: crate::party_binding::PartyBindingStore,
    work_attempts: BTreeMap<String, Entity>,
    attempts_by_worker: BTreeMap<String, AttemptKey>,
    arrived_routes: BTreeSet<Entity>,
    planner: PlannerState,
    planner_indexes: NativeIndexes,
    relations: RelationIndex,
    ownership: crate::ownership::OwnershipIndex,
    supply_index: crate::supply_allocation::SupplyAllocationIndex,
    job_index: job_owner::JobIndex,
}
const STATE_BYTES: usize = 8 * 1024 * 1024;

/// The single bounded earned-effort arithmetic used by native work owners.
pub(super) fn earned_work_seconds(current: f64, delta: f64, required: f64) -> Result<f64> {
    if !current.is_finite() || !delta.is_finite() || !required.is_finite() || current < 0.0 || delta < 0.0 || required <= 0.0 {
        return Err("invalid earned work interval".into());
    }
    Ok((current + delta).min(required))
}

impl Kernel {
    pub(crate) fn work_execution_for_scope(&self, scope: &ActionScope, pool: &str, policy_id: &str) -> Result<WorkExecution> {
        if !valid_id(pool) || !valid_id(policy_id) { return Err("invalid work execution identity".into()); }
        match scope {
            ActionScope::Host => Ok(WorkExecution { pool: pool.into(), initiating_player: None, policy_id: policy_id.into() }),
            ActionScope::Player { player } if valid_id(player) => {
                let pool_entity = self.entity(pool)?;
                self.ecs.get::<Party>(pool_entity).ok_or("work execution pool is not a party")?;
                if self.ownership.player(pool) != Some(player.as_str()) { return Err("work execution player does not own pool".into()); }
                Ok(WorkExecution { pool: pool.into(), initiating_player: Some(player.into()), policy_id: policy_id.into() })
            }
            ActionScope::Player { .. } => Err("invalid work execution player".into()),
        }
    }

    pub(crate) fn bump_placement_revision(&mut self) {
        self.placement_revision = self.placement_revision.checked_add(1).unwrap_or(1);
    }
    fn next_placement_revision(&self) -> u64 {
        self.placement_revision.checked_add(1).unwrap_or(1)
    }
    fn validate_resource_sites(&self) -> Result<()> {
        let Some(environment) = &self.environment else { return Ok(()); };
        for (id, entity) in &self.ids {
            let Some(site) = self.ecs.get::<ResourceSite>(*entity) else { continue; };
            let definition = environment.resources.get(&site.definition).ok_or("saved resource site definition is missing")?;
            if site.stage as usize > definition.stages.len() || !site.next_due.is_finite() || site.next_due < 0.0
                || self.ecs.get::<Position>(*entity).is_none()
                || self.ecs.get::<FiniteResource>(*entity).is_none()
                || id.is_empty() { return Err("invalid saved resource site".into()); }
            let output = self.ecs.get::<FiniteResource>(*entity).unwrap();
            let mature = site.stage as usize == definition.stages.len();
            if output.kind != definition.output_kind || (!mature && output.quantity != 0) || (mature && output.quantity != 0 && output.quantity != definition.output_quantity) { return Err("saved resource site yield is invalid".into()); }
        }
        Ok(())
    }
    fn validate_structure_recipes(&self) -> Result<()> {
        let Some(environment) = &self.environment else { return Ok(()); };
        let mut known = self.known.clone();
        for (site, entity) in &self.ids {
            let Some(state) = self.ecs.get::<ConstructionSite>(*entity) else { continue; };
            let Some(definition) = environment.structures.get(&state.catalog) else { return Err("construction site catalog binding is missing".into()); };
            for port in &definition.on_complete.ports { known.insert(format!("{site}:{}", port.key)); }
        }
        for definition in environment.structures.values() {
            for (name, value) in &definition.on_complete.components {
                if crate::registry::Registry::is_physical(name) && !matches!(name.as_str(), "hive.emitter" | "hive.visual") {
                    return Err(format!("physical component {name} cannot be installed on a completed structure"));
                }
                self.registry.validate(name, value, &known)?;
                self.validate_stockpile_component_profile(name, value)?;
            }
            for port in &definition.on_complete.ports {
                for (name, value) in &port.components {
                    if crate::registry::Registry::is_physical(name) && !matches!(name.as_str(), "hive.container" | "hive.storage-provider" | "hive.stockpile-cell" | "hive.emitter" | "hive.visual") {
                        return Err(format!("physical component {name} cannot be installed on a completed structure port"));
                    }
                    self.registry.validate(name, value, &known)?;
                    self.validate_stockpile_component_profile(name, value)?;
                }
            }
        }
        Ok(())
    }
    fn validate_stockpile_component_profile(&self, name: &str, value: &crate::components::Record) -> Result<()> {
        if name != "hive.stockpile-cell" { return Ok(()); }
        let profile = value.get("filterProfile").and_then(serde_json::Value::as_str).ok_or("stockpile cell filter profile is missing")?;
        self.stockpile_profiles.get(profile).ok_or_else(|| "stockpile cell references unknown profile".to_owned()).map(|_| ())
    }
    fn validate_process_records(&self) -> Result<()> {
        let Some(environment) = &self.environment else { return Ok(()); };
        let mut bindings_by_process: BTreeMap<String, Vec<(String, crate::staged_process::ProcessBinding)>> = BTreeMap::new();
        for (id, entity) in &self.ids {
            if let Some(binding) = self.ecs.get::<crate::staged_process::ProcessBinding>(*entity) {
                bindings_by_process.entry(binding.process.clone()).or_default().push((id.clone(), binding.clone()));
            }
        }
        for (id, entity) in &self.ids {
            let Some(process) = self.ecs.get::<StagedProcess>(*entity) else { continue; };
            let definition = environment.processes.get(&process.definition).ok_or("saved process definition is unknown")?.definition();
            if process.version != crate::staged_process::CURRENT_VERSION
                || process.definition_version != definition.version
                || process.station.is_empty()
                || process.stage_index as usize >= definition.stages.len()
                || !process.progress_seconds.is_finite()
                || process.progress_seconds < 0.0
                || (process.phase == ProcessPhase::Blocked) != !process.blocked_reason.is_empty()
                || (process.phase != ProcessPhase::Blocked) && !process.blocked_reason.is_empty()
            { return Err("saved process fact is invalid".into()); }
            if let Some(owner) = self.ecs.get::<OwnedByParty>(*entity) {
                let Some(policy) = self.ecs.get::<crate::work_planner::WorkPolicy>(*entity) else { return Err("saved party process has no work policy".into()); };
                let Some(schedule) = self.ecs.get::<crate::work_planner::WorkSchedule>(*entity) else { return Err("saved party process has no work schedule".into()); };
                if policy.pool != owner.party || schedule.next_review_tick < schedule.last_considered { return Err("saved party process scheduling is invalid".into()); }
            }
            let station = self.entity(&process.station)?;
            let site = self.ecs.get::<ConstructionSite>(station).ok_or("saved process station is missing")?;
            if site.phase != ConstructionPhase::Finished || site.catalog != definition.station_catalog || self.ecs.get::<SealedContainer>(station).is_none() { return Err("saved process station binding is invalid".into()); }
            if id != &format!("process:{}:{}", process.station, process.definition) { return Err("saved process identity is invalid".into()); }
            let bindings = bindings_by_process.remove(id).unwrap_or_default();
            if process.phase == ProcessPhase::Complete && !bindings.is_empty() { return Err("completed process retains input bindings".into()); }
            let attendance = self.work_attempts.get(id).and_then(|attempt_entity| self.ecs.get::<WorkAttempt>(*attempt_entity));
            let executing_attendance = attendance.and_then(|attempt| match &attempt.phase {
                AttemptPhase::Executing { activity: crate::work_attempt::ActivityRef::ProcessAttendance { process: target, .. }, .. } if target == id => Some(attempt),
                _ => None,
            });
            if process.phase == ProcessPhase::Working {
                if definition.stages.get(process.stage_index as usize).is_none_or(|stage| stage.mode != StageMode::Attended) { return Err("working process stage is not attended".into()); }
                let Some(attempt) = executing_attendance else { return Err("working process has no executing attendance attempt".into()); };
                if self.ecs.get::<OwnedByParty>(*entity).map(|owner| owner.party.as_str()) != Some(attempt.execution.pool.as_str()) { return Err("process attendance party does not match process owner".into()); }
            } else if executing_attendance.is_some() {
                return Err("non-working process retains executing attendance attempt".into());
            }
            // A newly requested stage-zero process is valid before material
            // admission. Once bindings exist, or any later stage is reached,
            // the remaining exact roles are mandatory.
            if process.phase != ProcessPhase::Complete
                && !(process.stage_index == 0 && bindings.is_empty()) {
                crate::staged_process::validate_bindings_at_stage(
                    definition, usize::from(process.stage_index), id, &process.station,
                    &bindings.iter().map(|(_, binding)| binding.clone()).collect::<Vec<_>>(),
                    &|lot_id| self.ids.get(lot_id).and_then(|entity| self.ecs.get::<Lot>(*entity).cloned()),
                )?;
            }
        }
        if !bindings_by_process.is_empty() { return Err("saved process binding references an unknown process".into()); }
        for (task, attempt_entity) in &self.work_attempts {
            let Some(attempt) = self.ecs.get::<WorkAttempt>(*attempt_entity) else { return Err("work attempt index references missing component".into()); };
            let Some(crate::work_attempt::ActivityRef::ProcessAttendance { process, .. }) = (match &attempt.phase { AttemptPhase::Executing { activity, .. } | AttemptPhase::Outcome { activity, .. } => Some(activity), AttemptPhase::Settling { .. } | AttemptPhase::Ready => None }) else { continue; };
            if task != process { return Err("process attendance task does not match process activity".into()); }
            let process_entity = self.entity(process)?;
            let state = self.ecs.get::<StagedProcess>(process_entity).ok_or("process attendance references non-process task")?;
            if matches!(attempt.phase, AttemptPhase::Executing { .. }) && state.phase != ProcessPhase::Working { return Err("executing attendance does not match working process".into()); }
        }
        Ok(())
    }

    fn validate_field_water_records(&self) -> Result<()> {
        for (id, entity) in &self.ids {
            let Some(work) = self.ecs.get::<FieldWaterWork>(*entity) else { continue; };
            if self.ecs.get::<OwnedByParty>(*entity).map(|owner| owner.party.as_str()) != Some(work.party.as_str())
                || self.ecs.get::<crate::work_planner::WorkPolicy>(*entity).is_none_or(|policy| policy.pool != work.party)
                || self.ecs.get::<crate::work_planner::WorkSchedule>(*entity).is_none()
                || work.role.is_empty() || work.generation == 0
            { return Err("invalid field water work ownership".into()); }
            let owner = self.entity(&work.process)?;
            if self.ecs.get::<OwnedByParty>(owner).map(|owner| owner.party.as_str()) != Some(work.party.as_str()) {
                return Err("invalid field water process binding".into());
            }
            // Retained water belongs to a manual request or resource order.
            // Shared supply demand delivers water into an owned container.
            if work.retain_in_vessel {
                if work.destination != work.process {
                    return Err("invalid retained field water destination".into());
                }
                if work.process == *id {
                    if !id.starts_with("field-water:manual:") || work.role != "manual" || work.generation != 1 {
                        return Err("invalid manual field water binding".into());
                    }
                } else if self.ecs.get::<ResourceOrder>(owner).is_none()
                    || work.role != "tend"
                    || *id != format!("resource-water:{}:{}", work.process, work.generation)
                {
                    return Err("invalid resource field water binding".into());
                }
            } else {
                let valid_owner = if let Some(process) = self.ecs.get::<StagedProcess>(owner) {
                    process.phase != ProcessPhase::Complete
                } else if self.ecs.get::<ConstructionSite>(owner).is_some() {
                    work.destination == work.process && work.role == work.material && work.generation == 1
                } else {
                    self.ecs.get::<StockpileCell>(owner).is_some() && work.role == work.material
                };
                if !id.starts_with("field-water:") || !valid_owner {
                    return Err("invalid field water supply binding".into());
                }
                let destination = self.entity(&work.destination)?;
                if self.ecs.get::<Container>(destination).is_none()
                    || self.ecs.get::<OwnedByParty>(destination).map(|owner| owner.party.as_str()) != Some(work.party.as_str())
                { return Err("invalid field water destination".into()); }
            }
            if let Some(vessel_id) = &work.vessel {
                let vessel = self.entity(vessel_id)?;
                let vessel_lot = self.ecs.get::<Lot>(vessel).ok_or("field water vessel is not a lot")?;
                if !self.ecs.get::<VesselCapability>(vessel).is_some_and(|capability| capability.accepts_water)
                    || self.ecs.get::<Container>(vessel).is_none()
                    || self.ecs.get::<OwnedByParty>(vessel).map(|owner| owner.party.as_str()) != Some(work.party.as_str())
                    || vessel_lot.container.is_empty() || self.entity(&vessel_lot.container).is_err()
                { return Err("invalid field water vessel custody".into()); }
                if let Some(lot_id) = &work.lot {
                    let lot = self.entity(lot_id)?;
                    let water_lot = self.ecs.get::<Lot>(lot).ok_or("field water output is not a lot")?;
                    if water_lot.kind != work.material || water_lot.quantity != u32::from(work.portions) || water_lot.container != *vessel_id
                        || self.ecs.get::<OwnedByParty>(lot).map(|owner| owner.party.as_str()) != Some(work.party.as_str())
                        || !self.ecs.get::<LotWater>(lot).is_some_and(|water| water.water_kg > 0.0)
                    { return Err("invalid field water output custody".into()); }
                }
            } else if work.lot.is_some() {
                return Err("field water output has no vessel".into());
            }
        }
        Ok(())
    }

    pub fn new() -> Self {
        let mut ecs = World::new();
        let registry = Registry::new(&mut ecs, vec![], vec![]).expect("builtin schemas");
        for component in [ecs.register_component::<ExternalId>(), ecs.register_component::<crate::job::Job>(), ecs.register_component::<crate::job::Task>(), ecs.register_component::<WorkAttempt>()] {
            crate::record_changes::install(&mut ecs, component);
        }
        Self {
            ecs,
            material_catalog: Default::default(),
            stockpile_profiles: Default::default(),
            environment: None,
            discard_required: false,
            registry,
            ids: BTreeMap::new(),
            known: BTreeSet::new(),
            queries: BTreeMap::new(),
            contents: BTreeMap::new(),
            visible_source_containers: BTreeSet::new(),
            stockpile_policies_by_position: BTreeMap::new(),
            ground_stocks_by_position: BTreeMap::new(),
            storage_providers_by_position: BTreeMap::new(),
            blocked_by_frame: BTreeMap::new(),
            assignment_topology: [0; 32],
            route_cost_failures: route_query::FailureCache::default(),
            routes: Default::default(),
            terrain_routes: Default::default(),
            direct: Default::default(),
            game: String::new(),
            revision: 0,
            placement_revision: 0,
            time: 0.0,
            next_lot: 1,
            next_projectile: 1,
            next_impact: 1,
            projectile_count: 0,
            projectile_contacts: Default::default(),
            collider_ids: BTreeSet::new(),
            state_weight: 0,
            material_consumption_owner: Arc::new(()),
            ground_stock_cleanup_pending: false,
            bound_process_lots: BTreeSet::new(),
            next_work_generation: 1,
            next_party_sequence: 1,
            party_bindings: crate::party_binding::PartyBindingStore::default(),
            work_attempts: BTreeMap::new(),
            attempts_by_worker: BTreeMap::new(),
            arrived_routes: BTreeSet::new(),
            planner: PlannerState::default(),
            planner_indexes: NativeIndexes::default(),
            relations: RelationIndex::default(),
            ownership: crate::ownership::OwnershipIndex::default(),
            supply_index: crate::supply_allocation::SupplyAllocationIndex::default(),
            job_index: job_owner::JobIndex::default(),
        }
    }
    fn ensure_ready(&self) -> Result<()> {
        if self.discard_required { return Err("kernel attempt requires durable restore".into()); }
        Ok(())
    }

    pub(crate) fn ecs(&self) -> &World { &self.ecs }
    pub(crate) fn stockpile_profile(&self, id: &str) -> Option<&crate::stockpile_definition::StockpileProfileDefinition> { self.stockpile_profiles.get(id) }
    pub(crate) fn refresh_planner_index(&mut self, id: &str) {
        let entity = self.ids.get(id).copied();
        self.planner_indexes.refresh_entity(&self.relations, &self.ecs, id, entity);
    }
    pub(crate) fn rebuild_planner_index(&mut self) {
        self.planner_indexes.rebuild(&self.relations, &self.ecs, &self.ids);
    }
    pub(crate) fn refresh_ownership_index(&mut self, id: &str) {
        self.ownership.refresh(&self.ecs, id, self.ids.get(id).copied());
    }
    pub(crate) fn refresh_relation_source(&mut self, source: &str) -> Result<()> {
        self.relations.refresh_source(&self.registry, &self.ecs, &self.ids, source)
    }
    pub(crate) fn rebuild_relation_index(&mut self) -> Result<()> {
        self.relations.rebuild(&self.registry, &self.ecs, &self.ids)
    }
    pub(crate) fn relation_target(&self, kind: &str, source: &str) -> Option<&str> {
        self.relations.target(kind, source)
    }
    pub(crate) fn relation_sources(&self, kind: &str, target: &str) -> &[String] {
        self.relations.sources(kind, target)
    }
    pub(crate) fn supply_index(&self) -> &crate::supply_allocation::SupplyAllocationIndex { &self.supply_index }
    pub(crate) fn supply_allocation(&self, id: &str) -> Option<&SupplyAllocation> {
        self.ids.get(id).and_then(|entity| self.ecs.get::<SupplyAllocation>(*entity))
    }
    pub(crate) fn refresh_supply_index(&mut self, id: &str) {
        let allocation = self.supply_allocation(id).cloned();
        self.supply_index.refresh(id, allocation.as_ref());
    }
    #[cfg(test)]
    pub(crate) fn planner_index_rebuilds(&self) -> u64 { self.planner_indexes.rebuild_count() }
    pub(crate) fn next_native_planning_window(&mut self, tick: u64) -> crate::work_candidates::PlanningWindow {
        crate::work_candidates::next_fair_indexed_window(&mut self.planner, &self.planner_indexes, tick)
    }
    fn native_planner_may_mutate(&self, tick: u64) -> bool {
        self.planner.continuation.is_some() || self.planner_indexes.has_due_task(tick)
            // Accepted work may arrive or publish an outcome before the next
            // candidate review. Its reconciliation still needs atomic staging.
            || self.work_attempts.values().any(|entity| self.ecs.get::<WorkAttempt>(*entity)
                .is_some_and(|attempt| attempt.continuation_owner == crate::work_attempt::ContinuationOwner::Native))
    }
    pub(crate) fn external_id(&self, entity: Entity) -> Result<String> { self.ecs.get::<ExternalId>(entity).map(|id| id.0.clone()).ok_or("entity has no external identity".into()) }
    pub(crate) fn supply_allocations(&self) -> impl Iterator<Item = (&str, &SupplyAllocation)> {
        self.ids.iter().filter_map(|(id, entity)| self.ecs.get::<SupplyAllocation>(*entity).map(|allocation| (id.as_str(), allocation)))
    }
    pub(crate) fn work_attempt(&self, task: &str) -> Option<&WorkAttempt> {
        self.work_attempts.get(task).and_then(|entity| self.ecs.get::<WorkAttempt>(*entity))
    }
    pub(crate) fn quantity_in_container(&self, container: &str) -> u32 {
        self.contents.get(container).into_iter().flatten().filter_map(|entity| self.ecs.get::<Lot>(*entity)).filter(|lot| lot.container == container).fold(0, |total, lot| total.saturating_add(lot.quantity))
    }
    pub(crate) fn ground_stock_accepts(&self, container: &str, material: &str) -> bool {
        let Ok(entity) = self.entity(container) else { return false; };
        self.ecs.get::<GroundStock>(entity).is_some()
            && self.contents.get(container).into_iter().flatten().all(|lot_entity| {
                self.ecs.get::<Lot>(*lot_entity).is_none_or(|lot| lot.kind == material)
            })
    }
    pub(crate) fn is_supply_source_container(&self, entity: Entity) -> bool {
        self.ecs.get::<GroundStock>(entity).is_some()
            || self.ecs.get::<StorageProvider>(entity).is_some()
    }

    /// Reserve one exact lot portion and the matching destination capacity.
    /// No quantity moves until the allocation's WorkAttempt performs pickup.
    pub(crate) fn reserve_supply_allocation(&mut self, requirement_owner: String, requirement_role: String, requirement_generation: u64, party: String, material: String, portion: String, destination: String, quantity: u32) -> Result<String> {
        self.ensure_ready()?;
        if !valid_id(&requirement_owner) || !valid_id(&requirement_role) || requirement_generation == 0 || !valid_id(&party) || !valid_id(&material) || !valid_id(&portion) || !valid_id(&destination) || quantity == 0 { return Err("invalid supply allocation request".into()); }
        self.entity(&requirement_owner)?;
        let party_entity = self.entity(&party)?;
        self.ecs.get::<Party>(party_entity).ok_or("supply allocation party is not a party")?;
        let source = self.entity(&portion)?;
        let target = self.entity(&destination)?;
        let lot = self.ecs.get::<Lot>(source).ok_or("supply portion is missing")?;
        if lot.kind != material { return Err("supply portion material mismatch".into()); }
        if self.ecs.get::<Container>(target).is_none() { return Err("supply destination is not a container".into()); }
        if self.ecs.get::<GroundStock>(target).is_some() && !self.ground_stock_accepts(&destination, &material) { return Err("ground stock material is incompatible".into()); }
        let source_container = self.entity(&lot.container)?;
        let public_ground = self.ecs.get::<GroundStock>(source_container).is_some()
            && self.ecs.get::<OwnedByParty>(source_container).is_none();
        let source_party_ok = self.ecs.get::<OwnedByParty>(source_container).map(|owner| owner.party.as_str()) == Some(party.as_str()) || public_ground;
        let lot_party_ok = self.ecs.get::<OwnedByParty>(source).map(|owner| owner.party.as_str()) == Some(party.as_str()) || (public_ground && self.ecs.get::<OwnedByParty>(source).is_none());
        if !source_party_ok
            || self.ecs.get::<OwnedByParty>(target).map(|owner| owner.party.as_str()) != Some(party.as_str())
            || !lot_party_ok
        {
            return Err("supply party ownership mismatch".into());
        }
        crate::supply_allocation::validate_capacity(self, source, target, quantity, None)?;
        let allocation_sequence = self.next_work_generation;
        self.next_work_generation = self.next_work_generation.checked_add(1).ok_or("supply allocation identity exhausted")?;
        let id = format!("allocation.{allocation_sequence}");
        if self.known.contains(&id) { return Err("supply allocation identity collides with live state".into()); }
        let execution = self.ecs.get::<WorkExecution>(self.entity(&requirement_owner)?).cloned().ok_or("supply requirement owner has no work execution")?;
        if execution.pool != party { return Err("supply execution pool mismatch".into()); }
        let entity = self.ecs.spawn((ExternalId(id.clone()), OwnedByParty { party: party.clone() }, crate::work_planner::WorkPolicy { pool: party.clone(), priority: 0, enabled: true }, execution, crate::work_planner::WorkSchedule { next_review_tick: 0, last_considered: 0 }, SupplyAllocation { requirement_owner, requirement_role, requirement_generation, party, material, portion, destination, quantity, state: SupplyAllocationState::Reserved })).id();
        self.ids.insert(id.clone(), entity); self.known.insert(id.clone()); self.refresh_planner_index(&id); self.refresh_supply_index(&id); self.refresh_state_weight();
        Ok(id)
    }

    pub(crate) fn cancel_supply_allocation(&mut self, allocation: &str) -> Result<()> {
        let entity = self.entity(allocation)?;
        let state = self.ecs.get::<SupplyAllocation>(entity).ok_or("supply allocation is missing")?.state;
        if state == SupplyAllocationState::Delivered { return Err("delivered supply allocation cannot be cancelled".into()); }
        crate::record_changes::edit::<SupplyAllocation>(entity, &mut self.ecs).unwrap().state = SupplyAllocationState::Cancelled;
        if let Some(policy) = self.ecs.get::<crate::work_planner::WorkPolicy>(entity).cloned() {
            self.ecs.entity_mut(entity).insert(crate::work_planner::WorkPolicy { enabled: false, ..policy });
        }
        self.refresh_supply_index(allocation);
        self.refresh_planner_index(allocation);
        self.refresh_state_weight();
        Ok(())
    }

    pub fn load(&mut self, input: &str) -> Result<()> {
        if input.len() > 8 * 1024 * 1024 {
            return Err("scene too large".into());
        }
        let scene: Scene = serde_json::from_str(input).map_err(|e| e.to_string())?;
        *self = Self::from_scene(scene)?;
        Ok(())
    }
    fn from_scene(scene: Scene) -> Result<Self> {
        Self::from_scene_mode(scene, true)
    }
    fn from_scene_mode(scene: Scene, build_routes: bool) -> Result<Self> {
        if scene.format != "hive-game"
            || scene.version != 3
            || !valid_id(&scene.game)
            || scene.initial.len() > 16384
        {
            return Err("unsupported or oversized scene".into());
        }
        let material_catalog = crate::material_catalog::Catalog::from_definitions(scene.material_catalog.clone())?;
        let mut world = Self::new();
        world.material_catalog = material_catalog;
        if scene.stockpile_profiles.len() > 256 { return Err("too many stockpile profiles".into()); }
        let mut stockpile_profiles = BTreeMap::new();
        for profile in scene.stockpile_profiles {
            crate::stockpile_definition::validate(&profile, &world.material_catalog)?;
            if stockpile_profiles.insert(profile.id.clone(), profile).is_some() {
                return Err("invalid or duplicate stockpile profile".into());
            }
        }
        world.stockpile_profiles = stockpile_profiles;
        world.registry = Registry::new(&mut world.ecs, scene.components, scene.actors)?;
        world.game = scene.game;
        for row in &scene.initial {
            if !valid_id(&row.id) || !world.known.insert(row.id.clone()) {
                return Err("invalid or duplicate entity".into());
            }
            world.ids.insert(
                row.id.clone(),
                world.ecs.spawn(ExternalId(row.id.clone())).id(),
            );
        }
        for row in scene.initial {
            let entity = world.ids[&row.id];
            for (name, value) in row.components {
                world.registry.validate(&name, &value, &world.known)?;
                world
                    .registry
                    .insert(&mut world.ecs, entity, &name, &value)?;
            }
        }
        world.rebuild_physical_indexes(build_routes)?;
        world.relations.rebuild(&world.registry, &world.ecs, &world.ids)?;
        let stockpile_cells = world.ids.iter().filter_map(|(id, entity)| {
            world.ecs.get::<StockpileCell>(*entity).and_then(|cell| {
                world.stockpile_profiles.get(&cell.filter_profile).map(|_| (id.clone(), *entity))
            })
        }).collect::<Vec<_>>();
        if stockpile_cells.len() != world.ids.values().filter(|entity| world.ecs.get::<StockpileCell>(**entity).is_some()).count() {
            return Err("stockpile cell references unknown profile".into());
        }
        for (id, entity) in stockpile_cells {
            stockpile_work::install_planner_state(&mut world, &id, entity, None)?;
        }
        world.validate_work_execution()?;
        world.rebuild_planner_index();
        world.supply_index.rebuild(&world.ids, &world.ecs);
        world.projectile_count = world
            .ids
            .values()
            .filter(|entity| world.ecs.get::<Projectile>(**entity).is_some_and(|p| p.state == "flying" || p.state == "rolling"))
            .count();
        world.collider_ids = world
            .ids
            .iter()
            .filter(|(_, entity)| world.ecs.get::<Collider>(**entity).is_some())
            .map(|(id, _)| id.clone())
            .collect();
        world.state_weight = 1024
            + serde_json::to_vec(&world.registry.schemas.values().collect::<Vec<_>>())
                .map_err(|e| e.to_string())?
                .len();
        for (id, e) in &world.ids {
            world.state_weight += id.len() + 128;
            for name in world.registry.schemas.keys() {
                if let Some(value) = world.registry.read(&world.ecs, *e, name) {
                    world.state_weight += world.registry.weight(name, &value);
                }
            }
        }
        world.refresh_projectile_contact_weight();
        if world.state_weight > STATE_BYTES {
            return Err("region canonical state capacity".into());
        }
        Ok(world)
    }
    fn support_id(&self, entity: Entity) -> Option<String> {
        self.ecs
            .get::<Support>(entity)
            .map(|support| support.entity.clone())
    }
    fn refresh_state_weight(&mut self) {
        let mut weight = 1024
            + serde_json::to_vec(&self.registry.schemas.values().collect::<Vec<_>>())
                .expect("physical schemas")
                .len();
        let indexed_entities: Vec<_> = self.ids.iter().map(|(id, entity)| (id.clone(), *entity)).collect();
        for (id, entity) in indexed_entities {
            weight += id.len() + 128;
            for name in self.registry.schemas.keys() {
                if let Some(value) = self.registry.read(&self.ecs, entity, name) {
                    weight += self.registry.weight(name, &value);
                }
            }
        }
        weight = weight.saturating_add(
            self.projectile_contacts
                .iter()
                .map(|(id, targets)| id.len() + targets.iter().map(String::len).sum::<usize>() + targets.len() * 16 + 32)
                .sum::<usize>(),
        );
        self.state_weight = weight;
    }
    fn refresh_projectile_contact_weight(&mut self) {
        self.state_weight = self.state_weight.saturating_add(
            self.projectile_contacts
                .iter()
                .map(|(id, targets)| id.len() + targets.iter().map(String::len).sum::<usize>() + targets.len() * 16 + 32)
                .sum::<usize>(),
        );
    }
    fn direct_weight(state: &DirectState) -> usize {
        serde_json::to_vec(state).map_or(usize::MAX, |bytes| bytes.len())
    }
    fn surface(&self, id: &str) -> Result<Surface> {
        let entity = self.entity(id)?;
        self.ecs
            .get::<Surface>(entity)
            .copied()
            .ok_or_else(|| format!("support {id} has no surface"))
    }
    fn support_chain(&self, id: &str) -> Result<()> {
        let mut current = id.to_string();
        let mut seen = BTreeSet::new();
        for depth in 0..=16 {
            let entity = self.entity(&current)?;
            if !seen.insert(current.clone()) {
                return Err("cyclic support reference".into());
            }
            let Some(support) = self.ecs.get::<Support>(entity) else {
                return Ok(());
            };
            if depth == 16 {
                return Err("support chain exceeds depth 16".into());
            }
            if seen.contains(&support.entity) {
                return Err("cyclic support reference".into());
            }
            self.surface(&support.entity)?;
            current = support.entity.clone();
        }
        Err("support chain exceeds depth 16".into())
    }
    fn world_pose_entity(&self, entity: Entity, depth: usize) -> Result<Position> {
        if depth > 16 {
            return Err("support chain exceeds depth 16".into());
        }
        let local = *self.ecs.get::<Position>(entity).ok_or("no position")?;
        let Some(support_id) = self.support_id(entity) else {
            return Ok(local);
        };
        let support = self.entity(&support_id)?;
        let parent = self.world_pose_entity(support, depth + 1)?;
        let radians = parent.facing * std::f64::consts::FRAC_PI_2;
        let (sin, cos) = radians.sin_cos();
        Ok(Position {
            x: parent.x + cos * local.x - sin * local.z,
            y: parent.y + local.y,
            z: parent.z + sin * local.x + cos * local.z,
            facing: parent.facing + local.facing,
        })
    }
    fn world_pose(&self, id: &str) -> Result<Position> {
        self.world_pose_entity(self.entity(id)?, 0)
    }
    fn frame_bounds(&self, frame: Option<&str>) -> Result<Option<navigation::Bounds>> {
        frame
            .map(|id| {
                let surface = self.surface(id)?;
                Ok(navigation::Bounds {
                    min_x: surface.min_x,
                    max_x: surface.max_x,
                    min_z: surface.min_z,
                    max_z: surface.max_z,
                })
            })
            .transpose()
    }
    fn route_for(
        &mut self,
        entity: Entity,
        start: Position,
        destination: &Point,
    ) -> Result<PreparedRoute> {
        let frame = self.support_id(entity);
        if destination.frame.as_deref() != frame.as_deref() {
            return Err("destination frame does not match actor support".into());
        }
        if let Some(frame_id) = frame.as_deref() {
            let surface = self.surface(frame_id)?;
            if (start.y - surface.height).abs() > 1e-9
                || (destination.y - surface.height).abs() > 1e-9
            {
                return Err("position is not on support surface".into());
            }
        }
        let blocked = self
            .blocked_by_frame
            .get(&frame)
            .cloned()
            .ok_or("missing obstacle frame index")?;
        if frame.is_none() {
            if let Some(capability) = self.ecs.get::<Traversal>(entity).copied() {
                let environment = self.environment.as_mut().ok_or("terrain traversal needs environment")?;
                let spacing = environment.world.cell_spacing_m();
                let stairs = environment.world.stair_edges().to_vec();
                let to_cell = |point: &Point| -> Result<crate::generation::Cell> {
                    let values = [point.x / spacing[0], point.y / spacing[1] - 0.5, point.z / spacing[2]];
                    if !values.iter().all(|value| value.is_finite() && *value >= f64::from(i32::MIN) && *value <= f64::from(i32::MAX)) {
                        return Err("terrain route metric position is not finite".into());
                    }
                    Ok(crate::generation::Cell { x: values[0].round() as i64, y: values[1].round() as i32, z: values[2].round() as i64 })
                };
                let start_point = navigation::point(start);
                let mut start_cell = to_cell(&start_point)?;
                let destination_cell = to_cell(destination)?;
                let config = crate::terrain_traversal::TraversalConfig {
                    spacing,
                    clearance_cells: capability.clearance_cells,
                    max_step_cells: capability.max_step_cells,
                };
                let centered = |cell: crate::generation::Cell| Point { x:cell.x as f64*spacing[0], y:(f64::from(cell.y)+0.5)*spacing[1], z:cell.z as f64*spacing[2], frame:None };
                let mut prefix = Vec::new();
                let mut history = Vec::new();
                let mut contact_start = 0;
                let mut origin = start_point.clone();
                if start_point != centered(start_cell) {
                    let previous = self.terrain_routes.get(&entity).ok_or("terrain pose lacks an in-flight route")?;
                    let remaining = self.routes.get(&entity).ok_or("missing in-flight route")?;
                    let previous_points = crate::terrain_route::waypoints_with_stairs(&previous.path, config, &stairs)?;
                    let next = previous_points.len().checked_sub(remaining.len()).ok_or("invalid retained route progress")?;
                    if next >= previous_points.len()
                        || !remaining.iter().eq(previous_points[next..].iter())
                    {
                        return Err("invalid retained route progress".into());
                    }
                    contact_start = if next == 0 { 0 } else {
                        crate::terrain_route::active_support_index_with_stairs(&previous.path, next, &stairs)?
                    };
                    // A route may revisit a support cell. The retained deque's
                    // cursor identifies the active waypoint; searching by
                    // coordinate can select an earlier visit in path history.
                    // Resolve the endpoint of the active support edge from the
                    // waypoint cursor and reject inconsistent progress.
                    let mut waypoint_end = 0usize;
                    let mut join = None;
                    for (index, pair) in previous.path.windows(2).enumerate() {
                        let emitted = crate::terrain_route::admitted_edge(pair[0], pair[1], &stairs)?.waypoint_count();
                        waypoint_end = waypoint_end.checked_add(emitted).ok_or("terrain route progress overflow")?;
                        if next <= waypoint_end {
                            let point_index = waypoint_end.checked_sub(next).ok_or("invalid terrain route progress")?;
                            let cell_index = index.checked_add(1).ok_or("terrain route progress overflow")?;
                            if point_index >= remaining.len() {
                                return Err("route has no next support waypoint".into());
                            }
                            join = Some((point_index, cell_index));
                            break;
                        }
                    }
                    let (point_index,cell_index) = join.ok_or("route has no next support waypoint")?;
                    prefix.extend(remaining.iter().take(point_index.checked_add(1).ok_or("terrain route progress overflow")?).cloned());
                    history.extend_from_slice(&previous.path[..=cell_index]);
                    start_cell = previous.path[cell_index];
                    origin = previous.origin.clone();
                }
                let structure = environment.world.structure_projection_snapshot();
                let mut query = |cell| environment.world.traversal_material(cell);
                let obstacle = |cell: crate::generation::Cell| {
                    i32::try_from(cell.x).ok().zip(i32::try_from(cell.z).ok()).is_some_and(|(x, z)| {
                        let y = ((f64::from(cell.y) + 0.5) * spacing[1]).round() as i32;
                        blocked.contains(&(x, y, z))
                    })
                };
                let crossing = |from: crate::generation::Cell, to: crate::generation::Cell| {
                    structure.blocks_swept_transition(from, to, &stairs).unwrap_or(true)
                };
                if !history.is_empty() && (!crate::terrain_traversal::path_supported_with_stairs(&history[contact_start..], config, &mut query, &stairs)?
                    || history[contact_start..].iter().copied().any(&obstacle)
                    || history[contact_start..].windows(2).any(|pair| structure.blocks_swept_transition(pair[0], pair[1], &stairs).unwrap_or(true))) {
                    return Err("retained terrain contact is no longer traversable".into());
                }
                let actor = &self.ecs.get::<ExternalId>(entity).ok_or("route actor lost identity")?.0;
                let revision = environment.world.terrain_revision();
                let mut query = |cell| environment.world.traversal_material(cell);
                let mut path = self.planner.route_searches.search(actor, self.revision, revision, start_cell, &[destination_cell], config,
                    &blocked, &mut query, &obstacle, &stairs, &crossing)?.1;
                let mut points = crate::terrain_route::waypoints_with_stairs(&path, config, &stairs)?;
                if points.len() > 4096 { return Err("terrain route waypoint budget exceeded".into()); }
                if points.len() > 1 || !prefix.is_empty() { points.remove(0); }
                if !history.is_empty() {
                    history.extend_from_slice(&path[1..]);
                    path = history;
                    prefix.extend(points);
                    points = prefix;
                }
                if points.len() > 4096 || crate::terrain_route::path_waypoint_count(&path, &stairs)? > 4096 {
                    return Err("terrain route waypoint budget exceeded".into());
                }
                let terrain_revision = environment.world.terrain_revision();
                let terrain = TerrainRouteState {
                    path,
                    revision: Some(terrain_revision),
                    waiting: false,
                    pending: false,
                    suspended: false,
                    origin,
                    target: points.first().cloned(),
                };
                return Ok(PreparedRoute { points: points.into_iter().collect(), terrain: Some(terrain) });
            }
        }
        if frame.is_none() && self.environment.as_ref().is_some_and(|environment| environment.world.structure_projection_snapshot().explicit_faces().any(|face| face.axis.is_vertical())) {
            return Err("flat route cannot validate vertical structure boundaries".into());
        }
        let route = navigation::route(
            navigation::point(start),
            destination.clone(),
            &blocked,
            self.frame_bounds(frame.as_deref())?,
        )?;
        Ok(PreparedRoute { points: route, terrain: None })
    }

    /// Price a batch of terrain destinations from one actor with one shared
    /// frontier. In-flight routes retain their existing per-route prefix
    /// semantics and use the authoritative single-destination preparation.
    fn route_for_many(
        &mut self, entity: Entity, start: Position, destinations: &[Point],
    ) -> Result<Vec<Result<PreparedRoute>>> {
        if destinations.is_empty() { return Ok(Vec::new()); }
        let frame = self.support_id(entity);
        if frame.is_some() || self.ecs.get::<Traversal>(entity).is_none() || self.terrain_routes.contains_key(&entity) {
            return Ok(destinations.iter().map(|target| self.route_for(entity, start, target)).collect());
        }
        let capability = *self.ecs.get::<Traversal>(entity).ok_or("terrain traversal needs capability")?;
        let environment = self.environment.as_ref().ok_or("terrain traversal needs environment")?;
        let spacing = environment.world.cell_spacing_m();
        let stairs = environment.world.stair_edges().to_vec();
        let to_cell = |point: &Point| -> Result<crate::generation::Cell> {
            let values = [point.x / spacing[0], point.y / spacing[1] - 0.5, point.z / spacing[2]];
            if !values.iter().all(|value| value.is_finite() && *value >= f64::from(i32::MIN) && *value <= f64::from(i32::MAX)) {
                return Err("terrain route metric position is not finite".into());
            }
            Ok(crate::generation::Cell { x: values[0].round() as i64, y: values[1].round() as i32, z: values[2].round() as i64 })
        };
        let start_point = navigation::point(start);
        let start_cell = to_cell(&start_point)?;
        let centered = Point { x:start_cell.x as f64*spacing[0], y:(f64::from(start_cell.y)+0.5)*spacing[1], z:start_cell.z as f64*spacing[2], frame:None };
        if start_point != centered {
            return Ok(destinations.iter().map(|target| self.route_for(entity, start, target)).collect());
        }
        let targets: Vec<_> = destinations.iter().map(to_cell).collect::<Result<_>>()?;
        let config = crate::terrain_traversal::TraversalConfig { spacing, clearance_cells: capability.clearance_cells, max_step_cells: capability.max_step_cells };
        let blocked = self.blocked_by_frame.get(&frame).cloned().ok_or("missing obstacle frame index")?;
        let obstacle = |cell: crate::generation::Cell| {
            i32::try_from(cell.x).ok().zip(i32::try_from(cell.z).ok()).is_some_and(|(x, z)| {
                let y = ((f64::from(cell.y) + 0.5) * spacing[1]).round() as i32;
                blocked.contains(&(x, y, z))
            })
        };
        let environment = self.environment.as_mut().ok_or("terrain traversal needs environment")?;
        let structure = environment.world.structure_projection_snapshot();
        let crossing = |from: crate::generation::Cell, to: crate::generation::Cell| {
            structure.blocks_swept_transition(from, to, &stairs).unwrap_or(true)
        };
        let mut query = |cell| environment.world.traversal_material(cell);
        let paths = crate::terrain_route::search_many_with_blocked_and_stairs(start_cell, &targets, config, &mut query, &obstacle, &stairs, &crossing)?;
        let revision = environment.world.terrain_revision();
        let routes: Vec<Result<PreparedRoute>> = paths.into_iter().map(|path| {
            match path {
            Ok(path) => {
                let mut points = crate::terrain_route::waypoints_with_stairs(&path, config, &stairs)?;
                if points.len() > 4096 { return Err("terrain route waypoint budget exceeded".into()); }
                if points.len() > 1 { points.remove(0); }
                if points.len() > 4096 || crate::terrain_route::path_waypoint_count(&path, &stairs)? > 4096 { return Err("terrain route waypoint budget exceeded".into()); }
                let target = points.first().cloned();
                Ok(PreparedRoute { points: points.into_iter().collect(), terrain: Some(TerrainRouteState { path, revision: Some(revision), waiting: false, pending: false, suspended: false, origin: start_point.clone(), target }) })
            }
            Err(error) => Err(error),
            }
        }).collect();
        Ok(routes)
    }
    /// Prepare the cheapest route to one interchangeable destination. Normal
    /// terrain actors use one goal-directed frontier; unusual frame and
    /// in-flight cases preserve the authoritative single-route semantics.
    fn route_for_any(
        &mut self, entity: Entity, start: Position, destinations: &[Point],
    ) -> Result<(usize,PreparedRoute)> {
        if destinations.is_empty() { return Err("route-to-any needs a destination".into()); }
        let frame = self.support_id(entity);
        let capability = self.ecs.get::<Traversal>(entity).copied();
        let terrain_candidate = frame.is_none() && capability.is_some() && !self.terrain_routes.contains_key(&entity);
        if !terrain_candidate {
            return self.route_for_any_fallback(entity,start,destinations);
        }
        let capability = capability.ok_or("terrain traversal needs capability")?;
        let environment = self.environment.as_ref().ok_or("terrain traversal needs environment")?;
        let spacing = environment.world.cell_spacing_m();
        let stairs = environment.world.stair_edges().to_vec();
        let to_cell = |point: &Point| -> Result<crate::generation::Cell> {
            let values = [point.x / spacing[0], point.y / spacing[1] - 0.5, point.z / spacing[2]];
            if !values.iter().all(|value| value.is_finite() && *value >= f64::from(i32::MIN) && *value <= f64::from(i32::MAX)) {
                return Err("terrain route metric position is not finite".into());
            }
            Ok(crate::generation::Cell { x:values[0].round() as i64, y:values[1].round() as i32, z:values[2].round() as i64 })
        };
        let start_point = navigation::point(start);
        let start_cell = to_cell(&start_point)?;
        let centered = Point { x:start_cell.x as f64*spacing[0], y:(f64::from(start_cell.y)+0.5)*spacing[1], z:start_cell.z as f64*spacing[2], frame:None };
        if start_point != centered {
            return self.route_for_any_fallback(entity,start,destinations);
        }
        let targets: Vec<_> = destinations.iter().map(to_cell).collect::<Result<_>>()?;
        let config = crate::terrain_traversal::TraversalConfig { spacing, clearance_cells:capability.clearance_cells, max_step_cells:capability.max_step_cells };
        let blocked = self.blocked_by_frame.get(&frame).cloned().ok_or("missing obstacle frame index")?;
        let obstacle = |cell: crate::generation::Cell| {
            i32::try_from(cell.x).ok().zip(i32::try_from(cell.z).ok()).is_some_and(|(x,z)| {
                let y = ((f64::from(cell.y)+0.5)*spacing[1]).round() as i32;
                blocked.contains(&(x,y,z))
            })
        };
        let environment = self.environment.as_mut().ok_or("terrain traversal needs environment")?;
        let structure = environment.world.structure_projection_snapshot();
        let crossing = |from: crate::generation::Cell, to: crate::generation::Cell| {
            structure.blocks_swept_transition(from, to, &stairs).unwrap_or(true)
        };
        let actor = &self.ecs.get::<ExternalId>(entity).ok_or("route actor lost identity")?.0;
        let revision = environment.world.terrain_revision();
        let mut query = |cell| environment.world.traversal_material(cell);
        let (index,path) = self.planner.route_searches.search(actor, self.revision, revision, start_cell, &targets, config,
            &blocked, &mut query, &obstacle, &stairs, &crossing)?;
        let mut points = crate::terrain_route::waypoints_with_stairs(&path,config,&stairs)?;
        if points.len() > 4096 { return Err("terrain route waypoint budget exceeded".into()); }
        if points.len() > 1 { points.remove(0); }
        let target = points.first().cloned();
        let terrain = TerrainRouteState { path, revision:Some(environment.world.terrain_revision()), waiting:false, pending:false, suspended:false, origin:start_point, target };
        Ok((index,PreparedRoute { points:points.into_iter().collect(), terrain:Some(terrain) }))
    }
    fn route_for_any_fallback(
        &mut self, entity: Entity, start: Position, destinations: &[Point],
    ) -> Result<(usize,PreparedRoute)> {
        let mut best: Option<(usize,PreparedRoute,u64)> = None;
        let mut unavailable = None;
        for (index,target) in destinations.iter().enumerate() {
            match self.route_for(entity,start,target) {
                Ok(route) => {
                    let mut points = vec![navigation::point(start)];
                    points.extend(route.points.iter().cloned());
                    let cost = crate::terrain_route::waypoint_cost_micrometres(points)?;
                    if best.as_ref().is_none_or(|(_,_,prior)| cost < *prior) { best=Some((index,route,cost)); }
                }
                Err(error) => { unavailable.get_or_insert(error); }
            }
        }
        best.map(|(index,route,_)| (index,route)).ok_or_else(|| unavailable.unwrap_or_else(|| "no supported terrain route".into()))
    }
    fn pending_terrain_route(&self, entity: Entity, start: Position) -> Result<PreparedRoute> {
        if let Some(previous) = self.terrain_routes.get(&entity) {
            return Ok(PreparedRoute {
                points: self.routes.get(&entity).ok_or("pending route lost contact")?.iter().cloned().collect(),
                terrain: Some(TerrainRouteState { waiting: true, pending: true, suspended: false, revision: None, ..previous.clone() }),
            });
        }
        if self.support_id(entity).is_some() || self.ecs.get::<Traversal>(entity).is_none() {
            return Err("only terrain movement supports pending route search".into());
        }
        let spacing = self.environment.as_ref().ok_or("pending terrain route needs environment")?.world.cell_spacing_m();
        let origin = navigation::point(start);
        let cell = crate::generation::Cell {
            x: (start.x / spacing[0]).round() as i64,
            y: (start.y / spacing[1] - 0.5).round() as i32,
            z: (start.z / spacing[2]).round() as i64,
        };
        let center = Point { x: cell.x as f64 * spacing[0], y: (f64::from(cell.y) + 0.5) * spacing[1], z: cell.z as f64 * spacing[2], frame: None };
        if center != origin { return Err("pending terrain route lacks centered contact".into()); }
        Ok(PreparedRoute { points: VecDeque::from([origin.clone()]), terrain: Some(TerrainRouteState {
            path: vec![cell], revision: None, waiting: true, pending: true, suspended: false,
            origin: origin.clone(), target: Some(origin),
        }) })
    }

    fn install_route(&mut self, entity: Entity, prepared: PreparedRoute) {
        if !prepared.terrain.as_ref().is_some_and(|state| state.pending) {
            if let Some(id) = self.ecs.get::<ExternalId>(entity) { self.planner.route_searches.cancel_actor(&id.0); }
        }
        self.routes.insert(entity, prepared.points.into());
        match prepared.terrain {
            Some(state) => { self.terrain_routes.insert(entity, state); }
            None => { self.terrain_routes.remove(&entity); }
        }
    }
    fn route_snapshot_for(
        &self,
        entity: Entity,
        path: &navigation::RouteProgress,
        terrain: Option<&TerrainRouteState>,
    ) -> RouteSnapshot {
        RouteSnapshot {
            entity: self.ecs.get::<ExternalId>(entity).unwrap().0.clone(),
            path: path.geometry().to_vec(),
            cursor: path.cursor(),
            terrain_path: terrain.map(|state| state.path.clone()),
            terrain_waiting: terrain.is_some_and(|state| state.waiting),
            terrain_pending: terrain.is_some_and(|state| state.pending),
            terrain_revision: terrain.and_then(|state| state.revision),
            terrain_suspended: terrain.is_some_and(|state| state.suspended),
            terrain_origin: terrain.map(|state| state.origin.clone()),
            terrain_target: terrain.and_then(|state| state.target.clone()),
        }
    }
    fn restore_routes(&mut self, saved: Vec<RouteSnapshot>, defer_environment_validation: bool) -> Result<()> {
        if saved.len() > self.ids.len() {
            return Err("too many saved routes".into());
        }
        let mut restored = BTreeMap::new();
        self.terrain_routes.clear();
        for route in saved {
            if route.path.len() > 4096 {
                return Err("saved route exceeds bound".into());
            }
            let entity = self.entity(&route.entity)?;
            if restored.insert(entity, navigation::RouteProgress::restore(route.path.clone(), route.cursor)?).is_some() {
                return Err("duplicate saved route".into());
            }
            let destination = self.ecs.get::<Destination>(entity);
            if route.terrain_pending && (!route.terrain_waiting || route.terrain_suspended || route.terrain_path.is_none()) {
                return Err("invalid pending terrain route".into());
            }
            if route.terrain_suspended {
                if destination.is_some() || route.terrain_path.is_none() {
                    return Err("suspended terrain contact has active destination or no witness".into());
                }
            } else if destination.is_none() {
                return Err("saved route has no destination".into());
            }
            let frame = self.support_id(entity);
            if destination.is_some_and(|destination| destination.frame.as_deref() != frame.as_deref()) {
                return Err("saved route frame mismatch".into());
            }
            let bounds = self.frame_bounds(frame.as_deref())?;
            let blocked = self
                .blocked_by_frame
                .get(&frame)
                .expect("rebuilt obstacle frame index");
            let start = *self.ecs.get::<Position>(entity).ok_or("saved route has no position")?;
            if route.terrain_path.is_none() {
                let destination = destination.ok_or("flat route requires destination")?;
                if frame.is_none() && self.environment.as_ref().is_some_and(|environment| environment.world.structure_projection_snapshot().explicit_faces().any(|face| face.axis.is_vertical())) {
                    return Err("saved flat route cannot validate vertical structure boundaries".into());
                }
                navigation::validate_saved_path(
                    navigation::point(start),
                    &route.path[route.cursor..],
                    Point {
                        x: destination.x,
                        y: destination.y,
                        z: destination.z,
                        frame: destination.frame.clone(),
                    },
                    blocked,
                    bounds,
                )?;
            }
            if let Some(path) = route.terrain_path {
                if self.ecs.get::<Support>(entity).is_some()
                    || self.ecs.get::<Traversal>(entity).is_none()
                    || path.is_empty() || path.len() > 4097
                    || route.cursor == route.path.len()
                    || route.terrain_origin.is_none() || route.terrain_target.is_none()
                {
                    return Err("invalid saved terrain route capability".into());
                }
                if route.terrain_target.as_ref() != route.path.get(route.cursor) {
                    return Err("saved terrain route target witness mismatch".into());
                }
                // Entity snapshots are restored before the environment record
                // in `restore_records`.  Keep the route witness intact here;
                // geometry validation runs after the environment is installed.
                if let Some(environment) = self.environment.as_ref() {
                    let stairs = environment.world.stair_edges().to_vec();
                    let structure = environment.world.structure_projection_snapshot();
                    if route.terrain_revision == Some(environment.world.terrain_revision())
                        && path.windows(2).any(|pair| structure.blocks_swept_transition(pair[0], pair[1], &stairs).unwrap_or(true)) {
                        return Err("saved terrain route crosses a sealed structure face".into());
                    }
                } else if !defer_environment_validation {
                    return Err("saved terrain route needs environment".into());
                }
                self.terrain_routes.insert(entity, TerrainRouteState {
                    path,
                    revision: route.terrain_revision,
                    waiting: route.terrain_waiting,
                    pending: route.terrain_pending,
                    suspended: route.terrain_suspended,
                    origin: route.terrain_origin.unwrap_or_else(|| navigation::point(start)),
                    target: route.terrain_target.or_else(|| route.path.get(route.cursor).cloned()),
                });
            } else if self.ecs.get::<Traversal>(entity).is_some() && self.ecs.get::<Support>(entity).is_none() && !route.terrain_waiting {
                return Err("terrain route is missing saved support witness".into());
            }
        }
        let expected = self
            .ids
            .values()
            .filter(|entity| self.ecs.get::<Destination>(**entity).is_some())
            .count();
        if expected + self.terrain_routes.values().filter(|state| state.suspended).count() != restored.len() {
            return Err("saved route set does not match destinations".into());
        }
        self.routes = restored.into();
        if self.environment.is_some() {
            let route_count = self.routes.len();
            let waiting_before = self.terrain_routes.values().filter(|state| state.waiting).count();
            self.invalidate_terrain_routes()?;
            if self.routes.len() != route_count || self.terrain_routes.values().filter(|state| state.waiting).count() != waiting_before {
                return Err("saved terrain route witness is stale".into());
            }
        }
        Ok(())
    }
    fn rebuild_physical_indexes(&mut self, build_routes: bool) -> Result<()> {
        self.ownership.rebuild(&self.ecs, &self.ids);
        self.visible_source_containers.clear();
        self.stockpile_policies_by_position.clear();
        self.ground_stocks_by_position.clear();
        self.storage_providers_by_position.clear();
        self.bound_process_lots = self.ids.values().filter_map(|entity| self.ecs.get::<crate::staged_process::ProcessBinding>(*entity).map(|binding| binding.lot.clone())).collect();
        self.blocked_by_frame.clear();
        self.routes.clear();
        self.terrain_routes.clear();
        for (id, entity) in &self.ids {
            let position = self.ecs.get::<Position>(*entity);
            if let Some(surface) = self.ecs.get::<Surface>(*entity) {
                if !surface.min_x.is_finite()
                    || !surface.max_x.is_finite()
                    || !surface.min_z.is_finite()
                    || !surface.max_z.is_finite()
                    || !surface.height.is_finite()
                    || surface.min_x > surface.max_x
                    || surface.min_z > surface.max_z
                {
                    return Err("invalid support surface".into());
                }
                if position.is_none() {
                    return Err("surface needs position".into());
                }
            }
            if let Some(support) = self.ecs.get::<Support>(*entity) {
                self.entity(&support.entity)?;
                self.surface(&support.entity)?;
                self.support_chain(id)?;
                let local = position.ok_or("supported entity needs position")?;
                let surface = self.surface(&support.entity)?;
                if (local.y - surface.height).abs() > 1e-9
                    || local.x < surface.min_x
                    || local.x > surface.max_x
                    || local.z < surface.min_z
                    || local.z > surface.max_z
                {
                    return Err("position is outside support surface".into());
                }
            }
            if let Some(p) = position {
                if [p.x, p.y, p.z, p.facing]
                    .iter()
                    .any(|v| !v.is_finite() || v.abs() > 1_000_000.0)
                {
                    return Err("invalid position".into());
                }
            }
            if self.ecs.get::<Body>(*entity).is_some() && position.is_none() {
                return Err("body needs position".into());
            }
            if self.ecs.get::<Container>(*entity).is_some()
                && position.is_none()
                && self.ecs.get::<Lot>(*entity).is_none()
                && !self.ecs.get::<ConstructionSite>(*entity).is_some_and(|site| site.phase == ConstructionPhase::Planned)
            {
                return Err("container needs position or lot custody".into());
            }
            if self
                .ecs
                .get::<Obstacle>(*entity)
                .is_some_and(|o| o.occupied)
            {
                if self.ecs.get::<Body>(*entity).is_some() {
                    return Err("static obstacle cannot also be a movable body".into());
                }
                let p = position.ok_or("obstacle needs position")?;
                let frame = self.support_id(*entity);
                self.blocked_by_frame
                    .entry(frame)
                    .or_default()
                    .insert(navigation::cell(navigation::point(*p)));
            }
            if let Some(lot) = self.ecs.get::<Lot>(*entity) {
                let owner = self.entity(&lot.container)?;
                if self.ecs.get::<Container>(owner).is_none() {
                    return Err("lot owner is not a container".into());
                }
                self.contents
                    .entry(lot.container.clone())
                    .or_default()
                    .insert(*entity);
            }
            if let Some(water) = self.ecs.get::<LotWater>(*entity) {
                if self.ecs.get::<Lot>(*entity).is_none()
                    || !water.water_kg.is_finite()
                    || water.water_kg < 0.0
                    || water.water_kg > MAX_CARRIED_WATER_KG
                    || (self.ecs.get::<Lot>(*entity).is_some_and(|lot| lot.quantity == 0) && water.water_kg > 0.0)
                {
                    return Err("carried water requires a finite nonnegative material lot".into());
                }
            }
            if self.ecs.get::<Container>(*entity).is_some() {
                self.contents.entry(id.clone()).or_default();
                if self.ecs.get::<StorageProvider>(*entity).is_some() {
                    let position = position.ok_or("storage provider requires a position")?;
                    self.storage_providers_by_position.entry(Self::position_key(position)).or_default().insert(id.clone());
                }
            }
            if let Some(policy) = self.ecs.get::<StockpileCell>(*entity) {
                if self.ecs.get::<Container>(*entity).is_some() {
                    return Err("stockpile policy cannot own a physical container".into());
                }
                let position = position.ok_or("stockpile policy requires a position")?;
                self.stockpile_policies_by_position.entry(Self::position_key(position)).or_default().insert(id.clone());
                let _ = policy;
            }
            if self.ecs.get::<GroundStock>(*entity).is_some() {
                let position = position.ok_or("ground stock requires a position")?;
                self.ground_stocks_by_position.entry(Self::position_key(position)).or_default().insert(id.clone());
            }
            if self.ecs.get::<StorageProvider>(*entity).is_some()
                && (self.ecs.get::<Container>(*entity).is_none() || position.is_none())
            { return Err("storage provider requires a positioned container".into()); }
            if self.ecs.get::<GroundStock>(*entity).is_some()
                && (self.ecs.get::<Container>(*entity).is_none() || position.is_none()
                    || self.ecs.get::<Body>(*entity).is_some()) {
                return Err("ground stock requires a positioned non-actor container".into());
            }
            if self.ecs.get::<GroundStock>(*entity).is_some()
                && self.ecs.get::<Container>(*entity).is_some()
                && position.is_some()
            {
                self.visible_source_containers.insert(id.clone());
            }
            if self.ecs.get::<StorageProvider>(*entity).is_some() {
                self.visible_source_containers.insert(id.clone());
            }
            if self.ecs.get::<SealedContainer>(*entity).is_some()
                && self.ecs.get::<Container>(*entity).is_none()
            {
                return Err("sealed container requires container".into());
            }
        }
        self.blocked_by_frame.entry(None).or_default();
        for (id, entity) in &self.ids {
            if self.ecs.get::<Surface>(*entity).is_some() {
                self.blocked_by_frame.entry(Some(id.clone())).or_default();
            }
        }
        self.refresh_assignment_topology();
        let indexed_entities: Vec<_> = self.ids.iter().map(|(id, entity)| (id.clone(), *entity)).collect();
        for (id, entity) in indexed_entities {
            if let Some(container) = self.ecs.get::<Container>(entity) {
                if self.quantity(&id) > u64::from(container.capacity) {
                    return Err("container over capacity".into());
                }
            }
            if let Some(target) = self.ecs.get::<Destination>(entity) {
                if !target.facing.is_finite() || target.facing.abs() > 1_000_000.0 {
                    return Err("invalid destination facing".into());
                }
                let p = *self
                    .ecs
                    .get::<Position>(entity)
                    .ok_or("destination needs body position")?;
                if self.ecs.get::<Body>(entity).is_none() {
                    return Err("destination needs body".into());
                }
                if build_routes {
                    let route = self.route_for(
                            entity,
                            p,
                            &Point {
                                x: target.x,
                                y: target.y,
                                z: target.z,
                                frame: target.frame.clone(),
                            },
                        )?;
                    self.install_route(entity, route);
                }
            }
        }
        Ok(())
    }
    pub fn query_json(&mut self, input: &str) -> Result<String> {
        self.ensure_ready()?;
        let mut names: Vec<String> = serde_json::from_str(input).map_err(|e| e.to_string())?;
        if names.is_empty() || names.len() > 32 {
            return Err("invalid query size".into());
        }
        names.sort();
        names.dedup();
        let ids = names
            .iter()
            .map(|n| {
                self.registry
                    .ids
                    .get(n)
                    .copied()
                    .ok_or_else(|| format!("unknown query component {n}"))
            })
            .collect::<Result<Vec<_>>>()?;
        if !self.queries.contains_key(&names) {
            if self.queries.len() >= 256 {
                self.queries.clear();
            }
            let mut builder = QueryBuilder::<Entity>::new(&mut self.ecs);
            for id in ids {
                builder.with_id(id);
            }
            self.queries.insert(names.clone(), builder.build());
        }
        let mut entities = self
            .queries
            .get_mut(&names)
            .expect("query exists")
            .iter(&self.ecs)
            .collect::<Vec<_>>();
        entities.sort_by(|a, b| {
            self.ecs
                .get::<ExternalId>(*a)
                .unwrap()
                .0
                .cmp(&self.ecs.get::<ExternalId>(*b).unwrap().0)
        });
        let rows = entities
            .into_iter()
            .map(|e| EntityRecord {
                id: self.ecs.get::<ExternalId>(e).unwrap().0.clone(),
                components: names
                    .iter()
                    .map(|n| {
                        (
                            n.clone(),
                            self.registry
                                .read(&self.ecs, e, n)
                                .expect("query membership"),
                        )
                    })
                    .collect(),
            })
            .collect::<Vec<_>>();
        serde_json::to_string(&rows).map_err(|e| e.to_string())
    }

    /// Compact shared material facts for hot authored work planners.
    ///
    /// This is a stable, bounded projection of the native owners rather than
    /// an ECS escape hatch: callers receive custody and capacity facts, never
    /// component storage or arbitrary entity rows. Scoped AI observations keep
    /// their own projection and must not crawl this index.
    pub fn work_material_snapshot_json(&mut self) -> Result<String> {
        self.ensure_ready()?;
        const MAX_FACT_ROWS: usize = 4096;
        #[derive(Serialize)]
        struct ContainerFact { id: String, capacity: u32, sealed: bool }
        #[derive(Serialize)]
        struct LotFact { id: String, kind: String, quantity: u32, container: String }
        let mut containers = self.ecs
            .query::<(&ExternalId, &Container, Option<&SealedContainer>)>();
        let mut container_rows = Vec::new();
        for (id, container, sealed) in containers.iter(&self.ecs) {
            if container_rows.len() >= MAX_FACT_ROWS { return Err("work material container fact bound exceeded".into()); }
            container_rows.push(ContainerFact { id: id.0.clone(), capacity: container.capacity, sealed: sealed.is_some() });
        }
        container_rows.sort_by(|left, right| left.id.cmp(&right.id));
        let mut lots = self.ecs.query::<(&ExternalId, &Lot)>();
        let mut lot_rows = Vec::new();
        for (id, lot) in lots.iter(&self.ecs) {
            if lot_rows.len() >= MAX_FACT_ROWS { return Err("work material lot fact bound exceeded".into()); }
            lot_rows.push(LotFact { id: id.0.clone(), kind: lot.kind.clone(), quantity: lot.quantity, container: lot.container.clone() });
        }
        lot_rows.sort_by(|left, right| left.id.cmp(&right.id));
        serde_json::to_string(&json!({
            "version": 1,
            "containers": container_rows,
            "lots": lot_rows,
        })).map_err(|e| e.to_string())
    }
    pub fn entity_membership_json(&self, input: &str) -> Result<String> {
        self.ensure_ready()?;
        if input.len() > 16 * 1024 {
            return Err("entity membership query too large".into());
        }
        let ids: Vec<String> = serde_json::from_str(input).map_err(|e| e.to_string())?;
        if ids.is_empty() || ids.len() > 128 {
            return Err("invalid entity membership query size".into());
        }
        if ids.iter().any(|id| !valid_id(id)) {
            return Err("invalid entity membership ID".into());
        }
        let membership = ids.iter().map(|id| self.ids.contains_key(id)).collect::<Vec<_>>();
        serde_json::to_string(&membership).map_err(|e| e.to_string())
    }
    pub(super) fn place_entities_on_initial_surfaces(&mut self, placements: &[(String, [i64; 2])]) -> Result<()> {
        if placements.is_empty() {
            return Ok(());
        }
        let entities: Vec<_> = placements.iter().map(|(id, column)| {
            let entity = self.entity(id)?;
            if self.ecs.get::<Support>(entity).is_some() || self.ecs.get::<Destination>(entity).is_some()
                || self.ecs.get::<Surface>(entity).is_some() || self.ecs.get::<ExcavationWork>(entity).is_some()
                || self.routes.contains_key(&entity) || self.direct.contains_key(&entity)
            {
                return Err("initial placement entity has support, surface, excavation, or active route".into());
            }
            let position = *self.ecs.get::<Position>(entity).ok_or("initial placement entity has no position")?;
            Ok((id.clone(), position, self.ecs.get::<Traversal>(entity).copied(), *column))
        }).collect::<Result<Vec<_>>>()?;
        let columns: Vec<_> = entities.iter().map(|(_, _, _, column)| (column[0], column[1])).collect();
        let resolved = {
            let environment = self.environment.as_mut().ok_or("initial placement needs environment")?;
            let mut surfaces = Vec::with_capacity(columns.len());
            for batch in columns.chunks(64) { surfaces.extend(environment.world.surface_cells(batch)?); }
            if surfaces.len() != entities.len() { return Err("initial placement surface count mismatch".into()); }
            let spacing = environment.world.cell_spacing_m();
            let mut query = |cell| environment.world.traversal_material(cell);
            let requests = entities.into_iter().zip(surfaces).map(|((entity, position, traversal, _), surface)| {
                Ok(initial_placement::Request { entity, position, traversal, surface: surface.ok_or("initial placement column has no solid surface")? })
            }).collect::<Result<Vec<_>>>()?;
            initial_placement::resolve(requests, spacing, &mut query)?
        };
        for (entity, position) in resolved { self.ecs.entity_mut(self.entity(&entity)?).insert(position); }
        self.rebuild_physical_indexes(true)?;
        Ok(())
    }

    fn apply_initial_surface_placements(&mut self, placements: &[crate::environment_definition::InitialSurfacePlacement]) -> Result<()> {
        let placements = placements.iter().map(|placement| (placement.entity.clone(), placement.column)).collect::<Vec<_>>();
        self.place_entities_on_initial_surfaces(&placements)
    }

    pub fn load_environment(&mut self, definition: &str) -> Result<()> {
        self.ensure_ready()?;
        if self.revision != 0 || self.environment.is_some() {
            return Err("environment initialization requires a new world".into());
        }
        let mut built = crate::environment_definition::build_from_json(definition)?;
        let atmosphere = built.atmosphere.map(|config| crate::terrain_atmosphere::TerrainAtmosphere::fresh(&mut built.world, config)).transpose()?;
        let entities = self.snapshot_entities_json()?;
        let mut candidate = Self::new();
        candidate.restore_json(&entities)?;
        candidate.environment = Some(KernelEnvironment { atmosphere, paid_emissions: BTreeMap::new(), emissions: built.emissions, processes: built.processes, resources: built.resources, definition: definition.to_owned(), world: built.world, excavation_rules: built.excavation_rules, structures: built.structures });
        candidate.validate_structure_recipes()?;
        candidate.validate_process_records()?;
        candidate.validate_construction_sites()?;
        candidate.validate_resource_sites()?;
        candidate.apply_initial_surface_placements(&built.initial_placements)?;
        candidate.placement_revision = self.next_placement_revision();
        *self = candidate;
        Ok(())
    }
    /// Trusted host query. Player visibility must be applied before publishing
    /// these facts; this endpoint is not itself an exploration permission.
    pub fn terrain_surfaces_json(&mut self, input: &str) -> Result<String> {
        self.ensure_ready()?;
        if input.len() > 8 * 1024 { return Err("surface query exceeds input budget".into()); }
        let coordinates: Vec<[i32; 2]> = serde_json::from_str(input).map_err(|error| error.to_string())?;
        if coordinates.is_empty() || coordinates.len() > 64 { return Err("surface query exceeds column budget".into()); }
        let columns: Vec<_> = coordinates.into_iter().map(|[x, z]| (i64::from(x), i64::from(z))).collect();
        let environment = self.environment.as_mut().ok_or("world has no environment")?;
        let surfaces = environment.world.surface_cells(&columns)?;
        let facts: Vec<_> = surfaces.into_iter().map(|surface| surface.map(|surface| json!({
            "cell": [surface.cell.x, surface.cell.y, surface.cell.z], "material": surface.material,
            "generatedTop": surface.generated_top,
        }))).collect();
        serde_json::to_string(&facts).map_err(|error| error.to_string())
    }
    /// Bounded authoritative open-water targets for work planning. Contact
    /// approaches are emitted in world coordinates by the terrain owner.
    pub(crate) fn native_water_contacts(&self, centers: &[Position]) -> Result<Vec<(crate::generation::Cell, u8, Vec<Point>)>> {
        if centers.is_empty() || centers.len() > 16 { return Err("water contact query exceeds center budget".into()); }
        if centers.iter().any(|center| ![center.x, center.y, center.z].iter().all(|value| value.is_finite())) {
            return Err("water contact center is invalid".into());
        }
        let environment = self.environment.as_ref().ok_or("world has no environment")?;
        let spacing = environment.world.cell_spacing_m();
        environment.world.positive_open_cells_near(
            &centers.iter().map(|center| [center.x, center.y, center.z]).collect::<Vec<_>>(),
            128,
        ).into_iter().map(|cell| {
            let [x, y, z] = crate::terrain_water::coordinates(cell)?;
            let point = |dx: f64, dz: f64| Point { x: x as f64 * spacing[0] + dx, y: (f64::from(y) + 0.5) * spacing[1], z: z as f64 * spacing[2] + dz, frame: None };
            let level = environment.world.open_water_level(cell).ok_or("open water contact lost its level")?;
            Ok((cell, level, vec![point(-spacing[0], 0.0), point(spacing[0], 0.0), point(0.0, -spacing[2]), point(0.0, spacing[2])]))
        }).collect()
    }
    pub fn water_contacts_json(&self, input: &str) -> Result<String> {
        self.ensure_ready()?;
        if input.len() > 8 * 1024 { return Err("water contact query exceeds input budget".into()); }
        let centers: Vec<[f64; 3]> = serde_json::from_str(input).map_err(|error| error.to_string())?;
        if centers.is_empty() || centers.len() > 16 { return Err("water contact query exceeds center budget".into()); }
        let environment = self.environment.as_ref().ok_or("world has no environment")?;
        let spacing = environment.world.cell_spacing_m();
        let contacts: Vec<_> = environment.world.positive_open_cells_near(&centers, 128).into_iter().map(|cell| {
            let [x, y, z] = crate::terrain_water::coordinates(cell)?;
            let center = [(x as f64) * spacing[0], (y as f64 + 0.5) * spacing[1], (z as f64) * spacing[2]];
            Ok(json!({ "at": [x, y, z], "approaches": [
                {"x": center[0]-spacing[0], "y": center[1], "z": center[2], "frame": null},
                {"x": center[0]+spacing[0], "y": center[1], "z": center[2], "frame": null},
                {"x": center[0], "y": center[1], "z": center[2]-spacing[2], "frame": null},
                {"x": center[0], "y": center[1], "z": center[2]+spacing[2], "frame": null}
            ]}))
        }).collect::<Result<Vec<_>>>()?;
        serde_json::to_string(&contacts).map_err(|error| error.to_string())
    }
    pub fn structure_surfaces_json(&mut self, input: &str) -> Result<String> {
        self.ensure_ready()?;
        if input.len() > 16 * 1024 { return Err("structure surface query exceeds input budget".into()); }
        let coordinates: Vec<[i32; 2]> = serde_json::from_str(input).map_err(|error| error.to_string())?;
        if coordinates.is_empty() || coordinates.len() > 64 { return Err("structure surface query exceeds column budget".into()); }
        let columns: Vec<_> = coordinates.into_iter().map(|[x, z]| (i64::from(x), i64::from(z))).collect();
        let environment = self.environment.as_mut().ok_or("world has no environment")?;
        let surfaces = environment.world.structure_surfaces(&columns)?;
        let facts: Vec<_> = surfaces.into_iter().map(|cells| cells.into_iter().map(|cell| json!({"cell": [cell.x, cell.y, cell.z]})).collect::<Vec<_>>()).collect();
        serde_json::to_string(&facts).map_err(|error| error.to_string())
    }
    /// Return the bounded physical columns changed after a known revision.
    /// The native owner returns a full-reset marker when its disposable index
    /// cannot prove the requested history (including after restore).
    pub fn terrain_changes_json(&self, input: &str) -> Result<String> {
        self.ensure_ready()?;
        if input.len() > 64 { return Err("terrain change query exceeds input budget".into()); }
        let since: u64 = serde_json::from_str(input).map_err(|error| error.to_string())?;
        let environment = self.environment.as_ref().ok_or("world has no environment")?;
        serde_json::to_string(&environment.world.terrain_changes(since)).map_err(|error| error.to_string())
    }
    pub fn terrain_materials_json(&mut self, input: &str) -> Result<String> {
        self.ensure_ready()?;
        if input.len() > 32 * 1024 { return Err("terrain query exceeds input budget".into()); }
        let coordinates: Vec<[i32; 3]> = serde_json::from_str(input).map_err(|error| error.to_string())?;
        if coordinates.len() > 256 { return Err("terrain query exceeds cell budget".into()); }
        let cells: Vec<_> = coordinates.into_iter().map(|[x, y, z]| crate::generation::Cell {
            x: i64::from(x), y, z: i64::from(z),
        }).collect();
        let environment = self.environment.as_mut().ok_or("world has no environment")?;
        serde_json::to_string(&environment.world.materials(&cells)?).map_err(|error| error.to_string())
    }
    /// Bounded read-only physical contact facts, composed from terrain and
    /// currently published static structures in the same TerrainWater owner.
    pub fn physical_contacts_json(&mut self, input: &str) -> Result<String> {
        self.ensure_ready()?;
        if input.len() > 16 * 1024 { return Err("physical contact query exceeds input budget".into()); }
        let coordinates: Vec<[i64; 3]> = serde_json::from_str(input).map_err(|error| error.to_string())?;
        if coordinates.is_empty() || coordinates.len() > 64 { return Err("physical contact query exceeds cell budget".into()); }
        let cells: Vec<_> = coordinates.into_iter().map(|[x, y, z]| {
            Ok(crate::generation::Cell { x, y: i32::try_from(y).map_err(|_| "physical contact y coordinate out of range")?, z })
        }).collect::<Result<Vec<_>>>()?;
        let environment = self.environment.as_mut().ok_or("world has no environment")?;
        let facts: Vec<_> = cells.into_iter().map(|cell| {
            let material = environment.world.traversal_material(cell)?;
            Ok(json!({"solid": material.solid, "sealedTop": material.sealed_top, "outside": material.outside}))
        }).collect::<Result<_>>()?;
        serde_json::to_string(&facts).map_err(|error| error.to_string())
    }
    /// Return bounded standing targets around a container's immutable pose.
    /// Candidate cells are checked by the terrain traversal owner; final
    /// admission uses the same reach predicate in `contact`.
    pub(crate) fn transfer_contact_candidates(&mut self, container_id: &str, config: crate::terrain_traversal::TraversalConfig, required_frame: Option<String>) -> std::result::Result<Vec<Point>, TransferContactError> {
        let container = self.entity(container_id)?;
        if self.ecs.get::<SealedContainer>(container).is_some() { return Err(TransferContactError::Sealed); }
        let container_frame = if self.ecs.get::<Position>(container).is_none() && self.ecs.get::<ConstructionSite>(container).is_some() { None } else { self.contact_frame(container).map_err(TransferContactError::from)? };
        if required_frame.is_some() && container_frame != required_frame { return Err(TransferContactError::UnavailableFrame); }
        let frame = required_frame.or(container_frame);
        if let Some(frame) = frame.as_deref() {
            return self.supported_transfer_contacts(container, frame);
        }
        let spacing = self.environment.as_ref().ok_or("world has no environment")?.world.cell_spacing_m();
        let terrain_points = |center: crate::generation::Cell| -> Result<Vec<[f64; 3]>> {
            let mut points = Vec::new();
            for [dx, dy, dz] in interaction_contact::standing_offsets(spacing).map_err(str::to_owned)? {
                let Some(x) = center.x.checked_add(dx) else { continue };
                let Ok(dy) = i32::try_from(dy) else { continue };
                let Some(y) = center.y.checked_add(dy) else { continue };
                let Some(z) = center.z.checked_add(dz) else { continue };
                points.push([x as f64 * spacing[0], (f64::from(y) + 0.5) * spacing[1], z as f64 * spacing[2]]);
            }
            Ok(points)
        };
        let resolved_pose = match self.contact_pose(container) {
            Ok(pose) => Some(pose),
            Err(reason) if reason == "no position" => None,
            Err(reason) => return Err(TransferContactError::from(reason)),
        };
        let (source_points, contact_reference) = if self.ecs.get::<Position>(container).is_none() {
            if let Some(site) = self.ecs.get::<ConstructionSite>(container).cloned() {
                let definition = self.environment.as_ref().and_then(|environment| environment.structures.get(&site.catalog)).cloned().ok_or("construction catalog binding is missing")?;
                (self.current_contact_candidate_rows(&site, &definition, spacing)?.into_iter().map(|(point, _)| point).collect::<Vec<_>>(), None)
            } else if let Some(container_pose) = resolved_pose {
                let raw = [container_pose.x / spacing[0], container_pose.y / spacing[1] - 0.5, container_pose.z / spacing[2]];
                if raw.iter().any(|value| !value.is_finite() || (value - value.round()).abs() > 1e-7) { (Vec::new(), None) } else {
                    let center = crate::generation::Cell { x: raw[0] as i64, y: raw[1] as i32, z: raw[2] as i64 };
                    (terrain_points(center)?, Some([container_pose.x, container_pose.y, container_pose.z]))
                }
            } else {
                (Vec::new(), None)
            }
        } else {
            let container_pose = self.contact_pose(container).map_err(|reason| if reason == "no position" { TransferContactError::UnavailableFrame } else { TransferContactError::from(reason) })?;
            let raw = [container_pose.x / spacing[0], container_pose.y / spacing[1] - 0.5, container_pose.z / spacing[2]];
            if raw.iter().any(|value| !value.is_finite() || (value - value.round()).abs() > 1e-7) {
                return Err(TransferContactError::NoContact);
            }
            let center = crate::generation::Cell { x: raw[0] as i64, y: raw[1] as i32, z: raw[2] as i64 };
            (terrain_points(center)?, Some([container_pose.x, container_pose.y, container_pose.z]))
        };
        let config = crate::terrain_traversal::TraversalConfig { spacing, ..config };
        let contact_projection = self.environment.as_ref().ok_or("world has no environment")?.world.structure_projection_snapshot();
        let mut targets = Vec::new();
        for point in source_points {
            let raw = [point[0] / spacing[0], point[1] / spacing[1] - 0.5, point[2] / spacing[2]];
            let cell = crate::generation::Cell { x: raw[0].round() as i64, y: raw[1].round() as i32, z: raw[2].round() as i64 };
            let environment = self.environment.as_mut().ok_or("world has no environment")?;
            let mut query = |at| environment.world.traversal_material(at);
            if crate::terrain_traversal::node(cell, config, &mut query)?.is_none() { continue; }
            if contact_reference.is_some_and(|reference| !interaction_contact::within_transfer_reach(reference, point)) { continue; }
            if let Some(reference) = contact_reference {
                let reference_raw = [reference[0] / spacing[0], reference[1] / spacing[1] - 0.5, reference[2] / spacing[2]];
                let reference_cell = crate::generation::Cell { x: reference_raw[0].round() as i64, y: reference_raw[1].round() as i32, z: reference_raw[2].round() as i64 };
                if contact_projection.blocks_direct_decomposition(cell, reference_cell).unwrap_or(true) { continue; }
            }
            targets.push(Point { x: point[0], y: point[1], z: point[2], frame: frame.clone() });
        }
        if targets.is_empty() {
            return Err(TransferContactError::NoContact);
        }
        Ok(targets)
    }
    pub(crate) fn transfer_contacts(&mut self, worker_id: &str, container_id: &str) -> std::result::Result<Vec<Point>, TransferContactError> {
        let worker = self.entity(worker_id)?;
        self.world_pose_entity(worker, 0).map_err(|reason| if reason == "no position" { TransferContactError::UnavailableFrame } else { TransferContactError::from(reason) })?;
        let traversal = self.ecs.get::<Traversal>(worker).copied().ok_or("worker lacks traversal capability")?;
        self.transfer_contact_candidates(container_id, crate::terrain_traversal::TraversalConfig { spacing: [0.0; 3], clearance_cells: traversal.clearance_cells, max_step_cells: traversal.max_step_cells }, self.support_id(worker))
    }
    pub fn transfer_contacts_json(&mut self, input: &str) -> Result<String> {
        #[derive(serde::Deserialize)]
        #[serde(deny_unknown_fields)]
        struct Request { worker: String, container: String }
        let request: Request = serde_json::from_str(input).map_err(|error| error.to_string())?;
        match self.transfer_contacts(&request.worker, &request.container) {
            Ok(targets) => serde_json::to_string(&json!({"kind":"ready","targets":targets})).map_err(|error| error.to_string()),
            Err(reason) if reason.reason().is_some() => serde_json::to_string(&json!({"kind":"blocked","reason":reason.reason()})).map_err(|error| error.to_string()),
            Err(reason) => reason.into_result(),
        }
    }
    pub fn floor_operations_json(&mut self, input: &str) -> Result<String> {
        #[derive(serde::Deserialize)] struct Request { cell: [i64; 3], #[serde(rename="desiredCatalog")] desired_catalog: String }
        let requests: Vec<Request> = serde_json::from_str(input).map_err(|e| e.to_string())?;
        if requests.is_empty() || requests.len() > 128 { return Err("floor operation query exceeds request budget".into()); }
        let mut results = Vec::with_capacity(requests.len());
        for request in requests {
            let environment = self.environment.as_ref().ok_or("world has no environment")?;
            if request.cell[1] < i64::from(i32::MIN) || request.cell[1] > i64::from(i32::MAX) { results.push(json!({"kind":"invalid","reason":"floor support height out of range"})); continue; }
            let Some(definition) = environment.structures.get(&request.desired_catalog) else { results.push(json!({"kind":"invalid","reason":"unknown floor catalog"})); continue; };
            if !matches!(definition.shape, crate::environment_definition::StructureShape::Floor) { results.push(json!({"kind":"invalid","reason":"replacement catalog must be a floor"})); continue; }
            if let Some((id, _)) = self.ids.iter().find(|(_, entity)| self.ecs.get::<FloorReplacement>(**entity).is_some_and(|replacement| replacement.support_x == request.cell[0] && replacement.support_y == request.cell[1] && replacement.support_z == request.cell[2] && matches!(replacement.phase, FloorReplacementPhase::Queued | FloorReplacementPhase::Working))) { results.push(json!({"kind":"conflict","floor":id})); continue; }
            let mut found = None;
            for instance in environment.world.structure_instances() {
                if let crate::structure_geometry::StaticInstance::Floor { id, support } = instance && [support.x, i64::from(support.y), support.z] == request.cell { found = Some(id); break; }
            }
            if let Some(floor) = found {
                let current = self.ids.get(&floor).and_then(|e| self.ecs.get::<ConstructionSite>(*e)).map(|s| s.catalog.clone());
                results.push(match current { Some(catalog) if catalog == request.desired_catalog => json!({"kind":"unchanged","floor":floor}), Some(_) => json!({"kind":"replace","floor":floor}), None => json!({"kind":"invalid","reason":"floor identity is missing"}) });
            } else {
                let candidate = crate::structure_geometry::StaticInstance::Floor { id: format!("floor-query-{}-{}-{}", request.cell[0], request.cell[1], request.cell[2]), support: crate::generation::Cell { x: request.cell[0], y: request.cell[1] as i32, z: request.cell[2] } };
                let unsupported = self.environment.as_mut().ok_or("world has no environment")?.world.construction_support(&[candidate])?;
                if unsupported.is_empty() { results.push(json!({"kind":"build"})); } else { results.push(json!({"kind":"waiting-for-support"})); }
            }
        }
        serde_json::to_string(&results).map_err(|e| e.to_string())
    }
    /// Bounded read-only route costs. Preparation uses the same route owner as
    /// movement but never installs a destination or mutates canonical state.
    pub fn route_costs_json(&mut self, input: &str) -> Result<String> {
        self.ensure_ready()?;
        route_query::execute(self, input)
    }
    /// Cheapest route to one interchangeable target, using the same native
    /// movement graph without installing a destination.
    pub fn route_to_any_json(&mut self, input: &str) -> Result<String> {
        self.ensure_ready()?;
        route_query::execute_any(self,input)
    }
    /// Bounded local observation. May warm disposable physical contacts; never advances smoke.
    pub fn atmosphere_samples_json(&mut self, input: &str) -> Result<String> {
        self.ensure_ready()?;
        if input.len() > 16 * 1024 { return Err("atmosphere query exceeds input budget".into()); }
        let cells: Vec<[i64; 3]> = serde_json::from_str(input).map_err(|error| error.to_string())?;
        if cells.len() > 64 { return Err("atmosphere query exceeds cell budget".into()); }
        let environment = self.environment.as_mut().ok_or("world has no environment")?;
        let air = environment.atmosphere.as_mut().ok_or("world has no atmosphere")?;
        let cells: Vec<_> = cells.into_iter().map(|[x,y,z]| Ok(crate::generation::Cell { x, y:i32::try_from(y).map_err(|_| "air cell height out of range")?, z })).collect::<Result<_>>()?;
        let samples = air.sample(&mut environment.world, &cells)?;
        serde_json::to_string(&json!({"revision":self.revision,"geometryRevision":air.geometry_revision(),"samples":samples})).map_err(|error| error.to_string())
    }
    pub fn construction_readiness_json(&mut self, input: &str) -> Result<String> {
        self.construction_readiness(input)
    }

    pub fn placement_decisions_json(&mut self, input: &str) -> Result<String> {
        self.placement_decisions(input)
    }
    pub fn construction_access_json(&mut self, input: &str) -> Result<String> {
        self.construction_access(input)
    }
    pub fn deconstruction_access_json(&mut self, input: &str) -> Result<String> {
        self.deconstruction_access(input)
    }
    pub fn environment_facts_json(&self) -> Result<String> {
        self.ensure_ready()?;
        let environment = self.environment.as_ref().ok_or("world has no environment")?;
        let mut facts = serde_json::to_value(environment.world.facts()?).map_err(|error| error.to_string())?;
        facts["terrainRevision"] = json!(environment.world.terrain_revision());
        facts["placementRevision"] = json!(self.placement_revision);
        // Bounded saved obligations drive fire presentation; they are never a
        // client clock or an instruction to add more smoke.
        facts["emissions"] = json!(environment.paid_emissions.iter().map(|(source, emission)| {
            json!({"source":source,"catalog":emission.catalog,
                "cell":[emission.cell.x,emission.cell.y,emission.cell.z],
                "elapsedS":emission.elapsed_s})
        }).collect::<Vec<_>>());
        serde_json::to_string(&facts).map_err(|error| error.to_string())
    }
    pub(crate) fn record_frontier(&self) -> (u64, f64) { (self.revision, self.time) }
    pub fn save_records(&self) -> Result<KernelRecords> {
        self.ensure_ready()?;
        let environment = self.environment.as_ref().map(|environment| {
            Ok::<_, String>((environment.definition.clone(), environment.world.save_records()?))
        }).transpose()?;
        let atmosphere = self.environment.as_ref().map(|environment| environment.save_air()).transpose()?.flatten();
        Ok(KernelRecords { entities: self.snapshot_entities_json()?, environment, atmosphere })
    }
    pub fn restore_records(&mut self, records: &KernelRecords) -> Result<()> {
        let records_atmosphere = &records.atmosphere;
        if records.environment.is_none() && records_atmosphere.is_some() {
            return Err("atmosphere records require an environment".into());
        }
        let mut candidate = Self::new();
        candidate.restore_json_with_route_policy(&records.entities, true)?;
        if let Some((definition, records)) = &records.environment {
            let prepared = crate::environment_definition::prepare_definition(definition)?;
            let world = crate::terrain_water::TerrainWater::restore_records(
                prepared.geometry, prepared.terrain, records)?;
            let mut environment = KernelEnvironment { atmosphere: None, paid_emissions: BTreeMap::new(), emissions: prepared.emissions, processes: prepared.processes, resources: prepared.resources, definition: definition.clone(), world, excavation_rules: prepared.excavation_rules, structures: prepared.structures };
            environment.restore_air(prepared.atmosphere.as_ref(), records_atmosphere.as_deref(), candidate.revision)?;
            candidate.environment = Some(environment);
            candidate.validate_structure_recipes()?;
            candidate.validate_process_records()?;
            candidate.validate_field_water_records()?;
            candidate.validate_construction_sites()?;
            candidate.validate_resource_sites()?;
        }
        for entity in candidate.terrain_routes.keys().copied().collect::<Vec<_>>() {
            candidate.validate_terrain_route_witness(entity)?;
        }
        let route_count = candidate.routes.len();
        candidate.invalidate_terrain_routes()?;
        if candidate.routes.len() != route_count {
            return Err("saved terrain route witness is stale".into());
        }
        candidate.validate_excavation_work()?;
        candidate.validate_excavation_orders()?;
        candidate.validate_deconstruction_work()?;
        candidate.validate_deconstruction_orders()?;
        candidate.validate_work_execution()?;
        candidate.ground_stock_cleanup_pending = true;
        candidate.placement_revision = self.next_placement_revision();
        *self = candidate;
        Ok(())
    }
    pub fn snapshot_json(&self) -> Result<String> {
        self.ensure_ready()?;
        if self.environment.is_some() { return Err("environment worlds require save_records".into()); }
        self.snapshot_entities_json()
    }
    fn snapshot_entities_json(&self) -> Result<String> {
        let jobs = self.ids.iter().filter_map(|(id, entity)| self.ecs.get::<crate::job::Job>(*entity).cloned().map(|job| JobSnapshot { id: id.clone(), job })).collect::<Vec<_>>();
        let tasks = self.ids.iter().filter_map(|(id, entity)| self.ecs.get::<crate::job::Task>(*entity).cloned().map(|task| TaskSnapshot { id: id.clone(), task })).collect::<Vec<_>>();
        let initial = self
            .ids
            .iter()
            .map(|(id, e)| EntityRecord {
                id: id.clone(),
                components: self
                    .registry
                    .schemas
                    .keys()
                    .filter_map(|name| {
                        self.registry
                            .read(&self.ecs, *e, name)
                            .map(|r| (name.clone(), r))
                    })
                    .collect(),
            })
            .collect();
        let mut routes: Vec<RouteSnapshot> = self
            .routes
            .iter()
            .map(|(entity, path)| {
                self.route_snapshot_for(*entity, path, self.terrain_routes.get(entity))
            })
            .collect();
        routes.sort_by(|a: &RouteSnapshot, b: &RouteSnapshot| a.entity.cmp(&b.entity));
        let route_bytes = serde_json::to_vec(&routes).map_err(|e| e.to_string())?.len();
        if self.state_weight.saturating_add(route_bytes) > STATE_BYTES {
            return Err("route state exceeds canonical capacity".into());
        }
        let mut direct: Vec<DirectSnapshot> = self.direct.values().cloned().collect();
        direct.sort_by(|a, b| a.entity.cmp(&b.entity));
        let direct_bytes = serde_json::to_vec(&direct).map_err(|e| e.to_string())?.len();
        if self.state_weight.saturating_add(route_bytes).saturating_add(direct_bytes) > STATE_BYTES {
            return Err("direct state exceeds canonical capacity".into());
        }
        let party_bindings = self.party_bindings.snapshot();
        let owned_bytes = serde_json::to_vec(&(&jobs, &tasks, &party_bindings, &self.planner)).map_err(|e| e.to_string())?.len();
        if self.state_weight.saturating_add(route_bytes).saturating_add(direct_bytes).saturating_add(owned_bytes) > STATE_BYTES {
            return Err("job state exceeds canonical capacity".into());
        }
        let mut state = self.snapshot_metadata();
        state.scene.initial = initial;
        state.routes = routes;
        state.direct = direct;
        state.jobs = jobs;
        state.tasks = tasks;
        state.party_bindings = party_bindings;
        state.projectile_contacts = self.projectile_contacts.iter().map(|(projectile_id, targets)| ProjectileContactsSnapshot { projectile_id: projectile_id.clone(), targets: targets.iter().cloned().collect() }).collect();
        state.work_attempts = self.work_attempts.values().filter_map(|entity| self.ecs.get::<WorkAttempt>(*entity).cloned()).collect();
        serde_json::to_string(&state).map_err(|e| e.to_string())
    }
    fn snapshot_metadata(&self) -> Snapshot { self.snapshot_metadata_with_planner(self.planner.clone()) }
    fn snapshot_metadata_with_planner(&self, planner: PlannerState) -> Snapshot {
        Snapshot {
            format: "hive-kernel".into(),
            version: 21,
            revision: self.revision,
            time: self.time,
            next_lot: self.next_lot,
            next_projectile: self.next_projectile,
            next_impact: self.next_impact,
            scene: Scene {
                format: "hive-game".into(),
                version: 3,
                game: self.game.clone(),
                components: self.registry.schemas.values().cloned().collect(),
                initial: Vec::new(),
                actors: self.registry.actors.values().cloned().collect(),
                material_catalog: self.material_catalog.clone().into_definitions(),
                stockpile_profiles: self.stockpile_profiles.values().cloned().collect(),
            },
            routes: Vec::new(),
            direct: Vec::new(),
            projectile_contacts: Vec::new(),
            next_work_generation: self.next_work_generation,
            next_party_sequence: self.next_party_sequence,
            party_bindings: Vec::new(),
            work_attempts: Vec::new(),
            planner,
            jobs: Vec::new(),
            tasks: Vec::new(),
        }
    }
    pub fn restore_json(&mut self, input: &str) -> Result<()> {
        self.restore_json_with_route_policy(input, false)
    }
    fn restore_json_with_route_policy(&mut self, input: &str, defer_environment_validation: bool) -> Result<()> {
        if self.environment.is_some() { return Err("environment worlds require restore_records".into()); }
        if input.len() > 8 * 1024 * 1024 {
            return Err("snapshot too large".into());
        }
        let state: Snapshot = serde_json::from_str(input).map_err(|e| e.to_string())?;
        if state.format != "hive-kernel"
            || state.version != 21
            || !state.time.is_finite()
            || state.time < 0.0
            || state.next_lot == 0
            || state.next_projectile == 0
            || state.next_impact == 0
            || state.next_projectile > 9_007_199_254_740_991
            || state.next_impact > 9_007_199_254_740_991
            || state.revision > 9_007_199_254_740_991
        {
            return Err("invalid current snapshot".into());
        }
        let mut candidate = Self::from_scene_mode(state.scene, false)?;
        candidate.restore_job_components(state.jobs, state.tasks)?;
        let route_bytes = serde_json::to_vec(&state.routes)
            .map_err(|e| e.to_string())?
            .len();
        if candidate.state_weight.saturating_add(route_bytes) > STATE_BYTES {
            return Err("route state exceeds canonical capacity".into());
        }
        candidate.restore_routes(state.routes, defer_environment_validation)?;
        let mut direct = BTreeMap::new();
        if state.direct.len() > 16384 { return Err("too many direct streams".into()); }
        for saved in state.direct {
            let entity = candidate.entity(&saved.entity)?;
            if candidate.ecs.get::<Body>(entity).is_none() || candidate.ecs.get::<Position>(entity).is_none()
                || candidate.ecs.get::<Support>(entity).is_some() || !valid_id(&saved.stream)
                || saved.stream.len() > 64 || saved.queue.len() > navigation::MAX_DIRECT_INPUTS
                || saved.last_processed > saved.last_queued || !saved.remainder.is_finite()
                || saved.last_queued > 9_007_199_254_740_991
                || saved.queue.len() as u64 > saved.last_queued.saturating_sub(saved.last_processed)
                || saved.last_queued != saved.last_processed.saturating_add(saved.queue.len() as u64)
                || saved.remainder < 0.0 || saved.remainder >= navigation::DIRECT_STEP_SECONDS
                || (saved.queue.is_empty() && saved.remainder != 0.0)
                || (saved.queue.is_empty() && saved.last_processed != saved.last_queued)
                || saved.queue.iter().enumerate().any(|(i, input)| input.sequence != saved.last_processed.checked_add(i as u64 + 1).unwrap_or(0)
                    || !input.x.is_finite() || !input.z.is_finite() || input.x.abs() > 1.0 || input.z.abs() > 1.0)
            { return Err("invalid direct stream snapshot".into()); }
            if candidate.ecs.get::<Destination>(entity).is_some() || candidate.routes.contains_key(&entity) || direct.insert(entity, saved).is_some() { return Err("invalid direct stream ownership".into()); }
        }
        if candidate.state_weight.saturating_add(direct.values().map(Self::direct_weight).sum::<usize>()) > STATE_BYTES { return Err("direct snapshot capacity".into()); }
        candidate.direct = direct.into();
        let mut contacts = BTreeMap::new();
        if state.projectile_contacts.len() > 16384 {
            return Err("too many projectile contact sets".into());
        }
        for saved in state.projectile_contacts {
            let projectile = candidate.entity(&saved.projectile_id)?;
            if candidate.ecs.get::<Projectile>(projectile).is_none()
                || saved.targets.len() > 128
                || saved.targets.iter().any(|target| candidate.entity(target).is_err())
                || saved.targets.windows(2).any(|pair| pair[0] >= pair[1])
                || contacts.insert(saved.projectile_id, saved.targets.into_iter().collect()).is_some()
            {
                return Err("invalid projectile contact snapshot".into());
            }
        }
        candidate.projectile_contacts = contacts.into();
        candidate.refresh_state_weight();
        if candidate.state_weight > STATE_BYTES {
            return Err("projectile contact state exceeds canonical capacity".into());
        }
        candidate.revision = state.revision;
        candidate.time = state.time;
        candidate.next_lot = state.next_lot;
        candidate.next_projectile = state.next_projectile;
        candidate.next_impact = state.next_impact;
        if state.next_work_generation == 0 || state.next_party_sequence == 0 || state.work_attempts.len() > 16384 {
            return Err("invalid work attempt snapshot".into());
        }
        let mut attempts = BTreeMap::new();
        for attempt in state.work_attempts {
            if !valid_id(&attempt.key.task) || !valid_id(&attempt.worker) || !valid_id(&attempt.execution.pool)
                || !candidate.ids.contains_key(&attempt.key.task) || !candidate.ids.contains_key(&attempt.worker)
                || !candidate.ids.contains_key(&attempt.execution.pool) || attempt.key.generation == 0
                || attempts.insert(attempt.key.task.clone(), attempt).is_some() {
                return Err("invalid work attempt ownership".into());
            }
        }
        for attempt in attempts.values() {
            if !valid_id(&attempt.execution.policy_id) || attempt.execution.initiating_player.as_ref().is_some_and(|player| !valid_id(player)) {
                return Err("invalid work attempt execution".into());
            }
            if let Some(operation) = attempt.current_operation() {
                if operation.attempt != attempt.key || operation.sequence == 0 { return Err("invalid work attempt operation".into()); }
            }
        }
        candidate.next_work_generation = state.next_work_generation;
        candidate.next_party_sequence = state.next_party_sequence;
        candidate.party_bindings = crate::party_binding::PartyBindingStore::restore(
            state.party_bindings,
            state.next_party_sequence,
        )?;
        state.planner.validate().map_err(str::to_owned)?;
        let planner_bytes = serde_json::to_vec(&state.planner).map_err(|error| error.to_string())?.len();
        if candidate.state_weight.saturating_add(route_bytes).saturating_add(planner_bytes) > STATE_BYTES {
            return Err("planner state exceeds canonical capacity".into());
        }
        candidate.planner = state.planner;
        candidate.rebuild_planner_index();
        for (task, attempt) in attempts {
            let entity = candidate.entity(&task)?;
            candidate.ecs.entity_mut(entity).insert(attempt.clone());
            candidate.work_attempts.insert(task, entity);
            // Completed outcomes retain worker ownership until their provider
            // reconciles and acknowledges them. Blocked/interrupted outcomes
            // release the worker and may be acknowledged after reassignment.
            if matches!(attempt.phase, AttemptPhase::Executing { .. } | AttemptPhase::Outcome { result: WorkOutcome::Completed, .. })
                && candidate.attempts_by_worker.insert(attempt.worker.clone(), attempt.key.clone()).is_some()
            {
                return Err("competing work attempt workers".into());
            }
        }
        for id in candidate.ids.keys() {
            if let Some(sequence) = id.strip_prefix("shot.").and_then(|value| value.parse::<u64>().ok()) {
                if sequence >= candidate.next_projectile {
                    return Err("snapshot projectile counter collides with entity".into());
                }
            }
        }
        for entity in candidate.ids.values() {
            if let Some(projectile) = candidate.ecs.get::<Projectile>(*entity) {
                let launcher = candidate.entity(&projectile.launcher)?;
                if candidate.ecs.get::<Launcher>(launcher).is_none() {
                    return Err("snapshot projectile launcher lacks launcher capability".into());
                }
            }
        }
        candidate.projectile_count = candidate.ids.values().filter(|entity| candidate.ecs.get::<Projectile>(**entity).is_some_and(|p| p.state == "flying" || p.state == "rolling")).count();
        candidate.ground_stock_cleanup_pending = true;
        candidate.validate_party_relations()?;
        candidate.validate_work_execution()?;
        candidate.validate_field_water_records()?;
        crate::supply_allocation::validate_relations(&candidate)?;
        candidate.validate_work_attempt_relations()?;
        candidate.validate_deconstruction_work()?;
        candidate.validate_excavation_orders()?;
        candidate.validate_deconstruction_orders()?;
        candidate.placement_revision = self.next_placement_revision();
        *self = candidate;
        Ok(())
    }

    fn validate_party_relations(&self) -> Result<()> {
        for entity in self.ids.values() {
            if let Some(member) = self.ecs.get::<PartyMember>(*entity) {
                let party = self.entity(&member.party)?;
                if self.ecs.get::<Party>(party).is_none() { return Err("party member references a non-party".into()); }
            }
            if let Some(owner) = self.ecs.get::<OwnedByParty>(*entity) {
                let party = self.entity(&owner.party)?;
                if self.ecs.get::<Party>(party).is_none() { return Err("owned entity references a non-party".into()); }
            }
        }
        Ok(())
    }

    fn validate_work_execution(&self) -> Result<()> {
        for (id, entity) in &self.ids {
            let Some(policy) = self.ecs.get::<crate::work_planner::WorkPolicy>(*entity) else { continue; };
            let execution = self.ecs.get::<WorkExecution>(*entity).ok_or_else(|| format!("work policy {id} has no work execution"))?;
            if execution.pool != policy.pool {
                return Err(format!("work execution pool does not match work policy for {id}"));
            }
            if !valid_id(&execution.policy_id) || execution.initiating_player.as_ref().is_some_and(|player| !valid_id(player)) {
                return Err(format!("invalid work execution for {id}"));
            }
            let pool = self.entity(&execution.pool)?;
            self.ecs.get::<Party>(pool).ok_or_else(|| format!("work execution pool is not a party for {id}"))?;
            if execution.initiating_player.as_ref().is_some_and(|player| self.ownership.player(&execution.pool) != Some(player.as_str())) {
                return Err(format!("work execution player does not own pool for {id}"));
            }
        }
        Ok(())
    }
    fn validate_work_attempt_relations(&self) -> Result<()> {
        let not_owned_by_another_party = |id: &str, party: &str| -> Result<Entity> {
            let entity = self.entity(id)?;
            if self.ecs.get::<OwnedByParty>(entity).is_some_and(|owner| owner.party != party) {
                return Err("work attempt reference is outside party".into());
            }
            Ok(entity)
        };
        let owned_by_attempt_party = |id: &str, party: &str| -> Result<Entity> {
            let entity = self.entity(id)?;
            if self.ecs.get::<OwnedByParty>(entity).map(|owner| owner.party.as_str()) != Some(party) {
                return Err("work attempt reference is outside party".into());
            }
            Ok(entity)
        };
        let valid_point = |point: &Point| -> Result<()> {
            if !point.x.is_finite() || !point.y.is_finite() || !point.z.is_finite() {
                return Err("work attempt point is invalid".into());
            }
            if let Some(frame) = point.frame.as_deref() { self.entity(frame)?; }
            Ok(())
        };
        for (task, attempt_entity) in &self.work_attempts {
            let attempt = self.ecs.get::<WorkAttempt>(*attempt_entity).ok_or("work attempt index references missing component")?;
            if attempt.version != crate::work_attempt::CURRENT_VERSION { return Err("unsupported work attempt version".into()); }
            if attempt.key.task != *task { return Err("work attempt task index mismatch".into()); }
            let party = self.entity(&attempt.execution.pool)?;
            self.ecs.get::<Party>(party).ok_or("work attempt pool is not a party")?;
            if attempt.execution.initiating_player.as_ref().is_some_and(|player| self.ownership.player(&attempt.execution.pool) != Some(player.as_str())) { return Err("work attempt player does not own pool".into()); }
            if task != &attempt.worker {
                let task_execution = self.ecs.get::<WorkExecution>(*attempt_entity).ok_or("work attempt task has no execution")?;
                if task_execution != &attempt.execution { return Err("work attempt execution differs from task".into()); }
            }
            let worker = self.entity(&attempt.worker)?;
            if self.ecs.get::<PartyMember>(worker).map(|member| member.party.as_str()) != Some(attempt.execution.pool.as_str()) {
                return Err("work attempt worker is outside party".into());
            }
            not_owned_by_another_party(task, &attempt.execution.pool)?;
            let activity = match &attempt.phase {
                AttemptPhase::Executing { activity, .. } | AttemptPhase::Outcome { activity, .. } => activity,
                AttemptPhase::Ready | AttemptPhase::Settling { .. } => return Err("work attempt has no recoverable activity".into()),
            };
            match activity {
                crate::work_attempt::ActivityRef::Route { destination } => valid_point(destination)?,
                crate::work_attempt::ActivityRef::Construction { site, contact, .. } => {
                    if site != task { return Err("construction attempt task mismatch".into()); }
                    owned_by_attempt_party(site, &attempt.execution.pool)?;
                    valid_point(contact)?;
                }
                crate::work_attempt::ActivityRef::Excavation { .. } => {}
                crate::work_attempt::ActivityRef::Deconstruction { site, contact } => {
                    owned_by_attempt_party(site, &attempt.execution.pool)?;
                    valid_point(contact)?;
                }
                crate::work_attempt::ActivityRef::ProcessAttendance { process, contact } => {
                    if process != task { return Err("process attendance task mismatch".into()); }
                    let entity = owned_by_attempt_party(process, &attempt.execution.pool)?;
                    if self.ecs.get::<StagedProcess>(entity).is_none() { return Err("process attendance references non-process task".into()); }
                    valid_point(contact)?;
                    if self.environment.is_some() { self.validate_process_contact(process, contact)?; }
                }
                crate::work_attempt::ActivityRef::MaterialTransfer { lot, from, to, quantity } => {
                    if *quantity == 0 { return Err("invalid saved material transfer quantity".into()); }
                    let lot_entity = owned_by_attempt_party(lot, &attempt.execution.pool)?;
                    if self.ecs.get::<Lot>(lot_entity).is_none() { return Err("material transfer references non-lot".into()); }
                    for endpoint in [from, to] {
                        let entity = self.entity(endpoint)?;
                        let party_owned = self.ecs.get::<OwnedByParty>(entity).map(|owner| owner.party.as_str()) == Some(attempt.execution.pool.as_str());
                        let attempt_worker = endpoint == &attempt.worker && self.ecs.get::<PartyMember>(entity).map(|member| member.party.as_str()) == Some(attempt.execution.pool.as_str());
                        if !party_owned && !attempt_worker { return Err("material transfer endpoint is outside party".into()); }
                    }
                }
                crate::work_attempt::ActivityRef::MaterialDrop { lot } => {
                    let entity = owned_by_attempt_party(lot, &attempt.execution.pool)?;
                    if self.ecs.get::<Lot>(entity).is_none() { return Err("material drop references non-lot".into()); }
                }
                crate::work_attempt::ActivityRef::ResourceEstablish { site, .. } => { self.entity(site)?; }
                crate::work_attempt::ActivityRef::ResourceTend { site, vessel } => {
                    self.entity(site)?;
                    self.entity(vessel)?;
                }
                crate::work_attempt::ActivityRef::ResourceExtract { source } => { self.entity(source)?; }
                crate::work_attempt::ActivityRef::FieldWater { vessel, portions, .. } => {
                    self.entity(vessel)?;
                    if *portions == 0 { return Err("saved field water portions must be positive".into()); }
                }
                crate::work_attempt::ActivityRef::JobTransform { task: transform_task, .. } => {
                    if transform_task != task { return Err("job transform attempt task mismatch".into()); }
                    let transform = self.entity(transform_task)?;
                    if self.ecs.get::<crate::job::Task>(transform).is_none() { return Err("job transform references non-task entity".into()); }
                }
            }
        }
        Ok(())
    }
    pub fn render_json(&self) -> Result<String> {
        self.ensure_ready()?;
        let closed_faces = self.environment.as_ref().map(|environment| environment.world.structure_vertical_faces()
            .map(|face| json!({"cell":{"x":face.cell.x,"y":face.cell.y,"z":face.cell.z},"axis":face.axis}))
            .collect::<Vec<_>>()).unwrap_or_default();
        if closed_faces.len() > 4096 { return Err("direct structure face projection exceeds bounds".into()); }
        let mut facts = Vec::new();
        for (id, e) in &self.ids {
            let Some(local) = self.ecs.get::<Position>(*e) else {
                continue;
            };
            let p = self.world_pose_entity(*e, 0)?;
            let visual=self.ecs.get::<Visual>(*e);
            let launcher=self.ecs.get::<Launcher>(*e);
            let collider=self.ecs.get::<Collider>(*e);
            let launcher_velocity=if launcher.is_some() {self.world_linear_velocity(*e, 0.02)?} else {[0.0;3]};
            let launcher_radians=p.facing * std::f64::consts::FRAC_PI_2;
            let (launcher_sin, launcher_cos)=launcher_radians.sin_cos();
            facts.push(json!({
                "id":id,
                "pose":{"position":{"x":p.x,"y":p.y,"z":p.z},"facing":p.facing},
                "local":{"position":{"x":local.x,"y":local.y,"z":local.z},"facing":local.facing},
                "support":self.support_id(*e),
                "surface":self.ecs.get::<Surface>(*e),
                "visual":visual.map(|v|&v.sprite),
                "label":visual.map(|v|&v.label),
                "aim":launcher.map(|launcher| json!({
                    "origin":{"x":p.x,"y":p.y,"z":p.z},
                    "muzzle":{"x":launcher.muzzle_x,"y":launcher.muzzle_y,"z":launcher.muzzle_z},
                    "inheritedVelocity":{"x":launcher_velocity[0],"y":launcher_velocity[1],"z":launcher_velocity[2]},
                    "radius":launcher.projectile_radius,
                    "gravity":launcher.gravity,
                    "penetration":launcher.penetration,
                    "maxRange":launcher.max_range,
                    "maxLifetime":launcher.max_lifetime,
                    "speed":launcher.max_speed,
                })),
                "collision":collider.map(|collider| json!({
                    "id":id,
                    "origin":{"x":p.x,"y":p.y,"z":p.z},
                    "shape":collider.shape,
                    "radius":collider.radius,
                    "halfX":collider.half_x,
                    "halfY":collider.half_y,
                    "halfZ":collider.half_z,
                    "yaw":launcher_radians+collider.yaw,
                    "offsetX":launcher_cos*collider.offset_x-launcher_sin*collider.offset_z,
                    "offsetY":collider.offset_y,
                    "offsetZ":launcher_sin*collider.offset_x+launcher_cos*collider.offset_z,
                    "velocity":{"x":0.0,"y":0.0,"z":0.0},
                    "material":self.ecs.get::<ImpactMaterial>(*e).map(|m|json!(m)).unwrap_or(json!({"response":"stop","resistance":0.0,"restitution":0.0,"friction":1.0,"embedSpeed":0.0})),
                })),
                "projectile":self.ecs.get::<Projectile>(*e).map(|projectile| json!({
                    "velocity":{"x":projectile.velocity_x,"y":projectile.velocity_y,"z":projectile.velocity_z},
                    "gravity":projectile.gravity,
                    "state":&projectile.state,
                    "embedDepth":projectile.embed_depth,
                    "rollFriction":projectile.roll_friction,
                    "rollNormal":{"x":projectile.roll_normal_x,"y":projectile.roll_normal_y,"z":projectile.roll_normal_z},
                    "penetration":projectile.penetration,
                })),
                "direct": self.direct.get(e).map(|state| json!({
                    "stream": state.stream,
                    "lastQueued": state.last_queued,
                    "lastProcessed": state.last_processed,
                    "speed": self.ecs.get::<Body>(*e).map(|body| body.speed),
                    "blocked": self.blocked_by_frame.get(&None).into_iter().flatten().map(|(x,y,z)| json!([x,y,z])).collect::<Vec<_>>(),
                    "closedFaces": &closed_faces,
                    "bounds": self.frame_bounds(None).ok().flatten().map(|b| json!({"min_x":b.min_x,"max_x":b.max_x,"min_z":b.min_z,"max_z":b.max_z})),
                }))
            }));
        }
        serde_json::to_string(&facts).map_err(|e| e.to_string())
    }
    pub fn world_pose_json(&self, input: &str) -> Result<String> {
        self.ensure_ready()?;
        if input.len() > 16 * 1024 {
            return Err("world pose query too large".into());
        }
        let ids: Vec<String> = serde_json::from_str(input).map_err(|e| e.to_string())?;
        if ids.is_empty() || ids.len() > 128 {
            return Err("invalid world pose query size".into());
        }
        let mut rows = Vec::with_capacity(ids.len());
        for id in ids {
            let entity = self.entity(&id)?;
            let local = *self.ecs.get::<Position>(entity).ok_or("no position")?;
            let world = self.world_pose(&id)?;
            rows.push(json!({
                "id": id,
                "local": local,
                "world": world,
                "support": self.support_id(entity),
                "surface": self.ecs.get::<Surface>(entity),
            }));
        }
        serde_json::to_string(&rows).map_err(|e| e.to_string())
    }
    pub fn advance_json(&mut self, input: &str) -> Result<String> {
        self.ensure_ready()?;
        if input.len() > 1024 * 1024 {
            return Err("batch too large".into());
        }
        let batch: Batch = serde_json::from_str(input).map_err(|error| error.to_string())?;
        let needs_staging = !batch.creates.is_empty() || !batch.removes.is_empty()
            || self.projectile_count > 0 || !self.direct.is_empty()
            || self.native_planner_may_mutate(self.revision.saturating_add(1))
            || batch.actions.iter().any(|action| {
                let action = &action.request;
                matches!(action, Action::Launch { .. } | Action::Displace { .. }
                    | Action::InstantiateActors { .. }
                    | Action::SetRelation { .. } | Action::ClearRelation { .. }
                    | Action::BeginWorkAttempt { .. } | Action::RetargetWorkAttempt { .. } | Action::InterruptWorkAttempt { .. } | Action::AcknowledgeWorkAttempt { .. }
                    | Action::ContinueWorkAttempt { .. } | Action::CancelWork { .. }
                    | Action::CreateJob { .. } | Action::ResumeJob { .. } | Action::CancelJob { .. }
                    | Action::BeginDirect { .. } | Action::DirectInput { .. } | Action::SetStructureOpen { .. }
                    | Action::ExtractResource { .. } | Action::EstablishResourceSite { .. } | Action::TendResourceSite { .. } | Action::DesignateStockpile { .. }
                    | Action::DesignateResource { .. }
                    | Action::RequestFieldWater { .. }
                    | Action::UpdateStockpile { .. } | Action::ClearStockpile { .. } | Action::Deconstruct { .. }
                    | Action::PlanConstructions { .. }
                    | Action::ReplaceFloor { .. }
                    | Action::RequestProcess { .. } | Action::AdmitProcess { .. } | Action::ExchangeFieldWater { .. }
                    | Action::PlanExcavation { .. } | Action::CancelExcavation { .. })
            });
        if needs_staging {
            let before = self.save_records()?;
            let result = self.advance_batch(batch);
            if result.is_err() {
                self.restore_records(&before)?;
            }
            return result;
        }
        let result = self.advance_batch(batch);
        if result.is_err() && self.environment.is_some() { self.discard_required = true; }
        result
    }

    /// Region exclusively owns this disposable candidate until durable commit.
    /// Failure poisons the whole candidate; the owner must discard or restore it.
    /// Standalone callers use advance_json for its local rollback guarantee.
    pub fn advance_candidate_json(&mut self, input: &str) -> Result<String> {
        self.ensure_ready()?;
        let result = (|| {
            if input.len() > 1024 * 1024 {
                return Err("batch too large".into());
            }
            let batch: Batch = serde_json::from_str(input).map_err(|error| error.to_string())?;
            self.advance_batch(batch)
        })();
        if result.is_err() { self.discard_required = true; }
        result
    }

    fn advance_batch(&mut self, batch: Batch) -> Result<String> {
        if !batch.delta.is_finite()
            || !(0.0..=1.0).contains(&batch.delta)
            || batch.writes.len() > 4096
            || batch.actions.len() > 256
            || self.revision >= 9_007_199_254_740_991
            || !(self.time + batch.delta).is_finite()
        {
            return Err("invalid advancement budget".into());
        }
        let action_created_references = batch.actions.iter().filter_map(|action| match &action.request {
            Action::CreateJob { id, .. } | Action::ResumeJob { id, .. } => Some(id.clone()),
            _ => None,
        }).collect::<BTreeSet<_>>();
        let mut owned_creates = Vec::new();
        let creates = batch.creates.into_iter().map(|create| {
            let ScopedCreate { scope, record } = create;
                if record.components.contains_key("hive.owned-by") || record.components.contains_key("hive.owned-by-party") {
                    return Err("authored records cannot provide ownership".into());
                }
                if let ActionScope::Player { ref player } = scope {
                    if !valid_id(player) { return Err("invalid creation player".into()); }
                    owned_creates.push((record.id.clone(), player.clone()));
                }
                Ok(record)
        }).collect::<Result<Vec<_>>>()?;
        let removes = batch.removes.into_iter().map(|remove| {
            self.entity(&remove.entity)?;
            match remove.scope {
                ActionScope::Host => {}
                ActionScope::Player { player } => {
                    if !valid_id(&player) || self.ownership.player(&remove.entity) != Some(player.as_str()) {
                        return Err("scoped authored removal is outside player ownership".into());
                    }
                }
            }
            Ok(remove.entity)
        }).collect::<Result<Vec<_>>>()?;
        let prepared = self.prepare_authored_entities(creates, removes, batch.writes, action_created_references)?;
        self.publish_authored_entities(prepared);
        for (id, player) in owned_creates {
            let entity = self.entity(&id)?;
            self.insert_accounted_component(entity, "hive.owned-by", OwnedBy { player })?;
            self.refresh_ownership_index(&id);
        }
        self.revision += 1;
        let results = batch
            .actions
            .into_iter()
            .map(|action| -> Result<ActionResult> {
                let ScopedAction { scope, request } = action;
                let requires_atomic_action = matches!(
                    &request,
                    Action::InstantiateActors { .. }
                        | Action::SetRelation { .. }
                        | Action::ClearRelation { .. }
                        | Action::BeginWorkAttempt { .. }
                        | Action::RetargetWorkAttempt { .. }
                        | Action::InterruptWorkAttempt { .. }
                        | Action::AcknowledgeWorkAttempt { .. }
                        | Action::ContinueWorkAttempt { .. }
                        | Action::CancelWork { .. }
                        | Action::CreateJob { .. }
                        | Action::ResumeJob { .. }
                        | Action::CancelJob { .. }
                );
                let result = self.validate_action_scope(&scope, &request).and_then(|()| self.apply_action(request, batch.delta, &scope));
                // These actions coordinate authored state with a native
                // lifecycle owner. A rejection marks a broken candidate: let
                // advance_json restore the staged world instead of publishing
                // the authored half of the transition.
                if requires_atomic_action {
                    if let Err(reason) = &result { return Err(reason.clone()); }
                }
                Ok(ActionResult {
                    accepted: result.is_ok(),
                    projectile_id: result.as_ref().ok().and_then(|effect| match effect { ActionEffect::Projectile(id, _) => Some(id.clone()), _ => None }),
                    launch_point: result.as_ref().ok().and_then(|effect| match effect { ActionEffect::Projectile(_, point) => Some(*point), _ => None }),
                    entity_id: result.as_ref().ok().and_then(|effect| match effect { ActionEffect::Entity(id) | ActionEffect::Projectile(id, _) => Some(id.clone()), ActionEffect::None | ActionEffect::Attempt(_) => None }),
                    attempt: result.as_ref().ok().and_then(|effect| match effect { ActionEffect::Attempt(key) => Some(key.clone()), _ => None }),
                    reason: result.err(),
                    revision: self.revision,
                })
            })
            .collect::<Result<Vec<_>>>()?;
        let impacts = self.advance_projectiles(batch.delta)?;
        self.advance_direct(batch.delta)?;
        if self.state_weight.saturating_add(self.direct.values().map(Self::direct_weight).sum::<usize>()) > STATE_BYTES { return Err("region canonical state capacity".into()); }
        // Work sees the pre-movement occupation. Arriving this tick does not
        // retroactively earn a full tick of effort after spending it travelling.
        self.advance_excavation(batch.delta)?;
        self.advance_deconstruction(batch.delta)?;
        self.advance_construction(batch.delta)?;
        self.advance_movement(batch.delta)?;
        self.settle_arrived_work_attempts()?;
        let environment_work = self.environment.as_mut().map(|environment| environment.advance(batch.delta, self.revision)).transpose()?;
        self.advance_process_work_attempts(batch.delta)?;
        self.advance_staged_processes(batch.delta)?;
        self.advance_resource_work(batch.delta)?;
        self.advance_job_transform_work(batch.delta)?;
        // Terrain and authored support surfaces are both lawful geometry
        // owners. The physical index contains each validated surface frame;
        // detached record fixtures with neither geometry remain dormant.
        if self.environment.is_some() || self.blocked_by_frame.keys().any(Option::is_some) {
            self.advance_native_work_planner(self.revision)?;
        }
        self.cleanup_empty_ground_stock();
        self.time += batch.delta;
        let mut output = json!({"revision":self.revision,"results":results,"impacts":impacts});
        if let Some(work) = environment_work { output["environmentWork"] = serde_json::to_value(work.water).map_err(|e| e.to_string())?; output["atmosphereWork"] = serde_json::to_value(work.air).map_err(|e| e.to_string())?; }
        serde_json::to_string(&output).map_err(|e| e.to_string())
    }
    fn settle_arrived_work_attempts(&mut self) -> Result<()> {
        let arrived: Vec<(String, AttemptPhase)> = self.work_attempts.iter().filter_map(|(task, entity)| {
            let attempt = self.ecs.get::<WorkAttempt>(*entity)?;
            let worker = self.entity(&attempt.worker).ok()?;
            if !matches!(attempt.phase, AttemptPhase::Executing { .. }) || !self.arrived_routes.contains(&worker) { return None; }
            let operation = attempt.current_operation()?.clone();
            Some((task.clone(), AttemptPhase::Outcome { operation, activity: match &attempt.phase { AttemptPhase::Executing { activity, .. } => activity.clone(), _ => unreachable!() }, result: WorkOutcome::Completed }))
        }).collect();
        for (task, phase) in arrived { self.settle_attempt(&task, phase)?; }
        Ok(())
    }
    fn advance_process_work_attempts(&mut self, delta: f64) -> Result<()> {
        if delta == 0.0 { return Ok(()); }
        let active: Vec<(String, String, String, Point)> = self.work_attempts.iter().filter_map(|(task, entity)| {
            let attempt = self.ecs.get::<WorkAttempt>(*entity)?;
            match &attempt.phase {
                AttemptPhase::Executing { activity: crate::work_attempt::ActivityRef::ProcessAttendance { process, contact }, .. } => Some((task.clone(), attempt.worker.clone(), process.clone(), contact.clone())),
                _ => None,
            }
        }).collect();
        for (task, worker, process, contact) in active {
            let worker_entity = self.entity(&worker)?;
            let unavailable = self.ecs.get::<Body>(worker_entity).is_none() || self.ecs.get::<Container>(worker_entity).is_none() || self.ecs.get::<Traversal>(worker_entity).is_none() || self.ecs.get::<Support>(worker_entity).is_some() || self.ecs.get::<Destination>(worker_entity).is_some() || self.ecs.get::<ExcavationWork>(worker_entity).is_some();
            let access_lost = self.process_worker_at_contact(worker_entity, &process, &contact).is_err();
            if unavailable || access_lost {
                let process_entity = self.entity(&process)?;
                if let Some(state) = self.ecs.get::<StagedProcess>(process_entity).cloned() {
                    if state.phase == ProcessPhase::Working {
                        let mut waiting = state;
                        waiting.phase = ProcessPhase::Waiting;
                        waiting.blocked_reason.clear();
                        self.ecs.entity_mut(process_entity).insert(waiting);
                    }
                }
                let entity = *self.work_attempts.get(&task).ok_or("process attendance attempt disappeared")?;
                let attempt = self.ecs.get::<WorkAttempt>(entity).cloned().ok_or("work attempt component is missing")?;
                let operation = attempt.current_operation().cloned().ok_or("process attendance operation is missing")?;
                self.settle_attempt(&task, AttemptPhase::Outcome { operation, activity: crate::work_attempt::ActivityRef::ProcessAttendance { process: process.clone(), contact: contact.clone() }, result: WorkOutcome::Blocked { reason: if access_lost { WorkBlockReason::AccessLost } else { WorkBlockReason::WorkerUnavailable } } })?;
                continue;
            }
            self.attend_process(&worker, &process, &contact, delta)?;
            let state = self.ecs.get::<StagedProcess>(self.entity(&process)?).ok_or("process is missing staged state")?;
            if state.phase != ProcessPhase::Working {
                let entity = *self.work_attempts.get(&task).ok_or("process attendance attempt disappeared")?;
                let attempt = self.ecs.get::<WorkAttempt>(entity).cloned().ok_or("work attempt component is missing")?;
                let operation = attempt.current_operation().cloned().ok_or("process attendance operation is missing")?;
                let result = if state.phase == ProcessPhase::Blocked {
                    let reason = match state.blocked_reason.as_str() {
                        "process-binding-missing" => WorkBlockReason::MissingInputs,
                        "process-output-full" | "process-emission-blocked" | "process-state-capacity" => WorkBlockReason::CapacityUnavailable,
                        "process-air-unavailable" => WorkBlockReason::AccessLost,
                        _ => WorkBlockReason::UnsupportedStructure,
                    };
                    WorkOutcome::Blocked { reason }
                } else { WorkOutcome::Completed };
                self.settle_attempt(&task, AttemptPhase::Outcome { operation, activity: crate::work_attempt::ActivityRef::ProcessAttendance { process, contact }, result })?;
            }
        }
        Ok(())
    }
    fn settle_attempt(&mut self, task: &str, phase: AttemptPhase) -> Result<()> {
        let entity = *self.work_attempts.get(task).ok_or("work attempt is not current")?;
        let worker = self.ecs.get::<WorkAttempt>(entity).ok_or("work attempt component is missing")?.worker.clone();
        let retain_worker = matches!(&phase, AttemptPhase::Outcome { result: WorkOutcome::Completed, .. });
        crate::record_changes::edit::<WorkAttempt>(entity, &mut self.ecs).ok_or("work attempt component is missing")?.phase = phase;
        if !retain_worker { self.attempts_by_worker.remove(&worker); }
        Ok(())
    }
    pub(crate) fn entity(&self, id: &str) -> Result<Entity> {
        self.ids
            .get(id)
            .copied()
            .ok_or_else(|| format!("unknown entity {id}"))
    }
    fn position_key(position: &Position) -> (u64, u64, u64) {
        (position.x.to_bits(), position.y.to_bits(), position.z.to_bits())
    }
    pub(crate) fn stockpile_policy_candidates_at(&self, position: &Position) -> impl Iterator<Item = (String, StockpileCell)> + '_ {
        self.stockpile_policies_by_position.get(&Self::position_key(position)).into_iter().flatten().filter_map(|id| {
            let entity = self.entity(id).ok()?;
            Some((id.clone(), self.ecs.get::<StockpileCell>(entity)?.clone()))
        })
    }
    pub(crate) fn ground_stock_candidates_at(&self, position: &Position) -> impl Iterator<Item = (String, Entity)> + '_ {
        self.ground_stocks_by_position.get(&Self::position_key(position)).into_iter().flatten().filter_map(|id| {
            let entity = self.entity(id).ok()?;
            Some((id.clone(), entity))
        })
    }
    pub(crate) fn storage_provider_candidates_at(&self, position: &Position) -> impl Iterator<Item = (String, Entity)> + '_ {
        self.storage_providers_by_position.get(&Self::position_key(position)).into_iter().flatten().filter_map(|id| {
            let entity = self.entity(id).ok()?;
            Some((id.clone(), entity))
        })
    }
    fn index_stockpile_policy(&mut self, id: &str, entity: Entity) {
        if let Some(position) = self.ecs.get::<Position>(entity) {
            self.stockpile_policies_by_position.entry(Self::position_key(position)).or_default().insert(id.to_owned());
        }
    }
    fn unindex_stockpile_policy(&mut self, id: &str, entity: Entity) {
        if let Some(position) = self.ecs.get::<Position>(entity) {
            let key = Self::position_key(position);
            if let Some(ids) = self.stockpile_policies_by_position.get_mut(&key) {
                ids.remove(id);
                if ids.is_empty() { self.stockpile_policies_by_position.remove(&key); }
            }
        }
    }
    fn index_ground_stock(&mut self, id: &str, entity: Entity) {
        if let Some(position) = self.ecs.get::<Position>(entity) {
            self.ground_stocks_by_position.entry(Self::position_key(position)).or_default().insert(id.to_owned());
        }
    }
    fn index_storage_provider(&mut self, id: &str, entity: Entity) {
        if self.ecs.get::<StorageProvider>(entity).is_some() {
            if let Some(position) = self.ecs.get::<Position>(entity) {
                self.storage_providers_by_position.entry(Self::position_key(position)).or_default().insert(id.to_owned());
            }
        }
    }
    fn unindex_storage_provider(&mut self, id: &str, entity: Entity) {
        if let Some(position) = self.ecs.get::<Position>(entity) {
            let key = Self::position_key(position);
            if let Some(ids) = self.storage_providers_by_position.get_mut(&key) {
                ids.remove(id);
                if ids.is_empty() { self.storage_providers_by_position.remove(&key); }
            }
        }
    }
    fn unindex_ground_stock(&mut self, id: &str, entity: Entity) {
        if let Some(position) = self.ecs.get::<Position>(entity) {
            let key = Self::position_key(position);
            if let Some(ids) = self.ground_stocks_by_position.get_mut(&key) {
                ids.remove(id);
                if ids.is_empty() { self.ground_stocks_by_position.remove(&key); }
            }
        }
    }
    pub(crate) fn ensure_stockpile_destination(&mut self, policy_id: &str, quantity: u32) -> Result<String> {
        if quantity == 0 { return Err("stockpile destination quantity must be positive".into()); }
        let policy_entity = self.entity(policy_id)?;
        self.ecs.get::<StockpileCell>(policy_entity).ok_or("stockpile destination policy is missing")?;
        let position = *self.ecs.get::<Position>(policy_entity).ok_or("stockpile policy has no position")?;
        let party = self.ecs.get::<OwnedByParty>(policy_entity).map(|owner| owner.party.clone()).ok_or("stockpile policy has no party")?;
        let base = format!("stockpile-ground:{policy_id}");
        if let Some(entity) = self.ids.get(&base).copied() {
            if self.ecs.get::<GroundStock>(entity).is_some() { return Ok(base); }
            return Err("stockpile destination identity is occupied".into());
        }
        if self.ground_stocks_by_position.get(&Self::position_key(&position)).is_some_and(|ids| !ids.is_empty()) {
            return Err("stockpile ground stack is unavailable".into());
        }
        if self.ids.len() >= 16_384 { return Err("region entity capacity".into()); }
        let entity = self.ecs.spawn((ExternalId(base.clone()), position, Container { capacity: stockpile_work::DEFAULT_GROUND_STACK_CAPACITY }, GroundStock {}, OwnedByParty { party })).id();
        self.ids.insert(base.clone(), entity);
        self.known.insert(base.clone());
        self.contents.entry(base.clone()).or_default();
        self.visible_source_containers.insert(base.clone());
        self.index_ground_stock(&base, entity);
        self.ground_stock_cleanup_pending = true;
        self.refresh_state_weight();
        Ok(base)
    }
    fn prepare_material_output(&self, spec: MaterialOutputSpec) -> Result<PreparedMaterialOutput> {
        self.ensure_ready()?;
        if self.ids.len() >= 16384 { return Err("region entity capacity".into()); }
        let container = self.entity(&spec.container)?;
        if self.ecs.get::<SealedContainer>(container).is_some() {
            return Err("sealed container cannot receive material output".into());
        }
        if self.ecs.get::<GroundStock>(container).is_some() && !self.ground_stock_accepts(&spec.container, &spec.kind) {
            return Err("ground stock material is incompatible".into());
        }
        let capacity = self.ecs.get::<Container>(container).ok_or("not a container")?.capacity;
        let quantity = self.quantity(&spec.container)
            .checked_add(u64::from(crate::supply_allocation::reserved_destination(self, &spec.container, None)))
            .ok_or("material output destination reservation overflow")?;
        let lot = Lot { kind: spec.kind.clone(), quantity: spec.quantity, container: spec.container.clone() };
        let water = spec.water_kg.map(|mass| LotWater { water_kg: mass });
        let owner_party = self.ecs.get::<OwnedByParty>(container).map(|owner| owner.party.clone());
        let added_weight = 128
            + self.registry.weight("hive.lot", &record(&lot))
            + owner_party.as_ref().map(|party| self.registry.weight("hive.owned-by-party", &record(&OwnedByParty { party: party.clone() }))).unwrap_or(0)
            + water.as_ref().map(|value| self.registry.weight("hive.lot-water", &record(value))).unwrap_or(0);
        let mut prepared = material_output::prepare(
            spec,
            self.revision,
            self.next_lot,
            |id| self.known.contains(id),
            capacity,
            quantity,
            self.state_weight,
            added_weight,
            STATE_BYTES,
        )?;
        prepared.owner_party = owner_party;
        Ok(prepared)
    }
    fn prepare_ground_output(&self, position: Position, kind: String, quantity: u32, water_kg: Option<f64>, owner_party: Option<String>) -> Result<PreparedMaterialOutput> {
        self.ensure_ready()?;
        if self.ids.len() + 2 > 16384 { return Err("region entity capacity".into()); }
        material_output::prepare_ground(position, kind, quantity, water_kg, owner_party, self.revision, self.next_lot,
            |id| self.known.contains(id), self.state_weight, STATE_BYTES, &self.registry)
    }
    // Private tokens are prepared and consumed within one synchronous Kernel
    // completion. No public caller can retain them across another mutation.
    fn publish_material_output(&mut self, prepared: PreparedMaterialOutput) -> String {
        if let Some(ground) = prepared.ground {
            let entity = self.ecs.spawn((ExternalId(ground.id.clone()), ground.position, Container { capacity: ground.capacity }, GroundStock {})).id();
            if let Some(party) = ground.owner_party { self.ecs.entity_mut(entity).insert(OwnedByParty { party }); }
            self.ids.insert(ground.id.clone(), entity);
            self.known.insert(ground.id.clone());
            self.visible_source_containers.insert(ground.id.clone());
            self.index_ground_stock(&ground.id, entity);
            self.contents.entry(ground.id).or_default();
        }
        let entity = if let Some(water) = prepared.water {
            self.ecs.spawn((ExternalId(prepared.lot_id.clone()), prepared.lot, water)).id()
        } else {
            self.ecs.spawn((ExternalId(prepared.lot_id.clone()), prepared.lot)).id()
        };
        if let Some(party) = prepared.owner_party { self.ecs.entity_mut(entity).insert(OwnedByParty { party }); }
        self.next_lot = prepared.next_lot;
        self.state_weight = prepared.state_weight;
        self.ids.insert(prepared.lot_id.clone(), entity);
        self.known.insert(prepared.lot_id.clone());
        self.contents.entry(prepared.container).or_default().insert(entity);
        prepared.lot_id
    }
    fn complete_material_output(&mut self, spec: MaterialOutputSpec) -> Result<String> {
        let prepared = self.prepare_material_output(spec)?;
        Ok(self.publish_material_output(prepared))
    }

    // Work/reach and the material definition are admitted by the native work
    // caller. Water credit is always derived from the opaque geometry token.
    #[cfg(test)]
    fn complete_excavation(&mut self, excavation: crate::terrain_water::PreparedExcavation,
        container: String) -> Result<Option<String>> {
        self.complete_excavation_at(excavation, material_output::MaterialOutputLocation::Container(container))
    }
    fn complete_excavation_at(&mut self, excavation: crate::terrain_water::PreparedExcavation,
        location: material_output::MaterialOutputLocation) -> Result<Option<String>> {
        let rule = self.environment.as_ref().ok_or("world has no environment")?
            .excavation_rules.get(&excavation.removed()).ok_or("material has no excavation yield")?;
        let water_kg = (excavation.water_kg() > 0.0).then_some(excavation.water_kg());
        let output = match location {
            material_output::MaterialOutputLocation::Container(container) => self.prepare_material_output(MaterialOutputSpec { container, kind: rule.output_kind.clone(), quantity: rule.units_per_cell, water_kg })?,
            material_output::MaterialOutputLocation::Ground { position, owner_party } => self.prepare_ground_output(position, rule.output_kind.clone(), rule.units_per_cell, water_kg, owner_party)?,
        };
        let environment = self.environment.as_mut().ok_or("world has no environment")?;
        environment.apply_excavation(excavation)?;
        self.cancel_structurally_impossible_construction()?;
        self.bump_placement_revision();
        // All material admission precedes the terrain commit. There is no
        // fallible material operation between this point and publication.
        Ok(Some(self.publish_material_output(output)))
    }
    fn quantity(&self, id: &str) -> u64 {
        self.contents
            .get(id)
            .into_iter()
            .flatten()
            .map(|e| u64::from(self.ecs.get::<Lot>(*e).expect("indexed lot").quantity))
            .sum()
    }
    fn process_bindings_for_lot(&self, lot: &str) -> bool {
        self.bound_process_lots.contains(lot)
    }
    fn cleanup_empty_ground_stock(&mut self) {
        if !self.ground_stock_cleanup_pending { return; }
        self.ground_stock_cleanup_pending = false;
        let candidates: BTreeSet<String> = self.contents.keys().filter_map(|id| {
            let entity = self.ids.get(id)?;
            (self.ecs.get::<GroundStock>(*entity).is_some()
                && self.contents.get(id).is_some_and(BTreeSet::is_empty)).then_some(id.clone())
        }).collect();
        if candidates.is_empty() { return; }
        let mut referenced = BTreeSet::new();
        for entity in self.ids.values() {
            for (name, schema) in &self.registry.schemas {
                let Some(value) = self.registry.read(&self.ecs, *entity, name) else { continue; };
                for (field, kind) in &schema.fields {
                    if matches!(kind, crate::components::FieldType::Entity | crate::components::FieldType::NullableEntity)
                        && value.get(field).and_then(|item| item.as_str()).is_some_and(|target| candidates.contains(target)) {
                        referenced.insert(value.get(field).and_then(|item| item.as_str()).unwrap().to_owned());
                    }
                }
            }
        }
        for id in candidates.difference(&referenced) {
            let entity = self.ids.remove(id).expect("ground stock candidate");
            self.known.remove(id);
            self.visible_source_containers.remove(id);
            self.contents.remove(id);
            self.unindex_ground_stock(id, entity);
            self.ecs.despawn(entity);
        }
        self.refresh_state_weight();
    }
    fn contact(&self, a: Entity, b: Entity) -> Result<()> {
        let a = self.contact_pose(a)?;
        let b = self.world_pose_entity(b, 0)?;
        if !interaction_contact::within_transfer_reach([a.x, a.y, a.z], [b.x, b.y, b.z]) {
            return Err("out of reach".into());
        }
        if !self.physical_contact_clear(a, b)? { return Err("sealed structure boundary".into()); }
        Ok(())
    }
    fn physical_contact_clear(&self, a: Position, b: Position) -> Result<bool> {
        // Generic material operations are valid in detached/flat-world
        // kernels. Structure-boundary blocking is an additional terrain rule;
        // without an environment there is no boundary projection to query.
        let Some(environment) = self.environment.as_ref() else { return Ok(true); };
        let spacing = environment.world.cell_spacing_m();
        let to_cell = |position: Position| -> Result<crate::generation::Cell> {
            let raw = [position.x / spacing[0], position.y / spacing[1] - 0.5, position.z / spacing[2]];
            if raw.iter().any(|value| !value.is_finite()) { return Err("contact position is not finite".into()); }
            Ok(crate::generation::Cell { x: raw[0].round() as i64, y: raw[1].round() as i32, z: raw[2].round() as i64 })
        };
        let from = to_cell(a)?;
        let to = to_cell(b)?;
        let projection = self.environment.as_ref().unwrap().world.structure_projection_snapshot();
        Ok(!projection.blocks_direct_decomposition(from, to).unwrap_or(true))
    }
    /// Portable containers have no independent pose. Their lot's container is
    /// the authoritative holder and therefore the contact point for interior
    /// transfers (for example, water from a held pail to a worker).
    fn contact_pose(&self, entity: Entity) -> Result<Position> {
        let mut current = entity;
        let mut seen = Vec::new();
        for _ in 0..=16 {
            match self.world_pose_entity(current, 0) {
                Ok(position) => return Ok(position),
                Err(reason) if reason == "no position" => {
                    if seen.contains(&current) {
                        return Err("container custody cycle".into());
                    }
                    seen.push(current);
                    if self.ecs.get::<Container>(current).is_none() {
                        return Err("no position".into());
                    }
                    let lot = self.ecs.get::<Lot>(current).ok_or("no position")?;
                    current = self.entity(&lot.container)?;
                }
                Err(reason) => return Err(reason),
            }
        }
        Err("container custody chain exceeds depth 16".into())
    }
    fn contact_frame(&self, entity: Entity) -> Result<Option<String>> {
        let mut current = entity;
        let mut seen = Vec::new();
        for _ in 0..=16 {
            if self.ecs.get::<Position>(current).is_some() {
                return Ok(self.support_id(current));
            }
            if seen.contains(&current) { return Err("container custody cycle".into()); }
            seen.push(current);
            if self.ecs.get::<Container>(current).is_none() { return Err("no position".into()); }
            let lot = self.ecs.get::<Lot>(current).ok_or("no position")?;
            current = self.entity(&lot.container)?;
        }
        Err("container custody chain exceeds depth 16".into())
    }

    fn exchange_field_water(&mut self, worker_id: &str, vessel_id: &str, at: crate::generation::Cell,
        direction: WaterExchangeDirection, portions: u8) -> Result<Option<String>> {
        self.exchange_field_water_as(worker_id, vessel_id, at, direction, portions, "water")
    }
    fn exchange_field_water_as(&mut self, worker_id: &str, vessel_id: &str, at: crate::generation::Cell,
        direction: WaterExchangeDirection, portions: u8, material_kind: &str) -> Result<Option<String>> {
        if !valid_id(material_kind) { return Err("invalid field water material".into()); }
        let worker = self.entity(worker_id)?;
        let vessel = self.entity(vessel_id)?;
        let worker_pose = self.world_pose_entity(worker, 0)?;
        self.ecs.get::<Body>(worker).ok_or("water exchange requires worker body")?;
        self.ecs.get::<Container>(worker).ok_or("water exchange requires worker container")?;
        if self.ecs.get::<SealedContainer>(worker).is_some() {
            return Err("water exchange requires unsealed worker container".into());
        }
        let vessel_lot = self.ecs.get::<Lot>(vessel).cloned().ok_or("water vessel is not a lot")?;
        if vessel_lot.quantity == 0 || vessel_lot.container != worker_id {
            return Err("water exchange requires a held vessel lot".into());
        }
        if !self.ecs.get::<VesselCapability>(vessel).is_some_and(|capability| capability.accepts_water) {
            return Err("water exchange requires a vessel that accepts water".into());
        }
        self.ecs.get::<Container>(vessel).ok_or("water vessel is not a container")?;
        if self.ecs.get::<SealedContainer>(vessel).is_some() {
            return Err("sealed water vessel".into());
        }
        let environment = self.environment.as_ref().ok_or("water exchange requires terrain")?;
        let spacing = environment.world.cell_spacing_m();
        let target = Position { x: at.x as f64 * spacing[0], y: (f64::from(at.y) + 0.5) * spacing[1], z: at.z as f64 * spacing[2], facing: 0.0 };
        let contact_distance = navigation::distance(navigation::point(worker_pose), navigation::point(target));
        if contact_distance < 1e-9 || contact_distance > 1.5 {
            return Err("water exchange requires adjacent dry contact".into());
        }
        let (field_token, material_token, output_lot) = match direction {
            WaterExchangeDirection::Withdraw => {
                let field = {
                    let environment = self.environment.as_mut().ok_or("water exchange requires terrain")?;
                    environment.world.prepare_water_exchange(at, crate::terrain_water::WaterExchangeDirection::Withdraw, portions)?
                };
                // Bind the exact physical mass only after the field admission has succeeded.
                let mass = field.receipt().mass_kg;
                let material = self.prepare_material_output(MaterialOutputSpec { container: vessel_id.into(), kind: material_kind.into(), quantity: u32::from(portions), water_kg: Some(mass) })?;
                let lot = material.lot_id.clone();
                (field, PreparedWaterMaterial::Output(material), Some(lot))
            }
            WaterExchangeDirection::Deposit => {
                let mut selected = Vec::new();
                let mut remaining = u32::from(portions);
                let entities = self.contents.get(vessel_id).cloned().unwrap_or_default();
                for entity in entities {
                    if remaining == 0 { break; }
                    let Some(lot) = self.ecs.get::<Lot>(entity) else { continue; };
                    if lot.kind != material_kind || lot.quantity == 0 { continue; }
                    let take = remaining.min(lot.quantity);
                    let lot_id = self.ecs.get::<ExternalId>(entity).ok_or("water lot identity is missing")?.0.clone();
                    selected.push(MaterialPortion { lot: lot_id, quantity: take });
                    remaining -= take;
                }
                if remaining != 0 { return Err("water vessel lacks requested water portions".into()); }
                let material = self.prepare_material_consumption(&selected)?;
                let field = {
                    let environment = self.environment.as_mut().ok_or("water exchange requires terrain")?;
                    environment.world.prepare_water_exchange(at, crate::terrain_water::WaterExchangeDirection::Deposit, portions)?
                };
                if (material.water_kg() - field.receipt().mass_kg).abs() > 1e-9 * field.receipt().mass_kg.max(1.0) {
                    return Err("water lot mass does not match field portion mass".into());
                }
                (field, PreparedWaterMaterial::Consumption(material), None)
            }
        };
        let environment = self.environment.as_mut().ok_or("water exchange requires terrain")?;
        environment.world.apply_water_exchange(field_token)?;
        match material_token {
            PreparedWaterMaterial::Output(material) => { self.publish_material_output(material); }
            PreparedWaterMaterial::Consumption(material) => { self.publish_material_consumption(material)?; }
        }
        Ok(output_lot)
    }
    fn extract_resource(&mut self, worker_id: &str, source_id: &str) -> Result<String> {
        let worker = self.entity(worker_id)?;
        let source = self.entity(source_id)?;
        self.contact(worker, source)?;
        if self.ecs.get::<Body>(worker).is_none() { return Err("resource extraction requires a worker body".into()); }
        let resource = self.ecs.get::<FiniteResource>(source).cloned().ok_or("not a finite resource")?;
        if resource.quantity == 0 { return Err("finite resource is exhausted".into()); }
        let position = *self.ecs.get::<Position>(source).ok_or("finite resource has no physical position")?;
        let owner_party = self.ecs.get::<OwnedByParty>(worker).map(|owner| owner.party.clone());
        let prepared = self.prepare_ground_output(position, resource.kind, resource.quantity, None, owner_party)?;
        self.ecs.entity_mut(source).insert(FiniteResource { kind: prepared.lot.kind.clone(), quantity: 0 });
        Ok(self.publish_material_output(prepared))
    }

    fn establish_resource_site(&mut self, _operation: &str, worker_id: &str, site_id: &str, definition_id: &str, x: i32, y: i32, z: i32) -> Result<String> {
        let worker = self.entity(worker_id)?;
        if self.ecs.get::<Body>(worker).is_none() { return Err("resource sowing requires a worker body".into()); }
        if !valid_id(site_id) || !valid_id(definition_id) { return Err("resource site identity is unavailable".into()); }
        let (definition, spacing, surface) = {
            let environment = self.environment.as_mut().ok_or("resource sowing requires terrain")?;
            let definition = environment.resources.get(definition_id).ok_or("unknown resource definition")?.clone();
            let surface = environment.world.surface_cells(&[(i64::from(x), i64::from(z))])?.into_iter().next().flatten().ok_or("resource site requires an empty supported surface")?;
            (definition, environment.world.cell_spacing_m(), surface)
        };
        if surface.cell.y != y { return Err("resource site must be on the generated surface".into()); }
        let expected = Point { x: f64::from(x) * spacing[0], y: (f64::from(y) + 0.5) * spacing[1], z: f64::from(z) * spacing[2], frame: None };
        let pose = self.world_pose_entity(worker, 0)?;
        let same_height = (pose.y - expected.y).abs() < spacing[1] * 0.1;
        let cardinal_contact = ((pose.x - (expected.x + spacing[0])).abs() < 1e-6 && (pose.z - expected.z).abs() < 1e-6)
            || ((pose.x - (expected.x - spacing[0])).abs() < 1e-6 && (pose.z - expected.z).abs() < 1e-6)
            || ((pose.x - expected.x).abs() < 1e-6 && (pose.z - (expected.z + spacing[2])).abs() < 1e-6)
            || ((pose.x - expected.x).abs() < 1e-6 && (pose.z - (expected.z - spacing[2])).abs() < 1e-6);
        if !same_height || !cardinal_contact { return Err("worker is not in resource site contact".into()); }
        if self.ids.iter().any(|(id, existing)| id != site_id && self.ecs.get::<ResourceSite>(*existing).is_some_and(|_| self.ecs.get::<Position>(*existing).is_some_and(|position| (position.x - expected.x).abs() < spacing[0] * 0.5 && (position.y - expected.y).abs() < spacing[1] * 0.5 && (position.z - expected.z).abs() < spacing[2] * 0.5))) { return Err("resource site cell is already occupied".into()); }
        if self.environment.as_mut().ok_or("resource sowing requires terrain")?.world.structure_surfaces(&[(i64::from(x), i64::from(z))])?.into_iter().flatten().any(|cell| cell.x == i64::from(x) && cell.y == y && cell.z == i64::from(z)) { return Err("resource site cell is occupied by a structure".into()); }
        let entity = if let Some(entity) = self.ids.get(site_id).copied() {
            if self.ecs.get::<ResourceSite>(entity).is_some() { return Err("resource site identity is already established".into()); }
            entity
        } else {
            let entity = self.ecs.spawn(ExternalId(site_id.to_owned())).id();
            self.ids.insert(site_id.to_owned(), entity); self.known.insert(site_id.to_owned()); self.contents.insert(site_id.to_owned(), BTreeSet::new()); entity
        };
        self.ecs.entity_mut(entity).insert((Position { x: expected.x, y: expected.y, z: expected.z, facing: 0.0 }, FiniteResource { kind: definition.output_kind, quantity: 0 }, ResourceSite { definition: definition.id, stage: 0, next_due: self.time + definition.stages[0].delay_seconds }));
        self.refresh_state_weight();
        Ok(site_id.to_owned())
    }

    fn tend_resource_site(&mut self, _operation: &str, worker_id: &str, site_id: &str, vessel_id: &str) -> Result<()> {
        let worker = self.entity(worker_id)?; let site = self.entity(site_id)?;
        self.entity(vessel_id)?;
        self.ecs.get::<Body>(worker).ok_or("resource tending requires a worker body")?;
        let state = self.ecs.get::<ResourceSite>(site).cloned().ok_or("not a resource site")?;
        let definition = self.environment.as_ref().ok_or("resource tending requires terrain")?.resources.get(&state.definition).ok_or("unknown resource definition")?.clone();
        let index = usize::from(state.stage);
        if index >= definition.stages.len() { return Err("resource site is ready for harvest".into()); }
        if self.time < state.next_due { return Err("resource growth stage is not due".into()); }
        let portions = definition.stages[index].water_portions;
        let position = *self.ecs.get::<Position>(site).ok_or("resource site has no position")?;
        // exchange_field_water performs the full held-lot/soil mass conservation check.
        let spacing = self.environment.as_ref().ok_or("resource tending requires terrain")?.world.cell_spacing_m();
        self.exchange_field_water_as(worker_id, vessel_id, crate::generation::Cell { x: (position.x / spacing[0]).round() as i64, y: (position.y / spacing[1]).floor() as i32, z: (position.z / spacing[2]).round() as i64 }, WaterExchangeDirection::Deposit, portions, &definition.water_kind)?;
        let next_stage = state.stage.checked_add(1).ok_or("resource stage overflow")?;
        let next_due = self.time + definition.stages[index].delay_seconds;
        self.ecs.entity_mut(site).insert(ResourceSite { definition: state.definition, stage: next_stage, next_due });
        if usize::from(next_stage) == definition.stages.len() { self.ecs.entity_mut(site).insert(FiniteResource { kind: definition.output_kind, quantity: definition.output_quantity }); }
        self.refresh_state_weight();
        Ok(())
    }

    fn designate_stockpile(&mut self, party: String, zone: String, cells: Vec<StockpileDesignation>, scope: &ActionScope) -> Result<String> {
        let execution = self.work_execution_for_scope(scope, &party, crate::work_planner::POLICY_STOCKPILE)?;
        if !valid_id(&party) || !valid_id(&zone) || cells.is_empty() || cells.len() > 256 { return Err("invalid stockpile designation".into()); }
        let party_entity = self.entity(&party)?;
        if self.ecs.get::<Party>(party_entity).is_none() { return Err("stockpile party is not a party".into()); }
        if cells.iter().any(|cell| self.stockpile_profiles.get(&cell.filter_profile).is_none()) { return Err("stockpile cell references unknown profile".into()); }
        let environment = self.environment.as_mut().ok_or("stockpile designation requires generated terrain")?;
        let spacing = environment.world.cell_spacing_m();
        let mut seen = BTreeSet::new();
        let mut prepared = Vec::with_capacity(cells.len());
        for cell in cells {
            if !valid_id(&cell.filter_profile) || !seen.insert((cell.x, cell.y, cell.z)) { return Err("invalid or duplicate stockpile cell".into()); }
            let generated = environment.world.surface_cells(&[(i64::from(cell.x), i64::from(cell.z))])?.into_iter().next().flatten();
            let generated_ok = generated.is_some_and(|surface| surface.cell.y == cell.y);
            let structural_ok = !generated_ok && environment.world.structure_surfaces(&[(i64::from(cell.x), i64::from(cell.z))])?.into_iter().flatten().any(|surface| surface.x == i64::from(cell.x) && surface.y == cell.y && surface.z == i64::from(cell.z));
            if !generated_ok && !structural_ok { return Err("stockpile cell is not an authoritative walkable surface".into()); }
            let id = format!("stockpile.{}:{}.{x}.{y}.{z}", zone.len(), zone, x=cell.x, y=cell.y, z=cell.z);
            if !valid_id(&id) { return Err("stockpile identity exceeds bound".into()); }
            for other in self.ids.values() { if let Some(pos) = self.ecs.get::<Position>(*other) { if (pos.x - f64::from(cell.x)*spacing[0]).abs() < 1e-9 && (pos.y - (f64::from(cell.y)+0.5)*spacing[1]).abs() < 1e-9 && (pos.z - f64::from(cell.z)*spacing[2]).abs() < 1e-9 && self.ecs.get::<StockpileCell>(*other).is_some_and(|p| p.zone != zone) { return Err("stockpile cell claimed by another zone".into()); } } }
            prepared.push((id, cell));
        }
        for (id, cell) in &prepared {
            if let Some(entity) = self.ids.get(id).copied() {
                if self.ecs.get::<StockpileCell>(entity).is_some_and(|old| old.zone != zone) { return Err("stockpile identity belongs to another zone".into()); }
                if self.ecs.get::<OwnedByParty>(entity).map(|owner| owner.party.as_str()) != Some(party.as_str()) { return Err("stockpile cell belongs to another party".into()); }
            }
            let position = Position { x: f64::from(cell.x)*spacing[0], y: (f64::from(cell.y)+0.5)*spacing[1], z: f64::from(cell.z)*spacing[2], facing: 0.0 };
            let policy = StockpileCell { zone: zone.clone(), priority: cell.priority, filter_profile: cell.filter_profile.clone() };
            let owner = OwnedByParty { party: party.clone() };
            let entity = if let Some(entity) = self.ids.get(id).copied() {
                self.ecs.entity_mut(entity).insert((position, policy, owner, execution.clone()));
                entity
            } else {
                let entity = self.ecs.spawn((ExternalId(id.clone()), position, policy, owner, execution.clone())).id();
                self.ids.insert(id.clone(), entity); self.known.insert(id.clone());
                entity
            };
            self.index_stockpile_policy(id, entity);
            stockpile_work::install_planner_state(self, &id, entity, Some(execution.clone()))?;
        }
        self.refresh_state_weight();
        Ok(prepared[0].0.clone())
    }

    fn update_stockpile(&mut self, party: String, zone: String, filter_profile: String, priority: u32) -> Result<String> {
        if !valid_id(&party) || !valid_id(&zone) || !valid_id(&filter_profile) || priority == 0 || priority > 100 { return Err("invalid stockpile policy".into()); }
        if self.stockpile_profiles.get(&filter_profile).is_none() { return Err("stockpile policy references unknown profile".into()); }
        let entities: Vec<_> = self.ids.values().copied().filter(|entity| self.ecs.get::<StockpileCell>(*entity).is_some_and(|cell| cell.zone == zone)).collect();
        if entities.is_empty() { return Err("stockpile zone does not exist".into()); }
        if entities.iter().any(|entity| self.ecs.get::<OwnedByParty>(*entity).map(|owner| owner.party.as_str()) != Some(party.as_str())) { return Err("stockpile zone belongs to another party".into()); }
        stockpile_work::cancel_unpicked_for_zone(self, &zone)?;
        for entity in entities {
            let mut policy = self.ecs.get::<StockpileCell>(entity).cloned().ok_or("stockpile zone disappeared")?;
            policy.filter_profile = filter_profile.clone();
            policy.priority = priority;
            let schedule = self.ecs.get::<crate::work_planner::WorkSchedule>(entity).cloned().map(|schedule| crate::work_planner::WorkSchedule { next_review_tick: self.revision, ..schedule });
            self.ecs.entity_mut(entity).insert(policy);
            if let Some(schedule) = schedule { self.ecs.entity_mut(entity).insert(schedule); }
            let id = self.external_id(entity)?;
            stockpile_work::install_planner_state(self, &id, entity, None)?;
        }
        self.refresh_state_weight();
        Ok(zone)
    }

    fn stockpile_clear_ids(&self, party: &str, zone: &str, cells: &[StockpileCellCoordinate]) -> Result<BTreeSet<String>> {
        if !valid_id(party) || !valid_id(zone) || cells.is_empty() || cells.len() > 256 { return Err("invalid stockpile clear".into()); }
        let spacing = self.environment.as_ref().ok_or("stockpile clear requires generated terrain")?.world.cell_spacing_m();
        let mut policy_ids = BTreeSet::new();
        for cell in cells {
            let position = Position { x: f64::from(cell.x) * spacing[0], y: (f64::from(cell.y) + 0.5) * spacing[1], z: f64::from(cell.z) * spacing[2], facing: 0.0 };
            let Some(id) = self.stockpile_policy_candidates_at(&position).find_map(|(id, policy)| (policy.zone == zone).then_some(id)) else { return Err("stockpile clear cell is not in the requested zone".into()); };
            let entity = self.entity(&id)?;
            if self.ecs.get::<OwnedByParty>(entity).map(|owner| owner.party.as_str()) != Some(party) { return Err("stockpile cell belongs to another party".into()); }
            if !policy_ids.insert(id) { return Err("duplicate stockpile clear cell".into()); }
        }
        Ok(policy_ids)
    }

    fn clear_stockpile(&mut self, party: String, zone: String, cells: Vec<StockpileCellCoordinate>) -> Result<String> {
        if !valid_id(&party) || !valid_id(&zone) { return Err("invalid stockpile clear".into()); }
        let party_entity = self.entity(&party)?;
        if self.ecs.get::<Party>(party_entity).is_none() { return Err("stockpile party is not a party".into()); }
        let policy_ids = self.stockpile_clear_ids(&party, &zone, &cells)?;
        stockpile_work::cancel_unpicked_for_cells(self, &policy_ids)?;
        for id in policy_ids {
            let entity = self.entity(&id)?;
            let id = self.external_id(entity)?;
            // Clear only policy/schedule/index state. Ground stacks, providers,
            // and lots remain ordinary physical entities at their positions.
            self.unindex_stockpile_policy(&id, entity);
            self.ids.remove(&id);
            self.known.remove(&id);
            self.contents.remove(&id);
            self.planner_indexes.refresh_entity(&self.relations, &self.ecs, &id, None);
            self.ecs.despawn(entity);
        }
        self.refresh_state_weight();
        Ok(zone)
    }

    fn request_process(&mut self, definition_id: &str, station_id: &str, scope: &ActionScope) -> Result<String> {
        if !crate::components::valid_id(definition_id) || !crate::components::valid_id(station_id) {
            return Err("invalid process request identity".into());
        }
        let environment = self.environment.as_ref().ok_or("process request needs environment")?;
        let definition = environment.processes.get(definition_id).ok_or("unknown process definition")?.definition().clone();
        let station = self.entity(station_id)?;
        let site = self.ecs.get::<ConstructionSite>(station).ok_or("process station is not a construction site")?;
        if site.phase != ConstructionPhase::Finished || site.catalog != definition.station_catalog {
            return Err("process station is not a completed matching catalog".into());
        }
        if self.ecs.get::<SealedContainer>(station).is_none() {
            return Err("process station is not sealed".into());
        }
        if self.ids.values().any(|entity| self.ecs.get::<StagedProcess>(*entity).is_some_and(|process| process.station == station_id && process.phase != ProcessPhase::Complete && process.definition != definition_id)) {
            return Err("process station already has an active process".into());
        }
        for input in &definition.inputs {
            let port_id = format!("{station_id}:{}", input.port);
            let port = self.entity(&port_id)?;
            if self.ecs.get::<Container>(port).is_none() {
                return Err("process station port is missing container capability".into());
            }
        }
        let process_id = format!("process:{station_id}:{definition_id}");
        let owner = match scope {
            ActionScope::Player { player } => {
                let party = self.ecs.get::<OwnedByParty>(station).map(|value| value.party.clone()).ok_or("process station has no work pool")?;
                if self.ownership.player(&party) != Some(player.as_str()) { return Err("process station is outside player access".into()); }
                Some(party)
            }
            ActionScope::Host => None,
        };
        let execution = owner.as_deref().map(|party| self.work_execution_for_scope(scope, party, crate::work_planner::POLICY_PROCESS)).transpose()?;
        if !crate::components::valid_id(&process_id) || self.ids.len() >= 16_384 {
            return Err("process identity or state capacity exceeded".into());
        }
        if let Some(existing) = self.ids.get(&process_id).copied() {
            if self.ecs.get::<StagedProcess>(existing).is_some_and(|process| process.phase != ProcessPhase::Complete) {
                if let Some(party) = owner.as_deref() && self.ecs.get::<OwnedByParty>(existing).map(|value| value.party.as_str()) != Some(party) { return Err("process ownership mismatch on replay".into()); }
                return Ok(process_id);
            }
            self.remove_process_bindings(&process_id)?;
            self.ecs.entity_mut(existing).insert(StagedProcess {
                version: crate::staged_process::CURRENT_VERSION,
                definition: definition.id.clone(),
                definition_version: definition.version,
                station: station_id.into(),
                stage_index: 0,
                progress_seconds: 0.0,
                entered_tick: self.revision,
                phase: ProcessPhase::Waiting,
                blocked_reason: String::new(),
            });
            if let Some(party) = owner.clone() {
                self.ecs.entity_mut(existing).insert(OwnedByParty { party: party.clone() });
                self.ecs.entity_mut(existing).insert(crate::work_planner::WorkPolicy { pool: party, priority: 0, enabled: true });
                self.ecs.entity_mut(existing).insert(execution.clone().ok_or("process execution missing")?);
                self.ecs.entity_mut(existing).insert(crate::work_planner::WorkSchedule { next_review_tick: self.revision, last_considered: self.revision });
            }
            self.refresh_planner_index(&process_id);
            self.refresh_state_weight();
            return Ok(process_id);
        }
        let entity = self.ecs.spawn((ExternalId(process_id.clone()), StagedProcess {
            version: crate::staged_process::CURRENT_VERSION,
            definition: definition.id.clone(), definition_version: definition.version,
            station: station_id.into(), stage_index: 0, progress_seconds: 0.0,
            entered_tick: self.revision, phase: ProcessPhase::Waiting, blocked_reason: String::new(),
        })).id();
        if let Some(party) = owner {
            self.ecs.entity_mut(entity).insert(OwnedByParty { party: party.clone() });
            self.ecs.entity_mut(entity).insert(crate::work_planner::WorkPolicy { pool: party, priority: 0, enabled: true });
            self.ecs.entity_mut(entity).insert(execution.ok_or("process execution missing")?);
            self.ecs.entity_mut(entity).insert(crate::work_planner::WorkSchedule { next_review_tick: self.revision, last_considered: self.revision });
        }
        self.ids.insert(process_id.clone(), entity);
        self.known.insert(process_id.clone());
        self.refresh_planner_index(&process_id);
        self.refresh_state_weight();
        Ok(process_id)
    }

    fn prepare_process_bindings(&self, process_id: &str, definition_id: &str, station_id: &str) -> Result<PreparedProcessBindings> {
        if !crate::components::valid_id(process_id) || !crate::components::valid_id(definition_id) || !crate::components::valid_id(station_id) {
            return Err("invalid process admission identity".into());
        }
        let process_entity = self.entity(process_id)?;
        let process = self.ecs.get::<StagedProcess>(process_entity).ok_or("process is missing staged state")?.clone();
        if process.definition != definition_id || process.station != station_id { return Err("process admission identity mismatch".into()); }
        if process.phase != ProcessPhase::Waiting { return Err("process is not waiting for material admission".into()); }
        let environment = self.environment.as_ref().ok_or("process admission needs environment")?;
        let definition = environment.processes.get(definition_id).ok_or("unknown process definition")?.definition().clone();
        let station = self.entity(station_id)?;
        let site = self.ecs.get::<ConstructionSite>(station).ok_or("process station is not a construction site")?;
        if site.phase != ConstructionPhase::Finished || site.catalog != definition.station_catalog || self.ecs.get::<SealedContainer>(station).is_none() {
            return Err("process station is not a completed sealed matching catalog".into());
        }
        let existing: Vec<_> = self.ids.values().filter_map(|entity| self.ecs.get::<crate::staged_process::ProcessBinding>(*entity).filter(|binding| binding.process == process_id).cloned()).collect();
        if !existing.is_empty() {
            crate::staged_process::validate_bindings(&definition, process_id, station_id, &existing, &|lot_id| self.ids.get(lot_id).and_then(|entity| self.ecs.get::<Lot>(*entity).cloned()))?;
            return Ok(PreparedProcessBindings::Ready(existing));
        }
        let occupied: BTreeSet<String> = self.ids.values().filter_map(|entity| {
            self.ecs.get::<crate::staged_process::ProcessBinding>(*entity)
                .map(|binding| binding.lot.clone())
                .or_else(|| self.ecs.get::<SupplyAllocation>(*entity).map(|allocation| allocation.portion.clone()))
        }).collect();
        let mut lots = BTreeMap::new();
        for (id, entity) in &self.ids {
            let Some(lot) = self.ecs.get::<Lot>(*entity) else { continue; };
            if !occupied.contains(id) { lots.insert(id.clone(), lot.clone()); }
        }
        match crate::staged_process::resolve_bindings_if_ready(&definition, process_id, station_id, &lots)? {
            crate::staged_process::BindingResolution::Waiting => Ok(PreparedProcessBindings::Waiting),
            crate::staged_process::BindingResolution::Ready(bindings) => Ok(PreparedProcessBindings::Ready(bindings)),
        }
    }

    fn publish_process_bindings(&mut self, process_id: &str, bindings: Vec<crate::staged_process::ProcessBinding>) -> Result<String> {
        if !self.process_bindings(process_id).is_empty() {
            return Ok(process_id.into());
        }
        let prepared = bindings.into_iter().map(|binding| (crate::staged_process::binding_id(&binding), binding)).collect::<Vec<_>>();
        let mut ids = BTreeSet::new();
        if prepared.iter().any(|(id, _)| !ids.insert(id.clone()) || self.ids.contains_key(id)) {
            return Err("process binding identity collision".into());
        }
        let added_weight: usize = prepared.iter().map(|(id, binding)| id.len().saturating_add(128).saturating_add(self.registry.weight("hive.process-binding", &record(binding)))).sum();
        if self.ids.len().saturating_add(prepared.len()) > 16_384 || self.state_weight.saturating_add(added_weight) > STATE_BYTES { return Err("process binding state capacity".into()); }
        for (id, binding) in prepared {
            let entity = self.ecs.spawn((ExternalId(id.clone()), binding)).id();
            self.ids.insert(id.clone(), entity);
            self.known.insert(id);
            self.bound_process_lots.insert(self.ecs.get::<crate::staged_process::ProcessBinding>(entity).unwrap().lot.clone());
        }
        self.refresh_state_weight();
        Ok(process_id.into())
    }

    pub(crate) fn try_admit_process(&mut self, process_id: &str, definition_id: &str, station_id: &str) -> Result<bool> {
        let process_entity = self.entity(process_id)?;
        if self.ecs.get::<StagedProcess>(process_entity).is_none_or(|process| process.phase != ProcessPhase::Waiting) {
            return Ok(false);
        }
        let station = self.entity(station_id)?;
        let Some(site) = self.ecs.get::<ConstructionSite>(station) else { return Ok(false); };
        let Some(definition) = self.environment.as_ref().and_then(|environment| environment.processes.get(definition_id)).map(|definition| definition.definition()) else { return Err("unknown process definition".into()); };
        if site.phase != ConstructionPhase::Finished || site.catalog != definition.station_catalog || self.ecs.get::<SealedContainer>(station).is_none() {
            return Ok(false);
        }
        match self.prepare_process_bindings(process_id, definition_id, station_id)? {
            PreparedProcessBindings::Waiting => Ok(false),
            PreparedProcessBindings::Ready(bindings) => { self.publish_process_bindings(process_id, bindings)?; Ok(true) }
        }
    }

    fn admit_process(&mut self, process_id: &str, definition_id: &str, station_id: &str) -> Result<String> {
        match self.prepare_process_bindings(process_id, definition_id, station_id)? {
            PreparedProcessBindings::Waiting => Err("process inputs are missing".into()),
            PreparedProcessBindings::Ready(bindings) => self.publish_process_bindings(process_id, bindings),
        }
    }

    fn process_bindings(&self, process: &str) -> Vec<crate::staged_process::ProcessBinding> {
        self.ids.values().filter_map(|entity| self.ecs.get::<crate::staged_process::ProcessBinding>(*entity)
            .filter(|binding| binding.process == process).cloned()).collect()
    }
    fn remove_process_bindings(&mut self, process: &str) -> Result<()> {
        let ids: Vec<String> = self.ids.iter().filter_map(|(id, entity)| self.ecs.get::<crate::staged_process::ProcessBinding>(*entity).filter(|binding| binding.process == process).map(|_| id.clone())).collect();
        for id in ids { let entity = self.ids.remove(&id).ok_or("process binding disappeared")?; self.known.remove(&id); self.ecs.despawn(entity); }
        self.bound_process_lots = self.ids.values().filter_map(|entity| self.ecs.get::<crate::staged_process::ProcessBinding>(*entity).map(|binding| binding.lot.clone())).collect();
        self.refresh_state_weight(); Ok(())
    }

    fn attend_process(&mut self, worker_id: &str, process_id: &str, contact: &Point, delta: f64) -> Result<()> {
        if !delta.is_finite() || delta < 0.0 { return Err("invalid process attendance delta".into()); }
        let worker = self.entity(worker_id)?;
        let process_entity = self.entity(process_id)?;
        let mut state = self.ecs.get::<StagedProcess>(process_entity).cloned().ok_or("process is missing staged state")?;
        if state.phase == ProcessPhase::Complete { return Err("process is complete".into()); }
        let definition = self.environment.as_ref().ok_or("process attendance needs environment")?.processes.get(&state.definition).ok_or("unknown process definition")?.definition().clone();
        let stage = definition.stages.get(state.stage_index as usize).ok_or("process stage is missing")?;
        if stage.mode != crate::staged_process::StageMode::Attended { return Err("process stage is elapsed".into()); }
        if self.process_bindings(process_id).is_empty() { return Err("process has not been admitted".into()); }
        if self.ecs.get::<Body>(worker).is_none() || self.ecs.get::<Container>(worker).is_none() || self.ecs.get::<Traversal>(worker).is_none() || self.ecs.get::<Support>(worker).is_some() || self.direct.contains_key(&worker) || self.ecs.get::<Destination>(worker).is_some() || self.ecs.get::<ExcavationWork>(worker).is_some() { return Err("worker cannot attend process from current state".into()); }
        if let Some(existing) = self.attempts_by_worker.get(worker_id) && existing.task != process_id { return Err("worker already attends process".into()); }
        self.process_worker_at_contact(worker, process_id, contact)?;
        state.phase = ProcessPhase::Working; state.blocked_reason.clear();
        if delta == 0.0 {
            self.ecs.entity_mut(process_entity).insert(state);
            self.refresh_state_weight();
            return Ok(());
        }
        state.progress_seconds = crate::world::earned_work_seconds(state.progress_seconds, delta, stage.duration_seconds)?;
        self.finish_process_stage(process_id, state, &definition)
    }

    fn finish_process_stage(&mut self, process_id: &str, mut state: StagedProcess, definition: &crate::staged_process::ProcessDefinition) -> Result<()> {
        let stage = definition.stages.get(state.stage_index as usize).ok_or("process stage is missing")?;
        if state.progress_seconds < stage.duration_seconds { self.ecs.entity_mut(self.entity(process_id)?).insert(state); return Ok(()); }
        let transition = &stage.transition;
        if let Err(reason) = self.execute_process_transition(process_id, transition) {
            state.phase = ProcessPhase::Blocked; state.blocked_reason = crate::staged_process::transition_block_reason(&reason).into();
            self.ecs.entity_mut(self.entity(process_id)?).insert(state); self.refresh_state_weight(); return Ok(());
        }
        if usize::from(state.stage_index + 1) >= definition.stages.len() {
            self.remove_process_bindings(process_id)?;
            state.phase = ProcessPhase::Complete;
            let process_entity = self.entity(process_id)?;
            if let Some(policy) = self.ecs.get::<crate::work_planner::WorkPolicy>(process_entity).cloned() {
                self.ecs.entity_mut(process_entity).insert(crate::work_planner::WorkPolicy { enabled: false, ..policy });
            }
        } else { state.stage_index += 1; state.progress_seconds = 0.0; state.entered_tick = self.revision; state.phase = ProcessPhase::Waiting; }
        self.ecs.entity_mut(self.entity(process_id)?).insert(state);
        self.refresh_planner_index(process_id);
        self.refresh_state_weight();
        Ok(())
    }



    fn advance_staged_processes(&mut self, delta: f64) -> Result<()> {
        if delta == 0.0 { return Ok(()); }
        let ids: Vec<String> = self.ids.iter().filter_map(|(id, entity)| self.ecs.get::<StagedProcess>(*entity).map(|_| id.clone())).collect();
        let mut changed = false;
        for id in ids {
            let entity = self.entity(&id)?; let Some(mut state) = self.ecs.get::<StagedProcess>(entity).cloned() else { continue; };
            if state.phase == ProcessPhase::Complete { continue; }
            if state.phase == ProcessPhase::Working {
                let valid = self.work_attempts.get(&id).and_then(|attempt_entity| self.ecs.get::<WorkAttempt>(*attempt_entity)).is_some_and(|attempt| matches!(&attempt.phase, AttemptPhase::Executing { activity: crate::work_attempt::ActivityRef::ProcessAttendance { process, .. }, .. } if process == &id));
                if !valid { return Err("working process has no executing attendance attempt".into()); }
                continue;
            }
            let definition = self.environment.as_ref().ok_or("process advance needs environment")?.processes.get(&state.definition).ok_or("unknown process definition")?.definition().clone();
            let stage = definition.stages.get(state.stage_index as usize).ok_or("process stage is missing")?;
            if stage.mode != crate::staged_process::StageMode::Elapsed || state.entered_tick >= self.revision { continue; }
            state.progress_seconds = crate::world::earned_work_seconds(state.progress_seconds, delta, stage.duration_seconds)?;
            self.finish_process_stage(&id, state, &definition)?;
            changed = true;
        }
        if changed { self.refresh_state_weight(); }
        Ok(())
    }

    pub fn process_requirements_json(&self, input: &str) -> Result<String> {
        if input.len() > 16 * 1024 { return Err("process requirements query exceeds input budget".into()); }
        #[derive(serde::Deserialize)]
        #[serde(rename_all = "camelCase", deny_unknown_fields)]
        struct Request { definition: String, station: String }
        let request: Request = serde_json::from_str(input).map_err(|error| error.to_string())?;
        let environment = self.environment.as_ref().ok_or("process requirements need environment")?;
        let process = self.ids.values().find_map(|entity| {
            let state = self.ecs.get::<StagedProcess>(*entity)?;
            (state.definition == request.definition && state.station == request.station).then_some(state.phase)
        }).unwrap_or(ProcessPhase::Waiting);
        let requirements = environment.processes.requirements(&request.definition, process).ok_or("unknown process definition")?;
        if requirements.station_catalog != self.ecs.get::<ConstructionSite>(self.entity(&request.station)?).ok_or("unknown process station")?.catalog { return Err("process station catalog mismatch".into()); }
        serde_json::to_string(&requirements).map_err(|error| error.to_string())
    }

    pub fn work_attempts_json(&self, input: &str) -> Result<String> {
        self.ensure_ready()?;
        let tasks: Vec<String> = serde_json::from_str(input).map_err(|e| e.to_string())?;
        if tasks.is_empty() || tasks.len() > 128 || tasks.iter().any(|id| !valid_id(id)) { return Err("invalid work attempt query".into()); }
        let rows = tasks.into_iter().filter_map(|task| self.work_attempts.get(&task).and_then(|entity| self.ecs.get::<WorkAttempt>(*entity))).cloned().collect::<Vec<_>>();
        serde_json::to_string(&rows).map_err(|e| e.to_string())
    }
    pub fn work_attempt_for_worker_json(&self, input: &str) -> Result<String> {
        let worker: String = serde_json::from_str(input).map_err(|e| e.to_string())?;
        if !valid_id(&worker) { return Err("invalid worker identity".into()); }
        let row = self.attempts_by_worker.get(&worker)
            .and_then(|key| self.work_attempts.get(&key.task))
            .and_then(|entity| self.ecs.get::<WorkAttempt>(*entity));
        serde_json::to_string(&row).map_err(|e| e.to_string())
    }
    pub fn party_join_identity_json(&self, input: &str) -> Result<String> {
        self.ensure_ready()?;
        let binding_id: String = serde_json::from_str(input).map_err(|_| "invalid party join binding")?;
        if !valid_id(&binding_id) { return Err("invalid party join binding".into()); }
        if let Some(receipt) = self.party_bindings.get(&binding_id) {
            return serde_json::to_string(&serde_json::json!({
                "status":"existing",
                "sequence":receipt.sequence,
                "player":receipt.player,
                "party":receipt.party,
                "people":receipt.people,
            })).map_err(|e| e.to_string());
        }
        serde_json::to_string(&serde_json::json!({"status":"available","sequence":self.next_party_sequence,"player":format!("player:{}", self.next_party_sequence),"party":format!("party:{}", self.next_party_sequence),"people":[]})).map_err(|e| e.to_string())
    }
    fn begin_work_attempt(&mut self, task: String, worker: String, activity: crate::work_attempt::ActivityRef, scope: &ActionScope) -> Result<AttemptKey> {
        if !valid_id(&task) || !valid_id(&worker) || !self.ids.contains_key(&task) || !self.ids.contains_key(&worker) { return Err("work attempt references unknown entity".into()); }
        if self.work_attempts.contains_key(&task) || self.attempts_by_worker.contains_key(&worker) { return Err("work attempt is already owned".into()); }
        let worker_entity = self.entity(&worker)?;
        let task_entity = self.entity(&task)?;
        let execution = if let Some(execution) = self.ecs.get::<WorkExecution>(task_entity).cloned() {
            execution
        } else if task == worker {
            let pool = self.ecs.get::<PartyMember>(worker_entity).ok_or("manual work attempt worker has no pool")?.party.clone();
            self.work_execution_for_scope(scope, &pool, "manual-route")?
        } else {
            return Err("work attempt task has no execution".into());
        };
        if self.ecs.get::<PartyMember>(worker_entity).map(|member| member.party.as_str()) != Some(execution.pool.as_str()) { return Err("work attempt worker is outside pool".into()); }
        if self.ecs.get::<OwnedByParty>(task_entity).is_some_and(|owner| owner.party != execution.pool) { return Err("work attempt task is outside pool".into()); }
        if self.ecs.get::<crate::job::Task>(task_entity).is_some() {
            self.rebuild_job_index()?;
            if !self.job_index.ready_tasks.contains(&task) { return Err("job task dependencies or result bindings are not ready".into()); }
        }
        let generation = self.next_work_generation;
        self.next_work_generation = self.next_work_generation.checked_add(1).ok_or("work attempt generation exhausted")?;
        let key = AttemptKey { task: task.clone(), generation };
        let operation = OperationKey { attempt: key.clone(), sequence: 1 };
        if let crate::work_attempt::ActivityRef::ProcessAttendance { process, contact } = &activity {
            if process != &task { return Err("process attendance task mismatch".into()); }
            self.attend_process(&worker, process, contact, 0.0)?;
            let entity = task_entity;
            self.ecs.entity_mut(entity).insert(WorkAttempt { version: crate::work_attempt::CURRENT_VERSION, key: key.clone(), worker: worker.clone(), execution, continuation_owner: crate::work_attempt::ContinuationOwner::External, phase: AttemptPhase::Executing { operation, activity } });
            self.work_attempts.insert(task, entity);
            self.attempts_by_worker.insert(worker, key.clone());
            return Ok(key);
        }
        let crate::work_attempt::ActivityRef::Route { destination } = activity else { return Err("unsupported initial work activity".into()); };
        let position = *self.ecs.get::<Position>(worker_entity).ok_or("route attempt worker has no position")?;
        self.ecs.get::<Body>(worker_entity).ok_or("route attempt worker is not movable")?;
        let route = self.route_for(worker_entity, position, &destination)?;
        self.publish_prepared_route_attempt(task, worker, execution, destination, route, key, operation, task_entity, worker_entity, crate::work_attempt::ContinuationOwner::External)
    }
    fn publish_prepared_route_attempt(&mut self, task: String, worker: String, execution: WorkExecution, destination: Point, route: PreparedRoute, key: AttemptKey, operation: OperationKey, task_entity: Entity, worker_entity: Entity, continuation_owner: crate::work_attempt::ContinuationOwner) -> Result<AttemptKey> {
        self.direct.remove(&worker_entity);
        let position = *self.ecs.get::<Position>(worker_entity).ok_or("route attempt worker has no position")?;
        self.ecs.entity_mut(worker_entity).insert(Destination { x: destination.x, y: destination.y, z: destination.z, facing: position.facing, frame: destination.frame.clone() });
        self.install_route(worker_entity, route);
        self.ecs.entity_mut(task_entity).insert(WorkAttempt { version: crate::work_attempt::CURRENT_VERSION, key: key.clone(), worker: worker.clone(), execution, continuation_owner, phase: AttemptPhase::Executing { operation, activity: crate::work_attempt::ActivityRef::Route { destination } } });
        self.work_attempts.insert(task, task_entity);
        self.attempts_by_worker.insert(worker, key.clone());
        Ok(key)
    }
    fn begin_work_attempt_with_prepared_route(&mut self, task: String, worker: String, destination: Point, route: PreparedRoute) -> Result<AttemptKey> {
        if !valid_id(&task) || !valid_id(&worker) || !self.ids.contains_key(&task) || !self.ids.contains_key(&worker) { return Err("work attempt references unknown entity".into()); }
        if self.work_attempts.contains_key(&task) || self.attempts_by_worker.contains_key(&worker) { return Err("work attempt is already owned".into()); }
        let worker_entity = self.entity(&worker)?;
        let task_entity = self.entity(&task)?;
        let execution = self.ecs.get::<WorkExecution>(task_entity).cloned().ok_or("work attempt task has no execution")?;
        if self.ecs.get::<PartyMember>(worker_entity).map(|member| member.party.as_str()) != Some(execution.pool.as_str()) { return Err("work attempt worker is outside pool".into()); }
        if self.ecs.get::<OwnedByParty>(task_entity).is_some_and(|owner| owner.party != execution.pool) { return Err("work attempt task is outside pool".into()); }
        let generation = self.next_work_generation;
        self.next_work_generation = self.next_work_generation.checked_add(1).ok_or("work attempt generation exhausted")?;
        let key = AttemptKey { task: task.clone(), generation };
        let operation = OperationKey { attempt: key.clone(), sequence: 1 };
        self.publish_prepared_route_attempt(task, worker, execution, destination, route, key, operation, task_entity, worker_entity, crate::work_attempt::ContinuationOwner::Native)
    }
    fn continue_work_attempt_with_prepared_route(&mut self, task: &str, generation: u64, sequence: u32, destination: Point, route: PreparedRoute) -> Result<()> {
        let entity = *self.work_attempts.get(task).ok_or("work attempt is not current")?;
        let current = self.ecs.get::<WorkAttempt>(entity).cloned().ok_or("work attempt component is missing")?;
        if current.key.generation != generation
            || !matches!(current.phase, AttemptPhase::Outcome { operation: ref op, result: WorkOutcome::Completed, .. } if op.sequence == sequence)
        {
            return Err("work attempt completed outcome is stale".into());
        }
        let worker = self.entity(&current.worker)?;
        let position = *self.ecs.get::<Position>(worker).ok_or("route attempt worker has no position")?;
        self.ecs.get::<Body>(worker).ok_or("route attempt worker is not movable")?;
        self.ecs.entity_mut(worker).insert(Destination { x: destination.x, y: destination.y, z: destination.z, facing: position.facing, frame: destination.frame.clone() });
        self.install_route(worker, route);
        let operation = OperationKey { attempt: current.key, sequence: sequence.checked_add(1).ok_or("work attempt sequence exhausted")? };
        crate::record_changes::edit::<WorkAttempt>(entity, &mut self.ecs).ok_or("work attempt component is missing")?.phase = AttemptPhase::Executing {
            operation,
            activity: crate::work_attempt::ActivityRef::Route { destination },
        };
        Ok(())
    }
    fn checked_attempt(&self, task: &str, generation: u64, sequence: u32) -> Result<&WorkAttempt> {
        let entity = *self.work_attempts.get(task).ok_or("work attempt is not current")?;
        let attempt = self.ecs.get::<WorkAttempt>(entity).ok_or("work attempt component is missing")?;
        if attempt.key.generation != generation { return Err("stale work attempt key".into()); }
        let operation = attempt.current_operation().ok_or("work attempt has no operation")?;
        if operation.sequence != sequence {
            return Err(format!("unexpected work attempt sequence for {task}: expected {}, received {sequence}", operation.sequence));
        }
        Ok(attempt)
    }
    fn interrupt_work_attempt(&mut self, task: String, generation: u64, sequence: u32, cause: InterruptCause) -> Result<()> {
        let worker = self.checked_attempt(&task, generation, sequence)?.worker.clone();
        let entity = self.entity(&worker)?;
        if let Some(attempt_entity) = self.work_attempts.get(&task).copied() {
            if let Some(attempt) = self.ecs.get::<WorkAttempt>(attempt_entity).cloned() {
                if let AttemptPhase::Executing { activity, .. } = attempt.phase {
                    match activity {
                        crate::work_attempt::ActivityRef::Excavation { .. } => {
                            // Task-owned excavation progress survives labor
                            // interruption; only the WorkAttempt is settled.
                        }
                        crate::work_attempt::ActivityRef::ProcessAttendance { process, .. } => {
                            if let Ok(process_entity) = self.entity(&process) { if let Some(state) = self.ecs.get::<StagedProcess>(process_entity).cloned() { if state.phase == ProcessPhase::Working { self.ecs.entity_mut(process_entity).insert(StagedProcess { phase: ProcessPhase::Waiting, ..state }); } } }
                        }
                        crate::work_attempt::ActivityRef::Construction { site, .. } => {
                            if let Ok(site_entity) = self.entity(&site) {
                                if let Some(state) = self.ecs.get::<ConstructionSite>(site_entity).cloned() {
                                    if state.phase == ConstructionPhase::Working { self.ecs.entity_mut(site_entity).insert(ConstructionSite { phase: ConstructionPhase::Planned, ..state }); }
                                }
                                if let Some(replacement) = self.ecs.get::<FloorReplacement>(site_entity).cloned() {
                                    if replacement.phase == FloorReplacementPhase::Working { self.ecs.entity_mut(site_entity).insert(FloorReplacement { phase: FloorReplacementPhase::Queued, ..replacement }); }
                                }
                            }
                        }
                        _ => {}
                    }
                }
            }
        }
        if let Some(destination) = self.ecs.get::<Destination>(entity).cloned() {
            if let Some(attempt_entity) = self.work_attempts.get(&task).copied() {
                if let Some(WorkAttempt { phase: AttemptPhase::Executing { activity: crate::work_attempt::ActivityRef::Route { destination: expected }, .. }, .. }) = self.ecs.get::<WorkAttempt>(attempt_entity) {
                    if destination.x == expected.x && destination.y == expected.y && destination.z == expected.z && destination.frame == expected.frame { self.clear_destination(entity); }
                }
            }
        }
        let attempt = self.checked_attempt(&task, generation, sequence)?;
        if !matches!(&attempt.phase, AttemptPhase::Executing { .. }) { return Err("work attempt operation is already settled".into()); }
        let operation = OperationKey { attempt: attempt.key.clone(), sequence };
        let activity = match &self.ecs.get::<WorkAttempt>(self.entity(&task)?).ok_or("work attempt component is missing")?.phase {
            AttemptPhase::Executing { activity, .. } => activity.clone(),
            _ => return Err("work attempt operation is already settled".into()),
        };
        self.settle_attempt(&task, AttemptPhase::Outcome { operation, activity, result: WorkOutcome::Interrupted { cause } })
    }
    fn retarget_work_attempt(&mut self, task: String, generation: u64, sequence: u32, destination: Point) -> Result<()> {
        let entity = *self.work_attempts.get(&task).ok_or("work attempt is not current")?;
        let attempt = self.ecs.get::<WorkAttempt>(entity).ok_or("work attempt component is missing")?.clone();
        if attempt.key.generation != generation { return Err("stale work attempt key".into()); }
        if attempt.key.task != attempt.worker { return Err("only a worker-owned manual route may be retargeted".into()); }
        let operation = match &attempt.phase { AttemptPhase::Executing { operation, .. } if operation.sequence == sequence => operation.clone(), _ => return Err("work attempt operation is not executing".into()) };
        if !matches!(&attempt.phase, AttemptPhase::Executing { activity: crate::work_attempt::ActivityRef::Route { .. }, .. }) { return Err("only a route work attempt may be retargeted".into()); }
        let worker = self.entity(&attempt.worker)?;
        let position = *self.ecs.get::<Position>(worker).ok_or("route attempt worker has no position")?;
        self.ecs.get::<Body>(worker).ok_or("route attempt worker is not movable")?;
        let route = self.route_for(worker, position, &destination)?;
        self.ecs.entity_mut(worker).insert(Destination { x: destination.x, y: destination.y, z: destination.z, facing: position.facing, frame: destination.frame.clone() });
        self.install_route(worker, route);
        let mut attempt = crate::record_changes::edit::<WorkAttempt>(entity, &mut self.ecs).ok_or("work attempt component is missing")?;
        attempt.phase = AttemptPhase::Executing { operation: OperationKey { attempt: operation.attempt, sequence: sequence.checked_add(1).ok_or("work attempt sequence exhausted")? }, activity: crate::work_attempt::ActivityRef::Route { destination } };
        Ok(())
    }
    fn acknowledge_work_attempt(&mut self, task: String, generation: u64, sequence: u32) -> Result<()> {
        {
            let attempt = self.checked_attempt(&task, generation, sequence)?;
            if !matches!(&attempt.phase, AttemptPhase::Outcome { .. }) { return Err("work attempt has no terminal outcome".into()); }
        }
        let entity = self.work_attempts.remove(&task).ok_or("work attempt is not current")?;
        let worker = self.ecs.get::<WorkAttempt>(entity).map(|attempt| attempt.worker.clone());
        self.ecs.entity_mut(entity).remove::<WorkAttempt>();
        if let Some(worker) = worker {
            if self.attempts_by_worker.get(&worker).is_some_and(|key| key.task == task && key.generation == generation) {
                self.attempts_by_worker.remove(&worker);
            }
        }
        Ok(())
    }
    fn continue_work_attempt(&mut self, task: String, generation: u64, sequence: u32, next_activity: crate::work_attempt::ActivityRef) -> Result<()> {
        let entity = *self.work_attempts.get(&task).ok_or("work attempt is not current")?;
        let current = self.ecs.get::<WorkAttempt>(entity).cloned().ok_or("work attempt component is missing")?;
        if current.key.generation != generation || !matches!(current.phase, AttemptPhase::Outcome { operation: ref op, result: WorkOutcome::Completed, .. } if op.sequence == sequence) { return Err("work attempt completed outcome is stale".into()); }
        if let crate::work_attempt::ActivityRef::Route { destination } = next_activity.clone() {
            let worker = self.entity(&current.worker)?;
            let position = *self.ecs.get::<Position>(worker).ok_or("route attempt worker has no position")?;
            self.ecs.get::<Body>(worker).ok_or("route attempt worker is not movable")?;
            let route = self.route_for(worker, position, &destination)?;
            return self.continue_work_attempt_with_prepared_route(&task, generation, sequence, destination, route);
        }
        if let crate::work_attempt::ActivityRef::MaterialTransfer { lot, from, to, quantity } = next_activity.clone() {
            let next_sequence = sequence.checked_add(1).ok_or("work attempt sequence exhausted")?;
            let allocation = self.ecs.get::<SupplyAllocation>(entity).cloned();
            let destination = self.entity(&to)?;
            let destination_owned = self.ecs.get::<OwnedByParty>(destination).map(|owner| owner.party.as_str()) == Some(current.execution.pool.as_str());
            let destination_is_worker = to == current.worker && self.ecs.get::<PartyMember>(destination).map(|member| member.party.as_str()) == Some(current.execution.pool.as_str());
            if !destination_owned && !destination_is_worker { return Err("material transfer destination is outside attempt party or unowned".into()); }
            let source = self.entity(&from)?;
            let lot_entity = self.entity(&lot)?;
            let stock = self.ecs.get::<Lot>(lot_entity).ok_or("not a material lot")?.clone();
            let pickup = from != current.worker && to == current.worker;
            let public_ground = self.ecs.get::<GroundStock>(source).is_some()
                && self.ecs.get::<OwnedByParty>(source).is_none();
            let lot_owned = self.ecs.get::<OwnedByParty>(lot_entity).map(|owner| owner.party.as_str()) == Some(current.execution.pool.as_str());
            if !lot_owned && !(pickup && public_ground && self.ecs.get::<OwnedByParty>(lot_entity).is_none()) {
                return Err("material transfer lot is outside attempt party or unowned".into());
            }
            let source_owned = self.ecs.get::<OwnedByParty>(source).map(|owner| owner.party.as_str()) == Some(current.execution.pool.as_str());
            let source_is_worker = from == current.worker && self.ecs.get::<PartyMember>(source).map(|member| member.party.as_str()) == Some(current.execution.pool.as_str());
            if !source_owned && !source_is_worker && !public_ground { return Err("material transfer source is outside attempt party or unowned".into()); }
            if quantity == 0 { return Err("invalid material transfer quantity".into()); }
            let deposit = from == current.worker && to != current.worker;
            if !pickup && !deposit { return Err("material transfer must be worker pickup or worker deposit".into()); }
            if let Some(allocation) = &allocation {
                if allocation.state != SupplyAllocationState::Reserved
                    || allocation.portion != lot
                    || allocation.quantity != quantity
                    || (pickup && stock.container != from)
                    || (deposit && to != allocation.destination)
                {
                    return Err("material transfer does not match supply allocation".into());
                }
                if deposit && !stockpile_work::allocation_is_current(self, allocation) {
                    let operation = OperationKey { attempt: current.key.clone(), sequence: next_sequence };
                    self.settle_attempt(&task, AttemptPhase::Outcome { operation, activity: next_activity, result: WorkOutcome::Blocked { reason: WorkBlockReason::CapacityUnavailable } })?;
                    return Ok(());
                }
            }
            let capacity = self.ecs.get::<Container>(destination).ok_or("not a container")?.capacity;
            let reason = if stock.container != from || stock.quantity < quantity { Some(WorkBlockReason::MissingInputs) }
              else if self.quantity(&to) + u64::from(quantity) > u64::from(capacity) { Some(WorkBlockReason::CapacityUnavailable) }
              else if self.contact(source, destination).is_err() { Some(WorkBlockReason::AccessLost) }
              else if allocation.is_some() {
                  match crate::supply_allocation::validate_capacity(self, lot_entity, destination, quantity, Some(task.as_str())) {
                      Ok(()) => None,
                      Err(reason) if reason.contains("source") => Some(WorkBlockReason::MissingInputs),
                      Err(_) => Some(WorkBlockReason::CapacityUnavailable),
                  }
              }
              else { None };
            let operation = OperationKey { attempt: current.key.clone(), sequence: next_sequence };
            if let Some(reason) = reason {
                self.settle_attempt(&task, AttemptPhase::Outcome { operation, activity: next_activity, result: WorkOutcome::Blocked { reason } })?;
                return Ok(());
            }
            let moved_lot = self.transfer_with_identity_excluding(&lot, &from, &to, quantity, !pickup, allocation.as_ref().map(|_| task.as_str()))?;
            if let Some(allocation) = allocation {
                let mut saved = crate::record_changes::edit::<SupplyAllocation>(entity, &mut self.ecs).ok_or("supply allocation disappeared")?;
                if pickup { saved.portion = moved_lot.clone(); }
                if deposit { saved.state = SupplyAllocationState::Delivered; }
                debug_assert_eq!(saved.requirement_owner, allocation.requirement_owner);
                drop(saved);
                self.refresh_supply_index(&task);
            }
            let activity = crate::work_attempt::ActivityRef::MaterialTransfer {
                lot: moved_lot, from, to, quantity,
            };
            self.settle_attempt(&task, AttemptPhase::Outcome { operation, activity, result: WorkOutcome::Completed })?;
            return Ok(());
        }
        if let crate::work_attempt::ActivityRef::MaterialDrop { lot } = next_activity.clone() {
            let lot_entity = self.entity(&lot)?;
            let lot_state = self.ecs.get::<Lot>(lot_entity).ok_or("material drop lot is missing")?;
            if lot_state.container != current.worker { return Err("material drop lot is not held by attempt worker".into()); }
            if self.ecs.get::<OwnedByParty>(lot_entity).map(|owner| owner.party.as_str()) != Some(current.execution.pool.as_str()) { return Err("material drop lot is outside attempt pool or unowned".into()); }
            let next_sequence = sequence.checked_add(1).ok_or("work attempt sequence exhausted")?;
            self.drop_lot(&current.worker, &lot)?;
            let operation = OperationKey { attempt: current.key.clone(), sequence: next_sequence };
            self.settle_attempt(&task, AttemptPhase::Outcome { operation, activity: next_activity, result: WorkOutcome::Completed })?;
            return Ok(());
        }
        if let crate::work_attempt::ActivityRef::ProcessAttendance { process, contact } = next_activity.clone() {
            if process != task { return Err("process attendance task mismatch".into()); }
            self.attend_process(&current.worker, &process, &contact, 0.0)?;
            let operation = OperationKey { attempt: current.key.clone(), sequence: sequence.checked_add(1).ok_or("work attempt sequence exhausted")? };
            let state = self.ecs.get::<StagedProcess>(self.entity(&process)?).ok_or("process is missing staged state")?;
            if state.phase == ProcessPhase::Working {
                crate::record_changes::edit::<WorkAttempt>(entity, &mut self.ecs).ok_or("work attempt component is missing")?.phase = AttemptPhase::Executing { operation, activity: next_activity };
            } else {
                self.settle_attempt(&task, AttemptPhase::Outcome { operation, activity: next_activity, result: WorkOutcome::Completed })?;
            }
            return Ok(());
        }
        if let crate::work_attempt::ActivityRef::Deconstruction { site, contact } = next_activity.clone() {
            let operation = OperationKey { attempt: current.key.clone(), sequence: sequence.checked_add(1).ok_or("work attempt sequence exhausted")? };
            let access = self.deconstruction_access(&serde_json::to_string(&vec![site.clone()]).map_err(|e| e.to_string())?)?;
            let rows: serde_json::Value = serde_json::from_str(&access).map_err(|error| error.to_string())?;
            let required = rows[0]["workSeconds"].as_f64().ok_or("deconstruction access duration missing")?;
            self.request_deconstruction_for_attempt(&task, site.clone(), contact.clone(), required)?;
            crate::record_changes::edit::<WorkAttempt>(entity, &mut self.ecs).ok_or("work attempt component is missing")?.phase = AttemptPhase::Executing { operation, activity: crate::work_attempt::ActivityRef::Deconstruction { site, contact } };
            return Ok(());
        }
        if let crate::work_attempt::ActivityRef::Excavation { cell, expected_material, replacement_material } = next_activity.clone() {
            let operation = OperationKey { attempt: current.key.clone(), sequence: sequence.checked_add(1).ok_or("work attempt sequence exhausted")? };
            let existing = self.ecs.get::<ExcavationWork>(entity).copied();
            match self.request_excavation_for_attempt(&task, existing.unwrap_or(ExcavationWork { x: cell[0], y: cell[1], z: cell[2], expected: expected_material, replacement: replacement_material, seconds: 0.0 }))? {
                excavation_work::ExcavationAdmission::Started => {
                    crate::record_changes::edit::<WorkAttempt>(entity, &mut self.ecs).ok_or("work attempt component is missing")?.phase = AttemptPhase::Executing { operation, activity: next_activity };
                }
                excavation_work::ExcavationAdmission::WaitingForClearTarget => {
                    self.settle_attempt(&task, AttemptPhase::Outcome { operation, activity: next_activity, result: WorkOutcome::Blocked { reason: WorkBlockReason::AccessLost } })?;
                }
            }
            return Ok(());
        }
        if matches!(next_activity, crate::work_attempt::ActivityRef::ResourceEstablish { .. }
            | crate::work_attempt::ActivityRef::ResourceTend { .. }
            | crate::work_attempt::ActivityRef::ResourceExtract { .. })
        {
            let operation = OperationKey { attempt: current.key.clone(), sequence: sequence.checked_add(1).ok_or("work attempt sequence exhausted")? };
            crate::record_changes::edit::<WorkAttempt>(entity, &mut self.ecs).ok_or("work attempt component is missing")?.phase = AttemptPhase::Executing { operation, activity: next_activity };
            return Ok(());
        }
        if let crate::work_attempt::ActivityRef::FieldWater { vessel, cell, direction, portions } = next_activity.clone() {
            if portions == 0 { return Err("field water portions must be positive".into()); }
            let operation = OperationKey { attempt: current.key.clone(), sequence: sequence.checked_add(1).ok_or("work attempt sequence exhausted")? };
            let direction = match direction { crate::work_attempt::WaterDirection::Withdraw => WaterExchangeDirection::Withdraw, crate::work_attempt::WaterDirection::Deposit => WaterExchangeDirection::Deposit };
            let material = self.ecs.get::<FieldWaterWork>(entity).map(|work| work.material.clone()).unwrap_or_else(|| "water".into());
            let output_lot = self.exchange_field_water_as(&current.worker, &vessel, crate::generation::Cell { x: i64::from(cell[0]), y: cell[1], z: i64::from(cell[2]) }, direction, portions, &material)?;
            if let Some(lot) = output_lot {
                if let Some(mut work) = crate::record_changes::edit::<FieldWaterWork>(entity, &mut self.ecs) {
                    work.lot = Some(lot);
                }
            }
            self.settle_attempt(&task, AttemptPhase::Outcome { operation, activity: next_activity, result: WorkOutcome::Completed })?;
            return Ok(());
        }
        if let crate::work_attempt::ActivityRef::JobTransform { task: transform_task, .. } = next_activity.clone() {
            if transform_task != task { return Err("job transform continuation task mismatch".into()); }
            let operation = OperationKey { attempt: current.key.clone(), sequence: sequence.checked_add(1).ok_or("work attempt sequence exhausted")? };
            crate::record_changes::edit::<WorkAttempt>(entity, &mut self.ecs).ok_or("work attempt component is missing")?.phase = AttemptPhase::Executing { operation, activity: next_activity };
            return Ok(());
        }
        let crate::work_attempt::ActivityRef::Construction { site, contact, mode } = next_activity else { return Err("work attempt continuation is not construction".into()); };
        if site != task { return Err("construction continuation task mismatch".into()); }
        let site_entity = self.entity(&site)?;
        let owner = self.ecs.get::<OwnedByParty>(site_entity).ok_or("construction site has no party owner")?;
        if owner.party != current.execution.pool { return Err("construction continuation party mismatch".into()); }
        let operation = OperationKey { attempt: current.key.clone(), sequence: sequence.checked_add(1).ok_or("work attempt sequence exhausted")? };
        match mode {
            crate::work_attempt::ConstructionMode::Bind => {
                self.bind_construction_stage(&site, contact.clone())?;
                self.settle_attempt(&task, AttemptPhase::Outcome { operation, activity: crate::work_attempt::ActivityRef::Construction { site, contact, mode }, result: WorkOutcome::Completed })?;
                // Binding publishes the complete physical effect itself; it
                // has no later domain result to reconcile. Release the exact
                // attempt now so the same site can lawfully contribute its
                // supply and construction-labor obligations.
                self.acknowledge_work_attempt(task, current.key.generation, sequence.checked_add(1).ok_or("work attempt sequence exhausted")?)?;
            }
            crate::work_attempt::ConstructionMode::Work => {
                if self.ecs.get::<Position>(site_entity).is_none() { return Err("construction continuation requires bound stage".into()); }
                let mut state = self.ecs.get::<ConstructionSite>(site_entity).cloned().ok_or("construction site is missing")?;
                state.phase = ConstructionPhase::Working;
                self.ecs.entity_mut(site_entity).insert(state);
                if let Some(replacement) = self.ecs.get::<FloorReplacement>(site_entity).cloned() {
                    self.ecs.entity_mut(site_entity).insert(FloorReplacement { phase: FloorReplacementPhase::Working, ..replacement });
                }
                crate::record_changes::edit::<WorkAttempt>(entity, &mut self.ecs).ok_or("work attempt component is missing")?.phase = AttemptPhase::Executing { operation, activity: crate::work_attempt::ActivityRef::Construction { site, contact, mode } };
            }
        }
        Ok(())
    }
    fn apply_action(&mut self, action: Action, delta: f64, scope: &ActionScope) -> Result<ActionEffect> {
        match action {
            Action::InstantiateActors { binding_id, expected_sequence, plan } => self.instantiate_actors(binding_id, expected_sequence, plan).map(ActionEffect::Entity),
            Action::SetRelation { relation, source, target } => self.set_relation(&relation, &source, &target, scope).map(|_| ActionEffect::None),
            Action::ClearRelation { relation, source } => self.clear_relation(&relation, &source, scope).map(|_| ActionEffect::None),
            Action::BeginWorkAttempt { task, worker, operation } => self.begin_work_attempt(task, worker, operation, scope).map(ActionEffect::Attempt),
            Action::RetargetWorkAttempt { task, generation, sequence, destination } => self.retarget_work_attempt(task, generation, sequence, destination).map(|_| ActionEffect::None),
            Action::InterruptWorkAttempt { task, generation, sequence, cause } => self.interrupt_work_attempt(task, generation, sequence, cause).map(|_| ActionEffect::None),
            Action::AcknowledgeWorkAttempt { task, generation, sequence } => self.acknowledge_work_attempt(task, generation, sequence).map(|_| ActionEffect::None),
            Action::ContinueWorkAttempt { task, generation, sequence, next_activity } => self.continue_work_attempt(task, generation, sequence, next_activity).map(|_| ActionEffect::None),
            Action::CreateJob { id, pool, plan } => self.create_job(id, pool, plan, scope).map(ActionEffect::Entity),
            Action::ResumeJob { id, pool, plan } => self.resume_job(&id, &pool, plan, scope).map(|_| ActionEffect::None),
            Action::CancelJob { id } => self.cancel_job(&id).map(|_| ActionEffect::None),
            Action::ExchangeFieldWater { operation: _, worker, vessel, x, y, z, direction, portions } => {
                self.exchange_field_water(&worker, &vessel, crate::generation::Cell { x: i64::from(x), y, z: i64::from(z) }, direction, portions)?;
                Ok(ActionEffect::None)
            }
            Action::DesignateStockpile { party, zone, cells } => self.designate_stockpile(party, zone, cells, scope).map(ActionEffect::Entity),
            Action::UpdateStockpile { party, zone, filter_profile, priority } => self.update_stockpile(party, zone, filter_profile, priority).map(ActionEffect::Entity),
            Action::ClearStockpile { party, zone, cells } => self.clear_stockpile(party, zone, cells).map(ActionEffect::Entity),
            Action::RequestProcess { definition, station } => self.request_process(&definition, &station, scope).map(ActionEffect::Entity),
            Action::AdmitProcess { process, definition, station } => self.admit_process(&process, &definition, &station).map(ActionEffect::Entity),
            Action::CancelWork { entity } => {
                if let Some(key) = self.attempts_by_worker.get(&entity).cloned() {
                        let sequence = self.work_attempts.get(&key.task).and_then(|attempt| self.ecs.get::<WorkAttempt>(*attempt)).and_then(|attempt| attempt.current_operation()).map(|operation| operation.sequence).ok_or("worker attempt has no active operation")?;
                        self.interrupt_work_attempt(key.task.clone(), key.generation, sequence, InterruptCause::Cancelled)?;
                    }
                Ok(ActionEffect::None)
            }
            Action::PlanConstructions { party, plans } => {
                self.plan_constructions(party, plans, scope)?;
                Ok(ActionEffect::None)
            }
            Action::PlanExcavation { party, prefix, start, end } => {
                self.plan_excavation(party, prefix, start, end, scope)?;
                Ok(ActionEffect::None)
            }
            Action::CancelExcavation { party, area, workers } => {
                let area = area.map(|area| (area.start, area.end));
                self.cancel_excavation(party, area, workers)?;
                Ok(ActionEffect::None)
            }
            Action::PlanDeconstruction { site, party } => self.plan_deconstruction(site, party, scope).map(ActionEffect::Entity),
            Action::ReplaceFloor { order_id, existing_floor_id, desired_catalog } => {
                self.replace_floor(order_id, existing_floor_id, desired_catalog, scope)?;
                Ok(ActionEffect::None)
            }
            Action::Deconstruct { worker, site } => {
                self.deconstruct_construction(&worker, &site)?;
                Ok(ActionEffect::Entity(site))
            }
            Action::BindConstructionStage { site, contact } => {
                self.bind_construction_stage(&site, contact)?;
                Ok(ActionEffect::None)
            }
            Action::BeginEmission { worker, station } => {
                self.begin_emission(&worker, &station)?;
                Ok(ActionEffect::None)
            }
            Action::SetStructureOpen { worker, site, open } => {
                self.set_structure_open(&worker, &site, open)?;
                Ok(ActionEffect::None)
            }
            Action::Move {
                entity,
                destination,
                facing,
            } => {
                let e = self.entity(&entity)?;
                let p = *self.ecs.get::<Position>(e).ok_or("no position")?;
                self.ecs.get::<Body>(e).ok_or("not movable")?;
                let facing = facing.unwrap_or(p.facing);
                if !facing.is_finite() || facing.abs() > 1_000_000.0 {
                    return Err("invalid facing".into());
                }
                if let Some(existing) = self.ecs.get::<Destination>(e).cloned()
                    && existing.x == destination.x
                    && existing.y == destination.y
                    && existing.z == destination.z
                    && existing.frame == destination.frame
                    && self.routes.contains_key(&e)
                    && !self.terrain_routes.get(&e).is_some_and(|state| state.waiting)
                {
                    self.ecs.entity_mut(e).insert(Destination {
                        x: existing.x,
                        y: existing.y,
                        z: existing.z,
                        facing,
                        frame: existing.frame,
                    });
                    return Ok(ActionEffect::None);
                }
                if p.x == destination.x && p.y == destination.y && p.z == destination.z
                    && destination.frame == self.support_id(e) {
                    self.clear_destination(e);
                    self.ecs.entity_mut(e).insert(Position { facing, ..p });
                    return Ok(ActionEffect::None);
                }
                let target = Destination {
                    x: destination.x,
                    y: destination.y,
                    z: destination.z,
                    facing,
                    frame: destination.frame.clone(),
                };
                let extra = if self.ecs.get::<Destination>(e).is_some() {
                    0
                } else {
                    self.registry.weight("hive.destination", &record(&target))
                };
                if self.state_weight + extra > STATE_BYTES {
                    return Err("region canonical state capacity".into());
                }
                let path = match route_query::classify_route(self.route_for(e, p, &destination))? {
                    route_query::SearchOutcome::Reachable(path) => path,
                    route_query::SearchOutcome::Deferred(_) => self.pending_terrain_route(e, p)?,
                    route_query::SearchOutcome::NoPath(error) => return Err(error),
                };
                self.direct.remove(&e);
                self.ecs.entity_mut(e).insert(target);
                self.state_weight += extra;
                self.install_route(e, path);
                Ok(ActionEffect::None)
            }
            Action::BeginDirect { entity, stream } => {
                if !valid_id(&stream) || stream.len() > 64 { return Err("invalid direct stream".into()); }
                let e = self.entity(&entity)?;
                if self.ecs.get::<Body>(e).is_none() || self.ecs.get::<Position>(e).is_none() {
                    return Err("direct control requires body and position".into());
                }
                if self.ecs.get::<Support>(e).is_some() { return Err("direct control does not support boarded actors".into()); }
                if self.ecs.get::<Traversal>(e).is_some() { return Err("terrain walkers require routed movement".into()); }
                if self.ecs.get::<ExcavationWork>(e).is_some() { return Err("cancel work before taking direct control".into()); }
                if let Some(existing) = self.direct.get(&e) {
                    if existing.stream == stream { return Ok(ActionEffect::None); }
                }
                let replacement = DirectState { entity: entity.clone(), stream, last_queued: 0, last_processed: 0, queue: Vec::new(), remainder: 0.0 };
                let old_weight = self.direct.get(&e).map(Self::direct_weight).unwrap_or(0);
                let new_weight = Self::direct_weight(&replacement);
                if self.state_weight.saturating_add(self.direct.values().map(Self::direct_weight).sum::<usize>()).saturating_sub(old_weight).saturating_add(new_weight) > STATE_BYTES { return Err("region canonical state capacity".into()); }
                self.clear_destination(e);
                self.direct.insert(e, replacement);
                Ok(ActionEffect::None)
            }
            Action::DirectInput { entity, stream, inputs } => {
                if inputs.is_empty() || inputs.len() > navigation::MAX_DIRECT_INPUTS { return Err("invalid direct input batch".into()); }
                let e = self.entity(&entity)?;
                let direct_bytes = self.direct.values().map(Self::direct_weight).sum::<usize>();
                let state = self.direct.get_mut(&e).ok_or("direct stream is not active")?;
                if state.stream != stream || state.queue.len() + inputs.len() > navigation::MAX_DIRECT_INPUTS { return Err("direct input stream is unavailable".into()); }
                for (index, input) in inputs.iter().enumerate() {
                    let expected = state.last_queued.checked_add(index as u64 + 1).ok_or("direct input sequence exhausted")?;
                    if input.sequence != expected || !input.x.is_finite() || !input.z.is_finite() || input.x.abs() > 1.0 || input.z.abs() > 1.0 {
                        return Err("direct input sequence or axis is invalid".into());
                    }
                    if input.sequence > 9_007_199_254_740_991 { return Err("direct input sequence exhausted".into()); }
                }
                let old_weight = Self::direct_weight(state);
                let mut proposed = state.clone();
                proposed.last_queued = inputs.last().unwrap().sequence;
                proposed.queue.extend(inputs.iter().cloned());
                let new_weight = Self::direct_weight(&proposed);
                if self.state_weight.saturating_add(direct_bytes).saturating_sub(old_weight).saturating_add(new_weight) > STATE_BYTES { return Err("region canonical state capacity".into()); }
                state.last_queued = inputs.last().unwrap().sequence;
                state.queue.extend(inputs);
                Ok(ActionEffect::None)
            }
            Action::DropLot { entity, lot } => self.drop_lot(&entity, &lot).map(|()| ActionEffect::None),
            Action::Transfer {
                lot,
                from,
                to,
                quantity,
            } => self
                .transfer(&lot, &from, &to, quantity)
                .map(|()| ActionEffect::None),
            Action::Consume {
                entity,
                lot,
                quantity,
            } => {
                let container = self.entity(&entity)?;
                if self.ecs.get::<SealedContainer>(container).is_some() {
                    return Err("sealed container cannot consume".into());
                }
                let e = self.entity(&lot)?;
                let stock = self.ecs.get::<Lot>(e).ok_or("not a material lot")?;
                if quantity == 0 || stock.quantity < quantity || stock.container != entity {
                    return Err("consumption requires held stock".into());
                }
                if self.ecs.get::<LotWater>(e).is_some_and(|water| water.water_kg > 0.0) {
                    return Err("wet lot consumption is not admitted".into());
                }
                let prepared = self.prepare_material_consumption(&[MaterialPortion { lot, quantity }])?;
                self.publish_material_consumption(prepared)?;
                Ok(ActionEffect::None)
            }
            Action::ExtractResource { operation: _, worker, source } => self.extract_resource(&worker, &source).map(ActionEffect::Entity),
            Action::EstablishResourceSite { operation, worker, site, definition, x, y, z } => self.establish_resource_site(&operation, &worker, &site, &definition, x, y, z).map(ActionEffect::Entity),
            Action::TendResourceSite { operation, worker, site, vessel } => self.tend_resource_site(&operation, &worker, &site, &vessel).map(|()| ActionEffect::None),
            Action::DesignateResource { order, party, definition, x, y, z } => self.designate_resource(order, party, definition, x, y, z, scope).map(ActionEffect::Entity),
            Action::RequestFieldWater { party, material, portions } => self.request_field_water(party, material, portions, scope).map(ActionEffect::Entity),
            Action::Launch {
                launcher,
                ammunition,
                velocity,
            } => self.launch(&launcher, &ammunition, velocity, delta).map(|value| match value { Some((id, point)) => ActionEffect::Projectile(id, point), None => ActionEffect::None }),
            Action::Displace { entity, delta } => {
                self.displace(&entity, delta)?;
                Ok(ActionEffect::None)
            }
        }
    }

    fn player_has_role(&self, player: &str, target: access_roles::RoleTarget<'_>) -> Result<bool> {
        use access_roles::OperationRole;
        let entity = self.entity(target.entity)?;
        if target.role == OperationRole::RelationTarget { return Ok(true); }
        if self.ownership.player(target.entity) == Some(player) { return Ok(true); }
        let party = self.ecs.get::<PartyMember>(entity).map(|member| member.party.as_str())
            .or_else(|| self.ecs.get::<OwnedByParty>(entity).map(|owner| owner.party.as_str()));
        if party.is_some_and(|party| self.ownership.player(party) == Some(player)) { return Ok(true); }
        if target.role == OperationRole::WorkTask {
            if let Some(execution) = self.ecs.get::<WorkExecution>(entity) {
                return Ok(execution.initiating_player.as_deref() == Some(player)
                    || self.ownership.player(&execution.pool) == Some(player));
            }
            if let Some(attempt_entity) = self.work_attempts.get(target.entity)
                && let Some(attempt) = self.ecs.get::<WorkAttempt>(*attempt_entity)
            {
                return Ok(attempt.execution.initiating_player.as_deref() == Some(player)
                    || self.ownership.player(&attempt.execution.pool) == Some(player));
            }
        }
        Ok(false)
    }

    fn validate_action_scope(&self, scope: &ActionScope, action: &Action) -> Result<()> {
        let ActionScope::Player { player } = scope else { return Ok(()); };
        if !valid_id(player) { return Err("invalid action player".into()); }
        if matches!(action, Action::InstantiateActors { .. }) {
            return Err("player scope cannot instantiate actors".into());
        }
        for target in access_roles::action_roles(action) {
            if !self.player_has_role(player, target)? {
                return Err(format!("player lacks {:?} access to {}", target.role, target.entity));
            }
        }
        if let Action::UpdateStockpile { party, zone, .. } = action {
            let cells: Vec<_> = self.ids.values().copied().filter(|entity| self.ecs.get::<StockpileCell>(*entity).is_some_and(|cell| cell.zone == *zone)).collect();
            if cells.is_empty() || cells.iter().any(|entity| self.ecs.get::<OwnedByParty>(*entity).map(|owner| owner.party.as_str()) != Some(party.as_str())) {
                return Err("stockpile zone is outside its work pool".into());
            }
        }
        if let Action::ClearStockpile { party, zone, cells } = action {
            self.stockpile_clear_ids(party, zone, cells)?;
        }
        Ok(())
    }
    fn clear_destination(&mut self, entity: Entity) {
        if let Some(id) = self.ecs.get::<ExternalId>(entity) { self.planner.route_searches.cancel_actor(&id.0); }
        self.direct.remove(&entity);
        if let Some(destination) = self.ecs.get::<Destination>(entity).cloned() {
            self.state_weight = self.state_weight.saturating_sub(self.registry.weight("hive.destination", &record(&destination)));
            self.ecs.entity_mut(entity).remove::<Destination>();
        }
        // An actor stopped between support centers still needs its geometric
        // contact witness. This retains no movement intent and advances no time.
        let retain_contact = self.terrain_routes.get(&entity).is_some_and(|state| {
            let Some(position) = self.ecs.get::<Position>(entity) else { return false; };
            let Some(environment) = self.environment.as_ref() else { return false; };
            let spacing = environment.world.cell_spacing_m();
            !state.path.iter().any(|cell| position.x == cell.x as f64 * spacing[0]
                && position.y == (f64::from(cell.y) + 0.5) * spacing[1]
                && position.z == cell.z as f64 * spacing[2])
        });
        if retain_contact {
            let state = self.terrain_routes.get_mut(&entity).unwrap();
            state.suspended = true;
            state.pending = false;
        } else {
            self.routes.remove(&entity);
            self.terrain_routes.remove(&entity);
        }
    }
    fn projectile_ids(&self) -> Vec<String> {
        self.ids
            .iter()
            .filter(|(_, entity)| self.ecs.get::<Projectile>(**entity).is_some())
            .map(|(id, _)| id.clone())
            .collect()
    }
    fn launch(
        &mut self,
        launcher_id: &str,
        ammunition: &str,
        velocity: Vector3,
        delta: f64,
    ) -> Result<Option<(String, Vector3)>> {
        let launcher_entity = self.entity(launcher_id)?;
        let launcher = self
            .ecs
            .get::<Launcher>(launcher_entity)
            .cloned()
            .ok_or("entity is not a launcher")?;
        if self.ecs.get::<SealedContainer>(launcher_entity).is_some() {
            return Err("sealed container cannot launch ammunition".into());
        }
        let launcher_position = self.world_pose(launcher_id)?;
        let lot_entity = self.entity(ammunition)?;
        let mut lot = self
            .ecs
            .get::<Lot>(lot_entity)
            .cloned()
            .ok_or("ammunition is not a lot")?;
        if lot.container != launcher_id || lot.kind != launcher.ammo_kind || lot.quantity == 0 {
            return Err("ammunition is not held by launcher".into());
        }
        if [velocity.x, velocity.y, velocity.z]
            .iter()
            .any(|value| !value.is_finite())
        {
            return Err("invalid launch velocity".into());
        }
        let speed = (velocity.x * velocity.x + velocity.y * velocity.y + velocity.z * velocity.z).sqrt();
        if !speed.is_finite() || speed <= 0.0 || speed > launcher.max_speed {
            return Err("launch velocity exceeds launcher limit".into());
        }
        if self.projectile_count >= combat::MAX_ACTIVE_PROJECTILES || self.ids.len() >= 16384 {
            return Err("projectile capacity exhausted".into());
        }
        let radians = velocity.z.atan2(velocity.x);
        let muzzle = combat::muzzle_origin([launcher_position.x,launcher_position.y,launcher_position.z],[launcher.muzzle_x,launcher.muzzle_y,launcher.muzzle_z],[velocity.x,velocity.y,velocity.z]);
        let support_velocity = self.world_linear_velocity(launcher_entity, delta)?;
        let projectile_id = format!("shot.{}", self.next_projectile);
        let next_projectile = self.next_projectile.checked_add(1).ok_or("projectile ID exhausted")?;
        if self.known.contains(&projectile_id) {
            return Err("projectile ID collides with existing entity".into());
        }
        let projected_weight = self.state_weight
            + projectile_id.len()
            + 128
            + self.registry.weight(
                "hive.position",
                &record(&Position { x: 0.0, y: 0.0, z: 0.0, facing: 0.0 }),
            )
            + self.registry.weight(
                "hive.projectile",
                &record(&Projectile {
                    launcher: launcher_id.into(),
                    velocity_x: velocity.x,
                    velocity_y: velocity.y,
                    velocity_z: velocity.z,
                    radius: launcher.projectile_radius,
                    age: 0.0,
                    distance: 0.0,
                    max_range: launcher.max_range,
                    max_lifetime: launcher.max_lifetime,
                    gravity: launcher.gravity,
                    penetration: launcher.penetration,
                    state: "flying".into(),
                    roll_normal_x: 0.0,
                    roll_normal_y: 1.0,
                    roll_normal_z: 0.0,
                    embed_depth: 0.0,
                    roll_friction: 0.5,
                }),
            )
            + self.registry.weight(
                "hive.visual",
                &record(&Visual {
                    sprite: launcher.projectile_sprite.clone(),
                    label: launcher.projectile_label.clone(),
                }),
            );
        if projected_weight > STATE_BYTES {
            return Err("region canonical state capacity".into());
        }
        self.next_projectile = next_projectile;
        lot.quantity -= 1;
        self.ecs.entity_mut(lot_entity).insert(lot);
        if let Some(mut local)=crate::record_changes::edit::<Position>(launcher_entity, &mut self.ecs) {
            local.facing += radians/std::f64::consts::FRAC_PI_2-launcher_position.facing;
        }
        let projectile_entity = self.ecs.spawn((
            ExternalId(projectile_id.clone()),
            Position {
                x: muzzle[0],
                y: muzzle[1],
                z: muzzle[2],
                facing: launcher_position.facing,
            },
            Projectile {
                launcher: launcher_id.into(),
                velocity_x: velocity.x + support_velocity[0],
                velocity_y: velocity.y + support_velocity[1],
                velocity_z: velocity.z + support_velocity[2],
                radius: launcher.projectile_radius,
                age: 0.0,
                distance: 0.0,
                max_range: launcher.max_range,
                max_lifetime: launcher.max_lifetime,
                gravity: launcher.gravity,
                penetration: launcher.penetration,
                state: "flying".into(),
                roll_normal_x: 0.0,
                roll_normal_y: 1.0,
                roll_normal_z: 0.0,
                embed_depth: 0.0,
                roll_friction: 0.5,
            },
            Visual {
                sprite: launcher.projectile_sprite,
                label: launcher.projectile_label,
            },
        )).id();
        self.ids.insert(projectile_id.clone(), projectile_entity);
        self.known.insert(projectile_id.clone());
        self.projectile_count += 1;
        self.projectile_contacts.insert(projectile_id.clone(), BTreeSet::new());
        self.refresh_state_weight();
        Ok(Some((projectile_id, Vector3 { x: muzzle[0], y: muzzle[1], z: muzzle[2] })))
    }
    fn displace(&mut self, id: &str, delta: Vector3) -> Result<()> {
        if [delta.x, delta.y, delta.z]
            .iter()
            .any(|value| !value.is_finite())
            || (delta.x * delta.x + delta.y * delta.y + delta.z * delta.z).sqrt() > 2.0
        {
            return Err("invalid displacement".into());
        }
        let entity = self.entity(id)?;
        let current = *self.ecs.get::<Position>(entity).ok_or("no position")?;
        if delta.y.abs() > 1e-9 {
            return Err("vertical displacement is unsupported on current surfaces".into());
        }
        let (local_x, local_z) = if let Some(support_id) = self.support_id(entity) {
            let support = self.world_pose(&support_id)?;
            let radians = support.facing * std::f64::consts::FRAC_PI_2;
            let (sin, cos) = radians.sin_cos();
            (cos * delta.x + sin * delta.z, -sin * delta.x + cos * delta.z)
        } else {
            (delta.x, delta.z)
        };
        let target = Point {
            x: current.x + local_x,
            y: current.y,
            z: current.z + local_z,
            frame: self.support_id(entity),
        };
        if let Some(bounds) = self.frame_bounds(target.frame.as_deref())? {
            if target.x < bounds.min_x
                || target.x > bounds.max_x
                || target.z < bounds.min_z
                || target.z > bounds.max_z
            {
                return Err("displacement leaves support surface".into());
            }
        }
        let min_x = current.x.min(target.x).floor() as i32 - 1;
        let max_x = current.x.max(target.x).ceil() as i32 + 1;
        let min_z = current.z.min(target.z).floor() as i32 - 1;
        let max_z = current.z.max(target.z).ceil() as i32 + 1;
        if let Some(blocked) = self.blocked_by_frame.get(&self.support_id(entity)) {
            for x in min_x..=max_x {
                for z in min_z..=max_z {
                    let cell = (x, navigation::cell(navigation::point(current)).1, z);
                    if blocked.contains(&cell) && segment_intersects_cell(&navigation::point(current), &target, cell) {
                        return Err("displacement enters an obstacle".into());
                    }
                }
            }
        }
        if self.ecs.get::<Destination>(entity).is_some() {
            let destination = self.ecs.get::<Destination>(entity).cloned().ok_or("missing destination")?;
            self.state_weight = self.state_weight.saturating_sub(
                self.registry.weight("hive.destination", &record(&destination)),
            );
            self.ecs.entity_mut(entity).remove::<Destination>();
            self.routes.remove(&entity);
        }
        self.ecs.entity_mut(entity).insert(Position {
            x: target.x,
            y: target.y,
            z: target.z,
            facing: current.facing,
        });
        Ok(())
    }
    fn predicted_world_pose(&self, entity: Entity, delta: f64, depth: usize) -> Result<Position> {
        if depth > 16 {
            return Err("support chain exceeds depth 16".into());
        }
        let local = *self.ecs.get::<Position>(entity).ok_or("no position")?;
        let mut predicted = local;
        if let Some(path) = self.routes.get(&entity).filter(|_| !self.terrain_routes.get(&entity).is_some_and(|state| state.suspended || state.waiting)) {
            let mut remaining = path.clone();
            let speed = self.ecs.get::<Body>(entity).map_or(0.0, |body| body.speed);
            navigation::advance(&mut predicted, &mut remaining, speed * delta);
            if let Some(destination) = self.ecs.get::<Destination>(entity) {
                predicted.facing = destination.facing;
            }
        }
        if let Some(support) = self.ecs.get::<Support>(entity) {
            let parent = self.entity(&support.entity)?;
            let parent_position = self.predicted_world_pose(parent, delta, depth + 1)?;
            let radians = parent_position.facing * std::f64::consts::FRAC_PI_2;
            let (sin, cos) = radians.sin_cos();
            return Ok(Position {
                x: parent_position.x + cos * predicted.x - sin * predicted.z,
                y: parent_position.y + predicted.y,
                z: parent_position.z + sin * predicted.x + cos * predicted.z,
                facing: parent_position.facing + predicted.facing,
            });
        }
        Ok(predicted)
    }
    fn world_linear_velocity(&self, entity: Entity, delta: f64) -> Result<[f64; 3]> {
        if delta <= 0.0 {
            return Ok([0.0; 3]);
        }
        let start = self.world_pose_entity(entity, 0)?;
        let end = self.predicted_world_pose(entity, delta, 0)?;
        Ok([(end.x - start.x) / delta, (end.y - start.y) / delta, (end.z - start.z) / delta])
    }
    fn projectile_colliders(&self, launcher: &str, elapsed: f64, step: f64, origin:[f64;3], velocity:[f64;3], radius:f64, gravity:f64) -> Result<Vec<combat::ContactCollider>> {
        let mut candidates=Vec::new();
        for id in &self.collider_ids {
            if id==launcher { continue; }
            let entity=self.entity(id)?;
            let collider=self.ecs.get::<Collider>(entity).ok_or("stale collider index")?;
            let start=self.predicted_world_pose(entity,elapsed,0)?;
            let end=self.predicted_world_pose(entity,elapsed+step,0)?;
            let initial=self.world_pose_entity(entity,0)?;
            let extent=match collider.shape {ColliderShape::Ball=>collider.radius,ColliderShape::Cuboid=>(collider.half_x.powi(2)+collider.half_y.powi(2)+collider.half_z.powi(2)).sqrt()}+radius+0.01;
            let projectile_end=combat::ballistic_interval(origin,velocity,gravity,step).0;
            let offset_radius=(collider.offset_x.powi(2)+collider.offset_z.powi(2)).sqrt();
            let target_start=[start.x,start.y+collider.offset_y,start.z];
            let target_end=[end.x,end.y+collider.offset_y,end.z];
            if (0..3).any(|axis| origin[axis].min(projectile_end[axis])-extent > target_start[axis].max(target_end[axis])+extent+offset_radius || origin[axis].max(projectile_end[axis])+extent < target_start[axis].min(target_end[axis])-extent-offset_radius) {continue;}
            if matches!(collider.shape,ColliderShape::Cuboid) && (end.facing-initial.facing).abs()>1e-9 { return Err("rotating cuboid collision is unsupported".into()); }
            let angle=start.facing*std::f64::consts::FRAC_PI_2;
            let (sin,cos)=angle.sin_cos();
            let material=self.ecs.get::<ImpactMaterial>(entity);
            candidates.push(combat::ContactCollider {
                geometry:collision::Collider {id:id.clone(),shape:match collider.shape {
                    ColliderShape::Ball=>collision::ColliderShape::Ball{radius:collider.radius},
                    ColliderShape::Cuboid=>collision::ColliderShape::Cuboid{half_extents:[collider.half_x,collider.half_y,collider.half_z]},
                },origin:[start.x+cos*collider.offset_x-sin*collider.offset_z,start.y+collider.offset_y,start.z+sin*collider.offset_x+cos*collider.offset_z],
                linear_velocity:if step>0.0 {[(end.x-start.x)/step,(end.y-start.y)/step,(end.z-start.z)/step]} else {[0.0;3]},yaw:angle+collider.yaw},
                material:combat::ImpactProfile {response:material.map_or("stop",|m|m.response.as_str()).into(),resistance:material.map_or(0.0,|m|m.resistance),restitution:material.map_or(0.0,|m|m.restitution),friction:material.map_or(1.0,|m|m.friction),embed_speed:material.map_or(0.0,|m|m.embed_speed)},
            });
            if candidates.len()>collision::MAX_CANDIDATE_COLLIDERS {return Err("projectile candidate budget exceeded".into());}
        }
        Ok(candidates)
    }
    fn advance_projectiles(&mut self, delta: f64) -> Result<Vec<ImpactEvent>> {
        if self.projectile_count==0 || delta==0.0 {return Ok(Vec::new());}
        let mut impacts=Vec::new();
        for id in self.projectile_ids() {
            let entity=self.entity(&id)?;
            let mut projectile=self.ecs.get::<Projectile>(entity).cloned().ok_or("missing projectile")?;
            if !matches!(projectile.state.as_str(),"flying"|"rolling") {continue;}
            let launcher=projectile.launcher.clone();
            let mut position=*self.ecs.get::<Position>(entity).ok_or("projectile has no position")?;
            let mut victims=self.projectile_contacts.get(&id).cloned().unwrap_or_default();
            let radius=projectile.radius;let gravity=projectile.gravity;
            let result=combat::advance_motion(&id,&mut projectile,&mut position,&mut victims,delta,|elapsed,step,origin,velocity|self.projectile_colliders(&launcher,elapsed,step,origin,velocity,radius,gravity))?;
            for contact in result.contacts {
                if impacts.len()>=combat::MAX_IMPACTS_PER_STEP || self.next_impact>9_007_199_254_740_991 {return Err("impact event budget exceeded".into());}
                let hit=contact.hit;
                impacts.push(ImpactEvent {id:format!("{}/impact.{}",id,self.next_impact),sequence:self.next_impact,projectile_id:id.clone(),source_id:launcher.clone(),target_id:hit.target_id,time:self.time+contact.elapsed,point:Vector3{x:hit.point[0],y:hit.point[1],z:hit.point[2]},normal:Vector3{x:hit.normal[0],y:hit.normal[1],z:hit.normal[2]},velocity:Vector3{x:contact.velocity[0],y:contact.velocity[1],z:contact.velocity[2]}});
                self.next_impact+=1;
            }
            if result.expired {
                self.ecs.despawn(entity);self.ids.remove(&id);self.known.remove(&id);self.projectile_contacts.remove(&id);
                self.projectile_count=self.projectile_count.saturating_sub(1);
            } else {
                if !matches!(projectile.state.as_str(),"flying"|"rolling") {self.projectile_count=self.projectile_count.saturating_sub(1);}
                self.ecs.entity_mut(entity).insert((position,projectile));
                self.projectile_contacts.insert(id,victims);
            }
        }
        self.refresh_state_weight();
        if self.state_weight>STATE_BYTES {return Err("region canonical state capacity".into());}
        Ok(impacts)
    }
    pub(super) fn prepare_material_consumption(&self, portions: &[MaterialPortion]) -> Result<PreparedConsumption> {
        if portions.iter().any(|portion| self.process_bindings_for_lot(&portion.lot)) { return Err("process-bound lot cannot be consumed".into()); }
        for portion in portions {
            let lot = self.ecs.get::<Lot>(self.entity(&portion.lot)?).ok_or("material lot is missing")?;
            let reserved = crate::supply_allocation::reserved_source(self, &portion.lot, None);
            if portion.quantity > lot.quantity.saturating_sub(reserved) {
                return Err("material lot quantity is reserved for supply".into());
            }
        }
        material_consumption::prepare(
            &self.material_consumption_owner,
            self.revision,
            &self.ecs,
            &self.ids,
            &self.registry,
            self.state_weight,
            portions,
        )
    }
    pub(super) fn publish_material_consumption(&mut self, prepared: PreparedConsumption) -> Result<ConsumedMaterial> {
        material_consumption::publish(
            prepared,
            &self.material_consumption_owner,
            self.revision,
            &mut self.ecs,
            &mut self.state_weight,
        )
    }

    fn drop_lot(&mut self, actor_id: &str, lot_id: &str) -> Result<()> {
        if self.process_bindings_for_lot(lot_id) { return Err("process-bound lot cannot be moved".into()); }
        let actor = self.entity(actor_id)?;
        if self.ecs.get::<Body>(actor).is_none() || self.ecs.get::<SealedContainer>(actor).is_some() {
            return Err("drop requires an unsealed actor".into());
        }
        let support = self.ecs.get::<Support>(actor).cloned();
        let lot_entity = self.entity(lot_id)?;
        let mut lot = self.ecs.get::<Lot>(lot_entity).cloned().ok_or("not a material lot")?;
        if lot.container != actor_id || lot.quantity == 0 { return Err("lot is not held by actor".into()); }
        let position = *self.ecs.get::<Position>(actor).ok_or("actor has no position")?;
        let (identity, next_lot) = material_output::allocate_lot_id(self.next_lot, |id| self.known.contains(&format!("ground.{id}")))?;
        let id = format!("ground.{identity}");
        if self.ids.len() >= 16384 { return Err("region entity capacity".into()); }
        let capacity = lot.quantity;
        let old_weight = self.registry.weight("hive.lot", &record(&lot));
        lot.container = id.clone();
        let weight = self.state_weight.saturating_sub(old_weight)
            + support.as_ref().map(|v| self.registry.weight("hive.support", &record(v))).unwrap_or(0)
            + 128 + id.len() + self.registry.weight("hive.lot", &record(&lot))
            + self.registry.weight("hive.position", &record(&position))
            + self.registry.weight("hive.container", &record(&Container { capacity }))
            + self.registry.weight("hive.ground-stock", &record(&GroundStock {}));
        if weight > STATE_BYTES { return Err("region canonical state capacity".into()); }
        // Admission above is complete. Move the same lot and its water, never
        // create a replacement lot or consume a delivery's stock.
        let ground = self.ecs.spawn((ExternalId(id.clone()), position, Container { capacity }, GroundStock {})).id();
        if let Some(owner) = self.ecs.get::<OwnedByParty>(actor).cloned() { self.ecs.entity_mut(ground).insert(owner); }
        if let Some(support) = support { self.ecs.entity_mut(ground).insert(support); }
        self.ids.insert(id.clone(), ground);
        self.known.insert(id.clone());
        self.visible_source_containers.insert(id.clone());
        self.index_ground_stock(&id, ground);
        self.contents.entry(actor_id.into()).or_default().remove(&lot_entity);
        self.contents.entry(id).or_default().insert(lot_entity);
        self.ecs.entity_mut(lot_entity).insert(lot);
        self.ground_stock_cleanup_pending = true;
        self.next_lot = next_lot;
        self.state_weight = weight;
        Ok(())
    }
    fn transfer(&mut self, lot: &str, from: &str, to: &str, quantity: u32) -> Result<()> {
        self.transfer_with_identity(lot, from, to, quantity, true).map(|_| ())
    }
    fn transfer_with_identity(&mut self, lot: &str, from: &str, to: &str, quantity: u32, moved_retains_identity: bool) -> Result<String> {
        self.transfer_with_identity_excluding(lot, from, to, quantity, moved_retains_identity, None)
    }
    fn transfer_with_identity_excluding(&mut self, lot: &str, from: &str, to: &str, quantity: u32, moved_retains_identity: bool, ignored_reservation: Option<&str>) -> Result<String> {
        if quantity == 0 || from == to {
            return Err("invalid transfer".into());
        }
        let source = self.entity(from)?;
        let dest = self.entity(to)?;
        let source_is_ground_stock = self.ecs.get::<GroundStock>(source).is_some();
        if self.ecs.get::<SealedContainer>(source).is_some()
            || self.ecs.get::<SealedContainer>(dest).is_some()
        {
            return Err("sealed container cannot transfer".into());
        }
        let e = self.entity(lot)?;
        if self.process_bindings_for_lot(lot) { return Err("process-bound lot cannot be moved".into()); }
        let mut stock = self
            .ecs
            .get::<Lot>(e)
            .cloned()
            .ok_or("not a material lot")?;
        let capacity = self
            .ecs
            .get::<Container>(dest)
            .ok_or("not a container")?
            .capacity;
        if stock.container != from || stock.quantity < quantity {
            return Err("stock is not available at source".into());
        }
        if self.ecs.get::<GroundStock>(dest).is_some() && !self.ground_stock_accepts(to, &stock.kind) {
            return Err("ground stock material is incompatible".into());
        }
        crate::supply_allocation::validate_capacity(self, e, dest, quantity, ignored_reservation)?;
        if self.quantity(to) + u64::from(quantity) > u64::from(capacity) {
            return Err("destination is full".into());
        }
        self.contact(source, dest)?;
        let current_water = self.ecs.get::<LotWater>(e).map(|water| water.water_kg);
        let player_owner = self.ecs.get::<OwnedBy>(e).cloned();
        let owner = self.ecs.get::<OwnedByParty>(e).cloned();
        let moved_water = current_water.map(|water| {
            if quantity == stock.quantity { water } else { water * f64::from(quantity) / f64::from(stock.quantity) }
        });
        let remainder_water = if quantity < stock.quantity {
            current_water.map(|water| water - moved_water.expect("split water"))
        } else { None };
        if let Some(water) = current_water {
            let moved = moved_water.unwrap_or(0.0);
            let remainder = remainder_water.unwrap_or(0.0);
            if !water.is_finite() || water < 0.0 || water > MAX_CARRIED_WATER_KG
                || (quantity < stock.quantity && (!moved.is_finite() || !remainder.is_finite()
                    || moved < 0.0 || remainder < 0.0
                    || (water > 0.0 && (moved <= 0.0 || remainder <= 0.0))))
            {
                return Err("carried water split is not representable".into());
            }
        }
        // Ordinary transfers retain the moved lot identity. Concurrent durable
        // delivery attempts instead leave the reserved source identity in
        // place and expose the newly allocated carried portion in their
        // committed activity receipt.
        if stock.quantity > quantity {
            if self.ids.len() >= 16384 {
                return Err("region entity capacity".into());
            }
            let (id, next) = material_output::allocate_lot_id(self.next_lot, |candidate| self.known.contains(candidate))?;
            let extra_lot = Lot {
                kind: stock.kind.clone(),
                quantity: if moved_retains_identity { stock.quantity - quantity } else { quantity },
                container: if moved_retains_identity { from.into() } else { to.into() },
            };
            let extra_container = extra_lot.container.clone();
            let extra_water = if moved_retains_identity { remainder_water } else { moved_water }
                .map(|water| LotWater { water_kg: water });
            let extra = id.len() + 128 + self.registry.weight("hive.lot", &record(&extra_lot))
                + player_owner.as_ref().map(|value| self.registry.weight("hive.owned-by", &record(value))).unwrap_or(0)
                + owner.as_ref().map(|value| self.registry.weight("hive.owned-by-party", &record(value))).unwrap_or(0)
                + extra_water.as_ref().map(|water| self.registry.weight("hive.lot-water", &record(water))).unwrap_or(0);
            if self.state_weight + extra > STATE_BYTES {
                return Err("region canonical state capacity".into());
            }
            let remainder = if let Some(water) = extra_water {
                self.ecs.spawn((ExternalId(id.clone()), extra_lot, water)).id()
            } else {
                self.ecs.spawn((ExternalId(id.clone()), extra_lot)).id()
            };
            if let Some(owner) = player_owner.clone() {
                self.ecs.entity_mut(remainder).insert(owner);
            }
            if let Some(owner) = owner.clone() {
                self.ecs.entity_mut(remainder).insert(owner);
            } else if !moved_retains_identity
                && source_is_ground_stock
                && self.ecs.get::<PartyMember>(dest).is_some()
            {
                let party = self
                    .ecs
                    .get::<PartyMember>(dest)
                    .expect("party member checked")
                    .party
                    .clone();
                self.ecs.entity_mut(remainder).insert(OwnedByParty { party });
            }
            self.next_lot = next;
            self.state_weight += extra;
            self.ids.insert(id.clone(), remainder);
            self.known.insert(id.clone());
            self.contents
                .entry(extra_container)
                .or_default()
                .insert(remainder);
            if !moved_retains_identity {
                stock.quantity -= quantity;
                self.ecs.entity_mut(e).insert(stock);
                if let Some(remainder) = remainder_water {
                    self.ecs.entity_mut(e).insert(LotWater { water_kg: remainder });
                }
                self.refresh_state_weight();
                return Ok(id);
            }
        }
        stock.quantity = quantity;
        stock.container = to.into();
        let claimed_public_lot = source_is_ground_stock
            && owner.is_none()
            && self.ecs.get::<PartyMember>(dest).is_some();
        self.ecs.entity_mut(e).insert(stock);
        if claimed_public_lot {
            let party = self.ecs.get::<PartyMember>(dest).expect("party member checked").party.clone();
            self.ecs.entity_mut(e).insert(OwnedByParty { party });
        }
        if let Some(moved) = moved_water {
            self.ecs.entity_mut(e).insert(LotWater { water_kg: moved });
        }
        self.contents.entry(from.into()).or_default().remove(&e);
        self.contents.entry(to.into()).or_default().insert(e);
        if source_is_ground_stock { self.ground_stock_cleanup_pending = true; }
        self.refresh_state_weight();
        Ok(lot.into())
    }
    /// Validate saved geometry even when work is waiting on a changed world.
    /// Waiting suspends movement, never the relationship between pose and route.
    fn validate_terrain_route_witness(&self, entity: Entity) -> Result<()> {
        let state = self.terrain_routes.get(&entity).ok_or("missing terrain witness")?;
        let route = self.routes.get(&entity).ok_or("missing terrain route")?;
        let capability = self.ecs.get::<Traversal>(entity).ok_or("missing terrain capability")?;
        let spacing = self.environment.as_ref().ok_or("missing terrain environment")?.world.cell_spacing_m();
        let stairs = self.environment.as_ref().ok_or("missing terrain environment")?.world.stair_edges().to_vec();
        let points = crate::terrain_route::waypoints_with_stairs(&state.path, crate::terrain_traversal::TraversalConfig {
            spacing, clearance_cells: capability.clearance_cells, max_step_cells: capability.max_step_cells,
        }, &stairs)?;
        let structure = self.environment.as_ref().expect("environment checked above").world.structure_projection_snapshot();
        let current_revision = self.environment.as_ref().expect("environment checked above").world.terrain_revision();
        if state.revision.is_some_and(|revision| revision > current_revision) { return Err("saved terrain route revision is in the future".into()); }
        if state.revision == Some(current_revision)
            && state.path.windows(2).any(|pair| structure.blocks_swept_transition(pair[0], pair[1], &stairs).unwrap_or(true)) {
            return Err("saved terrain route crosses a sealed structure face".into());
        }
        if points.len() > 4096 || crate::terrain_route::path_waypoint_count(&state.path, &stairs)? > 4096 { return Err("saved terrain waypoint budget exceeded".into()); }
        let offset = points.len().checked_sub(route.len()).filter(|index| *index < points.len())
            .ok_or("invalid terrain route progress")?;
        let origin_matches = if offset == 0 { state.origin == points[0] } else { state.origin == points[offset - 1] };
        if !route.iter().eq(points[offset..].iter()) || !origin_matches
            || state.target.as_ref() != route.front() {
            return Err("terrain route geometry witness mismatch".into());
        }
        let destination = self.ecs.get::<Destination>(entity);
        if state.suspended {
            if destination.is_some() { return Err("suspended contact has a destination".into()); }
        } else {
            let destination = destination.ok_or("missing terrain destination")?;
            let last = points.last().ok_or("empty terrain witness")?;
            if !state.pending && (last.x != destination.x || last.y != destination.y || last.z != destination.z || last.frame != destination.frame) {
                return Err("terrain route destination mismatch".into());
            }
            if state.pending && !state.waiting { return Err("pending terrain route is not waiting".into()); }
        }
        let pose = self.ecs.get::<Position>(entity).ok_or("missing terrain pose")?;
        let target = &points[offset];
        let delta = [target.x-state.origin.x, target.y-state.origin.y, target.z-state.origin.z];
        let relative = [pose.x-state.origin.x, pose.y-state.origin.y, pose.z-state.origin.z];
        let length2 = delta.iter().map(|v| v*v).sum::<f64>();
        let along = if length2 == 0.0 { 0.0 } else { relative.iter().zip(delta).map(|(a,b)| a*b).sum::<f64>()/length2 };
        let error2 = relative.iter().zip(delta).map(|(a,b)| (a-b*along).powi(2)).sum::<f64>();
        if !along.is_finite() || !error2.is_finite() || along < -1e-9 || along > 1.0+1e-9 || error2 > 1e-14 {
            return Err("terrain pose is outside active segment".into());
        }
        Ok(())
    }

    fn invalidate_terrain_routes(&mut self) -> Result<()> {
        if self.terrain_routes.is_empty() { return Ok(()); }
        // Rebuild physical checks at restore, without advancing the saved
        // sweep. A stale witness may await review; restoring cannot let it
        // move sooner than the same uninterrupted sequence of occurrences.
        let current = self.environment.as_ref().ok_or("terrain route needs environment")?.world.terrain_revision();
        let saved: Vec<_> = self.terrain_routes.iter().map(|(entity, state)| (*entity, state.revision, state.waiting)).collect();
        for (entity, _, waiting) in &saved {
            if !waiting { self.terrain_routes.get_mut(entity).expect("saved route").revision = None; }
        }
        self.invalidate_terrain_routes_bounded(usize::MAX)?;
        for (entity, revision, waiting) in saved {
            let state = self.terrain_routes.get_mut(&entity).expect("saved route");
            if revision != Some(current) {
                state.revision = revision;
                state.waiting = waiting;
            }
        }
        Ok(())
    }

    fn invalidate_terrain_routes_bounded(&mut self, mut validation_budget: usize) -> Result<()> {
        let mut candidates: Vec<_> = self.terrain_routes.iter().filter_map(|(entity, state)| (!state.waiting).then_some(*entity)).collect();
        candidates.sort_by_key(|entity| self.ecs.get::<ExternalId>(*entity).map(|id| id.0.clone()));
        let mut invalid = Vec::new();
        for entity in candidates {
            let Some(capability) = self.ecs.get::<Traversal>(entity).copied() else { invalid.push(entity); continue };
            let environment_view = self.environment.as_ref().ok_or("terrain route needs environment")?;
            let spacing = environment_view.world.cell_spacing_m();
            if let Some(state) = self.terrain_routes.get(&entity) {
                if let Some(target) = &state.target {
                    let position = *self.ecs.get::<Position>(entity).ok_or("terrain route actor lost position")?;
                    let current = navigation::point(position);
                    let delta = [target.x - state.origin.x, target.y - state.origin.y, target.z - state.origin.z];
                    let length2 = delta.iter().map(|value| value * value).sum::<f64>();
                    let along = if length2 <= f64::EPSILON { 0.0 } else {
                        ((current.x - state.origin.x) * delta[0] + (current.y - state.origin.y) * delta[1]
                            + (current.z - state.origin.z) * delta[2]) / length2
                    };
                    let along = along.clamp(0.0, 1.0);
                    let expected = [state.origin.x + delta[0] * along, state.origin.y + delta[1] * along, state.origin.z + delta[2] * along];
                    let error = ((current.x - expected[0]).powi(2) + (current.y - expected[1]).powi(2) + (current.z - expected[2]).powi(2)).sqrt();
                    if !error.is_finite() || error > 1e-7 || along < -1e-9 || along > 1.0 + 1e-9 {
                        invalid.push(entity);
                        continue;
                    }
                }
            }
            let current_revision = environment_view.world.terrain_revision();
            let prior_revision = self.terrain_routes.get(&entity).and_then(|state| state.revision);
            if prior_revision == Some(current_revision) { continue; }
            // The allowance owns intersection scans as well as full geometry
            // validation. Every admitted route has at most 4096 waypoints and
            // terrain_changes bounds its column journal; no whole-population
            // footprint scan can happen before this gate.
            if validation_budget == 0 { break; }
            validation_budget -= 1;
            if let Some(prior) = prior_revision {
                if let crate::terrain_water::TerrainChangeSet::ChangedColumns { columns, .. } = environment_view.world.terrain_changes(prior) {
                    let path = &self.terrain_routes[&entity].path;
                    // Stair sweeps may occupy the columns between endpoints.
                    // Checking each edge's horizontal envelope also handles hops.
                    let intersects = crate::terrain_route::intersects_columns(path, &columns);
                    if !intersects {
                        self.terrain_routes.get_mut(&entity).expect("route exists").revision = Some(current_revision);
                        continue;
                    }
                }
            }
            let path = self.terrain_routes.get(&entity).map(|state| state.path.clone()).ok_or("terrain route witness missing")?;
            let environment = self.environment.as_mut().ok_or("terrain route needs environment")?;
            let config = crate::terrain_traversal::TraversalConfig {
                spacing,
                clearance_cells: capability.clearance_cells,
                max_step_cells: capability.max_step_cells,
            };
            let stairs = environment.world.stair_edges().to_vec();
            let structure = environment.world.structure_projection_snapshot();
            let expected_points = crate::terrain_route::waypoints_with_stairs(&path, config, &stairs)?;
            let remaining: Vec<_> = self.routes.get(&entity).map(|route| route.iter().cloned().collect()).unwrap_or_default();
            let offset = expected_points.len().checked_sub(remaining.len());
            let correspondence = offset.is_some_and(|offset| {
                remaining == expected_points[offset..]
                    && self.terrain_routes[&entity].origin == if offset == 0 { expected_points[0].clone() } else { expected_points[offset - 1].clone() }
                    && (if self.terrain_routes[&entity].suspended {
                        self.ecs.get::<Destination>(entity).is_none()
                    } else { self.ecs.get::<Destination>(entity).is_some_and(|target| {
                        expected_points.last().is_some_and(|last| last.x == target.x && last.y == target.y && last.z == target.z && last.frame == target.frame)
                    }) })
            });
            if !correspondence {
                invalid.push(entity);
                continue;
            }
            let mut query = |cell| environment.world.traversal_material(cell);
            let next_waypoint = offset.ok_or("missing route progress")?;
            let active = if next_waypoint == 0 {
                0
            } else {
                crate::terrain_route::active_support_index_with_stairs(&path, next_waypoint, &stairs)?
            };
            let boundary_valid = path[active..].windows(2).all(|pair| !structure.blocks_swept_transition(pair[0], pair[1], &stairs).unwrap_or(true));
            let valid = boundary_valid && crate::terrain_traversal::path_supported_with_stairs(&path[active..], config, &mut query, &stairs)?;
            if !valid { invalid.push(entity); }
            else if let Some(state) = self.terrain_routes.get_mut(&entity) { state.revision = Some(current_revision); }
        }
        for entity in invalid {
            if let Some(state) = self.terrain_routes.get_mut(&entity) { state.waiting = true; state.revision = None; }
        }
        Ok(())
    }

    /// Replan a route that became stale at a terrain revision boundary. The
    /// native planner retains the active prefix/history while pricing the
    /// replacement. A yielded search preserves intent and contact; a witnessed
    /// dead end releases the destination while retaining mid-edge contact.
    fn recover_invalidated_terrain_routes(&mut self) -> Result<()> {
        let mut candidates: Vec<_> = self.terrain_routes.iter()
            .filter_map(|(entity, state)| (state.waiting && !state.suspended).then_some(*entity))
            .collect();
        candidates.sort_by_key(|entity| self.ecs.get::<ExternalId>(*entity).map(|id| id.0.clone()));
        for entity in candidates.into_iter().take(8) {
            let Some(destination) = self.ecs.get::<Destination>(entity).cloned() else {
                self.clear_destination(entity);
                continue;
            };
            let position = *self.ecs.get::<Position>(entity).ok_or("terrain route actor lost position")?;
            let target = Point {
                x: destination.x,
                y: destination.y,
                z: destination.z,
                frame: destination.frame.clone(),
            };
            match route_query::classify_route(self.route_for(entity, position, &target))? {
                route_query::SearchOutcome::Reachable(prepared) => self.install_route(entity, prepared),
                route_query::SearchOutcome::Deferred(_) => {},
                route_query::SearchOutcome::NoPath(_) => {
                    // The destination is the lock seen by work and delivery
                    // callers, so clearing it is the explicit unreachable
                    // lifecycle outcome. The existing route witness remains
                    // available to clear_destination for suspended contact.
                    self.clear_destination(entity);
                }
            }
        }
        Ok(())
    }

    fn advance_movement(&mut self, delta: f64) -> Result<()> {
        self.arrived_routes.clear();
        self.invalidate_terrain_routes_bounded(8)?;
        self.recover_invalidated_terrain_routes()?;
        self.routes.retain_changed(|entity, path| {
            if self.terrain_routes.get(entity).is_some_and(|state| state.suspended) { return true; }
            let speed = self.ecs.get::<Body>(*entity).expect("route body").speed;
            let target = self
                .ecs
                .get::<Destination>(*entity)
                .expect("route destination")
                .clone();
            if self.terrain_routes.get(entity).is_some_and(|state| state.waiting
                || state.revision != self.environment.as_ref().map(|environment| environment.world.terrain_revision())) {
                return true;
            }
            let mut p = *self.ecs.get::<Position>(*entity).expect("route position");
            if self.terrain_routes.contains_key(entity) {
                let blocked = self.blocked_by_frame.get(&None).expect("terrain obstacle index");
                if terrain_motion_blocked(p, path, speed * delta, blocked) {
                    let state = self.terrain_routes.get_mut(entity).expect("terrain route");
                    state.waiting = true;
                    state.revision = None;
                    return true;
                }
            }
            let last_reached = navigation::advance(&mut p, path, speed * delta);
            if let Some(point) = last_reached {
                if let Some(state) = self.terrain_routes.get_mut(entity) {
                    state.origin = point;
                    state.target = path.front().cloned();
                }
            }
            p.facing = target.facing;
            self.ecs.entity_mut(*entity).insert(p);
            if path.is_empty() {
                self.arrived_routes.insert(*entity);
                self.state_weight -= self.registry.weight("hive.destination", &record(&target));
                self.ecs.entity_mut(*entity).remove::<Destination>();
                false
            } else {
                true
            }
        });
        let finished: Vec<_> = self.terrain_routes.keys().filter(|entity| !self.routes.contains_key(entity)).copied().collect();
        for entity in finished { self.terrain_routes.remove(&entity); }
        Ok(())
    }

    fn advance_direct(&mut self, delta: f64) -> Result<()> {
        if delta == 0.0 { return Ok(()); }
        let entities: Vec<Entity> = self.direct.keys().copied().collect();
        for entity in entities {
            let Some(mut state) = self.direct.remove(&entity) else { continue };
            let credit = state.remainder + delta;
            let mut steps = ((credit + 1e-9) / navigation::DIRECT_STEP_SECONDS).floor() as usize;
            steps = steps.min(state.queue.len());
            let remainder = if state.queue.is_empty() || steps == state.queue.len() { 0.0 }
                else { (credit - steps as f64 * navigation::DIRECT_STEP_SECONDS).max(0.0) };
            let position = *self.ecs.get::<Position>(entity).ok_or("direct stream lost position")?;
            let body = *self.ecs.get::<Body>(entity).ok_or("direct stream lost body")?;
            let blocked = self.blocked_by_frame.get(&None).cloned().unwrap_or_default();
            let bounds = self.frame_bounds(None)?;
            let structure = self.environment.as_ref().map(|environment| environment.world.structure_projection_snapshot());
            let mut next = position;
            for input in state.queue.iter().take(steps) {
                let crossing = |from_x: f64, from_z: f64, to_x: f64, to_z: f64, y: i32| {
                    let Some(projection) = structure.as_ref() else { return false; };
                    let from = crate::generation::Cell { x: from_x.round() as i64, y, z: from_z.round() as i64 };
                    let to = crate::generation::Cell { x: to_x.round() as i64, y, z: to_z.round() as i64 };
                    if from == to { return false; }
                    projection.blocks_direct_decomposition(from, to).unwrap_or(true)
                };
                next = navigation::direct_step_with_crossings(next, input.x, input.z, body.speed, &blocked, bounds, &crossing)?;
                state.last_processed = input.sequence;
            }
            state.queue.drain(..steps);
            state.remainder = remainder;
            self.ecs.entity_mut(entity).insert(next);
            self.direct.insert(entity, state);
        }
        Ok(())
    }
}

#[cfg(test)]
mod entity_membership_tests {
    use super::Kernel;
    use serde_json::json;

    #[test]
    fn membership_is_authoritative_bounded_and_rejects_invalid_batches() {
        let mut kernel = Kernel::new();
        kernel.load(&serde_json::to_string(&json!({
            "format":"hive-game", "version":3, "game":"membership",
            "components":[], "materialCatalog":[], "initial":[{"id":"actor","components":{}}]
        })).unwrap()).unwrap();
        assert_eq!(kernel.entity_membership_json(r#"["actor","missing"]"#).unwrap(), "[true,false]");
        assert!(kernel.entity_membership_json(r#"["bad id"]"#).is_err());
        let too_many = serde_json::to_string(&(0..129).map(|i| format!("entity-{i}")).collect::<Vec<_>>()).unwrap();
        assert!(kernel.entity_membership_json(&too_many).is_err());
    }
}

#[cfg(test)]
mod lot_water_tests {
    use super::{Kernel, MaterialOutputSpec};
    use serde_json::{json, Value};

    fn scene(water: Option<Value>, dest_capacity: u32) -> String {
        let mut lot = json!({"hive.lot":{"kind":"water-lot","quantity":4,"container":"source"}});
        if let Some(value) = water { lot["hive.lot-water"] = value; }
        serde_json::to_string(&json!({
            "format":"hive-game", "version":3, "game":"lot-water",
            "components":[], "materialCatalog":[], "initial":[
                {"id":"source","components":{"hive.position":{"x":0.0,"y":0.0,"z":0.0,"facing":0.0},"hive.container":{"capacity":10}}},
                {"id":"dest","components":{"hive.position":{"x":1.0,"y":0.0,"z":0.0,"facing":0.0},"hive.container":{"capacity":dest_capacity}}},
                {"id":"lot","components":lot}
            ]
        })).unwrap()
    }
    fn transfer(kernel: &mut Kernel, quantity: u32) -> Value {
        serde_json::from_str(&kernel.advance_json(&json!({
            "delta":0.0,"writes":[],"actions":[{"scope":{"kind":"host"},"request":{"kind":"transfer","lot":"lot","from":"source","to":"dest","quantity":quantity}}]
        }).to_string()).unwrap()).unwrap()
    }
    fn rows(kernel: &mut Kernel, component: &str) -> Value {
        serde_json::from_str(&kernel.query_json(&format!("[\"{component}\"]")).unwrap()).unwrap()
    }
    fn sealed_scene(source: bool, destination: bool) -> String {
        let mut value: Value = serde_json::from_str(&scene(Some(json!({"waterKg":8.0})), 10)).unwrap();
        if source {
            value["initial"][0]["components"]["hive.sealed-container"] = json!({});
        }
        if destination {
            value["initial"][1]["components"]["hive.sealed-container"] = json!({});
        }
        value.to_string()
    }

    fn portable_scene(holder: &str, vessel_container: &str) -> String {
        serde_json::to_string(&json!({
            "format":"hive-game", "version":3, "game":"portable-contact",
            "components":[], "materialCatalog":[], "initial":[
                {"id":"worker","components":{"hive.position":{"x":0.0,"y":0.0,"z":0.0,"facing":0.0},"hive.container":{"capacity":8}}},
                {"id":"dest","components":{"hive.position":{"x":1.0,"y":0.0,"z":0.0,"facing":0.0},"hive.container":{"capacity":8}}},
                {"id":"vessel","components":{"hive.container":{"capacity":4},"hive.lot":{"kind":"jug","quantity":1,"container":holder}}},
                {"id":"water","components":{"hive.lot":{"kind":"water","quantity":2,"container":vessel_container}}}
            ]
        })).unwrap()
    }

    #[test]
    fn partial_and_whole_transfer_conserve_carried_water() {
        let mut kernel = Kernel::new();
        kernel.load(&scene(Some(json!({"waterKg":8.0})), 10)).unwrap();
        assert_eq!(transfer(&mut kernel, 2)["results"][0]["accepted"], true);
        let water = rows(&mut kernel, "hive.lot-water");
        let mut values: Vec<f64> = water.as_array().unwrap().iter().map(|row| row["components"]["hive.lot-water"]["waterKg"].as_f64().unwrap()).collect();
        values.sort_by(|a, b| a.partial_cmp(b).unwrap());
        assert_eq!(values, vec![4.0, 4.0]);
        let mut whole = Kernel::new();
        whole.load(&scene(Some(json!({"waterKg":10.3})), 10)).unwrap();
        assert_eq!(transfer(&mut whole, 4)["results"][0]["accepted"], true);
        assert_eq!(rows(&mut whole, "hive.lot-water").as_array().unwrap().len(), 1);
        assert_eq!(rows(&mut whole, "hive.lot-water")[0]["components"]["hive.lot-water"]["waterKg"], 10.3);
    }

    #[test]
    fn differently_named_portable_container_uses_holder_contact() {
        let mut kernel = Kernel::new();
        kernel.load(&portable_scene("worker", "vessel")).unwrap();
        let result: Value = serde_json::from_str(&kernel.advance_json(&json!({
            "delta":0.0,"writes":[],"actions":[{"scope":{"kind":"host"},"request":{"kind":"transfer","lot":"water","from":"vessel","to":"dest","quantity":2}}]
        }).to_string()).unwrap()).unwrap();
        assert_eq!(result["results"][0]["accepted"], true);
        assert_eq!(rows(&mut kernel, "hive.lot").as_array().unwrap().iter().map(|row| row["components"]["hive.lot"]["quantity"].as_u64().unwrap()).sum::<u64>(), 3);
    }

    #[test]
    fn portable_custody_cycle_rejects_without_unbounded_contact_walk() {
        let mut kernel = Kernel::new();
        kernel.load(&portable_scene("vessel", "vessel")).unwrap();
        let vessel = kernel.entity("vessel").unwrap();
        assert_eq!(kernel.contact_pose(vessel).unwrap_err(), "container custody cycle");
    }

    #[test]
    fn invalid_water_reference_and_mass_are_rejected_on_load_and_restore() {
        let mut orphan: Value = serde_json::from_str(&scene(None, 10)).unwrap();
        let components = orphan["initial"][2]["components"].as_object_mut().unwrap();
        assert!(components.remove("hive.lot").is_some());
        components.insert("hive.lot-water".into(), json!({"waterKg":1.0}));
        assert!(Kernel::new().load(&orphan.to_string()).is_err());
        assert!(Kernel::new().load(&scene(Some(json!({"waterKg":-1.0})), 10)).is_err());
        assert!(Kernel::new().load(&scene(Some(json!({"waterKg":8.0})), 10).replace("\"quantity\":4", "\"quantity\":0")).is_err());
        let mut kernel = Kernel::new();
        kernel.load(&scene(Some(json!({"waterKg":8.0})), 10)).unwrap();
        let forged = kernel.snapshot_json().unwrap().replace("\"waterKg\":8.0", "\"waterKg\":-1.0");
        assert!(Kernel::new().restore_json(&forged).is_err());
    }

    #[test]
    fn full_destination_and_wet_consume_reject_without_mutation() {
        let mut full = Kernel::new();
        full.load(&scene(Some(json!({"waterKg":8.0})), 1)).unwrap();
        assert!(transfer(&mut full, 1)["results"][0]["accepted"] == true);
        let before_full_lot = rows(&mut full, "hive.lot");
        let before_full_water = rows(&mut full, "hive.lot-water");
        let rejected: Value = serde_json::from_str(&full.advance_json(r#"{"delta":0,"writes":[],"actions":[{"scope":{"kind":"host"},"request":{"kind":"transfer","lot":"lot.1","from":"source","to":"dest","quantity":1}}]}"#).unwrap()).unwrap();
        assert_eq!(rejected["results"][0]["accepted"], false);
        assert_eq!(rows(&mut full, "hive.lot"), before_full_lot);
        assert_eq!(rows(&mut full, "hive.lot-water"), before_full_water);
        let mut wet = Kernel::new(); wet.load(&scene(Some(json!({"waterKg":8.0})), 10)).unwrap();
        let before_wet_lot = rows(&mut wet, "hive.lot");
        let before_wet_water = rows(&mut wet, "hive.lot-water");
        wet.advance_json(r#"{"delta":0,"writes":[],"actions":[{"scope":{"kind":"host"},"request":{"kind":"consume","entity":"source","lot":"lot","quantity":1}}]}"#).unwrap();
        assert_eq!(rows(&mut wet, "hive.lot"), before_wet_lot);
        assert_eq!(rows(&mut wet, "hive.lot-water"), before_wet_water);
        let mut tiny = Kernel::new(); tiny.load(&scene(Some(json!({"waterKg":5e-324})), 10)).unwrap();
        let tiny_before = rows(&mut tiny, "hive.lot-water");
        assert_eq!(transfer(&mut tiny, 1)["results"][0]["accepted"], false);
        assert_eq!(rows(&mut tiny, "hive.lot-water"), tiny_before);
        let mut dry = Kernel::new(); dry.load(&scene(None, 10)).unwrap();
        let dry_result: Value = serde_json::from_str(&dry.advance_json(r#"{"delta":0,"writes":[],"actions":[{"scope":{"kind":"host"},"request":{"kind":"consume","entity":"source","lot":"lot","quantity":1}}]}"#).unwrap()).unwrap();
        assert_eq!(dry_result["results"][0]["accepted"], true);
        assert_eq!(rows(&mut dry, "hive.lot")[0]["components"]["hive.lot"]["quantity"], 3);
    }

    #[test]
    fn sealed_source_or_destination_rejects_transfer_without_mutation() {
        for (sealed_source, sealed_destination) in [(true, false), (false, true)] {
            let mut kernel = Kernel::new();
            kernel.load(&sealed_scene(sealed_source, sealed_destination)).unwrap();
            let before_lot = rows(&mut kernel, "hive.lot");
            let before_water = rows(&mut kernel, "hive.lot-water");
            let result = transfer(&mut kernel, 1);
            assert_eq!(result["results"][0]["accepted"], false);
            assert_eq!(rows(&mut kernel, "hive.lot"), before_lot);
            assert_eq!(rows(&mut kernel, "hive.lot-water"), before_water);
        }
    }

    #[test]
    fn sealed_container_rejects_consume_and_survives_snapshot_restore() {
        let mut kernel = Kernel::new();
        kernel.load(&sealed_scene(true, false)).unwrap();
        let before = rows(&mut kernel, "hive.lot");
        let result: Value = serde_json::from_str(&kernel.advance_json(
            r#"{"delta":0,"writes":[],"actions":[{"scope":{"kind":"host"},"request":{"kind":"consume","entity":"source","lot":"lot","quantity":1}}]}"#,
        ).unwrap()).unwrap();
        assert_eq!(result["results"][0]["accepted"], false);
        assert_eq!(result["results"][0]["reason"], "sealed container cannot consume");
        assert_eq!(rows(&mut kernel, "hive.lot"), before);
        let saved = kernel.snapshot_json().unwrap();
        let mut restored = Kernel::new();
        restored.restore_json(&saved).unwrap();
        assert_eq!(rows(&mut restored, "hive.sealed-container"), json!([
            {"id":"source", "components":{"hive.sealed-container":{}}}
        ]));
        assert_eq!(rows(&mut restored, "hive.lot"), before);
    }

    #[test]
    fn sealed_container_rejects_material_output_before_publication() {
        let mut kernel = Kernel::new();
        kernel.load(&sealed_scene(true, false)).unwrap();
        let before = kernel.snapshot_json().unwrap();
        assert!(kernel.complete_material_output(MaterialOutputSpec {
            container: "source".into(),
            kind: "spoil".into(),
            quantity: 1,
            water_kg: None,
        }).is_err());
        assert_eq!(kernel.snapshot_json().unwrap(), before);
    }

    #[test]
    fn sealed_marker_requires_container_and_is_not_authored_writable() {
        let mut invalid: Value = serde_json::from_str(&sealed_scene(true, false)).unwrap();
        invalid["initial"][0]["components"].as_object_mut().unwrap().remove("hive.container");
        assert!(Kernel::new().load(&invalid.to_string()).is_err());

        let mut kernel = Kernel::new();
        kernel.load(&serde_json::to_string(&json!({
            "format":"hive-game", "version":3, "game":"sealed",
            "components":[], "materialCatalog":[], "initial":[
                {"id":"actor","components":{}},
                {"id":"container","components":{"hive.position":{"x":0,"y":0,"z":0,"facing":0},"hive.container":{"capacity":2}}}
            ]
        })).unwrap()).unwrap();
        let before = kernel.snapshot_json().unwrap();
        let forged_create = json!([{"id":"forged","components":{"hive.sealed-container":{}}}]);
        assert!(kernel.advance_json(&json!({"delta":0,"creates":forged_create,"removes":[],"writes":[],"actions":[]}).to_string()).is_err());
        assert_eq!(kernel.snapshot_json().unwrap(), before);
        let forged = json!({"delta":0,"creates":[],"removes":[],"writes":[
            {"entity":"container","component":"hive.sealed-container","value":{}}
        ],"actions":[]});
        assert!(kernel.advance_json(&forged.to_string()).is_err());
        assert_eq!(kernel.snapshot_json().unwrap(), before);
    }
}

#[cfg(test)]
mod combat_tests {
    use super::Kernel;
    use serde_json::json;

    fn combat_scene() -> String {
        serde_json::to_string(&json!({
            "format": "hive-game",
            "version": 3,
            "game": "formation-combat",
            "components": [],
            "materialCatalog": [],
            "initial": [
                {"id":"cannon", "components": {
                    "hive.position":{"x":0.0,"y":0.0,"z":0.0,"facing":0.0},
                    "hive.container":{"capacity":4},
                    "hive.launcher":{"ammoKind":"cannonball","muzzleX":0.0,"muzzleY":0.0,"muzzleZ":0.0,"maxSpeed":20.0,"projectileRadius":0.1,"maxRange":20.0,"maxLifetime":5.0,"projectileSprite":"cannonball","projectileLabel":"Cannonball","gravity":0.0,"penetration":0.0}
                }},
                {"id":"ball", "components": {
                    "hive.position":{"x":3.0,"y":0.0,"z":0.0,"facing":0.0},
                    "hive.collider":{"shape":"ball","radius":0.5,"halfX":0.0,"halfY":0.0,"halfZ":0.0,"yaw":0.0,"offsetX":0.0,"offsetY":0.0,"offsetZ":0.0}
                }},
                {"id":"ammo", "components": {
                    "hive.lot":{"kind":"cannonball","quantity":1,"container":"cannon"}
                }}
            ]
        }))
        .expect("combat fixture")
    }

    fn sealed_combat_scene() -> String {
        let mut value: serde_json::Value = serde_json::from_str(&combat_scene()).unwrap();
        value["initial"][0]["components"]["hive.sealed-container"] = json!({});
        value.to_string()
    }

    #[test]
    fn public_advance_returns_one_launch_and_one_new_impact() {
        let mut kernel = Kernel::new();
        kernel.load(&combat_scene()).expect("load combat fixture");
        let response = kernel
            .advance_json(
                r#"{"delta":0.5,"writes":[],"actions":[{"scope":{"kind":"host"},"request":{"kind":"launch","launcher":"cannon","ammunition":"ammo","velocity":{"x":10.0,"y":0.0,"z":0.0}}}]}"#,
            )
            .expect("launch and sweep");
        let value: serde_json::Value = serde_json::from_str(&response).expect("response JSON");
        assert_eq!(value["results"][0]["accepted"], true);
        assert_eq!(value["results"][0]["projectileId"], "shot.1");
        assert_eq!(value["results"][0]["launchPoint"], json!({"x":0.0,"y":0.0,"z":0.0}));
        assert_eq!(value["impacts"][0]["sourceId"], "cannon");
        assert_eq!(value["impacts"][0]["targetId"], "ball");
        assert!(value["impacts"][0]["time"].as_f64().unwrap() > 0.0);
    }

    #[test]
    fn rejected_launch_does_not_spend_ammo_or_allocate_projectile() {
        let mut kernel = Kernel::new();
        kernel.load(&combat_scene()).expect("load combat fixture");
        let response = kernel
            .advance_json(
                r#"{"delta":0.0,"writes":[],"actions":[{"scope":{"kind":"host"},"request":{"kind":"launch","launcher":"cannon","ammunition":"ammo","velocity":{"x":100.0,"y":0.0,"z":0.0}}}]}"#,
            )
            .expect("rejected action remains a valid batch");
        let value: serde_json::Value = serde_json::from_str(&response).expect("response JSON");
        assert_eq!(value["results"][0]["accepted"], false);
        assert_eq!(value["results"][0]["reason"], "launch velocity exceeds launcher limit");
        let rows: serde_json::Value = serde_json::from_str(
            &kernel.query_json(r#"["hive.lot"]"#).expect("lot query"),
        )
        .expect("lot JSON");
        let ammo = rows
            .as_array()
            .unwrap()
            .iter()
            .find(|row| row["id"] == "ammo")
            .expect("ammo lot");
        assert_eq!(ammo["components"]["hive.lot"]["quantity"], 1);
        assert!(!kernel
            .render_json()
            .expect("render")
            .contains("shot.1"));
    }

    #[test]
    fn sealed_launcher_rejects_launch_without_spending_ammo_or_projectile() {
        let mut kernel = Kernel::new();
        kernel.load(&sealed_combat_scene()).unwrap();
        let before_lot: serde_json::Value = serde_json::from_str(
            &kernel.query_json(r#"["hive.lot"]"#).unwrap(),
        ).unwrap();
        let before_projectiles: serde_json::Value = serde_json::from_str(
            &kernel.query_json(r#"["hive.projectile"]"#).unwrap(),
        ).unwrap();
        let response: serde_json::Value = serde_json::from_str(&kernel.advance_json(
            r#"{"delta":0.0,"writes":[],"actions":[{"scope":{"kind":"host"},"request":{"kind":"launch","launcher":"cannon","ammunition":"ammo","velocity":{"x":10.0,"y":0.0,"z":0.0}}}]}"#,
        ).unwrap()).unwrap();
        assert_eq!(response["results"][0]["accepted"], false);
        assert_eq!(response["results"][0]["reason"], "sealed container cannot launch ammunition");
        let after_lot: serde_json::Value = serde_json::from_str(
            &kernel.query_json(r#"["hive.lot"]"#).unwrap(),
        ).unwrap();
        let after_projectiles: serde_json::Value = serde_json::from_str(
            &kernel.query_json(r#"["hive.projectile"]"#).unwrap(),
        ).unwrap();
        assert_eq!(after_lot, before_lot);
        assert_eq!(after_projectiles, before_projectiles);
    }

    #[test]
    fn public_displace_crosses_cells_without_teleporting_through_obstacle() {
        let scene = combat_scene().replace(
            "\"hive.collider\":{\"shape\":\"ball\",\"radius\":0.5,\"halfX\":0.0,\"halfY\":0.0,\"halfZ\":0.0,\"yaw\":0.0,\"offsetX\":0.0,\"offsetY\":0.0,\"offsetZ\":0.0}",
            "\"hive.collider\":{\"shape\":\"ball\",\"radius\":0.5,\"halfX\":0.0,\"halfY\":0.0,\"halfZ\":0.0,\"yaw\":0.0,\"offsetX\":0.0,\"offsetY\":0.0,\"offsetZ\":0.0},\"hive.obstacle\":{\"occupied\":false}",
        );
        let mut kernel = Kernel::new();
        kernel.load(&scene).expect("load combat fixture");
        let response = kernel
            .advance_json(
                r#"{"delta":0.0,"writes":[],"actions":[{"scope":{"kind":"host"},"request":{"kind":"displace","entity":"cannon","delta":{"x":1.5,"y":0.0,"z":0.0}}}]}"#,
            )
            .expect("displace across cells");
        let value: serde_json::Value = serde_json::from_str(&response).expect("response JSON");
        assert_eq!(value["results"][0]["accepted"], true);
        let facts: serde_json::Value = serde_json::from_str(&kernel.render_json().expect("render"))
            .expect("render JSON");
        let cannon = facts
            .as_array()
            .unwrap()
            .iter()
            .find(|fact| fact["id"] == "cannon")
            .expect("cannon fact");
        assert_eq!(cannon["local"]["position"]["x"], 1.5);
    }

    #[test]
    fn public_snapshot_restores_in_flight_projectile_and_counter() {
        let mut kernel = Kernel::new();
        kernel.load(&combat_scene()).expect("load combat fixture");
        kernel
            .advance_json(
                r#"{"delta":0.05,"writes":[],"actions":[{"scope":{"kind":"host"},"request":{"kind":"launch","launcher":"cannon","ammunition":"ammo","velocity":{"x":10.0,"y":0.0,"z":0.0}}}]}"#,
            )
            .expect("launch");
        let snapshot = kernel.snapshot_json().expect("snapshot");
        let mut restored = Kernel::new();
        restored.restore_json(&snapshot).expect("restore");
        assert_eq!(restored.snapshot_json().expect("restored snapshot"), snapshot);
    }

    fn rotating_cuboid_scene(target_x: f64) -> String {
        let mut scene: serde_json::Value = serde_json::from_str(&combat_scene()).expect("fixture JSON");
        let target = scene["initial"]
            .as_array_mut()
            .unwrap()
            .iter_mut()
            .find(|row| row["id"] == "ball")
            .expect("target fixture");
        target["components"]["hive.position"]["x"] = json!(target_x);
        target["components"]["hive.collider"]["shape"] = json!("cuboid");
        target["components"]["hive.collider"]["radius"] = json!(0.0);
        target["components"]["hive.collider"]["halfX"] = json!(0.5);
        target["components"]["hive.collider"]["halfY"] = json!(0.5);
        target["components"]["hive.collider"]["halfZ"] = json!(0.5);
        target["components"]["hive.body"] = json!({"speed":1.0});
        target["components"]["hive.destination"] = json!({
            "x":target_x,"y":0.0,"z":1.0,"facing":1.0,"frame":null
        });
        serde_json::to_string(&scene).expect("fixture serialization")
    }

    #[test]
    fn relevant_rotating_cuboid_rejects_and_restores_whole_step() {
        let mut kernel = Kernel::new();
        kernel.load(&rotating_cuboid_scene(3.0)).expect("load rotating fixture");
        let before = kernel.snapshot_json().expect("before snapshot");
        let result = kernel.advance_json(
            r#"{"delta":0.5,"writes":[],"actions":[{"scope":{"kind":"host"},"request":{"kind":"launch","launcher":"cannon","ammunition":"ammo","velocity":{"x":10.0,"y":0.0,"z":0.0}}}]}"#,
        );
        assert!(result.is_err());
        assert_eq!(kernel.snapshot_json().expect("rollback snapshot"), before);
    }

    #[test]
    fn disposable_candidate_failure_poisoned_until_durable_restore() {
        let mut kernel = Kernel::new();
        kernel.load(&rotating_cuboid_scene(3.0)).unwrap();
        let before = kernel.snapshot_json().unwrap();
        assert!(kernel.advance_candidate_json(
            r#"{"delta":0.5,"writes":[],"actions":[{"scope":{"kind":"host"},"request":{"kind":"launch","launcher":"cannon","ammunition":"ammo","velocity":{"x":10.0,"y":0.0,"z":0.0}}}]}"#,
        ).is_err());
        assert!(kernel.snapshot_json().is_err());
        assert!(kernel.save_records().is_err());
        assert!(kernel.query_json(r#"{"components":["hive.position"]}"#).is_err());
        assert!(kernel.advance_json(r#"{"delta":0,"writes":[],"actions":[]}"#).is_err());
        assert!(kernel.advance_candidate_json(r#"{"delta":0,"writes":[],"actions":[]}"#).is_err());
        kernel.restore_json(&before).unwrap();
        assert_eq!(kernel.snapshot_json().unwrap(), before);
    }

    #[test]
    fn distant_rotating_cuboid_does_not_block_shot() {
        let mut kernel = Kernel::new();
        kernel.load(&rotating_cuboid_scene(100.0)).expect("load distant fixture");
        let response = kernel
            .advance_json(
                r#"{"delta":0.5,"writes":[],"actions":[{"scope":{"kind":"host"},"request":{"kind":"launch","launcher":"cannon","ammunition":"ammo","velocity":{"x":10.0,"y":0.0,"z":0.0}}}]}"#,
            )
            .expect("distant rotation is irrelevant");
        let value: serde_json::Value = serde_json::from_str(&response).expect("response JSON");
        assert!(value["results"][0]["accepted"].as_bool().unwrap());
        assert_eq!(value["impacts"].as_array().unwrap().len(), 0);
    }

    #[test]
    fn zero_delta_preserves_active_projectile() {
        let mut kernel = Kernel::new();
        kernel.load(&combat_scene()).expect("load combat fixture");
        kernel
            .advance_json(
                r#"{"delta":0.0,"writes":[],"actions":[{"scope":{"kind":"host"},"request":{"kind":"launch","launcher":"cannon","ammunition":"ammo","velocity":{"x":10.0,"y":0.0,"z":0.0}}}]}"#,
            )
            .expect("zero delta launch");
        assert!(kernel.render_json().expect("render").contains("shot.1"));
        kernel
            .advance_json(r#"{"delta":0.0,"writes":[],"actions":[]}"#)
            .expect("zero delta idle");
        assert!(kernel.render_json().expect("render").contains("shot.1"));
    }

    #[test]
    fn forged_snapshot_projectile_launcher_is_rejected() {
        let mut kernel = Kernel::new();
        kernel.load(&combat_scene()).expect("load combat fixture");
        kernel
            .advance_json(
                r#"{"delta":0.05,"writes":[],"actions":[{"scope":{"kind":"host"},"request":{"kind":"launch","launcher":"cannon","ammunition":"ammo","velocity":{"x":10.0,"y":0.0,"z":0.0}}}]}"#,
            )
            .expect("launch");
        let snapshot = kernel
            .snapshot_json()
            .expect("snapshot")
            .replace("\"launcher\":\"cannon\"", "\"launcher\":\"ammo\"");
        let mut restored = Kernel::new();
        assert!(restored.restore_json(&snapshot).is_err());
    }

    #[test]
    fn repeated_same_move_save_restore_reaches_fractional_destination() {
        let scene = serde_json::to_string(&json!({
            "format":"hive-game", "version":3, "game":"route-recovery",
            "components":[], "materialCatalog":[], "initial":[{"id":"mover","components":{
                "hive.position":{"x":0.4,"y":0.0,"z":0.4,"facing":0.0},
                "hive.body":{"speed":2.0}
            }}]
        })).expect("route fixture");
        let mut kernel = Kernel::new();
        kernel.load(&scene).expect("load route fixture");
        let move_action = r#"{"delta":0.1,"writes":[],"actions":[{"scope":{"kind":"host"},"request":{"kind":"move","entity":"mover","destination":{"x":3.2,"y":0.0,"z":0.4,"frame":null}}}]}"#;
        for _ in 0..30 {
            kernel.advance_json(move_action).expect("repeated move");
            let saved = kernel.snapshot_json().expect("save route");
            kernel.restore_json(&saved).expect("restore route");
        }
        let facts: serde_json::Value = serde_json::from_str(&kernel.render_json().expect("render route"))
            .expect("route render JSON");
        let mover = facts.as_array().unwrap().iter().find(|fact| fact["id"] == "mover").unwrap();
        assert!((mover["local"]["position"]["x"].as_f64().unwrap() - 3.2).abs() < 1e-9);
    }
}

#[cfg(test)]
mod direct_tests {
    use super::Kernel;
    use serde_json::json;

    fn scene() -> String {
        serde_json::to_string(&json!({
            "format":"hive-game", "version":3, "game":"survival",
            "components":[], "materialCatalog":[], "initial":[{"id":"survivor","components":{
                "hive.position":{"x":0.0,"y":0.0,"z":0.0,"facing":0.0},
                "hive.body":{"speed":2.0}
            }}]
        })).unwrap()
    }
    fn batch(delta: f64, actions: serde_json::Value) -> String {
        let actions = actions.as_array().unwrap().iter().map(|request| json!({"scope":{"kind":"host"},"request":request})).collect::<Vec<_>>();
        serde_json::to_string(&json!({"delta":delta,"writes":[],"actions":actions})).unwrap()
    }

    #[test]
    fn direct_stream_uses_fixed_clock_and_survives_restore() {
        let mut kernel = Kernel::new();
        kernel.load(&scene()).unwrap();
        kernel.advance_json(&batch(0.0, json!([{"kind":"begin-direct","entity":"survivor","stream":"keyboard"}]))).unwrap();
        kernel.advance_json(&batch(0.019, json!([{"kind":"direct-input","entity":"survivor","stream":"keyboard","inputs":[{"sequence":1,"x":1.0,"z":0.0}]}]))).unwrap();
        let before = kernel.render_json().unwrap();
        kernel.advance_json(&batch(0.001, json!([]))).unwrap();
        let after = kernel.render_json().unwrap();
        assert_ne!(before, after);
        let snapshot = kernel.snapshot_json().unwrap();
        let mut restored = Kernel::new();
        restored.restore_json(&snapshot).unwrap();
        assert_eq!(restored.snapshot_json().unwrap(), snapshot);
    }

    #[test]
    fn rejected_direct_gap_does_not_mutate_stream() {
        let mut kernel = Kernel::new();
        kernel.load(&scene()).unwrap();
        kernel.advance_json(&batch(0.0, json!([{"kind":"begin-direct","entity":"survivor","stream":"keyboard"}]))).unwrap();
        let before_render = kernel.render_json().unwrap();
        let result: serde_json::Value = serde_json::from_str(&kernel.advance_json(&batch(0.0, json!([{"kind":"direct-input","entity":"survivor","stream":"keyboard","inputs":[{"sequence":2,"x":1.0,"z":0.0}]}]))).unwrap()).unwrap();
        assert_eq!(result["results"][0]["accepted"], false);
        assert_eq!(kernel.render_json().unwrap(), before_render);
    }

    #[test]
    fn direct_flood_is_fixed_clock_and_forged_frontier_is_rejected() {
        let mut kernel = Kernel::new();
        kernel.load(&scene()).unwrap();
        kernel.advance_json(&batch(0.0, json!([{"kind":"begin-direct","entity":"survivor","stream":"keyboard"}]))).unwrap();
        let inputs: Vec<_> = (1..=50).map(|sequence| json!({"sequence":sequence,"x":1.0,"z":0.0})).collect();
        for chunk in inputs.chunks(50) {
            let result: serde_json::Value = serde_json::from_str(&kernel.advance_json(&batch(0.0, json!([{"kind":"direct-input","entity":"survivor","stream":"keyboard","inputs":chunk}]))).unwrap()).unwrap();
            assert_eq!(result["results"][0]["accepted"], true);
        }
        let before = kernel.render_json().unwrap();
        kernel.advance_json(&batch(0.2, json!([]))).unwrap();
        let ten_steps = kernel.render_json().unwrap();
        assert_ne!(before, ten_steps);
        let ten: serde_json::Value = serde_json::from_str(&ten_steps).unwrap();
        assert!((ten[0]["pose"]["position"]["x"].as_f64().unwrap() - 0.4).abs() < 1e-9);
        kernel.advance_json(&batch(0.8, json!([]))).unwrap();
        let finished = kernel.render_json().unwrap();
        kernel.advance_json(&batch(1.0, json!([]))).unwrap();
        assert_eq!(kernel.render_json().unwrap(), finished);
        let snapshot = kernel.snapshot_json().unwrap().replace("\"last_queued\":50", "\"last_queued\":51");
        let mut restored = Kernel::new();
        assert!(restored.restore_json(&snapshot).is_err());
    }
}

#[cfg(test)]
mod finite_resource_tests {
    use super::Kernel;
    use serde_json::json;

    fn kernel() -> Kernel {
        let mut kernel = Kernel::new();
        kernel.load(&json!({"format":"hive-game","version":3,"game":"finite","components":[],"materialCatalog":[],"initial":[
            {"id":"worker","components":{"hive.position":{"x":0.0,"y":0.0,"z":0.0,"facing":0.0},"hive.body":{"speed":1.0}}},
            {"id":"tree","components":{"hive.position":{"x":1.0,"y":0.0,"z":0.0,"facing":0.0},"hive.container":{"capacity":8},"hive.finite-resource":{"kind":"wood","quantity":4}}}
        ]}).to_string()).unwrap();
        kernel
    }

    #[test]
    fn extraction_conserves_kind_quantity_and_recovers_after_restore() {
        let mut kernel = kernel();
        let result: serde_json::Value = serde_json::from_str(&kernel.advance_json(&json!({"delta":0.0,"writes":[],"actions":[{"scope":{"kind":"host"},"request":{"kind":"extract-resource","operation":"tree:extract:1","worker":"worker","source":"tree"}}]}).to_string()).unwrap()).unwrap();
        assert_eq!(result["results"][0]["accepted"], true);
        let lot = result["results"][0]["entityId"].as_str().unwrap().to_owned();
        let lots: serde_json::Value = serde_json::from_str(&kernel.query_json("[\"hive.lot\"]").unwrap()).unwrap();
        assert_eq!(lots[0]["components"]["hive.lot"]["kind"], "wood");
        assert_eq!(lots[0]["components"]["hive.lot"]["quantity"], 4);
        assert!(lots[0]["components"]["hive.lot"]["container"].as_str().unwrap().starts_with("ground.lot."));
        let resources: serde_json::Value = serde_json::from_str(&kernel.query_json("[\"hive.finite-resource\"]").unwrap()).unwrap();
        assert_eq!(resources[0]["components"]["hive.finite-resource"]["quantity"], 0);
        let saved = kernel.snapshot_json().unwrap();
        let mut restored = Kernel::new(); restored.restore_json(&saved).unwrap();
        assert_eq!(restored.query_json("[\"hive.finite-resource\"]").unwrap(), kernel.query_json("[\"hive.finite-resource\"]").unwrap());
        assert_eq!(restored.query_json("[\"hive.lot\"]").unwrap(), kernel.query_json("[\"hive.lot\"]").unwrap());
        let retry: serde_json::Value = serde_json::from_str(&restored.advance_json(&json!({"delta":0.0,"writes":[],"actions":[{"scope":{"kind":"host"},"request":{"kind":"extract-resource","operation":"tree:extract:2","worker":"worker","source":"tree"}}]}).to_string()).unwrap()).unwrap();
        assert_eq!(retry["results"][0]["accepted"], false);
        assert!(restored.entity(&lot).is_ok());
    }

    #[test]
    fn establish_resource_site_reuses_existing_intent_entity() {
        let mut kernel = Kernel::new();
        kernel.load(&json!({"format":"hive-game","version":3,"game":"finite","components":[],"materialCatalog":[], "initial":[{"id":"worker","components":{"hive.position":{"x":1.0,"y":0.0,"z":0.0,"facing":0.0},"hive.body":{"speed":1.0}}},{"id":"site","components":{"hive.resource-order":{"definition":"mugwort","cellX":0,"cellY":0,"cellZ":0,"status":"queued","progressSeconds":0,"reason":""}}}]}).to_string()).unwrap();
        let mut environment_definition: serde_json::Value = serde_json::from_str(&crate::environment_definition::tests::fixture("resource")).unwrap();
        environment_definition["resourceSites"] = json!([{
            "id":"mugwort", "outputKind":"mugwort", "outputQuantity":1, "waterKind":"water",
            "sowSeconds":1.0, "tendSeconds":1.0, "harvestSeconds":1.0,
            "stages":[{"delaySeconds":1.0,"waterPortions":1}]
        }]);
        kernel.load_environment(&environment_definition.to_string()).unwrap();
        let (surface, spacing) = {
            let environment = kernel.environment.as_mut().unwrap();
            (environment.world.surface_cells(&[(0, 0)]).unwrap()[0].unwrap().cell, environment.world.cell_spacing_m())
        };
        let worker = kernel.entity("worker").unwrap();
        kernel.ecs.entity_mut(worker).insert(super::Position { x: spacing[0], y: (f64::from(surface.y) + 0.5) * spacing[1], z: 0.0, facing: 0.0 });
        let result: serde_json::Value = serde_json::from_str(&kernel.advance_json(&json!({"delta":0.0,"writes":[],"actions":[{"scope":{"kind":"host"},"request":{"kind":"establish-resource-site","operation":"site:sow:1","worker":"worker","site":"site","definition":"mugwort","x":surface.x,"y":surface.y,"z":surface.z}}]}).to_string()).unwrap()).unwrap();
        assert_eq!(result["results"][0]["accepted"], true, "{result}");
        let site_entity = kernel.entity("site").unwrap();
        assert!(kernel.ecs.get::<super::ResourceOrder>(site_entity).is_some());
        assert!(kernel.ecs.get::<super::ResourceSite>(site_entity).is_some(), "the designation and physical site share one entity identity");
        let saved = kernel.save_records().unwrap();
        let mut restored = Kernel::new();
        restored.restore_records(&saved).unwrap();
        assert_eq!(restored.save_records().unwrap().entities, saved.entities);
        let restored_entity = restored.entity("site").unwrap();
        assert!(restored.ecs.get::<super::ResourceOrder>(restored_entity).is_some());
        assert!(restored.ecs.get::<super::ResourceSite>(restored_entity).is_some());
        assert_eq!(restored.query_json("[\"hive.resource-site\"]").unwrap(), kernel.query_json("[\"hive.resource-site\"]").unwrap());
    }

    fn action(kernel: &mut Kernel) -> serde_json::Value {
        serde_json::from_str(&kernel.advance_json(&json!({"delta":0.0,"writes":[],"actions":[{"scope":{"kind":"host"},"request":{"kind":"extract-resource","operation":"tree:extract:capacity","worker":"worker","source":"tree"}}]}).to_string()).unwrap()).unwrap()
    }

    #[test]
    fn invalid_output_position_leaves_source_output_and_identity_unchanged() {
        let mut kernel = kernel();
        let tree = kernel.entity("tree").unwrap();
        crate::record_changes::edit::<super::Position>(tree, &mut kernel.ecs).unwrap().x = f64::NAN;
        let before_lots = kernel.query_json("[\"hive.lot\"]").unwrap();
        let before_resource = kernel.query_json("[\"hive.finite-resource\"]").unwrap();
        assert_eq!(action(&mut kernel)["results"][0]["accepted"], false);
        assert_eq!(kernel.query_json("[\"hive.lot\"]").unwrap(), before_lots);
        assert_eq!(kernel.query_json("[\"hive.finite-resource\"]").unwrap(), before_resource);
        let snapshot: serde_json::Value = serde_json::from_str(&kernel.snapshot_json().unwrap()).unwrap();
        assert_eq!(snapshot["next_lot"], 1);
        crate::record_changes::edit::<super::Position>(tree, &mut kernel.ecs).unwrap().x = 1.0;
        assert_eq!(action(&mut kernel)["results"][0]["entityId"], "lot.1");
    }

    #[test]
    fn contact_body_and_source_capability_fail_without_mutation() {
        let mut kernel = kernel();
        let worker = kernel.entity("worker").unwrap();
        kernel.ecs.entity_mut(worker).remove::<super::Body>();
        let before_lots = kernel.query_json("[\"hive.lot\"]").unwrap();
        let before_resource = kernel.query_json("[\"hive.finite-resource\"]").unwrap();
        assert_eq!(action(&mut kernel)["results"][0]["accepted"], false);
        assert_eq!(kernel.query_json("[\"hive.lot\"]").unwrap(), before_lots);
        assert_eq!(kernel.query_json("[\"hive.finite-resource\"]").unwrap(), before_resource);
        kernel.ecs.entity_mut(worker).insert(super::Body { speed: 1.0 });
        kernel.ecs.entity_mut(worker).insert(super::Position { x: 10.0, y: 0.0, z: 0.0, facing: 0.0 });
        assert_eq!(action(&mut kernel)["results"][0]["accepted"], false);
        kernel.ecs.entity_mut(worker).insert(super::Position { x: 0.0, y: 0.0, z: 0.0, facing: 0.0 });
        let tree = kernel.entity("tree").unwrap();
        kernel.ecs.entity_mut(tree).remove::<super::FiniteResource>();
        assert_eq!(action(&mut kernel)["results"][0]["accepted"], false);
    }
}
