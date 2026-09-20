const LIMIT = 120;
const push = (list, value) => { list.push(value); if (list.length > LIMIT) list.shift(); };
const summary = values => {
  if (!values.length) return null;
  const sorted = [...values].sort((a,b) => a-b);
  return { samples: sorted.length, median: sorted[Math.ceil(sorted.length*.5)-1], p95: sorted[Math.ceil(sorted.length*.95)-1] };
};

/** Bounded measurements of received authoritative frames and browser transport.
 * Does not step the world or infer server CPU time from browser clocks. */
export function createPerformanceObserver({ clock = () => performance.now() } = {}) {
  let previous, paused = false, positions = new Map(), movingWorkers = 0, wood = 0, stumps = 0;
  let receivedBytes = 0, requests = 0, failedRequests = 0, frames = 0;
  const intervals = [], progression = [], roundTrips = [];
  return Object.freeze({
    transport(sample) {
      receivedBytes += sample.receivedBytes;
      if (sample.kind === 'http') {
        requests++;
        if (sample.status === null || sample.status >= 400) failedRequests++;
        push(roundTrips, sample.durationMs);
      }
    },
    event(event) {
      if (event.type === 'state') { paused = event.paused; previous = undefined; }
      if (event.type === 'ready') {
        previous = undefined; positions.clear(); frames = 0; wood = 0; stumps = 0; movingWorkers = 0;
        intervals.length = 0; progression.length = 0;
      }
      if (event.type !== 'frame') return;
      const now = clock();
      if (previous && previous.epoch === event.epoch && event.sequence <= previous.sequence) return;
      if (previous && previous.epoch === event.epoch && event.time >= previous.time && !paused) {
        const elapsed = now - previous.receivedAt;
        if (elapsed > 0) {
          push(intervals, elapsed);
          push(progression, { elapsed, simulated: (event.time - previous.time)*1000 });
        }
      }
      previous = { epoch:event.epoch, sequence:event.sequence, time:event.time, receivedAt:now };
      frames++;
      const next = new Map(); movingWorkers = 0; wood = 0; stumps = 0;
      for (const fact of event.facts) {
        if (fact.visual === "colony.tree.stump") stumps++;
        if (fact.visual === 'colony.rowan' || fact.visual === 'colony.sedge') {
          const position = fact.pose.position;
          const old = positions.get(fact.id);
          if (old && (old.x !== position.x || old.y !== position.y || old.z !== position.z)) movingWorkers++;
          next.set(fact.id, { ...position });
        }
        for (const item of fact.inventory?.items ?? []) if (item.kind === 'wood') wood += item.quantity;
      }
      positions = next;
    },
    snapshot(coverage) {
      const elapsed = progression.reduce((sum,s) => sum+s.elapsed,0);
      return { source:'durable-object', frames, sequence:previous?.sequence ?? null,
        simulationTime:previous?.time ?? null, paused,
        simulationRate:elapsed ? progression.reduce((sum,s) => sum+s.simulated,0)/elapsed : null,
        observationGap:summary(intervals), httpRoundTrip:summary(roundTrips),
        // The region owner measures patch progress. Do not infer a stream's
        // latency from unrelated command/admission HTTP requests.
        terrainStream: coverage?.loading ? { ...coverage.loading, pending:coverage.pending,
          visibleComplete:coverage.visibleComplete, demandComplete:coverage.demandComplete,
          visibleRegions:coverage.visibleRegions, readyVisibleRegions:coverage.readyVisibleRegions,
          requestedRegions:coverage.requestedRegions, readyRegions:coverage.readyRegions,
          cachedRegions:coverage.cachedRegions, capacity:coverage.capacity,
          retainedBytes:coverage.retainedBytes, maxBytes:coverage.maxBytes, error:coverage.error??null } : null,
        receivedBytes, requests, failedRequests, observedWorkers:positions.size, movingWorkers, wood, stumps,
        retainedSamples:{ observations:intervals.length, progression:progression.length, http:roundTrips.length } };
    },
  });
}
