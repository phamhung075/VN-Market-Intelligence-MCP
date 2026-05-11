/**
 * Analysis Formatters — infrastructure adapter
 *
 * Wraps TelegramMessageFactory string-truncation utilities for use by
 * domain services that must not import from infrastructure/notifiers directly.
 *
 * DDD boundary: domain/services → infrastructure/adapters → infrastructure/notifiers
 * Added: Task 1300b fix (DDD violation repair)
 */

import { TelegramMessageFactory } from "../notifiers/telegramMessageFactory.js";

/**
 * Truncate a news summary for storage in analysis_entries.
 * Max 1000 graphemes, context-preserving.
 */
export function formatAnalysisNewsSummary(raw: string): string {
  return TelegramMessageFactory.formatNewsSummary(raw);
}

/**
 * Truncate a policy summary for storage.
 * Max 500 graphemes.
 */
export function formatAnalysisPolicySummary(raw: string): string {
  return TelegramMessageFactory.formatPolicySummary(raw);
}
