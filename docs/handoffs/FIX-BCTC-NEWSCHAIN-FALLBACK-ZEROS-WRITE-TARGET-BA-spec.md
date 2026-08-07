# BA Spec — FIX-BCTC-NEWSCHAIN-FALLBACK-ZEROS-WRITE-TARGET

**Task:** FIX-BCTC-NEWSCHAIN-FALLBACK-ZEROS-WRITE-TARGET · HIGH · FIX (plan-only) · zone `apps/mcp-server` · owner po
**BA date:** 2026-08-07
**Verdict:** spec complete, zero PO blockers (one non-blocking recommendation flagged, §7) → **NEXT: architect**

---

## 0. Scope binding (read verbatim before acting)

- `enableBctcFallback` defaults `false` (`fetchParseAndStoreBctc.ts:50`), gated at `resolvePdfText.ts:228`. No non-test caller passes it `true` (grep-reconfirmed this cycle across `composition-root.ts`, `reports.ts`, `bctcVpsIngestHandler.ts`, `bctcReparseJob.ts`, `pushBctcExtraction.ts`, `checkSscReports.ts`). **Nobody may flip it `true` anywhere until this row closes** — already priced into the HIGH-not-P0 rating; do not re-cite it as a downgrade reason.
- Out of scope (do not pull in): re-extraction/remediation of already-corrupt/absent reports (OPS-BCTC-REFINE-REPASS-NONBANK-5T, W5-FU-CTG-REFINE-96e36139, SPIKE-BCTC-Q1-2026-SERVABILITY-CENSUS — closed 2026-08-07, verdict FOLD); `storeReport()` arm (b2) (shipped, QA-approved); ingest-stall cohort (FIX-BCTC-Q1-2026-STORED-PDF-INGEST-STALL-15T); scale-signature corruption (FIX-BCTC-VALIDATION-GATE-NONBANK-ZERO-SCALE).

---

## 1. Live-code verification (re-read every claim per PO's own instruction — 2 findings beyond the board row's own text)

Confirmed byte-exact against live source: `newsChainFallback.ts:308` is the sole `totalAssets` assignment (hardcoded `0`), lines 305-313 are an all-zero balance sheet, arm (b1) at lines 265-280 blocks only the overwrite-a-good-row case. `bctcIdentityGuard.ts:66-68` fails OPEN on `total_assets == null` but hard-blocks (`corrupt:true`) on `total_assets <= 0`, and `bctcFullTools.ts` fires this identity guard (line ~1071) **before** the PUB-1..8 gate (line ~1264) — this check ORDER is the precise mechanism that makes a fallback zero-row indistinguishable from real OCR corruption: even though the row's `refine_status` silently defaults to `'PENDING'` (never set by the fallback INSERT; schema default per `schema-financial-reports.ts:57`) and would otherwise fail the more-honest PUB-1 gate, the identity guard wins the race and serves `[CORRUPT DATA — SKIP]` first.

