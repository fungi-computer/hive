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
