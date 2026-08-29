/**
 * Task 047 — BCTC Orchestrator (Full Parse Pipeline)
 *
 * Application use case: orchestrates the full BCTC parse pipeline.
 *
 * Pipeline:
 *   1. extractBalanceSheet     (domain)
 *   2. extractIncomeStatement  (domain)
 *   3. extractCashFlow         (domain)
 *   4. computeEbitda           (derived: operatingProfit + depreciation)
 *   5. computeFinancialRatios  (domain)
 *   6. computePeriodDelta      (domain, optional — only when previousReport given)
 *   7. computeConfidence       (count non-zero fields / total key fields)
 *   8. store in SQLite         (infrastructure)
 *
 * Layering rule: this file (application) is allowed to import from both
 * domain/ and infrastructure/. Domain services must never import infrastructure.
 */

import { randomUUID } from "node:crypto";

import { extractBalanceSheet } from "../../domain/services/financial-reports/balanceSheetExtractor.js";
import { extractIncomeStatement } from "../../domain/services/financial-reports/incomeStatementExtractor.js";
import { extractCashFlow } from "../../domain/services/financial-reports/cashFlowExtractor.js";
import { computeFinancialRatios } from "../../domain/services/financial-reports/ratioComputer.js";
import { computePeriodDelta } from "../../domain/services/financial-reports/periodDeltaComputer.js";
import type { FinancialMetrics } from "../../domain/services/financial-reports/periodDeltaComputer.js";
import { validateFinancialReport } from "../../domain/services/financial-reports/bctcValidator.js";
import {
  validateFinancialFigures,
  detectUnitMismatch,
  detectBsIntraStmtUnitMismatch,
} from "../../domain/services/financial-reports/financialFiguresValidator.js";
import type { FinancialFiguresInput } from "../../domain/services/financial-reports/financialFiguresValidator.js";
// FIX-CI-SIZELINT-BCTC-1345B-PARSE-VALIDATOR-PAIR: describeConfidenceFinancialReason
// moved to its own domain module (self-contained, zero I/O). Imported (not just
// re-exported) because it's still called below; re-exported so
// FIX-BCTC-1345B-ALERT-NAMES-A-RULE-FAMILY.test.ts's dynamic
// `import("../application/usecases/parseBctcReport.js")` keeps resolving it here.
import { describeConfidenceFinancialReason } from "../../domain/services/financial-reports/confidenceFinancialReasonBuilder.js";
export { describeConfidenceFinancialReason };
import { getDb, initDatabase } from "../../infrastructure/db/schema.js";
import {
  isBctcSignalDebounced,
  recordBctcSignalSent,
  BCTC_SIGNAL_DEBOUNCE_HOURS,
} from "../../infrastructure/db/bctcSignalDebounce.js";
import {
  recordZeroExtractBlock,
  BCTC_ZERO_EXTRACT_DEAD_AT_ATTEMPTS,
} from "../../infrastructure/db/bctcZeroExtractBlocklist.js";
import { checkPeriodContentConsistency, BctcPeriodContentMismatchError } from "../../domain/services/financial-reports/periodContentExtractor.js";
import { logger } from "../../infrastructure/logger.js";

import type {
  FinancialReport,
  FiscalPeriod,
  BalanceSheet,
  IncomeStatement,
  CashFlowStatement,
  FinancialRatios,
  PeriodDelta,
} from "../../../bctc-schema.js";

// ─────────────────────────────────────────────────────────────────────────────
// Banking sector — operatingProfit proxy constant (Task 1424a)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Vietnamese credit institutions (HOSE/HNX) whose BCTC income statements use a
 * different structural position for operating profit.  The OCR extractor sets
 * `operatingProfit = 0` for these tickers because the label
 * "Lợi nhuận thuần từ hoạt động kinh doanh" does not appear in the standard
 * position expected by the regex.
 *
 * When `operatingProfit === 0` AND `netProfit !== 0`, `parseBctcReport` uses
 * `netProfit` as a proxy for the operating margin validation check only.
 * The stored `operating_profit` column value is NOT altered — it remains 0
 * (accurate to the OCR extraction).
 *
 * Source of truth: docs/{policies,protocols,standards,references}/stock-classification.md (sector=banking).
 * Developer must sync this set against that file on each update.
 */
const BANKING_TICKERS = new Set([
  "VCB", "BID", "CTG", "MBB", "TCB", "VPB", "ACB", "STB",
  "HDB", "TPB", "MSB", "SSB", "OCB", "VIB", "BAB", "ABB",
  "NAB", "SGB", "PGB", "KLB",
]);

// ─────────────────────────────────────────────────────────────────────────────
// Input / Output types
// ─────────────────────────────────────────────────────────────────────────────

export interface ParseBctcReportParams {
  /** Raw text extracted from a BCTC PDF (all three statements) */
  rawText: string;
  /** Stock ticker / action code e.g. "VCB", "HPG" */
  actionCode: string;
  /** Fiscal period this report covers */
  period: FiscalPeriod;
  /** Shares outstanding — optional, enables per-share ratios */
  shares?: number;
  /** Market price per share in VND — optional, enables valuation ratios */
  price?: number;
  /**
   * Previous period FinancialReport — optional.
   * When provided, QoQ/YoY delta is computed and attached to the result.
   * Also used for average-based ratios (ROE, ROA, etc.).
   */
  previousReport?: FinancialReport;
  /**
   * FIX-BCTC-REPARSE-BATCH-CORRUPTION-NGAYNOP-FLIP: real filing date (ISO),
   * sourced from the filing itself (e.g. SSC document metadata —
   * `doc.publishedAt` from listSscDocuments()) — NEVER the processing
   * timestamp. Optional: when omitted (a reparse/recovery call that supplies
   * only pdfTextOverride, with no SSC doc), storeReport() falls back to the
   * processing timestamp ONLY on a genuine first-ever insert for this
   * (action_code, sort_key) — its ON CONFLICT clause never touches
   * published_at on a re-parse, so this fallback can never clobber an
   * existing row's real filing date.
   */
  publishedAt?: string | null;
  /**
   * Injectable Telegram bug notifier — for testability (Task 1792).
   * When provided, overrides the default dynamic import of sendTelegramBug.
   * In production callers, omit to use the real Telegram notifier.
   */
  _telegramBugFn?: (msg: string) => Promise<boolean>;
}

