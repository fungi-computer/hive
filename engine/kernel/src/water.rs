//! Finite, dense-array water transport.
//!
//! This module deliberately owns only direct exchange across admitted physical
//! faces.  It does not discover terrain, infer an exterior, or create one
//! entity per cell.  A compiled graph is reusable across advances; canonical
//! definitions and water state are the only values that cross a save boundary.

use serde::{Deserialize, Serialize};
use serde::de::{self, SeqAccess, Visitor};
use serde::ser::SerializeStruct;
use std::collections::{BTreeMap, BTreeSet};
use std::fmt;
use std::sync::Arc;

pub const WATER_DENSITY_KG_PER_M3: f64 = 1_000.0;
pub const STATE_VERSION: &str = "finite-voxel-water-v1";
pub const MAX_SUBSTEP_SECONDS: f64 = 0.2;
const MAX_WIRE_MASS_VALUES: usize = 2_048;

#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize)]
pub enum WaterStateVersion {
    #[serde(rename = "finite-voxel-water-v1")]
    V1,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum WaterCellKind {
    Soil,
    Void,
}

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
#[serde(deny_unknown_fields, rename_all = "camelCase")]
pub struct SoilRule {
    pub id: String,
    pub porosity: f64,
    pub retention: f64,
    pub absorb_m_per_s: f64,
    pub seep_m_per_s: f64,
}

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
#[serde(deny_unknown_fields, rename_all = "camelCase")]
pub struct CellDefinition {
    pub at: [i32; 3],
    pub kind: WaterCellKind,
    #[serde(default)]
    pub soil_id: Option<String>,
}

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
#[serde(deny_unknown_fields, rename_all = "camelCase")]
pub struct FaceDefinition {
    pub a: [i32; 3],
    pub b: [i32; 3],
    pub open_fraction: f64,
}

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
#[serde(deny_unknown_fields, rename_all = "camelCase")]
pub struct WaterDefinition {
    pub id: String,
    pub revision: u64,
    pub spacing_m: [f64; 3],
    pub soils: Vec<SoilRule>,
    pub cells: Vec<CellDefinition>,
    pub faces: Vec<FaceDefinition>,
    pub fall_m_per_s: f64,
    pub spread_m_per_s: f64,
}

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
#[serde(deny_unknown_fields, rename_all = "camelCase")]
pub struct WaterStock {
    pub id: String,
    pub mass_kg: f64,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(deny_unknown_fields, rename_all = "camelCase")]
pub struct WaterState {
    version: WaterStateVersion,
    binding: WaterBinding,
    mass_kg: Vec<f64>,
    initial_total_kg: f64,
    boundary_kg: f64,
    #[serde(skip)]
    owner: Arc<()>,
}

impl WaterState {
    pub fn version(&self) -> WaterStateVersion { self.version }
    pub fn binding(&self) -> &WaterBinding { &self.binding }
    pub fn masses(&self) -> &[f64] { &self.mass_kg }
    pub fn initial_total_kg(&self) -> f64 { self.initial_total_kg }
    pub fn boundary_kg(&self) -> f64 { self.boundary_kg }
}

impl PartialEq for WaterState {
    fn eq(&self, other: &Self) -> bool {
        self.version == other.version && self.binding == other.binding && self.mass_kg == other.mass_kg && self.initial_total_kg == other.initial_total_kg && self.boundary_kg == other.boundary_kg
    }
}

#[derive(Deserialize)]
#[serde(deny_unknown_fields, rename_all = "camelCase")]
struct WaterStateWire {
    version: WaterStateVersion,
    binding: WaterBinding,
    #[serde(deserialize_with = "deserialize_bounded_masses")]
    mass_kg: Vec<f64>,
    initial_total_kg: f64,
    boundary_kg: f64,
}

fn deserialize_bounded_masses<'de, D: serde::Deserializer<'de>>(deserializer: D) -> Result<Vec<f64>, D::Error> {
    struct MassVisitor;
    impl<'de> Visitor<'de> for MassVisitor {
        type Value = Vec<f64>;

        fn expecting(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
            formatter.write_str("a bounded array of water masses")
        }

        fn visit_seq<A: SeqAccess<'de>>(self, mut sequence: A) -> Result<Self::Value, A::Error> {
            if sequence.size_hint().is_some_and(|hint| hint > MAX_WIRE_MASS_VALUES) {
                return Err(de::Error::custom("water mass array exceeds admission bound"));
            }
            let mut masses = Vec::with_capacity(sequence.size_hint().unwrap_or(0));
            while let Some(mass) = sequence.next_element::<f64>()? {
                if masses.len() == MAX_WIRE_MASS_VALUES {
                    return Err(de::Error::custom("water mass array exceeds admission bound"));
                }
                masses.push(mass);
            }
            Ok(masses)
        }
    }
    deserializer.deserialize_seq(MassVisitor)
}

/// Compact save binding for the immutable canonical definition held by a
/// `CompiledWater`. The definition itself is not duplicated into each state;
/// its revision is the content boundary and must change for any edit.
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct WaterBinding {
    id: Arc<str>,
    revision: u64,
}

impl Serialize for WaterBinding {
    fn serialize<S: serde::Serializer>(&self, serializer: S) -> Result<S::Ok, S::Error> {
        let mut state = serializer.serialize_struct("WaterBinding", 2)?;
        state.serialize_field("id", self.id.as_ref())?;
        state.serialize_field("revision", &self.revision)?;
        state.end()
    }
}

#[derive(Deserialize)]
#[serde(deny_unknown_fields, rename_all = "camelCase")]
struct WaterBindingWire {
    id: String,
    revision: u64,
}

impl<'de> Deserialize<'de> for WaterBinding {
    fn deserialize<D: serde::Deserializer<'de>>(deserializer: D) -> Result<Self, D::Error> {
        let wire = WaterBindingWire::deserialize(deserializer)?;
        Ok(Self { id: Arc::from(wire.id), revision: wire.revision })
    }
}

impl WaterBinding {
    pub fn id(&self) -> &str { self.id.as_ref() }
    pub fn revision(&self) -> u64 { self.revision }
}

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
#[serde(deny_unknown_fields, rename_all = "camelCase")]
pub struct WaterFlow {
    pub face_id: String,
    pub from: String,
    pub to: String,
    pub mass_kg: f64,
}

