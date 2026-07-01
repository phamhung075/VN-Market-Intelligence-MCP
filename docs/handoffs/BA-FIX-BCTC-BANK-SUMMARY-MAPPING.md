# BA Requirement Spec — FIX-BCTC-BANK-SUMMARY-MAPPING

**Sprint:** FIX-BCTC-BANK-SUMMARY-MAPPING
**BA task:** BA-FIX-BCTC-BANK-SUMMARY-MAPPING
**Status:** SPEC COMPLETE
**Author:** ba
**Date:** 2026-07-01
**NEXT:** architect — MANDATORY root-cause SPIKE (live gateway) FIRST, zone SPLIT after
**Recurrence:** 3rd re-fire over 15 days (2026-06-16 mint PO-s70 → 2026-06-21 reconfirm → 2026-07-01 ESC-2 bctc-analyst signal bca-20260701T151500Z). `feedback_recurring_bug_escalation` class — cascade MUST start with a SPIKE, not a code patch.

---

## 1. Sprint Context (read from `sprint_goal.entries[FIX-BCTC-BANK-SUMMARY-MAPPING]`, confirmed FIRST)

**Vision:** Bank (Mẫu B02-TCTD) `financial_reports` scalar summaries MUST serve PLAUSIBLE, accounting-identity-consistent numbers generically across ALL bank tickers — or HARD-BLOCK as honest-NULL / confidence=0 with the dimension dropped — and MUST NEVER serve a labeled-garbage reading. `/goal#1` no-fake-data.

**Defect (PO evidence, CTG 2026Q1, signal bca-20260701T151500Z):** `total_assets=0`, `total_liabilities=24,735,484,770`, `equity_total=244,904,306`, `net_revenue=3,910` (~1000x off), `net_margin_pct=229,157%`, `confidence=0.56`, `validation_message="Assets (0) != Liabilities (24,735,484,770) + Equity (244,904,306) — mismatch 100.0%"`. Served with a "Validation FAILED" label instead of hard-blocked.

**Open question (PO):** VCB (bank) parses clean; CTG (bank) corrupts. Per-form-edge, not a total bank outage.