// ─────────────────────────────────────────────────────────────────────────────
// Confidence scoring
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Compute extraction confidence: fraction of key financial fields that
 * are non-zero. A complete, well-structured BCTC should score ≥ 0.7.
 *
 * Key fields sampled:
 *  - Balance Sheet: 6 fields
 *  - Income Statement: 6 fields
 *  - Cash Flow: 4 fields
 *  Total: 16 key fields
 */
function computeConfidence(
  bs: BalanceSheet,
  is: IncomeStatement,
  cf: CashFlowStatement,
): number {
  const keyFields: number[] = [
    // Balance Sheet (6 fields)
    bs.totalAssets,
    bs.currentAssets.cash,
    bs.currentAssets.inventory,
    bs.totalLiabilities,
    bs.equity.total,
    bs.totalLiabilitiesAndEquity,

    // Income Statement (6 fields)
    is.netRevenue,
    is.grossProfit,
    is.operatingProfit,
    is.profitBeforeTax,
    is.netProfit,
    is.totalIncomeTax,

    // Cash Flow (4 fields)
    cf.operatingCF,
    cf.netCashFlow,
    cf.beginningCash,
    cf.endingCash,
  ];

  const nonZeroCount = keyFields.filter((v) => v !== 0).length;
  const rawConfidence = nonZeroCount / keyFields.length;

  // Bug 3 fix: when ALL three core financial fields are zero, the extraction
  // produced no meaningful data regardless of how many ancillary fields are
  // non-zero (e.g. cash flow sub-fields from an unrelated text fragment).
  // Cap confidence at 0.05 to prevent phantom confidence scores (DGC: 63%,
  // BSR: 13%) on effectively empty reports.
  const coreFieldsAllZero =
    bs.totalAssets === 0 &&
    is.netRevenue === 0 &&
    is.netProfit === 0;

  if (coreFieldsAllZero) {
    return Math.min(rawConfidence, 0.05);
  }

  return rawConfidence;
}

// ─────────────────────────────────────────────────────────────────────────────
// Delta helper: build FinancialMetrics from a FinancialReport
// ─────────────────────────────────────────────────────────────────────────────

