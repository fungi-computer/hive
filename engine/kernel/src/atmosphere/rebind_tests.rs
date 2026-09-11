use super::*;
use super::rebind::{rebind, AtmosphereRebindResult, RebindBlockReason};

fn model() -> AtmosphereModel {
    AtmosphereModel {
        specific_gas_constant_jkg_k: 287.05,
        heat_capacity_jkg_k: 1005.0,
        mixing_velocity_mps: 1.0,
        buoyancy_velocity_mps_k: 0.1,
        pressure_velocity_mps_pa: 0.001,
        max_step_s: 0.2,
        max_exchange_fraction: 0.5,
        max_pressure_ratio: 10.0,
        max_temperature_delta_k: 100.0,
        max_smoke_mass_fraction: 0.01,
    }
}
fn volume(id: &str, cells: &[&str]) -> AtmosphereVolumeDefinition {
    AtmosphereVolumeDefinition { id: id.into(), members: cells.iter().enumerate().map(|(index, cell_id)| AtmosphereMember {
        cell_id: (*cell_id).into(), volume_m3: 1.0, elevation_m: index as f64 * 0.54,
    }).collect() }
}
fn definition(revision: u64, volumes: Vec<AtmosphereVolumeDefinition>, openings: Vec<AtmosphereOpeningDefinition>) -> AtmosphereDefinition {
    AtmosphereDefinition { version: "connected-atmosphere-definition-v1".into(), region_id: "room".into(), geometry_identity: format!("geo-{revision}"), revision,
        ambient: AtmosphereAmbient { pressure_pa: 101_325.0, temperature_k: 293.15 }, model: model(), volumes, openings }
}
fn opening(id: &str, from: &str, from_cell_id: &str, to: Option<&str>, to_cell_id: Option<&str>) -> AtmosphereOpeningDefinition {
    AtmosphereOpeningDefinition { id: id.into(), from: from.into(), from_cell_id: from_cell_id.into(), to: to.map(str::to_owned), to_cell_id: to_cell_id.map(str::to_owned), area_m2: 1.0, distance_m: 1.0, elevation_m: 0.54, permeability: 1.0 }
}

#[test]
fn split_and_merge_preserve_carrier_without_minting_ambient_air() {
    let old = CompiledAtmosphere::compile(definition(1, vec![volume("room", &["a", "b"])], vec![])).unwrap();
    let mut state = old.initial();
    state.parcels[0].smoke_kg = 0.001;
    state.initial_smoke_kg = 0.001;
    state.parcels[0].heat_j = 100.0;
    state.initial_heat_j = 100.0;
    old.validate_state(&state).unwrap();
    let split = CompiledAtmosphere::compile(definition(2, vec![volume("left", &["a"]), volume("right", &["b"])], vec![opening("door", "left", "a", Some("right"), Some("b"))])).unwrap();
    let applied = rebind(&old, &state, split.definition().clone()).unwrap();
    let AtmosphereRebindResult::Applied { compiled: split_owner, state: split_state, .. } = applied else { panic!("split blocked"); };
    split_owner.validate_state(&split_state).unwrap();
    assert!((split_state.parcels.iter().map(|parcel| parcel.carrier_kg).sum::<f64>() - state.initial_carrier_kg).abs() < 1e-9);
    assert!((split_state.parcels.iter().map(|parcel| parcel.smoke_kg).sum::<f64>() - state.initial_smoke_kg).abs() < 1e-9);
    assert!((split_state.parcels.iter().map(|parcel| parcel.heat_j).sum::<f64>() - state.initial_heat_j).abs() < 1e-9);

    let old_two = CompiledAtmosphere::compile(definition(1, vec![volume("left", &["a"]), volume("right", &["b"])], vec![opening("door", "left", "a", Some("right"), Some("b"))])).unwrap();
    let merged_state = old_two.initial();
    let merged = rebind(&old_two, &merged_state, definition(2, vec![volume("room", &["a", "b"])], vec![])).unwrap();
    let AtmosphereRebindResult::Applied { state: merged_state, .. } = merged else { panic!("merge blocked"); };
    assert!((merged_state.parcels[0].carrier_kg - merged_state.initial_carrier_kg).abs() < 1e-9);
}

#[test]
fn removed_trapped_stock_blocks_without_mutating_old_state() {
    let old = CompiledAtmosphere::compile(definition(1, vec![volume("kept", &["a"]), volume("removed", &["b"])], vec![])).unwrap();
    let state = old.initial();
    let before = state.clone();
    let next = definition(2, vec![volume("kept", &["a"])], vec![]);
    assert!(matches!(rebind(&old, &state, next).unwrap(), AtmosphereRebindResult::Blocked(RebindBlockReason::TrappedVolumeRemoved)));
    assert_eq!(state, before);
}

#[test]
fn contraction_routes_through_real_ambient_face_and_new_space_stays_empty() {
    let old = CompiledAtmosphere::compile(definition(1, vec![volume("room", &["a", "b"])], vec![opening("outside", "room", "a", None, None)])).unwrap();
    let state = old.initial();
    let next = definition(2, vec![volume("room", &["b"])], vec![]);
    let AtmosphereRebindResult::Applied { state: contracted, receipt, .. } = rebind(&old, &state, next).unwrap() else { panic!("contraction blocked"); };
    assert!(receipt.carrier_boundary_kg > 0.0);
    assert!(contracted.carrier_boundary_kg() > 0.0);

    let old_small = CompiledAtmosphere::compile(definition(1, vec![volume("room", &["a"])], vec![])).unwrap();
    let small_state = old_small.initial();
    let next_with_space = definition(2, vec![volume("room", &["a"]), volume("new", &["c"])], vec![]);
    let AtmosphereRebindResult::Applied { state: expanded, .. } = rebind(&old_small, &small_state, next_with_space).unwrap() else { panic!("expansion blocked"); };
    assert_eq!(expanded.parcels[1].carrier_kg, 0.0);
    assert_eq!(expanded.carrier_boundary_kg(), 0.0);

    let old_contracted = CompiledAtmosphere::compile(definition(1, vec![volume("room", &["a", "b"])], vec![])).unwrap();
    let contracted_state = old_contracted.initial();
    let AtmosphereRebindResult::Applied { compiled: contracted_owner, state: no_face, .. } = rebind(
        &old_contracted,
        &contracted_state,
        definition(2, vec![volume("room", &["b"])], vec![]),
    ).unwrap() else { panic!("contraction without a face blocked"); };
    contracted_owner.validate_state(&no_face).unwrap();
    assert!((no_face.parcels.iter().map(|parcel| parcel.carrier_kg).sum::<f64>() - contracted_state.initial_carrier_kg).abs() < 1e-9);
}
