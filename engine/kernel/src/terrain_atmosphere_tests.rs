use super::generation::{Bounds, Cell, MaterialSlots, WorldSpec};
use super::terrain::{MaterialProperty, TerrainOwner};
use super::terrain_atmosphere::{
    ExteriorPolicy, SmokeSource, TerrainAtmosphere, TerrainAtmosphereConfig,
};
use super::terrain_water::{MaterialWater, TerrainWater, TerrainWaterGeometry};
use std::collections::BTreeMap;
fn world() -> TerrainWater {
    world_with_stock(0.0)
}
fn world_with_stock(mass_kg: f64) -> TerrainWater {
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
        vec![Cell { x: 0, y: 39, z: 0 }, Cell { x: 0, y: 38, z: 0 }],
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
    TerrainWater::fresh(
        geometry,
        terrain,
        &[
            super::water::WaterStock {
                id: "cell:0,39,0".into(),
                mass_kg,
            },
            super::water::WaterStock {
                id: "cell:0,38,0".into(),
                mass_kg: 0.0,
            },
        ],
    )
    .unwrap()
}

fn config(exterior: ExteriorPolicy) -> TerrainAtmosphereConfig {
    TerrainAtmosphereConfig {
        region_id: "local-smoke-test".into(),
        min: Cell {
            x: -1,
            y: 28,
            z: -1,
        },
        max: Cell { x: 1, y: 40, z: 1 },
        exterior,
        ambient_temperature_c: 20.0,
        spread_per_second: 1.0,
        rise_bias: 2.0,
        wind: [0.0; 3],
        outdoor_loss_per_second: 2.0,
        heat_capacity_j_per_m3_k: 1200.0,
    }
}
fn source() -> SmokeSource {
    SmokeSource {
        cell: Cell { x: 0, y: 38, z: 0 },
        smoke_kg: 0.01,
        heat_j: 12.0,
    }
}
#[test]
fn clean_world_allocates_no_gas_and_ticks_no_cells() {
    let mut world = world();
    let mut air = TerrainAtmosphere::fresh(&mut world, config(ExteriorPolicy::WorldTop)).unwrap();
    let work = air.advance(&mut world, 1.0, &[]).unwrap();
    assert_eq!(work.active_cells, 0);
    assert_eq!(work.processed_cells, 0);
    let samples = air
        .sample(
            &mut world,
            &[
                Cell { x: 0, y: 38, z: 0 },
                Cell {
                    x: 100,
                    y: 38,
                    z: 0,
                },
            ],
        )
        .unwrap();
    let json = serde_json::to_value(samples).unwrap();
    assert_eq!(json[0]["smokeKgM3"], 0.0);
    assert!(json[1].is_null());
    assert!(json[0].get("pressurePa").is_none());
}
#[test]
fn finite_smoke_spreads_and_recovers_without_pressure_state() {
    let mut world = world();
    let mut air = TerrainAtmosphere::fresh(&mut world, config(ExteriorPolicy::Closed)).unwrap();
    let work = air.advance(&mut world, 0.25, &[source()]).unwrap();
    assert_eq!(work.source_smoke_kg, 0.01);
    assert!(work.active_cells > 1);
    let records = air.save().unwrap();
    let mut restored = TerrainAtmosphere::restore(&mut world, &records).unwrap();
    assert_eq!(
        postcard::to_allocvec(&records).unwrap(),
        postcard::to_allocvec(&restored.save().unwrap()).unwrap()
    );
    air.advance(&mut world, 0.25, &[]).unwrap();
    restored.advance(&mut world, 0.25, &[]).unwrap();
    assert_eq!(
        postcard::to_allocvec(&air.save().unwrap()).unwrap(),
        postcard::to_allocvec(&restored.save().unwrap()).unwrap()
    );
}
#[test]
fn outdoors_accounts_for_dispersal_and_invalid_sources_publish_nothing() {
    let mut world = world();
    let mut air = TerrainAtmosphere::fresh(&mut world, config(ExteriorPolicy::WorldTop)).unwrap();
    let receipt = air.advance(&mut world, 0.25, &[source()]).unwrap();
    assert!(receipt.escaped_smoke_kg > 0.0);
    let before = postcard::to_allocvec(&air.save().unwrap()).unwrap();
    let bad = SmokeSource {
        smoke_kg: f64::INFINITY,
        ..source()
    };
    assert!(air.advance(&mut world, 0.25, &[bad]).is_err());
    assert_eq!(postcard::to_allocvec(&air.save().unwrap()).unwrap(), before);
    let paused = air.advance(&mut world, 0.0, &[]).unwrap();
    assert_eq!(paused.processed_cells, 0);
    assert_eq!(postcard::to_allocvec(&air.save().unwrap()).unwrap(), before);
}

#[test]
fn water_above_smoke_blocks_outdoor_dispersal() {
    let mut world = world_with_stock(540.0); // one 0.54 m³ voxel of water at y39
    let mut air = TerrainAtmosphere::fresh(&mut world, config(ExteriorPolicy::WorldTop)).unwrap();
    let cell = Cell { x: 0, y: 38, z: 0 };
    let receipt = air
        .advance(
            &mut world,
            0.25,
            &[SmokeSource {
                cell,
                smoke_kg: 0.01,
                heat_j: 1.0,
            }],
        )
        .unwrap();
    assert_eq!(receipt.escaped_smoke_kg, 0.0);
    TerrainAtmosphere::restore(&mut world, &air.save().unwrap()).unwrap();
}