#[derive(Clone, Debug, Default, PartialEq, Eq, Serialize, Deserialize)]
#[serde(deny_unknown_fields, rename_all = "camelCase")]
pub struct WaterWork {
    pub faces: usize,
    pub requests: usize,
    pub unresolved: usize,
}

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
#[serde(deny_unknown_fields, rename_all = "camelCase")]
pub struct WaterAdvance {
    pub state: WaterState,
    pub seconds: f64,
    pub substeps: Vec<f64>,
    pub flows: Vec<WaterFlow>,
    pub work: WaterWork,
}

/// A geometry change can wait for water without failing unrelated work.
/// `Ready` is a detached candidate, not an authoritative or durable commit.
#[derive(Clone, Debug, PartialEq)]
pub enum WaterRebind {
    Ready(WaterState),
    Blocked(WaterRebindBlock),
}

#[derive(Clone, Debug, PartialEq)]
pub enum WaterRebindBlock {
    WetCellRemoved { at: [i32; 3], mass_kg: f64 },
    CapacityExceeded { at: [i32; 3], mass_kg: f64, capacity_kg: f64 },
}

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
#[serde(deny_unknown_fields, rename_all = "camelCase")]
pub struct WaterCellFact {
    pub id: String,
    pub at: [i32; 3],
    pub kind: WaterCellKind,
    pub mass_kg: f64,
    pub capacity_kg: f64,
    pub mobile_kg: f64,
    pub liquid_volume_m3: f64,
    pub moisture: f64,
}

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
#[serde(deny_unknown_fields, rename_all = "camelCase")]
pub struct WaterFacts {
    pub total_kg: f64,
    pub residual_kg: f64,
    pub initial_total_kg: f64,
    pub boundary_kg: f64,
    pub cells: Vec<WaterCellFact>,
}

#[derive(Clone, Copy, Debug, PartialEq)]
pub struct WaterLimits {
    pub cells: usize,
    pub faces: usize,
    pub soils: usize,
    pub max_seconds: f64,
    pub max_face_work: usize,
    pub max_state_bytes: usize,
}

impl Default for WaterLimits {
    fn default() -> Self {
        Self {
            cells: 2_048,
            faces: 6_144,
            soils: 64,
            max_seconds: 60.0,
            max_face_work: 262_144,
            max_state_bytes: 256 * 1024,
        }
    }
}

#[derive(Clone, Debug)]
struct CompiledNode {
    id: String,
    at: [i32; 3],
    kind: WaterCellKind,
    soil: Option<SoilRule>,
    volume_m3: f64,
    capacity_kg: f64,
    retained_kg: f64,
    base_m: f64,
}

#[derive(Clone, Debug)]
struct CompiledFace {
    id: String,
    a: usize,
    b: usize,
    axis: usize,
    area_m2: f64,
}

#[derive(Clone, Debug)]
struct Request {
    face: usize,
    from: usize,
    to: usize,
    quantity: f64,
    absorption: bool,
}

/// Reusable compiled graph and physical rules. The dense arrays are rebuilt
/// only when this definition is admitted, never for an ordinary advance.
#[derive(Clone, Debug)]
pub struct CompiledWater {
    definition: Arc<WaterDefinition>,
    binding: WaterBinding,
    nodes: Vec<CompiledNode>,
    faces: Vec<CompiledFace>,
    index: BTreeMap<String, usize>,
    limits: WaterLimits,
    owner: Arc<()>,
}

/// Reusable bounded working memory. Keep one alongside the compiled graph and
/// pass it to each advance; it is never part of a checkpoint.
pub struct WaterWorkspace {
    scratch: TransferScratch,
}

pub type WaterResult<T> = Result<T, String>;

fn fail(message: impl Into<String>) -> String {
    message.into()
}

fn finite_nonnegative(value: f64) -> bool {
    value.is_finite() && value >= 0.0
}

fn bounded_id(value: &str, label: &str) -> WaterResult<()> {
    if value.is_empty() || value.len() > 160 || value.contains('\0') {
        return Err(fail(format!("{label} must be a nonempty bounded ID")));
    }
    Ok(())
}

fn cell_id(at: [i32; 3]) -> String {
    format!("cell:{},{},{}", at[0], at[1], at[2])
}

fn face_id(a: [i32; 3], b: [i32; 3]) -> WaterResult<(String, usize)> {
    let distance = [
        a[0].abs_diff(b[0]),
        a[1].abs_diff(b[1]),
        a[2].abs_diff(b[2]),
    ];
    if distance.iter().map(|value| u64::from(*value)).sum::<u64>() != 1 {
        return Err(fail("water face endpoints must be adjacent voxels"));
    }
    let axis = distance.iter().position(|value| *value == 1).unwrap();
    let anchor = [a[0].max(b[0]), a[1].max(b[1]), a[2].max(b[2])];
    Ok((format!("{}:{},{},{}", [b'x', b'y', b'z'][axis] as char, anchor[0], anchor[1], anchor[2]), axis))
}

fn compensated_sum(values: impl IntoIterator<Item = f64>) -> f64 {
    let mut sum = 0.0;
    let mut correction = 0.0;
    for value in values {
        let adjusted = value - correction;
        let next = sum + adjusted;
        correction = (next - sum) - adjusted;
        sum = next;
    }
    sum
}

fn nearly_equal(a: f64, b: f64) -> bool {
    (a - b).abs() <= 1e-9 + 64.0 * f64::EPSILON * a.abs().max(b.abs())
}

/// The arithmetic owner rejects a transfer when either operand cannot
/// represent its signed change at its own scale. A state-wide tolerance is
/// deliberately not used to authorize one-sided quantity changes.
fn resolve_quantity_change(before: f64, delta: f64) -> WaterResult<Option<f64>> {
    let after = before + delta;
    if !before.is_finite() || !delta.is_finite() || !after.is_finite() {
        return Err(fail("water quantity change must be finite"));
    }
    if delta == 0.0 { return Ok(Some(before)); }
    let represented = after - before;
    let error = represented - delta;
    let uncertainty = 4.0 * f64::EPSILON * before.abs().max(after.abs()).max(delta.abs());
    if represented.signum() == delta.signum() && uncertainty < delta.abs() && error.abs() <= uncertainty {
        Ok(Some(after))
    } else {
        Ok(None)
    }
}

