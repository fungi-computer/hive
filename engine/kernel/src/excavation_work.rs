//! Native timed excavation. Requests select intent; only advancement earns time.
use super::*;
use crate::{generation::Cell, terrain_water::ExcavationResult};

fn cell(work: ExcavationWork) -> Cell {
    Cell { x: i64::from(work.x), y: work.y, z: i64::from(work.z) }
}
fn same_target(a: ExcavationWork, b: ExcavationWork) -> bool {
    a.x == b.x && a.y == b.y && a.z == b.z && a.expected == b.expected && a.replacement == b.replacement
}
/// The same contact rule filters prospective approaches and earns native work.
pub(super) fn within_reach(position: [f64; 3], target: Cell, spacing: [f64; 3]) -> bool {
    let at = [target.x as f64 * spacing[0], f64::from(target.y) * spacing[1], target.z as f64 * spacing[2]];
    position.into_iter().zip(at).map(|(a, b)| (a - b).powi(2)).sum::<f64>() <= 1.5_f64.powi(2)
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

    fn terrain_support_reserved(&self, target: Cell) -> bool {
        // A moving actor owns its admitted contact path until it arrives or
        // cancels. Excavation may be admitted while that path is in use, but
        // it earns no work and cannot publish a terrain mutation until the
        // route releases the support.
        self.terrain_routes
            .values()
            .any(|route| !route.suspended && route.path.contains(&target))
    }

    pub(super) fn request_excavation_for_attempt(&mut self, id: &str, work: ExcavationWork) -> Result<()> {
        let task_entity = self.entity(id)?;
        let attempt = self.ecs.get::<WorkAttempt>(task_entity).ok_or("excavation requires a work attempt")?;
        let actor = self.entity(&attempt.worker)?;
        if self.ecs.get::<Body>(actor).is_none() { return Err("excavation needs a worker body".into()); }
        if self.ecs.get::<Support>(actor).is_some() || self.direct.contains_key(&actor) { return Err("excavation requires terrain contact".into()); }
        if self.terrain_support_occupied(cell(work))? { return Err("excavation target supports a standing actor".into()); }
        let environment = self.environment.as_mut().ok_or("world has no environment")?;
        if !environment.excavation_rules.contains_key(&work.expected) || !environment.world.is_open_material(work.replacement) || work.expected == work.replacement || environment.world.material(cell(work))? != work.expected { return Err("excavation target is unavailable".into()); }
        if let Some(existing) = self.ecs.get::<ExcavationWork>(task_entity) { return if same_target(*existing, work) { Ok(()) } else { Err("task already has different excavation work".into()) }; }
        let added = self.registry.weight("hive.excavation-work", &record(&work));
        if self.state_weight.saturating_add(added) > STATE_BYTES { return Err("region canonical state capacity".into()); }
        self.ecs.entity_mut(task_entity).insert(work);
        self.state_weight += added;
        Ok(())
    }

    pub(super) fn validate_excavation_work(&mut self) -> Result<()> {
        let mut query = self.ecs.query::<(Entity, &ExternalId, &ExcavationWork)>();
        let saved: Vec<_> = query.iter(&self.ecs).map(|(entity, _id, work)| (entity, *work)).collect();
        for (task_entity, work) in saved {
            let Some(attempt) = self.ecs.get::<WorkAttempt>(task_entity) else {
                let environment = self.environment.as_mut().ok_or("saved work needs environment")?;
                if environment.world.material(cell(work))? != work.expected { return Err("saved excavation target changed".into()); }
                continue;
            };
            if !matches!(&attempt.phase, AttemptPhase::Executing { activity: crate::work_attempt::ActivityRef::Excavation { .. }, .. }) { continue; }
            let actor_id = attempt.worker.clone();
            let actor = self.entity(&actor_id)?;
            if self.ecs.get::<Body>(actor).is_none() {
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
            let task_entity = self.entity(&id)?;
            let Some(attempt) = self.ecs.get::<WorkAttempt>(task_entity) else { continue; };
            if !matches!(&attempt.phase, AttemptPhase::Executing { activity: crate::work_attempt::ActivityRef::Excavation { .. }, .. }) { continue; }
            let actor_id = attempt.worker.clone();
            let actor = self.entity(&actor_id)?;
            // Routing retains saved work but earns no effort while travelling.
            if self.ecs.get::<Destination>(actor).is_some() { continue; }
            if self.direct.contains_key(&actor) {
                let attempt = self.ecs.get::<WorkAttempt>(task_entity).cloned().ok_or("work attempt component is missing")?;
                if let AttemptPhase::Executing { operation, activity } = attempt.phase {
                    self.settle_attempt(&id, AttemptPhase::Outcome { operation, activity, result: WorkOutcome::Blocked { reason: WorkBlockReason::WorkerUnavailable } })?;
                }
                continue;
            }
            if self.ecs.get::<Support>(actor).is_some() {
                let attempt = self.ecs.get::<WorkAttempt>(task_entity).cloned().ok_or("work attempt component is missing")?;
                if let AttemptPhase::Executing { operation, activity } = attempt.phase {
                    self.settle_attempt(&id, AttemptPhase::Outcome { operation, activity, result: WorkOutcome::Blocked { reason: WorkBlockReason::AccessLost } })?;
                }
                continue;
            }
            let pose = self.world_pose_entity(actor, 0)?;
            if self.terrain_support_reserved(cell(work)) { continue; }
            if self.terrain_support_occupied(cell(work))? {
                let attempt = self.ecs.get::<WorkAttempt>(task_entity).cloned().ok_or("work attempt component is missing")?;
                if let AttemptPhase::Executing { operation, activity } = attempt.phase {
                    self.settle_attempt(&id, AttemptPhase::Outcome { operation, activity, result: WorkOutcome::Blocked { reason: WorkBlockReason::AccessLost } })?;
                }
                continue;
            }
            let environment = self.environment.as_mut().ok_or("saved work needs environment")?;
            if environment.world.material(cell(work))? != work.expected {
                let attempt = self.ecs.get::<WorkAttempt>(task_entity).cloned().ok_or("work attempt component is missing")?;
                if let AttemptPhase::Executing { operation, activity } = attempt.phase {
                    self.settle_attempt(&id, AttemptPhase::Outcome { operation, activity, result: WorkOutcome::Blocked { reason: WorkBlockReason::AccessLost } })?;
                }
                continue;
            }
            let rule = environment.excavation_rules.get(&work.expected).ok_or("saved work has no material rule")?;
            let required = rule.work_seconds;
            let spacing = environment.world.cell_spacing_m();
            if !within_reach([pose.x, pose.y, pose.z], cell(work), spacing) {
                let attempt = self.ecs.get::<WorkAttempt>(task_entity).cloned().ok_or("work attempt component is missing")?;
                if let AttemptPhase::Executing { operation, activity } = attempt.phase {
                    self.settle_attempt(&id, AttemptPhase::Outcome { operation, activity, result: WorkOutcome::Blocked { reason: WorkBlockReason::AccessLost } })?;
                }
                continue;
            }
            work.seconds = super::earned_work_seconds(work.seconds, delta, required)?;
            self.ecs.entity_mut(task_entity).insert(work);
            if work.seconds < required { continue; }
            let prepared = match self.environment.as_mut().unwrap().world.prepare_excavation(cell(work), work.expected, work.replacement)? {
                ExcavationResult::Prepared(prepared) => prepared,
                ExcavationResult::TerrainBlocked(_) | ExcavationResult::WaterBlocked(_) | ExcavationResult::StructuresBlocked(_) => {
                    let attempt = self.ecs.get::<WorkAttempt>(task_entity).cloned().ok_or("work attempt component is missing")?;
                    if let AttemptPhase::Executing { operation, activity } = attempt.phase {
                        self.settle_attempt(&id, AttemptPhase::Outcome { operation, activity, result: WorkOutcome::Blocked { reason: WorkBlockReason::AccessLost } })?;
                    }
                    continue;
                },
            };
            // Capacity/geometry admission failure leaves earned work available for retry.
            let owner_party = self.ecs.get::<OwnedByParty>(task_entity).map(|owner| owner.party.clone());
            match self.complete_excavation_at(prepared, material_output::MaterialOutputLocation::Ground {
                position: Position { x: pose.x, y: pose.y, z: pose.z, facing: pose.facing },
                owner_party,
            }) {
                Ok(Some(_)) => {
                    self.ecs.entity_mut(task_entity).remove::<ExcavationWork>();
                    self.refresh_state_weight();
                    if let Some(attempt) = self.ecs.get::<WorkAttempt>(task_entity).cloned() {
                        if let AttemptPhase::Executing { operation, activity } = attempt.phase {
                            self.settle_attempt(&id, AttemptPhase::Outcome { operation, activity, result: WorkOutcome::Completed })?;
                        }
                    }
                }
                Ok(None) => {},
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
        kernel.load(&json!({"format":"hive-game","version":1,"game":"work-test","components":[],"initial":[
            {"id":"party","components":{"hive.party":{"ownerPlayer":"player"}}},
            {"id":"task","components":{"hive.owned-by-party":{"party":"party"}}},
            {"id":"worker","components":{"hive.position":{"x":0,"y":0,"z":0,"facing":0},"hive.body":{"speed":1},"hive.container":{"capacity":10},"hive.party-member":{"party":"party"}}}
        ]}).to_string()).unwrap();
        let mut definition: serde_json::Value = serde_json::from_str(&crate::environment_definition::tests::fixture("timed-work")).unwrap();
        definition["materialVolumes"].as_array_mut().unwrap().push(json!({"kind":"spoil","unitVolume":1}));
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
    fn begin_excavation(kernel: &mut Kernel, work: ExcavationWork) {
        let position = *kernel.ecs.get::<Position>(kernel.entity("worker").unwrap()).unwrap();
        let key = kernel.begin_work_attempt("task".into(), "worker".into(), "party".into(), crate::work_attempt::ActivityRef::Route { destination: Point { x: position.x, y: position.y, z: position.z, frame: None } }).unwrap();
        kernel.advance_json(r#"{"delta":0,"writes":[],"actions":[]}"#).unwrap();
        kernel.continue_work_attempt("task".into(), key.generation, 1, crate::work_attempt::ActivityRef::Excavation { cell: [work.x, work.y, work.z], expected_material: work.expected, replacement_material: work.replacement }).unwrap();
    }

    #[test]
    fn task_owned_excavation_progress_is_unique_and_survives_save() {
        let (mut kernel, work) = fixture();
        begin_excavation(&mut kernel, work);
        kernel.advance_excavation(1.0).unwrap();
        let task = kernel.entity("task").unwrap();
        assert_eq!(kernel.ecs.get::<ExcavationWork>(task).unwrap().seconds, 1.0);
        let saved = kernel.save_records().unwrap();
        let mut restored = Kernel::new();
        restored.restore_records(&saved).unwrap();
        assert_eq!(restored.ecs.get::<ExcavationWork>(restored.entity("task").unwrap()).unwrap().seconds, 1.0);
    }

    #[test]
    fn task_without_attempt_does_not_advance_or_mutate_terrain() {
        let (mut kernel, work) = fixture();
        let task = kernel.entity("task").unwrap();
        kernel.ecs.entity_mut(task).insert(work);
        let before = kernel.environment.as_mut().unwrap().world.material(cell(work)).unwrap();
        kernel.advance_excavation(10.0).unwrap();
        assert_eq!(kernel.ecs.get::<ExcavationWork>(task).unwrap().seconds, 0.0);
        assert_eq!(kernel.environment.as_mut().unwrap().world.material(cell(work)).unwrap(), before);
    }

    #[test]
    fn excavation_losing_contact_settles_attempt_and_retains_progress() {
        let (mut kernel, work) = fixture();
        begin_excavation(&mut kernel, work);
        let worker = kernel.entity("worker").unwrap();
        kernel.ecs.get_mut::<Position>(worker).unwrap().x += 10.0;
        kernel.advance_excavation(1.0).unwrap();
        let attempt = kernel.ecs.get::<WorkAttempt>(kernel.entity("task").unwrap()).unwrap();
        assert!(matches!(attempt.phase, AttemptPhase::Outcome { result: WorkOutcome::Blocked { reason: WorkBlockReason::AccessLost }, .. }));
        assert!(kernel.ecs.get::<ExcavationWork>(kernel.entity("task").unwrap()).is_some());
    }

}
