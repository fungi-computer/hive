//! Native timed deconstruction progress and exactly-once physical completion.
use super::*;

impl Kernel {
    pub(super) fn request_deconstruction_for_attempt(&mut self, task: &str, site: String, contact: Point, required_seconds: f64) -> Result<()> {
        if !required_seconds.is_finite() || required_seconds < 0.0 { return Err("invalid deconstruction duration".into()); }
        let task_entity = self.entity(task)?;
        let attempt = self.ecs.get::<WorkAttempt>(task_entity).ok_or("deconstruction requires a work attempt")?;
        let site_entity = self.entity(&site)?;
        let owner = self.ecs.get::<OwnedByParty>(site_entity).ok_or("deconstruction site has no party owner")?;
        if owner.party != attempt.party { return Err("deconstruction continuation party mismatch".into()); }
        let work = DeconstructionWork { site, contact_x: contact.x, contact_y: contact.y, contact_z: contact.z, seconds: 0.0, required_seconds };
        if let Some(existing) = self.ecs.get::<DeconstructionWork>(task_entity) {
            if existing.site != work.site || existing.contact_x != work.contact_x || existing.contact_y != work.contact_y || existing.contact_z != work.contact_z || existing.required_seconds != work.required_seconds { return Err("task already has different deconstruction work".into()); }
        } else {
            self.ecs.entity_mut(task_entity).insert(work);
            self.refresh_state_weight();
        }
        Ok(())
    }

    pub(super) fn advance_deconstruction(&mut self, delta: f64) -> Result<()> {
        if delta <= 0.0 { return Ok(()); }
        let mut query = self.ecs.query::<(&ExternalId, &DeconstructionWork)>();
        let pending: Vec<_> = query.iter(&self.ecs).map(|(id, work)| (id.0.clone(), *work)).collect();
        for (task, mut work) in pending {
            let task_entity = self.entity(&task)?;
            let Some(attempt) = self.ecs.get::<WorkAttempt>(task_entity).cloned() else { continue; };
            let AttemptPhase::Executing { operation, activity: ActivityRef::Deconstruction { site, contact } } = attempt.phase else { continue; };
            if site != work.site || contact.x != work.contact_x || contact.y != work.contact_y || contact.z != work.contact_z { continue; }
            let worker = self.entity(&attempt.worker)?;
            if self.ecs.get::<Destination>(worker).is_some() || self.ecs.get::<Support>(worker).is_some() { continue; }
            let pose = self.world_pose(&attempt.worker)?;
            if (pose.x - contact.x).powi(2) + (pose.y - contact.y).powi(2) + (pose.z - contact.z).powi(2) > 1.5_f64.powi(2) { continue; }
            work.seconds = super::earned_work_seconds(work.seconds, delta, work.required_seconds)?;
            self.ecs.entity_mut(task_entity).insert(work);
            if work.seconds < work.required_seconds { continue; }
            match self.deconstruct_construction(&attempt.worker, &work.site) {
                Ok(()) => {
                    self.ecs.entity_mut(task_entity).remove::<DeconstructionWork>();
                    self.refresh_state_weight();
                    self.settle_attempt(&task, AttemptPhase::Outcome { operation, activity: ActivityRef::Deconstruction { site: work.site, contact }, result: WorkOutcome::Completed })?;
                }
                Err(reason) if reason.contains("capacity") || reason.contains("geometry") || reason.contains("contact") => {}
                Err(reason) => return Err(reason),
            }
        }
        Ok(())
    }
}

