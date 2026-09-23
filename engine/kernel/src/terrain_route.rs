//! Bounded search over physical support cells, including underground routes.
//! The supplied query reads canonical terrain; this module stores no material grid.
use crate::generation::Cell;
use crate::terrain_traversal::{self, MaterialQuery, TraversalConfig};
use crate::structure_geometry::StairEdge;
use serde::{Deserialize, Serialize};
use std::cmp::Reverse;
use std::collections::{BTreeMap, BTreeSet, BinaryHeap};

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum AdmittedEdge {
    Flat { from: Cell, to: Cell },
    Hop { from: Cell, to: Cell },
    Stair { from: Cell, to: Cell, run: u8, rise: u8 },
}

impl AdmittedEdge {
    fn endpoints(self) -> (Cell, Cell) {
        match self {
            Self::Flat { from, to } | Self::Hop { from, to } | Self::Stair { from, to, .. } => (from, to),
        }
    }

    pub fn waypoint_count(self) -> usize {
        match self { Self::Flat { .. } | Self::Stair { .. } => 1, Self::Hop { .. } => 2 }
    }

    /// Points traversed by the integrator, including both support endpoints.
    pub fn segments(self, spacing: [f64; 3]) -> Result<Vec<crate::components::Point>, String> {
        let (from, to) = self.endpoints();
        let pose = |cell: Cell| crate::components::Point {
            x: cell.x as f64 * spacing[0], y: (f64::from(cell.y) + 0.5) * spacing[1],
            z: cell.z as f64 * spacing[2], frame: None,
        };
        let a = pose(from);
        let b = pose(to);
        let points = match self {
            Self::Flat { .. } | Self::Stair { .. } => vec![a, b],
            Self::Hop { .. } if to.y > from.y => vec![a.clone(), crate::components::Point { y: b.y, ..a }, b],
            Self::Hop { .. } => vec![a.clone(), crate::components::Point { y: a.y, ..b.clone() }, b],
        };
        if points.iter().flat_map(|p| [p.x, p.y, p.z]).all(|v| v.is_finite()) {
            Ok(points)
        } else {
            Err("terrain route metric position is not finite".into())
        }
    }

    /// Geometric length of the segments the movement integrator follows,
    /// rounded upward once to deterministic integer micrometres.
    pub fn planning_cost(self, spacing: [f64; 3]) -> Result<u64, String> {
        waypoint_cost_micrometres(self.segments(spacing)?)
    }
}

pub fn admitted_edge(a: Cell, b: Cell, stairs: &[StairEdge]) -> Result<AdmittedEdge, String> {
    if let Some(stair) = stairs.iter().find(|stair| (stair.entrance == a && stair.landing == b) || (stair.entrance == b && stair.landing == a)) {
        return Ok(AdmittedEdge::Stair { from: a, to: b, run: stair.run, rise: stair.rise });
    }
    let dx = (i128::from(b.x) - i128::from(a.x)).abs();
    let dz = (i128::from(b.z) - i128::from(a.z)).abs();
    let dy = (i64::from(b.y) - i64::from(a.y)).abs();
    if dx + dz != 1 || dy > 1 { return Err("invalid terrain route edge".into()); }
    Ok(if dy == 0 { AdmittedEdge::Flat { from: a, to: b } } else { AdmittedEdge::Hop { from: a, to: b } })
}

pub fn edge_cost(a: Cell, b: Cell, spacing: [f64; 3], stairs: &[StairEdge]) -> Result<u64, String> {
    admitted_edge(a, b, stairs)?.planning_cost(spacing)
}

pub fn path_waypoint_count(path: &[Cell], stairs: &[StairEdge]) -> Result<usize, String> {
    if path.is_empty() { return Err("invalid terrain route geometry".into()); }
    let mut count = 1usize;
    for pair in path.windows(2) { count = count.checked_add(admitted_edge(pair[0], pair[1], stairs)?.waypoint_count()).ok_or("terrain route progress overflow")?; }
    Ok(count)
}

/// Price the exact segments followed by movement. Search edges and external
/// route-cost queries both use this integer metric, so assignment cannot rank
/// a route differently from the movement owner because of a second formula.
pub fn waypoint_cost_micrometres(points: impl IntoIterator<Item = crate::components::Point>) -> Result<u64, String> {
    let mut previous = None;
    let mut total = 0_u64;
    for point in points {
        if let Some(from) = previous.take() {
            let length = crate::navigation::distance(from, point.clone());
            if !length.is_finite() { return Err("route metric cost is not finite".into()); }
            let cost = (length * 1_000_000.0).ceil();
            // At most 4096 movement segments: this per-segment bound keeps
            // path addition deterministic on native and 32-bit WASM hosts.
            if !cost.is_finite() || cost < 0.0 || cost > (1_u64 << 40) as f64 {
                return Err("terrain metric exceeds route cost bounds".into());
            }
            total = total.checked_add(cost as u64).ok_or("route metric cost exceeds bound")?;
        }
        previous = Some(point);
    }
    Ok(total)
}

pub fn search(
    start: Cell,
    destination: Cell,
    config: TraversalConfig,
    query: &mut MaterialQuery<'_>,
) -> Result<Vec<Cell>, String> {
    search_with_blocked(start, destination, config, query, &|_| false)
}

pub fn search_with_blocked(
    start: Cell,
    destination: Cell,
    config: TraversalConfig,
    query: &mut MaterialQuery<'_>,
    blocked: &dyn Fn(Cell) -> bool,
) -> Result<Vec<Cell>, String> {
    search_with_blocked_and_stairs(start, destination, config, query, blocked, &[])
}

