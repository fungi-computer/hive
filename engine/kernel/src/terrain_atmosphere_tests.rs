use super::atmosphere::{AtmosphereAmbient, AtmosphereModel};
use super::generation::{Bounds, Cell, MaterialSlots, WorldSpec};
use super::structure_geometry::StaticInstance;
use super::terrain::{MaterialProperty, TerrainOwner};
use super::terrain_atmosphere::{ExteriorPolicy, TerrainAtmosphere, TerrainAtmosphereConfig};
use super::terrain_water::{
    AirGeometryCell, AirGeometrySnapshot, AirWaterCoverage, MaterialWater, TerrainWater,
    TerrainWaterGeometry,
};
use std::collections::BTreeMap;

fn model() -> AtmosphereModel {
    AtmosphereModel {
        specific_gas_constant_jkg_k: 287.05,
        heat_capacity_jkg_k: 1005.0,
        mixing_velocity_mps: 1.0,
        buoyancy_velocity_mps_k: 0.1,
        pressure_velocity_mps_pa: 0.001,
        max_step_s: 0.2,
        max_exchange_fraction: 0.5,
        max_pressure_ratio: 4.0,
        max_temperature_delta_k: 100.0,
        max_smoke_mass_fraction: 0.01,
    }
}
fn world() -> TerrainWater {
    let bounds = Bounds {
        min_x: -2,
        max_x: 2,
        min_y: -32,
        max_y: 40,
        min_z: -2,
        max_z: 2,
    };
    let generator = WorldSpec {
        seed: "terrain-atmosphere",
        identity: "terrain-atmosphere",
        bounds,
        slots: MaterialSlots {
            air: 0,
            soil: 1,
            stone: 2,
        },
        sea_level: 1,
        vertical_metres: 0.54,
        max_samples: 4096,
    }
    .compile()
    .unwrap();
    let terrain = TerrainOwner::new(
        generator,
        [
            MaterialProperty {
                slot: 0,
                solid: false,
                diggable: false,
            },
            MaterialProperty {
                slot: 1,
                solid: true,
                diggable: true,
            },
            MaterialProperty {
                slot: 2,
                solid: true,
                diggable: true,
            },
        ],
        4,
        128,
        32_768,
    )
    .unwrap();
    let geometry = TerrainWaterGeometry::new(
        "terrain-atmosphere-water".into(),
        vec![Cell { x: 0, y: 39, z: 0 }],
        BTreeMap::from([
            (0, MaterialWater::Open),
            (1, MaterialWater::Closed),
            (2, MaterialWater::Closed),
        ]),
        [1.0, 0.54, 1.0],
        1.0,
        0.1,
        super::water::WaterLimits::default(),
        6,
    )
    .unwrap();
    TerrainWater::fresh(geometry, terrain, &[super::water::WaterStock { id: "cell:0,39,0".into(), mass_kg: 0.0 }]).unwrap()
}
fn config(exterior: ExteriorPolicy) -> TerrainAtmosphereConfig {
    TerrainAtmosphereConfig {
        region_id: "test-region".into(),
        min: super::generation::Cell {
            x: -1,
            y: 28,
            z: -1,
        },
        max: super::generation::Cell { x: 1, y: 40, z: 1 },
        ambient: AtmosphereAmbient {
            pressure_pa: 101_325.0,
            temperature_k: 293.15,
        },
        model: model(),
        exterior,
    }
}

#[test]
fn generated_air_advances_and_restores_without_reseeding() {
    let mut water = world();
    let mut air = TerrainAtmosphere::fresh(&mut water, config(ExteriorPolicy::WorldTop)).unwrap();
    air.advance(0.2, &[]).unwrap();
    let saved = air.save().unwrap();
    let mut restored_water = world();
    let restored = TerrainAtmosphere::restore(&mut restored_water, &saved).unwrap();
    assert_eq!(restored.state().parcels(), air.state().parcels());
    assert_eq!(restored.geometry_revision(), air.geometry_revision());
}

#[test]
fn world_top_requires_the_actual_world_ceiling_and_closed_has_no_sky() {
    let mut water = world();
    let mut partial = config(ExteriorPolicy::WorldTop);
    partial.max.y -= 1;
    assert!(TerrainAtmosphere::fresh(&mut water, partial).is_err());
    let mut closed_world = world();
    let closed =
        TerrainAtmosphere::fresh(&mut closed_world, config(ExteriorPolicy::Closed)).unwrap();
    assert!(closed
        .compiled()
        .definition()
        .openings
        .iter()
        .all(|opening| opening.to.is_some()));
}

#[test]
fn unchanged_water_epoch_reuses_compiled_geometry() {
    let mut water = world();
    let config = config(ExteriorPolicy::Closed);
    let mut air = TerrainAtmosphere::fresh(&mut water, config.clone()).unwrap();
    let revision = air.geometry_revision();
    water.advance(0.0).unwrap();
    let snapshot = water.air_geometry(config.bounds()).unwrap();
    let prepared = air.prepare_rebind(&snapshot).unwrap().unwrap();
    air.apply_rebind(prepared).unwrap();
    assert_eq!(air.geometry_revision(), revision);
}

