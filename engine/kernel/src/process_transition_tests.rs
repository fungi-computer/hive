use super::*;
use crate::emission_definition::{EmissionCatalog, EmissionDefinition};
use crate::environment_definition::{CompletionRecipe, PortDefinition, StructureDefinition};
use crate::staged_process::{
    InputDisposition, InputPolicy, OutputDestination, ProcessDefinition, ProcessEmission,
    ProcessInput, ProcessOutput, ProcessPhase, ProcessStage, ProcessTransition, StageMode,
    StagedProcess,
};
use crate::terrain_atmosphere::{ExteriorPolicy, TerrainAtmosphere, TerrainAtmosphereConfig};
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
    kernel
        .load_environment(&crate::environment_definition::tests::fixture(
            "process-transition-laws",
        ))
        .unwrap();
    let ports = ["kettle", "hearth", "barm", "keg", "tray"]
        .into_iter()
        .map(|key| PortDefinition {
            key: key.into(),
            components: vec![(
                "hive.container".into(),
                [("capacity".into(), json!(16))].into_iter().collect(),
            )],
            at_site_contact: false,
        })
        .collect();
    let station_def = StructureDefinition {
        id: "brew-station".into(),
        shape: crate::environment_definition::StructureShape::Floor,
        materials: BTreeMap::new(),
        work_seconds: 1.0,
        work_reach_below_cells: 0,
        on_complete: CompletionRecipe {
            components: vec![],
            ports,
        },
        on_remove: Default::default(),
    };
    let environment = kernel.environment.as_mut().unwrap();
    environment
        .structures
        .insert("brew-station".into(), station_def);
    environment.emissions = EmissionCatalog::from_definitions(vec![EmissionDefinition {
        id: "wood-hearth".into(),
        material_kind: "wood".into(),
        quantity: 1,
        duration_s: 3.0,
        smoke_kg: 0.03,
        heat_j: 30_000.0,
    }])
    .unwrap();
    environment.processes = crate::staged_process::ProcessCatalog::from_definitions(
        vec![herbal_definition()],
        &environment.structures,
        &environment.emissions,
    )
    .unwrap();
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
    environment.atmosphere =
        Some(TerrainAtmosphere::fresh(&mut environment.world, config).unwrap());
    let y = if blocked_air { 0.0 } else { 20.0 };
    let station = kernel
        .ecs
        .spawn((
            ExternalId("station".into()),
            Position {
                x: 0.0,
                y,
                z: 0.0,
                facing: 0.0,
            },
            Container { capacity: 16 },
            SealedContainer {},
            ConstructionSite {
                catalog: "brew-station".into(),
                x: 0,
                y: y as i32,
                z: 0,
                orientation: crate::structure_geometry::Cardinal::North,
                seconds: 0.0,
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
                    y,
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
            Position {
                x: 0.0,
                y,
                z: 0.0,
                facing: 0.0,
            },
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
                        y,
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
    (kernel, process)
}

#[test]
fn split_bindings_are_consumed_once_and_retained_bindings_survive() {
    let (mut kernel, process) = admitted();
    kernel.advance_json(r#"{"delta":1,"writes":[],"actions":[{"scope":{"kind":"host"},"request":{"kind":"attend-process","worker":"worker","process":"process:station:herbal-ale-v1"}}]}"#).unwrap();
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
    kernel.advance_json(r#"{"delta":1,"writes":[],"actions":[{"scope":{"kind":"host"},"request":{"kind":"attend-process","worker":"worker","process":"process:station:herbal-ale-v1"}}]}"#).unwrap();
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
    let (mut kernel, _process) = admitted();
    kernel.advance_json(r#"{"delta":1,"writes":[],"actions":[{"scope":{"kind":"host"},"request":{"kind":"attend-process","worker":"worker","process":"process:station:herbal-ale-v1"}}]}"#).unwrap();
    kernel
        .advance_json(r#"{"delta":1,"writes":[],"actions":[]}"#)
        .unwrap();
    kernel
        .advance_json(r#"{"delta":1,"writes":[],"actions":[]}"#)
        .unwrap();
    kernel.advance_json(r#"{"delta":1,"writes":[],"actions":[{"scope":{"kind":"host"},"request":{"kind":"attend-process","worker":"worker","process":"process:station:herbal-ale-v1"}}]}"#).unwrap();
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
    kernel.advance_json(r#"{"delta":1,"writes":[],"actions":[{"scope":{"kind":"host"},"request":{"kind":"attend-process","worker":"worker","process":"process:station:herbal-ale-v1"}}]}"#).unwrap();
    kernel
        .advance_json(r#"{"delta":1,"writes":[],"actions":[]}"#)
        .unwrap();
    kernel
        .advance_json(r#"{"delta":1,"writes":[],"actions":[]}"#)
        .unwrap();
    let before_lots = kernel.query_json(r#"["hive.lot"]"#).unwrap();
    let before_bindings = kernel.query_json(r#"["hive.process-binding"]"#).unwrap();
    let blocked: serde_json::Value = serde_json::from_str(&kernel.advance_json(r#"{"delta":1,"writes":[],"actions":[{"scope":{"kind":"host"},"request":{"kind":"attend-process","worker":"worker","process":"process:station:herbal-ale-v1"}}]}"#).unwrap()).unwrap();
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
    kernel.advance_json(r#"{"delta":1,"writes":[],"actions":[{"scope":{"kind":"host"},"request":{"kind":"attend-process","worker":"worker","process":"process:station:herbal-ale-v1"}}]}"#).unwrap();
    let ale_count = kernel
        .ecs
        .query::<&Lot>()
        .iter(&kernel.ecs)
        .filter(|lot| lot.kind == "ale")
        .count();
    let repeated: serde_json::Value = serde_json::from_str(&kernel.advance_json(r#"{"delta":1,"writes":[],"actions":[{"scope":{"kind":"host"},"request":{"kind":"attend-process","worker":"worker","process":"process:station:herbal-ale-v1"}}]}"#).unwrap()).unwrap();
    assert_eq!(repeated["results"][0]["accepted"], false);
    assert_eq!(
        kernel
            .ecs
            .query::<&Lot>()
            .iter(&kernel.ecs)
            .filter(|lot| lot.kind == "ale")
            .count(),
        ale_count
    );
    assert_eq!(
        kernel
            .ecs
            .query::<&Lot>()
            .iter(&kernel.ecs)
            .filter(|lot| lot.kind == "ale")
            .count(),
        1
    );
}

#[test]
fn blocked_air_preserves_physical_facts_and_releases_worker() {
    let (mut kernel, process) = {
        let mut k = fixture(true);
        let p = k.request_process("herbal-ale-v1", "station", &ActionScope::Host).unwrap();
        k.admit_process(&p, "herbal-ale-v1", "station").unwrap();
        (k, p)
    };
    let before = kernel
        .query_json(r#"["hive.lot","hive.process-binding"]"#)
        .unwrap();
    let blocked: serde_json::Value = serde_json::from_str(&kernel.advance_json(r#"{"delta":1,"writes":[],"actions":[{"scope":{"kind":"host"},"request":{"kind":"attend-process","worker":"worker","process":"process:station:herbal-ale-v1"}}]}"#).unwrap()).unwrap();
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
        "station",
        "station:kettle",
        "station:hearth",
        "station:barm",
        "station:keg",
        "station:tray",
        "worker",
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
    kernel.advance_json(r#"{"delta":1,"writes":[],"actions":[{"scope":{"kind":"host"},"request":{"kind":"attend-process","worker":"worker","process":"process:station:herbal-ale-v1"}}]}"#).unwrap();
    assert_eq!(kernel.environment.as_ref().unwrap().paid_emissions.len(), 1);
    assert!(kernel
        .environment
        .as_ref()
        .unwrap()
        .paid_emissions
        .contains_key("station:hearth"));
}
