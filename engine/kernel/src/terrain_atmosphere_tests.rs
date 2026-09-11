use super::atmosphere::{AtmosphereAmbient, AtmosphereModel};
use super::generation::{Bounds, MaterialSlots, WorldSpec};
use super::terrain::{MaterialProperty, TerrainOwner};
use super::terrain_atmosphere::{ExteriorPolicy, TerrainAtmosphere, TerrainAtmosphereConfig};
use super::terrain_water::{MaterialWater, TerrainWater, TerrainWaterGeometry};
use std::collections::BTreeMap;

fn model() -> AtmosphereModel {
    AtmosphereModel { specific_gas_constant_jkg_k: 287.05, heat_capacity_jkg_k: 1005.0,
        mixing_velocity_mps: 1.0, buoyancy_velocity_mps_k: 0.1, pressure_velocity_mps_pa: 0.001,
        max_step_s: 0.2, max_exchange_fraction: 0.5, max_pressure_ratio: 4.0,
        max_temperature_delta_k: 100.0, max_smoke_mass_fraction: 0.01 }
}
fn world() -> TerrainWater {
    let bounds = Bounds { min_x: -2, max_x: 2, min_y: -32, max_y: 40, min_z: -2, max_z: 2 };
    let generator = WorldSpec { seed: "terrain-atmosphere", identity: "terrain-atmosphere", bounds,
        slots: MaterialSlots { air: 0, soil: 1, stone: 2 }, sea_level: 1, vertical_metres: 0.54, max_samples: 4096 }.compile().unwrap();
    let terrain = TerrainOwner::new(generator, [
        MaterialProperty { slot: 0, solid: false, diggable: false },
        MaterialProperty { slot: 1, solid: true, diggable: true },
        MaterialProperty { slot: 2, solid: true, diggable: true },
    ], 4, 128, 32_768).unwrap();
    let geometry = TerrainWaterGeometry::new("terrain-atmosphere-water".into(), vec![],
        BTreeMap::from([(0, MaterialWater::Open), (1, MaterialWater::Closed), (2, MaterialWater::Closed)]),
        [1.0, 0.54, 1.0], 1.0, 0.1, super::water::WaterLimits::default(), 6).unwrap();
    TerrainWater::fresh(geometry, terrain, &[]).unwrap()
}
fn config(exterior: ExteriorPolicy) -> TerrainAtmosphereConfig {
    TerrainAtmosphereConfig { region_id: "test-region".into(), min: super::generation::Cell { x: -1, y: 28, z: -1 }, max: super::generation::Cell { x: 1, y: 40, z: 1 }, ambient: AtmosphereAmbient { pressure_pa: 101_325.0, temperature_k: 293.15 }, model: model(), exterior }
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
    let closed = TerrainAtmosphere::fresh(&mut closed_world, config(ExteriorPolicy::Closed)).unwrap();
    assert!(closed.compiled().definition().openings.iter().all(|opening| opening.to.is_some()));
}
