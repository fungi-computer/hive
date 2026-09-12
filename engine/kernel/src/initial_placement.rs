use crate::components::{Position, Traversal};
use crate::terrain::SurfaceCell;
use crate::terrain_traversal::{self, MaterialQuery, TraversalConfig};

pub struct Request {
    pub entity: String,
    pub position: Position,
    pub traversal: Option<Traversal>,
    pub surface: SurfaceCell,
}

pub fn resolve(
    requests: impl IntoIterator<Item = Request>,
    spacing: [f64; 3],
    query: &mut MaterialQuery<'_>,
) -> Result<Vec<(String, Position)>, String> {
    let mut resolved = Vec::new();
    for request in requests {
        let position = Position {
            x: request.surface.cell.x as f64 * spacing[0],
            y: (f64::from(request.surface.cell.y) + 0.5) * spacing[1],
            z: request.surface.cell.z as f64 * spacing[2],
            facing: request.position.facing,
        };
        if ![position.x, position.y, position.z, position.facing].iter().all(|value| value.is_finite() && value.abs() <= 1_000_000.0) {
            return Err("initial placement position is invalid".into());
        }
        if let Some(traversal) = request.traversal {
            let config = TraversalConfig { spacing, clearance_cells: traversal.clearance_cells, max_step_cells: traversal.max_step_cells };
            if terrain_traversal::node(request.surface.cell, config, query)?.is_none() {
                return Err("initial placement lacks traversal clearance".into());
            }
        }
        resolved.push((request.entity, position));
    }
    Ok(resolved)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn rejects_invalid_traversal_clearance_at_initial_placement() {
        let request = Request {
            entity: "actor".into(),
            position: Position { x: 0.0, y: 0.0, z: 0.0, facing: 0.0 },
            traversal: Some(Traversal { clearance_cells: 1, max_step_cells: 2 }),
            surface: SurfaceCell { cell: crate::generation::Cell { x: 0, y: 0, z: 0 }, material: 1, generated_top: 0 },
        };
        let mut query = |_cell: crate::generation::Cell| Ok(crate::terrain_traversal::TraversalMaterial { solid: true, outside: false, sealed_top: false });
        assert!(resolve([request], [1.0, 0.54, 1.0], &mut query).is_err());
    }
}
