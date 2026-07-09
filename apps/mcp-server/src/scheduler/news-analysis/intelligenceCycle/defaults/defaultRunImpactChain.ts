/**
 * Intelligence Cycle — Step D default production impl: runImpactChain
 *
 * FACTORY-SCHEDULER-split-intelligenceCycleJob: extracted verbatim from
 * intelligenceCycleJob.ts. Injected via
 * `deps.runImpactChainFn ?? defaultRunImpactChain` in the orchestrator's
 * `_runCycle`.
 */

export async function defaultRunImpactChain(): Promise<number> {
  // Impact chain now runs inside pollNews per-entry (via runImpactChain with macro context).
  // Step D returns 0 because the work is embedded in Step A — this is by design, not a stub.
  return 0;
}
