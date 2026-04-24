/**
 * Generate AI Summary — Task 066 (Application Layer)
 *
 * Rule-based BCTC analysis. Inspects FinancialReport ratios and period
 * deltas to emit FinancialSignal values, derives an Outlook, builds
 * Vietnamese-language strength/weakness text, and persists the result
 * back to the financial_reports table.
 *
 * No LLM calls — pure threshold logic.
 *
 * Layer: application/usecases — may import from domain/ and infrastructure/.
 */

import type { Database } from "bun:sqlite";
import type {
  FinancialReport,
  FinancialSignal,
  AIAnalysis,
  Outlook,
} from "../../../bctc-schema.js";
import { getDb } from "../../infrastructure/db/schema.js";
import { logger } from "../../infrastructure/logger.js";

// ─────────────────────────────────────────────────────────────────────────────
// Public types
// ─────────────────────────────────────────────────────────────────────────────

export interface GenerateAiSummaryOptions {
  db?: Database;
}

// ─────────────────────────────────────────────────────────────────────────────
// Signal detection — pure, no I/O
// ─────────────────────────────────────────────────────────────────────────────

/** Positive signal identifiers (maps to keyStrengths) */
const POSITIVE_SIGNALS = new Set<FinancialSignal>([
  "strong_revenue_growth",
  "strong_profit_growth",
  "margin_expansion",
  "strong_cashflow",
  "debt_reduction",
]);

/** Negative signal identifiers (maps to keyWeaknesses) */
const NEGATIVE_SIGNALS = new Set<FinancialSignal>([
  "revenue_decline",
  "profit_decline",
  "margin_compression",
  "negative_cashflow",
  "high_debt",
  "inventory_buildup",
  "receivables_concern",
]);

/**
 * Inspect FinancialReport.yoyDelta + ratios + cashFlow to emit FinancialSignal[].
 *
 * Rules from REQ_006 FR-066-1 and TECH_006 signal threshold table.
 * Skip any check where the required delta field is null or changePct is null/NaN.
 * Deduplicate output. Never throws.
 *
 * @param report Fully populated FinancialReport
 * @returns FinancialSignal[] — deduplicated, ordered by detection priority
 */
export function detectFinancialSignals(report: FinancialReport): FinancialSignal[] {
  const signals = new Set<FinancialSignal>();
  const yoy = report.yoyDelta;
  const ratios = report.ratios;
  const cf = report.cashFlow;

  // ── Delta-based signals (require yoyDelta) ────────────────────────────────

  if (yoy !== null) {
    // Revenue signals (mutually exclusive — only the stronger fires)
    const revPct = yoy.netRevenue.changePct;
    if (revPct !== null && !isNaN(revPct)) {
      if (revPct >= 20) {
        signals.add("strong_revenue_growth");
      } else if (revPct < 0) {
        signals.add("revenue_decline");
      }
    }

    // Margin signals (mutually exclusive)
    const marginPP = yoy.grossMarginPP.changePP;
    if (!isNaN(marginPP)) {
      if (marginPP > 1.5) {
        signals.add("margin_expansion");
      } else if (marginPP < -1.5) {
        signals.add("margin_compression");
      }
    }

    // Profit signals (mutually exclusive)
    const profitPct = yoy.netProfit.changePct;
    if (profitPct !== null && !isNaN(profitPct)) {
      if (profitPct >= 20) {
        signals.add("strong_profit_growth");
      } else if (profitPct < 0) {
        signals.add("profit_decline");
      }
    }

    // Debt reduction
    const debtPct = yoy.totalDebt.changePct;
    if (debtPct !== null && !isNaN(debtPct) && debtPct < -10) {
      signals.add("debt_reduction");
    }

    // Strong cashflow — requires both positive FCF AND positive YoY FCF growth
    const fcfPct = yoy.freeCashFlow.changePct;
    if (
      cf.freeCashFlow > 0 &&
      fcfPct !== null &&
      !isNaN(fcfPct) &&
      fcfPct > 0
    ) {
      signals.add("strong_cashflow");
    }
  }

  // ── Ratio-based signals (no delta needed) ─────────────────────────────────

  // High debt — cap Infinity at 99.9 per TECH spec
  const de = isFinite(ratios.debtToEquity) ? ratios.debtToEquity : 99.9;
  if (de > 2.0) {
    signals.add("high_debt");
  }

  // Negative FCF
  if (cf.freeCashFlow < 0) {
    signals.add("negative_cashflow");
  }

  // Inventory buildup
  if (ratios.inventoryDays > 90) {
    signals.add("inventory_buildup");
  }

  // Receivables concern
  if (ratios.receivablesDays > 60) {
    signals.add("receivables_concern");
  }

  return Array.from(signals);
}

// ─────────────────────────────────────────────────────────────────────────────
// Outlook derivation — pure, first-match rule set
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Derive overall Outlook from a signal array.
 *
 * Rules (first match wins):
 *   1. ≥2 positive signals AND no negative → 'positive'
 *   2. ≥2 negative signals AND no positive → 'negative'
 *   3. Both positive and negative present → 'mixed'
 *   4. Default → 'neutral'
 *
 * @param signals Detected FinancialSignal[]
 */
