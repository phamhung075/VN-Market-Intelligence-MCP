/**
 * Foreign Flow Validator (domain service)
 *
 * Task 1566b: Implement strict schema validation for foreign-flow payloads.
 * Task 1289c: Integrate validator into fetcher — fail loudly on schema violations.
 *
 * Two validation paths:
 *   - validateForeignFlowPayload() — validate ForeignFlowUpsertItem (POST endpoint, Task 1289d)
 *   - validateForeignFlowFetcherPayload() — validate WriteForeignFlowItem (VPS fetcher, Task 1289c)
 *
 * Mandatory fields: code (string, non-empty), date (YYYY-MM-DD)
 * WriteForeignFlowItem fields: code, date, foreignBuyVol, foreignSellVol, putThroughVol
 * ForeignFlowUpsertItem fields: code, date, foreign_volume, foreign_room, holding_ratio, fetched_at
 */

import type { ForeignFlowUpsertItem } from "../../models/shared-types.js";
import type { WriteForeignFlowItem } from "../../../infrastructure/db/ohlcvForeignFlowStore.js";

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
  if (!obj || typeof obj !== "object") return false;

  const item = obj as Record<string, unknown>;

  // Mandatory: code must be a non-empty string
  if (typeof item.code !== "string" || item.code.trim().length === 0) {
    return false;
  }

  // date must be a string matching YYYY-MM-DD pattern, or absent (defaults to today)
  if (item.date !== undefined && typeof item.date !== "string") {
    return false;
  }
  if (typeof item.date === "string" && !item.date.match(/^\d{4}-\d{2}-\d{2}$/)) {
    return false;
  }

  return true;
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
  const valid: ForeignFlowUpsertItem[] = [];
  const errors: ValidationError[] = [];

  // Get today's UTC date for items missing the date field
  const todayUtc = new Date().toISOString().slice(0, 10);

  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    const itemErrors: ValidationError[] = [];

    // Type check: must be an object
    if (!item || typeof item !== "object") {
      errors.push({
        itemIndex: i,
        field: "<root>",
        reason: "item is not an object",
        originalValue: item,
      });
      continue;
    }

    const obj = item as Record<string, unknown>;

    // Validate mandatory field: code
    if (typeof obj.code !== "string" || obj.code.trim().length === 0) {
      itemErrors.push({
        itemIndex: i,
        field: "code",
        reason: "required field: code must be a non-empty string",
        originalValue: obj.code,
      });
    }

    // Validate mandatory field: date (YYYY-MM-DD format)
    let dateValue = todayUtc;
    if (obj.date !== undefined) {
      if (typeof obj.date !== "string") {
        itemErrors.push({
          itemIndex: i,
          field: "date",
          reason: "date must be a string (YYYY-MM-DD format)",
          originalValue: obj.date,
        });
      } else if (!obj.date.match(/^\d{4}-\d{2}-\d{2}$/)) {
        itemErrors.push({
          itemIndex: i,
          field: "date",
          reason: "date must match YYYY-MM-DD format",
          originalValue: obj.date,
        });
      } else {
        dateValue = obj.date;
      }
    }

    // Coerce foreign_volume (numeric, required)
    let foreign_volume: number | undefined = undefined;
    const fvCoerce = coerceNumericField(obj.foreign_volume, "foreign_volume");
    if (fvCoerce.error) {
      // Only log error if it's actually unparseable; null/undefined are OK (will default)
      if (obj.foreign_volume !== null && obj.foreign_volume !== undefined) {
        itemErrors.push({
          itemIndex: i,
          field: "foreign_volume",
          reason: fvCoerce.error,
          originalValue: obj.foreign_volume,
        });
      }
    } else {
      foreign_volume = fvCoerce.value;
    }
    if (foreign_volume === undefined) foreign_volume = 0;

    // Coerce foreign_room (numeric, optional → null)
    let foreign_room: number | null = null;
    if (obj.foreign_room !== null && obj.foreign_room !== undefined) {
      const frCoerce = coerceNumericField(obj.foreign_room, "foreign_room");
      if (frCoerce.error && obj.foreign_room !== null && obj.foreign_room !== undefined) {
        itemErrors.push({
          itemIndex: i,
          field: "foreign_room",
          reason: frCoerce.error,
          originalValue: obj.foreign_room,
        });
      } else {
        foreign_room = frCoerce.value;
      }
    }

    // Coerce holding_ratio (numeric, optional → null)
    let holding_ratio: number | null = null;
    if (obj.holding_ratio !== null && obj.holding_ratio !== undefined) {
      const hrCoerce = coerceNumericField(obj.holding_ratio, "holding_ratio");
      if (hrCoerce.error && obj.holding_ratio !== null && obj.holding_ratio !== undefined) {
        itemErrors.push({
          itemIndex: i,
          field: "holding_ratio",
          reason: hrCoerce.error,
          originalValue: obj.holding_ratio,
        });
      } else {
        holding_ratio = hrCoerce.value;
      }
    }

    // Coerce fetched_at (string timestamp, optional → null)
    let fetched_at: string | null = null;
    if (obj.fetched_at !== null && obj.fetched_at !== undefined) {
      if (typeof obj.fetched_at !== "string") {
        itemErrors.push({
          itemIndex: i,
          field: "fetched_at",
          reason: "fetched_at must be an ISO 8601 timestamp string",
          originalValue: obj.fetched_at,
        });
      } else {
        fetched_at = obj.fetched_at;
      }
    }

    // If any mandatory field errors, skip this item
    if (
      itemErrors.some(
        (e) => e.field === "code" || (e.field === "date" && dateValue === obj.date),
      )
    ) {
      errors.push(...itemErrors);
      continue;
    }

    // Add any coercion errors to the global errors list
    errors.push(...itemErrors);

    // If we have mandatory field values, create the valid item
    if (typeof obj.code === "string" && obj.code.trim().length > 0) {
      valid.push({
        code: obj.code,
        date: dateValue,
        foreign_volume,
        foreign_room,
        holding_ratio,
        fetched_at,
      });
    }
  }

  return { valid, errors };
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
  // Already a number
  if (typeof value === "number") {
    if (!Number.isFinite(value)) {
      return {
        value: 0,
        error: `${fieldName} is not finite (NaN or Infinity)`,
      };
    }
    return { value };
  }

  // Try to parse string
  if (typeof value === "string") {
    const parsed = Number(value);
    if (Number.isNaN(parsed)) {
      return {
        value: 0,
        error: `${fieldName} is unparseable numeric string "${value}"`,
      };
    }
    if (!Number.isFinite(parsed)) {
      return {
        value: 0,
        error: `${fieldName} parses to non-finite value`,
      };
    }
    return { value: parsed };
  }

  // null and undefined are acceptable (nullable fields default to null)
  if (value === null || value === undefined) {
    return { value: 0, error: `${fieldName} is null/undefined (will be set to null in ForeignFlowUpsertItem)` };
  }

  // Other types (object, boolean, etc.)
  return {
    value: 0,
    error: `${fieldName} has unexpected type ${typeof value}`,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Fetcher Validation: WriteForeignFlowItem Schema
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Result of fetcher validation (WriteForeignFlowItem schema)
 */
export interface FetcherValidationResult {
  /** Items that passed validation and are ready for storage */
  valid: WriteForeignFlowItem[];
  /** List of validation failures (if any) */
  errors: ValidationError[];
}

/**
 * Validate and filter a batch of items from VPS payload (WriteForeignFlowItem schema).
 *
 * @param items - Array of unknown objects (JSON-parsed VPS payload)
 * @returns { valid, errors } — valid items are type-safe WriteForeignFlowItem;
 *          errors list details all validation failures (mandatory field missing, wrong type)
 *
 * Business rules:
 * - Mandatory: `code` (string, non-empty), `date` (YYYY-MM-DD format)
 * - Required: `foreignBuyVol` (number), `foreignSellVol` (number)
 * - Optional: `putThroughVol` (number, defaults to 0 if missing)
 * - Fail loudly: if any mandatory field is missing or wrong type, error is recorded
 */
export function validateForeignFlowFetcherPayload(items: unknown[]): FetcherValidationResult {
  const valid: WriteForeignFlowItem[] = [];
  const errors: ValidationError[] = [];

  for (let i = 0; i < items.length; i++) {
    const item = items[i];

    // Type check: must be an object
    if (!item || typeof item !== "object") {
      errors.push({
        itemIndex: i,
        field: "<root>",
        reason: "item is not an object",
        originalValue: item,
      });
      continue;
    }

    const obj = item as Record<string, unknown>;
    const itemErrors: ValidationError[] = [];

    // Validate mandatory field: code
    if (typeof obj.code !== "string" || obj.code.trim().length === 0) {
      itemErrors.push({
        itemIndex: i,
        field: "code",
        reason: "required field: code must be a non-empty string",
        originalValue: obj.code,
      });
    }

    // Validate mandatory field: date (YYYY-MM-DD format)
    if (typeof obj.date !== "string" || !obj.date.match(/^\d{4}-\d{2}-\d{2}$/)) {
      itemErrors.push({
        itemIndex: i,
        field: "date",
        reason: "required field: date must be string in YYYY-MM-DD format",
        originalValue: obj.date,
      });
    }

    // Validate mandatory field: foreignBuyVol (number)
    if (typeof obj.foreignBuyVol !== "number" || !Number.isFinite(obj.foreignBuyVol)) {
      itemErrors.push({
        itemIndex: i,
        field: "foreignBuyVol",
        reason: "required field: foreignBuyVol must be a finite number",
        originalValue: obj.foreignBuyVol,
      });
    }

    // Validate mandatory field: foreignSellVol (number)
    if (typeof obj.foreignSellVol !== "number" || !Number.isFinite(obj.foreignSellVol)) {
      itemErrors.push({
        itemIndex: i,
        field: "foreignSellVol",
        reason: "required field: foreignSellVol must be a finite number",
        originalValue: obj.foreignSellVol,
      });
    }

    // Validate optional field: putThroughVol (number or undefined; defaults to 0)
    let putThroughVol = 0;
    if (obj.putThroughVol !== undefined) {
      if (typeof obj.putThroughVol !== "number" || !Number.isFinite(obj.putThroughVol)) {
        itemErrors.push({
          itemIndex: i,
          field: "putThroughVol",
          reason: "optional field: putThroughVol must be a finite number (defaults to 0 if omitted)",
          originalValue: obj.putThroughVol,
        });
      } else {
        putThroughVol = obj.putThroughVol;
      }
    }

    // If any mandatory field errors, skip this item
    if (
      itemErrors.some(
        (e) =>
          e.field === "code" ||
          e.field === "date" ||
          e.field === "foreignBuyVol" ||
          e.field === "foreignSellVol",
      )
    ) {
      errors.push(...itemErrors);
      continue;
    }

    // Add any optional field errors to the global errors list
    errors.push(...itemErrors);

    // If we have mandatory field values, create the valid item
    if (
      typeof obj.code === "string" &&
      obj.code.trim().length > 0 &&
      typeof obj.date === "string" &&
      obj.date.match(/^\d{4}-\d{2}-\d{2}$/) &&
      typeof obj.foreignBuyVol === "number" &&
      Number.isFinite(obj.foreignBuyVol) &&
      typeof obj.foreignSellVol === "number" &&
      Number.isFinite(obj.foreignSellVol)
    ) {
      valid.push({
        code: obj.code,
        date: obj.date,
        foreignBuyVol: obj.foreignBuyVol,
        foreignSellVol: obj.foreignSellVol,
        putThroughVol,
      });
    }
  }

  return { valid, errors };
}
