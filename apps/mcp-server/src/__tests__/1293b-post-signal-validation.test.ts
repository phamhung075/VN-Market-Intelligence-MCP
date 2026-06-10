/**
 * Task 1293b: MCP Signal Validation — RED Test Suite
 *
 * Tests that the post_agent_signal tool validates chain_catalyst,
 * price_confirmation, and urgent_news signals using strict Zod schemas.
 * Rejects incomplete payloads with detailed error messages.
 *
 * Test structure:
 *   1. chain_catalyst validation (7 required fields)
 *   2. price_confirmation validation (5 required fields)
 *   3. urgent_news validation (3 required fields)
 *   4. backward compatibility (cross_validate passes through)
 *   5. extra fields are accepted (forward-compatible)
 */

import { describe, it, expect, beforeAll, afterAll } from "bun:test";
import { Database } from "bun:sqlite";
import { initDatabase, getDb } from "../infrastructure/db/schema";
import type { SignalPayload } from "../infrastructure/db/agentSignalStore";

// Mock database setup
let db: Database;

beforeAll(async () => {
  await initDatabase();
  db = getDb();

  // Create signal_validation_log table if needed
  db.exec(`
    CREATE TABLE IF NOT EXISTS signal_validation_log (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      signal_type TEXT NOT NULL,
      rejection_reason TEXT NOT NULL,
      payload TEXT,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP
    )
  `);
});

afterAll(() => {
  // Clean up test data
  db.exec("DELETE FROM signal_validation_log WHERE 1=1");
});

// ── Helper: Validate using the validation function ────────────────────────────
// This will be imported from the interface module after implementation
import {
  validateSignalPayload,
} from "../interface/mcp/tools/news-analysis/agentSignalTools";

