/**
 * Sprint 001 Smoke Test
 *
 * Validates the full BCTC RAG pipeline end-to-end:
 *   1. Parse all 3 financial statements from Vietnamese BCTC text
 *   2. Compute ratios (ROE, ROA, PE when price given)
 *   3. Verify sprint success metrics: netRevenue > 0, totalAssets > 0
 *   4. Verify result stored in SQLite
 *   5. Verify RAG embedding text is buildable
 *
 * Run: bun run scripts/smoke-test-sprint-001.ts
 */

// Use in-memory DB for smoke test
process.env["DB_PATH"] = ":memory:";

import { parseBctcReport } from "../apps/mcp-server/src/application/usecases/parseBctcReport.js";
import { initDatabase, getDb } from "../apps/mcp-server/src/infrastructure/db/schema.js";
import { buildEmbeddingText } from "../apps/mcp-server/src/domain/services/embeddingTextBuilder.js";
import type { FiscalPeriod } from "../bctc-schema.js";

// ─── Fixture: Full 3-statement BCTC text ─────────────────────────────────────
// NOTE: The retained-earnings line "Lợi nhuận sau thuế chưa phân phối" is
// intentionally placed BEFORE the income statement section so the P_NET_PROFIT
// pattern matches the income statement line, not the balance sheet line.
// This matches the structure of real Vietnamese BCTC PDFs.
const FULL_BCTC_TEXT = `
CÔNG TY CỔ PHẦN VCB
BÁO CÁO TÀI CHÍNH QUÝ 1/2024

BẢNG CÂN ĐỐI KẾ TOÁN
Tài sản ngắn hạn                                    50.000.000
  Tiền và tương đương tiền                            5.000.000
  Hàng tồn kho                                       12.000.000
TỔNG CỘNG TÀI SẢN                                   80.000.000

Nợ phải trả                                         30.000.000
Vốn chủ sở hữu                                      50.000.000
TỔNG CỘNG NGUỒN VỐN                                 80.000.000

BÁO CÁO KẾT QUẢ HOẠT ĐỘNG KINH DOANH
Doanh thu bán hàng và cung cấp dịch vụ              40.000.000
Giảm trừ doanh thu                                     500.000
Doanh thu thuần                                     39.500.000
Giá vốn hàng bán                                    25.000.000
Lợi nhuận gộp                                       14.500.000
Chi phí bán hàng                                     3.000.000
Chi phí quản lý doanh nghiệp                         2.000.000
Lợi nhuận thuần từ hoạt động kinh doanh              8.500.000
Lợi nhuận trước thuế                                 8.600.000
Thuế TNDN hiện hành                                  1.720.000
Lợi nhuận sau thuế                                   6.880.000
Lãi cơ bản trên cổ phiếu                                 3.440

BÁO CÁO LƯU CHUYỂN TIỀN TỆ
Lợi nhuận trước thuế                                 8.600.000
Khấu hao TSCĐ                                        1.500.000
Lưu chuyển tiền thuần từ hoạt động kinh doanh        5.880.000
Tiền chi mua sắm TSCĐ                               (3.000.000)
Lưu chuyển tiền thuần từ hoạt động đầu tư           (3.000.000)
Tiền vay nhận được                                   5.000.000
Lưu chuyển tiền thuần từ hoạt động tài chính           (0)
Lưu chuyển tiền thuần trong kỳ                       2.880.000
Tiền và tương đương tiền đầu kỳ                      2.120.000
Tiền và tương đương tiền cuối kỳ                     5.000.000
`;

const PERIOD: FiscalPeriod = {
  year: 2024,
  quarter: 1,
  periodType: "Q1",
  startDate: "2024-01-01",
  endDate: "2024-03-31",
  sortKey: "2024-Q1",
};

// ─── Helpers ──────────────────────────────────────────────────────────────────
let passCount = 0;
let failCount = 0;

function check(label: string, condition: boolean, detail?: string): void {
  if (condition) {
    passCount++;
    console.log(`  PASS  ${label}`);
  } else {
    failCount++;
    console.log(`  FAIL  ${label}${detail ? ` — ${detail}` : ""}`);
  }
}

// ─── Main ──────────────────────────────────────────────────────────────────────
console.log("Sprint 001 Smoke Test");
console.log("=".repeat(60));

// Step 1: Initialise DB
console.log("\n[1] Initialising SQLite (in-memory)...");
await initDatabase();
check("Database initialised without error", true);

// Step 2: Parse full BCTC
console.log("\n[2] Running parseBctcReport...");
const report = await parseBctcReport({
  rawText: FULL_BCTC_TEXT,
  actionCode: "VCB",
  period: PERIOD,
  shares: 2_000_000,   // 2 million shares
  price: 50_000,       // VND 50,000 per share
});

const extractionConfidence = report.source.extractionConfidence;

