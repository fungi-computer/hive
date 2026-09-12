//! Constant-neighborhood gas geometry. No room discovery or gas state.
use super::TerrainWater;
use crate::generation::Cell;
use crate::structure_geometry::{Face, FaceAxis};

pub(crate) const DIRECTIONS: [(i64, i32, i64); 6] = [
    (1, 0, 0),
    (-1, 0, 0),
    (0, 1, 0),
    (0, -1, 0),
    (0, 0, 1),
    (0, 0, -1),
];
#[derive(Clone, Debug)]
pub(crate) struct LocalAir {
    pub volume_m3: f64,
    pub neighbors: Vec<Cell>,
}

fn volume(world: &mut TerrainWater, cell: Cell) -> Result<f64, String> {
    let b = world.bounds();
    if cell.x < b.min_x
        || cell.x >= b.max_x
        || cell.y < b.min_y
        || cell.y >= b.max_y
        || cell.z < b.min_z
        || cell.z >= b.max_z
    {
        return Ok(0.0);
    }
    let material = world.terrain.query(cell)?;
    if !world.terrain.is_open_material(material) || world.structure_projection.is_bulk_solid(cell) {
        return Ok(0.0);
    }
    let liquid = world.field.liquid_volume(cell).unwrap_or(0.0);
    let capacity = world.cell_spacing_m().iter().product::<f64>();
    if !liquid.is_finite() || liquid < 0.0 || liquid > capacity + 1e-9 * capacity {
        return Err("invalid liquid occupancy for smoke contact".into());
    }
    Ok((capacity - liquid).max(0.0))
}
pub(super) fn query(world: &mut TerrainWater, cell: Cell) -> Result<LocalAir, String> {
    let volume_m3 = volume(world, cell)?;
    let mut neighbors = Vec::with_capacity(6);
    for (i, (dx, dy, dz)) in DIRECTIONS.into_iter().enumerate() {
        let Some(x) = cell.x.checked_add(dx) else {
            continue;
        };
        let Some(y) = cell.y.checked_add(dy) else {
            continue;
        };
        let Some(z) = cell.z.checked_add(dz) else {
            continue;
        };
        let next = Cell { x, y, z };
        let face = Face {
            cell: if i % 2 == 0 { cell } else { next },
            axis: match i / 2 {
                0 => FaceAxis::X,
                1 => FaceAxis::Y,
                _ => FaceAxis::Z,
            },
        };
        if !world.structure_projection.is_face_sealed(face) && volume(world, next)? > 0.0 {
            neighbors.push(next);
        }
    }
    Ok(LocalAir {
        volume_m3,
        neighbors,
    })
}

/// Smoke's outdoor path additionally respects fully flooded cells. The retained
/// general terrain-clearance query deliberately does not own this water rule.
pub(super) fn outdoors(world: &mut TerrainWater, cell: Cell, ceiling: i32) -> Result<bool, String> {
    if ceiling != world.bounds().max_y {
        return Ok(false);
    }
    if i64::from(ceiling) - i64::from(cell.y) > 4096 {
        return Err("smoke sky query exceeds vertical budget".into());
    }
    for y in cell.y..ceiling {
        let at = Cell { y, ..cell };
        if volume(world, at)? <= 0.0
            || world.structure_projection.is_face_sealed(Face {
                cell: at,
                axis: FaceAxis::Y,
            })
        {
            return Ok(false);
        }
    }
    Ok(true)
}
