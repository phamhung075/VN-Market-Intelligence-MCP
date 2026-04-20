/**
 * Foreign Flow Validator (domain service)
 *
 * Task 1566b: Implement strict schema validation for foreign-flow payloads.
 * This is a STUB (RED phase) — types only, no implementation.
 * Tests in src/__tests__/1566-foreign-flow-parse-hardening.test.ts expect:
 *   - validateForeignFlowPayload() — validate and coerce batch of items
 *   - isForeignFlowUpsertItem() — type guard
 *   - coerceNumericField() — parse string/"123" to number
 *
 * Mandatory fields: code (string, non-empty), date (YYYY-MM-DD)
 * Coercible fields: foreign_volume, foreign_room, holding_ratio, fetched_at (numeric)
 */

import type { ForeignFlowUpsertItem } from "../../../infrastructure/db/vnstockStore.js";

/**
 * Validation error for a single item in a batch
 */
export interface ValidationError {
  /** Index of the item in the input array */
  itemIndex: number;
  /** Field name that failed validation */
  field: string;
  /** Reason for the validation failure */
  reason: string;
  /** The original value that failed validation */
  originalValue: unknown;
}

/**
 * Result of batch validation
 */
export interface ValidationResult {
  /** Items that passed validation and are ready for upsert */
  valid: ForeignFlowUpsertItem[];
  /** List of validation failures (if any) */
  errors: ValidationError[];
}

/**
 * Type guard: is obj a structurally valid ForeignFlowUpsertItem?
 * Checks mandatory fields (code: string; date: YYYY-MM-DD string) are present.
 * Does NOT coerce — used for early rejection.
 */
export function isForeignFlowUpsertItem(obj: unknown): obj is ForeignFlowUpsertItem {
  // STUB: Implementation in task 1566b
  throw new Error("isForeignFlowUpsertItem() not implemented yet — task 1566b");
}

/**
 * Validate and coerce a batch of raw items from VPS payload.
 *
 * @param items - Array of unknown objects (JSON-parsed payload)
 * @returns { valid, errors } — valid items are coerced and ready to upsert;
 *          errors list details all validation failures (mandatory field missing, unparseable number, etc.)
 *
 * Business rules:
 * - Mandatory: `code` (string, non-empty), `date` (YYYY-MM-DD or absent → today UTC)
 * - Coercible: `foreign_volume`, `foreign_room`, `holding_ratio`, `fetched_at` (numeric, default 0/null on error)
 * - If coercible field is string/"123", parse to number; if unparseable (e.g., "abc"), set to 0 and log warning in error list.
 * - If `holding_ratio` > 1.0 after coercion, flag as invalid (will be normalized in upsertForeignFlow, but validator detects anomaly).
 */
export function validateForeignFlowPayload(items: unknown[]): ValidationResult {
  // STUB: Implementation in task 1566b
  throw new Error("validateForeignFlowPayload() not implemented yet — task 1566b");
}

/**
 * Coerce numeric field: parse string/"123" to number, detect NaN/Infinity.
 *
 * @returns { value, error? } — if parseable, value is number + error is undefined;
 *          if unparseable, value is 0 + error describes the issue.
 */
export function coerceNumericField(
  value: unknown,
  fieldName: string,
): { value: number; error?: string } {
  // STUB: Implementation in task 1566b
  throw new Error("coerceNumericField() not implemented yet — task 1566b");
}