impl CompiledWater {
    pub fn compile(mut definition: WaterDefinition, limits: WaterLimits) -> WaterResult<Self> {
        if limits.cells == 0 || limits.cells > MAX_WIRE_MASS_VALUES || limits.faces == 0 || limits.soils == 0 || limits.max_seconds <= 0.0 || !limits.max_seconds.is_finite() || limits.max_face_work == 0 || limits.max_state_bytes == 0 {
            return Err(fail("invalid water admission limits"));
        }
        bounded_id(&definition.id, "water definition ID")?;
        if definition.revision > u64::MAX / 2 {
            return Err(fail("water definition revision exhausted"));
        }
        if definition.spacing_m.iter().any(|value| !value.is_finite() || *value <= 0.0) {
            return Err(fail("water spacing must be finite and positive"));
        }
        if !finite_nonnegative(definition.fall_m_per_s) || !finite_nonnegative(definition.spread_m_per_s) {
            return Err(fail("water flow rates must be finite and nonnegative"));
        }
        if definition.cells.is_empty() || definition.cells.len() > limits.cells {
            return Err(fail("water cell count exceeds admission bound"));
        }
        if definition.faces.len() > limits.faces || definition.soils.len() > limits.soils {
            return Err(fail("water graph exceeds admission bound"));
        }

        let mut soils = BTreeMap::new();
        for soil in definition.soils.drain(..) {
            bounded_id(&soil.id, "soil rule ID")?;
            if soils.insert(soil.id.clone(), soil.clone()).is_some() {
                return Err(fail("duplicate soil rule ID"));
            }
            if !soil.porosity.is_finite() || soil.porosity <= 0.0 || soil.porosity > 1.0 ||
                !soil.retention.is_finite() || soil.retention < 0.0 || soil.retention >= soil.porosity ||
                !finite_nonnegative(soil.absorb_m_per_s) || !finite_nonnegative(soil.seep_m_per_s) {
                return Err(fail("invalid soil capacity or flow rule"));
            }
        }

        let volume_m3 = definition.spacing_m.iter().product::<f64>();
        if !volume_m3.is_finite() || volume_m3 <= 0.0 {
            return Err(fail("water cell volume must be finite and positive"));
        }
        let mut cells = definition.cells;
        cells.sort_by_key(|cell| cell_id(cell.at));
        let mut nodes = Vec::with_capacity(cells.len());
        let mut index = BTreeMap::new();
        for cell in cells {
            let id = cell_id(cell.at);
            if index.insert(id.clone(), nodes.len()).is_some() {
                return Err(fail("duplicate water cell coordinate"));
            }
            let soil = match cell.kind {
                WaterCellKind::Soil => {
                    let soil_id = cell.soil_id.as_deref().ok_or_else(|| fail("soil cell lacks soil rule"))?;
                    Some(soils.get(soil_id).ok_or_else(|| fail("water cell references unknown soil"))?.clone())
                }
                WaterCellKind::Void => {
                    if cell.soil_id.is_some() {
                        return Err(fail("void cell cannot name a soil rule"));
                    }
                    None
                }
            };
            let porosity = soil.as_ref().map_or(1.0, |value| value.porosity);
            let retention = soil.as_ref().map_or(0.0, |value| value.retention);
            let capacity_kg = WATER_DENSITY_KG_PER_M3 * volume_m3 * porosity;
            let retained_kg = WATER_DENSITY_KG_PER_M3 * volume_m3 * retention;
            let base_m = f64::from(cell.at[1]) * definition.spacing_m[1];
            let top_m = base_m + definition.spacing_m[1];
            if !capacity_kg.is_finite() || capacity_kg <= 0.0 || !retained_kg.is_finite() || retained_kg < 0.0 || retained_kg >= capacity_kg || !base_m.is_finite() || !top_m.is_finite() || top_m <= base_m {
                return Err(fail("water cell capacity is not representable"));
            }
            nodes.push(CompiledNode { id, at: cell.at, kind: cell.kind, soil, volume_m3, capacity_kg, retained_kg, base_m });
        }

        let mut faces = Vec::with_capacity(definition.faces.len());
        let mut face_ids = BTreeSet::new();
        for face in definition.faces {
            let (id, axis) = face_id(face.a, face.b)?;
            if face.open_fraction <= 0.0 || face.open_fraction > 1.0 || !face.open_fraction.is_finite() || !face_ids.insert(id.clone()) {
                return Err(fail("invalid or duplicate water face"));
            }
            let a_id = cell_id(face.a);
            let b_id = cell_id(face.b);
            let mut a = *index.get(&a_id).ok_or_else(|| fail("water face endpoint is not a cell"))?;
            let mut b = *index.get(&b_id).ok_or_else(|| fail("water face endpoint is not a cell"))?;
            if a > b { std::mem::swap(&mut a, &mut b); }
            let face_area = volume_m3 / definition.spacing_m[axis] * face.open_fraction;
            if !face_area.is_finite() || face_area <= 0.0 { return Err(fail("water face area is not representable")); }
            faces.push(CompiledFace { id, a, b, axis, area_m2: face_area });
        }
        faces.sort_by(|left, right| left.id.cmp(&right.id));
        definition.soils = soils.into_values().collect();
        definition.cells = nodes.iter().map(|node| CellDefinition { at: node.at, kind: node.kind, soil_id: node.soil.as_ref().map(|soil| soil.id.clone()) }).collect();
        definition.faces = faces.iter().map(|face| FaceDefinition { a: nodes[face.a].at, b: nodes[face.b].at, open_fraction: face.area_m2 * definition.spacing_m[face.axis] / volume_m3 }).collect();
        let binding = WaterBinding { id: Arc::from(definition.id.as_str()), revision: definition.revision };
        Ok(Self { definition: Arc::new(definition), binding, nodes, faces, index, limits, owner: Arc::new(()) })
    }

    pub fn definition(&self) -> &WaterDefinition { &self.definition }
    pub fn binding(&self) -> &WaterBinding { &self.binding }
    pub fn workspace(&self) -> WaterWorkspace { WaterWorkspace::new(self) }

