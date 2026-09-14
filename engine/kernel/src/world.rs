#[cfg(test)]
#[path = "fuel_emission_tests.rs"]
mod fuel_emission_tests;
#[path = "fuel_emission.rs"]
mod fuel_emission;
#[path = "environment_runtime.rs"]
mod environment_runtime;
use crate::{collision, combat, components::*, navigation, registry::Registry};
use crate::staged_process::{ProcessPhase, StagedProcess};
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
#[path = "structure_contact.rs"]
mod structure_contact;
#[path = "interaction_contact.rs"]
mod interaction_contact;
#[cfg(test)]
#[path = "aperture_tests.rs"]
mod aperture_tests;
#[path = "construction_work.rs"]
mod construction_work;
#[path = "route_query.rs"]
mod route_query;
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
use sha2::{Digest, Sha256};
use crate::terrain_water::WaterExchangeDirection;
use crate::work_attempt::{AttemptKey, AttemptPhase, InterruptCause, WorkAttempt, WorkOutcome, OperationKey};
#[cfg(test)]
#[path = "party_tests.rs"]
mod party_tests;

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
mod work_attempt_laws {
    use super::*;
    use serde_json::{json, Value};

    fn world() -> Kernel {
        let mut kernel = Kernel::new();
        kernel.load(&json!({"format":"hive-game","version":1,"game":"attempts","components":[],"initial":[
            {"id":"task","components":{"hive.owned-by-party":{"party":"party"}}},{"id":"task2","components":{"hive.owned-by-party":{"party":"party"}}},{"id":"worker","components":{"hive.party-member":{"party":"party"},"hive.body":{"speed":1.0},"hive.position":{"x":0.0,"y":0.0,"z":0.0,"facing":0.0}}},{"id":"party","components":{"hive.party":{"ownerPlayer":"player"}}}
        ]}).to_string()).unwrap();
        kernel
    }

    #[test]
    fn begin_requires_one_real_party_to_own_worker_and_task() {
        let mut kernel = world();
        kernel.load(&json!({"format":"hive-game","version":1,"game":"attempts","components":[],"initial":[
            {"id":"task","components":{"hive.owned-by-party":{"party":"other"}}},
            {"id":"worker","components":{"hive.party-member":{"party":"party"},"hive.body":{"speed":1.0},"hive.position":{"x":0.0,"y":0.0,"z":0.0,"facing":0.0}}},
            {"id":"party","components":{"hive.party":{"ownerPlayer":"player"}}},
            {"id":"other","components":{"hive.party":{"ownerPlayer":"other-player"}}}
        ]}).to_string()).unwrap();
        let result: Value = serde_json::from_str(&kernel.advance_json(&json!({"delta":0,"writes":[],"actions":[{"kind":"begin-work-attempt","task":"task","worker":"worker","party":"party","operation":{"kind":"route","destination":{"x":1.0,"y":0.0,"z":0.0,"frame":null}}}]}).to_string()).unwrap()).unwrap();
        assert_eq!(result["results"][0]["accepted"], false);
        assert_eq!(result["results"][0]["reason"], "work attempt task is outside party");
        assert_eq!(kernel.work_attempts_json("[\"task\"]").unwrap(), "[]");
        assert_eq!(kernel.query_json("[\"hive.destination\"]").unwrap(), "[]");
    }

    #[test]
    fn exact_attempt_survives_restore_and_stale_key_cannot_touch_new_attempt() {
        let mut kernel = world();
        let begin = kernel.advance_json(&json!({"delta":0,"writes":[],"actions":[{"kind":"begin-work-attempt","task":"task","worker":"worker","party":"party","operation":{"kind":"route","destination":{"x":1.0,"y":0.0,"z":0.0,"frame":null}}}]}).to_string()).unwrap();
        let saved = kernel.snapshot_json().unwrap();
        let mut restored = Kernel::new();
        restored.restore_json(&saved).unwrap();
        assert_eq!(restored.work_attempts_json("[\"task\"]").unwrap(), kernel.work_attempts_json("[\"task\"]").unwrap());
        let key = serde_json::from_str::<Value>(&begin).unwrap()["results"][0]["attempt"].clone();
        restored.advance_json(&json!({"delta":1,"writes":[],"actions":[]}).to_string()).unwrap();
        let retained: Value = serde_json::from_str(&restored.work_attempts_json("[\"task\"]").unwrap()).unwrap();
        assert_eq!(retained[0]["phase"]["kind"], "outcome");
        let reassigned: Value = serde_json::from_str(&restored.advance_json(&json!({"delta":0,"writes":[],"actions":[{"kind":"begin-work-attempt","task":"task2","worker":"worker","party":"party","operation":{"kind":"route","destination":{"x":2.0,"y":0.0,"z":0.0,"frame":null}}}]}).to_string()).unwrap()).unwrap();
        assert_eq!(reassigned["results"][0]["accepted"], true);
        let task2_key = reassigned["results"][0]["attempt"]["generation"].as_u64().unwrap();
        restored.advance_json(&json!({"delta":0,"writes":[],"actions":[{"kind":"interrupt-work-attempt","task":"task2","generation":task2_key,"sequence":1,"cause":"cancelled"}]}).to_string()).unwrap();
        restored.advance_json(&json!({"delta":0,"writes":[],"actions":[{"kind":"acknowledge-work-attempt","task":"task","generation":key["generation"],"sequence":1}]}).to_string()).unwrap();
        let replacement = restored.advance_json(&json!({"delta":0,"writes":[],"actions":[{"kind":"begin-work-attempt","task":"task","worker":"worker","party":"party","operation":{"kind":"route","destination":{"x":2.0,"y":0.0,"z":0.0,"frame":null}}}]}).to_string()).unwrap();
        let new_generation = serde_json::from_str::<Value>(&replacement).unwrap()["results"][0]["attempt"]["generation"].as_u64().unwrap();
        assert!(new_generation > key["generation"].as_u64().unwrap());
        let stale = restored.advance_json(&json!({"delta":0,"writes":[],"actions":[{"kind":"interrupt-work-attempt","task":"task","generation":key["generation"],"sequence":1,"cause":"cancelled"}]}).to_string()).unwrap();
        assert_eq!(serde_json::from_str::<Value>(&stale).unwrap()["results"][0]["accepted"], false);
        let stale_ack = restored.advance_json(&json!({"delta":0,"writes":[],"actions":[{"kind":"acknowledge-work-attempt","task":"task","generation":key["generation"],"sequence":1}]}).to_string()).unwrap();
        assert_eq!(serde_json::from_str::<Value>(&stale_ack).unwrap()["results"][0]["accepted"], false);
        assert_eq!(restored.work_attempts_json("[\"task\"]").unwrap().contains(&new_generation.to_string()), true);
    }

