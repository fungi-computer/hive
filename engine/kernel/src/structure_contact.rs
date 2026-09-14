//! Construction admission protects current feet/headroom and the active movement
//! edge. A future route is intent, not occupied space; ordinary route invalidation
//! handles its changed geometry after publication.
use super::*;
use crate::generation::Cell;
use crate::terrain_traversal::{self, TraversalConfig};
use crate::terrain_water::PreparedStructureChange;

impl Kernel {
    pub(super) fn structure_contact_blocked_actors(
        &mut self,
        prepared: &PreparedStructureChange,
    ) -> Result<Vec<String>> {
        let spacing = self.environment.as_ref().ok_or("construction needs environment")?
            .world.cell_spacing_m();
        let stairs = self.environment.as_ref().ok_or("construction needs environment")?
            .world.stair_edges().to_vec();
        let mut query = self.ecs.query::<(Entity, &ExternalId, &Body, &Position)>();
        let mut actors: Vec<_> = query.iter(&self.ecs)
            .map(|(entity, id, _, position)| (id.0.clone(), entity, *position)).collect();
        actors.sort_by(|a, b| a.0.cmp(&b.0));
        let mut blocked = Vec::new();
        for (id, entity, position) in actors {
            // Terrain and moving-deck contact are different capabilities. A
            // combined terrain/deck world needs an explicit volume witness;
            // do not silently treat a deck passenger as standing on terrain.
            if self.ecs.get::<Support>(entity).is_some() {
                blocked.push(id);
                continue;
            }
            let capability = self.ecs.get::<Traversal>(entity)
                .ok_or("terrain construction actor lacks traversal capability")?;
            let config = TraversalConfig {
                spacing, clearance_cells: capability.clearance_cells,
                max_step_cells: capability.max_step_cells,
            };
            let occupied = if let Some(state) = self.terrain_routes.get(&entity) {
                self.validate_terrain_route_witness(entity)?;
                let points = crate::terrain_route::waypoints_with_stairs(&state.path, config, &stairs)?;
                let remaining = self.routes.get(&entity).ok_or("missing occupied route")?.len();
                let next = points.len().checked_sub(remaining).ok_or("invalid occupied route progress")?;
                let active = crate::terrain_route::active_support_index_with_stairs(&state.path, next, &stairs)?;
                let end = state.path[active + 1];
                let end_pose = [end.x as f64 * spacing[0],
                    (f64::from(end.y) + 0.5) * spacing[1], end.z as f64 * spacing[2]];
                if [position.x, position.y, position.z] == end_pose {
                    vec![end]
                } else {
                    state.path[active..=active + 1].to_vec()
                }
            } else {
                let raw = [position.x / spacing[0], position.y / spacing[1] - 0.5,
                    position.z / spacing[2]];
                if raw.iter().any(|value| !value.is_finite() || (value - value.round()).abs() > 1e-7) {
                    blocked.push(id);
                    continue;
                }
                if raw[0].abs() > 9_007_199_254_740_991.0 || raw[2].abs() > 9_007_199_254_740_991.0
                    || raw[1] < f64::from(i32::MIN) || raw[1] > f64::from(i32::MAX) {
                    return Err("construction contact coordinate out of range".into());
                }
                vec![Cell { x: raw[0].round() as i64, y: raw[1].round() as i32,
                    z: raw[2].round() as i64 }]
            };
            let environment = self.environment.as_mut().ok_or("construction needs environment")?;
            let mut candidate = |at| environment.world.prepared_traversal_material(prepared, at);
            let boundary_blocked = occupied.windows(2).any(|pair| pair[0].y == pair[1].y && prepared.blocks_crossing(pair[0], pair[1]).unwrap_or(true));
            if boundary_blocked || !terrain_traversal::path_supported_with_stairs(&occupied, config, &mut candidate, &stairs)? {
                blocked.push(id);
            }
        }
        Ok(blocked)
    }

    pub(super) fn structure_contact_problem(
        &mut self,
        prepared: &PreparedStructureChange,
    ) -> Result<Option<String>> {
        Ok(self.structure_contact_blocked_actors(prepared)?.into_iter().next()
            .map(|id| format!("construction would obstruct {id}")))
    }
}