pub fn search_with_blocked_and_stairs(
    start: Cell,
    destination: Cell,
    config: TraversalConfig,
    query: &mut MaterialQuery<'_>,
    blocked: &dyn Fn(Cell) -> bool,
    stairs: &[StairEdge],
) -> Result<Vec<Cell>, String> {
    search_any_with_blocked_and_stairs(start, &[destination], config, query, blocked, stairs)
        .map(|(_, path)| path)
}

/// Find the cheapest route to one interchangeable destination. The goal-directed
/// search stops after settling a usable alternative instead of pricing every
/// alternative that the caller will discard.
pub fn search_any_with_blocked_and_stairs(
    start: Cell,
    destinations: &[Cell],
    config: TraversalConfig,
    query: &mut MaterialQuery<'_>,
    blocked: &dyn Fn(Cell) -> bool,
    stairs: &[StairEdge],
) -> Result<(usize, Vec<Cell>), String> {
    search_any_with_blocked_and_stairs_and_crossings(start, destinations, config, query, blocked, stairs, &|_, _| false)
}

/// Search with the same bounded A* frontier while consulting the canonical
/// physical boundary for every cardinal crossing.
pub fn search_any_with_blocked_and_stairs_and_crossings(
    start: Cell,
    destinations: &[Cell],
    config: TraversalConfig,
    query: &mut MaterialQuery<'_>,
    blocked: &dyn Fn(Cell) -> bool,
    stairs: &[StairEdge],
    crossing_blocked: &dyn Fn(Cell, Cell) -> bool,
) -> Result<(usize, Vec<Cell>), String> {
    let mut search = RouteSearch::new(start, destinations, config, query, blocked)?;
    let mut budget = SEARCH_EXPANSIONS;
    search.advance(config, query, blocked, stairs, crossing_blocked, &mut budget)?
        .ok_or_else(|| SEARCH_PENDING.into())
}

/// Intersect supported edge envelopes with the bounded topology journal.
/// Ordered column ranges avoid a path-length times changed-column cross product.
/// An impossible saved edge is conservatively sent through full validation.
pub(crate) fn intersects_columns(path: &[Cell], columns: &[[i64; 2]]) -> bool {
    let columns = columns.iter().map(|[x, z]| (*x, *z)).collect::<BTreeSet<_>>();
    if path.first().is_some_and(|cell| columns.contains(&(cell.x, cell.z))) { return true; }
    path.windows(2).any(|pair| {
        let min_x = pair[0].x.min(pair[1].x);
        let max_x = pair[0].x.max(pair[1].x);
        let min_z = pair[0].z.min(pair[1].z);
        let max_z = pair[0].z.max(pair[1].z);
        // Cardinal edges have width one; StairEdge.run is an admitted u8.
        if i128::from(max_x) - i128::from(min_x) > i128::from(u8::MAX) { return true; }
        (min_x..=max_x).any(|x| columns.range((x, min_z)..=(x, max_z)).next().is_some())
    })
}

pub(crate) const SEARCH_EXPANSIONS: usize = 4096;
pub(crate) const SEARCH_PENDING: &str = "terrain route exceeds local search budget";
const MAX_SEARCH_NODES: usize = 32_768;
type CellKey = (i64, i32, i64);
fn cell_key(cell: Cell) -> CellKey { (cell.x, cell.y, cell.z) }
fn key_cell((x, y, z): CellKey) -> Cell { Cell { x, y, z } }

/// Persistent A* working state, never a physical route or a permission grant.
/// Ordered frontier ties and predecessor updates are identical across yields
/// and serialization. Only the caller's explicit expansion allowance advances it.
#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub(crate) struct RouteSearch {
    start: CellKey,
    goals: Vec<(CellKey, usize)>,
    // Tuple records keep durable state compact. The lookup is rebuilt only on
    // restore, and frontier positions use stable cell keys rather than pointers.
    pub(crate) nodes: Vec<(CellKey, u64, Option<usize>)>,
    frontier: BTreeSet<(u64, u64, usize)>,
    #[serde(skip)]
    lookup: BTreeMap<CellKey, usize>,
    expanded: u64,
}

impl PartialEq for RouteSearch {
    fn eq(&self, other: &Self) -> bool {
        self.start == other.start && self.goals == other.goals && self.nodes == other.nodes
            && self.frontier == other.frontier && self.expanded == other.expanded
    }
}

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub(crate) struct SearchRequest {
    pub(crate) actor: String,
    pub(crate) revision: u64,
    pub(crate) last_used: u64,
    pub(crate) spacing: [f64; 3],
    pub(crate) search: RouteSearch,
}

/// Bounded, durable computation shared by work admission and movement recovery.
/// The occurrence counter is saved: reload cannot replenish an exhausted slice.
#[derive(Clone, Debug, Default, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub(crate) struct SearchBank {
    pub(crate) entries: BTreeMap<String, SearchRequest>,
    pub(crate) occurrence: Option<u64>,
    pub(crate) spent: usize,
    #[serde(skip)]
    pub(crate) changed: BTreeMap<String, u64>,
    #[serde(skip)]
    change_clock: u64,
}

impl PartialEq for SearchBank {
    fn eq(&self, other: &Self) -> bool {
        self.entries == other.entries && self.occurrence == other.occurrence && self.spent == other.spent
    }
}

