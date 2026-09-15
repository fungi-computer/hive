//! Declarative material and portable-vessel compatibility.
//!
//! Quantities and custody remain owned by `hive.container` and `hive.lot`.
//! This module only compiles the content compatibility table authored by the
//! game pack.
use std::collections::{BTreeMap, BTreeSet};

#[derive(Clone, Copy, Debug, PartialEq, Eq, PartialOrd, Ord)]
pub enum MaterialForm { Liquid, Slurry, Loose, Solid, Gas }

#[derive(Clone, Debug)]
pub struct MaterialKind { pub tags: BTreeSet<String>, pub form: MaterialForm }

#[derive(Clone, Debug)]
pub struct VesselKind { pub accepted_tags: BTreeSet<String>, pub accepted_forms: BTreeSet<MaterialForm> }

#[derive(Clone, Debug, Default)]
pub struct Catalog { materials: BTreeMap<String, MaterialKind>, vessels: BTreeMap<String, VesselKind> }

impl Catalog {
    pub fn new(materials: BTreeMap<String, MaterialKind>, vessels: BTreeMap<String, VesselKind>) -> Self { Self { materials, vessels } }
    pub fn accepts(&self, vessel_kind: &str, content_kind: &str) -> bool {
        let Some(material) = self.materials.get(content_kind) else { return false; };
        let Some(vessel) = self.vessels.get(vessel_kind) else { return false; };
        vessel.accepted_forms.contains(&material.form) || !vessel.accepted_tags.is_disjoint(&material.tags)
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn configured_vessels_accept_declared_forms_and_tags() {
        let materials = [("water", MaterialKind { tags: ["clean".into()].into_iter().collect(), form: MaterialForm::Liquid }), ("mud", MaterialKind { tags: ["soil".into()].into_iter().collect(), form: MaterialForm::Slurry }), ("dirt", MaterialKind { tags: ["soil".into()].into_iter().collect(), form: MaterialForm::Loose })].into_iter().map(|(id, value)| (id.into(), value)).collect();
        let vessels = [("bucket", VesselKind { accepted_tags: ["clean".into()].into_iter().collect(), accepted_forms: [MaterialForm::Slurry].into_iter().collect() })].into_iter().map(|(id, value)| (id.into(), value)).collect();
        let catalog = Catalog::new(materials, vessels);
        assert!(catalog.accepts("bucket", "water"));
        assert!(catalog.accepts("bucket", "mud"));
        assert!(!catalog.accepts("bucket", "dirt"));
        assert!(!catalog.accepts("missing", "water"));
    }
}
