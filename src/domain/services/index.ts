/**
 * Domain Services — barrel export
 *
 * Pure business logic services with no direct I/O.
 * Services depend on repository interfaces (ports), not implementations.
 */

export { normalizeNews } from "./newsNormalizer.js";
export type {
  AnalysisEntry,
  AnalysisLevel,
  Sentiment,
  ImpactDirection,
  TimeHorizon,
} from "./newsNormalizer.js";
