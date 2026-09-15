use super::*;

#[derive(serde::Serialize)]
#[serde(rename_all = "camelCase")]
struct ConstructionReadinessRow {
    site: String,
    status: &'static str,
    #[serde(skip_serializing_if = "Option::is_none")]
    reason: Option<&'static str>,
}

#[derive(serde::Serialize)]
#[serde(rename_all = "camelCase")]
struct ConstructionAccessContact {
    x: f64,
    y: f64,
    z: f64,
    frame: Option<String>,
    kind: &'static str,
}

#[derive(serde::Serialize)]
#[serde(rename_all = "camelCase")]
struct ConstructionAccessRow {
    site: String,
    support: &'static str,
    materials_ready: bool,
    blocked_actors: Vec<String>,
    contacts: Vec<ConstructionAccessContact>,
}

#[derive(serde::Serialize)]
#[serde(rename_all = "camelCase")]
struct DeconstructionAccessRow {
    site: String,
    removal: &'static str,
    salvage_quantity: u32,
    work_seconds: f64,
    contacts: Vec<ConstructionAccessContact>,
}

fn construction_status(
    kernel: &mut Kernel,
    ids: &[String],
) -> Result<BTreeMap<String, &'static str>> {
    let mut result = BTreeMap::new();
    let mut pending = Vec::new();
    let mut pending_ids = Vec::new();
    for site in ids {
        let Some(entity) = kernel.ids.get(site).copied() else {
            result.insert(site.clone(), "unknown");
            continue;
        };
        let Some(state) = kernel.ecs.get::<ConstructionSite>(entity).cloned() else {
            result.insert(site.clone(), "unknown");
            continue;
        };
        if state.phase == ConstructionPhase::Finished {
            result.insert(site.clone(), "ready");
            continue;
        }
        let definition = kernel.environment.as_ref().ok_or("construction needs environment")?.structures.get(&state.catalog).ok_or("construction catalog binding is missing")?.clone();
        let instance = kernel.construction_instance(site, &definition, state.target)?;
        pending_ids.push(site.clone());
        pending.push(instance);
    }
    if !pending.is_empty() {
        let unsupported: BTreeSet<String> = kernel.environment.as_mut().ok_or("construction needs environment")?.world.construction_support(&pending)?.into_iter().collect();
        for site in pending_ids {
            result.insert(site.clone(), if unsupported.contains(&site) { "waitingForSupport" } else { "ready" });
        }
    }
    Ok(result)
}

impl Kernel {
    pub(super) fn deconstruction_work_requirement(
        &mut self,
        task: &str,
        party: &str,
    ) -> Result<Option<crate::work_planner::WorkRequirement>> {
        let entity = self.entity(task)?;
        let Some(order) = self.ecs.get::<DeconstructionOrder>(entity).cloned() else { return Ok(None); };
        let Some(policy) = self.ecs.get::<crate::work_planner::WorkPolicy>(entity).cloned() else { return Ok(None); };
        let Some(schedule) = self.ecs.get::<crate::work_planner::WorkSchedule>(entity).cloned() else { return Ok(None); };
        if !policy.enabled || policy.party != party || order.status == "complete" || self.work_attempts.contains_key(task) {
            return Ok(None);
        }
        if self.ecs.get::<OwnedByParty>(entity).map(|owner| owner.party.as_str()) != Some(party) { return Ok(None); }
        let rows = self.deconstruction_access_rows(vec![order.site.clone()])?;
        let Some(access) = rows.into_iter().next() else { return Ok(None); };
        if access.removal != "ready" || access.contacts.is_empty() { return Ok(None); }
        Ok(Some(crate::work_planner::WorkRequirement {
            task: task.to_owned(), party: party.to_owned(), priority: policy.priority, schedule,
            contacts: access.contacts.into_iter().map(|contact| Point { x: contact.x, y: contact.y, z: contact.z, frame: contact.frame }).collect(),
            required_worker: None,
            free_capacity_required: access.salvage_quantity,
            operation: crate::work_planner::WorkOperation::Deconstruction { site: order.site },
        }))
    }

    /// Contribute a ready construction task to the shared labor planner.
    ///
    /// Construction owns support, material readiness, and contact discovery;
    /// this method only describes the resulting typed work intent.  It never
    /// selects a worker or creates an attempt.
    pub(super) fn construction_work_requirement(
        &mut self,
        site: &str,
        party: &str,
    ) -> Result<Option<crate::work_planner::WorkRequirement>> {
        self.ensure_ready()?;
        let entity = self.entity(site)?;
        let state = self
            .ecs
            .get::<ConstructionSite>(entity)
            .cloned()
            .ok_or("not a construction site")?;
        let Some(policy) = self.ecs.get::<crate::work_planner::WorkPolicy>(entity).cloned() else {
            return Ok(None);
        };
        let Some(schedule) = self.ecs.get::<crate::work_planner::WorkSchedule>(entity).cloned() else {
            return Ok(None);
        };
        if !policy.enabled || policy.party != party || state.phase != ConstructionPhase::Planned {
            return Ok(None);
        }
        if self.work_attempts.contains_key(site) {
            return Ok(None);
        }
        let definition = self
            .environment
            .as_ref()
            .ok_or("construction needs environment")?
            .structures
            .get(&state.catalog)
            .ok_or("construction catalog binding is missing")?
            .clone();
        if self.ecs.get::<OwnedByParty>(entity).map(|owner| owner.party.as_str()) != Some(party)
            || self.ecs.get::<Position>(entity).is_none()
            || !self.construction_materials_ready(site, &definition)
        {
            return Ok(None);
        }
        let status = construction_status(self, &[site.to_owned()])?
            .get(site)
            .copied()
            .unwrap_or("unknown");
        if status != "ready" {
            return Ok(None);
        }
        let spacing = self
            .environment
            .as_ref()
            .ok_or("construction needs environment")?
            .world
            .cell_spacing_m();
        let contacts = self
            .current_contact_candidate_rows(&state, &definition, spacing)?
            .into_iter()
            .map(|(point, _)| crate::components::Point {
                x: point[0],
                y: point[1],
                z: point[2],
                frame: None,
            })
            .collect::<Vec<_>>();
        if contacts.is_empty() {
            return Ok(None);
        }
        Ok(Some(crate::work_planner::WorkRequirement {
            task: site.to_owned(),
            party: party.to_owned(),
            priority: policy.priority,
            schedule,
            contacts,
            required_worker: None,
            free_capacity_required: 0,
            operation: crate::work_planner::WorkOperation::Construction {
                site: site.to_owned(),
                mode: crate::work_attempt::ConstructionMode::Work,
            },
        }))
    }

