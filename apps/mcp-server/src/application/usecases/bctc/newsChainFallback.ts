/**
 * FACTORY-APP-split-fetchParseAndStoreBctc — extracted from fetchParseAndStoreBctc.ts.
 *
 * Carries:
 *   - QUARTER_MAP / buildFiscalPeriod — period builder shared by the orchestrator's
 *     Step 3 (real parse path) and the fallback report builder below.
 *   - buildAnalysisSummary — RAG summary text used by the orchestrator's Step 4.
 *   - tryNewsChainFallback (Task 1294b) — reconstructs a low-confidence
 *     FinancialReport from recent agent_signals chain hints when PDF extraction
 *     times out, instead of aborting the pipeline.
 *
 * Arithmetic/behavior is unchanged from the pre-split file — this is a pure
 * relocation plus naming the four confidence-tuning literals below.
 */

import { randomUUID } from "node:crypto";

import { logger } from "../../../infrastructure/logger.js";
import { extractBctcHints } from "../../../domain/services/signalToBctcMapper.js";
import { getDb } from "../../../infrastructure/db/schema.js";

import type { FinancialReport, FiscalPeriod } from "../../../../bctc-schema.js";
import type { QuarterString } from "./types.js";

// ─────────────────────────────────────────────────────────────────────────────
// Period builder helper
// ─────────────────────────────────────────────────────────────────────────────

const QUARTER_MAP: Record<QuarterString, {
  quarter: 1 | 2 | 3 | 4;
  startDate: string;
  endDate: string;
}> = {
  Q1: { quarter: 1, startDate: "-01-01", endDate: "-03-31" },
  Q2: { quarter: 2, startDate: "-04-01", endDate: "-06-30" },
  Q3: { quarter: 3, startDate: "-07-01", endDate: "-09-30" },
  Q4: { quarter: 4, startDate: "-10-01", endDate: "-12-31" },
};

/**
 * Build a FiscalPeriod from year + quarter string.
 *
 * @param year    - Four-digit year.
 * @param quarter - Quarter string: "Q1" | "Q2" | "Q3" | "Q4".
 * @returns FiscalPeriod with correct dates and sortKey.
 */
export function buildFiscalPeriod(year: number, quarter: QuarterString): FiscalPeriod {
  const q = QUARTER_MAP[quarter];
  return {
    year,
    quarter: q.quarter,
    periodType: quarter,
    startDate: `${year}${q.startDate}`,
    endDate: `${year}${q.endDate}`,
    sortKey: `${year}-${quarter}`,
  };
}

/**
 * Build a concise human-readable summary of a FinancialReport for RAG storage.
 * All monetary values are in million VND.
 *
 * @param report - Fully parsed FinancialReport.
 * @returns Multi-line summary string.
 */
export function buildAnalysisSummary(report: FinancialReport): string {
  const { actionCode, period, incomeStatement, balanceSheet, ratios } = report;

  const lines: string[] = [
    `Báo cáo tài chính ${actionCode} ${period.sortKey}.`,
    `Doanh thu thuần: ${incomeStatement.netRevenue.toLocaleString("vi-VN")} triệu đồng.`,
    `Lợi nhuận sau thuế: ${incomeStatement.netProfit.toLocaleString("vi-VN")} triệu đồng.`,
    `Tổng tài sản: ${balanceSheet.totalAssets.toLocaleString("vi-VN")} triệu đồng.`,
    `Vốn chủ sở hữu: ${balanceSheet.equity.total.toLocaleString("vi-VN")} triệu đồng.`,
  ];

  if (ratios.grossMarginPct != null) {
    lines.push(`Biên lợi nhuận gộp: ${ratios.grossMarginPct.toFixed(1)}%.`);
  }
  if (ratios.netMarginPct != null) {
    lines.push(`Biên lợi nhuận ròng: ${ratios.netMarginPct.toFixed(1)}%.`);
  }

  return lines.join(" ");
}