impl SearchBank {
    fn mark_changed(&mut self, id: String) {
        self.change_clock = self.change_clock.checked_add(1).expect("route search journal exhausted");
        self.changed.insert(id, self.change_clock);
    }
    pub(crate) fn cancel_actor(&mut self, actor: &str) {
        let cancelled = self.entries.iter().filter(|(_, request)| request.actor == actor).map(|(id, _)| id.clone()).collect::<Vec<_>>();
        for id in cancelled { self.entries.remove(&id); self.mark_changed(id); }
    }
    pub(crate) fn acknowledge(&mut self, captured: &BTreeMap<String, u64>) {
        self.changed.retain(|id, generation| captured.get(id) != Some(generation));
    }
    pub(crate) fn validate(&self) -> Result<(), &'static str> {
        if self.entries.len() > 32 || self.spent > SEARCH_EXPANSIONS
            || self.entries.values().map(|request| request.search.nodes.len()).sum::<usize>() > MAX_SEARCH_NODES {
            return Err("retained route search bank exceeds bounds");
        }
        for (id, request) in &self.entries {
            if id.len() != 64 || !id.bytes().all(|byte| byte.is_ascii_hexdigit())
                || !crate::components::valid_id(&request.actor)
                || request.spacing.iter().any(|value| !value.is_finite() || *value <= 0.0)
                || self.occurrence.is_none_or(|occurrence| request.last_used > occurrence) {
                return Err("invalid retained route search request");
            }
            request.search.validate(request.spacing)?;
        }
        Ok(())
    }
    pub(crate) fn search(&mut self, actor: &str, occurrence: u64, revision: u64,
        start: Cell, targets: &[Cell], config: TraversalConfig, blockers: &BTreeSet<crate::navigation::Cell>,
        query: &mut MaterialQuery<'_>, blocked: &dyn Fn(Cell) -> bool, stairs: &[StairEdge],
        crossing: &dyn Fn(Cell, Cell) -> bool) -> Result<(usize, Vec<Cell>), String> {
        use sha2::{Digest, Sha256};
        if self.occurrence != Some(occurrence) {
            self.occurrence = Some(occurrence);
            self.spent = 0;
            let stale = self.entries.iter().filter(|(_, request)| request.revision != revision || occurrence.saturating_sub(request.last_used) > 64)
                .map(|(id, _)| id.clone()).collect::<Vec<_>>();
            for id in stale { self.entries.remove(&id); self.mark_changed(id); }
        }
        if self.spent >= SEARCH_EXPANSIONS { return Err(SEARCH_PENDING.into()); }
        let input = serde_json::to_vec(&(actor, revision, start, targets, config.spacing, config.clearance_cells, config.max_step_cells, blockers))
            .map_err(|error| error.to_string())?;
        let id = format!("{:x}", Sha256::digest(input));
        if !self.entries.contains_key(&id) {
            if self.entries.len() >= 32 { return Err(SEARCH_PENDING.into()); }
            let search = RouteSearch::new(start, targets, config, query, blocked)?;
            self.entries.insert(id.clone(), SearchRequest { actor: actor.into(), revision, last_used: occurrence, spacing: config.spacing, search });
        }
        self.mark_changed(id.clone());
        let retained_nodes: usize = self.entries.iter().filter(|(key, _)| **key != id).map(|(_, request)| request.search.nodes.len()).sum();
        let request = self.entries.get_mut(&id).expect("search admitted above");
        if request.search.start != cell_key(start) || request.spacing != config.spacing
            || request.search.goals.iter().any(|(goal, index)| targets.get(*index).copied().map(cell_key) != Some(*goal)) {
            return Err("retained route search request mismatch".into());
        }
        request.last_used = occurrence;
        let mut budget = SEARCH_EXPANSIONS - self.spent;
        let before = budget;
        let result = request.search.advance(config, query, blocked, stairs, crossing, &mut budget);
        self.spent += before - budget;
        if retained_nodes + request.search.nodes.len() > MAX_SEARCH_NODES {
            self.entries.remove(&id);
            return Err("terrain route retained state limit exceeded".into());
        }
        match result {
            Ok(None) => Err(SEARCH_PENDING.into()),
            Ok(Some(route)) => {
                self.entries.remove(&id);
                // Restored computation is untrusted input until its complete
                // physical witness is checked by the same traversal owner.
                if route.1.len() > 4096 { return Err("terrain route waypoint budget exceeded".into()); }
                if !terrain_traversal::path_supported_with_stairs(&route.1, config, query, stairs)?
                    || route.1.iter().skip(1).copied().any(blocked)
                    || route.1.windows(2).any(|pair| crossing(pair[0], pair[1])) {
                    return Err("invalid retained route search result".into());
                }
                Ok(route)
            },
            Err(error) => { self.entries.remove(&id); Err(error) },
        }
    }
}

