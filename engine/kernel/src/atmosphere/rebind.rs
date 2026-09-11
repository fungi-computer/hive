use super::*;
use std::collections::{BTreeMap, BTreeSet, VecDeque};

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum RebindBlockReason {
    TrappedVolumeRemoved,
    PressureEnvelope,
}

#[derive(Clone, Debug, PartialEq)]
pub struct AtmosphereRebindReceipt {
    pub old_identity: String,
    pub new_identity: String,
    pub old_volume_m3: f64,
    pub new_volume_m3: f64,
    pub carrier_boundary_kg: f64,
    pub smoke_boundary_kg: f64,
    pub heat_boundary_j: f64,
    pub routed_parcels: Vec<(String, Option<Vec<String>>)>,
}

#[derive(Clone, Debug)]
pub enum AtmosphereRebindResult {
    Applied {
        state: AtmosphereState,
        receipt: AtmosphereRebindReceipt,
    },
    Blocked(RebindBlockReason),
}

#[derive(Clone, Copy, Debug, Default)]
struct Stock {
    carrier: f64,
    smoke: f64,
    heat: f64,
}

fn add_stock(before: f64, amount: f64) -> Result<f64, String> {
    resolve_quantity_change(before, amount)?
        .ok_or_else(|| "atmosphere rebind quantity is below resolution".into())
}

fn add_stock_to(target: &mut Stock, amount: Stock) -> Result<(), String> {
    target.carrier = add_stock(target.carrier, amount.carrier)?;
    target.smoke = add_stock(target.smoke, amount.smoke)?;
    target.heat = add_stock(target.heat, amount.heat)?;
    Ok(())
}

fn member_volumes(compiled: &CompiledAtmosphere) -> BTreeMap<String, (usize, f64)> {
    compiled
        .definition
        .volumes
        .iter()
        .enumerate()
        .flat_map(|(index, volume)| {
            volume
                .members
                .iter()
                .map(move |member| (member.cell_id.clone(), (index, member.volume_m3)))
        })
        .collect()
}

fn overlaps(old: &CompiledAtmosphere, next: &CompiledAtmosphere) -> Vec<BTreeMap<usize, f64>> {
    let old_members = member_volumes(old);
    let next_members = member_volumes(next);
    let mut result = vec![BTreeMap::new(); old.definition.volumes.len()];
    for (cell, (old_index, old_amount)) in old_members {
        if let Some((next_index, next_amount)) = next_members.get(&cell) {
            let retained = old_amount.min(*next_amount);
            if retained > 0.0 {
                *result[old_index].entry(*next_index).or_default() += retained;
            }
        }
    }
    result
}

fn topology(compiled: &CompiledAtmosphere) -> (Vec<Vec<usize>>, BTreeSet<usize>) {
    let mut neighbors = vec![Vec::new(); compiled.definition.volumes.len()];
    let mut ambient = BTreeSet::new();
    for opening in &compiled.openings {
        if opening.permeability == 0.0 {
            continue;
        }
        if let Some(right) = opening.to {
            neighbors[opening.from].push(right);
            neighbors[right].push(opening.from);
        } else {
            ambient.insert(opening.from);
        }
    }
    (neighbors, ambient)
}

fn forced_route(
    neighbors: &[Vec<usize>],
    ambient: &BTreeSet<usize>,
    seed: usize,
    receivers: &BTreeSet<usize>,
) -> Option<Option<usize>> {
    let mut pending = VecDeque::from([seed]);
    let mut seen = BTreeSet::new();
    while let Some(index) = pending.pop_front() {
        if !seen.insert(index) {
            continue;
        }
        if index != seed && receivers.contains(&index) {
            return Some(Some(index));
        }
        if ambient.contains(&index) {
            return Some(None);
        }
        pending.extend(neighbors[index].iter().copied());
    }
    None
}

