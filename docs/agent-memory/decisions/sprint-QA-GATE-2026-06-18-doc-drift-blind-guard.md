<!-- decision-journal: qa cycle-298 2026-06-18 -->
# QA Gate — cycle-298 — 2026-06-18

## task-id: CLEAN-FOREIGN-FLOW-DOC-PARAM-CODE-DRIFT

what-considered: |
  Doc-only task; Smart-Skip applies — no bun test / tsc / DDD / security / mock-guard.
  Commit ace01f1a, 4 doc files. Code is SSOT; docs must match code.

  get_foreign_flow.md:
  - param `code` (string, required) — matches foreignFlowTools.ts:246 `code: z.string()`
  - param `days` (integer, optional, default 10, range 2–30) — matches code lines 249–255
  - response envelope `{ source_tier: 2, text: "..." }` — matches code lines 362–367
  - _testFallback note present — matches code lines 256–262
  - source_note described — matches code
  - Prior doc had `ticker` (wrong) and omitted `days`; drift is fixed. PASS.

  get_market_foreign_flow.md:
  - param `days` (integer, optional, default 1, range 1–30) — matches marketWideForeignFlowTool.ts:177–180
  - param `top_n` (integer, optional, default 5, range 1–20) — matches code lines 181–187
  - response envelope keys `source_tier, coverage_note, text, latest_date, sessions_returned` — matches code lines 256–262
  - Prior doc said "No parameters"; drift is fixed. PASS.

  diagnose_foreign_flow_circuit_breaker.md:
  - No parameters — matches code registration line 395 `{}`
  - Returns: state (closed/open/half-open), failure count (threshold 5), success count, last failure timestamp, auto-reset time remaining — all match code lines 440–477
  - Prior doc had `breaker_id` param (spurious); removed. PASS.

  reset_foreign_flow_circuit_breaker.md:
  - No parameters — matches code registration line 407 `{}`
  - Returns: "Reset complete. State: closed." or "Circuit is already closed (healthy). No action needed." — matches code lines 512–515
  - Prior doc had `breaker_id` param (spurious); removed. PASS.

why-change: All 4 docs now faithfully reflect live code handler signatures. No drift found. AC met.
verdict: APPROVED → done_verified
commit: ace01f1a

---

## task-id: FIX-COWORK-BLIND-SESSION-GUARD

what-considered: |
  Guard-flow task, doc-only (flow .md files). No bun test / tsc applicable.
  Commit 55fb9d5f, 4 files.
  Verified against AC BG-1 / BG-2 / BG-3.

  BG-1 — blind-guard.md:
  - File exists at docs/agents/cowork-team/flow/blind-guard.md
  - Line count: 49L (≤50L limit — PASS, 1 line to spare)
  - Primary check is exactly `jq '.mcpServers | length' .mcp.json`; no MCP required
  - RAW live run: `jq '.mcpServers | length' .mcp.json` → 0
  - Doc logic: BLIND_COUNT == "0" → SESSION_BLIND = true
  - This session is correctly identified as SESSION_BLIND=true. PASS.

  BG-2 — spawn-fanout.md Step 5.0:
  - Sits at TOP of file (lines 8–37), before any Agent() spawn (agent spawns begin line 107+)
  - When SESSION_BLIND==true: `EXIT Step 5` (line 34) — no Agent() call is reached. PASS.
  - BACKSTOP_SLOTS / NO_BACKSTOP_SLOTS derived from cowork-schedule.json .slots[].trigger_id + .trigger_status at runtime (line 13) — no hardcoded slot names. PASS.
  - errors[] gets one entry per NO_BACKSTOP_SLOTS slot (lines 22–23). PASS.
  - Exactly ONE send_telegram(channel="work") summary (lines 27–33) — not per-slot. PASS.
  - SESSION_BLIND==false → falls through to normal fan-out (line 36 comment + line 107+ code unchanged). PASS.

  BG-3 — main.md JUMP-TO:
  - Step 0c in JUMP-TO table (line 34 of table): "Blind detection — gateway preflight | blind-guard.md"
  - Inline reference at lines 62–64: "→ Run sub-flow: docs/agents/cowork-team/flow/blind-guard.md"
  - Size comment on line 1 updated: "BG-1 2026-06-18: Step 0c blind-guard.md added"
  - All three BG-3 sub-checks PASS.

  Signal file confirmed moved to docs/signals/processed/cowork-blind-session-guard-20260618T074013Z.json.

why-change: All 3 ACs verified. Guard correctly blocks fabricating spawns when gateway blind. No-op when wired. Signal consumed.
verdict: APPROVED → done_verified
commit: 55fb9d5f