    /// Low-level completion primitive. A shared work owner must approach the
    /// site, spend its teardown work, then invoke this synchronously; Colony
    /// controls do not call it directly. Custody is always the attending
    /// worker's real container, never a caller-selected destination.
    pub(super) fn deconstruct_construction(&mut self, worker_id: &str, site_id: &str) -> Result<()> {
        let site_entity = self.entity(site_id)?;
        let state = self.ecs.get::<ConstructionSite>(site_entity).cloned().ok_or("not a construction site")?;
        if state.phase != ConstructionPhase::Finished || self.ecs.get::<SealedContainer>(site_entity).is_none() { return Err("deconstruction requires a finished site".into()); }
        let worker = self.entity(worker_id)?;
        if self.ecs.get::<Body>(worker).is_none() || self.ecs.get::<Container>(worker).is_none()
            || self.ecs.get::<Destination>(worker).is_some() || self.ecs.get::<Support>(worker).is_some()
            || self.ecs.get::<ExcavationWork>(worker).is_some() || self.direct.contains_key(&worker) {
            return Err("worker cannot deconstruct while busy".into());
        }
        let worker_position = self.world_pose(worker_id)?;
        let definition = self.environment.as_ref().ok_or("deconstruction needs environment")?.structures.get(&state.catalog).ok_or("construction catalog binding is missing")?.clone();
        let spacing = self.environment.as_ref().ok_or("construction needs environment")?.world.cell_spacing_m();
        if !self.contact_is_valid(&state, &definition, [worker_position.x, worker_position.y, worker_position.z], spacing)? {
            return Err("worker is not at construction contact".into());
        }
        let port_ids: Vec<String> = definition.on_complete.ports.iter().map(|port| format!("{site_id}:{}", port.key)).collect();
        for port_id in &port_ids {
            self.entity(port_id)?;
            let key = port_id.strip_prefix(site_id).and_then(|value| value.strip_prefix(':')).ok_or("invalid created port identity")?;
            if definition.on_remove.empty_ports.contains(key) && self.quantity(port_id) != 0 { return Err("required empty port contains live contents".into()); }
        }
        let target = worker;
        if self.ids.values().any(|entity| self.ecs.get::<Support>(*entity).is_some_and(|support| support.entity == site_id)) { return Err("supported dependent prevents deconstruction".into()); }
        let salvage_total: u32 = definition.on_remove.salvage.values().try_fold(0u32, |sum, q| sum.checked_add(*q)).ok_or("salvage quantity overflow")?;
        if self.quantity(worker_id).saturating_add(u64::from(salvage_total)) > u64::from(self.ecs.get::<Container>(target).unwrap().capacity) { return Err("worker lacks salvage capacity".into()); }
        let instances: Vec<_> = self.environment.as_ref().unwrap().world.structure_instances().into_iter().filter(|instance| match instance { crate::structure_geometry::StaticInstance::Floor { id, .. } | crate::structure_geometry::StaticInstance::Cover { id, .. } | crate::structure_geometry::StaticInstance::Fixture { id, .. } | crate::structure_geometry::StaticInstance::Wall { id, .. } | crate::structure_geometry::StaticInstance::ApertureWall { id, .. } | crate::structure_geometry::StaticInstance::Stair { id, .. } => id != site_id }).collect();
        let prepared = { let environment = self.environment.as_mut().unwrap(); match environment.world.prepare_structures(instances)? { Ok(prepared) => prepared, Err(_) => return Err("deconstruction geometry is invalid".into()) } };
        let salvage: Vec<_> = definition.on_remove.salvage.iter().map(|(kind, quantity)| self.prepare_material_output(MaterialOutputSpec { container: worker_id.to_owned(), kind: kind.clone(), quantity: *quantity, water_kg: None })).collect::<Result<Vec<_>>>()?;
        self.environment.as_mut().unwrap().apply_structures(prepared)?;
        for output in salvage { self.publish_material_output(output); }
        for port_id in port_ids {
            let entity = self.ids.remove(&port_id).ok_or("created port disappeared")?;
            let port_lots = self.contents.remove(&port_id).unwrap_or_default();
            for lot_entity in port_lots {
                let lot_id = self.ecs.get::<ExternalId>(lot_entity).map(|id| id.0.clone()).ok_or("port lot identity missing")?;
                if self.ecs.get::<Lot>(lot_entity).is_some_and(|lot| lot.quantity > 0) { return Err("port contains live contents".into()); }
                self.ids.remove(&lot_id); self.known.remove(&lot_id); self.ecs.despawn(lot_entity);
            }
            self.known.remove(&port_id); self.ecs.despawn(entity);
        }
        for (name, _) in &definition.on_complete.components { if let Some(component_id) = self.registry.ids.get(name).copied() { self.ecs.entity_mut(site_entity).remove_by_id(component_id); } }
        let site_lots = self.contents.remove(site_id).unwrap_or_default();
        for lot_entity in site_lots {
            let lot_id = self.ecs.get::<ExternalId>(lot_entity).map(|id| id.0.clone()).ok_or("construction lot identity missing")?;
            self.ids.remove(&lot_id); self.known.remove(&lot_id); self.ecs.despawn(lot_entity);
        }
        self.ids.remove(site_id); self.known.remove(site_id); self.contents.remove(site_id); self.ecs.despawn(site_entity);
        self.refresh_planner_index(site_id);
        self.refresh_state_weight();
        Ok(())
    }
    pub(super) fn construction_access(&mut self, input: &str) -> Result<String> {
        self.construction_access_inner(input)
    }
    fn deconstruction_access_rows(&mut self, ids: Vec<String>) -> Result<Vec<DeconstructionAccessRow>> {
        self.ensure_ready()?;
        if ids.is_empty() || ids.len() > 128 || ids.iter().any(|id| !crate::components::valid_id(id)) {
            return Err("deconstruction access needs 1..128 valid site ids".into());
        }
        let mut unique = BTreeSet::new();
        if ids.iter().any(|id| !unique.insert(id.clone())) { return Err("duplicate deconstruction access site".into()); }
        let spacing = self.environment.as_ref().ok_or("deconstruction needs environment")?.world.cell_spacing_m();
        let mut rows = Vec::with_capacity(ids.len());
        for site in ids {
            let Some(entity) = self.ids.get(&site).copied() else {
                rows.push(DeconstructionAccessRow { site, removal: "invalidGeometry", salvage_quantity: 0, work_seconds: 0.0, contacts: Vec::new() });
                continue;
            };
            let Some(state) = self.ecs.get::<ConstructionSite>(entity).cloned() else {
                rows.push(DeconstructionAccessRow { site, removal: "invalidGeometry", salvage_quantity: 0, work_seconds: 0.0, contacts: Vec::new() });
                continue;
            };
            let Some(definition) = self.environment.as_ref().and_then(|environment| environment.structures.get(&state.catalog)).cloned() else {
                rows.push(DeconstructionAccessRow { site, removal: "invalidGeometry", salvage_quantity: 0, work_seconds: 0.0, contacts: Vec::new() });
                continue;
            };
            // Access is bounded to 128 requested sites; each structural check
            // is intentionally local to the requested removal and never runs
            // construction support or material readiness work.
            let contacts = self.current_contact_candidate_rows(&state, &definition, spacing)?
                .into_iter()
                .map(|(point, kind)| ConstructionAccessContact { x: point[0], y: point[1], z: point[2], frame: None, kind })
                .collect();
            let blocked_port = definition.on_remove.empty_ports.iter().any(|key| self.quantity(&format!("{site}:{key}")) != 0);
            let dependent = self.ids.values().any(|candidate| self.ecs.get::<Support>(*candidate).is_some_and(|support| support.entity == site));
            let geometry_ready = self.environment.as_mut().and_then(|environment| {
                let remaining = environment.world.structure_instances().into_iter().filter(|instance| match instance {
                    crate::structure_geometry::StaticInstance::Floor { id, .. }
                    | crate::structure_geometry::StaticInstance::Cover { id, .. }
                    | crate::structure_geometry::StaticInstance::Fixture { id, .. }
                    | crate::structure_geometry::StaticInstance::Wall { id, .. }
                    | crate::structure_geometry::StaticInstance::ApertureWall { id, .. }
                    | crate::structure_geometry::StaticInstance::Stair { id, .. } => id != &site,
                }).collect();
                Some(matches!(environment.world.prepare_structures(remaining), Ok(Ok(_))))
            }).unwrap_or(false);
            let valid_state = state.phase == ConstructionPhase::Finished && self.ecs.get::<SealedContainer>(entity).is_some();
            let removal = if blocked_port { "occupiedPort" }
                else if dependent { "structuralDependency" }
                else if !valid_state || !geometry_ready { "invalidGeometry" }
                else { "ready" };
            let salvage_quantity = definition.on_remove.salvage.values().try_fold(0u32, |sum, quantity| sum.checked_add(*quantity)).ok_or("salvage quantity overflow")?;
            rows.push(DeconstructionAccessRow { site, removal, salvage_quantity, work_seconds: definition.work_seconds, contacts });
        }
        Ok(rows)
    }
    pub(super) fn deconstruction_access(&mut self, input: &str) -> Result<String> {
        let ids: Vec<String> = serde_json::from_str(input).map_err(|_| "invalid deconstruction access request")?;
        let rows = self.deconstruction_access_rows(ids)?;
        serde_json::to_string(&rows).map_err(|_| "deconstruction access encoding failed".into())
    }
    fn construction_access_inner(&mut self, input: &str) -> Result<String> {
        self.ensure_ready()?;
        let ids: Vec<String> = serde_json::from_str(input).map_err(|_| "invalid construction access request")?;
        if ids.is_empty() || ids.len() > 256 || ids.iter().any(|id| !crate::components::valid_id(id)) {
            return Err("construction access needs 1..256 valid site ids".into());
        }
        let mut unique = BTreeSet::new();
        if ids.iter().any(|id| !unique.insert(id.clone())) { return Err("duplicate construction access site".into()); }
        let statuses = construction_status(self, &ids)?;
        let spacing = self.environment.as_ref().ok_or("construction needs environment")?.world.cell_spacing_m();
        let mut rows = Vec::with_capacity(ids.len());
        for site in ids {
            let materials_ready = self.ids.get(&site).and_then(|entity| {
                let state = self.ecs.get::<ConstructionSite>(*entity)?;
                let definition = self.environment.as_ref()?.structures.get(&state.catalog)?;
                Some(self.construction_materials_ready(&site, definition))
            }).unwrap_or(false);
            let mut blocked_actors = Vec::new();
            let contacts = if let Some(entity) = self.ids.get(&site).copied() {
                if let Some(state) = self.ecs.get::<ConstructionSite>(entity).cloned() {
                    if let Some(definition) = self.environment.as_ref().and_then(|environment| environment.structures.get(&state.catalog)).cloned() {
                        if state.phase != ConstructionPhase::Finished {
                            let candidate = self.construction_instance(&site, &definition, state.target)?;
                            let prepared = {
                                let environment = self.environment.as_mut().ok_or("construction needs environment")?;
                                let mut instances = environment.world.structure_instances();
                                instances.push(candidate);
                                match environment.world.prepare_structures(instances) {
                                    Ok(Ok(prepared)) => Some(prepared),
                                    Ok(Err(_)) => None,
                                    Err(reason) if reason == "structure overlaps solid terrain"
                                        || reason == "duplicate structure bulk occupied cell" => None,
                                    Err(reason) => return Err(reason),
                                }
                            };
                            if let Some(prepared) = prepared {
                                blocked_actors = self.structure_contact_blocked_actors(&prepared)?;
                            }
                        }
                        self.current_contact_candidate_rows(&state, &definition, spacing)?.into_iter().map(|(point, kind)| ConstructionAccessContact {
                            x: point[0], y: point[1], z: point[2], frame: None, kind,
                        }).collect()
                    } else { Vec::new() }
                } else { Vec::new() }
            } else { Vec::new() };
            let support = statuses.get(&site).copied().unwrap_or("unknown");
            rows.push(ConstructionAccessRow { site, support, materials_ready, blocked_actors, contacts });
        }
        serde_json::to_string(&rows).map_err(|_| "construction access encoding failed".into())
    }

