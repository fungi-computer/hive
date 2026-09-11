use super::*;

fn chain(count: usize) -> CompiledAtmosphere {
    let volumes = (0..count)
        .map(|i| AtmosphereVolumeDefinition {
            id: format!("v{i}"),
            members: vec![AtmosphereMember {
                cell_id: format!("c{i}"),
                volume_m3: 1.0,
                elevation_m: i as f64,
            }],
        })
        .collect();
    let openings = (0..count - 1)
        .map(|i| AtmosphereOpeningDefinition {
            id: format!("e{i}"),
            from: format!("v{i}"),
            from_cell_id: format!("c{i}"),
            to: Some(format!("v{}", i + 1)),
            to_cell_id: Some(format!("c{}", i + 1)),
            area_m2: 4.0,
            distance_m: 1.0,
            elevation_m: i as f64 + 0.5,
            permeability: 1.0,
        })
        .collect();
    CompiledAtmosphere::compile(AtmosphereDefinition {
        version: "connected-atmosphere-definition-v1".into(),
        region_id: "quiet-chain".into(),
        geometry_identity: "chain-1".into(),
        revision: 0,
        ambient: AtmosphereAmbient {
            pressure_pa: 1.0,
            temperature_k: 1.0,
        },
        model: AtmosphereModel {
            specific_gas_constant_jkg_k: 1.0,
            heat_capacity_jkg_k: 1005.0,
            mixing_velocity_mps: 1.0,
            buoyancy_velocity_mps_k: 0.1,
            pressure_velocity_mps_pa: 0.001,
            max_step_s: 0.2,
            max_exchange_fraction: 0.5,
            max_pressure_ratio: 4.0,
            max_temperature_delta_k: 100.0,
            max_smoke_mass_fraction: 0.1,
        },
        volumes,
        openings,
    })
    .unwrap()
}

// Retained dense exchange sequence: every opening enters the budget and every
// resulting pair is applied, including mathematically zero transfers.
fn dense_step(
    a: &CompiledAtmosphere,
    state: &AtmosphereState,
    dt: f64,
    sources: &[AtmosphereSource],
) -> (AtmosphereState, usize) {
    let mut next = state.clone();
    next.exchange_cache = None;
    for source in sources {
        let i = a.volume_index[&source.volume_id];
        next.parcels[i].smoke_kg =
            changed_quantity(next.parcels[i].smoke_kg, source.smoke_kg_s * dt).unwrap();
        next.parcels[i].heat_j =
            changed_quantity(next.parcels[i].heat_j, source.heat_j_s * dt).unwrap();
        next.smoke_source_kg =
            changed_quantity(next.smoke_source_kg, source.smoke_kg_s * dt).unwrap();
        next.heat_source_j = changed_quantity(next.heat_source_j, source.heat_j_s * dt).unwrap();
    }
    let snapshot = next.parcels.clone();
    let raw: Vec<_> = a
        .exchange_openings
        .iter()
        .map(|opening| a.opening_flow(opening, &snapshot, dt))
        .collect();
    let all: Vec<_> = (0..raw.len()).collect();
    let mut unresolved = 0;
    for flow in a.bounded_flows(&raw, &all) {
        unresolved += a.mix_pair(&mut next, &snapshot, &flow).unwrap();
        unresolved += a.advect_pair(&mut next, &snapshot, &flow).unwrap();
    }
    a.validate_state(&next).unwrap();
    (next, unresolved)
}

#[test]
fn quiet_exchange_reuses_work_without_saving_cache_or_changing_stocks() {
    let a = chain(64);
    let initial = a.initial();
    let (quiet, receipt) = a.advance(&initial, 0.2, &[]).unwrap();
    assert_eq!(receipt.unresolved_exchanges, 0);
    assert_eq!(initial, quiet);
    let cache = quiet.exchange_cache.as_ref().unwrap();
    assert!(cache.active.is_empty());
    assert_eq!(cache.recomputed, 63);
    let (again, _) = a.advance(&quiet, 0.2, &[]).unwrap();
    assert!(Arc::ptr_eq(cache, again.exchange_cache.as_ref().unwrap()));
    let wire = a.encode_state(&again).unwrap();
    assert_eq!(wire, a.encode_state(&initial).unwrap());
    let restored = a.decode_state(&wire).unwrap();
    assert!(restored.exchange_cache.is_none());
    assert_eq!(
        a.advance(&restored, 0.2, &[]).unwrap(),
        a.advance(&again, 0.2, &[]).unwrap()
    );
}

