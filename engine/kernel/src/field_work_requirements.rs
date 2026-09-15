//! Domain contributions for terrain and finite-resource work.
//!
//! These are read-only views.  They intentionally stop before worker selection,
//! routing, reservation, and physical mutation; the shared work planner owns
//! those decisions.  The small local operation enum is a disposable seam until
//! the accepted `work_planner::WorkOperation` API is integrated.
use crate::components::{ExcavationWork, FiniteResource, OwnedByParty, Point, Position, ResourceSite};
use crate::work_attempt::{ActivityRef, ConstructionMode};
use crate::work_planner::{WorkPolicy, WorkSchedule};
use serde::{Deserialize, Serialize};

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub(crate) struct FieldWorkRequirement {
    pub task: String,
    pub party: String,
    pub priority: u8,
    pub schedule: WorkSchedule,
    pub contacts: Vec<Point>,
    pub operation: FieldWorkOperation,
}

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", tag = "kind", deny_unknown_fields)]
pub(crate) enum FieldWorkOperation {
    Excavate { cell: [i32; 3], expected_material: u16, replacement_material: u16 },
    ResourceEstablish { site: String, definition: String, cell: [i32; 3] },
    ResourceTend { site: String, vessel: String },
    ResourceExtract { source: String },
}

impl FieldWorkOperation {
    /// Materialize the exact continuation activity after contact selection.
    /// The route witness must use the same `contact` passed here.
    pub(crate) fn activity_for_contact(&self, _contact: &Point) -> ActivityRef {
        match self {
            Self::Excavate { cell, expected_material, replacement_material } => ActivityRef::Excavation {
                cell: *cell, expected_material: *expected_material, replacement_material: *replacement_material,
            },
            Self::ResourceEstablish { site, definition, cell } => ActivityRef::ResourceEstablish { site: site.clone(), definition: definition.clone(), cell: *cell },
            Self::ResourceTend { site, vessel } => ActivityRef::ResourceTend { site: site.clone(), vessel: vessel.clone() },
            Self::ResourceExtract { source } => ActivityRef::ResourceExtract { source: source.clone() },
        }
    }

    /// The current continuation protocol carries approach as a preceding
    /// route activity. Keeping this pair together prevents a matcher from
    /// routing to one contact and continuing with another operation witness.
    pub(crate) fn route_and_activity_for_contact(&self, contact: &Point) -> (ActivityRef, ActivityRef) {
        (ActivityRef::Route { destination: contact.clone() }, self.activity_for_contact(contact))
    }
}

fn policy_for(kernel: &crate::world::Kernel, task: &str, party: &str) -> Option<(WorkPolicy, WorkSchedule)> {
    let entity = kernel.ids.get(task).copied()?;
    let policy = kernel.ecs.get::<WorkPolicy>(entity)?.clone();
    let schedule = kernel.ecs.get::<WorkSchedule>(entity)?.clone();
    (policy.enabled && policy.party == party && !kernel.work_attempts.contains_key(task)).then_some((policy, schedule))
}

#[cfg(test)]
mod tests {
    use super::*;

    fn point(x: f64, z: f64) -> Point { Point { x, y: 0.5, z, frame: None } }

    #[test]
    fn contacts_have_stable_cardinal_order() {
        let first = contacts(Position { x: 2.0, y: 0.5, z: 3.0, facing: 0.0 }, [1.0, 1.0, 1.0]);
        let second = contacts(Position { x: 2.0, y: 0.5, z: 3.0, facing: 0.0 }, [1.0, 1.0, 1.0]);
        assert_eq!(first, second);
        assert_eq!(first, vec![point(3.0, 3.0), point(2.0, 4.0), point(1.0, 3.0), point(2.0, 2.0)]);
    }

    #[test]
    fn selected_contact_is_retained_by_route_and_domain_activity_pair() {
        let operation = FieldWorkOperation::ResourceExtract { source: "tree".into() };
        let selected = point(4.0, -2.0);
        let (route, activity) = operation.route_and_activity_for_contact(&selected);
        assert_eq!(route, ActivityRef::Route { destination: selected });
        assert_eq!(activity, ActivityRef::ResourceExtract { source: "tree".into() });
    }

    #[test]
    fn impossible_operations_are_not_confused_with_waiting_contacts() {
        let operation = FieldWorkOperation::Excavate { cell: [1, 2, 3], expected_material: 4, replacement_material: 5 };
        let selected = point(0.0, 0.0);
        let (_route, activity) = operation.route_and_activity_for_contact(&selected);
        assert!(matches!(activity, ActivityRef::Excavation { cell: [1, 2, 3], .. }));
    }

    #[test]
    fn operation_identity_roundtrips_for_saveable_continuations() {
        let operation = FieldWorkOperation::ResourceTend { site: "herb".into(), vessel: "pail".into() };
        let bytes = serde_json::to_string(&operation).unwrap();
        assert_eq!(serde_json::from_str::<FieldWorkOperation>(&bytes).unwrap(), operation);
    }
}

fn contacts(position: Position, spacing: [f64; 3]) -> Vec<Point> {
    let candidates = [(1_i32, 0_i32), (0, 1), (-1, 0), (0, -1)];
    candidates.into_iter().map(|(dx, dz)| Point { x: position.x + f64::from(dx) * spacing[0], y: position.y, z: position.z + f64::from(dz) * spacing[2], frame: None }).collect()
}