impl RouteSearch {
    fn heuristic(&self, current: CellKey, spacing: [f64; 3]) -> u64 {
        self.goals.iter().map(|(goal, _)| {
            let dx = (goal.0 as f64 - current.0 as f64) * spacing[0];
            let dy = (f64::from(goal.1) - f64::from(current.1)) * spacing[1];
            let dz = (goal.2 as f64 - current.2 as f64) * spacing[2];
            (dx.hypot(dy).hypot(dz) * 1_000_000.0).floor() as u64
        }).min().unwrap_or(0)
    }
    pub(crate) fn new(start: Cell, destinations: &[Cell], config: TraversalConfig,
        query: &mut MaterialQuery<'_>, blocked: &dyn Fn(Cell) -> bool) -> Result<Self, String> {
        if destinations.is_empty() || destinations.len() > 32 || terrain_traversal::node(start, config, query)?.is_none() {
            return Err("route endpoint lacks support or clearance".into());
        }
        let mut goals = BTreeMap::new();
        for (index, destination) in destinations.iter().copied().enumerate() {
            if !blocked(destination) && terrain_traversal::node(destination, config, query)?.is_some() {
                goals.entry(cell_key(destination)).or_insert(index);
            }
        }
        if goals.is_empty() { return Err("route endpoint lacks support or clearance".into()); }
        let start = cell_key(start);
        let mut search = Self { start, goals: goals.into_iter().collect(),
            nodes: vec![(start, 0, None)], lookup: BTreeMap::from([(start, 0)]), frontier: BTreeSet::new(), expanded: 0 };
        search.frontier.insert((search.heuristic(start, config.spacing), 0, 0));
        Ok(search)
    }
    pub(crate) fn validate(&self, spacing: [f64; 3]) -> Result<(), &'static str> {
        if self.nodes.is_empty() || self.nodes.len() > MAX_SEARCH_NODES || self.goals.is_empty() || self.goals.len() > 32
            || self.nodes.first() != Some(&(self.start, 0, None)) || self.frontier.is_empty() || self.frontier.len() > self.nodes.len()
            || self.goals.iter().any(|(_, index)| *index >= 32)
            || self.goals.windows(2).any(|pair| pair[0].0 >= pair[1].0) {
            return Err("invalid retained route search bounds");
        }
        let mut seen = BTreeSet::new();
        for (index, (key, cost, parent)) in self.nodes.iter().enumerate() {
            if !seen.insert(*key) || (index != 0 && parent.is_none()) { return Err("retained route search has duplicate or disconnected node"); }
            if let Some(parent) = parent {
                if self.nodes.get(*parent).is_none_or(|(_, previous, _)| previous >= cost) {
                    return Err("invalid retained route search predecessor");
                }
            }
        }
        for (estimate, cost, index) in &self.frontier {
            let Some((key, known, _)) = self.nodes.get(*index) else { return Err("invalid retained route search frontier"); };
            if known != cost || cost.checked_add(self.heuristic(*key, spacing)) != Some(*estimate) {
                return Err("invalid retained route search frontier");
            }
        }
        Ok(())
    }
    pub(crate) fn advance(&mut self, config: TraversalConfig, query: &mut MaterialQuery<'_>,
        blocked: &dyn Fn(Cell) -> bool, stairs: &[StairEdge], crossing_blocked: &dyn Fn(Cell, Cell) -> bool,
        budget: &mut usize) -> Result<Option<(usize, Vec<Cell>)>, String> {
        if self.lookup.len() != self.nodes.len() {
            self.lookup = self.nodes.iter().enumerate().map(|(index, (key, _, _))| (*key, index)).collect();
        }
        while *budget > 0 {
            let Some((_, cost, current_index)) = self.frontier.pop_first() else { return Err("no supported terrain route".into()); };
            let current = self.nodes[current_index].0;
            *budget -= 1;
            self.expanded = self.expanded.checked_add(1).ok_or("retained route expansion counter overflow")?;
            if let Some((_, index)) = self.goals.iter().find(|(goal, _)| *goal == current) {
                let mut path = vec![key_cell(current)];
                let mut cursor = current_index;
                while let Some(parent) = self.nodes[cursor].2 {
                    path.push(key_cell(self.nodes[parent].0));
                    cursor = parent;
                }
                path.reverse();
                return Ok(Some((*index, path)));
            }
            let Some(from) = terrain_traversal::node(key_cell(current), config, query)? else { continue };
            let mut neighbors = Vec::with_capacity(14);
            for (dx, dz) in [(1, 0), (0, 1), (-1, 0), (0, -1)] {
                for dy in [0, 1, -1] {
                    if let Some(next) = terrain_traversal::step(from, dx, dy, dz, config, query)? {
                        if !blocked(next.support) && !crossing_blocked(key_cell(current), next.support) { neighbors.push(next.support); }
                    }
                }
            }
            for stair in stairs {
                let target = if stair.entrance == key_cell(current) { stair.landing }
                    else if stair.landing == key_cell(current) { stair.entrance } else { continue };
                if !blocked(target) && !crossing_blocked(key_cell(current), target)
                    && terrain_traversal::stair_step(from, target, stair, config, query)?.is_some() { neighbors.push(target); }
            }
            for next in neighbors {
                let key = cell_key(next);
                let next_cost = cost.checked_add(edge_cost(key_cell(current), next, config.spacing, stairs)?).ok_or("route metric cost exceeds bound")?;
                let prior = self.lookup.get(&key).copied();
                if prior.is_some_and(|index| self.nodes[index].1 <= next_cost) { continue; }
                let heuristic = self.heuristic(key, config.spacing);
                let index = if let Some(index) = prior {
                    self.frontier.remove(&(self.nodes[index].1.saturating_add(heuristic), self.nodes[index].1, index));
                    self.nodes[index] = (key, next_cost, Some(current_index));
                    index
                } else {
                    if self.nodes.len() >= MAX_SEARCH_NODES { return Err("terrain route retained state limit exceeded".into()); }
                    let index = self.nodes.len();
                    self.nodes.push((key, next_cost, Some(current_index)));
                    self.lookup.insert(key, index);
                    index
                };
                self.frontier.insert((next_cost.checked_add(heuristic).ok_or("route metric cost exceeds bound")?, next_cost, index));
            }
        }
        if self.frontier.is_empty() { Err("no supported terrain route".into()) } else { Ok(None) }
    }
}