    pub(super) fn construction_readiness(&mut self, input: &str) -> Result<String> {
        self.ensure_ready()?;
        let ids: Vec<String> = serde_json::from_str(input).map_err(|_| "invalid construction readiness request")?;
        if ids.is_empty() || ids.len() > 256 || ids.iter().any(|id| !crate::components::valid_id(id)) {
            return Err("construction readiness needs 1..256 valid site ids".into());
        }
        let mut unique = BTreeSet::new();
        if ids.iter().any(|id| !unique.insert(id.clone())) { return Err("duplicate construction readiness site".into()); }
        let statuses = construction_status(self, &ids)?;
        let rows = ids.into_iter().map(|site| {
            let status = statuses.get(&site).copied().unwrap_or("unknown");
            let reason = (status == "waitingForSupport").then_some("missingStructuralSupport");
            ConstructionReadinessRow { site, status, reason }
        }).collect::<Vec<_>>();
        serde_json::to_string(&rows).map_err(|_| "construction readiness encoding failed".into())
    }
    fn construction_instance(
        &self,
        site: &str,
        definition: &crate::environment_definition::StructureDefinition,
        target: ConstructionTarget,
    ) -> Result<crate::structure_geometry::StaticInstance> {
        use crate::environment_definition::StructureShape;
        use crate::structure_geometry::StaticInstance;
        match (&definition.shape, target) {
            (StructureShape::Floor, ConstructionTarget::Cell { cell, .. }) => Ok(StaticInstance::Floor { id: site.into(), support: cell }),
            (StructureShape::Cover, ConstructionTarget::Cell { cell, .. }) => Ok(StaticInstance::Cover { id: site.into(), support: cell }),
            (StructureShape::Fixture { footprint }, ConstructionTarget::Cell { cell, orientation }) => Ok(StaticInstance::Fixture { id: site.into(), origin: cell, orientation, footprint: footprint.clone() }),
            (StructureShape::Wall { height }, ConstructionTarget::Edge { edge }) => Ok(StaticInstance::Wall { id: site.into(), edge, height: *height }),
            (StructureShape::Aperture { height, opening_bottom, opening_height }, ConstructionTarget::Edge { edge }) => Ok(StaticInstance::ApertureWall { id: site.into(), edge, height: *height, opening_bottom: *opening_bottom, opening_height: *opening_height, open: true }),
            (StructureShape::Stair { run, rise }, ConstructionTarget::Cell { cell, orientation }) => Ok(StaticInstance::Stair { id: site.into(), origin: cell, orientation, run: *run, rise: *rise }),
            (StructureShape::Wall { .. } | StructureShape::Aperture { .. }, ConstructionTarget::Cell { .. }) => Err("wall construction requires an edge target".into()),
            (_, ConstructionTarget::Edge { .. }) => Err("only wall construction accepts an edge target".into()),
        }
    }