impl crate::world::Kernel {
    /// Derive an excavation designation once its target remains structurally
    /// valid.  Expected/replacement terrain and progress stay in ExcavationWork.
    pub(crate) fn excavation_work_requirement(&self, task: &str, party: &str) -> crate::components::Result<Option<FieldWorkRequirement>> {
        let Some((policy, schedule)) = policy_for(self, task, party) else { return Ok(None); };
        let entity = self.entity(task)?;
        let Some(work) = self.ecs.get::<ExcavationWork>(entity).copied() else { return Ok(None); };
        let owner = self.ecs.get::<OwnedByParty>(entity).map(|owner| owner.party.as_str());
        if owner.is_some() && owner != Some(party) { return Ok(None); }
        let environment = self.environment.as_ref().ok_or("excavation requirement needs environment")?;
        let cell = crate::generation::Cell { x: i64::from(work.x), y: work.y, z: i64::from(work.z) };
        let rule = environment.excavation_rules.get(&work.expected);
        if rule.is_none() || work.expected == work.replacement || !environment.world.is_open_material(work.replacement)
            || environment.world.material(cell)? != work.expected || !work.seconds.is_finite() || work.seconds < 0.0 { return Ok(None); }
        let spacing = environment.world.cell_spacing_m();
        let target = Position { x: work.x as f64 * spacing[0], y: f64::from(work.y) * spacing[1], z: work.z as f64 * spacing[2], facing: 0.0 };
        Ok(Some(FieldWorkRequirement { task: task.into(), party: party.into(), priority: policy.priority, schedule, contacts: contacts(target, spacing), operation: FieldWorkOperation::Excavate { cell: [work.x, work.y, work.z], expected_material: work.expected, replacement_material: work.replacement } }))
    }

    /// Derive a resource establishment designation supplied by the command
    /// boundary.  No ResourceSite is created here; establishment remains the
    /// existing world mutation owner.
    pub(crate) fn resource_establish_requirement(&self, task: &str, party: &str, site: &str, definition: &str, cell: [i32; 3]) -> crate::components::Result<Option<FieldWorkRequirement>> {
        let Some((policy, schedule)) = policy_for(self, task, party) else { return Ok(None); };
        let entity = self.entity(task)?;
        if self.ecs.get::<OwnedByParty>(entity).is_some_and(|owner| owner.party != party) { return Ok(None); }
        let environment = self.environment.as_ref().ok_or("resource requirement needs environment")?;
        if !environment.resources.contains_key(definition) { return Ok(None); }
        let spacing = environment.world.cell_spacing_m();
        let point = Position { x: f64::from(cell[0]) * spacing[0], y: (f64::from(cell[1]) + 0.5) * spacing[1], z: f64::from(cell[2]) * spacing[2], facing: 0.0 };
        Ok(Some(FieldWorkRequirement { task: task.into(), party: party.into(), priority: policy.priority, schedule, contacts: contacts(point, spacing), operation: FieldWorkOperation::ResourceEstablish { site: site.into(), definition: definition.into(), cell } }))
    }

    /// A resource stage contributes tend work only while due and still having
    /// a water requirement. Vessel compatibility and final water availability
    /// remain authoritative checks at operation admission.
    pub(crate) fn resource_tend_requirement(&self, task: &str, party: &str, vessel: &str) -> crate::components::Result<Option<FieldWorkRequirement>> {
        let Some((policy, schedule)) = policy_for(self, task, party) else { return Ok(None); };
        let entity = self.entity(task)?;
        let Some(site) = self.ecs.get::<ResourceSite>(entity).cloned() else { return Ok(None); };
        if self.ecs.get::<OwnedByParty>(entity).is_some_and(|owner| owner.party != party) { return Ok(None); }
        let definition = self.environment.as_ref().ok_or("resource requirement needs environment")?.resources.get(&site.definition).ok_or("resource definition is missing")?;
        let stage = definition.stages.get(usize::from(site.stage));
        if stage.is_none() || self.time < site.next_due || stage.is_some_and(|stage| stage.water_portions == 0) { return Ok(None); }
        let position = self.ecs.get::<Position>(entity).copied().ok_or("resource site has no position")?;
        let spacing = self.environment.as_ref().unwrap().world.cell_spacing_m();
        Ok(Some(FieldWorkRequirement { task: task.into(), party: party.into(), priority: policy.priority, schedule, contacts: contacts(position, spacing), operation: FieldWorkOperation::ResourceTend { site: task.into(), vessel: vessel.into() } }))
    }

    pub(crate) fn resource_extract_requirement(&self, task: &str, party: &str) -> crate::components::Result<Option<FieldWorkRequirement>> {
        let Some((policy, schedule)) = policy_for(self, task, party) else { return Ok(None); };
        let entity = self.entity(task)?;
        let Some(resource) = self.ecs.get::<FiniteResource>(entity) else { return Ok(None); };
        if resource.quantity == 0 || self.ecs.get::<OwnedByParty>(entity).is_some_and(|owner| owner.party != party) { return Ok(None); }
        let position = self.ecs.get::<Position>(entity).copied().ok_or("finite resource has no position")?;
        let spacing = self.environment.as_ref().map(|environment| environment.world.cell_spacing_m()).unwrap_or([1.0, 1.0, 1.0]);
        Ok(Some(FieldWorkRequirement { task: task.into(), party: party.into(), priority: policy.priority, schedule, contacts: contacts(position, spacing), operation: FieldWorkOperation::ResourceExtract { source: task.into() } }))
    }
}
