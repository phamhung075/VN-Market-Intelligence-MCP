# Architecture Blueprint — FIX-BCTC-NEWSCHAIN-FALLBACK-ZEROS-WRITE-TARGET

**Task:** FIX-BCTC-NEWSCHAIN-FALLBACK-ZEROS-WRITE-TARGET · HIGH · FIX (plan-only) · zone `apps/mcp-server`
**Architect date:** 2026-08-07
**Input:** `docs/handoffs/FIX-BCTC-NEWSCHAIN-FALLBACK-ZEROS-WRITE-TARGET-BA-spec.md` (product decision AC-1 already made by BA/PO — NOT re-litigated here)
**Verdict:** Blueprint complete, zero open design blockers. One follow-up flagged for PO (FR-7, non-blocking). **NEXT: dev-mcp-server** — single-zone, single-file-rewrite-plus-test-rewrite scope, small enough for one implementation pass (see § Sizing below).

---

## 0. Brownfield verification (every BA-named file re-read this cycle, byte-exact — not taken on faith)

All line citations in BA's spec were re-verified against live source. Deltas found: **none material.**

| File | Confirmed |
|---|---|
| `apps/mcp-server/src/application/usecases/bctc/newsChainFallback.ts` (592L) | `totalAssets: 0` hardcoded at **line 308** (BA cited 308 in §1, matches). Arm (b1) gate at **lines 265-280**. `INSERT INTO financial_reports` at **lines 401-507**, `ON CONFLICT DO UPDATE` immediately after. Signal query/hints/contradiction/confidence-calc logic: **lines 129-238**, confirmed self-contained and touchable-free of the write-target change. |
| `apps/mcp-server/src/domain/services/financial-reports/bctcIdentityGuard.ts` (105L) | `checkBctcIdentityGuard`: `total_assets == null` → fail OPEN (line 66-68); `total_assets <= 0` → hard corrupt (line 72-77). Pure domain fn, zero I/O — confirms nothing to change here. |
| `apps/mcp-server/src/interface/mcp/tools/financial-reports/bctcFullTools.ts` | Identity guard fires at **line 1071**, PUB-1..8 gate (`checkPublishability`) at **line 1264** — guard demonstrably fires BEFORE the publishability gate, confirming BA's "guard wins the race" claim. Honest-absence text `"Chưa có dữ liệu BCTC cho ${upperCode}. Kiểm tra bằng list_stored_pdfs."` at **line 1056**, fires when `!latestRow` (line 1020) — i.e. when **zero** rows exist for the ticker in `financial_reports`, regardless of extraction_method. `latestRow`'s query (`SELECT * FROM financial_reports WHERE action_code = $code ...`, lines 986-1017) has **no extraction_method filter** — confirms any row landing in `financial_reports` (including a would-be news_inference row) is unconditionally visible to this serve path. This is the load-bearing fact that makes FR-1/FR-2 (moving the write off this table) sufficient by itself for AC-4/verification-gate (a) — no code change needed in this file (FR-4 confirmed). |
| `apps/mcp-server/src/application/usecases/bctc/resolvePdfText.ts` (247L) | Fallback call site at **line 232** (`tryNewsChainFallback(actionCode, year, quarter)`), gated behind `enableBctcFallback` at **line 228**. Return contract `ResolvePdfTextOutcome` (lines 78-83) unchanged by this fix — confirms FR-3 is doc-comment-only. |
| `apps/mcp-server/src/application/usecases/fetchParseAndStoreBctc.ts` (126L) | Step 2 (`resolvePdfText`) returns `{status:"final", report}` on the fallback branch → orchestrator returns **immediately at lines 74-76**, before Step 4 (`insertBctcAnalysis`, line 121) is ever reached. **F-3 re-confirmed**: Step 4 is architecturally unreachable on the fallback branch today — a control-flow accident, not a guarantee, per BA. |
| `apps/mcp-server/src/application/usecases/bctc/insertBctcAnalysis.ts` (137L) | Sole caller of `buildAnalysisSummary()` (line 115), itself only reachable from `fetchParseAndStoreBctc.ts` Step 4. Confirms the RAG-leak surface is exactly this one call site. |
| `apps/mcp-server/src/interface/mcp/routes/bctcInspectHandler.ts` | `LIST_SQL` (lines 125-139) selects from `financial_reports` unconditionally (no extraction_method filter), comment at line 116-119 confirms this is deliberate ("news-inference reports (data quality signal)"). Confirms F-2: a real, currently-dormant (flag off) admin consumer. |
| `apps/mcp-server/bctc-schema.ts` (972L) | `SQLITE_DDL` (line 724+) is the **original** `financial_reports` DDL + indexes/views. No new-table additions here since ~Sprint 209 (see next row). |
| `apps/mcp-server/src/infrastructure/db/schema-financial-reports.ts` (1045L) | **The live convention for new BCTC tables since Sprint 209**: `initFinancialReportsTables()` accretes new `CREATE TABLE IF NOT EXISTS` blocks inline (10+ examples: `bctc_refined_units`, `bctc_health_state`, `bctc_table_rows`, `foreign_room_events`, …), never by editing `bctc-schema.ts`'s frozen `SQLITE_DDL` string. **Design decision: the new table's DDL goes here, not in `bctc-schema.ts`** (see §1). |
| `apps/mcp-server/src/domain/services/signalToBctcMapper.ts` | `extractBctcHints()` returns `{revenue_growth_hint, margin_trend, debt_ratio_pct, keywords_found, confidence}` — confirms the 3 hint-scalar field names/types feeding FR-2's rewrite. |
| 3 test files (`1294b-bctc-fallback.test.ts` 565L, `FIX-BCTC-NEWS-CHAIN-FALLBACK-ID-ORPHAN.test.ts` 169L, `FIX-BCTC-REPARSE-BATCH-CORRUPTION-NGAYNOP-FLIP.test.ts` 501L) | All 7 named tests' line numbers **byte-exact match** BA's citations (RED-1:45, RED-6:318, RED-7:399, RED-8:475; ID-ORPHAN case-1:93, case-2:149; AC-2:387, AC-1/F-1:428). Full content read — see §7 for exact rewrite plan per test. |
| `apps/mcp-server/src/__tests__/fix-bctc-identity-serve-guard.test.ts` (667L, not BA-named but load-bearing) | **Reusable test harness precedent** for the 2 new serving-plane tests (§6/§7 tasks 6-7): `callTool(server, toolName, args)` helper (lines 38-53) invokes `server._registeredTools[toolName].handler(args)` directly, bypassing SSE transport. Use this pattern verbatim rather than inventing a new one. |
| `apps/mcp-server/src/application/usecases/bctc/types.ts` (69L) | `FetchParseAndStoreBctcParams.insertAnalysisFn` is directly injectable — confirms FR-5's RAG-non-leak test can inject a spy and assert zero invocations, no new seam needed. |

