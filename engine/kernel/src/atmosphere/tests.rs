use super::*;

    fn definition() -> AtmosphereDefinition {
        AtmosphereDefinition {
            version: "connected-atmosphere-definition-v1".into(),
            region_id: "room".into(),
            geometry_identity: "geo-1".into(),
            revision: 0,
            ambient: AtmosphereAmbient {
                pressure_pa: 101_325.0,
                temperature_k: 293.15,
            },
            model: AtmosphereModel {
                specific_gas_constant_jkg_k: 287.05,
                heat_capacity_jkg_k: 1005.0,
                mixing_velocity_mps: 1.0,
                buoyancy_velocity_mps_k: 0.1,
                pressure_velocity_mps_pa: 0.001,
                max_step_s: 0.2,
                max_exchange_fraction: 0.5,
                max_pressure_ratio: 2.0,
                max_temperature_delta_k: 100.0,
                max_smoke_mass_fraction: 0.01,
            },
            volumes: vec![
                AtmosphereVolumeDefinition {
                    id: "lower".into(),
                    members: vec![AtmosphereMember {
                        cell_id: "cell:0,0,0".into(),
                        volume_m3: 1.0,
                        elevation_m: 0.0,
                    }],
                },
                AtmosphereVolumeDefinition {
                    id: "upper".into(),
                    members: vec![AtmosphereMember {
                        cell_id: "cell:0,1,0".into(),
                        volume_m3: 1.0,
                        elevation_m: 0.54,
                    }],
                },
            ],
            openings: vec![AtmosphereOpeningDefinition {
                id: "stair".into(),
                from: "lower".into(),
                from_cell_id: "cell:0,0,0".into(),
                to: Some("upper".into()),
                to_cell_id: Some("cell:0,1,0".into()),
                area_m2: 1.0,
                distance_m: 1.0,
                elevation_m: 0.54,
                permeability: 1.0,
            }],
        }
    }

    #[test]
    fn distinct_regions_and_nonpositive_absolute_temperature_are_rejected() {
        let mut first_definition = definition();
        first_definition.model.max_temperature_delta_k = 1000.0;
        let first = CompiledAtmosphere::compile(first_definition.clone()).unwrap();
        let mut other_definition = first_definition;
        other_definition.region_id = "other-region".into();
        let other = CompiledAtmosphere::compile(other_definition).unwrap();
        assert_ne!(first.identity(), other.identity());
        let mut state = first.initial();
        state.parcels[0].heat_j =
            -400.0 * state.parcels[0].carrier_kg * first.definition.model.heat_capacity_jkg_k;
        state.initial_heat_j = state.parcels[0].heat_j;
        assert!(first.advance(&state, 0.2, &[]).is_err());
    }

    #[test]
    fn unrepresentable_exchange_leaves_both_stocks_unchanged() {
        let atmosphere = CompiledAtmosphere::compile(definition()).unwrap();
        let mut state = atmosphere.initial();
        let before = state.clone();
        let flow = Flow {
            left: 0,
            right: Some(1),
            mixed_m3: 0.0,
            pressure_m3: 0.0,
        };
        assert!(
            !atmosphere
                .apply_pair(&mut state, &flow, Quantity::Carrier, 1e-30)
                .unwrap()
        );
        assert_eq!(state, before);
    }

    #[test]
    fn compact_stock_rejects_same_count_geometry_and_trailing_bytes() {
        let original = CompiledAtmosphere::compile(definition()).unwrap();
        let bytes = original.encode_state(&original.initial()).unwrap();
        let mut changed = definition();
        changed.openings[0].permeability = 0.0;
        let closed = CompiledAtmosphere::compile(changed).unwrap();
        // Existing label/count identities deliberately match; the full content
        // digest must still reject a different opening, not just a new revision.
        assert_eq!(original.identity(), closed.identity());
        assert!(closed.decode_state(&bytes).is_err());
        let mut trailing = bytes;
        trailing.push(0);
        assert!(original.decode_state(&trailing).is_err());
    }

    #[test]
    fn foreign_owner_is_rejected_and_exact_definition_restore_rebinds() {
        let first = CompiledAtmosphere::compile(definition()).unwrap();
        let second = CompiledAtmosphere::compile(definition()).unwrap();
        let state = first.initial();
        assert!(second.advance(&state, 0.2, &[]).is_err());
        let bytes = first.encode_state(&state).unwrap();
        let restored = second.decode_state(&bytes).unwrap();
        assert!(second.advance(&restored, 0.2, &[]).is_ok());
        let mut changed = definition();
        changed.model.mixing_velocity_mps *= 2.0;
        let different = CompiledAtmosphere::compile(changed).unwrap();
        assert!(different.decode_state(&bytes).is_err());
    }

    #[test]
    fn finite_source_moves_through_connected_parcels_and_round_trips() {
        let atmosphere = CompiledAtmosphere::compile(definition()).unwrap();
        let state = atmosphere.initial();
        let (next, receipt) = atmosphere
            .advance(
                &state,
                1.0,
                &[AtmosphereSource {
                    volume_id: "lower".into(),
                    smoke_kg_s: 0.001,
                    heat_j_s: 10.0,
                }],
            )
            .unwrap();
        assert_eq!(receipt.steps, 5);
        assert!(next.smoke_source_kg > 0.0 && next.parcels[1].smoke_kg > 0.0);
        assert_eq!(
            atmosphere
                .decode_state(&atmosphere.encode_state(&next).unwrap())
                .unwrap(),
            next
        );
    }

    #[test]
    fn ambient_opening_accounts_boundary_without_mutating_input() {
        let mut definition = definition();
        definition.openings.push(AtmosphereOpeningDefinition {
            id: "chimney".into(),
            from: "upper".into(),
            from_cell_id: "cell:0,1,0".into(),
            to: None,
            to_cell_id: None,
            area_m2: 1.0,
            distance_m: 1.0,
            elevation_m: 1.0,
            permeability: 1.0,
        });
        let atmosphere = CompiledAtmosphere::compile(definition).unwrap();
        let state = atmosphere.initial();
        let (next, _) = atmosphere
            .advance(
                &state,
                1.0,
                &[AtmosphereSource {
                    volume_id: "upper".into(),
                    smoke_kg_s: 0.001,
                    heat_j_s: 0.0,
                }],
            )
            .unwrap();
        assert!(next.smoke_boundary_kg >= 0.0);
        assert_eq!(state.smoke_source_kg, 0.0);
    }

    #[test]
    fn equal_density_tracer_mixes_and_multiple_openings_share_donor_budget() {
        let mut definition = definition();
        definition.openings.push(AtmosphereOpeningDefinition {
            id: "second".into(),
            from: "lower".into(),
            from_cell_id: "cell:0,0,0".into(),
            to: Some("upper".into()),
            to_cell_id: Some("cell:0,1,0".into()),
            area_m2: 1.0,
            distance_m: 1.0,
            elevation_m: 0.54,
            permeability: 1.0,
        });
        let atmosphere = CompiledAtmosphere::compile(definition).unwrap();
        let mut state = atmosphere.initial();
        state.parcels[0].smoke_kg = 0.01;
        state.initial_smoke_kg = 0.01;
        let total_before = state
            .parcels
            .iter()
            .map(|parcel| parcel.smoke_kg)
            .sum::<f64>()
            + state.smoke_boundary_kg;
        let (next, _) = atmosphere.advance(&state, 0.2, &[]).unwrap();
        let total_after = next
            .parcels
            .iter()
            .map(|parcel| parcel.smoke_kg)
            .sum::<f64>()
            + next.smoke_boundary_kg;
        assert!((total_after - total_before).abs() < 1e-12);
        assert!(next.parcels[0].smoke_kg >= 0.0 && next.parcels[1].smoke_kg >= 0.0);
    }

    #[test]
    fn pressure_and_height_temperature_drive_signed_exchange() {
        let atmosphere = CompiledAtmosphere::compile(definition()).unwrap();
        let mut pressure = atmosphere.initial();
        pressure.parcels[0].carrier_kg *= 1.1;
        pressure.initial_carrier_kg +=
            atmosphere.volume_m3[0] * atmosphere.ambient_carrier_density * 0.1;
        let (after_pressure, _) = atmosphere.advance(&pressure, 0.2, &[]).unwrap();
        assert!(after_pressure.parcels[0].carrier_kg < pressure.parcels[0].carrier_kg);
        let mut warm = atmosphere.initial();
        warm.parcels[0].heat_j = 10_000.0;
        warm.initial_heat_j = 10_000.0;
        let (after_warm, _) = atmosphere.advance(&warm, 0.2, &[]).unwrap();
        assert!(
            after_warm.parcels[1].carrier_kg > warm.parcels[1].carrier_kg
                || after_warm.parcels[0].carrier_kg < warm.parcels[0].carrier_kg
        );
    }

    #[test]
    fn finite_definition_rejects_nonfinite_initial_carrier() {
        let mut extreme = definition();
        extreme.ambient.pressure_pa = 1.0e308;
        extreme.ambient.temperature_k = 1.0;
        extreme.model.specific_gas_constant_jkg_k = 1.0;
        extreme.volumes[0].members[0].volume_m3 = 1.0e308;
        assert!(CompiledAtmosphere::compile(extreme).is_err());
    }

    #[test]
    fn malformed_definition_and_late_source_fail_before_state_change() {
        let mut malformed = definition();
        malformed.volumes.push(AtmosphereVolumeDefinition {
            id: "bad".into(),
            members: Vec::new(),
        });
        assert!(CompiledAtmosphere::compile(malformed).is_err());
        let atmosphere = CompiledAtmosphere::compile(definition()).unwrap();
        let state = atmosphere.initial();
        assert!(
            atmosphere
                .advance(
                    &state,
                    0.1,
                    &[AtmosphereSource {
                        volume_id: "missing".into(),
                        smoke_kg_s: 1.0,
                        heat_j_s: 0.0
                    }]
                )
                .is_err()
        );
        assert_eq!(state.smoke_source_kg, 0.0);
    }