export function deriveOutlook(signals: FinancialSignal[]): Outlook {
  const positiveCount = signals.filter(s => POSITIVE_SIGNALS.has(s)).length;
  const negativeCount = signals.filter(s => NEGATIVE_SIGNALS.has(s)).length;

  if (positiveCount >= 2 && negativeCount === 0) return "positive";
  if (negativeCount >= 2 && positiveCount === 0) return "negative";
  if (positiveCount > 0 && negativeCount > 0) return "mixed";
  return "neutral";
}

// ─────────────────────────────────────────────────────────────────────────────
// Strengths / Weaknesses text builder — pure, Vietnamese language
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Convert signals to Vietnamese-language strings.
 * Positive signals → keyStrengths; negative signals → keyWeaknesses.
 * Each string includes specific metric value for traceability.
 *
 * @param signals Detected signals
 * @param report  Source report (for metric values)
 */
export function buildStrengthsWeaknesses(
  signals: FinancialSignal[],
  report: FinancialReport,
): { keyStrengths: string[]; keyWeaknesses: string[] } {
  const keyStrengths: string[] = [];
  const keyWeaknesses: string[] = [];
  const yoy = report.yoyDelta;
  const ratios = report.ratios;

  for (const signal of signals) {
    switch (signal) {
      case "strong_revenue_growth": {
        const pct = yoy?.netRevenue.changePct;
        keyStrengths.push(
          `Doanh thu tăng ${pct !== null && pct !== undefined ? pct.toFixed(1) : "N/A"}% YoY — tăng trưởng mạnh`,
        );
        break;
      }
      case "revenue_decline": {
        const pct = yoy?.netRevenue.changePct;
        keyWeaknesses.push(
          `Doanh thu giảm ${pct !== null && pct !== undefined ? Math.abs(pct).toFixed(1) : "N/A"}% YoY — cần theo dõi`,
        );
        break;
      }
      case "margin_expansion": {
        const pp = yoy?.grossMarginPP.changePP;
        keyStrengths.push(
          `Biên lợi nhuận gộp mở rộng +${pp !== undefined ? pp.toFixed(2) : "N/A"}pp YoY`,
        );
        break;
      }
      case "margin_compression": {
        const pp = yoy?.grossMarginPP.changePP;
        keyWeaknesses.push(
          `Biên lợi nhuận gộp thu hẹp ${pp !== undefined ? pp.toFixed(2) : "N/A"}pp YoY`,
        );
        break;
      }
      case "strong_profit_growth": {
        const pct = yoy?.netProfit.changePct;
        keyStrengths.push(
          `Lợi nhuận sau thuế tăng ${pct !== null && pct !== undefined ? pct.toFixed(1) : "N/A"}% YoY`,
        );
        break;
      }
      case "profit_decline": {
        const pct = yoy?.netProfit.changePct;
        keyWeaknesses.push(
          `Lợi nhuận sau thuế giảm ${pct !== null && pct !== undefined ? Math.abs(pct).toFixed(1) : "N/A"}% YoY`,
        );
        break;
      }
      case "high_debt": {
        const de = isFinite(ratios.debtToEquity) ? ratios.debtToEquity : 99.9;
        keyWeaknesses.push(
          `Nợ/Vốn chủ sở hữu ở mức ${de.toFixed(2)}x — rủi ro đòn bẩy cao`,
        );
        break;
      }
      case "debt_reduction": {
        const pct = yoy?.totalDebt.changePct;
        keyStrengths.push(
          `Giảm nợ ${pct !== null && pct !== undefined ? Math.abs(pct).toFixed(1) : "N/A"}% YoY — cải thiện bảng cân đối`,
        );
        break;
      }
      case "strong_cashflow": {
        keyStrengths.push("Dòng tiền tự do dương và tăng trưởng");
        break;
      }
      case "negative_cashflow": {
        keyWeaknesses.push("Dòng tiền tự do âm — theo dõi nhu cầu vốn");
        break;
      }
      case "inventory_buildup": {
        keyWeaknesses.push(
          `Tồn kho cao — vòng quay hàng tồn kho ${Math.round(ratios.inventoryDays)} ngày`,
        );
        break;
      }
      case "receivables_concern": {
        keyWeaknesses.push(
          `Kỳ thu tiền bình quân ${Math.round(ratios.receivablesDays)} ngày — rủi ro phải thu`,
        );
        break;
      }
    }
  }

  return { keyStrengths, keyWeaknesses };
}

// ─────────────────────────────────────────────────────────────────────────────
// Narrative summary builder — pure, Vietnamese template
// ─────────────────────────────────────────────────────────────────────────────

/** Vietnamese outlook label map */
const OUTLOOK_LABEL: Record<Outlook, string> = {
  positive: "kết quả tích cực",
  negative: "kết quả tiêu cực, cần theo dõi",
  mixed: "kết quả hỗn hợp — có điểm mạnh và điểm yếu",
  neutral: "kết quả ổn định",
};