    fn pending_construction_instances(&self) -> Result<Vec<crate::structure_geometry::StaticInstance>> {
        let mut pending = Vec::new();
        for (id, entity) in &self.ids {
            let Some(state) = self.ecs.get::<ConstructionSite>(*entity) else { continue; };
            if state.phase == ConstructionPhase::Finished { continue; }
            if self.ecs.get::<FloorReplacement>(*entity).is_some() { continue; }
            let definition = self.environment.as_ref().ok_or("construction needs environment")?.structures.get(&state.catalog).ok_or("construction catalog binding is missing")?;
            pending.push(self.construction_instance(id, definition, state.target)?);
        }
        Ok(pending)
    }
    pub(super) fn current_contact_candidate_rows(&mut self, site: &ConstructionSite, definition: &crate::environment_definition::StructureDefinition, spacing: [f64; 3]) -> Result<Vec<([f64; 3], &'static str)>> {
        let candidates = self.contact_candidate_cells(site, definition, spacing)?;
        let config = crate::terrain_traversal::TraversalConfig { spacing, clearance_cells: 1, max_step_cells: 1 };
        let environment = self.environment.as_mut().ok_or("construction needs environment")?;
        candidates.into_iter().filter_map(|(cell, point, kind)| {
            let mut query = |at| environment.world.traversal_material(at);
            match crate::terrain_traversal::node(cell, config, &mut query) {
                Ok(Some(_)) => Some(Ok((point, kind))),
                Ok(None) => None,
                Err(error) => Some(Err(error.into())),
            }
        }).collect()
    }
    fn contact_candidate_cells(&self, site: &ConstructionSite, definition: &crate::environment_definition::StructureDefinition, spacing: [f64; 3]) -> Result<Vec<(crate::generation::Cell, [f64; 3], &'static str)>> {
        if let ConstructionTarget::Edge { edge } = site.target {
            if !matches!(definition.shape, crate::environment_definition::StructureShape::Wall { .. } | crate::environment_definition::StructureShape::Aperture { .. }) {
                return Err("only wall construction accepts an edge target".into());
            }
            let Some(walking_y) = edge.cell.y.checked_sub(1) else { return Ok(Vec::new()); };
            let mut cells = [edge.cell, edge.neighbor()?];
            cells.iter_mut().for_each(|cell| cell.y = walking_y);
            return Ok(cells.into_iter().map(|cell| {
                // A wall has one construction side class.  The contact wire
                // reserves `origin` for that class; `landing` is reserved
                // for the upper endpoint of a stair.
                (cell, [cell.x as f64 * spacing[0], (f64::from(cell.y) + 0.5) * spacing[1], cell.z as f64 * spacing[2]], "origin")
            }).collect());
        }
        let ConstructionTarget::Cell { cell: origin, orientation } = site.target else { unreachable!() };
        let walking_y = match definition.shape {
            crate::environment_definition::StructureShape::Wall { .. }
            | crate::environment_definition::StructureShape::Aperture { .. } => return Err("wall construction requires an edge target".into()),
            crate::environment_definition::StructureShape::Cover | crate::environment_definition::StructureShape::Fixture { .. } => origin.y.checked_sub(1),
            _ => Some(origin.y),
        };
        let Some(walking_y) = walking_y else { return Ok(Vec::new()); };
        let mut endpoints = if let crate::environment_definition::StructureShape::Fixture { footprint } = &definition.shape {
            crate::structure_geometry::fixture_cells(
                origin,
                orientation,
                footprint,
            )?.into_iter().map(|cell| (cell.x, walking_y, cell.z, "origin")).collect()
        } else {
            vec![(origin.x, walking_y, origin.z, "origin")]
        };
        let fixture_footprint = matches!(&definition.shape, crate::environment_definition::StructureShape::Fixture { .. })
            .then(|| endpoints.iter().map(|(x, y, z, _)| crate::generation::Cell { x: *x, y: *y, z: *z }).collect::<BTreeSet<_>>())
            .unwrap_or_default();
        if let crate::environment_definition::StructureShape::Stair { run, rise } = &definition.shape {
            let (dx, dz) = match orientation {
                crate::structure_geometry::Cardinal::North => (0, -1), crate::structure_geometry::Cardinal::East => (1, 0),
                crate::structure_geometry::Cardinal::South => (0, 1), crate::structure_geometry::Cardinal::West => (-1, 0),
            };
            let Some(x) = i64::from(dx).checked_mul(i64::from(*run)).and_then(|offset| origin.x.checked_add(offset)) else { return Ok(Vec::new()); };
            let Some(y) = walking_y.checked_add(i32::from(*rise)) else { return Ok(Vec::new()); };
            let Some(z) = i64::from(dz).checked_mul(i64::from(*run)).and_then(|offset| origin.z.checked_add(offset)) else { return Ok(Vec::new()); };
            endpoints.push((x, y, z, "landing"));
        }
        let origin_has_surface = matches!(definition.shape, crate::environment_definition::StructureShape::Stair { .. })
            && self.environment.as_ref()
                .is_some_and(|environment| environment.world.structure_projection_snapshot().supports(origin));
        let raw_candidates = endpoints.into_iter().flat_map(|(ex, endpoint_y, ez, kind)| {
            let cardinal = [(0_i64, -1_i64), (1, 0), (0, 1), (-1, 0)];
            let center_and_cardinals = move |y: i32, include_center: bool| {
                include_center.then(|| (crate::generation::Cell { x: ex, y, z: ez }, [ex as f64 * spacing[0], (f64::from(y) + 0.5) * spacing[1], ez as f64 * spacing[2]], kind)).into_iter().chain(cardinal.into_iter().filter_map(move |(x, z)| {
                    Some((crate::generation::Cell { x: ex.checked_add(x)?, y, z: ez.checked_add(z)? }, [(ex.checked_add(x)? as f64) * spacing[0], (f64::from(y) + 0.5) * spacing[1], (ez.checked_add(z)? as f64) * spacing[2]], kind))
                }))
            };
            // A stair origin normally is its open entrance, so terrain rooted
            // stairs retain perimeter contacts.  When an upper stair starts
            // on a committed floor, the floor cell itself is the lawful
            // upper entrance and must remain reachable for hauling.
            let depth0 = center_and_cardinals(endpoint_y, kind == "origin" && origin_has_surface);
            let lower = (1..=definition.work_reach_below_cells).filter_map(move |depth| endpoint_y.checked_sub(i32::try_from(depth).ok()?)).flat_map(move |y| center_and_cardinals(y, true));
            depth0.chain(lower)
        });
        let mut candidates = BTreeMap::new();
        for (cell, point, kind) in raw_candidates {
            if fixture_footprint.contains(&cell) { continue; }
            candidates.entry(cell).or_insert((point, kind));
        }
        Ok(candidates.into_iter().map(|(cell, (point, kind))| (cell, point, kind)).collect())
    }
    fn contact_candidate_rows(&self, site: &ConstructionSite, definition: &crate::environment_definition::StructureDefinition, spacing: [f64; 3]) -> Result<Vec<([f64; 3], &'static str)>> {
        Ok(self.contact_candidate_cells(site, definition, spacing)?.into_iter().map(|(_, point, kind)| (point, kind)).collect())
    }

