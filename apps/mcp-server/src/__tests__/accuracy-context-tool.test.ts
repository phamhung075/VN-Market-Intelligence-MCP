/**
 * accuracy-context-tool.test.ts — Unit tests for getAccuracyContextTool
 *
 * Tests the calibration nudge logic in isolation (no McpServer instantiation).
 * Directly imports and calls getAccuracyStats + message builder logic via
 * the store layer.
 *
 * Covers:
 *   - Tool returns human-readable message string
 *   - Handles code not found (0 samples) → no-data message
 *   - Handles missing signal_type param (aggregate all types)
 *   - Threshold boundary text: <40% → LOWER, >70% → increase, middle → no adjustment
 */

import { describe, it, expect } from "bun:test";
import { Database } from "bun:sqlite";
import { initNewsTables } from "../infrastructure/db/schema-news.js";
import { getAccuracyStats } from "../infrastructure/db/signalOutcomeStore.js";

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeDb(): Database {
  const db = new Database(":memory:");
  initNewsTables(db);
  return db;
}

function insertSignal(
  db: Database,
  opts: {
    stockCode: string;
    signalType?: string;
    confidenceScore?: number;
  },
): number {
  const now = "2026-05-01 10:00:00";
  const result = db
    .prepare(
      `INSERT INTO agent_signals
         (from_agent, to_agent, signal_type, stock_code, payload, status, expires_at,
          created_at, cycle_id, finding_data, causal_ref, chain_depth,
          causal_root_id, causal_root_label, signal_class,
          confidence_score, validated_at,
          news_sentiment, kinh_dich_confidence, agent_signals_majority,
          critic_score, critic_notes, retry_count)
       VALUES (?, ?, ?, ?, '{}', 'unread', datetime('now','+2 hours'),
               ?, NULL, '{"direction":"BULLISH"}', NULL, 0, NULL, NULL, NULL, ?, ?,
               NULL, NULL, NULL, NULL, NULL, 0)`,
    )
    .run(
      "news-scout",
      "alert-commander",
      opts.signalType ?? "chain_catalyst",
      opts.stockCode,
      now,
      opts.confidenceScore ?? 70,
      now,
    );
  return Number(result.lastInsertRowid);
}

function insertResolvedOutcome(
  db: Database,
  opts: {
    signalId: number;
    stockCode: string;
    signalType?: string;
    outcome24h: "correct" | "incorrect" | "neutral";
  },
): void {
  db.prepare(
    `INSERT INTO signal_outcomes
       (signal_id, stock_code, signal_type, from_agent, predicted_direction,
        outcome_24h, checked_at, created_at)
     VALUES (?, ?, ?, 'news-scout', 'BULLISH', ?, datetime('now'), datetime('now', '-1 day'))`,
  ).run(
    opts.signalId,
    opts.stockCode,
    opts.signalType ?? "chain_catalyst",
    opts.outcome24h,
  );
}

// ── Calibration nudge builder (inline mirror of tool logic for unit testing) ──

interface AccuracyRow {
  signal_type: string;
  stock_code: string;
  sample_count: number;
  accuracy_rate: number | null;
}