function toMetrics(report: FinancialReport): FinancialMetrics {
  return {
    netRevenue: report.incomeStatement.netRevenue,
    grossProfit: report.incomeStatement.grossProfit,
    operatingProfit: report.incomeStatement.operatingProfit,
    netProfit: report.incomeStatement.netProfit,
    ebitda: report.incomeStatement.ebitda,
    eps: report.incomeStatement.eps,
    totalAssets: report.balanceSheet.totalAssets,
    equity: report.balanceSheet.equity.total,
    totalDebt:
      report.balanceSheet.currentLiabilities.shortTermDebt +
      report.balanceSheet.longTermLiabilities.longTermDebt,
    cash: report.balanceSheet.currentAssets.cash,
    operatingCF: report.cashFlow.operatingCF,
    freeCashFlow: report.cashFlow.freeCashFlow,
    grossMarginPct: report.ratios.grossMarginPct ?? 0,
    netMarginPct: report.ratios.netMarginPct ?? 0,
    roe: report.ratios.roe ?? 0,
    debtToEquity: report.ratios.debtToEquity ?? 0,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// SQLite persistence
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Upsert a FinancialReport into the financial_reports SQLite table.
 *
 * FIX-BCTC-D1-STABILIZE-REPORT-ID: uses INSERT ... ON CONFLICT(action_code,
 * sort_key) DO UPDATE SET <all columns except id> — NOT INSERT OR REPLACE.
 * `financial_reports` has UNIQUE(action_code, sort_key) (bctc-schema.ts).
 * INSERT OR REPLACE resolves conflicts by DELETE-then-INSERT, which mints a
 * brand-new `id` (report.id = randomUUID() below) on every re-parse of the
 * same (action_code, sort_key). Downstream PEK tables (bctc_layout_units,
 * bctc_page_zones) reference financial_reports.id via a plain TEXT column —
 * NOT a real FK — so a replaced id silently orphans any rows already written
 * against the old id. The ON CONFLICT ... DO UPDATE form updates the existing
 * row in place instead: `id` is deliberately omitted from the SET clause, so
 * SQLite never touches it on conflict — the original row's id survives across
 * every re-parse. `action_code`/`sort_key` are also omitted from SET since
 * they ARE the conflict-target match key (guaranteed identical, updating them
 * would be a no-op). The `$id` bind value is only ever used on a genuine
 * first insert (no existing row) — on conflict it is discarded by SQLite.
 *
 * 1196: extractionConfidence guard —
 *   0.0   → skip insert entirely (all-zero extraction, no signal value)
 *   (0,0.2) → insert with validation_status='low_confidence', send WORK alert
 */
async function storeReport(
  report: FinancialReport,
  validationStatus: string,
  validationNotes: string | null,
  extractionConfidence: number,
  confidenceFinancial?: number,
  telegramBugFn?: (msg: string) => Promise<boolean>,
  confidenceFinancialDetail?: string,
): Promise<void> {
  // 1196: Guard — all-zero extraction produces no usable data; skip insert entirely.
  if (extractionConfidence === 0) {
    const msg =
      `[BCTC] Zero-confidence extraction — skipped insert for ` +
      `${report.actionCode} ${report.period.year}-${report.period.periodType ?? ""}`;
    logger.warn(msg);
    // Fire-and-forget: storeReport is sync; Telegram is async
    void import("../../infrastructure/notifiers/telegram.js").then(({ sendTelegramWork }) => {
      sendTelegramWork(msg, { parseMode: "" }).catch(() => {});
    });
    return; // NO INSERT
  }

  // 1196: Low-confidence path — insert but override validation status.
  if (extractionConfidence < 0.2) {
    validationStatus = "low_confidence";
    const lowMsg =
      `[BCTC] Low-confidence extraction (${(extractionConfidence * 100).toFixed(0)}%) — ` +
      `inserting with low_confidence flag for ` +
      `${report.actionCode} ${report.period.year}-${report.period.periodType ?? ""}`;
    logger.warn(lowMsg);
    void import("../../infrastructure/notifiers/telegram.js").then(({ sendTelegramWork }) => {
      sendTelegramWork(lowMsg, { parseMode: "" }).catch(() => {});
    });
  }

  // 1345b: Financial validation confidence gate.
  // composite_confidence = min(extractionConfidence, confidenceFinancial)
  // When composite <= 0.3: mark low_confidence, send bug alert, skip conviction signal.
  const compositeConfidence = confidenceFinancial !== undefined
    ? Math.min(extractionConfidence, confidenceFinancial)
    : extractionConfidence;

  if (confidenceFinancial !== undefined && compositeConfidence <= 0.3) {
    validationStatus = "low_confidence";
    // FIX-BCTC-1345B-ALERT-NAMES-A-RULE-FAMILY-THAT-CANNOT-PRODUCE-ITS-OWN-VALUE:
    // name the detector that ACTUALLY fired (AC-1) instead of an unconditional
    // hard-coded ticker-pattern hint. `confidenceFinancialDetail` is built by
    // `describeConfidenceFinancialReason()` at the call site, where the raw
    // detector booleans and figures are still in scope.
    const financialMsg =
      `[BCTC-1345b] Low financial confidence (composite=${compositeConfidence.toFixed(2)}, ` +
      `financial=${confidenceFinancial.toFixed(2)}) — conviction signal skipped for ` +
      `${report.actionCode} ${report.period.year}-${report.period.periodType ?? ""}. ` +
      `${confidenceFinancialDetail ?? "validateFinancialFigures() detail unavailable — see confidence_financial column."}`;
    logger.warn(financialMsg);

    const periodKey = `${report.period.year}-${report.period.periodType ?? ""}`;
    const db = getDb();

    // FIX-BCTC-1345B-REPORT-BATCH: suppress the Telegram alert when this exact
    // (action_code, sort_key) is ALREADY tracked as low_confidence from a PRIOR
    // parse attempt — an "open quality row" per PO 2026-06-07T19:20:08Z. Task
    // 1792's debounce below only covers a 1h retry-storm window; it does
    // nothing for `bctcReparseJob` (scheduler/financial-reports/bctcReparseJob.ts),
    // which retries the SAME still-broken backlog daily (24h apart, well
    // outside any hourly cooldown) — that daily re-fire on an already-known,
    // still-unresolved issue was the actual source of the "6 reports today /
    // 11 more the next day" noise, not same-ticket retry storms (those were
    // already fixed by 1792). Re-using the persistent `validation_status`
    // column already on `financial_reports` (rather than a new table) means
    // the row self-closes the moment a re-parse produces real confidence
    // (validationStatus flips away from 'low_confidence' below) — no manual
    // reset needed.
    const existingQualityRow = db
      .query<{ validation_status: string | null }, [string, string]>(
        `SELECT validation_status FROM financial_reports WHERE action_code = ? AND sort_key = ?`,
      )
      .get(report.actionCode, report.period.sortKey);
    const alreadyOpenQualityRow = existingQualityRow?.validation_status === "low_confidence";

    // Task 1792 — DB-backed per-ticker+quarter debounce (1h cooldown).
    // Prevents the same bug report firing 10× in a retry loop.
    if (
      !alreadyOpenQualityRow &&
      !isBctcSignalDebounced(db, report.actionCode, periodKey, BCTC_SIGNAL_DEBOUNCE_HOURS)
    ) {
      recordBctcSignalSent(db, report.actionCode, periodKey);
      // Task 1792 fix: await the send so test assertions run AFTER Telegram call.
      // Use injected telegramBugFn when provided (testability); otherwise dynamic import.
      if (telegramBugFn) {
        await telegramBugFn(financialMsg).catch(() => {});
      } else {
        const { sendTelegramBug } = await import("../../infrastructure/notifiers/telegram.js");
        await sendTelegramBug(financialMsg).catch(() => {});
      }
    }
    // NOTE: we still INSERT the record (for audit trail) but with low_confidence status.
    // Conviction signals are NOT generated — enforced by callers checking validation_status.
  }

  const db = getDb();

  // FIX-BCTC-REPARSE-BATCH-CORRUPTION-NGAYNOP-FLIP: never let a reparse
  // replace a previously-good stored report with corrupt/failed data.
  // "Good" (existing) = total_assets > 0. "Failed" (new) = totalAssets <= 0
  // — the exact OCR-corruption fingerprint bctcIdentityGuard.ts checks at
  // serve time (total_assets<=0 -> "[CORRUPT DATA — SKIP]"). The
  // extractionConfidence===0 guard above already blocks an ALL-ZERO
  // extraction from writing at all; this closes the remaining gap where a
  // PARTIAL failure (e.g. the balance-sheet page was missed but other
  // fields extracted something) scores a nonzero-but-low confidence and
  // would otherwise sail through the UPSERT below, wiping out good totals.
  const existingGoodRow = db
    .query<{ total_assets: number | null }, [string, string]>(
      "SELECT total_assets FROM financial_reports WHERE action_code = ? AND sort_key = ?",
    )
    .get(report.actionCode, report.period.sortKey);

  // po_acceptance_reconciliation_20260721T1649 (arm b2): the guard above only
  // ever fired when a previously-good row ALREADY existed (arm b1 — good ->
  // corrupt). It never evaluates when NO row exists for this
  // (action_code, sort_key) at all, so a failed/partial extraction for a
  // ticker with no prior stored report sailed straight through the INSERT
  // below and MANUFACTURED a brand-new total_assets<=0 row where none
  // existed — the ONLY transition PO confirmed as actually observed across
  // the 16-ticker cohort (ABSENT -> manufactured zero-row, not good ->
  // corrupt). Fix: evaluate totalAssets<=0 UNCONDITIONALLY — a failed
  // extraction must never persist a corrupt row, whether that means
  // preserving existing good data (b1) or leaving the ticker ABSENT (b2).
  if (report.balanceSheet.totalAssets <= 0) {
    const hadExistingGoodRow =
      existingGoodRow != null &&
      existingGoodRow.total_assets != null &&
      existingGoodRow.total_assets > 0;

    // FIX-BCTC-ZEROEXTRACT-BLOCK-NO-FAILURE-RECORD-UNBOUNDED-REEXTRACT-LOOP:
    // the guard above is correct and stays exactly as-is — this ONLY adds a
    // durable record of the block so the enqueuer stops treating "no
    // financial_reports row" as "never attempted". See
    // infrastructure/db/bctcZeroExtractBlocklist.ts for the full writeup.
    const blockReason = hadExistingGoodRow
      ? `overwrite-blocked: new extraction total_assets=${report.balanceSheet.totalAssets} would replace previously-good stored report (total_assets=${existingGoodRow!.total_assets})`
      : `create-blocked: total_assets=${report.balanceSheet.totalAssets} (failed/zero extraction), no prior stored report exists`;
    const blockResult = recordZeroExtractBlock(db, report.actionCode, report.period.sortKey, blockReason);

    // AC-4: never claim "flagged for manual review" unless the failure
    // record was actually written — a DB write failure must be visible in
    // the message text, not silently swallowed into a false claim.
    const reviewClause = !blockResult.recorded
      ? `NOT flagged for manual review — the failure-record write itself failed (see server logs); this attempt is UNRECORDED.`
      : blockResult.deadLettered
        ? `flagged for manual review — DEAD-LETTERED after ${blockResult.attemptCount} blocked attempts (threshold=${BCTC_ZERO_EXTRACT_DEAD_AT_ATTEMPTS}); no further automatic re-extraction for this pair.`
        : `flagged for manual review (blocked attempt ${blockResult.attemptCount}/${BCTC_ZERO_EXTRACT_DEAD_AT_ATTEMPTS}).`;

    const blockMsg = hadExistingGoodRow
      ? `[BCTC] Reparse write BLOCKED for ${report.actionCode} ${report.period.sortKey}: ` +
        `new extraction total_assets=${report.balanceSheet.totalAssets} would overwrite a ` +
        `previously-good stored report (total_assets=${existingGoodRow!.total_assets}). ` +
        `Existing row preserved untouched — ${reviewClause}`
      : `[BCTC] Write BLOCKED for ${report.actionCode} ${report.period.sortKey}: ` +
        `extraction total_assets=${report.balanceSheet.totalAssets} (failed/zero extraction) and ` +
        `no prior stored report exists for this ticker — refusing to CREATE a new corrupt row. ` +
        `Report stays ABSENT ("Chưa có dữ liệu BCTC") — ${reviewClause}`;
    logger.warn(blockMsg, {
      attemptCount: blockResult.attemptCount,
      deadLettered: blockResult.deadLettered,
      recorded: blockResult.recorded,
    });
    if (telegramBugFn) {
      await telegramBugFn(blockMsg).catch(() => {});
    } else {
      const { sendTelegramBug } = await import("../../infrastructure/notifiers/telegram.js");
      await sendTelegramBug(blockMsg).catch(() => {});
    }
    return; // NO WRITE — either the existing good row is untouched, or no row is created at all.
  }

  // FIX-BCTC-DATA-GAP-FAMILY U4: income-broken-with-assets write-side guard.
  // Mirrors the serve-side predicate in bctcIdentityGuard.ts — when the
  // balance sheet survived (totalAssets > 0) but the ENTIRE income statement
  // extracted as zeros (netRevenue=0 AND operatingProfit=0 AND netProfit=0),
  // the extraction is corrupt (HPG 2026-Q1/2025-Q4 fingerprint: OP=0, NR≈0,
  // NP≈0, TA>0 — PUB-8's parent-only heuristic does NOT fire because NP is
  // also 0). Refuse the INSERT/overwrite so the corrupt row never becomes a
  // servable PARTIAL, and record the block durably (same bctc_zero_extract_blocks
  // dead-letter semantics as the totalAssets guard above).
  if (
    report.balanceSheet.totalAssets > 0 &&
    report.incomeStatement.netRevenue === 0 &&
    report.incomeStatement.operatingProfit === 0 &&
    report.incomeStatement.netProfit === 0
  ) {
    const blockReason =
      `income-broken-with-assets: total_assets=${report.balanceSheet.totalAssets} with ` +
      `net_revenue=0, operating_profit=0, net_profit=0 (income statement absent while ` +
      `balance sheet present — partial OCR)`;
    const blockResult = recordZeroExtractBlock(db, report.actionCode, report.period.sortKey, blockReason);
    const reviewClause = !blockResult.recorded
      ? `NOT flagged for manual review — the failure-record write itself failed (see server logs); this attempt is UNRECORDED.`
      : blockResult.deadLettered
        ? `flagged for manual review — DEAD-LETTERED after ${blockResult.attemptCount} blocked attempts (threshold=${BCTC_ZERO_EXTRACT_DEAD_AT_ATTEMPTS}); no further automatic re-extraction for this pair.`
        : `flagged for manual review (blocked attempt ${blockResult.attemptCount}/${BCTC_ZERO_EXTRACT_DEAD_AT_ATTEMPTS}).`;
    const blockMsg =
      `[BCTC] Write BLOCKED for ${report.actionCode} ${report.period.sortKey}: ` +
      `income statement extracted as all-zeros while balance sheet is present ` +
      `(total_assets=${report.balanceSheet.totalAssets}) — refusing to persist a corrupt ` +
      `income-broken row. ${reviewClause}`;
    logger.warn(blockMsg, {
      attemptCount: blockResult.attemptCount,
      deadLettered: blockResult.deadLettered,
      recorded: blockResult.recorded,
    });
    if (telegramBugFn) {
      await telegramBugFn(blockMsg).catch(() => {});
    } else {
      const { sendTelegramBug } = await import("../../infrastructure/notifiers/telegram.js");
      await sendTelegramBug(blockMsg).catch(() => {});
    }
    return; // NO WRITE — the corrupt income-broken row is never persisted.
  }

  const stmt = db.prepare(`
    INSERT INTO financial_reports (
      id, action_code, company_name, exchange, domain,
      period_year, period_quarter, period_type, period_start, period_end, sort_key,
      ssc_url, pdf_path, published_at, parsed_at, audit_status, auditor,
      extraction_confidence,
      net_revenue, gross_profit, operating_profit, ebitda,
      profit_before_tax, net_profit, eps, diluted_eps,
      total_assets, current_assets, cash, inventory,
      total_liabilities, short_term_debt, long_term_debt, equity_total,
      operating_cf, investing_cf, financing_cf, capex, free_cash_flow,
      gross_margin_pct, operating_margin_pct, net_margin_pct,
      roe, roa, current_ratio, debt_to_equity, net_debt_to_ebitda, pe, pb,
      balance_sheet_json, income_stmt_json, cash_flow_json, ratios_json,
      yoy_delta_json, qoq_delta_json,
      market_data_json, embedding_text, notes_raw_text,
      validation_status, validation_notes, extraction_method,
      ocr_confidence, confidence_financial
    ) VALUES (
      $id, $actionCode, $companyName, $exchange, $domain,
      $periodYear, $periodQuarter, $periodType, $periodStart, $periodEnd, $sortKey,
      $sscUrl, $pdfPath, $publishedAt, $parsedAt, $auditStatus, $auditor,
      $extractionConfidence,
      $netRevenue, $grossProfit, $operatingProfit, $ebitda,
      $profitBeforeTax, $netProfit, $eps, $dilutedEps,
      $totalAssets, $currentAssets, $cash, $inventory,
      $totalLiabilities, $shortTermDebt, $longTermDebt, $equityTotal,
      $operatingCf, $investingCf, $financingCf, $capex, $freeCashFlow,
      $grossMarginPct, $operatingMarginPct, $netMarginPct,
      $roe, $roa, $currentRatio, $debtToEquity, $netDebtToEbitda, $pe, $pb,
      $balanceSheetJson, $incomeStmtJson, $cashFlowJson, $ratiosJson,
      $yoyDeltaJson, $qoqDeltaJson,
      $marketDataJson, $embeddingText, $notesRawText,
      $validationStatus, $validationNotes, $extractionMethod,
      $ocrConfidence, $confidenceFinancial
    )
    ON CONFLICT(action_code, sort_key) DO UPDATE SET
      company_name = excluded.company_name,
      exchange = excluded.exchange,
      domain = excluded.domain,
      period_year = excluded.period_year,
      period_quarter = excluded.period_quarter,
      period_type = excluded.period_type,
      period_start = excluded.period_start,
      period_end = excluded.period_end,
      ssc_url = excluded.ssc_url,
      pdf_path = excluded.pdf_path,
      -- published_at is deliberately NOT in this SET clause — SQLite keeps
      -- the existing row's filing date untouched on every re-parse
      -- (FIX-BCTC-REPARSE-BATCH-CORRUPTION-NGAYNOP-FLIP). It is only ever
      -- set once, on the row's original INSERT (the $publishedAt bind
      -- value below is discarded by SQLite on a real conflict, same as $id).
      parsed_at = excluded.parsed_at,
      audit_status = excluded.audit_status,
      auditor = excluded.auditor,
      extraction_confidence = excluded.extraction_confidence,
      net_revenue = excluded.net_revenue,
      gross_profit = excluded.gross_profit,
      operating_profit = excluded.operating_profit,
      ebitda = excluded.ebitda,
      profit_before_tax = excluded.profit_before_tax,
      net_profit = excluded.net_profit,
      eps = excluded.eps,
      diluted_eps = excluded.diluted_eps,
      total_assets = excluded.total_assets,
      current_assets = excluded.current_assets,
      cash = excluded.cash,
      inventory = excluded.inventory,
      total_liabilities = excluded.total_liabilities,
      short_term_debt = excluded.short_term_debt,
      long_term_debt = excluded.long_term_debt,
      equity_total = excluded.equity_total,
      operating_cf = excluded.operating_cf,
      investing_cf = excluded.investing_cf,
      financing_cf = excluded.financing_cf,
      capex = excluded.capex,
      free_cash_flow = excluded.free_cash_flow,
      gross_margin_pct = excluded.gross_margin_pct,
      operating_margin_pct = excluded.operating_margin_pct,
      net_margin_pct = excluded.net_margin_pct,
      roe = excluded.roe,
      roa = excluded.roa,
      current_ratio = excluded.current_ratio,
      debt_to_equity = excluded.debt_to_equity,
      net_debt_to_ebitda = excluded.net_debt_to_ebitda,
      pe = excluded.pe,
      pb = excluded.pb,
      balance_sheet_json = excluded.balance_sheet_json,
      income_stmt_json = excluded.income_stmt_json,
      cash_flow_json = excluded.cash_flow_json,
      ratios_json = excluded.ratios_json,
      yoy_delta_json = excluded.yoy_delta_json,
      qoq_delta_json = excluded.qoq_delta_json,
      market_data_json = excluded.market_data_json,
      embedding_text = excluded.embedding_text,
      notes_raw_text = excluded.notes_raw_text,
      validation_status = excluded.validation_status,
      validation_notes = excluded.validation_notes,
      extraction_method = excluded.extraction_method,
      ocr_confidence = excluded.ocr_confidence,
      confidence_financial = excluded.confidence_financial
    -- id is deliberately NOT in this SET clause — SQLite keeps the existing
    -- row's id untouched on conflict (FIX-BCTC-D1-STABILIZE-REPORT-ID).
  `);

  stmt.run({
    $id: report.id,
    $actionCode: report.actionCode,
    $companyName: report.companyName,
    $exchange: report.exchange,
    $domain: report.domain,

    $periodYear: report.period.year,
    $periodQuarter: report.period.quarter,
    $periodType: report.period.periodType,
    $periodStart: report.period.startDate,
    $periodEnd: report.period.endDate,
    $sortKey: report.period.sortKey,

    $sscUrl: report.source.sscUrl,
    $pdfPath: report.source.pdfPath,
    $publishedAt: report.source.publishedAt,
    $parsedAt: report.source.parsedAt,
    $auditStatus: report.source.auditStatus,
    $auditor: report.source.auditor,
    $extractionConfidence: report.source.extractionConfidence,

    $netRevenue: report.incomeStatement.netRevenue,
    $grossProfit: report.incomeStatement.grossProfit,
    $operatingProfit: report.incomeStatement.operatingProfit,
    $ebitda: report.incomeStatement.ebitda,
    $profitBeforeTax: report.incomeStatement.profitBeforeTax,
    $netProfit: report.incomeStatement.netProfit,
    $eps: report.incomeStatement.eps,
    $dilutedEps: report.incomeStatement.dilutedEps,

    $totalAssets: report.balanceSheet.totalAssets,
    $currentAssets: report.balanceSheet.currentAssets.total,
    $cash: report.balanceSheet.currentAssets.cash,
    $inventory: report.balanceSheet.currentAssets.inventory,
    $totalLiabilities: report.balanceSheet.totalLiabilities,
    $shortTermDebt: report.balanceSheet.currentLiabilities.shortTermDebt,
    $longTermDebt: report.balanceSheet.longTermLiabilities.longTermDebt,
    $equityTotal: report.balanceSheet.equity.total,

    $operatingCf: report.cashFlow.operatingCF,
    $investingCf: report.cashFlow.investingCF,
    $financingCf: report.cashFlow.financingCF,
    $capex: report.cashFlow.capex,
    $freeCashFlow: report.cashFlow.freeCashFlow,

    $grossMarginPct: report.ratios.grossMarginPct ?? null,
    $operatingMarginPct: report.ratios.operatingMarginPct ?? null,
    $netMarginPct: report.ratios.netMarginPct ?? null,
    $roe: report.ratios.roe ?? null,
    $roa: report.ratios.roa ?? null,
    $currentRatio: report.ratios.currentRatio ?? null,
    $debtToEquity: report.ratios.debtToEquity ?? null,
    $netDebtToEbitda: report.ratios.netDebtToEbitda ?? null,
    $pe: report.ratios.pe ?? null,
    $pb: report.ratios.pb ?? null,

    $balanceSheetJson: JSON.stringify(report.balanceSheet),
    $incomeStmtJson: JSON.stringify(report.incomeStatement),
    $cashFlowJson: JSON.stringify(report.cashFlow),
    $ratiosJson: JSON.stringify(report.ratios),

    $yoyDeltaJson: report.yoyDelta ? JSON.stringify(report.yoyDelta) : null,
    $qoqDeltaJson: report.qoqDelta ? JSON.stringify(report.qoqDelta) : null,

    $marketDataJson: report.marketData ? JSON.stringify(report.marketData) : null,
    $embeddingText: report.embeddingText,
    $notesRawText: report.notesRawText,
    $validationStatus: validationStatus,
    $validationNotes: validationNotes,
    $extractionMethod: 'ocr_pdf',
    $ocrConfidence: extractionConfidence,
    $confidenceFinancial: confidenceFinancial ?? null,
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// Main use case
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Parse a BCTC text document and produce a complete, stored FinancialReport.
 *
 * Steps:
 *   1. Extract three financial statements from raw text (domain services)
 *   2. Compute EBITDA = operatingProfit + depreciationAmortization
 *   3. Compute all financial ratios (domain service)
 *   4. Optionally compute QoQ/YoY period deltas
 *   5. Score extraction confidence (fraction of key non-zero fields)
 *   6. Assemble FinancialReport and persist to SQLite
 *
 * @param params.rawText        - Raw text from BCTC PDF (all three statements)
 * @param params.actionCode     - Stock ticker e.g. "VCB"
 * @param params.period         - FiscalPeriod this report covers
 * @param params.shares         - Shares outstanding (optional, for per-share ratios)
 * @param params.price          - Market price in VND (optional, for valuation ratios)
 * @param params.previousReport - Prior period report (optional, enables QoQ/YoY delta)
 * @returns Fully populated FinancialReport (also stored in SQLite)
 */
export async function parseBctcReport(
  params: ParseBctcReportParams,
): Promise<FinancialReport> {
  const { rawText, actionCode, period, shares, price, previousReport, publishedAt: callerPublishedAt, _telegramBugFn } = params;

  // ── Step 0: FIX-BCTC-INGEST-PERIOD-IDENTITY-UNVALIDATED-VS-CONTENT ────────
  // period_year/period_quarter (and the (action_code, sort_key) conflict-target
  // identity) are caller-supplied and were NEVER checked against the document
  // itself — a wrong caller-supplied period silently occupies the slot the
  // correct filing for that period needs, with no defense anywhere. Class
  // parallel: memory lesson
  // feedback_pressure_state_caller_supplied_fields_dead_server_computed_live
  // (UC-CDC-P1) — compute the correct value server-side at the boundary, gate
  // the caller override. `checkPeriodContentConsistency` derives the period
  // the PDF text itself claims to cover (repeated quarter-boundary date
  // statements) and only flags `consistent: false` on a CONFIDENT disagreement
  // — an inconclusive signal (poor OCR / no boundary dates present) or a
  // matching signal is indistinguishable from today's behavior (AC-3 negative
  // control: never blocks a poor-OCR filing). On a confident mismatch the
  // report is REJECTED before any extraction/storage — written under NEITHER
  // period key (AC-2/AC-5) — with a loud, debounced Telegram bug naming both
  // periods (AC-2).
  await initDatabase();
  const periodCheck = checkPeriodContentConsistency(rawText, period.year, period.quarter);
  if (!periodCheck.consistent && periodCheck.contentSignal) {
    const mismatchErr = new BctcPeriodContentMismatchError(actionCode, period.sortKey, periodCheck.contentSignal);
    logger.error(mismatchErr.message);

    // FIX-BCTC-DATA-GAP-FAMILY U3.1: durable quarantine record. The mismatch
    // was previously ONLY a debounced Telegram line — no durable record
    // anywhere, so the serve path returned flat "Chưa có dữ liệu BCTC" and
    // enqueuers kept re-attempting the same doomed pair (BID 2025-Q4:
    // runPipeline-null loop, live 2026-08-27/28). Reuse the
    // bctc_zero_extract_blocks table (same dead-letter semantics as the
    // totalAssets write-block family) with a 'period-mismatch:' reason carrying
    // the content-derived period so an analyst can see WHY the slot is empty.
    const contentSignal = periodCheck.contentSignal;
    recordZeroExtractBlock(
      getDb(),
      actionCode,
      period.sortKey,
      `period-mismatch: content=${contentSignal.year}-Q${contentSignal.quarter} ` +
        `(supplied ${period.sortKey}, ${contentSignal.matchCount} content matches vs ` +
        `${contentSignal.runnerUpCount} runner-up)`,
    );

    const debounceKey = `${period.sortKey}:period-mismatch`;
    const debounceDb = getDb();
    if (!isBctcSignalDebounced(debounceDb, actionCode, debounceKey, BCTC_SIGNAL_DEBOUNCE_HOURS)) {
      recordBctcSignalSent(debounceDb, actionCode, debounceKey);
      if (_telegramBugFn) {
        await _telegramBugFn(mismatchErr.message).catch(() => {});
      } else {
        const { sendTelegramBug } = await import("../../infrastructure/notifiers/telegram.js");
        await sendTelegramBug(mismatchErr.message).catch(() => {});
      }
    }

    throw mismatchErr;
  }

  // ── Step 1: Extract the three financial statements ────────────────────────
  const balanceSheet = extractBalanceSheet(rawText);
  const incomeStatement = extractIncomeStatement(rawText);
  const cashFlow = extractCashFlow(rawText);

  // ── Step 2: Compute EBITDA (requires depreciation from cash flow) ─────────
  // EBITDA = EBIT + D&A ≈ operatingProfit + depreciationAmortization
  incomeStatement.ebitda =
    incomeStatement.operatingProfit + cashFlow.depreciationAmortization;

  // ── Step 3: Compute financial ratios ─────────────────────────────────────
  const prevBs = previousReport?.balanceSheet;
  const ratioParams: import("../../domain/services/financial-reports/ratioComputer.js").ComputeRatiosParams = {
    bs: balanceSheet,
    is: incomeStatement,
    cf: cashFlow,
    ...(shares !== undefined ? { shares } : {}),
    ...(price !== undefined ? { price } : {}),
    ...(prevBs !== undefined ? { prevBs } : {}),
  };
  const ratios = computeFinancialRatios(ratioParams);

  // ── Step 4: Compute period deltas (optional) ──────────────────────────────
  let qoqDelta: PeriodDelta | null = null;
  let yoyDelta: PeriodDelta | null = null;

  if (previousReport) {
    const currentMetrics = toMetrics({
      id: "",
      actionCode,
      companyName: "",
      exchange: "HOSE",
      domain: "other",
      period,
      source: {
        sscUrl: "",
        pdfPath: null,
        publishedAt: "",
        parsedAt: new Date().toISOString(),
        auditStatus: "unaudited",
        auditor: null,
        reportLanguage: "vi",
        pageCount: null,
        extractionConfidence: 0,
      },
      balanceSheet,
      incomeStatement,
      cashFlow,
      ratios,
      yoyDelta: null,
      qoqDelta: null,
      marketData: null,
      aiAnalysis: null,
      embedding: null,
      embeddingText: "",
      notesRawText: null,
    });
    const previousMetrics = toMetrics(previousReport);

    // Determine delta type based on period distance
    const deltaType: "QoQ" | "YoY" =
      period.year !== previousReport.period.year ? "YoY" : "QoQ";

    const delta = computePeriodDelta(currentMetrics, previousMetrics, deltaType);
    delta.comparedTo = previousReport.period.sortKey;

    if (deltaType === "QoQ") {
      qoqDelta = delta;
    } else {
      yoyDelta = delta;
    }
  }

  // ── Step 5: Compute extraction confidence ────────────────────────────────
  const extractionConfidence = computeConfidence(balanceSheet, incomeStatement, cashFlow);

  // ── Step 5b: Financial figures validation (Task 1345b / 1424a) ──────────
  // Pure domain function — checks accounting identity and business-norm rules.
  // operatingMargin = operatingProfit / netRevenue (ratio, not %)
  //
  // Banking proxy (Task 1424a): Vietnamese credit institutions report zero
  // operatingProfit in OCR extraction because the line label differs structurally.
  // When the ticker is a known bank AND operatingProfit===0 AND netProfit!==0,
  // use netProfit as a proxy for the margin validation check ONLY.
  // The stored operating_profit column value is NOT modified.
  const isBank = BANKING_TICKERS.has(actionCode);
  const effectiveOperatingProfit =
    isBank && incomeStatement.operatingProfit === 0 && incomeStatement.netProfit !== 0
      ? incomeStatement.netProfit
      : incomeStatement.operatingProfit;

  const operatingMarginRatio =
    incomeStatement.netRevenue !== 0
      ? effectiveOperatingProfit / incomeStatement.netRevenue
      : null;

  // Task 1810c: cross-statement unit scale guard.
  // When totalAssets and netRevenue differ by >1000x the two extractors disagree
  // on scale (e.g. BS in triệu, IS in raw VND). validateFinancialFigures would
  // then compute an impossible operatingMargin and hard-fail to 0.0, silencing
  // the signal. Return 0.1 (low_confidence) instead so the record is stored.
  //
  // FIX-BCTC-MAGNITUDE-NORMALIZE — within-BS unit mismatch guard (HPG case).
  // When totalAssets and totalLiabilities differ by >100x within the same balance
  // sheet, the two fields are in different units (one raw VND, one triệu). This
  // produces impossible VAL-07 ratios. Flag low_confidence so the record is
  // stored but not trusted for conviction signals.
  const bsIntraStmtMismatch = detectBsIntraStmtUnitMismatch(
    balanceSheet.totalAssets || null,
    balanceSheet.totalLiabilities || null,
  );
  // FIX-BCTC-1345B-ALERT-NAMES-A-RULE-FAMILY-THAT-CANNOT-PRODUCE-ITS-OWN-VALUE:
  // named separately from bsIntraStmtMismatch (was previously inlined directly
  // into the ternary below) so describeConfidenceFinancialReason() can report
  // WHICH of the two unit-mismatch detectors actually fired.
  const crossStmtMismatch = detectUnitMismatch(
    balanceSheet.totalAssets || null,
    incomeStatement.netRevenue || null,
  );
  const financialFiguresInput: FinancialFiguresInput = {
    totalAssets: balanceSheet.totalAssets || null,
    totalEquity: balanceSheet.equity.total || null,
    totalLiabilities: balanceSheet.totalLiabilities || null,
    operatingMargin: operatingMarginRatio,
    netRevenue: incomeStatement.netRevenue || null,
  };
  const confidenceFinancial = (crossStmtMismatch || bsIntraStmtMismatch)
    ? 0.1
    : validateFinancialFigures(financialFiguresInput);
  // AC-1/AC-2: truthful, figure-bearing description of the detector that
  // actually produced confidenceFinancial — replaces the old unconditional
  // hard-coded VNM/VEA hint in the [BCTC-1345b] alert text (storeReport).
  const confidenceFinancialDetail = describeConfidenceFinancialReason({
    crossStmtMismatch,
    bsIntraStmtMismatch,
    figures: financialFiguresInput,
  });

  // ── Step 5d: Validate the extracted data (Task 132) ──────────────────────
  // C-5 (BANK-DEV-1): pass isBankForm so bctcValidator skips gross_profit comparisons
  // and asset decomposition check for bank reports (Mẫu B02-TCTD). isBank is already
  // computed above from BANKING_TICKERS for the operatingProfit proxy logic.
  const validation = validateFinancialReport({
    balanceSheet: {
      totalAssets: balanceSheet.totalAssets,
      totalLiabilities: balanceSheet.totalLiabilities,
      equityTotal: balanceSheet.equity.total,
      currentAssets: balanceSheet.currentAssets.total,
      nonCurrentAssets: balanceSheet.nonCurrentAssets.total,
    },
    incomeStatement: {
      netRevenue: incomeStatement.netRevenue,
      grossProfit: incomeStatement.grossProfit,
      netProfit: incomeStatement.netProfit,
    },
    cashFlow: {
      operatingCF: cashFlow.operatingCF,
    },
    extractionConfidence,
    isBankForm: isBank,
  });

  // Determine validation status and notes for persistence
  let validationStatus: string;
  let validationNotes: string | null = null;

  if (!validation.isValid) {
    validationStatus = "failed";
    const notes: string[] = [];
    if (validation.errors.length > 0) notes.push(`Errors: ${validation.errors.join(" | ")}`);
    if (validation.warnings.length > 0) notes.push(`Warnings: ${validation.warnings.join(" | ")}`);
    validationNotes = notes.join("\n");
    logger.error(
      `[parseBctcReport] Validation FAILED for ${actionCode} ${period.sortKey}: ${validation.errors.join("; ")}`,
    );
  } else if (validation.warnings.length > 0) {
    validationStatus = "passed_with_warnings";
    validationNotes = `Warnings: ${validation.warnings.join(" | ")}`;
  } else {
    validationStatus = "passed";
  }

  // ── Step 6: Assemble the FinancialReport ──────────────────────────────────
  const parsedAt = new Date().toISOString();

  // FIX-BCTC-REPARSE-BATCH-CORRUPTION-NGAYNOP-FLIP: prefer the caller-supplied
  // real filing date (e.g. SSC doc.publishedAt). parsedAt is used ONLY as a
  // last-resort placeholder when no real filing date is known — and even
  // then, storeReport()'s ON CONFLICT clause never lets this value clobber
  // an existing row's published_at on a re-parse (see storeReport doc).
  const publishedAt = callerPublishedAt ?? parsedAt;

  // FIX-BCTC-D1-STABILIZE-REPORT-ID: reuse the existing row's id when one
  // already exists for this (action_code, sort_key). storeReport()'s
  // ON CONFLICT DO UPDATE never touches the id column on a real conflict, so
  // this pre-check is not needed for DB correctness — but WITHOUT it, the
  // in-memory FinancialReport returned to the caller would carry a freshly
  // minted (and never-persisted) id on every re-parse, silently diverging
  // from the id actually stored in SQLite. DB init is moved up from Step 7
  // so the pre-check SELECT has a table to query on the very first call.
  await initDatabase();
  const existingReportRow = getDb()
    .query<{ id: string }, [string, string]>(
      "SELECT id FROM financial_reports WHERE action_code = ? AND sort_key = ?",
    )
    .get(actionCode, period.sortKey);
  const reportId = existingReportRow?.id ?? randomUUID();

  const report: FinancialReport = {
    id: reportId,
    actionCode,
    companyName: "",          // Not extracted from text in this task; set by caller or task 048
    exchange: "HOSE",         // Default; overridable by caller
    domain: "other",          // Default; overridable by caller

    period,

    source: {
      sscUrl: "",
      pdfPath: null,
      publishedAt,
      parsedAt,
      auditStatus: "unaudited",
      auditor: null,
      reportLanguage: "vi",
      pageCount: null,
      extractionConfidence,
    },

    balanceSheet,
    incomeStatement,
    cashFlow,
    ratios,

    yoyDelta,
    qoqDelta,

    marketData: null,
    aiAnalysis: null,
    embedding: null,
    embeddingText: "",
    notesRawText: null,
  };

  // ── Step 7: Persist to SQLite ─────────────────────────────────────────────
  // DB already initialised above (Step 6 pre-check) — idempotent, safe to
  // reuse the same singleton connection here.
  const db = getDb();

  try {
    await storeReport(report, validationStatus, validationNotes, extractionConfidence, confidenceFinancial, _telegramBugFn, confidenceFinancialDetail);
  } catch (err) {
    throw new Error(
      `storeReport failed: ${err instanceof Error ? err.message : String(err)}`,
    );
  }

  // WAL checkpoint — makes the new row visible to external readers immediately.
  // Skipped for :memory: DBs (WAL mode is a no-op there).
  const dbPath = Bun.env["DB_PATH"] ?? "";
  if (dbPath !== ":memory:") {
    try {
      db.exec("PRAGMA wal_checkpoint(PASSIVE)");
    } catch (checkpointErr) {
      // Non-fatal: log and continue — data is already persisted in WAL
      logger.debug("[parseBctcReport] WAL checkpoint busy or failed (non-fatal)", {
        error: checkpointErr instanceof Error ? checkpointErr.message : String(checkpointErr),
      });
    }
  }

  return report;
}
