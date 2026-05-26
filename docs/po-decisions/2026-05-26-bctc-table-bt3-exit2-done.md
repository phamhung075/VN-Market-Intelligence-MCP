# PO Decision — BCTC-TABLE-3 SIGNED OFF / SPRINT CLOSED (BT3-EXIT2)

**Date:** 2026-05-26T00:12Z (UTC)
**Author:** PO (full autonomy)
**Sprint:** BCTC-TABLE-3 → BT3-EXIT2
**Severity:** CRITICAL (reliability tier — user's stated goal)
**Decision type:** Final sign-off + sprint close

---

## User goal (now MET)

`http://localhost:3000/api/bctc-inspect` presents a CORRECT, clean detected balance-sheet table for the user to recheck. User mandate (`/goal`): *"bctc can extract correct result table for analyze."*

- report_id = `e71f845d-ffa5-48f9-8f09-30ac2cd09c65`
- PDF = FPT consolidated balance sheet, Q4 2025

**The user has been shown the corrected live table.**

---

## Verdict: DONE — SIGNED OFF

BT3-FIX5 (commit `81970243`, dev-pdf-extractor) — the **7th attempt and the one that finally held** — resolved both the live BCTC table scramble and the BT3-FIX4 false-green. QA BT3-QA2 = **APPROVED** (commit `9f829289`, report `reports/TASK_REPORT_BT3-QA2.md`), all 11 acceptance criteria honest-green. Main terminal independently re-verified the LIVE endpoint plus a direct in-container DB count.

---

## Chain summary (FIX4 false-green → RETHINK → FIX5 → DEPLOY2 → QA2 PASS)

1. **BT3-FIX4 false-green #6** — DONE was measured on the SPIKE PyMuPDF OCR fixture; LIVE poppler OCR showed 95 rows / 23 orphans, 6 embedded codes absent, header/date/signature junk surviving. The architect's own FIX4 ruling false-greened against the same fixture.
2. **Recurring-bug escalation** — `text_table_extractor.py` carried 5 `fix(` commits in 30 days AND the architect's ruling false-greened → per `feedback_recurring_bug_escalation.md`, BLOCK + escalate to architect for a root-cause rethink (no more blind dev patches).
3. **BT3-RETHINK** (architect, DESIGN-ONLY) — filter-strategy ruling: **POSITIVE-keep + positional-cutoff** (retire the negative skip-list as primary filter), **diacritic-insensitive `_norm()`** (NFD + strip Mn + uppercase), **Layout-5 structural code-finder** for embedded codes, and **AC-0**: the test fixture MUST be regenerated from the LIVE poppler OCR substrate. Brief: `docs/architecture-briefs/2026-05-26-bctc-table-bt3-rethink-filter-strategy.md`.
4. **BT3-FIX5** (`81970243`, dev-pdf-extractor) — implemented the ruling exactly; fixture regenerated from live poppler OCR; 285 unit tests pass (incl. 32 new diacritics tests); Fence-A/B kept.
5. **BT3-DEPLOY2** (ops) — image rebuilt + container recreated; single-doc re-extract of ONLY e71f845d (no batch backfill, host kernel-panic guard); 3 markers verified live.
6. **BT3-QA2** (`9f829289`, qa) — PASS/APPROVED; live endpoint row-by-row + in-container DB count; all 11 ACs green; forbidden-gate compliance confirmed.
7. **BT3-EXIT2** (po, this decision) — independent re-verification matches QA; signed off; sprint closed.

---

## Final verified state — report_id `e71f845d-...` (FPT Q4 2025 balance sheet)

- **79 rows, 0 orphans, 0 duplicate codes, 0 NULL value_prior** (except code 418, accounting-valid: development-investment fund fully disbursed in Q4 2025, prior populated).
- **Sentinels exact + label-aligned:** 100=58102970741619, 270=88089621779862, 300=44338155487272, 400=43751466292590, 440=88089621779862.
- **6 embedded codes recovered & code-split:** 222 / 223 / 226 / 131 / 319 / 421b.
- **balance_delta=0:** total_liabilities (44338155487272) + total_equity (43751466292590) = total_assets (88089621779862).
- **Two labels (code 134, code 317)** OCR-garbled TEXT but correct code+values — accepted as a local-Tesseract character-quality blemish (cloud OCR forbidden by privacy rule), NOT a structural fault.
- **ROOT CAUSE of the 6 prior false-greens eliminated:** the test fixture now uses the LIVE poppler OCR substrate (Ruling D / AC-0), not the spike's PyMuPDF OCR.

---

## Privacy audit

Self-hosted local OCR only (poppler/Tesseract). Zero off-infra send. QA confirmed zero `process.env`, zero credentials, no new external I/O in the modified file. **PASS.**

---

## Key durable lesson (binding for future BCTC / OCR-parse work)

**Positive-keep + positional-cutoff + diacritic-insensitive matching + embedded-code recovery BEAT the literal negative-skip-list.** A negative skip-list can never enumerate arbitrary OCR garbage and silently fails on diacritic variance between rasterizers (poppler vs PyMuPDF). The single mechanism behind all 6 false-greens was an **OCR-substrate mismatch in the test layer** — the fixture used spike PyMuPDF OCR while production uses poppler. Therefore:

- **AC-0 is mandatory:** the test fixture MUST be generated from the LIVE production OCR substrate (poppler), never the spike's (PyMuPDF).
- **`balance_pass` — and every other proxy (row count, badge, fixture-green, `rows_stored` echo) — is FORBIDDEN as the sole acceptance gate.** Acceptance is the LIVE endpoint, inspected row by row. This was the 3rd false-green on this exact surface; proxy-trust is the recurring trap.

---

## Follow-ups (non-blocking, post-goal)

- **Sprint MCPZONE-HARDEN-1** (NEW, dev-mcp-server, scheduled in `docs/TASKS.md`): (a) `pushBctcTableHandler.ts` returns input-echo `rows_stored` not a DB-verified count — the false-success that masked the write-wedge; (b) a test wrote to the live `/app/data/market.db` and seeded the clobbering "Test Row" — test-isolation breach. Both routed to dev-mcp-server in a future sprint.
- **Sprint BCTC-TABLE-2** (already OPEN): wider multi-ticker / quarterly coverage residuals. Stays open, non-blocking, below current reliability + scale-pilot work.

---

## Files written this cycle (UNSTAGED — main terminal commits)

- `docs/SPRINT_GOAL.md` (BCTC-TABLE header → DONE / SPRINT CLOSED; prior RETHINK header collapsed into `<details>`)
- `docs/TASKS.md` (BCTC-TABLE-3 status → CLOSED; BT3-RETHINK ladder rows → DONE; deferred note → MCPZONE-HARDEN-1; NEW Sprint MCPZONE-HARDEN-1 section)
- `docs/handoffs/TASK_BCTC-TABLE.md` (§ [dev/ops/qa] closure records + § [PO] BT3-EXIT2 — SPRINT CLOSED)
- `docs/po-decisions/2026-05-26-bctc-table-bt3-exit2-done.md` (this file)
- `docs/agent-memory/notebooks/po.md` (notebook, committed separately)

Constraints honored: NO commit-mutex acquired; all files left UNSTAGED; frozen pilot surfaces (`apps/pdf-extractor/dashboard/*`, `sandbox/runner.py`, `docs/data/pilot-status-pdf-extractor.json`) NOT touched; all on `main`, no branches, no `git push`.