/// Search one terrain frontier until every requested destination is reached.
/// The frontier and predecessor map are shared across destinations; this is
/// the same movement graph and edge metric as `search_with_blocked_and_stairs`.
pub fn search_many_with_blocked_and_stairs(
    start: Cell,
    destinations: &[Cell],
    config: TraversalConfig,
    query: &mut MaterialQuery<'_>,
    blocked: &dyn Fn(Cell) -> bool,
    stairs: &[StairEdge],
    crossing_blocked: &dyn Fn(Cell, Cell) -> bool,
) -> Result<Vec<Result<Vec<Cell>, String>>, String> {
    if destinations.is_empty() { return Ok(Vec::new()); }
    if terrain_traversal::node(start, config, query)?.is_none() {
        return Err("route endpoint lacks support or clearance".into());
    }
    let key = |cell: Cell| (cell.x, cell.y, cell.z);
    let cell = |(x, y, z): (i64, i32, i64)| Cell { x, y, z };
    let mut targets: BTreeSet<_> = destinations.iter().copied().map(key).collect();
    let mut invalid_targets = BTreeSet::new();
    for destination in destinations {
        if terrain_traversal::node(*destination, config, query)?.is_none() {
            invalid_targets.insert(key(*destination));
        }
    }
    targets.retain(|target| !invalid_targets.contains(target));
    let mut frontier = BinaryHeap::new();
    frontier.push(Reverse((0_u64, key(start))));
    let mut distance = BTreeMap::new();
    let mut predecessor = BTreeMap::new();
    distance.insert(key(start), 0_u64);
    let mut reached = BTreeSet::new();
    let mut expanded = 0usize;
    let mut failure = None;
    while let Some(Reverse((cost, current))) = frontier.pop() {
        if distance.get(&current).copied() != Some(cost) { continue; }
        if !reached.contains(&current) && targets.contains(&current) { reached.insert(current); }
        if reached.len() == targets.len() { break; }
        expanded += 1;
        if expanded > 4096 {
            failure = Some("terrain route exceeds local search budget".to_string());
            break;
        }
        let from_cell = cell(current);
        let from = match terrain_traversal::node(from_cell, config, query) {
            Ok(Some(node)) => node,
            Ok(None) => continue,
            Err(error) => { failure = Some(error); break; }
        };
        let mut neighbors = Vec::with_capacity(12 + stairs.len());
        for (dx, dz) in [(1, 0), (0, 1), (-1, 0), (0, -1)] {
            for dy in [0, 1, -1] {
                match terrain_traversal::step(from, dx, dy, dz, config, query) {
                    Ok(Some(next)) if !blocked(next.support) && !crossing_blocked(from_cell, next.support) => match edge_cost(from_cell, next.support, config.spacing, stairs) {
                        Ok(edge) => neighbors.push((next.support, edge)),
                        Err(error) => { failure = Some(error); break; }
                    },
                    Ok(Some(_)) | Ok(None) => {},
                    Err(error) => { failure = Some(error); break; }
                }
            }
            if failure.is_some() { break; }
        }
        if failure.is_none() {
            for stair in stairs {
                let target = if stair.entrance == from_cell { stair.landing }
                    else if stair.landing == from_cell { stair.entrance }
                    else { continue };
                if blocked(target) || crossing_blocked(from_cell, target) { continue; }
                if let Ok(Some(next)) = terrain_traversal::stair_step(from, target, stair, config, query) {
                    match edge_cost(from_cell, next.support, config.spacing, stairs) {
                        Ok(edge) => neighbors.push((next.support, edge)),
                        Err(error) => { failure = Some(error); break; }
                    }
                }
            }
        }
        if failure.is_some() { break; }
        for (next, edge) in neighbors {
            let next_key = key(next);
            let next_cost = cost.checked_add(edge).ok_or("terrain route cost exceeds bound")?;
            if distance.get(&next_key).is_none_or(|prior| next_cost < *prior) {
                distance.insert(next_key, next_cost);
                predecessor.insert(next_key, current);
                frontier.push(Reverse((next_cost, next_key)));
            }
        }
    }
    let mut results = Vec::with_capacity(destinations.len());
    for destination in destinations {
        let destination = key(*destination);
        if invalid_targets.contains(&destination) {
            results.push(Err("route endpoint lacks support or clearance".into()));
            continue;
        }
        if !reached.contains(&destination) {
            if let Some(error) = failure.clone() { results.push(Err(error)); continue; }
            results.push(Err("no supported terrain route".into()));
            continue;
        }
        let mut path = vec![destination];
        let mut cursor = destination;
        while cursor != key(start) {
            cursor = *predecessor.get(&cursor).ok_or("invalid terrain route predecessor")?;
            path.push(cursor);
        }
        path.reverse();
        results.push(Ok(path.into_iter().map(cell).collect()));
    }
    Ok(results)
}

/// Convert admitted support edges to movement segments. Rise before crossing a
/// higher voxel; cross before descending. Straight diagonal interpolation would
/// put the actor's feet inside the high voxel's side face.
pub fn waypoints(path: &[Cell], config: TraversalConfig) -> Result<Vec<crate::components::Point>, String> {
    waypoints_with_stairs(path, config, &[])
}

