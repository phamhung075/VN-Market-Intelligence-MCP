# PO Notebook

## Cycle 2026-05-27T21:00:06Z — PEK-RENDER-DESIGN deliberation gate → APPROVE-WITH-CONDITIONS

**Input:** Main terminal CONTEXT — red-team the committed PEK-RENDER-SEAM brief
(`docs/architecture-briefs/2026-05-27-pek-render-seam.md`, f02d4022), approve/reject, on approval dispatch dev chain.

**VERDICT: APPROVE-WITH-CONDITIONS.** Option A (repoint inspector readers to PEK `bctc_layout_units` SSOT)
is the correct root-cause fix. Option B (PEK writes old tables too) would PERPETUATE the dual-write drift that
IS the bug — architect correctly rejected it. Architecture half does NOT re-spin.

**5-axis critique, written BEFORE verdict (full text in handoff PO gate record):**
- break=LOW (write paths untouched → `bctc_table_rows` non-regression is structural; `json_each` OK; trigger grep-absent)
- false-green=**GAP→C-1**, gameability=**GAP→C-2**, host-load=OK→**C-3**, design-integrity=sound.

**Grounded in live code:** `bctc-inspector.html:740-749` OCR render has ZERO freshness signal; existing
`ocr-sync-note` (770-778) is the banner precedent. `/api/trigger-pek-extract` grep-confirmed ABSENT. 503 guard
live at `handlers.py:403`. `CRON_BCTC_REPARSE_JOB=0 21 * * *`. `has_pek`/`bctc_layout_units` not yet read by handler.

**3 binding conditions (downstream acceptance criteria, not advisory):**
- **C-1** (dev-mcp-server+qa): VISIBLE stale banner on `has_pek:false`, not just JSON flag — the RECURRENCE axis;
  user's "old data" bug returns if a re-extract is incomplete and the panel silently renders stale `text_content`.
  QA must force a `has_pek:false` response and confirm the banner renders. JSON-flag-only green REJECTED.
- **C-2** (qa): all-12 corpus `has_pek:true`+fresh `extracted_at`≥2026-05-27 (or documented VCB 404), NOT FPT alone.
- **C-3** (ops): window-bounded SEQUENTIAL re-extract (09:00 UTC close → next 02:00 open), STOP+RESUME across windows,
  503 is backstop not scheduler, RSS < 8GB. Current UTC 21:00 → ~5h window tonight.

**Docs touched (UNSTAGED — main terminal commits):** TASKS.md (Status header + 3 Round-6 rows w/ C-1/2/3 +
gate Note), TASK_PEK-INTEGRATE.md (PO deliberation-gate record), this notebook. NO code, NO agent/flow `.md` edits.

**NEXT:** dev-mcp-server (PEK-RENDER-MCP, 4 files, +C-1) ∥ dev-pdf-extractor (PEK-RENDER-PDFX, verify-only).

## Carry-over
- **PEK-RENDER goal ARMED until USER verbal G9.** Acceptance = FPT `e71f845d` OCR+table panels render FRESH
  multi-page PEK data (`has_pek:true`, NOT 2026-05-26) + C-1 banner + C-2 all-12. Chain: PEK-RENDER-MCP/PDFX →
  DEPLOY (rebuild mcp-server + re-extract 10 non-VCB) → QA → EXIT → G9. PEK is Round 6 / 6+ fix commits — if
  QA comes back RED on the render seam, escalate to architect AGAIN (no blind patch); seam now correctly IDed.
  HARD: PDF-Extract-Kit/ pristine; git add never -A; CPU-only/8GB; FROZEN surfaces; re-extract off HOSE hours;
  DB verify = in-container bun -e readonly COUNT, never push-echo.
- **SELF-IMPROVE-GATE** Phase 2 LIVE: SIG-IMPL-GATE READY → ba (lane-b proven-gate shadow-mode code, apps/mcp-server).
  C-4 per-path-default-false kill-switch = HARD QA gate. SIG-EXIT BLOCKED. Human-reserved (NOT authorized): global
  auto-dispatch flip, gate-logic self-edit, un-pausing 1948 prod gates.
- **CHEF-ATTN** BA spec READY (apps/mcp-server) — eligible to dispatch next triage.
- **NEWS-CMD** CLOSED (build); USER G9 owns comprehensibility axis. NEWS-CMD-HTML-STRIP backlog LOW.
- Channel audit (MARKET/WORK/BUG via gateway) owed → main terminal next cron tick (PO has no call_tool).
- All files UNSTAGED except PO doc edits — main terminal commits.
