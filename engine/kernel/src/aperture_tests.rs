//! Focused native aperture laws. Geometry, rooted support, and action admission
//! all remain owned by the existing structure/environment owners.
use super::*;
use crate::generation::{Bounds, Cell};
use crate::structure_geometry::{StaticGeometry, StaticInstance};

fn bounds() -> Bounds { Bounds { min_x: -4, max_x: 4, min_y: -8, max_y: 16, min_z: -4, max_z: 4 } }

#[test]
fn door_and_upper_vent_keep_frame_support_while_opening_only_the_interval() {
    for (bottom, height) in [(0u8, 2u8), (2u8, 1u8)] {
        let base = Cell { x: 0, y: 0, z: 0 };
        let closed = StaticGeometry::new(bounds(), vec![StaticInstance::ApertureWall {
            id: "aperture".into(), base, height: 5, opening_bottom: bottom, opening_height: height, open: false,
        }]).unwrap();
        let open = StaticGeometry::new(bounds(), vec![StaticInstance::ApertureWall {
            id: "aperture".into(), base, height: 5, opening_bottom: bottom, opening_height: height, open: true,
        }]).unwrap();
        let closed_projection = closed.projection().unwrap();
        let open_projection = open.projection().unwrap();
        assert!(closed_projection.is_bulk_solid(Cell { y: i32::from(bottom), ..base }));
        assert!(!open_projection.is_bulk_solid(Cell { y: i32::from(bottom), ..base }));
        assert!(open_projection.is_bulk_solid(Cell { y: 4, ..base }));
        assert!(open_projection.supports(Cell { y: 4, ..base }));
    }
}

#[test]
fn rooted_aperture_wall_is_supported_by_terrain_anchor() {
    let base = Cell { x: 0, y: 1, z: 0 };
    let geometry = StaticGeometry::new(bounds(), vec![StaticInstance::ApertureWall {
        id: "door".into(), base, height: 4, opening_bottom: 0, opening_height: 2, open: true,
    }]).unwrap();
    let mut query = |cell: Cell| Ok(cell == Cell { x: 0, y: 0, z: 0 });
    let result = crate::structure_support::resolve(&geometry, crate::structure_support::SupportPolicy {
        max_span_steps: 6, max_instances: 16, max_work: 4096,
    }, &mut query).unwrap();
    assert!(result.supported.contains("door"));
}

