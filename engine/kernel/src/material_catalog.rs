use std::collections::BTreeMap;

use serde::{Deserialize, Serialize};

pub const MAX_ENTRIES: usize = 256;

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct Definition {
    pub kind: String,
    pub unit_volume: u32,
}

#[derive(Clone, Debug, Default)]
pub struct Catalog {
    volumes: BTreeMap<String, u32>,
}

impl Catalog {
    pub fn from_definitions(definitions: Vec<Definition>) -> Result<Self, String> {
        if definitions.len() > MAX_ENTRIES {
            return Err("material catalog exceeds 256 entries".into());
        }
        let mut volumes = BTreeMap::new();
        for definition in definitions {
            if !crate::components::valid_id(&definition.kind)
                || definition.unit_volume == 0
                || volumes
                    .insert(definition.kind, definition.unit_volume)
                    .is_some()
            {
                return Err("invalid or duplicate material catalog entry".into());
            }
        }
        Ok(Self { volumes })
    }

    pub fn unit_volume(&self, kind: &str) -> Option<u32> {
        self.volumes.get(kind).copied()
    }

    pub fn into_definitions(self) -> Vec<Definition> {
        self.volumes
            .into_iter()
            .map(|(kind, unit_volume)| Definition { kind, unit_volume })
            .collect()
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::{json, Value};

    #[test]
    fn rejects_invalid_duplicate_and_overflow_entries() {
        assert!(Catalog::from_definitions(vec![Definition {
            kind: "water".into(),
            unit_volume: 0,
        }])
        .is_err());
        assert!(Catalog::from_definitions(vec![
            Definition {
                kind: "water".into(),
                unit_volume: 1,
            },
            Definition {
                kind: "water".into(),
                unit_volume: 2,
            },
        ])
        .is_err());
        assert!(Catalog::from_definitions(vec![Definition {
            kind: "bad kind".into(),
            unit_volume: 1,
        }])
        .is_err());
        assert_eq!(
            Catalog::from_definitions(vec![Definition {
                kind: "water".into(),
                unit_volume: u32::MAX,
            }])
            .unwrap()
            .unit_volume("water"),
            Some(u32::MAX)
        );
    }

    #[test]
    fn catalog_is_canonical_scene_data_across_save_and_restore() {
        let mut kernel = crate::Kernel::new();
        kernel
            .load(
                &json!({
                    "format": "hive-game",
                    "version": 2,
                    "game": "catalog-roundtrip",
                    "components": [],
                    "materialCatalog": [
                        {"kind": "water", "unitVolume": 1},
                        {"kind": "trunk", "unitVolume": 6}
                    ],
                    "initial": []
                })
                .to_string(),
            )
            .unwrap();

        let saved = kernel.snapshot_json().unwrap();
        let saved_value: Value = serde_json::from_str(&saved).unwrap();
        assert_eq!(
            saved_value["scene"]["materialCatalog"],
            json!([
                {"kind": "trunk", "unitVolume": 6},
                {"kind": "water", "unitVolume": 1}
            ])
        );

        let mut restored = crate::Kernel::new();
        restored.restore_json(&saved).unwrap();
        assert_eq!(restored.snapshot_json().unwrap(), saved);
    }
}