**Scope-out (verbatim, do not re-litigate):** no per-ticker allowlist/date-literal/special-case; NOT re-fixing raw table extraction ("already correct for banks" per PO's original framing — **BA live-probe below CONTESTS this claim for CTG specifically, see §3**); NOT FIX-DE-* interest-bearing-debt chain; NOT FIX-BCTC-ENRICH-SILENT-0ROWS (0-row raw extraction); NOT changing corporate (B01-DN) mapping except to prove non-regression.

---

## 2. BA Blockers

**Zero PO blockers.** All open questions in this defect are technical zone/root-cause questions explicitly reserved for the architect's live-gateway SPIKE (`spike_mandate`), not PO-answerable business questions. `dev-pdf-extractor` is confirmed a legitimate spawnable dev-zone agent (`docs/references/agent-roster.md` line 64: `dev-pdf-extractor.md`, zone `apps/pdf-extractor/`) — so an architect SPLIT that routes part of the fix there has no dispatch-table gap to resolve first.

---

## 3. BA Live-Probe Findings (2026-07-01, RAW-verified vs named-volume `market.db`)

Probed directly: `docker exec vn-market-intelligence-mcp-mcp-server-1 bun -e "...bun:sqlite against /app/data/market.db..."`. Confirmed container mount: `vn-market-intelligence-mcp_market_data → /app/data` (5 decoy volumes exist on the host — `market_data`, `vn-market-Intelligence-MCP_market_data`, `vn-market-Intelligence-mcp_market_data`, `vn-market-intelligence-mcp_vn_market_data`, `vnmarket_market_data` — NONE of these are mounted; only `vn-market-intelligence-mcp_market_data` is live).

### 3.1 Defect reconfirmed live, unchanged
`financial_reports` current state (2026Q1 unless noted):

| ticker | total_assets | total_liabilities | equity_total | net_revenue | net_margin_pct | confidence | validation_status | refine_status |
|---|---|---|---|---|---|---|---|---|
| CTG | 0 | 24,735,484,770 | 244,904,306 | 3,910 | 229,157.06% | 0.5625 | `low_confidence` | PARTIAL |
| VCB | 2,550,963,342 | 2,316,932,013 | 224,558,726 | 17,420,998 | 54.31% | 0.75 | `passed` | PARTIAL |
| FPT | 68,586,094.79 | 28,464,058.21 | 40,122,036.57 | 12,479,997.21 | 19.85% | 0.8125 | `failed` | DONE |
| VNM | 0 | 18,740,931.85 | 36,688,079.28 | 1 | 5,100% | 0.625 | `low_confidence` | **PENDING** |

`domain` column is `"other"` for all four rows — confirms `bctcFormType.ts`'s own history note (BANK-DEV-1) that the persisted `domain` column is still never populated `"banking"` live; `isBankFormFromRows` structural discriminator remains the only correct signal.

### 3.2 CRITICAL — contests the sprint's "raw extraction already correct" framing

Row-level probe of `bctc_table_rows` for CTG (`report_id=96e36139-…`, 55 rows) vs VCB (`report_id=31f2a9a9-…`, 57 rows):

| | CTG | VCB |
|---|---|---|
| rows with `code IS NULL` | **20 / 55 (36%)** | **0 / 57 (0%)** |
| Roman-numeral header rows | `code=NULL`, value embedded in `label` text, `value_current=NULL` | `code="I"`/`"II"`/`"IV"`/`"VI"`, clean label, `value_current` populated |

Example CTG row: `label="I. Tién gửi tại NHNN 21.355.164 35.225.543"`, `code=NULL`, `value_current=NULL` — current AND prior period numbers are garbled into the label string, column-split failed. Corresponding clean VCB row: `label="Tiền mặt, vàng bạc, đá quý"`, `code="I"`, `value_current=12930996`.

Also observed in CTG rows only: (i) **section-boundary contamination** — income-statement lines (`"II. Lãi thuần từ hoạt động dịch vụ …"`, `"I. Lãi thuần từ hoạt động kinh doanh ngoại hối …"`, `"Chi phí thuế TNDN hoãn lại"`) tagged `statement_section="balance_sheet"` — same class as the `FM-VCB-1` finding in the sibling sprint `FIX-BCTC-TABLE-COLUMN-FPT-OVERFIT` (BA notebook 2026-06-28); (ii) **code collisions** — `code="21"` reused across 4 distinct off-balance-sheet commitment labels, `code="13"` reused across 2 distinct equity labels — `findByCode` row lookup is unreliable for CTG.

**Implication for the SPIKE:** this is a *quantifiable, structural* raw-extraction quality gap for CTG's specific PDF rendering, not merely a downstream scalar-mapping bug. The SPIKE (`spike_mandate`) MUST reconcile this before pinning the owning zone — it may mean the fix needs `dev-pdf-extractor` (OCR/column-split) in addition to, or instead of, `dev-mcp-server` `bctcScalarAggregator`. **BA does NOT pin the final verdict — that is the architect SPIKE's explicit job** — this is evidence to seed it, not a substitute for it.

### 3.3 Co-owner AC input — identity-serve-guard coverage audit (grep-confirmed, unambiguous)

`grep -rn "CORRUPT DATA" apps/mcp-server/src/` shows the `[CORRUPT DATA — SKIP]` guard string exists in exactly ONE handler: `get_financial_summary` in `apps/mcp-server/src/interface/mcp/tools/financial-reports/reports.ts` (lines 295–324, `total_assets <= 0 OR total_assets < equity_total`). It does **not** exist anywhere in `bctcFullTools.ts` (`get_bctc_full`) nor is it applied inside `compare_financials` (also in `reports.ts`, lines 377+ — has its OWN independent `fetchRow()` closure querying `financial_reports` directly, no guard call).

The guard's own test file self-scopes: `apps/mcp-server/src/__tests__/fix-bctc-identity-serve-guard.test.ts` docstring line 1–4: *"Unit tests for the balance-sheet identity gate **in get_financial_summary (reports.ts serve path)**."*

**BA classification:** the guard **NEVER FIRED** on `get_bctc_full` or `compare_financials` — this reads as a *design-time scope gap* (the guard was authored for one tool and never extended to sibling read-paths that independently re-query the same `financial_reports` table), not a regression of previously-working code. `get_bctc_full` is exactly the tool named in the sprint's `spike_mandate` and the PO's dispatch note as the observed corrupt-serve path — confirming this is the live bug. Architect should ratify/override this classification per `co_owner_scope`'s "regressed vs never-fired vs bypassed" question.

### 3.4 Non-regression baseline scoping (edge case, not a blocker)
- `FPT` 2026-Q1 already `validation_status="failed"` **pre-fix, live-confirmed, refine_status=DONE** — FPT is corporate (B01-DN), unrelated to bank mapping; total_assets/liabilities+equity identity actually HOLDS for FPT (68,586,094.79 ≈ 28,464,058.21+40,122,036.57), so `failed` here has some OTHER pre-existing cause (cross-linked to `FIX-BCTC-TABLE-COLUMN-FPT-OVERFIT`, still open). Non-regression means this sprint must not make FPT's confidence/values WORSE — it is NOT required to flip FPT to `passed`.
- `VNM` 2026-Q1 has **0 rows** in `bctc_table_rows` and `refine_status="PENDING"` — a raw 0-row pipeline gap, explicitly `scope_out` territory (`FIX-BCTC-ENRICH-SILENT-0ROWS`). It must NOT be used as a "still-corrupt bank reading" AC-7 test case (VNM is not even a bank). Use `VNM` 2025-Q4 (`validation_status="passed"`, `refine_status=DONE`, identity holds exactly: 53,312,370.72 ≈ 18,829,355.43+34,483,015.29) as the VNM non-regression reference row.

---

## 4. Functional Requirements

### FR-1 — Root-cause SPIKE (architect, live gateway) — DDD layer: n/a (diagnostic, gates all layers below)
Live-compare `get_bctc_full` / `compare_financials` / `get_financial_reports` for CTG vs VCB vs FPT vs VNM via `mcp__gateway__call_tool(server="vn-market", tool=...)`. MUST explicitly reconcile §3.2 (raw-extraction quality gap) and §3.3 (guard-coverage gap) findings. Output: architect brief pinning the owning zone(s) (`dev-mcp-server` `bctcScalarAggregator` / `dev-pdf-extractor` row-parse / both) BEFORE any FIX task is minted.

### FR-2 — Generic bank B02-TCTD row→scalar mapping — DDD layer: domain (`bctcScalarAggregator.ts`, pure calc, zero I/O)
Map bank balance-sheet rows into the correct scalar columns generically across ALL bank tickers via the existing `isBankFormFromRows` structural discriminator (`bctcFormType.ts`) — reuse, do not fork. Never squeeze balance-sheet rows into income-statement columns. No per-ticker allowlist / date-literal / special-case.

### FR-3 — Raw table-extraction column integrity (conditional on FR-1 verdict) — DDD layer: infrastructure (`apps/pdf-extractor/` ingest, or the mcp-server-side raw-row writer if that is where CTG's column-split actually fails)
If FR-1 pins the defect (fully or partially) upstream of the scalar mapper, the CTG-class pattern (Roman/section header rows with `code=NULL` and both period values garbled into `label`) must be corrected so `bctc_table_rows.code` and `.value_current` are populated the same way for CTG's PDF layout as they already are for VCB's.

### FR-4 — Honest-NULL for inapplicable income-statement scalars — DDD layer: domain (`bctcScalarAggregator.ts` `notApplicable` list, already exists)
Bank-form income-statement scalars with no B02-TCTD equivalent (`gross_profit`, `current_assets`, etc.) stay NULL, never fabricated/zero, on the bank path (already implemented — FR-4 is a non-regression requirement, not new work).

### FR-5 — Identity-serve-guard coverage across ALL financial_reports serve paths — DDD layer: interface (`reports.ts` `get_financial_summary` — existing; `bctcFullTools.ts` `get_bctc_full` — gap; `reports.ts` `compare_financials` — gap)
Co-owner (`dev-mcp-server`) scope. Extend the `total_assets<=0 OR total_assets<equity_total → confidence=0, [CORRUPT DATA — SKIP], suppress ratios` guard (or factor it into one shared helper called by all three tools) so a bank-form identity-violated row is hard-blocked no matter which tool reads it. Extend `apps/mcp-server/src/__tests__/fix-bctc-identity-serve-guard.test.ts` to cover `get_bctc_full` and `compare_financials`, not only `get_financial_summary`.

### FR-6 — Truthful `validation_status` — DDD layer: application (finalize/refine pipeline, `finalizeBctcRefineTool.ts`)
Once FR-2/FR-3 resolve the identity violation for a genuinely-fixable reading, `validation_status` must not remain `low_confidence` SOLELY because of the (now-resolved) identity mismatch. For readings that remain genuinely violated, `validation_status`/confidence must reflect the FR-5 hard-block, not a soft "failed"/"low_confidence" label.

### FR-7 — Non-regression + generic-ness test harness — DDD layer: qa/test (unit tests, in-repo)
New/extended fixtures: CTG-shaped and VCB-shaped bank rows served through ALL THREE tools (`get_financial_summary`, `get_bctc_full`, `compare_financials`); a SECOND synthetic bank ticker (neither VCB nor CTG) to prove no per-ticker branching; FPT/VNM non-regression fixtures pinned to the §3.4 baseline rows.

---

## 5. Non-Functional Requirements
- **NFR-1 (data integrity):** no scalar summary may ever display a magnitude sanity violation (`net_margin_pct` in the tens-of-thousands of percent, `ebitda` ~1e14, `net_revenue` off by ~1000x) — these are OCR-corruption fingerprints per `bctcValidator.ts` `MAX_REALISTIC_VALUE` tier, already partially enforced but bypassable per §3.3.
- **NFR-2 (genericity):** zero new per-ticker conditionals; the fix must pass for a bank ticker never seen during development (test with a synthetic third bank fixture, FR-7).
- **NFR-3 (verification fidelity):** all DoD checks RAW-verified against the named-volume `market.db` (confirmed mount `vn-market-intelligence-mcp_market_data → /app/data`), never a host `./data` decoy; container rebuilt after any code change, per project standing policy.

---

## 6. Edge Cases (Vietnamese BCTC-specific)
- **0-row raw extraction (VNM 2026-Q1 confirmed live: 0 `bctc_table_rows`, `refine_status=PENDING`)** — out of scope, must not be conflated with an "identity-violated bank reading" for AC-7 purposes.
- **Pre-existing unrelated corporate defect (FPT 2026-Q1 `validation_status=failed`, identity actually holds)** — non-regression floor is FPT's CURRENT state, not a bar to raise.
- **Roman-code "I" collision** (bank balance-sheet code "I" = cash, vs bank income-statement code "I" = net revenue) — already guarded via `labelHint` (`P_BANK_CODE_I_HINT`, FU-6c/FU-6d) in `bctcScalarAggregator.ts`, but that guard only engages when a `code` value exists at all; CTG's null-code rows never reach it (see §3.2) — likely explains the anomalous `net_revenue=3,910`.
- **CTG code collisions** (`code="21"` × 4 distinct off-balance-sheet labels, `code="13"` × 2 distinct equity labels) — `findByCode` is unreliable for CTG; any fix relying purely on code lookup will misfire.
- **Section-boundary contamination** — CTG income-statement rows tagged `statement_section="balance_sheet"` — cross-link to `FIX-BCTC-TABLE-COLUMN-FPT-OVERFIT`'s `FM-VCB-1` finding class; do not re-solve in isolation, but do not assume it's already fixed for CTG either (confirmed still present live 2026-07-01).

---

## 7. Numbered Acceptance Criteria (success_metric (a)–(e) carried verbatim + BA additions)

1. **AC-1 [SPIKE gate, MANDATORY FIRST, architect]:** A live-gateway root-cause SPIKE (CTG vs VCB vs FPT vs VNM, via `get_bctc_full`/`compare_financials`/`get_financial_reports`) runs and produces an architect brief pinning the owning zone(s) BEFORE any code-patch task exists on the board. The brief explicitly reconciles §3.2 (raw-extraction quality gap) and §3.3 (guard-coverage gap).
2. **AC-2 [generic mapping]:** Bank balance-sheet rows are never squeezed into income-statement scalar columns, generically, via `isBankFormFromRows` — no per-ticker allowlist.
3. **AC-3 [honest-NULL]:** Income-statement scalars with no bank-form equivalent remain NULL on bank reports (non-regression of existing `notApplicable` behavior).
4. **AC-4 [guard coverage, dev-mcp-server co-owner]:** The identity-serve-guard fires identically on `get_financial_summary`, `get_bctc_full`, AND `compare_financials` — not just the first. Verdict recorded: regressed / never-fired / bypassed (BA's preliminary classification: never-fired on the latter two, §3.3 — architect/dev-mcp-server to confirm or override).
5. **AC-5 [success_metric (a), verbatim]:** "get_bctc_full(CTG) AND get_bctc_full(VCB) serve PLAUSIBLE bank scalar summaries — total_assets > 0 and consistent with total_liabilities+equity (accounting identity holds within ~1% tolerance), net_margin_pct within a plausible bank band (NOT 229157%), ebitda not an absurd 1e14 magnitude, net_revenue not ~1000x off."
6. **AC-6 [success_metric (b), verbatim]:** "validation_status no longer low_confidence SOLELY from the identity violation."
7. **AC-7 [success_metric (c), verbatim]:** "a bank reading that STILL violates the accounting identity is HARD-BLOCKED (confidence=0 / [CORRUPT DATA — SKIP] / corrupt scalars suppressed) — NEVER served as a labeled 'Validation FAILED' reading."
8. **AC-8 [success_metric (d), verbatim]:** "non-bank tickers FPT + VNM summaries NON-REGRESSED" — per §3.4 baseline: FPT 2026-Q1 (`failed`, pre-existing, no-worse floor) + FPT 2025-Q4 (`passed_with_warnings`, clean reference) + VNM 2025-Q4 (`passed`, clean reference). VNM 2026-Q1 (0-row/PENDING) excluded from this AC's test matrix (§6).
9. **AC-9 [success_metric (e), verbatim]:** "fix is GENERIC (structural bank-form discriminator, no per-ticker allowlist)" — proven via a third synthetic bank fixture (FR-7) not seen during development.
10. **AC-10 [RAW-verify gate]:** AC-5 through AC-9 independently re-verified LIVE against the named-volume `market.db` (`vn-market-intelligence-mcp_market_data`, confirmed mount, NOT any of the 5 live decoy volumes), container rebuilt (mcp-server service) after the code change.
11. **AC-11 [cascade ordering]:** No `dev-mcp-server` or `dev-pdf-extractor` FIX task is minted by pm until AC-1's architect brief exists and pins the zone(s) — enforced structurally by the route `po→ba→architect→pm→dev→qa` (architect's SPIKE output gates pm's decomposition).
12. **AC-12 [test coverage]:** Unit tests cover CTG-shaped and VCB-shaped fixtures through all three serve tools (AC-4), plus a third synthetic bank ticker (AC-9), plus FPT/VNM non-regression fixtures pinned to §3.4.
13. **AC-13 [qa independent re-probe]:** qa re-runs the SAME live queries BA used here (docker exec against the named volume: `bctc_table_rows` null-code counts, `financial_reports` scalar + `validation_status` columns for CTG/VCB/FPT/VNM) — `done_verified` requires this independent RAW re-probe, not a relay of dev's self-report.

---

## 8. Cascade-Ordering Enforcement (recurrence_mandate)

This is the 3rd re-fire of this exact defect over 15 days. Per `feedback_recurring_bug_escalation`, the cascade is structured so a code-patch CANNOT be dispatched before root cause is pinned:

```
ba (this doc)  →  architect (AC-1 SPIKE, MANDATORY FIRST — live gateway, no code)
                      │
                      ▼
                 architect brief: owning zone(s) pinned
                      │
                      ▼
                 pm decomposes INTO per-zone dev tasks
                 (dev-mcp-server bctcScalarAggregator/guard AND/OR
                  dev-pdf-extractor row-parse, per SPIKE verdict)
                      │
                      ▼
                 dev implements  →  qa RAW-live gate (AC-13)
```

pm MUST NOT decompose FIX-implementation tasks off this spec directly — it must wait for the architect's SPIKE brief (AC-1/AC-11). This spec's own `files` list (`bctcScalarAggregator.ts`, `bctcFormType.ts`, `reports.ts`, `finalizeBctcRefineTool.ts`, `bctcFullTools.ts`, `fix-bctc-identity-serve-guard.test.ts`, `apps/pdf-extractor/`) is a CANDIDATE set for architect's SPLIT, not a pre-approved work order.

---

## 9. DDD Layer Summary

| FR | Layer | File(s) |
|---|---|---|
| FR-1 (SPIKE) | n/a — diagnostic | live gateway calls only |
| FR-2 (generic mapping) | domain | `bctcScalarAggregator.ts`, `bctcFormType.ts` |
| FR-3 (raw extraction, conditional) | infrastructure | `apps/pdf-extractor/` (or mcp-server raw-row writer, per SPIKE) |
| FR-4 (honest-NULL) | domain | `bctcScalarAggregator.ts` (non-regression) |
| FR-5 (guard coverage) | interface | `reports.ts`, `bctcFullTools.ts` |
| FR-6 (truthful validation_status) | application | `finalizeBctcRefineTool.ts` |
| FR-7 (test harness) | qa/test | `apps/mcp-server/src/__tests__/fix-bctc-identity-serve-guard.test.ts` + new fixtures |

---

## Decision Journal (task_id: BA-FIX-BCTC-BANK-SUMMARY-MAPPING)

- **what-considered:** "(A) Accept PO's `defect_raw_evidence` claim that raw extraction is 'already correct' for banks at face value — REJECTED after live probe: CTG shows 20/55 (36%) `code=NULL` garbled-label rows vs VCB's 0/57; this is carried forward as a MUST-RECONCILE input to the SPIKE, not silently accepted. (B) Treat the identity-serve-guard gap as a 'regression' per the sprint's default framing — REJECTED; grep + the guard's own test-file docstring show it was scoped to `get_financial_summary` only at authoring time and never extended to `get_bctc_full`/`compare_financials` — classified as never-fired/scope-gap, flagged for architect ratification. (C) Use VNM 2026-Q1 (assets=0) as a second in-scope corrupt-bank test case — REJECTED: 0 raw rows / refine_status=PENDING = `FIX-BCTC-ENRICH-SILENT-0ROWS` territory, explicitly scope_out, and VNM is not even a bank form. (D) Raise the FPT `failed` pre-existing status as a PO blocker — REJECTED: `scope_out` already answers this ('NOT changing corporate mapping except to prove non-regression'); resolved as a non-blocking AC-8 baseline clarification instead."
- **why-change:** "No change to sprint scope. Structure enforces SPIKE-before-code-patch (AC-1/AC-11) per the recurrence mandate, carries success_metric (a)-(e) verbatim (AC-5–AC-9), and adds a 3rd previously-unaudited serve path (`compare_financials`, AC-4) to the co-owner's identity-serve-guard scope after live grep confirmed it independently re-queries `financial_reports` with no guard call."

---

## [Architect] Brownfield Findings (AC-1 SPIKE — DONE)

**Full brief:** `docs/architecture-briefs/2026-07-01-FIX-BCTC-BANK-SUMMARY-MAPPING.md` (live evidence, code trace, SPLIT design — this section is a pointer + zone summary per the flow contract).

- **Zone:** `apps/mcp-server/` — SOLE code-fix owner. **`dev-pdf-extractor` is NOT pinned** (overrides the backlog row's `route_to: dev-pdf-extractor` default and BA §"owner_decision" default). Live evidence: `bctc_md_tables` (the actual pdf-extractor→mcp-server ingestion bridge table) is **NULL/empty** for both CTG's and VCB's current `report_id`s — these 55/57 `bctc_table_rows` did not arrive via the pdf-extractor markdown push path. `page_number` distribution matches the in-repo agentic-refine job's windowed partitioning (`bctcRefineJob.ts`, `REFINE_MAX_WINDOW_PAGES`), and `refinedMarkdownParser.ts`'s 2-cell parse branch exactly reproduces the observed corruption shape (label absorbs merged numbers, `value_current=null`, no error) — while the SAME parser produced 0 corrupted rows on VCB's 57 and FPT's 145 corporate rows, proving the parser logic itself is not the defect; the source markdown text (LLM-subagent transcription) is.
- **§3.2 reconciled — REVISED, not simple-confirmed:** BA's 20/55-vs-0/57 null-code count is correct but incomplete. Extended probe found the "Tổng tài sản" grand-total row is **absent from `bctc_table_rows` for BOTH CTG and VCB** (0 rows match, either ticker) — a bank-form-generic gap, not CTG-only. VCB's currently-correct served `total_assets` is NOT sourced from `bctc_table_rows` at all — it is a frozen residual value from the separate, non-bank-aware initial flat-text extractor (`balanceSheetExtractor.ts`, corporate-VAS-code-only, invoked identically for banks and corporates) that happened to regex-match VCB's PDF text layout by luck. `finalizeBctcRefineTool.ts`'s documented Case-2 logic (aggregator null + not-notApplicable → skip update, preserve prior) freezes both CTG's bad `0` and VCB's lucky-good value — neither is validated by the actual bank-aware row mapper (`bctcScalarAggregator.ts`), which is therefore **not proven broken**, just upstream-starved.
- **§3.3 reconciled — CONFIRMED, ratified without change.** Re-read all three serve paths directly: guard exists only in `get_financial_summary` (`reports.ts:295-324`); zero guard code in `get_bctc_full` (`bctcFullTools.ts`) or `compare_financials`'s independent `fetchRow()` (`reports.ts`). Classification: never-fired design-time scope gap, not a regression — ratifies BA's finding.
- **Verified paths:** `apps/mcp-server/src/domain/services/financial-reports/bctcScalarAggregator.ts` (mapping logic — sound, upstream-starved), `.../balanceSheetExtractor.ts` (initial extractor — non-bank-aware, root of the frozen-value problem), `apps/mcp-server/src/application/usecases/parseBctcReport.ts:417,501` (unconditional `extractBalanceSheet` call; hardcoded `BANKING_TICKERS` allowlist used only for validator proxy, not extraction routing), `.../finalizeBctcRefineTool.ts:460-509` (Case-2 freeze), `.../application/utils/refinedMarkdownParser.ts:299-323` (corruption-shape reproduction), `.../scheduler/financial-reports/bctcRefineJob.ts` (agentic-refine pipeline, source of the transcribed markdown), `.../interface/mcp/tools/financial-reports/reports.ts:295-324,376+` and `bctcFullTools.ts:869+` (guard coverage gap).
- **Reuse patterns:** extend the existing guard into one shared helper (not 3× duplication); reuse `bctcFormType.ts`'s `ROMAN_SECTION` regex for the new row-repair heuristic; check `FIX-BCTC-TABLE-COLUMN-FPT-OVERFIT`'s `FM-VCB-1` fix before re-solving section-boundary contamination from scratch (W3).
- **Design decisions / SPLIT (5 work units, dev-mcp-server only):** W1 identity-serve-guard coverage (independent, ships first) · W2 generic markdown row-repair (`refinedMarkdownParser.ts`, pattern-based, not per-ticker) · W3 section-boundary-contamination guard (`detectSection`) · W4 `bctcScalarAggregator.ts` fixture hardening incl. synthetic 3rd bank ticker (AC-9) · W5 truthful `validation_status` + **operational re-ingest of CTG `report_id=96e36139…`** (sequenced after W2+W4 deploy — a code fix alone will NOT unfreeze CTG's `total_assets=0`; W5 documents this explicitly). Full dependency graph, risk flags (RISK-1..4), and per-file detail in the brief.
- **BUILD-STANDARD:** not-applicable (bug-fix/refactor, in-zone, no new primitives).
- **Scan clean:** true ✓

## RETURN
DONE: AC-1 SPIKE complete — live evidence + code trace reconciled §3.2 (revised) and §3.3 (confirmed), zone pinned to dev-mcp-server only, 5-unit SPLIT produced.
ZONE: apps/mcp-server/
NEXT: pm — decompose the 5 work units (W1-W5) per the brief; do NOT mint any dev-pdf-extractor task (explicitly not pinned).
HANDOFF: docs/handoffs/BA-FIX-BCTC-BANK-SUMMARY-MAPPING.md + docs/architecture-briefs/2026-07-01-FIX-BCTC-BANK-SUMMARY-MAPPING.md
PIPELINE: continue