**Containment re-confirmed (grep, this cycle):** `enableBctcFallback` — declared optional (`types.ts:68`), defaults `false` (`fetchParseAndStoreBctc.ts:50`), gated at `resolvePdfText.ts:228`. Zero non-test call sites pass `true` (checked `composition-root.ts`, `checkSscReports.ts`, `bctcReparseJob.ts`, `pushBctcExtraction.ts` — none set the flag). The fallback branch is production-unreachable today; this fix removes the defect before the flag is ever flipped, per the row's own containment clause.

---

## 1. EC-5 — live DB probe (mandatory, executed this cycle, not trusted from BA's historical citation)

Per Memory-as-Truth Prohibition and the row's own EC-5 instruction, probed the **running** `mcp-server` container's live `market.db` directly (not a stale note) — using a `bun:sqlite` **read-write** handle inside the container (the reliable method per `feedback_integrity_helper_readonly_wal_blinded` — a readonly handle risks being blind to uncommitted WAL state; a fresh read-write handle on the same file is the confirmed-correct probe):

```
docker exec vn-market-intelligence-mcp-mcp-server-1 bun run /tmp/probe2.ts
→ news_inference_count: {"cnt":0}
→ total_count:          {"cnt":257}
→ journal_mode:         {"journal_mode":"delete"}   (not WAL — no shm/wal blind-spot risk here anyway)
→ sample rows:          []
```

**Result: 0 rows** with `extraction_method='news_inference'` in the live `financial_reports` table today (2026-08-07/08). This freshly reconfirms BA's §1 F-2 claim (previously sourced from a historical QA note) at implementation-design time, as EC-5 requires. **No data migration is needed** — the DDL can be pure-additive with zero backfill concern. If a developer re-runs this probe at implementation time and finds it non-zero (e.g. the flag was flipped between now and then, in violation of the row's own containment clause), STOP and escalate to PO before proceeding — do not silently backfill or silently ignore.

---

## 2. Design decision — table placement

**`bctc_news_fallback_hints` DDL goes into `schema-financial-reports.ts`'s `initFinancialReportsTables()`**, as one more additive `CREATE TABLE IF NOT EXISTS` block (same pattern as `bctc_health_state`, `bctc_refined_units`, `foreign_room_events` — all added post-Sprint-209 the same way), **not** into `bctc-schema.ts`'s `SQLITE_DDL` string.

Reasoning: `bctc-schema.ts`'s `SQLITE_DDL` has not received a new table since Sprint 209 decomposition (confirmed via §0); it is effectively frozen as "the original financial_reports DDL." Every subsequent BCTC table addition — 10+ examples — landed in `schema-financial-reports.ts` instead. Following the established, live pattern is lower-risk than reopening a frozen string (which the file's own comment flags as covered by an "AR-schema-migration equivalence test" — safer not to touch it) and requires zero new import wiring (the new table can simply live next to its siblings inside the same `initFinancialReportsTables()` function, which mcp-server already calls on every startup via `initDatabase()`).

---

## 3. FR-1 — `bctc_news_fallback_hints` DDL

