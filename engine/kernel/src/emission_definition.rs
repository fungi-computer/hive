//! Bounded authored definitions for finite material emissions.
//!
//! This is content admission only. A compiled definition has no clock, cursor,
//! receipt, payment, receiver, ECS mutation, or source admission authority.

use std::collections::BTreeMap;

use serde::Deserialize;

use crate::{
    components::valid_id,
    finite_release::{FiniteRelease, FiniteReleaseDefinition},
};

const MAX_DEFINITIONS: usize = 64;
const MAX_JSON_BYTES: usize = 64 * 1024;

#[derive(Clone, Debug, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct EmissionDefinition {
    pub id: String,
    pub material_kind: String,
    pub quantity: u32,
    pub duration_s: f64,
    pub smoke_kg: f64,
    pub heat_j: f64,
}

#[derive(Clone, Debug, PartialEq)]
pub struct CompiledEmissionDefinition {
    definition: EmissionDefinition,
    release: FiniteRelease,
}

impl CompiledEmissionDefinition {
    pub fn definition(&self) -> &EmissionDefinition {
        &self.definition
    }

    pub fn release(&self) -> &FiniteRelease {
        &self.release
    }
}

#[derive(Clone, Debug, PartialEq)]
pub struct EmissionCatalog {
    definitions: BTreeMap<String, CompiledEmissionDefinition>,
}

impl EmissionCatalog {
    pub fn from_json(input: &str) -> Result<Self, String> {
        if input.len() > MAX_JSON_BYTES {
            return Err("emission definition JSON exceeds 64KiB".into());
        }
        let definitions: Vec<EmissionDefinition> = serde_json::from_str(input)
            .map_err(|error| format!("invalid emission definitions: {error}"))?;
        Self::from_definitions(definitions)
    }

    pub fn from_definitions(definitions: Vec<EmissionDefinition>) -> Result<Self, String> {
        if definitions.len() > MAX_DEFINITIONS {
            return Err("emission definition catalog exceeds 64 entries".into());
        }
        let mut compiled = BTreeMap::new();
        for definition in definitions {
            let compiled_definition = compile(definition)?;
            if compiled
                .insert(
                    compiled_definition.definition.id.clone(),
                    compiled_definition,
                )
                .is_some()
            {
                return Err("duplicate emission definition id".into());
            }
        }
        Ok(Self {
            definitions: compiled,
        })
    }

    pub fn get(&self, id: &str) -> Option<&CompiledEmissionDefinition> {
        self.definitions.get(id)
    }

    pub fn len(&self) -> usize {
        self.definitions.len()
    }
}

pub fn compile(definition: EmissionDefinition) -> Result<CompiledEmissionDefinition, String> {
    if !valid_id(&definition.id) || !valid_id(&definition.material_kind) {
        return Err("invalid emission definition identity".into());
    }
    if definition.quantity == 0 {
        return Err("emission quantity must be positive".into());
    }
    if !definition.duration_s.is_finite() || definition.duration_s <= 0.0 {
        return Err("emission duration must be positive and finite".into());
    }
    if !definition.smoke_kg.is_finite()
        || definition.smoke_kg < 0.0
        || !definition.heat_j.is_finite()
        || definition.heat_j < 0.0
        || (definition.smoke_kg == 0.0 && definition.heat_j == 0.0)
    {
        return Err("emission totals must be finite, nonnegative, and nonzero".into());
    }
    let release = FiniteRelease::new(FiniteReleaseDefinition {
        duration_s: definition.duration_s,
        totals: BTreeMap::from([
            ("smokeKg".into(), definition.smoke_kg),
            ("heatJ".into(), definition.heat_j),
        ]),
    })?;
    Ok(CompiledEmissionDefinition {
        definition,
        release,
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    fn definition(id: &str, material_kind: &str) -> EmissionDefinition {
        EmissionDefinition {
            id: id.into(),
            material_kind: material_kind.into(),
            quantity: 3,
            duration_s: 60.0,
            smoke_kg: 1.5,
            heat_j: 100.0,
        }
    }

    #[test]
    fn compiles_distinct_definitions_and_exposes_shared_schedule() {
        let first = compile(definition("hearth-a", "wood")).unwrap();
        let mut second_input = definition("hearth-b", "peat");
        second_input.heat_j = 200.0;
        let second = compile(second_input).unwrap();
        assert_eq!(first.definition().quantity, 3);
        assert_eq!(first.release().definition().duration_s, 60.0);
        assert_ne!(first, second);
    }

    #[test]
    fn catalog_rejects_duplicates_unknown_fields_and_excess_entries() {
        let duplicate = serde_json::to_string(&vec![
            definition("same", "wood"),
            definition("same", "wood"),
        ])
        .unwrap();
        assert!(EmissionCatalog::from_json(&duplicate).is_err());
        assert!(EmissionCatalog::from_json(r#"[{"id":"x","materialKind":"wood","quantity":1,"durationS":1,"smokeKg":1,"heatJ":0,"extra":1}]"#).is_err());
        let many = serde_json::to_string(
            &(0..65)
                .map(|index| definition(&format!("e{index}"), "wood"))
                .collect::<Vec<_>>(),
        )
        .unwrap();
        assert!(EmissionCatalog::from_json(&many).is_err());
    }

    #[test]
    fn rejects_invalid_content_and_unrepresentable_rates() {
        let mut invalid = definition("bad id", "wood");
        assert!(compile(invalid.clone()).is_err());
        invalid.id = "valid".into();
        invalid.material_kind = "bad kind".into();
        assert!(compile(invalid.clone()).is_err());
        invalid.material_kind = "wood".into();
        invalid.quantity = 0;
        assert!(compile(invalid.clone()).is_err());
        invalid.quantity = 1;
        invalid.duration_s = f64::NAN;
        assert!(compile(invalid.clone()).is_err());
        invalid.duration_s = 1.0;
        invalid.smoke_kg = -1.0;
        assert!(compile(invalid.clone()).is_err());
        invalid.smoke_kg = 0.0;
        invalid.heat_j = 0.0;
        assert!(compile(invalid.clone()).is_err());
        invalid.heat_j = f64::MAX;
        invalid.duration_s = f64::MIN_POSITIVE;
        assert!(compile(invalid).is_err());
    }

    #[test]
    fn quantity_is_definition_data_and_schedule_has_no_source_state() {
        let compiled = compile(definition("wood-fire", "wood")).unwrap();
        let facts = compiled.release().read(Some(0.0), 30.0).unwrap();
        assert_eq!(facts.released["smokeKg"], 0.75);
        assert_eq!(facts.released["heatJ"], 50.0);
        assert_eq!(compiled.definition().material_kind, "wood");
    }
}