#[test]
fn aggregated_faces_match_physical_face_exchange_with_sources_and_ambient() {
    let mut definition = definition();
    let template = definition.openings[0].clone();
    definition.openings.clear();
    for index in 0..64 {
        let mut opening = template.clone();
        opening.id = format!("face-{index}");
        opening.area_m2 = (index + 1) as f64 / 128.0;
        definition.openings.push(opening);
    }
    for index in 0..16 {
        let mut opening = template.clone();
        opening.id = format!("sky-{index}");
        opening.from = "upper".into();
        opening.from_cell_id = "cell:0,1,0".into();
        opening.to = None;
        opening.to_cell_id = None;
        opening.elevation_m = 2.0;
        opening.area_m2 = 0.05;
        definition.openings.push(opening);
    }
    let compiled = CompiledAtmosphere::compile(definition).unwrap();
    assert_eq!(compiled.openings.len(), 80);
    assert_eq!(compiled.exchange_openings.len(), 2);
    let mut reference = compiled.clone();
    reference.exchange_openings = reference.openings.clone();
    let mut actual = compiled.initial();
    let mut expected = actual.clone();
    for _ in 0..30 {
        let sources = [AtmosphereSource { volume_id: "lower".into(), smoke_kg_s: 0.0001, heat_j_s: 10.0 }];
        actual = compiled.advance(&actual, 0.1, &sources).unwrap().0;
        expected = reference.advance(&expected, 0.1, &sources).unwrap().0;
        for (left, right) in actual.parcels.iter().zip(&expected.parcels) {
            for (a, b) in [(left.carrier_kg, right.carrier_kg), (left.smoke_kg, right.smoke_kg), (left.heat_j, right.heat_j)] {
                assert!((a-b).abs() <= 1e-10 * b.abs().max(1.0), "{a} differs from {b}");
            }
        }
        for (a,b) in [(actual.carrier_boundary_kg,expected.carrier_boundary_kg),
            (actual.smoke_boundary_kg,expected.smoke_boundary_kg), (actual.heat_boundary_j,expected.heat_boundary_j)] {
            assert!((a-b).abs() <= 1e-10 * b.abs().max(1.0));
        }
    }
    assert!(actual.parcels[1].smoke_kg > 0.0);
    assert_eq!(compiled.decode_state(&compiled.encode_state(&actual).unwrap()).unwrap(), actual);
}