**Finding F-1 (new — not in the board row's `six_tests_encode_the_defect` list).** A live grep for every `tryNewsChainFallback(` call site turned up a **7th test** with the identical defect-as-intended-behavior shape: `FIX-BCTC-REPARSE-BATCH-CORRUPTION-NGAYNOP-FLIP.test.ts:428` — `"AC-1/normal path: fallback DOES write (and is immutable on re-run) when no prior good row exists"`. This is the exact test whose own comment (lines 428-442) documents the prior reverted arm-(b2) attempt the board row calls "prior_attempt_reverted" — it is the origin of this very ticket, not a bystander. It asserts `row1.total_assets === 0` and `published_at` immutability across a re-run. **This test is IN SCOPE for AC-3 rewrite alongside the named six; treating it as untouched would leave a 7th green test asserting the old (rejected) contract.** The SAME file's `"AC-2: fallback write is BLOCKED..."` test (line 387) is the existing arm-(b1) regression check — this one must be **preserved unchanged** (AC-5) and reused as the base for a serving-plane assertion (§6, task 7).

**Finding F-2 (new — a real consumer, per PO's explicit invitation to report one).** `apps/mcp-server/src/interface/mcp/routes/bctcInspectHandler.ts` (`/api/bctc-inspect`, admin/ops-facing) queries `financial_reports` directly (`LIST_SQL`, line ~125-134, no `bctcIdentityGuard` involved) and is **deliberately architected** (`docs/handoffs/TASK_PDF-INSPECT.md` §"List Scope"/§"4 honest-degrade states") to show ALL rows including news-inference zero rows as "the data quality gap itself... zero figures = news-inference, no real extraction happened" — a genuinely different, admin-only serving plane that WANTS this signal, unlike `get_bctc_full`/`get_financial_summary`/`compare_financials` which must never see it. Currently harmless in practice: `market.db` holds **0** `news_inference` rows today (QA note, `sprint-SYSTEMIC-REMAKE-P1-qa.md:256`) because the flag is off — but per Memory-as-Truth Prohibition this must be **live-reprobed at implementation time**, not trusted from a historical note (§5 EC-5). This finding does not overturn PO's steer (§2) but does inform the replacement-surface choice (§3) and produces one non-blocking follow-up recommendation (§7).

**Finding F-3 (confirms AC-6 is already true today, structurally, by accident of control flow — not by anything this fix needs to remove).** Traced `buildAnalysisSummary()`'s only caller: `insertBctcAnalysis.ts:115`, itself called only from `fetchParseAndStoreBctc.ts:121` (Step 4), which only runs when `resolvePdfText()` returns `{status:"text",...}`. The fallback path returns `{status:"final", report}` and the orchestrator returns immediately at `fetchParseAndStoreBctc.ts:74-76` — **Step 4 is architecturally unreachable on the fallback branch today.** AC-6 is satisfied now, but only incidentally; §4 FR-5 turns this into an explicit, tested invariant instead of a control-flow accident.

---

## 2. Product decision (AC-1 — written here, before any code is scoped)

**Directional news-inference hints do NOT belong in `financial_reports`.** PO's steer is adopted. `financial_reports` is the table `bctcIdentityGuard.ts` and every agent-facing BCTC serve tool (`get_bctc_full`, `get_financial_summary`, `compare_financials`, `bctcSeriesTools`, `cashFlowTool`, `getBctcOcfTool`) trusts as authoritative; a row whose every numeric field is a hardcoded literal, by construction, on every call (§ mechanism, PO's own reductio: arm(b1)+literal arm(b2) together block 100% of writes) cannot coexist with that trust model no matter how it is guarded in place.

**Replacement surface: a new, dedicated, non-authoritative table** — proposed name `bctc_news_fallback_hints` (architect may rename), keyed `UNIQUE(action_code, sort_key)`, holding only the hint-relevant scalars (`confidence`, `revenue_growth_qoq`, `margin_trend`, `debt_ratio_hint`, `hints_count`, `extraction_source_note`, `first_seen_at`) — **no balance sheet, no income statement, no cash flow, no company_name placeholder.** Never read by `bctcIdentityGuard`, never joined into any of the identity-guarded serve paths. See §3 for why this beats the other two named alternatives.

---

## 3. Design alternatives evaluated (all 3 PO named, plus 1 found during verification)

| # | Alternative | Verdict | Reasoning |
|---|---|---|---|
| (i) | **Separate table/column** (PO's option 1) | **ADOPTED** | Satisfies AC-2 literally (zero rows of any kind in `financial_reports`). Preserves the hint computation's value (confidence/direction/temporal-discount, already-correct logic, untouched) as a durable, queryable artifact — supports a future reconciliation job (`findExistingPdf` backfill, already flagged as a known gap in `TASK_PDF-INSPECT.md` §5) that a pure in-memory value cannot. Gives the real F-2 consumer (`bctcInspectHandler.ts`) a migration path via a follow-up (§7), instead of a silent, permanent capability loss. |
| (ii) | **Nullable non-authoritative sentinel row in `financial_reports`, excluded by `bctcIdentityGuard`** (PO's option 2) | **REJECTED** | Fails AC-2 on its face — AC-2 says no row of this path's making is ever *created* in `financial_reports`, full stop; a sentinel row is still a row. Even setting the letter aside: excluding it requires teaching `bctcIdentityGuard` (or every one of the 6+ independent `SELECT * FROM financial_reports` call sites across `bctcFullTools.ts`, `reports.ts`, `bctcSeriesTools.ts`, `cashFlowTool.ts`, `getBctcOcfTool.ts`, `bctcBatchSweepTool.ts`) to special-case `extraction_method='news_inference'` — large blast radius, easy to miss one path, and reproduces the exact "byte-indistinguishable... at serve time" fragility this ticket exists to eliminate, just moved one field over. A `total_assets=NULL` variant was also considered (fails the identity guard OPEN, would instead be caught by the PUB-1 `refine_status` gate) and rejected for the same blast-radius reason — it still leaves a phantom row in the authoritative table for every current and future consumer to reason about correctly, forever. |
| (iii) | **Delete the write path entirely — pure read-side hint producer, no persistence anywhere** (PO's option 3) | **CONSIDERED, NOT ADOPTED (simpler fallback, note for PO/architect)** | Zero schema change, zero blast radius, satisfies AC-2 trivially. Rejected as primary because it forfeits F-2's real consumer capability with **no** replacement (an ephemeral in-memory value can't be listed by `bctcInspectHandler.ts`'s `LIST_SQL`) and forfeits the future reconciliation-job value noted under (i). If architect/PO judge the admin-visibility value not worth a new table (legitimate call — 0 live rows today, flag is off), this is the correct fallback design; flagged here so it isn't silently unconsidered. |
| (iv, new) | **Move only the `totalAssets`/balance-sheet fields to `NULL`, keep everything else as-is in `financial_reports`** | **REJECTED** | Not one of PO's three but worth recording since it looks tempting (smallest diff). Still creates a row in the authoritative table (fails AC-2's intent even if some individual fields dodge "all-zeros" wording); still requires the same blast-radius audit as (ii); and produces a THIRD, more confusing semantic state ("looks like refine_status=PENDING, not-yet-processed" when it is actually "deliberately used a lower-confidence surrogate and never will be re-processed the normal way") — actively less honest than either (i) or (iii). |

---

## 4. Requirements

### FR-1 — New non-authoritative persistence surface
**DDD layer: infrastructure.** Add `bctc_news_fallback_hints` DDL (`apps/mcp-server/bctc-schema.ts`, alongside `financial_reports`, or an `ALTER`-migration file following `schema-financial-reports.ts`'s pattern — architect's call). `UNIQUE(action_code, sort_key)`. No FK from any other table references its `id` (verified: PEK tables `bctc_layout_units`/`bctc_page_zones` are populated only by the real PDF/OCR layout pipeline, which a news-inference row never has — `pdfPath` is hardcoded `null` in the fallback report, §1). This makes the original `FIX-BCTC-NEWS-CHAIN-FALLBACK-ID-ORPHAN` motivation — protecting PEK child-row FKs from an id that churns on re-run — **structurally moot** for the new table; keep `ON CONFLICT(action_code, sort_key) DO UPDATE` purely for idempotent re-run (no duplicate hint rows), not for orphan-prevention.

### FR-2 — Rewrite `tryNewsChainFallback()`'s write target
**DDD layer: application** (`apps/mcp-server/src/application/usecases/bctc/newsChainFallback.ts`). Keep the signal query / contradiction check / confidence calc (lines ~129-238) byte-identical — none of that logic is in question. Keep arm (b1)'s READ of `financial_reports.total_assets` (lines ~250-280) **unchanged as a pre-condition gate** — re-purpose its consequence: when a good real row already exists, skip BOTH the (now-removed) `financial_reports` write and the new hints-table write (no reason to record a low-confidence hint for a period already covered by real data — generalizes AC-5, does not regress it). Replace the `INSERT INTO financial_reports ... ON CONFLICT ...` block (lines ~401-575) with an equivalent upsert into `bctc_news_fallback_hints`, dropping every zero-valued balance-sheet/income-statement/cash-flow field — they never belonged on any row this function writes.

### FR-3 — `resolvePdfText.ts` return-contract documentation (should-do, not must-do)
**DDD layer: application.** No functional change required — it still calls `tryNewsChainFallback()` and returns `{status:"final", report}` when `fallback && report`, and downstream callers already gate on `.fallback===true` before trusting anything. Recommend a doc-comment update on `ResolvePdfTextOutcome`/`report` clarifying that on the fallback branch this value no longer implies any row exists in `financial_reports` — prevents a future reader from assuming otherwise. Low-risk, does not require touching the 3 caller-adjacent type signatures.

### FR-4 — No code change required on the serve paths (verification-only)
**DDD layer: interface.** `bctcFullTools.ts` / `reports.ts` need **zero** changes — AC-4 falls out for free once FR-1/FR-2 land (no row ever exists for them to query). The obligation this row owns is a **new regression test proving it** end-to-end via the live serving path (§6 task 6), not a code change.

### FR-5 — Lock in the RAG-plane invariant explicitly (operationalizes AC-6 / Finding F-3)
**DDD layer: application.** Add a regression test asserting `insertAnalysisFn` (the injected `insertBctcAnalysis` seam) is never invoked when `fetchParseAndStoreBctc()` takes the fallback branch. This is currently true only because of control flow (§1 F-3); this FR converts that accident into an explicit, permanent guarantee that survives future refactors of the orchestrator.

### FR-6 — Six-plus-one test rewrite (AC-3)
**DDD layer: test.** See §7 for the full per-test rewrite plan — 7 tests, not 6 (Finding F-1).

### FR-7 — Admin-inspector companion (RECOMMENDED FOLLOW-UP, explicitly NOT folded into this row's scope)
**DDD layer: interface.** Extend `bctcInspectHandler.ts`'s `LIST_SQL` (or add a secondary panel) to surface rows from `bctc_news_fallback_hints`, preserving the "data quality gap visibility" consumer contract `TASK_PDF-INSPECT.md` deliberately designed (Finding F-2). See §7 for why this is advisory, not a PO blocker.

---

## 5. Edge cases

- **EC-1 (secondary win, not previously flagged):** `company_name` on the authoritative table currently gets squashed to the English literal `"Unknown (news_inference)"` on first fallback-write — a data-quality defect on `financial_reports` quite apart from the zero balance sheet. Moving the whole write off that table incidentally fixes this too; call it out so nobody re-derives it as a "new" bug later.
- **EC-2 (i18n string-fragility risk):** the verification gate's "Chưa có dữ liệu BCTC" honest-absence text (`bctcFullTools.ts:1056`, live-confirmed) is a natural-language string. The new regression test (§6 task 6) should assert a stable substring or the response *shape* (absence of `total_assets`, no `[CORRUPT DATA` marker) rather than full-string equality, so a future copy-edit doesn't produce a false test failure unrelated to this fix.
- **EC-3 (check-order fact, §1):** identity guard fires before PUB-1 in `bctcFullTools.ts` — document this in the new hints-table design's comments so a future reader doesn't assume `refine_status='PENDING'` alone would have protected against the corrupt-data message; it would not have, for exactly the reason recorded here.
- **EC-4:** the fallback report hardcodes `domain:'other'` and never distinguishes bank vs. non-bank tickers — irrelevant once removed from `financial_reports` (no bank-specific identity-guard logic applies to `bctc_news_fallback_hints`); flagged only so nobody re-introduces a bank/non-bank branch on the new table without cause.
- **EC-5 (Memory-as-Truth Prohibition):** before implementing, live-probe `SELECT COUNT(*) FROM financial_reports WHERE extraction_method='news_inference'` against the running container's `market.db`. The "0 rows today" fact cited in §1 F-2 is a historical QA note, not to be trusted blindly at implementation time. If non-zero, decide (developer/architect judgment, not blocking this design) whether to migrate those rows into the new table or leave them for the separate remediation cohorts already named in scope boundaries.

---

## 6. Task breakdown (for architect → developer; BA does not implement, `plan_only:true`)

1. **[infrastructure]** Add `bctc_news_fallback_hints` DDL (FR-1).
2. **[application]** Rewrite `tryNewsChainFallback()`'s write target: `financial_reports` → `bctc_news_fallback_hints`; keep arm (b1) read-gate; drop all zero-valued balance/income/cashflow fields entirely (FR-2).
3. **[application]** Confirm arm (b1)'s existing-good-row gate also suppresses the new hints-table write, not just the removed `financial_reports` write (FR-2).
4. **[application]** Add the RAG-non-leak regression test (FR-5 / AC-6).
5. **[test]** Rewrite the 7 tests per §7 (AC-3, FR-6).
6. **[interface]** New regression test: `get_bctc_full` for a first-ever-fallback ticker (no prior row) returns the honest-absence response (verification gate (a)); assert on stable substring/shape per EC-2, not brittle full-string match (FR-4).
7. **[interface]** New regression test: same invocation for a ticker WITH a good stored row leaves it untouched, still serving non-zero `total_assets` (verification gate (b)) — extend the existing `"AC-2: fallback write is BLOCKED..."` test (`FIX-BCTC-REPARSE-BATCH-CORRUPTION-NGAYNOP-FLIP.test.ts:387`) with an added `get_bctc_full` call for full serving-plane proof, per the verification gate's explicit preference for serving-plane over DB-plane-only assertions.
8. **[process]** Grep-verify zero `INSERT INTO financial_reports` / `ON CONFLICT` occurrences remain in `newsChainFallback.ts` post-rewrite (verification gate (c)).
9. **[process]** RED-before via git-stash A/B with the rewritten tests kept (verification gate (d)).
10. **[process]** Full suite run, every failure file-attributed not name-grepped; `1405b-bctc-vps-fixes.test.ts` is a known decoy (verification gate (e)).
11. **[FOLLOW-UP, separate task — do not fold in]** `bctcInspectHandler.ts` companion update (FR-7) — mint only if PO/architect agrees it's worth the schema surface given 0 live rows today (§7).

---

## 7. Test rewrite plan (AC-3 — 7 tests total, each rewrite's intent stated)

| Test | File:line | Old assertion (defect-as-intended) | New intent |
|---|---|---|---|
| RED-1 (VCB) | `1294b-bctc-fallback.test.ts:45` | `fallback:true` + row exists in `financial_reports` w/ `extraction_method='news_inference'` | Assert NO `financial_reports` row (count 0); assert a `bctc_news_fallback_hints` row exists with the same confidence bounds `[0.45,0.65]`; assert `get_bctc_full('VCB',2024,'Q1')` returns honest absence, not corrupt-data text. |
| RED-6 (VIC) | `1294b-bctc-fallback.test.ts:318` | `revenue_growth_qoq`/`margin_trend`/`debt_ratio_hint` land in `financial_reports` | Reassert the same three extracted values now land in `bctc_news_fallback_hints`'s equivalent columns; `financial_reports` row count stays 0. |
| RED-7 (BSR) | `1294b-bctc-fallback.test.ts:399` | temporal-discount-reduced confidence read from `financial_reports.extraction_confidence` | Reassert against `bctc_news_fallback_hints.confidence`; same `<0.55` bound. |
| RED-8-first-call (VJC) | `1294b-bctc-fallback.test.ts:475` | first call inserts `news_inference` row in `financial_reports`; second call (real PDF text) transitions it to `pdf-parse` via UPSERT | First call: assert 0 `financial_reports` rows + a hints-table row. Second call (real `pdfTextOverride` succeeds): now a **plain first INSERT** into `financial_reports` via the normal `storeReport()` path (no "transition" — nothing existed there before) — assert `extraction_method='pdf-parse'` as before. Leave the earlier hints-table row in place as harmless history; no cross-table cleanup added (no requirement demands it). |
| ID-ORPHAN case 1 | `FIX-BCTC-NEWS-CHAIN-FALLBACK-ID-ORPHAN.test.ts:93` | id survives re-run, protecting simulated PEK child FK rows in `financial_reports` | Rewrite intent: this test's entire premise (PEK-orphan protection) is now structurally moot for this write path — no `financial_reports.id` is ever minted here for PEK to reference (§4 FR-1). Repoint the test to assert **idempotent upsert on the new table**: two fallback runs for the same `(action_code, sort_key)` produce exactly one `bctc_news_fallback_hints` row (no duplicate). Document in-test WHY the original PEK-FK concern no longer applies. |
| ID-ORPHAN case 2 | `FIX-BCTC-NEWS-CHAIN-FALLBACK-ID-ORPHAN.test.ts:149` | a different `sort_key` gets its own `id`, no cross-period bleed, in `financial_reports` | Reassert the same no-bleed property on `bctc_news_fallback_hints`: Q1 and Q2 hint rows for the same `action_code` are independent rows, neither `financial_reports` row exists for either. |
| **F-1 (7th, not in board row's list)** — "AC-1/normal path" | `FIX-BCTC-REPARSE-BATCH-CORRUPTION-NGAYNOP-FLIP.test.ts:428` | fallback DOES write + is immutable (`published_at`) on re-run, when no prior good row exists, in `financial_reports` | Rewrite intent: assert NO `financial_reports` row is ever created by this path (superseding the very assumption this test's own 2026-07-21 comment predicted would need revisiting); assert the hints-table equivalent of "immutable on re-run" (e.g. `first_seen_at` set once, unchanged across a second call) transfers to the new table. The sibling `"AC-2: fallback write is BLOCKED..."` test in the same `describe` block (line 387) is **preserved unchanged** (arm b1, AC-5) — do not touch it beyond the serving-plane extension in §6 task 7. |

---

## RETURN
DONE: BA spec complete — product decision made (AC-1: not in `financial_reports`, replacement = new `bctc_news_fallback_hints` table), all 3 PO-named alternatives + 1 additional evaluated with reasoning, 7 tests identified for rewrite (6 named + 1 found live, Finding F-1), a real consumer found and reported per PO's invitation (Finding F-2, non-blocking follow-up FR-7), AC-6/RAG-plane verified already-true today and turned into an explicit regression requirement (Finding F-3). Zero PO blockers.
NEXT: architect — technical blueprint for the new table DDL (FR-1), the `newsChainFallback.ts` rewrite (FR-2), and the 7-test rewrite (§7) — all mechanism-scoped, no ingest/deploy-window dependency.
HANDOFF: docs/handoffs/FIX-BCTC-NEWSCHAIN-FALLBACK-ZEROS-WRITE-TARGET-BA-spec.md
PIPELINE: continue