    /// Rebind existing finite stocks after an admitted geometry edit. Newly
    /// represented cells start empty: generation/admission is a separate physical
    /// operation, and this operation cannot manufacture an initial water supply.
    /// The caller commits this candidate with terrain/material changes or drops
    /// it. Both compiled graphs and the input state remain unchanged.
    pub fn prepare_rebind(&self, state: &WaterState, next: &CompiledWater) -> WaterResult<WaterRebind> {
        self.validate_state(state)?;
        if self.binding.id != next.binding.id || next.binding.revision <= self.binding.revision {
            return Err(fail("water geometry replacement requires the same owner and a newer definition"));
        }
        if self.definition.spacing_m != next.definition.spacing_m {
            return Err(fail("water geometry replacement cannot change the world metric"));
        }
        let mut masses = vec![0.0; next.nodes.len()];
        for (node, amount) in self.nodes.iter().zip(&state.mass_kg) {
            let Some(&destination) = next.index.get(&node.id) else {
                if *amount != 0.0 {
                    return Ok(WaterRebind::Blocked(WaterRebindBlock::WetCellRemoved {
                        at: node.at, mass_kg: *amount,
                    }));
                }
                continue;
            };
            let capacity_kg = next.nodes[destination].capacity_kg;
            if *amount > capacity_kg {
                return Ok(WaterRebind::Blocked(WaterRebindBlock::CapacityExceeded {
                    at: node.at, mass_kg: *amount, capacity_kg,
                }));
            }
            masses[destination] = *amount;
        }
        let candidate = WaterState {
            version: WaterStateVersion::V1,
            binding: next.binding.clone(),
            mass_kg: masses,
            initial_total_kg: state.initial_total_kg,
            boundary_kg: state.boundary_kg,
            owner: next.owner.clone(),
        };
        next.validate_state(&candidate)?;
        Ok(WaterRebind::Ready(candidate))
    }

    pub fn initial(&self, stocks: &[WaterStock]) -> WaterResult<WaterState> {
        if stocks.len() != self.nodes.len() { return Err(fail("water initial stock must name every cell exactly once")); }
        let mut mass_kg = vec![0.0; self.nodes.len()];
        let mut seen = BTreeSet::new();
        for stock in stocks {
            let index = *self.index.get(&stock.id).ok_or_else(|| fail("unknown initial water stock cell"))?;
            if !seen.insert(index) || !stock.mass_kg.is_finite() || stock.mass_kg < 0.0 || stock.mass_kg > self.nodes[index].capacity_kg {
                return Err(fail("invalid initial water stock"));
            }
            mass_kg[index] = stock.mass_kg;
        }
        if seen.len() != self.nodes.len() { return Err(fail("water initial stock has missing cells")); }
        let state = WaterState { version: WaterStateVersion::V1, binding: self.binding.clone(), initial_total_kg: compensated_sum(mass_kg.iter().copied()), mass_kg, boundary_kg: 0.0, owner: self.owner.clone() };
        self.validate_state(&state)?;
        Ok(state)
    }

    pub fn validate_state(&self, state: &WaterState) -> WaterResult<()> {
        if !Arc::ptr_eq(&state.owner, &self.owner) { return Err(fail("water state belongs to another compiled graph")); }
        self.validate_state_contents(state)
    }

    fn validate_state_contents(&self, state: &WaterState) -> WaterResult<()> {
        if state.version != WaterStateVersion::V1 || state.binding != self.binding || state.mass_kg.len() != self.nodes.len() || !state.initial_total_kg.is_finite() || state.initial_total_kg < 0.0 || !state.boundary_kg.is_finite() {
            return Err(fail("water state does not match compiled definition"));
        }
        for (amount, node) in state.mass_kg.iter().zip(&self.nodes) {
            if !amount.is_finite() || *amount < 0.0 || *amount > node.capacity_kg { return Err(fail("water stock is outside cell capacity")); }
        }
        let total = compensated_sum(state.mass_kg.iter().copied());
        let residual = compensated_sum([total, -state.initial_total_kg, -state.boundary_kg]);
        if !nearly_equal(residual, 0.0) { return Err(fail("water quantity conservation failed")); }
        Ok(())
    }

    /// Canonical state is small, explicit, and sufficient to restore after
    /// compiling the same definition again. Compiled neighbor caches never
    /// become an independent save truth.
    pub fn encode_state(&self, state: &WaterState) -> WaterResult<Vec<u8>> {
        self.validate_state(state)?;
        let size = postcard::experimental::serialized_size(state)
            .map_err(|error| fail(format!("water state sizing failed: {error}")))?;
        if size > self.limits.max_state_bytes { return Err(fail("water state wire exceeds admission bound")); }
        postcard::to_allocvec(state).map_err(|error| fail(format!("water state encoding failed: {error}")))
    }

    pub fn decode_state(&self, bytes: &[u8]) -> WaterResult<WaterState> {
        if bytes.len() > self.limits.max_state_bytes { return Err(fail("water state wire exceeds admission bound")); }
        let (wire, remaining): (WaterStateWire, _) = postcard::take_from_bytes(bytes)
            .map_err(|error| fail(format!("water state decoding failed: {error}")))?;
        if !remaining.is_empty() { return Err(fail("water state contains trailing bytes")); }
        let state = WaterState { version: wire.version, binding: wire.binding, mass_kg: wire.mass_kg, initial_total_kg: wire.initial_total_kg, boundary_kg: wire.boundary_kg, owner: self.owner.clone() };
        self.validate_state_contents(&state)?;
        Ok(state)
    }

    pub fn facts(&self, state: &WaterState) -> WaterResult<WaterFacts> {
        self.validate_state(state)?;
        let total_kg = compensated_sum(state.mass_kg.iter().copied());
        let residual_kg = compensated_sum([total_kg, -state.initial_total_kg, -state.boundary_kg]);
        Ok(WaterFacts {
            total_kg,
            residual_kg,
            initial_total_kg: state.initial_total_kg,
            boundary_kg: state.boundary_kg,
            cells: self.nodes.iter().enumerate().map(|(index, node)| {
                let mass_kg = state.mass_kg[index];
                WaterCellFact { id: node.id.clone(), at: node.at, kind: node.kind, mass_kg, capacity_kg: node.capacity_kg, mobile_kg: (mass_kg - node.retained_kg).max(0.0), liquid_volume_m3: if node.kind == WaterCellKind::Void { mass_kg / WATER_DENSITY_KG_PER_M3 } else { 0.0 }, moisture: if node.kind == WaterCellKind::Soil { mass_kg / (WATER_DENSITY_KG_PER_M3 * node.volume_m3) } else { 0.0 } }
            }).collect(),
        })
    }

/// Advance an already admitted state. Admission is performed by `initial`
/// or `decode_state`; the private owner token prevents it crossing into a
/// different compiled graph, so a successful tick avoids rescanning every
/// stock.
    pub fn advance(&self, state: &WaterState, seconds: f64, workspace: &mut WaterWorkspace) -> WaterResult<WaterAdvance> {
        self.advance_inner(state, seconds, workspace, false)
    }

