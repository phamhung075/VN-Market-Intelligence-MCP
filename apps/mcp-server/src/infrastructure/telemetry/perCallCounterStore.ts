/**
 * Per-Call Telemetry Counter Store — Sprint TOOL-SURFACE-UPGRADE / TSU-DEV-U1
 *
 * Infrastructure layer. Pure in-memory singleton Map.
 * Incremented synchronously on every tool handler entry.
 * Survives across gateway SSE cutover (no session lifecycle dependency).
 *
 * Root cause addressed: sessionToolCache was never populated in the gateway
 * model because the gateway dials a new SSE connection per-call and drops it;
 * the SSE handshake / sessionId path in server.ts never fires.
 *
 * Design:
 *   - Zero blocking I/O (Map.set is synchronous)
 *   - Zero latency impact on tool execution path
 *   - Counters persist in-memory between job flushes; cleared on resetCounters()
 *
 * @module infrastructure/telemetry/perCallCounterStore
 */

const counterStore: Map<string, number> = new Map();

/**
 * Increment the invocation counter for a tool by name.
 * Fire-and-forget synchronous Map.set() — zero blocking I/O.
 */
export function incrementTool(name: string): void {
  const current = counterStore.get(name) ?? 0;
  counterStore.set(name, current + 1);
}

/**
 * Returns a shallow copy of the current counter state.
 * Mutations to the returned object do not affect the store.
 */
export function getSnapshot(): Record<string, number> {
  return Object.fromEntries(counterStore);
}

/**
 * Clears all counters. Called by the flush job after writing stats.
 * Optional: job may choose not to reset if cumulative totals are preferred.
 */
export function resetCounters(): void {
  counterStore.clear();
}

/**
 * Returns the current count for a single tool name.
 * Returns 0 if the tool has never been incremented.
 */
export function getTool(name: string): number {
  return counterStore.get(name) ?? 0;
}
