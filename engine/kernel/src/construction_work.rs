use super::*;

impl Kernel {
    fn construction_instance(
        &self,
        site: &str,
        definition: &crate::environment_definition::StructureDefinition,
        x: i64,
        y: i32,
        z: i64,
        orientation: crate::structure_geometry::Cardinal,
    ) -> crate::structure_geometry::StaticInstance {
        use crate::environment_definition::StructureShape;
        use crate::structure_geometry::StaticInstance;
        match &definition.shape {
            StructureShape::Floor => StaticInstance::Floor { id: site.into(), support: crate::generation::Cell { x, y, z } },
            StructureShape::Wall { height } => StaticInstance::Wall { id: site.into(), base: crate::generation::Cell { x, y, z }, height: *height },
            StructureShape::Stair { run, rise } => StaticInstance::Stair { id: site.into(), origin: crate::generation::Cell { x, y, z }, orientation, run: *run, rise: *rise },
        }
    }
    fn contact_candidates(&self, site: &ConstructionSite, definition: &crate::environment_definition::StructureDefinition, spacing: [f64; 3]) -> Vec<[f64; 3]> {
        let origin = [site.x as f64 * spacing[0], (f64::from(site.y) + 0.5) * spacing[1], site.z as f64 * spacing[2]];
        let mut candidates = vec![origin];
        if let crate::environment_definition::StructureShape::Stair { run, rise } = &definition.shape {
            let (dx, dz) = match site.orientation {
                crate::structure_geometry::Cardinal::North => (0, -1),
                crate::structure_geometry::Cardinal::East => (1, 0),
                crate::structure_geometry::Cardinal::South => (0, 1),
                crate::structure_geometry::Cardinal::West => (-1, 0),
            };
            candidates.push([
                (site.x + i64::from(dx) * i64::from(*run)) as f64 * spacing[0],
                (f64::from(site.y) + 0.5 + f64::from(*rise)) * spacing[1],
                (site.z + i64::from(dz) * i64::from(*run)) as f64 * spacing[2],
            ]);
        }
        candidates
    }
    fn contact_is_valid(&self, site: &ConstructionSite, definition: &crate::environment_definition::StructureDefinition, position: [f64; 3], spacing: [f64; 3]) -> bool {
        self.contact_candidates(site, definition, spacing).into_iter().any(|candidate| {
            let distance = ((position[0] - candidate[0]).powi(2) + (position[1] - candidate[1]).powi(2) + (position[2] - candidate[2]).powi(2)).sqrt();
            distance.is_finite() && distance <= 1.5
        })
    }
    pub(super) fn validate_construction_sites(&self) -> Result<()> {
        let Some(environment) = &self.environment else { return Ok(()); };
        let mut workers = BTreeSet::new();
        let geometry_instances = environment.world.structure_instances();
        let geometry_ids: BTreeSet<String> = geometry_instances.iter().map(|instance| match instance {
            crate::structure_geometry::StaticInstance::Floor { id, .. }
            | crate::structure_geometry::StaticInstance::Wall { id, .. }
            | crate::structure_geometry::StaticInstance::Stair { id, .. } => id.clone(),
        }).collect();
        for (id, entity) in &self.ids {
            let Some(site) = self.ecs.get::<ConstructionSite>(*entity) else { continue; };
            let definition = environment.structures.get(&site.catalog).ok_or("construction site catalog binding is missing")?;
            if self.ecs.get::<Container>(*entity).is_none() || self.ecs.get::<Position>(*entity).is_none()
                || !site.seconds.is_finite() || site.seconds < 0.0 || site.contact_x.is_nan() || site.contact_y.is_nan() || site.contact_z.is_nan() {
                return Err(format!("invalid construction site {id}"));
            }
            let spacing = environment.world.cell_spacing_m();
            if !self.contact_is_valid(site, definition, [site.contact_x, site.contact_y, site.contact_z], spacing) {
                return Err(format!("construction site {id} has invalid work contact"));
            }
            if site.phase != ConstructionPhase::Finished && self.ecs.get::<SealedContainer>(*entity).is_some() {
                return Err("unfinished construction site cannot be sealed".into());
            }
            match site.phase {
                ConstructionPhase::Finished => {
                    let expected = self.construction_instance(id, definition, site.x, site.y, site.z, site.orientation);
                    if self.ecs.get::<SealedContainer>(*entity).is_none() || site.worker.is_some()
                        || site.seconds != definition.work_seconds
                        || !geometry_instances.iter().any(|instance| instance == &expected) { return Err("finished construction linkage is invalid".into()); }
                }
                ConstructionPhase::Planned => if site.worker.is_some() || geometry_ids.contains(id) { return Err("planned construction progress is invalid".into()); },
                ConstructionPhase::Working => {
                    let worker = site.worker.as_ref().ok_or("working construction lacks worker")?;
                    let worker_entity = self.entity(worker)?;
                    if self.ecs.get::<Body>(worker_entity).is_none() || self.ecs.get::<Container>(worker_entity).is_none() || geometry_ids.contains(id) || !workers.insert(worker.clone()) {
                        return Err("construction worker linkage is invalid".into());
                    }
                }
            }
            if site.seconds > definition.work_seconds { return Err("construction progress exceeds catalog work".into()); }
            let position = self.ecs.get::<Position>(*entity).ok_or("construction site lacks position")?;
            if position.x != site.contact_x || position.y != site.contact_y || position.z != site.contact_z {
                return Err("construction site position/contact mismatch".into());
            }
            let capacity = definition.materials.values().try_fold(0u32, |sum, quantity| sum.checked_add(*quantity)).ok_or("construction material capacity overflow")?;
            if self.ecs.get::<Container>(*entity).is_some_and(|container| container.capacity != capacity) {
                return Err("construction site capacity mismatch".into());
            }
            if site.phase == ConstructionPhase::Finished && !self.construction_materials_ready(id, definition) {
                return Err("finished construction materials are incomplete".into());
            }
        }
        Ok(())
    }
    pub(super) fn plan_construction(&mut self, catalog: String, site: String, x: i64, y: i32, z: i64, orientation: crate::structure_geometry::Cardinal, contact: Point) -> Result<()> {
        if self.ids.len() >= 16384 || !crate::components::valid_id(&site) || self.known.contains(&site) { return Err("invalid or duplicate construction site".into()); }
        if contact.frame.is_some() || ![contact.x, contact.y, contact.z].iter().all(|value| value.is_finite()) { return Err("construction contact must be finite terrain position".into()); }
        let environment = self.environment.as_ref().ok_or("construction needs environment")?;
        let definition = environment.structures.get(&catalog).ok_or("unknown construction catalog")?.clone();
        let instance = self.construction_instance(&site, &definition, x, y, z, orientation);
        crate::structure_geometry::StaticGeometry::new(environment.world.bounds(), vec![instance])?;
        let spacing = environment.world.cell_spacing_m();
        let staged = ConstructionSite { catalog, x, y, z, orientation, contact_x: contact.x, contact_y: contact.y, contact_z: contact.z, worker: None, seconds: 0.0, phase: ConstructionPhase::Planned };
        if !self.contact_is_valid(&staged, &definition, [contact.x, contact.y, contact.z], spacing) { return Err("construction contact is not adjacent to footprint".into()); }
        let capacity = definition.materials.values().try_fold(0u32, |sum, quantity| sum.checked_add(*quantity)).ok_or("construction material capacity overflow")?;
        let position = Position { x: contact.x, y: contact.y, z: contact.z, facing: 0.0 };
        let added = site.len() + 128 + self.registry.weight("hive.position", &record(&position))
            + self.registry.weight("hive.container", &record(&Container { capacity }))
            + self.registry.weight("hive.construction-site", &record(&staged));
        if self.state_weight.saturating_add(added) > STATE_BYTES { return Err("region canonical state capacity".into()); }
        let entity = self.ecs.spawn((ExternalId(site.clone()), position, Container { capacity }, staged)).id();
        self.ids.insert(site.clone(), entity); self.known.insert(site.clone()); self.contents.insert(site, BTreeSet::new()); self.state_weight += added;
        Ok(())
    }
    pub(super) fn attend_construction(&mut self, worker: &str, site: &str) -> Result<()> {
        let worker_entity = self.entity(worker)?;
        let site_entity = self.entity(site)?;
        let mut state = self.ecs.get::<ConstructionSite>(site_entity).cloned().ok_or("not a construction site")?;
        if self.ecs.get::<SealedContainer>(site_entity).is_some() || state.phase == ConstructionPhase::Finished { return Err("construction site is finished".into()); }
        if self.ecs.get::<Body>(worker_entity).is_none() || self.ecs.get::<Container>(worker_entity).is_none() || self.ecs.get::<Traversal>(worker_entity).is_none() || self.ecs.get::<Support>(worker_entity).is_some()
            || self.direct.contains_key(&worker_entity) || self.ecs.get::<Destination>(worker_entity).is_some() || self.ecs.get::<ExcavationWork>(worker_entity).is_some() {
            return Err("worker cannot attend construction from current state".into());
        }
        if state.worker.as_deref().is_some_and(|assigned| assigned != worker) { return Err("construction site already has a worker".into()); }
        for (other, entity) in &self.ids {
            if other != site && self.ecs.get::<ConstructionSite>(*entity).is_some_and(|candidate| candidate.worker.as_deref() == Some(worker)) { return Err("worker already attends construction".into()); }
        }
        let definition = self.environment.as_ref().ok_or("construction needs environment")?.structures.get(&state.catalog).ok_or("construction catalog binding is missing")?.clone();
        let spacing = self.environment.as_ref().unwrap().world.cell_spacing_m();
        let position = self.world_pose(worker)?;
        if !self.contact_is_valid(&state, &definition, [position.x, position.y, position.z], spacing) { return Err("worker is not at construction contact".into()); }
        state.worker = Some(worker.into()); state.phase = ConstructionPhase::Working;
        let old_weight = self.registry.weight("hive.construction-site", &record(self.ecs.get::<ConstructionSite>(site_entity).ok_or("not a construction site")?));
        let new_weight = self.registry.weight("hive.construction-site", &record(&state));
        if self.state_weight.saturating_sub(old_weight).saturating_add(new_weight) > STATE_BYTES { return Err("region canonical state capacity".into()); }
        self.ecs.entity_mut(site_entity).insert(state); self.refresh_state_weight(); Ok(())
    }
    fn construction_materials_ready(&self, site: &str, definition: &crate::environment_definition::StructureDefinition) -> bool {
        definition.materials.iter().all(|(kind, required)| {
            self.contents.get(site).into_iter().flatten().filter_map(|entity| {
                let lot = self.ecs.get::<Lot>(*entity)?;
                if lot.kind != *kind || lot.container != site || self.ecs.get::<LotWater>(*entity).is_some_and(|water| water.water_kg > 0.0) { return None; }
                Some(u64::from(lot.quantity))
            }).sum::<u64>() >= u64::from(*required)
        })
    }
    fn complete_construction(&mut self, site_id: &str, state: &ConstructionSite) -> Result<bool> {
        let definition = self.environment.as_ref().ok_or("construction needs environment")?.structures.get(&state.catalog).ok_or("construction catalog binding is missing")?.clone();
        let instance = self.construction_instance(site_id, &definition, state.x, state.y, state.z, state.orientation);
        let prepared = {
            let environment = self.environment.as_mut().ok_or("construction needs environment")?;
            let mut instances = environment.world.structure_instances();
            instances.push(instance);
            match environment.world.prepare_structures(instances) {
                Ok(Ok(prepared)) => prepared,
                Ok(Err(_)) => return Ok(false),
                Err(reason) if reason == "structure overlaps solid terrain"
                    || reason == "duplicate structure bulk occupied cell" => return Ok(false),
                Err(reason) => return Err(reason),
            }
        };
        if self.structure_contact_problem(&prepared)?.is_some() { return Ok(false); }
        let site_entity = self.entity(site_id)?;
        if self.ecs.get::<SealedContainer>(site_entity).is_some() { return Ok(false); }
        let marker_weight = self.registry.weight("hive.sealed-container", &record(&SealedContainer {}));
        if self.state_weight.saturating_add(marker_weight) > STATE_BYTES { return Ok(false); }
        self.environment.as_mut().ok_or("construction needs environment")?.world.apply_structures(prepared)?;
        let mut finished = state.clone();
        finished.phase = ConstructionPhase::Finished;
        finished.worker = None;
        self.ecs.entity_mut(site_entity).insert((finished, SealedContainer {}));
        self.state_weight += marker_weight;
        Ok(true)
    }
    pub(super) fn advance_construction(&mut self, delta: f64) -> Result<()> {
        if delta == 0.0 { return Ok(()); }
        let mut query = self.ecs.query::<(&ExternalId, &ConstructionSite)>();
        let mut pending: Vec<_> = query.iter(&self.ecs).map(|(id, site)| (id.0.clone(), site.clone())).collect();
        pending.sort_by(|left, right| left.0.cmp(&right.0));
        for (site_id, mut state) in pending {
            if state.phase != ConstructionPhase::Working { continue; }
            let worker_id = state.worker.clone().ok_or("working construction lacks worker")?;
            let worker = self.entity(&worker_id)?;
            if self.direct.contains_key(&worker) || self.ecs.get::<Destination>(worker).is_some()
                || self.ecs.get::<ExcavationWork>(worker).is_some() || self.ecs.get::<Support>(worker).is_some() { continue; }
            let definition = self.environment.as_ref().ok_or("construction needs environment")?.structures.get(&state.catalog).ok_or("construction catalog binding is missing")?.clone();
            let spacing = self.environment.as_ref().unwrap().world.cell_spacing_m();
            let pose = self.world_pose(worker_id.as_str())?;
            if !self.contact_is_valid(&state, &definition, [pose.x, pose.y, pose.z], spacing) || !self.construction_materials_ready(&site_id, &definition) { continue; }
            state.seconds = earned_work_seconds(state.seconds, delta, definition.work_seconds)?;
            self.ecs.entity_mut(self.entity(&site_id)?).insert(state.clone());
            if state.seconds < definition.work_seconds { continue; }
            let _ = self.complete_construction(&site_id, &state)?;
        }
        self.refresh_state_weight();
        Ok(())
    }
}
