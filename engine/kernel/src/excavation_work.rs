//! Native timed excavation. Requests select intent; only advancement earns time.
use super::*;
use crate::{generation::Cell, terrain_water::ExcavationResult};

fn cell(work: ExcavationWork) -> Cell {
    Cell { x: i64::from(work.x), y: work.y, z: i64::from(work.z) }
}
fn same_target(a: ExcavationWork, b: ExcavationWork) -> bool {
    a.x == b.x && a.y == b.y && a.z == b.z && a.expected == b.expected && a.replacement == b.replacement
}
impl Kernel {
    fn terrain_support_occupied(&mut self, target: Cell) -> Result<bool> {
        let spacing = self.environment.as_ref().ok_or("world has no environment")?.world.cell_spacing_m();
        let mut query = self.ecs.query::<(Entity, &Body, &Position)>();
        for (entity, _, position) in query.iter(&self.ecs) {
            if self.ecs.get::<Support>(entity).is_some() { continue; }
            let values = [position.x / spacing[0], position.y / spacing[1] - 0.5, position.z / spacing[2]];
            if !values.iter().all(|value| value.is_finite()) { return Err("invalid standing terrain pose".into()); }
            let cell = Cell { x: values[0].round() as i64, y: values[1].round() as i32, z: values[2].round() as i64 };
            if cell == target { return Ok(true); }
        }
        Ok(false)
    }

    pub(super) fn request_excavation(&mut self, id: &str, work: ExcavationWork) -> Result<()> {
        let actor = self.entity(id)?;
        if self.ecs.get::<Body>(actor).is_none() || self.ecs.get::<Container>(actor).is_none() {
            return Err("excavation needs a worker with carrying capacity".into());
        }
        if self.ecs.get::<Support>(actor).is_some() || self.direct.contains_key(&actor) {
            return Err("excavation requires terrain contact".into());
        }
        if self.terrain_support_occupied(cell(work))? {
            return Err("excavation target supports a standing actor".into());
        }
        let environment = self.environment.as_mut().ok_or("world has no environment")?;
        if !environment.excavation_rules.contains_key(&work.expected) || !environment.world.is_open_material(work.replacement) || work.expected == work.replacement
            || environment.world.material(cell(work))? != work.expected {
            return Err("excavation target is unavailable".into());
        }
        if let Some(existing) = self.ecs.get::<ExcavationWork>(actor) {
            return if same_target(*existing, work) { Ok(()) } else { Err("worker already has excavation work".into()) };
        }
        let added = self.registry.weight("hive.excavation-work", &record(&work));
        if self.state_weight.saturating_add(added) > STATE_BYTES { return Err("region canonical state capacity".into()); }
        self.ecs.entity_mut(actor).insert(work);
        self.state_weight += added;
        Ok(())
    }

    pub(super) fn validate_excavation_work(&mut self) -> Result<()> {
        let mut query = self.ecs.query::<(Entity, &ExcavationWork)>();
        let saved: Vec<_> = query.iter(&self.ecs).map(|(entity, work)| (entity, *work)).collect();
        for (actor, work) in saved {
            if self.ecs.get::<Body>(actor).is_none() || self.ecs.get::<Container>(actor).is_none() {
                return Err("saved excavation lacks worker capabilities".into());
            }
            let environment = self.environment.as_mut().ok_or("saved excavation lacks environment")?;
            let rule = environment.excavation_rules.get(&work.expected).ok_or("saved excavation lacks material rule")?;
            if work.seconds > rule.work_seconds || !environment.world.is_open_material(work.replacement)
                || work.expected == work.replacement || environment.world.material(cell(work))? != work.expected
                || self.direct.contains_key(&actor) || self.ecs.get::<Support>(actor).is_some() {
                return Err("invalid saved excavation progress or replacement".into());
            }
        }
        Ok(())
    }