describe("1293b: MCP Signal Validation", () => {
  describe("chain_catalyst validation", () => {
    it("should accept valid chain_catalyst payload with all 7 fields", () => {
      const payload = {
        event_type: "credit_policy",
        direction: "bullish",
        confidence: 0.85,
        affected_stocks: ["VIC", "NVL"],
        affected_sectors: ["financials"],
        headline: "Central bank cuts rates",
        source: "sbv",
      };

      const result = validateSignalPayload("chain_catalyst", payload);
      expect(result.valid).toBe(true);
    });

    it("should reject chain_catalyst missing event_type", () => {
      const payload = {
        // event_type missing
        direction: "bullish",
        confidence: 0.85,
        affected_stocks: ["VIC"],
        affected_sectors: ["financials"],
        headline: "Central bank cuts rates",
        source: "sbv",
      };

      const result = validateSignalPayload("chain_catalyst", payload);
      if (!result.valid) {
        expect(result.errors.some((e) => e.includes("event_type"))).toBe(true);
      } else {
        expect.unreachable("Should have failed validation");
      }
    });

    it("should reject chain_catalyst with undefined confidence", () => {
      const payload = {
        event_type: "credit_policy",
        direction: "bullish",
        confidence: undefined,
        affected_stocks: ["VIC"],
        affected_sectors: ["financials"],
        headline: "Central bank cuts rates",
        source: "sbv",
      };

      const result = validateSignalPayload("chain_catalyst", payload);
      if (!result.valid) {
        expect(
          result.errors.some((e) =>
            e.includes("confidence") || e.includes("undefined")
          )
        ).toBe(true);
      } else {
        expect.unreachable("Should have failed validation");
      }
    });

    it("should reject chain_catalyst with non-array affected_stocks", () => {
      const payload = {
        event_type: "credit_policy",
        direction: "bullish",
        confidence: 0.85,
        affected_stocks: "VIC", // string instead of array
        affected_sectors: ["financials"],
        headline: "Central bank cuts rates",
        source: "sbv",
      };

      const result = validateSignalPayload("chain_catalyst", payload);
      if (!result.valid) {
        expect(result.errors.some((e) => e.includes("affected_stocks"))).toBe(
          true
        );
      } else {
        expect.unreachable("Should have failed validation");
      }
    });

    it("should reject chain_catalyst with empty affected_stocks array", () => {
      const payload = {
        event_type: "credit_policy",
        direction: "bullish",
        confidence: 0.85,
        affected_stocks: [], // empty array
        affected_sectors: ["financials"],
        headline: "Central bank cuts rates",
        source: "sbv",
      };

      const result = validateSignalPayload("chain_catalyst", payload);
      if (!result.valid) {
        expect(result.errors.some((e) => e.includes("affected_stocks"))).toBe(
          true
        );
      } else {
        expect.unreachable("Should have failed validation");
      }
    });

    it("should reject chain_catalyst with missing source", () => {
      const payload = {
        event_type: "credit_policy",
        direction: "bullish",
        confidence: 0.85,
        affected_stocks: ["VIC"],
        affected_sectors: ["financials"],
        headline: "Central bank cuts rates",
        // source missing
      };

      const result = validateSignalPayload("chain_catalyst", payload);
      if (!result.valid) {
        expect(result.errors.some((e) => e.includes("source"))).toBe(true);
      } else {
        expect.unreachable("Should have failed validation");
      }
    });

    it("should reject chain_catalyst with confidence outside [0, 1]", () => {
      const payload = {
        event_type: "credit_policy",
        direction: "bullish",
        confidence: 1.5, // outside valid range
        affected_stocks: ["VIC"],
        affected_sectors: ["financials"],
        headline: "Central bank cuts rates",
        source: "sbv",
      };

      const result = validateSignalPayload("chain_catalyst", payload);
      if (!result.valid) {
        expect(result.errors.some((e) => e.includes("confidence"))).toBe(true);
      } else {
        expect.unreachable("Should have failed validation");
      }
    });
  });

  describe("price_confirmation validation", () => {
    it("should accept valid price_confirmation payload with all 5 fields", () => {
      const payload = {
        price_change_pct: 2.5,
        volume_ratio: 1.8,
        confirms_direction: true,
        fully_priced: false,
        confidence: 0.9,
      };

      const result = validateSignalPayload("price_confirmation", payload);
      expect(result.valid).toBe(true);
    });

    it("should reject price_confirmation missing volume_ratio", () => {
      const payload = {
        price_change_pct: 2.5,
        // volume_ratio missing
        confirms_direction: true,
        fully_priced: false,
        confidence: 0.9,
      };

      const result = validateSignalPayload("price_confirmation", payload);
      if (!result.valid) {
        expect(result.errors.some((e) => e.includes("volume_ratio"))).toBe(
          true
        );
      } else {
        expect.unreachable("Should have failed validation");
      }
    });

    it("should reject price_confirmation with undefined confidence", () => {
      const payload = {
        price_change_pct: 2.5,
        volume_ratio: 1.8,
        confirms_direction: true,
        fully_priced: false,
        confidence: undefined,
      };

      const result = validateSignalPayload("price_confirmation", payload);
      if (!result.valid) {
        expect(
          result.errors.some((e) =>
            e.includes("confidence") || e.includes("undefined")
          )
        ).toBe(true);
      } else {
        expect.unreachable("Should have failed validation");
      }
    });

    it("should reject price_confirmation with non-boolean confirms_direction", () => {
      const payload = {
        price_change_pct: 2.5,
        volume_ratio: 1.8,
        confirms_direction: "yes", // string instead of boolean
        fully_priced: false,
        confidence: 0.9,
      };

      const result = validateSignalPayload("price_confirmation", payload);
      if (!result.valid) {
        expect(
          result.errors.some((e) => e.includes("confirms_direction"))
        ).toBe(true);
      } else {
        expect.unreachable("Should have failed validation");
      }
    });

    it("should reject price_confirmation with negative volume_ratio", () => {
      const payload = {
        price_change_pct: 2.5,
        volume_ratio: -0.5, // negative volume ratio
        confirms_direction: true,
        fully_priced: false,
        confidence: 0.9,
      };

      const result = validateSignalPayload("price_confirmation", payload);
      if (!result.valid) {
        expect(result.errors.some((e) => e.includes("volume_ratio"))).toBe(
          true
        );
      } else {
        expect.unreachable("Should have failed validation");
      }
    });
  });

  describe("urgent_news validation", () => {
    it("should accept valid urgent_news payload with all 3 fields", () => {
      const payload = {
        headline: "SBV emergency liquidity injection",
        source: "sbv_official",
        severity: "critical",
      };

      const result = validateSignalPayload("urgent_news", payload);
      expect(result.valid).toBe(true);
    });

    it("should accept urgent_news with only headline and source (severity optional post-SYS-FUNC-05)", () => {
      // SYS-FUNC-05 fix: severity is optional so callers that supply partial
      // urgent_news signals are not blocked. headline+source without severity is valid.
      const payload = {
        headline: "SBV emergency liquidity injection",
        source: "sbv_official",
        // severity intentionally absent — now optional
      };

      const result = validateSignalPayload("urgent_news", payload);
      expect(result.valid).toBe(true);
    });

    it("should reject urgent_news with invalid severity enum value", () => {
      const payload = {
        headline: "SBV emergency liquidity injection",
        source: "sbv_official",
        severity: "extremely_high", // invalid severity — not in enum
      };

      const result = validateSignalPayload("urgent_news", payload);
      if (!result.valid) {
        expect(result.errors.some((e) => e.includes("severity"))).toBe(true);
      } else {
        expect.unreachable("Should have failed validation — invalid enum value");
      }
    });

    it("should accept urgent_news with only confidence+summary (minimal router payload, no headline/source/severity)", () => {
      // SYS-FUNC-05 root cause: router posts urgent_news with only {confidence, summary}
      // in the finding_data (or omits finding_data entirely). Schema must not block this.
      const payload = {
        confidence: 0.7,
        summary: "test",
      };

      const result = validateSignalPayload("urgent_news", payload);
      expect(result.valid).toBe(true);
    });

    it("should accept urgent_news when finding_data is undefined (SYS-FUNC-05 live-failure case)", () => {
      // SYS-FUNC-05 exact live failure: call omits finding_data entirely.
      // Before fix: schema.safeParse(undefined) → Zod path=[] "Required" → "root: Required".
      // After fix: undefined normalised to {} → all-optional schema → valid.
      const result = validateSignalPayload("urgent_news", undefined);
      expect(result.valid).toBe(true);
    });
  });

  describe("backward compatibility", () => {
    it("should accept existing cross_validate signals", () => {
      const payload = {
        direction: "bullish",
        confidence: 0.8,
        summary: "Price confirms the trend",
      };

      const result = validateSignalPayload("cross_validate", payload);
      expect(result.valid).toBe(true);
    });

    it("should allow pass-through for unknown signal types with warning", () => {
      const payload = {
        some_field: "some_value",
      };

      const result = validateSignalPayload("unknown_signal_type", payload);
      // Unknown types should pass through (logged as warning)
      expect(result.valid).toBe(true);
    });
  });

  describe("extra fields handling", () => {
    it("should accept extra fields in chain_catalyst (forward compatibility)", () => {
      const payload = {
        event_type: "credit_policy",
        direction: "bullish",
        confidence: 0.85,
        affected_stocks: ["VIC"],
        affected_sectors: ["financials"],
        headline: "Central bank cuts rates",
        source: "sbv",
        extra_metadata: "some value", // extra field
        timestamp: 1234567890, // extra field
      };

      const result = validateSignalPayload("chain_catalyst", payload);
      expect(result.valid).toBe(true);
    });

    it("should accept extra fields in price_confirmation (forward compatibility)", () => {
      const payload = {
        price_change_pct: 2.5,
        volume_ratio: 1.8,
        confirms_direction: true,
        fully_priced: false,
        confidence: 0.9,
        additional_context: "market strength confirmed", // extra field
      };

      const result = validateSignalPayload("price_confirmation", payload);
      expect(result.valid).toBe(true);
    });
  });
});