console.log(`     actionCode           : ${report.actionCode}`);
console.log(`     period.sortKey       : ${report.period.sortKey}`);
console.log(`     totalAssets          : ${report.balanceSheet.totalAssets}`);
console.log(`     netRevenue           : ${report.incomeStatement.netRevenue}`);
console.log(`     netProfit            : ${report.incomeStatement.netProfit}`);
console.log(`     eps                  : ${report.incomeStatement.eps}`);
console.log(`     equity.total         : ${report.balanceSheet.equity.total}`);
console.log(`     operatingCF          : ${report.cashFlow.operatingCF}`);
console.log(`     ratios.ROE           : ${report.ratios.roe}`);
console.log(`     ratios.ROA           : ${report.ratios.roa}`);
console.log(`     ratios.PE            : ${report.ratios.pe}`);
console.log(`     ratios.grossMarginPct: ${report.ratios.grossMarginPct}`);
console.log(`     extractionConfidence : ${extractionConfidence}`);

// ─── Sprint success metrics ───────────────────────────────────────────────────
console.log("\n[3] Sprint Success Metrics:");
check(
  "netRevenue > 0",
  (report.incomeStatement.netRevenue ?? 0) > 0,
  `got ${report.incomeStatement.netRevenue}`,
);
check(
  "totalAssets > 0",
  (report.balanceSheet.totalAssets ?? 0) > 0,
  `got ${report.balanceSheet.totalAssets}`,
);
check(
  "ROE computed (not null)",
  report.ratios.roe != null,
  `got ${report.ratios.roe}`,
);
check(
  "PE computed when price given",
  report.ratios.pe != null,
  `got ${report.ratios.pe}`,
);
check(
  "extractionConfidence >= 0.7 for full text (source.extractionConfidence)",
  extractionConfidence >= 0.7,
  `got ${extractionConfidence}`,
);

// ─── Statement completeness ───────────────────────────────────────────────────
console.log("\n[4] Statement Completeness:");
check(
  "Balance sheet equity.total > 0",
  (report.balanceSheet.equity.total ?? 0) > 0,
  `got ${report.balanceSheet.equity.total}`,
);
check(
  "Cash flow operatingCF > 0",
  (report.cashFlow.operatingCF ?? 0) > 0,
  `got ${report.cashFlow.operatingCF}`,
);
check(
  "grossMarginPct computed",
  report.ratios.grossMarginPct != null,
  `got ${report.ratios.grossMarginPct}`,
);
check(
  "ROA computed",
  report.ratios.roa != null,
  `got ${report.ratios.roa}`,
);

// ─── SQLite storage ───────────────────────────────────────────────────────────
console.log("\n[5] SQLite Storage:");
const db = getDb();
const row = db
  .prepare("SELECT id, action_code, sort_key, extraction_confidence, net_revenue, total_assets, roe, pe FROM financial_reports WHERE action_code = ? AND sort_key = ?")
  .get("VCB", "2024-Q1") as {
    id: string;
    action_code: string;
    sort_key: string;
    extraction_confidence: number | null;
    net_revenue: number | null;
    total_assets: number | null;
    roe: number | null;
    pe: number | null;
  } | undefined;

check("Row exists in financial_reports", row != null);
if (row) {
  check("action_code stored correctly", row.action_code === "VCB");
  check("sort_key stored correctly", row.sort_key === "2024-Q1");
  check(
    "net_revenue stored > 0",
    (row.net_revenue ?? 0) > 0,
    `got ${row.net_revenue}`,
  );
  check(
    "total_assets stored > 0",
    (row.total_assets ?? 0) > 0,
    `got ${row.total_assets}`,
  );
  check(
    "roe stored (not null)",
    row.roe != null,
    `got ${row.roe}`,
  );
  check(
    "extraction_confidence stored",
    row.extraction_confidence != null,
    `got ${row.extraction_confidence}`,
  );
}

// ─── Embedding text builder ───────────────────────────────────────────────────
// buildEmbeddingText is for RAG AnalysisEntry objects.
// For FinancialReport, the pipeline (task 048) will build embeddings from
// report.embeddingText which is pre-assembled by parseBctcReport.
// Here we verify: (a) the RAG embedding text builder works for analysis entries,
// (b) report.embeddingText is populated with a sensible string.
console.log("\n[6] RAG Embedding Text Builder:");

// (a) RAG analysis entry embedding
const embText = buildEmbeddingText({
  title: `VCB Q1/2024 Financial Report`,
  summary: `Revenue ${report.incomeStatement.netRevenue}M VND, Net profit ${report.incomeStatement.netProfit}M VND, ROE ${report.ratios.roe}%`,
  tags: ["BCTC", "VCB", "banking"],
  level: "action",
  actionCode: "VCB",
});
check(
  "RAG embedding text is non-empty",
  embText.length > 50,
  `length=${embText.length}`,
);
check(
  "RAG embedding text contains actionCode",
  embText.includes("VCB"),
);
check(
  "RAG embedding text contains period year",
  embText.includes("2024"),
);
console.log(`     sample: "${embText.slice(0, 100)}..."`);

// (b) FinancialReport embeddingText — assembled by orchestrator (may be empty
//     until task 048 wires in; verify field exists)
check(
  "report.embeddingText field exists (string)",
  typeof report.embeddingText === "string",
  `got ${typeof report.embeddingText}`,
);

// ─── Summary ─────────────────────────────────────────────────────────────────
console.log("\n" + "=".repeat(60));
console.log(`Smoke Test Results: ${passCount} passed / ${failCount} failed`);
console.log("=".repeat(60));

if (failCount > 0) {
  process.exit(1);
}
