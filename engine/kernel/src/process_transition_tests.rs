use super::*;
use crate::emission_definition::EmissionDefinition;
use crate::staged_process::{
    InputDisposition, InputPolicy, OutputDestination, ProcessDefinition, ProcessEmission,
    ProcessInput, ProcessOutput, ProcessPhase, ProcessStage, ProcessTransition, StageMode,
    StagedProcess,
};
use crate::terrain_atmosphere::{ExteriorPolicy, TerrainAtmosphereConfig};
use serde_json::json;

fn herbal_definition() -> ProcessDefinition {
    let input =
        |role: &str, port: &str, material: &str, quantity, policy, disposition| ProcessInput {
            role: role.into(),
            port: port.into(),
            material: material.into(),
            quantity,
            policy,
            disposition,
        };
    ProcessDefinition {
        id: "herbal-ale-v1".into(),
        version: 1,
        station_catalog: "brew-station".into(),
        inputs: vec![
            input(
                "malt",
                "kettle",
                "malt",
                2,
                InputPolicy::Portion,
                InputDisposition::Consume,
            ),
            input(
                "water",
                "kettle",
                "water",
                2,
                InputPolicy::Portion,
                InputDisposition::Consume,
            ),
            input(
                "mugwort",
                "kettle",
                "mugwort",
                1,
                InputPolicy::WholeLot,
                InputDisposition::Consume,
            ),
            input(
                "wood",
                "hearth",
                "wood",
                1,
                InputPolicy::Portion,
                InputDisposition::EmissionSource,
            ),
            input(
                "barm",
                "barm",
                "barm",
                1,
                InputPolicy::WholeLot,
                InputDisposition::Retain,
            ),
            input(
                "keg",
                "keg",
                "keg",
                1,
                InputPolicy::WholeLot,
                InputDisposition::Retain,
            ),
        ],
        stages: vec![
            ProcessStage {
                id: "prepare".into(),
                mode: StageMode::Attended,
                duration_seconds: 1.0,
                transition: ProcessTransition {
                    consume_roles: vec!["malt".into(), "water".into(), "mugwort".into()],
                    emission: Some(ProcessEmission {
                        role: "wood".into(),
                        catalog: "wood-hearth".into(),
                    }),
                    outputs: vec![],
                },
            },
            ProcessStage {
                id: "ferment".into(),
                mode: StageMode::Elapsed,
                duration_seconds: 2.0,
                transition: ProcessTransition::default(),
            },
            ProcessStage {
                id: "keg".into(),
                mode: StageMode::Attended,
                duration_seconds: 1.0,
                transition: ProcessTransition {
                    consume_roles: vec![],
                    emission: None,
                    outputs: vec![
                        ProcessOutput {
                            role: "ale".into(),
                            material: "ale".into(),
                            quantity: 4,
                            destination: OutputDestination::RetainedContainer {
                                role: "keg".into(),
                            },
                        },
                        ProcessOutput {
                            role: "spent-grain".into(),
                            material: "spent-grain".into(),
                            quantity: 1,
                            destination: OutputDestination::StationPort {
                                port: "tray".into(),
                            },
                        },
                    ],
                },
            },
        ],
    }
}

