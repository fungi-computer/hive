//! Validated, content-owned stockpile filter definitions.
use serde::{Deserialize, Serialize};
use std::collections::{BTreeMap, BTreeSet};

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct StockpileProfileDefinition {
    pub id: String,
    #[serde(default)]
    pub material_categories: BTreeMap<String, String>,
    #[serde(default)]
    pub allowed_categories: Vec<String>,
    #[serde(default)]
    pub allowed_materials: Vec<String>,
    #[serde(default)]
    pub denied_materials: Vec<String>,
}

pub(crate) fn validate(profile: &StockpileProfileDefinition, catalog: &crate::material_catalog::Catalog) -> Result<(), String> {
    if !crate::components::valid_id(&profile.id)
        || profile.material_categories.len() > 256
        || profile.allowed_categories.len() > 64
        || profile.allowed_materials.len() > 256
        || profile.denied_materials.len() > 256
    { return Err("invalid stockpile profile bounds or identity".into()); }
    let mut allowed_categories = BTreeSet::new();
    for category in &profile.allowed_categories {
        if !crate::components::valid_id(category) || !allowed_categories.insert(category) { return Err("invalid or duplicate stockpile profile category".into()); }
    }
    let mut allowed = BTreeSet::new();
    for material in &profile.allowed_materials {
        if !catalog.contains(material) || !allowed.insert(material) { return Err("invalid or duplicate stockpile allowed material".into()); }
    }
    let mut denied = BTreeSet::new();
    for material in &profile.denied_materials {
        if !catalog.contains(material) || !denied.insert(material) { return Err("invalid or duplicate stockpile denied material".into()); }
    }
    for (material, category) in &profile.material_categories {
        if !catalog.contains(material) || !crate::components::valid_id(category) { return Err("invalid stockpile material category".into()); }
    }
    Ok(())
}
