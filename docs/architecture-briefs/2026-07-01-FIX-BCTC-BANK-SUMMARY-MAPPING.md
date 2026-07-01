<!-- size-justification: 3rd re-fire recurrence-escalation SPIKE brief — must carry live evidence (docker exec query outputs) inline for RAW-verify by downstream pm/dev/qa without re-running the probe; splitting would break the single-reader audit trail this brief exists to provide. -->
# Architecture Brief — FIX-BCTC-BANK-SUMMARY-MAPPING (AC-1 root-cause SPIKE)

**Task:** ARCH-FIX-BCTC-BANK-SUMMARY-MAPPING | **Sprint:** FIX-BCTC-BANK-SUMMARY-MAPPING | **Date:** 2026-07-01
**Mandate:** BA spec `docs/handoffs/BA-FIX-BCTC-BANK-SUMMARY-MAPPING.md` §7 AC-1 — live-gateway SPIKE, NO code patch, reconcile §3.2 + §3.3, pin owning zone(s), produce SPLIT for pm.
**Method note:** the `mcp__gateway__call_tool` wrapper was not reachable from this session (tool not present in the invoked toolset). Substituted equivalent LIVE evidence: `docker exec vn-market-intelligence-mcp-mcp-server-1 bun <probe>.ts` reading `/app/data/market.db` directly — the SAME named-volume mount (`vn-market-intelligence-mcp_market_data → /app/data`) the gateway tools themselves read at runtime, cross-referenced against the exact serve-path source code (`get_bctc_full`, `get_financial_summary`, `compare_financials`) so the reproduced values are provably identical to what those tools would return. This is a stronger RAW-verify than a black-box tool call because both the data AND the code path are directly inspected.

---

## 1. Live evidence — `financial_reports` scalars (2026Q1, all 4 tickers)

```
CTG total_assets=0 total_liabilities=24,735,484,770 equity_total=244,904,306 net_revenue=3,910
    ebitda=362,940,957,001,815 net_margin_pct=229,157.06% confidence=0.5625 validation_status=low_confidence refine_status=PARTIAL
VCB total_assets=2,550,963,342 total_liabilities=2,316,932,013 equity_total=224,558,726 net_revenue=17,420,998
    ebitda=14,771,252 net_margin_pct=54.31% confidence=0.75 validation_status=passed refine_status=PARTIAL
FPT total_assets=68,586,094.79 total_liabilities=28,464,058.21 equity_total=40,122,036.57 net_revenue=12,479,997.21
    net_margin_pct=19.85% confidence=0.8125 validation_status=failed (pre-existing, identity actually HOLDS: 68.59M≈28.46M+40.12M) refine_status=DONE
VNM total_assets=0 total_liabilities=18,740,931.85 equity_total=36,688,079.28 net_revenue=1
    net_margin_pct=5,100% confidence=0.625 validation_status=low_confidence refine_status=PENDING (0-row raw extraction — scope_out per §3.4/§6)
```

Reconfirms BA §3.1/§3.4 exactly, live, same DB. `domain` column still `"other"` for all 4 (BANK-DEV-1 unresolved, non-blocking — `isBankFormFromRows` remains the correct discriminator).

---

## 2. §3.2 reconciled — REVISED verdict, not a simple confirm

BA framed §3.2 as "CTG's raw extraction corrupts, VCB's is clean" (20/55 null-code vs 0/57). That count is correct but **incomplete** — it hid a defect VCB shares with CTG. Extending the probe (full row dump + label search for "tổng tài sản" / "tài sản" across all rows) found:

| | CTG (`report_id=96e36139…`) | VCB (`report_id=31f2a9a9…`) | FPT (`report_id=e8ea3df5…`, corporate) |
|---|---|---|---|
| rows total | 55 | 57 | 145 |
| `code IS NULL` rows | 20/55 (36%) | 0/57 | 0/145 |
| **"Tổng tài sản" (grand-total assets) row present at all** | **ABSENT — 0 rows match** | **ABSENT — 0 rows match** | Present, clean: `code="280"`, `label="TỔNG CỘNG TÀI SẢN (280 = 100 + 200)"`, `value_current=68,586,094,785,217` |
| section-boundary contamination | Yes — income-statement rows (`row_order 169/170/176`) tagged `statement_section="balance_sheet"` | not probed (BA's kin finding `FM-VCB-1` already documents this class on VCB elsewhere) | n/a |
| `code` collisions | Yes — `code="21"` × 4 distinct labels, `code="13"` × 2 distinct labels | not probed | n/a |

**New finding: the bank-form grand-total "Tổng tài sản" row is missing from `bctc_table_rows` for BOTH CTG and VCB — not a CTG-only defect.** VCB's `total_assets=2,550,963,342` currently served is **not sourced from `bctc_table_rows` at all**. Traced the code path:

- `apps/mcp-server/src/domain/services/financial-reports/bctcScalarAggregator.ts` (`aggregateScalars`, the row→scalar mapper named in the sprint as the suspect) resolves `total_assets` via `findTotalAssetsCorporate` (codes 280/440, corporate-only) then `findByLabelExcluding(rows,"balance_sheet",P_BANK_TOTAL_ASSETS,…)` (bank label fallback). Given the row is absent for both tickers, **both paths return `null` for CTG and VCB alike** — confirmed by re-reading the function against the live row dump.
- `apps/mcp-server/src/interface/mcp/tools/financial-reports/finalizeBctcRefineTool.ts` lines 460-509: **documented, intentional** "Case 2" logic — `aggregator returned null AND column not in notApplicable → SKIP the UPDATE, preserve prior value` (FU-5 design intent, in-code comment: *"Preserving stale/null scalars is safer than writing known-wrong numbers"*). So `total_assets` was never touched by the row-based refine pass for either ticker — it is whatever the **very first INSERT** wrote.
- That first INSERT comes from `apps/mcp-server/src/application/usecases/parseBctcReport.ts:417` → `extractBalanceSheet(rawText)` in `apps/mcp-server/src/domain/services/financial-reports/balanceSheetExtractor.ts` — a **flat raw-PDF-text regex extractor that is corporate-VAS-code-oriented with zero bank-form branching** (label pattern `P_TOTAL_ASSETS = /tổng (cộng )?tài sản/i` run directly against PDF text lines, code fallback tries only `"270"`/`"440"`, identity-derive fallback (paths A/B, lines 812-982) requires `totalLiabilities>0 && equity.total>0` sourced from *other* corporate-only label/code patterns). `isBank` at line 501 of `parseBctcReport.ts` is a **hardcoded `BANKING_TICKERS.has(actionCode)` ticker allowlist** — used only to bias a validator margin-proxy, it does **not** route to any bank-aware extraction logic. `extractBalanceSheet` runs identically for banks and corporates.
- Net effect: for CTG, `extractBalanceSheet`'s label/code total-assets match failed on CTG's PDF text AND its identity-fallback guard blocked (CTG's loosely-matched `totalLiabilities=24.7B` vs `equity=244.9M` is a 100× ratio, over the fallback's own `<20×` plausibility guard at `balanceSheetExtractor.ts:946`) → `totalAssets=0` frozen forever by Case-2. For VCB, the same corporate-only regex **happened to match** VCB's specific PDF text layout → a real number, also now frozen by Case-2, but by luck, not by a working bank-aware mechanism.

**Conclusion on §3.2:** the sprint's original premise ("raw extraction already correct for banks", scope_out'd re-fixing it) is **wrong on two counts**, not one: (1) CTG has acute row-level corruption (BA's finding, confirmed live); (2) **the specific field that actually drives the defect — "Tổng tài sản" — is structurally absent from `bctc_table_rows` for banks generically, VCB included.** `bctcScalarAggregator.ts`'s bank mapping logic (FR-2's target) is **not proven broken** — it has simply never been exercised against real bank total-assets row data, because that data has never existed downstream of the row-table pipeline for any bank ticker sampled.

### Where does the row corruption actually originate? (extends §3.2, changes the zone pin)

Checked whether CTG/VCB's 55/57 `bctc_table_rows` arrived via `apps/pdf-extractor`'s markdown-table push (`pushBctcMdTablesHandler.ts`, docstring: *"receives generic markdown tables from pdf-extractor"* → writes `bctc_md_tables`) or via the in-repo **agentic-refine pipeline** (`apps/mcp-server/src/scheduler/financial-reports/bctcRefineJob.ts`, "AR-MCP-OPTY" — a fleet-cron-spawned Claude subagent transcribes PDF page-image windows into markdown, pushed via `push_bctc_refined_unit`, parsed by `apps/mcp-server/src/application/utils/refinedMarkdownParser.ts`'s `parseRefinedMarkdown`).

```
SELECT * FROM bctc_md_tables WHERE report_id IN (CTG's 96e36139…, VCB's 31f2a9a9…) → NULL for both.
```

`bctc_md_tables` — the actual `apps/pdf-extractor` ingestion bridge table — is **empty for both current reports**. `bctc_table_rows.page_number` values (CTG: 1,4,5,6,7; VCB: 5,6,7,8) match the agentic-refine job's windowed page-partitioning (`REFINE_MAX_WINDOW_PAGES=3` default), not a single-shot pdf-extractor push. `source_confidence` is uniformly `1.0` on every row including corrupted ones (the trust-flag mechanism did not catch the corruption — a secondary integrity gap, note but not gate).

`parseRefinedMarkdown` (`refinedMarkdownParser.ts:299-323`) exactly reproduces the observed corruption shape: a 2-cell markdown row `| <label+numbers merged> | <blank/dash> |` yields `code=null`, `label=<merged text>`, `value_current=null` — **with no error logged** (dash/blank cells are legitimate). This is proven **not** a parser-logic bug: the same `parseRefinedMarkdown` function produced 0/57 null-code rows for VCB and 0/145 for FPT (corporate) on the same code path — it correctly parses whatever cells it receives. The corruption is in the **source markdown text itself**, i.e. the agentic-refine subagent's transcription of CTG's specific PDF page images failed to column-split ~20 Roman-numeral header/summary lines (and, separately, never emitted a recognizable "Tổng tài sản" table row for either ticker — see previous section).

**Zone pin (REVISED from the sprint's default `route_to: dev-pdf-extractor`):** this defect's row-corruption and row-absence root causes live entirely inside **`apps/mcp-server`** (the agentic-refine scheduler + `refinedMarkdownParser.ts` + `bctcScalarAggregator.ts` + `finalizeBctcRefineTool.ts` + the serve-path tools) — **not** `apps/pdf-extractor`, based on the live `bctc_md_tables` = NULL evidence for both sampled reports. `apps/pdf-extractor` is a deterministic Python OCR/table-detection service; the transcription that actually produced these specific rows is an LLM subagent transcription pipeline that is 100% mcp-server-owned code (scheduler + tool triad: `get_bctc_pending_refine` / `push_bctc_refined_unit` / `finalize_bctc_refine`). Confidence: **live-evidenced, not absolute certainty** — recommend dev-mcp-server do one cheap confirmatory check (grep `coordinationStore` claim history / job logs for `report_id=96e36139…`) before fully closing the door on pdf-extractor; if that check contradicts this brief, escalate back through po for re-pin rather than silently reverting to the default.

---

## 3. §3.3 reconciled — CONFIRMED exactly as BA found, ratified

```
grep -n "CORRUPT DATA" apps/mcp-server/src/  → exactly ONE hit: reports.ts:312 inside get_financial_summary (guard body: lines 295-324).
```

Read all three serve paths directly:
- `get_financial_summary` (`reports.ts:228-373`) — guard present, lines 301-324: `if (row.total_assets <= 0 || row.total_assets < row.equity_total) → [CORRUPT DATA — SKIP], confidence=0`. CTG's live row (`total_assets=0`) trips this guard's exact condition.
- `get_bctc_full` (`bctcFullTools.ts:869-…`) — read the full latest-row fetch + serve block; **zero occurrences of "CORRUPT" or an assets/equity comparison** anywhere in the file. Serves `latestRow` raw.
- `compare_financials` (`reports.ts:376-…`) — has its own independent `fetchRow()` closure (lines 395-409) querying `financial_reports` directly; **zero guard calls, zero "CORRUPT" occurrences** in the file outside `get_financial_summary`'s block.

**Verdict, ratifying BA's classification:** never-fired design-time scope gap on the two unguarded tools, not a regression — the guard's own test docstring (`fix-bctc-identity-serve-guard.test.ts:1-4`) self-scopes to `get_financial_summary` only; it was authored once for one tool and never extended. `get_bctc_full` is exactly the tool the sprint's `spike_mandate` names as the observed corrupt-serve path. Architect ratifies BA's §3.3 classification without change.

---

## 4. Owning zone(s) — PINNED

**dev-mcp-server — sole code-fix owner for this sprint's work units.** No `dev-pdf-extractor` task should be minted off this SPIKE (overrides the backlog row's `route_to: dev-pdf-extractor` default and BA spec's `owner_decision` default routing — both were provisional pending this SPIKE, per BA spec §2 and AC-1's own charter). Rationale: §2 above — the row-corruption and row-absence root causes are both traced into `apps/mcp-server`-owned code/pipelines with live evidence (`bctc_md_tables` empty, `parseRefinedMarkdown`'s exact corruption reproduction, `finalizeBctcRefineTool.ts`'s documented Case-2 freeze, `balanceSheetExtractor.ts`'s non-bank-aware initial extraction). `bctcScalarAggregator.ts`'s FR-2 bank mapping logic is **not** independently proven broken — it is upstream-starved, not defective.

---

## 5. SPLIT — work units for pm to decompose (dev-mcp-server only, no per-zone split needed)

All 5 units are `apps/mcp-server/` file-disjoint from each other except where noted; pm may fan out W1–W4 in parallel, W5 is sequenced.

**W1 — Identity-serve-guard coverage (FR-5, AC-4, AC-7/success_metric-c).** Files: `reports.ts` (`compare_financials`), `bctcFullTools.ts` (`get_bctc_full`). Factor the existing guard body (lines 295-324 of `reports.ts`) into one shared helper (e.g. `domain/services/financial-reports/bctcIdentityGuard.ts`) called by all three tools — do not duplicate the literal check 3×. Extend `fix-bctc-identity-serve-guard.test.ts` per FR-7/AC-12. **No dependency — ship first, independently satisfies AC-7 immediately** (CTG's `total_assets<=0` already trips the existing condition verbatim).

**W2 — Generic markdown row-repair (extends refinedMarkdownParser.ts, new deterministic pass).** File: `refinedMarkdownParser.ts` (or a new sibling `bctcRowRepair.ts` called from it). Detect the corruption signature structurally — reuse `bctcFormType.ts`'s `ROMAN_SECTION` regex to recognize a `code=NULL` row whose `label` starts with an anchored Roman-numeral/section marker and whose text contains 1-2 trailing VN-formatted numeric tokens while `value_current`/`value_prior` are both null — split into `(code, clean_label, value_current, value_prior)`. Generic (pattern-based on corruption shape, not per-ticker) — recovers CTG's 20 corrupted-but-present rows. **Does not by itself fix the missing "Tổng tài sản" row** (there is no row to repair for that field on either ticker) — flag this explicitly to pm/dev so W2 alone is not mistaken for a full AC-5 fix.

**W3 — Section-boundary-contamination guard on the same parse pass (`refinedMarkdownParser.ts`'s `detectSection`).** Cross-link `FIX-BCTC-TABLE-COLUMN-FPT-OVERFIT`'s `FM-VCB-1` finding — same root mechanism (a non-table section-header line never recognized by `detectSection`, so `currentSection` sticks on the prior value across a real section boundary). Do not re-solve from scratch; check whether that sprint's fix is reusable/extendable here first (brownfield-reuse rule).

**W4 — `bctcScalarAggregator.ts` fixture hardening (FR-2/FR-7, AC-9, AC-12).** The mapping logic is believed already-correct (documented truth table, generic `isBankFormFromRows` discriminator, no per-ticker branches) but has **zero production evidence** it works for total_assets — add unit fixtures: CTG-shaped clean row (post-W2 repair), VCB-shaped, and a third **synthetic** bank ticker never seen in dev (AC-9 genericity proof) exercised through all three serve tools (AC-4/AC-12). If a fixture reveals an actual mapping defect (not just missing data), fix in place — small, same file.

**W5 — Truthful `validation_status` + operational re-ingest (FR-6, AC-6, AC-10). Sequenced AFTER W2+W4 land and are deployed.** (a) `finalizeBctcRefineTool.ts`: once W1's guard hard-blocks genuinely-corrupt readings, `validation_status` must reflect the hard-block rather than a soft `low_confidence`/`failed` label (AC-6). (b) **Operational step, not a code change:** CTG's `total_assets` is frozen at `0` by the Case-2 preserve-prior-value logic (§2) — a container rebuild alone will NOT fix it. After W2's repair code deploys, dev-mcp-server must **re-run the agentic-refine + finalize pipeline for `report_id=96e36139-5dac-414d-8e4d-20a4725890d1`** (CTG 2026Q1) so fresh, repaired row data actually reaches the aggregator and overwrites the stale `0`. Document this step explicitly in the dev handoff — it is easy to miss and would otherwise make AC-5 unverifiable after an apparently-clean code deploy.

**Dependency graph:** W1 ∥ W2 ∥ W3 ∥ W4 (no file overlap, no ordering constraint) → W5 (needs W2+W4 deployed) → qa AC-13 RAW re-probe (needs W1 deployed for AC-7, W5's re-ingest complete for AC-5).

**Non-regression (AC-8):** FPT 2026-Q1 (`failed`, pre-existing floor — identity actually holds, W1's guard condition `total_assets<=0` does NOT trip for FPT so it is unaffected) + FPT 2025-Q4 + VNM 2025-Q4 must be included in W4's fixture set per §3.4. VNM 2026-Q1 (0-row, PENDING) excluded from the test matrix per BA §6.

---

## 6. Risk flags

- **RISK-1 [MEDIUM]** — W2's repair heuristic (trailing-VN-number split) is a best-effort deterministic recovery of an inherently lossy transcription; it cannot guarantee 100% correct column assignment when 2 numbers are present (current vs prior) — verify against CTG's known-good spot values (e.g. row_order 55 "Tién gửi tại NHNN": 21,355,164 / 35,225,543) as a fixture before trusting it broadly.
- **RISK-2 [MEDIUM]** — the zone-pin (§2, §4) rests on `bctc_md_tables IS NULL` for the two live report_ids as the discriminating signal between "pdf-extractor push" and "agentic-refine push." This is strong live evidence but not a certainty proof (no direct pipeline-execution log was inspected). W2's dev should run the cheap confirmatory check noted in §2 before large investment; if wrong, escalate to po for re-pin rather than silently redirecting to dev-pdf-extractor.
- **RISK-3 [LOW]** — `source_confidence=1.0` uniformly on corrupted rows means the existing trust-flag mechanism gives false assurance; not gating this sprint but worth a backlog note for `parseRefinedMarkdown`'s trust-flag scoring.
- **RISK-4 [LOW]** — `isBank` in `parseBctcReport.ts:501` is a hardcoded `BANKING_TICKERS` ticker allowlist (distinct from the generic `isBankFormFromRows` discriminator used later). Not in this sprint's scope (only feeds a validator margin proxy, not extraction routing) but is a latent DDD/consistency smell — two different "is this a bank" signals coexist in the same pipeline. Flagged for a future backlog item, not blocking.

---

## 7. Standard Detection

BUG-FIX / REFACTOR, in-zone (`apps/mcp-server/`), no new primitives → **BUILD-STANDARD: not-applicable**.

---

## Decision Journal
See `docs/agent-memory/decisions/sprint-FIX-BCTC-BANK-SUMMARY-MAPPING-architect.md` (task_id: ARCH-FIX-BCTC-BANK-SUMMARY-MAPPING).