fn direct_displacement_route(
    old: &CompiledAtmosphere,
    next: &CompiledAtmosphere,
    old_index: usize,
    retained: &BTreeSet<usize>,
) -> Option<Option<usize>> {
    let next_members = member_volumes(next);
    let old_volume = &old.definition.volumes[old_index];
    let contracted: BTreeSet<_> = old_volume
        .members
        .iter()
        .filter(|member| {
            next_members
                .get(&member.cell_id)
                .map(|(_, amount)| *amount < member.volume_m3)
                .unwrap_or(true)
        })
        .map(|member| member.cell_id.as_str())
        .collect();
    for opening in &old.definition.openings {
        let from = old.volume_index[&opening.from];
        let to = opening.to.as_ref().map(|id| old.volume_index[id]);
        if opening.permeability == 0.0 {
            continue;
        }
        let from_lost = from == old_index && contracted.contains(opening.from_cell_id.as_str());
        let to_lost = to == Some(old_index)
            && opening
                .to_cell_id
                .as_deref()
                .is_some_and(|cell| contracted.contains(cell));
        if !from_lost && !to_lost {
            continue;
        }
        let other_cell = if from_lost {
            opening.to_cell_id.as_deref()
        } else {
            Some(opening.from_cell_id.as_str())
        };
        let Some(other_cell) = other_cell else {
            return Some(None);
        };
        if let Some((target, _)) = next_members.get(other_cell) {
            if !retained.contains(target) {
                return Some(Some(*target));
            }
        }
    }
    None
}

fn receiver_names(
    next: &CompiledAtmosphere,
    overlap: &[BTreeMap<usize, f64>],
    old_index: usize,
) -> Vec<String> {
    overlap[old_index]
        .keys()
        .map(|index| next.definition.volumes[*index].id.clone())
        .collect()
}

fn allocate(
    targets: &mut [Stock],
    weights: &BTreeMap<usize, f64>,
    input: Stock,
) -> Result<(), String> {
    let entries: Vec<_> = weights
        .iter()
        .filter(|(_, weight)| **weight > 0.0)
        .collect();
    if entries.is_empty() {
        return Err("atmosphere rebind parcel has no receiver".into());
    }
    let mut total: f64 = entries.iter().map(|(_, weight)| **weight).sum();
    if !total.is_finite() || total <= 0.0 {
        return Err("atmosphere rebind receiver weight is invalid".into());
    }
    let mut remaining = input;
    for (position, (index, weight)) in entries.iter().enumerate() {
        let fraction = if position + 1 == entries.len() {
            1.0
        } else {
            **weight / total
        };
        let part = if fraction == 1.0 {
            remaining
        } else {
            Stock {
                carrier: remaining.carrier * fraction,
                smoke: remaining.smoke * fraction,
                heat: remaining.heat * fraction,
            }
        };
        if !part.carrier.is_finite() || !part.smoke.is_finite() || !part.heat.is_finite() {
            return Err("atmosphere rebind allocation is not finite".into());
        }
        add_stock_to(&mut targets[**index], part)?;
        remaining.carrier -= part.carrier;
        remaining.smoke -= part.smoke;
        remaining.heat -= part.heat;
        total -= **weight;
    }
    Ok(())
}

fn compatible(old: &CompiledAtmosphere, next: &CompiledAtmosphere) -> bool {
    old.definition.region_id == next.definition.region_id
        && old.definition.ambient == next.definition.ambient
        && old.definition.model == next.definition.model
        && next.definition.revision > old.definition.revision
}

fn envelope_blocked(compiled: &CompiledAtmosphere, parcels: &[AtmosphereParcel]) -> bool {
    parcels
        .iter()
        .enumerate()
        .any(|(index, parcel)| !compiled.envelope_valid(index, parcel))
}

