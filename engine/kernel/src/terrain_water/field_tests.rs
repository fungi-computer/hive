use super::*;
use crate::generation::{Bounds, MaterialSlots, WorldSpec};
use crate::terrain::MaterialProperty;

pub(super) fn terrain() -> TerrainOwner {
    let generator = WorldSpec { seed: "colony-world-v1", identity: "colony",
        bounds: Bounds { min_x: -32, max_x: 32, min_y: -32, max_y: 40, min_z: -32, max_z: 32 },
        slots: MaterialSlots { air: 0, soil: 1, stone: 2 }, sea_level: 12,
        vertical_metres: 0.54, max_samples: 4096 }.compile().unwrap();
    TerrainOwner::new(generator, [
        MaterialProperty { slot: 0, solid: false, diggable: false },
        MaterialProperty { slot: 1, solid: true, diggable: true },
        MaterialProperty { slot: 2, solid: true, diggable: true },
    ], 4, 4096, 256 * 1024).unwrap()
}
pub(super) fn geometry() -> TerrainWaterGeometry {
    TerrainWaterGeometry::new("whole-clearing-water".into(), vec![Cell { x: 0, y: 30, z: 0 }],
        BTreeMap::from([(0, MaterialWater::Open), (1, MaterialWater::Porous(SoilRule {
            id: "soil".into(), porosity: 0.4, retention: 0.1, absorb_m_per_s: 0.1, seep_m_per_s: 0.1,
        })), (2, MaterialWater::Porous(SoilRule {
            id: "stone".into(), porosity: 0.05, retention: 0.01, absorb_m_per_s: 0.01, seep_m_per_s: 0.01,
        }))]), [1.0, 0.54, 1.0], 0.1, 0.1, WaterLimits::default(), 6).unwrap().with_generated_groundwater()
}
#[test]
fn off_center_groundwater_seepage_is_finite_bounded_and_restart_exact() {
    let mut world = TerrainWater::fresh(geometry(), terrain(), &[]).unwrap();
    assert_eq!(world.advance(0.25).unwrap().faces, 0, "untouched world sleeps");
    let mut spoil_water = 0.0;
    let mut cuts = Vec::new();
    for _ in 0..3 {
        let surface = world.terrain.surface_cells(&[(12, 10)]).unwrap()[0].unwrap().cell;
        let material = world.material(surface).unwrap();
        let ExcavationResult::Prepared(p) = world.prepare_excavation(surface, material, 0).unwrap() else { panic!("actual cut must prepare") };
        spoil_water += p.water_kg();
        world.apply_excavation(p).unwrap();
        cuts.push(surface);
    }
    assert!(cuts.iter().all(|c| c.x > 2 && c.z > 2));
    for _ in 0..40 {
        let work = world.advance(0.25).unwrap();
        assert!(work.faces <= 128 * 6, "local work bounded independently of world extent");
    }
    let facts = world.facts().unwrap();
    assert!(facts.cells.iter().any(|c| c.at[0] > 2 && c.liquid_volume_m3 > 0.0), "actual off-center cuts receive finite seepage: {facts:?}");
    assert!((facts.total_kg + spoil_water - facts.initial_total_kg).abs() < 1e-8);
    let saved = world.save_records().unwrap();
    let mut restored = TerrainWater::restore_records(geometry(), terrain(), &saved).unwrap();
    assert_eq!(restored.facts().unwrap(), facts);
    assert_eq!(restored.save_records().unwrap().water, saved.water);
    for _ in 0..16 { world.advance(0.25).unwrap(); restored.advance(0.25).unwrap(); }
    assert_eq!(restored.facts().unwrap(), world.facts().unwrap());
    assert_eq!(restored.save_records().unwrap().water, world.save_records().unwrap().water);
    for c in cuts { assert_eq!(restored.material(c).unwrap(), 0); }
}
#[test]
fn exhausted_groundwater_does_not_refill_and_invalid_record_is_rejected() {
    let mut world = TerrainWater::fresh(geometry(), terrain(), &[]).unwrap();
    let c = Cell { x: -18, y: -25, z: 14 };
    let material = world.material(c).unwrap();
    assert_ne!(material, 0);
    let ExcavationResult::Prepared(p) = world.prepare_excavation(c, material, 0).unwrap() else { panic!("wet stone cut") };
    assert!(p.water_kg() > 0.0);
    world.apply_excavation(p).unwrap();
    let before = world.facts().unwrap();
    assert_eq!(before.cells.iter().find(|s| s.at == [-18, -25, 14]).unwrap().mass_kg, 0.0);
    let saved = world.save_records().unwrap();
    let restored = TerrainWater::restore_records(geometry(), terrain(), &saved).unwrap();
    assert_eq!(restored.facts().unwrap(), before);
    assert_eq!(restored.save_records().unwrap().water, saved.water);
    let mut corrupt = saved;
    corrupt.water.push(1);
    assert!(TerrainWater::restore_records(geometry(), terrain(), &corrupt).is_err());
}
