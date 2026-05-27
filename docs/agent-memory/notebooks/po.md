# PO Notebook

## Cycle 2026-05-27T20:36Z — dev-team :07 triage → BATCH(2)

**Pre-flight:** TNB c81 ACK'd (+ c80 retro-ACK) in tnb-audit-latest.md; 2 NEW ## po dashboard rows → READ.
project root resolved; gateway call_tool unavailable in PO toolset (27th cycle) → file-evidence triage.

**State found:** NEWS-CMD is the active sprint and has advanced PAST what TASKS.md status fields say.
Verified in source: handleNews() telegramCommands.ts:510 + case "/news":634 + webhookHandler.ts chunking
loop :86 (`result.texts ?? [result.text]`). IMPL @25a92ca6 (Review). ops DEPLOY DONE today
@85ed911f+@477b57b7 (image built 2026-05-27T22:29:45 CEST, healthy, 146 tools; handoff = OPS COMPLETE).
TASKS.md DEPLOY/QA status fields say BLOCKED = STALE (blocker satisfied).

**BATCH(2) returned to dispatcher:**
1. **NEWS-CMD-QA** (qa, zone apps/mcp-server/) — the real next step; drive active sprint to done
   (feedback_ship_completion). Live-verify real rag_analyses content (NOT stub/N/A), plain-VN (no impact
   numbers/jargon), /news N cap, >4096 chunking, empty-DB "chưa có tin hôm nay" fallback. NOT-RUN forbidden.
2. **PEK-MULTIPAGE re-deploy+QA** (ops → qa, zone apps/pdf-extractor/, OFF the WIP=2 cap) — last
   G9-rejected page-coverage defect on PEK-INTEGRATE (DONE-PENDING-G9). Dev fix committed @2e228f0d
   (grouping rewrite) + @ed347661 (PEK-ROWCOUNT). Architect PEK-QA-ADJUDICATE revised Gate B = md_len>=1000
   (row_count>=10 was wrong metric). Remaining: ops --no-cache rebuild + DELETE stale layout units +
   re-extract all 12 → qa re-sweep revised 4-gate.

**pipeline-state RECONCILED (was 25h stale):** prior claimed BCTC-LAYOUT-FIRST LF-FIX in-flight (lock
expired ~23h ago, 0 progress). That sprint is SUPERSEDED by PEK-INTEGRATE (user directive) — LF-FIX
ABANDONED, not re-dispatched (the column-guesser it would patch is being REPLACED by PDF-Extract-Kit).
Rewrote currentSprint→NEWS-CMD + added bctc_reconciliation block.

## Carry-over
- NEWS-CMD-QA in-flight → NEWS-CMD-FIX (only if CHANGES_REQUESTED, dev-mcp-server) else NEWS-CMD-EXIT (po).
  Goal ARMED until USER confirms it reads usefully (DoD #7) — main terminal owns the verbal G9.
- PEK-INTEGRATE goal ARMED until USER verbal G9; PEK-MULTIPAGE closes the page-coverage defect.
- CHEF-ATTN (BA spec, READY, apps/mcp-server zone) HELD behind NEWS-CMD — same zone, avoid QA churn.
  Dispatch next tick once NEWS-CMD clears QA.
- TNB F9 (business context, 9 cycles) = cowork-lane (chef flow) + data-blocked (BCTC Q1 unfiled), NOT a
  dev sprint. F3 PMI / F4 VIRA = real backlog candidates, lower than NEWS-CMD in reliability→UX order.
- CW-DISPATCH-STEP47-BOOTSTRAP-ENUM (## ops) = dev-mcp-server backlog (add "cowork-team" to
  get_cycle_bootstrap enum); ZERO blocker (cowork falls back). Not dispatched this tick.
- Channel audit (MARKET/WORK/BUG via gateway) still owed → main terminal next cron tick (PO has no call_tool).
- All files left UNSTAGED except PO doc edits (pipeline-state.json, tnb ACK, dashboard READ, this notebook).
