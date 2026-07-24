// FACTORY-INFRA-split-stores-and-migrations
//
// Two independent equivalence proofs (task requires unit-level evidence,
// since the ticket's rebuild + named-volume-DB RAW-verify is PENDING —
// user-gated, deferred to the next rebuild):
//
// 1. Declarative financial_reports column migrations (schema-financial-
//    reports.ts) produce the SAME column set (name/type/notnull/default) as
//    the pre-refactor inline `if(!colNames.has(...))ALTER TABLE` sequence,
//    and are idempotent. Golden values below were captured by an ad-hoc A/B
//    run (fresh in-memory DB, old code from git HEAD vs. new declarative
//    code, PRAGMA table_info diff = zero delta across all 22 columns + the
//    idx_fr_extraction_method index + 6 unrelated tables) — see decision
//    journal for the full A/B transcript.
//
// 2. vnstockStore.ts (barrel) re-exports the SAME function references as the
//    per-entity infrastructure/db/vnstock/*.ts modules — proven by strict
//    reference equality, not behavioral approximation. This is the strongest
//    possible proof that the barrel performs a pure re-export (not a
//    duplicated/drifted copy). See "Section 3 note" below for why functional
//    round-trip assertions are NOT duplicated in this file.

import { describe, it, expect } from "bun:test";
import { Database } from "bun:sqlite";
import { initFinancialReportsTables } from "../infrastructure/db/schema-financial-reports.js";

// ── Section 1: declarative migration equivalence + idempotency ─────────────

interface ColGolden {
  name: string;
  type: string;
  notnull: number;
  dflt_value: string | null;
}

// Captured from the A/B comparison run (old inline code vs. new declarative
// code, both against a fresh in-memory DB) — zero delta observed.
const GOLDEN_FR_COLUMNS: ColGolden[] = [
  { name: "charter_capital", type: "REAL", notnull: 0, dflt_value: null },
  { name: "confidence_financial", type: "REAL", notnull: 0, dflt_value: null },
  { name: "confirm_status", type: "TEXT", notnull: 1, dflt_value: "'PENDING'" },
  { name: "confirmed_by", type: "TEXT", notnull: 0, dflt_value: "'user'" },
  { name: "data_env", type: "TEXT", notnull: 0, dflt_value: null },
  { name: "debt_ratio_hint", type: "REAL", notnull: 0, dflt_value: "0.0" },
  { name: "extraction_method", type: "TEXT", notnull: 0, dflt_value: "'ocr_pdf'" },
  { name: "extraction_source_note", type: "TEXT", notnull: 0, dflt_value: null },
  { name: "final_confirmed_at", type: "TEXT", notnull: 0, dflt_value: null },
  { name: "investment_property", type: "REAL", notnull: 0, dflt_value: null },
  { name: "margin_trend", type: "REAL", notnull: 0, dflt_value: "0.0" },
  { name: "net_profit_api_bridge", type: "REAL", notnull: 0, dflt_value: null },
  { name: "ocr_confidence", type: "REAL", notnull: 0, dflt_value: null },
  { name: "operating_cash_flow", type: "REAL", notnull: 0, dflt_value: null },
  { name: "period_basis", type: "TEXT", notnull: 0, dflt_value: null },
  { name: "refine_status", type: "TEXT", notnull: 1, dflt_value: "'PENDING'" },
  { name: "report_scope", type: "TEXT", notnull: 0, dflt_value: null },
  { name: "revenue_growth_qoq", type: "REAL", notnull: 0, dflt_value: "0.0" },
  { name: "reward_fund", type: "REAL", notnull: 0, dflt_value: null },
  { name: "text_status", type: "TEXT", notnull: 1, dflt_value: "'COMPLETE'" },
  { name: "validation_notes", type: "TEXT", notnull: 0, dflt_value: null },
  { name: "validation_status", type: "TEXT", notnull: 0, dflt_value: "'pending'" },
];