#[test]
fn exchange_aggregation_keeps_height_distance_and_permeability_distinct() {
    let mut definition = definition();
    let template = definition.openings[0].clone();
    for index in 0..3 {
        let mut opening = template.clone();
        opening.id = format!("different-{index}");
        match index {
            0 => opening.elevation_m += 1.0,
            1 => opening.distance_m += 1.0,
            _ => opening.permeability = 0.5,
        }
        definition.openings.push(opening);
    }
    let compiled = CompiledAtmosphere::compile(definition).unwrap();
    assert_eq!(compiled.exchange_openings.len(), 4);
}

#[test]
fn shared_geometry_preserves_owned_codec_and_fresh_state_authority() {
    use sha2::{Digest, Sha256};
    let owned = definition();
    let bytes = postcard::to_allocvec(&(
        &owned.version, &owned.region_id, &owned.ambient, &owned.model,
        &owned.volumes, &owned.openings,
    )).unwrap();
    let digest: [u8; 32] = Sha256::digest(bytes).into();
    let shared: SharedAtmosphereDefinition = owned.clone().into();
    let first = CompiledAtmosphere::compile_shared(shared.clone()).unwrap();
    let second = CompiledAtmosphere::compile_shared(shared.clone()).unwrap();
    assert!(Arc::ptr_eq(&first.definition.volumes[0], &shared.volumes[0]));
    assert!(Arc::ptr_eq(&first.definition.openings[0], &shared.openings[0]));
    let state = first.initial();
    assert!(second.advance(&state, 0.1, &[]).is_err());
    let expected = postcard::to_allocvec(&(STATE_VERSION, digest, &state)).unwrap();
    assert_eq!(first.encode_state(&state).unwrap(), expected);
    first.sample_cells(&state, &["cell:0,0,0".into()]).unwrap();
    assert!(first.exported_definition.get().is_none());
    assert_eq!(first.definition(), &owned);
}

#[test]
fn numeric_members_keep_generic_id_lookup_and_reject_cross_volume_duplicates() {
    let mut owned = definition();
    owned.volumes[0].members[0].cell_id = "z/custom:10".into();
    owned.volumes[1].members[0].cell_id = "a/custom:2".into();
    owned.openings[0].from_cell_id = "z/custom:10".into();
    owned.openings[0].to_cell_id = Some("a/custom:2".into());
    let compiled = CompiledAtmosphere::compile(owned.clone()).unwrap();
    assert_eq!(compiled.volume_for_cell("z/custom:10"), Some("lower"));
    assert_eq!(compiled.volume_for_cell("a/custom:2"), Some("upper"));
    assert_eq!(compiled.volume_for_cell("unknown"), None);
    assert_eq!(compiled.member_index.iter().map(|m| compiled.member_id(m)).collect::<Vec<_>>(), vec!["a/custom:2", "z/custom:10"]);
    owned.volumes[1].members[0].cell_id = "z/custom:10".into();
    assert!(CompiledAtmosphere::compile(owned).is_err());
}