/**
 * Build a 1–3 sentence Vietnamese narrative combining outlook, top signals,
 * and key metric values. Template-based; no randomness.
 *
 * @param report   Source FinancialReport
 * @param signals  Detected FinancialSignal[]
 * @param outlook  Derived Outlook
 */
export function buildSummaryNarrative(
  report: FinancialReport,
  signals: FinancialSignal[],
  outlook: Outlook,
): string {
  const periodLabel = report.period.sortKey;
  const code = report.actionCode;
  const outlookText = OUTLOOK_LABEL[outlook];

  // Opening sentence
  const opening = `[Kỳ ${periodLabel}] ${code} ghi nhận ${outlookText}.`;

  // If no signals, use ratios-only summary
  if (signals.length === 0) {
    const roe = report.ratios.roe.toFixed(1);
    const de = isFinite(report.ratios.debtToEquity)
      ? report.ratios.debtToEquity.toFixed(2)
      : "N/A";
    return `${opening} ROE đạt ${roe}%, D/E ở mức ${de}x.`;
  }

  // Build signal summary sentence from top signals (up to 3)
  const topSignals = signals.slice(0, 3);
  const { keyStrengths, keyWeaknesses } = buildStrengthsWeaknesses(topSignals, report);
  const allPoints = [...keyStrengths, ...keyWeaknesses];

  if (allPoints.length === 0) {
    return opening;
  }

  const mainPoint = allPoints[0];
  const sentences = [opening, `${mainPoint}.`];

  if (allPoints.length > 1) {
    sentences.push(`Theo dõi thêm: ${allPoints.slice(1).join("; ")}.`);
  }

  return sentences.join(" ");
}

// ─────────────────────────────────────────────────────────────────────────────
// SQLite persistence — module-private
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Ensure the financial_reports table has an `ai_analysis` column.
 * Uses PRAGMA table_info to check before ALTER TABLE — idempotent.
 */
function ensureAiAnalysisColumn(db: Database): void {
  const cols = db
    .query<{ name: string }, []>("PRAGMA table_info(financial_reports)")
    .all();
  if (!cols.some(c => c.name === "ai_analysis")) {
    db.exec("ALTER TABLE financial_reports ADD COLUMN ai_analysis TEXT");
  }
}

/**
 * Persist AIAnalysis back to the financial_reports table.
 *
 * - Checks PRAGMA table_info before ALTER TABLE (idempotent).
 * - Logs warning when reportId is not found; never throws.
 *
 * @param reportId   UUID of the FinancialReport to update
 * @param aiAnalysis AIAnalysis to persist as JSON
 * @param db         SQLite Database instance
 */
function updateFinancialReportAiAnalysis(
  reportId: string,
  aiAnalysis: AIAnalysis,
  db: Database,
): void {
  try {
    ensureAiAnalysisColumn(db);

    const json = JSON.stringify(aiAnalysis);
    const stmt = db.prepare(
      "UPDATE financial_reports SET ai_analysis = ? WHERE id = ?",
    );
    const info = stmt.run(json, reportId);

    if ((info as { changes: number }).changes === 0) {
      logger.warn(
        `[generateAiSummary] report id '${reportId}' not found in financial_reports — ai_analysis not persisted`,
      );
    }
  } catch (err) {
    logger.error("[generateAiSummary] Failed to persist ai_analysis", {
      reportId,
      error: String(err),
    });
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Main exported use case
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Rule-based BCTC analysis. No LLM calls.
 *
 * Steps:
 *   1. detectFinancialSignals(report)              — pure, no I/O
 *   2. deriveOutlook(signals)                      — pure, no I/O
 *   3. buildStrengthsWeaknesses(signals, report)   — pure, no I/O
 *   4. buildSummaryNarrative(report, signals, outlook) — pure, no I/O
 *   5. updateFinancialReportAiAnalysis(...)         — SQLite write
 *   6. Return AIAnalysis
 *
 * @param report   Fully populated FinancialReport
 * @param options  Optional db injection for tests
 */
export async function generateAiSummary(
  report: FinancialReport,
  options?: GenerateAiSummaryOptions,
): Promise<AIAnalysis> {
  const db = options?.db ?? getDb();

  // Step 1: Detect signals
  const signals = detectFinancialSignals(report);

  // Step 2: Derive outlook
  const outlook = deriveOutlook(signals);

  // Step 3: Build strengths/weaknesses
  const { keyStrengths, keyWeaknesses } = buildStrengthsWeaknesses(signals, report);

  // Step 4: Build summary narrative
  const summary = buildSummaryNarrative(report, signals, outlook);

  // Assemble AIAnalysis (note: watchPoints is part of the interface per bctc-schema)
  const aiAnalysis: AIAnalysis = {
    summary,
    keyStrengths,
    keyWeaknesses,
    signals,
    outlook,
    watchPoints: keyWeaknesses, // mirror weaknesses as watch points
    generatedAt: new Date().toISOString(),
  };

  // Step 5: Persist to SQLite
  updateFinancialReportAiAnalysis(report.id, aiAnalysis, db);

  // Step 6: Return
  return aiAnalysis;
}