#[test]
fn changed_wall_rebinds_and_restores_exact_state() {
    let mut water = world();
    let mut config = config(ExteriorPolicy::Closed);
    let support = (-31..39)
        .map(|y| Cell { x: 0, y, z: 0 })
        .find(|cell| {
            water.material(*cell).unwrap() != 0
                && water
                    .material(Cell {
                        y: cell.y + 1,
                        ..*cell
                    })
                    .unwrap()
                    == 0
        })
        .expect("generated support and open cell");
    config.min.y = support.y + 1;
    let mut air = TerrainAtmosphere::fresh(&mut water, config.clone()).unwrap();
    let before_volumes = air.compiled().definition().volumes.clone();
    let source_volume = air.compiled().definition().volumes[0].id.clone();
    air.advance(0.2, &[super::atmosphere::AtmosphereSource {
        volume_id: source_volume, smoke_kg_s: 0.001, heat_j_s: 10.0,
    }]).unwrap();
    let before_totals = air.state().parcels().iter().fold([0.0; 3], |mut total, parcel| {
        total[0] += parcel.carrier_kg(); total[1] += parcel.smoke_kg(); total[2] += parcel.heat_j(); total
    });
    let wall = StaticInstance::Wall {
        id: "air-wall".into(),
        base: Cell {
            y: support.y + 1,
            ..support
        },
        height: 1,
    };
    let prepared_structure = water.prepare_structures(vec![wall]).unwrap().unwrap();
    let candidate = water
        .prepared_structure_air_geometry(&prepared_structure, config.bounds())
        .unwrap();
    let prepared_air = air.prepare_rebind(&candidate).unwrap().unwrap();
    water.apply_structures(prepared_structure).unwrap();
    air.apply_rebind(prepared_air).unwrap();
    assert_ne!(before_volumes, air.compiled().definition().volumes);
    let after_totals = air.state().parcels().iter().fold([0.0; 3], |mut total, parcel| {
        total[0] += parcel.carrier_kg(); total[1] += parcel.smoke_kg(); total[2] += parcel.heat_j(); total
    });
    for (before, after) in before_totals.into_iter().zip(after_totals) {
        assert!((before - after).abs() <= before.abs().max(1.0) * 1e-12);
    }
    assert!(air.geometry_revision() > 0);
    let source_volume = air.compiled().definition().volumes[0].id.clone();
    air.advance(
        0.2,
        &[super::atmosphere::AtmosphereSource {
            volume_id: source_volume.clone(),
            smoke_kg_s: 0.001,
            heat_j_s: 10.0,
        }],
    )
    .unwrap();
    assert!(air.state().smoke_source_kg() > 0.0);
    assert!(air.state().heat_source_j() > 0.0);
    let saved = air.save().unwrap();
    let restored = TerrainAtmosphere::restore(&mut water, &saved).unwrap();
    assert_eq!(restored.state().parcels(), air.state().parcels());
    assert_eq!(restored.state().smoke_source_kg(), air.state().smoke_source_kg());
    assert_eq!(restored.state().heat_source_j(), air.state().heat_source_j());
    assert_eq!(
        restored.compiled().definition(),
        air.compiled().definition()
    );
    let mut expected = air;
    let mut continued = restored;
    expected
        .advance(
            0.2,
            &[super::atmosphere::AtmosphereSource {
                volume_id: source_volume.clone(),
                smoke_kg_s: 0.001,
                heat_j_s: 10.0,
            }],
        )
        .unwrap();
    continued
        .advance(
            0.2,
            &[super::atmosphere::AtmosphereSource {
                volume_id: source_volume,
                smoke_kg_s: 0.001,
                heat_j_s: 10.0,
            }],
        )
        .unwrap();
    assert_eq!(continued.state().parcels(), expected.state().parcels());
}

#[test]
fn rebind_candidate_becomes_stale_after_atmosphere_advance() {
    let mut water = world();
    let config = config(ExteriorPolicy::Closed);
    let mut air = TerrainAtmosphere::fresh(&mut water, config.clone()).unwrap();
    water.advance(0.0).unwrap();
    let candidate = water.air_geometry(config.bounds()).unwrap();
    let prepared_air = air.prepare_rebind(&candidate).unwrap().unwrap();
    air.advance(0.0, &[]).unwrap();
    assert!(air.apply_rebind(prepared_air).is_err());
}

#[test]
fn fully_flooded_rebind_is_typed_blocked_and_keeps_air_unchanged() {
    let mut water = world();
    let config = config(ExteriorPolicy::Closed);
    let mut air = TerrainAtmosphere::fresh(&mut water, config.clone()).unwrap();
    let before_revision = air.geometry_revision();
    let before_state = air.state().parcels().to_vec();
    let candidate = AirGeometrySnapshot {
        physical_revision: air.geometry_revision() + 1,
        epoch: air.source_epoch() + 1,
        bounds: config.bounds(),
        cells: vec![AirGeometryCell {
            at: config.min,
            voxel_volume_m3: 0.54,
            water: AirWaterCoverage::Admitted {
                liquid_volume_m3: 0.54,
            },
        }],
        faces: Vec::new(),
    };
    let result = air.prepare_rebind(&candidate).unwrap();
    assert!(matches!(
        result,
        Err(crate::atmosphere::AtmosphereRebindResult::Blocked(
            crate::atmosphere::RebindBlockReason::TrappedVolumeRemoved
        ))
    ));
    assert_eq!(air.geometry_revision(), before_revision);
    assert_eq!(air.state().parcels(), before_state.as_slice());
}