// ─────────────────────────────────────────────────────────────────────────────
// News-fallback confidence tuning constants
// ─────────────────────────────────────────────────────────────────────────────
// FACTORY-APP-split-fetchParseAndStoreBctc: named per the backlog approach —
// resolved values are UNCHANGED from the prior inline literals (0.55/0.8/0.45/0.65).
// Linked to the OCR-confidence ladder in resolvePdfText.ts (cache confidence
// >= 0.5 = usable, 0.3-0.49 = usable-with-warning, < 0.3 = reject): this
// news-chain fallback path only ever runs when PDF/OCR text extraction failed
// entirely (PDF timeout, see resolvePdfText.ts), so its own confidence band is
// deliberately calibrated at/below the OCR floor rather than reusing it.

/** Starting point before the temporal-discount/avg-signal-confidence multipliers apply. */
export const NEWS_FALLBACK_BASELINE = 0.55;
/** Multiplier applied when signals reference the prior fiscal year (stale-data penalty). */
export const TEMPORAL_DISCOUNT = 0.8;
/** Lower clamp for the final confidence score (no-temporal-discount case only). */
export const FALLBACK_CONF_MIN = 0.45;
/** Upper clamp for the final confidence score (no-temporal-discount case only). */
export const FALLBACK_CONF_MAX = 0.65;

/**
 * Task 1294b: Fallback to news chain signals when PDF timeout occurs.
 * Query recent signals for the stock code, extract financial field hints,
 * validate for contradictions, and insert a fallback report with
 * extraction_method='news_inference'.
 *
 * @returns Object with fallback result: either FinancialReport or rejection reason.
 */