    pub(super) fn native_supply_contacts(&self, site: &str) -> Result<Vec<Point>> {
        // A process input port is a declared station contact. Keep this
        // narrow lookup beside construction contacts so both consumers feed
        // the same delivery lifecycle and neither invents a destination.
        if self
            .ids
            .get(site)
            .is_some_and(|entity| self.ecs.get::<ConstructionSite>(*entity).is_none())
            && let Some((station, port)) = site.split_once(':')
        {
            let station_entity = self.entity(station)?;
            let state = self.ecs.get::<ConstructionSite>(station_entity).ok_or("process station is not a construction site")?;
            let definition = self.environment.as_ref().ok_or("process supply needs environment")?.structures.get(&state.catalog).ok_or("process station catalog is missing")?;
            let declared = definition.on_complete.ports.iter().find(|entry| entry.key == port).ok_or("process input port is not declared")?;
            if !declared.at_site_contact || self.ecs.get::<Container>(self.entity(site)?).is_none() {
                return Err("process input port is not a native contact container".into());
            }
            let position = *self.ecs.get::<Position>(self.entity(site)?).ok_or("process input port lost its contact")?;
            return Ok(vec![Point { x: position.x, y: position.y, z: position.z, frame: None }]);
        }
        let state = self.ecs.get::<ConstructionSite>(self.entity(site)?).ok_or("not a construction site")?;
        let definition = self.environment.as_ref().ok_or("construction needs environment")?.structures.get(&state.catalog).ok_or("construction catalog binding is missing")?;
        let spacing = self.environment.as_ref().ok_or("construction needs environment")?.world.cell_spacing_m();
        Ok(self.contact_candidate_rows(state, definition, spacing)?.into_iter().map(|(point, _)| Point { x: point[0], y: point[1], z: point[2], frame: None }).collect())
    }
    fn contact_is_valid(&mut self, site: &ConstructionSite, definition: &crate::environment_definition::StructureDefinition, position: [f64; 3], spacing: [f64; 3]) -> Result<bool> {
        Ok(self.current_contact_candidate_rows(site, definition, spacing)?.into_iter().any(|(candidate, _)| {
            position == candidate
        }))
    }
    pub(super) fn validate_construction_sites(&mut self) -> Result<()> {
        let Some(environment) = &self.environment else { return Ok(()); };
        let geometry_instances = environment.world.structure_instances();
        let geometry_ids: BTreeSet<String> = geometry_instances.iter().map(|instance| match instance {
            crate::structure_geometry::StaticInstance::Floor { id, .. }
            | crate::structure_geometry::StaticInstance::Cover { id, .. }
            | crate::structure_geometry::StaticInstance::Fixture { id, .. }
            | crate::structure_geometry::StaticInstance::Wall { id, .. }
            | crate::structure_geometry::StaticInstance::ApertureWall { id, .. }
            | crate::structure_geometry::StaticInstance::Stair { id, .. } => id.clone(),
        }).collect();
        for (id, entity) in &self.ids {
            let Some(site) = self.ecs.get::<ConstructionSite>(*entity) else { continue; };
            let definition = environment.structures.get(&site.catalog).ok_or("construction site catalog binding is missing")?;
            if self.ecs.get::<Container>(*entity).is_none()
                || (site.phase != ConstructionPhase::Planned && self.ecs.get::<Position>(*entity).is_none())
                || !site.seconds.is_finite() || site.seconds < 0.0 {
                return Err(format!("invalid construction site {id}"));
            }
            let spacing = environment.world.cell_spacing_m();
            let instance = self.construction_instance(id, definition, site.target)?;
            crate::structure_geometry::StaticGeometry::new(environment.world.bounds(), vec![instance])?;
            if let Some(position) = self.ecs.get::<Position>(*entity) {
                if !self.contact_candidate_rows(site, definition, spacing)?.into_iter().any(|(candidate, _)| [position.x, position.y, position.z] == candidate) {
                    return Err(format!("construction site {id} has invalid bound contact"));
                }
            }
            if site.phase != ConstructionPhase::Finished && self.ecs.get::<SealedContainer>(*entity).is_some() {
                return Err("unfinished construction site cannot be sealed".into());
            }
            match site.phase {
                ConstructionPhase::Finished => {
                    let expected = self.construction_instance(id, definition, site.target)?;
                    if self.ecs.get::<SealedContainer>(*entity).is_none()
                        || site.seconds != definition.work_seconds
                        || !geometry_instances.iter().any(|instance| match (&expected, instance) {
                            (crate::structure_geometry::StaticInstance::ApertureWall { id, edge, height, opening_bottom, opening_height, .. }, crate::structure_geometry::StaticInstance::ApertureWall { id: other, edge: other_edge, height: other_height, opening_bottom: other_bottom, opening_height: other_opening, .. }) => id == other && edge == other_edge && height == other_height && opening_bottom == other_bottom && opening_height == other_opening,
                            _ => instance == &expected,
                        }) { return Err("finished construction linkage is invalid".into()); }
                    for (name, value) in &definition.on_complete.components {
                        self.validate_completion_component(*entity, id, name, value)?;
                    }
                    for port in &definition.on_complete.ports {
                        let port_id = format!("{id}:{}", port.key);
                        let port_entity = self.ids.get(&port_id).copied().ok_or_else(|| format!("finished construction site {id} is missing port {port_id}"))?;
                        for (name, value) in &port.components {
                            self.validate_completion_component(port_entity, &port_id, name, value)?;
                        }
                        if port.at_site_contact && self.ecs.get::<Position>(port_entity) != self.ecs.get::<Position>(*entity) {
                            return Err(format!("finished construction port {port_id} has invalid contact position"));
                        }
                    }
                }
                ConstructionPhase::Planned => if geometry_ids.contains(id) { return Err("planned construction progress is invalid".into()); },
                ConstructionPhase::Working => if geometry_ids.contains(id) { return Err("working construction geometry is invalid".into()); },
            }
            if site.seconds > definition.work_seconds { return Err("construction progress exceeds catalog work".into()); }
            let capacity = definition.materials.values().try_fold(0u32, |sum, quantity| sum.checked_add(*quantity)).ok_or("construction material capacity overflow")?;
            if self.ecs.get::<Container>(*entity).is_some_and(|container| container.capacity != capacity) {
                return Err("construction site capacity mismatch".into());
            }
        }
        let pending = self.pending_construction_instances()?;
        self.environment.as_mut().ok_or("construction needs environment")?.world.validate_construction_pending(&pending)?;
        Ok(())
    }

