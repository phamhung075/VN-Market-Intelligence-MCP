/**
 * FACTORY-APP-split-fetchParseAndStoreBctc — extracted from fetchParseAndStoreBctc.ts
 * to keep the orchestrator a thin sequencer (DoD: orchestrator <=120L).
 * size-justification: 132L — FIX-LANCEDB-INSERT-SEGFAULT moved the default-inserter
 * resolution inside its own try/catch and added the insertAnalysisResolverFn
 * injection seam (with its doc comment) to guard against an uncaught resolution
 * throw breaking this file's own non-fatal contract.
 *
 * Step 4 of the BCTC pipeline: derive sector, build the RAG summary entry, and
 * embed it into LanceDB via the injected/real insertAnalysis function. LanceDB
 * failure is non-fatal — the report is already persisted in SQLite by Step 3
 * (fetchParseAndStoreBctc.ts).
 *
 * Arithmetic/behavior is unchanged from the pre-split file — this is a pure
 * relocation into its own module.
 */

import { randomUUID } from "node:crypto";

import { logger } from "../../../infrastructure/logger.js";
import { buildAnalysisSummary } from "./newsChainFallback.js";

import type { AnalysisInput } from "../../../infrastructure/rag/ragHttpClient.js";
import type { FinancialReport } from "../../../../bctc-schema.js";
import type { InsertAnalysisFn, QuarterString } from "./types.js";

/**
 * Lazily build the real insertAnalysis function.
 * G5b (P2-F): delegates to ragIndex (rag-service HTTP /index at port 5002).
 * Deferred to avoid network calls when the caller provides a mock.
 * DFR-P1-MCP FR-5: passes all new metadata fields from AnalysisInput.
 */
async function getDefaultInsertAnalysis(): Promise<InsertAnalysisFn> {
  const { ragIndex } = await import("../../../infrastructure/rag/ragHttpClient.js");
  return async (entry: AnalysisInput): Promise<void> => {
    await ragIndex({
      id: entry.id,
      content: entry.summary,
      tags: entry.tags,
      level: entry.level,
      title: entry.title,
      summary: entry.summary,
      ...(entry.actionCode    !== undefined ? { action_code:    entry.actionCode }    : {}),
      // DFR-P1-MCP FR-5: new metadata passthrough
      ...(entry.doc_type      !== undefined ? { doc_type:      entry.doc_type }      : {}),
      ...(entry.depth_tier    !== undefined ? { depth_tier:    entry.depth_tier }    : {}),
      ...(entry.source_domain !== undefined ? { source_domain: entry.source_domain } : {}),
      ...(entry.published_at  !== undefined ? { published_at:  entry.published_at }  : {}),
      ...(entry.confidence    !== undefined ? { confidence:    entry.confidence }    : {}),
      ...(entry.impact_score  !== undefined ? { impact_score:  entry.impact_score }  : {}),
      ...(entry.ticker        !== undefined ? { ticker:        entry.ticker }        : {}),
      ...(entry.sector        !== undefined ? { sector:        entry.sector }        : {}),
    });
  };
}

export interface InsertBctcAnalysisParams {
  report: FinancialReport;
  doc: { url: string; publishedAt?: string };
  actionCode: string;
  year: number;
  quarter: QuarterString;
  insertAnalysisFn?: InsertAnalysisFn | undefined;
  /**
   * Test-only injection seam for the default-inserter RESOLVER itself (as
   * opposed to insertAnalysisFn, which replaces the already-resolved
   * inserter). Lets tests deterministically simulate a resolution failure
   * (e.g. the historical module-load-time native-addon crash class) without
   * depending on module-mock timing. Defaults to the real resolver.
   * FIX-LANCEDB-INSERT-SEGFAULT.
   */
  insertAnalysisResolverFn?: (() => Promise<InsertAnalysisFn>) | undefined;
  /** Log tag, shared verbatim with the orchestrator's Step 1/2/3 log lines. */
  tag: string;
}

export async function insertBctcAnalysis(params: InsertBctcAnalysisParams): Promise<void> {
  const { report, doc, actionCode, year, quarter, insertAnalysisFn, insertAnalysisResolverFn, tag } = params;

  logger.info(`${tag} step 4: inserting analysis into LanceDB`);

  try {
    // FIX-LANCEDB-INSERT-SEGFAULT: inserter resolution (including the lazy
    // module import inside getDefaultInsertAnalysis) MUST stay inside this
    // try/catch. This line used to sit ABOVE the try block, so a throw during
    // resolution (missing module, or historically a native-addon crash on
    // import — the exact mechanism CI-RED-da847805-FIX fixed for `bun test`)
    // propagated uncaught out of this function AND out of the orchestrator's
    // unguarded Step 4 call, silently breaking the "non-fatal" contract
    // documented at the top of this file.
    const resolveDefaultInsertAnalysis = insertAnalysisResolverFn ?? getDefaultInsertAnalysis;
    const inserter = insertAnalysisFn ?? (await resolveDefaultInsertAnalysis());

    // DFR-P1-MCP FR-5: derive sector from ticker via mcp.config.json market.referenceStocks
    let sector = "";
    try {
      const { loadMcpConfig } = await import("../../../infrastructure/config.js");
      const cfg = loadMcpConfig();
      const refStocks = (cfg.market as unknown as Record<string, unknown>)?.referenceStocks as
        Record<string, string[]> | undefined;
      if (refStocks) {
        for (const [sectorName, tickers] of Object.entries(refStocks)) {
          if (Array.isArray(tickers) && tickers.includes(actionCode.toUpperCase())) {
            sector = sectorName;
            break;
          }
        }
      }
    } catch { /* sector lookup best-effort */ }

    const analysisEntry: AnalysisInput = {
      id: randomUUID(),
      level: "action",
      title: `BCTC ${actionCode} ${quarter}/${year}`,
      summary: buildAnalysisSummary(report),
      tags: ["bctc", "financial_report", actionCode.toLowerCase(), quarter.toLowerCase()],
      actionCode,
      // DFR-P1-MCP FR-5: new metadata fields for BCTC filing
      doc_type: "filing",
      depth_tier: "shallow",
      ticker: actionCode.toUpperCase(),
      sector,
      source_domain: "bctc.ssi.com.vn",
      published_at: doc.publishedAt ?? "",
      confidence: report.source.extractionConfidence ?? 0,
      impact_score: 0,
    };

    await inserter(analysisEntry);
  } catch (err) {
    // LanceDB failure is non-fatal — report is already in SQLite
    logger.error(`${tag} insertAnalysis failed (non-fatal)`, {
      error: err instanceof Error ? err.message : String(err),
    });
  }
}
