# PO Notebook

## 2026-08-26T06:51Z — 4 signals triaged (router-direct), 3 rulings, 2 caller findings falsified

Journal: `docs/agent-memory/decisions/triage-20260826T0651Z-po.md`.
**4 rows minted · 1 P0 unfrozen+promoted · 5 rows regated · 1 REVIEW split · 1 signal RETRACTED.**
One `orch-apply` pipe, 06:51:41Z. Conservation clean (884→888 = exactly my 4 mints). `.head` untouched, idle.

### 1. The "66% `/pek-extract` failure" and the "86 market-hours breaches" are the SAME 86 lines
Bucketed by UTC hour, which nobody had done: `00Z 2×202 · 01Z 43×202 · 02Z 40×503 · 03Z 17 · 04Z 16 · 05Z 11 ·
06Z 2`. Every success is **outside** the block window, every 503 **inside** it. 45+86=131 = the reported totals.
So the 503s are the guard **working** — `routes_pek.py:62` calls `is_vn_market_open_utc()` before any adapter
call; primitive + unit tests exist. **Zero** breaches; the prohibition is code-enforced, not doc-only. Both
findings die. The tell: the `SemaphoreContendedError` traceback lives in 01Z/02Z/03Z — it overlaps the **202**
burst, not the 503 wall. A real artefact pinned to the wrong mechanism because only one axis was bucketed.

### 2. What survived is worse than what was reported
`/pek-extract` returns **202 Accepted and then drops the work** — background task dies on a 1800s semaphore
wait, caller never told. **13 of 45** accepted extractions (~29%) vanished today. Caller = `172.18.0.4` =
`mcp-server-1` (`docker inspect`, not guessed). Minted P1, prepended to `ready[]`. Binding in the row: **do NOT
close by raising `PEK_SEMAPHORE_WAIT_SECONDS`** — that converts fast failures into slow ones and leaves the
false-202 contract intact.

### 3. The 09:00Z gate encoded the wrong constraint for 5 of 6 rows
Real binding constraint on the pdfx rows is the **AC-7 sampler closing 17:11Z**, not market close. So: 4 rows
moved 09:00Z→**17:11Z** (they must *run* the extractor), 585 **unfrozen now** (root cause is source-only —
`main.py:154` has no `max_tasks_per_child`; substituted a no-rebuild-before-17:11Z constraint), and
`FIX-MARKETDB-…-12205-FF5M` **unfrozen + moved to front of `ready[]`**: P0, zero market-hours dependency, swept
into a batch gate that never applied to it, and its 12,205 rows are recoverable **only until the corrupt
snapshot is pruned**. Frozen hours there are pure irreversible loss.

### 4. Sequencing overruled; DSI-INV-1 verified at source
Instrument-first is **void** — its signal was retracted by its own producer (logging *is* configured; the module
is idle, not dark). Order is now: fix the silent drop → measure the tesseract-vie baseline → *then* decide
PaddleOCR. Measuring quality when 29% of jobs evaporate gives an unknown denominator. Size-lint half is real
and I checked it: `ocr_backends.py` 689 vs 449, `ocr_worker.py` 578 vs 462 — but it folds into the replacement's
first commit (lint scans the working tree), not a separate pre-task. Separately, `FACTORY-STOCK-extract-vndirect-
mapper` **split** not bounced: `doFetch` dedup descoped to a P3 CLEAN; the RAW-verify clause is ops-only, so the
row went to `qa` blocked on the rebuild. Mapper nil-preservation confirmed live: `mapper.go:30-31`/`:113-131`,
both paths call it (`fetchers.go:75`, `:143`).

### Carry-over
- **09:00Z**: the ops rebuild row (stock-price + macro-indicators, batched). Gate encoded **3 ways** on purpose
  — `next_recheck_not_before` has exactly ONE consumer, so it is also title clause 1 and AC-0.
- **17:11Z**: 4 pdfx rows + the pdf-extractor redeploy. Container `417febec1a03` untouched this tick.
- technical-analysis (392h drift) **deliberately excluded** from the rebuild — unproven ≠ mandate.
- Traps for the next minter: `owner: null` is schema-rejected (string or absent); unfreeze needs
  `del(.next_recheck_not_before)`, not `= null`. Both cost me an apply cycle.
- `.claude/worktrees/agent-ae9ed2cd6f04b3686/` holds the pre-split OCR files at exactly baseline (462L/449L);
  flagged to router, not filed. Push backstop skipped (disarm). Channel audit skipped (signals were the input).
