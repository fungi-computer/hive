//! Pure voxel traversal geometry. Material ownership stays with the caller.

use crate::generation::Cell;

#[derive(Clone, Copy, Debug, PartialEq)]
pub struct TraversalConfig {
    pub spacing: [f64; 3],
    pub clearance_cells: u8,
    pub max_step_cells: u8,
}

#[derive(Clone, Copy, Debug, PartialEq)]
pub struct TraversalNode {
    pub support: Cell,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub struct TraversalMaterial {
    pub solid: bool,
    pub outside: bool,
}

pub type MaterialQuery<'a> = dyn FnMut(Cell) -> Result<TraversalMaterial, String> + 'a;

fn validate_config(config: TraversalConfig) -> Result<(), String> {
    if config.spacing.iter().any(|value| !value.is_finite() || *value <= 0.0)
        || config.clearance_cells == 0
        || config.max_step_cells != 1
    {
        return Err("invalid traversal geometry configuration".into());
    }
    Ok(())
}

fn overhead(
    support: Cell,
    config: TraversalConfig,
    query: &mut MaterialQuery<'_>,
) -> Result<bool, String> {
    for offset in 1..=i32::from(config.clearance_cells) {
        let cell = Cell {
            y: support.y.checked_add(offset).ok_or("traversal coordinate overflow")?,
            ..support
        };
        let material = query(cell)?;
        if material.outside || material.solid {
            return Ok(false);
        }
    }
    Ok(true)
}

fn feet_y(support: Cell, spacing_y: f64) -> Result<f64, String> {
    let value = (f64::from(support.y) + 0.5) * spacing_y;
    value.is_finite().then_some(value).ok_or("traversal metric position is not finite".into())
}

impl TraversalNode {
    pub fn feet_y(self, config: TraversalConfig) -> Result<f64, String> {
        validate_config(config)?;
        feet_y(self.support, config.spacing[1])
    }
}

/// Admit a supported voxel and verify the requested open head clearance.
pub fn node(
    support: Cell,
    config: TraversalConfig,
    query: &mut MaterialQuery<'_>,
) -> Result<Option<TraversalNode>, String> {
    validate_config(config)?;
    let support_material = query(support)?;
    if support_material.outside || !support_material.solid {
        return Ok(None);
    }
    if !overhead(support, config, query)? {
        return Ok(None);
    }
    feet_y(support, config.spacing[1])?;
    Ok(Some(TraversalNode { support }))
}

/// Attempt one cardinal one-voxel transition. `dx`/`dz` select one cardinal
/// horizontal neighbor and `dy` selects a level change of -1, 0, or +1.
/// Material-query errors propagate, including out-of-bounds errors.
pub fn step(
    from: TraversalNode,
    dx: i32,
    dy: i32,
    dz: i32,
    config: TraversalConfig,
    query: &mut MaterialQuery<'_>,
) -> Result<Option<TraversalNode>, String> {
    validate_config(config)?;
    if !matches!((dx, dz), (1, 0) | (-1, 0) | (0, 1) | (0, -1)) || !(-1..=1).contains(&dy) {
        return Err("traversal step is not cardinal or bounded".into());
    }
    let target = Cell {
        x: from.support.x.checked_add(i64::from(dx)).ok_or("traversal coordinate overflow")?,
        y: from.support.y.checked_add(dy).ok_or("traversal coordinate overflow")?,
        z: from.support.z.checked_add(i64::from(dz)).ok_or("traversal coordinate overflow")?,
    };
    let from_material = query(from.support)?;
    let target_material = query(target)?;
    if from_material.outside || target_material.outside || !from_material.solid || !target_material.solid {
        return Ok(None);
    }
    if !overhead(from.support, config, query)? || !overhead(target, config, query)? {
        return Ok(None);
    }
    if dy != 0 {
        let low = if dy < 0 { target } else { from.support };
        for offset in 1..=i32::from(config.clearance_cells) + dy.abs() {
            let cell = Cell {
                y: low.y.checked_add(offset).ok_or("traversal coordinate overflow")?,
                ..low
            };
            let material = query(cell)?;
            if material.outside || material.solid {
                return Ok(None);
            }
        }
    }
    feet_y(target, config.spacing[1])?;
    Ok(Some(TraversalNode { support: target }))
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::collections::BTreeSet;

    fn config() -> TraversalConfig {
        TraversalConfig { spacing: [1.0, 0.5, 1.0], clearance_cells: 1, max_step_cells: 1 }
    }

    fn world(cells: &[(i64, i32, i64)]) -> impl FnMut(Cell) -> Result<TraversalMaterial, String> + '_ {
        let cells = cells.iter().copied().collect::<BTreeSet<_>>();
        move |cell| Ok(TraversalMaterial { solid: cells.contains(&(cell.x, cell.y, cell.z)), outside: false })
    }

