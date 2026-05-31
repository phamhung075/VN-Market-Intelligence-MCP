# dev-mcp-server -- Notebook

## c345 · 2026-05-31 (FU-TRUST-REFRESH FU-6e) — COMMITTED b63d7988

**Task:** FU-6e — not-applicable null-clear for bank scalars (last QA blocker)

**Root cause:** ACB gross_profit=6,989,162=net_revenue (100% margin) because old finalize null-skip (`if (agg.gross_profit !== null)`) never cleared stale legacy pdf-parse value when aggregator correctly returned null for bank (no code "20").

**3-case update logic (generalized):**
- Case 1 NOT-APPLICABLE: `notApplicable[]` from aggregator → SET NULL explicitly → clears stale legacy values (bank gross_profit, current_assets, gross_margin_pct).
- Case 2 EXPECTED-BUT-NULL: corporate gross_profit miss → SKIP → preserves prior value (FU-5 intent intact).
- Case 3 RESOLVED non-null: SET value (unchanged).

**notApplicable enum:**
- BANK (isBankPath = code "10" absent): gross_profit, current_assets, gross_margin_pct.
- CORPORATE: [] (symmetric audit — nothing bank-has-that-corps-lack at this time).
- isBankPath detection: same branch aggregator already uses for fallthrough to code "I" path — DRY, no second detector.

**Changes:** `bctcScalarAggregator.ts` (add `notApplicable: string[]` to `ScalarAggregateResult`, populate on bank path); `finalizeBctcRefineTool.ts` (3-case update, single combined UPDATE statement).

**Anti-false-green tests:** FU-6e-not-applicable-clear.test.ts — 6 pass / 45 expect() calls. Log confirms: ACB null_cleared_cols=["gross_profit","current_assets","gross_margin_pct"], FPT null_cleared_cols=[]. All prior 50 tests (FU-5/5b/6c/6d) still green. tsc --noEmit EXIT 0.

**ops_rebuild_required: true** — rebuild mcp-server + re-finalize ACB (fea19bae) [expected: gross_profit=NULL, gross_margin_pct=NULL] + re-finalize FPT (e8ea3df5) regression-confirm [gross must stay 4,244,890 NOT nulled] + recompute eval, QA final re-gate.

---

## c344 · 2026-05-31 (FU-TRUST-REFRESH FU-6d) — COMMITTED 88a07bb4

**Task:** FU-6d — generalize all 3 bank-path scalar resolution bugs (BLOCK-A/B/C from QA TASK_REPORT_FU-4-REGATE)

BLOCK-A: null-valued section header wins equity pick → `findByLabel`/`findByLabelExcluding` now prefer non-null candidates globally.
BLOCK-B: Roman code VIII/IX collision → `P_BANK_CODE_VIII_PBT_HINT` + `P_BANK_CODE_IX_NET_PROFIT_HINT` labelHints added; labelHint made STRICT (no match → null); P_PBT regex fixed for two-codepoint "ướ".
BLOCK-C: `enforceBalanceIdentity` fails open on null equity → now returns "REQUIRED SCALARS UNRESOLVED" when any of {total_assets, total_liabilities, equity_total} is null but not all.

**Gates:** tsc EXIT 0 | 27 pass / 0 fail | RED→GREEN proven | ops_rebuild_required: true (ACB+FPT re-finalize)

---

## c343 · 2026-05-31 (FU-TRUST-REFRESH FU-6c) — COMMITTED 736cac22

**Task:** FU-6c — bctcScalarAggregator root-cause fix: label-canonical + balance-identity invariant

Fixed: FPT code-280 total assets (not code-270), ACB equity exclusion, ACB code "I" collision. Introduced `balanceViolation` field in `ScalarAggregateResult`. 7 DV tests RED→GREEN. All FU-5/FU-5b still green.

**Gates:** tsc EXIT 0 | 38 pass / 0 fail | ops_rebuild_required: true

---

## c342 · 2026-05-31 (FU-TRUST-REFRESH FU-5b) — COMMITTED bfd25762

**Task:** FU-5b — parseVnNumber parens-negative fix + fail-loud one-pass audit

Fixed: parens-negative rows (COGS, some equity lines) silently dropped → retained with value_current=null + [UNPARSEABLE] log. 23 DV tests. ops_rebuild_required: true.

---

## c341 · 2026-05-31 (FU-TRUST-REFRESH FU-5) — COMMITTED 6cc75437

**Task:** FU-5 — BLOCK-1 scalar backfill + BLOCK-2 eval recompute in finalizeBctcRefineTool

New: bctcScalarAggregator.ts (domain pure). Modified finalizeBctcRefineTool.ts: dynamic SET UPDATE + computeBctcEval inline. 8 DV tests. ops_rebuild_required: true.

---

## c325–c340 (pruned) — see git log for details

Key sprints: MACRO-CMDTY-DELTA (c340), DYN-WF-FOUNDATION DWF-DEV-MCP-1 is_trading_day (c339), BCTC-TRUST-RED (c338 — DT-1/2/3/4 validators), BCTC-AI-INPUT-TAB (c335–c336), BCTC-HUMAN-CONFIRM HC-DEV-1→7 (c330–c335), BTB-PERSIST-FIX (c327), DPI-FU-A/B (c328), TOOL-SURFACE-HYGIENE TSH-2/3/4 (c341).

---

## Working Memory

### Active Sprint: FU-TRUST-REFRESH
- FU-6e DONE: committed b63d7988; ops_rebuild_required: true
- Next: ops (rebuild mcp-server) → re-finalize ACB (fea19bae) + FPT (e8ea3df5) → QA final re-gate

### Baselines
- tool=157, sched=70 (from c339)
- Pre-existing: bctcRefineJob.ts 2 tsc errors + get_price_history test fail (cron_job_runs missing) — not caused by FU-TRUST-REFRESH changes

Zone: `apps/mcp-server/` | Stack: TS/Bun | DB: market.db
Archive: `docs/archive/notebooks/dev-mcp-server-2026-05-21.md`
