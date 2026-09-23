/** Reassemble native-owned route-search pages for checkpoint admission/queries.
 * Native restore remains the owner of search geometry and relational laws. */
export const SEARCH_RECORD_PREFIX = "kernel/state/searches/";
export function isSearchRecordKey(key: string): boolean {
  const suffix = key.slice(SEARCH_RECORD_PREFIX.length);
  if (!key.startsWith(SEARCH_RECORD_PREFIX)) return false;
  const match = /^([a-f0-9]{64})\.(head|(?:nodes|frontier)\.(\d{4}))$/.exec(suffix);
  return !!match && (match[3] === undefined || Number(match[3]) < 128);
}

export function restoreSearchRecords(root: Record<string, any>, records: readonly { readonly key: string; readonly bytes: Uint8Array }[]): void {
  const entries = root.planner?.routeSearches?.entries;
  if (!entries || typeof entries !== "object" || Array.isArray(entries) || Object.keys(entries).length) throw new Error("invalid inline route search bank");
  const groups = new Map<string, Map<string, any>>();
  const decoder = new TextDecoder("utf-8", { fatal: true });
  for (const record of records) {
    if (!record.key.startsWith(SEARCH_RECORD_PREFIX)) continue;
    if (!isSearchRecordKey(record.key)) throw new Error("invalid route search record key");
    const suffix = record.key.slice(SEARCH_RECORD_PREFIX.length);
    const id = suffix.slice(0, 64), part = suffix.slice(65);
    const group = groups.get(id) ?? new Map();
    group.set(part, JSON.parse(decoder.decode(record.bytes)));
    groups.set(id, group);
  }
  for (const [id, pages] of groups) {
    const head = pages.get("head");
    pages.delete("head");
    if (!head || !Number.isSafeInteger(head.nodeCount) || head.nodeCount < 1 || head.nodeCount > 32768 || !Number.isSafeInteger(head.frontierCount) || head.frontierCount < 0 || head.frontierCount > 32768) throw new Error("invalid route search page counts");
    const nodes: unknown[] = [];
    for (let index = 0; index < Math.ceil(head.nodeCount / 256); index++) {
      const part = `nodes.${String(index).padStart(4, "0")}`;
      const page = pages.get(part);
      if (!Array.isArray(page) || page.length !== Math.min(256, head.nodeCount - index * 256)) throw new Error("incomplete route search node pages");
      nodes.push(...page); pages.delete(part);
    }
    const frontier: number[][] = [];
    for (const [part, rows] of pages) {
      if (!part.startsWith("frontier.") || !Array.isArray(rows) || rows.length === 0) throw new Error("invalid route search frontier page");
      const page = Number(part.slice(9));
      for (const row of rows) {
        if (!Array.isArray(row) || row.length !== 3 || row.some(value => !Number.isSafeInteger(value) || value < 0) || row[2] >= head.nodeCount || Math.floor(row[2] / 256) !== page) throw new Error("route search frontier identity mismatch");
        frontier.push(row);
      }
    }
    if (frontier.length !== head.frontierCount) throw new Error("incomplete route search frontier pages");
    frontier.sort((a, b) => a[0] - b[0] || a[1] - b[1] || a[2] - b[2]);
    if (frontier.some((row, index) => index > 0 && row.every((value, column) => value === frontier[index - 1][column]))) throw new Error("duplicate route search frontier row");
    const search = head.request?.search;
    if (!search || !Array.isArray(search.nodes) || search.nodes.length || !Array.isArray(search.frontier) || search.frontier.length) throw new Error("route search head contains inline pages");
    search.nodes = nodes; search.frontier = frontier;
    entries[id] = head.request;
  }
}
