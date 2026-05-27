# PO Notebook

## Cycle 2026-05-27T19:50:01Z — Sprint NEWS-CMD kickoff (explicit user feature request)

**Input:** USER feature request (verbatim, broken English, non-technical): "make /news on telegram
command for get all content if user need". Routed by main terminal with an interpretation to verify.

**Scoping VERIFIED against live codebase (not trusted blindly — I read the files):**
- Inbound command infra EXISTS: `telegramCommands.ts handleTelegramCommand` switch (sync cmds
  /watchlist /price /health query SQLite directly + reply; /ask = async ask_queue + spawnQaResponder).
  Webhook reply path `webhookHandler.ts` sends one CommandResult via `sendTelegramMarket({chatId})`.
- News SSOT = `rag_analyses` table (source_title/summary/sentiment/impact_*). `newsFetchLiveHandler.ts`
  (GET /api/news-fetch/live) ALREADY reads exactly this — reusable query shape. `assembleEveningSummary.ts`
  L449-460 = "top stories since midnight GMT+7 ORDER BY impact_score DESC" digest pattern to mirror.
- `/news` confirmed NOT implemented (grep-clean).

**PO product DECISIONS (autonomous, settled — BA/architect must not re-open):**
1. SYNC handler (like /watchlist), NOT async /ask queue — data is stored, no agent reasoning. REJECTED async.
2. Source = rag_analyses, NOT docs/daily/ blackboard (that's a post-redesign-Phase-3 future hook).
3. Pull-reply via existing webhook, NOT a new push. Confirmed NO collision with cowork-redesign
   cron-only MARKET-GROUP push rule (§C governs unsolicited GROUP pushes; command-reply is the /ask lane).
HARD: plain comprehensible VN only (feedback_market_report_plain_vietnamese — no impact#/jargon);
chunk over 4096 chars, no silent truncation; empty-DB friendly fallback; never throws.

**Docs written:** `docs/SPRINT_GOAL.md` (prepended § Sprint NEWS-CMD, full Scope/HARD/Success).
`docs/TASKS.md` (prepended § Sprint NEWS-CMD: 7 tasks BA→DESIGN→IMPL→DEPLOY→QA→FIX→EXIT, zone
apps/mcp-server, MEDIUM). NO code touched (scope-only). Files left UNSTAGED — main terminal commits.

**Channel audit NOT run:** MCP gateway call_tool wrapper unavailable in PO subagent toolset; for an
EXPLICIT user feature request the request IS the backlog (audit = self-init bug discovery, not a
precondition). Flagged in TASKS.md note for main terminal to run on next cron tick.

## Carry-over
- NEWS-CMD-BA is READY → BA writes `docs/REQ_NEWS-CMD.md` → returns to PO approval gate. Watch for
  scope-creep: BA must NOT add async-queue / new push / docs/daily read (all PO-settled OUT).
- CHEF-ATTN-BA still READY (separate apps/mcp-server sprint, different files — no collision with NEWS-CMD).
- PEK-INTEGRATE goal ARMED until USER verbal G9; PEK-MULTIPAGE READY (apps/pdf-extractor zone).
