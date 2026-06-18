# FIX-COWORK-BLIND-SESSION-GUARD — dispatch to agents-architect → agent-father

**Date:** 2026-06-18
**From:** PO
**Owner (design):** agents-architect (cowork-team flow design)
**Owner (implement):** agent-father (per Agent .md factory rule — never edit agent/flow .md directly)
**Memory ref:** `feedback_local_cowork_subagents_gateway_blind` · `feedback_no_fake_data_real_fetch`
**Class:** root-cause flow guard (prevents silent fabrication while gateway-blind)

---

## Problem

The `*/15` cowork master dispatcher (`docs/agents/cowork-team/flow/main.md` →
`spawn-fanout.md`) fans out by LOCALLY Agent-spawning data agents (news-scout,
market-watcher, financial-analyst, alert-commander, digest-predict, unified-agent, tnb).
In a **gateway-blind** session (`.mcp.json` `mcpServers == {}`; subagents do not inherit
`mcp__gateway__call_tool`) those spawns cannot fetch — they no-op or FABRICATE served data.
Confirmed live 2026-06-18: a blind news-scout spawn wrote fake 06-18 sentiment into 5 briefs
+ uniformly fake-stamped coverage-state for 62 tickers (PO reverted + quarantined).

Guaranteed/hourly slots already survive via the 12 cloud RemoteTrigger backstops. The gap is
the local fan-out: it must DETECT blind and refuse to spawn data agents, deferring to the
cloud backstops and LOGGING the skip — never fabricate.

## Required behavior (acceptance criteria)

1. **Blind detection (preflight, new Step ~0c in `main.md`, before slot matching):**
   - Probe: `jq '.mcpServers | length' .mcp.json`. Result `0` ⇒ `SESSION_BLIND=true`.
   - Belt-and-suspenders one-shot: optionally attempt a single cheap read-only gateway call
     (e.g. `list_server_tools("vn-market")` via `mcp__gateway__call_tool`); a "No such tool
     available" / not-connected error also sets `SESSION_BLIND=true`. The `jq` check is the
     cheap primary signal; keep it gateway-free so the guard itself never depends on the
     gateway it is testing.

2. **When `SESSION_BLIND=true`:**
   - **Do NOT spawn** any data-producing slot (news-scout, market-watcher,
     financial-analyst, alert-commander, digest-predict, unified-agent, tran-ngoc-bau,
     refine_bctc_md). These would fabricate.
   - For each matched slot that has a cloud RemoteTrigger backstop (guaranteed/hourly slots):
     log `[cowork-team] BLIND — deferred to cloud backstop: <slot_id>` and skip the local
     spawn. The backstop delivers the real post.
   - For each matched slot WITHOUT a backstop (`news-scout-market`, `market-watcher-market`,
     `alert-commander-market`): log
     `[cowork-team] BLIND — UNDELIVERABLE this tick (no cloud backstop): <slot_id>` to
     telemetry `errors[]` (Step 6) — explicitly undeliverable, NOT silently fabricated.
   - Emit ONE `send_telegram(channel="work", ...)` summary per tick (not per slot, to avoid
     spam): `[cowork-team] gateway-blind session — N slots deferred to backstop, M undeliverable; durable fix = register gateway in .mcp.json + reconnect (see docs/handoffs/GATEWAY-BLIND-USER-ACTION-2026-06-18.md)`.
   - Still run the non-fabricating housekeeping steps that don't need the gateway (signal_queue
     drain Step 0a, last_fired/telemetry bookkeeping) so dispatcher state stays coherent.

3. **When `SESSION_BLIND=false`:** behavior unchanged — normal fan-out.

4. **No fabrication path:** under blind, there must be NO code path where a data agent is
   spawned and asked to "emit a dish/brief." Verify by reading the spawn-fanout gate, not by
   trusting a steady-state green tick.

## Suggested placement

- New preflight sub-flow `docs/agents/cowork-team/flow/blind-guard.md` (keeps `main.md` thin),
  wired as Step 0c in the `main.md` JUMP-TO table, BEFORE `match-slots.md`.
- `spawn-fanout.md` Step 5: gate the per-slot spawn loop on `SESSION_BLIND` (skip + log per
  rules above) as a second enforcement point.
- Backstop-coverage source of truth: map which slots have a RemoteTrigger from
  `docs/data/cowork-schedule.json` `.slots[].backstop` (or the RemoteTrigger registry) —
  do NOT hardcode the slot list.

## Out of scope

- The durable connectivity fix is user/harness-side (register gateway + reconnect) — see
  `docs/handoffs/GATEWAY-BLIND-USER-ACTION-2026-06-18.md`. This guard only prevents
  fabrication while blind; it does not restore fetch capability.

## DoD

- Read-verified (not just green tick): in a blind session no data agent is spawned; the work
  channel gets the single summary; undeliverable slots land in telemetry `errors[]`.
- In a wired session the guard is a no-op (fan-out unchanged).
- `main.md` size-justification updated; Agent .md factory skill invoked before editing.
