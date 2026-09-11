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