    #[test]
    fn interrupt_clears_owned_route_and_releases_worker_without_ack() {
        let mut kernel = world();
        let begin: Value = serde_json::from_str(&kernel.advance_json(&json!({"delta":0,"writes":[],"actions":[{"kind":"begin-work-attempt","task":"task","worker":"worker","party":"party","operation":{"kind":"route","destination":{"x":10.0,"y":0.0,"z":0.0,"frame":null}}}]}).to_string()).unwrap()).unwrap();
        let key = &begin["results"][0]["attempt"];
        let interrupted: Value = serde_json::from_str(&kernel.advance_json(&json!({"delta":0,"writes":[],"actions":[{"kind":"interrupt-work-attempt","task":"task","generation":key["generation"],"sequence":1,"cause":"cancelled"}]}).to_string()).unwrap()).unwrap();
        assert_eq!(interrupted["results"][0]["accepted"], true);
        let position: Value = serde_json::from_str(&kernel.query_json("[\"hive.position\"]").unwrap()).unwrap();
        assert_eq!(position[0]["components"]["hive.position"]["x"], 0.0);
        assert!(kernel.query_json("[\"hive.destination\"]").unwrap().contains("[]"));
        kernel.advance_json(&json!({"delta":1,"writes":[],"actions":[]}).to_string()).unwrap();
        let after: Value = serde_json::from_str(&kernel.query_json("[\"hive.position\"]").unwrap()).unwrap();
        assert_eq!(after[0]["components"]["hive.position"]["x"], 0.0);
        let next: Value = serde_json::from_str(&kernel.advance_json(&json!({"delta":0,"writes":[],"actions":[{"kind":"begin-work-attempt","task":"task2","worker":"worker","party":"party","operation":{"kind":"route","destination":{"x":1.0,"y":0.0,"z":0.0,"frame":null}}}]}).to_string()).unwrap()).unwrap();
        assert_eq!(next["results"][0]["accepted"], true);
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
            "format":"hive-game", "version":1, "game":"work-material-facts",
            "components":[], "initial":[
                {"id":"source","components":{"hive.container":{"capacity":8}}},
                {"id":"sealed","components":{"hive.container":{"capacity":4},"hive.sealed-container":{}}},
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
            "format":"hive-game", "version":1, "game":"ground-cleanup",
            "components":[{"id":"game.delivery","version":1,"fields":{"source":"entity"}}],
            "initial":[
                {"id":"ground.1","components":{"hive.position":{"x":0.0,"y":0.0,"z":0.0,"facing":0.0},"hive.container":{"capacity":3},"hive.ground-stock":{}}},
                {"id":"haul.1","components":{"game.delivery":{"source":"ground.1"}}}
            ]
        }).to_string()).unwrap();
        kernel.ground_stock_cleanup_pending = true;
        kernel.cleanup_empty_ground_stock();
        assert!(kernel.known.contains("ground.1"));
        kernel.advance_json(&json!({"delta":0.0,"creates":[],"removes":["haul.1"],"writes":[],"actions":[]}).to_string()).unwrap();
        assert!(!kernel.known.contains("ground.1"));
    }

    #[test]
    fn actor_drop_keeps_lot_at_supported_pose_across_recovery() {
        let mut kernel = Kernel::new();
        kernel.load(&json!({
            "format":"hive-game", "version":1, "game":"ground-drop",
            "components":[],
            "initial":[
                {"id":"platform","components":{"hive.position":{"x":0.0,"y":0.0,"z":0.0,"facing":0.0},"hive.surface":{"minX":0.0,"maxX":4.0,"minZ":0.0,"maxZ":4.0,"height":1.0}}},
                {"id":"actor","components":{"hive.position":{"x":2.0,"y":1.0,"z":2.0,"facing":1.0},"hive.support":{"entity":"platform"},"hive.body":{"speed":1.0},"hive.container":{"capacity":3}}},
                {"id":"lot.1","components":{"hive.lot":{"kind":"soil-spoil","quantity":2,"container":"actor"}}}
            ]
        }).to_string()).unwrap();
        kernel.advance_json(&json!({"delta":0.0,"creates":[],"removes":[],"writes":[],"actions":[{"kind":"drop-lot","entity":"actor","lot":"lot.1"}]}).to_string()).unwrap();
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

    fn kernel_with_slot() -> Kernel {
        let mut kernel = Kernel::new();
        kernel.load(&json!({"format":"hive-game","version":1,"game":"process-request","components":[],"initial":[]}).to_string()).unwrap();
        kernel.load_environment(&crate::environment_definition::tests::fixture("process-request")).unwrap();
        let station = kernel.ecs.spawn((ExternalId("station".into()), Position { x: 0.0, y: 0.0, z: 0.0, facing: 0.0 }, Container { capacity: 8 }, SealedContainer {}, ConstructionSite { catalog: "floor".into(), x: 0, y: 0, z: 0, orientation: crate::structure_geometry::Cardinal::North, seconds: 1.0, phase: ConstructionPhase::Finished })).id();
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
        let id = kernel.request_process("process-v1", "station").unwrap();
        let entity = kernel.entity(&id).unwrap();
        assert_eq!(kernel.ecs.get::<StagedProcess>(entity).unwrap().phase, ProcessPhase::Waiting);
        assert_eq!(kernel.request_process("process-v1", "station").unwrap(), id);
        kernel.ecs.entity_mut(entity).get_mut::<StagedProcess>().unwrap().phase = ProcessPhase::Complete;
        kernel.revision = 7;
        assert_eq!(kernel.request_process("process-v1", "station").unwrap(), id);
        let process = kernel.ecs.get::<StagedProcess>(entity).unwrap();
        assert_eq!((process.phase, process.stage_index, process.progress_seconds, process.entered_tick), (ProcessPhase::Waiting, 0, 0.0, 7));
    }

    #[test]
    fn request_restore_rejects_stale_station_or_definition_version() {
        let mut kernel = kernel_with_slot();
        let id = kernel.request_process("process-v1", "station").unwrap();
        let entity = kernel.entity(&id).unwrap();
        kernel.ecs.get_mut::<StagedProcess>(entity).unwrap().definition_version = 2;
        assert!(kernel.validate_process_records().is_err());
        kernel.ecs.get_mut::<StagedProcess>(entity).unwrap().definition_version = 1;
        let station = kernel.entity("station").unwrap();
        kernel.ecs.get_mut::<ConstructionSite>(station).unwrap().phase = ConstructionPhase::Planned;
        assert!(kernel.validate_process_records().is_err());
    }

    #[test]
    fn admission_waits_for_all_port_lots_and_is_retry_idempotent() {
        let mut kernel = kernel_with_slot();
        let process = kernel.request_process("process-v1", "station").unwrap();
        assert!(kernel.admit_process(&process, "process-v1", "station").is_err());
        let lot = kernel.ecs.spawn((ExternalId("grain.1".into()), Lot { kind: "grain".into(), quantity: 1, container: "station:input".into() })).id();
        kernel.ids.insert("grain.1".into(), lot);
        kernel.known.insert("grain.1".into());
        kernel.refresh_state_weight();
        kernel.admit_process(&process, "process-v1", "station").unwrap();
        assert_eq!(kernel.ecs.query::<&crate::staged_process::ProcessBinding>().iter(&kernel.ecs).count(), 1);
        let before = kernel.query_json(r#"["hive.lot","hive.process-binding","hive.staged-process"]"#).unwrap();
        kernel.admit_process(&process, "process-v1", "station").unwrap();
        assert_eq!(kernel.query_json(r#"["hive.lot","hive.process-binding","hive.staged-process"]"#).unwrap(), before);
        assert_eq!(kernel.ecs.get::<StagedProcess>(kernel.entity(&process).unwrap()).unwrap().phase, ProcessPhase::Waiting);
        kernel.validate_process_records().unwrap();
    }

    #[test]
    fn admitted_binding_reserves_lot_from_ordinary_transfer() {
        let mut kernel = kernel_with_slot();
        let process = kernel.request_process("process-v1", "station").unwrap();
        let lot = kernel.ecs.spawn((ExternalId("grain.1".into()), Lot { kind: "grain".into(), quantity: 1, container: "station:input".into() })).id();
        kernel.ids.insert("grain.1".into(), lot); kernel.known.insert("grain.1".into());
        let destination = kernel.ecs.spawn((ExternalId("destination".into()), Position { x: 0.0, y: 0.0, z: 0.0, facing: 0.0 }, Container { capacity: 4 })).id();
        kernel.ids.insert("destination".into(), destination); kernel.known.insert("destination".into()); kernel.contents.insert("destination".into(), BTreeSet::new());
        kernel.refresh_state_weight();
        kernel.admit_process(&process, "process-v1", "station").unwrap();
        assert!(kernel.transfer("grain.1", "station:input", "destination", 1).is_err());
        assert_eq!(kernel.ecs.get::<Lot>(lot).unwrap().container, "station:input");
    }

    fn empty_process_kernel() -> (Kernel, String) {
        let mut kernel = kernel_with_slot();
        let definition = ProcessDefinition { id: "empty-v1".into(), version: 1, station_catalog: "floor".into(), inputs: vec![ProcessInput { role: "grain".into(), port: "input".into(), material: "grain".into(), quantity: 1, policy: InputPolicy::WholeLot, disposition: InputDisposition::Retain }], stages: vec![ProcessStage { id: "attend".into(), mode: StageMode::Attended, duration_seconds: 2.0, transition: ProcessTransition::default() }, ProcessStage { id: "wait".into(), mode: StageMode::Elapsed, duration_seconds: 2.0, transition: ProcessTransition::default() }, ProcessStage { id: "finish".into(), mode: StageMode::Attended, duration_seconds: 1.0, transition: ProcessTransition::default() }] };
        let structures = kernel.environment.as_ref().unwrap().structures.clone(); let emissions = kernel.environment.as_ref().unwrap().emissions.clone();
        kernel.environment.as_mut().unwrap().processes = ProcessCatalog::from_definitions(vec![definition], &structures, &emissions).unwrap();
        let lot = kernel.ecs.spawn((ExternalId("grain.empty".into()), Lot { kind: "grain".into(), quantity: 1, container: "station:input".into() })).id(); kernel.ids.insert("grain.empty".into(), lot); kernel.known.insert("grain.empty".into()); kernel.refresh_state_weight();
        let worker = kernel.ecs.spawn((ExternalId("worker".into()), Position { x: 0.0, y: 0.0, z: 0.0, facing: 0.0 }, Body { speed: 1.0 }, Traversal { clearance_cells: 1, max_step_cells: 1 }, Container { capacity: 4 })).id(); kernel.ids.insert("worker".into(), worker); kernel.known.insert("worker".into()); kernel.rebuild_physical_indexes(true).unwrap();
        let process = kernel.request_process("empty-v1", "station").unwrap(); kernel.admit_process(&process, "empty-v1", "station").unwrap(); (kernel, process)
    }

    #[test] fn attendance_requires_contact_and_authoritative_delta() { let (mut kernel, process) = empty_process_kernel(); let worker = kernel.entity("worker").unwrap(); kernel.ecs.entity_mut(worker).insert(Position { x: 99.0, y: 0.0, z: 0.0, facing: 0.0 }); assert!(kernel.attend_process("worker", &process, 1.0).is_err()); kernel.ecs.entity_mut(worker).insert(Position { x: 0.0, y: 0.0, z: 0.0, facing: 0.0 }); kernel.attend_process("worker", &process, 1.0).unwrap(); assert_eq!(kernel.ecs.get::<StagedProcess>(kernel.entity(&process).unwrap()).unwrap().progress_seconds, 1.0); }
    #[test] fn zero_delta_pause_and_repeated_attend_do_not_cross_twice() { let (mut kernel, process) = empty_process_kernel(); kernel.attend_process("worker", &process, 0.0).unwrap(); assert_eq!(kernel.ecs.get::<StagedProcess>(kernel.entity(&process).unwrap()).unwrap().progress_seconds, 0.0); kernel.attend_process("worker", &process, 2.0).unwrap(); let state = kernel.ecs.get::<StagedProcess>(kernel.entity(&process).unwrap()).unwrap().clone(); assert_eq!((state.stage_index, state.phase), (1, ProcessPhase::Waiting)); kernel.attend_process("worker", &process, 0.0).unwrap_err(); assert_eq!(kernel.ecs.get::<StagedProcess>(kernel.entity(&process).unwrap()).unwrap().stage_index, 1); }
    #[test] fn elapsed_stage_has_no_same_tick_credit_and_survives_worker_release() { let (mut kernel, process) = empty_process_kernel(); kernel.attend_process("worker", &process, 2.0).unwrap(); kernel.advance_staged_processes(1.0).unwrap(); assert_eq!(kernel.ecs.get::<StagedProcess>(kernel.entity(&process).unwrap()).unwrap().progress_seconds, 0.0); kernel.revision += 1; kernel.advance_staged_processes(1.0).unwrap(); assert_eq!(kernel.ecs.get::<StagedProcess>(kernel.entity(&process).unwrap()).unwrap().progress_seconds, 1.0); }
    #[test] fn worker_release_allows_replacement_and_save_reload_preserves_process() { let (mut kernel, process) = empty_process_kernel(); kernel.attend_process("worker", &process, 1.0).unwrap(); let worker = kernel.entity("worker").unwrap(); kernel.ecs.entity_mut(worker).insert(Position { x: 99.0, y: 0.0, z: 0.0, facing: 0.0 }); kernel.advance_staged_processes(1.0).unwrap(); assert!(kernel.ecs.get::<StagedProcess>(kernel.entity(&process).unwrap()).unwrap().worker.is_none()); let saved = kernel.snapshot_entities_json().unwrap(); let mut restored = Kernel::new(); restored.restore_json(&saved).unwrap(); assert_eq!(restored.ecs.get::<StagedProcess>(restored.entity(&process).unwrap()).unwrap().progress_seconds, 1.0); }
    #[test] fn process_transition_consumes_exact_bound_portion() { let mut kernel = kernel_with_slot(); let process = kernel.request_process("process-v1", "station").unwrap(); let lot = kernel.ecs.spawn((ExternalId("grain.blocked".into()), Lot { kind: "grain".into(), quantity: 1, container: "station:input".into() })).id(); kernel.ids.insert("grain.blocked".into(), lot); kernel.known.insert("grain.blocked".into()); kernel.refresh_state_weight(); kernel.admit_process(&process, "process-v1", "station").unwrap(); let worker = kernel.ecs.spawn((ExternalId("worker.blocked".into()), Position { x: 0.0,y:0.0,z:0.0,facing:0.0 }, Body { speed:1.0 }, Traversal { clearance_cells:1,max_step_cells:1 }, Container { capacity:4 })).id(); kernel.ids.insert("worker.blocked".into(), worker); kernel.known.insert("worker.blocked".into()); kernel.attend_process("worker.blocked", &process, 1.0).unwrap(); let state = kernel.ecs.get::<StagedProcess>(kernel.entity(&process).unwrap()).unwrap(); assert_eq!(state.phase, ProcessPhase::Complete); assert_eq!(kernel.ecs.get::<Lot>(lot).unwrap().quantity, 0); }

    #[test]
    fn process_station_rejects_different_active_definition() {
        let mut kernel = kernel_with_slot();
        let first = kernel.request_process("process-v1", "station").unwrap();
        let mut second = kernel.environment.as_ref().unwrap().processes.get("process-v1").unwrap().definition().clone();
        second.id = "process-v2".into();
        let first_definition = kernel.environment.as_ref().unwrap().processes.get("process-v1").unwrap().definition().clone();
        let structures = kernel.environment.as_ref().unwrap().structures.clone();
        let emissions = kernel.environment.as_ref().unwrap().emissions.clone();
        kernel.environment.as_mut().unwrap().processes = ProcessCatalog::from_definitions(vec![first_definition, second], &structures, &emissions).unwrap();
        assert_eq!(kernel.request_process("process-v1", "station").unwrap(), first);
        assert!(kernel.request_process("process-v2", "station").is_err());
    }
}

#[cfg(test)]
mod water_exchange_action_tests {
    use super::*;
    use serde_json::json;

    fn kernel() -> Kernel {
        let mut kernel = Kernel::new();
        kernel.load(&json!({"format":"hive-game","version":1,"game":"water-action-laws","components":[],"initial":[
            {"id":"worker","components":{"hive.position":{"x":0.0,"y":0.0,"z":0.0,"facing":0.0},"hive.body":{"speed":1.0},"hive.container":{"capacity":8}}},
            {"id":"pail","components":{"hive.position":{"x":0.0,"y":0.0,"z":0.0,"facing":0.0},"hive.container":{"capacity":8},"hive.lot":{"kind":"pail","quantity":1,"container":"worker"}}}
        ]}).to_string()).unwrap();
        kernel
    }

    #[test]
    fn rejected_field_water_action_keeps_snapshot_and_rejects_wrong_custody() {
        let mut kernel = kernel();
        let before = kernel.query_json(r#"["hive.lot","hive.lot-water"]"#).unwrap();
        let result = kernel.advance_json(&json!({"delta":0,"writes":[],"actions":[
            {"kind":"exchange-field-water","operation":"test-withdraw","worker":"worker","vessel":"pail","x":0,"y":0,"z":0,"direction":"withdraw","portions":1}
        ]}).to_string()).unwrap();
        let result: serde_json::Value = serde_json::from_str(&result).unwrap();
        assert_eq!(result["results"][0]["accepted"], false);
        assert_eq!(kernel.query_json(r#"["hive.lot","hive.lot-water"]"#).unwrap(), before);

        let mut wrong = kernel;
        let before = wrong.query_json(r#"["hive.lot","hive.lot-water"]"#).unwrap();
        let result = wrong.advance_json(&json!({"delta":0,"writes":[],"actions":[
            {"kind":"exchange-field-water","operation":"test-invalid-deposit","worker":"pail","vessel":"pail","x":0,"y":0,"z":0,"direction":"deposit","portions":1}
        ]}).to_string()).unwrap();
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
        let draw = kernel.advance_json(&json!({"delta":0,"writes":[],"actions":[{"kind":"exchange-field-water","operation":"roundtrip-withdraw","worker":"worker","vessel":"pail","x":at.0,"y":at.1,"z":at.2,"direction":"withdraw","portions":portions}]}).to_string()).unwrap();
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
        let pour = restored.advance_json(&json!({"delta":0,"writes":[],"actions":[{"kind":"exchange-field-water","operation":"roundtrip-deposit","worker":"worker","vessel":"pail","x":at.0,"y":at.1,"z":at.2,"direction":"deposit","portions":portions}]}).to_string()).unwrap();
        assert_eq!(serde_json::from_str::<serde_json::Value>(&pour).unwrap()["results"][0]["accepted"], true);
        assert_eq!(restored.environment_facts_json().unwrap().parse::<serde_json::Value>().unwrap()["totalKg"], before.parse::<serde_json::Value>().unwrap()["totalKg"]);
    }
}


#[cfg(test)]
mod construction_tests {
    use super::*;
    use serde_json::json;

    fn world() -> (Kernel, crate::generation::Cell, Point) {
        let mut kernel = Kernel::new();
        kernel.load(&json!({
            "format":"hive-game", "version":1, "game":"construction",
            "components":[], "initial":[
                {"id":"party","components":{"hive.party":{"ownerPlayer":"player"}}},
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
        let batch = json!({"delta":0.0,"writes":[],"actions":[
            {"kind":"plan-construction","party":"party","catalog":"floor","site":"site-1","x":surface.x,"y":surface.y,"z":surface.z,"orientation":"north"},
            {"kind":"bind-construction-stage","site":"site-1","contact":contact},
            {"kind":"transfer","lot":"lot.1","from":"source","to":"site-1","quantity":1},
            {"kind":"attend-construction","worker":"worker-1","site":"site-1","contact":contact}
        ]});
        let response: serde_json::Value = serde_json::from_str(&kernel.advance_json(&batch.to_string()).unwrap()).unwrap();
        assert!(response["results"].as_array().unwrap().iter().all(|result| result["accepted"] == true));
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
        let planned: serde_json::Value = serde_json::from_str(&kernel.advance_json(&json!({"delta":0,"writes":[],"actions":[{
            "kind":"plan-construction","party":"party","catalog":catalog,"site":site,"x":at.x,"y":at.y,"z":at.z,"orientation":"north"
        }]}).to_string()).unwrap()).unwrap();
        assert_eq!(planned["results"][0]["accepted"], true, "{planned}");
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
        let staged: serde_json::Value = serde_json::from_str(&kernel.advance_json(&json!({"delta":0,"writes":[],"actions":[
            {"kind":"bind-construction-stage","site":site,"contact":contact},
            {"kind":"transfer","lot":material_lot,"from":"source","to":site,"quantity":1},
            {"kind":"attend-construction","worker":worker,"site":site,"contact":contact}
        ]}).to_string()).unwrap()).unwrap();
        assert!(staged["results"].as_array().unwrap().iter().all(|entry| entry["accepted"] == true), "{site}: {staged}");
        for _ in 0..16 {
            if kernel.ecs.get::<ConstructionSite>(kernel.entity(site).unwrap()).unwrap().phase == ConstructionPhase::Finished { break; }
            kernel.advance_json(r#"{"delta":1,"writes":[],"actions":[]}"#).unwrap();
        }
        let phase = kernel.ecs.get::<ConstructionSite>(kernel.entity(site).unwrap()).unwrap().phase;
        let final_access = kernel.construction_access_json(&serde_json::to_string(&[site]).unwrap()).unwrap();
        assert_eq!(phase, ConstructionPhase::Finished, "{site}: {final_access}");
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
                    ("hive.stockpile-cell".into(), record(&StockpileCell {
                        zone: "shelves".into(), priority: 4, filter_profile: "materials".into(),
                    })),
                ],
            }],
        };
        let mut definition: serde_json::Value = serde_json::from_str(&environment.definition).unwrap();
        definition["structures"]["catalog"][0]["onComplete"] = json!({
            "ports":[{"key":"storage","at":"site-contact","components":[
                {"name":"hive.container","value":{"capacity":6}},
                {"name":"hive.stockpile-cell","value":{"zone":"shelves","priority":4,"filterProfile":"materials"}}
            ]}]
        });
        environment.definition = definition.to_string();
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
        kernel.advance_json(r#"{"delta":0,"writes":[],"actions":[{"kind":"replace-floor","orderId":"replace-conflict","existingFloorId":"site-1","desiredCatalog":"floor-alt"}]}"#).unwrap();
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
        kernel.advance_json(r#"{"delta":0,"writes":[],"actions":[{"kind":"replace-floor","orderId":"replace-cancel","existingFloorId":"site-1","desiredCatalog":"floor-alt"}]}"#).unwrap();
        let material_lot = source_stone_lot(&kernel);
        kernel.advance_json(&json!({"delta":0,"writes":[],"actions":[{"kind":"bind-construction-stage","site":"replace-cancel","contact":contact},{"kind":"transfer","lot":material_lot,"from":"source","to":"replace-cancel","quantity":1},{"kind":"attend-construction","worker":"worker-2","site":"replace-cancel","contact":contact}]}).to_string()).unwrap();
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
        cancelled.advance_json(r#"{"delta":0,"writes":[],"actions":[{"kind":"replace-floor","orderId":"replace-cancel","existingFloorId":"site-1","desiredCatalog":"floor-alt"}]}"#).unwrap();
        let material_lot = source_stone_lot(&cancelled);
        let staged: serde_json::Value = serde_json::from_str(&cancelled.advance_json(&json!({"delta":0,"writes":[],"actions":[{"kind":"bind-construction-stage","site":"replace-cancel","contact":contact},{"kind":"transfer","lot":material_lot,"from":"source","to":"replace-cancel","quantity":1},{"kind":"attend-construction","worker":"worker-2","site":"replace-cancel","contact":contact}]}).to_string()).unwrap()).unwrap();
        assert!(staged["results"].as_array().unwrap().iter().all(|entry| entry["accepted"] == true), "{staged}");
        let staged_lot = cancelled.contents["replace-cancel"].iter().next().and_then(|entity| cancelled.ecs.get::<ExternalId>(*entity)).unwrap().0.clone();
        let cancelled_result: serde_json::Value = serde_json::from_str(&cancelled.advance_json(r#"{"delta":0,"writes":[],"actions":[{"kind":"cancel-work","entity":"worker-2"}]}"#).unwrap()).unwrap();
        assert_eq!(cancelled_result["results"][0]["accepted"], true);
        assert!(cancelled.ecs.get::<FloorReplacement>(cancelled.entity("replace-cancel").unwrap()).is_some_and(|replacement| replacement.phase == FloorReplacementPhase::Cancelled));
        let recovered: serde_json::Value = serde_json::from_str(&cancelled.advance_json(&json!({"delta":0,"writes":[],"actions":[{"kind":"transfer","lot":staged_lot,"from":"replace-cancel","to":"source","quantity":1}]}).to_string()).unwrap()).unwrap();
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
        let queued: serde_json::Value = serde_json::from_str(&kernel.advance_json(r#"{"delta":0,"writes":[],"actions":[{"kind":"replace-floor","orderId":"replace-1","existingFloorId":"floor-brew-0","desiredCatalog":"floor-alt"}]}"#).unwrap()).unwrap();
        assert_eq!(queued["results"][0]["accepted"], true);
        let access: serde_json::Value = serde_json::from_str(&kernel.construction_access_json(r#"["replace-1"]"#).unwrap()).unwrap();
        let selected = &access[0]["contacts"][0];
        let bed_contact = Point {
            x: selected["x"].as_f64().unwrap(), y: selected["y"].as_f64().unwrap(), z: selected["z"].as_f64().unwrap(),
            frame: selected["frame"].as_str().map(str::to_owned),
        };
        kernel.ecs.entity_mut(kernel.entity("worker-2").unwrap()).insert(Position { x: bed_contact.x, y: bed_contact.y, z: bed_contact.z, facing: 0.0 });
        let material_lot = source_stone_lot(&kernel);
        let staged: serde_json::Value = serde_json::from_str(&kernel.advance_json(&json!({"delta":0,"writes":[],"actions":[{"kind":"bind-construction-stage","site":"replace-1","contact":bed_contact},{"kind":"transfer","lot":material_lot,"from":"source","to":"replace-1","quantity":1},{"kind":"attend-construction","worker":"worker-2","site":"replace-1","contact":bed_contact}]}).to_string()).unwrap()).unwrap();
        assert!(staged["results"].as_array().unwrap().iter().all(|entry| entry["accepted"] == true), "{staged}");
        let staged_lots: serde_json::Value = serde_json::from_str(&kernel.query_json(r#"["hive.lot"]"#).unwrap()).unwrap();
        for _ in 0..16 {
            if kernel.ecs.get::<FloorReplacement>(kernel.entity("replace-1").unwrap()).unwrap().phase == FloorReplacementPhase::Completed { break; }
            kernel.advance_json(r#"{"delta":1,"writes":[],"actions":[]}"#).unwrap();
        }
        let replaced = kernel.ecs.get::<ConstructionSite>(kernel.entity("floor-brew-0").unwrap()).unwrap();
        assert_eq!(replaced.catalog, "floor-alt");
        assert_eq!((replaced.x, replaced.y, replaced.z, replaced.orientation, replaced.seconds, replaced.phase), (floor_before.x, floor_before.y, floor_before.z, floor_before.orientation, floor_before.seconds, floor_before.phase));
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
    fn deconstruction_removes_storage_and_publishes_one_salvage_lot() {
        let (mut kernel, surface, contact) = world();
        install_floor_storage_recipe(&mut kernel);
        setup(&mut kernel, surface, &contact);
        kernel.advance_json(r#"{"delta":1.0,"writes":[],"actions":[]}"#).unwrap();

        let stored = kernel.complete_material_output(MaterialOutputSpec {
            container: "site-1:storage".into(), kind: "stone-spoil".into(), quantity: 1, water_kg: None,
        }).unwrap();
        let occupied = kernel.save_records().unwrap();
        let rejected: serde_json::Value = serde_json::from_str(&kernel.advance_json(&json!({
            "delta":0.0,"writes":[],"actions":[{"kind":"deconstruct","site":"site-1","worker":"worker-1"}]
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

        kernel.advance_json(&json!({"delta":0.0,"writes":[],"actions":[{"kind":"deconstruct","site":"site-1","worker":"worker-1"}]}).to_string()).unwrap();
        assert!(!kernel.known.contains("site-1"));
        assert!(!kernel.known.contains("site-1:storage"));
        assert!(!kernel.known.contains(&stored));
        assert_eq!(kernel.quantity("worker-1"), 1);
        let saved = kernel.save_records().unwrap();
        let mut restored = Kernel::new(); restored.restore_records(&saved).unwrap();
        assert_eq!(restored.save_records().unwrap().entities, saved.entities);
    }

    #[test]
    fn deconstruction_rejects_removing_a_supporting_wall_without_mutation() {
        use crate::environment_definition::{RemovalRecipe, StructureDefinition, StructureShape};
        use crate::structure_geometry::{Cardinal, StaticInstance};
        let (mut kernel, surface, contact) = world();
        kernel.environment.as_mut().unwrap().structures.insert("wall".into(), StructureDefinition {
            id: "wall".into(), shape: StructureShape::Wall { height: 4 },
            materials: [("stone-spoil".into(), 1)].into_iter().collect(),
            work_seconds: 1.0, work_reach_below_cells: 0,
            on_complete: Default::default(), on_remove: RemovalRecipe::default(),
        });
        let wall = StaticInstance::Wall {
            id: "support-wall".into(),
            base: crate::generation::Cell { x: surface.x, y: surface.y + 1, z: surface.z },
            height: 4,
        };
        let upper = StaticInstance::Floor {
            id: "dependent-floor".into(),
            support: crate::generation::Cell { x: surface.x, y: surface.y + 4, z: surface.z },
        };
        let prepared = kernel.environment.as_mut().unwrap().world.prepare_structures(vec![wall, upper]).unwrap().unwrap();
        kernel.environment.as_mut().unwrap().world.apply_structures(prepared).unwrap();
        let state = ConstructionSite {
            catalog: "wall".into(), x: surface.x, y: surface.y + 1, z: surface.z,
            orientation: Cardinal::North, seconds: 1.0, phase: ConstructionPhase::Finished,
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
        let rejected: serde_json::Value = serde_json::from_str(&kernel.advance_json(r#"{"delta":0.0,"writes":[],"actions":[{"kind":"deconstruct","site":"site-1","worker":"worker-1"}]}"#).unwrap()).unwrap();
        assert_eq!(rejected["results"][0]["accepted"], false);
        assert!(kernel.known.contains("site-1"));
        kernel.ecs.entity_mut(worker).insert(Position { x: alternate["x"].as_f64().unwrap(), y: alternate["y"].as_f64().unwrap(), z: alternate["z"].as_f64().unwrap(), facing: 0.0 });
        kernel.rebuild_physical_indexes(true).unwrap();
        let accepted: serde_json::Value = serde_json::from_str(&kernel.advance_json(r#"{"delta":0.0,"writes":[],"actions":[{"kind":"deconstruct","site":"site-1","worker":"worker-1"}]}"#).unwrap()).unwrap();
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
        use crate::structure_geometry::{Cardinal, StaticInstance};
        let (mut kernel, surface, contact) = world();
        kernel.environment.as_mut().unwrap().structures.insert("wall".into(), StructureDefinition {
            id: "wall".into(), shape: StructureShape::Wall { height: 4 }, materials: BTreeMap::new(), work_seconds: 1.0,
            work_reach_below_cells: 0, on_complete: Default::default(), on_remove: RemovalRecipe::default(),
        });
        let wall = StaticInstance::Wall { id: "support-wall".into(), base: crate::generation::Cell { x: surface.x, y: surface.y + 1, z: surface.z }, height: 4 };
        let upper = StaticInstance::Floor { id: "dependent-floor".into(), support: crate::generation::Cell { x: surface.x, y: surface.y + 4, z: surface.z } };
        let prepared = kernel.environment.as_mut().unwrap().world.prepare_structures(vec![wall, upper]).unwrap().unwrap();
        kernel.environment.as_mut().unwrap().world.apply_structures(prepared).unwrap();
        let state = ConstructionSite { catalog: "wall".into(), x: surface.x, y: surface.y + 1, z: surface.z, orientation: Cardinal::North, seconds: 1.0, phase: ConstructionPhase::Finished };
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
        assert_eq!(kernel.ecs.get::<StockpileCell>(port).unwrap().zone, "shelves");
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
            "format":"hive-game", "version":1, "game":"construction-recipe",
            "components":[], "initial":[]
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
        let action = json!({"delta":0.0,"writes":[],"actions":[{"kind":"designate-stockpile","zone":"zone-a","cells":[{"x":surface.x,"y":surface.y,"z":surface.z,"priority":2,"filterProfile":"materials","capacity":3}]}]});
        let result: serde_json::Value = serde_json::from_str(&kernel.advance_json(&action.to_string()).unwrap()).unwrap();
        assert_eq!(result["results"][0]["accepted"], true);
        assert_eq!(kernel.query_json("[\"hive.stockpile-cell\"]").unwrap().contains("zone-a"), true);
        let before = kernel.query_json("[\"hive.stockpile-cell\"]").unwrap();
        let bad = json!({"delta":0.0,"writes":[],"actions":[{"kind":"designate-stockpile","zone":"zone-a","cells":[{"x":surface.x,"y":surface.y+10,"z":surface.z,"priority":2,"filterProfile":"materials","capacity":3}]}]});
        let rejected: serde_json::Value = serde_json::from_str(&kernel.advance_json(&bad.to_string()).unwrap()).unwrap();
        assert_eq!(rejected["results"][0]["accepted"], false);
        assert_eq!(kernel.query_json("[\"hive.stockpile-cell\"]").unwrap(), before);
    }

    #[test]
    fn native_stockpile_capacity_transfer_shrink_and_restore_are_atomic() {
        let (mut kernel, surface, contact) = world();
        setup(&mut kernel, surface, &contact);
        kernel.advance_json(&json!({"delta":1.0,"writes":[],"actions":[]}).to_string()).unwrap();
        let designation = |zone: &str, cell: crate::generation::Cell, capacity: u32| json!({"delta":0.0,"writes":[],"actions":[{"kind":"designate-stockpile","zone":zone,"cells":[{"x":cell.x,"y":cell.y,"z":cell.z,"priority":2,"filterProfile":"materials","capacity":capacity}]}]});
        let ground = serde_json::from_str::<serde_json::Value>(&kernel.advance_json(&designation("ground-zone", surface, 4).to_string()).unwrap()).unwrap();
        assert_eq!(ground["results"][0]["accepted"], true);
        let stockpile_id = ground["results"][0]["entityId"].as_str().unwrap();
        let transfer = json!({"delta":0.0,"writes":[],"actions":[{"kind":"transfer","lot":"lot.2","from":"source","to":stockpile_id,"quantity":4}]});
        let moved = serde_json::from_str::<serde_json::Value>(&kernel.advance_json(&transfer.to_string()).unwrap()).unwrap();
        assert_eq!(moved["results"][0]["accepted"], true);
        let cells: serde_json::Value = serde_json::from_str(&kernel.query_json("[\"hive.stockpile-cell\"]").unwrap()).unwrap();
        assert_eq!(cells[0]["components"]["hive.stockpile-cell"]["zone"], "ground-zone");
        let containers: serde_json::Value = serde_json::from_str(&kernel.query_json("[\"hive.container\"]").unwrap()).unwrap();
        assert_eq!(containers.as_array().unwrap().iter().find(|row| row["id"] == stockpile_id).unwrap()["components"]["hive.container"]["capacity"], 4);
        let lots: serde_json::Value = serde_json::from_str(&kernel.query_json("[\"hive.lot\"]").unwrap()).unwrap();
        assert_eq!(lots.as_array().unwrap().iter().find(|row| row["id"] == "lot.2").unwrap()["components"]["hive.lot"]["quantity"], 4);
        assert_eq!(lots.as_array().unwrap().iter().find(|row| row["id"] == "lot.2").unwrap()["components"]["hive.lot"]["container"], stockpile_id);
        let before_shrink = kernel.save_records().unwrap();
        let shrink = serde_json::from_str::<serde_json::Value>(&kernel.advance_json(&designation("ground-zone", surface, 3).to_string()).unwrap()).unwrap();
        assert_eq!(shrink["results"][0]["accepted"], false);
        let after_shrink = kernel.save_records().unwrap();
        let mut before_entities: serde_json::Value = serde_json::from_str(&before_shrink.entities).unwrap();
        let mut after_entities: serde_json::Value = serde_json::from_str(&after_shrink.entities).unwrap();
        before_entities.as_object_mut().unwrap().remove("revision");
        after_entities.as_object_mut().unwrap().remove("revision");
        assert_eq!(after_entities, before_entities);
        assert_eq!(after_shrink.environment.as_ref().map(|(_, records)| (&records.header, &records.terrain, &records.water, &records.structures)), before_shrink.environment.as_ref().map(|(_, records)| (&records.header, &records.terrain, &records.water, &records.structures)));
        let before = kernel.query_json("[\"hive.stockpile-cell\"]").unwrap();
        let mixed = json!({"delta":0.0,"writes":[],"actions":[{"kind":"designate-stockpile","zone":"ground-zone","cells":[{"x":surface.x,"y":surface.y,"z":surface.z,"priority":4,"filterProfile":"materials","capacity":3},{"x":surface.x,"y":surface.y+10,"z":surface.z,"priority":4,"filterProfile":"materials","capacity":3}]}]});
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
        kernel.advance_json(r#"{"delta":0,"writes":[],"actions":[{"kind":"cancel-work","entity":"worker-1"}]}"#).unwrap();
        let released = kernel.save_records().unwrap();
        let mut resumed = Kernel::new();
        resumed.restore_records(&released).unwrap();
        resumed.advance_json(&json!({"delta":0,"writes":[],"actions":[{"kind":"attend-construction","worker":"worker-2","site":"site-1","contact":contact}]}).to_string()).unwrap();
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
        let response: serde_json::Value = serde_json::from_str(&kernel.advance_json(&json!({"delta":0.0,"writes":[],"actions":[
            {"kind":"plan-construction","party":"party","catalog":"floor","site":"site-1","x":surface.x,"y":surface.y,"z":surface.z,"orientation":"north"},
            {"kind":"bind-construction-stage","site":"site-1","contact":contact},
            {"kind":"attend-construction","worker":"worker-1","site":"site-1","contact":contact},
            {"kind":"attend-construction","worker":"worker-1","site":"site-1","contact":contact}
        ]}).to_string()).unwrap()).unwrap();
        assert_eq!(response["results"].as_array().unwrap().len(), 4);
        assert!(response["results"].as_array().unwrap().iter().all(|result| result["accepted"] == true));
        kernel.advance_json(r#"{"delta":1,"writes":[],"actions":[]}"#).unwrap();
        let state = kernel.query_json(r#"["hive.construction-site"]"#).unwrap();
        assert!(state.contains("\"seconds\":0.0"));
    }

    #[test]
    fn standing_wall_obstruction_preserves_progress_and_material() {
        let (mut kernel, surface, contact) = world();
        wall_catalog(&mut kernel);
        let spacing = kernel.environment.as_ref().unwrap().world.cell_spacing_m();
        let bystander = kernel.entity("worker-2").unwrap();
        kernel.ecs.entity_mut(bystander).insert(Position { x: surface.x as f64 * spacing[0], y: (f64::from(surface.y) + 0.5) * spacing[1], z: surface.z as f64 * spacing[2], facing: 0.0 });
        kernel.rebuild_physical_indexes(true).unwrap();
        let response: serde_json::Value = serde_json::from_str(&kernel.advance_json(&json!({"delta":0.0,"writes":[],"actions":[
            {"kind":"plan-construction","party":"party","catalog":"wall","site":"site-wall","x":surface.x,"y":surface.y + 1,"z":surface.z,"orientation":"north"},
            {"kind":"bind-construction-stage","site":"site-wall","contact":contact},
            {"kind":"transfer","lot":"lot.1","from":"source","to":"site-wall","quantity":1},
            {"kind":"attend-construction","worker":"worker-1","site":"site-wall","contact":contact}
        ]}).to_string()).unwrap()).unwrap();
        assert_eq!(response["results"].as_array().unwrap().len(), 4);
        assert!(response["results"].as_array().unwrap().iter().all(|result| result["accepted"] == true));

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

        let response: serde_json::Value = serde_json::from_str(&kernel.advance_json(&json!({"delta":0.0,"writes":[],"actions":[
            {"kind":"plan-construction","party":"party","catalog":"wall","site":"site-air-wall","x":surface.x,"y":surface.y + 1,"z":surface.z,"orientation":"north"},
            {"kind":"bind-construction-stage","site":"site-air-wall","contact":contact},
            {"kind":"transfer","lot":"lot.1","from":"source","to":"site-air-wall","quantity":1},
            {"kind":"attend-construction","worker":"worker-1","site":"site-air-wall","contact":contact}
        ]}).to_string()).unwrap()).unwrap();
        assert!(response["results"].as_array().unwrap().iter().all(|result| result["accepted"] == true));

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
        let response: serde_json::Value = serde_json::from_str(&kernel.advance_json(&json!({"delta":0.0,"writes":[],"actions":[
            {"kind":"plan-construction","party":"party","catalog":"wall","site":"site-edge","x":surface.x,"y":surface.y + 1,"z":surface.z,"orientation":"north"},
            {"kind":"bind-construction-stage","site":"site-edge","contact":contact},
            {"kind":"transfer","lot":"lot.1","from":"source","to":"site-edge","quantity":1},
            {"kind":"attend-construction","worker":"worker-1","site":"site-edge","contact":contact},
            {"kind":"move","entity":"worker-2","destination":target}
        ]}).to_string()).unwrap()).unwrap();
        assert!(response["results"].as_array().unwrap().iter().all(|result| result["accepted"] == true));
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
        let response: serde_json::Value = serde_json::from_str(&kernel.advance_json(&json!({"delta":0.0,"writes":[],"actions":[
            {"kind":"plan-construction","party":"party","catalog":"wall","site":"site-future","x":surface.x + 2,"y":surface.y + 1,"z":surface.z,"orientation":"north"},
            {"kind":"bind-construction-stage","site":"site-future","contact":next_contact},
            {"kind":"transfer","lot":"lot.1","from":"source","to":"site-future","quantity":1},
            {"kind":"attend-construction","worker":"worker-1","site":"site-future","contact":next_contact},
            {"kind":"move","entity":"worker-2","destination":target}
        ]}).to_string()).unwrap()).unwrap();
        assert!(response["results"].as_array().unwrap().iter().all(|result| result["accepted"] == true));
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
        site["components"]["hive.construction-site"]["x"] = serde_json::Value::from(i64::MAX);
        records.entities = serde_json::to_string(&entities).unwrap();
        let mut restored = Kernel::new();
        assert!(restored.restore_records(&records).is_err());
    }

    #[test]
    fn construction_access_wall_is_ordered_and_binding_is_stable() {
        let (mut kernel, surface, contact) = world();
        wall_catalog(&mut kernel);
        let planned: serde_json::Value = serde_json::from_str(&kernel.advance_json(&json!({"delta":0.0,"writes":[],"actions":[
            {"kind":"plan-construction","party":"party","catalog":"wall","site":"access-wall","x":surface.x,"y":surface.y+1,"z":surface.z,"orientation":"north"}
        ]}).to_string()).unwrap()).unwrap();
        assert_eq!(planned["results"][0]["accepted"], true);
        let site_entity = kernel.entity("access-wall").unwrap();
        assert!(kernel.ecs.get::<Position>(site_entity).is_none());
        let rows: serde_json::Value = serde_json::from_str(&kernel.construction_access_json("[\"access-wall\"]").unwrap()).unwrap();
        assert_eq!(rows[0]["support"], "ready");
        let spacing = kernel.environment.as_ref().unwrap().world.cell_spacing_m();
        assert_eq!(rows[0]["contacts"], json!([
            {"x":(surface.x as f64 - 1.0) * spacing[0], "y":contact.y, "z":surface.z as f64 * spacing[2], "frame":null, "kind":"origin"},
            {"x":surface.x as f64 * spacing[0], "y":contact.y, "z":(surface.z as f64 - 1.0) * spacing[2], "frame":null, "kind":"origin"},
            {"x":surface.x as f64 * spacing[0], "y":contact.y, "z":(surface.z as f64 + 1.0) * spacing[2], "frame":null, "kind":"origin"},
            {"x":(surface.x as f64 + 1.0) * spacing[0], "y":contact.y, "z":surface.z as f64 * spacing[2], "frame":null, "kind":"origin"}
        ]));
        let bad = Point { x: contact.x + 0.25, ..contact.clone() };
        let rejected: serde_json::Value = serde_json::from_str(&kernel.advance_json(&json!({"delta":0.0,"writes":[],"actions":[{"kind":"bind-construction-stage","site":"access-wall","contact":bad}]}).to_string()).unwrap()).unwrap();
        assert_eq!(rejected["results"][0]["accepted"], false);
        assert!(kernel.ecs.get::<Position>(site_entity).is_none());
        let bound: serde_json::Value = serde_json::from_str(&kernel.advance_json(&json!({"delta":0.0,"writes":[],"actions":[{"kind":"bind-construction-stage","site":"access-wall","contact":contact}]}).to_string()).unwrap()).unwrap();
        assert_eq!(bound["results"][0]["accepted"], true);
        let saved = kernel.save_records().unwrap();
        let mut restored = Kernel::new();
        restored.restore_records(&saved).unwrap();
        assert_eq!(restored.save_records().unwrap().entities, saved.entities);
        let before_duplicate = restored.query_json(r#"["hive.position","hive.construction-site"]"#).unwrap();
        let duplicate: serde_json::Value = serde_json::from_str(&restored.advance_json(&json!({"delta":0.0,"writes":[],"actions":[{"kind":"bind-construction-stage","site":"access-wall","contact":contact}]}).to_string()).unwrap()).unwrap();
        assert_eq!(duplicate["results"][0]["accepted"], false);
        assert_eq!(restored.query_json(r#"["hive.position","hive.construction-site"]"#).unwrap(), before_duplicate);
    }

    #[test]
    fn construction_access_attendance_can_choose_other_contact() {
        let (mut kernel, surface, contact) = world();
        kernel.advance_json(&json!({"delta":0.0,"writes":[],"actions":[
            {"kind":"plan-construction","party":"party","catalog":"floor","site":"access-floor","x":surface.x,"y":surface.y,"z":surface.z,"orientation":"north"},
            {"kind":"bind-construction-stage","site":"access-floor","contact":contact}
        ]}).to_string()).unwrap();
        let spacing = kernel.environment.as_ref().unwrap().world.cell_spacing_m();
        let selected = Point { x: (surface.x as f64 - 1.0) * spacing[0], ..contact.clone() };
        let worker = kernel.entity("worker-1").unwrap();
        kernel.ecs.entity_mut(worker).insert(Position { x:selected.x, y:selected.y, z:selected.z, facing:0.0 });
        kernel.rebuild_physical_indexes(true).unwrap();
        let attended: serde_json::Value = serde_json::from_str(&kernel.advance_json(&json!({"delta":0.0,"writes":[],"actions":[{"kind":"attend-construction","worker":"worker-1","site":"access-floor","contact":selected}]}).to_string()).unwrap()).unwrap();
        assert_eq!(attended["results"][0]["accepted"], true);
        let state = kernel.ecs.get::<ConstructionSite>(kernel.entity("access-floor").unwrap()).unwrap();
        assert_eq!(state.phase, ConstructionPhase::Working);
        assert_eq!(kernel.ecs.get::<Position>(kernel.entity("access-floor").unwrap()).unwrap().x, contact.x);
    }

    #[test]
    fn upper_floor_waits_for_completed_wall_then_binds_from_ground() {
        let (mut kernel, surface, _) = world();
        let environment = kernel.environment.as_mut().unwrap();
        environment.structures.get_mut("floor").unwrap().work_reach_below_cells = 4;
        let mut definition: serde_json::Value = serde_json::from_str(&environment.definition).unwrap();
        let floor = definition["structures"]["catalog"].as_array_mut().unwrap()
            .iter_mut().find(|entry| entry["id"] == "floor").unwrap();
        floor["workReachBelowCells"] = json!(4);
        environment.definition = serde_json::to_string(&definition).unwrap();

        let floor_y = surface.y + 4;
        let planned: serde_json::Value = serde_json::from_str(&kernel.advance_json(&json!({
            "delta":0.0,"writes":[],"actions":[{
                "kind":"plan-construction","party":"party","catalog":"floor","site":"wall-top-floor",
                "x":surface.x,"y":floor_y,"z":surface.z,"orientation":"north"
            }]
        }).to_string()).unwrap()).unwrap();
        assert_eq!(planned["results"][0]["accepted"], true);
        let before: serde_json::Value = serde_json::from_str(
            &kernel.construction_access_json("[\"wall-top-floor\"]").unwrap(),
        ).unwrap();
        assert_eq!(before[0]["support"], "waitingForSupport");

        let wall = crate::structure_geometry::StaticInstance::Wall {
            id: "completed-wall".into(),
            base: crate::generation::Cell { x: surface.x, y: surface.y + 1, z: surface.z },
            height: 4,
        };
        let prepared = kernel.environment.as_mut().unwrap().world
            .prepare_structures(vec![wall]).unwrap().unwrap();
        kernel.environment.as_mut().unwrap().world.apply_structures(prepared).unwrap();

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
            "delta":0.0,"writes":[],"actions":[{
                "kind":"bind-construction-stage","site":"wall-top-floor","contact":contact
            }]
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
        kernel.advance_json(&json!({"delta":0.0,"writes":[],"actions":[{"kind":"plan-construction","party":"party","catalog":"stair","site":"access-stair","x":surface.x,"y":surface.y,"z":surface.z,"orientation":"east"}]}).to_string()).unwrap();
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
        kernel.advance_json(&json!({"delta":0.0,"writes":[],"actions":[{"kind":"plan-construction","party":"party","catalog":"bed","site":"access-bed","x":surface.x,"y":surface.y+1,"z":surface.z,"orientation":"east"}]}).to_string()).unwrap();
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
            crate::structure_geometry::StaticInstance::Wall { id: "wall-contact".into(), base: crate::generation::Cell { y: surface.y + 1, ..surface }, height: 1 },
        ];
        let prepared = kernel.environment.as_mut().unwrap().world.prepare_structures(structures).unwrap().unwrap();
        kernel.environment.as_mut().unwrap().world.apply_structures(prepared).unwrap();
        let outside = kernel.environment.as_ref().unwrap().world.bounds().max_x + 1;
        let facts: serde_json::Value = serde_json::from_str(&kernel.physical_contacts_json(&json!([
            [surface.x + 1, surface.y + 1, surface.z], [surface.x, surface.y + 1, surface.z], [outside, surface.y, surface.z]
        ]).to_string()).unwrap()).unwrap();
        assert_eq!(facts[0], json!({"solid":false,"sealedTop":true,"outside":false}));
        assert_eq!(facts[1], json!({"solid":true,"sealedTop":true,"outside":false}));
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
fn terrain_motion_blocked(position: Position, path: &VecDeque<Point>, mut budget: f64,
    blocked: &BTreeSet<navigation::Cell>) -> bool {
    if blocked.is_empty() || budget <= 0.0 { return false; }
    let mut from = navigation::point(position);
    for target in path {
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
struct TerrainRouteState {
    path: Vec<crate::generation::Cell>,
    revision: Option<u64>,
    waiting: bool,
    suspended: bool,
    origin: Point,
    target: Option<Point>,
}

pub struct Kernel {
    ecs: World,
    environment: Option<KernelEnvironment>,
    discard_required: bool,
    registry: Registry,
    ids: BTreeMap<String, Entity>,
    known: BTreeSet<String>,
    queries: BTreeMap<Vec<String>, QueryState<Entity>>,
    contents: BTreeMap<String, BTreeSet<Entity>>,
    blocked_by_frame: BTreeMap<Option<String>, BTreeSet<navigation::Cell>>,
    route_cost_failures: route_query::FailureCache,
    routes: BTreeMap<Entity, VecDeque<Point>>,
    terrain_routes: BTreeMap<Entity, TerrainRouteState>,
    direct: BTreeMap<Entity, DirectState>,
    game: String,
    revision: u64,
    time: f64,
    next_lot: u64,
    next_projectile: u64,
    next_impact: u64,
    projectile_count: usize,
    projectile_contacts: BTreeMap<String, BTreeSet<String>>,
    collider_ids: BTreeSet<String>,
    state_weight: usize,
    material_consumption_owner: Arc<()>,
    ground_stock_cleanup_pending: bool,
    bound_process_lots: BTreeSet<String>,
    next_work_generation: u64,
    work_attempts: BTreeMap<String, Entity>,
    attempts_by_worker: BTreeMap<String, AttemptKey>,
    arrived_routes: BTreeSet<Entity>,
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
            }
            for port in &definition.on_complete.ports {
                for (name, value) in &port.components {
                    if crate::registry::Registry::is_physical(name) && !matches!(name.as_str(), "hive.container" | "hive.stockpile-cell" | "hive.emitter" | "hive.visual") {
                        return Err(format!("physical component {name} cannot be installed on a completed structure port"));
                    }
                    self.registry.validate(name, value, &known)?;
                }
            }
        }
        Ok(())
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
                || process.worker.as_deref().is_some_and(|worker| !self.ids.contains_key(worker))
                || (process.phase == ProcessPhase::Working) != process.worker.is_some()
                || (process.phase == ProcessPhase::Blocked && process.worker.is_some())
                || (process.phase == ProcessPhase::Blocked) != !process.blocked_reason.is_empty()
                || (process.phase != ProcessPhase::Blocked) && !process.blocked_reason.is_empty()
            { return Err("saved process fact is invalid".into()); }
            let station = self.entity(&process.station)?;
            let site = self.ecs.get::<ConstructionSite>(station).ok_or("saved process station is missing")?;
            if site.phase != ConstructionPhase::Finished || site.catalog != definition.station_catalog || self.ecs.get::<SealedContainer>(station).is_none() { return Err("saved process station binding is invalid".into()); }
            if id != &format!("process:{}:{}", process.station, process.definition) { return Err("saved process identity is invalid".into()); }
            let bindings = bindings_by_process.remove(id).unwrap_or_default();
            if matches!(process.phase, ProcessPhase::Working | ProcessPhase::Blocked) && bindings.is_empty() { return Err("active process has no bindings".into()); }
            if process.phase == ProcessPhase::Complete && !bindings.is_empty() { return Err("completed process retains input bindings".into()); }
            if !bindings.is_empty() {
                crate::staged_process::validate_bindings(
                    definition, id, &process.station, &bindings.iter().map(|(_, binding)| binding.clone()).collect::<Vec<_>>(),
                    &|lot_id| self.ids.get(lot_id).and_then(|entity| self.ecs.get::<Lot>(*entity).cloned()),
                )?;
            }
        }
        if !bindings_by_process.is_empty() { return Err("saved process binding references an unknown process".into()); }
        Ok(())
    }
    pub fn new() -> Self {
        let mut ecs = World::new();
        let registry = Registry::new(&mut ecs, vec![]).expect("builtin schemas");
        Self {
            ecs,
            environment: None,
            discard_required: false,
            registry,
            ids: BTreeMap::new(),
            known: BTreeSet::new(),
            queries: BTreeMap::new(),
            contents: BTreeMap::new(),
            blocked_by_frame: BTreeMap::new(),
            route_cost_failures: route_query::FailureCache::default(),
            routes: BTreeMap::new(),
            terrain_routes: BTreeMap::new(),
            direct: BTreeMap::new(),
            game: String::new(),
            revision: 0,
            time: 0.0,
            next_lot: 1,
            next_projectile: 1,
            next_impact: 1,
            projectile_count: 0,
            projectile_contacts: BTreeMap::new(),
            collider_ids: BTreeSet::new(),
            state_weight: 0,
            material_consumption_owner: Arc::new(()),
            ground_stock_cleanup_pending: false,
            bound_process_lots: BTreeSet::new(),
            next_work_generation: 1,
            work_attempts: BTreeMap::new(),
            attempts_by_worker: BTreeMap::new(),
            arrived_routes: BTreeSet::new(),
        }
    }
    fn ensure_ready(&self) -> Result<()> {
        if self.discard_required { return Err("kernel attempt requires durable restore".into()); }
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
            || scene.version != 1
            || !valid_id(&scene.game)
            || scene.initial.len() > 16384
        {
            return Err("unsupported or oversized scene".into());
        }
        let mut world = Self::new();
        world.registry = Registry::new(&mut world.ecs, scene.components)?;
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
                    if next == 0 || next >= previous_points.len()
                        || !remaining.iter().eq(previous_points[next..].iter())
                    {
                        return Err("invalid retained route progress".into());
                    }
                    contact_start = crate::terrain_route::active_support_index_with_stairs(&previous.path, next, &stairs)?;
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
                let mut query = |cell| environment.world.traversal_material(cell);
                let obstacle = |cell: crate::generation::Cell| {
                    i32::try_from(cell.x).ok().zip(i32::try_from(cell.z).ok()).is_some_and(|(x, z)| {
                        let y = ((f64::from(cell.y) + 0.5) * spacing[1]).round() as i32;
                        blocked.contains(&(x, y, z))
                    })
                };
                if !history.is_empty() && (!crate::terrain_traversal::path_supported_with_stairs(&history[contact_start..], config, &mut query, &stairs)?
                    || history[contact_start..].iter().copied().any(&obstacle)) {
                    return Err("retained terrain contact is no longer traversable".into());
                }
                let mut path = crate::terrain_route::search_with_blocked_and_stairs(start_cell, destination_cell, config, &mut query, &obstacle, &stairs)?;
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
                    suspended: false,
                    origin,
                    target: points.first().cloned(),
                };
                return Ok(PreparedRoute { points: points.into_iter().collect(), terrain: Some(terrain) });
            }
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
        let mut query = |cell| environment.world.traversal_material(cell);
        let paths = crate::terrain_route::search_many_with_blocked_and_stairs(start_cell, &targets, config, &mut query, &obstacle, &stairs)?;
        let revision = environment.world.terrain_revision();
        let routes: Vec<Result<PreparedRoute>> = paths.into_iter().map(|path| {
            match path {
            Ok(path) => {
                let mut points = crate::terrain_route::waypoints_with_stairs(&path, config, &stairs)?;
                if points.len() > 4096 { return Err("terrain route waypoint budget exceeded".into()); }
                if points.len() > 1 { points.remove(0); }
                if points.len() > 4096 || crate::terrain_route::path_waypoint_count(&path, &stairs)? > 4096 { return Err("terrain route waypoint budget exceeded".into()); }
                let target = points.first().cloned();
                Ok(PreparedRoute { points: points.into_iter().collect(), terrain: Some(TerrainRouteState { path, revision: Some(revision), waiting: false, suspended: false, origin: start_point.clone(), target }) })
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
        let mut query = |cell| environment.world.traversal_material(cell);
        let (index,path) = crate::terrain_route::search_any_with_blocked_and_stairs(start_cell,&targets,config,&mut query,&obstacle,&stairs)?;
        let mut points = crate::terrain_route::waypoints_with_stairs(&path,config,&stairs)?;
        if points.len() > 4096 { return Err("terrain route waypoint budget exceeded".into()); }
        if points.len() > 1 { points.remove(0); }
        let target = points.first().cloned();
        let terrain = TerrainRouteState { path, revision:Some(environment.world.terrain_revision()), waiting:false, suspended:false, origin:start_point, target };
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
    fn install_route(&mut self, entity: Entity, prepared: PreparedRoute) {
        self.routes.insert(entity, prepared.points);
        match prepared.terrain {
            Some(state) => { self.terrain_routes.insert(entity, state); }
            None => { self.terrain_routes.remove(&entity); }
        }
    }
    fn restore_routes(&mut self, saved: Vec<RouteSnapshot>) -> Result<()> {
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
            if restored.insert(entity, VecDeque::from(route.path.clone())).is_some() {
                return Err("duplicate saved route".into());
            }
            let destination = self.ecs.get::<Destination>(entity);
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
                navigation::validate_saved_path(
                    navigation::point(start),
                    &route.path,
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
                    || route.path.is_empty()
                    || route.terrain_origin.is_none() || route.terrain_target.is_none()
                {
                    return Err("invalid saved terrain route capability".into());
                }
                if route.terrain_target.as_ref() != route.path.first() {
                    return Err("saved terrain route target witness mismatch".into());
                }
                self.terrain_routes.insert(entity, TerrainRouteState {
                    path,
                    revision: None,
                    waiting: route.terrain_waiting,
                    suspended: route.terrain_suspended,
                    origin: route.terrain_origin.unwrap_or_else(|| navigation::point(start)),
                    target: route.terrain_target.or_else(|| route.path.first().cloned()),
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
        self.routes = restored;
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
            }
            if self.ecs.get::<GroundStock>(*entity).is_some()
                && (self.ecs.get::<Container>(*entity).is_none() || position.is_none()
                    || self.ecs.get::<Body>(*entity).is_some()) {
                return Err("ground stock requires a positioned non-actor container".into());
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
    fn apply_initial_surface_placements(&mut self, placements: &[crate::environment_definition::InitialSurfacePlacement]) -> Result<()> {
        if placements.is_empty() {
            return Ok(());
        }
        let entities: Vec<_> = placements.iter().map(|placement| {
            let entity = self.entity(&placement.entity)?;
            if self.ecs.get::<Support>(entity).is_some() || self.ecs.get::<Destination>(entity).is_some()
                || self.ecs.get::<Surface>(entity).is_some() || self.ecs.get::<ExcavationWork>(entity).is_some()
                || self.routes.contains_key(&entity) || self.direct.contains_key(&entity)
            {
                return Err("initial placement entity has support, surface, excavation, or active route".into());
            }
            let position = *self.ecs.get::<Position>(entity).ok_or("initial placement entity has no position")?;
            Ok((placement.entity.clone(), position, self.ecs.get::<Traversal>(entity).copied(), placement.column))
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
    pub fn transfer_contacts_json(&mut self, input: &str) -> Result<String> {
        #[derive(serde::Deserialize)]
        #[serde(deny_unknown_fields)]
        struct Request { worker: String, container: String }
        let request: Request = serde_json::from_str(input).map_err(|error| error.to_string())?;
        let worker = self.entity(&request.worker)?;
        let container = self.entity(&request.container)?;
        if self.ecs.get::<SealedContainer>(container).is_some() {
            return serde_json::to_string(&json!({"kind":"blocked","reason":"sealed"})).map_err(|error| error.to_string());
        }
        self.world_pose_entity(worker, 0).map_err(|reason| if reason == "no position" { "unavailable-frame".to_owned() } else { reason })?;
        let frame = self.support_id(worker);
        let container_frame = if self.ecs.get::<Position>(container).is_none() && self.ecs.get::<ConstructionSite>(container).is_some() { None } else { self.contact_frame(container)? };
        if container_frame != frame {
            return serde_json::to_string(&json!({"kind":"blocked","reason":"unavailable-frame"})).map_err(|error| error.to_string());
        }
        let traversal = self.ecs.get::<Traversal>(worker).copied().ok_or("worker lacks traversal capability")?;
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
            Err(reason) => return Err(reason),
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
            let container_pose = self.contact_pose(container).map_err(|reason| if reason == "no position" { "unavailable-frame".to_owned() } else { reason })?;
            let raw = [container_pose.x / spacing[0], container_pose.y / spacing[1] - 0.5, container_pose.z / spacing[2]];
            if raw.iter().any(|value| !value.is_finite() || (value - value.round()).abs() > 1e-7) {
                return serde_json::to_string(&json!({"kind":"blocked","reason":"no-contact"})).map_err(|error| error.to_string());
            }
            let center = crate::generation::Cell { x: raw[0] as i64, y: raw[1] as i32, z: raw[2] as i64 };
            (terrain_points(center)?, Some([container_pose.x, container_pose.y, container_pose.z]))
        };
        let config = crate::terrain_traversal::TraversalConfig { spacing, clearance_cells: traversal.clearance_cells, max_step_cells: traversal.max_step_cells };
        let mut targets = Vec::new();
        for point in source_points {
            let raw = [point[0] / spacing[0], point[1] / spacing[1] - 0.5, point[2] / spacing[2]];
            let cell = crate::generation::Cell { x: raw[0].round() as i64, y: raw[1].round() as i32, z: raw[2].round() as i64 };
            let environment = self.environment.as_mut().ok_or("world has no environment")?;
            let mut query = |at| environment.world.traversal_material(at);
            if crate::terrain_traversal::node(cell, config, &mut query)?.is_none() { continue; }
            if contact_reference.is_some_and(|reference| !interaction_contact::within_transfer_reach(reference, point)) { continue; }
            targets.push(json!({"x":point[0],"y":point[1],"z":point[2],"frame":frame.as_deref()}));
        }
        if targets.is_empty() {
            return serde_json::to_string(&json!({"kind":"blocked","reason":"no-contact"})).map_err(|error| error.to_string());
        }
        serde_json::to_string(&json!({"kind":"ready","targets":targets})).map_err(|error| error.to_string())
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
        // Bounded saved obligations drive fire presentation; they are never a
        // client clock or an instruction to add more smoke.
        facts["emissions"] = json!(environment.paid_emissions.iter().map(|(source, emission)| {
            json!({"source":source,"catalog":emission.catalog,
                "cell":[emission.cell.x,emission.cell.y,emission.cell.z],
                "elapsedS":emission.elapsed_s})
        }).collect::<Vec<_>>());
        serde_json::to_string(&facts).map_err(|error| error.to_string())
    }
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
        candidate.restore_json(&records.entities)?;
        if let Some((definition, records)) = &records.environment {
            let prepared = crate::environment_definition::prepare_definition(definition)?;
            let world = crate::terrain_water::TerrainWater::restore_records(
                prepared.geometry, prepared.terrain, records)?;
            let mut environment = KernelEnvironment { atmosphere: None, paid_emissions: BTreeMap::new(), emissions: prepared.emissions, processes: prepared.processes, resources: prepared.resources, definition: definition.clone(), world, excavation_rules: prepared.excavation_rules, structures: prepared.structures };
            environment.restore_air(prepared.atmosphere.as_ref(), records_atmosphere.as_deref(), candidate.revision)?;
            candidate.environment = Some(environment);
            candidate.validate_structure_recipes()?;
            candidate.validate_process_records()?;
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
        candidate.ground_stock_cleanup_pending = true;
        *self = candidate;
        Ok(())
    }
    pub fn snapshot_json(&self) -> Result<String> {
        self.ensure_ready()?;
        if self.environment.is_some() { return Err("environment worlds require save_records".into()); }
        self.snapshot_entities_json()
    }
    fn snapshot_entities_json(&self) -> Result<String> {
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
            .map(|(entity, path)| RouteSnapshot {
                entity: self.ecs.get::<ExternalId>(*entity).unwrap().0.clone(),
                path: path.iter().cloned().collect(),
                terrain_path: self.terrain_routes.get(entity).map(|state| state.path.clone()),
                terrain_waiting: self.terrain_routes.get(entity).is_some_and(|state| state.waiting),
                terrain_suspended: self.terrain_routes.get(entity).is_some_and(|state| state.suspended),
                terrain_origin: self.terrain_routes.get(entity).map(|state| state.origin.clone()),
                terrain_target: self.terrain_routes.get(entity).and_then(|state| state.target.clone()),
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
        let state = Snapshot {
            format: "hive-kernel".into(),
            version: 8,
            revision: self.revision,
            time: self.time,
            next_lot: self.next_lot,
            next_projectile: self.next_projectile,
            next_impact: self.next_impact,
            scene: Scene {
                format: "hive-game".into(),
                version: 1,
                game: self.game.clone(),
                components: self.registry.schemas.values().cloned().collect(),
                initial,
            },
            routes,
            direct,
            projectile_contacts: self.projectile_contacts.iter().map(|(projectile_id, targets)| ProjectileContactsSnapshot {
                projectile_id: projectile_id.clone(),
                targets: targets.iter().cloned().collect(),
            }).collect(),
            next_work_generation: self.next_work_generation,
            work_attempts: self.work_attempts.values().filter_map(|entity| self.ecs.get::<WorkAttempt>(*entity).cloned()).collect(),
        };
        serde_json::to_string(&state).map_err(|e| e.to_string())
    }
    pub fn restore_json(&mut self, input: &str) -> Result<()> {
        if self.environment.is_some() { return Err("environment worlds require restore_records".into()); }
        if input.len() > 8 * 1024 * 1024 {
            return Err("snapshot too large".into());
        }
        let state: Snapshot = serde_json::from_str(input).map_err(|e| e.to_string())?;
        if state.format != "hive-kernel"
            || state.version != 8
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
        let route_bytes = serde_json::to_vec(&state.routes)
            .map_err(|e| e.to_string())?
            .len();
        if candidate.state_weight.saturating_add(route_bytes) > STATE_BYTES {
            return Err("route state exceeds canonical capacity".into());
        }
        candidate.restore_routes(state.routes)?;
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
        candidate.direct = direct;
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
        candidate.projectile_contacts = contacts;
        candidate.refresh_state_weight();
        if candidate.state_weight > STATE_BYTES {
            return Err("projectile contact state exceeds canonical capacity".into());
        }
        candidate.revision = state.revision;
        candidate.time = state.time;
        candidate.next_lot = state.next_lot;
        candidate.next_projectile = state.next_projectile;
        candidate.next_impact = state.next_impact;
        if state.next_work_generation == 0 || state.work_attempts.len() > 16384 {
            return Err("invalid work attempt snapshot".into());
        }
        let mut attempts = BTreeMap::new();
        for attempt in state.work_attempts {
            if !valid_id(&attempt.key.task) || !valid_id(&attempt.worker) || !valid_id(&attempt.party)
                || !candidate.ids.contains_key(&attempt.key.task) || !candidate.ids.contains_key(&attempt.worker)
                || !candidate.ids.contains_key(&attempt.party) || attempt.key.generation == 0
                || attempts.insert(attempt.key.task.clone(), attempt).is_some() {
                return Err("invalid work attempt ownership".into());
            }
        }
        for attempt in attempts.values() {
            if let Some(operation) = attempt.current_operation() {
                if operation.attempt != attempt.key || operation.sequence == 0 { return Err("invalid work attempt operation".into()); }
            }
        }
        candidate.next_work_generation = state.next_work_generation;
        for (task, attempt) in attempts {
            let entity = candidate.entity(&task)?;
            candidate.ecs.entity_mut(entity).insert(attempt.clone());
            candidate.work_attempts.insert(task, entity);
            if candidate.attempts_by_worker.insert(attempt.worker.clone(), attempt.key.clone()).is_some() { return Err("competing work attempt workers".into()); }
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
        *self = candidate;
        Ok(())
    }
    pub fn render_json(&self) -> Result<String> {
        self.ensure_ready()?;
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
            || batch.actions.iter().any(|action| {
                matches!(action, Action::Launch { .. } | Action::Displace { .. }
                    | Action::BeginWorkAttempt { .. } | Action::InterruptWorkAttempt { .. } | Action::AcknowledgeWorkAttempt { .. }
                    | Action::BeginDirect { .. } | Action::DirectInput { .. } | Action::SetStructureOpen { .. }
                    | Action::ExtractResource { .. } | Action::EstablishResourceSite { .. } | Action::TendResourceSite { .. } | Action::DesignateStockpile { .. }
                    | Action::UpdateStockpile { .. } | Action::Deconstruct { .. }
                    | Action::ReplaceFloor { .. }
                    | Action::RequestProcess { .. } | Action::AdmitProcess { .. } | Action::AttendProcess { .. } | Action::ExchangeFieldWater { .. })
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
        let prepared = self.prepare_authored_entities(batch.creates, batch.removes, batch.writes)?;
        self.publish_authored_entities(prepared);
        self.revision += 1;
        let results = batch
            .actions
            .into_iter()
            .map(|action| {
                let result = self.apply_action(action, batch.delta);
                ActionResult {
                    accepted: result.is_ok(),
                    projectile_id: result.as_ref().ok().and_then(|effect| match effect { ActionEffect::Projectile(id, _) => Some(id.clone()), _ => None }),
                    launch_point: result.as_ref().ok().and_then(|effect| match effect { ActionEffect::Projectile(_, point) => Some(*point), _ => None }),
                    entity_id: result.as_ref().ok().and_then(|effect| match effect { ActionEffect::Entity(id) | ActionEffect::Projectile(id, _) => Some(id.clone()), ActionEffect::None | ActionEffect::Attempt(_) => None }),
                    attempt: result.as_ref().ok().and_then(|effect| match effect { ActionEffect::Attempt(key) => Some(key.clone()), _ => None }),
                    reason: result.err(),
                    revision: self.revision,
                }
            })
            .collect::<Vec<_>>();
        let impacts = self.advance_projectiles(batch.delta)?;
        self.advance_direct(batch.delta)?;
        if self.state_weight.saturating_add(self.direct.values().map(Self::direct_weight).sum::<usize>()) > STATE_BYTES { return Err("region canonical state capacity".into()); }
        // Work sees the pre-movement occupation. Arriving this tick does not
        // retroactively earn a full tick of effort after spending it travelling.
        self.advance_excavation(batch.delta)?;
        self.advance_construction(batch.delta)?;
        self.advance_movement(batch.delta)?;
        self.settle_arrived_work_attempts();
        let environment_work = self.environment.as_mut().map(|environment| environment.advance(batch.delta, self.revision)).transpose()?;
        self.advance_staged_processes(batch.delta)?;
        self.cleanup_empty_ground_stock();
        self.time += batch.delta;
        let mut output = json!({"revision":self.revision,"results":results,"impacts":impacts});
        if let Some(work) = environment_work { output["environmentWork"] = serde_json::to_value(work.water).map_err(|e| e.to_string())?; output["atmosphereWork"] = serde_json::to_value(work.air).map_err(|e| e.to_string())?; }
        serde_json::to_string(&output).map_err(|e| e.to_string())
    }
    fn settle_arrived_work_attempts(&mut self) {
        let arrived: Vec<(String, AttemptPhase)> = self.work_attempts.iter().filter_map(|(task, entity)| {
            let attempt = self.ecs.get::<WorkAttempt>(*entity)?;
            let worker = self.entity(&attempt.worker).ok()?;
            if !matches!(attempt.phase, AttemptPhase::Executing { .. }) || !self.arrived_routes.contains(&worker) { return None; }
            let operation = attempt.current_operation()?.clone();
            Some((task.clone(), AttemptPhase::Outcome { operation, activity: match &attempt.phase { AttemptPhase::Executing { activity, .. } => activity.clone(), _ => unreachable!() }, result: WorkOutcome::Completed }))
        }).collect();
        for (task, phase) in arrived { let _ = self.settle_attempt(&task, phase); }
    }
    fn settle_attempt(&mut self, task: &str, phase: AttemptPhase) -> Result<()> {
        let entity = *self.work_attempts.get(task).ok_or("work attempt is not current")?;
        let worker = self.ecs.get::<WorkAttempt>(entity).ok_or("work attempt component is missing")?.worker.clone();
        self.ecs.get_mut::<WorkAttempt>(entity).ok_or("work attempt component is missing")?.phase = phase;
        self.attempts_by_worker.remove(&worker);
        Ok(())
    }
    fn entity(&self, id: &str) -> Result<Entity> {
        self.ids
            .get(id)
            .copied()
            .ok_or_else(|| format!("unknown entity {id}"))
    }
    fn prepare_material_output(&self, spec: MaterialOutputSpec) -> Result<PreparedMaterialOutput> {
        self.ensure_ready()?;
        if self.ids.len() >= 16384 { return Err("region entity capacity".into()); }
        let container = self.entity(&spec.container)?;
        if self.ecs.get::<SealedContainer>(container).is_some() {
            return Err("sealed container cannot receive material output".into());
        }
        let capacity = self.ecs.get::<Container>(container).ok_or("not a container")?.capacity;
        let quantity = self.quantity(&spec.container);
        let lot = Lot { kind: spec.kind.clone(), quantity: spec.quantity, container: spec.container.clone() };
        let water = spec.water_kg.map(|mass| LotWater { water_kg: mass });
        let added_weight = 128
            + self.registry.weight("hive.lot", &record(&lot))
            + water.as_ref().map(|value| self.registry.weight("hive.lot-water", &record(value))).unwrap_or(0);
        let prepared = material_output::prepare(
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
        Ok(prepared)
    }
    fn prepare_ground_output(&self, position: Position, kind: String, quantity: u32, water_kg: Option<f64>) -> Result<PreparedMaterialOutput> {
        self.ensure_ready()?;
        if self.ids.len() + 2 > 16384 { return Err("region entity capacity".into()); }
        if ![position.x, position.y, position.z, position.facing].iter().all(|v| v.is_finite()) {
            return Err("invalid ground stock position".into());
        }
        let (lot_id, _) = material_output::allocate_lot_id(self.next_lot, |id| self.known.contains(id) || self.known.contains(&format!("ground.{id}")))?;
        let ground_id = format!("ground.{lot_id}");
        let lot = Lot { kind: kind.clone(), quantity, container: ground_id.clone() };
        let water = water_kg.map(|water_kg| LotWater { water_kg });
        let added = 256 + ground_id.len()
            + self.registry.weight("hive.position", &record(&position))
            + self.registry.weight("hive.container", &record(&Container { capacity: quantity }))
            + self.registry.weight("hive.ground-stock", &record(&GroundStock {}))
            + self.registry.weight("hive.lot", &record(&lot))
            + water.as_ref().map(|v| self.registry.weight("hive.lot-water", &record(v))).unwrap_or(0);
        let mut output = material_output::prepare(MaterialOutputSpec { container: ground_id.clone(), kind, quantity, water_kg },
            self.revision, self.next_lot, |id| self.known.contains(id) || self.known.contains(&format!("ground.{id}")),
            quantity, 0, self.state_weight, added, STATE_BYTES)?;
        output.ground = Some(material_output::PreparedGroundStock { id: ground_id, position, capacity: quantity });
        Ok(output)
    }
    // Private tokens are prepared and consumed within one synchronous Kernel
    // completion. No public caller can retain them across another mutation.
    fn publish_material_output(&mut self, prepared: PreparedMaterialOutput) -> String {
        if let Some(ground) = prepared.ground {
            let entity = self.ecs.spawn((ExternalId(ground.id.clone()), ground.position, Container { capacity: ground.capacity }, GroundStock {})).id();
            self.ids.insert(ground.id.clone(), entity);
            self.known.insert(ground.id.clone());
            self.contents.entry(ground.id).or_default();
        }
        let entity = if let Some(water) = prepared.water {
            self.ecs.spawn((ExternalId(prepared.lot_id.clone()), prepared.lot, water)).id()
        } else {
            self.ecs.spawn((ExternalId(prepared.lot_id.clone()), prepared.lot)).id()
        };
        self.next_lot = prepared.next_lot;
        self.state_weight = prepared.state_weight;
        self.ids.insert(prepared.lot_id.clone(), entity);
        self.known.insert(prepared.lot_id.clone());
        self.contents.entry(prepared.container).or_default().insert(entity);
        prepared.lot_id
    }
    #[cfg(test)]
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
            material_output::MaterialOutputLocation::Ground(position) => self.prepare_ground_output(position, rule.output_kind.clone(), rule.units_per_cell, water_kg)?,
        };
        let environment = self.environment.as_mut().ok_or("world has no environment")?;
        environment.apply_excavation(excavation)?;
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
            self.contents.remove(id);
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
        Ok(())
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
        direction: WaterExchangeDirection, portions: u8) -> Result<()> {
        let worker = self.entity(worker_id)?;
        let vessel = self.entity(vessel_id)?;
        let worker_pose = self.world_pose_entity(worker, 0)?;
        self.ecs.get::<Body>(worker).ok_or("water exchange requires worker body")?;
        self.ecs.get::<Container>(worker).ok_or("water exchange requires worker container")?;
        if self.ecs.get::<SealedContainer>(worker).is_some() {
            return Err("water exchange requires unsealed worker container".into());
        }
        let vessel_lot = self.ecs.get::<Lot>(vessel).cloned().ok_or("water vessel is not a lot")?;
        if vessel_lot.kind != "pail" || vessel_lot.quantity == 0 || vessel_lot.container != worker_id {
            return Err("water exchange requires a held pail lot".into());
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
        let (field_token, material_token) = match direction {
            WaterExchangeDirection::Withdraw => {
                let field = {
                    let environment = self.environment.as_mut().ok_or("water exchange requires terrain")?;
                    environment.world.prepare_water_exchange(at, crate::terrain_water::WaterExchangeDirection::Withdraw, portions)?
                };
                // Bind the exact physical mass only after the field admission has succeeded.
                let mass = field.receipt().mass_kg;
                let material = self.prepare_material_output(MaterialOutputSpec { container: vessel_id.into(), kind: "water".into(), quantity: u32::from(portions), water_kg: Some(mass) })?;
                (field, PreparedWaterMaterial::Output(material))
            }
            WaterExchangeDirection::Deposit => {
                let mut selected = Vec::new();
                let mut remaining = u32::from(portions);
                let entities = self.contents.get(vessel_id).cloned().unwrap_or_default();
                for entity in entities {
                    if remaining == 0 { break; }
                    let Some(lot) = self.ecs.get::<Lot>(entity) else { continue; };
                    if lot.kind != "water" || lot.quantity == 0 { continue; }
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
                (field, PreparedWaterMaterial::Consumption(material))
            }
        };
        let environment = self.environment.as_mut().ok_or("water exchange requires terrain")?;
        environment.world.apply_water_exchange(field_token)?;
        match material_token {
            PreparedWaterMaterial::Output(material) => { self.publish_material_output(material); }
            PreparedWaterMaterial::Consumption(material) => { self.publish_material_consumption(material)?; }
        }
        Ok(())
    }
    fn extract_resource(&mut self, worker_id: &str, source_id: &str) -> Result<String> {
        let worker = self.entity(worker_id)?;
        let source = self.entity(source_id)?;
        self.contact(worker, source)?;
        if self.ecs.get::<Body>(worker).is_none() { return Err("resource extraction requires a worker body".into()); }
        let resource = self.ecs.get::<FiniteResource>(source).cloned().ok_or("not a finite resource")?;
        if resource.quantity == 0 { return Err("finite resource is exhausted".into()); }
        let position = *self.ecs.get::<Position>(source).ok_or("finite resource has no physical position")?;
        let prepared = self.prepare_ground_output(position, resource.kind, resource.quantity, None)?;
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
        self.exchange_field_water(worker_id, vessel_id, crate::generation::Cell { x: (position.x / spacing[0]).round() as i64, y: (position.y / spacing[1]).floor() as i32, z: (position.z / spacing[2]).round() as i64 }, WaterExchangeDirection::Deposit, portions)?;
        let next_stage = state.stage.checked_add(1).ok_or("resource stage overflow")?;
        let next_due = self.time + definition.stages[index].delay_seconds;
        self.ecs.entity_mut(site).insert(ResourceSite { definition: state.definition, stage: next_stage, next_due });
        if usize::from(next_stage) == definition.stages.len() { self.ecs.entity_mut(site).insert(FiniteResource { kind: definition.output_kind, quantity: definition.output_quantity }); }
        self.refresh_state_weight();
        Ok(())
    }

    fn designate_stockpile(&mut self, zone: String, cells: Vec<StockpileDesignation>) -> Result<String> {
        if !valid_id(&zone) || cells.is_empty() || cells.len() > 256 { return Err("invalid stockpile designation".into()); }
        let environment = self.environment.as_mut().ok_or("stockpile designation requires generated terrain")?;
        let spacing = environment.world.cell_spacing_m();
        let mut seen = BTreeSet::new();
        let mut prepared = Vec::with_capacity(cells.len());
        for cell in cells {
            if !valid_id(&cell.filter_profile) || cell.capacity == 0 || !seen.insert((cell.x, cell.y, cell.z)) { return Err("invalid or duplicate stockpile cell".into()); }
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
                if self.quantity(id) > u64::from(cell.capacity) { return Err("stockpile capacity is below contained lots".into()); }
                if self.ecs.get::<StockpileCell>(entity).is_some_and(|old| old.zone != zone) { return Err("stockpile identity belongs to another zone".into()); }
            }
            let position = Position { x: f64::from(cell.x)*spacing[0], y: (f64::from(cell.y)+0.5)*spacing[1], z: f64::from(cell.z)*spacing[2], facing: 0.0 };
            let policy = StockpileCell { zone: zone.clone(), priority: cell.priority, filter_profile: cell.filter_profile.clone() };
            if let Some(entity) = self.ids.get(id).copied() { self.ecs.entity_mut(entity).insert((position, Container { capacity: cell.capacity }, policy)); }
            else { let entity = self.ecs.spawn((ExternalId(id.clone()), position, Container { capacity: cell.capacity }, policy)).id(); self.ids.insert(id.clone(), entity); self.known.insert(id.clone()); self.contents.entry(id.clone()).or_default(); }
        }
        self.refresh_state_weight();
        Ok(prepared[0].0.clone())
    }

    fn update_stockpile(&mut self, zone: String, filter_profile: String, priority: u32) -> Result<String> {
        if !valid_id(&zone) || !valid_id(&filter_profile) || priority == 0 || priority > 100 { return Err("invalid stockpile policy".into()); }
        let entities: Vec<_> = self.ids.values().copied().filter(|entity| self.ecs.get::<StockpileCell>(*entity).is_some_and(|cell| cell.zone == zone)).collect();
        if entities.is_empty() { return Err("stockpile zone does not exist".into()); }
        for entity in entities {
            let mut policy = self.ecs.get::<StockpileCell>(entity).cloned().ok_or("stockpile zone disappeared")?;
            policy.filter_profile = filter_profile.clone();
            policy.priority = priority;
            self.ecs.entity_mut(entity).insert(policy);
        }
        self.refresh_state_weight();
        Ok(zone)
    }

    fn request_process(&mut self, definition_id: &str, station_id: &str) -> Result<String> {
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
        if !crate::components::valid_id(&process_id) || self.ids.len() >= 16_384 {
            return Err("process identity or state capacity exceeded".into());
        }
        if let Some(existing) = self.ids.get(&process_id).copied() {
            if self.ecs.get::<StagedProcess>(existing).is_some_and(|process| process.phase != ProcessPhase::Complete) {
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
                worker: None,
            });
            self.refresh_state_weight();
            return Ok(process_id);
        }
        let entity = self.ecs.spawn((ExternalId(process_id.clone()), StagedProcess {
            version: crate::staged_process::CURRENT_VERSION,
            definition: definition.id.clone(), definition_version: definition.version,
            station: station_id.into(), stage_index: 0, progress_seconds: 0.0,
            entered_tick: self.revision, phase: ProcessPhase::Waiting, blocked_reason: String::new(),
            worker: None,
        })).id();
        self.ids.insert(process_id.clone(), entity);
        self.known.insert(process_id.clone());
        self.refresh_state_weight();
        Ok(process_id)
    }

    fn admit_process(&mut self, process_id: &str, definition_id: &str, station_id: &str) -> Result<String> {
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
            return Ok(process_id.into());
        }
        let occupied: BTreeSet<String> = self.ids.values().filter_map(|entity| self.ecs.get::<crate::staged_process::ProcessBinding>(*entity).map(|binding| binding.lot.clone())).collect();
        let mut lots = BTreeMap::new();
        for (id, entity) in &self.ids {
            let Some(lot) = self.ecs.get::<Lot>(*entity) else { continue; };
            if !occupied.contains(id) { lots.insert(id.clone(), lot.clone()); }
        }
        let bindings = crate::staged_process::resolve_bindings(&definition, process_id, station_id, &lots)?;
        let added_weight: usize = bindings.iter().map(|binding| crate::staged_process::binding_id(binding).len().saturating_add(128).saturating_add(self.registry.weight("hive.process-binding", &record(binding)))).sum();
        if self.ids.len().saturating_add(bindings.len()) > 16_384 || self.state_weight.saturating_add(added_weight) > STATE_BYTES { return Err("process binding state capacity".into()); }
        for binding in bindings {
            let id = crate::staged_process::binding_id(&binding);
            if self.ids.contains_key(&id) { return Err("process binding identity collision".into()); }
            let entity = self.ecs.spawn((ExternalId(id.clone()), binding)).id();
            self.ids.insert(id.clone(), entity);
            self.known.insert(id);
            self.bound_process_lots.insert(self.ecs.get::<crate::staged_process::ProcessBinding>(entity).unwrap().lot.clone());
        }
        self.refresh_state_weight();
        Ok(process_id.into())
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

    fn attend_process(&mut self, worker_id: &str, process_id: &str, delta: f64) -> Result<()> {
        if !delta.is_finite() || delta < 0.0 { return Err("invalid process attendance delta".into()); }
        let worker = self.entity(worker_id)?;
        let process_entity = self.entity(process_id)?;
        let mut state = self.ecs.get::<StagedProcess>(process_entity).cloned().ok_or("process is missing staged state")?;
        if state.phase == ProcessPhase::Complete { return Err("process is complete".into()); }
        let definition = self.environment.as_ref().ok_or("process attendance needs environment")?.processes.get(&state.definition).ok_or("unknown process definition")?.definition().clone();
        let stage = definition.stages.get(state.stage_index as usize).ok_or("process stage is missing")?;
        if stage.mode != crate::staged_process::StageMode::Attended { return Err("process stage is elapsed".into()); }
        if self.process_bindings(process_id).is_empty() { return Err("process has not been admitted".into()); }
        if let Some(existing) = state.worker.as_deref() && existing != worker_id { return Err("process already has an attending worker".into()); }
        if self.ecs.get::<Body>(worker).is_none() || self.ecs.get::<Container>(worker).is_none() || self.ecs.get::<Traversal>(worker).is_none() || self.ecs.get::<Support>(worker).is_some() || self.direct.contains_key(&worker) || self.ecs.get::<Destination>(worker).is_some() || self.ecs.get::<ExcavationWork>(worker).is_some() { return Err("worker cannot attend process from current state".into()); }
        for (other, entity) in &self.ids { if other != process_id && self.ecs.get::<StagedProcess>(*entity).is_some_and(|candidate| candidate.worker.as_deref() == Some(worker_id)) { return Err("worker already attends process".into()); } }
        self.contact(worker, self.entity(&state.station)?)?;
        state.worker = Some(worker_id.into()); state.phase = ProcessPhase::Working; state.blocked_reason.clear();
        if delta > 0.0 { state.progress_seconds = crate::world::earned_work_seconds(state.progress_seconds, delta, stage.duration_seconds)?; }
        self.finish_process_stage(process_id, state, &definition)
    }

    fn finish_process_stage(&mut self, process_id: &str, mut state: StagedProcess, definition: &crate::staged_process::ProcessDefinition) -> Result<()> {
        let stage = definition.stages.get(state.stage_index as usize).ok_or("process stage is missing")?;
        if state.progress_seconds < stage.duration_seconds { self.ecs.entity_mut(self.entity(process_id)?).insert(state); return Ok(()); }
        let transition = &stage.transition;
        if let Err(reason) = self.execute_process_transition(process_id, transition) {
            state.phase = ProcessPhase::Blocked; state.worker = None; state.blocked_reason = crate::staged_process::transition_block_reason(&reason).into();
            self.ecs.entity_mut(self.entity(process_id)?).insert(state); self.refresh_state_weight(); return Ok(());
        }
        if usize::from(state.stage_index + 1) >= definition.stages.len() { self.remove_process_bindings(process_id)?; state.phase = ProcessPhase::Complete; state.worker = None; } else { state.stage_index += 1; state.progress_seconds = 0.0; state.entered_tick = self.revision; state.phase = ProcessPhase::Waiting; state.worker = None; }
        self.ecs.entity_mut(self.entity(process_id)?).insert(state);
        self.refresh_state_weight();
        Ok(())
    }



    fn advance_staged_processes(&mut self, delta: f64) -> Result<()> {
        if delta == 0.0 { return Ok(()); }
        let ids: Vec<String> = self.ids.iter().filter_map(|(id, entity)| self.ecs.get::<StagedProcess>(*entity).map(|_| id.clone())).collect();
        for id in ids {
            let entity = self.entity(&id)?; let Some(mut state) = self.ecs.get::<StagedProcess>(entity).cloned() else { continue; };
            if state.phase == ProcessPhase::Complete { continue; }
            if state.phase == ProcessPhase::Working {
                let Some(worker_id) = state.worker.clone() else { state.phase = ProcessPhase::Waiting; self.ecs.entity_mut(entity).insert(state); continue; };
                let valid = self.entity(&worker_id).ok().and_then(|worker| self.entity(&state.station).ok().map(|station| self.contact(worker, station).is_ok())).unwrap_or(false);
                if !valid { state.worker = None; state.phase = ProcessPhase::Waiting; self.ecs.entity_mut(entity).insert(state); }
                continue;
            }
            let definition = self.environment.as_ref().ok_or("process advance needs environment")?.processes.get(&state.definition).ok_or("unknown process definition")?.definition().clone();
            let stage = definition.stages.get(state.stage_index as usize).ok_or("process stage is missing")?;
            if stage.mode != crate::staged_process::StageMode::Elapsed || state.entered_tick >= self.revision { continue; }
            state.progress_seconds = crate::world::earned_work_seconds(state.progress_seconds, delta, stage.duration_seconds)?;
            self.finish_process_stage(&id, state, &definition)?;
        }
        self.refresh_state_weight(); Ok(())
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
    fn begin_work_attempt(&mut self, task: String, worker: String, party: String, activity: crate::work_attempt::ActivityRef) -> Result<AttemptKey> {
        if !valid_id(&task) || !valid_id(&worker) || !valid_id(&party) || !self.ids.contains_key(&task) || !self.ids.contains_key(&worker) || !self.ids.contains_key(&party) { return Err("work attempt references unknown entity".into()); }
        if self.work_attempts.contains_key(&task) || self.attempts_by_worker.contains_key(&worker) { return Err("work attempt is already owned".into()); }
        let party_entity = self.entity(&party)?;
        self.ecs.get::<Party>(party_entity).ok_or("work attempt party is not a party")?;
        let worker_entity = self.entity(&worker)?;
        if self.ecs.get::<PartyMember>(worker_entity).map(|member| member.party.as_str()) != Some(party.as_str()) { return Err("work attempt worker is outside party".into()); }
        let task_entity = self.entity(&task)?;
        if self.ecs.get::<OwnedByParty>(task_entity).map(|owner| owner.party.as_str()) != Some(party.as_str()) { return Err("work attempt task is outside party".into()); }
        let generation = self.next_work_generation;
        self.next_work_generation = self.next_work_generation.checked_add(1).ok_or("work attempt generation exhausted")?;
        let key = AttemptKey { task: task.clone(), generation };
        let operation = OperationKey { attempt: key.clone(), sequence: 1 };
        let crate::work_attempt::ActivityRef::Route { destination } = &activity else { return Err("unsupported initial work activity".into()); };
        let actor = worker_entity;
        let position = *self.ecs.get::<Position>(actor).ok_or("route attempt worker has no position")?;
        self.ecs.get::<Body>(actor).ok_or("route attempt worker is not movable")?;
        let route = self.route_for(actor, position, destination)?;
        self.direct.remove(&actor);
        self.ecs.entity_mut(actor).insert(Destination { x: destination.x, y: destination.y, z: destination.z, facing: position.facing, frame: destination.frame.clone() });
        self.install_route(actor, route);
        let entity = task_entity;
        self.ecs.entity_mut(entity).insert(WorkAttempt { key: key.clone(), worker: worker.clone(), party, phase: AttemptPhase::Executing { operation, activity } });
        self.work_attempts.insert(task, entity);
        self.attempts_by_worker.insert(worker.clone(), key.clone());
        Ok(key)
    }
    fn attempt_mut(&mut self, task: &str, generation: u64, sequence: u32) -> Result<&mut WorkAttempt> {
        let entity = *self.work_attempts.get(task).ok_or("work attempt is not current")?;
        let attempt = self.ecs.get_mut::<WorkAttempt>(entity).ok_or("work attempt component is missing")?;
        if attempt.key.generation != generation { return Err("stale work attempt key".into()); }
        let operation = attempt.current_operation().ok_or("work attempt has no operation")?;
        if operation.sequence != sequence { return Err("unexpected work attempt sequence".into()); }
        Ok(attempt.into_inner())
    }
    fn interrupt_work_attempt(&mut self, task: String, generation: u64, sequence: u32, cause: InterruptCause) -> Result<()> {
        let worker = self.attempt_mut(&task, generation, sequence)?.worker.clone();
        let entity = self.entity(&worker)?;
        if let Some(destination) = self.ecs.get::<Destination>(entity).cloned() {
            if let Some(attempt_entity) = self.work_attempts.get(&task).copied() {
                if let Some(WorkAttempt { phase: AttemptPhase::Executing { activity: crate::work_attempt::ActivityRef::Route { destination: expected }, .. }, .. }) = self.ecs.get::<WorkAttempt>(attempt_entity) {
                    if destination.x == expected.x && destination.y == expected.y && destination.z == expected.z && destination.frame == expected.frame { self.clear_destination(entity); }
                }
            }
        }
        let attempt = self.attempt_mut(&task, generation, sequence)?;
        if !matches!(&attempt.phase, AttemptPhase::Executing { .. }) { return Err("work attempt operation is already settled".into()); }
        let operation = OperationKey { attempt: attempt.key.clone(), sequence };
        let activity = match &self.ecs.get::<WorkAttempt>(self.entity(&task)?).ok_or("work attempt component is missing")?.phase {
            AttemptPhase::Executing { activity, .. } => activity.clone(),
            _ => return Err("work attempt operation is already settled".into()),
        };
        self.settle_attempt(&task, AttemptPhase::Outcome { operation, activity, result: WorkOutcome::Interrupted { cause } })
    }
    fn acknowledge_work_attempt(&mut self, task: String, generation: u64, sequence: u32) -> Result<()> {
        {
            let attempt = self.attempt_mut(&task, generation, sequence)?;
            if !matches!(&attempt.phase, AttemptPhase::Outcome { .. }) { return Err("work attempt has no terminal outcome".into()); }
        }
        let entity = self.work_attempts.remove(&task).ok_or("work attempt is not current")?;
        let worker = self.ecs.get::<WorkAttempt>(entity).map(|attempt| attempt.worker.clone());
        self.ecs.entity_mut(entity).remove::<WorkAttempt>();
        if let Some(worker) = worker { self.attempts_by_worker.remove(&worker); }
        Ok(())
    }
    fn continue_work_attempt(&mut self, task: String, generation: u64, sequence: u32, next_activity: crate::work_attempt::ActivityRef) -> Result<()> {
        let entity = *self.work_attempts.get(&task).ok_or("work attempt is not current")?;
        let current = self.ecs.get::<WorkAttempt>(entity).cloned().ok_or("work attempt component is missing")?;
        if current.key.generation != generation || !matches!(current.phase, AttemptPhase::Outcome { operation: ref op, result: WorkOutcome::Completed, .. } if op.sequence == sequence) { return Err("work attempt completed outcome is stale".into()); }
        let crate::work_attempt::ActivityRef::Construction { site, contact, mode } = next_activity else { return Err("work attempt continuation is not construction".into()); };
        if site != task { return Err("construction continuation task mismatch".into()); }
        let site_entity = self.entity(&site)?;
        let owner = self.ecs.get::<OwnedByParty>(site_entity).ok_or("construction site has no party owner")?;
        if owner.party != current.party { return Err("construction continuation party mismatch".into()); }
        let operation = OperationKey { attempt: current.key.clone(), sequence: sequence.checked_add(1).ok_or("work attempt sequence exhausted")? };
        match mode {
            crate::work_attempt::ConstructionMode::Bind => {
                self.bind_construction_stage(&site, contact.clone())?;
                self.settle_attempt(&task, AttemptPhase::Outcome { operation, activity: crate::work_attempt::ActivityRef::Construction { site, contact, mode }, result: WorkOutcome::Completed })?;
            }
            crate::work_attempt::ConstructionMode::Work => {
                if self.ecs.get::<Position>(site_entity).is_none() { return Err("construction continuation requires bound stage".into()); }
                let mut state = self.ecs.get::<ConstructionSite>(site_entity).cloned().ok_or("construction site is missing")?;
                state.phase = ConstructionPhase::Working;
                self.ecs.entity_mut(site_entity).insert(state);
                self.ecs.get_mut::<WorkAttempt>(entity).ok_or("work attempt component is missing")?.phase = AttemptPhase::Executing { operation, activity: crate::work_attempt::ActivityRef::Construction { site, contact, mode } };
            }
        }
        Ok(())
    }
    fn establish_party(&mut self, binding_id: String, player: String, party: String, records: Vec<EntityRecord>) -> Result<String> {
        if !valid_id(&binding_id) || !valid_id(&player) || !valid_id(&party) || records.is_empty() || records.len() > 32 { return Err("invalid prepared party plan".into()); }
        let digest = format!("{:x}", Sha256::digest(serde_json::to_vec(&records).map_err(|_| "invalid party plan encoding")?));
        if let Some(existing) = self.ids.get(&party).copied() { if let Some(receipt) = self.ecs.get::<PartyReceipt>(existing) { if receipt.binding_id == binding_id && receipt.player == player && receipt.party == party && receipt.digest == digest { return Ok(party); } } return Err("party binding replay mismatch".into()); }
        let mut ids = BTreeSet::new();
        for record in &records { if !valid_id(&record.id) || !ids.insert(record.id.clone()) || self.ids.contains_key(&record.id) { return Err("party plan identity conflict".into()); } }
        if !ids.contains(&party) { return Err("party plan lacks party entity".into()); }
        let mut known = self.known.clone(); known.extend(ids.iter().cloned());
        for record in &records { for (name, value) in &record.components { self.registry.validate(name, value, &known)?; } }
        let party_record = records.iter().find(|record| record.id == party).ok_or("party plan lacks party entity")?;
        if party_record.components.get("hive.party").and_then(|v| v.get("ownerPlayer")).and_then(|v| v.as_str()) != Some(player.as_str()) { return Err("party owner mismatch".into()); }
        let mut positions = Vec::new();
        for record in &records {
            if let Some(owner) = record.components.get("hive.party-member").and_then(|v| v.get("party")).and_then(|v| v.as_str()).or_else(|| record.components.get("hive.owned-by-party").and_then(|v| v.get("party")).and_then(|v| v.as_str())) { if owner != party { return Err("party ownership mismatch".into()); } }
            if let Some(p) = record.components.get("hive.position") { let x=p.get("x").and_then(|v|v.as_f64()).ok_or("invalid party position")?; let z=p.get("z").and_then(|v|v.as_f64()).ok_or("invalid party position")?; if positions.iter().any(|(a,b):&(f64,f64)| (a-x).abs()<0.75 && (b-z).abs()<0.75) { return Err("party plan positions collide".into()); } for existing in self.ecs.query::<&Position>().iter(&self.ecs) { if (existing.x-x).abs()<0.75 && (existing.z-z).abs()<0.75 { return Err("party position occupied".into()); } } positions.push((x,z)); }
        }
        let mut handles = Vec::new();
        for record in records { let id = record.id; let entity = self.ecs.spawn(ExternalId(id.clone())).id(); for (name, value) in record.components { self.registry.insert(&mut self.ecs, entity, &name, &value)?; } handles.push((id, entity)); }
        let party_entity = handles.iter().find(|(id, _)| id == &party).map(|(_, entity)| *entity).ok_or("party entity missing")?;
        self.ecs.entity_mut(party_entity).insert(PartyReceipt { binding_id, player, party: party.clone(), digest });
        for (id, entity) in handles { self.ids.insert(id.clone(), entity); self.known.insert(id); }
        self.refresh_state_weight(); Ok(party)
    }

    fn apply_action(&mut self, action: Action, delta: f64) -> Result<ActionEffect> {
        match action {
            Action::EstablishParty { binding_id, player, party, records } => self.establish_party(binding_id, player, party, records).map(ActionEffect::Entity),
            Action::BeginWorkAttempt { task, worker, party, operation } => self.begin_work_attempt(task, worker, party, operation).map(ActionEffect::Attempt),
            Action::InterruptWorkAttempt { task, generation, sequence, cause } => self.interrupt_work_attempt(task, generation, sequence, cause).map(|_| ActionEffect::None),
            Action::AcknowledgeWorkAttempt { task, generation, sequence } => self.acknowledge_work_attempt(task, generation, sequence).map(|_| ActionEffect::None),
            Action::ContinueWorkAttempt { task, generation, sequence, next_activity } => self.continue_work_attempt(task, generation, sequence, next_activity).map(|_| ActionEffect::None),
            Action::ExchangeFieldWater { operation: _, worker, vessel, x, y, z, direction, portions } => {
                self.exchange_field_water(&worker, &vessel, crate::generation::Cell { x: i64::from(x), y, z: i64::from(z) }, direction, portions)?;
                Ok(ActionEffect::None)
            }
            Action::DesignateStockpile { zone, cells } => self.designate_stockpile(zone, cells).map(ActionEffect::Entity),
            Action::UpdateStockpile { zone, filter_profile, priority } => self.update_stockpile(zone, filter_profile, priority).map(ActionEffect::Entity),
            Action::RequestProcess { definition, station } => self.request_process(&definition, &station).map(ActionEffect::Entity),
            Action::AdmitProcess { process, definition, station } => self.admit_process(&process, &definition, &station).map(ActionEffect::Entity),
            Action::AttendProcess { worker, process } => { self.attend_process(&worker, &process, delta)?; Ok(ActionEffect::None) },
            Action::Excavate { entity, x, y, z, expected, replacement } => {
                self.request_excavation(&entity, ExcavationWork { x, y, z, expected, replacement, seconds: 0.0 })?;
                Ok(ActionEffect::None)
            }
            Action::CancelWork { entity } => {
                let actor = self.entity(&entity)?;
                if self.ecs.get::<ExcavationWork>(actor).is_some() {
                    self.ecs.entity_mut(actor).remove::<ExcavationWork>();
                } else {
                    if let Some(key) = self.attempts_by_worker.get(&entity).cloned() {
                        let sequence = self.work_attempts.get(&key.task).and_then(|attempt| self.ecs.get::<WorkAttempt>(*attempt)).and_then(|attempt| attempt.current_operation()).map(|operation| operation.sequence).ok_or("worker attempt has no active operation")?;
                        self.interrupt_work_attempt(key.task, key.generation, sequence, InterruptCause::Cancelled)?;
                    }
                }
                self.refresh_state_weight();
                Ok(ActionEffect::None)
            }
            Action::PlanConstruction { catalog, site, party, x, y, z, orientation } => {
                self.plan_construction(catalog, site, party, x, y, z, orientation)?;
                Ok(ActionEffect::None)
            }
            Action::ReplaceFloor { order_id, existing_floor_id, desired_catalog } => {
                self.replace_floor(order_id, existing_floor_id, desired_catalog)?;
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
            Action::AttendConstruction { worker, site, contact } => {
                self.attend_construction(&worker, &site, contact)?;
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
                let path = self.route_for(e, p, &destination)?;
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
                if self.process_bindings_for_lot(&lot) { return Err("process-bound lot cannot be consumed".into()); }
                let mut stock = self
                    .ecs
                    .get::<Lot>(e)
                    .cloned()
                    .ok_or("not a material lot")?;
                if quantity == 0 || stock.quantity < quantity || stock.container != entity {
                    return Err("consumption requires held stock".into());
                }
                if self.ecs.get::<LotWater>(e).is_some_and(|water| water.water_kg > 0.0) {
                    return Err("wet lot consumption is not admitted".into());
                }
                stock.quantity -= quantity;
                self.ecs.entity_mut(e).insert(stock);
                Ok(ActionEffect::None)
            }
            Action::ExtractResource { operation: _, worker, source } => self.extract_resource(&worker, &source).map(ActionEffect::Entity),
            Action::EstablishResourceSite { operation, worker, site, definition, x, y, z } => self.establish_resource_site(&operation, &worker, &site, &definition, x, y, z).map(ActionEffect::Entity),
            Action::TendResourceSite { operation, worker, site, vessel } => self.tend_resource_site(&operation, &worker, &site, &vessel).map(|()| ActionEffect::None),
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
    fn clear_destination(&mut self, entity: Entity) {
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
            self.terrain_routes.get_mut(&entity).unwrap().suspended = true;
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
        if let Some(mut local)=self.ecs.get_mut::<Position>(launcher_entity) {
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
        if let Some(support) = support { self.ecs.entity_mut(ground).insert(support); }
        self.ids.insert(id.clone(), ground);
        self.known.insert(id.clone());
        self.contents.entry(actor_id.into()).or_default().remove(&lot_entity);
        self.contents.entry(id).or_default().insert(lot_entity);
        self.ecs.entity_mut(lot_entity).insert(lot);
        self.ground_stock_cleanup_pending = true;
        self.next_lot = next_lot;
        self.state_weight = weight;
        Ok(())
    }
    fn transfer(&mut self, lot: &str, from: &str, to: &str, quantity: u32) -> Result<()> {
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
        if self.quantity(to) + u64::from(quantity) > u64::from(capacity) {
            return Err("destination is full".into());
        }
        self.contact(source, dest)?;
        let current_water = self.ecs.get::<LotWater>(e).map(|water| water.water_kg);
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
        // Split identity is selected before mutation. The moved lot retains its
        // ID so the actor's delivery plan continues to refer to the same object.
        if stock.quantity > quantity {
            if self.ids.len() >= 16384 {
                return Err("region entity capacity".into());
            }
            let (id, next) = material_output::allocate_lot_id(self.next_lot, |candidate| self.known.contains(candidate))?;
            let extra_lot = Lot {
                kind: stock.kind.clone(),
                quantity: stock.quantity - quantity,
                container: from.into(),
            };
            let extra_water = remainder_water.map(|water| LotWater { water_kg: water });
            let extra = id.len() + 128 + self.registry.weight("hive.lot", &record(&extra_lot))
                + extra_water.as_ref().map(|water| self.registry.weight("hive.lot-water", &record(water))).unwrap_or(0);
            if self.state_weight + extra > STATE_BYTES {
                return Err("region canonical state capacity".into());
            }
            let remainder = if let Some(water) = extra_water {
                self.ecs.spawn((ExternalId(id.clone()), extra_lot, water)).id()
            } else {
                self.ecs.spawn((ExternalId(id.clone()), extra_lot)).id()
            };
            self.next_lot = next;
            self.state_weight += extra;
            self.ids.insert(id.clone(), remainder);
            self.known.insert(id);
            self.contents
                .entry(from.into())
                .or_default()
                .insert(remainder);
        }
        stock.quantity = quantity;
        stock.container = to.into();
        self.ecs.entity_mut(e).insert(stock);
        if let Some(moved) = moved_water {
            self.ecs.entity_mut(e).insert(LotWater { water_kg: moved });
        }
        self.contents.entry(from.into()).or_default().remove(&e);
        self.contents.entry(to.into()).or_default().insert(e);
        if source_is_ground_stock { self.ground_stock_cleanup_pending = true; }
        Ok(())
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
        if points.len() > 4096 || crate::terrain_route::path_waypoint_count(&state.path, &stairs)? > 4096 { return Err("saved terrain waypoint budget exceeded".into()); }
        let offset = points.len().checked_sub(route.len()).filter(|index| *index > 0 && *index < points.len())
            .ok_or("invalid terrain route progress")?;
        if !route.iter().eq(points[offset..].iter()) || state.origin != points[offset - 1]
            || state.target.as_ref() != route.front() {
            return Err("terrain route geometry witness mismatch".into());
        }
        let destination = self.ecs.get::<Destination>(entity);
        if state.suspended {
            if destination.is_some() { return Err("suspended contact has a destination".into()); }
        } else {
            let destination = destination.ok_or("missing terrain destination")?;
            let last = points.last().ok_or("empty terrain witness")?;
            if last.x != destination.x || last.y != destination.y || last.z != destination.z || last.frame != destination.frame {
                return Err("terrain route destination mismatch".into());
            }
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
        let candidates: Vec<_> = self.terrain_routes.iter().filter_map(|(entity, state)| (!state.waiting).then_some(*entity)).collect();
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
            if self.terrain_routes.get(&entity).and_then(|state| state.revision) == Some(current_revision) { continue; }
            let path = self.terrain_routes.get(&entity).map(|state| state.path.clone()).ok_or("terrain route witness missing")?;
            let environment = self.environment.as_mut().ok_or("terrain route needs environment")?;
            let config = crate::terrain_traversal::TraversalConfig {
                spacing,
                clearance_cells: capability.clearance_cells,
                max_step_cells: capability.max_step_cells,
            };
            let stairs = environment.world.stair_edges().to_vec();
            let expected_points = crate::terrain_route::waypoints_with_stairs(&path, config, &stairs)?;
            let remaining: Vec<_> = self.routes.get(&entity).map(|route| route.iter().cloned().collect()).unwrap_or_default();
            let offset = expected_points.len().checked_sub(remaining.len());
            let correspondence = offset.filter(|offset| *offset > 0).is_some_and(|offset| {
                remaining == expected_points[offset..]
                    && self.terrain_routes[&entity].origin == expected_points[offset - 1]
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
            let active = crate::terrain_route::active_support_index_with_stairs(&path, offset.ok_or("missing route progress")?, &stairs)?;
            let valid = crate::terrain_traversal::path_supported_with_stairs(&path[active..], config, &mut query, &stairs)?;
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
    /// replacement. A failed,
    /// bounded search releases the destination and leaves a suspended contact
    /// witness when the actor is between support centers.
    fn recover_invalidated_terrain_routes(&mut self) -> Result<()> {
        let candidates: Vec<_> = self.terrain_routes.iter()
            .filter_map(|(entity, state)| (state.waiting && state.revision.is_none() && !state.suspended).then_some(*entity))
            .collect();
        for entity in candidates {
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
            match self.route_for(entity, position, &target) {
                Ok(prepared) => self.install_route(entity, prepared),
                Err(_) => {
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
        self.invalidate_terrain_routes()?;
        self.recover_invalidated_terrain_routes()?;
        self.routes.retain(|entity, path| {
            if self.terrain_routes.get(entity).is_some_and(|state| state.suspended) { return true; }
            let speed = self.ecs.get::<Body>(*entity).expect("route body").speed;
            let target = self
                .ecs
                .get::<Destination>(*entity)
                .expect("route destination")
                .clone();
            if self.terrain_routes.get(entity).is_some_and(|state| state.waiting) {
                return true;
            }
            let mut p = *self.ecs.get::<Position>(*entity).expect("route position");
            if self.terrain_routes.contains_key(entity) {
                let blocked = self.blocked_by_frame.get(&None).expect("terrain obstacle index");
                if terrain_motion_blocked(p, path, speed * delta, blocked) {
                    self.terrain_routes.get_mut(entity).expect("terrain route").waiting = true;
                    return true;
                }
            }
            let last_reached = navigation::advance(&mut p, path, speed * delta);
            if let Some(state) = self.terrain_routes.get_mut(entity) {
                if let Some(point) = last_reached { state.origin = point; }
                state.target = path.front().cloned();
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
            let mut next = position;
            for input in state.queue.iter().take(steps) {
                next = navigation::direct_step(next, input.x, input.z, body.speed, &blocked, bounds)?;
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
            "format":"hive-game", "version":1, "game":"membership",
            "components":[], "initial":[{"id":"actor","components":{}}]
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
            "format":"hive-game", "version":1, "game":"lot-water",
            "components":[], "initial":[
                {"id":"source","components":{"hive.position":{"x":0.0,"y":0.0,"z":0.0,"facing":0.0},"hive.container":{"capacity":10}}},
                {"id":"dest","components":{"hive.position":{"x":1.0,"y":0.0,"z":0.0,"facing":0.0},"hive.container":{"capacity":dest_capacity}}},
                {"id":"lot","components":lot}
            ]
        })).unwrap()
    }
    fn transfer(kernel: &mut Kernel, quantity: u32) -> Value {
        serde_json::from_str(&kernel.advance_json(&json!({
            "delta":0.0,"writes":[],"actions":[{"kind":"transfer","lot":"lot","from":"source","to":"dest","quantity":quantity}]
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
            "format":"hive-game", "version":1, "game":"portable-contact",
            "components":[], "initial":[
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
            "delta":0.0,"writes":[],"actions":[{"kind":"transfer","lot":"water","from":"vessel","to":"dest","quantity":2}]
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
        let rejected: Value = serde_json::from_str(&full.advance_json(r#"{"delta":0,"writes":[],"actions":[{"kind":"transfer","lot":"lot.1","from":"source","to":"dest","quantity":1}]}"#).unwrap()).unwrap();
        assert_eq!(rejected["results"][0]["accepted"], false);
        assert_eq!(rows(&mut full, "hive.lot"), before_full_lot);
        assert_eq!(rows(&mut full, "hive.lot-water"), before_full_water);
        let mut wet = Kernel::new(); wet.load(&scene(Some(json!({"waterKg":8.0})), 10)).unwrap();
        let before_wet_lot = rows(&mut wet, "hive.lot");
        let before_wet_water = rows(&mut wet, "hive.lot-water");
        wet.advance_json(r#"{"delta":0,"writes":[],"actions":[{"kind":"consume","entity":"source","lot":"lot","quantity":1}]}"#).unwrap();
        assert_eq!(rows(&mut wet, "hive.lot"), before_wet_lot);
        assert_eq!(rows(&mut wet, "hive.lot-water"), before_wet_water);
        let mut tiny = Kernel::new(); tiny.load(&scene(Some(json!({"waterKg":5e-324})), 10)).unwrap();
        let tiny_before = rows(&mut tiny, "hive.lot-water");
        assert_eq!(transfer(&mut tiny, 1)["results"][0]["accepted"], false);
        assert_eq!(rows(&mut tiny, "hive.lot-water"), tiny_before);
        let mut dry = Kernel::new(); dry.load(&scene(None, 10)).unwrap();
        let dry_result: Value = serde_json::from_str(&dry.advance_json(r#"{"delta":0,"writes":[],"actions":[{"kind":"consume","entity":"source","lot":"lot","quantity":1}]}"#).unwrap()).unwrap();
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
            r#"{"delta":0,"writes":[],"actions":[{"kind":"consume","entity":"source","lot":"lot","quantity":1}]}"#,
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
            "format":"hive-game", "version":1, "game":"sealed",
            "components":[], "initial":[
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
            "version": 1,
            "game": "formation-combat",
            "components": [],
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
                r#"{"delta":0.5,"writes":[],"actions":[{"kind":"launch","launcher":"cannon","ammunition":"ammo","velocity":{"x":10.0,"y":0.0,"z":0.0}}]}"#,
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
                r#"{"delta":0.0,"writes":[],"actions":[{"kind":"launch","launcher":"cannon","ammunition":"ammo","velocity":{"x":100.0,"y":0.0,"z":0.0}}]}"#,
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
            r#"{"delta":0.0,"writes":[],"actions":[{"kind":"launch","launcher":"cannon","ammunition":"ammo","velocity":{"x":10.0,"y":0.0,"z":0.0}}]}"#,
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
                r#"{"delta":0.0,"writes":[],"actions":[{"kind":"displace","entity":"cannon","delta":{"x":1.5,"y":0.0,"z":0.0}}]}"#,
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
                r#"{"delta":0.05,"writes":[],"actions":[{"kind":"launch","launcher":"cannon","ammunition":"ammo","velocity":{"x":10.0,"y":0.0,"z":0.0}}]}"#,
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
            r#"{"delta":0.5,"writes":[],"actions":[{"kind":"launch","launcher":"cannon","ammunition":"ammo","velocity":{"x":10.0,"y":0.0,"z":0.0}}]}"#,
        );
        assert!(result.is_err());
        assert_eq!(kernel.snapshot_json().expect("rollback snapshot"), before);
    }

    #[test]
    fn distant_rotating_cuboid_does_not_block_shot() {
        let mut kernel = Kernel::new();
        kernel.load(&rotating_cuboid_scene(100.0)).expect("load distant fixture");
        let response = kernel
            .advance_json(
                r#"{"delta":0.5,"writes":[],"actions":[{"kind":"launch","launcher":"cannon","ammunition":"ammo","velocity":{"x":10.0,"y":0.0,"z":0.0}}]}"#,
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
                r#"{"delta":0.0,"writes":[],"actions":[{"kind":"launch","launcher":"cannon","ammunition":"ammo","velocity":{"x":10.0,"y":0.0,"z":0.0}}]}"#,
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
                r#"{"delta":0.05,"writes":[],"actions":[{"kind":"launch","launcher":"cannon","ammunition":"ammo","velocity":{"x":10.0,"y":0.0,"z":0.0}}]}"#,
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
            "format":"hive-game", "version":1, "game":"route-recovery",
            "components":[], "initial":[{"id":"mover","components":{
                "hive.position":{"x":0.4,"y":0.0,"z":0.4,"facing":0.0},
                "hive.body":{"speed":2.0}
            }}]
        })).expect("route fixture");
        let mut kernel = Kernel::new();
        kernel.load(&scene).expect("load route fixture");
        let move_action = r#"{"delta":0.1,"writes":[],"actions":[{"kind":"move","entity":"mover","destination":{"x":3.2,"y":0.0,"z":0.4,"frame":null}}]}"#;
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
            "format":"hive-game", "version":1, "game":"survival",
            "components":[], "initial":[{"id":"survivor","components":{
                "hive.position":{"x":0.0,"y":0.0,"z":0.0,"facing":0.0},
                "hive.body":{"speed":2.0}
            }}]
        })).unwrap()
    }
    fn batch(delta: f64, actions: serde_json::Value) -> String {
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
        kernel.load(&json!({"format":"hive-game","version":1,"game":"finite","components":[],"initial":[
            {"id":"worker","components":{"hive.position":{"x":0.0,"y":0.0,"z":0.0,"facing":0.0},"hive.body":{"speed":1.0}}},
            {"id":"tree","components":{"hive.position":{"x":1.0,"y":0.0,"z":0.0,"facing":0.0},"hive.container":{"capacity":8},"hive.finite-resource":{"kind":"wood","quantity":4}}}
        ]}).to_string()).unwrap();
        kernel
    }

    #[test]
    fn extraction_conserves_kind_quantity_and_recovers_after_restore() {
        let mut kernel = kernel();
        let result: serde_json::Value = serde_json::from_str(&kernel.advance_json(&json!({"delta":0.0,"writes":[],"actions":[{"kind":"extract-resource","operation":"tree:extract:1","worker":"worker","source":"tree"}]}).to_string()).unwrap()).unwrap();
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
        let retry: serde_json::Value = serde_json::from_str(&restored.advance_json(&json!({"delta":0.0,"writes":[],"actions":[{"kind":"extract-resource","operation":"tree:extract:2","worker":"worker","source":"tree"}]}).to_string()).unwrap()).unwrap();
        assert_eq!(retry["results"][0]["accepted"], false);
        assert!(restored.entity(&lot).is_ok());
    }

    #[test]
    fn establish_resource_site_reuses_existing_intent_entity() {
        let mut kernel = Kernel::new();
        kernel.load(&json!({"format":"hive-game","version":1,"game":"finite","components":[{"id":"colony.resource-order","version":1,"fields":{"definition":"string","cellX":"number","cellY":"number","cellZ":"number","site":"entity","actor":"nullable-entity","vessel":"nullable-entity","phase":"string","workSeconds":"number","reason":"string","approachX":"number","approachY":"number","approachZ":"number","attempt":"number","operation":"string"}}],"initial":[{"id":"worker","components":{"hive.position":{"x":1.0,"y":0.0,"z":0.0,"facing":0.0},"hive.body":{"speed":1.0}}},{"id":"site","components":{"colony.resource-order":{"definition":"mugwort","cellX":0,"cellY":0,"cellZ":0,"site":"site","actor":null,"vessel":null,"phase":"submitting-sow","workSeconds":1,"reason":"","approachX":1,"approachY":0,"approachZ":0,"attempt":1,"operation":"site:sow:1"}}}]}).to_string()).unwrap();
        let mut environment_definition: serde_json::Value = serde_json::from_str(&crate::environment_definition::tests::fixture("resource")).unwrap();
        environment_definition["resourceSites"] = json!([{
            "id":"mugwort", "outputKind":"mugwort", "outputQuantity":1,
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
        let result: serde_json::Value = serde_json::from_str(&kernel.advance_json(&json!({"delta":0.0,"writes":[],"actions":[{"kind":"establish-resource-site","operation":"site:sow:1","worker":"worker","site":"site","definition":"mugwort","x":surface.x,"y":surface.y,"z":surface.z}]}).to_string()).unwrap()).unwrap();
        assert_eq!(result["results"][0]["accepted"], true, "{result}");
        let saved = kernel.save_records().unwrap();
        let mut restored = Kernel::new();
        restored.restore_records(&saved).unwrap();
        assert_eq!(restored.save_records().unwrap().entities, saved.entities);
        assert_eq!(restored.query_json("[\"hive.resource-site\"]").unwrap(), kernel.query_json("[\"hive.resource-site\"]").unwrap());
    }

    fn action(kernel: &mut Kernel) -> serde_json::Value {
        serde_json::from_str(&kernel.advance_json(&json!({"delta":0.0,"writes":[],"actions":[{"kind":"extract-resource","operation":"tree:extract:capacity","worker":"worker","source":"tree"}]}).to_string()).unwrap()).unwrap()
    }

    #[test]
    fn invalid_output_position_leaves_source_output_and_identity_unchanged() {
        let mut kernel = kernel();
        let tree = kernel.entity("tree").unwrap();
        kernel.ecs.get_mut::<super::Position>(tree).unwrap().x = f64::NAN;
        let before_lots = kernel.query_json("[\"hive.lot\"]").unwrap();
        let before_resource = kernel.query_json("[\"hive.finite-resource\"]").unwrap();
        assert_eq!(action(&mut kernel)["results"][0]["accepted"], false);
        assert_eq!(kernel.query_json("[\"hive.lot\"]").unwrap(), before_lots);
        assert_eq!(kernel.query_json("[\"hive.finite-resource\"]").unwrap(), before_resource);
        let snapshot: serde_json::Value = serde_json::from_str(&kernel.snapshot_json().unwrap()).unwrap();
        assert_eq!(snapshot["next_lot"], 1);
        kernel.ecs.get_mut::<super::Position>(tree).unwrap().x = 1.0;
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
