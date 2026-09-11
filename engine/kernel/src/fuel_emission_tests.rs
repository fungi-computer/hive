//! Focused native laws for paid finite emissions. The parent `world` module
//! owns the nested declaration; these tests do not add another fire owner.

use super::*;
use serde_json::{Value, json};

fn environment_definition() -> String {
    let mut definition: Value =
        serde_json::from_str(&crate::environment_definition::tests::fixture("fire-laws")).unwrap();
    definition["atmosphere"] = json!({
        "regionId":"fire-region",
        "min":{"x":-8,"y":-8,"z":-8},
        "max":{"x":8,"y":40,"z":8},
        "ambient":{"pressurePa":101325.0,"temperatureK":293.15},
        "model":{
            "specificGasConstantJkgK":287.05,"heatCapacityJkgK":1005.0,
            "mixingVelocityMps":1.0,"buoyancyVelocityMpsK":0.1,
            "pressureVelocityMpsPa":0.001,"maxStepS":0.2,
            "maxExchangeFraction":0.5,"maxPressureRatio":4.0,
            "maxTemperatureDeltaK":100.0,"maxSmokeMassFraction":0.01
        },
        "exterior":"WorldTop"
    });
    definition["emissions"] = json!([{
        "id":"wood-fire","materialKind":"wood","quantity":2,
        "durationS":0.4,"smokeKg":0.01,"heatJ":1.0
    }]);
    definition.to_string()
}

fn kernel(fuel_quantity: Option<u32>, wet: bool) -> Kernel {
    let mut kernel = Kernel::new();
    let mut components = json!({
        "hive.position":{"x":0.0,"y":0.0,"z":0.0,"facing":0.0},
        "hive.container":{"capacity":10},
        "hive.emitter":{"catalog":"wood-fire"}
    });
    if let Some(quantity) = fuel_quantity {
        components["hive.lot"] = json!({"kind":"wood","quantity":quantity,"container":"station"});
        if wet {
            components["hive.lot-water"] = json!({"waterKg":1.0});
        }
    }
    kernel.load(&json!({
        "format":"hive-game","version":1,"game":"fire-laws","components":[],
        "initial":[
            {"id":"worker","components":{"hive.position":{"x":0.0,"y":0.0,"z":0.0,"facing":0.0},"hive.body":{"speed":1.0}}},
            {"id":"station","components":components}
        ]
    }).to_string()).unwrap();
    kernel.load_environment(&environment_definition()).unwrap();
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
    let position = Position {
        x: surface.x as f64 * spacing[0],
        y: (f64::from(surface.y) + 0.5) * spacing[1],
        z: surface.z as f64 * spacing[2],
        facing: 0.0,
    };
    for id in ["worker", "station"] {
        kernel
            .ecs
            .entity_mut(kernel.entity(id).unwrap())
            .insert(position);
    }
    kernel.rebuild_physical_indexes(true).unwrap();
    kernel
}

fn action(kernel: &mut Kernel) -> Value {
    serde_json::from_str(&kernel.advance_json(r#"{"delta":0,"writes":[],"actions":[{"kind":"begin-emission","worker":"worker","station":"station"}]}"#).unwrap()).unwrap()
}
fn state_fingerprint(kernel: &Kernel) -> (String, Option<Vec<u8>>) {
    let records = kernel.save_records().unwrap();
    (records.entities, records.atmosphere)
}
fn lot_quantity(kernel: &mut Kernel) -> u64 {
    let rows: Value = serde_json::from_str(&kernel.query_json(r#"["hive.lot"]"#).unwrap()).unwrap();
    rows.as_array()
        .unwrap()
        .first()
        .map(|row| row["components"]["hive.lot"]["quantity"].as_u64().unwrap())
        .unwrap_or(0)
}

#[test]
fn dry_admission_debits_once_and_duplicate_is_rejected() {
    let mut kernel = kernel(Some(2), false);
    let before = state_fingerprint(&kernel);
    assert_eq!(action(&mut kernel)["results"][0]["accepted"], true);
    assert_eq!(lot_quantity(&mut kernel), 0);
    let admitted = state_fingerprint(&kernel);
    assert_eq!(admitted.1, before.1);
    assert_eq!(action(&mut kernel)["results"][0]["accepted"], false);
    assert_eq!(lot_quantity(&mut kernel), 0);
    assert_eq!(state_fingerprint(&kernel).1, admitted.1);
}

#[test]
fn missing_wet_insufficient_and_remote_fuel_leave_state_unchanged() {
    for (fuel, wet, remote) in [
        (None, false, false),
        (Some(2), true, false),
        (Some(1), false, false),
        (Some(2), false, true),
    ] {
        let mut kernel = kernel(fuel, wet);
        if remote {
            let station = kernel.entity("station").unwrap();
            let mut position = *kernel.ecs.get::<Position>(station).unwrap();
            position.x += 3.0;
            kernel.ecs.entity_mut(station).insert(position);
            kernel.rebuild_physical_indexes(true).unwrap();
        }
        let before = state_fingerprint(&kernel);
        assert_eq!(action(&mut kernel)["results"][0]["accepted"], false);
        assert_eq!(state_fingerprint(&kernel), before);
    }
}

#[test]
fn admission_tick_and_pause_do_not_advance_release() {
    let mut kernel = kernel(Some(2), false);
    action(&mut kernel);
    let admitted = state_fingerprint(&kernel);
    kernel
        .advance_json(r#"{"delta":0,"writes":[],"actions":[]}"#)
        .unwrap();
    assert_eq!(state_fingerprint(&kernel), admitted);
    kernel
        .advance_json(r#"{"delta":0.2,"writes":[],"actions":[]}"#)
        .unwrap();
    assert_ne!(state_fingerprint(&kernel).1, admitted.1);
}

#[test]
fn release_save_restore_has_same_next_step_and_completes_once() {
    let mut kernel = kernel(Some(2), false);
    action(&mut kernel);
    kernel
        .advance_json(r#"{"delta":0.2,"writes":[],"actions":[]}"#)
        .unwrap();
    let saved = kernel.save_records().unwrap();
    let mut restored = Kernel::new();
    restored.restore_records(&saved).unwrap();
    kernel
        .advance_json(r#"{"delta":0.2,"writes":[],"actions":[]}"#)
        .unwrap();
    restored
        .advance_json(r#"{"delta":0.2,"writes":[],"actions":[]}"#)
        .unwrap();
    assert_eq!(state_fingerprint(&kernel), state_fingerprint(&restored));
    assert!(
        kernel
            .environment
            .as_ref()
            .unwrap()
            .paid_emissions
            .is_empty()
    );
    assert_eq!(lot_quantity(&mut kernel), 0);
    kernel
        .advance_json(r#"{"delta":0.2,"writes":[],"actions":[]}"#)
        .unwrap();
    assert_eq!(lot_quantity(&mut kernel), 0);
}