    pub(super) fn advance_excavation(&mut self, delta: f64) -> Result<()> {
        if delta == 0.0 { return Ok(()); }
        // ECS membership finds working actors; map order stabilizes competing completions.
        let mut query = self.ecs.query::<(&ExternalId, &ExcavationWork)>();
        let mut pending: Vec<_> = query.iter(&self.ecs).map(|(id, work)| (id.0.clone(), *work)).collect();
        pending.sort_by(|a, b| a.0.cmp(&b.0));
        for (id, mut work) in pending {
            let actor = self.entity(&id)?;
            // Routing retains saved work but earns no effort while travelling.
            if self.direct.contains_key(&actor) || self.ecs.get::<Destination>(actor).is_some() { continue; }
            let pose = self.world_pose_entity(actor, 0)?;
            if self.terrain_support_occupied(cell(work))? { continue; }
            let environment = self.environment.as_mut().ok_or("saved work needs environment")?;
            if environment.world.material(cell(work))? != work.expected {
                self.ecs.entity_mut(actor).remove::<ExcavationWork>();
                self.refresh_state_weight();
                continue;
            }
            let rule = environment.excavation_rules.get(&work.expected).ok_or("saved work has no material rule")?;
            let required = rule.work_seconds;
            let spacing = environment.world.cell_spacing_m();
            let distance = ((pose.x - f64::from(work.x) * spacing[0]).powi(2)
                + (pose.y - f64::from(work.y) * spacing[1]).powi(2)
                + (pose.z - f64::from(work.z) * spacing[2]).powi(2)).sqrt();
            if distance > 1.5 || self.ecs.get::<Support>(actor).is_some() { continue; }
            work.seconds = (work.seconds + delta).min(required);
            self.ecs.entity_mut(actor).insert(work);
            if work.seconds < required { continue; }
            let prepared = match self.environment.as_mut().unwrap().world.prepare_excavation(cell(work), work.expected, work.replacement)? {
                ExcavationResult::Prepared(prepared) => prepared,
                ExcavationResult::TerrainBlocked(_) | ExcavationResult::WaterBlocked(_) => continue,
            };
            // Capacity/geometry admission failure leaves earned work available for retry.
            match self.complete_excavation(prepared, id) {
                Ok(_) => {
                    self.ecs.entity_mut(actor).remove::<ExcavationWork>();
                    self.refresh_state_weight();
                }
                Err(reason) if reason == "material output exceeds container capacity"
                    || reason == "region entity capacity" || reason == "region canonical state capacity" => {}
                Err(reason) => return Err(reason),
            }
        }
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    fn fixture() -> (Kernel, ExcavationWork) {
        let mut kernel = Kernel::new();
        kernel.load(&json!({"format":"hive-game","version":1,"game":"work-test","components":[],"initial":[{"id":"worker","components":{
            "hive.position":{"x":0,"y":0,"z":0,"facing":0},"hive.body":{"speed":1},"hive.container":{"capacity":10}
        }}]}).to_string()).unwrap();
        let mut definition: serde_json::Value = serde_json::from_str(&crate::environment_definition::tests::fixture("timed-work")).unwrap();
        for material in definition["materials"].as_array_mut().unwrap() {
            if material["diggable"] == true { material["excavation"] = json!({"workSeconds":2,"outputKind":"spoil","unitsPerCell":3}); }
        }
        kernel.load_environment(&definition.to_string()).unwrap();
        let wet = kernel.environment.as_ref().unwrap().world.facts().unwrap().cells.into_iter().find(|cell| cell.kind == crate::water::WaterCellKind::Soil).unwrap();
        let work = ExcavationWork {x:wet.at[0],y:wet.at[1],z:wet.at[2],expected:kernel.environment.as_mut().unwrap().world.material(Cell{x:i64::from(wet.at[0]),y:wet.at[1],z:i64::from(wet.at[2])}).unwrap(),replacement:0,seconds:0.0};
        let actor = kernel.entity("worker").unwrap();
        let spacing = kernel.environment.as_ref().unwrap().world.cell_spacing_m();
        kernel.ecs.entity_mut(actor).insert(Position{x:f64::from(work.x)*spacing[0]+1.0,y:f64::from(work.y)*spacing[1],z:f64::from(work.z)*spacing[2],facing:0.0});
        (kernel,work)
    }
    #[test]
    fn repeated_requests_do_not_multiply_work_and_progress_recovers() {
        let (mut kernel,work)=fixture();
        let action=json!({"kind":"excavate","entity":"worker","x":work.x,"y":work.y,"z":work.z,"expected":work.expected,"replacement":0});
        kernel.advance_json(&json!({"delta":1,"writes":[],"actions":[action.clone(),action.clone(),action]}).to_string()).unwrap();
        let actor=kernel.entity("worker").unwrap();
        assert_eq!(kernel.ecs.get::<ExcavationWork>(actor).unwrap().seconds,1.0);
        let records=kernel.save_records().unwrap();
        let mut recovered=Kernel::new(); recovered.restore_records(&records).unwrap();
        recovered.advance_json(r#"{"delta":1,"writes":[],"actions":[]}"#).unwrap();
        assert_eq!(recovered.environment.as_mut().unwrap().world.material(cell(work)).unwrap(),0);
        assert_eq!(recovered.quantity("worker"),3);
        assert!(recovered.ecs.get::<ExcavationWork>(recovered.entity("worker").unwrap()).is_none());
        recovered.advance_json(r#"{"delta":1,"writes":[],"actions":[]}"#).unwrap();
        assert_eq!(recovered.quantity("worker"),3);
    }
    #[test]
    fn work_blocks_direct_control_and_cancel_preserves_material() {
        let (mut kernel, work) = fixture();
        kernel.request_excavation("worker", work).unwrap();
        let result: serde_json::Value = serde_json::from_str(&kernel.advance_json(r#"{"delta":0,"writes":[],"actions":[{"kind":"begin-direct","entity":"worker","stream":"keys"}]}"#).unwrap()).unwrap();
        assert_eq!(result["results"][0]["accepted"], false);
        assert_eq!(kernel.ecs.get::<ExcavationWork>(kernel.entity("worker").unwrap()).unwrap().seconds, 0.0);
        kernel.advance_json(r#"{"delta":0,"writes":[],"actions":[{"kind":"cancel-work","entity":"worker"}]}"#).unwrap();
        assert_eq!(kernel.quantity("worker"), 0);
        assert_eq!(kernel.environment.as_mut().unwrap().world.material(cell(work)).unwrap(), work.expected);
        assert!(kernel.ecs.get::<ExcavationWork>(kernel.entity("worker").unwrap()).is_none());
    }

}
