//! Immutable geometry shared by the terrain producer and compiled solver.
//! Public authored definitions remain ordinary owned data; no saved cache exists.
use super::*;

#[derive(Clone, Debug)]
pub(crate) struct SharedAtmosphereDefinition {
    pub version: String,
    pub region_id: String,
    pub geometry_identity: String,
    pub revision: u64,
    pub ambient: AtmosphereAmbient,
    pub model: AtmosphereModel,
    pub volumes: Vec<Arc<AtmosphereVolumeDefinition>>,
    pub openings: Vec<Arc<AtmosphereOpeningDefinition>>,
}

impl From<AtmosphereDefinition> for SharedAtmosphereDefinition {
    fn from(definition: AtmosphereDefinition) -> Self {
        Self {
            version: definition.version,
            region_id: definition.region_id,
            geometry_identity: definition.geometry_identity,
            revision: definition.revision,
            ambient: definition.ambient,
            model: definition.model,
            volumes: definition.volumes.into_iter().map(Arc::new).collect(),
            openings: definition.openings.into_iter().map(Arc::new).collect(),
        }
    }
}

impl SharedAtmosphereDefinition {
    pub(super) fn owned(&self) -> AtmosphereDefinition {
        AtmosphereDefinition {
            version: self.version.clone(),
            region_id: self.region_id.clone(),
            geometry_identity: self.geometry_identity.clone(),
            revision: self.revision,
            ambient: self.ambient.clone(),
            model: self.model.clone(),
            volumes: self.volumes.iter().map(|value| (**value).clone()).collect(),
            openings: self
                .openings
                .iter()
                .map(|value| (**value).clone())
                .collect(),
        }
    }

    pub(crate) fn same_physical(&self, other: &Self) -> bool {
        self.region_id == other.region_id
            && self.ambient == other.ambient
            && self.model == other.model
            && self.volumes.len() == other.volumes.len()
            && self.openings.len() == other.openings.len()
            && self
                .volumes
                .iter()
                .zip(&other.volumes)
                .all(|(a, b)| Arc::ptr_eq(a, b) || a.as_ref() == b.as_ref())
            && self
                .openings
                .iter()
                .zip(&other.openings)
                .all(|(a, b)| Arc::ptr_eq(a, b) || a.as_ref() == b.as_ref())
    }
}

pub(super) fn member_id<'a>(
    definition: &'a SharedAtmosphereDefinition,
    member: &MemberLocation,
) -> &'a str {
    &definition.volumes[member.volume].members[member.member].cell_id
}

pub(super) fn find_member<'a>(
    definition: &SharedAtmosphereDefinition,
    members: &'a [MemberLocation],
    id: &str,
) -> Option<&'a MemberLocation> {
    members
        .binary_search_by(|member| member_id(definition, member).cmp(id))
        .ok()
        .map(|index| &members[index])
}

impl CompiledAtmosphere {
    pub(super) fn member_location(&self, id: &str) -> Option<&MemberLocation> {
        find_member(&self.definition, &self.member_index, id)
    }
    pub(super) fn member_id(&self, member: &MemberLocation) -> &str {
        member_id(&self.definition, member)
    }
    pub(crate) fn shared_definition(&self) -> &SharedAtmosphereDefinition {
        &self.definition
    }
}
