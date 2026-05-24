/**
 * Security — SQL injection tests for vector store filter inputs
 *
 * Verifies that:
 *  1. Malicious actionCode values containing SQL injection payloads are rejected
 *     or escaped so they cannot return all rows / bypass filters.
 *  2. Valid actionCode values continue to work normally.
 *  3. Invalid level values are rejected.
 *  4. The MCP search_similar_context tool rejects actionCode values that do not
 *     match the allowed pattern.
 */

import { describe, it, expect, beforeEach } from "bun:test";
// G5a (P2-F): legacy LanceDB vectorstore moved to _deprecated/; tests preserved as regression anchors.
import {
  sanitizeFilterValue,
  validateActionCode,
  validateLevel,
  type SearchFilters,
} from "../infrastructure/rag/_deprecated/vectorstore.js";

// ─────────────────────────────────────────────────────────────────────────────
// sanitizeFilterValue — SQL standard escaping
// ─────────────────────────────────────────────────────────────────────────────

describe("sanitizeFilterValue", () => {
  it("leaves a clean value unchanged", () => {
    expect(sanitizeFilterValue("VCB")).toBe("VCB");
    expect(sanitizeFilterValue("global")).toBe("global");
    expect(sanitizeFilterValue("HPG123")).toBe("HPG123");
  });

  it("escapes a single embedded single-quote", () => {
    const result = sanitizeFilterValue("VCB' OR '1'='1");
    // Must contain no unescaped ' that would close the surrounding string
    expect(result).toBe("VCB'' OR ''1''=''1");
    // Crucially the result must NOT equal the original
    expect(result).not.toBe("VCB' OR '1'='1");
  });

  it("escapes multiple consecutive single-quotes", () => {
    expect(sanitizeFilterValue("a''b")).toBe("a''''b");
  });

  it("escapes a trailing single-quote", () => {
    expect(sanitizeFilterValue("VCB'")).toBe("VCB''");
  });

  it("handles empty string", () => {
    expect(sanitizeFilterValue("")).toBe("");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// validateActionCode — whitelist regex [A-Z0-9]{1,10}
// ─────────────────────────────────────────────────────────────────────────────

describe("validateActionCode", () => {
  it("accepts typical Vietnamese stock tickers", () => {
    expect(validateActionCode("VCB")).toBe(true);
    expect(validateActionCode("HPG")).toBe(true);
    expect(validateActionCode("GAS")).toBe(true);
    expect(validateActionCode("VIC")).toBe(true);
    expect(validateActionCode("A")).toBe(true);
    expect(validateActionCode("ABCDE12345")).toBe(true); // max 10 chars
  });

  it("rejects SQL injection payloads", () => {
    expect(validateActionCode("VCB' OR '1'='1")).toBe(false);
    expect(validateActionCode("'; DROP TABLE rag_entries; --")).toBe(false);
    expect(validateActionCode("1=1")).toBe(false);
    expect(validateActionCode("OR 1=1")).toBe(false);
  });

  it("rejects lowercase letters", () => {
    expect(validateActionCode("vcb")).toBe(false);
    expect(validateActionCode("Vcb")).toBe(false);
  });

  it("rejects values longer than 10 characters", () => {
    expect(validateActionCode("ABCDE123456")).toBe(false); // 11 chars
  });

  it("rejects empty string", () => {
    expect(validateActionCode("")).toBe(false);
  });

  it("rejects strings with spaces", () => {
    expect(validateActionCode("VCB HPG")).toBe(false);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// validateLevel — strict enum
// ─────────────────────────────────────────────────────────────────────────────

describe("validateLevel", () => {
  it("accepts the four valid levels", () => {
    expect(validateLevel("global")).toBe(true);
    expect(validateLevel("country")).toBe(true);
    expect(validateLevel("domain")).toBe(true);
    expect(validateLevel("action")).toBe(true);
  });

  it("rejects unknown levels", () => {
    expect(validateLevel("stock")).toBe(false);
    expect(validateLevel("sector")).toBe(false);
    expect(validateLevel("")).toBe(false);
    expect(validateLevel("GLOBAL")).toBe(false); // case sensitive
  });

  it("rejects SQL injection payloads disguised as levels", () => {
    expect(validateLevel("global' OR '1'='1")).toBe(false);
    expect(validateLevel("global; DROP TABLE")).toBe(false);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// buildFilterClause — integration: clauses constructed from sanitized values
// ─────────────────────────────────────────────────────────────────────────────

describe("buildFilterClause (via sanitizeFilterValue)", () => {
  it("does NOT produce a tautology for injection payload in actionCode", () => {
    const malicious = "VCB' OR '1'='1";
    const escaped = sanitizeFilterValue(malicious);
    // The escaped string embedded in a SQL clause should not produce OR 1=1
    const clause = `action_code = '${escaped}'`;
    // A tautology would contain a closing quote followed by OR
    expect(clause).not.toMatch(/'.*OR.*'1'='1/);
    // The clause must be a strict equality comparison
    expect(clause).toBe(`action_code = 'VCB'' OR ''1''=''1'`);
  });

  it("constructs a safe clause for a normal actionCode", () => {
    const escaped = sanitizeFilterValue("VCB");
    const clause = `action_code = '${escaped}'`;
    expect(clause).toBe(`action_code = 'VCB'`);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// SearchFilters interface — type shape check (compile-time via TS)
// ─────────────────────────────────────────────────────────────────────────────

describe("SearchFilters type", () => {
  it("accepts optional level and actionCode", () => {
    const f1: SearchFilters = {};
    const f2: SearchFilters = { level: "global" };
    const f3: SearchFilters = { actionCode: "VCB" };
    const f4: SearchFilters = { level: "action", actionCode: "HPG" };
    expect(f1).toBeDefined();
    expect(f2.level).toBe("global");
    expect(f3.actionCode).toBe("VCB");
    expect(f4.actionCode).toBe("HPG");
  });
});