    pub fn advance_with_flows(&self, state: &WaterState, seconds: f64, workspace: &mut WaterWorkspace) -> WaterResult<WaterAdvance> {
        self.advance_inner(state, seconds, workspace, true)
    }

    fn advance_inner(&self, state: &WaterState, seconds: f64, workspace: &mut WaterWorkspace, collect_flows: bool) -> WaterResult<WaterAdvance> {
        if !Arc::ptr_eq(&state.owner, &self.owner) || state.version != WaterStateVersion::V1 || state.binding != self.binding || state.mass_kg.len() != self.nodes.len() {
            return Err(fail("water state is not an admitted compiled state"));
        }
        if workspace.scratch.next.len() != self.nodes.len() || workspace.scratch.requests.capacity() < self.faces.len() {
            return Err(fail("water workspace does not match compiled definition"));
        }
        if !seconds.is_finite() || seconds < 0.0 || seconds > self.limits.max_seconds { return Err(fail("water interval is outside bounded admission")); }
        if seconds == 0.0 {
            return Ok(WaterAdvance { state: state.clone(), seconds, substeps: Vec::new(), flows: Vec::new(), work: WaterWork::default() });
        }
        let steps = (seconds / MAX_SUBSTEP_SECONDS).ceil() as usize;
        if steps == 0 || steps > self.limits.max_face_work / self.faces.len().max(1) { return Err(fail("water interval exceeds bounded face work")); }
        let dt_s = seconds / steps as f64;
        let mut mass = state.mass_kg.clone();
        let mut flows: Option<Vec<WaterFlow>> = if collect_flows { Some(Vec::new()) } else { None };
        let mut work = WaterWork { faces: 0, requests: 0, unresolved: 0 };
        for _ in 0..steps {
            let step_work = self.transfer_step(&mass, dt_s, &mut workspace.scratch, flows.as_mut())?;
            mass.copy_from_slice(&workspace.scratch.next);
            work.faces += step_work.faces;
            work.requests += step_work.requests;
            work.unresolved += step_work.unresolved;
        }
        let next = WaterState { version: WaterStateVersion::V1, binding: self.binding.clone(), mass_kg: mass, initial_total_kg: state.initial_total_kg, boundary_kg: state.boundary_kg, owner: self.owner.clone() };
        Ok(WaterAdvance { state: next, seconds, substeps: vec![dt_s; steps], flows: flows.unwrap_or_default(), work })
    }

    fn transfer_step(&self, mass: &[f64], dt_s: f64, scratch: &mut TransferScratch, mut flows: Option<&mut Vec<WaterFlow>>) -> WaterResult<WaterWork> {
        scratch.requests.clear();
        scratch.next.copy_from_slice(mass);
        scratch.outgoing.fill(0.0);
        scratch.incoming.fill(0.0);
        scratch.absorbed.fill(0.0);
        for (face_index, face) in self.faces.iter().enumerate() {
            if let Some(request) = self.request(face_index, face, mass, dt_s)? { scratch.requests.push(request); }
        }
        for request in &scratch.requests {
            scratch.outgoing[request.from] += request.quantity;
            scratch.incoming[request.to] += request.quantity;
            if request.absorption { scratch.absorbed[request.to] += request.quantity; }
        }
        for (index, amount) in mass.iter().enumerate() {
            scratch.available[index] = (amount - self.nodes[index].retained_kg).max(0.0);
            scratch.space[index] = self.nodes[index].capacity_kg - amount;
            scratch.retention_space[index] = (self.nodes[index].retained_kg - amount).max(0.0);
            scratch.remaining[index] = scratch.available[index];
            scratch.receiving[index] = scratch.space[index];
            scratch.retaining[index] = scratch.retention_space[index];
        }
        let mut unresolved = 0;
        for request in &scratch.requests {
            let mut factor: f64 = 1.0;
            if scratch.outgoing[request.from] > 0.0 { factor = factor.min(scratch.available[request.from] / scratch.outgoing[request.from]); }
            if scratch.incoming[request.to] > 0.0 { factor = factor.min(scratch.space[request.to] / scratch.incoming[request.to]); }
            if request.absorption && scratch.absorbed[request.to] > 0.0 { factor = factor.min(scratch.retention_space[request.to] / scratch.absorbed[request.to]); }
            let quantity = (request.quantity * factor).min(scratch.remaining[request.from]).min(scratch.receiving[request.to]).min(scratch.next[request.from]).min(self.nodes[request.to].capacity_kg - scratch.next[request.to]);
            let quantity = if request.absorption { quantity.min(scratch.retaining[request.to]) } else { quantity };
            if !(quantity > 0.0) { continue; }
            let debit = resolve_quantity_change(scratch.next[request.from], -quantity)?;
            let credit = resolve_quantity_change(scratch.next[request.to], quantity)?;
            let (Some(debit), Some(credit)) = (debit, credit) else {
                unresolved += 1;
                continue;
            };
            if debit < 0.0 || credit > self.nodes[request.to].capacity_kg { unresolved += 1; continue; }
            scratch.next[request.from] = debit;
            scratch.next[request.to] = credit;
            scratch.remaining[request.from] -= quantity;
            scratch.receiving[request.to] -= quantity;
            if request.absorption { scratch.retaining[request.to] -= quantity; }
            if let Some(flows) = flows.as_mut() {
                (*flows).push(WaterFlow { face_id: self.faces[request.face].id.clone(), from: self.nodes[request.from].id.clone(), to: self.nodes[request.to].id.clone(), mass_kg: quantity });
            }
        }
        Ok(WaterWork { faces: self.faces.len(), requests: scratch.requests.len(), unresolved })
    }