Add to `schema-financial-reports.ts`, inside `initFinancialReportsTables()`, placed near the other small BCTC-adjacent tables (e.g. right after the `bctc_health_state` block, §"BCTC Health State"):

```sql
-- ── FIX-BCTC-NEWSCHAIN-FALLBACK-ZEROS-WRITE-TARGET: news-fallback hints table ──
-- Non-authoritative persistence surface for tryNewsChainFallback()'s directional
-- hints (confidence/revenue-growth/margin-trend/debt-ratio). NEVER read by
-- bctcIdentityGuard or any of the 3 identity-guarded serve paths (get_bctc_full,
-- get_financial_summary, compare_financials) — those only ever query
-- financial_reports, and this path no longer writes there (see FR-2).
-- No balance sheet / income statement / cash flow columns — they never
-- belonged on any row this function writes (BA §2/FR-1).
-- UNIQUE(action_code, sort_key): ON CONFLICT DO UPDATE is for idempotent
-- re-run only (no duplicate hint rows on repeated fallback calls for the same
-- period) — NOT for id/orphan protection. The original
-- FIX-BCTC-NEWS-CHAIN-FALLBACK-ID-ORPHAN concern (PEK child-row FK survival
-- across re-runs) is structurally moot here: no other table references this
-- table's id (bctc_layout_units/bctc_page_zones are populated only by the
-- real PDF/OCR layout pipeline, which a news-inference row never has —
-- pdfPath is hardcoded null in the fallback report).
CREATE TABLE IF NOT EXISTS bctc_news_fallback_hints (
  id                      INTEGER PRIMARY KEY AUTOINCREMENT,
  action_code             TEXT    NOT NULL,
  period_year             INTEGER NOT NULL,
  period_quarter          INTEGER,           -- mirrors financial_reports semantics (NULL = annual; always set in practice here, buildFiscalPeriod only produces Q1-Q4)
  period_type             TEXT    NOT NULL,  -- Q1 | Q2 | Q3 | Q4
  sort_key                TEXT    NOT NULL,  -- "2024-Q1" — natural key half, mirrors financial_reports.sort_key
  confidence              REAL    NOT NULL,
  revenue_growth_qoq      REAL    DEFAULT 0.0,
  margin_trend            REAL    DEFAULT 0.0,
  debt_ratio_hint         REAL    DEFAULT 0.0,
  hints_count             INTEGER NOT NULL DEFAULT 0,
  extraction_source_note  TEXT,
  first_seen_at           TEXT    NOT NULL DEFAULT (datetime('now')),
  last_seen_at            TEXT    NOT NULL DEFAULT (datetime('now')),
  UNIQUE(action_code, sort_key)
);
CREATE INDEX IF NOT EXISTS idx_bnfh_action    ON bctc_news_fallback_hints(action_code);
CREATE INDEX IF NOT EXISTS idx_bnfh_sort_key  ON bctc_news_fallback_hints(action_code, sort_key);
```