pub fn waypoints_with_stairs(path: &[Cell], config: TraversalConfig, stairs: &[StairEdge]) -> Result<Vec<crate::components::Point>, String> {
    use crate::components::Point;
    let pose = |cell: Cell| -> Result<Point, String> {
        let point = Point {
            x: cell.x as f64 * config.spacing[0],
            y: (f64::from(cell.y) + 0.5) * config.spacing[1],
            z: cell.z as f64 * config.spacing[2],
            frame: None,
        };
        if ![point.x, point.y, point.z].iter().all(|v| v.is_finite()) {
            return Err("terrain route metric position is not finite".into());
        }
        Ok(point)
    };
    if path.is_empty() || path.len() > 4097 || config.spacing.iter().any(|v| !v.is_finite() || *v <= 0.0) {
        return Err("invalid terrain route geometry".into());
    }
    let mut points = vec![pose(path[0])?];
    for pair in path.windows(2) {
        let a = pair[0];
        let b = pair[1];
        let edge = admitted_edge(a, b, stairs)?;
        let emitted = edge.segments(config.spacing)?;
        // The first point is already present as the preceding edge endpoint.
        points.extend(emitted.into_iter().skip(1));
    }
    Ok(points)
}

/// Support edge containing the next movement waypoint. Earlier cells are history,
/// not terrain that the actor still needs in order to finish the route.
pub fn active_support_index(path: &[Cell], next_waypoint: usize) -> Result<usize, String> {
    active_support_index_with_stairs(path, next_waypoint, &[])
}

