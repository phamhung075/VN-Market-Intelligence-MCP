# PO Notebook

## Cycle 2026-05-28T~00:05Z — SPEC-REVIEW GATE: NEWS-FULLDAY + RECAP-CMD (both APPROVED)

**Two sibling specs returned from BA, reviewed together (critique-before-approve, not rubber-stamp).**
Both single-zone `apps/mcp-server`, owner dev-mcp-server, NOT scale pilots, share one asset (`stripHtml`).

**Verified load-bearing code claims live BEFORE ruling (the render contract is only enforceable if fields are real):**
- `stripHtml` ABSENT everywhere in `apps/mcp-server/src` → NEWS-FD defines it once, greenfield, no collision.
- `handleNews` L510, `chunkStories` L480, `DEFAULT_LIMIT=20` L511, `MAX_LIMIT=50` L513, HELP "mặc định 20 bài" L77, `handleTelegramCommand` L612 — all confirmed where NEWS-FD claims.
- `EveningSummary` (L97) + `PeriodicSummary` (L53) — EVERY field RECAP-CMD §3 renders from EXISTS. The BANNED `summaryText` (English prose) + `recommendation.confidence` (numeric) genuinely present → ban is enforceable, not phantom. `keyEvents{date,title,impact,direction}` shape confirmed.
- B2 worry real: `assembleEveningSummary` `writeFileSync`/`reportsDir` (L831-833) + `{db}` overload (L355); `generatePeriodicSummary(type,end?,db?)` L610 → B2 is a genuine test-mechanism question.

**5 gate axes PASS both specs:** (1) ACs testable (concrete seed+assertion per T-ID); (2) plain-VN render contract enforced (no impact_score number / English / jargon / HTML / summaryText); (3) empty-state strings present verbatim; (4) test matrix happy/empty/chunk-boundary, in-mem Bun SQLite + injected fakes, no creds/network; (5) nothing silently dropped.

**B1/B2 ruling:** NEWS-FD B1 (remove LIMIT vs ceiling) = architect call. **NEWS-FD B2 product half ANSWERED by me (recorded REQ §5): fallback IS capped (stale multi-day dump = UX defect), architect picks only the number.** RECAP B1 (block>4096 split) + B2 (wrapper vs in-mem DB) = both genuine architect calls, no PO product decision owed. **No conflict** (shared `stripHtml` defined in NEWS-FD reused in RECAP; HELP_TEXT edits non-overlapping; one dev pass + one ops rebuild).

**Deliverables:**
- `docs/REQ_NEWS-FULLDAY.md` — Status→APPROVED, B2 product ruling in §5, verdict §12 (UNSTAGED).
- `docs/REQ_RECAP-CMD.md` — Status→APPROVED, verdict §16 (already COMMITTED by serialized router — HEAD==WT).
- `docs/TASKS.md` — NEWS-FD-BA + RECAP-BA → APPROVED; inserted NEWS-FD-ARCH + RECAP-ARCH (PENDING, sibling-batched) (UNSTAGED).

**GOTCHA this cycle:** concurrent SIG dev-chain was hot-writing TASKS.md (SIG-G-T1..T4 flipped DONE mid-review). Edit tool optimistic-lock failed 3x on mtime despite zero content collision. Resolved with a single atomic python read-substitute-write (count==1 assert per anchor) — landed both rows, SIG rows intact. Pattern for next time: under concurrent TASKS.md writes, prefer one atomic substitution over Read→Edit.

**NEXT: architect** — ONE pass covers BOTH sprints. **PIPELINE: continue.**

## Carry-over
- **NEWS-FULLDAY + RECAP-CMD both APPROVED, at architect.** ONE architect pass (same zone, same `telegramCommands.ts`, shared `stripHtml`) → pm → dev-mcp-server (single dev pass) → ops REBUILD+force-recreate → qa LIVE on zenmidi.com/vn-market/webhook → NEWS-FD-EXIT + RECAP-EXIT. Both ARMED until QA live + user G9 (lane-c comprehensibility).
  - NEWS-FD architect confirms: B1 (remove SQL LIMIT vs large ceiling), B2 (fallback-cap NUMBER only — capped is decided), dedup+strip pure in-handler (no schema/index), `MAX_LIMIT_EXPLICIT` for `/news N`.
  - RECAP architect confirms: lock VN section labels (§3), B1 (block>4096 split), B2 (wrapper vs in-mem DB given writeFileSync side-effect). Render from TYPED objects only — NEVER summaryText/buildSummaryText (English+jargon).
- **SELF-IMPROVE-GATE Phase 2:** SIG-G-T1..T4 now DONE (committed ef109a76, concurrent). SIG-G-T5 (per-path kill-switch C-4) PENDING → SIG-G-REBUILD (ops) → SIG-G-T6 (qa GATE-PROOF subject-code inject, AC-T6-5 false-green firewall). Watch SIG-G-T4 NOTE: emit path proven by unit mocks, NOT yet end-to-end (SIG-EXIT condition X-1). Human-reserved: GLOBAL auto-dispatch flip, gate self-edit, un-pause 1948 OBSERVE, comprehensibility (lane-C).
- **MACRO-LIVE-PRICES** (sprint MLP) at architect (MLP-ARCH, data-source A/B/C). Zone apps/macro-indicators. False-green guard: verify via `call_tool get_macro_snapshot`, NOT direct :5004 curl.
- **PEK-RENDER goal ARMED until USER G9.** Round 6+ — QA RED on render seam → escalate architect, no blind patch. PDF-Extract-Kit/ pristine; CPU-only/8GB; DB verify = in-container bun readonly COUNT.
- Channel audit (MARKET/WORK/BUG via gateway) owed → main terminal next cron tick (PO subagent has no call_tool).
- All files UNSTAGED except where already committed by router — main terminal commits (serialized, no -A, no push, main branch).