    /// Completion recipes install capabilities; they do not own the later
    /// mutable state of those capabilities. Validate that each declared
    /// component remains present and well formed after work systems advance it.
    fn validate_completion_component(&self, entity: Entity, owner: &str, name: &str, installed: &Record) -> Result<()> {
        let value = self.registry.read(&self.ecs, entity, name)
            .ok_or_else(|| format!("finished construction {owner} is missing component {name}"))?;
        match name {
            // Native custody owns capacity and emitter identity for a port.
            "hive.container" | "hive.emitter" | "hive.visual" if &value != installed => {
                return Err(format!("finished construction {owner} has changed completion component {name}"));
            }
            // Stockpile policy owns priority/filter changes, while the
            // completion recipe retains the stable storage zone identity.
            "hive.stockpile-cell" if value.get("zone") != installed.get("zone") => {
                return Err(format!("finished construction {owner} has changed stockpile zone"));
            }
            _ => {}
        }
        self.registry.validate(name, &value, &self.known)
            .map_err(|reason| format!("finished construction {owner} has invalid component {name}: {reason}"))
    }
    pub(super) fn plan_construction(&mut self, catalog: String, site: String, party: String, target: ConstructionTarget) -> Result<()> {
        let party_entity = self.entity(&party)?;
        if self.ecs.get::<Party>(party_entity).is_none() { return Err("construction owner is not a party".into()); }
        if self.ids.len() >= 16384 || !crate::components::valid_id(&site) || self.known.contains(&site) { return Err("invalid or duplicate construction site".into()); }
        let definition = self.environment.as_ref().ok_or("construction needs environment")?.structures.get(&catalog).ok_or("unknown construction catalog")?.clone();
        let instance = self.construction_instance(&site, &definition, target)?;
        let pending = self.pending_construction_instances()?;
        self.environment.as_mut().ok_or("construction needs environment")?
            .world.admit_construction_placement(instance, &pending)?;
        let staged = ConstructionSite { catalog, target, seconds: 0.0, phase: ConstructionPhase::Planned };
        let capacity = definition.materials.values().try_fold(0u32, |sum, quantity| sum.checked_add(*quantity)).ok_or("construction material capacity overflow")?;
        let added = site.len() + 128 + self.registry.weight("hive.container", &record(&Container { capacity }))
            + self.registry.weight("hive.construction-site", &record(&staged))
            + self.registry.weight("hive.owned-by-party", &record(&OwnedByParty { party: party.clone() }))
            + self.registry.weight("hive.work-policy", &record(&crate::work_planner::WorkPolicy { party: party.clone(), priority: 0, enabled: true }))
            + self.registry.weight("hive.work-schedule", &record(&crate::work_planner::WorkSchedule { next_review_tick: 0, last_considered: 0 }));
        if self.state_weight.saturating_add(added) > STATE_BYTES { return Err("region canonical state capacity".into()); }
        let entity = self.ecs.spawn((ExternalId(site.clone()), Container { capacity }, OwnedByParty { party: party.clone() }, staged,
            crate::work_planner::WorkPolicy { party: party.clone(), priority: 0, enabled: true },
            crate::work_planner::WorkSchedule { next_review_tick: 0, last_considered: 0 })).id();
        self.ids.insert(site.clone(), entity); self.known.insert(site.clone()); self.contents.insert(site.clone(), BTreeSet::new()); self.state_weight += added;
        self.refresh_planner_index(&site);
        Ok(())
    }