pub fn active_support_index_with_stairs(path: &[Cell], next_waypoint: usize, stairs: &[StairEdge]) -> Result<usize, String> {
    if next_waypoint == 0 { return Err("invalid terrain waypoint progress".into()); }
    let mut end = 0usize;
    for (index, pair) in path.windows(2).enumerate() {
        let edge = admitted_edge(pair[0], pair[1], stairs)?;
        end += edge.waypoint_count();
        if next_waypoint <= end { return Ok(index); }
    }
    Err("terrain waypoint progress exceeds route".into())
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::terrain_traversal::TraversalMaterial;
    use std::collections::BTreeSet;

    #[test]
    fn search_uses_deep_support_and_climbs_one_voxel() {
        let solid: BTreeSet<_> = [(0,-20,0),(1,-19,0),(2,-19,0)].into_iter().collect();
        let mut query = |at: Cell| Ok(TraversalMaterial { solid: solid.contains(&(at.x,at.y,at.z)), outside: false, sealed_top: false });
        let start = Cell { x:0,y:-20,z:0 };
        let end = Cell { x:2,y:-19,z:0 };
        let config = TraversalConfig { spacing:[1.0,0.54,1.0],clearance_cells:1,max_step_cells:1 };
        assert_eq!(search(start,end,config,&mut query).unwrap(),vec![start,Cell{x:1,y:-19,z:0},end]);
    }

    #[test]
    fn step_segments_do_not_cut_through_high_voxel_faces() {
        let config = TraversalConfig { spacing:[1.0,0.54,1.0],clearance_cells:1,max_step_cells:1 };
        let low = Cell{x:0,y:-3,z:0};
        let high = Cell{x:1,y:-2,z:0};
        let up = waypoints(&[low,high],config).unwrap();
        assert_eq!(up.len(),3);
        assert_eq!(up[0].x,up[1].x);
        assert_eq!(up[1].y,up[2].y);
        let down = waypoints(&[high,low],config).unwrap();
        assert_eq!(down[0].y,down[1].y);
        assert_eq!(down[1].x,down[2].x);
    }

    #[test]
    fn search_rejects_a_two_voxel_cliff() {
        let mut query = |at: Cell| Ok(TraversalMaterial { solid: [(0,0,0),(1,2,0)].contains(&(at.x,at.y,at.z)), outside: false, sealed_top: false });
        let config = TraversalConfig { spacing:[1.0,0.54,1.0],clearance_cells:1,max_step_cells:1 };
        assert!(search(Cell{x:0,y:0,z:0},Cell{x:1,y:2,z:0},config,&mut query).is_err());
    }

    #[test]
    fn committed_stair_is_the_only_four_way_four_voxel_route_edge() {
        let config = TraversalConfig { spacing:[1.0,0.54,1.0],clearance_cells:1,max_step_cells:1 };
        let origin = Cell{x:0,y:0,z:0};
        for (index, orientation) in [
            crate::structure_geometry::Cardinal::North,
            crate::structure_geometry::Cardinal::East,
            crate::structure_geometry::Cardinal::South,
            crate::structure_geometry::Cardinal::West,
        ].into_iter().enumerate() {
            let (dx, dz) = orientation.delta();
            let entrance = origin;
            let landing = Cell { x: origin.x + dx * 2, y: 4, z: origin.z + dz * 2 };
            let solid: BTreeSet<_> = [entrance, landing].into_iter().collect();
            let stair = StairEdge { id:format!("stair-{index}"), entrance, landing, orientation, run:2, rise:4 };
            let mut query = |at: Cell| Ok(TraversalMaterial { solid: solid.contains(&at), outside:false, sealed_top:false });
            assert!(search(entrance, landing, config, &mut query).is_err());
            let mut query = |at: Cell| Ok(TraversalMaterial { solid: solid.contains(&at), outside:false, sealed_top:false });
            let up = search_with_blocked_and_stairs(entrance, landing, config, &mut query, &|_| false, std::slice::from_ref(&stair)).unwrap();
            assert_eq!(up, vec![entrance, landing]);
            let mut query = |at: Cell| Ok(TraversalMaterial { solid: solid.contains(&at), outside:false, sealed_top:false });
            assert!(terrain_traversal::path_supported_with_stairs(&up, config, &mut query, std::slice::from_ref(&stair)).unwrap());
            assert_eq!(waypoints_with_stairs(&up, config, std::slice::from_ref(&stair)).unwrap().len(), 2);
            let mut query = |at: Cell| Ok(TraversalMaterial { solid: solid.contains(&at), outside:false, sealed_top:false });
            let down = search_with_blocked_and_stairs(landing, entrance, config, &mut query, &|_| false, std::slice::from_ref(&stair)).unwrap();
            assert_eq!(down, vec![landing, entrance]);
            let mut query = |at: Cell| Ok(TraversalMaterial { solid: solid.contains(&at), outside:false, sealed_top:false });
            assert!(terrain_traversal::path_supported_with_stairs(&down, config, &mut query, std::slice::from_ref(&stair)).unwrap());
            assert_eq!(waypoints_with_stairs(&down, config, std::slice::from_ref(&stair)).unwrap().len(), 2);
            let mut query = |at: Cell| Ok(TraversalMaterial { solid: solid.contains(&at), outside:false, sealed_top:false });
            assert!(search_with_blocked_and_stairs(entrance, landing, config, &mut query, &|_| false, &[]).is_err());
        }
    }

    #[test]
    fn weighted_cost_charges_rise_and_cross_geometry() {
        let config = TraversalConfig { spacing:[1.0,0.54,1.0],clearance_cells:1,max_step_cells:1 };
        let flat = edge_cost(Cell{x:0,y:0,z:0}, Cell{x:1,y:0,z:0}, config.spacing, &[]).unwrap();
        let climb = edge_cost(Cell{x:0,y:0,z:0}, Cell{x:1,y:1,z:0}, config.spacing, &[]).unwrap();
        assert!(climb > flat);
        let stair = StairEdge { id: "metric".into(), entrance: Cell{x:0,y:0,z:0}, landing: Cell{x:2,y:4,z:0}, orientation: crate::structure_geometry::Cardinal::East, run: 2, rise: 4 };
        let stair_cost = edge_cost(stair.entrance, stair.landing, config.spacing, std::slice::from_ref(&stair)).unwrap();
        assert_eq!(stair_cost, (2.0f64.hypot(4.0 * 0.54) * 1_000_000.0).ceil() as u64);
    }

    #[test]
    fn admitted_edge_cost_and_emitted_geometry_are_the_same_rule() {
        let config = TraversalConfig { spacing:[1.0,0.54,1.0],clearance_cells:1,max_step_cells:1 };
        let edges = [
            AdmittedEdge::Flat { from: Cell{x:0,y:0,z:0}, to: Cell{x:1,y:0,z:0} },
            AdmittedEdge::Hop { from: Cell{x:0,y:0,z:0}, to: Cell{x:1,y:1,z:0} },
            AdmittedEdge::Hop { from: Cell{x:1,y:1,z:0}, to: Cell{x:0,y:0,z:0} },
            AdmittedEdge::Stair { from: Cell{x:0,y:0,z:0}, to: Cell{x:2,y:4,z:0}, run:2, rise:4 },
        ];
        for edge in edges {
            let points = edge.segments(config.spacing).unwrap();
            let expected: u64 = points.windows(2).map(|pair| {
                (crate::navigation::distance(pair[0].clone(), pair[1].clone()) * 1_000_000.0).ceil() as u64
            }).sum();
            assert_eq!(edge.planning_cost(config.spacing).unwrap(), expected);
        }
        assert_eq!(path_waypoint_count(&[edges[0].endpoints().0, edges[0].endpoints().1], &[]).unwrap(), 2);
    }

    #[test]
    fn outside_material_blocks_support_and_ceiling() {
        let config = TraversalConfig { spacing:[1.0,1.0,1.0],clearance_cells:1,max_step_cells:1 };
        let mut query = |cell: Cell| Ok(TraversalMaterial { solid: cell.y == 0, outside: cell.x < 0, sealed_top: false });
        assert!(terrain_traversal::node(Cell{x:-1,y:0,z:0}, config, &mut query).unwrap().is_none());
    }

    #[test]
    fn shared_search_returns_ordered_paths_for_multiple_destinations() {
        let config = TraversalConfig { spacing:[1.0,1.0,1.0], clearance_cells:1, max_step_cells:1 };
        let solid: BTreeSet<_> = (0..=3).map(|x| (x, 0, 0)).collect();
        let mut query = |at: Cell| Ok(TraversalMaterial { solid: solid.contains(&(at.x as i32, at.y, at.z as i32)), outside:false, sealed_top:false });
        let start = Cell { x:0, y:0, z:0 };
        let destinations = [Cell { x:3, y:0, z:0 }, Cell { x:1, y:0, z:0 }];
        let paths = search_many_with_blocked_and_stairs(start, &destinations, config, &mut query, &|_| false, &[], &|_, _| false).unwrap();
        assert_eq!(paths[0].as_ref().unwrap().last(), Some(&destinations[0]));
        assert_eq!(paths[1].as_ref().unwrap().last(), Some(&destinations[1]));
        assert_eq!(paths[0].as_ref().unwrap().first(), Some(&start));
    }

    #[test]
    fn shared_search_keeps_invalid_endpoint_failure_at_its_input_position() {
        let config = TraversalConfig { spacing:[1.0,1.0,1.0], clearance_cells:1, max_step_cells:1 };
        let solid: BTreeSet<_> = (0..=2).map(|x| (x, 0, 0)).collect();
        let mut query = |at: Cell| Ok(TraversalMaterial { solid: solid.contains(&(at.x as i32, at.y, at.z as i32)), outside:false, sealed_top:false });
        let start = Cell { x:0, y:0, z:0 };
        let destinations = [Cell { x:9, y:0, z:0 }, Cell { x:2, y:0, z:0 }];
        let paths = search_many_with_blocked_and_stairs(start, &destinations, config, &mut query, &|_| false, &[], &|_, _| false).unwrap();
        assert_eq!(paths[0].as_ref().unwrap_err(), "route endpoint lacks support or clearance");
        assert_eq!(paths[1].as_ref().unwrap().last(), Some(&destinations[1]));
    }

    #[test]
    fn route_to_any_returns_the_nearest_valid_input_without_pricing_every_goal() {
        let config = TraversalConfig { spacing:[1.0,1.0,1.0], clearance_cells:1, max_step_cells:1 };
        let mut queries = 0usize;
        let mut query = |at: Cell| {
            queries += 1;
            Ok(TraversalMaterial { solid:at.y == 0, outside:false, sealed_top:false })
        };
        let start = Cell { x:0, y:0, z:0 };
        let destinations = [Cell { x:30, y:0, z:0 }, Cell { x:1, y:0, z:0 }];
        let (index,path) = search_any_with_blocked_and_stairs(start, &destinations, config, &mut query, &|_| false, &[]).unwrap();
        assert_eq!(index,1);
        assert_eq!(path.last(),Some(&destinations[1]));
        assert!(queries < 100,"nearest goal should settle without exploring the distant goal; queried {queries} cells");
    }

    #[test]
    fn search_consults_boundary_for_each_cardinal_crossing() {
        let config = TraversalConfig { spacing:[1.0,1.0,1.0], clearance_cells:1, max_step_cells:1 };
        let mut query = |at: Cell| Ok(TraversalMaterial { solid: at.y == -1, outside:false, sealed_top:false });
        let start = Cell { x:0, y:0, z:0 };
        let destination = Cell { x:2, y:0, z:0 };
        let wall = |from: Cell, to: Cell| from.y == 0 && to.y == 0 && ((from.x == 0 && to.x == 1) || (from.x == 1 && to.x == 0));
        assert!(search_any_with_blocked_and_stairs_and_crossings(start, &[destination], config, &mut query, &|_| false, &[], &wall).is_err());
    }
    #[test]
    fn yielded_frontier_resumes_across_reload_with_one_aggregate_occurrence_budget() {
        let config = TraversalConfig { spacing: [1.0; 3], clearance_cells: 1, max_step_cells: 1 };
        let start = Cell { x: 0, y: 0, z: 0 };
        let goal = Cell { x: 80, y: 0, z: 80 };
        let mut query = |at: Cell| Ok(TraversalMaterial { solid: at.y == 0, outside: false, sealed_top: false });
        let mut uninterrupted = RouteSearch::new(start, &[goal], config, &mut query, &|_| false).unwrap();
        let expected = uninterrupted.advance(config, &mut query, &|_| false, &[], &|_, _| false, &mut 32768).unwrap().unwrap();
        assert!(uninterrupted.expanded > SEARCH_EXPANSIONS as u64);
        let mut bank = SearchBank::default();
        let blockers = BTreeSet::new();
        assert_eq!(bank.search("worker", 7, 0, start, &[goal], config, &blockers, &mut query, &|_| false, &[], &|_, _| false).unwrap_err(), SEARCH_PENDING);
        assert_eq!(bank.spent, SEARCH_EXPANSIONS);
        let expanded = bank.entries.values().next().unwrap().search.expanded;
        assert_eq!(expanded, SEARCH_EXPANSIONS as u64);
        let saved = serde_json::to_string(&bank).unwrap();
        let mut bank: SearchBank = serde_json::from_str(&saved).unwrap();
        bank.validate().unwrap();
        // Even another actor and a reload do not replenish the same occurrence.
        assert_eq!(bank.search("other", 7, 0, start, &[goal], config, &blockers, &mut query, &|_| false, &[], &|_, _| false).unwrap_err(), SEARCH_PENDING);
        assert_eq!(bank.entries.len(), 1);
        let mut result = None;
        let mut spent = SEARCH_EXPANSIONS;
        for occurrence in 8..16 {
            match bank.search("worker", occurrence, 0, start, &[goal], config, &blockers, &mut query, &|_| false, &[], &|_, _| false) {
                Ok(route) => { spent += bank.spent; result = Some(route); break; },
                Err(error) => { assert_eq!(error, SEARCH_PENDING); spent += bank.spent; }
            }
            bank = serde_json::from_str(&serde_json::to_string(&bank).unwrap()).unwrap();
            bank.validate().unwrap();
        }
        assert_eq!(result.unwrap(), expected);
        assert_eq!(spent as u64, uninterrupted.expanded, "a yielded prefix is never expanded twice");
        assert!(bank.entries.is_empty());
    }

    #[test]
    fn search_recovery_rejects_invalid_predecessor_and_frontier() {
        let config = TraversalConfig { spacing: [1.0; 3], clearance_cells: 1, max_step_cells: 1 };
        let mut query = |at: Cell| Ok(TraversalMaterial { solid: at.y == 0, outside: false, sealed_top: false });
        let mut search = RouteSearch::new(Cell { x: 0, y: 0, z: 0 }, &[Cell { x: 10, y: 0, z: 0 }], config, &mut query, &|_| false).unwrap();
        search.advance(config, &mut query, &|_| false, &[], &|_, _| false, &mut 1).unwrap();
        search.validate(config.spacing).unwrap();
        let mut corrupt = search.clone();
        corrupt.nodes[1].2 = Some(1);
        assert!(corrupt.validate(config.spacing).is_err());
        search.frontier.insert((0, 0, 999));
        assert!(search.validate(config.spacing).is_err());
    }

}
