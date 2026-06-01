# QA — Notebook

## Archive (cycles ≤159)

Full detail available via `git log docs/agent-memory/notebooks/qa.md`.
Key milestones: cycle-159 BCTC-TRUST-RED APPROVED | cycle-157 AIT-QA APPROVED | cycle-156 HC-QA-3 APPROVED | cycle-153 AR-QA bake-off APPROVED.

---

**Binding:** Active cycle only (≤200L). Historical detail in git log.

---



## cycle-177 · 2026-06-01 · PROSE-TEXT-LOSS — Task #18 — APPROVED

Sprint: PROSE-TEXT-LOSS | Task: #18 PROSE-DEV-1 | Verdict: APPROVED
Commit: a10448b0 (fix) | 3 files changed

G1 TSC: 0 errors (full bun tsc --noEmit clean). G2 DV suite 5/5 PASS; DV-1 genuinely RED before fix confirmed via git diff (pre-fix: text_content:"", confidence:0 hardcoded in coverage-gap branch; new SELECT from pdf_extracted_text was not present — not a tautology). G3 Neighboring suites: pek-render-seam 12/0, 1271-bctc-inspect-md + 1273-bctc-inspect-overlay 16/0 — all green. G4 LIVE-SERVE: FPT doc e8ea3df5 page 1 → text_content 2081ch (pek_coverage_gap:true), page 2 → 134ch confidence:0.8 — non-empty confirmed. G5 Image SHA 33e4386c confirmed (new vs prior 4446a6e9, built 2026-06-01T17:17Z). DDD: interface→application import pre-existing (correct layer); no new imports. Security: no process.env, no secrets, no hardcoded creds.

## cycle-173 · 2026-05-31 · NB-PRUNE-1 — NB-PRUNE-FIX — APPROVED

Sprint: NB-PRUNE-FIX | Task: NB-PRUNE-1 | Verdict: APPROVED | Commit: 7166db01 (skill-only)
Fixtures: Session 5871L/69s→344L/3s (AC-5 guard fires); ISO-ts 316L/30s→27L/3s ≤200L; c-fmt 166L/12s→8L/3s ≤200L.
Preamble preserved: ISO+c-format confirmed. Exactly-3 no-prune: confirmed. Fenced ## over-count: theoretical only (0 live). TODO po/developer contradiction: deferred (po.md=26L). Skill 104L ≤120L cap. NB-PRUNE-1 → DONE in TASKS.md.

---

## cycle-179 · 2026-06-01T19:35Z · TSH-6/TSH-1/TSH-5 LIVE RAW GATE

Sprint: TSH (Tool-Surface-Hygiene) | Tasks: TSH-6, TSH-1 surface re-verify, TSH-5 stat reconcile | Date: 2026-06-01

**TSH-6 (kinh-dich honest-omit) — PASS**
AC1/AC5 live: `get_market_snapshot` (no codes) ends at "Generated: 2026-06-01T19:34:44Z" — NO trailing "Kinh Dịch: Chưa đủ dữ liệu" line. Stock path (codes:["FPT"]) same: clean output, no fallback. :5005 unreachable → omit block confirmed in production.
AC3 code-review 3 sites all correct: marketTools.ts appendMarketHexagram/appendStockHexagram + analysis.ts appendStockHexagramHttp — each catch(error){logger.warn(real cause); return baseOutput;} — zero bare catch{}. 200-path data-short guard (!reading.hexagram||!reading.name) still emits honest VN line. No silent-swallow.
AC4 tsc: 0 errors (bun tsc --noEmit exit 0, no output).

**TSH-1 surface re-verify — PASS (get_market_hexagram ABSENT, count=154)**
`tools/list` via node SSE client: LIVE_TOOL_COUNT=154, HAS_GET_MARKET_HEXAGRAM=false. KD tools present: explain_hexagram, get_hexagram_history, get_kinhdich_reading, run_hexagram_backtest (5th = get_transition_probabilities also present). /health toolCount=154 is NOT a stale cache — it IS the correct post-TSH-1 count (pre-TSH-1 was 155, TSH-1 removed 1 → 154). TSH-1 is genuinely done.

**TSH-5 stat reconcile — PASS (already done, no edit needed)**
project-stats.json already shows toolCount=154 (both top-level and infrastructureStatus) from commit 643d4619. Live count matches. No edit required.
