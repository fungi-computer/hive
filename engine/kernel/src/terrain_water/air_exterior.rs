use super::TerrainWater;
use crate::generation::Cell;
use crate::structure_geometry::{Face, FaceAxis};
use std::collections::BTreeSet;

const MAX_RAY_CELLS: u64 = 40_000;

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum AirExteriorBlocker {
    TerrainSolid,
    StructureSolid,
    SealedFace,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum AirExteriorStatus {
    ClearToWorldTop,
    ClearToQueryCeiling,
    Blocked {
        cell: Cell,
        blocker: AirExteriorBlocker,
    },
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub struct AirExteriorResult {
    pub start: Cell,
    pub ceiling_y: i32,
    pub physical_revision: u64,
    pub status: AirExteriorStatus,
}

pub(super) fn query(
    world: &mut TerrainWater,
    starts: &[Cell],
    ceiling_y: i32,
) -> Result<Vec<AirExteriorResult>, String> {
    if starts.is_empty() {
        return Err("air exterior query needs at least one start".into());
    }
    let bounds = world.bounds();
    if ceiling_y > bounds.max_y {
        return Err("air exterior ceiling exceeds world bounds".into());
    }
    let mut seen = BTreeSet::new();
    let mut total = 0_u64;
    for &start in starts {
        if start.x < bounds.min_x
            || start.x >= bounds.max_x
            || start.y < bounds.min_y
            || start.y >= ceiling_y
            || start.z < bounds.min_z
            || start.z >= bounds.max_z
        {
            return Err("air exterior start is outside query bounds".into());
        }
        if !seen.insert(start) {
            return Err("duplicate air exterior start".into());
        }
        let span = u64::try_from(i64::from(ceiling_y) - i64::from(start.y))
            .map_err(|_| "air exterior ray span overflow")?;
        total = total
            .checked_add(span)
            .ok_or("air exterior ray budget overflow")?;
        if total > MAX_RAY_CELLS {
            return Err("air exterior query exceeds ray budget".into());
        }
    }

    let revision = world.physical_revision;
    let mut results = Vec::with_capacity(starts.len());
    for &start in starts {
        let mut status = None;
        for y in start.y..ceiling_y {
            let at = Cell { y, ..start };
            let material = world.terrain.query(at).map_err(|error| error.to_string())?;
            if !world.terrain.is_open_material(material) {
                status = Some(AirExteriorStatus::Blocked {
                    cell: at,
                    blocker: AirExteriorBlocker::TerrainSolid,
                });
                break;
            }
            if world.structure_projection.is_bulk_solid(at) {
                status = Some(AirExteriorStatus::Blocked {
                    cell: at,
                    blocker: AirExteriorBlocker::StructureSolid,
                });
                break;
            }
            if world.structure_projection.is_face_sealed(Face {
                cell: at,
                axis: FaceAxis::Y,
            }) {
                status = Some(AirExteriorStatus::Blocked {
                    cell: at,
                    blocker: AirExteriorBlocker::SealedFace,
                });
                break;
            }
        }
        let status = status.unwrap_or(if ceiling_y == bounds.max_y {
            AirExteriorStatus::ClearToWorldTop
        } else {
            AirExteriorStatus::ClearToQueryCeiling
        });
        results.push(AirExteriorResult {
            start,
            ceiling_y,
            physical_revision: revision,
            status,
        });
    }
    Ok(results)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::generation::{Bounds, MaterialSlots, WorldSpec};
    use crate::terrain::MaterialProperty;
    use crate::terrain_water::{MaterialWater, TerrainWaterGeometry, WaterLimits};
    use crate::water::WaterStock;
    use std::collections::BTreeMap;

    fn world() -> TerrainWater {
        let bounds = Bounds {
            min_x: -32,
            max_x: 32,
            min_y: -2,
            max_y: 40,
            min_z: -32,
            max_z: 32,
        };
        let generator = WorldSpec {
            seed: "air-exterior",
            identity: "air-exterior",
            bounds,
            slots: MaterialSlots {
                air: 0,
                soil: 1,
                stone: 2,
            },
            sea_level: 12,
            vertical_metres: 1.0,
            max_samples: 4096,
        }
        .compile()
        .unwrap();
        let terrain = crate::terrain::TerrainOwner::new(
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
            32768,
        )
        .unwrap();
        let geometry = TerrainWaterGeometry::new(
            "air-exterior".into(),
            vec![Cell { x: 0, y: 35, z: 0 }],
            BTreeMap::from([
                (0, MaterialWater::Open),
                (1, MaterialWater::Closed),
                (2, MaterialWater::Closed),
            ]),
            [1.0; 3],
            1.0,
            0.1,
            WaterLimits::default(),
            6,
        )
        .unwrap();
        TerrainWater::fresh(
            geometry,
            terrain,
            &[WaterStock {
                id: "cell:0,35,0".into(),
                mass_kg: 0.0,
            }],
        )
        .unwrap()
    }

    #[test]
    fn generated_dry_column_reaches_world_top() {
        let mut world = world();
        let result = world
            .air_exterior(&[Cell { x: 0, y: 35, z: 0 }], 40)
            .unwrap();
        assert_eq!(result[0].status, AirExteriorStatus::ClearToWorldTop);
    }

    #[test]
    fn query_ceiling_is_not_outdoor() {
        let mut world = world();
        let result = world
            .air_exterior(&[Cell { x: 0, y: 35, z: 0 }], 37)
            .unwrap();
        assert_eq!(result[0].status, AirExteriorStatus::ClearToQueryCeiling);
    }

    #[test]
    fn authored_floor_blocks_upward_clearance() {
        let mut world = world();
        let token = world
            .prepare_structures(vec![crate::structure_geometry::StaticInstance::Floor {
                id: "roof".into(),
                support: Cell { x: 0, y: 36, z: 0 },
            }])
            .unwrap()
            .unwrap();
        world.apply_structures(token).unwrap();
        let result = world
            .air_exterior(&[Cell { x: 0, y: 35, z: 0 }], 40)
            .unwrap();
        assert_eq!(
            result[0].status,
            AirExteriorStatus::Blocked {
                cell: Cell { x: 0, y: 36, z: 0 },
                blocker: AirExteriorBlocker::SealedFace
            }
        );
    }

    #[test]
    fn oversized_request_is_rejected_before_sampling() {
        let mut world = world();
        let starts = (-32..1)
            .flat_map(|x| (-32..0).map(move |z| Cell { x, y: -2, z }))
            .chain((-32..1).map(|x| Cell { x, y: -1, z: -32 }))
            .collect::<Vec<_>>();
        assert!(starts.len() > 1024);
        assert!(world.air_exterior(&starts, 40).is_err());
    }
}