fn fixture(blocked_air: bool) -> Kernel {
    let mut kernel = Kernel::new();
    kernel.load(r#"{"format":"hive-game","version":1,"game":"process-transition-laws","components":[],"initial":[]}"#).unwrap();
    let emission = EmissionDefinition {
        id: "wood-hearth".into(),
        material_kind: "wood".into(),
        quantity: 1,
        duration_s: 3.0,
        smoke_kg: 0.03,
        heat_j: 30_000.0,
    };
    let config = TerrainAtmosphereConfig {
        region_id: "brew-air".into(),
        min: crate::generation::Cell {
            x: -2,
            y: -2,
            z: -2,
        },
        max: crate::generation::Cell { x: 2, y: 40, z: 2 },
        exterior: if blocked_air {
            ExteriorPolicy::Closed
        } else {
            ExteriorPolicy::WorldTop
        },
        ambient_temperature_c: 20.0,
        spread_per_second: 1.0,
        rise_bias: 0.0,
        wind: [0.0; 3],
        outdoor_loss_per_second: 0.0,
        heat_capacity_j_per_m3_k: 1200.0,
    };
    let mut definition: serde_json::Value = serde_json::from_str(
        &crate::environment_definition::tests::fixture("process-transition-laws"),
    ).unwrap();
    definition["atmosphere"] = serde_json::to_value(&config).unwrap();
    definition["emissions"] = serde_json::to_value([emission]).unwrap();
    definition["processes"] = serde_json::to_value([herbal_definition()]).unwrap();
    let ports = ["kettle", "hearth", "barm", "keg", "tray"].into_iter()
        .map(|key| json!({"key":key,"components":[{"name":"hive.container","value":{"capacity":16}}]}))
        .collect::<Vec<_>>();
    definition["structures"]["catalog"] = json!([{
        "id":"brew-station", "shape":{"kind":"floor"},
        "materials":[{"kind":"stone-spoil","quantity":1}],
        "workSeconds":1.0, "workReachBelowCells":0,
        "onComplete":{"ports":ports}
    }]);
    kernel.load_environment(&definition.to_string()).unwrap();
    let surface = kernel.environment.as_mut().unwrap().world
        .surface_cells(&[(0, 0)]).unwrap()[0].as_ref().unwrap().cell;
    let prepared = kernel.environment.as_mut().unwrap().world
        .prepare_structures(vec![crate::structure_geometry::StaticInstance::Floor {
            id: "station".into(), support: surface,
        }]).unwrap().unwrap();
    kernel.environment.as_mut().unwrap().world.apply_structures(prepared).unwrap();
    let spacing = kernel.environment.as_ref().unwrap().world.cell_spacing_m();
    let station_position = Position {
        x: (surface.x as f64 + 1.0) * spacing[0],
        y: (f64::from(surface.y) + 0.5) * spacing[1],
        z: surface.z as f64 * spacing[2],
        facing: 0.0,
    };
    let port_y = if blocked_air { f64::from(surface.y) * spacing[1] } else { 20.0 };
    let station = kernel
        .ecs
        .spawn((
            ExternalId("station".into()),
            station_position.clone(),
            Container { capacity: 1 },
            SealedContainer {},
            ConstructionSite {
                catalog: "brew-station".into(),
                x: surface.x,
                y: surface.y,
                z: surface.z,
                orientation: crate::structure_geometry::Cardinal::North,
                seconds: 1.0,
                phase: ConstructionPhase::Finished,
            },
        ))
        .id();
    kernel.ids.insert("station".into(), station);
    kernel.known.insert("station".into());
    for key in ["kettle", "hearth", "barm", "keg", "tray"] {
        let id = format!("station:{key}");
        let entity = kernel
            .ecs
            .spawn((
                ExternalId(id.clone()),
                Position {
                    x: 0.0,
                    y: port_y,
                    z: 0.0,
                    facing: 0.0,
                },
                Container { capacity: 16 },
            ))
            .id();
        kernel.ids.insert(id.clone(), entity);
        kernel.known.insert(id.clone());
        kernel.contents.insert(id, BTreeSet::new());
    }
    kernel
        .ecs
        .entity_mut(kernel.entity("station:hearth").unwrap())
        .insert(Emitter {
            catalog: "wood-hearth".into(),
        });
    let worker = kernel
        .ecs
        .spawn((
            ExternalId("worker".into()),
            station_position,
            Body { speed: 1.0 },
            Traversal {
                clearance_cells: 1,
                max_step_cells: 1,
            },
            Container { capacity: 16 },
        ))
        .id();
    kernel.ids.insert("worker".into(), worker);
    kernel.known.insert("worker".into());
    let lots = [
        ("malt", 2, "station:kettle"),
        ("water", 2, "station:kettle"),
        ("mugwort", 1, "station:kettle"),
        ("wood", 1, "station:hearth"),
        ("barm", 1, "station:barm"),
        ("keg", 1, "station:keg"),
    ];
    for (role, quantity, container) in lots {
        let id = format!("lot:{role}");
        let bundle = (
            ExternalId(id.clone()),
            Lot {
                kind: role.into(),
                quantity,
                container: container.into(),
            },
        );
        let entity = if role == "keg" || role == "barm" {
            kernel
                .ecs
                .spawn((
                    bundle.0,
                    bundle.1,
                    Container { capacity: 16 },
                    Position {
                        x: 0.0,
                        y: port_y,
                        z: 0.0,
                        facing: 0.0,
                    },
                ))
                .id()
        } else {
            kernel.ecs.spawn(bundle).id()
        };
        kernel.ids.insert(id.clone(), entity);
        kernel.known.insert(id);
        kernel
            .contents
            .entry(container.into())
            .or_default()
            .insert(entity);
    }
    kernel.refresh_state_weight();
    kernel.rebuild_physical_indexes(true).unwrap();
    kernel
}

fn admitted() -> (Kernel, String) {
    let mut kernel = fixture(false);
    kernel
        .ecs
        .get_mut::<Lot>(kernel.entity("lot:malt").unwrap())
        .unwrap()
        .quantity = 1;
    let extra = kernel
        .ecs
        .spawn((
            ExternalId("lot:malt-extra".into()),
            Lot {
                kind: "malt".into(),
                quantity: 1,
                container: "station:kettle".into(),
            },
        ))
        .id();
    kernel.ids.insert("lot:malt-extra".into(), extra);
    kernel.known.insert("lot:malt-extra".into());
    kernel
        .contents
        .get_mut("station:kettle")
        .unwrap()
        .insert(extra);
    kernel.refresh_state_weight();
    let process = kernel.request_process("herbal-ale-v1", "station", &ActionScope::Host).unwrap();
    kernel
        .admit_process(&process, "herbal-ale-v1", "station")
        .unwrap();
    let party = kernel.ecs.spawn((ExternalId("party:process".into()), Party { owner_player: "player:process".into() })).id();
    kernel.ids.insert("party:process".into(), party);
    kernel.known.insert("party:process".into());
    let worker = kernel.entity("worker").unwrap();
    kernel.ecs.entity_mut(worker).insert(PartyMember { party: "party:process".into() });
    kernel.ecs.entity_mut(kernel.entity(&process).unwrap()).insert(OwnedByParty { party: "party:process".into() });
    kernel.refresh_state_weight();
    (kernel, process)
}

/// Advance one native attendance operation through the durable attempt owner.
/// The first call begins the process operation; later calls continue its exact
/// operation or acknowledge a retained terminal result before retrying.
fn attend_tick(kernel: &mut Kernel, process: &str, delta: f64) -> String {
    let action = if let Some(entity) = kernel.work_attempts.get(process).copied() {
        let attempt = kernel.ecs.get::<WorkAttempt>(entity).unwrap();
        match &attempt.phase {
            AttemptPhase::Executing { operation, .. } => json!({"kind":"continue-work-attempt","task":process,"generation":attempt.key.generation,"sequence":operation.sequence,"nextActivity":{"kind":"process-attendance","process":process}}),
            AttemptPhase::Outcome { operation, .. } => json!({"kind":"acknowledge-work-attempt","task":process,"generation":attempt.key.generation,"sequence":operation.sequence}),
            _ => panic!("unexpected process attempt phase"),
        }
    } else {
        json!({"kind":"begin-work-attempt","task":process,"worker":"worker","party":"party:process","operation":{"kind":"process-attendance","process":process}})
    };
    kernel.advance_json(&json!({"delta":delta,"writes":[],"actions":[{"scope":{"kind":"party","party":"party:process"},"request":action}]}).to_string()).unwrap()
}

#[test]
fn split_bindings_are_consumed_once_and_retained_bindings_survive() {
    let (mut kernel, process) = admitted();
    attend_tick(&mut kernel, &process, 1.0);
    assert_eq!(
        kernel
            .ecs
            .get::<Lot>(kernel.entity("lot:malt").unwrap())
            .unwrap()
            .quantity,
        0
    );
    assert_eq!(
        kernel
            .ecs
            .get::<Lot>(kernel.entity("lot:malt-extra").unwrap())
            .unwrap()
            .quantity,
        0
    );
    assert!(kernel.ids.keys().any(|id| id.contains(":barm:")));
    assert!(kernel.ids.keys().any(|id| id.contains(":keg:")));
    assert!(!kernel.ids.keys().any(|id| id.contains(":malt:")));
    assert_eq!(
        kernel
            .ecs
            .get::<StagedProcess>(kernel.entity(&process).unwrap())
            .unwrap()
            .stage_index,
        1
    );
}

#[test]
fn prepare_emits_on_next_tick_and_fermentation_survives_save_reload() {
    let (mut kernel, process) = admitted();
    attend_tick(&mut kernel, &process, 1.0);
    let paid = kernel.snapshot_entities_json().unwrap();
    assert!(kernel
        .environment
        .as_ref()
        .unwrap()
        .paid_emissions
        .contains_key("station:hearth"));
    assert_eq!(
        kernel
            .environment
            .as_ref()
            .unwrap()
            .atmosphere
            .as_ref()
            .unwrap()
            .emitted(),
        (0.0, 0.0)
    );
    kernel
        .advance_json(r#"{"delta":1,"writes":[],"actions":[]}"#)
        .unwrap();
    assert!(
        kernel
            .environment
            .as_ref()
            .unwrap()
            .atmosphere
            .as_ref()
            .unwrap()
            .emitted()
            .0
            > 0.0
    );
    let mut restored = Kernel::new();
    restored.restore_json(&paid).unwrap();
    assert_eq!(
        restored
            .ecs
            .get::<StagedProcess>(restored.entity(&process).unwrap())
            .unwrap()
            .stage_index,
        1
    );
    assert_eq!(
        restored
            .ecs
            .get::<StagedProcess>(restored.entity(&process).unwrap())
            .unwrap()
            .phase,
        ProcessPhase::Waiting
    );
}

#[test]
fn final_outputs_use_retained_keg_and_distinct_tray_lots() {
    let (mut kernel, process) = admitted();
    attend_tick(&mut kernel, &process, 1.0);
    kernel
        .advance_json(r#"{"delta":1,"writes":[],"actions":[]}"#)
        .unwrap();
    kernel
        .advance_json(r#"{"delta":1,"writes":[],"actions":[]}"#)
        .unwrap();
    attend_tick(&mut kernel, &process, 1.0);
    attend_tick(&mut kernel, &process, 1.0);
    let lots: Vec<_> = kernel
        .ecs
        .query::<&Lot>()
        .iter(&kernel.ecs)
        .map(|lot| (lot.kind.clone(), lot.container.clone()))
        .collect();
    let keg_id = "lot:keg".to_string();
    assert!(lots.contains(&("ale".into(), keg_id.clone())));
    assert!(lots.contains(&("spent-grain".into(), "station:tray".into())));
    assert_ne!(
        lots.iter().find(|row| row.0 == "ale").unwrap().1,
        lots.iter().find(|row| row.0 == "spent-grain").unwrap().1
    );
    assert_eq!(
        kernel
            .ecs
            .query::<&crate::staged_process::ProcessBinding>()
            .iter(&kernel.ecs)
            .count(),
        0
    );
}

#[test]
fn full_destination_leaves_facts_unchanged_releases_worker_and_retry_succeeds_once() {
    let (mut kernel, process) = admitted();
    let tray = kernel.entity("station:tray").unwrap();
    kernel
        .ecs
        .entity_mut(tray)
        .insert(Container { capacity: 1 });
    let filler = kernel
        .ecs
        .spawn((
            ExternalId("lot:filler".into()),
            Lot {
                kind: "filler".into(),
                quantity: 1,
                container: "station:tray".into(),
            },
        ))
        .id();
    kernel.ids.insert("lot:filler".into(), filler);
    kernel.known.insert("lot:filler".into());
    kernel
        .contents
        .get_mut("station:tray")
        .unwrap()
        .insert(filler);
    kernel.refresh_state_weight();
    attend_tick(&mut kernel, &process, 1.0);
    kernel
        .advance_json(r#"{"delta":1,"writes":[],"actions":[]}"#)
        .unwrap();
    kernel
        .advance_json(r#"{"delta":1,"writes":[],"actions":[]}"#)
        .unwrap();
    let before_lots = kernel.query_json(r#"["hive.lot"]"#).unwrap();
    let before_bindings = kernel.query_json(r#"["hive.process-binding"]"#).unwrap();
    // Release the completed preparation attendance, then start the final
    // attendance as a distinct durable generation.
    attend_tick(&mut kernel, &process, 0.0);
    let blocked: serde_json::Value = serde_json::from_str(&attend_tick(&mut kernel, &process, 1.0)).unwrap();
    assert_eq!(blocked["results"][0]["accepted"], true);
    assert_eq!(kernel.query_json(r#"["hive.lot"]"#).unwrap(), before_lots);
    assert_eq!(
        kernel.query_json(r#"["hive.process-binding"]"#).unwrap(),
        before_bindings
    );
    let state = kernel
        .ecs
        .get::<StagedProcess>(kernel.entity(&process).unwrap())
        .unwrap();
    assert_eq!(state.blocked_reason, "process-output-full");
    kernel
        .ecs
        .entity_mut(tray)
        .insert(Container { capacity: 16 });
    kernel.refresh_state_weight();
    attend_tick(&mut kernel, &process, 0.0);
    attend_tick(&mut kernel, &process, 1.0);
    let ale_count = kernel
        .ecs
        .query::<&Lot>()
        .iter(&kernel.ecs)
        .filter(|lot| lot.kind == "ale")
        .count();
    attend_tick(&mut kernel, &process, 0.0);
    let before_replay = kernel.save_records().unwrap();
    let repeated = kernel.advance_json(&json!({"delta":1.0,"writes":[],"actions":[{"scope":{"kind":"party","party":"party:process"},"request":{"kind":"begin-work-attempt","task":process,"worker":"worker","party":"party:process","operation":{"kind":"process-attendance","process":process}}}]}).to_string());
    assert_eq!(repeated.unwrap_err(), "process is complete");
    assert_eq!(kernel.save_records().unwrap().entities, before_replay.entities);
    assert_eq!(
        kernel
            .ecs
            .query::<&Lot>()
            .iter(&kernel.ecs)
            .filter(|lot| lot.kind == "ale")
            .count(),
        ale_count
    );
    assert_eq!(kernel.ecs.query::<&Lot>().iter(&kernel.ecs).filter(|lot| lot.kind == "ale").count(), 1);
}

#[test]
fn blocked_air_preserves_physical_facts_and_releases_worker() {
    let (mut kernel, process) = {
        let mut k = fixture(true);
        let p = k.request_process("herbal-ale-v1", "station", &ActionScope::Host).unwrap();
        k.admit_process(&p, "herbal-ale-v1", "station").unwrap();
        let party = k.ecs.spawn((ExternalId("party:process".into()), Party { owner_player: "player:process".into() })).id();
        k.ids.insert("party:process".into(), party); k.known.insert("party:process".into());
        k.ecs.entity_mut(k.entity("worker").unwrap()).insert(PartyMember { party: "party:process".into() });
        k.ecs.entity_mut(k.entity(&p).unwrap()).insert(OwnedByParty { party: "party:process".into() });
        k.refresh_state_weight();
        (k, p)
    };
    let before = kernel
        .query_json(r#"["hive.lot","hive.process-binding"]"#)
        .unwrap();
    let blocked: serde_json::Value = serde_json::from_str(&attend_tick(&mut kernel, &process, 1.0)).unwrap();
    assert_eq!(blocked["results"][0]["accepted"], true);
    assert_eq!(
        kernel
            .query_json(r#"["hive.lot","hive.process-binding"]"#)
            .unwrap(),
        before
    );
    let state = kernel
        .ecs
        .get::<StagedProcess>(kernel.entity(&process).unwrap())
        .unwrap();
    assert_eq!(state.phase, ProcessPhase::Blocked);
    assert_eq!(state.blocked_reason, "process-air-unavailable");
    assert!(kernel
        .environment
        .as_ref()
        .unwrap()
        .paid_emissions
        .is_empty());
    for id in [
        "station:kettle",
        "station:hearth",
        "station:barm",
        "station:keg",
        "station:tray",
    ] {
        kernel
            .ecs
            .entity_mut(kernel.entity(id).unwrap())
            .insert(Position {
                x: 0.0,
                y: 20.0,
                z: 0.0,
                facing: 0.0,
            });
    }
    kernel.rebuild_physical_indexes(true).unwrap();
    attend_tick(&mut kernel, &process, 0.0);
    attend_tick(&mut kernel, &process, 1.0);
    assert_eq!(kernel.environment.as_ref().unwrap().paid_emissions.len(), 1);
    assert!(kernel
        .environment
        .as_ref()
        .unwrap()
        .paid_emissions
        .contains_key("station:hearth"));
}
