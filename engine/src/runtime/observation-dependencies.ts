import type { QuerySpec, QueryRow, ReadContext } from "../contracts";

type Context = Pick<ReadContext, "query" | "workAttempts" | "atmosphereSamples" | "environmentFacts" | "constructionReadiness">;
type Method = keyof Context;
type Dependency = { method: Method; args: unknown[]; signature: string | undefined };

/**
 * Memoize a projection against the reads it actually made. Revision alone is not
 * an invalidation: clock/receipt changes need not rebuild contextual commands or
 * inspect facts. Queries include IDs and requested component values; a deletion,
 * creation or changed value invalidates. All dependencies are checked against the
 * current committed session, and replaced when a projection takes another branch.
 */
export function createObservationDependencies<T>() {
  let previous: { value: T; dependencies: readonly Dependency[] } | undefined;
  return (context: Context, project: (tracked: Context) => T): T => {
    const read = (method: Method, args: unknown[]) => {
      const value = (context[method] as (...args: unknown[]) => unknown)(...args);
      const comparable = method === "query"
        ? (value as readonly QueryRow[]).map(row => [row.id, ...(args[0] as QuerySpec).components.map(component => row.get(component))])
        : value;
      return { value, signature: JSON.stringify(comparable) };
    };
    if (previous && previous.dependencies.every(dependency => read(dependency.method, dependency.args).signature === dependency.signature))
      return previous.value;
    const dependencies: Dependency[] = [];
    const tracked = Object.fromEntries(Object.keys(context).map(method => [method, (...args: unknown[]) => {
      const result = read(method as Method, args);
      dependencies.push({ method: method as Method, args, signature: result.signature });
      return result.value;
    }])) as Context;
    const value = project(tracked);
    previous = { value, dependencies };
    return value;
  };
}
