//! Shared water facts and boundaries. The authoritative terrain field owns transport.
use serde::{Deserialize, Serialize};

#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum WaterCellKind { Soil, Void }

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
#[serde(deny_unknown_fields, rename_all = "camelCase")]
pub struct SoilRule { pub id: String, pub porosity: f64, pub retention: f64, pub absorb_m_per_s: f64, pub seep_m_per_s: f64 }

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
#[serde(deny_unknown_fields, rename_all = "camelCase")]
pub struct WaterStock { pub id: String, pub mass_kg: f64 }

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
#[serde(deny_unknown_fields, rename_all = "camelCase")]
pub struct WaterCellFact {
    pub id: String, pub at: [i32; 3], pub kind: WaterCellKind, pub level: u8,
    pub mass_kg: f64, pub capacity_kg: f64, pub mobile_kg: f64,
    pub liquid_volume_m3: f64, pub moisture: f64,
}

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
#[serde(deny_unknown_fields, rename_all = "camelCase")]
pub struct WaterFacts { pub total_kg: f64, pub residual_kg: f64, pub initial_total_kg: f64, pub boundary_kg: f64, pub cells: Vec<WaterCellFact> }

#[derive(Clone, Copy, Debug, PartialEq)]
pub struct WaterLimits { pub cells: usize, pub faces: usize, pub soils: usize, pub max_seconds: f64, pub max_face_work: usize, pub max_state_bytes: usize }
impl Default for WaterLimits { fn default() -> Self { Self { cells: 2_048, faces: 6_144, soils: 64, max_seconds: 60.0, max_face_work: 262_144, max_state_bytes: 256 * 1024 } } }

#[derive(Clone, Debug, Default, PartialEq, Eq, Serialize, Deserialize)]
#[serde(deny_unknown_fields, rename_all = "camelCase")]
pub struct WaterWork { pub faces: usize, pub requests: usize, pub unresolved: usize }

#[derive(Clone, Debug, PartialEq)]
pub enum WaterRebindBlock { RecordCapacity { limit: usize }, WetCellRemoved { at: [i32; 3], mass_kg: f64 }, CapacityExceeded { at: [i32; 3], mass_kg: f64, capacity_kg: f64 } }