pub fn rebind(
    old: &CompiledAtmosphere,
    state: &AtmosphereState,
    next: &CompiledAtmosphere,
) -> Result<AtmosphereRebindResult, String> {
    old.validate_state(state)?;
    if !compatible(old, next) {
        return Err("atmosphere rebind requires newer compatible geometry".into());
    }
    let overlap = overlaps(old, next);
    let receivers: BTreeSet<_> = overlap
        .iter()
        .enumerate()
        .filter(|(_, targets)| !targets.is_empty())
        .map(|(index, _)| index)
        .collect();
    let (neighbors, ambient) = topology(old);
    let mut parcels = vec![Stock::default(); next.definition.volumes.len()];
    let mut boundary = Stock::default();
    let mut routed = Vec::new();
    let old_stocks: Vec<_> = state
        .parcels
        .iter()
        .map(|parcel| Stock {
            carrier: parcel.carrier_kg,
            smoke: parcel.smoke_kg,
            heat: parcel.heat_j,
        })
        .collect();
    for (old_index, volume) in old.definition.volumes.iter().enumerate() {
        let direct = &overlap[old_index];
        if !direct.is_empty() {
            let retained_m3: f64 = direct.values().sum();
            let displaced_fraction = (1.0 - retained_m3 / old.volume_m3[old_index]).max(0.0);
            let route = if displaced_fraction > 0.0 {
                direct_displacement_route(old, next, old_index, &direct.keys().copied().collect())
            } else {
                None
            };
            // A contraction with no real face route has no authoritative
            // displacement destination. Keep that stock in the retained
            // allocation; never delete it as an implementation fallback.
            let effective_displaced_fraction = if route.is_some() {
                displaced_fraction
            } else {
                0.0
            };
            let displaced = Stock {
                carrier: old_stocks[old_index].carrier * effective_displaced_fraction,
                smoke: old_stocks[old_index].smoke * effective_displaced_fraction,
                heat: old_stocks[old_index].heat * effective_displaced_fraction,
            };
            let retained = Stock {
                carrier: old_stocks[old_index].carrier - displaced.carrier,
                smoke: old_stocks[old_index].smoke - displaced.smoke,
                heat: old_stocks[old_index].heat - displaced.heat,
            };
            allocate(&mut parcels, direct, retained)?;
            match route {
                Some(Some(target)) => {
                    allocate(&mut parcels, &BTreeMap::from([(target, 1.0)]), displaced)?;
                    routed.push((
                        volume.id.clone(),
                        Some(vec![next.definition.volumes[target].id.clone()]),
                    ));
                }
                Some(None) => {
                    add_stock_to(&mut boundary, displaced)?;
                    routed.push((volume.id.clone(), None));
                }
                None => {}
            }
            continue;
        }
        let stock = old_stocks[old_index];
        if stock.carrier == 0.0 && stock.smoke == 0.0 && stock.heat == 0.0 {
            continue;
        }
        let Some(route) = forced_route(&neighbors, &ambient, old_index, &receivers) else {
            return Ok(AtmosphereRebindResult::Blocked(
                RebindBlockReason::TrappedVolumeRemoved,
            ));
        };
        match route {
            Some(target) => allocate(&mut parcels, &overlap[target], stock)?,
            None => add_stock_to(&mut boundary, stock)?,
        }
        routed.push((
            volume.id.clone(),
            route.map(|target| receiver_names(next, &overlap, target)),
        ));
    }
    let candidate_parcels: Vec<_> = next
        .definition
        .volumes
        .iter()
        .enumerate()
        .map(|(index, volume)| AtmosphereParcel {
            volume_id: volume.id.clone(),
            carrier_kg: parcels[index].carrier,
            smoke_kg: parcels[index].smoke,
            heat_j: parcels[index].heat,
        })
        .collect();
    if envelope_blocked(next, &candidate_parcels) {
        return Ok(AtmosphereRebindResult::Blocked(
            RebindBlockReason::PressureEnvelope,
        ));
    }
    let candidate = AtmosphereState {
        owner: next.owner.clone(),
        version: state.version.clone(),
        identity: next.identity.clone(),
        parcels: candidate_parcels,
        initial_carrier_kg: state.initial_carrier_kg,
        initial_smoke_kg: state.initial_smoke_kg,
        initial_heat_j: state.initial_heat_j,
        smoke_source_kg: state.smoke_source_kg,
        heat_source_j: state.heat_source_j,
        carrier_boundary_kg: add_stock(state.carrier_boundary_kg, boundary.carrier)?,
        smoke_boundary_kg: add_stock(state.smoke_boundary_kg, boundary.smoke)?,
        heat_boundary_j: add_stock(state.heat_boundary_j, boundary.heat)?,
    };
    next.validate_state(&candidate)?;
    let old_volume_m3: f64 = old.volume_m3.iter().sum();
    let new_volume_m3: f64 = next.volume_m3.iter().sum();
    Ok(AtmosphereRebindResult::Applied {
        state: candidate,
        receipt: AtmosphereRebindReceipt {
            old_identity: old.identity.clone(),
            new_identity: next.identity.clone(),
            old_volume_m3,
            new_volume_m3,
            carrier_boundary_kg: boundary.carrier,
            smoke_boundary_kg: boundary.smoke,
            heat_boundary_j: boundary.heat,
            routed_parcels: routed,
        },
    })
}
