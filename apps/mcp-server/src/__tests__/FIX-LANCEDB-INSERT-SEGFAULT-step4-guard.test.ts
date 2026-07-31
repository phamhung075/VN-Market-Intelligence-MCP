/**
 * FIX-LANCEDB-INSERT-SEGFAULT — Step-4 default-inserter resolution guard.
 *
 * ── ROOT-CAUSE RE-VERIFICATION (2026-07-31) ──────────────────────────────────
 * The backlog note this task shipped with claims: "Bun v1.3.13 segfault
 * (addr 0x20) occurs in fetchParseAndStoreBctc step-4 LanceDB insert — NOT
 * pdf-parse. Pre-existing." That literal claim does NOT hold on the current
 * codebase, and did not hold even at the time the note was written
 * (2026-06-07T12:33:46Z repro):
 *
 *   1. commit d29da3a8d (2026-05-24, "P2-F G5a/G5b/G5c — HTTP rewire") already
 *      replaced the direct native `@lancedb/lancedb` call at this exact call
 *      site with an HTTP POST to rag-service (ragHttpClient.ts `ragIndex`,
 *      port 5002) — TWO WEEKS before the repro this note is based on.
 *   2. commit 456851797 (2026-07-16, CI-RED-da847805-FIX) independently
 *      deleted the last `@lancedb/lancedb` native-addon import anywhere in
 *      the repo (infrastructure/rag/_deprecated/ — tests-only, zero
 *      production imports, confirmed by repo-wide grep before deletion).
 *   3. Live grep today (`grep -rn "@lancedb/lancedb" apps/mcp-server/src`)
 *      finds zero import statements anywhere in src/ (2 comment mentions
 *      only, in infrastructure/index.ts and infrastructure/rag/index.ts).
 *
 * A native segfault inside `@lancedb/lancedb` is therefore categorically
 * impossible on this call path today — it cannot be literally harnessed in a
 * test because the code that could crash no longer exists on this path.
 * Full verification trail: docs/agent-memory/decisions/sprint-<id>.md
 * [task_id: FIX-LANCEDB-INSERT-SEGFAULT].
 *
 * ── WHAT THIS TEST GUARDS INSTEAD ─────────────────────────────────────────
 * The SAME class of defect that made the historical native segfault fatal —
 * an UNCAUGHT throw during step-4's inserter *resolution* — was still live in
 * the current HTTP-based code. `insertBctcAnalysis()`'s default-inserter line
 *
 *   const inserter = insertAnalysisFn ?? (await getDefaultInsertAnalysis());
 *
 * sat OUTSIDE the try/catch that guards the actual `inserter(...)` call. If
 * resolving the default inserter throws for ANY reason — missing module,
 * syntax error, or (historically) a native-addon crash on import, which is
 * exactly the mechanism CI-RED-da847805-FIX fixed for `bun test` — that
 * throw propagated uncaught out of `insertBctcAnalysis()` AND out of
 * `fetchParseAndStoreBctc()` (Step 4 there is also unguarded), silently
 * breaking the file's own documented contract: "LanceDB failure is
 * non-fatal — the report is already persisted in SQLite by Step 3."
 *
 * ── WHY `insertAnalysisResolverFn` INSTEAD OF `mock.module` ────────────────
 * An earlier version of this test used `mock.module()` with a throwing
 * factory to simulate a module-load-time crash. That worked in isolation but
 * was FLAKY under the full suite: Bun's `mock.module()` synchronously
 * re-invokes ("hot-swaps") the factory immediately, at registration time,
 * whenever the target specifier was already cached by an earlier-run test
 * file (verified empirically) — and `ragHttpClient.js` is transitively
 * imported by dozens of other files (via analysis.ts and friends), so it is
 * essentially always already cached by the time this file runs in a full
 * suite. That made the simulated throw fire OUTSIDE the production call
 * chain (inside this test's own `mock.module()` statement), which no longer
 * exercises `getDefaultInsertAnalysis`/`insertBctcAnalysis` at all.
 * `insertAnalysisResolverFn` is a deterministic, order-independent injection
 * seam added to `insertBctcAnalysis.ts`/`fetchParseAndStoreBctc.ts` (both
 * files already document an "everything injectable" test philosophy) that
 * lets this test simulate the exact same resolution-failure class without
 * depending on module-cache state.
 */

Bun.env["DB_PATH"] = ":memory:";

import { describe, it, expect, afterEach, afterAll } from "bun:test";
import { initDatabase, getDb, closeDb } from "../infrastructure/db/schema.js";
import { fetchParseAndStoreBctc } from "../application/usecases/fetchParseAndStoreBctc.js";
import { insertBctcAnalysis } from "../application/usecases/bctc/insertBctcAnalysis.js";

import type { FinancialReport } from "../../bctc-schema.js";

// ─────────────────────────────────────────────────────────────────────────────
// Minimal BCTC text fixture — identical to 1181-financial-reports-persist.test.ts
// (guarantees parseBctcReport succeeds so the pipeline actually reaches Step 4).
// ─────────────────────────────────────────────────────────────────────────────