function colInfo(db: Database, table: string): ColGolden[] {
  return db
    .query<{ name: string; type: string; notnull: number; dflt_value: string | null }, []>(
      `PRAGMA table_info(${table})`,
    )
    .all()
    .map((c) => ({ name: c.name, type: c.type, notnull: c.notnull, dflt_value: c.dflt_value }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

describe("FACTORY-INFRA: declarative financial_reports migrations — equivalence", () => {
  it("produces exactly the 22 golden columns with byte-identical type/notnull/default", () => {
    const db = new Database(":memory:");
    initFinancialReportsTables(db);
    const targetNames = new Set(GOLDEN_FR_COLUMNS.map((c) => c.name));
    const actual = colInfo(db, "financial_reports").filter((c) => targetNames.has(c.name));
    expect(actual).toEqual(GOLDEN_FR_COLUMNS);
  });

  it("idx_fr_extraction_method index exists (depends on extraction_method column)", () => {
    const db = new Database(":memory:");
    initFinancialReportsTables(db);
    const idx = db
      .query<{ name: string }, []>(
        "SELECT name FROM sqlite_master WHERE type='index' AND name='idx_fr_extraction_method'",
      )
      .get();
    expect(idx?.name).toBe("idx_fr_extraction_method");
  });

  it("is idempotent — second call is a no-op (same schema, no throw)", () => {
    const db = new Database(":memory:");
    initFinancialReportsTables(db);
    const before = colInfo(db, "financial_reports");
    expect(() => initFinancialReportsTables(db)).not.toThrow();
    const after = colInfo(db, "financial_reports");
    expect(after).toEqual(before);
  });

  it("leaves unrelated table migrations untouched (bctc_vps_queue, vnstock_trading_stats, vnstock_officers, bctc_table_rows)", () => {
    const db = new Database(":memory:");
    initFinancialReportsTables(db);
    expect(colInfo(db, "bctc_vps_queue").some((c) => c.name === "reconcile_attempts")).toBe(true);
    expect(colInfo(db, "vnstock_trading_stats").some((c) => c.name === "market_cap_bn")).toBe(true);
    expect(colInfo(db, "vnstock_officers").some((c) => c.name === "appointment_year")).toBe(true);
    expect(colInfo(db, "bctc_table_rows").some((c) => c.name === "source_confidence")).toBe(true);
  });
});

// ── Section 2: vnstock store split — barrel is a pure re-export ────────────

import * as barrel from "../infrastructure/db/vnstockStore.js";
import * as financialsStore from "../infrastructure/db/vnstock/financialsStore.js";
import * as tradingStatsStore from "../infrastructure/db/vnstock/tradingStatsStore.js";
import * as officersStore from "../infrastructure/db/vnstock/officersStore.js";
import * as shareholdersStore from "../infrastructure/db/vnstock/shareholdersStore.js";
import * as eventsStore from "../infrastructure/db/vnstock/eventsStore.js";
import * as balanceSheetStore from "../infrastructure/db/vnstock/balanceSheetStore.js";
import * as cashFlowStore from "../infrastructure/db/vnstock/cashFlowStore.js";
import * as foreignFlowStore from "../infrastructure/db/vnstock/foreignFlowStore.js";
import * as migrations from "../infrastructure/db/vnstock/migrations.js";
import * as fetchLog from "../infrastructure/db/vnstock/fetchLog.js";

describe("FACTORY-INFRA: vnstockStore.ts barrel is a pure re-export (reference equality)", () => {
  const cases: Array<[keyof typeof barrel, unknown]> = [
    ["isStale", fetchLog.isStale],
    ["markFetched", fetchLog.markFetched],
    ["storeFinancials", financialsStore.storeFinancials],
    ["getLatestFinancials", financialsStore.getLatestFinancials],
    ["storeTradingStats", tradingStatsStore.storeTradingStats],
    ["getTradingStats", tradingStatsStore.getTradingStats],
    ["tradingStatsHasDate", tradingStatsStore.tradingStatsHasDate],
    ["resetTradingStatsDateCache", tradingStatsStore.resetTradingStatsDateCache],
    ["storeOfficers", officersStore.storeOfficers],
    ["storeShareholders", shareholdersStore.storeShareholders],
    ["storeEvents", eventsStore.storeEvents],
    ["getEvents", eventsStore.getEvents],
    ["storeBalanceSheet", balanceSheetStore.storeBalanceSheet],
    ["getLatestBalanceSheet", balanceSheetStore.getLatestBalanceSheet],
    ["storeCashFlow", cashFlowStore.storeCashFlow],
    ["getLatestCashFlow", cashFlowStore.getLatestCashFlow],
    ["getForeignFlowHistory", foreignFlowStore.getForeignFlowHistory],
    ["upsertForeignFlow", foreignFlowStore.upsertForeignFlow],
    ["runVnstockMigrations", migrations.runVnstockMigrations],
  ];

  for (const [barrelName, subfolderFn] of cases) {
    it(`barrel.${String(barrelName)} === subfolder module export (same function reference)`, () => {
      expect((barrel as Record<string, unknown>)[barrelName as string]).toBe(subfolderFn);
    });
  }
});

// ── Section 3 note ───────────────────────────────────────────────────────────
// Functional store+get round-trip behavior (through this exact barrel path)
// is ALREADY covered by ~15 pre-existing test files that were re-run green
// against the split code (see decision journal "test_evidence"):
//   1042-vnstock-ddl-schema, 1856a-vnstock-events-null-code,
//   1850a-vnstock-sync-array-filter-crash, fix-vnstock-fundamentals-crash-spike,
//   fix-vnstock-tradingstats-crash, 1922-vnstock-events, vnstock-3statement
//   (balance sheet + cash flow), 1131/1275/1291/1310a/1312b/1403/1777b/1878a/
//   214/FIX-1275/FIX-FOREIGN-FLOW-INTEGRITY-BREAK/FIX-foreign-flow-unique-
//   constraint/vnstock-foreign-flow (foreign flow + trading stats).
// A prior version of this file duplicated that coverage in a Section 3 using
// the shared getDb() singleton (Bun.env["DB_PATH"]=":memory:" + initDatabase()
// — the same pattern all of the above files already use). That duplicate
// section was REMOVED after full-suite (`bun test`, ~1220 files, one shared
// process) runs showed it non-deterministically failing alongside the
// PRE-EXISTING, untouched vnstock-3statement.test.ts (both hit the documented
// Bun mock.module cross-file cache-pollution hazard — see
// docs/agent-memory/... "mockguard bun cache FP" — triggered by 1466-sync-db-
// corruption-bail.test.ts's mock.module("vnstockStore.js", ...) leaking into
// sibling files sharing the process). Standalone and small-batch runs of both
// this file and vnstock-3statement.test.ts are 100% green; only the giant
// shared-process full run exhibits the pre-existing hazard. Keeping Section 3
// out avoids adding a second flaky witness to an already-known issue while
// losing zero real coverage (Sections 1+2 above are the load-bearing NEW
// proofs for this task; functional round-trip was already proven elsewhere).
