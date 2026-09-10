//! Deterministic maximum-cardinality, minimum-cost bipartite assignment.
//!
//! The public contract follows the MIT-licensed libcolony header retained in
//! `vendor/libcolony/`: impossible edges are omitted, every worker/task is
//! used at most once, and priority is represented by candidate cost.

use std::collections::{BTreeMap, BTreeSet};

#[derive(Clone, Debug, PartialEq)]
pub struct Candidate { pub worker: String, pub task: String, pub cost: f64 }
#[derive(Clone, Debug, PartialEq)]
pub struct Assignment { pub worker: String, pub task: String, pub cost: f64 }
#[derive(Clone, Debug, PartialEq, Eq)]
pub enum AssignmentError { EdgeLimitExceeded { count: usize, limit: usize } }

pub fn compute_cost(travel_time: f64, work_time: f64, retry_risk: f64, priority: f64) -> f64 {
    if !travel_time.is_finite() || !work_time.is_finite() || !retry_risk.is_finite() || !priority.is_finite()
        || travel_time < 0.0 || work_time < 0.0 || !(0.0..1.0).contains(&retry_risk) || priority <= 0.0 { return f64::INFINITY; }
    (travel_time + work_time) / (1.0 - retry_risk) / priority
}

/// Successive shortest augmenting paths. Bellman-Ford is intentional here:
/// residual reverse edges are negative, and the bounded first kernel favors a
/// simple auditable implementation over a more delicate potential heap.
pub fn optimize(candidates: &[Candidate], max_edges: usize) -> Result<Vec<Assignment>, AssignmentError> {
    let mut best = BTreeMap::<(String, String), f64>::new();
    for candidate in candidates {
        if candidate.worker.is_empty() || candidate.task.is_empty() || !candidate.cost.is_finite() || candidate.cost < 0.0 { continue; }
        let key = (candidate.worker.clone(), candidate.task.clone());
        best.entry(key).and_modify(|cost| *cost = cost.min(candidate.cost)).or_insert(candidate.cost);
    }
    if best.len() > max_edges { return Err(AssignmentError::EdgeLimitExceeded { count: best.len(), limit: max_edges }); }
    let workers: Vec<_> = best.keys().map(|(worker, _)| worker.clone()).collect::<BTreeSet<_>>().into_iter().collect();
    let tasks: Vec<_> = best.keys().map(|(_, task)| task.clone()).collect::<BTreeSet<_>>().into_iter().collect();
    let wi: BTreeMap<_, _> = workers.iter().enumerate().map(|(i, id)| (id, i)).collect();
    let ti: BTreeMap<_, _> = tasks.iter().enumerate().map(|(i, id)| (id, i)).collect();
    let source = workers.len() + tasks.len(); let sink = source + 1;
    let mut graph = vec![Vec::new(); sink + 1];
    for i in 0..workers.len() { add_edge(&mut graph, source, i, 0.0); }
    for i in 0..tasks.len() { add_edge(&mut graph, workers.len() + i, sink, 0.0); }
    for ((worker, task), cost) in &best { add_edge(&mut graph, wi[worker], workers.len() + ti[task], *cost); }

    let mut flow = 0;
    loop {
        let mut distance = vec![f64::INFINITY; graph.len()];
        let mut previous = vec![None; graph.len()];
        distance[source] = 0.0;
        for _ in 0..graph.len() {
            let mut changed = false;
            for node in 0..graph.len() {
                if !distance[node].is_finite() { continue; }
                for (edge_index, edge) in graph[node].iter().enumerate() {
                    if edge.capacity == 0 { continue; }
                    let candidate = distance[node] + edge.cost;
                    if candidate < distance[edge.to] { distance[edge.to] = candidate; previous[edge.to] = Some((node, edge_index)); changed = true; }
                }
            }
            if !changed { break; }
        }
        let Some(_) = previous[sink] else { break };
        let mut node = sink;
        while node != source { let (parent, index) = previous[node].expect("augmenting path"); let reverse = graph[parent][index].reverse; graph[parent][index].capacity -= 1; graph[node][reverse].capacity += 1; node = parent; }
        flow += 1;
    }
    let mut result = Vec::with_capacity(flow);
    for (i, worker) in workers.iter().enumerate() {
        for edge in &graph[i] {
            if edge.to < workers.len() || edge.to >= source || edge.capacity != 0 { continue; }
            let task = tasks[edge.to - workers.len()].clone();
            result.push(Assignment { worker: worker.clone(), task: task.clone(), cost: best[&(worker.clone(), task)] });
        }
    }
    result.sort_by(|a, b| a.worker.cmp(&b.worker).then(a.task.cmp(&b.task)));
    Ok(result)
}

#[derive(Clone)] struct Edge { to: usize, reverse: usize, capacity: u8, cost: f64 }
fn add_edge(graph: &mut [Vec<Edge>], from: usize, to: usize, cost: f64) { let reverse_to = graph[to].len(); let reverse_from = graph[from].len(); graph[from].push(Edge { to, reverse: reverse_to, capacity: 1, cost }); graph[to].push(Edge { to: from, reverse: reverse_from, capacity: 0, cost: -cost }); }

#[cfg(test)]
mod tests {
    use super::*;
    fn c(w: &str, t: &str, cost: f64) -> Candidate { Candidate { worker: w.into(), task: t.into(), cost } }
    #[test] fn augmenting_path_reassigns_existing_match() { let got = optimize(&[c("w1", "t1", 1.0), c("w1", "t2", 2.0), c("w2", "t1", 1.1)], 8).unwrap(); assert_eq!(got.len(), 2); assert!(got.iter().any(|x| x.worker == "w1" && x.task == "t2")); assert!(got.iter().any(|x| x.worker == "w2" && x.task == "t1")); }
    #[test] fn zero_cost_edges_terminate_without_cycles() { let got = optimize(&[c("w1", "t1", 0.0), c("w1", "t2", 0.0), c("w2", "t1", 0.0)], 8).unwrap(); assert_eq!(got.len(), 2); }
    #[test] fn duplicate_edges_keep_cheapest_independent_of_input() { let a = optimize(&[c("w", "t", 4.0), c("w", "t", 2.0)], 8).unwrap(); let b = optimize(&[c("w", "t", 2.0), c("w", "t", 4.0)], 8).unwrap(); assert_eq!(a, b); assert_eq!(a[0].cost, 2.0); }
    #[test] fn input_order_and_equal_ties_are_stable() { let a = optimize(&[c("w", "b", 1.0), c("w", "a", 1.0)], 8).unwrap(); let b = optimize(&[c("w", "a", 1.0), c("w", "b", 1.0)], 8).unwrap(); assert_eq!(a, b); assert_eq!(a[0].task, "a"); }
    #[test] fn bound_is_a_failure_and_impossible_edges_are_ignored() { let got = optimize(&[c("w", "t", f64::INFINITY), c("w", "u", 1.0)], 1).unwrap(); assert_eq!(got.len(), 1); assert!(matches!(optimize(&[c("a", "x", 1.0), c("b", "y", 1.0)], 1), Err(AssignmentError::EdgeLimitExceeded { .. }))); }
}