    #[test]
    fn deep_flat_traversal_and_metric_feet_height() {
        let mut query = world(&[(0, -20, 0), (1, -20, 0)]);
        let start = node(Cell { x: 0, y: -20, z: 0 }, config(), &mut query).unwrap().unwrap();
        assert_eq!(start.feet_y(config()).unwrap(), -9.75);
        let next = step(start, 1, 0, 0, config(), &mut query).unwrap().unwrap();
        assert_eq!(next.support, Cell { x: 1, y: -20, z: 0 });
    }

    #[test]
    fn supported_step_up_and_down_checks_low_column_clearance() {
        let mut query = world(&[
            (0, 0, 0), (1, 1, 0),
        ]);
        let start = node(Cell { x: 0, y: 0, z: 0 }, config(), &mut query).unwrap().unwrap();
        let up = step(start, 1, 1, 0, config(), &mut query).unwrap().unwrap();
        assert_eq!(up.support.y, 1);
        let down = step(up, -1, -1, 0, config(), &mut query).unwrap().unwrap();
        assert_eq!(down.support.y, 0);
    }

    #[test]
    fn low_ceiling_blocks_step_and_unsupported_hole_fails_closed() {
        let mut ceiling = world(&[(0, 0, 0), (0, 2, 0), (1, 1, 0)]);
        let start = node(Cell { x: 0, y: 0, z: 0 }, config(), &mut ceiling).unwrap().unwrap();
        assert!(step(start, 1, 1, 0, config(), &mut ceiling).unwrap().is_none());
        let mut hole = world(&[(0, 0, 0)]);
        let start = node(Cell { x: 0, y: 0, z: 0 }, config(), &mut hole).unwrap().unwrap();
        assert!(step(start, 1, 0, 0, config(), &mut hole).unwrap().is_none());
    }

    #[test]
    fn invalid_geometry_and_query_errors_are_not_swallowed() {
        let mut query = |_cell: Cell| Err::<TraversalMaterial, _>("outside bounds".into());
        assert!(node(Cell { x: 0, y: 0, z: 0 }, config(), &mut query).is_err());
        let invalid = TraversalConfig { max_step_cells: 2, ..config() };
        let mut query = world(&[(0, 0, 0), (0, 1, 0)]);
        assert!(node(Cell { x: 0, y: 0, z: 0 }, invalid, &mut query).is_err());
    }
}

/// Revalidate an existing support path using the same node/step law as search.
pub fn path_supported(path: &[Cell], config: TraversalConfig, query: &mut MaterialQuery<'_>) -> Result<bool, String> {
    for cell in path { if node(*cell, config, query)?.is_none() { return Ok(false); } }
    for pair in path.windows(2) {
        let Some(from) = node(pair[0], config, query)? else { return Ok(false); };
        let dx = i32::try_from(i128::from(pair[1].x)-i128::from(pair[0].x)).unwrap_or(2);
        let dy = i32::try_from(i64::from(pair[1].y)-i64::from(pair[0].y)).unwrap_or(2);
        let dz = i32::try_from(i128::from(pair[1].z)-i128::from(pair[0].z)).unwrap_or(2);
        if step(from, dx, dy, dz, config, query)?.is_none() { return Ok(false); }
    }
    Ok(true)
}