const MINIMAL_BCTC_FIXTURE = `
CÔNG TY CỔ PHẦN VNM
BÁO CÁO TÀI CHÍNH QUÝ 4/2025

BẢNG CÂN ĐỐI KẾ TOÁN
Tài sản ngắn hạn                                    1.234.567
Tổng tài sản                                       20.000.000

Nợ phải trả                                         8.000.000
Vốn chủ sở hữu                                     12.000.000
TỔNG CỘNG NGUỒN VỐN                                20.000.000

BÁO CÁO KẾT QUẢ HOẠT ĐỘNG KINH DOANH
Doanh thu thuần                                     5.000.000
Lợi nhuận gộp                                       2.000.000
Lợi nhuận sau thuế                                  1.200.000

BÁO CÁO LƯU CHUYỂN TIỀN TỆ
Lưu chuyển tiền thuần từ hoạt động kinh doanh       1.100.000
Tiền và tương đương tiền đầu kỳ                       500.000
Tiền và tương đương tiền cuối kỳ                    1.600.000
`;

const ORIGINAL_DB_PATH = Bun.env["DB_PATH"];

afterEach(() => {
  closeDb();
});

afterAll(() => {
  if (ORIGINAL_DB_PATH === undefined) {
    delete Bun.env["DB_PATH"];
  } else {
    Bun.env["DB_PATH"] = ORIGINAL_DB_PATH;
  }
});

/** Minimal well-formed FinancialReport fixture for the unit-level test. */
function minimalReportFixture(): FinancialReport {
  return {
    id: "test-report-id",
    action_code: "VNM",
    fiscal_period: { year: 2025, quarter: "Q4", sortKey: "2025Q4" },
    balance_sheet: {},
    income_statement: {},
    cash_flow: {},
    source: { sscUrl: "https://example.com/doc.pdf", extractionConfidence: 0.5 },
  } as unknown as FinancialReport;
}

describe("FIX-LANCEDB-INSERT-SEGFAULT — step-4 default-inserter resolution guard", () => {
  it("AC1/AC2 (unit): insertBctcAnalysis must not throw when the default-inserter resolver rejects", async () => {
    // Deterministic simulation of the module-load-time-crash defect class
    // (closest JS-harnessable analog to the historical `@lancedb/lancedb`
    // native segfault-on-import) — no module-mock timing dependency.
    const rejectingResolver = async (): Promise<never> => {
      throw new Error("simulated module-load crash (addr-0x20 native-segfault class)");
    };

    let thrown: unknown = null;
    try {
      await insertBctcAnalysis({
        report: minimalReportFixture(),
        doc: { url: "https://example.com/doc.pdf" },
        actionCode: "VNM",
        year: 2025,
        quarter: "Q4",
        // insertAnalysisFn intentionally OMITTED — forces the default path.
        insertAnalysisResolverFn: rejectingResolver,
        tag: "[test]",
      });
    } catch (err) {
      thrown = err;
    }

    // AC2: step-4 failure must stay non-fatal — insertBctcAnalysis itself
    // must never throw, regardless of why default-inserter resolution failed.
    expect(thrown).toBeNull();
  });

  it("AC1/AC2 (integration): fetchParseAndStoreBctc must not crash the pipeline when default-inserter resolution rejects", async () => {
    closeDb();
    Bun.env["DB_PATH"] = ":memory:";
    await initDatabase();

    const rejectingResolver = async (): Promise<never> => {
      throw new Error("simulated module-load crash (addr-0x20 native-segfault class)");
    };

    let thrown: unknown = null;
    let result: Awaited<ReturnType<typeof fetchParseAndStoreBctc>> | undefined;
    try {
      result = await fetchParseAndStoreBctc({
        actionCode: "VNM",
        year: 2025,
        quarter: "Q4",
        pdfUrl: "https://congbothongtin.ssc.gov.vn/bctc/VNM_2025_Q4.pdf",
        pdfTextOverride: MINIMAL_BCTC_FIXTURE,
        // insertAnalysisFn intentionally OMITTED — forces the default path
        // (getDefaultInsertAnalysis), the exact call site that sat outside
        // the try/catch guard.
        insertAnalysisResolverFn: rejectingResolver,
      });
    } catch (err) {
      thrown = err;
    }

    // AC2: step-4 failure must stay non-fatal — the pipeline must not throw,
    // and the already-parsed report must still come back to the caller.
    expect(thrown).toBeNull();
    expect(result).not.toBeNull();

    // AC2 continued: SQLite persistence (Step 3) must be unaffected by the
    // Step-4 guard-gap — the report row must exist regardless of what
    // happened to the LanceDB/rag-service insert attempt.
    const db = getDb();
    const row = db
      .query<{ cnt: number }, []>(
        "SELECT COUNT(*) as cnt FROM financial_reports WHERE action_code = 'VNM'",
      )
      .get();
    expect(row).not.toBeNull();
    expect(row!.cnt).toBe(1);
  });
});
