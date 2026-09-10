//! Deterministic maximum-cardinality, minimum-cost bipartite assignment.
//! The vendor implementation is MIT licensed; this Rust implementation keeps
//! its assignment semantics while making legal edges and bounded allocations explicit.

use std::collections::{BTreeMap, BTreeSet, BinaryHeap};

#[derive(Clone, Debug, PartialEq)]
pub struct Candidate { pub worker: String, pub task: String, pub cost: f64 }
#[derive(Clone, Debug, PartialEq)]
pub struct Assignment { pub worker: String, pub task: String, pub cost: f64 }
#[derive(Clone, Debug, PartialEq, Eq)] pub enum AssignmentError { EdgeLimitExceeded { count: usize, limit: usize } }

/// LibColony's cost law, retained at the Rust boundary for callers that build
/// candidate edges from travel/work estimates.
pub fn compute_cost(travel_time: f64, work_time: f64, retry_risk: f64, priority: f64) -> f64 {
    if !travel_time.is_finite() || !work_time.is_finite() || !retry_risk.is_finite() || !priority.is_finite()
        || travel_time < 0.0 || work_time < 0.0 || retry_risk >= 1.0 || retry_risk < 0.0 || priority <= 0.0 { return f64::INFINITY; }
    (travel_time + work_time) / (1.0 - retry_risk) / priority
}

/// `O(V E log V)` successive shortest augmenting paths. A missing edge is
/// illegal and can never be selected. IDs provide deterministic tie breaking.
pub fn optimize(candidates: &[Candidate], max_edges: usize) -> Result<Vec<Assignment>, AssignmentError> {
    let mut edges: Vec<_> = candidates.iter().filter(|c| c.cost.is_finite() && c.cost >= 0.0 && !c.worker.is_empty() && !c.task.is_empty()).cloned().collect();
    if edges.len() > max_edges { return Err(AssignmentError::EdgeLimitExceeded { count: edges.len(), limit: max_edges }); }
    edges.sort_by(|a,b| a.worker.cmp(&b.worker).then(a.task.cmp(&b.task)).then(a.cost.total_cmp(&b.cost)));
    edges.truncate(max_edges);
    let workers: Vec<u64> = edges.iter().map(|e| e.worker).collect::<BTreeSet<_>>().into_iter().collect();
    let tasks: Vec<u64> = edges.iter().map(|e| e.task).collect::<BTreeSet<_>>().into_iter().collect();
    let wi: BTreeMap<_,_> = workers.iter().enumerate().map(|(i,x)|(*x,i)).collect();
    let ti: BTreeMap<_,_> = tasks.iter().enumerate().map(|(i,x)|(*x,i)).collect();
    let n=workers.len(); let m=tasks.len(); let source=n+m; let sink=source+1; let size=sink+1;
    let mut graph=vec![Vec::<Arc>::new();size];
    for i in 0..n { add(&mut graph,source,i,0.0); }
    for j in 0..m { add(&mut graph,n+j,sink,0.0); }
    for e in &edges { add(&mut graph,wi[&e.worker],n+ti[&e.task],e.cost); }
    let mut flow=0; let mut potentials=vec![0.0;size];
    loop {
        let mut dist=vec![f64::INFINITY;size]; let mut prev=vec![(0,0);size]; dist[source]=0.0;
        let mut heap=BinaryHeap::new(); heap.push((OrdF(0.0),source));
        while let Some((OrdF(d),v))=heap.pop() { if d>dist[v] {continue;} for (k,a) in graph[v].iter().enumerate() { if a.cap==0 {continue;} let nd=d+a.cost+potentials[v]-potentials[a.to]; if nd<dist[a.to] || (nd==dist[a.to] && (v,k)<prev[a.to]) {dist[a.to]=nd;prev[a.to]=(v,k);heap.push((OrdF(nd),a.to));} } }
        if !dist[sink].is_finite() {break;} for i in 0..size {if dist[i].is_finite(){potentials[i]+=dist[i];}}
        let mut v=sink; while v!=source {let (p,k)=prev[v]; let rev=graph[p][k].rev; graph[p][k].cap-=1; graph[v][rev].cap+=1; v=p;} flow+=1;
    }
    let mut out=Vec::with_capacity(flow); for i in 0..n {for a in &graph[i] {if a.to>=n&&a.to<n+m&&a.cap==0 {let task=tasks[a.to-n].clone(); let cost=edges.iter().find(|e|e.worker==workers[i]&&e.task==task).unwrap().cost; out.push(Assignment{worker:workers[i].clone(),task,cost});}}} out.sort_by(|a,b|a.worker.cmp(&b.worker).then(a.task.cmp(&b.task))); Ok(out)
}

#[derive(Clone, Copy, PartialEq)] struct OrdF(f64); impl Eq for OrdF {} impl Ord for OrdF {fn cmp(&self,o:&Self)->std::cmp::Ordering{o.0.total_cmp(&self.0)}} impl PartialOrd for OrdF {fn partial_cmp(&self,o:&Self)->Option<std::cmp::Ordering>{Some(self.cmp(o))}}
#[derive(Clone)] struct Arc { to:usize, rev:usize, cap:u8, cost:f64 }
fn add(g:&mut [Vec<Arc>],u:usize,v:usize,c:f64){let ru=g[v].len();let rv=g[u].len();g[u].push(Arc{to:v,rev:ru,cap:1,cost:c});g[v].push(Arc{to:u,rev:rv,cap:0,cost:-c});}

#[cfg(test)] mod tests {
    use super::*;
    #[test] fn legal_edges_and_cardinality() { let got=optimize(&[Candidate{worker:"w1".into(),task:"t1".into(),cost:9.0},Candidate{worker:"w1".into(),task:"t2".into(),cost:1.0},Candidate{worker:"w2".into(),task:"t1".into(),cost:1.0}],16).unwrap(); assert_eq!(got.len(),2); assert_eq!(got.iter().map(|a|a.cost).sum::<f64>(),2.0); }
    #[test] fn stable_tie() { let a=optimize(&[Candidate{worker:"w1".into(),task:"t2".into(),cost:1.0},Candidate{worker:"w1".into(),task:"t1".into(),cost:1.0}],16).unwrap(); assert_eq!(a[0].task,"t1"); }
    #[test] fn cost_rejects_impossible_edges() { assert!(!compute_cost(2.0, 3.0, 0.2, 2.0).is_infinite()); assert!(compute_cost(0.0, 1.0, 1.0, 1.0).is_infinite()); }
}