    fn request(&self, face_index: usize, face: &CompiledFace, mass: &[f64], dt_s: f64) -> WaterResult<Option<Request>> {
        let a = &self.nodes[face.a];
        let b = &self.nodes[face.b];
        if (mass[face.a] - a.retained_kg).max(0.0) == 0.0 && (mass[face.b] - b.retained_kg).max(0.0) == 0.0 { return Ok(None); }
        let soil_index = match (a.kind, b.kind) {
            (WaterCellKind::Soil, WaterCellKind::Void) if mass[face.a] < a.retained_kg => Some((face.a, face.b)),
            (WaterCellKind::Void, WaterCellKind::Soil) if mass[face.b] < b.retained_kg => Some((face.b, face.a)),
            _ => None,
        };
        if let Some((soil_index, void_index)) = soil_index {
            let soil = &self.nodes[soil_index];
            let water = &self.nodes[void_index];
            let deficit = (soil.retained_kg - mass[soil_index]).max(0.0);
            let touching = self.touching(face, water, mass[void_index], soil);
            let rate = soil.soil.as_ref().map_or(0.0, |rule| rule.absorb_m_per_s);
            let quantity = (deficit).min(rate * WATER_DENSITY_KG_PER_M3 * face.area_m2 * dt_s * touching);
            return Ok((quantity > 0.0).then_some(Request { face: face_index, from: void_index, to: soil_index, quantity, absorption: true }));
        }
        let head_a = self.head(a, mass[face.a]);
        let head_b = self.head(b, mass[face.b]);
        if head_a == head_b { return Ok(None); }
        let (from, to, donor, receiver) = if head_a > head_b { (face.a, face.b, a, b) } else { (face.b, face.a, b, a) };
        let soil_rate = donor.soil.as_ref().map(|rule| rule.seep_m_per_s).unwrap_or(f64::INFINITY).min(receiver.soil.as_ref().map(|rule| rule.absorb_m_per_s).unwrap_or(f64::INFINITY));
        let speed = if soil_rate.is_finite() { soil_rate } else if face.axis == 1 { self.definition.fall_m_per_s } else { self.definition.spread_m_per_s };
        let donor_slope = self.definition.spacing_m[1] / (donor.capacity_kg - donor.retained_kg);
        let receiver_slope = self.definition.spacing_m[1] / (receiver.capacity_kg - receiver.retained_kg);
        let equalize = (head_a - head_b).abs() / (donor_slope + receiver_slope) / 6.0;
        let touching = self.touching(face, donor, mass[from], receiver);
        let quantity = equalize.min(speed * WATER_DENSITY_KG_PER_M3 * face.area_m2 * dt_s * touching);
        Ok((quantity > 0.0).then_some(Request { face: face_index, from, to, quantity, absorption: false }))
    }

    fn head(&self, node: &CompiledNode, amount: f64) -> f64 {
        node.base_m + ((amount - node.retained_kg).max(0.0) / (node.capacity_kg - node.retained_kg)) * self.definition.spacing_m[1]
    }

    fn touching(&self, face: &CompiledFace, node: &CompiledNode, amount: f64, other: &CompiledNode) -> f64 {
        if amount <= 0.0 { return 0.0; }
        if node.kind == WaterCellKind::Soil { return 1.0; }
        let fraction = amount / node.capacity_kg;
        if face.axis != 1 { return fraction; }
        if other.at[1] < node.at[1] || fraction == 1.0 { 1.0 } else { 0.0 }
    }
}

struct TransferScratch {
    outgoing: Vec<f64>,
    incoming: Vec<f64>,
    absorbed: Vec<f64>,
    available: Vec<f64>,
    space: Vec<f64>,
    retention_space: Vec<f64>,
    remaining: Vec<f64>,
    receiving: Vec<f64>,
    retaining: Vec<f64>,
    next: Vec<f64>,
    requests: Vec<Request>,
}

impl TransferScratch {
    fn new(nodes: usize, faces: usize) -> Self {
        Self {
            outgoing: vec![0.0; nodes], incoming: vec![0.0; nodes], absorbed: vec![0.0; nodes],
            available: vec![0.0; nodes], space: vec![0.0; nodes], retention_space: vec![0.0; nodes],
            remaining: vec![0.0; nodes], receiving: vec![0.0; nodes], retaining: vec![0.0; nodes],
            next: vec![0.0; nodes], requests: Vec::with_capacity(faces),
        }
    }
}

