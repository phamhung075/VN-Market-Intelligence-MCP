/**
 * Domain Services — barrel export
 *
 * Pure business logic services with no direct I/O.
 * Services depend on repository interfaces (ports), not implementations.
 *
 * Populated by future tasks:
 *   - Task 062: ImpactChainService (causal chain analysis)
 *   - Task 064: AlertService (multi-signal alert generation)
 *   - Task 063: SignalDetectorService
 */

// Re-export all domain services as they are implemented
export { parseVnNumber } from "./vnNumberParser";
export { extractBalanceSheet } from "./balanceSheetExtractor";
export { buildEmbeddingText } from "./embeddingTextBuilder";
export type { EmbeddingTextInput } from "./embeddingTextBuilder";