fn constructed_aperture() -> (Kernel, Cell, Point) {
    let mut definition: serde_json::Value = serde_json::from_str(&crate::environment_definition::tests::fixture("aperture-laws")).unwrap();
    definition["structures"]["catalog"][0]["shape"] = serde_json::json!({"kind":"aperture","height":4,"openingBottom":0,"openingHeight":2});
    let mut kernel = Kernel::new();
    kernel.load(&serde_json::json!({"format":"hive-game","version":1,"game":"aperture-laws","components":[],"initial":[
        {"id":"worker","components":{"hive.position":{"x":0.0,"y":0.0,"z":0.0,"facing":0.0},"hive.body":{"speed":1.0},"hive.traversal":{"clearanceCells":1,"maxStepCells":1},"hive.container":{"capacity":4}}},
        {"id":"worker.2","components":{"hive.position":{"x":0.0,"y":0.0,"z":0.0,"facing":0.0},"hive.body":{"speed":1.0},"hive.traversal":{"clearanceCells":1,"maxStepCells":1},"hive.container":{"capacity":4}}},
        {"id":"source","components":{"hive.position":{"x":0.0,"y":0.0,"z":0.0,"facing":0.0},"hive.container":{"capacity":4}}},
        {"id":"lot","components":{"hive.lot":{"kind":"stone-spoil","quantity":1,"container":"source"}}}
    ]}).to_string()).unwrap();
    kernel.load_environment(&definition.to_string()).unwrap();
    let surface = kernel.environment.as_mut().unwrap().world.surface_cells(&[(0,0)]).unwrap().into_iter().next().flatten().unwrap().cell;
    let spacing = kernel.environment.as_ref().unwrap().world.cell_spacing_m();
    let contact = Point { x: surface.x as f64 * spacing[0], y: (f64::from(surface.y)+0.5)*spacing[1], z: surface.z as f64*spacing[2], frame: None };
    for id in ["worker", "worker.2", "source"] {
        let entity = kernel.entity(id).unwrap();
        kernel.ecs.entity_mut(entity).insert(Position { x: contact.x, y: contact.y, z: contact.z, facing: 0.0 });
    }
    kernel.rebuild_physical_indexes(true).unwrap();
    let site_surface = kernel.environment.as_mut().unwrap().world.surface_cells(&[(surface.x + 1, surface.z)]).unwrap().into_iter().next().flatten().unwrap().cell;
    let setup = serde_json::json!({"delta":0.0,"writes":[],"actions":[
        {"kind":"plan-construction","catalog":"floor","site":"door","x":site_surface.x,"y":site_surface.y+1,"z":site_surface.z,"orientation":"north","contact":contact},
        {"kind":"transfer","lot":"lot","from":"source","to":"door","quantity":1},
        {"kind":"attend-construction","worker":"worker","site":"door"}
    ]});
    let result: serde_json::Value = serde_json::from_str(&kernel.advance_json(&setup.to_string()).unwrap()).unwrap();
    assert!(result["results"].as_array().unwrap().iter().all(|r| r["accepted"] == true));
    kernel.advance_json(r#"{"delta":1.0,"writes":[],"actions":[]}"#).unwrap();
    let site = kernel.entity("door").unwrap();
    assert_eq!(kernel.ecs.get::<ConstructionSite>(site).unwrap().phase, ConstructionPhase::Finished);
    (kernel, site_surface, contact)
}

fn aperture_action(kernel: &mut Kernel, open: bool) -> serde_json::Value {
    serde_json::from_str(&kernel.advance_json(&serde_json::json!({"delta":0.0,"writes":[],"actions":[{"kind":"set-structure-open","worker":"worker","site":"door","open":open}]}).to_string()).unwrap()).unwrap()
}

#[test]
fn native_aperture_toggle_is_idempotent_and_close_rejects_occupied_worker() {
    let (mut kernel, surface, _) = constructed_aperture();
    let opened = aperture_action(&mut kernel, true);
    assert_eq!(opened["results"][0]["accepted"], true);
    let revision = kernel.environment.as_ref().unwrap().world.terrain_revision();
    let repeated = aperture_action(&mut kernel, true);
    assert_eq!(repeated["results"][0]["accepted"], true);
    assert_eq!(kernel.environment.as_ref().unwrap().world.terrain_revision(), revision);
    let spacing = kernel.environment.as_ref().unwrap().world.cell_spacing_m();

    let second = kernel.entity("worker.2").unwrap();
    let second_current = *kernel.ecs.get::<Position>(second).unwrap();
    kernel.ecs.entity_mut(second).insert(Position { x: surface.x as f64 * spacing[0], y: (surface.y as f64 + 0.5) * spacing[1], z: surface.z as f64 * spacing[2], ..second_current });
    kernel.rebuild_physical_indexes(true).unwrap();
    let closed = aperture_action(&mut kernel, false);
    assert_eq!(closed["results"][0]["accepted"], false);
    assert_eq!(closed["results"][0]["reason"], "aperture change would obstruct an actor");
    assert_eq!(kernel.environment.as_ref().unwrap().world.terrain_revision(), revision);
}

#[test]
fn native_open_aperture_record_restores_and_corrupt_shape_is_rejected() {
    let (mut kernel, _, _) = constructed_aperture();
    assert_eq!(aperture_action(&mut kernel, true)["results"][0]["accepted"], true);
    let saved = kernel.save_records().unwrap();
    let mut restored = Kernel::new();
    restored.restore_records(&saved).unwrap();
    assert!(matches!(restored.environment.as_ref().unwrap().world.structure_instances()[0], StaticInstance::ApertureWall { open: true, .. }));
    let mut corrupted = kernel.save_records().unwrap();
    let mut records: serde_json::Value = serde_json::from_slice(&corrupted.environment.as_ref().unwrap().1.structures).unwrap();
    records[1][0]["openingHeight"] = serde_json::json!(0);
    corrupted.environment.as_mut().unwrap().1.structures = serde_json::to_vec(&records).unwrap();
    assert!(Kernel::new().restore_records(&corrupted).is_err());
}

#[test]
fn closing_air_filled_aperture_rejects_without_publishing_any_physical_owner() {
    let (mut kernel, support, _) = constructed_aperture();
    assert_eq!(aperture_action(&mut kernel, true)["results"][0]["accepted"], true);
    // A one-cell modeled closed pocket in the opening has nowhere to send
    // its air if the aperture is closed. Water is deliberately elsewhere:
    // this must exercise the actual air rejection, not a water/body blocker.
    let cell = Cell { y: support.y + 1, ..support };
    let config_value = serde_json::json!({
        "regionId":"sealed-aperture-pocket",
        "min":cell,"max":{"x":cell.x+1,"y":cell.y+1,"z":cell.z+1},
        "ambient":{"pressurePa":101325.0,"temperatureK":293.15},
        "model":{"specificGasConstantJkgK":287.05,"heatCapacityJkgK":1005.0,
          "mixingVelocityMps":1.0,"buoyancyVelocityMpsK":0.1,"pressureVelocityMpsPa":0.001,
          "maxStepS":0.2,"maxExchangeFraction":0.5,"maxPressureRatio":4.0,
          "maxTemperatureDeltaK":100.0,"maxSmokeMassFraction":0.01},
        "exterior":"Closed"
    });
    let config = serde_json::from_value(config_value.clone()).unwrap();
    let environment = kernel.environment.as_mut().unwrap();
    environment.atmosphere = Some(crate::terrain_atmosphere::TerrainAtmosphere::fresh(&mut environment.world, config).unwrap());
    let mut definition: serde_json::Value = serde_json::from_str(&environment.definition).unwrap();
    definition["atmosphere"] = config_value;
    environment.definition = definition.to_string();
    let before = kernel.save_records().unwrap();
    let result = aperture_action(&mut kernel, false);
    assert_eq!(result["results"][0]["accepted"], false);
    assert_eq!(result["results"][0]["reason"], "aperture change is blocked by atmosphere");
    let after = kernel.save_records().unwrap();
    assert_eq!(before.atmosphere, after.atmosphere);
    let left = before.environment.unwrap().1;
    let right = after.environment.unwrap().1;
    assert_eq!(left.header, right.header);
    assert_eq!(left.terrain, right.terrain);
    assert_eq!(left.water, right.water);
    assert_eq!(left.structures, right.structures);
}
