# PO Decision — BT3-FIX4 Revoked (False-Green #6) → Recurring-Bug Escalation to Architect (BT3-RETHINK)

**Date:** 2026-05-25T23:29Z (UTC)
**Author:** PO (full autonomy)
**Sprint:** BCTC-TABLE-3 → BT3-RETHINK
**Severity:** CRITICAL (reliability tier — user's stated goal still UNMET)
**Decision type:** Block + escalate (recurring-bug-escalation rule)

---

## User goal (still UNMET)

`http://localhost:3000/api/bctc-inspect` must present a CORRECT, clean detected balance-sheet table for the user to recheck.
- report_id = `e71f845d-ffa5-48f9-8f09-30ac2cd09c65`
- PDF = `/app/data/pdfs/20260126-FPT-BCTC-hop-nhat-Quy-4-2025.pdf` (FPT consolidated balance sheet, Q4 2025)

---

## Verdict: BT3-FIX4-PARSE DONE is REVOKED — FALSE-GREEN #6

The container WAS rebuilt and FPT Q4 WAS re-extracted (pdf-extractor created 2026-05-26 01:08, healthy; CHANGE-2 `[a-z]?` regex + CHANGE-4 junk-list confirmed deployed). So the dev work shipped and the orphans are the HARDENED parser's output, not a stale image. The problem is that it shipped the WRONG STRATEGY and was verified on the WRONG SUBSTRATE.

### The false-green mechanism (proven)

- dev's BT3-FIX4-PARSE "DONE" evidence (handoff) reads: *"Zero orphan rows, value_prior 78/78=100%, total fixture rows 79"* — measured against fixture `fpt_q4_2025_pages_4-7.txt`, which is **SPIKE PyMuPDF OCR** (clean "421b", "tháng" with diacritic).
- The architect's RULING (handoff § BT3-FIX4-PARSE, "orphan floor 1-2, hard AC ≤5") was authored against that same fixture.
- PRODUCTION uses **poppler OCR** — different diacritics + signature-area noise.

### PO independent live verification (anti-hallucination — did NOT trust the dev claim)

```
GET http://localhost:3000/api/bctc-inspect/table/e71f845d-...   (live, poppler OCR substrate)
  total rows: 95     ORPHANS (code=null): 23     DUP codes: none
  value_prior NULL: 23 (= the 23 orphans)        balance_delta: 0   balance_pass: true
  sentinels EXACT, label-aligned:
    270 = 88,089,621,779,862   100 = 58,102,970,741,619
    300 = 44,338,155,487,272   400 = 43,751,466,292,590
  codes 222/223/226/131/319/421b: ABSENT-or-orphan
  orphan examples:
    row1  "BANG CÂN ĐỐI KẾ TOÁN HỢP NHẬT"            (header — diacritics-mismatch skip-list miss)
    row27 "Tai ngày 31 thang 12 năm 2025"            (date — "thang" no diacritic defeats `ngày..tháng` regex)
    row28 "minh" / row12 "hợp đồng xây dựng :"        (signature/garble — skip-list can't enumerate)
    row9  "1. Phải thu ngắn han của khách hàng 131 7 12.733.504.688.522"  (embedded code 131 + note-ref "7", never split)
```

Fixture = 79 rows / 0 orphans. LIVE = 95 rows / 23 orphans. `balance_pass=true` + the 4 sentinels are REAL, but the badge is NOT the gate — trusting it is the 6th false-green (`feedback_fence_false_green`).

---

## Why BLOCK, not another dev patch

`apps/pdf-extractor/infrastructure/text_table_extractor.py` carries **5 `fix(` commits in 30 days**:
`210a0a62` (BT-7) · `1ab1f7a6` (BT3-FIX) · `3e47ccf3` (BT3-FIX-2) · `8dbb19e3` (BT3-FIX-3) · `c66a7ff7` (BT3-FIX4).

The ≥2 threshold is crossed many times over AND the architect's OWN FIX4 ruling false-greened. Per `feedback_recurring_bug_escalation.md`: **DO NOT assign another symptom fix to the developer — escalate to architect for a root-cause / architectural rethink.** This is no longer a regex-tweak problem; it is a FILTER-STRATEGY architecture problem.

---

## Decision

1. **REVOKE** the BT3-FIX4-PARSE DONE. (The code stays deployed; the sign-off is withdrawn.)
2. **BLOCK** any further dev patch to `text_table_extractor.py`.
3. **ESCALATE to architect (BT3-RETHINK)** — DESIGN ONLY — to rule on the FILTER STRATEGY:
   - **(A)** negative-skip-list (proven inadequate) vs **POSITIVE-keep** (row emitted only with a valid code OR a recognized BCTC section label) vs **POSITIONAL-cutoff** (drop everything after the last summary code 440/270) vs combination — justified against the 3 LIVE poppler-OCR root-cause classes, not the spike fixture.
   - **(B)** embedded-code split — replace layout-specific regexes with a structural code-finder (find a 2-3-digit[a-z]? token anywhere → split label-left / note-ref-and-values-right)?
4. **Then** dev-pdf-extractor (BT3-FIX5) implements the ruling, ops (BT3-DEPLOY2) redeploys + re-extracts only e71f845d, QA (BT3-QA2) verifies the LIVE endpoint row-by-row, PO (BT3-EXIT2) signs off after independent live re-verification.

## Binding acceptance bar (BT3-QA2 / BT3-EXIT2)

Acceptance is the LIVE endpoint `GET /api/bctc-inspect/table/e71f845d-...`, row-by-row. `balance_pass` ALONE is FORBIDDEN as the gate. All of:
- orphans (code=null) ≤ 2
- ZERO header / date / signature junk rows
- codes 222 / 223 / 226 / 131 / 319 / 421b PRESENT and code-split with their values
- the 4 sentinels still EXACT (270 / 100 / 300 / 400 above)
- value_prior populated on data rows
- no duplicate codes
- balance_delta = 0

## Hard constraints (whole chain)

- **Fixture regeneration:** the FIX4 fixture MUST be regenerated from LIVE poppler OCR (not spike PyMuPDF). Hard AC on BT3-FIX5 — otherwise the next fix false-greens identically.
- **Host kernel-panic risk** (`project_host_memory_panic`): single-doc OCR only, sequential. NEVER run `bctcBatchTableBackfillJob` for verification. Re-extract ONLY e71f845d via `POST http://localhost:5001/extract-tables`.
- **Privacy (non-negotiable):** self-hosted local OCR only (Tesseract/poppler). NEVER send the PDF or page-images to any third-party API.
- **Frozen pilot surfaces:** `apps/pdf-extractor/dashboard/{index.html,traces.js,trust-contract.spec.js}` + `sandbox/runner.py` + `docs/data/pilot-status-pdf-extractor.json` — NOT touched.
- **Commits:** subagents leave changed files UNSTAGED + list exact paths in RETURN; main terminal commits explicitly (`git reset -q` → `git add <exact paths>` → `git show --stat HEAD` zero foreign). All on `main`, no branches, no `git push`.

## Deferred (note only — do NOT block the goal; separate dev-mcp-server task AFTER goal is met)

- (a) `pushBctcTableHandler.ts` returns `rows_stored: rows.length` (input echo, not a DB-verified count) — the false-success that masked the write-wedge. Fix: return the real DB COUNT after insert.
- (b) a test writes to the LIVE `/app/data/market.db` and seeded the clobbering "Test Row" — test-isolation breach. Fix: tests use an isolated/in-memory DB.

## Carry-over for future-me (BT3-EXIT2)

This is the 3rd false-green on this exact surface. The trap each time = trusting a proxy (count, badge, OR fixture) instead of the live row body. BT3-EXIT2 MUST curl the live endpoint and inspect ROW COMPOSITION directly — never the fixture, never `balance_pass` alone.

## Files written this cycle (UNSTAGED — main terminal commits)

- `docs/SPRINT_GOAL.md` (BT3-RETHINK header; prior reopen collapsed into `<details>`)
- `docs/TASKS.md` (BCTC-TABLE-3 status → BT3-RETHINK; old ladder superseded; new ladder + constraints)
- `docs/handoffs/TASK_BCTC-TABLE.md` (§ [PO] BT3-FIX4 REVOKED → BT3-RETHINK — full ruling request + chain + hard constraints + deferred)
- `docs/po-decisions/2026-05-26-bctc-table-bt3-fix4-false-green-rethink.md` (this file)
- `docs/agent-memory/notebooks/po.md` (notebook, committed separately)