export async function tryNewsChainFallback(
  actionCode: string,
  year: number,
  quarter: QuarterString,
): Promise<{
  fallback: boolean;
  reason?: string;
  hints?: ReturnType<typeof extractBctcHints>[];
  report?: FinancialReport & { fallback: boolean; extraction_method: string; confidence: number };
}> {
  const tag = `[fetchParseAndStoreBctc] ${actionCode} ${year}-${quarter} fallback`;
  const db = getDb();
  const period = buildFiscalPeriod(year, quarter);

  try {
    // Query recent signals for this stock
    const maxAgeStr = Bun.env['BCTC_FALLBACK_SIGNAL_MAX_AGE_DAYS'] ?? '7';
    const maxAgeDays = parseInt(maxAgeStr, 10);
    const cutoffDate = new Date(Date.now() - maxAgeDays * 24 * 60 * 60 * 1000).toISOString();

    logger.info(`${tag} querying signals from last ${maxAgeDays} days`);

    // Query signals for this stock within the lookback window.
    // Accept all signal types that have financial information.
    const signals = db.prepare(`
      SELECT finding_data, created_at
      FROM agent_signals
      WHERE stock_code = ? AND created_at >= ?
      ORDER BY created_at DESC
      LIMIT 20
    `).all(actionCode, cutoffDate) as Array<{ finding_data: string; created_at: string }>;

    logger.info(`${tag} found ${signals.length} relevant signals`);

    // Check minimum signal count — if 0 signals within window, check if any exist at all
    if (signals.length < 2) {
      // Only check for stale signals if we have NO recent signals at all
      if (signals.length === 0) {
        const staleCheck = db.prepare(`
          SELECT COUNT(*) as cnt FROM agent_signals WHERE stock_code = ?
        `).get(actionCode) as { cnt: number };

        if (staleCheck.cnt > 0) {
          logger.info(`${tag} signals exist but are stale (older than ${maxAgeDays}d) — skipping fallback`);
          return {
            fallback: false,
            reason: `signals exist but are stale (older than ${maxAgeDays}d)`,
          };
        }
      }

      logger.info(`${tag} insufficient signals (${signals.length} < 2) — skipping fallback`);
      return {
        fallback: false,
        reason: `insufficient signals (${signals.length} < 2)`,
      };
    }

    // Parse signals and extract hints
    const hints = signals.map(s => {
      try {
        const data = JSON.parse(s.finding_data);
        return extractBctcHints({ findingData: data });
      } catch {
        logger.debug(`${tag} failed to parse signal data`);
        return null;
      }
    }).filter(h => h !== null) as ReturnType<typeof extractBctcHints>[];

    if (hints.length < 2) {
      logger.info(`${tag} insufficient valid signals (${hints.length} < 2) — skipping fallback`);
      return {
        fallback: false,
        reason: `insufficient valid signals (${hints.length} < 2)`,
        hints,
      };
    }

    // Check for contradictions: all signals should point same direction
    const directions = hints
      .filter(h => h.revenue_growth_hint !== 0)
      .map(h => Math.sign(h.revenue_growth_hint));

    if (directions.length > 0) {
      const allSameDir = directions.every(d => d === directions[0]);
      if (!allSameDir) {
        logger.info(`${tag} contradictory signal directions — skipping fallback`);
        return {
          fallback: false,
          reason: 'contradictory signal directions',
          hints,
        };
      }
    }

    // Average confidence and field hints
    const avgConfidence = hints.reduce((a, h) => a + h.confidence, 0) / hints.length;
    const avgRevenue = hints.reduce((a, h) => a + h.revenue_growth_hint, 0) / hints.length;
    const avgMargin = hints.reduce((a, h) => a + h.margin_trend, 0) / hints.length;

    // Check for temporal discount: if signals mention old period year
    // NOTE (flagged, out of scope for FACTORY-APP-split-fetchParseAndStoreBctc):
    // this is a pre-existing hardcoded per-date special-case — it only ever fires
    // for the literal 2023-signals-into-2024-report combination and silently stops
    // applying once the calendar moves past this window. Left untouched per the
    // task's explicit instruction; tracked as JANITOR-035 in
    // docs/data/code-janitor-known-findings.json for a future generalization decision.
    let temporalDiscount = 1.0;
    const signalText = signals.map(s => s.finding_data).join(' ');
    if (signalText.includes('2023') && year === 2024) {
      temporalDiscount = TEMPORAL_DISCOUNT;
      logger.debug(`${tag} temporal discount applied (0.8x) for 2023 data`);
    }

    // Calculate final confidence: baseline 0.55, apply multipliers
    // When temporal discount applies (0.8x), skip cap to preserve temporal penalty semantics
    // Otherwise, cap in [0.45, 0.65] to maintain reasonable bounds
    let finalConfidence = NEWS_FALLBACK_BASELINE * temporalDiscount * avgConfidence;
    if (temporalDiscount === 1.0) {
      finalConfidence = Math.max(FALLBACK_CONF_MIN, Math.min(FALLBACK_CONF_MAX, finalConfidence));
    }

    logger.info(`${tag} fallback valid — confidence=${finalConfidence.toFixed(2)}`);

    // Build minimal fallback report
    const fallbackReport: FinancialReport & {
      fallback: boolean;
      extraction_method: string;
      confidence: number;
    } = {
      id: randomUUID(),
      actionCode,
      companyName: 'Unknown (news_inference)',
      exchange: 'UNKNOWN' as any,
      domain: 'other',
      period,
      source: {
        sscUrl: '',
        pdfPath: null,
        publishedAt: new Date().toISOString(),
        parsedAt: new Date().toISOString(),
        auditStatus: 'unaudited',
        auditor: null,
        reportLanguage: 'both',
        pageCount: null,
        extractionConfidence: finalConfidence,
      },
      balanceSheet: {
        currentAssets: { cash: 0, shortTermInvestments: 0, accountsReceivable: 0, inventory: 0, otherCurrentAssets: 0, total: 0 },
        nonCurrentAssets: { longTermReceivables: 0, fixedAssets: 0, investmentProperty: 0, longTermInvestments: 0, goodwill: 0, otherLongTermAssets: 0, total: 0 },
        totalAssets: 0,
        currentLiabilities: { shortTermDebt: 0, accountsPayable: 0, advancesFromCustomers: 0, taxPayable: 0, payablesToEmployees: 0, otherCurrentLiabilities: 0, total: 0 },
        longTermLiabilities: { longTermDebt: 0, deferredTaxLiabilities: 0, otherLongTermLiabilities: 0, total: 0 },
        totalLiabilities: 0,
        equity: { shareCapital: 0, sharePremium: 0, treasuryShares: 0, retainedEarnings: 0, otherEquityFunds: 0, minorityInterest: 0, total: 0 },
        totalLiabilitiesAndEquity: 0,
      },
      incomeStatement: {
        netRevenue: 0,
        cogs: 0,
        grossProfit: 0,
        operatingExpenses: 0,
        operatingProfit: 0,
        otherIncome: 0,
        financingCosts: 0,
        ebit: 0,
        interestExpenses: 0,
        profitBeforeTax: 0,
        incomeTax: 0,
        netProfit: 0,
        minorityInterest: 0,
        parentNetProfit: 0,
        eps: 0,
        dilutedEps: 0,
        ebitda: 0,
        ebitdaMargin: 0,
      },
      cashFlow: {
        operatingCashFlow: 0,
        capitalExpenditures: 0,
        freeCashFlow: 0,
        investingCashFlow: 0,
        financingCashFlow: 0,
        netChangeInCash: 0,
      },
      ratios: {
        grossMarginPct: null,
        operatingMarginPct: null,
        netMarginPct: null,
        ebitdaMarginPct: null,
        roe: null,
        roa: null,
        roic: null,
        currentRatio: null,
        quickRatio: null,
        cashRatio: null,
        debtToEquity: null,
        debtToAssets: null,
        netDebt: null,
        netDebtToEbitda: null,
        interestCoverageRatio: null,
        assetTurnover: null,
        inventoryTurnover: null,
        inventoryDays: null,
        receivablesTurnover: null,
        receivablesDays: null,
        payablesTurnover: null,
        payablesDays: null,
        cashConversionCycle: null,
        eps: 0,
        bvps: null,
        revenuePerShare: null,
        fcfPerShare: null,
        pe: null,
        pb: null,
        ps: null,
        evToEbitda: null,
        dividendYieldPct: null,
      },
      yoyDelta: null,
      qoqDelta: null,
      marketData: null,
      aiAnalysis: null,
      embedding: null,
      embeddingText: `Fallback report from ${hints.length} chain signals. Revenue trend: ${avgRevenue > 0 ? 'positive' : avgRevenue < 0 ? 'negative' : 'neutral'}. Margin trend: ${avgMargin > 0 ? 'expanding' : avgMargin < 0 ? 'compressing' : 'stable'}.`,
      notesRawText: null,
      fallback: true,
      extraction_method: 'news_inference',
      confidence: finalConfidence,
    } as any;

    // Insert into database with fallback metadata
    const stmt = db.prepare(`
      INSERT OR REPLACE INTO financial_reports (
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
        validation_status, validation_notes, extraction_method, extraction_source_note,
        revenue_growth_qoq, margin_trend, debt_ratio_hint
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
        $validationStatus, $validationNotes, $extractionMethod, $extractionSourceNote,
        $revenueGrowthQoq, $marginTrend, $debtRatioHint
      )
    `);

    stmt.run({
      $id: fallbackReport.id,
      $actionCode: fallbackReport.actionCode,
      $companyName: fallbackReport.companyName,
      $exchange: fallbackReport.exchange,
      $domain: fallbackReport.domain,
      $periodYear: fallbackReport.period.year,
      $periodQuarter: fallbackReport.period.quarter,
      $periodType: fallbackReport.period.periodType,
      $periodStart: fallbackReport.period.startDate,
      $periodEnd: fallbackReport.period.endDate,
      $sortKey: fallbackReport.period.sortKey,
      $sscUrl: fallbackReport.source.sscUrl,
      $pdfPath: fallbackReport.source.pdfPath,
      $publishedAt: fallbackReport.source.publishedAt,
      $parsedAt: fallbackReport.source.parsedAt,
      $auditStatus: fallbackReport.source.auditStatus,
      $auditor: fallbackReport.source.auditor,
      $extractionConfidence: fallbackReport.source.extractionConfidence,
      $netRevenue: fallbackReport.incomeStatement.netRevenue,
      $grossProfit: fallbackReport.incomeStatement.grossProfit,
      $operatingProfit: fallbackReport.incomeStatement.operatingProfit,
      $ebitda: fallbackReport.incomeStatement.ebitda,
      $profitBeforeTax: fallbackReport.incomeStatement.profitBeforeTax,
      $netProfit: fallbackReport.incomeStatement.netProfit,
      $eps: fallbackReport.incomeStatement.eps,
      $dilutedEps: fallbackReport.incomeStatement.dilutedEps,
      $totalAssets: fallbackReport.balanceSheet.totalAssets,
      $currentAssets: fallbackReport.balanceSheet.currentAssets.total,
      $cash: fallbackReport.balanceSheet.currentAssets.cash,
      $inventory: fallbackReport.balanceSheet.currentAssets.inventory,
      $totalLiabilities: fallbackReport.balanceSheet.totalLiabilities,
      $shortTermDebt: fallbackReport.balanceSheet.currentLiabilities.shortTermDebt,
      $longTermDebt: fallbackReport.balanceSheet.longTermLiabilities.longTermDebt,
      $equityTotal: fallbackReport.balanceSheet.equity.total,
      $operatingCf: fallbackReport.cashFlow.operatingCF,
      $investingCf: fallbackReport.cashFlow.investingCF,
      $financingCf: fallbackReport.cashFlow.financingCF,
      $capex: fallbackReport.cashFlow.capex,
      $freeCashFlow: fallbackReport.cashFlow.freeCashFlow,
      $grossMarginPct: fallbackReport.ratios.grossMarginPct ?? null,
      $operatingMarginPct: fallbackReport.ratios.operatingMarginPct ?? null,
      $netMarginPct: fallbackReport.ratios.netMarginPct ?? null,
      $roe: fallbackReport.ratios.roe ?? null,
      $roa: fallbackReport.ratios.roa ?? null,
      $currentRatio: fallbackReport.ratios.currentRatio ?? null,
      $debtToEquity: fallbackReport.ratios.debtToEquity ?? null,
      $netDebtToEbitda: fallbackReport.ratios.netDebtToEbitda ?? null,
      $pe: fallbackReport.ratios.pe ?? null,
      $pb: fallbackReport.ratios.pb ?? null,
      $balanceSheetJson: JSON.stringify(fallbackReport.balanceSheet),
      $incomeStmtJson: JSON.stringify(fallbackReport.incomeStatement),
      $cashFlowJson: JSON.stringify(fallbackReport.cashFlow),
      $ratiosJson: JSON.stringify(fallbackReport.ratios),
      $yoyDeltaJson: null,
      $qoqDeltaJson: null,
      $marketDataJson: null,
      $embeddingText: fallbackReport.embeddingText,
      $notesRawText: fallbackReport.notesRawText,
      $validationStatus: 'pending',
      $validationNotes: `Fallback from news chain: ${hints.length} signals (age <${maxAgeDays}d)`,
      $extractionMethod: 'news_inference',
      $extractionSourceNote: `Fallback: PDF extraction timeout. Populated from ${hints.length} chain signals (signal age: <${maxAgeDays}d). Confidence: ${finalConfidence.toFixed(2)}`,
      $revenueGrowthQoq: avgRevenue,
      $marginTrend: avgMargin,
      $debtRatioHint: hints.length > 0 && hints[0] && hints[0].debt_ratio_pct !== null ? hints[0].debt_ratio_pct : 0.0,
    });

    logger.info(`${tag} fallback report inserted`);
    return {
      fallback: true,
      report: fallbackReport,
    };
  } catch (err) {
    logger.warn(`${tag} fallback process failed`, {
      error: err instanceof Error ? err.message : String(err),
    });
    return {
      fallback: false,
      reason: `fallback process failed: ${err instanceof Error ? err.message : String(err)}`,
    };
  }
}
