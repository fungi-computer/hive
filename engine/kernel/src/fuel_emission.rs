//! Material-paid admission. No second inventory, work allocator, or clock.
use super::*;

impl Kernel {
    pub(super) fn begin_emission(&mut self, worker: &str, station: &str) -> Result<()> {
        let worker_entity = self.entity(worker)?;
        let station_entity = self.entity(station)?;
        if self.ecs.get::<Body>(worker_entity).is_none()
            || self.ecs.get::<Destination>(worker_entity).is_some()
            || self.direct.contains_key(&worker_entity)
            || self.ecs.get::<ExcavationWork>(worker_entity).is_some() {
            return Err("worker cannot operate emitter from current activity".into());
        }
        let emitter = self.ecs.get::<Emitter>(station_entity).ok_or("station has no emitter capability")?;
        let environment = self.environment.as_ref().ok_or("emitter needs environment")?;
        if environment.paid_emissions.contains_key(station) { return Err("station already has a paid emission".into()); }
        if environment.paid_emissions.len() >= 64 { return Err("paid emission capacity".into()); }
        let definition = environment.emissions.get(&emitter.catalog).ok_or("unknown emission catalog")?.definition().clone();
        let actor = self.world_pose(worker)?;
        let target = self.world_pose(station)?;
        let distance = ((actor.x-target.x).powi(2)+(actor.y-target.y).powi(2)+(actor.z-target.z).powi(2)).sqrt();
        if !distance.is_finite() || distance > 1.5 { return Err("worker is not at emitter contact".into()); }
        if self.ecs.get::<Support>(station_entity).is_some() { return Err("emitter requires terrain placement".into()); }
        let spacing = environment.world.cell_spacing_m();
        // Terrain cells are centered on integer coordinates. Initial placement
        // puts a station on the supporting cell's positive half-face; that
        // boundary belongs to the air cell above, not to the solid support.
        let coordinates = [(target.x / spacing[0] + 0.5).floor(), (target.y / spacing[1] + 0.5).floor(), (target.z / spacing[2] + 0.5).floor()];
        let bounds = environment.world.bounds();
        if !coordinates.iter().all(|value| value.is_finite())
            || coordinates[0] < bounds.min_x as f64 || coordinates[0] >= bounds.max_x as f64
            || coordinates[1] < f64::from(bounds.min_y) || coordinates[1] >= f64::from(bounds.max_y)
            || coordinates[2] < bounds.min_z as f64 || coordinates[2] >= bounds.max_z as f64 {
            return Err("emitter lies outside physical world".into());
        }
        let cell = crate::generation::Cell { x: coordinates[0] as i64, y: coordinates[1] as i32, z: coordinates[2] as i64 };
        let air = environment.atmosphere.as_ref().ok_or("emitter requires atmosphere")?;
        if air.compiled().volume_for_cell(&format!("cell:{},{},{}",cell.x,cell.y,cell.z)).is_none() {
            return Err("emitter has no admitted air receiver".into());
        }
        let mut lots: Vec<_> = self.contents.get(station).into_iter().flatten().filter_map(|entity| {
            let lot = self.ecs.get::<Lot>(*entity)?;
            let id = self.ecs.get::<ExternalId>(*entity)?;
            if lot.container != station || lot.kind != definition.material_kind || lot.quantity == 0
                || self.ecs.get::<LotWater>(*entity).is_some_and(|water| water.water_kg != 0.0) { return None; }
            Some((id.0.clone(), lot.quantity))
        }).collect();
        lots.sort_by(|left, right| left.0.cmp(&right.0));
        let mut remaining = definition.quantity;
        let mut portions = Vec::new();
        for (lot, available) in lots {
            let quantity = available.min(remaining);
            portions.push(MaterialPortion { lot, quantity });
            remaining -= quantity;
            if remaining == 0 { break; }
        }
        if remaining != 0 { return Err("emitter needs dry material supply".into()); }
        let material = self.prepare_material_consumption(&portions)?;
        let source = environment_runtime::PaidEmission { catalog: definition.id, cell, elapsed_s: 0.0, admitted_revision: self.revision };
        // All admission is complete. Both mutations are private and synchronous;
        // the outer Region commits the resulting material and environment records.
        self.publish_material_consumption(material)?;
        self.environment.as_mut().unwrap().paid_emissions.insert(station.to_owned(), source);
        Ok(())
    }
}
