//! Finite, dense-array water transport.
//!
//! This module deliberately owns only direct exchange across admitted physical
//! faces.  It does not discover terrain, infer an exterior, or create one
//! entity per cell.  A compiled graph is reusable across advances; canonical
//! definitions and water state are the only values that cross a save boundary.

use serde::{Deserialize, Serialize};
use std::collections::{BTreeMap, BTreeSet};

pub const WATER_DENSITY_KG_PER_M3: f64 = 1_000.0;
pub const STATE_VERSION: &str = "finite-voxel-water-v1";
pub const MAX_SUBSTEP_SECONDS: f64 = 0.2;

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

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
#[serde(deny_unknown_fields, rename_all = "camelCase")]
pub struct WaterState {
    pub version: String,
    pub identity: String,
    pub mass_kg: Vec<f64>,
    pub initial_total_kg: f64,
    pub boundary_kg: f64,
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
}

impl Default for WaterLimits {
    fn default() -> Self {
        Self {
            cells: 2_048,
            faces: 6_144,
            soils: 64,
            max_seconds: 60.0,
            max_face_work: 262_144,
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

#[derive(Clone, Copy, Debug)]
struct Neighbor {
    to: usize,
    face: usize,
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
    pub definition: WaterDefinition,
    pub identity: String,
    nodes: Vec<CompiledNode>,
    faces: Vec<CompiledFace>,
    neighbors: Vec<Vec<Neighbor>>,
    index: BTreeMap<String, usize>,
    limits: WaterLimits,
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
    if distance.iter().sum::<u32>() != 1 {
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

impl CompiledWater {
    pub fn compile(mut definition: WaterDefinition, limits: WaterLimits) -> WaterResult<Self> {
        if limits.cells == 0 || limits.faces == 0 || limits.soils == 0 || limits.max_seconds <= 0.0 || !limits.max_seconds.is_finite() || limits.max_face_work == 0 {
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
            if !capacity_kg.is_finite() || capacity_kg <= 0.0 || !retained_kg.is_finite() || retained_kg < 0.0 || retained_kg >= capacity_kg || !base_m.is_finite() {
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
        let identity = serde_json::to_string(&definition).map_err(|error| fail(format!("water identity encoding failed: {error}")))?;
        let mut neighbors = vec![Vec::new(); nodes.len()];
        for (face_index, face) in faces.iter().enumerate() {
            neighbors[face.a].push(Neighbor { to: face.b, face: face_index });
            neighbors[face.b].push(Neighbor { to: face.a, face: face_index });
        }
        Ok(Self { definition, identity, nodes, faces, neighbors, index, limits })
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
        let state = WaterState { version: STATE_VERSION.into(), identity: self.identity.clone(), initial_total_kg: compensated_sum(mass_kg.iter().copied()), mass_kg, boundary_kg: 0.0 };
        self.validate_state(&state)?;
        Ok(state)
    }

    pub fn validate_state(&self, state: &WaterState) -> WaterResult<()> {
        if state.version != STATE_VERSION || state.identity != self.identity || state.mass_kg.len() != self.nodes.len() || !state.initial_total_kg.is_finite() || state.initial_total_kg < 0.0 || !state.boundary_kg.is_finite() {
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
    pub fn encode_state(&self, state: &WaterState) -> WaterResult<String> {
        self.validate_state(state)?;
        serde_json::to_string(state).map_err(|error| fail(format!("water state encoding failed: {error}")))
    }

    pub fn decode_state(&self, wire: &str) -> WaterResult<WaterState> {
        let state: WaterState = serde_json::from_str(wire).map_err(|error| fail(format!("water state decoding failed: {error}")))?;
        self.validate_state(&state)?;
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

    pub fn advance(&self, state: &WaterState, seconds: f64) -> WaterResult<WaterAdvance> {
        self.validate_state(state)?;
        if !seconds.is_finite() || seconds < 0.0 || seconds > self.limits.max_seconds { return Err(fail("water interval is outside bounded admission")); }
        if seconds == 0.0 {
            return Ok(WaterAdvance { state: state.clone(), seconds, substeps: Vec::new(), flows: Vec::new(), work: WaterWork::default() });
        }
        let steps = (seconds / MAX_SUBSTEP_SECONDS).ceil() as usize;
        if steps == 0 || steps > self.limits.max_face_work / self.faces.len().max(1) { return Err(fail("water interval exceeds bounded face work")); }
        let dt_s = seconds / steps as f64;
        let mut mass = state.mass_kg.clone();
        let mut flows = Vec::new();
        let mut scratch = TransferScratch::new(self.nodes.len(), self.faces.len());
        let mut work = WaterWork { faces: 0, requests: 0, unresolved: 0 };
        for _ in 0..steps {
            let step_work = self.transfer_step(&mass, dt_s, &mut scratch, &mut flows)?;
            mass.copy_from_slice(&scratch.next);
            work.faces += step_work.faces;
            work.requests += step_work.requests;
            work.unresolved += step_work.unresolved;
        }
        let next = WaterState { version: STATE_VERSION.into(), identity: self.identity.clone(), mass_kg: mass, initial_total_kg: state.initial_total_kg, boundary_kg: state.boundary_kg };
        self.validate_state(&next)?;
        Ok(WaterAdvance { state: next, seconds, substeps: vec![dt_s; steps], flows, work })
    }

    fn transfer_step(&self, mass: &[f64], dt_s: f64, scratch: &mut TransferScratch, flows: &mut Vec<WaterFlow>) -> WaterResult<WaterWork> {
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
            let mut factor = 1.0;
            if scratch.outgoing[request.from] > 0.0 { factor = factor.min(scratch.available[request.from] / scratch.outgoing[request.from]); }
            if scratch.incoming[request.to] > 0.0 { factor = factor.min(scratch.space[request.to] / scratch.incoming[request.to]); }
            if request.absorption && scratch.absorbed[request.to] > 0.0 { factor = factor.min(scratch.retention_space[request.to] / scratch.absorbed[request.to]); }
            let quantity = (request.quantity * factor).min(scratch.remaining[request.from]).min(scratch.receiving[request.to]).min(scratch.next[request.from]).min(self.nodes[request.to].capacity_kg - scratch.next[request.to]);
            let quantity = if request.absorption { quantity.min(scratch.retaining[request.to]) } else { quantity };
            if !(quantity > 0.0) { continue; }
            let debit = scratch.next[request.from] - quantity;
            let credit = scratch.next[request.to] + quantity;
            if !debit.is_finite() || !credit.is_finite() || debit < 0.0 || credit > self.nodes[request.to].capacity_kg || debit == scratch.next[request.from] || credit == scratch.next[request.to] {
                unresolved += 1;
                continue;
            }
            scratch.next[request.from] = debit;
            scratch.next[request.to] = credit;
            scratch.remaining[request.from] -= quantity;
            scratch.receiving[request.to] -= quantity;
            if request.absorption { scratch.retaining[request.to] -= quantity; }
            flows.push(WaterFlow { face_id: self.faces[request.face].id.clone(), from: self.nodes[request.from].id.clone(), to: self.nodes[request.to].id.clone(), mass_kg: quantity });
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

#[cfg(test)]
mod tests {
    use super::*;

    fn soil() -> SoilRule { SoilRule { id: "loam".into(), porosity: 0.4, retention: 0.1, absorb_m_per_s: 0.01, seep_m_per_s: 0.005 } }
    fn definition(cells: Vec<CellDefinition>, faces: Vec<FaceDefinition>) -> WaterDefinition { WaterDefinition { id: "test-water".into(), revision: 0, spacing_m: [0.1, 0.1, 0.1], soils: vec![soil()], cells, faces, fall_m_per_s: 1.0, spread_m_per_s: 0.5 } }
    fn cell(at: [i32; 3]) -> CellDefinition { CellDefinition { at, kind: WaterCellKind::Void, soil_id: None } }
    fn face(a: [i32; 3], b: [i32; 3]) -> FaceDefinition { FaceDefinition { a, b, open_fraction: 1.0 } }
    fn stock(at: [i32; 3], mass_kg: f64) -> WaterStock { WaterStock { id: cell_id(at), mass_kg } }

    #[test]
    fn local_transport_conserves_and_leaves_input_unchanged() {
        let a = [0, 0, 0];
        let b = [1, 0, 0];
        let graph = CompiledWater::compile(definition(vec![cell(a), cell(b)], vec![face(a, b)]), WaterLimits::default()).unwrap();
        let state = graph.initial(&[stock(a, 0.2), stock(b, 0.0)]).unwrap();
        let before = state.clone();
        let advanced = graph.advance(&state, 0.2).unwrap();
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
        let next = graph.advance(&state, 1.0).unwrap();
        assert!(next.state.mass_kg[0] > 0.0);
        assert!(nearly_equal(graph.facts(&next.state).unwrap().total_kg, 0.2));
    }

    #[test]
    fn vertical_gravity_head_moves_down() {
        let high = [0, 1, 0];
        let low = [0, 0, 0];
        let graph = CompiledWater::compile(definition(vec![cell(high), cell(low)], vec![face(high, low)]), WaterLimits::default()).unwrap();
        let state = graph.initial(&[stock(high, 0.2), stock(low, 0.0)]).unwrap();
        let next = graph.advance(&state, 0.2).unwrap();
        assert!(next.state.mass_kg[1] > 0.0);
    }

    #[test]
    fn zero_interval_is_dry_stable_and_invalid_interval_does_not_mutate() {
        let at = [0, 0, 0];
        let graph = CompiledWater::compile(definition(vec![cell(at)], vec![]), WaterLimits::default()).unwrap();
        let state = graph.initial(&[stock(at, 0.1)]).unwrap();
        assert_eq!(graph.advance(&state, 0.0).unwrap().state, state);
        assert!(graph.advance(&state, -0.1).is_err());
        assert_eq!(state.mass_kg, vec![0.1]);
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
}