    pub(super) fn replace_floor(&mut self, order_id: String, existing_id: String, desired_catalog: String) -> Result<()> {
        if !crate::components::valid_id(&order_id) || self.known.contains(&order_id) { return Err("invalid or duplicate floor replacement order".into()); }
        let target_entity = self.entity(&existing_id)?;
        let target = self.ecs.get::<ConstructionSite>(target_entity).cloned().ok_or("existing floor is not a construction site")?;
        let owner = self.ecs.get::<OwnedByParty>(target_entity).cloned().ok_or("existing floor has no party owner")?;
        if target.phase != ConstructionPhase::Finished || self.ecs.get::<SealedContainer>(target_entity).is_none() { return Err("floor replacement requires a finished floor".into()); }
        let desired = self.environment.as_ref().ok_or("construction needs environment")?.structures.get(&desired_catalog).ok_or("unknown replacement catalog")?;
        if !matches!(desired.shape, crate::environment_definition::StructureShape::Floor) { return Err("replacement catalog must be a floor".into()); }
        if target.catalog == desired_catalog { return Ok(()); }
        if self.ids.values().any(|entity| self.ecs.get::<FloorReplacement>(*entity).is_some_and(|replacement| replacement.target_floor == existing_id && replacement.phase != FloorReplacementPhase::Cancelled && replacement.phase != FloorReplacementPhase::Completed)) { return Err("floor already has a replacement order".into()); }
        let ConstructionTarget::Cell { cell, orientation } = target.target else { return Err("floor replacement target must be cell construction".into()); };
        let staged = ConstructionSite { catalog: desired_catalog.clone(), target: ConstructionTarget::Cell { cell, orientation }, seconds: 0.0, phase: ConstructionPhase::Planned };
        let capacity = desired.materials.values().try_fold(0u32, |sum, quantity| sum.checked_add(*quantity)).ok_or("replacement material capacity overflow")?;
        let entity = self.ecs.spawn((ExternalId(order_id.clone()), Container { capacity }, owner, staged, FloorReplacement { version: 1, target_floor: existing_id, expected_catalog: target.catalog, desired_catalog, support_x: cell.x, support_y: i64::from(cell.y), support_z: cell.z, phase: FloorReplacementPhase::Queued })).id();
        self.ids.insert(order_id.clone(), entity); self.known.insert(order_id.clone()); self.contents.insert(order_id, BTreeSet::new());
        self.refresh_state_weight();
        Ok(())
    }
    pub(super) fn bind_construction_stage(&mut self, site: &str, contact: Point) -> Result<()> {
        if contact.frame.is_some() || ![contact.x, contact.y, contact.z].iter().all(|value| value.is_finite()) { return Err("construction contact must be finite terrain position".into()); }
        let site_entity = self.entity(site)?;
        if self.ecs.get::<Position>(site_entity).is_some() { return Err("construction stage is already bound".into()); }
        let state = self.ecs.get::<ConstructionSite>(site_entity).cloned().ok_or("not a construction site")?;
        if state.phase != ConstructionPhase::Planned { return Err("construction stage can only bind while planned".into()); }
        let definition = self.environment.as_ref().ok_or("construction needs environment")?.structures.get(&state.catalog).ok_or("construction catalog binding is missing")?.clone();
        let spacing = self.environment.as_ref().unwrap().world.cell_spacing_m();
        if !self.contact_is_valid(&state, &definition, [contact.x, contact.y, contact.z], spacing)? { return Err("construction contact is not adjacent to footprint".into()); }
        let position = Position { x: contact.x, y: contact.y, z: contact.z, facing: 0.0 };
        let added = self.registry.weight("hive.position", &record(&position));
        if self.state_weight.saturating_add(added) > STATE_BYTES { return Err("region canonical state capacity".into()); }
        self.ecs.entity_mut(site_entity).insert(position);
        self.refresh_state_weight();
        Ok(())
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
    fn release_construction_worker(&mut self, site: &str, mut state: ConstructionSite) -> Result<()> {
        state.phase = ConstructionPhase::Planned;
        self.ecs.entity_mut(self.entity(site)?).insert(state);
        Ok(())
    }
    fn complete_construction(&mut self, site_id: &str, state: &ConstructionSite) -> Result<bool> {
        if self.ecs.get::<FloorReplacement>(self.entity(site_id)?).is_some() { return self.complete_floor_replacement(site_id, state); }
        let definition = self.environment.as_ref().ok_or("construction needs environment")?.structures.get(&state.catalog).ok_or("construction catalog binding is missing")?.clone();
        let instance = self.construction_instance(site_id, &definition, state.target)?;
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
        let mut portions = Vec::new();
        for (kind, required) in &definition.materials {
            let mut remaining = *required;
            let lots: Vec<(String, u32)> = self.ids.iter().filter_map(|(id, entity)| {
                let lot = self.ecs.get::<Lot>(*entity)?;
                if lot.container == site_id && lot.kind == *kind && self.ecs.get::<LotWater>(*entity).map_or(true, |water| water.water_kg == 0.0) { Some((id.clone(), lot.quantity)) } else { None }
            }).collect();
            for (lot, quantity) in lots {
                if remaining == 0 { break; }
                let take = remaining.min(quantity);
                if take > 0 { portions.push(MaterialPortion { lot, quantity: take }); remaining -= take; }
            }
            if remaining != 0 { return Ok(false); }
        }
        let prepared_consumption = self.prepare_material_consumption(&portions)?;
        let marker_weight = self.registry.weight("hive.sealed-container", &record(&SealedContainer {}));
        let site_owner = self.ecs.get::<OwnedByParty>(site_entity).cloned().ok_or("construction site has no party owner")?;
        let recipe_weight: usize = definition.on_complete.components.iter().map(|(name, value)| self.registry.weight(name, value)).sum();
        let site_position = self.ecs.get::<Position>(site_entity).copied();
        if definition.on_complete.ports.iter().any(|port| port.at_site_contact && site_position.is_none()) { return Ok(false); }
        let port_owner_weight = self.registry.weight("hive.owned-by-party", &record(&site_owner));
        let port_weight: usize = definition.on_complete.ports.iter().map(|port| port.key.len() + 128 + port_owner_weight + port.components.iter().map(|(name, value)| self.registry.weight(name, value)).sum::<usize>() + if port.at_site_contact { self.registry.weight("hive.position", &record(&site_position.unwrap())) } else { 0 }).sum();
        if self.state_weight.saturating_add(marker_weight).saturating_add(recipe_weight).saturating_add(port_weight) > STATE_BYTES || self.ids.len().saturating_add(definition.on_complete.ports.len()) > 16384 { return Ok(false); }
        for port in &definition.on_complete.ports {
            let id = format!("{site_id}:{}", port.key);
            if !crate::components::valid_id(&id) || self.known.contains(&id) { return Ok(false); }
        }
        self.environment.as_mut().ok_or("construction needs environment")?.apply_structures(prepared)?;
        self.publish_material_consumption(prepared_consumption)?;
        let mut finished = state.clone();
        finished.phase = ConstructionPhase::Finished;
        self.ecs.entity_mut(site_entity).insert((finished, SealedContainer {}));
        let policy = self
            .ecs
            .get::<crate::work_planner::WorkPolicy>(site_entity)
            .cloned()
            .ok_or("construction site has no work policy")?;
        self.ecs.entity_mut(site_entity).insert(crate::work_planner::WorkPolicy {
            enabled: false,
            ..policy
        });
        for (name, value) in &definition.on_complete.components { self.registry.insert(&mut self.ecs, site_entity, name, value).expect("validated completion component"); }
        for port in &definition.on_complete.ports {
            let id = format!("{site_id}:{}", port.key);
            let entity = self.ecs.spawn(ExternalId(id.clone())).id();
            self.ids.insert(id.clone(), entity); self.known.insert(id.clone());
            self.ecs.entity_mut(entity).insert(site_owner.clone());
            for (name, value) in &port.components { self.registry.insert(&mut self.ecs, entity, name, value).expect("validated completion port component"); }
            if port.at_site_contact { self.ecs.entity_mut(entity).insert(site_position.expect("preflight site position")); }
            if self.ecs.get::<Container>(entity).is_some() { self.contents.insert(id, BTreeSet::new()); }
        }
        self.refresh_planner_index(site_id);
        self.refresh_state_weight();
        Ok(true)
    }

    fn complete_floor_replacement(&mut self, order_id: &str, state: &ConstructionSite) -> Result<bool> {
        let order_entity = self.entity(order_id)?;
        let replacement = self.ecs.get::<FloorReplacement>(order_entity).cloned().ok_or("replacement record missing")?;
        let target_id = replacement.target_floor.as_str();
        let target_entity = self.entity(target_id)?;
        let target = self.ecs.get::<ConstructionSite>(target_entity).cloned().ok_or("replacement target missing")?;
        if target.phase != ConstructionPhase::Finished || target.catalog != replacement.expected_catalog || self.ecs.get::<SealedContainer>(target_entity).is_none() { return Err("floor replacement target changed".into()); }
        let ConstructionTarget::Cell { cell: target_cell, .. } = target.target else {
            return Err("floor replacement target must remain cell construction".into());
        };
        let definition = self.environment.as_ref().ok_or("construction needs environment")?.structures.get(&state.catalog).ok_or("replacement catalog missing")?.clone();
        let prepared = {
            let environment = self.environment.as_mut().ok_or("construction needs environment")?;
            let replacement = crate::structure_geometry::StaticInstance::Floor { id: target_id.to_owned(), support: target_cell };
            let instances = environment.world.structure_instances().into_iter().map(|instance| match instance {
                crate::structure_geometry::StaticInstance::Floor { id, .. } if id == target_id => replacement.clone(),
                other => other,
            }).collect();
            match environment.world.prepare_structures(instances)? { Ok(prepared) => prepared, Err(_) => return Ok(false) }
        };
        if self.structure_contact_problem(&prepared)?.is_some() { return Ok(false); }
        let mut portions = Vec::new();
        for (kind, required) in &definition.materials {
            let mut remaining = *required;
            let lots: Vec<(String, u32)> = self.ids.iter().filter_map(|(id, entity)| { let lot = self.ecs.get::<Lot>(*entity)?; (lot.container == order_id && lot.kind == *kind && self.ecs.get::<LotWater>(*entity).map_or(true, |water| water.water_kg == 0.0)).then_some((id.clone(), lot.quantity)) }).collect();
            for (lot, quantity) in lots { if remaining == 0 { break; } let take = remaining.min(quantity); if take > 0 { portions.push(MaterialPortion { lot, quantity: take }); remaining -= take; } }
            if remaining != 0 { return Ok(false); }
        }
        let consumed = self.prepare_material_consumption(&portions)?;
        self.environment.as_mut().ok_or("construction needs environment")?.apply_structures(prepared)?;
        self.publish_material_consumption(consumed)?;
        let mut finished = target;
        finished.catalog = state.catalog.clone();
        self.ecs.entity_mut(target_entity).insert(finished);
        let order_entity = self.entity(order_id)?;
        let lots = self.contents.remove(order_id).unwrap_or_default();
        for lot_entity in lots { if let Some(id) = self.ecs.get::<ExternalId>(lot_entity).map(|v| v.0.clone()) { self.ids.remove(&id); self.known.remove(&id); } self.ecs.despawn(lot_entity); }
        self.ecs.entity_mut(order_entity).remove::<ConstructionSite>();
        self.ecs.entity_mut(order_entity).remove::<Container>();
        self.ecs.entity_mut(order_entity).remove::<Position>();
        self.ecs.entity_mut(order_entity).insert(FloorReplacement { phase: FloorReplacementPhase::Completed, ..replacement });
        self.refresh_state_weight();
        Ok(true)
    }
    pub(super) fn set_structure_open(&mut self, worker: &str, site: &str, open: bool) -> Result<()> {
        let worker_entity = self.entity(worker)?;
        if self.ecs.get::<Body>(worker_entity).is_none() || self.ecs.get::<Destination>(worker_entity).is_some()
            || self.direct.contains_key(&worker_entity) || self.ecs.get::<Support>(worker_entity).is_some()
            || self.ecs.get::<ExcavationWork>(worker_entity).is_some()
            || self.attempts_by_worker.contains_key(worker) {
            return Err("worker cannot operate structure aperture while busy".into());
        }
        let site_entity = self.entity(site)?;
        let state = self.ecs.get::<ConstructionSite>(site_entity).cloned().ok_or("not a construction site")?;
        if state.phase != ConstructionPhase::Finished || self.ecs.get::<SealedContainer>(site_entity).is_none() { return Err("aperture requires a finished structure".into()); }
        let definition = self.environment.as_ref().ok_or("structure needs environment")?.structures.get(&state.catalog).ok_or("construction catalog binding is missing")?.clone();
        if !matches!(definition.shape, crate::environment_definition::StructureShape::Aperture { .. }) { return Err("structure is not an aperture".into()); }
        let spacing = self.environment.as_ref().unwrap().world.cell_spacing_m();
        let pose = self.world_pose(worker)?;
        if !self.contact_is_valid(&state, &definition, [pose.x, pose.y, pose.z], spacing)? { return Err("worker is not at aperture contact".into()); }
        let mut instances = self.environment.as_ref().unwrap().world.structure_instances();
        let mut changed = false;
        for instance in &mut instances {
            if let crate::structure_geometry::StaticInstance::ApertureWall { id, open: current, .. } = instance && id == site {
                if *current == open { return Ok(()); }
                *current = open;
                changed = true;
            }
        }
        if !changed { return Err("finished aperture geometry is missing".into()); }
        let prepared = {
            let environment = self.environment.as_mut().ok_or("structure needs environment")?;
            match environment.world.prepare_structures(instances)? { Ok(prepared) => prepared, Err(_) => return Err("aperture change is blocked".into()) }
        };
        if self.structure_contact_problem(&prepared)?.is_some() { return Err("aperture change would obstruct an actor".into()); }
        self.environment.as_mut().ok_or("structure needs environment")?.apply_structures(prepared)?;
        Ok(())
    }

    pub(super) fn advance_construction(&mut self, delta: f64) -> Result<()> {
        if delta == 0.0 { return Ok(()); }
        let mut query = self.ecs.query::<(&ExternalId, &ConstructionSite)>();
        let mut pending: Vec<_> = query.iter(&self.ecs).map(|(id, site)| (id.0.clone(), site.clone())).collect();
        pending.sort_by(|left, right| left.0.cmp(&right.0));
        let working_ids: Vec<String> = pending.iter().filter(|(_, state)| state.phase == ConstructionPhase::Working).map(|(id, _)| id.clone()).collect();
        let readiness = construction_status(self, &working_ids)?;
        for (site_id, mut state) in pending {
            if state.phase != ConstructionPhase::Working { continue; }
            let attempt = self.work_attempts.get(&site_id).and_then(|entity| self.ecs.get::<WorkAttempt>(*entity)).cloned();
            let worker_id = attempt.as_ref().and_then(|attempt| match &attempt.phase { crate::work_attempt::AttemptPhase::Executing { activity: crate::work_attempt::ActivityRef::Construction { site, mode: crate::work_attempt::ConstructionMode::Work, .. }, .. } if site == &site_id => Some(attempt.worker.clone()), _ => None });
            let Some(worker_id) = worker_id else { continue; };
            let worker = self.entity(&worker_id)?;
            if readiness.get(&site_id).is_some_and(|status| *status != "ready") {
                self.release_construction_worker(&site_id, state)?;
                if let Some(attempt) = attempt { if let Some(operation) = attempt.current_operation().cloned() { self.settle_attempt(&site_id, crate::work_attempt::AttemptPhase::Outcome { operation, activity: match attempt.phase { crate::work_attempt::AttemptPhase::Executing { activity, .. } => activity, _ => unreachable!() }, result: crate::work_attempt::WorkOutcome::Blocked { reason: crate::work_attempt::WorkBlockReason::AccessLost } })?; } }
                continue;
            }
            if self.direct.contains_key(&worker) || self.ecs.get::<Destination>(worker).is_some()
                || self.ecs.get::<ExcavationWork>(worker).is_some() || self.ecs.get::<Support>(worker).is_some() {
                self.release_construction_worker(&site_id, state)?;
                if let Some(attempt) = attempt { if let Some(operation) = attempt.current_operation().cloned() { self.settle_attempt(&site_id, crate::work_attempt::AttemptPhase::Outcome { operation, activity: match attempt.phase { crate::work_attempt::AttemptPhase::Executing { activity, .. } => activity, _ => unreachable!() }, result: crate::work_attempt::WorkOutcome::Blocked { reason: crate::work_attempt::WorkBlockReason::WorkerUnavailable } })?; } }
                continue;
            }
            let definition = self.environment.as_ref().ok_or("construction needs environment")?.structures.get(&state.catalog).ok_or("construction catalog binding is missing")?.clone();
            let spacing = self.environment.as_ref().unwrap().world.cell_spacing_m();
            let pose = self.world_pose(worker_id.as_str())?;
            if !self.contact_is_valid(&state, &definition, [pose.x, pose.y, pose.z], spacing)? {
                self.release_construction_worker(&site_id, state)?;
                if let Some(attempt) = attempt { if let Some(operation) = attempt.current_operation().cloned() { self.settle_attempt(&site_id, crate::work_attempt::AttemptPhase::Outcome { operation, activity: match attempt.phase { crate::work_attempt::AttemptPhase::Executing { activity, .. } => activity, _ => unreachable!() }, result: crate::work_attempt::WorkOutcome::Blocked { reason: crate::work_attempt::WorkBlockReason::AccessLost } })?; } }
                continue;
            }
            if !self.construction_materials_ready(&site_id, &definition) { continue; }
            state.seconds = earned_work_seconds(state.seconds, delta, definition.work_seconds)?;
            self.ecs.entity_mut(self.entity(&site_id)?).insert(state.clone());
            if state.seconds < definition.work_seconds { continue; }
            if self.complete_construction(&site_id, &state)? {
                if let Some(attempt) = attempt { if let Some(operation) = attempt.current_operation().cloned() { self.settle_attempt(&site_id, crate::work_attempt::AttemptPhase::Outcome { operation, activity: match attempt.phase { crate::work_attempt::AttemptPhase::Executing { activity, .. } => activity, _ => unreachable!() }, result: crate::work_attempt::WorkOutcome::Completed })?; } }
            } else {
                self.release_construction_worker(&site_id, state)?;
                if let Some(attempt) = attempt { if let Some(operation) = attempt.current_operation().cloned() { self.settle_attempt(&site_id, crate::work_attempt::AttemptPhase::Outcome { operation, activity: match attempt.phase { crate::work_attempt::AttemptPhase::Executing { activity, .. } => activity, _ => unreachable!() }, result: crate::work_attempt::WorkOutcome::Blocked { reason: crate::work_attempt::WorkBlockReason::UnsupportedStructure } })?; } }
            }
        }
        self.refresh_state_weight();
        Ok(())
    }
}
