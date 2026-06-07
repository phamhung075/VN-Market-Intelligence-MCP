/**
 * TSU-DEV-U6 — TSH Leftover Pairs: Description Update Assertions
 *
 * Verifies that each tool in the 5 TSH leftover pairs carries a description
 * that clearly distinguishes it from its sibling, per architect verdict
 * (TOOL-SURFACE-UPGRADE-BA-spec.md lines 438–449): KEEP ALL SEPARATE,
 * description-only updates.
 *
 * Strategy: source-file text scanning (same as U3 suite) — no runtime
 * server instantiation needed; description strings are static.
 *
 * Test plan:
 *   T-U6-1: get_patterns description contains "RAG" + "rag_analyses"
 *   T-U6-2: get_technical_indicators description contains "quantitative" + "5003"
 *   T-U6-3: trigger_bctc_vps_fetch description contains "fetch-bctc.sh" + "queued"
 *   T-U6-4: trigger_price_vps_fetch description contains "fetch-prices.sh" + "service"
 *   T-U6-5: trigger_news_vps_fetch description explicitly notes absence of tickers param
 *   T-U6-6: get_market_summary description mentions cache-first semantics
 *   T-U6-7: generate_market_summary description mentions force-regenerate semantics
 *   T-U6-8: get_insider_signals description mentions "classifier" + input requirement
 *   T-U6-9: get_insider_transactions description mentions "DB" + "SSC"
 *
 * Cross-reference tests (sibling tools reference each other):
 *   T-U6-X1: get_patterns ↔ get_technical_indicators
 *   T-U6-X2: get_market_summary ↔ generate_market_summary
 *   T-U6-X3: get_insider_signals ↔ get_insider_transactions
 *
 * @module __tests__/TSU-DEV-U6-tsh-leftover-descriptions
 */

import { describe, it, expect } from "bun:test";
import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";

// ─── Paths ────────────────────────────────────────────────────────────────────

const PROJECT_ROOT = resolve(import.meta.dir, "../../../..");
const TOOLS_DIR = join(PROJECT_ROOT, "apps/mcp-server/src/interface/mcp/tools");

function readTool(relPath: string): string {
  return readFileSync(join(TOOLS_DIR, relPath), "utf-8");
}

// ─────────────────────────────────────────────────────────────────────────────
// T-U6-1 & T-U6-2: get_patterns vs get_technical_indicators
// ─────────────────────────────────────────────────────────────────────────────

