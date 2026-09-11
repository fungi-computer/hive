//! Bounded search over physical support cells, including underground routes.
//! The supplied query reads canonical terrain; this module stores no material grid.
use crate::generation::Cell;
use crate::terrain_traversal::{self, MaterialQuery, TraversalConfig};
use pathfinding::prelude::bfs;

pub fn search(
    start: Cell,
    destination: Cell,
    config: TraversalConfig,
    query: &mut MaterialQuery<'_>,
) -> Result<Vec<Cell>, String> {
    if terrain_traversal::node(start, config, query)?.is_none()
        || terrain_traversal::node(destination, config, query)?.is_none()
    {
        return Err("route endpoint lacks support or clearance".into());
    }
    let key = |cell: Cell| (cell.x, cell.y, cell.z);
    let cell = |(x, y, z)| Cell { x, y, z };
    let mut expanded = 0usize;
    let mut failure = None;
    let path = bfs(
        &key(start),
        |current| {
            if failure.is_some() { return Vec::new(); }
            expanded += 1;
            if expanded > 4096 {
                failure = Some("terrain route exceeds local search budget".to_string());
                return Vec::new();
            }
            let from = match terrain_traversal::node(cell(*current), config, query) {
                Ok(Some(node)) => node,
                Ok(None) => return Vec::new(),
                Err(error) => { failure = Some(error); return Vec::new(); }
            };
            let mut neighbors = Vec::with_capacity(12);
            for (dx, dz) in [(1, 0), (0, 1), (-1, 0), (0, -1)] {
                for dy in [0, 1, -1] {
                    match terrain_traversal::step(from, dx, dy, dz, config, query) {
                        Ok(Some(next)) => neighbors.push(key(next.support)),
                        Ok(None) => {},
                        Err(error) => { failure = Some(error); return Vec::new(); }
                    }
                }
            }
            neighbors
        },
        |current| *current == key(destination),
    );
    if let Some(error) = failure { return Err(error); }
    path.map(|path| path.into_iter().map(cell).collect())
        .ok_or_else(|| "no supported terrain route".into())
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::terrain_traversal::TraversalMaterial;
    use std::collections::BTreeSet;

    #[test]
    fn search_uses_deep_support_and_climbs_one_voxel() {
        let solid: BTreeSet<_> = [(0,-20,0),(1,-19,0),(2,-19,0)].into_iter().collect();
        let mut query = |at: Cell| Ok(TraversalMaterial { solid: solid.contains(&(at.x,at.y,at.z)) });
        let start = Cell { x:0,y:-20,z:0 };
        let end = Cell { x:2,y:-19,z:0 };
        let config = TraversalConfig { spacing:[1.0,0.54,1.0],clearance_cells:1,max_step_cells:1 };
        assert_eq!(search(start,end,config,&mut query).unwrap(),vec![start,Cell{x:1,y:-19,z:0},end]);
    }

    #[test]
    fn search_rejects_a_two_voxel_cliff() {
        let mut query = |at: Cell| Ok(TraversalMaterial { solid: [(0,0,0),(1,2,0)].contains(&(at.x,at.y,at.z)) });
        let config = TraversalConfig { spacing:[1.0,0.54,1.0],clearance_cells:1,max_step_cells:1 };
        assert!(search(Cell{x:0,y:0,z:0},Cell{x:1,y:2,z:0},config,&mut query).is_err());
    }
}
