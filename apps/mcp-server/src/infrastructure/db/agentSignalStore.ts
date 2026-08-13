/**
 * Agent Signal Store — barrel (FACTORY-INFRA-split-agentSignalStore).
 *
 * SQLite CRUD helpers for the `agent_signals` table. The agent signal bus
 * lets analysis agents communicate with each other by posting typed,
 * TTL-bound messages into a shared SQLite table.
 *
 * This file used to hold ~1770 lines of implementation, including a
 * `_postSignalInner` that nested 6 column-existence flags 7 deep and
 * emitted 10 hand-written near-identical INSERTs re-probing the schema on
 * every call. It is now a thin re-export barrel — every name below is
 * UNCHANGED from the pre-split public API (all existing `import { X } from
 * ".../agentSignalStore.js"` call sites work with zero changes) — the real
 * implementation lives in `./agentSignals/*`, split by query seam:
 *
 *   - columnDetect.ts    — memoized SignalColumnFlags probe (internal)
 *   - insertBuilder.ts   — single dynamic INSERT builder (internal)
 *   - postSignal.ts      — postSignal() + dedup/earnings-conflict guards
 *   - getSignals.ts / getBroadcastSignals.ts / getPriceAnomalySignals.ts
 *   - causalRootGrouping.ts — Alert Commander consolidated-view grouping
 *   - chainQueries.ts    — cycle-window / causal-ref chain traversal
 *   - recordOutcome.ts / getSignalEffectiveness.ts / cleanExpired.ts
 *   - criticGate.ts      — TNB critic gate wrapper for postSignal()
 *
 * All times are stored as UTC ISO-8601 strings (SQLite datetime format).
 */

export { SignalTypeSchema, type SignalType, type SignalPayload, type AgentSignal } from "./agentSignals/types.js";
export type { PostSignalInput } from "./agentSignals/postSignalTypes.js";
export { postSignal } from "./agentSignals/postSignal.js";
export { type GetSignalsOptions, getSignals } from "./agentSignals/getSignals.js";
export { getBroadcastSignals } from "./agentSignals/getBroadcastSignals.js";
export { getPriceAnomalySignals } from "./agentSignals/getPriceAnomalySignals.js";
export {
  type CausalRootGroup,
  type GetGroupedSignalsOptions,
  getSignalsGroupedByCausalRoot,
} from "./agentSignals/causalRootGrouping.js";
export type { ChainFinding } from "./agentSignals/chainRowSerializer.js";
export {
  computeCycleId,
  getChainFindings,
  getChainFromRoot,
  getOpenChainFindings,
  migrateUnknownStockCodes,
} from "./agentSignals/chainQueries.js";
export { type SignalOutcome, recordOutcome } from "./agentSignals/recordOutcome.js";
export {
  type SignalEffectiveness,
  type GetEffectivenessOptions,
  getSignalEffectiveness,
} from "./agentSignals/getSignalEffectiveness.js";
export { cleanExpired } from "./agentSignals/cleanExpired.js";
export {
  CRITIC_TIMEOUT_MS,
  postSignalWithCriticGate,
  type CriticInput,
  type CriticResult,
} from "./agentSignals/criticGate.js";
export type { PostSignalWithGateOptions, PostSignalGateResult } from "./agentSignals/criticGateTypes.js";