#[test]
fn a_source_wakes_incident_edges_and_preserves_quiet_neighbor_budget() {
    let a = chain(8);
    let quiet = a.advance(&a.initial(), 0.2, &[]).unwrap().0;
    let sources = [AtmosphereSource {
        volume_id: "v0".into(),
        smoke_kg_s: 0.01,
        heat_j_s: 0.0,
    }];
    let (actual, receipt) = a.advance(&quiet, 0.2, &sources).unwrap();
    let (dense, unresolved) = dense_step(&a, &quiet, 0.2, &sources);
    assert_eq!(actual, dense);
    assert_eq!(receipt.unresolved_exchanges, unresolved);
    assert_eq!(actual.exchange_cache.as_ref().unwrap().recomputed, 1);
    assert_eq!(actual.exchange_cache.as_ref().unwrap().active, vec![0]);
    // v1 also budgets its quiet edge to v2: the active edge is limited to .25m³.
    assert!((actual.parcels[1].smoke_kg - 0.0005).abs() < 1e-15);
    assert!(quiet.exchange_cache.as_ref().unwrap().active.is_empty());
    let next = a.advance(&actual, 0.2, &[]).unwrap().0;
    assert_eq!(next, dense_step(&a, &dense, 0.2, &[]).0);
    assert_eq!(next.exchange_cache.as_ref().unwrap().recomputed, 2);
    assert!(next.parcels[2].smoke_kg > 0.0);
}

#[test]
fn changing_step_heat_pressure_and_restore_match_dense_exchange() {
    let a = chain(12);
    let mut actual = a.advance(&a.initial(), 0.2, &[]).unwrap().0;
    let mut dense = actual.clone();
    for i in 0..40 {
        let dt = if i % 7 == 0 { 0.05 } else { 0.2 };
        let sources = if i < 4 || i == 20 {
            vec![AtmosphereSource {
                volume_id: if i == 20 { "v7" } else { "v0" }.into(),
                smoke_kg_s: 0.001,
                heat_j_s: 2.0,
            }]
        } else {
            vec![]
        };
        let receipt;
        (actual, receipt) = a.advance(&actual, dt, &sources).unwrap();
        let unresolved;
        (dense, unresolved) = dense_step(&a, &dense, dt, &sources);
        assert_eq!(actual, dense, "step {i}");
        assert_eq!(receipt.unresolved_exchanges, unresolved, "step {i}");
        if i == 15 {
            actual = a.decode_state(&a.encode_state(&actual).unwrap()).unwrap();
        }
    }
}

#[test]
fn failed_source_does_not_change_warm_cache_or_future_exchange() {
    let a = chain(4);
    let quiet = a.advance(&a.initial(), 0.2, &[]).unwrap().0;
    let before = a.encode_state(&quiet).unwrap();
    let cache = quiet.exchange_cache.as_ref().unwrap().clone();
    let bad = [AtmosphereSource {
        volume_id: "v0".into(),
        smoke_kg_s: 100.0,
        heat_j_s: 0.0,
    }];
    assert!(a.advance(&quiet, 0.2, &bad).is_err());
    assert_eq!(a.encode_state(&quiet).unwrap(), before);
    assert!(Arc::ptr_eq(&cache, quiet.exchange_cache.as_ref().unwrap()));
    let good = [AtmosphereSource {
        volume_id: "v0".into(),
        smoke_kg_s: 0.001,
        heat_j_s: 1.0,
    }];
    assert_eq!(
        a.advance(&quiet, 0.2, &good).unwrap().0,
        dense_step(&a, &quiet, 0.2, &good).0
    );
}

#[test]
fn changed_geometry_discards_activity_and_closed_opening_matches_dense() {
    let old = chain(4);
    let warm = old
        .advance(
            &old.initial(),
            0.2,
            &[AtmosphereSource {
                volume_id: "v0".into(),
                smoke_kg_s: 0.001,
                heat_j_s: 1.0,
            }],
        )
        .unwrap()
        .0;
    assert!(warm.exchange_cache.is_some());
    let mut definition = old.definition.clone();
    definition.revision += 1;
    definition.geometry_identity = "closed-door".into();
    definition.openings[0].permeability = 0.0;
    let next = CompiledAtmosphere::compile(definition).unwrap();
    let AtmosphereRebindResult::Applied { state, .. } =
        rebind_geometry(&old, &warm, &next).unwrap()
    else {
        panic!("compatible door edit rejected")
    };
    assert!(state.exchange_cache.is_none());
    assert_eq!(
        next.advance(&state, 0.2, &[]).unwrap().0,
        dense_step(&next, &state, 0.2, &[]).0
    );
}

#[test]
fn quiet_equal_concentrations_do_not_hide_nonfinite_flow_errors() {
    let base = chain(2);
    let mut definition = base.definition.clone();
    definition.openings[0].area_m2 = 1e308;
    definition.model.mixing_velocity_mps = 1e308;
    let a = CompiledAtmosphere::compile(definition).unwrap();
    assert!(a.advance(&a.initial(), 0.2, &[]).is_err());
}