impl WaterWorkspace {
    fn new(graph: &CompiledWater) -> Self {
        Self { scratch: TransferScratch::new(graph.nodes.len(), graph.faces.len()) }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn soil() -> SoilRule { SoilRule { id: "loam".into(), porosity: 0.4, retention: 0.1, absorb_m_per_s: 0.01, seep_m_per_s: 0.005 } }
    fn definition(cells: Vec<CellDefinition>, faces: Vec<FaceDefinition>) -> WaterDefinition { WaterDefinition { id: "test-water".into(), revision: 0, spacing_m: [0.1, 0.1, 0.1], soils: vec![soil()], cells, faces, fall_m_per_s: 1.0, spread_m_per_s: 0.5 } }
    fn cell(at: [i32; 3]) -> CellDefinition { CellDefinition { at, kind: WaterCellKind::Void, soil_id: None } }
    fn face(a: [i32; 3], b: [i32; 3]) -> FaceDefinition { FaceDefinition { a, b, open_fraction: 1.0 } }
    fn stock(at: [i32; 3], mass_kg: f64) -> WaterStock { WaterStock { id: cell_id(at), mass_kg } }

    #[test]
    fn binary_state_preserves_empty_stock_and_rejects_trailing_bytes() {
        let at = [0, 0, 0];
        let graph = CompiledWater::compile(definition(vec![cell(at)], vec![]), WaterLimits::default()).unwrap();
        let empty = graph.initial(&[stock(at, 0.0)]).unwrap();
        let mut bytes = graph.encode_state(&empty).unwrap();
        assert_eq!(graph.decode_state(&bytes).unwrap(), empty);
        bytes.push(0);
        assert!(graph.decode_state(&bytes).is_err());
        assert!(graph.decode_state(b"{\"version\":1}").is_err());
        let short = &bytes[..2];
        assert!(graph.decode_state(short).is_err());
    }

    #[test]
    fn local_transport_conserves_and_leaves_input_unchanged() {
        let a = [0, 0, 0];
        let b = [1, 0, 0];
        let graph = CompiledWater::compile(definition(vec![cell(a), cell(b)], vec![face(a, b)]), WaterLimits::default()).unwrap();
        let state = graph.initial(&[stock(a, 0.2), stock(b, 0.0)]).unwrap();
        let before = state.clone();
        let mut workspace = graph.workspace();
        let advanced = graph.advance_with_flows(&state, 0.2, &mut workspace).unwrap();
        assert_eq!(state, before);
        assert!(advanced.flows.iter().any(|flow| flow.mass_kg > 0.0));
        assert!(nearly_equal(graph.facts(&advanced.state).unwrap().total_kg, 0.2));
    }

    #[test]
    fn dry_soil_absorbs_without_a_second_moisture_stock() {
        let earth = [0, 0, 0];
        let puddle = [1, 0, 0];
        let mut soil_cell = cell(earth);
        soil_cell.kind = WaterCellKind::Soil;
        soil_cell.soil_id = Some("loam".into());
        let graph = CompiledWater::compile(definition(vec![soil_cell, cell(puddle)], vec![face(earth, puddle)]), WaterLimits::default()).unwrap();
        let state = graph.initial(&[stock(earth, 0.0), stock(puddle, 0.2)]).unwrap();
        let mut workspace = graph.workspace();
        let next = graph.advance(&state, 1.0, &mut workspace).unwrap();
        assert!(next.state.mass_kg[0] > 0.0);
        assert!(nearly_equal(graph.facts(&next.state).unwrap().total_kg, 0.2));
    }

    #[test]
    fn vertical_gravity_head_moves_down() {
        let high = [0, 1, 0];
        let low = [0, 0, 0];
        let graph = CompiledWater::compile(definition(vec![cell(high), cell(low)], vec![face(high, low)]), WaterLimits::default()).unwrap();
        let state = graph.initial(&[stock(high, 0.2), stock(low, 0.0)]).unwrap();
        let mut workspace = graph.workspace();
        let next = graph.advance(&state, 0.2, &mut workspace).unwrap();
        let before = graph.facts(&state).unwrap();
        let after = graph.facts(&next.state).unwrap();
        let before_high = before.cells.iter().find(|cell| cell.at == high).unwrap().mass_kg;
        let before_low = before.cells.iter().find(|cell| cell.at == low).unwrap().mass_kg;
        let after_high = after.cells.iter().find(|cell| cell.at == high).unwrap().mass_kg;
        let after_low = after.cells.iter().find(|cell| cell.at == low).unwrap().mass_kg;
        assert!(after_low > before_low);
        assert!(after_high < before_high);
        assert!(nearly_equal(after.total_kg, before.total_kg));
    }

    #[test]
    fn zero_interval_is_dry_stable_and_invalid_interval_does_not_mutate() {
        let at = [0, 0, 0];
        let graph = CompiledWater::compile(definition(vec![cell(at)], vec![]), WaterLimits::default()).unwrap();
        let state = graph.initial(&[stock(at, 0.1)]).unwrap();
        let mut workspace = graph.workspace();
        assert_eq!(graph.advance(&state, 0.0, &mut workspace).unwrap().state, state);
        assert!(graph.advance(&state, -0.1, &mut workspace).is_err());
        assert_eq!(state.mass_kg, vec![0.1]);
    }

    #[test]
    fn positive_interval_with_no_water_is_dry_stable() {
        let at = [0, 0, 0];
        let graph = CompiledWater::compile(definition(vec![cell(at)], vec![]), WaterLimits::default()).unwrap();
        let state = graph.initial(&[stock(at, 0.0)]).unwrap();
        let mut workspace = graph.workspace();
        let next = graph.advance(&state, 1.0, &mut workspace).unwrap();
        assert_eq!(next.state.mass_kg, state.mass_kg);
        assert!(next.flows.is_empty());
    }

    #[test]
    fn shared_receiver_budget_respects_capacity() {
        let left = [-1, 0, 0];
        let receiver = [0, 0, 0];
        let right = [1, 0, 0];
        let mut receiver_cell = cell(receiver);
        receiver_cell.kind = WaterCellKind::Soil;
        receiver_cell.soil_id = Some("loam".into());
        let mut saturated_soil = soil();
        saturated_soil.porosity = 0.1;
        saturated_soil.retention = 0.0;
        saturated_soil.absorb_m_per_s = 10.0;
        saturated_soil.seep_m_per_s = 10.0;
        let graph = CompiledWater::compile(WaterDefinition { soils: vec![saturated_soil], ..definition(vec![cell(left), receiver_cell, cell(right)], vec![face(left, receiver), face(right, receiver)]) }, WaterLimits::default()).unwrap();
        let state = graph.initial(&[stock(left, 0.8), stock(receiver, 0.0), stock(right, 0.8)]).unwrap();
        let mut workspace = graph.workspace();
        let next = graph.advance(&state, 60.0, &mut workspace).unwrap();
        assert!(next.state.mass_kg[1] <= 0.1);
        assert!(next.state.mass_kg[1] > 0.0);
        assert!(next.state.mass_kg[0] < state.mass_kg[0]);
        assert!(next.state.mass_kg[2] < state.mass_kg[2]);
        assert!(nearly_equal(graph.facts(&next.state).unwrap().total_kg, 1.6));
    }

    #[test]
    fn state_roundtrip_and_stock_reordering_preserve_binding() {
        let a = [0, 0, 0];
        let b = [1, 0, 0];
        let graph = CompiledWater::compile(definition(vec![cell(a), cell(b)], vec![face(a, b)]), WaterLimits::default()).unwrap();
        let first = graph.initial(&[stock(a, 0.2), stock(b, 0.1)]).unwrap();
        let reordered = graph.initial(&[stock(b, 0.1), stock(a, 0.2)]).unwrap();
        assert_eq!(first, reordered);
        let wire = graph.encode_state(&first).unwrap();
        assert_eq!(graph.decode_state(&wire).unwrap(), first);
    }

    #[test]
    fn checked_state_cannot_cross_same_id_compiled_graph() {
        let a = [0, 0, 0];
        let b = [1, 0, 0];
        let first_graph = CompiledWater::compile(definition(vec![cell(a), cell(b)], vec![face(a, b)]), WaterLimits::default()).unwrap();
        let mut other_definition = definition(vec![cell(a), cell(b)], vec![face(a, b)]);
        other_definition.spacing_m = [0.2, 0.1, 0.1];
        let other_graph = CompiledWater::compile(other_definition, WaterLimits::default()).unwrap();
        let state = first_graph.initial(&[stock(a, 0.2), stock(b, 0.1)]).unwrap();
        let other_state = other_graph.initial(&[stock(a, 0.2), stock(b, 0.1)]).unwrap();
        assert_eq!(state, other_state);
        let mut workspace = other_graph.workspace();
        assert!(other_graph.advance(&state, 0.2, &mut workspace).is_err());
    }

    #[test]
    fn unrepresentable_paired_transfer_is_deferred() {
        let before = 1.0e20;
        assert!(resolve_quantity_change(before, 1.0).unwrap().is_none());
        assert!(resolve_quantity_change(before, -1.0).unwrap().is_none());
    }

    #[test]
    fn unrepresentable_paired_transfer_leaves_both_stocks_unchanged() {
        let a = [0, 0, 0];
        let b = [1, 0, 0];
        let graph = CompiledWater::compile(WaterDefinition {
            id: "large-water".into(),
            revision: 0,
            spacing_m: [1.0e7, 1.0e7, 1.0e7],
            soils: vec![soil()],
            cells: vec![cell(a), cell(b)],
            faces: vec![face(a, b)],
            fall_m_per_s: 1.0,
            spread_m_per_s: 5.0e-17,
        }, WaterLimits::default()).unwrap();
        let state = graph.initial(&[stock(a, 1.0e20), stock(b, 0.0)]).unwrap();
        let mut workspace = graph.workspace();
        let next = graph.advance_with_flows(&state, 0.2, &mut workspace).unwrap();
        assert_eq!(next.state.mass_kg, state.mass_kg);
        assert_eq!(next.flows.len(), 0);
        assert_eq!(next.work.unresolved, 1);
    }

    #[test]
    fn admission_rejects_bad_capacity_and_non_adjacent_faces() {
        let mut bad = cell([0, 0, 0]);
        bad.kind = WaterCellKind::Soil;
        bad.soil_id = Some("loam".into());
        let mut rule = soil();
        rule.retention = rule.porosity;
        assert!(CompiledWater::compile(WaterDefinition { soils: vec![rule], ..definition(vec![bad], vec![]) }, WaterLimits::default()).is_err());
        assert!(CompiledWater::compile(definition(vec![cell([0, 0, 0]), cell([2, 0, 0])], vec![face([0, 0, 0], [2, 0, 0])]), WaterLimits::default()).is_err());
    }

    #[test]
    fn rebind_excavation_keeps_pore_water_and_does_not_seed_new_space() {
        let at = [0, 0, 0];
        let added = [-1, 0, 0];
        let mut earth = cell(at);
        earth.kind = WaterCellKind::Soil;
        earth.soil_id = Some("loam".into());
        let old = CompiledWater::compile(definition(vec![earth], vec![]), WaterLimits::default()).unwrap();
        let state = old.initial(&[stock(at, 0.2)]).unwrap();
        let before = old.encode_state(&state).unwrap();
        let mut replacement = definition(vec![cell(at), cell(added)], vec![face(at, added)]);
        replacement.revision = 1;
        let next = CompiledWater::compile(replacement, WaterLimits::default()).unwrap();
        let WaterRebind::Ready(candidate) = old.prepare_rebind(&state, &next).unwrap() else { panic!("excavation should fit"); };
        let facts = next.facts(&candidate).unwrap();
        assert_eq!(facts.cells.iter().find(|cell| cell.at == at).unwrap().mass_kg, 0.2);
        assert_eq!(facts.cells.iter().find(|cell| cell.at == added).unwrap().mass_kg, 0.0);
        assert_eq!(facts.initial_total_kg, 0.2);
        assert_eq!(facts.total_kg, 0.2);
        assert_eq!(old.encode_state(&state).unwrap(), before);
        assert_eq!(next.decode_state(&next.encode_state(&candidate).unwrap()).unwrap(), candidate);
    }

    #[test]
    fn rebind_blocked_geometry_keeps_water_when_a_wet_cell_is_removed_or_filled() {
        let at = [0, 0, 0];
        let dry = [1, 0, 0];
        let old = CompiledWater::compile(definition(vec![cell(at), cell(dry)], vec![face(at, dry)]), WaterLimits::default()).unwrap();
        let state = old.initial(&[stock(at, 0.8), stock(dry, 0.0)]).unwrap();
        let before = old.encode_state(&state).unwrap();
        let mut removed = definition(vec![cell(dry)], vec![]);
        removed.revision = 1;
        let removed = CompiledWater::compile(removed, WaterLimits::default()).unwrap();
        assert!(matches!(old.prepare_rebind(&state, &removed).unwrap(), WaterRebind::Blocked(WaterRebindBlock::WetCellRemoved { .. })));
        let mut earth = cell(at);
        earth.kind = WaterCellKind::Soil;
        earth.soil_id = Some("loam".into());
        let mut filled = definition(vec![earth, cell(dry)], vec![face(at, dry)]);
        filled.revision = 1;
        let filled = CompiledWater::compile(filled, WaterLimits::default()).unwrap();
        assert!(matches!(old.prepare_rebind(&state, &filled).unwrap(), WaterRebind::Blocked(WaterRebindBlock::CapacityExceeded { .. })));
        assert_eq!(old.encode_state(&state).unwrap(), before);
    }

    #[test]
    fn rebind_rejects_foreign_stale_or_rescaled_definitions() {
        let at = [0, 0, 0];
        let definition = definition(vec![cell(at)], vec![]);
        let old = CompiledWater::compile(definition.clone(), WaterLimits::default()).unwrap();
        let state = old.initial(&[stock(at, 0.1)]).unwrap();
        assert!(old.prepare_rebind(&state, &old).is_err());
        let mut foreign = definition.clone();
        foreign.id = "another-region".into();
        foreign.revision = 1;
        let foreign = CompiledWater::compile(foreign, WaterLimits::default()).unwrap();
        assert!(old.prepare_rebind(&state, &foreign).is_err());
        let mut rescaled = definition;
        rescaled.revision = 1;
        rescaled.spacing_m[0] *= 2.0;
        let rescaled = CompiledWater::compile(rescaled, WaterLimits::default()).unwrap();
        assert!(old.prepare_rebind(&state, &rescaled).is_err());
    }
}