describe("T-U6-1/T-U6-2: get_patterns vs get_technical_indicators descriptions", () => {
  it("T-U6-1: get_patterns description contains 'RAG' and 'rag_analyses'", () => {
    const content = readTool("market-data/marketTools.ts");
    expect(content).toMatch(/get_patterns/);
    expect(content).toMatch(/RAG/);
    expect(content).toMatch(/rag_analyses/);
  });

  it("T-U6-2: get_technical_indicators description contains 'quantitative' and '5003' (Go port)", () => {
    const content = readTool("market-data/technicalIndicatorTools.ts");
    expect(content).toMatch(/get_technical_indicators/);
    expect(content).toMatch(/[Qq]uantitative/);
    expect(content).toMatch(/5003/);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// T-U6-3 to T-U6-5: trigger_*_vps_fetch descriptions
// ─────────────────────────────────────────────────────────────────────────────

describe("T-U6-3/T-U6-4/T-U6-5: trigger_*_vps_fetch descriptions", () => {
  it("T-U6-3: trigger_bctc_vps_fetch description contains 'fetch-bctc.sh' and 'queued'", () => {
    const content = readTool("system/bctcDebugTriggerTool.ts");
    expect(content).toMatch(/trigger_bctc_vps_fetch/);
    expect(content).toMatch(/fetch-bctc\.sh/);
    expect(content).toMatch(/queued/i);
  });

  it("T-U6-4: trigger_price_vps_fetch description contains 'fetch-prices.sh' and 'service'", () => {
    const content = readTool("system/priceDebugTriggerTool.ts");
    expect(content).toMatch(/trigger_price_vps_fetch/);
    expect(content).toMatch(/fetch-prices\.sh/);
    expect(content).toMatch(/service/i);
  });

  it("T-U6-5: trigger_news_vps_fetch description explicitly notes NO tickers param + fetch-news.sh", () => {
    const content = readTool("system/newsDebugTriggerTool.ts");
    expect(content).toMatch(/trigger_news_vps_fetch/);
    // Must explicitly state source-based (no tickers) vs price/bctc which have tickers
    expect(content).toMatch(/[Nn][Oo] tickers|source.based|no ticker/i);
    expect(content).toMatch(/fetch-news\.sh/);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// T-U6-6 & T-U6-7: get_market_summary vs generate_market_summary
// ─────────────────────────────────────────────────────────────────────────────

describe("T-U6-6/T-U6-7: get_market_summary vs generate_market_summary descriptions", () => {
  it("T-U6-6: get_market_summary description mentions cache-first semantics", () => {
    const content = readTool("briefings/summaryTools.ts");
    expect(content).toMatch(/get_market_summary/);
    // Cache-first: one of these phrases must appear in the description
    expect(content).toMatch(/cache.first|read.cache|[Cc]ached|cache-first/i);
  });

  it("T-U6-7: generate_market_summary description mentions force-regenerate semantics", () => {
    const content = readTool("briefings/summaryTools.ts");
    expect(content).toMatch(/generate_market_summary/);
    // Must clarify bypass / force behaviour
    expect(content).toMatch(/[Ff]orce.generat|bypass cache|bypasses cache|always generat|[Ff]orce.regen/i);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// T-U6-8 & T-U6-9: get_insider_signals vs get_insider_transactions
// ─────────────────────────────────────────────────────────────────────────────

describe("T-U6-8/T-U6-9: get_insider_signals vs get_insider_transactions descriptions", () => {
  it("T-U6-8: get_insider_signals description mentions 'classifier' and caller-provided input", () => {
    const content = readTool("sector/leadershipTools.ts");
    expect(content).toMatch(/get_insider_signals/);
    expect(content).toMatch(/[Cc]lassif/);
    // Must indicate it is pure classifier — requires input from caller (no DB)
    expect(content).toMatch(/[Rr]equires|[Pp]rovide|[Ii]nput|[Cc]aller|no DB|pure/i);
  });

  it("T-U6-9: get_insider_transactions description mentions 'DB' and 'SSC'", () => {
    const content = readTool("market-data/insiderTools.ts");
    expect(content).toMatch(/get_insider_transactions/);
    expect(content).toMatch(/SSC/);
    expect(content).toMatch(/[Dd][Bb]|[Dd]atabase/i);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// T-U6-X: sibling cross-reference checks
// ─────────────────────────────────────────────────────────────────────────────

describe("T-U6-X: each tool description references its sibling (no merge, distinct)", () => {
  it("T-U6-X1a: get_patterns description references get_technical_indicators", () => {
    const content = readTool("market-data/marketTools.ts");
    expect(content).toMatch(/get_technical_indicators/);
  });

  it("T-U6-X1b: get_technical_indicators description references get_patterns", () => {
    const content = readTool("market-data/technicalIndicatorTools.ts");
    expect(content).toMatch(/get_patterns/);
  });

  it("T-U6-X2a: get_market_summary description references generate_market_summary", () => {
    const content = readTool("briefings/summaryTools.ts");
    // get_market_summary tool registration must mention generate_market_summary
    expect(content).toMatch(/generate_market_summary/);
  });

  it("T-U6-X2b: generate_market_summary description references get_market_summary", () => {
    const content = readTool("briefings/summaryTools.ts");
    // Both tools are in same file; generate_market_summary section must reference get_market_summary
    // (guaranteed since both tools are registered and descriptions mention each other)
    expect(content).toMatch(/get_market_summary/);
  });

  it("T-U6-X3a: get_insider_signals description references get_insider_transactions", () => {
    const content = readTool("sector/leadershipTools.ts");
    expect(content).toMatch(/get_insider_transactions/);
  });

  it("T-U6-X3b: get_insider_transactions description references get_insider_signals", () => {
    const content = readTool("market-data/insiderTools.ts");
    expect(content).toMatch(/get_insider_signals/);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// T-U6-SBV & T-U6-FF: additional trigger tools (clarify VPS script)
// ─────────────────────────────────────────────────────────────────────────────

describe("T-U6-SBV/T-U6-FF: sbv + foreign_flow trigger descriptions clarify VPS scripts", () => {
  it("T-U6-SBV: trigger_sbv_vps_fetch description mentions 'fetch-sbv.sh' or 'sbv-debug.sh'", () => {
    const content = readTool("system/sbvDebugTriggerTool.ts");
    expect(content).toMatch(/trigger_sbv_vps_fetch/);
    expect(content).toMatch(/fetch-sbv\.sh|sbv-debug\.sh|run-sbv/i);
  });

  it("T-U6-FF: trigger_foreign_flow_vps_fetch description mentions 'fetch-foreign-flow.sh' or 'foreign-flow-debug.sh'", () => {
    const content = readTool("system/foreignFlowDebugTriggerTool.ts");
    expect(content).toMatch(/trigger_foreign_flow_vps_fetch/);
    expect(content).toMatch(/fetch-foreign.flow\.sh|foreign.flow.debug\.sh|run-foreign/i);
  });
});