function buildCalibrationNudge(
  stockCode: string,
  rows: AccuracyRow[],
  requestedTypes?: string[],
): string {
  if (rows.length === 0) {
    const typeHint = requestedTypes?.length
      ? ` for [${requestedTypes.join(", ")}]`
      : "";
    return `No accuracy history available for ${stockCode}${typeHint} (minimum 3 resolved signals required).`;
  }

  const lines: string[] = [`Accuracy history for ${stockCode}:`];

  for (const row of rows) {
    const rate = row.accuracy_rate;
    if (rate === null) {
      lines.push(`  - ${row.signal_type}: insufficient data (${row.sample_count} samples, need 3)`);
      continue;
    }

    const pct = Math.round(rate * 100);
    const correct = Math.round(rate * row.sample_count);
    let nudge: string;

    if (rate < 0.40) {
      nudge = "→ LOWER confidence by 20% (below threshold)";
    } else if (rate > 0.70) {
      nudge = "→ MAY increase confidence by 10%";
    } else {
      nudge = "→ no adjustment (within normal range)";
    }

    lines.push(
      `  - ${row.signal_type}: ${correct}/${row.sample_count} (${pct}%) in last 30 days ${nudge}`,
    );
  }

  lines.push("(minimum 3 samples required for accuracy rate; 0 samples = no adjustment)");
  return lines.join("\n");
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("get_accuracy_context — message format", () => {
  it("returns no-data message when code has 0 resolved signals", () => {
    const db = makeDb();
    const rows = getAccuracyStats(db, { stockCode: "VNM", days: 30 });
    const message = buildCalibrationNudge("VNM", rows);

    expect(message).toContain("No accuracy history available for VNM");
    expect(message).toContain("minimum 3 resolved signals required");
  });

  it("returns no-data message when sample_count < 3 (below HAVING threshold)", () => {
    const db = makeDb();
    // Insert only 2 resolved outcomes — getAccuracyStats returns empty (HAVING >= 3)
    for (let i = 0; i < 2; i++) {
      const sid = insertSignal(db, { stockCode: "VNM" });
      insertResolvedOutcome(db, { signalId: sid, stockCode: "VNM", outcome24h: "correct" });
    }

    const rows = getAccuracyStats(db, { stockCode: "VNM", days: 30 });
    const message = buildCalibrationNudge("VNM", rows);

    expect(message).toContain("No accuracy history available");
  });

  it("message includes stock code and signal type for found data", () => {
    const db = makeDb();
    // 7 correct + 3 incorrect = 70% accuracy
    for (let i = 0; i < 7; i++) {
      const sid = insertSignal(db, { stockCode: "VCB", signalType: "chain_catalyst" });
      insertResolvedOutcome(db, { signalId: sid, stockCode: "VCB", signalType: "chain_catalyst", outcome24h: "correct" });
    }
    for (let i = 0; i < 3; i++) {
      const sid = insertSignal(db, { stockCode: "VCB", signalType: "chain_catalyst" });
      insertResolvedOutcome(db, { signalId: sid, stockCode: "VCB", signalType: "chain_catalyst", outcome24h: "incorrect" });
    }

    const rows = getAccuracyStats(db, { stockCode: "VCB", days: 30 });
    const message = buildCalibrationNudge("VCB", rows);

    expect(message).toContain("Accuracy history for VCB:");
    expect(message).toContain("chain_catalyst");
    expect(message).toContain("7/10");
    expect(message).toContain("70%");
  });

  it("accuracy > 70% → MAY increase confidence nudge", () => {
    const db = makeDb();
    // 8 correct + 2 incorrect = 80%
    for (let i = 0; i < 8; i++) {
      const sid = insertSignal(db, { stockCode: "HPG", signalType: "chain_catalyst" });
      insertResolvedOutcome(db, { signalId: sid, stockCode: "HPG", signalType: "chain_catalyst", outcome24h: "correct" });
    }
    for (let i = 0; i < 2; i++) {
      const sid = insertSignal(db, { stockCode: "HPG", signalType: "chain_catalyst" });
      insertResolvedOutcome(db, { signalId: sid, stockCode: "HPG", signalType: "chain_catalyst", outcome24h: "incorrect" });
    }

    const rows = getAccuracyStats(db, { stockCode: "HPG", days: 30 });
    const message = buildCalibrationNudge("HPG", rows);

    expect(message).toContain("MAY increase confidence by 10%");
  });

  it("accuracy < 40% → LOWER confidence nudge", () => {
    const db = makeDb();
    // 1 correct + 4 incorrect = 20%
    const sid1 = insertSignal(db, { stockCode: "MSN", signalType: "urgent_news" });
    insertResolvedOutcome(db, { signalId: sid1, stockCode: "MSN", signalType: "urgent_news", outcome24h: "correct" });
    for (let i = 0; i < 4; i++) {
      const sid = insertSignal(db, { stockCode: "MSN", signalType: "urgent_news" });
      insertResolvedOutcome(db, { signalId: sid, stockCode: "MSN", signalType: "urgent_news", outcome24h: "incorrect" });
    }

    const rows = getAccuracyStats(db, { stockCode: "MSN", days: 30 });
    const message = buildCalibrationNudge("MSN", rows);

    expect(message).toContain("LOWER confidence by 20%");
  });

  it("accuracy 40%-70% → no adjustment nudge", () => {
    const db = makeDb();
    // 3 correct + 3 incorrect = 50%
    for (let i = 0; i < 3; i++) {
      const sid = insertSignal(db, { stockCode: "MWG", signalType: "price_anomaly" });
      insertResolvedOutcome(db, { signalId: sid, stockCode: "MWG", signalType: "price_anomaly", outcome24h: "correct" });
    }
    for (let i = 0; i < 3; i++) {
      const sid = insertSignal(db, { stockCode: "MWG", signalType: "price_anomaly" });
      insertResolvedOutcome(db, { signalId: sid, stockCode: "MWG", signalType: "price_anomaly", outcome24h: "incorrect" });
    }

    const rows = getAccuracyStats(db, { stockCode: "MWG", days: 30 });
    const message = buildCalibrationNudge("MWG", rows);

    expect(message).toContain("no adjustment (within normal range)");
  });

  it("handles missing signal_type param — aggregates all types for the stock", () => {
    const db = makeDb();
    // chain_catalyst: 3 correct + 0 incorrect
    for (let i = 0; i < 3; i++) {
      const sid = insertSignal(db, { stockCode: "TCB", signalType: "chain_catalyst" });
      insertResolvedOutcome(db, { signalId: sid, stockCode: "TCB", signalType: "chain_catalyst", outcome24h: "correct" });
    }
    // urgent_news: 2 correct + 3 incorrect
    for (let i = 0; i < 2; i++) {
      const sid = insertSignal(db, { stockCode: "TCB", signalType: "urgent_news" });
      insertResolvedOutcome(db, { signalId: sid, stockCode: "TCB", signalType: "urgent_news", outcome24h: "correct" });
    }
    for (let i = 0; i < 3; i++) {
      const sid = insertSignal(db, { stockCode: "TCB", signalType: "urgent_news" });
      insertResolvedOutcome(db, { signalId: sid, stockCode: "TCB", signalType: "urgent_news", outcome24h: "incorrect" });
    }

    // No signal_type filter — returns both groups
    const rows = getAccuracyStats(db, { stockCode: "TCB", days: 30 });
    const message = buildCalibrationNudge("TCB", rows);

    // Both signal types should appear in the message
    expect(message).toContain("chain_catalyst");
    expect(message).toContain("urgent_news");
    expect(message).toContain("Accuracy history for TCB:");
  });

  it("no-data message includes signal_type hint when specific types requested", () => {
    const db = makeDb();
    const rows = getAccuracyStats(db, { stockCode: "VHM", signalType: "chain_catalyst", days: 30 });
    const message = buildCalibrationNudge("VHM", rows, ["chain_catalyst"]);

    expect(message).toContain("VHM");
    expect(message).toContain("chain_catalyst");
  });
});