Column provenance vs BA §2's named list (`confidence`, `revenue_growth_qoq`, `margin_trend`, `debt_ratio_hint`, `hints_count`, `extraction_source_note`, `first_seen_at`): **all 7 present, byte-matched names.** Two architect additions beyond BA's exact list, both minor and flagged here for visibility:
- `id`/`action_code`/`period_year`/`period_quarter`/`period_type`/`sort_key` — needed as the natural key + period identity; BA's list only named the hint *payload* columns, not the key columns (implicit necessity, not a scope addition).
- `last_seen_at` — mutable companion to `first_seen_at` (immutable), updated on every re-run via `ON CONFLICT DO UPDATE`. Not in BA's exact list; added for observability (lets a future FR-7 admin view show "hint staleness") and to make the F-1 rewritten test's "immutable on re-run" assertion meaningful (something else in the row *does* change across a re-run, so the `first_seen_at` immutability isn't vacuously true). Cheap, additive, zero risk — drop if PM/PO judges it unnecessary.

**Idempotency:** `CREATE TABLE IF NOT EXISTS` — safe on every server restart, matches every sibling table in this file. No `ALTER TABLE` migration needed (fresh table, not an existing-table column addition).

---

## 4. FR-2 — `newsChainFallback.ts` rewrite shape

### 4a. What stays byte-identical (per BA's explicit instruction)

- Lines 129-171: signal query (`SELECT finding_data, created_at FROM agent_signals ...`) + minimum-signal-count checks.
- Lines 173-208: hint extraction (`extractBctcHints`) + contradiction check.
- Lines 210-236: average confidence/revenue/margin + temporal discount calc (including the JANITOR-035-flagged hardcoded 2023/2024 special case — explicitly out of scope, do not touch).
- The `fallbackReport` in-memory object's **shape and field values** (lines 282-387) — kept as-is. This is the function's **return contract**, consumed by `resolvePdfText.ts` (`fallbackResult.fallback && fallbackResult.report`) and, transitively, by `fetchParseAndStoreBctc.ts`'s own return type promise `(FinancialReport & {...}) | null`. BA's FR-3 explicitly says "no functional change required" on the downstream caller side — changing this shape would ripple into 3+ caller files' type contracts for zero benefit (nothing downstream persists or joins against this in-memory object once the DB write moves off `financial_reports`). **Only the persistence target changes, not the return contract.**

### 4b. What changes

**Arm (b1) read** (currently lines 250-253) — narrow the SELECT, drop `id` (no longer needed — see 4c):

```ts
// BEFORE:
const existingReportRow = db
  .prepare("SELECT id, total_assets FROM financial_reports WHERE action_code = ? AND sort_key = ?")
  .get(actionCode, period.sortKey) as { id: string; total_assets: number | null } | null;
const reportId = existingReportRow?.id ?? randomUUID();

// AFTER:
const existingReportRow = db
  .prepare("SELECT total_assets FROM financial_reports WHERE action_code = ? AND sort_key = ?")
  .get(actionCode, period.sortKey) as { total_assets: number | null } | null;
```

**Arm (b1) gate block** (currently lines 265-280) — **keep the early-return structurally in the same position** (before any write). Reword the block comment/message: its purpose has shifted from "prevent a destructive overwrite of `financial_reports`" (now structurally impossible regardless, since this function never writes there anymore) to "avoid recording a low-confidence hint for a period already covered by a good real report" (BA's own FR-2 wording). This single early-return, unchanged in position, is sufficient to satisfy BA's task 3 ("confirm arm (b1) suppresses the new hints-table write too") — **no additional gate logic needed**, just correct placement relative to the (moved) INSERT:

```ts
// Reworded block comment — same condition, same early-return, new purpose:
// Arm (b1): when a good real report already exists for this period, do NOT
// record a fallback hint either — there is no reason to hint at a period
// financial_reports already covers with real data (BA FR-2, generalizes the
// original AC-5 non-regression to the new write target). This function no
// longer writes to financial_reports at all (see below), so this guard's
// job is purely "skip the hints-table write", not "prevent an overwrite".
if (
  existingReportRow &&
  existingReportRow.total_assets != null &&
  existingReportRow.total_assets > 0
) {
  const blockMsg =
    `[BCTC] News-chain fallback hint SKIPPED for ${actionCode} ${period.sortKey}: ` +
    `a previously-good stored report already exists (total_assets=${existingReportRow.total_assets}). ` +
    `No hint recorded — real data already covers this period.`;
  logger.warn(blockMsg);
  return {
    fallback: false,
    reason: `existing good row (total_assets=${existingReportRow.total_assets}) — no hint recorded`,
  };
}
```

**`fallbackReport.id`** (currently `reportId` reused from an existing `financial_reports` row when present) — simplify to an unconditional fresh id, since FR-1 makes the id-reuse machinery dead code once nothing persists or joins against it:

```ts
id: randomUUID(),   // was: reportId (existingReportRow?.id ?? randomUUID()) — the reuse-existing-id
                     // dance existed ONLY to protect PEK child-row FKs across re-runs (ID-ORPHAN
                     // fix); FR-1 makes that concern structurally moot for this write path (no
                     // other table references bctc_news_fallback_hints.id). Returned id is now
                     // purely informational (control-flow return value), never persisted/joined.
```

**Replace the entire `INSERT INTO financial_reports ...` block (lines 401-507) + its `stmt.run({...})` bind block (lines 509-575)** with:

```ts
const hintsStmt = db.prepare(`
  INSERT INTO bctc_news_fallback_hints (
    action_code, period_year, period_quarter, period_type, sort_key,
    confidence, revenue_growth_qoq, margin_trend, debt_ratio_hint,
    hints_count, extraction_source_note, first_seen_at, last_seen_at
  ) VALUES (
    $actionCode, $periodYear, $periodQuarter, $periodType, $sortKey,
    $confidence, $revenueGrowthQoq, $marginTrend, $debtRatioHint,
    $hintsCount, $extractionSourceNote, $now, $now
  )
  ON CONFLICT(action_code, sort_key) DO UPDATE SET
    confidence             = excluded.confidence,
    revenue_growth_qoq      = excluded.revenue_growth_qoq,
    margin_trend             = excluded.margin_trend,
    debt_ratio_hint          = excluded.debt_ratio_hint,
    hints_count              = excluded.hints_count,
    extraction_source_note   = excluded.extraction_source_note,
    last_seen_at             = excluded.last_seen_at
  -- first_seen_at deliberately NOT in this SET clause — immutable across
  -- re-runs, same immutability pattern as financial_reports.published_at
  -- (FIX-BCTC-REPARSE-BATCH-CORRUPTION-NGAYNOP-FLIP).
`);

const nowIso = new Date().toISOString();
hintsStmt.run({
  $actionCode: actionCode,
  $periodYear: period.year,
  $periodQuarter: period.quarter,
  $periodType: period.periodType,
  $sortKey: period.sortKey,
  $confidence: finalConfidence,
  $revenueGrowthQoq: avgRevenue,
  $marginTrend: avgMargin,
  $debtRatioHint: hints.length > 0 && hints[0] && hints[0].debt_ratio_pct !== null ? hints[0].debt_ratio_pct : 0.0,
  $hintsCount: hints.length,
  $extractionSourceNote: `Fallback: PDF extraction timeout. Populated from ${hints.length} chain signals (signal age: <${maxAgeDays}d). Confidence: ${finalConfidence.toFixed(2)}`,
  $now: nowIso,
});

logger.info(`${tag} fallback hints recorded (bctc_news_fallback_hints, NOT financial_reports)`);
return {
  fallback: true,
  report: fallbackReport,   // unchanged return contract — see 4a
};
```

Note the `$debtRatioHint`/`$extractionSourceNote` expressions are **copy-pasted verbatim** from the original `stmt.run()` block (lines 574, 571) — same values, same semantics, just bound to the new statement.

### 4c. Net effect on the file

- `fallbackReport` object construction (the in-memory return value): **unchanged**.
- The huge `INSERT INTO financial_reports` + 105-line `ON CONFLICT DO UPDATE SET` block: **deleted** (~180 lines removed).
- New `bctc_news_fallback_hints` insert: **~25 lines added**.
- Net: file shrinks by roughly 150 lines. Dead-code removal (id-reuse dance) is intentional per project standing rule ("detect then reduce debt, dead code").
- Import surface: unchanged — still just `randomUUID`, `logger`, `extractBctcHints`, `getDb`.

---

## 5. Task 4 / FR-5 — RAG-non-leak regression test

Add to `1294b-bctc-fallback.test.ts` (co-located — file already has the `beforeAll`/`afterAll` in-memory DB harness and directly calls `fetchParseAndStoreBctc`):

```ts
test('FR-5: fallback branch never invokes insertAnalysisFn (RAG-non-leak, AC-6)', async () => {
  // Seed 2 confirming signals (reuse the RED-1 pattern), then...
  let insertAnalysisCalled = false;
  const result = await fetchParseAndStoreBctc({
    actionCode: 'RAGCHK',
    year: 2024,
    quarter: 'Q1',
    enableBctcFallback: true,
    pdfUrl: 'https://example.com/ragchk.pdf',
    pdfHttpClient: { get: async () => { const e = new Error('timeout'); (e as any).name = 'TimeoutError'; throw e; } } as any,
    insertAnalysisFn: async () => { insertAnalysisCalled = true; },
  });
  expect(result?.fallback).toBe(true);
  expect(insertAnalysisCalled).toBe(false);   // Step 4 must never fire on the fallback branch
});
```

This converts F-3's control-flow accident into an explicit, permanent regression guarantee (FR-5), independent of and in addition to the structural fact (Step 4 unreachable) already confirmed in §0.

---

## 6. §7 — 7-test rewrite plan (exact per-test disposition)

| # | Test | File:line (re-verified) | Rewrite |
|---|---|---|---|
| 1 | RED-1 (VCB) | `1294b-bctc-fallback.test.ts:45` | Replace lines 117-129 (the `financial_reports` row assertions) with: `SELECT COUNT(*) FROM financial_reports WHERE action_code=? AND sort_key=?` → expect `0`; `SELECT confidence, extraction_source_note FROM bctc_news_fallback_hints WHERE action_code=? AND sort_key=?` → expect a row, `confidence` in `[0.45, 0.65]` (line 114-115's existing bound, unchanged — that assertion is on `result?.confidence`, the in-memory return value, and stays as-is), `extraction_source_note` contains `"chain signals"` and `"PDF"`. |
| 2 | RED-6 (VIC) | `1294b-bctc-fallback.test.ts:318` | Replace the `SELECT revenue_growth_qoq, margin_trend, debt_ratio_hint, extraction_source_note FROM financial_reports` (lines 384-389) with the same column list against `bctc_news_fallback_hints`. Assertions (391-396) unchanged — `debt_ratio_hint` still `toBeCloseTo(45, 0)`. Add one new assertion: `financial_reports` row count for this (action_code, sort_key) is `0`. |
| 3 | RED-7 (BSR) | `1294b-bctc-fallback.test.ts:399` | Replace `SELECT extraction_confidence FROM financial_reports` (465-470) with `SELECT confidence FROM bctc_news_fallback_hints`. Assertion (472) unchanged: `< 0.55`. |
| 4 | RED-8-first-call (VJC) | `1294b-bctc-fallback.test.ts:475` | First-call block (539-545): replace `financial_reports` row-existence check with a `bctc_news_fallback_hints` row-existence check (`extraction_source_note` non-null suffices as the "fallback ran" signal — this table has no `extraction_method` column, so drop that specific assertion). Second-call block (547-563): **unchanged** — `pdfTextOverride` bypasses the fallback path entirely and goes through the normal `storeReport()` path (a plain first INSERT into `financial_reports`, not a "transition" — nothing existed there before), which is out of this row's scope. Add one assertion: after the second call, `bctc_news_fallback_hints` still holds its earlier row (harmless history, no cross-table cleanup required — matches BA's explicit non-requirement). |
| 5 | ID-ORPHAN case 1 | `FIX-BCTC-NEWS-CHAIN-FALLBACK-ID-ORPHAN.test.ts:93` | Whole-test rewrite. Drop the `bctc_layout_units` child-FK-survival simulation (lines 110-120, 142-146) entirely — structurally moot per FR-1 (nothing FKs to `bctc_news_fallback_hints.id`). Replace the "id survives re-run" assertions (100-101, 108, 125-134) with: run `tryNewsChainFallback` twice for the same `(action_code, sort_key)`; assert `SELECT COUNT(*) FROM bctc_news_fallback_hints WHERE action_code=? AND sort_key=?` is exactly `1` after both runs (idempotent upsert, no duplicate); assert `first_seen_at` is identical across both runs (immutability, mirrors the F-1/AC-1 rewrite below) while `last_seen_at` may differ. Add an in-test comment stating explicitly *why* the original PEK-FK concern no longer applies (per BA's instruction). |
| 6 | ID-ORPHAN case 2 | `FIX-BCTC-NEWS-CHAIN-FALLBACK-ID-ORPHAN.test.ts:149` | Reassert the no-cross-period-bleed property on the new table: Q1 and Q2 fallback runs for the same `action_code` produce 2 distinct `bctc_news_fallback_hints` rows (`sort_key` differs), and `SELECT COUNT(*) FROM financial_reports WHERE action_code=?` is `0` for both. Drop the `.id` equality/inequality assertions (166-167) — no longer meaningful once `id` is an unconditional fresh `randomUUID()` per §4b; replace with a `sort_key` distinctness assertion instead. |
| 7 | **F-1 (7th, not in the board row's original list)** — "AC-1/normal path" | `FIX-BCTC-REPARSE-BATCH-CORRUPTION-NGAYNOP-FLIP.test.ts:428` | Rewrite lines 485-499: first call — assert `readRow(...)` (the existing `financial_reports` helper, lines 179-185) returns **`null`** (no row created) instead of `row1.total_assets === 0`; assert a `bctc_news_fallback_hints` row exists with `first_seen_at` set. Second call (re-run) — assert `financial_reports` still has no row; assert the hints-row's `first_seen_at` is **unchanged** from the first call (immutability — same intent as the original `published_at` immutability check, transposed to the new table's own immutable column). Keep the sibling `"AC-2: fallback write is BLOCKED..."` test (line 387) **byte-unchanged** except for the serving-plane extension in §7 task below (BA explicit instruction — arm (b1), AC-5). |

**Shared new test helper needed** (add near the top of both `1294b-bctc-fallback.test.ts` and the two `FIX-BCTC-*` files, or factor into one shared spot if the developer prefers — architect's call, not mandatory): a `readHintRow(actionCode, sortKey)` helper mirroring the existing `readRow()` pattern in `FIX-BCTC-REPARSE-BATCH-CORRUPTION-NGAYNOP-FLIP.test.ts:179-185`, querying `bctc_news_fallback_hints` instead. Trivial, ~6 lines, no new dependency.

---

## 7. Tasks 6 & 7 — 2 new serving-plane regression tests

**Reuse the exact `callTool` harness from `fix-bctc-identity-serve-guard.test.ts:38-53`** (`server._registeredTools[toolName].handler(args)`, bypasses SSE transport) — do not invent a new harness.

**Task 6 — honest-absence for a first-ever-fallback ticker (verification gate (a)):**

```ts
it('AC-4/verification-gate(a): fallback hint recorded, get_bctc_full still serves honest absence, never CORRUPT', async () => {
  // Seed 2 confirming signals, invoke tryNewsChainFallback (or fetchParseAndStoreBctc
  // with a timeout mock) for a fresh ticker with NO prior financial_reports row.
  const result = await tryNewsChainFallback('SERVEHINT', 2024, 'Q1');
  expect(result.fallback).toBe(true);

  const db = getDb();
  const frCount = db.prepare(`SELECT COUNT(*) c FROM financial_reports WHERE action_code=? AND sort_key=?`).get('SERVEHINT', '2024-Q1') as { c: number };
  expect(frCount.c).toBe(0);
  const hintRow = db.prepare(`SELECT confidence FROM bctc_news_fallback_hints WHERE action_code=? AND sort_key=?`).get('SERVEHINT', '2024-Q1');
  expect(hintRow).not.toBeNull();

  // Serving-plane proof, not DB-plane-only (verification gate (a)'s explicit requirement):
  const server = new McpServer({ name: 't', version: '0.0.1' }, { capabilities: { tools: {} } });
  registerBctcFullTools(server);
  const res = await callTool(server, 'get_bctc_full', { code: 'SERVEHINT', year: 2024, quarter: 'Q1' });
  const text = res.content[0]!.text;
  expect(text).toContain('Chưa có dữ liệu BCTC');   // stable substring, EC-2
  expect(text).not.toContain('[CORRUPT DATA');       // never the corrupt-data marker
});
```

**Task 7 — extend the existing AC-2 test (arm b1 regression, serving-plane) — `FIX-BCTC-REPARSE-BATCH-CORRUPTION-NGAYNOP-FLIP.test.ts:387`:**

**Implementation gotcha to flag explicitly** (found this cycle, would otherwise cost a developer a debugging cycle): the AC-2 test's existing seed INSERT (lines 393-409) does **not** set `refine_status`, so it defaults to `'PENDING'` (schema default, `schema-financial-reports.ts:57`). `get_bctc_full`'s PUB-1 gate (`bctcFullTools.ts:623`) requires `refine_status IN ('DONE','PARTIAL')` — a `get_bctc_full` call against this fixture as-is will hit the PUB-1 "no data" refusal, **not** prove arm (b1) non-regression on the serving plane (it would pass for the wrong reason). The extension must also insert `refine_status='PARTIAL'` (or `'DONE'`) into the seed row, AND insert at least one `bctc_table_rows` row (PUB-2/PUB-3 gates) — mirror `fix-bctc-identity-serve-guard.test.ts`'s `insertBalanceSheetRow()` helper (lines 182-190) or import/reuse it directly:

```ts
// Add to the existing seed INSERT: refine_status: 'PARTIAL'
// Add after the seed INSERT: one bctc_table_rows row (mirrors insertBalanceSheetRow)
db.prepare(`INSERT INTO bctc_table_rows (report_id, page_number, statement_section, row_order, code, label, period_current, value_current, is_summary_row) VALUES (?, 1, 'balance_sheet', 1, '270', 'Total Assets', '2026-Q1', 80000000, 0)`).run(goodId);

// ...existing tryNewsChainFallback() call + existing DB-plane assertions unchanged...

// NEW: serving-plane proof
const server = new McpServer({ name: 't2', version: '0.0.1' }, { capabilities: { tools: {} } });
registerBctcFullTools(server);
const res = await callTool(server, 'get_bctc_full', { code: ACTION_CODE, year: YEAR, quarter: QUARTER });
const text = res.content[0]!.text;
expect(text).not.toContain('[CORRUPT DATA');
expect(text).toContain('BCTC SUMMARY');   // happy-path marker, confirms real data served
```

---

## 8. Task 8 — grep-verify (process step, run post-implementation)

```bash
grep -n "INSERT INTO financial_reports\|ON CONFLICT" apps/mcp-server/src/application/usecases/bctc/newsChainFallback.ts
# Expected: ZERO matches. If any remain, the rewrite is incomplete.
```

## 9. Task 9 — RED-before via git-stash A/B

```bash
git stash push -- apps/mcp-server/src/infrastructure/db/schema-financial-reports.ts \
                  apps/mcp-server/src/application/usecases/bctc/newsChainFallback.ts
# Rewritten TEST files stay UNSTASHED (working tree) — this is the "keep the tests, stash the
# implementation" technique dev-mcp-server already used on the parent row's arm (b2).
bun test apps/mcp-server/src/__tests__/1294b-bctc-fallback.test.ts \
         apps/mcp-server/src/__tests__/FIX-BCTC-NEWS-CHAIN-FALLBACK-ID-ORPHAN.test.ts \
         apps/mcp-server/src/__tests__/FIX-BCTC-REPARSE-BATCH-CORRUPTION-NGAYNOP-FLIP.test.ts
# Expected: RED (old implementation + new assertions = failures) — proves the rewritten
# tests actually exercise the changed behavior, not accidentally still-green.
git stash pop
# Re-run the same 3 files — expected: GREEN.
```

## 10. Task 10 — full suite

Run the full `bun test` suite post-implementation; attribute every failure to its actual file, never name-grep. `1405b-bctc-vps-fixes.test.ts` is a documented decoy (unrelated `logVpsPush` test-order flake, per the row's own `verification_gate` (e)) — do not treat its failure as caused by this change without checking the actual failing assertion.

---

## 11. FR-7 — admin-inspector companion (flagged, NOT this row's scope)

BA's Finding F-2 identified `bctcInspectHandler.ts`'s `LIST_SQL` as a real (currently dormant, flag-off) consumer of `financial_reports` news-inference rows for admin "data quality gap" visibility. This fix silently removes that visibility (0 live rows today, per §1's EC-5 probe, so **zero current regression** — but the capability disappears once the flag is ever flipped on). **Open question for PO/PM**: mint a follow-up row extending `LIST_SQL` (or a secondary panel) to also surface `bctc_news_fallback_hints` rows, preserving the original "data quality gap" intent. Not folded into this row per BA's explicit non-blocking framing — do not implement as part of this task.

---

## 12. Files to create / modify

| File | DDD layer | Change |
|---|---|---|
| `apps/mcp-server/src/infrastructure/db/schema-financial-reports.ts` | infrastructure | ADD: `bctc_news_fallback_hints` DDL block (§3) inside `initFinancialReportsTables()`. |
| `apps/mcp-server/src/application/usecases/bctc/newsChainFallback.ts` | application | MODIFY: narrow arm(b1) SELECT, reword gate-block message, drop id-reuse dance, replace `financial_reports` INSERT with `bctc_news_fallback_hints` upsert (§4). Net ~150L smaller. |
| `apps/mcp-server/src/application/usecases/bctc/resolvePdfText.ts` | application | OPTIONAL (should-do, FR-3): doc-comment update on `ResolvePdfTextOutcome`/`report` — no functional change. |
| `apps/mcp-server/src/__tests__/1294b-bctc-fallback.test.ts` | test | MODIFY: RED-1/6/7/8 rewrites (§6) + NEW FR-5 RAG-non-leak test (§5) + NEW task-6 serving-plane test (§7). |
| `apps/mcp-server/src/__tests__/FIX-BCTC-NEWS-CHAIN-FALLBACK-ID-ORPHAN.test.ts` | test | REWRITE both cases (§6, table 5-6). |
| `apps/mcp-server/src/__tests__/FIX-BCTC-REPARSE-BATCH-CORRUPTION-NGAYNOP-FLIP.test.ts` | test | REWRITE the F-1 7th test (§6 table row 7) + EXTEND the AC-2 test with the serving-plane assertion (§7 task 7), preserving its existing DB-plane assertions byte-unchanged. |

No changes anywhere else — `bctcFullTools.ts`, `reports.ts`, `bctcIdentityGuard.ts`, `fetchParseAndStoreBctc.ts` all confirmed zero-diff (FR-4).

---

## 13. Risk flags

- **DDD**: clean — new table is infrastructure-only, write-target swap is application-layer, zero interface-layer changes. No violation.
- **Security**: none — no new external input surface, no new I/O beyond an additional local SQLite table.
- **Perf**: negligible — `bctc_news_fallback_hints` is a low-cardinality side table (bounded by ticker × period combinations that hit the fallback path, itself gated by `enableBctcFallback=false` in production today).
- **Blast radius**: contained to the fallback-only code path (production-unreachable while the flag stays false, per §0's re-confirmed containment). The only observable production-facing change today is `bctcInspectHandler.ts` losing a currently-empty (0 rows) visibility capability — see §11.
- **Test-rewrite risk**: the 7-test rewrite is the largest surface. Follow §9's RED-before discipline strictly — a rewritten assertion that is GREEN against the OLD (unfixed) implementation is a false-confidence bug, not a passing test.
- **PUB-1/PUB-2/PUB-3 gotcha** (§7 task 7): flagged explicitly to prevent a silent false-positive test (passing for the wrong reason — PUB-1 refusal instead of proving arm(b1) non-regression).

---

## 14. BUILD-STANDARD classification

**BUG-FIX / REFACTOR (in-zone, no new primitives) → BUILD-STANDARD: not-applicable.** Single existing zone (`apps/mcp-server`), one new additive table following an established live pattern (not a new service, not a new microservice-level primitive), one existing use-case's write target swapped. No `dev-<svc>` relay or pilot-status SSOT required.

---

## 15. Sizing — why this routes directly to dev-mcp-server, not through PM

- Single zone, no multi-zone split needed.
- BA's own §6 header states the task breakdown is written "for architect → developer" — a direct handoff, not a PM-decomposition signal.
- Total surface: 1 new DDL block (~25L), 1 file rewrite (~150L net reduction), 2 new tests (~40L), 7 test rewrites (mechanical, same shape repeated 7 times — table/column substitution, not novel logic each time).
- Directly comparable in size/shape to the sibling `storeReport()` arm-(b2) fix, which `dev-mcp-server` already completed in a single pass (see the row's own `prior_attempt_reverted` note — same class of change, smaller net diff here since this rewrite *removes* code rather than adding a guard).

`next_agent` set to `dev-mcp-server` (zone specialist for `apps/mcp-server`, per `system-map.json`).

---

## RETURN
DONE: Technical blueprint complete — DDL (§3), `newsChainFallback.ts` rewrite shape (§4), RAG-non-leak test (§5), 7-test rewrite plan (§6), 2 new serving-plane tests (§7), grep-verify/RED-before/full-suite process steps (§8-10), FR-7 flagged non-blocking for PO (§11), files-to-modify (§12), risk flags (§13). EC-5 live-probed this cycle: 0 `news_inference` rows in production `market.db` — zero migration needed. All BA-named files brownfield-verified byte-exact this cycle (§0), one implementation gotcha found and documented (§7 task 7 PUB-1/2/3 gate).
ZONE: apps/mcp-server/
NEXT: dev-mcp-server — implement per §3-§10, RED-before mandatory (§9), full suite before DONE (§10).
HANDOFF: docs/architecture-briefs/2026-08-07-fix-bctc-newschain-fallback-zeros-write-target-blueprint.md
PIPELINE: continue
