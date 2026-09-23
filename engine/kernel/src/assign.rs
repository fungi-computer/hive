//! Deterministic maximum-cardinality, minimum-cost bipartite assignment.
//!
//! The sparse domain is adapted to the dense matrix expected by the maintained
//! `pathfinding` Kuhn-Munkres implementation. Dummy columns represent an
//! unmatched worker and a larger whole-input penalty represents a forbidden pair.

use pathfinding::kuhn_munkres::kuhn_munkres_min;
use pathfinding::matrix::Matrix;
use std::collections::{BTreeMap, BTreeSet};

const COST_SCALE: f64 = 1_000_000.0;

#[derive(Clone, Debug, PartialEq, serde::Serialize, serde::Deserialize)]
pub struct Candidate {
    pub worker: String,
    pub task: String,
    pub cost: f64,
}

#[derive(Clone, Debug, PartialEq, serde::Serialize, serde::Deserialize)]
pub struct Assignment {
    pub worker: String,
    pub task: String,
    pub cost: f64,
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub enum AssignmentError {
    EdgeLimitExceeded { count: usize, limit: usize },
    CostOverflow,
}

pub fn compute_cost(travel_time: f64, work_time: f64, retry_risk: f64, priority: f64) -> f64 {
    if !travel_time.is_finite()
        || !work_time.is_finite()
        || !retry_risk.is_finite()
        || !priority.is_finite()
        || travel_time < 0.0
        || work_time < 0.0
        || !(0.0..1.0).contains(&retry_risk)
        || priority <= 0.0
    {
        return f64::INFINITY;
    }
    (travel_time + work_time) / (1.0 - retry_risk) / priority
}

pub fn optimize(candidates: &[Candidate], max_edges: usize) -> Result<Vec<Assignment>, AssignmentError> {
    let mut best = BTreeMap::<(String, String), f64>::new();
    for candidate in candidates {
        if candidate.worker.is_empty() || candidate.task.is_empty()
            || !candidate.cost.is_finite() || candidate.cost < 0.0 { continue; }
        let key = (candidate.worker.clone(), candidate.task.clone());
        best.entry(key).and_modify(|cost| *cost = cost.min(candidate.cost)).or_insert(candidate.cost);
    }
    if best.len() > max_edges {
        return Err(AssignmentError::EdgeLimitExceeded {
            count: best.len(),
            limit: max_edges,
        });
    }
    let workers: Vec<_> = best.keys().map(|(worker, _)| worker.clone()).collect::<BTreeSet<_>>().into_iter().collect();
    let tasks: Vec<_> = best.keys().map(|(_, task)| task.clone()).collect::<BTreeSet<_>>().into_iter().collect();
    if workers.is_empty() {
        return Ok(Vec::new());
    }
    let mut scaled = BTreeMap::new();
    let mut max_cost = 0_i64;
    for (key, cost) in &best {
        if *cost > i64::MAX as f64 / COST_SCALE {
            return Err(AssignmentError::CostOverflow);
        }
        let value = (*cost * COST_SCALE).ceil() as i64;
        max_cost = max_cost.max(value);
        scaled.insert(key.clone(), value);
    }
    let rows = workers.len();
    let max_sum = max_cost.checked_mul(rows as i64).ok_or(AssignmentError::CostOverflow)?;
    let unmatched = max_sum.checked_add(1).ok_or(AssignmentError::CostOverflow)?;
    let forbidden = unmatched.checked_add(max_sum).and_then(|v| v.checked_add(1)).ok_or(AssignmentError::CostOverflow)?;
    let columns = tasks.len() + rows;
    let mut matrix = vec![vec![forbidden; columns]; rows];
    for (row, worker) in workers.iter().enumerate() {
        for (column, task) in tasks.iter().enumerate() {
            if let Some(cost) = scaled.get(&(worker.clone(), task.clone())) {
                matrix[row][column] = *cost;
            }
        }
        for column in tasks.len()..columns {
            matrix[row][column] = unmatched;
        }
    }
    let matrix = Matrix::from_rows(matrix).expect("rectangular assignment matrix");
    let (_, chosen) = kuhn_munkres_min::<i64, _>(&matrix);
    let mut result = Vec::new();
    for (row, &column) in chosen.iter().enumerate() {
        if column >= tasks.len() {
            continue;
        }
        let key = (workers[row].clone(), tasks[column].clone());
        if let Some(cost) = best.get(&key) {
            result.push(Assignment {
                worker: key.0,
                task: key.1,
                cost: *cost,
            });
        }
    }
    result.sort_by(|a, b| a.worker.cmp(&b.worker).then(a.task.cmp(&b.task)));
    Ok(result)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn c(w: &str, t: &str, cost: f64) -> Candidate {
        Candidate {
            worker: w.into(),
            task: t.into(),
            cost,
        }
    }

    #[test]
    fn sparse_matching_maximizes_cardinality_before_cost() {
        let got = optimize(&[c("a", "x", 100.0), c("a", "y", 1.0), c("b", "x", 2.0)], 8).unwrap();
        assert_eq!(got.len(), 2); assert!(got.iter().any(|x| x.worker == "a" && x.task == "y")); assert!(got.iter().any(|x| x.worker == "b" && x.task == "x"));
    }
    #[test]
    fn augmenting_path_reassigns_existing_match() {
        let got = optimize(&[c("w1", "t1", 1.0), c("w1", "t2", 2.0), c("w2", "t1", 1.1)], 8).unwrap();
        assert_eq!(got.len(), 2); assert!(got.iter().any(|x| x.worker == "w1" && x.task == "t2")); assert!(got.iter().any(|x| x.worker == "w2" && x.task == "t1"));
    }
    #[test]
    fn duplicate_and_equal_cost_replay_are_stable() {
        let a = optimize(&[c("w", "b", 1.0), c("w", "a", 1.0), c("w", "a", 4.0)], 8).unwrap();
        let b = optimize(&[c("w", "a", 4.0), c("w", "a", 1.0), c("w", "b", 1.0)], 8).unwrap();
        assert_eq!(a, b); assert_eq!(a[0].task, "a"); assert_eq!(a[0].cost, 1.0);
    }
    #[test]
    fn impossible_edges_and_bounds_are_rejected_or_ignored() {
        assert_eq!(optimize(&[c("w", "t", f64::INFINITY), c("w", "u", 1.0)], 1).unwrap().len(), 1);
        assert!(matches!(optimize(&[c("a", "x", 1.0), c("b", "y", 1.0)], 1), Err(AssignmentError::EdgeLimitExceeded { .. })));
        assert!(matches!(optimize(&[c("w", "t", f64::MAX)], 1), Err(AssignmentError::CostOverflow)));
    }

    // A deliberately tiny exhaustive oracle: it checks the domain objective,
    // while Hungarian remains the only production implementation.
    fn oracle<'a>(
        rows: &[&str],
        tasks: &[&'a str],
        edges: &[Candidate],
        row: usize,
        used: &mut BTreeSet<&'a str>,
    ) -> (usize, f64) {
        if row == rows.len() {
            return (0, 0.0);
        }
        let mut best = oracle(rows, tasks, edges, row + 1, used);
        for task in tasks {
            if used.contains(task) {
                continue;
            }
            let Some(edge) = edges.iter().filter(|e| e.worker == rows[row] && e.task == *task)
                .min_by(|a, b| a.cost.partial_cmp(&b.cost).unwrap()) else {
                    continue;
                };
            used.insert(task);
            let (count, cost) = oracle(rows, tasks, edges, row + 1, used);
            used.remove(task);
            let candidate = (count + 1, cost + edge.cost);
            if candidate.0 > best.0 || (candidate.0 == best.0 && candidate.1 < best.1) {
                best = candidate;
            }
        }
        best
    }

    #[test]
    fn sparse_rectangular_cases_match_exhaustive_objective() {
        let edges = vec![c("a", "x", 9.0), c("a", "y", 2.0), c("b", "x", 1.0), c("c", "z", 4.0)];
        let expected = oracle(&["a", "b", "c"], &["x", "y", "z"], &edges, 0, &mut BTreeSet::new());
        let got = optimize(&edges, 8).unwrap();
        assert_eq!((got.len(), got.iter().map(|a| a.cost).sum::<f64>()), expected);
    }

    #[test]
    fn every_three_by_three_sparse_shape_matches_exhaustive_objective() {
        let workers = ["a", "b", "c"];
        let tasks = ["x", "y", "z"];
        for mask in 0_u16..(1 << 9) {
            let mut edges = Vec::new();
            for (worker_index, worker) in workers.iter().enumerate() {
                for (task_index, task) in tasks.iter().enumerate() {
                    let edge_index = worker_index * tasks.len() + task_index;
                    if mask & (1 << edge_index) != 0 {
                        let cost = ((worker_index * 5 + task_index * 3) % 7 + 1) as f64;
                        edges.push(c(worker, task, cost));
                    }
                }
            }
            let expected = oracle(&workers, &tasks, &edges, 0, &mut BTreeSet::new());
            let got = optimize(&edges, 9).unwrap();
            let actual = (got.len(), got.iter().map(|assignment| assignment.cost).sum::<f64>());
            assert_eq!(actual, expected, "sparse mask {mask:#011b}");
        }
    }
}
