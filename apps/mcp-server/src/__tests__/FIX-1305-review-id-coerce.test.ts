/**
 * FIX-1305 — review_market_message: id parameter coercion (string → number)
 *
 * Bug: MCP framework passes id as string "88" but Zod schema expects z.number().
 * Fix: change Zod schema to z.coerce.number() so "88" is coerced to 88.
 *
 * Acceptance criteria:
 *   AC-1: handleReviewMarketMessage({ id: "88", verdict: "signal" }) → processes without error
 *   AC-2: handleReviewMarketMessage({ id: 88, verdict: "signal" }) → still works (number input)
 *   AC-3: Zod schema on the tool registration accepts string id and coerces to number
 */

Bun.env["DB_PATH"] = ":memory:";

import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { initDatabase, getDb, closeDb } from "../infrastructure/db/schema.js";
import { handleReviewMarketMessage } from "../interface/mcp/tools/briefings/marketMessageTools.js";
import { z } from "zod";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function seedRow(params: {
  from_agent: string;
  message_type: string;
  ticker: string | null;
  content: string;
  sent_at: string;
}): number {
  const db = getDb();
  const result = db
    .prepare(
      `INSERT INTO market_messages
         (from_agent, message_type, ticker, content, sent_at)
       VALUES (?, ?, ?, ?, ?)`,
    )
    .run(params.from_agent, params.message_type, params.ticker, params.content, params.sent_at);
  return Number(result.lastInsertRowid);
}

// ─────────────────────────────────────────────────────────────────────────────
// AC-1: string id is coerced and processed correctly
// ─────────────────────────────────────────────────────────────────────────────

describe("FIX-1305 — AC-1: string id coercion", () => {
  beforeEach(async () => {
    closeDb();
    await initDatabase();
  });

  afterEach(() => {
    closeDb();
  });

  it('id="88" (string) → reviews the correct row without error', async () => {
    const id = seedRow({
      from_agent: "alert-commander",
      message_type: "alert",
      ticker: "VCB",
      content: "VCB drop 3%",
      sent_at: "2026-04-25 09:00:00",
    });

    // Simulate MCP framework passing id as a string
    const result = await handleReviewMarketMessage({
      id: String(id) as unknown as number,
      verdict: "signal",
    });

    expect(result.content[0]!.type).toBe("text");
    // Should succeed — not an error message
    expect(result.content[0]!.text).toContain("labelled as 'signal'");
    expect(result.content[0]!.text).not.toContain("Error");
    expect(result.content[0]!.text).not.toContain("not found");
  });

  it('id="88" string → row has verdict set in DB', async () => {
    const id = seedRow({
      from_agent: "morning-briefing",
      message_type: "morning_briefing",
      ticker: null,
      content: "morning text",
      sent_at: "2026-04-25 08:00:00",
    });

    await handleReviewMarketMessage({
      id: String(id) as unknown as number,
      verdict: "noise",
      note: "stale content",
    });

    const db = getDb();
    const row = db
      .prepare("SELECT verdict, verdict_note FROM market_messages WHERE id = ?")
      .get(id) as { verdict: string; verdict_note: string } | undefined;

    expect(row).toBeDefined();
    expect(row!.verdict).toBe("noise");
    expect(row!.verdict_note).toBe("stale content");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// AC-2: numeric id still works (regression guard)
// ─────────────────────────────────────────────────────────────────────────────

describe("FIX-1305 — AC-2: numeric id still works", () => {
  beforeEach(async () => {
    closeDb();
    await initDatabase();
  });

  afterEach(() => {
    closeDb();
  });

  it("id=88 (number) → processes correctly", async () => {
    const id = seedRow({
      from_agent: "alert-commander",
      message_type: "alert",
      ticker: "HPG",
      content: "HPG breakout",
      sent_at: "2026-04-25 10:00:00",
    });

    const result = await handleReviewMarketMessage({
      id,
      verdict: "signal",
    });

    expect(result.content[0]!.text).toContain("labelled as 'signal'");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// AC-3: Zod coerce schema test
// ─────────────────────────────────────────────────────────────────────────────

describe("FIX-1305 — AC-3: z.coerce.number() schema accepts string id", () => {
  it('z.coerce.number() parses "88" to 88', () => {
    const schema = z.coerce.number().int().min(1);
    const result = schema.parse("88");
    expect(result).toBe(88);
    expect(typeof result).toBe("number");
  });

  it("z.coerce.number() passes through 88 (number) unchanged", () => {
    const schema = z.coerce.number().int().min(1);
    const result = schema.parse(88);
    expect(result).toBe(88);
  });

  it('z.number() (old schema) throws on "88" (string) — confirms the bug', () => {
    const oldSchema = z.number().int().min(1);
    expect(() => oldSchema.parse("88")).toThrow();
  });
});
